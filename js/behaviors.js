(() => {
  const TAU = Math.PI * 2;

  // Checkpoint 4.5: engine-level safety governor. These limits are deliberately
  // high enough to leave ordinary drawings untouched while preventing
  // multiplicative effect stacks from producing unbounded work.
  const SAFETY_LIMITS = Object.freeze({
    maxActiveParticles: 480,
    maxPipelineWorkItems: 512,
    maxDeferredPaintCallsPerStep: 480,
    maxDeferredRenderedMarksPerStep: 2400,
    maxQueuedEchoes: 480,
    maxEchoPaintCallsPerStep: 160,
    maxEchoRenderedMarksPerStep: 2400
  });

  function safetyStats(app) {
    if (!app._safetyStats) {
      app._safetyStats = {
        droppedParticles: 0,
        droppedPipelineItems: 0,
        skippedDeferredPaintCalls: 0,
        limitedPipelineCalls: 0,
        droppedEchoes: 0,
        deferredEchoes: 0
      };
    }
    return app._safetyStats;
  }

  function addParticle(app, particle) {
    if (app.particles.length >= SAFETY_LIMITS.maxActiveParticles) {
      safetyStats(app).droppedParticles++;
      return false;
    }
    app.particles.push(particle);
    return true;
  }

  function capWorkItems(app, items, limit) {
    if (items.length <= limit) return items;
    const stats = safetyStats(app);
    stats.droppedPipelineItems += items.length - limit;
    stats.limitedPipelineCalls++;
    return items.slice(0, limit);
  }

  function rotatePoint(x, y, cx, cy, angle) {
    const dx = x - cx;
    const dy = y - cy;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
  }

  function rotateMark(mark, cx, cy, angle) {
    if (mark.type === 'line') {
      const a = rotatePoint(mark.x1, mark.y1, cx, cy, angle);
      const b = rotatePoint(mark.x2, mark.y2, cx, cy, angle);
      return { ...mark, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }
    const p = rotatePoint(mark.x, mark.y, cx, cy, angle);
    return { ...mark, x: p.x, y: p.y };
  }


  function fractalizeLine(mark) {
    const out = [mark];
    const dx = mark.x2 - mark.x1;
    const dy = mark.y2 - mark.y1;
    const len = Math.hypot(dx, dy);
    if (len < 2) return out;

    const baseAngle = Math.atan2(dy, dx);
    const branchAngle = 0.62;
    const gen1Len = len * 0.58;
    const gen2Len = len * 0.32;

    for (const sign of [-1, 1]) {
      const a1 = baseAngle + sign * branchAngle;
      const x3 = mark.x2 + Math.cos(a1) * gen1Len;
      const y3 = mark.y2 + Math.sin(a1) * gen1Len;
      out.push({ ...mark, x1: mark.x2, y1: mark.y2, x2: x3, y2: y3, width: Math.max(1, (mark.width || 1) * 0.68), noFractal:true });

      for (const sign2 of [-1, 1]) {
        const a2 = a1 + sign2 * branchAngle * 0.82;
        out.push({ ...mark, x1: x3, y1: y3, x2: x3 + Math.cos(a2) * gen2Len, y2: y3 + Math.sin(a2) * gen2Len, width: Math.max(1, (mark.width || 1) * 0.44), noFractal:true });
      }
    }
    return out;
  }

  function fractalizeDab(mark) {
    const out = [mark];
    const r = Math.max(4, (mark.width || 8) * 0.95);
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + i * TAU / 3;
      out.push({ ...mark, x: mark.x + Math.cos(a) * r, y: mark.y + Math.sin(a) * r, width: Math.max(1.5, (mark.width || 8) * 0.48), noFractal:true });
    }
    return out;
  }

  function offsetMark(mark, w, h) {
    // Deterministic point reflection through the canvas center.
    if (mark.type === 'line') {
      return { ...mark, x1: w - mark.x1, y1: h - mark.y1, x2: w - mark.x2, y2: h - mark.y2 };
    }
    return { ...mark, x: w - mark.x, y: h - mark.y };
  }

  function flowPoint(x, y, app) {
    const t = ((app.clockNow ? app.clockNow() : performance.now())) * 0.00022;
    const sx = x / Math.max(1, app.cssWidth);
    const sy = y / Math.max(1, app.cssHeight);
    const angle = Math.sin(sx * 9.3 + sy * 5.1 + t * 2.1) * 2.2 + Math.cos(sy * 8.4 - sx * 3.7 - t) * 1.35;
    const strength = Math.min(42, Math.max(10, app.state.size * 1.35));
    return { x: x + Math.cos(angle) * strength, y: y + Math.sin(angle) * strength };
  }

  function flowMark(mark, app) {
    if (mark.type === 'line') {
      const a = flowPoint(mark.x1, mark.y1, app);
      const b = flowPoint(mark.x2, mark.y2, app);
      return { ...mark, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }
    const p = flowPoint(mark.x, mark.y, app);
    return { ...mark, x: p.x, y: p.y };
  }

  const LEGACY_EFFECT_ORDER = Object.freeze([
    'connect', 'scatter', 'spray', 'bloom', 'drift', 'orbit',
    'echo', 'flow', 'fractal', 'offset', 'radial', 'mirror', 'bleed'
  ]);

  function mirrorMark(mark, width) {
    const mirrored = { ...mark };
    if (mirrored.type === 'line') {
      mirrored.x1 = width - mirrored.x1;
      mirrored.x2 = width - mirrored.x2;
    } else {
      mirrored.x = width - mirrored.x;
    }
    return mirrored;
  }

  const pureTransforms = {
    flow: {
      transform(app, marks) {
        return marks.map(mark => flowMark(mark, app));
      }
    },
    fractal: {
      transform(app, marks) {
        const expanded = [];
        for (const mark of marks) {
          if (mark.noFractal) expanded.push(mark);
          else expanded.push(...(mark.type === 'line' ? fractalizeLine(mark) : fractalizeDab(mark)));
        }
        return expanded;
      }
    },
    offset: {
      transform(app, marks) {
        return marks.map(mark => offsetMark(mark, app.cssWidth, app.cssHeight));
      }
    },
    radial: {
      transform(app, marks) {
        const cx = app.cssWidth / 2;
        const cy = app.cssHeight / 2;
        const out = [];
        for (const mark of marks) {
          for (let i = 0; i < 6; i++) out.push(rotateMark(mark, cx, cy, i * TAU / 6));
        }
        return out;
      }
    },
    mirror: {
      transform(app, marks) {
        return marks.concat(marks.map(mark => mirrorMark(mark, app.cssWidth)));
      }
    }
  };

  function markEndPoint(mark) {
    if (mark.type === 'line') return { x: mark.x2, y: mark.y2 };
    return { x: mark.x, y: mark.y };
  }

  function markDistance(mark) {
    if (mark.type !== 'line') return 0;
    return Math.hypot(mark.x2 - mark.x1, mark.y2 - mark.y1);
  }

  const immediateGenerators = {
    connect: {
      generate(app, work, maxGenerated = Infinity) {
        if (maxGenerated <= 0 || !work.pipelineContext?.allowImmediateGenerators || work.mark.type !== 'line' || app.activeTouches.size < 2) return [];
        const point = markEndPoint(work.mark);
        const generated = [];
        for (const other of app.activeTouches.values()) {
          if (other.id === work.pipelineContext.touchId) continue;
          const connector = {
            type: 'line', x1: point.x, y1: point.y, x2: other.x, y2: other.y,
            width: Math.max(2, app.state.size * 0.58),
            color: app.state.ink.type === 'cycle' ? null : app.state.ink.color
          };
          this.advanceHue(app, Math.hypot(point.x - other.x, point.y - other.y), 0.05);
          generated.push({ ...work, mark: connector, pipelineGroup: {} });
          if (generated.length >= maxGenerated) break;
        }
        return generated;
      }
    },
    spray: {
      generate(app, work, maxGenerated = Infinity) {
        if (maxGenerated <= 0 || !work.pipelineContext?.allowImmediateGenerators || work.mark.type !== 'line') return [];
        const distance = markDistance(work.mark);
        if (distance < 0.35) return [];
        const count = Math.min(maxGenerated, 34, Math.max(5, Math.floor(distance * 1.4)));
        const radius = Math.max(18, app.state.size * 2.8);
        const generated = [];
        for (let i = 0; i < count; i++) {
          const t = (app.random ? app.random() : Math.random());
          const cx = work.mark.x1 + (work.mark.x2-work.mark.x1)*t, cy = work.mark.y1 + (work.mark.y2-work.mark.y1)*t;
          const a = (app.random ? app.random() : Math.random())*TAU;
          const r = radius * Math.pow((app.random ? app.random() : Math.random()), 1.8);
          this.advanceHue(app, 0.7, 0.08);
          const dab = { type:'dab', x:cx+Math.cos(a)*r, y:cy+Math.sin(a)*r,
            width: Math.max(1.2, app.state.size*(0.08+(app.random ? app.random() : Math.random())*0.13)),
            color: app.state.ink.type === 'cycle' ? null : app.state.ink.color, alpha:0.22+(app.random ? app.random() : Math.random())*0.34 };
          generated.push({ ...work, mark: dab, pipelineGroup: {} });
        }
        return generated;
      }
    },
    orbit: {
      generate(app, work, maxGenerated = Infinity) {
        if (maxGenerated <= 0 || !work.pipelineContext?.allowImmediateGenerators || work.mark.type !== 'line' || app.activeTouches.size < 2) return [];
        const distance = markDistance(work.mark);
        if (distance < 0.2) return [];
        app.orbitPhase=(app.orbitPhase+distance*0.012)%TAU;
        const generated = [];
        for (const other of app.activeTouches.values()) {
          if (other.id===work.pipelineContext.touchId) continue;
          const phase=Math.PI/2+app.orbitPhase;
          const a=rotatePoint(work.mark.x1,work.mark.y1,other.x,other.y,phase), b=rotatePoint(work.mark.x2,work.mark.y2,other.x,other.y,phase);
          this.advanceHue(app,distance,0.22);
          const orbital = {type:'line',x1:a.x,y1:a.y,x2:b.x,y2:b.y,width:Math.max(2,app.state.size*0.72),color:app.state.ink.type === 'cycle'?null:app.state.ink.color};
          generated.push({ ...work, mark: orbital, pipelineGroup: {} });
          if (generated.length >= maxGenerated) break;
        }
        return generated;
      }
    }
  };

  function randomValue(app) {
    return app.random ? app.random() : Math.random();
  }

  function particleResumeContext(work) {
    return {
      ...(work.pipelineContext || {}),
      allowImmediateGenerators: true,
      allowDeferredGenerators: true,
      gesturePhase: 'deferred'
    };
  }

  const ECHO_DELAYS = Object.freeze([260, 620, 1120]);
  const ECHO_OFFSETS = Object.freeze([5, 10, 16]);
  const ECHO_ALPHAS = Object.freeze([0.58, 0.36, 0.20]);

  function queueEchoes(app, mark, resumeAtEffectIndex, pipelineContext) {
    const now = app.clockNow ? app.clockNow() : performance.now();
    for (let index = 0; index < ECHO_DELAYS.length; index++) {
      if (app.echoQueue.length >= SAFETY_LIMITS.maxQueuedEchoes) {
        safetyStats(app).droppedEchoes++;
        break;
      }
      const offset = ECHO_OFFSETS[index] ?? (5 * (index + 1));
      const alpha = (mark.alpha ?? 1) * (ECHO_ALPHAS[index] ?? 0.25);
      const echoed = { ...mark, echoed: true, alpha };
      if (echoed.type === 'line') {
        echoed.x1 += offset; echoed.y1 += offset;
        echoed.x2 += offset; echoed.y2 += offset;
      } else {
        echoed.x += offset; echoed.y += offset;
      }
      app.echoQueue.push({
        at: now + ECHO_DELAYS[index],
        mark: echoed,
        resumeAtEffectIndex,
        pipelineContext: { ...(pipelineContext || {}) }
      });
    }
  }

  const deferredGenerators = {
    echo: {
      defer(app, work, effectIndex) {
        queueEchoes(app, work.mark, effectIndex + 1, work.pipelineContext);
      }
    },
    scatter: {
      defer(app, work, effectIndex) {
        if (!work.pipelineContext?.allowDeferredGenerators || work.mark.type !== 'line') return;
        const distance = markDistance(work.mark);
        if (distance < 0.5) return;
        const count = Math.min(12, Math.max(1, Math.floor(distance / 5)));
        const speed = work.pipelineContext?.speed || 0;
        const base = Math.min(6, 0.7 + speed * 0.035);
        for (let i = 0; i < count; i++) {
          const t = randomValue(app);
          const x = work.mark.x1 + (work.mark.x2 - work.mark.x1) * t;
          const y = work.mark.y1 + (work.mark.y2 - work.mark.y1) * t;
          const angle = randomValue(app) * TAU;
          const kick = base * (0.4 + randomValue(app));
          addParticle(app, {
            x, y, vx: Math.cos(angle) * kick, vy: Math.sin(angle) * kick,
            life: 0.5 + randomValue(app) * 1.1, age: 0,
            radius: Math.max(1.2, app.state.size * (0.10 + randomValue(app) * 0.12)),
            color: null,
            lastX: x, lastY: y, kind: 'scatter',
            resumeAtEffectIndex: effectIndex + 1,
            pipelineContext: particleResumeContext(work)
          });
        }
      }
    },
    bloom: {
      defer(app, work, effectIndex) {
        if (!work.pipelineContext?.allowDeferredGenerators || work.mark.type !== 'line') return;
        const distance = markDistance(work.mark);
        if (distance < 1.4) return;
        const chance = Math.min(0.85, distance / 12);
        if (randomValue(app) > chance) return;
        const t = randomValue(app);
        const x = work.mark.x1 + (work.mark.x2 - work.mark.x1) * t;
        const y = work.mark.y1 + (work.mark.y2 - work.mark.y1) * t;
        addParticle(app, {
          x, y, vx: 0, vy: 0, life: 0.75 + randomValue(app) * 0.8, age: 0,
          radius: Math.max(8, app.state.size * (0.75 + randomValue(app) * 0.8)),
          color: null,
          lastX: x, lastY: y, kind: 'bloom', seed: randomValue(app) * 1000,
          resumeAtEffectIndex: effectIndex + 1,
          pipelineContext: particleResumeContext(work)
        });
      }
    },
    drift: {
      defer(app, work, effectIndex) {
        if (!work.pipelineContext?.allowDeferredGenerators || work.mark.type !== 'line') return;
        const dx = work.mark.x2 - work.mark.x1;
        const dy = work.mark.y2 - work.mark.y1;
        const distance = Math.hypot(dx, dy);
        if (distance < 0.5) return;
        const mag = Math.max(0.001, distance);
        const speed = Math.min(7.5, 0.8 + (work.pipelineContext?.speed || 0) * 0.012);
        addParticle(app, {
          x: work.mark.x2, y: work.mark.y2, vx: dx / mag * speed, vy: dy / mag * speed,
          life: 0.9 + Math.min(1.4, distance / 35), age: 0,
          radius: Math.max(1.5, app.state.size * 0.33),
          color: null,
          lastX: work.mark.x2, lastY: work.mark.y2, kind: 'drift',
          resumeAtEffectIndex: effectIndex + 1,
          pipelineContext: particleResumeContext(work)
        });
      }
    },
    bleed: {
      defer(app, work, effectIndex) {
        const mark = work.mark;
        if (mark.noBleed || app.particles.length >= SAFETY_LIMITS.maxActiveParticles) return;
        const resumeAtEffectIndex = effectIndex + 1;
        const pipelineContext = particleResumeContext(work);
        if (mark.type === 'line') {
          const dx = mark.x2 - mark.x1, dy = mark.y2 - mark.y1;
          const len = Math.hypot(dx, dy);
          const samples = Math.min(4, Math.max(1, Math.ceil(len / 24)));
          for (let i = 0; i < samples; i++) {
            const t = samples === 1 ? 0.5 : i / (samples - 1);
            const x = mark.x1 + dx * t, y = mark.y1 + dy * t;
            addParticle(app, {
              x, y, vx: 0, vy: 0, life: 1.15 + randomValue(app) * 1.05, age: 0,
              radius: Math.max(5, (mark.width || app.state.size) * (0.55 + randomValue(app) * 0.35)),
              color: null, lastX: x, lastY: y, kind: 'bleed', seed: randomValue(app) * 1000,
              resumeAtEffectIndex, pipelineContext
            });
          }
        } else {
          addParticle(app, {
            x: mark.x, y: mark.y, vx: 0, vy: 0, life: 1.25 + randomValue(app) * 1.0, age: 0,
            radius: Math.max(5, (mark.width || app.state.size) * (0.6 + randomValue(app) * 0.35)),
            color: null, lastX: mark.x, lastY: mark.y, kind: 'bleed', seed: randomValue(app) * 1000,
            resumeAtEffectIndex, pipelineContext
          });
        }
      }
    }
  };

  const effectRegistry = Object.freeze(Object.fromEntries(
    LEGACY_EFFECT_ORDER.map((id, legacyIndex) => [
      id,
      Object.freeze({
        id, legacyIndex,
        ...(pureTransforms[id] || {}),
        ...(immediateGenerators[id] || {}),
        ...(deferredGenerators[id] || {})
      })
    ])
  ));

  window.TouchBehaviors = {
    safetyLimits: SAFETY_LIMITS,
    getSafetyStats(app) { return { ...safetyStats(app), activeParticles: app.particles.length }; },
    legacyEffectOrder: LEGACY_EFFECT_ORDER,
    effectRegistry,
    echoDelays: ECHO_DELAYS,
    echoOffsets: ECHO_OFFSETS,
    echoAlphas: ECHO_ALPHAS,
    radialCopies: 6,

    // Intentional emergent behavior: the original gesture can carry a concrete
    // color snapshot, but deferred particle effects (Scatter/Bloom/Drift/Bleed)
    // deliberately emit marks with color:null. Those marks resolve against the
    // CURRENT ink when they are emitted/rendered, so changing inks while paint
    // is still settling recolors the remaining motion. Preserve this unless/
    // until Canvas gains an explicit color-at-gesture vs color-at-render-time
    // control.
    resolveColor(app, snapshotColor = null) {
      if (app.state.ink.type === 'cycle') return `hsl(${app.state.hue % 360} 92% 50%)`;
      return snapshotColor || app.state.ink.color;
    },

    advanceHue(app, distance, multiplier = 1) {
      if (app.state.ink.type !== 'cycle') return;
      app.state.hue = (app.state.hue + Math.max(0.8, distance * 0.38) * multiplier) % 360;
    },

    processEffectStack(app, mark, options = {}) {
      const stack = Array.isArray(app.state.effectStack) ? app.state.effectStack : [];
      const pipelineContext = options.pipelineContext || null;
      const requestedLimit = Number.isFinite(pipelineContext?.workItemLimit) ? Math.max(1, Math.floor(pipelineContext.workItemLimit)) : SAFETY_LIMITS.maxPipelineWorkItems;
      const workItemLimit = Math.min(SAFETY_LIMITS.maxPipelineWorkItems, requestedLimit);
      let workItems = [{ mark, pipelineContext, pipelineGroup: {} }];

      // Ordered transforms, generators, and deferred stages share the same
      // ordered registry path. Generated marks remain in the work list, so they
      // continue through every effect that follows their generator.
      for (let effectIndex = options.startAtEffectIndex || 0; effectIndex < stack.length; effectIndex++) {
        const entry = stack[effectIndex];
        const effectId = typeof entry === 'string' ? entry : entry?.id;
        const enabled = typeof entry === 'string' ? true : entry?.enabled !== false;
        if (!enabled) continue;
        const effect = effectRegistry[effectId];
        if (!effect) continue;

        if (effect.transform) {
          // Preserve the legacy per-paint-call batching semantics. Immediate
          // generators create new groups, and every later transform is applied
          // independently to each group in creation order.
          const groups = [];
          const byGroup = new Map();
          for (const work of workItems) {
            let group = byGroup.get(work.pipelineGroup);
            if (!group) { group = []; byGroup.set(work.pipelineGroup, group); groups.push(group); }
            group.push(work);
          }
          const next = [];
          for (const group of groups) {
            const template = group[0];
            const transformed = effect.transform(app, group.map(work => work.mark));
            for (const transformedMark of transformed) next.push({ ...template, mark: transformedMark });
          }
          workItems = capWorkItems(app, next, workItemLimit);
        }

        if (effect.generate) {
          const next = [];
          for (const work of workItems) {
            if (next.length >= workItemLimit) break;
            next.push(work);
            const remaining = workItemLimit - next.length;
            if (remaining > 0) next.push(...effect.generate.call(this, app, work, remaining));
          }
          workItems = capWorkItems(app, next, workItemLimit);
        }

        if (effect.defer) {
          for (const work of workItems) effect.defer.call(this, app, work, effectIndex);
        }
      }
      return workItems;
    },

    processEchoQueue(app, now) {
      if (!app.echoQueue.length) return;
      const remain = [];
      let paintCallsLeft = SAFETY_LIMITS.maxEchoPaintCallsPerStep;
      let renderedMarksLeft = SAFETY_LIMITS.maxEchoRenderedMarksPerStep;
      const stats = safetyStats(app);

      for (const item of app.echoQueue) {
        if (item.at > now) { remain.push(item); continue; }
        if (paintCallsLeft <= 0 || renderedMarksLeft <= 0) {
          remain.push(item);
          stats.deferredEchoes++;
          continue;
        }
        const mark = { ...item.mark };
        if (app.state.ink.type === 'cycle') mark.color = null;
        const context = { ...(item.pipelineContext || {}), workItemLimit: renderedMarksLeft };
        paintCallsLeft--;
        const rendered = app.paintMark(mark, context, item.resumeAtEffectIndex || 0) || 0;
        renderedMarksLeft = Math.max(0, renderedMarksLeft - rendered);
        this.advanceHue(app, 7, 0.5);
      }
      app.echoQueue = remain;
    },

    updateParticles(app, dt) {
      if (!app.particles.length) return;
      const keep=[];
      let paintCallsLeft = SAFETY_LIMITS.maxDeferredPaintCallsPerStep;
      let renderedMarksLeft = SAFETY_LIMITS.maxDeferredRenderedMarksPerStep;
      const stats = safetyStats(app);

      const emit = (mark, p) => {
        if (paintCallsLeft <= 0 || renderedMarksLeft <= 0) {
          stats.skippedDeferredPaintCalls++;
          return false;
        }
        const context = { ...(p.pipelineContext || {}), workItemLimit: renderedMarksLeft };
        paintCallsLeft--;
        const rendered = app.paintMark(mark, context, p.resumeAtEffectIndex || 0) || 0;
        renderedMarksLeft = Math.max(0, renderedMarksLeft - rendered);
        return true;
      };

      for (const p of app.particles) {
        p.age+=dt;
        if (p.age>=p.life) continue;

        if (p.kind==='bleed') {
          const progress=p.age/p.life;
          const spread=p.radius*(0.45+progress*2.8);
          const deposits=5;
          for (let i=0;i<deposits;i++) {
            const a=(p.seed*0.017+i*2.399+progress*4.2)%TAU;
            const radial=spread*Math.pow((i+1)/deposits,0.78)*(0.72+0.25*Math.sin(p.seed+i*1.7+progress*6));
            this.advanceHue(app,0.35,0.035);
            emit({type:'dab',x:p.x+Math.cos(a)*radial,y:p.y+Math.sin(a)*radial,
              width:Math.max(1.2,p.radius*(0.34+0.18*(1-progress))),color:p.color,noBleed:true,noFractal:true,
              alpha:Math.max(0.018,0.075*(1-progress))}, p);
          }
          keep.push(p); continue;
        }

        if (p.kind==='bloom') {
          const progress=p.age/p.life;
          const R=p.radius*(0.5+progress*3.2);
          const points=12;
          for (let i=0;i<points;i++) {
            const a=i*TAU/points;
            const wobble=1+0.13*Math.sin(i*2.7+p.seed)+0.07*Math.sin(progress*8+p.seed+i);
            this.advanceHue(app,0.5,0.05);
            emit({type:'dab',x:p.x+Math.cos(a)*R*wobble,y:p.y+Math.sin(a)*R*wobble,
              width:Math.max(1.5,p.radius*0.28),color:p.color,alpha:0.16*(1-progress)+0.035}, p);
          }
          keep.push(p); continue;
        }

        const dampingBase=p.kind==='drift'?0.992:0.985;
        const damping=Math.pow(dampingBase,dt*60); p.vx*=damping; p.vy*=damping;
        p.lastX=p.x; p.lastY=p.y; p.x+=p.vx*dt*60; p.y+=p.vy*dt*60;
        const dist=Math.hypot(p.x-p.lastX,p.y-p.lastY);
        this.advanceHue(app,dist,p.kind==='drift'?0.28:0.18);
        const lifeLeft=Math.max(0.05,1-p.age/p.life);
        emit({type:'line',x1:p.lastX,y1:p.lastY,x2:p.x,y2:p.y,
          width:Math.max(1,p.radius*(p.kind==='drift'?1.25:1.7)),color:p.color,
          alpha:Math.max(p.kind==='drift'?0.08:0.12,lifeLeft)}, p);
        keep.push(p);
      }
      app.particles=keep;
    }
  };
})();
