// Penguin: physics (gravity, landing, walking) + procedural drawing.
(function () {
  const AT = (window.AT = window.AT || {});
  const G = (AT.GRAVITY = 520);
  const MAX_CLIMB = 9;

  class Penguin {
    constructor(id, x, terrain, opts) {
      this.id = id; this.name = opts.name; this.color = opts.color; this.color2 = opts.color2;
      this.x = x; this.y = terrain.surfaceY(x) - 1;
      this.vx = 0; this.vy = 0;
      this.hp = 100; this.displayHp = 100;
      this.alive = true; this.drowned = false; this.grounded = true;
      this.angle = id === 0 ? 45 : 135; // degrees, 0 = right, 90 = up
      this.power = 62;
      this.fishBombs = 2; this.weapon = 'snowball';
      this.walkAnim = 0; this.hurtT = 0; this.blinkT = Math.random() * 3;
    }
    get facing() { return Math.cos((this.angle * Math.PI) / 180) >= 0 ? 1 : -1; }
    get cx() { return this.x; }
    get cy() { return this.y - 19; } // body centre (penguin is drawn at 1.3x)

    feetSolid(t, x, y) { return t.solid(x - 6, y) || t.solid(x, y) || t.solid(x + 6, y); }

    update(dt, t) {
      this.displayHp += (this.hp - this.displayHp) * Math.min(1, dt * 6);
      if (this.hurtT > 0) this.hurtT -= dt;
      this.blinkT -= dt; if (this.blinkT < -0.15) this.blinkT = 2 + Math.random() * 3;
      if (this.drowned) return;
      const onGround = this.feetSolid(t, this.x, this.y + 1);
      if (onGround && this.vy >= 0 && Math.abs(this.vx) < 30) {
        this.vx = 0; this.vy = 0; this.grounded = true;
        // un-stick if somehow embedded
        let n = 0; while (this.feetSolid(t, this.x, this.y) && n++ < 20) this.y--;
        return;
      }
      this.grounded = false;
      this.vy = Math.min(this.vy + G * dt, 900);
      const steps = Math.ceil((Math.max(Math.abs(this.vx), Math.abs(this.vy)) * dt) / 2) + 1;
      const sdt = dt / steps;
      for (let s = 0; s < steps; s++) {
        const nx = this.x + this.vx * sdt;
        if (t.solid(nx, this.y - 13) || t.solid(nx, this.y - 31)) this.vx *= -0.25;
        else this.x = nx;
        if (this.x < 8) { this.x = 8; this.vx = Math.abs(this.vx) * 0.3; }
        if (this.x > AT.W - 8) { this.x = AT.W - 8; this.vx = -Math.abs(this.vx) * 0.3; }
        const ny = this.y + this.vy * sdt;
        if (this.vy > 0 && this.feetSolid(t, this.x, ny)) {
          this.y = ny; let n = 0;
          while (this.feetSolid(t, this.x, this.y) && n++ < 30) this.y--;
          this.vy = 0; this.vx *= 0.4; if (Math.abs(this.vx) < 30) this.vx = 0;
          break;
        } else if (this.vy < 0 && t.solid(this.x, ny - 40)) {
          this.vy = 0;
        } else this.y = ny;
      }
      if (this.y - 12 > AT.WATER_Y) {
        this.drowned = true; this.alive = false; this.hp = 0; this.grounded = true;
        if (AT.onDrown) AT.onDrown(this);
      }
    }

    // Try to waddle dx pixels. Returns distance actually moved.
    walk(dx, t) {
      if (!this.grounded || !this.alive) return 0;
      const dir = Math.sign(dx);
      if (dir !== this.facing) this.angle = 180 - this.angle;
      const nx = Math.max(8, Math.min(AT.W - 8, this.x + dx));
      let ny = this.y, climb = 0;
      while (t.solid(nx, ny) && climb <= MAX_CLIMB) { ny--; climb++; }
      if (climb > MAX_CLIMB || t.solid(nx, ny - 31)) return 0;
      // snap down small slopes
      let d = 0; while (!this.feetSolid(t, nx, ny + 1) && d < MAX_CLIMB) { ny++; d++; }
      const moved = Math.abs(nx - this.x);
      this.x = nx; this.y = ny; this.walkAnim += moved * 0.35;
      return moved;
    }

    draw(c, opts) {
      if (this.drowned) return;
      const { time, active, aiming } = opts;
      c.save();
      c.translate(this.x, this.y);
      c.scale(1.3, 1.3);
      if (!this.alive) { c.rotate(this.facing * -Math.PI / 2 * 0.95); c.translate(0, 4); }
      const f = this.facing;
      const bob = this.alive && this.grounded ? Math.sin(this.walkAnim) * 1.2 : 0;
      const wob = this.alive ? Math.sin(this.walkAnim) * 0.08 : 0;
      if (this.hurtT > 0) c.translate(Math.sin(time * 80) * 2, 0);
      c.scale(f, 1);
      c.rotate(wob);
      // feet
      c.fillStyle = '#ff9f1c';
      c.beginPath(); c.ellipse(-5, -1, 6, 3, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(6, -1, 6, 3, 0, 0, Math.PI * 2); c.fill();
      c.translate(0, bob);
      // back flipper
      c.fillStyle = '#1b2233';
      c.save(); c.translate(-9, -15); c.rotate(0.35); c.beginPath(); c.ellipse(0, 0, 4, 10, 0, 0, Math.PI * 2); c.fill(); c.restore();
      // body
      c.fillStyle = '#1f2638';
      c.beginPath(); c.ellipse(0, -16, 12.5, 16, 0, 0, Math.PI * 2); c.fill();
      // belly
      c.fillStyle = '#fbfdff';
      c.beginPath(); c.ellipse(2.5, -13, 8.5, 11.5, 0, 0, Math.PI * 2); c.fill();
      // face patch
      c.beginPath(); c.ellipse(5, -24, 6, 5, 0, 0, Math.PI * 2); c.fill();
      // scarf
      const flap = Math.sin(time * 9 + this.id) * 2.5 + (opts.wind || 0) * 0.5 * f;
      c.fillStyle = this.color;
      c.beginPath(); c.roundRect ? c.roundRect(-12, -20, 24, 5, 2.5) : c.rect(-12, -20, 24, 5); c.fill();
      c.beginPath(); c.moveTo(-9, -19); c.lineTo(-20, -15 + flap); c.lineTo(-19, -10 + flap); c.lineTo(-7, -16); c.closePath(); c.fill();
      c.fillStyle = this.color2;
      c.fillRect(-4, -20, 2, 5); c.fillRect(3, -20, 2, 5);
      // eye
      if (this.alive) {
        const closed = this.blinkT < 0;
        c.fillStyle = '#fff'; c.beginPath(); c.arc(6, -25, 3.4, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#111';
        if (closed) c.fillRect(3, -25, 6, 1.4);
        else { c.beginPath(); c.arc(7, -25, 1.8, 0, Math.PI * 2); c.fill(); c.fillStyle = '#fff'; c.fillRect(7.3, -26.4, 0.9, 0.9); }
        if (this.hurtT > 0) { c.strokeStyle = '#111'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(3, -29.5); c.lineTo(9, -28); c.stroke(); }
      } else {
        c.strokeStyle = '#111'; c.lineWidth = 1.5; c.beginPath();
        c.moveTo(4, -27); c.lineTo(8, -23); c.moveTo(8, -27); c.lineTo(4, -23); c.stroke();
      }
      // cheek
      c.fillStyle = 'rgba(255,140,160,.55)'; c.beginPath(); c.arc(4, -19.5, 1.8, 0, Math.PI * 2); c.fill();
      // beak
      c.fillStyle = '#ff9f1c';
      c.beginPath(); c.moveTo(10, -24); c.lineTo(17.5, -21.5); c.lineTo(10, -19.5); c.closePath(); c.fill();
      // front flipper: points along aim when active
      c.fillStyle = '#1b2233';
      c.save(); c.translate(2, -16);
      if (active && this.alive) {
        const a = (this.angle * Math.PI) / 180;
        const local = Math.atan2(-Math.sin(a), Math.cos(a) * f);
        c.rotate(local - Math.PI / 2);
        c.beginPath(); c.ellipse(0, 7, 3.6, 9, 0, 0, Math.PI * 2); c.fill();
        // held projectile
        if (aiming !== false) {
          if (this.weapon === 'fish') AT.drawFish(c, 0, 16, Math.PI / 2, 0.75);
          else { c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 16, 4.2, 0, Math.PI * 2); c.fill(); }
        }
      } else {
        c.rotate(-0.25); c.beginPath(); c.ellipse(0, 6, 3.6, 9, 0, 0, Math.PI * 2); c.fill();
      }
      c.restore();
      c.restore();
    }
  }

  AT.drawFish = function (c, x, y, rot, s = 1) {
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
    c.fillStyle = '#ff8a3d';
    c.beginPath(); c.ellipse(0, 0, 10, 5.5, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(-8, 0); c.lineTo(-16, -6); c.lineTo(-16, 6); c.closePath(); c.fill();
    c.fillStyle = '#ffc15e'; c.beginPath(); c.ellipse(1, 1.8, 6, 2.2, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#111'; c.beginPath(); c.arc(5.5, -1.5, 1.4, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#d4581f'; c.lineWidth = 1; c.beginPath(); c.moveTo(-2, -4.5); c.lineTo(-2, 4.5); c.stroke();
    c.restore();
  };

  AT.Penguin = Penguin;
})();
