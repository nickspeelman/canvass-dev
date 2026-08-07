(() => {
  const TAU = Math.PI * 2;

  window.TouchBehaviors = {
    echoDelays: [260, 620, 1120],

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
      const marks = [mark];
      if (!app.state.behaviors.mirror) return marks;
      const w = app.cssWidth;
      const mirrored = { ...mark };
      if (mark.type === 'line') {
        mirrored.x1 = w - mark.x1;
        mirrored.x2 = w - mark.x2;
      } else {
        mirrored.x = w - mark.x;
      }
      marks.push(mirrored);
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
          lastY: y
        });
      }
    },

    updateParticles(app, dt) {
      if (!app.particles.length) return;
      const touches = [...app.activeTouches.values()];
      const keep = [];
      for (const p of app.particles) {
        p.age += dt;
        if (p.age >= p.life) continue;

        if (app.state.behaviors.pull && touches.length) {
          for (const t of touches) {
            const dx = t.x - p.x;
            const dy = t.y - p.y;
            const d2 = dx * dx + dy * dy + 900;
            const force = Math.min(22, 9000 / d2);
            p.vx += dx * force * dt;
            p.vy += dy * force * dt;
          }
        }

        const damping = Math.pow(0.985, dt * 60);
        p.vx *= damping;
        p.vy *= damping;
        p.lastX = p.x;
        p.lastY = p.y;
        p.x += p.vx * dt * 60;
        p.y += p.vy * dt * 60;

        const dist = Math.hypot(p.x - p.lastX, p.y - p.lastY);
        this.advanceHue(app, dist, 0.18);
        const mark = {
          type: 'line', x1: p.lastX, y1: p.lastY, x2: p.x, y2: p.y,
          width: Math.max(1, p.radius * 1.7), color: p.color, noEcho: true,
          alpha: Math.max(0.12, 1 - p.age / p.life)
        };
        app.paintMark(mark, false);
        keep.push(p);
      }
      app.particles = keep;
    }
  };
})();
