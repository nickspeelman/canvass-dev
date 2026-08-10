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

  function makeRandom(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function newSeed() {
    if (globalThis.crypto?.getRandomValues) {
      const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] >>> 0;
    }
    return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  }

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
    randomSeed: 1,
    random: Math.random,
    clockNow: () => performance.now() - sessionPerfStart,

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
    app.randomSeed = newSeed();
    app.random = makeRandom(app.randomSeed);
    app.session = {
      format: 'touch-instrument-session',
      version: 2,
      engineVersion: '1.9.5',
      startedAt: new Date().toISOString(),
      randomSeed: app.randomSeed,
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

  function getControlsHeight() {
    const controls = document.querySelector('.controls');
    return controls ? controls.getBoundingClientRect().height : 0;
  }

  function positionEffectsMenu() {
    const mobile = window.matchMedia('(max-width: 520px)').matches;
    if (mobile) {
      effectsMenu.style.position = 'fixed';
      effectsMenu.style.left = '8px';
      effectsMenu.style.right = '8px';
      effectsMenu.style.bottom = `${Math.ceil(getControlsHeight() + 8)}px`;
      effectsMenu.style.width = 'auto';
      effectsMenu.style.transform = 'none';
    } else {
      effectsMenu.style.position = '';
      effectsMenu.style.left = '';
      effectsMenu.style.right = '';
      effectsMenu.style.bottom = '';
      effectsMenu.style.width = '';
      effectsMenu.style.transform = '';
    }
  }

  function positionColorMenu() {
    const mobile = window.matchMedia('(max-width: 520px)').matches;
    if (mobile) {
      colorMenu.style.position = 'fixed';
      colorMenu.style.left = '8px';
      colorMenu.style.right = '8px';
      colorMenu.style.bottom = `${Math.ceil(getControlsHeight() + 8)}px`;
      colorMenu.style.width = 'auto';
      colorMenu.style.maxWidth = '340px';
      colorMenu.style.marginLeft = 'auto';
      colorMenu.style.marginRight = 'auto';
      colorMenu.style.transform = 'none';
    } else {
      colorMenu.style.position = '';
      colorMenu.style.left = '';
      colorMenu.style.right = '';
      colorMenu.style.bottom = '';
      colorMenu.style.width = '';
      colorMenu.style.maxWidth = '';
      colorMenu.style.marginLeft = '';
      colorMenu.style.marginRight = '';
      colorMenu.style.transform = '';
    }
  }

  effectsBtn.addEventListener('click', e => {
    e.stopPropagation();
    const willOpen = effectsMenu.hidden;
    closePopovers(willOpen ? effectsMenu : null);
    if (willOpen) positionEffectsMenu();
    effectsMenu.hidden = !willOpen;
    effectsBtn.setAttribute('aria-expanded', String(willOpen));
  });

  function repositionOpenPopovers() {
    if (!effectsMenu.hidden) positionEffectsMenu();
    if (!colorMenu.hidden) positionColorMenu();
  }

  window.addEventListener('resize', repositionOpenPopovers);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', repositionOpenPopovers);
  }

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
    if (willOpen) positionColorMenu();
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

  const gifRenderBtn = document.getElementById('gifRenderBtn');
  const gifDialog = document.getElementById('gifDialog');
  const gifPreview = document.getElementById('gifPreview');
  const gifRenderStatus = document.getElementById('gifRenderStatus');
  const gifProgressBar = document.getElementById('gifProgressBar');
  const gifMeta = document.getElementById('gifMeta');
  const downloadGifBtn = document.getElementById('downloadGifBtn');
  const GIF_FRAME_DELAY = 125;
  const GIF_MAX_DIMENSION = 480;
  const GIF_MAX_FRAMES = 720;
  const GIF_TAIL_MS = 1600;
  const gifResult = { rendering: false, blob: null, url: null };

  function formatDuration(ms) {
    const seconds = Math.max(0, ms) / 1000;
    return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
  }

  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function clearGifResult() {
    gifResult.blob = null;
    if (gifResult.url) URL.revokeObjectURL(gifResult.url);
    gifResult.url = null;
    gifPreview.removeAttribute('src');
    gifPreview.hidden = true;
    downloadGifBtn.disabled = true;
  }

  function cloneState(state) {
    return {
      color: state?.color || '#e53935',
      size: Number(state?.size) || 16,
      hue: 0,
      behaviors: { cycle: true, connect: false, echo: false, scatter: false, flow: false, bloom: false, spray: false, offset: false, mirror: false, radial: false, drift: false, orbit: false, fractal: false, bleed: false, ...(state?.behaviors || {}) }
    };
  }

  function makeReplay(session, initialState = null, randomSeed = null) {
    const logicalWidth = Math.max(1, Math.round(session.initialCanvas?.width || app.cssWidth));
    const logicalHeight = Math.max(1, Math.round(session.initialCanvas?.height || app.cssHeight));
    const canvas = document.createElement('canvas');
    canvas.width = logicalWidth; canvas.height = logicalHeight;
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, logicalWidth, logicalHeight);
    ctx.lineCap = ctx.lineJoin = 'round';
    const config = initialState || session.events.find(e => e.type === 'config')?.state;
    const replay = {
      state: cloneState(config), cssWidth: logicalWidth, cssHeight: logicalHeight,
      activeTouches: new Map(), particles: [], echoQueue: [], orbitPhase: 0,
      now: 0, random: makeRandom(randomSeed ?? session.randomSeed ?? 1), clockNow: () => replay.now,
      paintMark(mark, allowEcho = true) {
        for (const m of B.transformMarks(this, mark)) {
          drawMark(ctx, m, this);
          B.addBleedFromMark(this, m);
        }
        if (allowEcho) B.scheduleEchoes(this, mark);
      }
    };
    return { replay, canvas, ctx };
  }

  function clearReplay(replay, ctx) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, replay.cssWidth, replay.cssHeight); ctx.restore();
    replay.activeTouches.clear(); replay.particles = []; replay.echoQueue = []; replay.orbitPhase = 0;
  }

  function processReplayEchoes(replay) {
    if (!replay.echoQueue.length) return;
    const remain = [];
    for (const item of replay.echoQueue) {
      if (item.at <= replay.now) {
        const mark = { ...item.mark };
        if (replay.state.behaviors.cycle) mark.color = null;
        replay.paintMark(mark, false); B.advanceHue(replay, 7, 0.5);
      } else remain.push(item);
    }
    replay.echoQueue = remain;
  }

  function applyReplayEvent(replay, ctx, event) {
    if (event.type === 'config') { replay.state = cloneState(event.state); return; }
    if (event.type === 'behavior' && event.behavior in replay.state.behaviors) { replay.state.behaviors[event.behavior] = !!event.enabled; return; }
    if (event.type === 'behavior-all') { Object.keys(replay.state.behaviors).forEach(k => replay.state.behaviors[k] = !!event.enabled); return; }
    if (event.type === 'color') { replay.state.color = event.color; return; }
    if (event.type === 'size') { replay.state.size = Number(event.size) || replay.state.size; return; }
    if (event.type === 'clear') {
      clearReplay(replay, ctx);
      if (event.state) replay.state = cloneState(event.state);
      if (event.randomSeed != null) replay.random = makeRandom(event.randomSeed);
      return;
    }
    if (event.type === 'canvas-size' && event.preserve === false) { clearReplay(replay, ctx); return; }
    if (!['down','move','up','cancel'].includes(event.type)) return;

    const x = Math.max(0, Math.min(replay.cssWidth, Number(event.x) * replay.cssWidth));
    const y = Math.max(0, Math.min(replay.cssHeight, Number(event.y) * replay.cssHeight));
    if (event.type === 'down') {
      const touch = { id:event.id, x,y,px:x,py:y,time:replay.now,ptime:replay.now,speed:0 };
      replay.activeTouches.set(event.id, touch);
      B.advanceHue(replay, 2);
      replay.paintMark({ type:'dab', x,y, width:replay.state.size, color:replay.state.behaviors.cycle ? null : replay.state.color });
      return;
    }
    const t = replay.activeTouches.get(event.id);
    if (!t) return;
    if (event.type === 'up' || event.type === 'cancel') { replay.activeTouches.delete(event.id); return; }
    t.px=t.x; t.py=t.y; t.ptime=t.time; t.x=x; t.y=y; t.time=replay.now;
    const distance=Math.hypot(t.x-t.px,t.y-t.py), dt=Math.max(1,t.time-t.ptime); t.speed=distance/dt*1000;
    if (distance <= 0.15) return;
    B.advanceHue(replay,distance);
    replay.paintMark({type:'line',x1:t.px,y1:t.py,x2:t.x,y2:t.y,width:replay.state.size,color:replay.state.behaviors.cycle?null:replay.state.color});
    if (replay.state.behaviors.connect) {
      for (const other of replay.activeTouches.values()) {
        if (other.id===t.id) continue;
        B.advanceHue(replay,Math.hypot(t.x-other.x,t.y-other.y),0.05);
        replay.paintMark({type:'line',x1:t.x,y1:t.y,x2:other.x,y2:other.y,width:Math.max(2,replay.state.size*0.58),color:replay.state.behaviors.cycle?null:replay.state.color});
      }
    }
    B.scatterFromSegment(replay,t,distance); B.sprayFromSegment(replay,t,distance); B.bloomFromSegment(replay,t,distance); B.driftFromSegment(replay,t,distance); B.orbitFromSegment(replay,t,distance);
  }

  function stateAtEventIndex(events, endIndex) {
    const config = events.find(e => e.type === 'config')?.state;
    const state = cloneState(config);
    const limit = Math.min(endIndex, events.length - 1);
    for (let i = 0; i <= limit; i++) {
      const event = events[i];
      if (event.type === 'config' && event.state) {
        const next = cloneState(event.state);
        state.color = next.color; state.size = next.size; state.hue = next.hue; state.behaviors = next.behaviors;
      } else if (event.type === 'behavior' && event.behavior in state.behaviors) {
        state.behaviors[event.behavior] = !!event.enabled;
      } else if (event.type === 'behavior-all') {
        Object.keys(state.behaviors).forEach(k => state.behaviors[k] = !!event.enabled);
      } else if (event.type === 'color') {
        state.color = event.color;
      } else if (event.type === 'size') {
        state.size = Number(event.size) || state.size;
      } else if (event.type === 'clear' && event.state) {
        const next = cloneState(event.state);
        state.color = next.color; state.size = next.size; state.hue = next.hue; state.behaviors = next.behaviors;
      }
    }
    return state;
  }

  async function renderPerformanceGif() {
    if (gifResult.rendering || !window.CanvassGifEncoder) return;
    const events = app.session?.events || [];
    const artisticTypes = new Set(['down','move','up','cancel','clear','behavior','behavior-all','color','size','canvas-size']);

    let lastClearIndex = -1;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === 'clear') { lastClearIndex = i; break; }
    }

    let startIndex;
    let boundaryTime;
    let initialState;
    let replaySeed;
    let replayCanvas = app.session?.initialCanvas;

    if (lastClearIndex >= 0) {
      const clearEvent = events[lastClearIndex];
      startIndex = lastClearIndex + 1;
      boundaryTime = clearEvent.t;
      initialState = clearEvent.state ? cloneState(clearEvent.state) : stateAtEventIndex(events, lastClearIndex);
      replaySeed = clearEvent.randomSeed ?? app.session.randomSeed;
      if (clearEvent.canvas?.width && clearEvent.canvas?.height) replayCanvas = clearEvent.canvas;
    } else {
      const firstDownIndex = events.findIndex(e => e.type === 'down');
      if (firstDownIndex < 0) { alert('Make some marks before rendering a performance GIF.'); return; }
      startIndex = firstDownIndex;
      boundaryTime = events[firstDownIndex].t;
      initialState = stateAtEventIndex(events, firstDownIndex);
      replaySeed = app.session.randomSeed;
    }

    const postBoundaryEvents = events.slice(startIndex);
    const artistic = postBoundaryEvents.filter(e => artisticTypes.has(e.type));
    const firstDown = artistic.find(e => e.type === 'down');
    if (!firstDown) { alert('Make some marks after the most recent Clear before rendering a performance GIF.'); return; }

    clearGifResult(); gifResult.rendering = true; gifRenderBtn.disabled = true;
    gifRenderBtn.textContent = 'Rendering…'; gifRenderStatus.hidden = false; gifRenderStatus.textContent = 'Replaying performance…';
    gifProgressBar.style.width = '0%'; gifDialog.showModal();

    const sourceEvents = postBoundaryEvents.map(e => ({...e, t:Math.max(0,e.t-boundaryTime)}));
    const lastArt = artistic[artistic.length - 1];
    const naturalDuration = Math.max(250, lastArt.t - boundaryTime + GIF_TAIL_MS);
    const frameDelay = Math.max(GIF_FRAME_DELAY, Math.ceil(naturalDuration / GIF_MAX_FRAMES / 10) * 10);
    const duration = naturalDuration;
    const replaySession = { ...app.session, initialCanvas: replayCanvas || app.session.initialCanvas };
    const { replay, canvas, ctx } = makeReplay(replaySession, initialState, replaySeed);
    const scale=Math.min(1,GIF_MAX_DIMENSION/Math.max(canvas.width,canvas.height));
    const outW=Math.max(1,Math.round(canvas.width*scale)), outH=Math.max(1,Math.round(canvas.height*scale));
    const out=document.createElement('canvas'); out.width=outW; out.height=outH;
    const outCtx=out.getContext('2d',{alpha:false,willReadFrequently:true});
    const frames=[]; let eventIndex=0, simTime=0, nextFrame=0; const simStep=1000/60;

    while (simTime <= duration + 0.1) {
      replay.now = simTime;
      while (eventIndex < sourceEvents.length && sourceEvents[eventIndex].t <= simTime + 0.01) applyReplayEvent(replay,ctx,sourceEvents[eventIndex++]);
      processReplayEchoes(replay); B.updateParticles(replay,simStep/1000);
      if (simTime + 0.01 >= nextFrame) {
        outCtx.fillStyle='#fff'; outCtx.fillRect(0,0,outW,outH); outCtx.drawImage(canvas,0,0,outW,outH);
        frames.push(window.CanvassGifEncoder.quantize(outCtx.getImageData(0,0,outW,outH)));
        nextFrame += frameDelay;
      }
      simTime += simStep;
      if (Math.floor(simTime/simStep)%30===0) {
        gifProgressBar.style.width=`${Math.min(45,Math.round(simTime/duration*45))}%`;
        await new Promise(r=>setTimeout(r,0));
      }
    }

    gifRenderStatus.textContent='Encoding GIF…';
    try {
      const blob=await window.CanvassGifEncoder.encode({width:outW,height:outH,frames,delayMs:frameDelay,repeat:0,onProgress:p=>{gifProgressBar.style.width=`${45+Math.round(p*55)}%`; gifRenderStatus.textContent=`Encoding GIF… ${Math.round(p*100)}%`;}});
      gifResult.blob=blob; gifResult.url=URL.createObjectURL(blob); gifPreview.src=gifResult.url; gifPreview.hidden=false;
      gifRenderStatus.hidden=true; gifProgressBar.style.width='100%';
      gifMeta.textContent=`${formatDuration(duration)} performance • ${frames.length} frames • ${outW} × ${outH} • ${formatBytes(blob.size)}`;
      downloadGifBtn.disabled=false; record('gif-ready',{bytes:blob.size,source:'performance-replay'});
    } catch(error) {
      console.error(error); gifRenderStatus.textContent='Could not render this GIF.'; gifProgressBar.style.width='0%';
    } finally {
      gifResult.rendering=false; gifRenderBtn.disabled=false; gifRenderBtn.textContent='Render GIF';
    }
  }

  gifRenderBtn.addEventListener('click', renderPerformanceGif);
  downloadGifBtn.addEventListener('click',()=>{if(!gifResult.blob)return;downloadBlob(gifResult.blob,`canvass-performance-${timestampName()}.gif`);record('download-gif',{bytes:gifResult.blob.size});});
  document.getElementById('closeGifBtn').addEventListener('click',()=>gifDialog.close());

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
    } else {
      app.randomSeed = newSeed();
      app.random = makeRandom(app.randomSeed);
      record('clear', {
        state: snapshotState(),
        randomSeed: app.randomSeed,
        canvas: { width: app.cssWidth, height: app.cssHeight, spec: { ...app.canvasSpec } }
      });
    }
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
    record('canvas-size', { spec: { ...spec }, preserve, width: app.cssWidth, height: app.cssHeight });
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
    if (document.hidden) { saveDrawing(); return; }
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
