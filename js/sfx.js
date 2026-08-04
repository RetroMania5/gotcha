// ═══════════════════════════════════════════════════════════════════════
//  Gotcha — sound
//
//  Synthesised, not loaded. The important one is the riser: the sound that
//  plays while a capsule climbs the screen and does most of the work of
//  making a pull feel like it matters.
//
//  A riser works by doing three things at once, all accelerating together:
//    • the pitch climbs
//    • a wobble on the volume gets faster
//    • a noise band opens upward underneath it
//  Any one alone is a slide whistle. Together they read as tension, and the
//  reason it lands is that they all arrive at the top at the same moment.
// ═══════════════════════════════════════════════════════════════════════
var Sfx = (function () {
  "use strict";

  var ctx = null, master = null;
  var enabled = true;
  var running = [];        // things that need stopping if a pull is cut short

  function audio() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 4;
      master.connect(comp); comp.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return ctx;
  }
  function ready() {
    var c = audio();
    if (!c) return null;
    // A suspended context is silent with no error — resume on every play.
    if (c.state === "suspended") { try { c.resume(); } catch (e) {} }
    return c;
  }

  function tone(o) {
    var c = ready(); if (!c || !enabled) return null;
    var t = c.currentTime + (o.delay || 0);
    var osc = c.createOscillator(), g = c.createGain();
    osc.type = o.wave || "sine";
    osc.frequency.setValueAtTime(o.from, t);
    if (o.to && o.to !== o.from) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + o.dur);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, o.gain || 0.15), t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + o.dur + 0.04);
    return osc;
  }

  function noise(dur, from, to, gain, q) {
    var c = ready(); if (!c || !enabled) return null;
    var len = Math.max(1, Math.floor(c.sampleRate * dur));
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var src = c.createBufferSource(); src.buffer = buf;
    var f = c.createBiquadFilter();
    f.type = "bandpass"; f.Q.value = q || 1;
    f.frequency.setValueAtTime(from, c.currentTime);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, to), c.currentTime + dur);
    var g = c.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
    return src;
  }

  function hit(cutoff, gain, dur, q) {
    var c = ready(); if (!c || !enabled) return;
    dur = dur || 0.03;
    var len = Math.max(1, Math.floor(c.sampleRate * dur));
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    var src = c.createBufferSource(); src.buffer = buf;
    var f = c.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = cutoff; f.Q.value = q || 1.1;
    var g = c.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  // ── the riser ──────────────────────────────────────────────────────────
  //  Plays for `dur` seconds while the capsule climbs. Returns a handle so it
  //  can be cut off — a riser left running after the reveal is worse than no
  //  riser at all.
  function riser(dur) {
    var c = ready(); if (!c || !enabled) return { stop: function () {} };
    var t = c.currentTime;
    var nodes = [];

    // 1 — the climbing tone. Two oscillators a fifth apart, detuned slightly
    //     so they beat against each other and thicken as they rise.
    [1, 1.5].forEach(function (mult, i) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = i ? "triangle" : "sawtooth";
      o.frequency.setValueAtTime(180 * mult, t);
      o.frequency.exponentialRampToValueAtTime(1150 * mult, t + dur);
      var f = c.createBiquadFilter();
      f.type = "lowpass"; f.Q.value = 6;
      f.frequency.setValueAtTime(500, t);
      f.frequency.exponentialRampToValueAtTime(5200, t + dur);
      // Quiet at first and loudest right at the top, which is what makes it
      // feel like it is being wound up rather than simply played.
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(i ? 0.05 : 0.085, t + dur * 0.82);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.05);
      nodes.push(o);
    });

    // 2 — the wobble, accelerating. An LFO on a gain stage, its own rate
    //     ramping up, is what turns a rising note into a machine winding.
    var trem = c.createGain();
    trem.gain.value = 1;
    var lfo = c.createOscillator(), lfoAmt = c.createGain();
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(7, t);
    lfo.frequency.exponentialRampToValueAtTime(34, t + dur);
    lfoAmt.gain.setValueAtTime(0.42, t);
    lfoAmt.gain.linearRampToValueAtTime(0.12, t + dur);   // shallower as it tightens
    lfo.connect(lfoAmt); lfoAmt.connect(trem.gain);
    lfo.start(t); lfo.stop(t + dur + 0.05);
    nodes.push(lfo);

    var wob = c.createOscillator(), wg = c.createGain();
    wob.type = "square";
    wob.frequency.setValueAtTime(90, t);
    wob.frequency.exponentialRampToValueAtTime(420, t + dur);
    var wf = c.createBiquadFilter();
    wf.type = "lowpass"; wf.frequency.value = 900;
    wg.gain.setValueAtTime(0.0001, t);
    wg.gain.exponentialRampToValueAtTime(0.035, t + dur * 0.8);
    wg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    wob.connect(wf); wf.connect(wg); wg.connect(trem); trem.connect(master);
    wob.start(t); wob.stop(t + dur + 0.05);
    nodes.push(wob);

    // 3 — the noise band opening upward underneath it all.
    var n = noise(dur, 400, 7000, 0.055, 0.8);
    if (n) nodes.push(n);

    var handle = {
      stop: function () {
        nodes.forEach(function (x) { try { x.stop(); } catch (e) {} });
        nodes.length = 0;
      }
    };
    running.push(handle);
    return handle;
  }

  function stopAll() {
    running.forEach(function (h) { h.stop(); });
    running = [];
  }

  // ═════════════════════════════════════════════════════════════════════
  //  The iOS 6 interface palette
  //
  //  A different idiom from the game sounds above, and worth being precise
  //  about, because it is what makes an interface sound like a phone from
  //  2012 rather than a computer:
  //
  //    • MARIMBA, not bell. The tuned overtone of a struck wooden bar is the
  //      FOURTH harmonic, not the inharmonic 2.76 of metal. That single ratio
  //      is most of the difference between iOS and Mac OS X.
  //    • DRY. Decays of 120–250 ms. Nothing rings; a long tail belongs to a
  //      desktop with speakers, not a handset.
  //    • MID-BAND. Everything sits between roughly 400 Hz and 3 kHz, because
  //      that is all a phone speaker of the era could actually reproduce, and
  //      the sounds were designed for it.
  //    • A MALLET TRANSIENT. A tiny wooden knock before the tone. Without it
  //      a marimba note is just a sine.
  // ═════════════════════════════════════════════════════════════════════

  //  A struck wooden bar. The 4th harmonic is what makes it wood.
  function marimba(freq, gain, decay, delay) {
    var c = ready(); if (!c || !enabled) return;
    var t = c.currentTime + (delay || 0);
    [[1, 1, decay], [4.0, 0.30, decay * 0.42], [10.1, 0.08, decay * 0.2]].forEach(function (p) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(freq * p[0], t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * p[1]), t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + p[2]);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + p[2] + 0.03);
    });
    // The mallet itself.
    setTimeout(function () { hit(2600, gain * 0.35, 0.012, 2.6); }, (delay || 0) * 1000);
  }

  var IOS = {
    //  TOCK — the keyboard click. Almost pure transient: a dry knock with the
    //  faintest pitch under it. This is the most-heard sound on the device, so
    //  it is deliberately the quietest and shortest thing in the set.
    tock: function () {
      hit(1900, 0.13, 0.011, 3.2);
      tone({ from: 1050, to: 880, dur: 0.028, gain: 0.05 });
    },

    //  A softer version, for picking something rather than typing.
    select: function () {
      hit(2400, 0.09, 0.010, 2.8);
      marimba(1174, 0.055, 0.11);
    },

    //  Moving between screens. A short upward wooden pair.
    nav: function () {
      marimba(880, 0.07, 0.14);
      marimba(1318, 0.055, 0.16, 0.055);
    },
    navBack: function () {
      marimba(1318, 0.06, 0.14);
      marimba(880, 0.05, 0.16, 0.055);
    },

    //  TRI-TONE. The one everybody knows: three clean notes, the middle one
    //  highest. Kept for things that genuinely deserve attention.
    tritone: function () {
      [[1318, 0], [1760, 0.13], [1046, 0.26]].forEach(function (n) {
        marimba(n[0], 0.11, 0.34, n[1]);
      });
    },

    //  SWOOSH — sending. A band of noise sweeping up and away.
    swoosh: function () {
      noise(0.34, 700, 5200, 0.075, 0.7);
      tone({ from: 380, to: 1500, dur: 0.3, gain: 0.035, wave: "triangle" });
    },

    //  LOCK — the mechanical clunk. Two knocks a few milliseconds apart is
    //  what makes it a latch rather than a tap.
    lock: function () {
      hit(560, 0.24, 0.028, 1.1);
      setTimeout(function () { hit(340, 0.20, 0.04, 0.9); }, 38);
      tone({ from: 190, to: 130, dur: 0.11, gain: 0.10 });
    },
    unlock: function () {
      hit(420, 0.16, 0.022, 1.2);
      marimba(1046, 0.07, 0.13, 0.03);
    },

    //  SHUTTER — click, then clack.
    shutter: function () {
      hit(3400, 0.22, 0.016, 1.8);
      setTimeout(function () { hit(1500, 0.20, 0.03, 1.2); }, 85);
    },

    //  Charging: a round low bloop.
    bloop: function () {
      tone({ from: 420, to: 880, dur: 0.13, gain: 0.14, wave: "sine" });
      marimba(880, 0.07, 0.2, 0.09);
    },

    //  Something removed. A short crumple downward.
    poof: function () {
      noise(0.26, 3600, 300, 0.16, 0.7);
      tone({ from: 500, to: 150, dur: 0.2, gain: 0.07 });
    },

    //  A switch being flicked. Two dry clicks, the second brighter.
    flick: function () {
      hit(1400, 0.14, 0.010, 2.6);
      setTimeout(function () { hit(2600, 0.10, 0.009, 3.0); }, 26);
    },

    //  Not allowed. Two descending wooden notes — firm without being harsh,
    //  which is how a phone says no.
    nope: function () {
      marimba(392, 0.11, 0.17);
      marimba(294, 0.11, 0.24, 0.11);
    },

    //  Something arriving.
    ding: function () {
      marimba(1568, 0.10, 0.3);
      marimba(2093, 0.06, 0.24, 0.06);
    },
  };

  // ── the palette ────────────────────────────────────────────────────────
  var S = {
    // The dial being turned: a ratchet of clicks slowing down.
    crank: function () {
      for (var i = 0; i < 11; i++) {
        (function (n) {
          setTimeout(function () { hit(1500 + Math.random() * 700, 0.16, 0.022, 2.4); },
                     // Widening gaps, so it reads as slowing rather than as a
                     // steady buzz.
                     n * (34 + n * 5.5));
        })(i);
      }
    },

    // The capsule dropping into the tray: a hollow knock and a roll.
    drop: function () {
      hit(700, 0.26, 0.04, 0.8);
      tone({ from: 240, to: 150, dur: 0.13, gain: 0.16 });
      setTimeout(function () { hit(1100, 0.12, 0.03, 1.4); }, 90);
      setTimeout(function () { hit(900, 0.07, 0.025, 1.4); }, 160);
    },

    // The shell giving way.
    crack: function () {
      hit(3000, 0.24, 0.05, 0.7);
      tone({ wave: "square", from: 420, to: 180, dur: 0.1, gain: 0.1 });
    },

    // The reveal. Bigger the rarer it is — this is the payoff the riser has
    // been building towards, so a common must not sound like a legendary.
    reveal: function (rarity) {
      var sets = {
        common:    [[523], 0.10, 0.35],
        rare:      [[523, 659], 0.12, 0.5],
        veryrare:  [[523, 659, 784], 0.13, 0.7],
        legendary: [[523, 659, 784, 1046, 1319], 0.15, 1.1],
      };
      var cfg = sets[rarity] || sets.common;
      cfg[0].forEach(function (f, i) {
        tone({ from: f, to: f * 0.998, dur: cfg[2], gain: cfg[1], delay: i * 0.07 });
        tone({ from: f * 2.756, to: f * 2.74, dur: cfg[2] * 0.6, gain: cfg[1] * 0.35,
               delay: i * 0.07 });
      });
      hit(5000, 0.14, 0.05, 1.2);
      if (rarity === "legendary" || rarity === "veryrare") {
        noise(0.6, 6000, 900, 0.07, 0.7);
      }
    },

    // The game.
    flap:  function () { hit(1800, 0.10, 0.02, 1.6);
                         tone({ from: 620, to: 880, dur: 0.06, gain: 0.09 }); },
    pipe:  function () { tone({ from: 880, to: 878, dur: 0.14, gain: 0.11 });
                         tone({ from: 1320, to: 1318, dur: 0.11, gain: 0.06, delay: 0.05 }); },
    die:   function () { hit(500, 0.24, 0.06, 0.7);
                         tone({ wave: "square", from: 300, to: 90, dur: 0.4, gain: 0.13 }); },
    coin:  function () { tone({ from: 2093, to: 2090, dur: 0.3, gain: 0.09 });
                         tone({ from: 3136, to: 3130, dur: 0.22, gain: 0.05, delay: 0.02 }); },
  };

  // Merged so an interface sound plays exactly like a game one.
  Object.keys(IOS).forEach(function (k) { S[k] = IOS[k]; });
  // The old placeholder tap is now the real keyboard tock.
  S.tap = IOS.tock;

  function play(name, arg) {
    if (!enabled) return false;
    var fn = S[name];
    if (!fn) return false;
    try { fn(arg); } catch (e) { return false; }
    return true;
  }

  function setEnabled(on) {
    enabled = !!on;
    if (!enabled) stopAll();
    return enabled;
  }

  return {
    play: play, riser: riser, stopAll: stopAll, IOS: IOS,
    setEnabled: setEnabled, isEnabled: function () { return enabled; },
    names: function () { return Object.keys(S); },
  };
})();

if (typeof module !== "undefined") module.exports = Sfx;
