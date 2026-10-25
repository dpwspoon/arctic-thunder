// Destructible terrain: a 1-byte-per-pixel solidity mask + an offscreen canvas for looks.
(function () {
  const AT = (window.AT = window.AT || {});
  const W = (AT.W = 1200), H = (AT.H = 560);
  AT.WATER_Y = 515;

  class Terrain {
    constructor() {
      this.canvas = document.createElement('canvas');
      this.canvas.width = W; this.canvas.height = H;
      this.ctx = this.canvas.getContext('2d');
      this.mask = new Uint8Array(W * H);
      this.spawnX = [Math.round(W * (0.1 + Math.random() * 0.07)), Math.round(W * (0.83 + Math.random() * 0.07))];
      this.generate();
    }

    generate() {
      const rnd = Math.random, TAU = Math.PI * 2;
      const waves = [
        { amp: 70, k: 1 + rnd() * 1.4 }, { amp: 38, k: 3 + rnd() * 2 },
        { amp: 16, k: 7 + rnd() * 4 }, { amp: 5, k: 18 + rnd() * 10 },
      ].map((w) => ({ amp: w.amp * (0.6 + rnd() * 0.8), freq: (TAU * w.k) / W, phase: rnd() * TAU }));
      const base = 320 + (rnd() - 0.5) * 70;
      const valley = rnd() < 0.55 ? { cx: W * (0.38 + rnd() * 0.24), w: 70 + rnd() * 60, d: 110 + rnd() * 120 } : null;
      const hill = rnd() < 0.5 ? { cx: W * (0.4 + rnd() * 0.2), w: 90 + rnd() * 60, d: -(80 + rnd() * 80) } : null;
      const h = new Float32Array(W);
      for (let x = 0; x < W; x++) {
        let y = base;
        for (const w of waves) y += w.amp * Math.sin(x * w.freq + w.phase);
        for (const b of [valley, hill]) if (b) y += b.d * Math.exp(-(((x - b.cx) / b.w) ** 2));
        h[x] = y;
      }
      // Make sure each spawn spot is comfortably above water and not too high.
      for (const sx of this.spawnX) {
        const lift = Math.max(0, h[sx] - 400), drop = Math.max(0, 200 - h[sx]);
        for (let x = 0; x < W; x++) {
          const f = Math.exp(-(((x - sx) / 110) ** 2));
          h[x] += (drop - lift) * f;
        }
      }
      for (let x = 0; x < W; x++) h[x] = Math.max(130, Math.min(548, h[x]));
      this.heights = h;

      // Mask
      const m = this.mask; m.fill(0);
      for (let x = 0; x < W; x++) for (let y = Math.ceil(h[x]); y < H; y++) m[y * W + x] = 1;

      // Visuals
      const c = this.ctx; c.clearRect(0, 0, W, H);
      c.save();
      c.beginPath(); c.moveTo(0, H);
      for (let x = 0; x < W; x += 2) c.lineTo(x, h[x]);
      c.lineTo(W, h[W - 1]); c.lineTo(W, H); c.closePath();
      const g = c.createLinearGradient(0, 130, 0, H);
      g.addColorStop(0, '#eef8ff'); g.addColorStop(0.35, '#bfe0f5'); g.addColorStop(0.7, '#7fb2d9'); g.addColorStop(1, '#3f6f9c');
      c.fillStyle = g; c.fill();
      c.globalCompositeOperation = 'source-atop';
      // ice strata
      for (let i = 0; i < 26; i++) {
        c.strokeStyle = `rgba(255,255,255,${0.08 + rnd() * 0.12})`; c.lineWidth = 1 + rnd() * 3;
        const y0 = 180 + rnd() * 380; c.beginPath(); c.moveTo(-10, y0);
        for (let x = 0; x <= W + 40; x += 40) c.lineTo(x, y0 + Math.sin(x * 0.01 + i) * 12 + (rnd() - 0.5) * 6);
        c.stroke();
      }
      // crystals / sparkles
      for (let i = 0; i < 260; i++) {
        c.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.5})`;
        c.fillRect(rnd() * W, 150 + rnd() * 410, 1 + rnd() * 2, 1 + rnd() * 2);
      }
      // deeper blue blocks
      for (let i = 0; i < 18; i++) {
        c.fillStyle = `rgba(40,90,150,${0.06 + rnd() * 0.08})`;
        c.beginPath(); const bx = rnd() * W, by = 300 + rnd() * 260, br = 20 + rnd() * 50;
        c.moveTo(bx, by - br); c.lineTo(bx + br, by); c.lineTo(bx, by + br * 0.7); c.lineTo(bx - br * 0.8, by); c.fill();
      }
      // fluffy snow cap
      c.beginPath(); c.moveTo(0, h[0] + 6);
      for (let x = 0; x < W; x += 2) c.lineTo(x, h[x] + 6);
      c.lineTo(W, h[W - 1] + 6);
      c.strokeStyle = '#ffffff'; c.lineWidth = 14; c.lineJoin = 'round'; c.stroke();
      c.strokeStyle = 'rgba(160,200,235,0.6)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, h[0] + 13);
      for (let x = 0; x < W; x += 2) c.lineTo(x, h[x] + 13 + Math.sin(x * 0.2) * 1.2);
      c.stroke();
      c.restore();
    }

    solid(x, y) {
      x |= 0; y |= 0;
      if (x < 0 || x >= W || y < 0) return false;
      if (y >= H) return true;
      return this.mask[y * W + x] === 1;
    }

    // First solid y at or below fromY in column x (H if none).
    surfaceY(x, fromY = 0) {
      x |= 0; if (x < 0 || x >= W) return H;
      for (let y = Math.max(0, fromY | 0); y < H; y++) if (this.mask[y * W + x]) return y;
      return H;
    }

    carve(cx, cy, r) {
      const m = this.mask; let removed = 0;
      const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
      const r2 = r * r;
      for (let y = y0; y <= y1; y++) {
        const dy = y - cy, row = y * W;
        for (let x = x0; x <= x1; x++) {
          const dx = x - cx;
          if (dx * dx + dy * dy <= r2 && m[row + x]) { m[row + x] = 0; removed++; }
        }
      }
      const c = this.ctx;
      c.save();
      c.globalCompositeOperation = 'destination-out';
      c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
      c.globalCompositeOperation = 'source-atop';
      c.strokeStyle = 'rgba(60,110,170,0.55)'; c.lineWidth = 7;
      c.beginPath(); c.arc(cx, cy, r + 2.5, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = 'rgba(230,248,255,0.7)'; c.lineWidth = 2;
      c.beginPath(); c.arc(cx, cy, r + 7, 0, Math.PI * 2); c.stroke();
      c.restore();
      return removed;
    }

    solidCount() { let n = 0; for (let i = 0; i < this.mask.length; i++) n += this.mask[i]; return n; }
  }
  AT.Terrain = Terrain;
})();
