// Tiny WebAudio synth: no audio files needed.
(function () {
  const AT = (window.AT = window.AT || {});
  let ctx = null, master = null, noiseBuf = null;
  const Audio = {
    muted: false,
    unlock() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    },
    setMuted(m) { this.muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    tone(freq, dur, type = 'square', vol = 0.2, slideTo = null) {
      if (!ctx || this.muted) return;
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, vol = 0.4, filterType = 'lowpass', freq = 800, freqTo = 120) {
      if (!ctx || this.muted) return;
      const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; f.type = filterType;
      f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
    },
    fire() { this.tone(520, 0.18, 'triangle', 0.25, 180); this.noise(0.12, 0.15, 'highpass', 3000, 1200); },
    boom(big) { this.noise(big ? 0.9 : 0.5, big ? 0.7 : 0.45, 'lowpass', big ? 1200 : 1800, 60); this.tone(big ? 90 : 140, big ? 0.6 : 0.3, 'sine', 0.4, 40); },
    splash() { this.noise(0.6, 0.3, 'bandpass', 2400, 400); },
    step() { this.tone(300 + Math.random() * 60, 0.05, 'triangle', 0.06); },
    click() { this.tone(880, 0.06, 'square', 0.08); },
    ouch() { this.tone(700, 0.25, 'square', 0.12, 260); },
    win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'triangle', 0.2), i * 140)); },
  };
  AT.Audio = Audio;
})();
