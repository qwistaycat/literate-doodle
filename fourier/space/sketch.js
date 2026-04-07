var fourierX = [];
var drawingChoice = "star";
var maxEpicycles = 1;
var loading = true;
var loadError = "";
var reconstructedPath = [];
var bridgeFlags = [];
var showEpicycles = true;
var epicycleTime = 0;
var viewZoom = 1;
var ringSnapshots = [];
var hoveredRingIndex = -1;
var selectedRingIndex = -1;
var globalAmpNudge = 0;
var termAmpOffsets = [];
var termPhaseOffsets = [];
var isDraggingAmplitude = false;
var lastDragY = 0;
var drawingDataCache = {};
var DRAWING_CACHE_PREFIX = "spaceDrawingCache_v1_";
var SPLIT_RATIO_STORAGE_KEY = "spacePaneSplitRatio_v1";
var paneTop = 56;
var panePadding = 10;
var leftPaneRatio = 0.58;
var isDraggingDivider = false;
var barChartItems = [];
var hoveredBarIndex = -1;
var isDraggingBarAmplitude = false;
var phaseWheelGeom = null;
var isDraggingPhaseWheel = false;

function processPoints(points) {
  if (!points || points.length === 0) {
    loadError = "Could not load any SVG points.";
    loading = false;
    redraw();
    return;
  }

  var data = buildDrawingDataFromPoints(points);
  applyDrawingData(data);
}

function buildDrawingDataFromPoints(points) {
  if (!points || points.length === 0) return null;

  var cx = 0;
  var cy = 0;
  points.forEach(function (p) {
    cx += p.x;
    cy += p.y;
  });
  cx /= points.length;
  cy /= points.length;

  var maxDist = 0;
  points.forEach(function (p) {
    var d = Math.sqrt((p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy));
    if (d > maxDist) maxDist = d;
  });
  var scale = maxDist > 0 ? 250 / maxDist : 1;

  var x = [];
  var localBridgeFlags = [];
  for (var i = 0; i < points.length; i++) {
    x.push(new Complex((points[i].x - cx) * scale, (points[i].y - cy) * scale));
    localBridgeFlags.push(!!points[i].bridge);
  }

  var localFourierX = dft(x);
  localFourierX.sort(function (a, b) { return b.amp - a.amp; });

  return {
    fourierX: localFourierX.map(function (term) {
      return {
        freq: term.freq,
        amp: term.amp,
        phase: term.phase
      };
    }),
    bridgeFlags: localBridgeFlags
  };
}

function applyDrawingData(data) {
  if (!data || !data.fourierX || data.fourierX.length === 0) {
    loadError = "Could not load any SVG points.";
    loading = false;
    redraw();
    return;
  }

  fourierX = data.fourierX.map(function (term) {
    return {
      freq: term.freq,
      amp: term.amp,
      phase: term.phase
    };
  });
  bridgeFlags = (data.bridgeFlags || []).slice();

  termAmpOffsets = new Array(fourierX.length).fill(0);
  termPhaseOffsets = new Array(fourierX.length).fill(0);
  globalAmpNudge = 0;
  hoveredRingIndex = -1;
  selectedRingIndex = -1;

  var slider = document.getElementById("epicycle-slider");
  var sliderValue = document.getElementById("epicycle-slider-value");
  if (slider) {
    slider.min = "0";
    slider.max = "1000";
    slider.step = "1";
    slider.value = String(countToSliderValue(fourierX.length, fourierX.length));
    if (sliderValue) sliderValue.max = String(fourierX.length);
    maxEpicycles = fourierX.length;
    if (sliderValue) sliderValue.value = String(maxEpicycles);
  }

  loadError = "";
  loading = false;
  rebuildStaticPath();
  redraw();
}

function getDrawingCacheKey(selection) {
  return DRAWING_CACHE_PREFIX + selection;
}

function loadDrawingDataFromStorage(selection) {
  try {
    var raw = localStorage.getItem(getDrawingCacheKey(selection));
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.fourierX) || parsed.fourierX.length === 0) return null;
    return {
      fourierX: parsed.fourierX,
      bridgeFlags: Array.isArray(parsed.bridgeFlags) ? parsed.bridgeFlags : []
    };
  } catch (e) {
    return null;
  }
}

function saveDrawingDataToStorage(selection, data) {
  try {
    localStorage.setItem(getDrawingCacheKey(selection), JSON.stringify({
      fourierX: data.fourierX,
      bridgeFlags: data.bridgeFlags
    }));
  } catch (e) {
  }
}

function rebuildStaticPath() {
  reconstructedPath = [];
  if (!fourierX || fourierX.length === 0) return;

  var activeCount = Math.max(1, Math.min(maxEpicycles, fourierX.length));
  var active = fourierX.slice(0, activeCount);
  var sampleCount = fourierX.length;

  for (var i = 0; i < sampleCount; i++) {
    var t = (i / sampleCount) * TWO_PI;
    var rx = 0;
    var ry = 0;

    for (var j = 0; j < active.length; j++) {
      var termMod = getPlayTerm(active[j], j, activeCount);
      rx += termMod.amp * cos(termMod.freq * t + termMod.phase);
      ry += termMod.amp * sin(termMod.freq * t + termMod.phase);
    }

    reconstructedPath.push({
      x: rx,
      y: ry,
      bridge: bridgeFlags.length > 0 ? !!bridgeFlags[i % bridgeFlags.length] : false
    });
  }
}

function getPlayTerm(term, index, activeCount) {
  var norm = activeCount > 1 ? index / (activeCount - 1) : 0;
  var highFreqWeight = Math.pow(norm, 0.8);
  var ampScale = 1 + globalAmpNudge * (0.2 + 0.8 * highFreqWeight);
  ampScale = clamp(ampScale, 0.25, 1.85);
  var termAmpScale = 1 + (termAmpOffsets[index] || 0);
  termAmpScale = clamp(termAmpScale, 0.2, 2.0);

  return {
    amp: term.amp * ampScale * termAmpScale,
    phase: term.phase + (termPhaseOffsets[index] || 0),
    freq: term.freq
  };
}

function normalizeAngle0ToTwoPi(angle) {
  var a = angle % TWO_PI;
  if (a < 0) a += TWO_PI;
  return a;
}

function normalizeToPi(angle) {
  var a = angle;
  while (a > PI) a -= TWO_PI;
  while (a < -PI) a += TWO_PI;
  return a;
}

function getPhaseWheelGeometry(panel) {
  return {
    cx: panel.x + panel.w - 58,
    cy: panel.y + 64,
    rOuter: 34,
    rInner: 21
  };
}

function isInPhaseWheel(sx, sy) {
  if (!phaseWheelGeom || selectedRingIndex < 0) return false;
  var dx = sx - phaseWheelGeom.cx;
  var dy = sy - phaseWheelGeom.cy;
  var d = Math.sqrt(dx * dx + dy * dy);
  return d <= phaseWheelGeom.rOuter + 4;
}

function applyPhaseFromMouse(sx, sy) {
  if (selectedRingIndex < 0 || selectedRingIndex >= fourierX.length || !phaseWheelGeom) return;
  var dx = sx - phaseWheelGeom.cx;
  var dy = sy - phaseWheelGeom.cy;
  var absolutePhase = normalizeAngle0ToTwoPi(Math.atan2(dy, dx));
  termPhaseOffsets[selectedRingIndex] = normalizeToPi(absolutePhase);
  rebuildStaticPath();
}

function drawPhaseWheel(panel) {
  if (selectedRingIndex < 0 || selectedRingIndex >= fourierX.length) {
    phaseWheelGeom = null;
    return;
  }

  phaseWheelGeom = getPhaseWheelGeometry(panel);

  push();
  noFill();
  strokeWeight(6);
  colorMode(HSB, 360, 100, 100, 255);
  for (var deg = 0; deg < 360; deg += 2) {
    stroke(deg, 90, 100, 230);
    arc(phaseWheelGeom.cx, phaseWheelGeom.cy, phaseWheelGeom.rOuter * 2, phaseWheelGeom.rOuter * 2, radians(deg), radians(deg + 2));
  }
  pop();

  fill(18, 22, 33, 245);
  noStroke();
  circle(phaseWheelGeom.cx, phaseWheelGeom.cy, phaseWheelGeom.rInner * 2);

  var shiftPhase = normalizeAngle0ToTwoPi(termPhaseOffsets[selectedRingIndex] || 0);
  var px = phaseWheelGeom.cx + Math.cos(shiftPhase) * (phaseWheelGeom.rOuter - 2);
  var py = phaseWheelGeom.cy + Math.sin(shiftPhase) * (phaseWheelGeom.rOuter - 2);

  stroke(255, 245, 220, 245);
  strokeWeight(1.8);
  line(phaseWheelGeom.cx, phaseWheelGeom.cy, px, py);
  noStroke();
  fill(255, 245, 220, 250);
  circle(px, py, 8);

  fill(212, 220, 245, 200);
  textSize(9);
  textAlign(CENTER, TOP);
  text("phase 0 → 2π", phaseWheelGeom.cx, phaseWheelGeom.cy + phaseWheelGeom.rOuter + 4);

  var tickSpecs = [
    { angle: 0, label: "0" },
    { angle: HALF_PI, label: "π/2" },
    { angle: PI, label: "π" },
    { angle: 3 * PI / 2, label: "3π/2" }
  ];

  stroke(238, 236, 228, 230);
  strokeWeight(1.3);
  fill(230, 230, 230, 220);
  textSize(8);
  textAlign(CENTER, CENTER);
  for (var t = 0; t < tickSpecs.length; t++) {
    var tick = tickSpecs[t];
    var ax = Math.cos(tick.angle);
    var ay = Math.sin(tick.angle);
    var tx1 = phaseWheelGeom.cx + ax * (phaseWheelGeom.rOuter + 1);
    var ty1 = phaseWheelGeom.cy + ay * (phaseWheelGeom.rOuter + 1);
    var tx2 = phaseWheelGeom.cx + ax * (phaseWheelGeom.rOuter + 7);
    var ty2 = phaseWheelGeom.cy + ay * (phaseWheelGeom.rOuter + 7);
    line(tx1, ty1, tx2, ty2);
    var lx = phaseWheelGeom.cx + ax * (phaseWheelGeom.rOuter + 16);
    var ly = phaseWheelGeom.cy + ay * (phaseWheelGeom.rOuter + 16);
    noStroke();
    fill(230, 230, 230, 220);
    text(tick.label, lx, ly);
    stroke(238, 236, 228, 230);
  }
}

function getPaneLayout() {
  var x = panePadding;
  var y = paneTop;
  var w = width - panePadding * 2;
  var h = height - paneTop - panePadding;
  var gap = 10;
  var minPaneW = 220;
  var unclampedLeftW = Math.floor(w * leftPaneRatio);
  var leftW = Math.max(minPaneW, Math.min(w - gap - minPaneW, unclampedLeftW));
  var rightW = w - leftW - gap;

  return {
    left: {
      x: x,
      y: y,
      w: leftW,
      h: h,
      cx: x + leftW / 2,
      cy: y + h / 2
    },
    right: {
      x: x + leftW + gap,
      y: y,
      w: rightW,
      h: h
    }
  };
}

function inLeftPane(sx, sy) {
  var layout = getPaneLayout();
  return sx >= layout.left.x && sx <= layout.left.x + layout.left.w && sy >= layout.left.y && sy <= layout.left.y + layout.left.h;
}

function findBarAt(sx, sy) {
  if (!barChartItems || barChartItems.length === 0) return -1;
  for (var i = 0; i < barChartItems.length; i++) {
    var bar = barChartItems[i];
    if (sx >= bar.x && sx <= bar.x + bar.w && sy >= bar.y && sy <= bar.y + bar.h) {
      return i;
    }
  }
  return -1;
}

function dividerXFromLayout(layout) {
  return layout.left.x + layout.left.w + 5;
}

function isNearDivider(sx, sy) {
  var layout = getPaneLayout();
  var dividerX = dividerXFromLayout(layout);
  return Math.abs(sx - dividerX) <= 10 && sy >= layout.left.y && sy <= layout.left.y + layout.left.h;
}

function updatePaneRatioFromMouse(mouseXPos) {
  var layout = getPaneLayout();
  var totalW = width - panePadding * 2;
  var leftW = mouseXPos - panePadding - 5;
  var ratio = leftW / totalW;
  leftPaneRatio = clamp(ratio, 0.35, 0.75);
  localStorage.setItem(SPLIT_RATIO_STORAGE_KEY, String(leftPaneRatio));
}

function clipRect(x, y, w, h) {
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.rect(x, y, w, h);
  drawingContext.clip();
}

function unclipRect() {
  drawingContext.restore();
}

function worldToScreen(wx, wy) {
  var layout = getPaneLayout();
  return {
    x: layout.left.cx + wx * viewZoom,
    y: layout.left.cy + wy * viewZoom
  };
}

function screenToWorld(sx, sy) {
  var layout = getPaneLayout();
  return {
    x: (sx - layout.left.cx) / viewZoom,
    y: (sy - layout.left.cy) / viewZoom
  };
}

function drawPaneFrames() {
  var layout = getPaneLayout();
  var dividerX = dividerXFromLayout(layout);

  noStroke();
  fill(8, 10, 15, 220);
  rect(layout.left.x, layout.left.y, layout.left.w, layout.left.h, 8);
  fill(12, 14, 22, 230);
  rect(layout.right.x, layout.right.y, layout.right.w, layout.right.h, 8);

  noFill();
  stroke(110, 120, 150, 120);
  strokeWeight(1);
  rect(layout.left.x, layout.left.y, layout.left.w, layout.left.h, 8);
  rect(layout.right.x, layout.right.y, layout.right.w, layout.right.h, 8);

  stroke(isDraggingDivider || isNearDivider(mouseX, mouseY) ? color(245, 225, 160, 220) : color(140, 145, 165, 170));
  strokeWeight(isDraggingDivider ? 4 : 2);
  line(dividerX, layout.left.y + 6, dividerX, layout.left.y + layout.left.h - 6);

  noStroke();
  fill(190, 200, 230, 170);
  textAlign(LEFT, TOP);
  textSize(12);
  text("Epicycles", layout.left.x + 10, layout.left.y + 8);
  text("Sine + Freq×Amp", layout.right.x + 10, layout.right.y + 8);
}

function drawSinePanel() {
  if (!fourierX || fourierX.length === 0) return;

  var layout = getPaneLayout();
  var panel = layout.right;
  var activeCount = Math.max(1, Math.min(maxEpicycles, fourierX.length));
  var terms = [];
  var maxAmp = 1;

  for (var i = 0; i < activeCount; i++) {
    var t = getPlayTerm(fourierX[i], i, activeCount);
    terms.push(t);
    if (Math.abs(t.amp) > maxAmp) maxAmp = Math.abs(t.amp);
  }

  var panelPad = 10;
  var headerY = panel.y + 28;
  var plotX = panel.x + panelPad;
  var plotW = panel.w - panelPad * 2;
  var sineH = Math.max(120, Math.floor(panel.h * 0.56));
  var plotY = headerY;
  var plotH = Math.min(sineH, panel.h - 86);
  var yMid = plotY + plotH / 2;
  var barGap = 12;
  var barX = plotX;
  var barY = plotY + plotH + barGap;
  var barW = plotW;
  var barH = panel.y + panel.h - barY - 10;
  var samples = 170;

  stroke(140, 150, 180, 70);
  strokeWeight(1);
  line(plotX, yMid, plotX + plotW, yMid);

  clipRect(plotX, plotY, plotW, plotH);
  for (var k = 0; k < terms.length; k++) {
    var term = terms[k];
    var phaseHue = normalizeAngle0ToTwoPi(termPhaseOffsets[k] || 0) * 180 / PI;
    var alpha = clamp(220 - activeCount * 1.8, 22, 160);
    if (k === selectedRingIndex) alpha = 230;
    colorMode(HSB, 360, 100, 100, 255);
    stroke(phaseHue, 82, 100, alpha);
    colorMode(RGB, 255, 255, 255, 255);
    strokeWeight(k === selectedRingIndex ? 1.9 : 1);
    noFill();
    beginShape();
    for (var s = 0; s <= samples; s++) {
      var u = s / samples;
      var x = plotX + u * plotW;
      var theta = u * TWO_PI;
      var ampPx = (Math.abs(term.amp) / maxAmp) * (plotH * 0.44);
      var y = yMid + ampPx * sin(term.freq * theta + term.phase + epicycleTime);
      vertex(x, y);
    }
    endShape();
  }
  unclipRect();

  var maxFreq = 1;
  for (var f = 0; f < terms.length; f++) {
    maxFreq = Math.max(maxFreq, Math.abs(terms[f].freq));
  }
  var baseY = barY + barH - 18;
  var barTopLimit = barY + 10;
  var barBottomLimit = barY + barH - 10;
  var barSlot = terms.length > 0 ? barW / terms.length : barW;
  barChartItems = [];

  fill(18, 24, 35, 170);
  noStroke();
  rect(barX, barY, barW, barH, 6);
  stroke(128, 138, 170, 80);
  strokeWeight(1);
  line(barX + 2, barTopLimit, barX + 2, baseY);
  line(barX, baseY, barX + barW, baseY);

  for (var b = 0; b < terms.length; b++) {
    var bt = terms[b];
    var absAmp = Math.abs(bt.amp);
    var normH = (absAmp / maxAmp) * (baseY - barTopLimit);
    var barHeight = Math.max(2, normH);
    var bx = barX + b * barSlot + Math.max(1, barSlot * 0.08);
    var bw = Math.max(3, barSlot * 0.84);
    var by = baseY - barHeight;
    var barAlpha = b === selectedRingIndex ? 245 : 185;
    var barHue = normalizeAngle0ToTwoPi(termPhaseOffsets[b] || 0) * 180 / PI;
    colorMode(HSB, 360, 100, 100, 255);
    fill(barHue, 76, b === selectedRingIndex ? 98 : 88, barAlpha);
    colorMode(RGB, 255, 255, 255, 255);
    noStroke();
    rect(bx, by, bw, barHeight, 3);

    barChartItems.push({
      x: bx,
      y: by,
      w: bw,
      h: Math.max(4, baseY - by),
      termIndex: b,
      freq: bt.freq,
      amp: bt.amp
    });
  }

  hoveredBarIndex = findBarAt(mouseX, mouseY);
  if (hoveredBarIndex >= 0 && hoveredBarIndex < barChartItems.length) {
    var hb = barChartItems[hoveredBarIndex];
    noFill();
    stroke(255, 235, 170, 230);
    strokeWeight(2);
    rect(hb.x - 1, hb.y - 1, hb.w + 2, hb.h + 2, 3);
  }

  fill(205, 215, 240, 150);
  noStroke();
  textSize(10);
  text("frequency × amplitude", barX + 2, barY + 2);
  textAlign(LEFT, TOP);
  text("Amplitude", barX + 6, barTopLimit + 2);
  textAlign(CENTER, TOP);
  text("Frequency", barX + barW * 0.5, baseY + 6);
  textAlign(LEFT, TOP);

  fill(205, 215, 240, 190);
  noStroke();
  textSize(11);
  if (selectedRingIndex >= 0 && selectedRingIndex < terms.length) {
    var st = terms[selectedRingIndex];
    text("selected: amp " + nf(st.amp, 1, 2) + " • freq " + nf(st.freq, 1, 2), plotX + 2, plotY + 4);
  } else {
    text("showing " + activeCount + " waves", plotX + 2, plotY + 4);
  }

  drawPhaseWheel(panel);
}

function updateHoveredRing() {
  hoveredRingIndex = -1;
  if (!ringSnapshots || ringSnapshots.length === 0) return;

  var worldMouse = screenToWorld(mouseX, mouseY);
  var bestScore = Infinity;

  for (var i = 0; i < ringSnapshots.length; i++) {
    var ring = ringSnapshots[i];
    var dx = worldMouse.x - ring.cx;
    var dy = worldMouse.y - ring.cy;
    var distWorld = Math.sqrt(dx * dx + dy * dy);
    var distScreen = distWorld * viewZoom;
    var ringScreenRadius = ring.r * viewZoom;
    var edgeDistance = Math.abs(distScreen - ringScreenRadius);
    var threshold = Math.max(10, ringScreenRadius * 0.35 + 6);

    if (ringScreenRadius < 8 && distScreen < 10) {
      edgeDistance = Math.min(edgeDistance, distScreen);
    }

    if (edgeDistance <= threshold && edgeDistance < bestScore) {
      bestScore = edgeDistance;
      hoveredRingIndex = ring.index;
    }
  }
}

function updateSelectedRingInfo() {
  var info = document.getElementById("selected-ring-info");
  if (!info) return;

  if (!fourierX || fourierX.length === 0) {
    info.textContent = "Selected: none";
    return;
  }

  if (selectedRingIndex >= 0 && selectedRingIndex < fourierX.length) {
    var term = fourierX[selectedRingIndex];
    info.textContent = "Selected ring " + (selectedRingIndex + 1) + " • freq " + nf(term.freq, 1, 2);
    return;
  }

  if (hoveredRingIndex >= 0 && hoveredRingIndex < fourierX.length) {
    var hoverTerm = fourierX[hoveredRingIndex];
    info.textContent = "Hover ring " + (hoveredRingIndex + 1) + " • freq " + nf(hoverTerm.freq, 1, 2);
    return;
  }

  info.textContent = "Selected: none";
}

function clamp(v, minV, maxV) {
  return Math.max(minV, Math.min(maxV, v));
}

function sliderValueToCount(sliderRaw, maxAllowed) {
  if (maxAllowed <= 1) return 1;
  var t = clamp((parseFloat(sliderRaw) || 0) / 1000, 0, 1);
  var count = Math.round(Math.exp(Math.log(maxAllowed) * t));
  return Math.max(1, Math.min(maxAllowed, count));
}

function countToSliderValue(count, maxAllowed) {
  if (maxAllowed <= 1) return 1000;
  var clampedCount = Math.max(1, Math.min(maxAllowed, count));
  var t = Math.log(clampedCount) / Math.log(maxAllowed);
  return Math.round(clamp(t, 0, 1) * 1000);
}

function resetPlayInteraction() {
  globalAmpNudge = 0;
  for (var i = 0; i < termAmpOffsets.length; i++) termAmpOffsets[i] = 0;
  for (var j = 0; j < termPhaseOffsets.length; j++) termPhaseOffsets[j] = 0;
  hoveredRingIndex = -1;
  selectedRingIndex = -1;
  phaseWheelGeom = null;
  isDraggingPhaseWheel = false;
  rebuildStaticPath();
}

function setup() {
  createCanvas(800, 600);

  function applyEpicycleCountFromInput(rawValue) {
    var slider = document.getElementById("epicycle-slider");
    var sliderValue = document.getElementById("epicycle-slider-value");
    var maxAllowed = fourierX && fourierX.length > 0 ? fourierX.length : parseInt((sliderValue && sliderValue.max) || "1", 10) || 1;
    var parsed = parseInt(rawValue, 10);
    if (!isFinite(parsed)) parsed = maxEpicycles || 1;
    var clamped = Math.max(1, Math.min(maxAllowed, parsed));

    maxEpicycles = clamped;
    if (slider) slider.value = String(countToSliderValue(clamped, maxAllowed));
    if (sliderValue) sliderValue.value = String(clamped);
    rebuildStaticPath();
    redraw();
  }

  function applyEpicycleCountFromSlider(rawSliderValue) {
    var slider = document.getElementById("epicycle-slider");
    var sliderValue = document.getElementById("epicycle-slider-value");
    var maxAllowed = fourierX && fourierX.length > 0 ? fourierX.length : parseInt((sliderValue && sliderValue.max) || "1", 10) || 1;
    var count = sliderValueToCount(rawSliderValue, maxAllowed);

    maxEpicycles = count;
    if (slider) slider.value = String(countToSliderValue(count, maxAllowed));
    if (sliderValue) sliderValue.value = String(count);
    rebuildStaticPath();
    redraw();
  }

  var select = document.getElementById("drawing-select");
  if (select) {
    drawingChoice = select.value;
    select.addEventListener("change", function (e) {
      drawingChoice = e.target.value;
      loadSelectedDrawing();
    });
  }

  var slider = document.getElementById("epicycle-slider");
  var sliderValue = document.getElementById("epicycle-slider-value");
  if (slider) {
    slider.addEventListener("input", function (e) {
      applyEpicycleCountFromSlider(e.target.value);
    });
  }

  if (sliderValue) {
    sliderValue.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        applyEpicycleCountFromInput(sliderValue.value);
        sliderValue.blur();
      }
    });
    sliderValue.addEventListener("blur", function () {
      applyEpicycleCountFromInput(sliderValue.value);
    });
  }

  var storedSplit = parseFloat(localStorage.getItem(SPLIT_RATIO_STORAGE_KEY));
  if (isFinite(storedSplit)) {
    leftPaneRatio = clamp(storedSplit, 0.35, 0.75);
  }

  var epicycleToggle = document.getElementById("toggle-epicycles");
  if (epicycleToggle) {
    epicycleToggle.textContent = showEpicycles ? "Hide epicycles" : "Show epicycles";
    epicycleToggle.addEventListener("click", function () {
      showEpicycles = !showEpicycles;
      epicycleToggle.textContent = showEpicycles ? "Hide epicycles" : "Show epicycles";
    });
  }

  var resetPlayButton = document.getElementById("reset-play");
  if (resetPlayButton) {
    resetPlayButton.addEventListener("click", function () {
      resetPlayInteraction();
    });
  }

  loadSelectedDrawing();
}

function loadSelectedDrawing() {
  loading = true;
  loadError = "";
  epicycleTime = 0;
  resetPlayInteraction();

  var cachedData = drawingDataCache[drawingChoice] || loadDrawingDataFromStorage(drawingChoice);
  if (cachedData && cachedData.fourierX && cachedData.fourierX.length > 0) {
    drawingDataCache[drawingChoice] = cachedData;
    applyDrawingData(cachedData);
    return;
  }

  if (drawingChoice === "outputfile") {
    loadSVGToDrawing(function (points) {
      processPoints(points);
    });
    return;
  }

  loadNamedDrawing(drawingChoice, function (points) {
    if (!points || points.length === 0) {
      processPoints([]);
      return;
    }
    var built = buildDrawingDataFromPoints(points);
    if (!built) {
      processPoints([]);
      return;
    }
    drawingDataCache[drawingChoice] = built;
    saveDrawingDataToStorage(drawingChoice, built);
    applyDrawingData(built);
  });
}

function buildEpicycleSegments(activeCount) {
  var segments = [];
  var ex = 0;
  var ey = 0;

  for (var i = 0; i < activeCount; i++) {
    var prevx = ex;
    var prevy = ey;
    var term = getPlayTerm(fourierX[i], i, activeCount);
    ex += term.amp * cos(term.freq * epicycleTime + term.phase);
    ey += term.amp * sin(term.freq * epicycleTime + term.phase);

    segments.push({
      index: i,
      fromX: prevx,
      fromY: prevy,
      toX: ex,
      toY: ey,
      amp: Math.abs(term.amp)
    });
  }

  return segments;
}

function drawEpicycleOverlay() {
  if (!fourierX || fourierX.length === 0) return;

  var activeCount = Math.max(1, Math.min(maxEpicycles, fourierX.length));
  var segments = buildEpicycleSegments(activeCount);
  ringSnapshots = segments.map(function (s) {
    return { index: s.index, cx: s.fromX, cy: s.fromY, r: s.amp };
  });

  if (showEpicycles) {
    updateHoveredRing();
  } else {
    hoveredRingIndex = -1;
  }

  if (showEpicycles) {
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      var circlePos = worldToScreen(seg.fromX, seg.fromY);
      var endpoint = worldToScreen(seg.toX, seg.toY);
      var displayRadius = seg.amp < 1.25 ? 1.25 : seg.amp;
      var displayRadiusScreen = displayRadius * viewZoom;
      var isHover = seg.index === hoveredRingIndex;
      var isSelected = seg.index === selectedRingIndex;
      var circleAlpha = seg.amp < 2 ? 210 : (seg.amp < 6 ? 150 : 90);
      var circleWeight = seg.amp < 2 ? 1.6 : (seg.amp < 6 ? 1.2 : 1.0);

      if (isHover) {
        stroke(120, 220, 255, 230);
        strokeWeight(2.2);
      } else if (isSelected) {
        stroke(255, 190, 90, 230);
        strokeWeight(2.2);
      } else {
        stroke(255, circleAlpha);
        strokeWeight(circleWeight);
      }
      noFill();
      ellipse(circlePos.x, circlePos.y, displayRadiusScreen * 2);

      stroke(isHover ? color(120, 220, 255, 210) : (isSelected ? color(255, 190, 90, 210) : color(255, 170)));
      strokeWeight(1);
      line(circlePos.x, circlePos.y, endpoint.x, endpoint.y);
    }

    var tip = worldToScreen(segments[segments.length - 1].toX, segments[segments.length - 1].toY);
    fill(255, 230);
    noStroke();
    circle(tip.x, tip.y, 4);
  }
}

function draw() {
  background(0);

  if (isDraggingDivider || isNearDivider(mouseX, mouseY)) {
    cursor("ew-resize");
  } else if (isDraggingPhaseWheel || isInPhaseWheel(mouseX, mouseY)) {
    cursor(HAND);
  } else if (isDraggingBarAmplitude || hoveredBarIndex >= 0) {
    cursor("ns-resize");
  } else {
    cursor(ARROW);
  }

  if (loading) {
    fill(255);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(18);
    text("Loading SVGs...", width / 2, height / 2);
    return;
  }

  if (loadError || reconstructedPath.length < 2) {
    fill(255, 120, 120);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(16);
    text(loadError || "No reconstruction available.", width / 2, height / 2);
    updateSelectedRingInfo();
    return;
  }

  drawPaneFrames();

  var layout = getPaneLayout();
  clipRect(layout.left.x, layout.left.y, layout.left.w, layout.left.h);

  noFill();
  for (var i = 0; i < reconstructedPath.length; i++) {
    var a = reconstructedPath[i];
    var b = reconstructedPath[(i + 1) % reconstructedPath.length];
    var sa = worldToScreen(a.x, a.y);
    var sb = worldToScreen(b.x, b.y);
    var isBridge = a.bridge || b.bridge;
    if (isBridge) {
      stroke(170, 200, 255, 32);
      strokeWeight(1);
    } else {
      stroke(220, 130, 190, 220);
      strokeWeight(2);
    }
    line(sa.x, sa.y, sb.x, sb.y);
  }

  drawEpicycleOverlay();
  unclipRect();
  drawSinePanel();

  var used = Math.max(1, Math.min(maxEpicycles, fourierX.length));
  noStroke();
  fill(0, 170);
  rectMode(CORNER);
  rect(layout.left.x + layout.left.w - 220, layout.left.y + 8, 210, 24, 6);
  fill(255);
  textAlign(RIGHT, CENTER);
  textSize(12);
  text("Epicycles: " + used + " / " + fourierX.length, layout.left.x + layout.left.w - 16, layout.left.y + 20);

  fill(225, 200, 255, 200);
  textAlign(LEFT, CENTER);
  textSize(11);
  var ampText = selectedRingIndex >= 0
    ? "Drag up/down to change selected ring amplitude"
    : "Drag up/down to change global amplitudes";
  text(ampText, layout.left.x + 10, layout.left.y + layout.left.h - 14);
  updateSelectedRingInfo();

  var dt = TWO_PI / Math.max(1, fourierX.length);
  epicycleTime += dt;
  if (epicycleTime > TWO_PI) {
    epicycleTime = 0;
  }
}

function mousePressed() {
  if (isNearDivider(mouseX, mouseY)) {
    isDraggingDivider = true;
    return;
  }

  if (isInPhaseWheel(mouseX, mouseY)) {
    isDraggingPhaseWheel = true;
    applyPhaseFromMouse(mouseX, mouseY);
    return;
  }

  if (hoveredBarIndex >= 0 && hoveredBarIndex < barChartItems.length) {
    selectedRingIndex = barChartItems[hoveredBarIndex].termIndex;
    isDraggingBarAmplitude = true;
    lastDragY = mouseY;
    updateSelectedRingInfo();
    return;
  }

  if (!inLeftPane(mouseX, mouseY)) return;
  updateHoveredRing();
  if (hoveredRingIndex >= 0) {
    selectedRingIndex = hoveredRingIndex;
  } else if (!keyIsDown(SHIFT)) {
    selectedRingIndex = -1;
  }
  isDraggingAmplitude = true;
  lastDragY = mouseY;
  updateSelectedRingInfo();
}

function mouseDragged() {
  if (isDraggingDivider) {
    updatePaneRatioFromMouse(mouseX);
    return;
  }

  if (isDraggingPhaseWheel) {
    applyPhaseFromMouse(mouseX, mouseY);
    return;
  }

  if (isDraggingBarAmplitude) {
    var barDy = mouseY - lastDragY;
    lastDragY = mouseY;
    if (selectedRingIndex >= 0 && selectedRingIndex < termAmpOffsets.length) {
      termAmpOffsets[selectedRingIndex] = clamp((termAmpOffsets[selectedRingIndex] || 0) - barDy * 0.004, -0.8, 1.0);
      rebuildStaticPath();
    }
    return;
  }

  if (!isDraggingAmplitude) return;

  var dy = mouseY - lastDragY;
  lastDragY = mouseY;

  if (selectedRingIndex >= 0 && selectedRingIndex < termAmpOffsets.length) {
    termAmpOffsets[selectedRingIndex] = clamp((termAmpOffsets[selectedRingIndex] || 0) - dy * 0.004, -0.8, 1.0);
  } else {
    globalAmpNudge = clamp(globalAmpNudge - dy * 0.003, -0.55, 0.75);
  }

  rebuildStaticPath();
}

function mouseReleased() {
  isDraggingDivider = false;
  isDraggingAmplitude = false;
  isDraggingBarAmplitude = false;
  isDraggingPhaseWheel = false;
  updateSelectedRingInfo();
}

function mouseWheel(event) {
  if (!inLeftPane(mouseX, mouseY)) return false;
  var delta = event.delta > 0 ? -0.08 : 0.08;
  viewZoom = clamp(viewZoom + delta, 0.5, 4);
  return false;
}
