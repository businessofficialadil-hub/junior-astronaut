// Sound effects synthesised with the Web Audio API: no audio files, no licences.
// Browsers only allow audio after a click, so call sfx.start() from the "Click to play" handler.
let ctx = null, master = null, noiseBuf = null;
const loops = {};

function noise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s;
}
// gain envelope: attack, hold, release (seconds) to a peak level
function env(peak, a, h, r, t = ctx.currentTime) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + a + h);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + h + r);
  g.connect(master);
  return g;
}
function filtered(type, freq, q = 1) { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; }
function tone(freq, type, peak, a, h, r, t = ctx.currentTime) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  o.connect(env(peak, a, h, r, t)); o.start(t); o.stop(t + a + h + r + 0.05); return o;
}
function burst(filterType, freq, q, peak, a, h, r, t = ctx.currentTime) {
  const n = noise(), f = filtered(filterType, freq, q);
  n.connect(f).connect(env(peak, a, h, r, t)); n.start(t); n.stop(t + a + h + r + 0.05); return f;
}

export const sfx = {
  start() {
    if (ctx) { ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
  },
  get ready() { return !!ctx; },

  // pressure-seal hiss + motorised slide; closing is a little shorter and ends with a soft thunk
  door(open) {
    if (!ctx) return;
    const t = ctx.currentTime;
    burst('highpass', 3000, 0.7, 0.18, 0.01, 0.05, 0.35, t);
    const f = burst('bandpass', open ? 300 : 500, 1.2, 0.25, 0.05, 0.45, 0.25, t + 0.05);
    f.frequency.linearRampToValueAtTime(open ? 700 : 250, t + 0.75);
    const m = tone(open ? 70 : 90, 'sawtooth', 0.04, 0.05, 0.5, 0.2, t + 0.05);
    m.frequency.linearRampToValueAtTime(open ? 110 : 60, t + 0.75);
    if (!open) tone(55, 'sine', 0.35, 0.005, 0.02, 0.18, t + 0.8);
  },
  // footstep: metal deck inside the base, muffled regolith crunch outside (heard through the suit)
  step(inside) {
    if (!ctx) return;
    const t = ctx.currentTime, v = 0.8 + Math.random() * 0.4;
    if (inside) { tone(110 * v, 'triangle', 0.12, 0.002, 0.01, 0.08, t); burst('bandpass', 2200 * v, 3, 0.05, 0.002, 0.01, 0.05, t); }
    else burst('lowpass', 500 * v, 0.8, 0.22, 0.01, 0.03, 0.12, t);
  },
  land() { if (ctx) { tone(60, 'sine', 0.4, 0.005, 0.03, 0.25); burst('lowpass', 300, 0.7, 0.3, 0.005, 0.04, 0.25); } },
  blip() { if (ctx) tone(880, 'sine', 0.12, 0.005, 0.03, 0.08); },
  // a task finished: two rising notes; the whole mission: a short fanfare
  success() { if (ctx) { const t = ctx.currentTime; tone(660, 'triangle', 0.18, 0.01, 0.08, 0.2, t); tone(990, 'triangle', 0.18, 0.01, 0.12, 0.35, t + 0.12); } },
  fanfare() {
    if (!ctx) return;
    const t = ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 'triangle', 0.2, 0.01, i === 3 ? 0.5 : 0.1, 0.4, t + i * 0.16));
  },
  warn() { if (ctx) { const t = ctx.currentTime; tone(740, 'square', 0.06, 0.005, 0.08, 0.05, t); tone(740, 'square', 0.06, 0.005, 0.08, 0.05, t + 0.2); } },
  // intro cinematic: pyro bang for stage separation, latch clunk for docking
  bang() { if (ctx) { burst('lowpass', 900, 0.7, 0.5, 0.002, 0.03, 0.5); tone(45, 'sine', 0.4, 0.005, 0.05, 0.6); } },
  clunk() { if (ctx) { const t = ctx.currentTime; tone(90, 'square', 0.12, 0.002, 0.02, 0.15, t); tone(140, 'triangle', 0.1, 0.002, 0.02, 0.2, t + 0.12); } },
  // mission-control radio: a burst of static and the two "quindar" tones Apollo used to key the radio (2525 Hz)
  radio() {
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(2525, 'sine', 0.08, 0.005, 0.22, 0.03, t);
    burst('bandpass', 1800, 1.5, 0.06, 0.02, 0.5, 0.15, t + 0.25);
    tone(2475, 'sine', 0.08, 0.005, 0.22, 0.03, t + 0.95);
  },
  beep() { if (ctx) tone(1000, 'sine', 0.15, 0.005, 0.12, 0.06); },                   // countdown
  hiss() { if (ctx) burst('highpass', 2500, 0.7, 0.12, 0.01, 0.12, 0.2); },            // RCS thruster puff
  // cinematic bed: a slow, detuned minor chord under a breathing low-pass filter; level 0..1
  pad(level) { this.loop('pad', level, (g) => {
    const f = filtered('lowpass', 600, 0.7); f.connect(g);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 350; lfo.connect(lg).connect(f.frequency); lfo.start();
    for (const [hz, type] of [[55, 'sine'], [110, 'triangle'], [164.8, 'sawtooth'], [196, 'sine'], [261.6, 'triangle'], [110.6, 'sawtooth']]) {
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = type; o.frequency.value = hz; og.gain.value = type === 'sawtooth' ? 0.05 : 0.12;
      o.connect(og).connect(f); o.start();
    }
    return {};
  }, (_x, l) => 0.35 * l); },
  // engine roar: low rumble + crackle, level 0..1 (rocket launch, burns, lander engine)
  rumble(level) { this.loop('rumble', level, (g) => {
    const n = noise(), f = filtered('lowpass', 160, 0.9); n.connect(f).connect(g); n.start();
    const n2 = noise(), f2 = filtered('bandpass', 900, 0.8), g2 = ctx.createGain(); g2.gain.value = 0.25;
    n2.connect(f2).connect(g2).connect(g); n2.start(); return {};
  }, (_x, l) => 0.9 * l); },
  roverOn(on) { if (ctx) { const t = ctx.currentTime; tone(on ? 330 : 440, 'sine', 0.12, 0.01, 0.06, 0.1, t); tone(on ? 440 : 330, 'sine', 0.12, 0.01, 0.06, 0.15, t + 0.1); } },

  // continuous layers, set every frame: level 0 silences them
  // rover: electric motor whine rising with speed + gravel under the wheels
  rover(speed) { this.loop('motor', speed, (g) => {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; const f = filtered('lowpass', 900);
    o.connect(f).connect(g); o.start(); const n = noise(), nf = filtered('bandpass', 400, 0.6), ng = ctx.createGain();
    n.connect(nf).connect(ng).connect(g); n.start(); return { o, ng };
  }, (x, s) => {
    x.o.frequency.setTargetAtTime(60 + s * 45, ctx.currentTime, 0.1);
    x.ng.gain.setTargetAtTime(Math.min(1, s / 3) * 2.5, ctx.currentTime, 0.1);
    return s > 0.05 ? 0.06 + Math.min(s / 6, 1) * 0.08 : 0.02;   // idle hum when parked
  }); },
  // inside: air-handling hum; outside: the suit's fans
  ambient(inside) { this.loop('hum', inside ? 1 : 0, (g) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 58; o.connect(g); o.start();
    const n = noise(), f = filtered('lowpass', 250); n.connect(f).connect(g); n.start(); return {};
  }, () => 0.05);
  this.loop('suit', inside ? 0 : 1, (g) => { const n = noise(), f = filtered('bandpass', 1200, 0.5); n.connect(f).connect(g); n.start(); return {}; }, () => 0.025); },
  // generic looped layer with a smoothed level
  loop(name, level, make, tune) {
    if (!ctx) return;
    let L = loops[name];
    if (!L) { const g = ctx.createGain(); g.gain.value = 0; g.connect(master); L = loops[name] = { g, x: make(g) }; }
    const target = level ? tune(L.x, level) : 0;
    L.g.gain.setTargetAtTime(target, ctx.currentTime, 0.15);
  },
};
