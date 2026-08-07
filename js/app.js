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
      behaviors: { cycle: true, connect: false, echo: false, scatter: false, pull: false, mirror: false }
    },
    activeTouches: new Map(),
    particles: [],
    echoQueue: [],
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
      engineVersion: '1.0.0',
      startedAt: new Date().toISOString(),
      initialCanvas: { width: app.cssWidth, height: app.cssHeight },
      events: []
    };
    record('config', { state: snapshotState() });
  }

  function snapshotState() {
    return {
      color: app.state.color,
      size: app.state.size,
      behaviors: { ...app.state.behaviors }
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

  function resizeCanvases() {
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const old = document.createElement('canvas');
    old.width = paintCanvas.width;
    old.height = paintCanvas.height;
    if (old.width && old.height) old.getContext('2d').drawImage(paintCanvas, 0, 0);

    app.cssWidth = rect.width;
    app.cssHeight = rect.height;
    app.dpr = Math.min(2, window.devicePixelRatio || 1);

    for (const c of [paintCanvas, liveCanvas]) {
      c.width = Math.round(rect.width * app.dpr);
      c.height = Math.round(rect.height * app.dpr);
      c.style.width = `${rect.width}px`;
      c.style.height = `${rect.height}px`;
    }

    paint.setTransform(app.dpr, 0, 0, app.dpr, 0, 0);
    live.setTransform(app.dpr, 0, 0, app.dpr, 0, 0);
    paint.lineCap = paint.lineJoin = 'round';
    live.lineCap = live.lineJoin = 'round';

    paint.fillStyle = '#fff';
    paint.fillRect(0, 0, rect.width, rect.height);
    if (old.width && old.height) {
      paint.save();
      paint.setTransform(1, 0, 0, 1, 0, 0);
      paint.drawImage(old, 0, 0, old.width, old.height, 0, 0, paintCanvas.width, paintCanvas.height);
      paint.restore();
    }
    restoreSavedDrawing(false);
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
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function pointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    stage.setPointerCapture?.(e.pointerId);
    const p = pointFromEvent(e);
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
    previewImage.src = paintCanvas.toDataURL('image/png');
    finishDialog.showModal();
    record('finish');
  });

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  document.getElementById('downloadBtn').addEventListener('click', () => {
    paintCanvas.toBlob(blob => blob && downloadBlob(blob, `touch-instrument-${timestampName()}.png`), 'image/png');
    record('download-image');
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
    try { localStorage.setItem('touch-instrument-image-v1', paintCanvas.toDataURL('image/png')); } catch (_) {}
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

  window.addEventListener('resize', () => { resizeCanvases(); });
  window.addEventListener('beforeunload', saveDrawing);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveDrawing(); });

  resizeCanvases();
  restoreSavedDrawing(true);
  sessionPerfStart = performance.now();
  beginSession();
  requestAnimationFrame(frame);
})();
