const { chromium } = require('playwright-core');
const OUT = '/workspace/arctic-thunder/screenshots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  await page.goto('http://localhost:8765/index.html');
  await sleep(1200);
  await page.screenshot({ path: OUT + '/01-title.png' });
  await page.tap('#btnStart');
  await sleep(1600);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const S = () => page.evaluate(() => { const g = AT.game; return { state: g.state, current: g.current, hp: g.penguins.map((p) => p.hp), solid: g.terrain.solidCount(), angle: g.cur.angle, power: g.cur.power, wind: g.wind, x: g.penguins.map(p=>Math.round(p.x)) }; });
  const waitTurn = async (prev) => { for (let i = 0; i < 200; i++) { const s = await S(); if ((s.state === 'aim' && s.current !== prev) || s.state === 'over') return s; await sleep(100); } throw new Error('turn did not switch'); };

  let s0 = await S(); console.log('start', s0);
  // walk a bit with the walk button (touch hold)
  const btn = await page.$(s0.current === 0 ? '#btnRight' : '#btnLeft');
  const bb = await btn.boundingBox();
  await touch('touchStart', bb.x + bb.width / 2, bb.y + bb.height / 2); await sleep(700); await touch('touchEnd');
  const sWalk = await S(); console.log('after walk x', s0.x, '->', sWalk.x);

  // Shot 1: real touch drag (slingshot) toward the opponent
  const dir = s0.current === 0 ? 1 : -1;
  const sx = 422, sy = 170, a = 55 * Math.PI / 180, L = 0.42 * 390 * 0.62;
  await touch('touchStart', sx, sy);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', sx - dir * Math.cos(a) * L * i / 8, sy + Math.sin(a) * L * i / 8); await sleep(30); }
  await sleep(200);
  await page.screenshot({ path: OUT + '/02-aiming.png' });
  await touch('touchEnd');
  const s1 = await S(); console.log('aim after drag', s1.angle.toFixed(1), s1.power.toFixed(1));
  await page.tap('#btnFire');
  // grab screenshot right after explosion
  for (let i = 0; i < 150; i++) { const e = await page.evaluate(() => !!AT.game.lastExplosion || AT.game.state !== 'flying'); if (e) break; await sleep(50); }
  await sleep(120);
  await page.screenshot({ path: OUT + '/03-explosion-shot1.png' });
  const s2 = await waitTurn(s0.current);
  console.log('after shot 1', s2, 'lastExplosion', await page.evaluate(() => AT.game.lastExplosion));
  console.log('crater pixels removed:', s0.solid - s2.solid, 'turn switched:', s2.current !== s0.current);

  // Shot 2: computed aim at opponent with Fish Bomb, fired with touch on buttons
  const plan = await page.evaluate(() => {
    const g = AT.game, me = g.cur, opp = g.penguins[1 - g.current]; let best = null;
    for (let el = 20; el <= 80; el += 1) for (let pw = 20; pw <= 100; pw += 1) {
      const ang = opp.x > me.x ? el : 180 - el; const r = g.predict(ang, pw);
      if (!r || r.water) continue; const d = Math.hypot(r.x - opp.cx, r.y - opp.cy);
      if (!best || d < best.d) best = { ang, pw, d };
    } g.setAim(best.ang, best.pw); return best; });
  console.log('plan', plan);
  await page.tap('#btnWeapon');
  console.log('weapon', await page.evaluate(() => AT.game.cur.weapon));
  const before = await S();
  await page.tap('#btnFire');
  for (let i = 0; i < 150; i++) { const e = await page.evaluate(() => AT.game.state !== 'flying'); if (e) break; await sleep(50); }
  await sleep(150);
  await page.screenshot({ path: OUT + '/04-fishbomb-hit.png' });
  const s3 = await waitTurn(before.current);
  console.log('after shot 2', s3, 'fish left', await page.evaluate(() => AT.game.penguins.map(p=>p.fishBombs)));
  console.log('damage applied to opponent:', before.hp[1 - before.current] - s3.hp[1 - before.current]);

  // Play to the end with computed shots to exercise the win screen
  for (let k = 0; k < 20; k++) {
    const st = await S(); if (st.state === 'over') break;
    await page.evaluate(() => { const g = AT.game, me = g.cur, opp = g.penguins[1 - g.current]; let best = null;
      for (let el = 15; el <= 80; el += 2) for (let pw = 20; pw <= 100; pw += 1) { const ang = opp.x > me.x ? el : 180 - el; const r = g.predict(ang, pw); if (!r || r.water) continue; const d = Math.hypot(r.x - opp.cx, r.y - opp.cy); if (!best || d < best.d) best = { ang, pw, d }; }
      if (best) g.setAim(best.ang, best.pw); });
    await page.tap('#btnFire');
    await sleep(300);
    try { await waitTurn(st.current); } catch (e) { console.log(e.message); break; }
  }
  await sleep(1500);
  const fin = await S(); console.log('final', fin);
  await page.screenshot({ path: OUT + '/05-win.png' });
  const winVisible = await page.isVisible('#win'); console.log('win visible', winVisible);
  if (winVisible) { await page.tap('#btnRematch'); await sleep(500); console.log('after rematch', await S()); }
  // portrait check
  await page.setViewportSize({ width: 390, height: 844 }); await sleep(400);
  console.log('rotate hint visible in portrait:', await page.isVisible('#rotate'));
  await page.screenshot({ path: '/workspace/at-test/portrait.png' });
  console.log('ERRORS:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
