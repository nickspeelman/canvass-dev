(() => {
  const B = window.TouchBehaviors;
  const paintCanvas = document.getElementById('paintCanvas');
  const liveCanvas = document.getElementById('liveCanvas');
  const stage = document.getElementById('stage');
  const paint = paintCanvas.getContext('2d', { alpha: false });
  const live = liveCanvas.getContext('2d');
  const artworkCanvas = document.createElement('canvas');
  const artwork = artworkCanvas.getContext('2d', { alpha: false });
  const hint = document.getElementById('touchHint');

  const app = {
    state: {
      color: '#e53935',
      size: 16,
      hue: 0,
      behaviors: { cycle: true, connect: false, echo: false, scatter: false, flow: false, bloom: false, spray: false, offset: false, mirror: false, radial: false, drift: false, orbit: false, fractal: false, bleed: false }
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
      for (const m of B.transformMarks(this, mark)) {
        drawMark(artwork, m, this);
        B.addBleedFromMark(this, m);
      }
      if (allowEcho) B.scheduleEchoes(this, mark);
      this.dirty = true;
    }
  };

  function beginSession() {
    app.session = {
      format: 'touch-instrument-session',
      version: 1,
      engineVersion: '1.8.0',
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

  function copyCanvas(source) {
    const copy = document.createElement('canvas');
    copy.width = source.width;
    copy.height = source.height;
    if (copy.width && copy.height) copy.getContext('2d', { alpha: false }).drawImage(source, 0, 0);
    return copy;
  }

  function configureArtworkContext() {
    artwork.setTransform(app.dpr, 0, 0, app.dpr, 0, 0);
    artwork.lineCap = artwork.lineJoin = 'round';
  }

  function syncVisibleCanvas() {
    paint.save();
    paint.setTransform(1, 0, 0, 1, 0, 0);
    paint.fillStyle = '#fff';
    paint.fillRect(0, 0, paintCanvas.width, paintCanvas.height);
    if (artworkCanvas.width && artworkCanvas.height) {
      paint.drawImage(artworkCanvas, 0, 0, artworkCanvas.width, artworkCanvas.height, 0, 0, paintCanvas.width, paintCanvas.height);
    }
    paint.restore();
  }

  function resizeCanvases({ preserve = true } = {}) {
    const display = canvasDisplayRect();
    if (!display || display.width < 1 || display.height < 1) return;

    const oldArtwork = preserve && artworkCanvas.width && artworkCanvas.height ? copyCanvas(artworkCanvas) : null;
    app.cssWidth = display.width;
    app.cssHeight = display.height;
    app.dpr = Math.min(2, window.devicePixelRatio || 1);
    const pixelWidth = Math.max(1, Math.round(display.width * app.dpr));
    const pixelHeight = Math.max(1, Math.round(display.height * app.dpr));

    artworkCanvas.width = pixelWidth;
    artworkCanvas.height = pixelHeight;
    configureArtworkContext();
    artwork.fillStyle = '#fff';
    artwork.fillRect(0, 0, display.width, display.height);
    if (oldArtwork) {
      artwork.save();
      artwork.setTransform(1, 0, 0, 1, 0, 0);
      artwork.drawImage(oldArtwork, 0, 0, oldArtwork.width, oldArtwork.height, 0, 0, pixelWidth, pixelHeight);
      artwork.restore();
      configureArtworkContext();
      app.dirty = true;
    }

    for (const c of [paintCanvas, liveCanvas]) {
      c.width = pixelWidth;
      c.height = pixelHeight;
      c.style.width = `${display.width}px`;
      c.style.height = `${display.height}px`;
      c.style.left = `${display.left}px`;
      c.style.top = `${display.top}px`;
    }

    paint.setTransform(app.dpr, 0, 0, app.dpr, 0, 0);
    live.setTransform(app.dpr, 0, 0, app.dpr, 0, 0);
    paint.lineCap = paint.lineJoin = 'round';
    live.lineCap = live.lineJoin = 'round';
    syncVisibleCanvas();
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
    if (app.dirty) { syncVisibleCanvas(); app.dirty = false; }
    renderLive();
    requestAnimationFrame(frame);
  }

  const effectsBtn = document.getElementById('effectsBtn');
  const effectsMenu = document.getElementById('effectsMenu');
  const effectsCount = document.getElementById('effectsCount');
  const customColorBtn = document.getElementById('customColorBtn');
  const colorMenu = document.getElementById('colorMenu');
  const customColorPicker = document.getElementById('customColorPicker');
  const customColorText = document.getElementById('customColorText');
  const colorError = document.getElementById('colorError');

  function closePopovers(except = null) {
    if (except !== effectsMenu) { effectsMenu.hidden = true; effectsBtn.setAttribute('aria-expanded', 'false'); }
    if (except !== colorMenu) colorMenu.hidden = true;
  }

  function updateEffectsCount() {
    effectsCount.textContent = String(Object.values(app.state.behaviors).filter(Boolean).length);
  }

  function setBehavior(key, enabled, shouldRecord = true) {
    app.state.behaviors[key] = enabled;
    const btn = document.querySelector(`.behavior[data-behavior="${key}"]`);
    if (btn) {
      btn.classList.toggle('active', enabled);
      btn.setAttribute('aria-pressed', String(enabled));
    }
    if (shouldRecord) record('behavior', { behavior: key, enabled });
    updateEffectsCount();
  }

  effectsBtn.addEventListener('click', e => {
    e.stopPropagation();
    const willOpen = effectsMenu.hidden;
    closePopovers(willOpen ? effectsMenu : null);
    effectsMenu.hidden = !willOpen;
    effectsBtn.setAttribute('aria-expanded', String(willOpen));
  });

  document.querySelectorAll('.behavior').forEach(btn => {
    btn.addEventListener('click', () => setBehavior(btn.dataset.behavior, !app.state.behaviors[btn.dataset.behavior]));
  });

  document.getElementById('selectAllEffectsBtn').addEventListener('click', () => {
    Object.keys(app.state.behaviors).forEach(key => setBehavior(key, true, false));
    record('behavior-all', { enabled: true });
  });

  document.getElementById('clearAllEffectsBtn').addEventListener('click', () => {
    Object.keys(app.state.behaviors).forEach(key => setBehavior(key, false, false));
    record('behavior-all', { enabled: false });
  });

  function activateColorButton(btn, color) {
    document.querySelectorAll('.swatch').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    app.state.color = color;
    record('color', { color });
  }

  document.querySelectorAll('.swatch[data-color]').forEach(btn => {
    btn.addEventListener('click', () => {
      closePopovers();
      activateColorButton(btn, btn.dataset.color);
    });
  });

  function parseCssColor(value) {
    const text = value.trim();
    if (/^#[0-9a-f]{3}$/i.test(text)) return '#' + [...text.slice(1)].map(c => c + c).join('').toLowerCase();
    if (/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase();
    const match = text.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i);
    if (!match) return null;
    const rgb = match.slice(1, 4).map(Number);
    if (rgb.some(v => v < 0 || v > 255)) return null;
    return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
  }

  function setCustomColor(color, apply = true) {
    customColorPicker.value = color;
    customColorText.value = color;
    customColorBtn.style.setProperty('--swatch', color);
    colorError.textContent = '';
    if (apply) activateColorButton(customColorBtn, color);
  }

  customColorBtn.addEventListener('click', e => {
    e.stopPropagation();
    const willOpen = colorMenu.hidden;
    closePopovers(willOpen ? colorMenu : null);
    colorMenu.hidden = !willOpen;
  });

  customColorPicker.addEventListener('input', () => setCustomColor(customColorPicker.value, false));
  customColorText.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('applyCustomColorBtn').click(); }
  });
  document.getElementById('applyCustomColorBtn').addEventListener('click', () => {
    const color = parseCssColor(customColorText.value);
    if (!color) { colorError.textContent = 'Use a hex or RGB color.'; return; }
    setCustomColor(color, true);
    colorMenu.hidden = true;
  });

  document.addEventListener('pointerdown', e => {
    if (!e.target.closest('.popover-wrap')) closePopovers();
  });
  updateEffectsCount();

  document.querySelectorAll('.size').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.size').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
      btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true');
      app.state.size = Number(btn.dataset.size);
      record('size', { size: app.state.size });
    });
  });

  const gifRecordBtn = document.getElementById('gifRecordBtn');
  const gifDialog = document.getElementById('gifDialog');
  const gifPreview = document.getElementById('gifPreview');
  const gifRenderStatus = document.getElementById('gifRenderStatus');
  const gifProgressBar = document.getElementById('gifProgressBar');
  const gifMeta = document.getElementById('gifMeta');
  const downloadGifBtn = document.getElementById('downloadGifBtn');
  const GIF_FRAME_DELAY = 125;
  const GIF_MAX_DURATION = 30000;
  const GIF_MAX_DIMENSION = 480;
  const gifCapture = {
    recording: false,
    rendering: false,
    startedAt: 0,
    timer: null,
    frames: [],
    width: 0,
    height: 0,
    canvas: document.createElement('canvas'),
    ctx: null,
    blob: null,
    url: null
  };
  gifCapture.ctx = gifCapture.canvas.getContext('2d', { alpha: false, willReadFrequently: true });

  function formatDuration(ms) {
    const seconds = Math.max(0, ms) / 1000;
    return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
  }

  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function clearGifResult() {
    gifCapture.blob = null;
    if (gifCapture.url) URL.revokeObjectURL(gifCapture.url);
    gifCapture.url = null;
    gifPreview.removeAttribute('src');
    gifPreview.hidden = true;
    downloadGifBtn.disabled = true;
  }

  function setupGifCaptureCanvas() {
    const sourceWidth = Math.max(1, artworkCanvas.width);
    const sourceHeight = Math.max(1, artworkCanvas.height);
    const scale = Math.min(1, GIF_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
    gifCapture.width = Math.max(1, Math.round(sourceWidth * scale));
    gifCapture.height = Math.max(1, Math.round(sourceHeight * scale));
    gifCapture.canvas.width = gifCapture.width;
    gifCapture.canvas.height = gifCapture.height;
  }

  function captureGifFrame(force = false) {
    if ((!gifCapture.recording && !force) || !window.CanvassGifEncoder) return;
    if (gifCapture.frames.length >= Math.ceil(GIF_MAX_DURATION / GIF_FRAME_DELAY) + 1) return;
    const ctx = gifCapture.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, gifCapture.width, gifCapture.height);
    ctx.drawImage(artworkCanvas, 0, 0, artworkCanvas.width, artworkCanvas.height, 0, 0, gifCapture.width, gifCapture.height);
    ctx.restore();
    const imageData = ctx.getImageData(0, 0, gifCapture.width, gifCapture.height);
    gifCapture.frames.push(window.CanvassGifEncoder.quantize(imageData));
  }

  function updateGifRecordButton() {
    if (!gifCapture.recording) {
      gifRecordBtn.textContent = gifCapture.rendering ? 'Rendering…' : 'Record GIF';
      gifRecordBtn.classList.remove('recording');
      gifRecordBtn.setAttribute('aria-pressed', 'false');
      return;
    }
    const elapsed = performance.now() - gifCapture.startedAt;
    gifRecordBtn.textContent = `Stop ${Math.min(30, Math.ceil(elapsed / 1000))}s`;
    gifRecordBtn.classList.add('recording');
    gifRecordBtn.setAttribute('aria-pressed', 'true');
  }

  function startGifRecording() {
    if (gifCapture.recording || gifCapture.rendering) return;
    if (!window.CanvassGifEncoder) {
      alert('GIF rendering is unavailable in this browser.');
      return;
    }
    clearGifResult();
    gifCapture.frames = [];
    setupGifCaptureCanvas();
    gifCapture.startedAt = performance.now();
    gifCapture.recording = true;
    captureGifFrame();
    updateGifRecordButton();
    gifCapture.timer = setInterval(() => {
      captureGifFrame();
      updateGifRecordButton();
      if (performance.now() - gifCapture.startedAt >= GIF_MAX_DURATION) stopGifRecording('limit');
    }, GIF_FRAME_DELAY);
    record('gif-start', { width: gifCapture.width, height: gifCapture.height, fps: Math.round(1000 / GIF_FRAME_DELAY) });
  }

  async function stopGifRecording(reason = 'user') {
    if (!gifCapture.recording || gifCapture.rendering) return;
    gifCapture.recording = false;
    clearInterval(gifCapture.timer);
    gifCapture.timer = null;
    captureGifFrame(true);
    gifCapture.rendering = true;
    gifRecordBtn.disabled = true;
    updateGifRecordButton();

    const elapsed = performance.now() - gifCapture.startedAt;
    gifRenderStatus.hidden = false;
    gifRenderStatus.textContent = reason === 'limit' ? '30-second limit reached. Rendering GIF…' : 'Rendering GIF…';
    gifProgressBar.style.width = '0%';
    gifMeta.textContent = `${formatDuration(elapsed)} performance • ${gifCapture.frames.length} frames • ${gifCapture.width} × ${gifCapture.height}`;
    downloadGifBtn.disabled = true;
    if (!gifDialog.open) gifDialog.showModal();

    record('gif-stop', { reason, durationMs: Math.round(elapsed), frames: gifCapture.frames.length });

    try {
      const blob = await window.CanvassGifEncoder.encode({
        width: gifCapture.width,
        height: gifCapture.height,
        frames: gifCapture.frames,
        delayMs: GIF_FRAME_DELAY,
        repeat: 0,
        onProgress: progress => {
          gifProgressBar.style.width = `${Math.round(progress * 100)}%`;
          gifRenderStatus.textContent = `Rendering GIF… ${Math.round(progress * 100)}%`;
        }
      });
      gifCapture.blob = blob;
      gifCapture.url = URL.createObjectURL(blob);
      gifPreview.src = gifCapture.url;
      gifPreview.hidden = false;
      gifRenderStatus.hidden = true;
      gifProgressBar.style.width = '100%';
      gifMeta.textContent = `${formatDuration(elapsed)} performance • ${gifCapture.frames.length} frames • ${gifCapture.width} × ${gifCapture.height} • ${formatBytes(blob.size)}`;
      downloadGifBtn.disabled = false;
      record('gif-ready', { bytes: blob.size });
    } catch (error) {
      console.error(error);
      gifRenderStatus.hidden = false;
      gifRenderStatus.textContent = 'Could not render this GIF. Try a shorter performance.';
      gifMeta.textContent = '';
      gifProgressBar.style.width = '0%';
    } finally {
      gifCapture.frames = [];
      gifCapture.rendering = false;
      gifRecordBtn.disabled = false;
      updateGifRecordButton();
    }
  }

  gifRecordBtn.addEventListener('click', () => {
    if (gifCapture.recording) stopGifRecording('user');
    else startGifRecording();
  });

  downloadGifBtn.addEventListener('click', () => {
    if (!gifCapture.blob) return;
    downloadBlob(gifCapture.blob, `canvass-performance-${timestampName()}.gif`);
    record('download-gif', { bytes: gifCapture.blob.size });
  });

  document.getElementById('closeGifBtn').addEventListener('click', () => gifDialog.close());

  function clearCanvas(startNew = false) {
    artwork.save();
    artwork.setTransform(app.dpr, 0, 0, app.dpr, 0, 0);
    artwork.fillStyle = '#fff';
    artwork.fillRect(0, 0, app.cssWidth, app.cssHeight);
    artwork.restore();
    syncVisibleCanvas();
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
    if (app.canvasSpec.mode === 'responsive' || !app.canvasSpec.width || !app.canvasSpec.height) return artworkCanvas;
    const out = document.createElement('canvas');
    out.width = app.canvasSpec.width;
    out.height = app.canvasSpec.height;
    const ctx = out.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(artworkCanvas, 0, 0, out.width, out.height);
    return out;
  }

  function saveImageDownload(source = 'save-button') {
    saveDrawing();
    exportCanvas().toBlob(blob => {
      if (!blob) return;
      downloadBlob(blob, `canvass-${timestampName()}.png`);
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
    downloadBlob(new Blob([JSON.stringify(exportSession, null, 2)], { type: 'application/json' }), `canvass-session-${timestampName()}.json`);
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
      localStorage.setItem('touch-instrument-image-v1', artworkCanvas.toDataURL('image/png'));
      localStorage.setItem('touch-instrument-canvas-spec-v1', JSON.stringify(app.canvasSpec));
    } catch (_) {}
  }

  function restoreSavedDrawing(force = true) {
    const data = localStorage.getItem('touch-instrument-image-v1');
    if (!data || (!force && app.dirty)) return;
    const img = new Image();
    img.onload = () => {
      artwork.save();
      artwork.setTransform(1, 0, 0, 1, 0, 0);
      artwork.fillStyle = '#fff';
      artwork.fillRect(0, 0, artworkCanvas.width, artworkCanvas.height);
      artwork.drawImage(img, 0, 0, img.width, img.height, 0, 0, artworkCanvas.width, artworkCanvas.height);
      artwork.restore();
      configureArtworkContext();
      syncVisibleCanvas();
      app.dirty = false;
      hint.classList.add('hidden');
    };
    img.src = data;
  }

  let resizeTimer = null;
  function scheduleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => resizeCanvases({ preserve: true }), 80);
  }
  window.addEventListener('resize', scheduleResize);
  window.visualViewport?.addEventListener('resize', scheduleResize);
  window.addEventListener('orientationchange', scheduleResize);
  window.addEventListener('beforeunload', saveDrawing);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { saveDrawing(); if (gifCapture.recording) stopGifRecording('hidden'); return; }
    app.activeTouches.clear();
    app.lastFrame = performance.now();
    requestAnimationFrame(() => requestAnimationFrame(() => resizeCanvases({ preserve: true })));
  });
  window.addEventListener('pageshow', () => requestAnimationFrame(() => resizeCanvases({ preserve: true })));

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
