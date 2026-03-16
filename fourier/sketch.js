var x = [];
var fourierX;
var time = 0;
var path = [];
var drawing = [];
var loading = true;
var loadError = "";
var drawingChoice = "outputfile";
var showPenUp = true;

function blackberryStrokeColor(px, py) {
  var nx = constrain(px / width, 0, 1);
  var ny = constrain(py / height, 0, 1);

  var drift = frameCount * 0.003;
  var shiftedX = constrain(nx + 0.08 * Math.sin(drift + ny * 3.2), 0, 1);
  var shiftedY = constrain(ny + 0.05 * Math.cos(drift * 0.7 + nx * 2.1), 0, 1);

  var budGreen = color(121, 171, 94);
  var blossomCream = color(243, 232, 206);
  var berryRed = color(156, 34, 76);
  var berryPurple = color(89, 38, 132);

  var leftBlend = lerpColor(budGreen, blossomCream, 0.35 + 0.25 * (1 - shiftedY));
  var horizontalBlend = lerpColor(leftBlend, berryRed, shiftedX);
  return lerpColor(horizontalBlend, berryPurple, shiftedY * 0.9);
}

function loadSelectedDrawing(forceReload) {
  loading = true;
  loadError = "";

  if (forceReload) {
    if (drawingChoice === "outputfile") {
      loadSVGToDrawing(processPoints);
      return;
    }
    if (drawingChoice === "heated" && typeof drawingHeated !== "undefined") {
      drawingHeated = [];
    }
    if (drawingChoice === "pom" && typeof drawingPom !== "undefined") {
      drawingPom = [];
    }
    if (drawingChoice === "blackberry" && typeof drawingBlackberry !== "undefined") {
      drawingBlackberry = [];
    }
  }

  loadNamedDrawing(drawingChoice, processPoints);
}

// Process raw points into Fourier data and start animation
function processPoints(points) {
  if (points.length === 0) {
    console.error("No points found in SVG!");
    loadError = "Could not load any SVG points. Upload an SVG or reload.";
    loading = false;
    return;
  }

  // Reset state
  x = [];
  path = [];
  time = 0;
  loading = true;
  loadError = "";
  drawing = points;

  // Center and scale to fit canvas
  var cx = 0, cy = 0;
  drawing.forEach(function (p) { cx += p.x; cy += p.y; });
  cx /= drawing.length;
  cy /= drawing.length;

  var maxDist = 0;
  drawing.forEach(function (p) {
    var d = Math.sqrt((p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy));
    if (d > maxDist) maxDist = d;
  });
  var scale = maxDist > 0 ? 250 / maxDist : 1;

  drawing = drawing.map(function (p) {
    return { x: (p.x - cx) * scale, y: (p.y - cy) * scale, bridge: !!p.bridge };
  });

  // Use all points for DFT
  for (var i = 0; i < drawing.length; i++) {
    x.push(new Complex(drawing[i].x, drawing[i].y));
    x[x.length - 1].bridge = drawing[i].bridge;
  }

  fourierX = dft(x);
  fourierX.sort(function (a, b) { return b.amp - a.amp; });
  loading = false;
}

function setup() {
  createCanvas(800, 600);
  background(0);

  var select = document.getElementById("drawing-select");
  if (select) {
    drawingChoice = select.value;
    select.addEventListener("change", function (e) {
      drawingChoice = e.target.value;
      loadSelectedDrawing(false);
    });
  }

  var penUpToggle = document.getElementById("penup-toggle");
    showPenUp = penUpToggle.checked;
    penUpToggle.addEventListener("change", function (e) {
      showPenUp = e.target.checked;
    });
  }

  ensureNamedDrawingsLoaded(function () {
    loadSelectedDrawing(false);
  });

  // Reload selected drawing from SVG source
  document.getElementById("reload-btn").addEventListener("click", function () {
    loadSelectedDrawing(true);
  });

  // File upload — load any SVG from disk
  document.getElementById("svg-upload").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (file) {
      loading = true;
      loadError = "";
      loadSVGFromFile(file, processPoints);
    }
  });
}

function epicycles(ex, ey, rotation, fourier) {
  for (var i = 0; i < fourier.length; i++) {
    var prevx = ex;
    var prevy = ey;
    var freq = fourier[i].freq;
    var radius = fourier[i].amp;
    var phase = fourier[i].phase;
    ex += radius * cos(freq * time + phase + rotation);
    ey += radius * sin(freq * time + phase + rotation);

    var displayRadius = radius < 1.25 ? 1.25 : radius;
    var circleAlpha = radius < 2 ? 240 : (radius < 6 ? 190 : 110);
    var circleWeight = radius < 2 ? 1.8 : (radius < 6 ? 1.4 : 1.0);

    stroke(255, circleAlpha);
    strokeWeight(circleWeight);
    noFill();
    ellipse(prevx, prevy, displayRadius * 2);
    stroke(255);
    strokeWeight(1);
    line(prevx, prevy, ex, ey);
  }
  return createVector(ex, ey);
}

function draw() {
  background(0);
  if (loading) {
    fill(255);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(18);
    text("Loading SVG...", width / 2, height / 2);
    return;
  }

  if (loadError || !fourierX || fourierX.length === 0) {
    fill(255, 120, 120);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(16);
    text(loadError || "SVG failed to load.", width / 2, height / 2);
    return;
  }

  var v = epicycles(width / 2, height / 2, 0, fourierX);
  // Determine if current time maps to a bridge point
  var currentIndex = Math.floor((time / TWO_PI) * fourierX.length);
  if (currentIndex < 0) currentIndex = 0;
  if (currentIndex >= x.length) currentIndex = x.length - 1;
  v.bridge = x[currentIndex] ? !!x[currentIndex].bridge : false;
  path.unshift(v);

  // Draw the traced path, using different styles for pen-down vs pen-up
  noFill();
  for (var i = 0; i < path.length - 1; i++) {
    var isBridge = path[i].bridge || path[i + 1].bridge;
    var midX = (path[i].x + path[i + 1].x) * 0.5;
    var midY = (path[i].y + path[i + 1].y) * 0.5;
    if (isBridge) {
      if (!showPenUp) {
        continue;
      }
      stroke(100, 150, 255, 220);  // light blue for pen-up
      strokeWeight(0.5);
    } else {
      var gradColor = blackberryStrokeColor(midX, midY);
      stroke(red(gradColor), green(gradColor), blue(gradColor), 245);
      strokeWeight(2);
    }
    line(path[i].x, path[i].y, path[i + 1].x, path[i + 1].y);
  }

  var dt = TWO_PI / fourierX.length;
  time += dt;
  if (time > TWO_PI) {
    time = 0;
    path = [];
  }
}


