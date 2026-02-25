// Parse SVG text into an array of {x, y} points
function parseSVGText(svgText) {
  console.log("Parsing SVG, length:", svgText.length);

  // Inject SVG into a hidden container so browser measurement APIs work
  var container = document.createElement("div");
  container.id = "svg-container";
  container.style.cssText = "position:absolute;visibility:hidden;width:0;height:0;overflow:hidden;";
  document.body.appendChild(container);
  container.innerHTML = svgText;

  var svgEl = container.querySelector("svg");
  if (!svgEl) {
    console.error("No <svg> element found in SVG text");
    document.body.removeChild(container);
    return [];
  }

  // Log what elements are inside the SVG
  console.log("SVG children:");
  svgEl.querySelectorAll("*").forEach(function (el) {
    console.log("  <" + el.tagName + ">", Array.from(el.attributes).map(function(a){ return a.name; }).join(", "));
  });

  var points = [];

  // Collect all drawable elements in document order
  // so bridges only appear between truly disconnected segments
  var allElements = svgEl.querySelectorAll("path, polyline, polygon, line, circle, rect");
  console.log("Found drawable elements:", allElements.length);

  var segments = [];

  allElements.forEach(function (el) {
    var tag = el.tagName.toLowerCase();

    if (tag === "path") {
      try {
        var totalLength = el.getTotalLength();
        var numSamples = Math.max(100, Math.round(totalLength));
        var seg = [];
        for (var i = 0; i < numSamples; i++) {
          var pt = el.getPointAtLength((i / numSamples) * totalLength);
          seg.push({ x: pt.x, y: pt.y });
        }
        if (seg.length > 0) segments.push(seg);
      } catch (e) {
        console.error("Error sampling path:", e);
      }
    }

    else if (tag === "polyline" || tag === "polygon") {
      var raw = el.getAttribute("points");
      if (raw) {
        var seg = [];
        var nums = raw.trim().split(/[\s,]+/).map(Number);
        for (var i = 0; i < nums.length - 1; i += 2) {
          if (!isNaN(nums[i]) && !isNaN(nums[i + 1])) {
            seg.push({ x: nums[i], y: nums[i + 1] });
          }
        }
        if (seg.length > 0) segments.push(seg);
      }
    }

    else if (tag === "line") {
      var x1 = parseFloat(el.getAttribute("x1"));
      var y1 = parseFloat(el.getAttribute("y1"));
      var x2 = parseFloat(el.getAttribute("x2"));
      var y2 = parseFloat(el.getAttribute("y2"));
      var dist = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
      var steps = Math.max(5, Math.round(dist));
      var seg = [];
      for (var t = 0; t <= steps; t++) {
        var frac = t / steps;
        seg.push({ x: x1 + (x2 - x1) * frac, y: y1 + (y2 - y1) * frac });
      }
      if (seg.length > 0) segments.push(seg);
    }

    else if (tag === "circle") {
      var ccx = parseFloat(el.getAttribute("cx")) || 0;
      var ccy = parseFloat(el.getAttribute("cy")) || 0;
      var r = parseFloat(el.getAttribute("r")) || 0;
      var seg = [];
      for (var i = 0; i < 100; i++) {
        var angle = (i / 100) * Math.PI * 2;
        seg.push({ x: ccx + r * Math.cos(angle), y: ccy + r * Math.sin(angle) });
      }
      if (seg.length > 0) segments.push(seg);
    }

    else if (tag === "rect") {
      var rx = parseFloat(el.getAttribute("x")) || 0;
      var ry = parseFloat(el.getAttribute("y")) || 0;
      var rw = parseFloat(el.getAttribute("width")) || 0;
      var rh = parseFloat(el.getAttribute("height")) || 0;
      var perimeter = 2 * (rw + rh);
      var steps = Math.max(40, Math.round(perimeter));
      var seg = [];
      for (var i = 0; i < steps; i++) {
        var d = (i / steps) * perimeter;
        var px, py;
        if (d < rw) { px = rx + d; py = ry; }
        else if (d < rw + rh) { px = rx + rw; py = ry + (d - rw); }
        else if (d < 2 * rw + rh) { px = rx + rw - (d - rw - rh); py = ry + rh; }
        else { px = rx; py = ry + rh - (d - 2 * rw - rh); }
        seg.push({ x: px, y: py });
      }
      if (seg.length > 0) segments.push(seg);
    }
  });

  // Connect segments with bridge points (pen-up moves)
  for (var s = 0; s < segments.length; s++) {
    if (s > 0 && points.length > 0) {
      var lastPt = points[points.length - 1];
      var firstPt = segments[s][0];
      var dx = firstPt.x - lastPt.x;
      var dy = firstPt.y - lastPt.y;
      var bridgeSteps = Math.max(5, Math.round(Math.sqrt(dx * dx + dy * dy) / 2));
      for (var b = 1; b <= bridgeSteps; b++) {
        var frac = b / bridgeSteps;
        points.push({ x: lastPt.x + dx * frac, y: lastPt.y + dy * frac, bridge: true });
      }
    }
    for (var p = 0; p < segments[s].length; p++) {
      points.push(segments[s][p]);
    }
  }
  console.log("Segments:", segments.length, "Total points (with bridges):", points.length);

  // Clean up the hidden container
  document.body.removeChild(container);

  return points;
}

// Fetch svg from the server and parse it
function loadSVGToDrawing(callback) {
  fetch("heatedvpype.svg?t=" + Date.now())
    .then(function (response) {
      if (!response.ok) throw new Error("Could not load svg: " + response.status);
      return response.text();
    })
    .then(function (svgText) {
      var points = parseSVGText(svgText);
      if (callback) callback(points);
    })
    .catch(function (err) {
      console.error("Error loading SVG:", err);
      console.error("Make sure you run a local server: python3 -m http.server 8000");
      if (callback) callback([]);
    });
}

// Parse an SVG from a File object (for upload)
function loadSVGFromFile(file, callback) {
  var reader = new FileReader();
  reader.onload = function (e) {
    var points = parseSVGText(e.target.result);
    if (callback) callback(points);
  };
  reader.readAsText(file);
}