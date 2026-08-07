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

  window.TouchBehaviors = {
    echoDelays: [260, 620, 1120],
    radialCopies: 6,

    resolveColor(app, snapshotColor = null) {
      if (app.state.behaviors.cycle) {
        return `hsl(${app.state.hue % 360} 92% 50%)`;
      }
      return snapshotColor || app.state.color;
    },

    advanceHue(app, distance, multiplier = 1) {
      if (!app.state.behaviors.cycle) return;
      app.state.hue = (app.state.hue + Math.max(0.8, distance * 0.38) * multiplier) % 360;
    },

    transformMarks(app, mark) {
      let marks = [mark];

      // Radial is six-fold rotational replication around the canvas center.
      if (app.state.behaviors.radial) {
        const cx = app.cssWidth / 2;
        const cy = app.cssHeight / 2;
        const radial = [];
        for (const base of marks) {
          for (let i = 0; i < this.radialCopies; i++) {
            radial.push(rotateMark(base, cx, cy, i * TAU / this.radialCopies));
          }
        }
        marks = radial;
      }

      // Mirror composes after radial, yielding reflected copies of every result.
      if (app.state.behaviors.mirror) {
        const w = app.cssWidth;
        const mirrored = marks.map(base => {
          const m = { ...base };
          if (m.type === 'line') {
            m.x1 = w - m.x1;
            m.x2 = w - m.x2;
          } else {
            m.x = w - m.x;
          }
          return m;
        });
        marks = marks.concat(mirrored);
      }

      return marks;
    },

    scheduleEchoes(app, mark) {
      if (!app.state.behaviors.echo || mark.noEcho) return;
      const now = performance.now();
      for (const delay of this.echoDelays) {
        app.echoQueue.push({ at: now + delay, mark: { ...mark, echoed: true } });
      }
    },

    scatterFromSegment(app, touch, distance) {
      if (!app.state.behaviors.scatter || distance < 0.5) return;
      const count = Math.min(12, Math.max(1, Math.floor(distance / 5)));
      const speed = touch.speed || 0;
      const base = Math.min(6, 0.7 + speed * 0.035);
      for (let i = 0; i < count; i++) {
        const t = Math.random();
        const x = touch.px + (touch.x - touch.px) * t;
        const y = touch.py + (touch.y - touch.py) * t;
        const angle = Math.random() * TAU;
        const kick = base * (0.4 + Math.random());
        app.particles.push({
          x, y,
          vx: Math.cos(angle) * kick,
          vy: Math.sin(angle) * kick,
          life: 0.5 + Math.random() * 1.1,
          age: 0,
          radius: Math.max(1.2, app.state.size * (0.10 + Math.random() * 0.12)),
          color: app.state.behaviors.cycle ? null : app.state.color,
          lastX: x,
          lastY: y,
          kind: 'scatter'
        });
      }
    },

    driftFromSegment(app, touch, distance) {
      if (!app.state.behaviors.drift || distance < 0.5) return;
      const dx = touch.x - touch.px;
      const dy = touch.y - touch.py;
      const mag = Math.max(0.001, Math.hypot(dx, dy));
      const speed = Math.min(7.5, 0.8 + (touch.speed || 0) * 0.012);
      app.particles.push({
        x: touch.x,
        y: touch.y,
        vx: dx / mag * speed,
        vy: dy / mag * speed,
        life: 0.9 + Math.min(1.4, distance / 35),
        age: 0,
        radius: Math.max(1.5, app.state.size * 0.33),
        color: app.state.behaviors.cycle ? null : app.state.color,
        lastX: touch.x,
        lastY: touch.y,
        kind: 'drift'
      });
    },

    orbitFromSegment(app, touch, distance) {
      if (!app.state.behaviors.orbit || distance < 0.2 || app.activeTouches.size < 2) return;
      app.orbitPhase = (app.orbitPhase + distance * 0.012) % TAU;

      for (const other of app.activeTouches.values()) {
        if (other.id === touch.id) continue;
        const phase = Math.PI / 2 + app.orbitPhase;
        const a = rotatePoint(touch.px, touch.py, other.x, other.y, phase);
        const b = rotatePoint(touch.x, touch.y, other.x, other.y, phase);
        const mark = {
          type: 'line',
          x1: a.x, y1: a.y,
          x2: b.x, y2: b.y,
          width: Math.max(2, app.state.size * 0.72),
          color: app.state.behaviors.cycle ? null : app.state.color
        };
        this.advanceHue(app, distance, 0.22);
        app.paintMark(mark);
      }
    },

    updateParticles(app, dt) {
      if (!app.particles.length) return;
      const touches = [...app.activeTouches.values()];
      const keep = [];
      for (const p of app.particles) {
        p.age += dt;
        if (p.age >= p.life) continue;

        if (touches.length && (app.state.behaviors.pull || app.state.behaviors.repel)) {
          const polarity = (app.state.behaviors.pull ? 1 : 0) - (app.state.behaviors.repel ? 1 : 0);
          if (polarity !== 0) {
            for (const t of touches) {
              const dx = t.x - p.x;
              const dy = t.y - p.y;
              const d2 = dx * dx + dy * dy + 900;
              const force = Math.min(22, 9000 / d2) * polarity;
              p.vx += dx * force * dt;
              p.vy += dy * force * dt;
            }
          }
        }

        const dampingBase = p.kind === 'drift' ? 0.992 : 0.985;
        const damping = Math.pow(dampingBase, dt * 60);
        p.vx *= damping;
        p.vy *= damping;
        p.lastX = p.x;
        p.lastY = p.y;
        p.x += p.vx * dt * 60;
        p.y += p.vy * dt * 60;

        const dist = Math.hypot(p.x - p.lastX, p.y - p.lastY);
        this.advanceHue(app, dist, p.kind === 'drift' ? 0.28 : 0.18);
        const lifeLeft = Math.max(0.05, 1 - p.age / p.life);
        const mark = {
          type: 'line', x1: p.lastX, y1: p.lastY, x2: p.x, y2: p.y,
          width: Math.max(1, p.radius * (p.kind === 'drift' ? 1.25 : 1.7)),
          color: p.color, noEcho: true,
          alpha: Math.max(p.kind === 'drift' ? 0.08 : 0.12, lifeLeft)
        };
        app.paintMark(mark, false);
        keep.push(p);
      }
      app.particles = keep;
    }
  };
})();
