// DOM wiring: HUD, buttons, touch/mouse/keyboard input, main loop.
// Kept separate from game logic so a Capacitor wrapper can reuse everything as-is.
(function () {
  const AT = window.AT;
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const game = (AT.game = new AT.Game(canvas));

  // ---------- iOS niceties ----------
  ['gesturestart', 'gesturechange', 'dblclick'].forEach((e) => document.addEventListener(e, (ev) => ev.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  const unlock = () => AT.Audio.unlock();
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('touchend', unlock);
  window.addEventListener('resize', () => game.resize());
  window.addEventListener('orientationchange', () => setTimeout(() => game.resize(), 200));

  // ---------- HUD ----------
  const hud = $('hud'), banner = $('banner');
  let bannerTimer = null;
  function showBanner(text, color) {
    banner.textContent = text; banner.style.color = color || '#fff';
    banner.classList.add('show');
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => banner.classList.remove('show'), 1300);
  }
  function setText(el, t) { if (el.textContent !== t) el.textContent = t; }
  function updateHud() {
    const g = game, p = g.cur;
    g.penguins.forEach((pg, i) => {
      const fill = $('hp' + i);
      fill.style.width = pg.hp + '%';
      fill.classList.toggle('mid', pg.hp <= 50 && pg.hp > 25);
      fill.classList.toggle('low', pg.hp <= 25);
      $('card' + i).classList.toggle('active', i === g.current && g.state !== 'over');
    });
    setText($('turnText'), g.state === 'over' ? 'Game over' : `${p.name}'s turn`);
    $('turnText').style.color = p.color;
    const w = g.wind, wf = $('windFill');
    wf.style.width = Math.abs(w) * 5 + '%';
    wf.style.left = w >= 0 ? '50%' : 50 - Math.abs(w) * 5 + '%';
    setText($('windText'), w === 0 ? 'calm' : (w > 0 ? '→ ' : '← ') + Math.abs(w));
    const fishTxt = p.fishBombs > 0 ? `🐟 Fish ×${p.fishBombs}` : '🐟 Fish ×0';
    setText($('btnWeapon'), p.weapon === 'fish' ? `🐟 FISH BOMB (${p.fishBombs})` : `❄️ Snowball`);
    $('btnWeapon').title = fishTxt;
    $('btnWeapon').classList.toggle('pressed', p.weapon === 'fish');
    let ang = Math.round(p.angle); if (ang > 90) ang = 180 - ang; // show elevation, not raw heading
    setText($('aimInfo'), g.state === 'aim' ? `${ang}°  ·  ${Math.round(p.power)}%` : g.state === 'flying' ? 'Incoming!' : '…');
    $('moveFill').style.width = (g.moveLeft / AT.MOVE_MAX) * 100 + '%';
    hud.classList.toggle('busy', g.state !== 'aim');
  }
  game.on('hud', updateHud);
  game.on('turn', (p) => showBanner(`${p.name}'s turn`, p.color));
  game.on('over', (w) => {
    setTimeout(() => {
      $('winText').textContent = w ? `🏆 ${w.name} wins!` : "It's a draw!";
      $('winText').style.color = w ? w.color : '#fff';
      $('winSub').textContent = w ? `${w.hp} HP left · ${game.shots} shots fired` : 'Both penguins went down together.';
      $('win').classList.remove('hidden');
    }, 900);
  });

  // ---------- screens ----------
  function start() {
    AT.Audio.unlock(); AT.Audio.click();
    $('title').classList.add('hidden'); $('win').classList.add('hidden');
    hud.classList.remove('hidden');
    game.newGame();
  }
  $('btnStart').addEventListener('click', start);
  $('btnRematch').addEventListener('click', start);
  $('btnMenu').addEventListener('click', () => {
    $('win').classList.add('hidden'); hud.classList.add('hidden'); $('title').classList.remove('hidden');
    game.setupWorld(); game.state = 'title';
  });
  $('btnPortrait').addEventListener('click', () => { document.body.classList.add('portrait-ok'); game.resize(); });
  $('btnMute').addEventListener('click', () => { AT.Audio.setMuted(!AT.Audio.muted); $('btnMute').textContent = AT.Audio.muted ? '🔇' : '🔊'; });

  // ---------- buttons ----------
  $('btnFire').addEventListener('click', () => game.fire());
  $('btnWeapon').addEventListener('click', () => game.toggleWeapon());
  function holdButton(el, dir) {
    const down = (e) => { e.preventDefault(); if (game.canAct()) { game.walkDir = dir; el.classList.add('pressed'); } try { el.setPointerCapture(e.pointerId); } catch (_) {} };
    const up = () => { if (game.walkDir === dir) game.walkDir = 0; el.classList.remove('pressed'); };
    el.addEventListener('pointerdown', down);
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => el.addEventListener(ev, up));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  holdButton($('btnLeft'), -1);
  holdButton($('btnRight'), 1);

  // ---------- drag-to-aim on the playfield ----------
  let aimPointer = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (aimPointer !== null) return;
    if (game.beginAim(e.clientX, e.clientY)) { aimPointer = e.pointerId; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} }
  });
  canvas.addEventListener('pointermove', (e) => { if (e.pointerId === aimPointer) game.moveAim(e.clientX, e.clientY); });
  const endAim = (e) => { if (e.pointerId === aimPointer) { aimPointer = null; game.endAim(); } };
  canvas.addEventListener('pointerup', endAim);
  canvas.addEventListener('pointercancel', endAim);

  // ---------- keyboard (desktop) ----------
  const keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (game.state === 'aim') game.fire(); }
    if (e.key === 'w' || e.key === 'W' || e.key === 'Tab') { e.preventDefault(); game.toggleWeapon(); }
  });
  window.addEventListener('keyup', (e) => { keys[e.key] = false; });
  function pollKeys(dt) {
    if (!game.canAct()) return;
    const p = game.cur;
    const f = p.facing;
    if (keys.ArrowUp) game.setAim(p.angle + 50 * dt * f, p.power);
    if (keys.ArrowDown) game.setAim(p.angle - 50 * dt * f, p.power);
    if (keys.ArrowRight && !keys.Shift) game.setAim(p.angle, p.power + 40 * dt);
    if (keys.ArrowLeft && !keys.Shift) game.setAim(p.angle, p.power - 40 * dt);
    const kd = (keys.d || keys.D ? 1 : 0) - (keys.a || keys.A ? 1 : 0);
    if (kd) game.walkDir = kd; else if (!$('btnLeft').classList.contains('pressed') && !$('btnRight').classList.contains('pressed')) game.walkDir = 0;
  }

  // ---------- loop ----------
  let last = performance.now(), acc = 0;
  const STEP = 1 / 60;
  function frame(now) {
    acc += Math.min(0.1, (now - last) / 1000); last = now;
    let n = 0;
    while (acc >= STEP && n++ < 6) { pollKeys(STEP); game.update(STEP); acc -= STEP; }
    if (game.state === 'flying' || game.state === 'settle') updateHud();
    game.render();
    requestAnimationFrame(frame);
  }
  updateHud();
  requestAnimationFrame(frame);
})();
