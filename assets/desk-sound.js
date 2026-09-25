/* Desk sounds: every effect is synthesized with Web Audio, so there are no audio files to load. */
(function () {
  'use strict';

  var KEY = 'desk-muted';
  var ctx = null, out = null, noiseBuf = null, lastTick = 0;
  var muted = false;
  try { muted = localStorage.getItem(KEY) === '1'; } catch (e) {}

  function ensure() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      out = ctx.createGain(); out.gain.value = muted ? 0 : 0.8;
      out.connect(comp); comp.connect(ctx.destination);
      var len = Math.floor(ctx.sampleRate * 1.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Browsers only allow audio after a tap, click or key press. iOS also wants a sound started inside that gesture.
  var unlocked = false;
  function unlock() {
    if (unlocked || !ensure()) return;
    unlocked = true;
    var s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0);
  }
  ['pointerup', 'touchend', 'click', 'keydown'].forEach(function (ev) { document.addEventListener(ev, unlock, { capture: true, passive: true }); });

  function jit(v, amt) { return v * (1 + (Math.random() * 2 - 1) * amt); }

  function tone(t, freq, dur, o) {
    o = o || {};
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide || dur));
    var a = o.attack || 0.003, v = o.vol == null ? 0.2 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    var node = osc;
    if (o.lp) { var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); node = f; }
    node.connect(g); g.connect(o.dest || out);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  function noise(t, dur, o) {
    o = o || {};
    var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true;
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 2000, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    f.Q.value = o.q == null ? 1 : o.q;
    var a = o.attack || 0.002, v = o.vol == null ? 0.3 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(o.dest || out);
    src.start(t, Math.random() * 1.2); src.stop(t + dur + 0.05);
    return g;
  }

  var FX = {
    // chunky mechanical key: click on the way down, softer clack on the way up
    key: function (t) {
      noise(t, 0.018, { freq: jit(3200, 0.12), q: 1.4, vol: 0.55 });
      tone(t, jit(210, 0.08), 0.05, { to: 120, vol: 0.32 });
      noise(t + jit(0.075, 0.2), 0.014, { freq: jit(4200, 0.1), q: 1.6, vol: 0.22 });
    },
    // the screen typing a line: light, quick ticks
    tick: function (t) {
      noise(t, 0.008, { type: 'highpass', freq: jit(4200, 0.15), vol: 0.16 });
      tone(t, jit(1900, 0.1), 0.012, { vol: 0.03 });
    },
    // round rubber buttons
    button: function (t) {
      noise(t, 0.012, { freq: 1800, q: 1, vol: 0.3 });
      tone(t, jit(520, 0.05), 0.12, { to: 360, vol: 0.2, type: 'triangle' });
    },
    // mug: ceramic clink, then a warm slurp with a few bubbles
    coffee: function (t) {
      [2350, 3520, 5110].forEach(function (f, i) { tone(t, jit(f, 0.02), 0.35 - i * 0.08, { vol: 0.12 - i * 0.03 }); });
      var s = t + 0.16;
      var g = noise(s, 0.55, { freq: 700, to: 1500, q: 2.5, vol: 0.22, attack: 0.06 });
      var lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 23; lg.gain.value = 0.12; lfo.connect(lg); lg.connect(g.gain);
      lfo.start(s); lfo.stop(s + 0.6);
      for (var i = 0; i < 6; i++) {
        var bt = s + 0.05 + Math.random() * 0.45;
        tone(bt, jit(420, 0.3), 0.04, { to: jit(950, 0.2), vol: 0.07 });
      }
    },
    // paper: sticky notes, poster, polaroids
    paper: function (t) {
      noise(t, 0.09, { type: 'highpass', freq: 2400, vol: 0.18, attack: 0.01 });
      noise(t + 0.07, 0.12, { freq: 3400, to: 2200, q: 0.7, vol: 0.14, attack: 0.02 });
    },
    // a page flip: books and the notebook
    flip: function (t) {
      noise(t, 0.22, { freq: 900, to: 3600, q: 0.8, vol: 0.3, attack: 0.03 });
      noise(t + 0.16, 0.08, { type: 'lowpass', freq: 500, vol: 0.2 });
    },
    // the stack of books: a soft thump plus a flip
    book: function (t) {
      noise(t, 0.08, { type: 'lowpass', freq: 380, vol: 0.45 });
      tone(t, 95, 0.12, { to: 60, vol: 0.25 });
      FX.flip(t + 0.08);
    },
    // trophy and medal
    ding: function (t) {
      [[1320, 0.16, 1.4], [1980, 0.1, 1.1], [3300, 0.06, 0.8], [4620, 0.03, 0.5]].forEach(function (p) { tone(t, p[0], p[2], { vol: p[1] }); });
      tone(t + 0.12, 2640, 0.9, { vol: 0.05 });
    },
    // lamp and day/night: a two-part switch click
    toggle: function (t) {
      noise(t, 0.01, { freq: 2600, q: 2, vol: 0.45 });
      tone(t, 140, 0.05, { to: 80, vol: 0.2 });
      noise(t + 0.045, 0.008, { freq: 3400, q: 2, vol: 0.25 });
    },
    // the mouse: small double click
    mouse: function (t) {
      noise(t, 0.006, { type: 'highpass', freq: 5000, vol: 0.4 });
      noise(t + 0.07, 0.005, { type: 'highpass', freq: 5600, vol: 0.25 });
      FX.blip(t + 0.14);
    },
    // CRT screen
    blip: function (t) {
      tone(t, 880, 0.07, { type: 'square', vol: 0.05, lp: 2400 });
      tone(t + 0.06, 1320, 0.09, { type: 'square', vol: 0.05, lp: 2400 });
    },
    // camera on the edge lab: shutter, then a beep
    shutter: function (t) {
      noise(t, 0.02, { freq: 2600, q: 1, vol: 0.4 });
      noise(t + 0.09, 0.03, { freq: 1800, q: 1, vol: 0.35 });
      tone(t + 0.2, 1560, 0.1, { vol: 0.06, type: 'square', lp: 3000 });
    },
    // the denoise demo: noise that clears into a chime
    denoise: function (t) {
      noise(t, 3.1, { type: 'lowpass', freq: 5000, to: 200, q: 0.5, vol: 0.12, attack: 0.2 });
      [523, 659, 784, 1047].forEach(function (f, i) { tone(t + 3.1 + i * 0.09, f, 0.7, { type: 'triangle', vol: 0.09 }); });
    },
    hello: function (t) {
      tone(t, 560, 0.12, { to: 760, vol: 0.12, type: 'triangle' });
      tone(t + 0.14, 760, 0.18, { to: 1020, vol: 0.12, type: 'triangle' });
    },
    help: function (t) {
      tone(t, 520, 0.12, { vol: 0.1, type: 'triangle' });
      tone(t + 0.13, 780, 0.2, { to: 880, vol: 0.1, type: 'triangle' });
    },
    // page buttons and chips
    ui: function (t) {
      noise(t, 0.01, { freq: 2200, q: 1.2, vol: 0.2 });
      tone(t, jit(760, 0.05), 0.05, { vol: 0.06, type: 'triangle' });
    },
    // a sheet sliding in
    whoosh: function (t) {
      noise(t, 0.3, { freq: 500, to: 1600, q: 0.7, vol: 0.1, attack: 0.08 });
    }
  };

  function play(name) {
    if (muted || !FX[name]) return;
    // never create the context here: only a gesture may do that (see unlock)
    if (!ctx) { if (!unlocked) return; ensure(); }
    if (ctx.state === 'suspended') ctx.resume();
    if (name === 'tick') { var n = performance.now(); if (n - lastTick < 34) return; lastTick = n; }
    try { FX[name](ctx.currentTime + 0.005); } catch (e) {}
  }

  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) {}
    if (out) out.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.02);
  }

  window.DeskSound = { play: play, setMuted: setMuted, isMuted: function () { return muted; } };
})();
