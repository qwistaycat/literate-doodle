var fourierX = [];
var drawingChoice = "outputfile";
var maxEpicycles = 1;
var loading = true;
var loadError = "";
var reconstructedPath = [];
var bridgeFlags = [];

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
      var term = active[j];
      rx += term.amp * cos(term.freq * t + term.phase);
      ry += term.amp * sin(term.freq * t + term.phase);
    }

    reconstructedPath.push({
      x: width / 2 + rx,
      y: height / 2 + ry,
      bridge: bridgeFlags.length > 0 ? !!bridgeFlags[i % bridgeFlags.length] : false
    });
  }
}

function setup() {
  createCanvas(800, 600);
  noLoop();

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

  ensureNamedDrawingsLoaded(function () {
    loadSelectedDrawing();
  });
}

function loadSelectedDrawing() {
  loading = true;
  loadError = "";

  if (drawingChoice === "outputfile") {
    loadSVGToDrawing(processPoints);
    return;
  }

  loadNamedDrawing(drawingChoice, processPoints);
}

function draw() {
  background(0);

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
    return;
  }

  noFill();
  for (var i = 0; i < reconstructedPath.length; i++) {
    var a = reconstructedPath[i];
    var b = reconstructedPath[(i + 1) % reconstructedPath.length];
    var isBridge = a.bridge || b.bridge;
    if (isBridge) {
      stroke(170, 200, 255, 32);
      strokeWeight(1);
    } else {
      stroke(220, 130, 190, 220);
      strokeWeight(2);
    }
    line(a.x, a.y, b.x, b.y);
  }

  var used = Math.max(1, Math.min(maxEpicycles, fourierX.length));
  noStroke();
  fill(0, 170);
  rectMode(CORNER);
  rect(width - 250, 10, 240, 30, 6);
  fill(255);
  textAlign(RIGHT, CENTER);
  textSize(14);
  text("Epicycles: " + used + " / " + fourierX.length, width - 18, 25);
}
