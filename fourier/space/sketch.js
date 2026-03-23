var fourierX = [];
var drawingChoice = "outputfile";
var maxEpicycles = 1;
var loading = true;
var loadError = "";
var reconstructedPath = [];
var bridgeFlags = [];
var showEpicycles = true;
var epicycleTime = 0;
var playAmpNudge = 0;
var playPhaseNudge = 0;
var playDirty = false;
var isDraggingPlay = false;
var lastDragX = 0;
var lastDragY = 0;
var viewZoom = 1;
var ringSnapshots = [];
var hoveredRingIndex = -1;
var selectedRingIndex = -1;
var termAmpOffsets = [];
var termPhaseOffsets = [];

function processPoints(points) {
  if (!points || points.length === 0) {
    loadError = "Could not load any SVG points.";
    loading = false;
    redraw();
    return;
  }

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
  bridgeFlags = [];
  for (var i = 0; i < points.length; i++) {
    x.push(new Complex((points[i].x - cx) * scale, (points[i].y - cy) * scale));
    bridgeFlags.push(!!points[i].bridge);
  }

  fourierX = dft(x);
  fourierX.sort(function (a, b) { return b.amp - a.amp; });
  termAmpOffsets = new Array(fourierX.length).fill(0);
  termPhaseOffsets = new Array(fourierX.length).fill(0);
  hoveredRingIndex = -1;
  selectedRingIndex = -1;

  var slider = document.getElementById("epicycle-slider");
  var sliderValue = document.getElementById("epicycle-slider-value");
  if (slider) {
    slider.max = String(fourierX.length);
    slider.value = String(fourierX.length);
    maxEpicycles = fourierX.length;
    if (sliderValue) sliderValue.textContent = String(maxEpicycles);
  }

  loadError = "";
  loading = false;
  rebuildStaticPath();
  redraw();
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
  var lowFreqWeight = 1 - highFreqWeight;

  var ampScale = 1 + playAmpNudge * (0.2 + 0.8 * highFreqWeight);
  if (ampScale < 0.25) ampScale = 0.25;
  if (ampScale > 1.75) ampScale = 1.75;

  var phaseShift = playPhaseNudge * (0.15 + 0.85 * lowFreqWeight);
  var termAmpOffset = termAmpOffsets[index] || 0;
  var termPhaseOffset = termPhaseOffsets[index] || 0;

  return {
    amp: term.amp * ampScale * (1 + termAmpOffset),
    phase: term.phase + phaseShift + termPhaseOffset,
    freq: term.freq
  };
}

function worldToScreen(wx, wy) {
  return {
    x: width / 2 + wx * viewZoom,
    y: height / 2 + wy * viewZoom
  };
}

function screenToWorld(sx, sy) {
  return {
    x: (sx - width / 2) / viewZoom,
    y: (sy - height / 2) / viewZoom
  };
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

function resetPlayInteraction() {
  playAmpNudge = 0;
  playPhaseNudge = 0;
  for (var i = 0; i < termAmpOffsets.length; i++) termAmpOffsets[i] = 0;
  for (var j = 0; j < termPhaseOffsets.length; j++) termPhaseOffsets[j] = 0;
  hoveredRingIndex = -1;
  selectedRingIndex = -1;
  playDirty = true;
}

function setup() {
  createCanvas(800, 600);

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
      maxEpicycles = Math.max(1, parseInt(e.target.value, 10) || 1);
      if (sliderValue) sliderValue.textContent = String(maxEpicycles);
      rebuildStaticPath();
      redraw();
    });
  }

  var zoomSlider = document.getElementById("zoom-slider");
  var zoomValue = document.getElementById("zoom-slider-value");
  if (zoomSlider) {
    zoomSlider.addEventListener("input", function (e) {
      var raw = parseInt(e.target.value, 10) || 100;
      viewZoom = clamp(raw / 100, 0.5, 4);
      if (zoomValue) zoomValue.textContent = viewZoom.toFixed(2) + "x";
    });
    var initialRaw = parseInt(zoomSlider.value, 10) || 100;
    viewZoom = clamp(initialRaw / 100, 0.5, 4);
    if (zoomValue) zoomValue.textContent = viewZoom.toFixed(2) + "x";
  }

  var epicycleToggle = document.getElementById("toggle-epicycles");
  if (epicycleToggle) {
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

  ensureNamedDrawingsLoaded(function () {
    loadSelectedDrawing();
  });
}

function loadSelectedDrawing() {
  loading = true;
  loadError = "";
  epicycleTime = 0;
  resetPlayInteraction();

  if (drawingChoice === "outputfile") {
    loadSVGToDrawing(processPoints);
    return;
  }

  loadNamedDrawing(drawingChoice, processPoints);
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

  if (playDirty) {
    rebuildStaticPath();
    playDirty = false;
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

  var used = Math.max(1, Math.min(maxEpicycles, fourierX.length));
  noStroke();
  fill(0, 170);
  rectMode(CORNER);
  rect(width - 250, 10, 240, 30, 6);
  fill(255);
  textAlign(RIGHT, CENTER);
  textSize(14);
  text("Epicycles: " + used + " / " + fourierX.length, width - 18, 25);

  fill(225, 200, 255, 200);
  textAlign(LEFT, CENTER);
  textSize(12);
  var playText = selectedRingIndex >= 0
    ? "Selected ring " + (selectedRingIndex + 1) + ": drag ←→ phase, ↑↓ amplitude"
    : "Drag canvas: global ←→ phase " + nf(playPhaseNudge, 1, 2) + "  ↑↓ amplitude " + nf(playAmpNudge, 1, 2);
  text(playText, 12, height - 16);
  updateSelectedRingInfo();

  var dt = TWO_PI / Math.max(1, fourierX.length);
  epicycleTime += dt;
  if (epicycleTime > TWO_PI) {
    epicycleTime = 0;
  }
}

function mousePressed() {
  if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) return;
  updateHoveredRing();
  if (hoveredRingIndex >= 0) {
    selectedRingIndex = hoveredRingIndex;
  } else if (!keyIsDown(SHIFT)) {
    selectedRingIndex = -1;
  }
  isDraggingPlay = true;
  lastDragX = mouseX;
  lastDragY = mouseY;
}

function mouseDragged() {
  if (!isDraggingPlay) return;

  var dx = mouseX - lastDragX;
  var dy = mouseY - lastDragY;
  lastDragX = mouseX;
  lastDragY = mouseY;

  if (selectedRingIndex >= 0 && selectedRingIndex < termAmpOffsets.length) {
    termPhaseOffsets[selectedRingIndex] = clamp((termPhaseOffsets[selectedRingIndex] || 0) + dx * 0.004, -1.2, 1.2);
    termAmpOffsets[selectedRingIndex] = clamp((termAmpOffsets[selectedRingIndex] || 0) - dy * 0.0035, -0.7, 0.9);
  } else {
    playPhaseNudge = clamp(playPhaseNudge + dx * 0.004, -0.9, 0.9);
    playAmpNudge = clamp(playAmpNudge - dy * 0.0025, -0.55, 0.55);
  }
  playDirty = true;
}

function mouseReleased() {
  isDraggingPlay = false;
  updateSelectedRingInfo();
}

function mouseWheel(event) {
  if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) return false;
  var zoomSlider = document.getElementById("zoom-slider");
  var zoomValue = document.getElementById("zoom-slider-value");
  var delta = event.delta > 0 ? -0.08 : 0.08;
  viewZoom = clamp(viewZoom + delta, 0.5, 4);
  if (zoomSlider) zoomSlider.value = String(Math.round(viewZoom * 100));
  if (zoomValue) zoomValue.textContent = viewZoom.toFixed(2) + "x";
  return false;
}
