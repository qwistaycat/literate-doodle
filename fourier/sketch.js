var x = [];
var fourierX;
var time = 0;
var path = [];
var drawing = [];
var loading = true;

// Process raw points into Fourier data and start animation
function processPoints(points) {
  if (points.length === 0) {
    console.error("No points found in SVG!");
    return;
  }

  // Reset state
  x = [];
  path = [];
  time = 0;
  loading = true;
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

  // Initial load
  loadSVGToDrawing(processPoints);

  // Reload button — re-fetches outputfile.svg (cache-busted)
  document.getElementById("reload-btn").addEventListener("click", function () {
    loading = true;
    loadSVGToDrawing(processPoints);
  });

  // File upload — load any SVG from disk
  document.getElementById("svg-upload").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (file) {
      loading = true;
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
    stroke(255, 100);
    noFill();
    ellipse(prevx, prevy, radius * 2);
    stroke(255);
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

  var v = epicycles(width / 2, height / 2, 0, fourierX);
  // Determine if current time maps to a bridge point
  var currentIndex = Math.floor((time / TWO_PI) * fourierX.length);
  if (currentIndex < 0) currentIndex = 0;
  if (currentIndex >= x.length) currentIndex = x.length - 1;
  v.bridge = x[currentIndex] ? !!x[currentIndex].bridge : false;
  path.unshift(v);

  // Draw the traced path, using different styles for pen-down vs pen-up
  noFill();
  var inBridge = false;
  for (var i = 0; i < path.length - 1; i++) {
    var isBridge = path[i].bridge || path[i + 1].bridge;
    if (isBridge) {
      stroke(100, 150, 255);  // light blue for pen-up
      strokeWeight(0.5);
    } else {
      stroke(255, 0, 255);  // magenta for pen-down
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


