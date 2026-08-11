(() => {
  const TAU = Math.PI * 2;

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

  window.TouchBehaviors = {
    echoDelays: [500, 800, 1200],
    echoOffsets: [3, 6, 9],
    echoAlphas: [0.5, 0.3, 0.15],
    radialCopies: 6,

    resolveColor(app, snapshotColor = null) {
      if (app.state.behaviors.cycle) return `hsl(${app.state.hue % 360} 92% 50%)`;
      return snapshotColor || app.state.color;
    },

    advanceHue(app, distance, multiplier = 1) {
      if (!app.state.behaviors.cycle) return;
      app.state.hue = (app.state.hue + Math.max(0.8, distance * 0.38) * multiplier) % 360;
    },

    transformMarks(app, mark) {
      let marks = [mark];

      // Flow deforms the coordinate field rather than adding decorative particles.
      if (app.state.behaviors.flow) marks = marks.map(base => flowMark(base, app));

      // Fractal expands one gesture into a shallow branching family.
      if (app.state.behaviors.fractal && !mark.noFractal) {
        const expanded = [];
        for (const base of marks) expanded.push(...(base.type === 'line' ? fractalizeLine(base) : fractalizeDab(base)));
        marks = expanded;
      }

      // Offset replaces the source location with its point-reflected location.
      if (app.state.behaviors.offset) marks = marks.map(base => offsetMark(base, app.cssWidth, app.cssHeight));

      if (app.state.behaviors.radial) {
        const cx = app.cssWidth / 2, cy = app.cssHeight / 2;
        const radial = [];
        for (const base of marks) {
          for (let i = 0; i < this.radialCopies; i++) radial.push(rotateMark(base, cx, cy, i * TAU / this.radialCopies));
        }
        marks = radial;
      }

      if (app.state.behaviors.mirror) {
        const w = app.cssWidth;
        const mirrored = marks.map(base => {
          const m = { ...base };
          if (m.type === 'line') { m.x1 = w - m.x1; m.x2 = w - m.x2; }
          else m.x = w - m.x;
          return m;
        });
        marks = marks.concat(mirrored);
      }
      return marks;
    },

    scheduleEchoes(app, mark) {
      if (!app.state.behaviors.echo || mark.noEcho) return;
      const now = app.clockNow ? app.clockNow() : performance.now();
      this.echoDelays.forEach((delay, index) => {
        const offset = this.echoOffsets[index] ?? (7 * (index + 1));
        const alpha = (mark.alpha ?? 1) * (this.echoAlphas[index] ?? 0.25);
        const echoed = { ...mark, echoed: true, noEcho: true, alpha };
        if (echoed.type === 'line') {
          echoed.x1 += offset; echoed.y1 += offset;
          echoed.x2 += offset; echoed.y2 += offset;
        } else {
          echoed.x += offset; echoed.y += offset;
        }
        app.echoQueue.push({ at: now + delay, mark: echoed });
      });
    },

    addBleedFromMark(app, mark) {
      if (!app.state.behaviors.bleed || mark.noBleed) return;
      if (app.particles.length > 520) return;

      const baseColor = app.state.behaviors.cycle ? null : (mark.color || app.state.color);
      if (mark.type === 'line') {
        const dx = mark.x2 - mark.x1, dy = mark.y2 - mark.y1;
        const len = Math.hypot(dx, dy);
        const samples = Math.min(4, Math.max(1, Math.ceil(len / 24)));
        for (let i = 0; i < samples; i++) {
          const t = samples === 1 ? 0.5 : i / (samples - 1);
          const x = mark.x1 + dx * t, y = mark.y1 + dy * t;
          app.particles.push({ x, y, vx:0, vy:0, life:1.15 + (app.random ? app.random() : Math.random())*1.05, age:0,
            radius:Math.max(5, (mark.width || app.state.size) * (0.55 + (app.random ? app.random() : Math.random())*0.35)),
            color:baseColor, lastX:x, lastY:y, kind:'bleed', seed:(app.random ? app.random() : Math.random())*1000 });
        }
      } else {
        app.particles.push({ x:mark.x, y:mark.y, vx:0, vy:0, life:1.25 + (app.random ? app.random() : Math.random())*1.0, age:0,
          radius:Math.max(5, (mark.width || app.state.size) * (0.6 + (app.random ? app.random() : Math.random())*0.35)),
          color:baseColor, lastX:mark.x, lastY:mark.y, kind:'bleed', seed:(app.random ? app.random() : Math.random())*1000 });
      }
    },

    scatterFromSegment(app, touch, distance) {
      if (!app.state.behaviors.scatter || distance < 0.5) return;
      const count = Math.min(12, Math.max(1, Math.floor(distance / 5)));
      const speed = touch.speed || 0;
      const base = Math.min(6, 0.7 + speed * 0.035);
      for (let i = 0; i < count; i++) {
        const t = (app.random ? app.random() : Math.random()), x = touch.px + (touch.x - touch.px) * t, y = touch.py + (touch.y - touch.py) * t;
        const angle = (app.random ? app.random() : Math.random()) * TAU, kick = base * (0.4 + (app.random ? app.random() : Math.random()));
        app.particles.push({ x, y, vx: Math.cos(angle)*kick, vy: Math.sin(angle)*kick,
          life: 0.5 + (app.random ? app.random() : Math.random())*1.1, age: 0,
          radius: Math.max(1.2, app.state.size*(0.10 + (app.random ? app.random() : Math.random())*0.12)),
          color: app.state.behaviors.cycle ? null : app.state.color, lastX:x, lastY:y, kind:'scatter' });
      }
    },

    sprayFromSegment(app, touch, distance) {
      if (!app.state.behaviors.spray || distance < 0.35) return;
      const count = Math.min(34, Math.max(5, Math.floor(distance * 1.4)));
      const radius = Math.max(18, app.state.size * 2.8);
      for (let i = 0; i < count; i++) {
        const t = (app.random ? app.random() : Math.random());
        const cx = touch.px + (touch.x-touch.px)*t, cy = touch.py + (touch.y-touch.py)*t;
        const a = (app.random ? app.random() : Math.random())*TAU;
        const r = radius * Math.pow((app.random ? app.random() : Math.random()), 1.8); // dense center, soft edge
        this.advanceHue(app, 0.7, 0.08);
        app.paintMark({ type:'dab', x:cx+Math.cos(a)*r, y:cy+Math.sin(a)*r,
          width: Math.max(1.2, app.state.size*(0.08+(app.random ? app.random() : Math.random())*0.13)),
          color: app.state.behaviors.cycle ? null : app.state.color, alpha:0.22+(app.random ? app.random() : Math.random())*0.34, noEcho:true }, false);
      }
    },

    bloomFromSegment(app, touch, distance) {
      if (!app.state.behaviors.bloom || distance < 1.4) return;
      const chance = Math.min(0.85, distance / 12);
      if ((app.random ? app.random() : Math.random()) > chance) return;
      const t = (app.random ? app.random() : Math.random());
      const x = touch.px+(touch.x-touch.px)*t, y = touch.py+(touch.y-touch.py)*t;
      app.particles.push({ x,y,vx:0,vy:0,life:0.75+(app.random ? app.random() : Math.random())*0.8,age:0,
        radius:Math.max(8, app.state.size*(0.75+(app.random ? app.random() : Math.random())*0.8)),
        color:app.state.behaviors.cycle ? null : app.state.color,lastX:x,lastY:y,kind:'bloom',seed:(app.random ? app.random() : Math.random())*1000 });
    },

    driftFromSegment(app, touch, distance) {
      if (!app.state.behaviors.drift || distance < 0.5) return;
      const dx=touch.x-touch.px, dy=touch.y-touch.py, mag=Math.max(0.001,Math.hypot(dx,dy));
      const speed=Math.min(7.5,0.8+(touch.speed||0)*0.012);
      app.particles.push({x:touch.x,y:touch.y,vx:dx/mag*speed,vy:dy/mag*speed,
        life:0.9+Math.min(1.4,distance/35),age:0,radius:Math.max(1.5,app.state.size*0.33),
        color:app.state.behaviors.cycle?null:app.state.color,lastX:touch.x,lastY:touch.y,kind:'drift'});
    },

    orbitFromSegment(app, touch, distance) {
      if (!app.state.behaviors.orbit || distance < 0.2 || app.activeTouches.size < 2) return;
      app.orbitPhase=(app.orbitPhase+distance*0.012)%TAU;
      for (const other of app.activeTouches.values()) {
        if (other.id===touch.id) continue;
        const phase=Math.PI/2+app.orbitPhase;
        const a=rotatePoint(touch.px,touch.py,other.x,other.y,phase), b=rotatePoint(touch.x,touch.y,other.x,other.y,phase);
        this.advanceHue(app,distance,0.22);
        app.paintMark({type:'line',x1:a.x,y1:a.y,x2:b.x,y2:b.y,width:Math.max(2,app.state.size*0.72),color:app.state.behaviors.cycle?null:app.state.color});
      }
    },

    updateParticles(app, dt) {
      if (!app.particles.length) return;
      const keep=[];
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
            app.paintMark({type:'dab',x:p.x+Math.cos(a)*radial,y:p.y+Math.sin(a)*radial,
              width:Math.max(1.2,p.radius*(0.34+0.18*(1-progress))),color:p.color,noEcho:true,noBleed:true,noFractal:true,
              alpha:Math.max(0.018,0.075*(1-progress))},false);
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
            app.paintMark({type:'dab',x:p.x+Math.cos(a)*R*wobble,y:p.y+Math.sin(a)*R*wobble,
              width:Math.max(1.5,p.radius*0.28),color:p.color,noEcho:true,alpha:0.16*(1-progress)+0.035},false);
          }
          keep.push(p); continue;
        }

        const dampingBase=p.kind==='drift'?0.992:0.985;
        const damping=Math.pow(dampingBase,dt*60); p.vx*=damping; p.vy*=damping;
        p.lastX=p.x; p.lastY=p.y; p.x+=p.vx*dt*60; p.y+=p.vy*dt*60;
        const dist=Math.hypot(p.x-p.lastX,p.y-p.lastY);
        this.advanceHue(app,dist,p.kind==='drift'?0.28:0.18);
        const lifeLeft=Math.max(0.05,1-p.age/p.life);
        app.paintMark({type:'line',x1:p.lastX,y1:p.lastY,x2:p.x,y2:p.y,
          width:Math.max(1,p.radius*(p.kind==='drift'?1.25:1.7)),color:p.color,noEcho:true,
          alpha:Math.max(p.kind==='drift'?0.08:0.12,lifeLeft)},false);
        keep.push(p);
      }
      app.particles=keep;
    }
  };
})();
