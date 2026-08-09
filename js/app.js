(() => {
  const B = window.TouchBehaviors;
  const paintCanvas = document.getElementById('paintCanvas');
  const liveCanvas = document.getElementById('liveCanvas');
  const stage = document.getElementById('stage');
  const paint = paintCanvas.getContext('2d', { alpha: false });
  const live = liveCanvas.getContext('2d');
  const hint = document.getElementById('touchHint');

  const app = {
    state: {
      color: '#e53935',
      size: 16,
      hue: 0,
      behaviors: { cycle: true, connect: false, echo: false, scatter: false, flow: false, bloom: false, spray: false, offset: false, mirror: false, radial: false, drift: false, orbit: false }
    },
    canvasSpec: { mode: 'responsive', width: null, height: null },
    activeTouches: new Map(),
    particles: [],
    echoQueue: [],
    orbitPhase: 0,
    session: null,
    cssWidth: 1,
    cssHeight: 1,
    dpr: 1,
    dirty: false,
    lastFrame: performance.now(),

    paintMark(mark, allowEcho = true) {
      for (const m of B.transformMarks(this, mark)) drawMark(paint, m, this);
      if (allowEcho) B.scheduleEchoes(this, mark);
      this.dirty = true;
    }
  };

  function beginSession() {
    app.session = {
      format: 'touch-instrument-session',
      version: 1,
      engineVersion: '1.4.0',
      startedAt: new Date().toISOString(),
      initialCanvas: { width: app.cssWidth, height: app.cssHeight, spec: { ...app.canvasSpec } },
      events: []
    };
    record('config', { state: snapshotState() });
  }

  function snapshotState() {
    return {
      color: app.state.color,
      size: app.state.size,
      behaviors: { ...app.state.behaviors },
      canvas: { ...app.canvasSpec }
    };
  }

  function record(type, data = {}) {
    if (!app.session) return;
    app.session.events.push({
      t: Math.round(performance.now() - sessionPerfStart),
      type,
      ...data
    });
  }

  let sessionPerfStart = performance.now();

  function normalizedPoint(x, y) {
    return { x: +(x / app.cssWidth).toFixed(5), y: +(y / app.cssHeight).toFixed(5) };
  }

  function canvasDisplayRect() {
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    if (app.canvasSpec.mode === 'responsive' || !app.canvasSpec.width || !app.canvasSpec.height) {
      return { width: rect.width, height: rect.height, left: 0, top: 0 };
    }
    const targetAspect = app.canvasSpec.width / app.canvasSpec.height;
    const stageAspect = rect.width / rect.height;
    let width, height;
    if (targetAspect > stageAspect) {
      width = rect.width;
      height = width / targetAspect;
    } else {
      height = rect.height;
      width = height * targetAspect;
    }
    return { width, height, left: (rect.width - width) / 2, top: (rect.height - height) / 2 };
  }

  function resizeCanvases({ preserve = true } = {}) {
    const display = canvasDisplayRect();
    if (!display) return;

    const old = document.createElement('canvas');
    old.width = paintCanvas.width;
    old.height = paintCanvas.height;
    if (old.width && old.height && preserve) old.getContext('2d').drawImage(paintCanvas, 0, 0);

    app.cssWidth = display.width;
    app.cssHeight = display.height;
    app.dpr = Math.min(2, window.devicePixelRatio || 1);

    for (const c of [paintCanvas, liveCanvas]) {
      c.width = Math.max(1, Math.round(display.width * app.dpr));
      c.height = Math.max(1, Math.round(display.height * app.dpr));
      c.style.width = `${display.width}px`;
      c.style.height = `${display.height}px`;
      c.style.left = `${display.left}px`;
      c.style.top = `${display.top}px`;
    }

    paint.setTransform(app.dpr, 0, 0, app.dpr, 0, 0);
    live.setTransform(app.dpr, 0, 0, app.dpr, 0, 0);
    paint.lineCap = paint.lineJoin = 'round';
    live.lineCap = live.lineJoin = 'round';

    paint.fillStyle = '#fff';
    paint.fillRect(0, 0, display.width, display.height);
    if (old.width && old.height && preserve) {
      paint.save();
      paint.setTransform(1, 0, 0, 1, 0, 0);
      paint.drawImage(old, 0, 0, old.width, old.height, 0, 0, paintCanvas.width, paintCanvas.height);
      paint.restore();
      app.dirty = true;
    }
  }

  function drawMark(ctx, mark, appRef) {
    ctx.save();
    ctx.globalAlpha = mark.alpha ?? 1;
    ctx.strokeStyle = B.resolveColor(appRef, mark.color);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = mark.width || appRef.state.size;
    if (mark.type === 'line') {
      ctx.beginPath();
      ctx.moveTo(mark.x1, mark.y1);
      ctx.lineTo(mark.x2, mark.y2);
      ctx.stroke();
    } else if (mark.type === 'dab') {
      ctx.beginPath();
      ctx.arc(mark.x, mark.y, (mark.width || appRef.state.size) / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function pointFromEvent(e) {
    const r = paintCanvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    return { x, y, inside: x >= 0 && y >= 0 && x <= r.width && y <= r.height };
  }

  function pointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    stage.setPointerCapture?.(e.pointerId);
    const p = pointFromEvent(e);
    if (!p.inside) return;
    const now = performance.now();
    const touch = { id: e.pointerId, x: p.x, y: p.y, px: p.x, py: p.y, time: now, ptime: now, speed: 0 };
    app.activeTouches.set(e.pointerId, touch);
    hint.classList.add('hidden');

    const dab = { type: 'dab', x: p.x, y: p.y, width: app.state.size, color: app.state.behaviors.cycle ? null : app.state.color };
    B.advanceHue(app, 2);
    app.paintMark(dab);
    record('down', { id: e.pointerId, ...normalizedPoint(p.x, p.y) });
    saveSoon();
  }

  function pointerMove(e) {
    const t = app.activeTouches.get(e.pointerId);
    if (!t) return;
    e.preventDefault();
    const p = pointFromEvent(e);
    const now = performance.now();
    t.px = t.x; t.py = t.y; t.ptime = t.time;
    t.x = p.x; t.y = p.y; t.time = now;
    const distance = Math.hypot(t.x - t.px, t.y - t.py);
    const dt = Math.max(1, t.time - t.ptime);
    t.speed = distance / dt * 1000;

    if (distance > 0.15) {
      B.advanceHue(app, distance);
      const mark = {
        type: 'line', x1: t.px, y1: t.py, x2: t.x, y2: t.y,
        width: app.state.size, color: app.state.behaviors.cycle ? null : app.state.color
      };
      app.paintMark(mark);

      if (app.state.behaviors.connect) {
        for (const other of app.activeTouches.values()) {
          if (other.id === t.id) continue;
          const connector = {
            type: 'line', x1: t.x, y1: t.y, x2: other.x, y2: other.y,
            width: Math.max(2, app.state.size * 0.58),
            color: app.state.behaviors.cycle ? null : app.state.color
          };
          B.advanceHue(app, Math.hypot(t.x - other.x, t.y - other.y), 0.05);
          app.paintMark(connector);
        }
      }

      B.scatterFromSegment(app, t, distance);
      B.sprayFromSegment(app, t, distance);
      B.bloomFromSegment(app, t, distance);
      B.driftFromSegment(app, t, distance);
      B.orbitFromSegment(app, t, distance);
      record('move', { id: e.pointerId, ...normalizedPoint(t.x, t.y) });
      saveSoon();
    }
  }

  function pointerUp(e) {
    const t = app.activeTouches.get(e.pointerId);
    if (!t) return;
    e.preventDefault();
    const p = pointFromEvent(e);
    record(e.type === 'pointercancel' ? 'cancel' : 'up', { id: e.pointerId, ...normalizedPoint(p.x, p.y) });
    app.activeTouches.delete(e.pointerId);
  }

  stage.addEventListener('pointerdown', pointerDown, { passive: false });
  stage.addEventListener('pointermove', pointerMove, { passive: false });
  stage.addEventListener('pointerup', pointerUp, { passive: false });
  stage.addEventListener('pointercancel', pointerUp, { passive: false });
  stage.addEventListener('contextmenu', e => e.preventDefault());

  function renderLive() {
    live.clearRect(0, 0, app.cssWidth, app.cssHeight);
    for (const t of app.activeTouches.values()) {
      live.save();
      live.strokeStyle = 'rgba(0,0,0,.18)';
      live.lineWidth = 2;
      live.beginPath();
      live.arc(t.x, t.y, Math.max(10, app.state.size * .75), 0, Math.PI * 2);
      live.stroke();
      live.restore();
    }
  }

  function processEchoes(now) {
    if (!app.echoQueue.length) return;
    const remain = [];
    for (const item of app.echoQueue) {
      if (item.at <= now) {
        const mark = { ...item.mark };
        if (app.state.behaviors.cycle) mark.color = null;
        app.paintMark(mark, false);
        B.advanceHue(app, 7, 0.5);
      } else remain.push(item);
    }
    app.echoQueue = remain;
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - app.lastFrame) / 1000);
    app.lastFrame = now;
    processEchoes(now);
    B.updateParticles(app, dt);
    renderLive();
    requestAnimationFrame(frame);
  }

  document.querySelectorAll('.behavior').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.behavior;
      app.state.behaviors[key] = !app.state.behaviors[key];
      btn.classList.toggle('active', app.state.behaviors[key]);
      btn.setAttribute('aria-pressed', String(app.state.behaviors[key]));
      record('behavior', { behavior: key, enabled: app.state.behaviors[key] });
    });
  });

  document.querySelectorAll('.swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.swatch').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
      btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true');
      app.state.color = btn.dataset.color;
      record('color', { color: app.state.color });
    });
  });

  document.querySelectorAll('.size').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.size').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
      btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true');
      app.state.size = Number(btn.dataset.size);
      record('size', { size: app.state.size });
    });
  });

  function clearCanvas(startNew = false) {
    paint.save();
    paint.setTransform(app.dpr, 0, 0, app.dpr, 0, 0);
    paint.fillStyle = '#fff';
    paint.fillRect(0, 0, app.cssWidth, app.cssHeight);
    paint.restore();
    app.particles = [];
    app.echoQueue = [];
    app.orbitPhase = 0;
    app.dirty = false;
    localStorage.removeItem('touch-instrument-image-v1');
    hint.classList.remove('hidden');
    if (startNew) {
      sessionPerfStart = performance.now();
      beginSession();
    } else record('clear');
  }

  document.getElementById('clearBtn').addEventListener('click', () => clearCanvas(false));

  const finishDialog = document.getElementById('finishDialog');
  const previewImage = document.getElementById('previewImage');
  document.getElementById('finishBtn').addEventListener('click', () => {
    saveDrawing();
    previewImage.src = exportCanvas().toDataURL('image/png');
    finishDialog.showModal();
    record('finish');
  });

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function exportCanvas() {
    if (app.canvasSpec.mode === 'responsive' || !app.canvasSpec.width || !app.canvasSpec.height) return paintCanvas;
    const out = document.createElement('canvas');
    out.width = app.canvasSpec.width;
    out.height = app.canvasSpec.height;
    const ctx = out.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(paintCanvas, 0, 0, out.width, out.height);
    return out;
  }

  function saveImageDownload(source = 'save-button') {
    saveDrawing();
    exportCanvas().toBlob(blob => {
      if (!blob) return;
      downloadBlob(blob, `touch-instrument-${timestampName()}.png`);
      record('download-image', { source });
    }, 'image/png');
  }

  document.getElementById('saveBtn').addEventListener('click', () => {
    saveImageDownload('save-button');
  });

  document.getElementById('downloadBtn').addEventListener('click', () => {
    saveImageDownload('finish-dialog');
  });

  document.getElementById('downloadSessionBtn').addEventListener('click', () => {
    const exportSession = { ...app.session, endedAt: new Date().toISOString(), finalState: snapshotState() };
    downloadBlob(new Blob([JSON.stringify(exportSession, null, 2)], { type: 'application/json' }), `touch-instrument-${timestampName()}.json`);
    record('download-session');
  });

  document.getElementById('newBtn').addEventListener('click', () => {
    finishDialog.close();
    clearCanvas(true);
  });

  const canvasDialog = document.getElementById('canvasDialog');
  const canvasPreset = document.getElementById('canvasPreset');
  const customSizeFields = document.getElementById('customSizeFields');
  const canvasWidthInput = document.getElementById('canvasWidthInput');
  const canvasHeightInput = document.getElementById('canvasHeightInput');
  const preserveCanvasCheck = document.getElementById('preserveCanvasCheck');

  function presetValueForSpec() {
    if (app.canvasSpec.mode === 'responsive') return 'responsive';
    const value = `${app.canvasSpec.width}x${app.canvasSpec.height}`;
    return [...canvasPreset.options].some(o => o.value === value) ? value : 'custom';
  }

  document.getElementById('canvasSizeBtn').addEventListener('click', () => {
    canvasPreset.value = presetValueForSpec();
    canvasWidthInput.value = app.canvasSpec.width || 1600;
    canvasHeightInput.value = app.canvasSpec.height || 1200;
    customSizeFields.classList.toggle('hidden', canvasPreset.value !== 'custom');
    canvasDialog.showModal();
  });

  canvasPreset.addEventListener('change', () => {
    customSizeFields.classList.toggle('hidden', canvasPreset.value !== 'custom');
  });

  document.getElementById('applyCanvasSizeBtn').addEventListener('click', () => {
    const preset = canvasPreset.value;
    let spec;
    if (preset === 'responsive') {
      spec = { mode: 'responsive', width: null, height: null };
    } else {
      let width, height;
      if (preset === 'custom') {
        width = Math.max(320, Math.min(8192, Math.round(Number(canvasWidthInput.value) || 1600)));
        height = Math.max(320, Math.min(8192, Math.round(Number(canvasHeightInput.value) || 1200)));
      } else {
        [width, height] = preset.split('x').map(Number);
      }
      spec = { mode: 'fixed', width, height };
    }
    const preserve = preserveCanvasCheck.checked;
    app.canvasSpec = spec;
    resizeCanvases({ preserve });
    if (!preserve) {
      app.particles = [];
      app.echoQueue = [];
      app.dirty = false;
      hint.classList.remove('hidden');
    }
    record('canvas-size', { spec: { ...spec }, preserve });
    saveDrawing();
    canvasDialog.close();
  });

  document.getElementById('fullscreenBtn').addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (_) {}
  });

  function timestampName() {
    return new Date().toISOString().replace(/[:.]/g, '-');
  }

  let saveTimer = null;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDrawing, 500);
  }

  function saveDrawing() {
    try {
      localStorage.setItem('touch-instrument-image-v1', paintCanvas.toDataURL('image/png'));
      localStorage.setItem('touch-instrument-canvas-spec-v1', JSON.stringify(app.canvasSpec));
    } catch (_) {}
  }

  function restoreSavedDrawing(force = true) {
    const data = localStorage.getItem('touch-instrument-image-v1');
    if (!data || (!force && app.dirty)) return;
    const img = new Image();
    img.onload = () => {
      paint.drawImage(img, 0, 0, app.cssWidth, app.cssHeight);
      app.dirty = true;
      hint.classList.add('hidden');
    };
    img.src = data;
  }

  window.addEventListener('resize', () => { resizeCanvases({ preserve: true }); });
  window.addEventListener('beforeunload', saveDrawing);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveDrawing(); });

  try {
    const savedSpec = JSON.parse(localStorage.getItem('touch-instrument-canvas-spec-v1') || 'null');
    if (savedSpec && (savedSpec.mode === 'responsive' || savedSpec.mode === 'fixed')) app.canvasSpec = savedSpec;
  } catch (_) {}

  resizeCanvases({ preserve: false });
  restoreSavedDrawing(true);
  sessionPerfStart = performance.now();
  beginSession();
  requestAnimationFrame(frame);
})();
