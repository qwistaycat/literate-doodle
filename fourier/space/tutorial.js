// Guided tour of the epicycle playground.
//
// Each step highlights either a DOM control (by selector) or a region the sketch
// draws itself (by name, resolved through getTutorialTargetRect). The spotlight
// tracks its target every frame so it stays aligned when the pane divider moves
// or the window resizes. Every step also mimes its gesture with a looping hand.

var TUTORIAL_STEPS = [
  {
    title: "Pick a drawing, pick a depth",
    body: "Choose an image, then set how many Fourier terms get summed. Low counts give a blurry silhouette; each extra term adds finer detail.",
    selectors: ["#drawing-select", "#epicycle-slider", "#epicycle-slider-value"],
    placement: "below",
    gestures: [{ type: "drag-x", label: "Drag the slider to add or drop terms" }]
  },
  {
    title: "The epicycle chain",
    body: "Every circle is one term of the sum, drawn tip-to-tail. The end of the last arm traces the picture. Scroll to zoom, and drag up or down on empty space to nudge every amplitude at once.",
    region: "epicycleCanvas",
    placement: "right",
    gestures: [
      { type: "scroll", label: "Scroll to zoom in and out" },
      { type: "drag-y", label: "Drag up or down to resize every arm" }
    ]
  },
  {
    title: "The same drawing, as a wave",
    body: "The right panel shows those terms summed into one signal over a full loop. Drag left and right across it to scrub through time by hand.",
    region: "sinePlot",
    placement: "below",
    gestures: [{ type: "drag-x", label: "Swipe across to scrub through time" }]
  },
  {
    title: "The frequency spectrum",
    body: "One bar per term, low frequencies on the left. There are thousands of them, so the chart shows a window at a time. Scroll over it to zoom in until the bars separate, and shift-scroll to slide the window along. The label on the right says which terms you are looking at.",
    region: "barChart",
    placement: "above",
    gestures: [{ type: "bars-zoom", label: "Scroll over the chart to zoom in on the bars" }]
  },
  {
    title: "Select one bar, or a whole range",
    body: "Click a bar to select that ring \u2014 the whole column counts, so even the quiet terms are easy to hit. Drag sideways to sweep out a range, or hold Shift or \u2318 and click to add bars one at a time.",
    region: "barChart",
    placement: "above",
    gestures: [
      { type: "bars-tap", label: "Click a bar to select that one ring" },
      { type: "bars-range", label: "Drag sideways to select every bar you cross" }
    ]
  },
  {
    title: "Drag the selection taller or shorter",
    body: "With bars selected, drag up or down on the chart to scale their amplitudes together. Taller bars mean bigger circles, and the drawing stretches with them. Every bar is also tinted by its phase offset, so red means untouched.",
    region: "barChart",
    placement: "above",
    gestures: [{ type: "bars-height", label: "Drag up or down to change their height" }]
  },
  {
    title: "Shift the phase",
    body: "With a ring selected, this wheel sets where that circle starts its rotation. Drag around it to rotate that one frequency out of step with the rest \u2014 its bar in the spectrum changes hue to match.",
    region: "phaseWheel",
    placement: "left",
    gestures: [{ type: "rotate", label: "Drag around the wheel to shift phase" }],
    onEnter: function () {
      if (typeof tutorialSelectSampleRing === "function") tutorialSelectSampleRing();
    }
  },
  {
    title: "Change the view",
    body: "Flip to a 3D stack of parameter slices, reveal the path progressively instead of all at once, or hide the circles to see the line art on its own.",
    selectors: ["#toggle-view-mode", "#toggle-path-mode", "#toggle-epicycles"],
    placement: "below",
    gestures: [{ type: "tap", label: "Tap to switch how it is drawn" }]
  },
  {
    title: "Start over any time",
    body: "Reset Changes puts every amplitude and phase back where it started, so experiment freely.",
    selectors: ["#reset-play"],
    placement: "below",
    gestures: [{ type: "tap", label: "Tap to undo every edit" }]
  },
  {
    title: "How it all works",
    body: "The full write-up covers the edge detection, skeleton tracing, and the transform behind all of this.",
    selectors: ["#medium-link"],
    placement: "above",
    gestures: [{ type: "tap", label: "Tap to open the write-up" }]
  }
];

// How long each hand animation holds before a multi-gesture step shows the next one.
var GESTURE_CYCLE_MS = 3400;

// How long the page stays dimmed around the Tutorial button on load.
var INTRO_HOLD_MS = 3200;

var tutorialIndex = -1;
var tutorialActive = false;
var tutorialFrame = 0;
var tutorialEls = null;
var gestureList = null;
var gestureCursor = 0;
var gestureTimer = 0;

function unionRect(rects) {
  var usable = rects.filter(function (r) {
    return r && r.width > 0 && r.height > 0;
  });
  if (usable.length === 0) return null;

  var left = Math.min.apply(null, usable.map(function (r) { return r.left; }));
  var top = Math.min.apply(null, usable.map(function (r) { return r.top; }));
  var right = Math.max.apply(null, usable.map(function (r) { return r.left + r.width; }));
  var bottom = Math.max.apply(null, usable.map(function (r) { return r.top + r.height; }));
  return { left: left, top: top, width: right - left, height: bottom - top };
}

function getStepRect(step) {
  if (step.selectors) {
    return unionRect(step.selectors.map(function (sel) {
      var el = document.querySelector(sel);
      return el ? el.getBoundingClientRect() : null;
    }));
  }

  if (step.region && typeof getTutorialTargetRect === "function") {
    return getTutorialTargetRect(step.region);
  }

  return null;
}

// Keep the popup beside its target where there is room, and inside the viewport always.
function placePopup(popup, rect, preferred) {
  var margin = 12;
  var gap = 14;
  var pw = popup.offsetWidth;
  var ph = popup.offsetHeight;
  var vw = window.innerWidth;
  var vh = window.innerHeight;

  var fits = {
    below: rect.top + rect.height + gap + ph <= vh - margin,
    above: rect.top - gap - ph >= margin,
    right: rect.left + rect.width + gap + pw <= vw - margin,
    left: rect.left - gap - pw >= margin
  };

  var order = [preferred, "below", "above", "right", "left"];
  var side = order.find(function (candidate) { return candidate && fits[candidate]; }) || "below";

  var left;
  var top;
  if (side === "below" || side === "above") {
    left = rect.left + rect.width / 2 - pw / 2;
    top = side === "below" ? rect.top + rect.height + gap : rect.top - gap - ph;
  } else {
    left = side === "right" ? rect.left + rect.width + gap : rect.left - gap - pw;
    top = rect.top + rect.height / 2 - ph / 2;
  }

  popup.style.left = Math.round(Math.max(margin, Math.min(vw - pw - margin, left))) + "px";
  popup.style.top = Math.round(Math.max(margin, Math.min(vh - ph - margin, top))) + "px";
  popup.setAttribute("data-side", side);
}

function syncTutorialPosition() {
  if (!tutorialActive) return;

  var step = TUTORIAL_STEPS[tutorialIndex];
  var rect = getStepRect(step);

  if (rect) {
    tutorialEls.spotlight.style.opacity = "1";
    tutorialEls.spotlight.style.left = Math.round(rect.left) + "px";
    tutorialEls.spotlight.style.top = Math.round(rect.top) + "px";
    tutorialEls.spotlight.style.width = Math.round(rect.width) + "px";
    tutorialEls.spotlight.style.height = Math.round(rect.height) + "px";
    placePopup(tutorialEls.popup, rect, step.placement);
  } else {
    // Target not on screen yet (a region the sketch has not drawn). Dim everything
    // and centre the popup rather than pointing at nothing.
    tutorialEls.spotlight.style.opacity = "0";
    placePopup(tutorialEls.popup, {
      left: window.innerWidth / 2,
      top: window.innerHeight / 2,
      width: 0,
      height: 0
    }, "below");
  }

  tutorialFrame = window.requestAnimationFrame(syncTutorialPosition);
}

function applyGesture() {
  var gesture = gestureList[gestureCursor];
  // The data attribute picks which keyframes run, so setting it restarts the loop.
  tutorialEls.gesture.setAttribute("data-gesture", gesture.type);
  tutorialEls.gestureLabel.textContent = gesture.label;
}

// A step can mime more than one gesture; those take turns while the step is up.
function setStepGestures(gestures) {
  window.clearInterval(gestureTimer);

  if (!gestures || gestures.length === 0) {
    tutorialEls.gesture.hidden = true;
    return;
  }

  tutorialEls.gesture.hidden = false;
  gestureList = gestures;
  gestureCursor = 0;
  applyGesture();

  if (gestures.length > 1) {
    gestureTimer = window.setInterval(function () {
      gestureCursor = (gestureCursor + 1) % gestureList.length;
      applyGesture();
    }, GESTURE_CYCLE_MS);
  }
}

function showTutorialStep(index) {
  if (index < 0 || index >= TUTORIAL_STEPS.length) {
    endTutorial();
    return;
  }

  tutorialIndex = index;
  var step = TUTORIAL_STEPS[index];
  if (typeof step.onEnter === "function") step.onEnter();

  tutorialEls.title.textContent = step.title;
  tutorialEls.body.textContent = step.body;
  tutorialEls.counter.textContent = index + 1 + " / " + TUTORIAL_STEPS.length;
  tutorialEls.back.disabled = index === 0;
  tutorialEls.next.textContent = index === TUTORIAL_STEPS.length - 1 ? "Done" : "Next";
  setStepGestures(step.gestures);

  tutorialEls.dots.innerHTML = "";
  for (var d = 0; d < TUTORIAL_STEPS.length; d++) {
    var dot = document.createElement("span");
    dot.className = "tutorial-dot" + (d === index ? " is-active" : "");
    tutorialEls.dots.appendChild(dot);
  }

  tutorialEls.next.focus();
}

function startTutorial(fromIndex) {
  if (!tutorialEls) return;
  tutorialActive = true;
  tutorialEls.root.classList.add("is-active");
  tutorialEls.root.setAttribute("aria-hidden", "false");
  showTutorialStep(typeof fromIndex === "number" ? fromIndex : 0);
  window.cancelAnimationFrame(tutorialFrame);
  syncTutorialPosition();
}

function endTutorial() {
  tutorialActive = false;
  tutorialIndex = -1;
  window.cancelAnimationFrame(tutorialFrame);
  window.clearInterval(gestureTimer);
  if (!tutorialEls) return;
  tutorialEls.root.classList.remove("is-active");
  tutorialEls.root.setAttribute("aria-hidden", "true");
  if (typeof pointerOverOverlayUI !== "undefined") pointerOverOverlayUI = false;
}

// On load, dim the page down to the Tutorial button and pulse it, so the tour is
// offered rather than forced. Any click or keypress dismisses it early.
function playTutorialIntro() {
  var ring = document.getElementById("intro-highlight");
  var button = document.getElementById("start-tutorial");
  if (!ring || !button) return;

  function position() {
    var r = button.getBoundingClientRect();
    var pad = 6;
    ring.style.left = Math.round(r.left - pad) + "px";
    ring.style.top = Math.round(r.top - pad) + "px";
    ring.style.width = Math.round(r.width + pad * 2) + "px";
    ring.style.height = Math.round(r.height + pad * 2) + "px";
  }

  var timer = 0;
  function finish() {
    window.clearTimeout(timer);
    window.removeEventListener("resize", position);
    document.removeEventListener("pointerdown", finish);
    document.removeEventListener("keydown", finish);
    ring.classList.remove("is-on");
    button.classList.remove("is-inviting");
  }

  position();
  window.addEventListener("resize", position);

  // Next frame, so the fade actually transitions from the undimmed page.
  window.requestAnimationFrame(function () {
    ring.classList.add("is-on");
    button.classList.add("is-inviting");
  });

  timer = window.setTimeout(finish, INTRO_HOLD_MS);
  document.addEventListener("pointerdown", finish);
  document.addEventListener("keydown", finish);
}

function setupTutorial() {
  var root = document.getElementById("tutorial");
  if (!root) return;

  tutorialEls = {
    root: root,
    spotlight: document.getElementById("tutorial-spotlight"),
    popup: document.getElementById("tutorial-popup"),
    title: document.getElementById("tutorial-title"),
    body: document.getElementById("tutorial-body"),
    counter: document.getElementById("tutorial-counter"),
    dots: document.getElementById("tutorial-dots"),
    back: document.getElementById("tutorial-back"),
    next: document.getElementById("tutorial-next"),
    skip: document.getElementById("tutorial-skip"),
    gesture: document.getElementById("tutorial-gesture"),
    gestureLabel: document.getElementById("tutorial-gesture-label")
  };

  if (typeof registerOverlayElement === "function") {
    registerOverlayElement(tutorialEls.popup);
  }

  tutorialEls.next.addEventListener("click", function () {
    showTutorialStep(tutorialIndex + 1);
  });
  tutorialEls.back.addEventListener("click", function () {
    if (tutorialIndex > 0) showTutorialStep(tutorialIndex - 1);
  });
  tutorialEls.skip.addEventListener("click", endTutorial);

  var replay = document.getElementById("start-tutorial");
  if (replay) {
    replay.addEventListener("click", function () {
      startTutorial(0);
    });
  }

  document.addEventListener("keydown", function (e) {
    if (!tutorialActive) return;
    var tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

    if (e.key === "Escape") {
      endTutorial();
    } else if (e.key === "ArrowRight") {
      showTutorialStep(tutorialIndex + 1);
    } else if (e.key === "ArrowLeft" && tutorialIndex > 0) {
      showTutorialStep(tutorialIndex - 1);
    }
  });

  playTutorialIntro();
}
