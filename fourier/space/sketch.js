var fourierX = [];
var drawingChoice = "yu";
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
var selectedRingIndices = [];
var globalAmpNudge = 0;
var termAmpOffsets = [];
var termPhaseOffsets = [];
var isDraggingAmplitude = false;
var lastDragY = 0;
var drawingDataCache = {};
var DRAWING_CACHE_PREFIX = "spaceDrawingCache_v1_";
var SPLIT_RATIO_STORAGE_KEY = "spacePaneSplitRatio_v2";
var paneTop = 56;
var panePadding = 0;
var leftPaneRatio = 0.44;
var isDraggingDivider = false;
var barChartItems = [];
var hoveredBarIndex = -1;
var isDraggingBarAmplitude = false;
var phaseWheelGeom = null;
var isDraggingPhaseWheel = false;
var showWaveBreakdown = false;
var viewMode = "2d";
var view3dYaw = -0.7;
var view3dPitch = 0.45;
var isDragging3DRotate = false;
var last3DMouseX = 0;
var last3DMouseY = 0;
var parameterSlices = [];
var lastParameterSignature = "";
var lastSliceCaptureMillis = 0;
var maxParameterSlices = 400;
var timelineScrollOffset = 0;
var timelineVisibleCount = 24;
var isBrushingBarSelection = false;
var barSelectionAnchorIndex = -1;
var barSelectionCurrentIndex = -1;
var pendingBarGesture = false;
var pendingBarTermIndex = -1;
var pendingBarStartX = 0;
var pendingBarStartY = 0;
var pendingBarGestureMode = "";
var sinePlotBounds = null;
var isScrubbingSine = false;

function isRingSelected(index) {
  return selectedRingIndices.indexOf(index) >= 0;
}

function setSingleRingSelection(index) {
  if (index < 0) {
    selectedRingIndex = -1;
    selectedRingIndices = [];
    return;
  }
  selectedRingIndex = index;
  selectedRingIndices = [index];
}

function toggleRingSelection(index) {
  if (index < 0) return;
  var at = selectedRingIndices.indexOf(index);
  if (at >= 0) {
    selectedRingIndices.splice(at, 1);
  } else {
    selectedRingIndices.push(index);
  }

  if (selectedRingIndices.length === 0) {
    selectedRingIndex = -1;
    return;
  }

  if (selectedRingIndices.indexOf(selectedRingIndex) < 0) {
    selectedRingIndex = selectedRingIndices[0];
  }
}

function getSelectedTargets() {
  var targets = [];
  for (var i = 0; i < selectedRingIndices.length; i++) {
    var idx = selectedRingIndices[i];
    if (idx >= 0 && idx < termAmpOffsets.length) targets.push(idx);
  }
  return targets;
}

function isMultiSelectEvent(mouseEvent) {
  if (!mouseEvent) return false;
  return !!(mouseEvent.shiftKey || mouseEvent.metaKey || mouseEvent.ctrlKey);
}

function isInSinePlot(sx, sy) {
  if (!sinePlotBounds) return false;
  return sx >= sinePlotBounds.x && sx <= sinePlotBounds.x + sinePlotBounds.w && sy >= sinePlotBounds.y && sy <= sinePlotBounds.y + sinePlotBounds.h;
}

function setEpicycleTimeFromSineX(sx) {
  if (!sinePlotBounds || sinePlotBounds.w <= 1) return;
  var u = clamp((sx - sinePlotBounds.x) / sinePlotBounds.w, 0, 1);
  if (reconstructedPath && reconstructedPath.length > 1) {
    var sampleCount = reconstructedPath.length;
    var sampleIndex = Math.round(u * (sampleCount - 1));
    epicycleTime = (sampleIndex / sampleCount) * TWO_PI;
  } else {
    epicycleTime = u * TWO_PI;
  }
  epicycleTime = normalizeAngle0ToTwoPi(epicycleTime);
}

function clearBarSelection() {
  selectedRingIndex = -1;
  selectedRingIndices = [];
  isBrushingBarSelection = false;
  barSelectionAnchorIndex = -1;
  barSelectionCurrentIndex = -1;
  pendingBarGesture = false;
  pendingBarTermIndex = -1;
  pendingBarGestureMode = "";
}

function selectBarRange(startIndex, endIndex) {
  if (startIndex < 0 || endIndex < 0) return;
  var a = Math.min(startIndex, endIndex);
  var b = Math.max(startIndex, endIndex);
  var selected = [];
  for (var i = a; i <= b; i++) selected.push(i);
  selectedRingIndices = selected;
  selectedRingIndex = selected.length > 0 ? selected[0] : -1;
}

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
  selectedRingIndices = [];

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
  parameterSlices = [];
  lastParameterSignature = "";
  lastSliceCaptureMillis = 0;
  timelineScrollOffset = 0;
  rebuildStaticPath();
  captureParameterSlice(true);
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

function getParameterSignature() {
  var activeCount = Math.max(1, Math.min(maxEpicycles || 1, fourierX ? fourierX.length : 0));
  var ampHash = 0;
  var phaseHash = 0;
  var m = 2147483647;

  for (var i = 0; i < activeCount; i++) {
    var ampQ = Math.round((termAmpOffsets[i] || 0) * 200);
    var phaseQ = Math.round((termPhaseOffsets[i] || 0) * 140);
    ampHash = (ampHash * 131 + ampQ + i * 17 + 97) % m;
    phaseHash = (phaseHash * 137 + phaseQ + i * 13 + 193) % m;
  }

  return [
    drawingChoice,
    activeCount,
    Math.round(globalAmpNudge * 200),
    ampHash,
    phaseHash
  ].join("|");
}

function captureParameterSlice(force) {
  if (!reconstructedPath || reconstructedPath.length < 2) return;

  var now = millis();
  var signature = getParameterSignature();
  if (!force && signature === lastParameterSignature) return;
  if (!force && now - lastSliceCaptureMillis < 90) return;

  var stride = Math.max(1, Math.floor(reconstructedPath.length / 460));
  var points = [];
  for (var i = 0; i < reconstructedPath.length; i += stride) {
    var p = reconstructedPath[i];
    points.push({ x: p.x, y: p.y, bridge: !!p.bridge });
  }
  var lastPoint = reconstructedPath[reconstructedPath.length - 1];
  if (points.length === 0 || points[points.length - 1] !== lastPoint) {
    points.push({ x: lastPoint.x, y: lastPoint.y, bridge: !!lastPoint.bridge });
  }

  parameterSlices.push({
    points: points,
    signature: signature,
    activeCount: Math.max(1, Math.min(maxEpicycles, fourierX.length)),
    stamp: now
  });

  if (parameterSlices.length > maxParameterSlices) {
    parameterSlices.splice(0, parameterSlices.length - maxParameterSlices);
  }

  var maxOffset = Math.max(0, parameterSlices.length - timelineVisibleCount);
  timelineScrollOffset = clamp(timelineScrollOffset, 0, maxOffset);

  lastParameterSignature = signature;
  lastSliceCaptureMillis = now;
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
  var phaseTargets = getSelectedTargets();
  if (phaseTargets.length > 1) {
    for (var p = 0; p < phaseTargets.length; p++) {
      termPhaseOffsets[phaseTargets[p]] = normalizeToPi(absolutePhase);
    }
  } else {
    termPhaseOffsets[selectedRingIndex] = normalizeToPi(absolutePhase);
  }
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
  var x = 0;
  var y = paneTop;
  var w = width;
  var h = height - paneTop;
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
  var totalW = width;
  var leftW = mouseXPos - 5;
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
  text(viewMode === "3d" ? "Epicycles • 3D slices" : "Epicycles", layout.left.x + 10, layout.left.y + 8);
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
  sinePlotBounds = { x: plotX, y: plotY, w: plotW, h: plotH };
  var barGap = 12;
  var barX = plotX;
  var barY = plotY + plotH + barGap;
  var barW = plotW;
  var barH = panel.y + panel.h - barY - 10;
  var samples = Math.max(220, Math.min(520, Math.floor(plotW * 0.55)));
  var phaseTickFractions = [0, 0.25, 0.5, 0.75, 1];
  var phaseTickLabels = ["0", "π/2", "π", "3π/2", "2π"];
  var timeTheta = normalizeAngle0ToTwoPi(epicycleTime);
  var timeX = plotX + (timeTheta / TWO_PI) * plotW;
  var sweepStroke = color(182, 212, 190, 180);
  var sweepFill = color(182, 212, 190, 235);
  var markerY = yMid;

  stroke(115, 128, 162, 45);
  strokeWeight(1);
  for (var tick = 0; tick < phaseTickFractions.length; tick++) {
    var tickX = plotX + phaseTickFractions[tick] * plotW;
    line(tickX, plotY, tickX, plotY + plotH);
  }

  stroke(140, 150, 180, 70);
  strokeWeight(1);
  line(plotX, yMid, plotX + plotW, yMid);

  stroke(sweepStroke);
  strokeWeight(1.5);
  line(timeX, plotY, timeX, plotY + plotH);

  fill(205, 215, 240, 180);
  textSize(10);
  textAlign(CENTER, TOP);
  for (var tickLabelIndex = 0; tickLabelIndex < phaseTickFractions.length; tickLabelIndex++) {
    var tickLabelX = plotX + phaseTickFractions[tickLabelIndex] * plotW;
    text(phaseTickLabels[tickLabelIndex], tickLabelX, plotY + plotH + 1);
  }
  textAlign(LEFT, TOP);

  clipRect(plotX, plotY, plotW, plotH);
  if (showWaveBreakdown) {
    for (var k = 0; k < terms.length; k++) {
      var term = terms[k];
      var phaseHue = normalizeAngle0ToTwoPi(termPhaseOffsets[k] || 0) * 180 / PI;
      var alpha = clamp(220 - activeCount * 1.8, 22, 160);
      if (isRingSelected(k)) alpha = 230;
      colorMode(HSB, 360, 100, 100, 255);
      stroke(phaseHue, 82, 100, alpha);
      colorMode(RGB, 255, 255, 255, 255);
      strokeWeight(isRingSelected(k) ? 1.9 : 1);
      noFill();
      beginShape();
      for (var s = 0; s <= samples; s++) {
        var u = s / samples;
        var x = plotX + u * plotW;
        var theta = u * TWO_PI;
        var ampPx = (Math.abs(term.amp) / maxAmp) * (plotH * 0.44);
        var y = yMid + ampPx * sin(term.freq * theta + term.phase);
        vertex(x, y);
      }
      endShape();
    }

    var markerTermIdx = selectedRingIndex >= 0 && selectedRingIndex < terms.length ? selectedRingIndex : 0;
    var markerTermForBreakdown = terms[markerTermIdx];
    if (markerTermForBreakdown) {
      var markerAmpPx = (Math.abs(markerTermForBreakdown.amp) / maxAmp) * (plotH * 0.44);
      markerY = yMid + markerAmpPx * sin(markerTermForBreakdown.freq * timeTheta + markerTermForBreakdown.phase);
    }
  } else {
    var summedRaw = [];
    for (var s2 = 0; s2 <= samples; s2++) {
      var u2 = s2 / samples;
      var theta2 = u2 * TWO_PI;
      var combinedY = 0;
      for (var tIndex = 0; tIndex < terms.length; tIndex++) {
        var term2 = terms[tIndex];
        combinedY += term2.amp * sin(term2.freq * theta2 + term2.phase);
      }
      summedRaw.push(combinedY);
    }

    var smoothRadius = activeCount > 120 ? 6 : (activeCount > 60 ? 5 : 4);
    var summedSmooth = [];
    for (var smoothIndex = 0; smoothIndex <= samples; smoothIndex++) {
      var acc = 0;
      var n = 0;
      for (var offset = -smoothRadius; offset <= smoothRadius; offset++) {
        var sampleAt = smoothIndex + offset;
        if (sampleAt < 0 || sampleAt > samples) continue;
        acc += summedRaw[sampleAt];
        n++;
      }
      summedSmooth.push(n > 0 ? acc / n : 0);
    }

    var absVals = [];
    for (var absIdx = 0; absIdx <= samples; absIdx++) {
      absVals.push(Math.abs(summedSmooth[absIdx]));
    }
    absVals.sort(function (a, b) { return a - b; });
    var percentileIndex = Math.floor((absVals.length - 1) * 0.92);
    var displayScale = Math.max(1e-6, absVals[percentileIndex] || 1);
    var displayAmpPx = plotH * 0.44;

    var displayX = [];
    var displayY = [];
    var displayPenUp = [];
    for (var s3 = 0; s3 <= samples; s3++) {
      var u3 = s3 / samples;
      var x3 = plotX + u3 * plotW;
      var normalizedY = clamp(summedSmooth[s3] / displayScale, -1.2, 1.2);
      var y3 = yMid + normalizedY * displayAmpPx;
      displayX.push(x3);
      displayY.push(y3);
      if (bridgeFlags && bridgeFlags.length > 0) {
        var bridgeIndex = Math.floor(u3 * bridgeFlags.length) % bridgeFlags.length;
        displayPenUp.push(!!bridgeFlags[bridgeIndex]);
      } else {
        displayPenUp.push(false);
      }
    }

    noFill();
    var segStart = 0;
    var lastIdx = displayX.length - 1;
    while (segStart <= lastIdx) {
      var segPenUp = displayPenUp[segStart];
      var segEnd = segStart;
      while (segEnd + 1 <= lastIdx && displayPenUp[segEnd + 1] === segPenUp) {
        segEnd++;
      }

      var drawFrom = Math.max(0, segStart - 1);
      var drawTo = Math.min(lastIdx, segEnd + 1);
      stroke(170, 205, 182, segPenUp ? 88 : 242);
      strokeWeight(segPenUp ? 1.6 : 2.4);
      beginShape();
      curveVertex(displayX[drawFrom], displayY[drawFrom]);
      for (var cv = drawFrom; cv <= drawTo; cv++) {
        curveVertex(displayX[cv], displayY[cv]);
      }
      curveVertex(displayX[drawTo], displayY[drawTo]);
      endShape();

      segStart = segEnd + 1;
    }

    var markerSamplePos = (timeTheta / TWO_PI) * samples;
    var markerLo = Math.floor(markerSamplePos);
    var markerHi = Math.min(samples, markerLo + 1);
    var markerMix = markerSamplePos - markerLo;
    var markerWaveVal = summedSmooth[markerLo] * (1 - markerMix) + summedSmooth[markerHi] * markerMix;
    var markerNorm = clamp(markerWaveVal / displayScale, -1.2, 1.2);
    markerY = yMid + markerNorm * displayAmpPx;

    if (bridgeFlags && bridgeFlags.length > 0) {
      var markerBridgeIndex = Math.floor((timeTheta / TWO_PI) * bridgeFlags.length) % bridgeFlags.length;
      if (bridgeFlags[markerBridgeIndex]) {
        sweepFill = color(182, 212, 190, 135);
      }
    }
  }
  unclipRect();

  fill(sweepFill);
  noStroke();
  circle(timeX, markerY, 7);

  var maxFreq = 1;
  for (var f = 0; f < terms.length; f++) {
    maxFreq = Math.max(maxFreq, Math.abs(terms[f].freq));
  }
  var baseY = barY + barH - 18;
  var barTopLimit = barY + 10;
  var barBottomLimit = barY + barH - 10;
  var barSlot = terms.length > 0 ? barW / terms.length : barW;
  var maxAmpSafe = Math.max(1e-9, maxAmp);
  var minDb = -72;
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
    var normAmp = Math.max(1e-9, absAmp / maxAmpSafe);
    var ampDb = 20 * (Math.log(normAmp) / Math.LN10);
    var clampedDb = Math.max(minDb, ampDb);
    var dbNorm = (clampedDb - minDb) / (0 - minDb);
    var normH = dbNorm * (baseY - barTopLimit);
    var barHeight = Math.max(2, normH);
    var bx = barX + b * barSlot + Math.max(1, barSlot * 0.08);
    var bw = Math.max(3, barSlot * 0.84);
    var by = baseY - barHeight;
    var barAlpha = isRingSelected(b) ? 245 : 185;
    var barHue = normalizeAngle0ToTwoPi(termPhaseOffsets[b] || 0) * 180 / PI;
    colorMode(HSB, 360, 100, 100, 255);
    fill(barHue, 76, isRingSelected(b) ? 98 : 88, barAlpha);
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
  text("frequency × log amplitude (dB)", barX + 2, barY + 2);
  textAlign(LEFT, TOP);
  text("Amplitude (dB)", barX + 6, barTopLimit + 2);
  textAlign(CENTER, TOP);
  text("Frequency", barX + barW * 0.5, baseY + 6);
  textAlign(LEFT, TOP);

  fill(205, 215, 240, 190);
  noStroke();
  textSize(11);
  if (selectedRingIndices.length > 1) {
    text("combined • selected " + selectedRingIndices.length + " terms", plotX + 2, plotY + 4);
  } else if (selectedRingIndex >= 0 && selectedRingIndex < terms.length) {
    var st = terms[selectedRingIndex];
    text("combined • selected: amp " + nf(st.amp, 1, 2) + " • freq " + nf(st.freq, 1, 2), plotX + 2, plotY + 4);
  } else {
    text("combined • using " + activeCount + " terms", plotX + 2, plotY + 4);
  }

  textAlign(RIGHT, TOP);
  text("t = " + nf(timeTheta / PI, 1, 2) + "π", plotX + plotW - 2, plotY + 4);
  textAlign(LEFT, TOP);

  var hintW = 360;
  fill(184, 226, 199, 165);
  noStroke();
  rect(barX + 2, barY + 2, hintW, 18, 6);
  fill(18, 24, 20, 230);
  textSize(10);
  text("Horizontal drag = multi-select range • Vertical drag = adjust selected bars", barX + 8, barY + 6);

  if (isBrushingBarSelection && barSelectionAnchorIndex >= 0 && barSelectionCurrentIndex >= 0) {
    var r1 = Math.min(barSelectionAnchorIndex, barSelectionCurrentIndex);
    var r2 = Math.max(barSelectionAnchorIndex, barSelectionCurrentIndex);
    if (barChartItems[r1] && barChartItems[r2]) {
      var sx = barChartItems[r1].x - 2;
      var ex = barChartItems[r2].x + barChartItems[r2].w + 2;
      fill(190, 230, 205, 45);
      stroke(190, 230, 205, 230);
      strokeWeight(2);
      rect(sx, barTopLimit - 4, ex - sx, barBottomLimit - barTopLimit + 8, 8);
    }
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

  if (selectedRingIndices.length > 1) {
    info.textContent = "Selected " + selectedRingIndices.length + " rings";
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

function updateViewModeButton() {
  var viewToggle = document.getElementById("toggle-view-mode");
  if (!viewToggle) return;
  viewToggle.textContent = viewMode === "3d" ? "View: 3D" : "View: 2D";
  viewToggle.classList.toggle("active", viewMode === "3d");
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
  selectedRingIndices = [];
  isBrushingBarSelection = false;
  barSelectionAnchorIndex = -1;
  barSelectionCurrentIndex = -1;
  pendingBarGesture = false;
  pendingBarTermIndex = -1;
  pendingBarGestureMode = "";
  phaseWheelGeom = null;
  isDraggingPhaseWheel = false;
  rebuildStaticPath();
}

function setup() {
  createCanvas(windowWidth, windowHeight);

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
    select.value = drawingChoice;
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

  var viewModeToggle = document.getElementById("toggle-view-mode");
  if (viewModeToggle) {
    updateViewModeButton();
    viewModeToggle.addEventListener("click", function () {
      viewMode = viewMode === "3d" ? "2d" : "3d";
      updateViewModeButton();
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

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function loadSelectedDrawing() {
  loading = true;
  loadError = "";
  epicycleTime = 0;
  parameterSlices = [];
  lastParameterSignature = "";
  lastSliceCaptureMillis = 0;
  timelineScrollOffset = 0;
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

function buildEpicycleSegments(activeCount, sampleTime) {
  var segments = [];
  var ex = 0;
  var ey = 0;
  var t = typeof sampleTime === "number" ? sampleTime : epicycleTime;

  for (var i = 0; i < activeCount; i++) {
    var prevx = ex;
    var prevy = ey;
    var term = getPlayTerm(fourierX[i], i, activeCount);
    ex += term.amp * cos(term.freq * t + term.phase);
    ey += term.amp * sin(term.freq * t + term.phase);

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
      var phaseHue = normalizeAngle0ToTwoPi(termPhaseOffsets[seg.index] || 0) * 180 / PI;
      var circlePos = worldToScreen(seg.fromX, seg.fromY);
      var endpoint = worldToScreen(seg.toX, seg.toY);
      var displayRadius = seg.amp < 1.25 ? 1.25 : seg.amp;
      var displayRadiusScreen = displayRadius * viewZoom;
      var isHover = seg.index === hoveredRingIndex;
      var isSelected = isRingSelected(seg.index);
      var circleAlpha = seg.amp < 2 ? 210 : (seg.amp < 6 ? 150 : 90);
      var circleWeight = seg.amp < 2 ? 1.6 : (seg.amp < 6 ? 1.2 : 1.0);

      colorMode(HSB, 360, 100, 100, 255);
      if (isHover) {
        stroke(phaseHue, 92, 100, 248);
        strokeWeight(2.4);
      } else if (isSelected) {
        stroke(phaseHue, 86, 100, 236);
        strokeWeight(2.2);
      } else {
        stroke(phaseHue, 76, 92, circleAlpha);
        strokeWeight(circleWeight);
      }
      noFill();
      ellipse(circlePos.x, circlePos.y, displayRadiusScreen * 2);

      if (isHover) {
        stroke(phaseHue, 90, 100, 235);
      } else if (isSelected) {
        stroke(phaseHue, 84, 100, 220);
      } else {
        stroke(phaseHue, 70, 95, 170);
      }
      colorMode(RGB, 255, 255, 255, 255);
      strokeWeight(1);
      line(circlePos.x, circlePos.y, endpoint.x, endpoint.y);
    }

    var tip = worldToScreen(segments[segments.length - 1].toX, segments[segments.length - 1].toY);
    fill(255, 230);
    noStroke();
    circle(tip.x, tip.y, 4);
  }
}

function getEpicycleTipAtTime(activeCount, t) {
  var ex = 0;
  var ey = 0;
  for (var i = 0; i < activeCount; i++) {
    var term = getPlayTerm(fourierX[i], i, activeCount);
    ex += term.amp * cos(term.freq * t + term.phase);
    ey += term.amp * sin(term.freq * t + term.phase);
  }
  return { x: ex, y: ey };
}

function drawRecentTraceOverlay() {
  if (!fourierX || fourierX.length === 0) return;

  var activeCount = Math.max(1, Math.min(maxEpicycles, fourierX.length));
  var tailSamples = Math.max(14, Math.min(70, Math.floor(fourierX.length * 0.085)));
  var dt = TWO_PI / Math.max(1, fourierX.length);
  var timeNow = normalizeAngle0ToTwoPi(epicycleTime);

  noFill();
  for (var step = tailSamples; step > 0; step--) {
    var tA = normalizeAngle0ToTwoPi(timeNow - step * dt);
    var tB = normalizeAngle0ToTwoPi(timeNow - (step - 1) * dt);
    var a = getEpicycleTipAtTime(activeCount, tA);
    var b = getEpicycleTipAtTime(activeCount, tB);
    var sa = worldToScreen(a.x, a.y);
    var sb = worldToScreen(b.x, b.y);
    var k = 1 - (step / tailSamples);

    stroke(184, 232, 206, 28 + k * 150);
    strokeWeight(1.2 + k * 3.1);
    line(sa.x, sa.y, sb.x, sb.y);
  }

  var tip = getEpicycleTipAtTime(activeCount, timeNow);
  var tipScreen = worldToScreen(tip.x, tip.y);

  noStroke();
  fill(184, 232, 206, 62);
  circle(tipScreen.x, tipScreen.y, 18);
  fill(204, 246, 220, 188);
  circle(tipScreen.x, tipScreen.y, 8);
  fill(232, 255, 241, 245);
  circle(tipScreen.x, tipScreen.y, 4);
}

function rotate3DPoint(x, y, z) {
  var cy = Math.cos(view3dYaw);
  var sy = Math.sin(view3dYaw);
  var x1 = x * cy + z * sy;
  var z1 = -x * sy + z * cy;

  var cp = Math.cos(view3dPitch);
  var sp = Math.sin(view3dPitch);
  var y2 = y * cp - z1 * sp;
  var z2 = y * sp + z1 * cp;

  return { x: x1, y: y2, z: z2 };
}

function project3DVec(panel, x, y, z) {
  var r = rotate3DPoint(x, y, z);
  var cx = panel.x + panel.w * 0.42;
  var cy = panel.y + panel.h * 0.54;
  var camDist = Math.min(panel.w, panel.h) * 0.95;
  var denom = camDist + r.z + Math.min(panel.w, panel.h) * 0.3;
  var perspective = camDist / Math.max(80, denom);

  return {
    x: cx + r.x * perspective,
    y: cy + r.y * perspective,
    depth: r.z,
    scale: perspective
  };
}

function draw3DAxes(panel, axisLenPx) {
  var origin = project3DVec(panel, 0, 0, 0);
  var xEnd = project3DVec(panel, axisLenPx, 0, 0);
  var yEnd = project3DVec(panel, 0, axisLenPx, 0);
  var zEnd = project3DVec(panel, 0, 0, axisLenPx);

  strokeWeight(1.6);
  stroke(255, 130, 130, 210);
  line(origin.x, origin.y, xEnd.x, xEnd.y);
  stroke(140, 255, 170, 210);
  line(origin.x, origin.y, yEnd.x, yEnd.y);
  stroke(130, 180, 255, 210);
  line(origin.x, origin.y, zEnd.x, zEnd.y);

  noStroke();
  fill(255, 130, 130, 220);
  textSize(10);
  textAlign(LEFT, CENTER);
  text("X", xEnd.x + 4, xEnd.y);
  fill(140, 255, 170, 220);
  text("Y", yEnd.x + 4, yEnd.y);
  fill(130, 180, 255, 220);
  text("Z", zEnd.x + 4, zEnd.y);
}

function drawParameterSlice3DView(panel) {
  if (!parameterSlices || parameterSlices.length === 0) return;

  var totalSlices = parameterSlices.length;
  var endIndex = totalSlices - 1 - timelineScrollOffset;
  endIndex = Math.max(0, Math.min(totalSlices - 1, endIndex));
  var startIndex = Math.max(0, endIndex - timelineVisibleCount + 1);
  var visibleSlices = parameterSlices.slice(startIndex, endIndex + 1);
  if (visibleSlices.length === 0) return;

  var maxAbs = 1;
  for (var s = 0; s < visibleSlices.length; s++) {
    var slicePts = visibleSlices[s].points;
    for (var p = 0; p < slicePts.length; p++) {
      maxAbs = Math.max(maxAbs, Math.abs(slicePts[p].x), Math.abs(slicePts[p].y));
    }
  }

  var xyScale = (Math.min(panel.w, panel.h) * 0.34 / maxAbs) * viewZoom;
  var depthScale = Math.min(panel.w, panel.h) * 0.62;
  var railXLeft = panel.x + 18;
  var railXRight = panel.x + panel.w - 86;
  var railY = panel.y + panel.h - 76;

  noStroke();
  fill(14, 18, 30, 165);
  rect(railXLeft - 10, railY - 14, (railXRight - railXLeft) + 20, 30, 8);

  stroke(130, 180, 255, 215);
  strokeWeight(2);
  line(railXLeft, railY, railXRight, railY);

  function railXForIndex(idx) {
    if (totalSlices <= 1) return (railXLeft + railXRight) * 0.5;
    return railXLeft + (idx / (totalSlices - 1)) * (railXRight - railXLeft);
  }

  var visibleStartX = railXForIndex(startIndex);
  var visibleEndX = railXForIndex(endIndex);
  stroke(188, 226, 205, 190);
  strokeWeight(4);
  line(visibleStartX, railY, visibleEndX, railY);

  noStroke();
  for (var dot = 0; dot < totalSlices; dot++) {
    var dotX = railXForIndex(dot);
    var inVisible = dot >= startIndex && dot <= endIndex;
    fill(inVisible ? color(164, 198, 236, 190) : color(105, 120, 156, 85));
    circle(dotX, railY, inVisible ? 3.8 : 2.8);
  }

  noStroke();
  fill(130, 180, 255, 220);
  textSize(10);
  textAlign(LEFT, TOP);
  text("timeline", railXLeft, railY - 28);
  fill(176, 196, 220, 195);
  textSize(9);
  text("older", railXLeft, railY + 6);
  textAlign(RIGHT, TOP);
  text("newer", railXRight, railY + 6);
  textAlign(LEFT, TOP);

  for (var i = 0; i < visibleSlices.length; i++) {
    var slice = visibleSlices[i];
    var u = visibleSlices.length > 1 ? i / (visibleSlices.length - 1) : 0;
    var z = (0.5 - u) * depthScale;
    var absoluteIndex = startIndex + i;
    var isNewest = absoluteIndex === totalSlices - 1;
    var alphaBase = 36 + u * 178;

    for (var j = 0; j < slice.points.length; j++) {
      var a = slice.points[j];
      var b = slice.points[(j + 1) % slice.points.length];
      var pa = project3DVec(panel, a.x * xyScale, a.y * xyScale, z);
      var pb = project3DVec(panel, b.x * xyScale, b.y * xyScale, z);
      var segBridge = !!(a.bridge || b.bridge);
      stroke(isNewest ? color(210, 236, 255, segBridge ? alphaBase * 0.32 : 240) : color(170, 198, 235, segBridge ? alphaBase * 0.22 : alphaBase));
      strokeWeight(isNewest ? (segBridge ? 1.1 : 1.9) : (segBridge ? 0.7 : 1.1));
      line(pa.x, pa.y, pb.x, pb.y);
    }

    var markerX = railXForIndex(absoluteIndex);
    noStroke();
    fill(isNewest ? color(206, 234, 216, 238) : color(158, 189, 227, 170));
    circle(markerX, railY, isNewest ? 7 : 4.5);
  }

  var currentX = railXForIndex(totalSlices - 1);
  stroke(206, 234, 216, 240);
  strokeWeight(1.5);
  line(currentX, railY - 8, currentX, railY + 8);

  var newest = visibleSlices[visibleSlices.length - 1];
  if (newest && newest.points.length > 0) {
    var tipPt = newest.points[newest.points.length - 1];
    var tip = project3DVec(panel, tipPt.x * xyScale, tipPt.y * xyScale, -depthScale * 0.5);
    noStroke();
    fill(196, 232, 208, 240);
    circle(tip.x, tip.y, 7);
  }

  fill(188, 202, 224, 190);
  textSize(10);
  textAlign(LEFT, TOP);
  text("Each slice = 2D epicycle drawing at a parameter state • drag to rotate • wheel to scroll timeline", panel.x + 10, panel.y + panel.h - 18);
  text("showing " + (startIndex + 1) + "–" + (endIndex + 1) + " of " + totalSlices + " changes", panel.x + 10, panel.y + panel.h - 32);
}

function draw() {
  background(0);

  if (isDraggingDivider || isNearDivider(mouseX, mouseY)) {
    cursor("ew-resize");
  } else if (isScrubbingSine || isInSinePlot(mouseX, mouseY)) {
    cursor("ew-resize");
  } else if (isDragging3DRotate) {
    cursor("grab");
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

  captureParameterSlice(false);

  drawPaneFrames();

  var layout = getPaneLayout();
  clipRect(layout.left.x, layout.left.y, layout.left.w, layout.left.h);

  if (viewMode === "3d") {
    drawParameterSlice3DView(layout.left);
  } else {
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
    drawRecentTraceOverlay();
  }
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
  var ampText = selectedRingIndices.length > 1
    ? "Drag a selected bar up/down to change selected rings together"
    : selectedRingIndex >= 0
    ? "Drag up/down to change selected ring amplitude"
    : "Drag up/down to change global amplitudes";
  var ampTextY = viewMode === "3d"
    ? layout.left.y + layout.left.h - 48
    : layout.left.y + layout.left.h - 14;
  text(ampText, layout.left.x + 10, ampTextY);
  updateSelectedRingInfo();

  var dt = TWO_PI / Math.max(1, fourierX.length);
  if (!isScrubbingSine) {
    epicycleTime = normalizeAngle0ToTwoPi(epicycleTime + dt);
  }
}

function mousePressed(mouseEvent) {
  if (isNearDivider(mouseX, mouseY)) {
    isDraggingDivider = true;
    return;
  }

  if (viewMode === "3d" && inLeftPane(mouseX, mouseY) && !isInPhaseWheel(mouseX, mouseY)) {
    isDragging3DRotate = true;
    last3DMouseX = mouseX;
    last3DMouseY = mouseY;
    return;
  }

  if (isInPhaseWheel(mouseX, mouseY)) {
    isDraggingPhaseWheel = true;
    applyPhaseFromMouse(mouseX, mouseY);
    return;
  }

  if (isInSinePlot(mouseX, mouseY)) {
    isScrubbingSine = true;
    setEpicycleTimeFromSineX(mouseX);
    return;
  }

  if (hoveredBarIndex >= 0 && hoveredBarIndex < barChartItems.length) {
    var barTermIndex = barChartItems[hoveredBarIndex].termIndex;
    if (isMultiSelectEvent(mouseEvent)) {
      toggleRingSelection(barTermIndex);
      updateSelectedRingInfo();
      return;
    }

    if (!isRingSelected(barTermIndex)) {
      setSingleRingSelection(barTermIndex);
    }

    pendingBarGesture = true;
    pendingBarTermIndex = barTermIndex;
    pendingBarStartX = mouseX;
    pendingBarStartY = mouseY;
    pendingBarGestureMode = "";
    isBrushingBarSelection = false;
    barSelectionAnchorIndex = -1;
    barSelectionCurrentIndex = -1;

    updateSelectedRingInfo();
    return;
  }

  pendingBarGesture = false;
  pendingBarTermIndex = -1;
  pendingBarGestureMode = "";

  if (!inLeftPane(mouseX, mouseY)) {
    if (!isMultiSelectEvent(mouseEvent)) {
      setSingleRingSelection(-1);
      updateSelectedRingInfo();
    }
    return;
  }

  updateHoveredRing();
  if (hoveredRingIndex >= 0) {
    if (isMultiSelectEvent(mouseEvent) || keyIsDown(SHIFT)) {
      toggleRingSelection(hoveredRingIndex);
    } else {
      setSingleRingSelection(hoveredRingIndex);
    }
  } else if (!keyIsDown(SHIFT)) {
    setSingleRingSelection(-1);
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

  if (isScrubbingSine) {
    setEpicycleTimeFromSineX(mouseX);
    return;
  }

  if (isDragging3DRotate) {
    var rotDx = mouseX - last3DMouseX;
    var rotDy = mouseY - last3DMouseY;
    last3DMouseX = mouseX;
    last3DMouseY = mouseY;
    view3dYaw += rotDx * 0.01;
    view3dPitch = clamp(view3dPitch + rotDy * 0.01, -1.25, 1.25);
    return;
  }

  if (pendingBarGesture) {
    var gdx = mouseX - pendingBarStartX;
    var gdy = mouseY - pendingBarStartY;

    if (!pendingBarGestureMode) {
      if (Math.abs(gdx) >= 6 && Math.abs(gdx) > Math.abs(gdy)) {
        pendingBarGestureMode = "brush";
        isBrushingBarSelection = true;
        barSelectionAnchorIndex = pendingBarTermIndex;
        barSelectionCurrentIndex = pendingBarTermIndex;
        selectBarRange(barSelectionAnchorIndex, barSelectionCurrentIndex);
        updateSelectedRingInfo();
      } else if (Math.abs(gdy) >= 6) {
        pendingBarGestureMode = "amplitude";
        isDraggingBarAmplitude = true;
        lastDragY = mouseY;
      } else {
        return;
      }
    }

    if (pendingBarGestureMode === "brush") {
      var pendingBrushHit = findBarAt(mouseX, mouseY);
      if (pendingBrushHit >= 0 && pendingBrushHit < barChartItems.length) {
        barSelectionCurrentIndex = barChartItems[pendingBrushHit].termIndex;
        selectBarRange(barSelectionAnchorIndex, barSelectionCurrentIndex);
        updateSelectedRingInfo();
      }
      redraw();
      return;
    }

    if (pendingBarGestureMode === "amplitude") {
      var pendingBarDy = mouseY - lastDragY;
      lastDragY = mouseY;
      var pendingBarTargets = getSelectedTargets();
      if (pendingBarTargets.length > 0) {
        for (var pb = 0; pb < pendingBarTargets.length; pb++) {
          var ptIndex = pendingBarTargets[pb];
          termAmpOffsets[ptIndex] = clamp((termAmpOffsets[ptIndex] || 0) - pendingBarDy * 0.004, -0.8, 1.0);
        }
        rebuildStaticPath();
      }
      return;
    }
  }

  if (isBrushingBarSelection) {
    var brushHit = findBarAt(mouseX, mouseY);
    if (brushHit >= 0 && brushHit < barChartItems.length) {
      barSelectionCurrentIndex = barChartItems[brushHit].termIndex;
      selectBarRange(barSelectionAnchorIndex, barSelectionCurrentIndex);
      updateSelectedRingInfo();
      redraw();
    }
    return;
  }

  if (isDraggingPhaseWheel) {
    applyPhaseFromMouse(mouseX, mouseY);
    return;
  }

  if (isDraggingBarAmplitude) {
    var barDy = mouseY - lastDragY;
    lastDragY = mouseY;
    var barTargets = getSelectedTargets();
    if (barTargets.length > 0) {
      for (var b = 0; b < barTargets.length; b++) {
        var tIndex = barTargets[b];
        termAmpOffsets[tIndex] = clamp((termAmpOffsets[tIndex] || 0) - barDy * 0.004, -0.8, 1.0);
      }
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
  isScrubbingSine = false;
  isDragging3DRotate = false;
  isDraggingAmplitude = false;
  isDraggingBarAmplitude = false;
  isDraggingPhaseWheel = false;
  isBrushingBarSelection = false;
  barSelectionAnchorIndex = -1;
  barSelectionCurrentIndex = -1;
  pendingBarGesture = false;
  pendingBarTermIndex = -1;
  pendingBarGestureMode = "";
  updateSelectedRingInfo();
}

function mouseWheel(event) {
  if (viewMode === "3d") {
    if (!inLeftPane(mouseX, mouseY)) return false;
    var maxOffset = Math.max(0, parameterSlices.length - timelineVisibleCount);
    var scrollStep = Math.max(1, Math.round(Math.abs(event.delta) / 80));
    timelineScrollOffset = clamp(timelineScrollOffset + (event.delta > 0 ? scrollStep : -scrollStep), 0, maxOffset);
    return false;
  }

  if (!inLeftPane(mouseX, mouseY)) return false;

  var delta = event.delta > 0 ? -0.08 : 0.08;
  viewZoom = clamp(viewZoom + delta, 0.5, 4);
  return false;
}
