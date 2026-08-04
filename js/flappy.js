// ═══════════════════════════════════════════════════════════════════════
//  Gotcha — the flying game
//
//  Canvas, fixed-timestep. The physics is deliberately simple; what makes
//  this kind of game feel right is not the model but the numbers, and those
//  are gathered at the top where they can be tuned.
// ═══════════════════════════════════════════════════════════════════════
var Flappy = (function () {
  "use strict";

  //  Tuning. Everything is in units per second so the game runs at the same
  //  speed whatever the frame rate — a game tuned per-frame is twice as fast
  //  on a 120 Hz screen, which is a real and common bug.
  var GRAVITY = 1500;        // downward pull
  var FLAP = -430;           // upward kick, applied instantly
  var MAX_FALL = 620;        // terminal velocity, so a long drop stays readable
  var SPEED = 155;           // how fast the world moves past
  var GAP = 132;             // the hole between pipes
  var PIPE_W = 58;
  var SPACING = 200;         // horizontal distance between pipes
  var BIRD_X = 78;
  var BIRD_R = 13;
  var GROUND = 62;           // height of the strip at the bottom

  //  A fixed step, accumulated. Physics stepped by a variable delta lets a
  //  single long frame — a tab regaining focus — teleport the bird through a
  //  pipe without ever touching it.
  var STEP = 1 / 120;
  var MAX_CATCHUP = 0.25;    // never simulate more than this after a stall

  function create(canvas, hooks) {
    hooks = hooks || {};
    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, dpr = 1;

    var state = "ready";     // ready | playing | dead
    var bird, pipes, scored, t, acc, last, raf, shake;

    //  Set once, when a run begins. Reading them mid-run would let the rules
    //  change halfway through, which is worse than not having them.
    var gap = GAP, lives = 0, shieldFor = 3, shieldUntil = 0;

    //  Called before reset() to say what this run is playing with.
    function setEffects(e) {
      e = e || {};
      gap = e.gap > 0 ? e.gap : GAP;
      lives = Math.max(0, e.lives | 0);
      shieldFor = e.shield > 0 ? e.shield : 3;
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function reset() {
      bird = { y: H * 0.4, v: 0, rot: 0 };
      pipes = [];
      scored = 0;
      t = 0; acc = 0; shake = 0; shieldUntil = 0;
      // Far enough ahead that the first one is not immediately in your face.
      for (var i = 0; i < 4; i++) addPipe(W + 140 + i * SPACING);
      state = "ready";
    }

    function addPipe(x) {
      var margin = 54;
      // A wider gap needs the top of it to sit higher, or the extra room
      // would all be taken out of the bottom pipe and the hole would drift
      // downward off the screen.
      var span = Math.max(30, H - GROUND - gap - margin * 2);
      var top = margin + Math.random() * span;
      pipes.push({ x: x, top: top, passed: false });
    }

    function flap() {
      if (state === "dead") return;
      if (state === "ready") { state = "playing"; last = 0; }
      bird.v = FLAP;
      if (hooks.onFlap) hooks.onFlap();
    }

    //  A hit. With a life in hand it is spent instead, and the shield keeps
    //  you alive long enough to get clear of whatever you just hit — landing
    //  straight back into the same pipe would make the item worthless.
    function takeHit() {
      if (state === "dead") return;
      if (t < shieldUntil) return;            // already invulnerable
      if (lives > 0) {
        lives--;
        shieldUntil = t + shieldFor;
        shake = 0.3;
        // Lifted clear and given upward momentum, so the shield is spent
        // escaping rather than sitting inside the pipe that caused it.
        bird.v = FLAP * 0.8;
        if (hooks.onHit) hooks.onHit(lives, shieldFor);
        return;
      }
      die();
    }

    function shielded() { return t < shieldUntil; }

    function die() {
      if (state === "dead") return;
      state = "dead";
      shake = 0.35;
      if (hooks.onDie) hooks.onDie(scored);
    }

    // ── simulation ───────────────────────────────────────────────────────
    function step(dt) {
      bird.v = Math.min(MAX_FALL, bird.v + GRAVITY * dt);
      bird.y += bird.v * dt;
      // Nose follows the direction of travel, clamped so it never spins.
      var want = Math.max(-0.5, Math.min(1.4, bird.v / 620));
      bird.rot += (want - bird.rot) * Math.min(1, dt * 9);

      for (var i = 0; i < pipes.length; i++) {
        var p = pipes[i];
        p.x -= SPEED * dt;
        if (!p.passed && p.x + PIPE_W < BIRD_X - BIRD_R) {
          p.passed = true;
          scored++;
          if (hooks.onPipe) hooks.onPipe(scored);
        }
      }
      // Recycle rather than allocate: a run can pass hundreds of pipes.
      while (pipes.length && pipes[0].x < -PIPE_W - 10) {
        pipes.shift();
        addPipe(pipes[pipes.length - 1].x + SPACING);
      }

      if (bird.y + BIRD_R >= H - GROUND) {
        bird.y = H - GROUND - BIRD_R;
        // The ground always kills. A shield that let you skid along the floor
        // would remove the only hard boundary in the game.
        die();
        return;
      }
      // The ceiling stops you rather than killing you — dying to an invisible
      // line above the screen feels arbitrary.
      if (bird.y - BIRD_R < 0) { bird.y = BIRD_R; bird.v = 0; }

      if (!shielded()) {
        for (var j = 0; j < pipes.length; j++) {
          if (hits(pipes[j])) { takeHit(); return; }
        }
      }
    }

    //  Circle against the two rectangles of a pipe. The nearest-point test is
    //  exact, which matters here — a box-on-box approximation makes the bird
    //  clip corners it visibly missed.
    function hits(p) {
      if (BIRD_X + BIRD_R < p.x || BIRD_X - BIRD_R > p.x + PIPE_W) return false;
      return near(p.x, 0, PIPE_W, p.top) ||
             near(p.x, p.top + gap, PIPE_W, H - GROUND - (p.top + gap));
    }
    function near(rx, ry, rw, rh) {
      var cx = Math.max(rx, Math.min(BIRD_X, rx + rw));
      var cy = Math.max(ry, Math.min(bird.y, ry + rh));
      var dx = BIRD_X - cx, dy = bird.y - cy;
      return dx * dx + dy * dy < BIRD_R * BIRD_R;
    }

    // ── drawing ──────────────────────────────────────────────────────────
    function draw() {
      var ox = 0, oy = 0;
      if (shake > 0) {
        ox = (Math.random() - 0.5) * shake * 14;
        oy = (Math.random() - 0.5) * shake * 14;
      }
      ctx.save();
      ctx.translate(ox, oy);

      // Sky
      var sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#57c1e8");
      sky.addColorStop(0.7, "#9fdcf0");
      sky.addColorStop(1, "#d9f2f8");
      ctx.fillStyle = sky;
      ctx.fillRect(-20, -20, W + 40, H + 40);

      // Clouds, drifting slower than the pipes so there is some depth.
      ctx.fillStyle = "rgba(255,255,255,.55)";
      for (var c = 0; c < 4; c++) {
        var cx = ((t * 18 + c * 137) % (W + 120)) - 60;
        var cy = 40 + c * 33;
        blob(W - cx, cy, 26 + c * 4);
      }

      pipes.forEach(drawPipe);
      drawGround();
      drawBird();
      ctx.restore();
    }

    function blob(x, y, r) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 7);
      ctx.arc(x + r * 0.8, y + 4, r * 0.72, 0, 7);
      ctx.arc(x - r * 0.8, y + 5, r * 0.62, 0, 7);
      ctx.fill();
    }

    function drawPipe(p) {
      var botY = p.top + gap;
      var botH = H - GROUND - botY;
      pipeBody(p.x, 0, PIPE_W, p.top);
      pipeLip(p.x, p.top - 22);
      pipeBody(p.x, botY, PIPE_W, botH);
      pipeLip(p.x, botY);
    }

    function pipeBody(x, y, w, h) {
      // A vertical light band down the left third is what makes a flat green
      // rectangle read as a tube.
      var g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, "#4e9c2a");
      g.addColorStop(0.28, "#8fd45c");
      g.addColorStop(0.55, "#63b433");
      g.addColorStop(1, "#3c7a1f");
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "rgba(0,0,0,.35)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }
    function pipeLip(x, y) {
      var w = PIPE_W + 10;
      var g = ctx.createLinearGradient(x - 5, 0, x - 5 + w, 0);
      g.addColorStop(0, "#4e9c2a");
      g.addColorStop(0.28, "#9ade66");
      g.addColorStop(0.55, "#63b433");
      g.addColorStop(1, "#38701c");
      ctx.fillStyle = g;
      ctx.fillRect(x - 5, y, w, 22);
      ctx.strokeStyle = "rgba(0,0,0,.35)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 4, y + 1, w - 2, 20);
    }

    function drawGround() {
      var y = H - GROUND;
      ctx.fillStyle = "#ded895";
      ctx.fillRect(0, y, W, GROUND);
      ctx.fillStyle = "#c7bf72";
      ctx.fillRect(0, y, W, 9);
      // Scrolling stripes, tied to distance travelled rather than to time so
      // they stop with the world.
      ctx.fillStyle = "rgba(0,0,0,.07)";
      var off = (t * SPEED) % 26;
      for (var x = -off; x < W; x += 26) ctx.fillRect(x, y + 9, 13, GROUND - 9);
      ctx.fillStyle = "rgba(0,0,0,.25)";
      ctx.fillRect(0, y, W, 2);
    }

    function drawBird() {
      // The shield bubble. Drawn before the bird so it sits behind it, and it
      // pulses faster as it runs out — a shield that vanishes without warning
      // feels like being cheated.
      if (shielded()) {
        var left = shieldUntil - t;
        var urgency = left < 1 ? 26 : 9;
        var a = 0.32 + Math.sin(t * urgency) * 0.16;
        ctx.save();
        ctx.beginPath();
        ctx.arc(BIRD_X, bird.y, BIRD_R + 9, 0, 7);
        ctx.fillStyle = "rgba(120,200,255," + a.toFixed(3) + ")";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(180,230,255," + (a + 0.35).toFixed(3) + ")";
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(BIRD_X, bird.y);
      ctx.rotate(bird.rot);
      // Body
      var g = ctx.createLinearGradient(0, -BIRD_R, 0, BIRD_R);
      g.addColorStop(0, "#ffe36e");
      g.addColorStop(1, "#f0b429");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, BIRD_R, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.lineWidth = 2; ctx.stroke();
      // Wing, flapping with the climb
      ctx.fillStyle = "#fff4c4";
      ctx.beginPath();
      ctx.ellipse(-3, 2 + Math.sin(t * 18) * 2.5, 7, 4.6, -0.3, 0, 7);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.3)"; ctx.lineWidth = 1.2; ctx.stroke();
      // Eye and beak
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(5.5, -4.5, 4.4, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = "#222";
      ctx.beginPath(); ctx.arc(7, -4.5, 2, 0, 7); ctx.fill();
      ctx.fillStyle = "#f2711c";
      ctx.beginPath();
      ctx.moveTo(11, 0); ctx.lineTo(19, 2.5); ctx.lineTo(11, 5.5); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.stroke();
      ctx.restore();
    }

    // ── the loop ─────────────────────────────────────────────────────────
    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (!last) last = now;
      var dt = (now - last) / 1000;
      last = now;
      // A tab in the background stops firing frames; without this clamp it
      // returns and simulates the whole gap at once.
      if (dt > MAX_CATCHUP) dt = MAX_CATCHUP;

      if (state === "playing") {
        acc += dt;
        while (acc >= STEP) { step(STEP); acc -= STEP; }
        t += dt;
      } else if (state === "ready") {
        // A gentle hover before the first flap, so the screen is not still.
        t += dt;
        bird.y += Math.sin(t * 4) * 0.5;
      }
      if (shake > 0) shake = Math.max(0, shake - dt * 1.6);
      draw();
    }

    function start() {
      resize();
      reset();
      if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
    }
    function stop() {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
    }

    return {
      start: start, stop: stop, reset: reset, flap: flap, resize: resize,
      setEffects: setEffects,
      get state() { return state; },
      get score() { return scored; },
      get lives() { return lives; },
      get shielded() { return shielded(); },
      _internals: { hits: hits, step: step, takeHit: takeHit },
    };
  }

  return {
    create: create,
    GRAVITY: GRAVITY, FLAP: FLAP, SPEED: SPEED, GAP: GAP,
    PIPE_W: PIPE_W, SPACING: SPACING, BIRD_R: BIRD_R, STEP: STEP,
  };
})();

if (typeof module !== "undefined") module.exports = Flappy;
