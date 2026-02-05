const canvas = document.getElementById("curveCanvas");
const ctx = canvas?.getContext("2d", { alpha: true, desynchronized: true });

const coordinatesField = document.getElementById("coordinatesField");
const pointCountSlider = document.getElementById("pointCountSlider");
const pointCountValue = document.getElementById("pointCountValue");
const resetPointsBtn = document.getElementById("resetPointsBtn");
const toggleOriginalBtn = document.getElementById("toggleOriginalBtn");
const toggleElevatedBtn = document.getElementById("toggleElevatedBtn");
const controlHint = document.getElementById("controlHint");
const elevationInfo = document.getElementById("elevationInfo");
const elevationSlider = document.getElementById("elevationSlider");
const elevationValue = document.getElementById("elevationValue");
const heroPageButtons = document.querySelectorAll("[data-target-page]");
const pageSections = document.querySelectorAll("[data-page]");

const palette = {
  controlPolygon: "#111111",
  controlPoint: "#111111",
  controlPointOutline: "#e0e0e0",
  baseCurve: "#111111",
  elevatedPolygon: "rgba(244, 194, 194, 0.9)",
  elevatedCurveSteps: [
    "rgba(255, 182, 193, 0.95)",
    "rgba(248, 180, 193, 0.9)",
    "rgba(244, 194, 194, 0.85)",
    "rgba(240, 180, 190, 0.8)",
  ],
  elevatedPoint: "#d48a8a",
  highlight: "#f5f5f5",
  grid: "rgba(0, 0, 0, 0.08)",
  hover: "#f0f0f0",
};

const state = {
  points: [],
  elevationHistory: [],
  showOriginal: true,
  showElevated: true,
  draggingIndex: null,
  hoverIndex: null,
  activePage: "playground",
  elevationLevel: 0,
};

function init() {
  if (!canvas || !ctx) {
    console.warn("Canvas или ключов DOM елемент липсва. Инициализацията е прекратена.");
    return;
  }

  canvas.style.touchAction = "none";

  bindUI();
  syncPointsToCount(4);
  render();
  initPageNavigation();
}

const MAX_ELEVATION_LEVEL = Math.max(
  0,
  Number(elevationSlider?.max ?? 5)
);

function bindUI() {
  pointCountSlider?.addEventListener("input", handlePointCountChange);
  resetPointsBtn?.addEventListener("click", handleResetPoints);
  toggleOriginalBtn?.addEventListener("click", handleToggleOriginal);
  toggleElevatedBtn?.addEventListener("click", handleToggleElevated);
  elevationSlider?.addEventListener("input", handleElevationSliderChange);

  canvas?.addEventListener("pointerdown", handlePointerDown);
  canvas?.addEventListener("pointermove", handlePointerMove);
  canvas?.addEventListener("pointerup", handlePointerUp);
  canvas?.addEventListener("pointerleave", handlePointerLeave);
  canvas?.addEventListener("pointercancel", handlePointerUp);

  window.addEventListener("resize", () => {
    renderCanvas();
  });

  window.addEventListener("hashchange", handleHashChange);
}

function createDefaultPoints(count) {
  const width = canvas?.width ?? 1400;
  const height = canvas?.height ?? 900;
  const pts = [];
  for (let i = 0; i < count; i += 1) {
    const t = count > 1 ? i / (count - 1) : 0;
    pts.push({
      x: width * (0.1 + 0.8 * t),
      y: height * (0.8 - 0.6 * t),
    });
  }
  return pts;
}

function segmentLengthSq(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

function insertPointAtLongestSegment() {
  const pts = state.points;
  if (pts.length < 2) return;

  let maxLenSq = 0;
  let bestIdx = 0;

  for (let i = 0; i < pts.length - 1; i += 1) {
    const lenSq = segmentLengthSq(pts[i], pts[i + 1]);
    if (lenSq > maxLenSq) {
      maxLenSq = lenSq;
      bestIdx = i;
    }
  }

  const a = pts[bestIdx];
  const b = pts[bestIdx + 1];
  const mid = {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };

  state.points = [
    ...pts.slice(0, bestIdx + 1),
    mid,
    ...pts.slice(bestIdx + 1),
  ];
}

function syncPointsToCount(targetCount) {
  const n = Math.max(2, Math.min(16, Math.round(targetCount)));
  const current = state.points.length;

  if (n === current) return;

  if (n < current) {
    state.points = state.points.slice(0, n);
  } else {
    while (state.points.length < n) {
      const len = state.points.length;
      if (len < 2) {
        state.points = createDefaultPoints(n);
        break;
      }
      insertPointAtLongestSegment();
    }
  }

  if (pointCountSlider) pointCountSlider.value = String(state.points.length);
  if (pointCountValue) pointCountValue.textContent = String(state.points.length);
  rebuildElevationsForCurrentLevel();
}

function handlePointCountChange(evt) {
  const target = Number(evt.currentTarget?.value ?? 4);
  syncPointsToCount(target);
  render();
}

function handleResetPoints() {
  const count = 4;
  state.points = createDefaultPoints(count);
  if (pointCountSlider) pointCountSlider.value = String(count);
  if (pointCountValue) pointCountValue.textContent = String(count);
  rebuildElevationsForCurrentLevel();
  render();
}

function handleToggleOriginal() {
  state.showOriginal = !state.showOriginal;
  render();
}

function handleToggleElevated() {
  state.showElevated = !state.showElevated;
  render();
}

function handlePointerDown(evt) {
  if (!canvas) return;
  const pos = getCanvasCoordinates(evt);
  if (!pos) return;

  const index = findNearestPoint(pos, 24);
  if (index !== -1) {
    state.draggingIndex = index;
    canvas.classList.add("canvas--dragging");
    canvas.setPointerCapture(evt.pointerId);
    state.hoverIndex = index;
  } else {
    state.draggingIndex = null;
  }
  renderCanvas();
}

function handlePointerMove(evt) {
  if (!canvas) return;
  const pos = getCanvasCoordinates(evt);
  if (!pos) return;

  if (state.draggingIndex !== null) {
    state.points[state.draggingIndex] = clampPoint(pos);
    rebuildElevationsForCurrentLevel();
    render();
    return;
  }

  const hover = findNearestPoint(pos, 20);
  if (hover !== state.hoverIndex) {
    state.hoverIndex = hover;
    renderCanvas();
  }
}

function handlePointerUp(evt) {
  if (!canvas) return;
  if (state.draggingIndex !== null && canvas.hasPointerCapture(evt.pointerId)) {
    canvas.releasePointerCapture(evt.pointerId);
  }
  state.draggingIndex = null;
  canvas.classList.remove("canvas--dragging");
  render();
}

function handlePointerLeave() {
  state.hoverIndex = null;
  if (state.draggingIndex !== null) {
    state.draggingIndex = null;
    canvas?.classList.remove("canvas--dragging");
  }
  render();
}

function rebuildElevationsForCurrentLevel() {
  if (state.points.length < 2) {
    state.elevationLevel = 0;
    state.elevationHistory = [];
    return;
  }

  const level = Math.max(
    0,
    Math.min(MAX_ELEVATION_LEVEL, Math.round(state.elevationLevel))
  );
  state.elevationLevel = level;

  const history = [];
  let currentPolygon = state.points;

  for (let i = 0; i < level; i += 1) {
    currentPolygon = elevateBezierPolygon(currentPolygon);
    history.push(currentPolygon);
  }

  state.elevationHistory = history;
}

function setElevationLevel(level, { skipSliderUpdate = false } = {}) {
  const desired = Math.max(0, Math.min(MAX_ELEVATION_LEVEL, Math.round(level)));
  state.elevationLevel = desired;
  rebuildElevationsForCurrentLevel();

  const effectiveLevel = state.elevationLevel;
  const shouldSkipSlider = skipSliderUpdate && effectiveLevel === desired;

  updateElevationUI({ skipSlider: shouldSkipSlider });
  updateButtonStates();
  renderCanvas();
}

function handleElevationSliderChange(evt) {
  const target = evt.currentTarget;
  if (!target) return;
  const nextLevel = Number(target.value);
  setElevationLevel(nextLevel, { skipSliderUpdate: true });
}

function updateElevationUI({ skipSlider = false } = {}) {
  if (elevationSlider && !skipSlider) {
    const sliderValue = String(state.elevationLevel);
    if (elevationSlider.value !== sliderValue) {
      elevationSlider.value = sliderValue;
    }
  }

  if (elevationValue) {
    elevationValue.textContent = String(state.elevationLevel);
  }

  updateElevationInfo();
}

function getCanvasCoordinates(evt) {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;

  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (evt.clientX - rect.left) * scaleX,
    y: (evt.clientY - rect.top) * scaleY,
  };
}

function clampPoint(point) {
  if (!canvas) return point;
  return {
    x: Math.min(Math.max(point.x, 0), canvas.width),
    y: Math.min(Math.max(point.y, 0), canvas.height),
  };
}

function findNearestPoint(position, radius) {
  const rSquared = radius * radius;
  for (let i = 0; i < state.points.length; i += 1) {
    const dx = state.points[i].x - position.x;
    const dy = state.points[i].y - position.y;
    if (dx * dx + dy * dy <= rSquared) {
      return i;
    }
  }
  return -1;
}

function elevateBezierPolygon(points) {
  const n = points.length - 1;
  if (n < 1) return points.slice();
  const elevated = new Array(n + 2);
  elevated[0] = { ...points[0] };
  elevated[n + 1] = { ...points[n] };

  for (let i = 1; i <= n; i += 1) {
    const alpha = i / (n + 1);
    const prev = points[i - 1];
    const current = points[i];
    elevated[i] = {
      x: alpha * prev.x + (1 - alpha) * current.x,
      y: alpha * prev.y + (1 - alpha) * current.y,
    };
  }

  return elevated;
}

function render() {
  renderCanvas();
  if (state.activePage === "playground") {
    renderCoordinatesField();
  }
  updateButtonStates();
  updateElevationUI();
}

function initPageNavigation() {
  if (!heroPageButtons.length || !pageSections.length) {
    return;
  }

  heroPageButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.targetPage;
      if (target) {
        setActivePage(target);
      }
    });
  });

  const initial = getInitialPage();
  setActivePage(initial);
}

function getInitialPage() {
  const hashPage = window.location.hash.replace("#", "");
  if (isValidPage(hashPage)) {
    return hashPage;
  }
  return state.activePage;
}

function handleHashChange() {
  const hashPage = window.location.hash.replace("#", "");
  if (isValidPage(hashPage) && hashPage !== state.activePage) {
    setActivePage(hashPage, { updateHash: false });
  }
}

function isValidPage(page) {
  if (!page) return false;
  return Array.from(pageSections).some(
    (section) => section.dataset.page === page
  );
}

function setActivePage(page, { updateHash = true } = {}) {
  if (!isValidPage(page)) return;
  state.activePage = page;

  pageSections.forEach((section) => {
    const isActive = section.dataset.page === page;
    section.classList.toggle("is-hidden", !isActive);
    section.setAttribute("aria-hidden", String(!isActive));
  });

  heroPageButtons.forEach((button) => {
    const isActive = button.dataset.targetPage === page;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  if (page === "playground") {
    render();
  }

  if (updateHash && window.location.hash !== `#${page}`) {
    window.history.replaceState(null, "", `#${page}`);
  }
}

function renderCanvas() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  if (state.showOriginal) {
    drawControlPolygon(state.points);
    drawBezierCurve(state.points, palette.baseCurve, 3.5);
    drawControlPoints(state.points, {
      color: palette.controlPoint,
      outline: palette.controlPointOutline,
      highlight: palette.hover,
      hoverIndex: state.hoverIndex,
      activeIndex: state.draggingIndex,
      radius: 10,
    });
  }

  if (state.showElevated && state.elevationHistory.length > 0) {
    state.elevationHistory.forEach((elevatedPoints, index) => {
      const color =
        palette.elevatedCurveSteps[index] ??
        palette.elevatedCurveSteps[palette.elevatedCurveSteps.length - 1];
      drawControlPolygon(elevatedPoints, palette.elevatedPolygon, [6, 6]);
      drawBezierCurve(elevatedPoints, color, 2.5);
      drawControlPoints(elevatedPoints, {
        color: palette.elevatedPoint,
        outline: palette.controlPointOutline,
        radius: 8,
      });
    });
  }
}

function drawGrid() {
  if (!ctx || !canvas) return;
  const spacing = 60;
  ctx.save();
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 16]);

  for (let x = spacing; x < canvas.width; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  for (let y = spacing; y < canvas.height; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawControlPolygon(points, strokeStyle = palette.controlPolygon, dash) {
  if (!ctx || points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  if (dash) {
    ctx.setLineDash(dash);
  } else {
    ctx.setLineDash([10, 8]);
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawBezierCurve(points, strokeStyle, width = 3) {
  if (!ctx || points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const segments = Math.max(40, points.length * 40);
  const step = 1 / segments;

  const start = deCasteljau(points, 0);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);

  for (let t = step; t <= 1 + step; t += step) {
    const clampedT = t > 1 ? 1 : t;
    const { x, y } = deCasteljau(points, clampedT);
    ctx.lineTo(x, y);
  }

  ctx.stroke();
  ctx.restore();
}

function drawControlPoints(
  points,
  { color, outline, highlight, radius = 10, hoverIndex = -1, activeIndex = -1 } = {}
) {
  if (!ctx) return;
  ctx.save();
  ctx.font = "20px 'Poppins', 'Segoe UI', Tahoma, sans-serif";
  ctx.textBaseline = "middle";

  points.forEach((pt, index) => {
    const isActive = index === activeIndex;
    const isHover = index === hoverIndex;
    const r = isActive ? radius + 3 : isHover ? radius + 2 : radius;

    if (highlight && (isActive || isHover)) {
      ctx.fillStyle = highlight;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r + 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
    ctx.fill();

    if (outline) {
      ctx.strokeStyle = outline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillText(`P${index}`, pt.x + r + 8, pt.y);
  });

  ctx.restore();
}

function deCasteljau(points, t) {
  let temp = points.map((p) => ({ x: p.x, y: p.y }));

  for (let r = 1; r < temp.length; r += 1) {
    for (let i = 0; i < temp.length - r; i += 1) {
      temp[i] = {
        x: (1 - t) * temp[i].x + t * temp[i + 1].x,
        y: (1 - t) * temp[i].y + t * temp[i + 1].y,
      };
    }
  }

  return temp[0];
}

function renderCoordinatesField() {
  if (!coordinatesField) return;
  const lines = state.points.map(
    (p, i) => `P${i}: (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`
  );
  coordinatesField.textContent = lines.length > 0 ? lines.join("\n") : "";
}

function updateButtonStates() {
  const canElevate = state.points.length >= 2;
  const hasElevations = state.elevationHistory.length > 0;

  if (elevationSlider) {
    elevationSlider.disabled = !canElevate;
  }

  if (toggleOriginalBtn) {
    toggleOriginalBtn.textContent = state.showOriginal
      ? "Скрий оригиналната крива"
      : "Покажи оригиналната крива";
  }

  if (toggleElevatedBtn) {
    const toggleEnabled = canElevate && hasElevations;
    toggleElevatedBtn.disabled = !toggleEnabled;
    toggleElevatedBtn.textContent = state.showElevated
      ? "Скрий повишената крива"
      : "Покажи повишената крива";
  }
}

function updateElevationInfo() {
  if (!elevationInfo) return;
  const baseDegree = Math.max(state.points.length - 1, 0);
  const steps = state.elevationHistory.length;

  if (steps === 0) {
    elevationInfo.textContent = `Базова степен: ${baseDegree}. Използвай слайдъра, за да зададеш степен на повишаване.`;
    return;
  }

  const elevatedDegree = baseDegree + steps;
  elevationInfo.textContent = `Базова степен: ${baseDegree}. Повишения: ${steps}. Текуща степен: ${elevatedDegree}.`;
}

window.addEventListener("DOMContentLoaded", init);
