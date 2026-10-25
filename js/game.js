// Core game: state machine, projectiles, explosions, particles, rendering.
(function () {
  const AT = (window.AT = window.AT || {});
  const W = AT.W, H = AT.H, WATER_Y = AT.WATER_Y, G = AT.GRAVITY;
  const MOVE_MAX = 90;          // world px a penguin may waddle per turn
  const WALK_SPEED = 55;        // px/s
  const MAX_SPEED = 860;        // projectile speed at 100% power
  const WIND_ACC = 13;          // px/s^2 per wind unit
  const WEAPONS = {
    snowball: { label: '❄️ Snowball', radius: 30, damage: 34, knock: 240, r: 5 },
    fish:     { label: '🐟 Fish Bomb', radius: 58, damage: 55, knock: 430, r: 8 },
  };
  AT.WEAPONS = WEAPONS;

  const PLAYERS = [
    { name: 'Player 1', color: '#ff4d5e', color2: '#ffd6db' },
    { name: 'Player 2', color: '#2fa8ff', color2: '#d4eeff' },
  ];

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.state = 'title';
      this.time = 0; this.shake = 0; this.flash = 0;
      this.particles = []; this.texts = []; this.projectiles = [];
      this.snow = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() * 1.5, v: 0.02 + Math.random() * 0.05 }));
      this.stars = Array.from({ length: 60 }, () => ({ x: Math.random(), y: Math.random() * 0.5, r: Math.random() * 1.3 + 0.3, p: Math.random() * 6 }));
      this.listeners = {};
      this.walkDir = 0; this.aimDrag = null;
      this.shots = 0; this.turnCount = 0;
      AT.onDrown = (p) => {
        this.splash(p.x);
        this.texts.push({ x: p.x, y: WATER_Y - 30, text: 'SPLASH! OUT!', color: '#9fe7ff', t: 0 });
        this.emit('hud');
      };
      this.resize();
      this.setupWorld(); // attract-mode scene behind the title screen
    }

    on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
    emit(ev, ...a) { (this.listeners[ev] || []).forEach((f) => f(...a)); }

    // ---------- setup ----------
    setupWorld() {
      this.terrain = new AT.Terrain();
      this.penguins = PLAYERS.map((p, i) => new AT.Penguin(i, this.terrain.spawnX[i], this.terrain, p));
      this.mountains = this.makeMountains();
      this.particles = []; this.texts = []; this.projectiles = [];
      this.current = 0; this.wind = 0; this.moveLeft = MOVE_MAX;
    }

    newGame() {
      this.setupWorld();
      this.current = Math.random() < 0.5 ? 0 : 1;
      this.shots = 0; this.turnCount = 0;
      this.startTurn();
    }

    makeMountains() {
      const pts = []; let y = 230;
      for (let x = -200; x <= W + 200; x += 40) { y += (Math.random() - 0.5) * 60; y = Math.max(150, Math.min(300, y)); pts.push([x, y]); }
      return pts;
    }

    startTurn() {
      this.turnCount++;
      const r = Math.random() * 2 - 1;
      this.wind = Math.round(Math.sign(r) * Math.pow(Math.abs(r), 1.3) * 10);
      this.moveLeft = MOVE_MAX;
      this.state = 'aim';
      this.walkDir = 0; this.aimDrag = null;
      this.emit('turn', this.cur);
      this.emit('hud');
    }

    get cur() { return this.penguins[this.current]; }

    // ---------- actions ----------
    canAct() { return this.state === 'aim' && this.cur.alive; }

    setAim(angle, power) {
      const p = this.cur;
      p.angle = Math.max(-80, Math.min(260, angle));
      p.power = Math.max(5, Math.min(100, power));
      this.emit('hud');
    }

    toggleWeapon() {
      if (!this.canAct()) return;
      const p = this.cur;
      if (p.weapon === 'snowball' && p.fishBombs > 0) p.weapon = 'fish';
      else p.weapon = 'snowball';
      AT.Audio.click(); this.emit('hud');
    }

    launchVector(p) {
      const a = (p.angle * Math.PI) / 180, sp = (p.power / 100) * MAX_SPEED;
      const dx = Math.cos(a), dy = -Math.sin(a);
      return { x: p.cx + dx * 20, y: p.cy + dy * 20, vx: dx * sp, vy: dy * sp };
    }

    fire() {
      if (!this.canAct()) return false;
      const p = this.cur;
      let weapon = p.weapon;
      if (weapon === 'fish') { if (p.fishBombs <= 0) weapon = 'snowball'; else p.fishBombs--; }
      const v = this.launchVector(p);
      this.projectiles.push({ ...v, type: weapon, age: 0, trail: [], owner: p, spin: 0 });
      p.weapon = 'snowball'; // Fish Bomb is picked per shot, so you never waste one by accident
      this.state = 'flying'; this.walkDir = 0; this.aimDrag = null;
      this.shots++;
      AT.Audio.fire();
      this.emit('hud');
      return true;
    }

    // Pure trajectory sim (no penguin collisions). Used by the aim preview and tests.
    predict(angle, power, maxT = 12) {
      const p = this.cur, saveA = p.angle, saveP = p.power;
      p.angle = angle; p.power = power;
      let { x, y, vx, vy } = this.launchVector(p);
      p.angle = saveA; p.power = saveP;
      const dt = 1 / 240;
      for (let t = 0; t < maxT; t += dt) {
        vx += this.wind * WIND_ACC * dt; vy += G * dt; x += vx * dt; y += vy * dt;
        if (y >= WATER_Y || x < -300 || x > W + 300) return { x, y, water: true };
        if (this.terrain.solid(x, y)) return { x, y, water: false };
      }
      return null;
    }

    // ---------- simulation ----------
    update(dt) {
      this.time += dt;
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 30);
      if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3);

      // walking
      if (this.state === 'aim' && this.walkDir && this.moveLeft > 0 && this.cur.grounded) {
        const want = Math.min(this.moveLeft, WALK_SPEED * dt);
        const moved = this.cur.walk(this.walkDir * want, this.terrain);
        this.moveLeft = Math.max(0, this.moveLeft - (moved || want * 0.5));
        this.stepT = (this.stepT || 0) + dt; if (this.stepT > 0.18) { this.stepT = 0; AT.Audio.step(); }
        this.emit('hud');
      }

      for (const p of this.penguins) p.update(dt, this.terrain);
      this.updateProjectiles(dt);
      this.updateParticles(dt);

      if (this.state === 'flying' && this.projectiles.length === 0) { this.state = 'settle'; this.settleT = 0; }
      if (this.state === 'settle') {
        this.settleT += dt;
        const still = this.penguins.every((p) => p.grounded || p.drowned);
        if ((still && this.settleT > 0.9) || this.settleT > 6) this.endTurn();
      }
      if (this.state === 'title') { this.attractT = (this.attractT || 0) + dt; }
    }

    updateProjectiles(dt) {
      const steps = 4, sdt = dt / steps;
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const pr = this.projectiles[i];
        pr.age += dt; pr.spin += dt * 10;
        let done = false;
        for (let s = 0; s < steps && !done; s++) {
          pr.vx += this.wind * WIND_ACC * sdt; pr.vy += G * sdt;
          pr.x += pr.vx * sdt; pr.y += pr.vy * sdt;
          if (pr.y >= WATER_Y) { this.splash(pr.x); done = true; break; }
          if (pr.x < -300 || pr.x > W + 300 || pr.age > 14) { done = true; break; }
          if (this.terrain.solid(pr.x, pr.y)) { this.explode(pr.x, pr.y, pr.type); done = true; break; }
          for (const p of this.penguins) {
            if (p.drowned || (p === pr.owner && pr.age < 0.25)) continue;
            const dx = pr.x - p.cx, dy = pr.y - p.cy;
            if (dx * dx + dy * dy < (18 + WEAPONS[pr.type].r) ** 2) { this.explode(pr.x, pr.y, pr.type); done = true; break; }
          }
        }
        pr.trail.push({ x: pr.x, y: pr.y });
        if (pr.trail.length > 45) pr.trail.shift();
        if (!done && Math.random() < 0.5) this.particles.push({ x: pr.x, y: pr.y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, life: 0.5, max: 0.5, size: 2, color: pr.type === 'fish' ? '#ffb36b' : '#ffffff', g: 0 });
        if (done) this.projectiles.splice(i, 1);
      }
    }

    updateParticles(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const q = this.particles[i];
        q.life -= dt;
        if (q.life <= 0) { this.particles.splice(i, 1); continue; }
        q.vy += (q.g ?? G * 0.8) * dt; q.vx *= 1 - dt * (q.drag ?? 0.6);
        q.x += q.vx * dt; q.y += q.vy * dt;
      }
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const t = this.texts[i]; t.t += dt; t.y -= 30 * dt;
        if (t.t > 1.6) this.texts.splice(i, 1);
      }
    }

    explode(x, y, type) {
      const w = WEAPONS[type];
      const removed = this.terrain.carve(x, y, w.radius);
      this.lastExplosion = { x, y, type, removed };
      for (const p of this.penguins) {
        if (p.drowned) continue;
        const dx = p.cx - x, dy = p.cy - y, d = Math.hypot(dx, dy);
        const reach = w.radius + 20;
        if (d >= reach) continue;
        const f = 1 - d / reach;
        const dmg = Math.max(1, Math.round(w.damage * Math.min(1, 0.25 + f)));
        if (p.alive) {
          p.hp = Math.max(0, p.hp - dmg);
          p.hurtT = 0.5;
          this.texts.push({ x: p.cx, y: p.cy - 36, text: `-${dmg}`, color: '#ffe27a', t: 0 });
          if (p.hp <= 0) { p.alive = false; this.texts.push({ x: p.cx, y: p.cy - 50, text: 'KO!', color: '#ff6b6b', t: 0 }); }
        }
        const nx = d > 0.01 ? dx / d : 0, ny = d > 0.01 ? dy / d : -1;
        p.vx += nx * w.knock * f;
        p.vy += ny * w.knock * f - 160 * f;
        p.grounded = false;
        this.emit('damage', p, dmg);
      }
      // particles
      const n = type === 'fish' ? 70 : 36;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * (type === 'fish' ? 380 : 260);
        const pal = type === 'fish' ? ['#ffffff', '#cfeaff', '#ffb36b', '#ff7a3d', '#ffe27a'] : ['#ffffff', '#e3f4ff', '#bfe0f5', '#9fd0f0'];
        this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: 0.6 + Math.random() * 0.9, max: 1.5, size: 2 + Math.random() * 3.5, color: pal[(Math.random() * pal.length) | 0] });
      }
      this.particles.push({ x, y, vx: 0, vy: 0, life: 0.35, max: 0.35, ring: w.radius, g: 0, color: '#ffffff' });
      this.shake = Math.min(14, w.radius * 0.22);
      this.flash = type === 'fish' ? 0.5 : 0.25;
      AT.Audio.boom(type === 'fish');
      this.emit('explode', this.lastExplosion);
      this.emit('hud');
    }

    splash(x) {
      for (let i = 0; i < 26; i++) {
        this.particles.push({ x: x + (Math.random() - 0.5) * 14, y: WATER_Y, vx: (Math.random() - 0.5) * 140, vy: -120 - Math.random() * 260, life: 0.9, max: 0.9, size: 2 + Math.random() * 2.5, color: Math.random() < 0.5 ? '#9fe7ff' : '#ffffff' });
      }
      AT.Audio.splash();
    }

    endTurn() {
      const alive = this.penguins.filter((p) => p.alive);
      if (alive.length <= 1) {
        this.state = 'over';
        this.winner = alive[0] || null;
        AT.Audio.win();
        this.emit('over', this.winner);
        this.emit('hud');
        return;
      }
      this.current = 1 - this.current;
      this.startTurn();
    }

    // ---------- input helpers ----------
    screenToWorld(sx, sy) { return { x: (sx - this.offX) / this.scale, y: (sy - this.offY) / this.scale }; }

    beginAim(sx, sy) {
      if (!this.canAct()) return false;
      this.aimDrag = { sx, sy, cx: sx, cy: sy };
      return true;
    }
    moveAim(sx, sy) {
      const d = this.aimDrag; if (!d) return;
      d.cx = sx; d.cy = sy;
      const dx = d.sx - sx, dy = d.sy - sy; // slingshot: pull back, launch forward
      const len = Math.hypot(dx, dy);
      if (len < 8) return;
      const full = Math.min(this.cw, this.ch) * 0.42;
      const ang = (Math.atan2(-dy, dx) * 180) / Math.PI;
      let a = ang; if (a < -90) a += 360; // keep in [-90, 270)
      this.setAim(a, (len / full) * 100);
    }
    endAim() { this.aimDrag = null; }

    // ---------- rendering ----------
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const cw = window.innerWidth, ch = window.innerHeight;
      this.cw = cw; this.ch = ch; this.dpr = dpr;
      this.canvas.width = Math.round(cw * dpr); this.canvas.height = Math.round(ch * dpr);
      // fit the world, allowing the top 18% of (mostly empty) sky to be cropped on wide screens
      this.scale = Math.min(cw / W, ch / (H * 0.82));
      this.offX = (cw - W * this.scale) / 2;
      this.offY = ch - H * this.scale;
      if (this.offY > 0) this.offY = this.offY * 0.6;
    }

    render() {
      const c = this.ctx, { cw, ch, dpr } = this, t = this.time;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      // sky
      const g = c.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, '#071430'); g.addColorStop(0.55, '#16406e'); g.addColorStop(1, '#3d86b8');
      c.fillStyle = g; c.fillRect(0, 0, cw, ch);
      for (const s of this.stars) { c.globalAlpha = 0.4 + 0.4 * Math.sin(t * 2 + s.p); c.fillStyle = '#fff'; c.beginPath(); c.arc(s.x * cw, s.y * ch, s.r, 0, 7); c.fill(); }
      c.globalAlpha = 1;
      // aurora
      for (let k = 0; k < 3; k++) {
        c.beginPath();
        for (let x = 0; x <= cw; x += 16) {
          const y = ch * (0.16 + k * 0.05) + Math.sin(x * 0.006 + t * 0.4 + k * 2) * 18 + Math.sin(x * 0.017 - t * 0.7) * 8;
          x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
        }
        c.strokeStyle = k === 1 ? 'rgba(140,120,255,0.13)' : 'rgba(90,255,180,0.14)'; c.lineWidth = 26 - k * 6; c.stroke();
      }

      const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0, sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
      const s = this.scale;
      c.setTransform(dpr * s, 0, 0, dpr * s, dpr * (this.offX + sx), dpr * (this.offY + sy));

      // distant mountains
      c.fillStyle = 'rgba(160,200,235,0.25)';
      c.beginPath(); c.moveTo(-400, H);
      for (const [x, y] of this.mountains) c.lineTo(x, y);
      c.lineTo(W + 400, H); c.closePath(); c.fill();
      // side fill beyond world so letterboxing looks natural
      c.drawImage(this.terrain.canvas, 0, 0);

      // aim guide
      const p = this.cur;
      if (this.state === 'aim' && p && p.alive) this.drawAim(c, p);

      for (const pg of this.penguins) pg.draw(c, { time: t, active: pg === p && this.state !== 'title' && this.state !== 'over', aiming: this.state === 'aim', wind: this.wind });
      // labels + hp bars
      for (const pg of this.penguins) {
        if (pg.drowned) continue;
        const bx = pg.x - 17, by = pg.y - 60;
        c.fillStyle = 'rgba(8,22,48,.65)'; c.fillRect(bx - 1, by - 1, 36, 6);
        c.fillStyle = pg.hp > 50 ? '#5be37a' : pg.hp > 25 ? '#f4b73c' : '#ff4d4d';
        c.fillRect(bx, by, 34 * (pg.displayHp / 100), 4);
        c.font = '900 10px -apple-system, sans-serif'; c.textAlign = 'center';
        c.fillStyle = pg.color; c.fillText(pg.id === 0 ? 'P1' : 'P2', pg.x, by - 3);
      }
      // current-turn bouncing arrow
      if (p && this.state === 'aim') {
        const ay = p.y - 80 + Math.sin(t * 5) * 3;
        c.fillStyle = '#ffe27a'; c.beginPath(); c.moveTo(p.x - 6, ay); c.lineTo(p.x + 6, ay); c.lineTo(p.x, ay + 8); c.closePath(); c.fill();
      }

      // projectiles
      for (const pr of this.projectiles) {
        c.lineWidth = pr.type === 'fish' ? 3 : 2;
        for (let i = 1; i < pr.trail.length; i++) {
          c.strokeStyle = pr.type === 'fish' ? `rgba(255,170,90,${i / pr.trail.length * 0.7})` : `rgba(255,255,255,${i / pr.trail.length * 0.7})`;
          c.beginPath(); c.moveTo(pr.trail[i - 1].x, pr.trail[i - 1].y); c.lineTo(pr.trail[i].x, pr.trail[i].y); c.stroke();
        }
        if (pr.type === 'fish') AT.drawFish(c, pr.x, pr.y, Math.atan2(pr.vy, pr.vx), 1);
        else { c.fillStyle = '#fff'; c.beginPath(); c.arc(pr.x, pr.y, 5, 0, 7); c.fill(); c.strokeStyle = '#a9d6f5'; c.lineWidth = 1.2; c.stroke(); }
      }
      // particles
      for (const q of this.particles) {
        const a = Math.max(0, q.life / q.max);
        if (q.ring) {
          c.strokeStyle = `rgba(255,255,255,${a})`; c.lineWidth = 4 * a;
          c.beginPath(); c.arc(q.x, q.y, q.ring * (1.3 - a * 0.6), 0, 7); c.stroke();
          continue;
        }
        c.globalAlpha = Math.min(1, a * 1.5); c.fillStyle = q.color;
        c.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
      }
      c.globalAlpha = 1;

      // water
      c.fillStyle = 'rgba(20,90,150,0.85)';
      c.beginPath(); c.moveTo(-600, H + 400);
      for (let x = -600; x <= W + 600; x += 12) c.lineTo(x, WATER_Y + Math.sin(x * 0.03 + t * 2) * 3 + Math.sin(x * 0.011 - t) * 2);
      c.lineTo(W + 600, H + 400); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(190,240,255,0.7)'; c.lineWidth = 2;
      c.beginPath();
      for (let x = -600; x <= W + 600; x += 12) { const y = WATER_Y + Math.sin(x * 0.03 + t * 2) * 3 + Math.sin(x * 0.011 - t) * 2; x === -600 ? c.moveTo(x, y) : c.lineTo(x, y); }
      c.stroke();
      // ice floes
      for (let i = 0; i < 5; i++) {
        const fx = ((i * 263 + t * 6) % (W + 200)) - 100, fy = WATER_Y + 4 + Math.sin(t * 1.5 + i) * 1.5;
        c.fillStyle = 'rgba(235,248,255,0.75)'; c.fillRect(fx, fy, 22 + (i % 3) * 8, 4);
      }

      // floating texts
      c.textAlign = 'center';
      for (const tx of this.texts) {
        c.globalAlpha = Math.max(0, 1 - tx.t / 1.6);
        c.font = '900 18px -apple-system, sans-serif';
        c.lineWidth = 4; c.strokeStyle = 'rgba(8,22,48,.8)'; c.strokeText(tx.text, tx.x, tx.y);
        c.fillStyle = tx.color; c.fillText(tx.text, tx.x, tx.y);
      }
      c.globalAlpha = 1;

      // screen-space: falling snow + flash + drag guide
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.fillStyle = 'rgba(255,255,255,0.8)';
      for (const f of this.snow) {
        f.y += f.v * 0.016; f.x += (this.wind * 0.0004 + Math.sin(t + f.s) * 0.0003);
        if (f.y > 1) { f.y = -0.02; f.x = Math.random(); }
        if (f.x > 1) f.x -= 1; if (f.x < 0) f.x += 1;
        c.beginPath(); c.arc(f.x * cw, f.y * ch, f.s, 0, 7); c.fill();
      }
      if (this.flash > 0) { c.fillStyle = `rgba(255,255,255,${this.flash * 0.5})`; c.fillRect(0, 0, cw, ch); }
      if (this.aimDrag) {
        const d = this.aimDrag;
        c.strokeStyle = 'rgba(255,226,122,0.6)'; c.lineWidth = 2; c.setLineDash([5, 5]);
        c.beginPath(); c.moveTo(d.sx, d.sy); c.lineTo(d.cx, d.cy); c.stroke(); c.setLineDash([]);
        c.fillStyle = 'rgba(255,226,122,0.8)'; c.beginPath(); c.arc(d.sx, d.sy, 6, 0, 7); c.fill();
        c.beginPath(); c.arc(d.cx, d.cy, 10, 0, 7); c.strokeStyle = 'rgba(255,255,255,0.8)'; c.stroke();
      }
    }

    drawAim(c, p) {
      const v = this.launchVector(p);
      // short dotted arc preview (no wind - the wind is your problem!)
      let { x, y, vx, vy } = v;
      const dt = 1 / 60;
      c.fillStyle = '#ffe27a'; c.strokeStyle = 'rgba(8,22,48,0.6)'; c.lineWidth = 1;
      for (let i = 0; i < 26; i++) {
        for (let k = 0; k < 2; k++) { vy += G * dt; x += vx * dt; y += vy * dt; }
        if (this.terrain.solid(x, y)) break;
        if (i % 2 === 0) { c.globalAlpha = 1 - i / 30; c.beginPath(); c.arc(x, y, 3.2, 0, 7); c.fill(); c.stroke(); }
      }
      c.globalAlpha = 1;
      // power ring
      const a = (p.angle * Math.PI) / 180, L = 22 + p.power * 0.45;
      c.strokeStyle = '#ffe27a'; c.lineWidth = 3; c.lineCap = 'round';
      c.beginPath(); c.moveTo(p.cx + Math.cos(a) * 18, p.cy - Math.sin(a) * 18); c.lineTo(p.cx + Math.cos(a) * L, p.cy - Math.sin(a) * L); c.stroke();
      c.lineCap = 'butt';
    }
  }

  AT.Game = Game;
  AT.MOVE_MAX = MOVE_MAX;
})();
