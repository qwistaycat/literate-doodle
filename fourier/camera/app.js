const mainCanvas = document.getElementById("main-canvas");
const ctx = mainCanvas.getContext("2d");

const video = document.getElementById("camera-video");
const processCanvas = document.getElementById("process-canvas");
const processCtx = processCanvas.getContext("2d", { willReadFrequently: true });

const toggleButton = document.getElementById("camera-toggle");
const edgeThresholdInput = document.getElementById("edge-threshold");
const coeffCountInput = document.getElementById("coeff-count");
const speedInput = document.getElementById("live-speed");
const updateRateInput = document.getElementById("update-rate");

const edgeThresholdLabel = document.getElementById("edge-threshold-value");
const coeffCountLabel = document.getElementById("coeff-count-value");
const speedLabel = document.getElementById("live-speed-value");
const updateRateLabel = document.getElementById("update-rate-value");

const statusEl = document.getElementById("status");
const statsEl = document.getElementById("stats");

let stream = null;
let running = false;
let coeffs = [];
let sourcePointCount = 0;
let activeCoeffCount = parseInt(coeffCountInput.value, 10);
let speedMultiplier = parseFloat(speedInput.value);
let edgeThreshold = parseInt(edgeThresholdInput.value, 10);
let refreshMs = parseInt(updateRateInput.value, 10);

let time = 0;
let tracePath = [];
let lastRebuild = 0;

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.floor(window.innerWidth * dpr);
  const h = Math.floor(window.innerHeight * dpr);
  if (mainCanvas.width !== w || mainCanvas.height !== h) {
    mainCanvas.width = w;
    mainCanvas.height = h;
  }
}

function updateLabels() {
  edgeThresholdLabel.textContent = String(edgeThreshold);
  coeffCountLabel.textContent = String(activeCoeffCount);
  speedLabel.textContent = speedMultiplier.toFixed(1) + "x";
  updateRateLabel.textContent = refreshMs + "ms";
}

function setStatus(message) {
  statusEl.textContent = message;
}

async function startCamera() {
  if (running) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user"
      },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
    running = true;
    setStatus("Camera live");
    toggleButton.textContent = "Stop Camera";
  } catch (err) {
    setStatus("Camera permission denied or unavailable");
    console.error(err);
  }
}

function stopCamera() {
  if (!stream) return;
  stream.getTracks().forEach(function (track) {
    track.stop();
  });
  stream = null;
  running = false;
  setStatus("Camera idle");
  toggleButton.textContent = "Start Camera";
}

function extractPointsFromFrame() {
  if (!running || video.readyState < 2) return [];

  const w = processCanvas.width;
  const h = processCanvas.height;
  processCtx.drawImage(video, 0, 0, w, h);
  const frame = processCtx.getImageData(0, 0, w, h);
  const pixels = frame.data;

  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = pixels[p] * 0.299 + pixels[p + 1] * 0.587 + pixels[p + 2] * 0.114;
  }

  const points = [];
  const stride = 2;
  for (let y = 1; y < h - 1; y += stride) {
    for (let x = 1; x < w - 1; x += stride) {
      const idx = y * w + x;
      const gx =
        -gray[idx - w - 1] - 2 * gray[idx - 1] - gray[idx + w - 1] +
        gray[idx - w + 1] + 2 * gray[idx + 1] + gray[idx + w + 1];
      const gy =
        -gray[idx - w - 1] - 2 * gray[idx - w] - gray[idx - w + 1] +
        gray[idx + w - 1] + 2 * gray[idx + w] + gray[idx + w + 1];

      const mag = Math.sqrt(gx * gx + gy * gy);
      if (mag > edgeThreshold) {
        points.push({ x, y });
      }
    }
  }

  if (points.length < 24) return [];

  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    cx += points[i].x;
    cy += points[i].y;
  }
  cx /= points.length;
  cy /= points.length;

  points.sort(function (a, b) {
    const aa = Math.atan2(a.y - cy, a.x - cx);
    const bb = Math.atan2(b.y - cy, b.x - cx);
    if (aa !== bb) return aa - bb;
    const ad = (a.x - cx) * (a.x - cx) + (a.y - cy) * (a.y - cy);
    const bd = (b.x - cx) * (b.x - cx) + (b.y - cy) * (b.y - cy);
    return ad - bd;
  });

  const cap = 650;
  if (points.length > cap) {
    const reduced = [];
    const step = points.length / cap;
    for (let i = 0; i < cap; i++) {
      reduced.push(points[Math.floor(i * step)]);
    }
    return reduced;
  }

  return points;
}

function rebuildFourier() {
  const points = extractPointsFromFrame();
  if (points.length < 24) {
    coeffs = [];
    sourcePointCount = 0;
    statsEl.textContent = "No stable contour";
    return;
  }

  sourcePointCount = points.length;

  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    cx += points[i].x;
    cy += points[i].y;
  }
  cx /= points.length;
  cy /= points.length;

  let maxDist = 0;
  for (let i = 0; i < points.length; i++) {
    const dx = points[i].x - cx;
    const dy = points[i].y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > maxDist) maxDist = d;
  }
  const scale = maxDist > 0 ? 250 / maxDist : 1;

  const complexPoints = [];
  for (let i = 0; i < points.length; i++) {
    complexPoints.push(new Complex((points[i].x - cx) * scale, (points[i].y - cy) * scale));
  }

  coeffs = dft(complexPoints);
  coeffs.sort(function (a, b) {
    return b.amp - a.amp;
  });

  coeffCountInput.max = String(coeffs.length);
  if (activeCoeffCount > coeffs.length) {
    activeCoeffCount = coeffs.length;
    coeffCountInput.value = String(activeCoeffCount);
    coeffCountLabel.textContent = String(activeCoeffCount);
  }

  tracePath = [];
  time = 0;
  statsEl.textContent = "Points: " + sourcePointCount + " | Coeffs: " + coeffs.length;
}

function drawEpicycles(centerX, centerY, list, t) {
  let ex = centerX;
  let ey = centerY;

  for (let i = 0; i < list.length; i++) {
    const term = list[i];
    const prevx = ex;
    const prevy = ey;
    ex += term.amp * Math.cos(term.freq * t + term.phase);
    ey += term.amp * Math.sin(term.freq * t + term.phase);

    const r = Math.max(1.2, term.amp);
    const alpha = term.amp < 2 ? 220 : term.amp < 8 ? 150 : 90;

    ctx.strokeStyle = "rgba(255,255,255," + (alpha / 255) + ")";
    ctx.lineWidth = term.amp < 2 ? 1.6 : 1;
    ctx.beginPath();
    ctx.arc(prevx, prevy, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(prevx, prevy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  return { x: ex, y: ey };
}

function drawTrace() {
  if (tracePath.length < 2) return;

  for (let i = 0; i < tracePath.length - 1; i++) {
    const a = tracePath[i];
    const b = tracePath[i + 1];
    const blend = i / Math.max(1, tracePath.length - 2);

    const green = { r: 121, g: 171, b: 94 };
    const cream = { r: 243, g: 232, b: 206 };
    const red = { r: 156, g: 34, b: 76 };
    const purple = { r: 89, g: 38, b: 132 };

    const gx = green.r + (cream.r - green.r) * (1 - blend);
    const gy = green.g + (cream.g - green.g) * (1 - blend);
    const gb = green.b + (cream.b - green.b) * (1 - blend);

    const rx = gx + (red.r - gx) * blend;
    const ry = gy + (red.g - gy) * blend;
    const rb = gb + (red.b - gb) * blend;

    const px = rx + (purple.r - rx) * (b.y / mainCanvas.height) * 0.7;
    const py = ry + (purple.g - ry) * (b.y / mainCanvas.height) * 0.7;
    const pb = rb + (purple.b - rb) * (b.y / mainCanvas.height) * 0.7;

    ctx.strokeStyle = "rgba(" + Math.round(px) + "," + Math.round(py) + "," + Math.round(pb) + ",0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function renderFrame(now) {
  resizeCanvas();

  ctx.fillStyle = "#050507";
  ctx.fillRect(0, 0, mainCanvas.width, mainCanvas.height);

  if (running && now - lastRebuild >= refreshMs) {
    rebuildFourier();
    lastRebuild = now;
  }

  const usableCount = Math.max(1, Math.min(activeCoeffCount, coeffs.length));
  const active = coeffs.slice(0, usableCount);

  if (active.length > 0) {
    const endpoint = drawEpicycles(mainCanvas.width * 0.5, mainCanvas.height * 0.52, active, time);
    tracePath.unshift(endpoint);

    if (tracePath.length > sourcePointCount + 10) {
      tracePath.length = sourcePointCount + 10;
    }

    drawTrace();

    const denom = Math.max(40, sourcePointCount);
    const dt = (Math.PI * 2 / denom) * speedMultiplier;
    time += dt;
    if (time > Math.PI * 2) {
      time = 0;
      tracePath = [];
    }
  }

  requestAnimationFrame(renderFrame);
}

edgeThresholdInput.addEventListener("input", function (e) {
  edgeThreshold = parseInt(e.target.value, 10);
  updateLabels();
});

coeffCountInput.addEventListener("input", function (e) {
  activeCoeffCount = Math.max(1, parseInt(e.target.value, 10) || 1);
  updateLabels();
  tracePath = [];
});

speedInput.addEventListener("input", function (e) {
  speedMultiplier = Math.max(0.2, parseFloat(e.target.value) || 1);
  updateLabels();
});

updateRateInput.addEventListener("input", function (e) {
  refreshMs = Math.max(80, parseInt(e.target.value, 10) || 220);
  updateLabels();
});

toggleButton.addEventListener("click", function () {
  if (running) {
    stopCamera();
  } else {
    startCamera();
  }
});

window.addEventListener("resize", resizeCanvas);

updateLabels();
resizeCanvas();
requestAnimationFrame(renderFrame);
