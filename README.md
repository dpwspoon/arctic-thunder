# Arctic Thunder 🐧⚡

A tiny pass-and-play, penguin-themed artillery game (Worms / Scorched Earth vibes) for phones.
Plain HTML5 canvas + JavaScript, no build step, no external assets.

## Play locally
```
python3 -m http.server 8000
# open http://localhost:8000 (or http://<your-computer-ip>:8000 on a phone on the same Wi-Fi)
```

## Controls
- **Aim:** touch (or click) anywhere on the playfield and pull back like a slingshot. Direction = angle, pull length = power. The yellow dots preview the first part of the arc (without wind).
- **◀ ▶:** hold to waddle; the STEPS bar shows how far you can still walk this turn.
- **Weapon button:** toggle Snowball ↔ Fish Bomb (2 per player per game; resets to Snowball after each throw).
- **FIRE:** throw.
- Desktop keys: ↑/↓ angle, ←/→ power, A/D walk, W or Tab weapon, Space/Enter fire.

## Files
- `index.html` – markup, HUD, overlays, PWA meta
- `css/style.css` – HUD/overlay styling (safe-area aware)
- `js/audio.js` – WebAudio blips (no audio files)
- `js/terrain.js` – random destructible terrain (pixel mask + offscreen canvas)
- `js/penguin.js` – penguin physics + procedural drawing
- `js/game.js` – game state machine, projectiles, explosions, rendering
- `js/main.js` – DOM/input wiring and main loop
- `manifest.webmanifest`, `icons/` – Add to Home Screen support
- `tools/smoke-test.js` – headless Chrome smoke test (needs `npm i playwright-core` and a local server on :8765)

## Later: TestFlight via Capacitor
The game is a static folder, so it can be wrapped as-is:
```
npm init -y && npm i @capacitor/core @capacitor/cli @capacitor/ios
npx cap init "Arctic Thunder" com.example.arcticthunder --web-dir=www
# copy index.html, css/, js/, icons/, manifest.webmanifest into www/
npx cap add ios && npx cap open ios   # then archive & upload from Xcode (needs a Mac + Apple Developer account)
```
