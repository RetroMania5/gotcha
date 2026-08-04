// ═══════════════════════════════════════════════════════════════════════
//  Gotcha — the application
//
//  All the arithmetic lives in state.js and the game in flappy.js. This is
//  screens, rendering and wiring.
// ═══════════════════════════════════════════════════════════════════════
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var SAVE = "gotcha:save";
  //  Stamped by tools/stamp.py from the source itself. Declared here, not
  //  beside the update check that uses it, so it is assigned before anything
  //  can render with it.
  var BUILD = "8714445bcc";

  var state = Game.fresh();
  var sets = [];
  var game = null;
  var tab = "play";
  var runStart = 0;      // coins at the start of a run, to show what it earned

  // ── persistence ────────────────────────────────────────────────────────
  function store() {
    try { localStorage.setItem(SAVE, Game.save(state)); } catch (e) {}
  }
  function recall() {
    try {
      var raw = localStorage.getItem(SAVE);
      if (raw) state = Game.load(raw);
    } catch (e) { /* unreadable — start fresh rather than fail */ }
  }

  // ── screens ────────────────────────────────────────────────────────────
  var TITLES = { play: "Play", shop: "Shop", bag: "Collection" };

  function show(which) {
    tab = which;
    ["play", "shop", "bag"].forEach(function (t) {
      $("screen" + cap(t)).classList.toggle("hidden", t !== which);
      $("tab" + cap(t)).classList.toggle("on", t === which);
    });
    $("navTitle").textContent = TITLES[which];

    // The game keeps running while you shop otherwise, which both wastes
    // battery and means you come back mid-fall.
    if (which === "play") { if (game) { game.resize(); game.start(); } }
    else if (game) game.stop();

    if (which === "shop") renderShop();
    if (which === "bag") renderBag();
    if (which === "play") renderItemBar();
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  //  The three items, shown before a run starts. Dimmed when you hold none;
  //  tap to arm, tap again to disarm. Nothing is spent until you fly.
  //
  //  One per round. Tapping a second swaps to it, and the others visibly go
  //  quiet while something is armed so the rule is legible without reading the
  //  label — otherwise the swap just looks like the first button broke.
  function renderItemBar() {
    var bar = $("itemBar");
    if (!bar) return;
    bar.innerHTML = "";
    var on = Game.armedItem(state);
    Game.ITEMS.forEach(function (it) {
      var n = Game.itemCount(state, it.id);
      var armed = on === it.id;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "item-btn" + (n ? "" : " empty") + (armed ? " armed" : "") +
                    (on && !armed && n ? " benched" : "");
      b.style.setProperty("--tint", it.tint);
      b.innerHTML =
        '<span class="ib-icon">' + it.icon + '</span>' +
        '<span class="ib-name">' + esc(it.name) + '</span>' +
        '<span class="ib-n">' + n + '</span>';
      b.title = !n ? it.name + " — none held"
              : armed ? it.blurb + " — on, tap to turn off"
              : on ? it.blurb + " — tap to use this instead"
              : it.blurb + " — tap to use";
      b.onclick = function () {
        var r = Game.toggleItem(state, it.id);
        if (!r.ok) { Sfx.play("nope"); return; }
        Sfx.play(r.armed ? "flick" : "tock");
        store();
        // Rebuilt straight away, so arming Easy Pipe visibly widens the gaps
        // before you fly rather than on some later round. Only while waiting
        // — mid-run the rules must not change under you.
        if (game && game.state === "ready") prepareRun();
        else renderItemBar();
      };
      bar.appendChild(b);
    });
  }

  // ── the pet ────────────────────────────────────────────────────────────
  //  Chosen from the play screen rather than the collection, because tapping a
  //  card in the collection already means "sell a spare" — overloading that
  //  tap would make one of the two a mistake waiting to happen.
  //  Returns the set as well, because a card has no name of its own — it is
  //  identified by which machine it came out of and how rare it is.
  function findCard(id) {
    for (var i = 0; i < sets.length; i++) {
      for (var j = 0; j < sets[i].cards.length; j++) {
        if (sets[i].cards[j].id === id) return { card: sets[i].cards[j], set: sets[i] };
      }
    }
    return null;
  }

  function renderPetSlot() {
    var slot = $("petSlot");
    if (!slot) return;
    var id = Game.petId(state);
    var found = id ? findCard(id) : null;
    slot.className = "pet-slot" + (found ? " has " + found.card.rarity : "");
    slot.innerHTML = found
      ? '<img src="assets/' + found.card.file + '" alt="">' +
        '<span>' + esc(found.set.name) + ' · ' +
        esc(Game.RARITY[found.card.rarity].label) + '</span>'
      : '<span class="pet-empty">Choose a pet</span>';
    slot.title = found ? "Tap to change your pet" : "Tap to pick a pet";
  }

  //  How solid the pet is drawn. A preference rather than game state, so it
  //  lives beside the sound setting instead of in the save — it says nothing
  //  about your collection.
  var PET_OPACITY_KEY = "gotcha:petOpacity";
  var petOpacity = 1;

  function loadPetOpacity() {
    try {
      var raw = localStorage.getItem(PET_OPACITY_KEY);
      if (raw === null) return;
      var v = parseFloat(raw);
      // Clamped rather than trusted: a bad value would make the pet invisible
      // with no obvious way to get it back.
      if (isFinite(v)) petOpacity = Math.max(0.15, Math.min(1, v));
    } catch (e) {}
  }

  function savePetOpacity() {
    try { localStorage.setItem(PET_OPACITY_KEY, String(petOpacity)); } catch (e) {}
  }

  function applyPet() {
    if (!game) return;
    var id = Game.petId(state);
    var found = id ? findCard(id) : null;
    game.setPet(found ? "assets/" + found.card.file : null);
    game.setPetOpacity(petOpacity);
  }

  function renderPetOpacity() {
    var pct = Math.round(petOpacity * 100);
    var slider = $("petOpacity");
    if (slider) slider.value = String(pct);
    var note = $("petOpacityNote");
    if (note) {
      note.textContent = pct >= 100 ? "Solid"
                       : pct <= 25 ? pct + "% — barely there"
                       : pct + "% — see-through";
    }
  }

  function openPetPicker() {
    var grid = $("petGrid");
    grid.innerHTML = "";
    var current = Game.petId(state);
    var any = false;

    sets.forEach(function (set) {
      set.cards.forEach(function (card) {
        if (!Game.ownedCount(state, card.id)) return;   // only what you own
        any = true;
        var d = document.createElement("div");
        d.className = "card " + card.rarity + (current === card.id ? " chosen" : "");
        d.innerHTML = '<img src="assets/' + card.file + '" alt="">';
        d.onclick = function () {
          var r = Game.equipPet(state, card.id);
          if (!r.ok) { Sfx.play("nope"); return; }
          Sfx.play(r.pet ? "flick" : "tock");
          store();
          applyPet();
          renderPetSlot();
          openPetPicker();      // redrawn so the tick moves
        };
        grid.appendChild(d);
      });
    });

    if (!any) {
      grid.innerHTML = '<p class="pet-none">Nothing to bring along yet — ' +
                       'pull a card from the shop first.</p>';
    }
    $("petBack").classList.add("show");
  }

  function renderCoins() {
    $("coinCount").textContent = state.coins.toLocaleString();
    $("rateLine").textContent = Game.coinsPerPipe(state) + " coins a pipe";
  }

  // ── the shop ───────────────────────────────────────────────────────────
  function renderShop() {
    stopCyclers();
    var cost = Game.upgradeCost(state.upgrades);
    var can = state.coins >= cost;
    var need = Game.pipesToAfford(state);

    var box = $("upgradeCell");
    box.innerHTML = "";
    var wp = Game.wheelProgress(state);
    var now = Game.coinsPerPipe(state);

    // What the next purchase actually does. A spin has no knowable "next
    // number", so it says so rather than printing a figure it cannot honour.
    var nextBit = wp.ready
      ? "<b style='display:inline'>Spin the wheel</b>"
      : "<b style='display:inline'>" +
        Math.round(Game.perPipe(Game.flatUpgrades(state) + 1) * Game.wheelMult(state)) +
        "</b>";

    box.appendChild(cell(
      pill(wp.ready ? "◉" : "＋",
           wp.ready ? "linear-gradient(to bottom,#ffd76a,#e09a12)"
                    : "linear-gradient(to bottom,#7ce07c,#24a324)"),
      "<b>Better wings</b><small>Now " + now + " a pipe → " + nextBit +
        ". Bought " + state.upgrades + " time" + (state.upgrades === 1 ? "" : "s") + ".</small>",
      button(cost.toLocaleString(), can ? "gold" : "grey", !can, function () {
        buyUpgrade();
      })
    ));

    // The run-up to the wheel. Four steps, so you can see it coming rather
    // than being surprised by an upgrade that behaves differently.
    box.appendChild(wheelBar(wp));

    if (!can) {
      // "500 coins" means nothing without knowing what a pipe pays.
      box.appendChild(cell(null,
        "<small>" + need + " more pipe" + (need === 1 ? "" : "s") + " at your current rate.</small>", null));
    }

    // ── items ────────────────────────────────────────────────────────
    var ibox = $("itemCell");
    ibox.innerHTML = "";
    var spinCost = Game.ITEM_SPIN_COST;
    var canSpin = state.coins >= spinCost;
    ibox.appendChild(cell(
      pill("🎰", "linear-gradient(to bottom,#5f6ad4,#2f3894)"),
      "<b>Item machine</b><small>One of three, every spin — you never lose. " +
        "Items are used up on the run you take them into.</small>",
      button(spinCost.toLocaleString(), canSpin ? "gold" : "grey", !canSpin, function () {
        spinForItem();
      })
    ));
    Game.ITEMS.forEach(function (it) {
      var n = Game.itemCount(state, it.id);
      var c = document.createElement("div");
      c.className = "cell item-row" + (n ? "" : " none");
      c.innerHTML =
        '<div class="item-chip" style="background:linear-gradient(to bottom,' +
          it.tint + ',' + shade(it.tint) + ')">' + it.icon + '</div>' +
        '<div class="grow"><b>' + esc(it.name) + '</b><small>' + esc(it.blurb) + '</small></div>' +
        '<div class="item-have">' + n + '</div>';
      ibox.appendChild(c);
    });

    var mbox = $("machines");
    mbox.innerHTML = "";
    sets.forEach(function (set, i) {
      var price = Game.setCost(i);
      var prog = Game.setProgress(state, set);
      var afford = state.coins >= price;
      var tenPrice = price * Game.BATCH;
      var affordTen = state.coins >= tenPrice;

      // Two buttons, stacked: one pull, or ten. The ten is plainly priced at
      // ten times the one — there is no bulk discount to go hunting for.
      var buys = document.createElement("div");
      buys.className = "buy-stack";
      buys.appendChild(button(price.toLocaleString(), afford ? "" : "grey", !afford, function (e) {
        // The row's badge is where the capsule flies from.
        var row = e.currentTarget.closest(".cell");
        doPull(set, i, row && row.querySelector(".machine-art"));
      }));
      buys.appendChild(button("×10 · " + tenPrice.toLocaleString(),
        affordTen ? "ten" : "grey", !affordTen, function (e) {
          var row = e.currentTarget.closest(".cell");
          doPullMany(set, i, row && row.querySelector(".machine-art"));
        }));

      mbox.appendChild(cell(
        machinePreview(set),
        "<b>" + esc(set.name) + "</b><small>" + esc(set.blurb) + " · " +
          prog.have + " of " + prog.of +
          (prog.complete ? " — complete" : "") + "</small>",
        buys
      ));
    });

    // Odds are derived from the real weights, so what is shown here cannot
    // drift from what the machine actually does.
    var odds = Game.tierOdds(sets.length ? sets[0].cards : []);
    var obox = $("oddsCell");
    obox.innerHTML = "";
    var rows = Game.RARITY_ORDER.slice().reverse().map(function (t) {
      var r = Game.RARITY[t];
      return '<div class="odds-row"><span><span class="dot" style="background:' +
             r.tint + '"></span>' + r.label + '</span><b>' +
             (odds[t] * 100).toFixed(1) + '%</b></div>';
    }).join("");
    var c = document.createElement("div");
    c.className = "cell";
    c.innerHTML = '<div class="grow">' + rows + '</div>';
    obox.appendChild(c);

    // Which build this phone is actually running. Without it, "is it updated?"
    // has no answer you can check from the sofa.
    var v = document.createElement("div");
    v.className = "cell build-line";
    v.innerHTML = '<div class="grow"><small>Build ' + esc(BUILD) + '</small></div>';
    obox.appendChild(v);
  }

  //  The progress bar to the next wheel. Pips rather than a smooth bar —
  //  there are only four steps, and four discrete lights say "three more"
  //  where a bar just looks three-quarters full.
  function wheelBar(wp) {
    var c = document.createElement("div");
    c.className = "cell wheel-bar" + (wp.ready ? " ready" : "");
    var pips = "";
    for (var i = 0; i < wp.of; i++) {
      var on = wp.ready || i < wp.have;
      pips += '<span class="pip' + (on ? " on" : "") +
              (wp.ready && i === wp.of - 1 ? " last" : "") + '"></span>';
    }
    var label = wp.free ? "Free spin ready"
              : wp.ready ? "Next upgrade spins the wheel"
              : (wp.of - wp.have) + " more to the wheel";
    c.innerHTML =
      '<div class="grow"><div class="pips">' + pips + '</div>' +
      '<small>' + esc(label) + '</small></div>';
    return c;
  }

  function cell(art, html, btn) {
    var c = document.createElement("div");
    c.className = "cell";
    if (art) c.appendChild(art);
    var g = document.createElement("div");
    g.className = "grow";
    g.innerHTML = html;
    c.appendChild(g);
    if (btn) c.appendChild(btn);
    return c;
  }
  //  Buying an upgrade. Ordinary ones are instant; a wheel takes over the
  //  screen the way a capsule does.
  var spinningWheel = false;
  function buyUpgrade() {
    if (busy()) return;
    var r = Game.buyUpgrade(state, Math.random);
    if (!r.ok) { Sfx.play("nope"); return; }
    store();
    renderCoins();
    if (!r.wheel) { Sfx.play("bloop"); renderShop(); return; }
    playWheel(r);
  }

  //  The wheel. Four equal quarters; the result is already decided, so the
  //  spin is choreography rather than a draw. It is rotated so the winning
  //  slice finishes under the pointer.
  var WHEEL_BEATS = { hide: 0, show: 120, spin: 420, land: 3600, done: 5000 };

  function playWheel(r) {
    clearSequence();
    spinningWheel = true;
    beginSequence(WHEEL_BEATS.done);
    var stage = $("capsuleStage");
    stage.innerHTML = "";
    stage.classList.add("show");
    var screen = $("screen" + cap(tab));
    if (screen) screen.classList.add("busy");
    at(WHEEL_BEATS.hide + 60, function () { stage.classList.add("dim"); });

    var n = Game.WHEEL.length;
    var seg = 360 / n;
    var wrap = document.createElement("div");
    wrap.className = "wheel-wrap";
    var labels = "";
    for (var i = 0; i < n; i++) {
      // Each label sits at the middle of its own slice.
      labels += '<span class="wl" style="transform:rotate(' +
                (i * seg + seg / 2) + 'deg) translateY(-62px) rotate(' +
                (-(i * seg + seg / 2)) + 'deg)">×' + Game.WHEEL[i] + '</span>';
    }
    wrap.innerHTML =
      '<div class="wheel-peg"></div>' +
      '<div class="wheel" id="theWheel"><div class="wheel-face"></div>' + labels + '</div>' +
      '<div class="wheel-hub"></div>' +
      '<div class="wheel-say" id="wheelSay">Better wings</div>';
    stage.appendChild(wrap);

    var w = wrap.querySelector(".wheel");

    at(WHEEL_BEATS.spin, function () {
      Sfx.play("crank");
      var riser = Sfx.riser((WHEEL_BEATS.land - WHEEL_BEATS.spin) / 1000);
      pullTimers.push(setTimeout(function () { if (riser) riser.stop(); },
                                 WHEEL_BEATS.land - WHEEL_BEATS.spin));
      // Six whole turns, then however far round the winning slice is. The
      // pointer is at the top, so the slice has to come back TO it.
      var target = 360 * 6 - (r.index * seg + seg / 2);
      w.style.transform = "rotate(" + target + "deg)";
    });

    at(WHEEL_BEATS.land, function () {
      Sfx.play("crack");
      Sfx.play("reveal", r.multiplier >= 3 ? "legendary"
                       : r.multiplier >= 2 ? "veryrare" : "rare");
      if (r.multiplier >= 3) {
        setTimeout(function () { Sfx.play("tritone"); }, 380);
      }
      var say = $("wheelSay");
      if (say) {
        say.textContent = "×" + r.multiplier + " — now " + r.now + " a pipe";
        say.className = "wheel-say hit";
      }
      wrap.classList.add("landed");
    });

    // Backstop: a throttled tab must not leave the shop hidden for ever.
    pullTimers.push(setTimeout(function () {
      if (spinningWheel) { spinningWheel = false; clearSequence(); renderShop(); }
    }, WHEEL_BEATS.done + 2500));

    at(WHEEL_BEATS.done, function () {
      spinningWheel = false;
      stage.classList.remove("show", "dim");
      stage.innerHTML = "";
      if (screen) screen.classList.remove("busy");
      renderShop();
    });
  }

  //  The item machine. Three reels, all landing on the same thing — you
  //  cannot lose here, so the "win" line is the only outcome there is, and
  //  showing three matching symbols is what makes that read as a win rather
  //  than as a consolation.
  var spinning = false;
  function spinForItem() {
    if (spinning) return;
    var r = Game.spinItem(state, Math.random);
    if (!r.ok) { Sfx.play("nope"); return; }
    spinning = true;
    store();
    renderCoins();

    var stage = $("capsuleStage");
    stage.innerHTML = "";
    stage.classList.add("show", "dim");
    var screen = $("screen" + cap(tab));
    if (screen) screen.classList.add("busy");

    var slot = document.createElement("div");
    slot.className = "slot";
    slot.innerHTML =
      '<div class="slot-top">Item machine</div>' +
      '<div class="reels">' +
        '<div class="reel"><span></span></div>' +
        '<div class="reel"><span></span></div>' +
        '<div class="reel"><span></span></div>' +
      '</div>' +
      '<div class="slot-name"></div>';
    stage.appendChild(slot);

    var reels = [].slice.call(slot.querySelectorAll(".reel span"));
    // Each reel rolls through all three symbols and stops in turn, left to
    // right — three reels stopping together is a still image, not a spin.
    var rolling = reels.map(function (el, i) {
      var k = 0;
      return setInterval(function () {
        var it = Game.ITEMS[k++ % Game.ITEMS.length];
        el.textContent = it.icon;
        el.style.color = it.tint;
      }, 70 + i * 12);
    });

    Sfx.play("crank");
    var stops = [900, 1300, 1750];
    reels.forEach(function (el, i) {
      setTimeout(function () {
        clearInterval(rolling[i]);
        el.textContent = r.item.icon;
        el.style.color = r.item.tint;
        el.parentNode.classList.add("stopped");
        Sfx.play("drop");
      }, stops[i]);
    });

    setTimeout(function () {
      slot.classList.add("won");
      slot.querySelector(".slot-name").textContent = r.item.name;
      Sfx.play("reveal", "rare");
      Sfx.play("bloop");
    }, stops[2] + 260);

    setTimeout(function () {
      rolling.forEach(clearInterval);       // belt and braces
      spinning = false;
      stage.classList.remove("show", "dim");
      stage.innerHTML = "";
      if (screen) screen.classList.remove("busy");
      renderShop();
    }, stops[2] + 1500);
  }

  //  A darker version of a hex colour, for the gradients.
  function shade(hex) {
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
    if (!m) return hex || "#666";
    return "#" + [1,2,3].map(function (i) {
      var v = Math.max(0, parseInt(m[i], 16) - 52);
      return ("0" + v.toString(16)).slice(-2);
    }).join("");
  }

  //  A machine shows what is inside it, cycling through its cards. The very
  //  rare and legendary ones are blacked out — you can see there is something
  //  there and how many, without the surprise being given away before you pay.
  var cyclers = [];
  function machinePreview(set) {
    var d = document.createElement("div");
    d.className = "machine-art";
    d.style.background = "linear-gradient(to bottom," + set.hex + "," + set.lo + ")";

    var img = document.createElement("img");
    img.className = "peek";
    img.alt = "";
    d.appendChild(img);

    var i = Math.floor(Math.random() * set.cards.length);
    function next() {
      var card = set.cards[i % set.cards.length];
      i++;
      img.src = "assets/" + card.file;
      // A silhouette rather than a hidden slot: the shape is a tease, and a
      // gap would just look like a bug.
      img.classList.toggle("blackout",
        card.rarity === "veryrare" || card.rarity === "legendary");
      // Restart the fade on every change.
      img.classList.remove("in");
      void img.offsetWidth;
      img.classList.add("in");
    }
    next();
    // Staggered, so six machines do not all flip on the same beat.
    var timer = setInterval(next, 1100 + Math.random() * 500);
    cyclers.push(timer);
    return d;
  }

  //  Cleared whenever the shop is rebuilt, or every render leaves another set
  //  of timers running against elements that are no longer on the page.
  function stopCyclers() {
    cyclers.forEach(clearInterval);
    cyclers = [];
  }

  function pill(text, bg) {
    var d = document.createElement("div");
    d.className = "machine-art";
    d.style.background = bg;
    d.textContent = text;
    return d;
  }
  function button(label, cls, disabled, onClick) {
    var b = document.createElement("button");
    b.className = "btn small" + (cls ? " " + cls : "");
    b.textContent = label;
    b.disabled = !!disabled;
    if (!disabled) {
      b.onclick = onClick;
    } else {
      // A disabled button that makes no sound reads as broken rather than as
      // unaffordable. Pointer events still reach it because it is only
      // visually disabled to the eye, not removed from the page.
      b.disabled = false;
      b.classList.add("cant");
      b.onclick = function () { Sfx.play("nope"); };
    }
    return b;
  }

  // ── pulling ────────────────────────────────────────────────────────────
  var lastPull = null;

  var pulling = false;
  function doPull(set, index, fromEl) {
    // Pressing a second machine mid-sequence would leave two capsules and two
    // risers running over each other.
    if (busy()) return;
    var r = Game.buyPull(state, set, index, Math.random);
    if (!r.ok) return;
    lastPull = { set: set, index: index };
    store();
    renderCoins();

    // The capsule flies from the machine you pressed. Without a starting
    // point it would appear from nowhere, which is the whole difference
    // between an animation and a transition.
    playCapsule(set, r, fromEl, function () {
      pulling = false;
      showResult(set, index, r);
    });
    return;
  }

  //  The pull, as one sequence:
  //
  //    the shop steps aside → a machine rises → the dial turns → a capsule
  //    drops into the chute → it climbs, growing, while a riser builds →
  //    it shudders → the shell splits and the prize glows its rarity.
  //
  //  Driven by timers rather than one long keyframe: the beats have to line
  //  up with sounds and with two separate elements, which a single animation
  //  cannot coordinate.
  var BEATS = {
    hide:   0,      // the shop gets out of the way
    rise:   220,    // the machine comes up
    turn:   640,    // the dial goes round
    drop:   1240,   // a capsule lands in the chute
    climb:  1560,   // it starts up the screen — the riser begins here
    shake:  2380,
    open:   2760,
    finish: 3500,
  };
  var CLIMB_SECONDS = (BEATS.open - BEATS.climb) / 1000;

  //  Whether a takeover sequence (capsule, batch or wheel) is running.
  //
  //  The flag alone is not enough: if the tab is backgrounded the timers that
  //  would clear it can be throttled or dropped, and the shop would refuse
  //  every purchase afterwards with no explanation. So the flag carries a
  //  deadline, and past it the sequence is presumed dead.
  var seqEndsAt = 0;

  function beginSequence(totalMs) {
    seqEndsAt = Date.now() + totalMs + 3000;
  }
  function busy() {
    if (!pulling && !spinningWheel) return false;
    if (Date.now() > seqEndsAt) { clearSequence(); return false; }
    return true;
  }

  var pullTimers = [];
  //  Each beat is guarded on its own. One throwing used to abandon the whole
  //  sequence with the shop hidden and the flag still set.
  function at(ms, fn) {
    pullTimers.push(setTimeout(function () {
      try { fn(); } catch (e) {
        if (window.console) console.warn("[Gotcha] pull step failed:", e);
        clearSequence();
      }
    }, ms));
  }
  function clearSequence() {
    pullTimers.forEach(clearTimeout);
    pullTimers = [];
    Sfx.stopAll();
    // Released here too. If a beat throws, or the page is hidden partway
    // through, the flag would otherwise stay set and every later purchase
    // would be refused with no explanation.
    pulling = false;
    spinningWheel = false;
    var stage = $("capsuleStage");
    if (stage) { stage.classList.remove("show", "dim"); stage.innerHTML = ""; }
    ["play", "shop", "bag"].forEach(function (t) {
      var el = $("screen" + cap(t));
      if (el) el.classList.remove("busy");
    });
  }

  function playCapsule(set, result, fromEl, done) {
    clearSequence();
    // After clearSequence, not before: clearing is what releases the flag, so
    // raising it first meant the guard was never actually set during a pull.
    pulling = true;
    beginSequence(BEATS.finish);
    var rarity = Game.RARITY[result.card.rarity];
    var stage = $("capsuleStage");
    stage.innerHTML = "";
    stage.classList.add("show");

    // The shop steps back so the machine is the only thing on screen.
    var screen = $("screen" + cap(tab));
    if (screen) screen.classList.add("busy");
    at(BEATS.hide + 60, function () { stage.classList.add("dim"); });

    // ── the machine ──────────────────────────────────────────────────────
    var machine = document.createElement("div");
    machine.className = "machine";
    machine.style.setProperty("--hi", set.hex);
    machine.style.setProperty("--lo", set.lo);
    machine.innerHTML =
      '<div class="dome"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
      '<div class="body"><div class="dial"></div><div class="chute"></div></div>';
    stage.appendChild(machine);

    // ── the capsule ──────────────────────────────────────────────────────
    var capsule = document.createElement("div");
    capsule.className = "capsule";
    capsule.style.setProperty("--hi", set.hex);
    capsule.style.setProperty("--lo", set.lo);
    capsule.style.setProperty("--glow", rarity.tint);
    capsule.innerHTML =
      '<img class="cap-prize" src="assets/' + result.card.file + '" alt="">' +
      '<div class="cap-half top"></div><div class="cap-half bot"></div>' +
      '<div class="cap-seam"></div>';
    stage.appendChild(capsule);

    var riserHandle = null;

    at(BEATS.rise, function () { machine.classList.add("up"); });

    at(BEATS.turn, function () {
      machine.classList.add("turn");
      Sfx.play("crank");
    });

    at(BEATS.drop, function () {
      machine.classList.add("rattle");
      Sfx.play("drop");
      // Positioned on the chute, measured rather than assumed — the machine
      // has just animated into place and its real position is the only thing
      // that puts the capsule in the right hole.
      var ch = machine.querySelector(".chute").getBoundingClientRect();
      capsule.style.left = (ch.left + ch.width / 2) + "px";
      capsule.style.top = (ch.top + ch.height / 2) + "px";
      capsule.classList.add("out");
    });

    at(BEATS.climb, function () {
      machine.classList.remove("rattle");
      capsule.style.left = (window.innerWidth / 2) + "px";
      capsule.style.top = (window.innerHeight * 0.40) + "px";
      capsule.classList.add("big");
      // The riser runs exactly as long as the climb, so it peaks at the
      // moment the shell gives.
      riserHandle = Sfx.riser(CLIMB_SECONDS);
    });

    at(BEATS.shake, function () { capsule.classList.add("shake"); });

    at(BEATS.open, function () {
      capsule.classList.remove("shake");
      capsule.classList.add("open");
      if (riserHandle) riserHandle.stop();
      Sfx.play("crack");
      Sfx.play("reveal", result.card.rarity);
      // The one sound everybody recognises, saved for the one card that
      // deserves it. Using it more often would spend it.
      if (result.card.rarity === "legendary") {
        setTimeout(function () { Sfx.play("tritone"); }, 420);
      }
      machine.classList.add("away");
    });

    // A backstop well past the end. If the tab is backgrounded the timers can
    // be throttled or dropped entirely, and without this the game would come
    // back stuck.
    pullTimers.push(setTimeout(function () {
      if (pulling) { clearSequence(); done(); }
    }, BEATS.finish + 2500));

    at(BEATS.finish, function () {
      stage.classList.remove("show", "dim");
      stage.innerHTML = "";
      if (screen) screen.classList.remove("busy");
      done();
    });
  }

  //  Ten at once. The machine dispenses the whole batch into a grid, they all
  //  crack together, and then the screen whites out — the white is what turns
  //  ten small reveals into one big one, and it covers the jump to the
  //  card-by-card walkthrough that follows.
  function doPullMany(set, index, fromEl) {
    if (busy()) return;
    var r = Game.buyPullMany(state, set, index, Game.BATCH, Math.random);
    if (!r.ok) { Sfx.play("nope"); return; }
    lastPull = { set: set, index: index };
    store();
    renderCoins();
    playCapsuleBatch(set, r.results, fromEl, function () {
      pulling = false;
      showBatch(set, index, r.results);
    });
  }

  var TEN = {
    hide:   0,
    rise:   220,
    turn:   640,
    drop:   1240,   // the first capsule; the rest follow every dropStep
    dropStep: 120,
    climbIn:  170,  // how long after its own drop each one sets off
    open:   3050,   // the first shell gives; the rest follow every openStep
    openStep: 105,
    white:  4380,
    finish: 5080,
  };

  //  Where the ten land: five across, two down, sized from the viewport so
  //  they fit a narrow phone rather than assuming a width.
  function batchLayout(n) {
    var cols = 5, rows = Math.ceil(n / cols);
    var pad = 14;
    var cellW = Math.min(74, (window.innerWidth - pad * 2) / cols);
    var scale = Math.max(0.55, (cellW * 0.88) / 62);
    var gridW = cellW * cols;
    var left0 = (window.innerWidth - gridW) / 2 + cellW / 2;
    var cellH = cellW * 1.12;
    var top0 = window.innerHeight * 0.42 - ((rows - 1) * cellH) / 2;
    var pos = [];
    for (var i = 0; i < n; i++) {
      pos.push({
        x: left0 + (i % cols) * cellW,
        y: top0 + Math.floor(i / cols) * cellH,
      });
    }
    return { pos: pos, scale: scale };
  }

  function playCapsuleBatch(set, results, fromEl, done) {
    clearSequence();
    pulling = true;
    beginSequence(TEN.finish);
    var stage = $("capsuleStage");
    stage.innerHTML = "";
    stage.classList.add("show");

    var screen = $("screen" + cap(tab));
    if (screen) screen.classList.add("busy");
    at(TEN.hide + 60, function () { stage.classList.add("dim"); });

    var machine = document.createElement("div");
    machine.className = "machine";
    machine.style.setProperty("--hi", set.hex);
    machine.style.setProperty("--lo", set.lo);
    machine.innerHTML =
      '<div class="dome"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
      '<div class="body"><div class="dial"></div><div class="chute"></div></div>';
    stage.appendChild(machine);

    var layout = batchLayout(results.length);
    var capsules = results.map(function (r) {
      var c = document.createElement("div");
      c.className = "capsule";
      c.style.setProperty("--hi", set.hex);
      c.style.setProperty("--lo", set.lo);
      c.style.setProperty("--glow", Game.RARITY[r.card.rarity].tint);
      c.style.setProperty("--s", layout.scale);
      c.innerHTML =
        '<img class="cap-prize" src="assets/' + r.card.file + '" alt="">' +
        '<div class="cap-half top"></div><div class="cap-half bot"></div>' +
        '<div class="cap-seam"></div>';
      stage.appendChild(c);
      return c;
    });

    // The whole batch is one riser, running from the first capsule leaving the
    // chute to the first shell giving.
    var riserHandle = null;

    at(TEN.rise, function () { machine.classList.add("up"); });
    at(TEN.turn, function () { machine.classList.add("turn"); Sfx.play("crank"); });

    capsules.forEach(function (c, i) {
      var dropAt = TEN.drop + i * TEN.dropStep;
      at(dropAt, function () {
        if (i === 0) {
          machine.classList.add("rattle");
          riserHandle = Sfx.riser((TEN.open - TEN.drop) / 1000);
        }
        Sfx.play("drop");
        // Measured, not assumed — the machine has just animated into place.
        var ch = machine.querySelector(".chute").getBoundingClientRect();
        c.style.left = (ch.left + ch.width / 2) + "px";
        c.style.top = (ch.top + ch.height / 2) + "px";
        c.classList.add("out");
      });
      at(dropAt + TEN.climbIn, function () {
        c.style.left = layout.pos[i].x + "px";
        c.style.top = layout.pos[i].y + "px";
        c.classList.add("spread");
      });
    });

    at(TEN.drop + results.length * TEN.dropStep, function () {
      machine.classList.remove("rattle");
    });

    // The best card in the batch is what the fanfare is for. Ten separate
    // reveal stings would be mush, and would spend the legendary sound on a
    // batch that only contained commons.
    var best = results.reduce(function (b, r) {
      return Game.RARITY_ORDER.indexOf(r.card.rarity) >
             Game.RARITY_ORDER.indexOf(b) ? r.card.rarity : b;
    }, "common");

    capsules.forEach(function (c, i) {
      at(TEN.open + i * TEN.openStep, function () {
        c.classList.add("open");
        if (i === 0) {
          if (riserHandle) riserHandle.stop();
          Sfx.play("crack");
          machine.classList.add("away");
        }
        if (i === capsules.length - 1) {
          Sfx.play("reveal", best);
          if (best === "legendary") {
            setTimeout(function () { Sfx.play("tritone"); }, 420);
          }
        }
      });
    });

    at(TEN.white, function () {
      var w = document.createElement("div");
      w.className = "whiteout";
      stage.appendChild(w);
      // Forced to the next frame — appending and adding the class together
      // gives the browser no starting value to animate from.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { w.classList.add("on"); });
      });
      Sfx.play("swoosh");
    });

    pullTimers.push(setTimeout(function () {
      if (pulling) { clearSequence(); done(); }
    }, TEN.finish + 3000));

    at(TEN.finish, function () {
      stage.classList.remove("show", "dim");
      stage.innerHTML = "";
      if (screen) screen.classList.remove("busy");
      done();
    });
  }

  // ── the reveal ─────────────────────────────────────────────────────────
  //  A single pull gets the full-size card. A batch gets everything on one
  //  screen — ten taps of Next to see what you already watched come out of
  //  the machine is a toll, not a reveal.
  function showResult(set, index, r) {
    var rarity = Game.RARITY[r.card.rarity];
    $("pullTier").textContent = rarity.label;
    $("pullTier").style.color = rarity.tint;
    $("pullSet").textContent = set.name;
    $("pullImg").src = "assets/" + r.card.file;
    $("pullDupe").textContent = r.duplicate
      ? "You already had this one — that makes " + r.count + "."
      : "New!";
    $("pullModal").className = "modal " + r.card.rarity;

    var price = Game.setCost(index);
    var again = $("pullAgain");
    again.textContent = "Again · " + price;
    again.disabled = state.coins < price;

    Sfx.play("swoosh");
    $("pullBack").classList.add("show");
  }

  //  The batch summary. Sorted best-first, so the thing worth seeing is at the
  //  top rather than buried at position seven.
  function showBatch(set, index, results) {
    var order = Game.RARITY_ORDER;
    var sorted = results.slice().sort(function (a, b) {
      return order.indexOf(b.card.rarity) - order.indexOf(a.card.rarity);
    });

    var grid = $("batchGrid");
    grid.innerHTML = "";
    sorted.forEach(function (r) {
      var d = document.createElement("div");
      d.className = "card " + r.card.rarity + (r.duplicate ? "" : " fresh");
      d.innerHTML =
        '<img src="assets/' + r.card.file + '" alt="">' +
        (r.duplicate ? '<span class="n">×' + r.count + '</span>'
                     : '<span class="new-tag">NEW</span>');
      grid.appendChild(d);
    });

    var fresh = results.filter(function (r) { return !r.duplicate; }).length;
    $("batchTitle").textContent = "You got " + results.length;
    $("batchSet").textContent = set.name;
    $("batchNew").textContent = fresh
      ? fresh + (fresh === 1 ? " is new" : " are new")
      : "All duplicates this time.";
    // Tinted by the best thing in the batch — the same signal the single-pull
    // modal gives, at a glance.
    $("batchModal").className = "modal " + sorted[0].card.rarity;

    Sfx.play("swoosh");
    $("batchBack").classList.add("show");
  }

  // ── finishing the collection ───────────────────────────────────────────
  //  Two steps on purpose. The first is the moment itself; the second tells
  //  you what it won and where to find it. Putting the reward in the same
  //  breath as the celebration buries it.
  var doneStage = 0;

  function maybeCelebrate() {
    if (!Game.checkComplete(state, sets)) return false;
    store();
    showCompleted();
    return true;
  }

  function showCompleted() {
    doneStage = 0;
    $("doneTitle").textContent = "COMPLETED!!";
    $("doneBody").textContent =
      "Every card in every machine — all " + Game.totals(state, sets).of + " of them.";
    $("doneNext").textContent = "Continue";
    $("doneBack").classList.add("show");
    throwConfetti();
    Sfx.play("reveal", "legendary");
    setTimeout(function () { Sfx.play("tritone"); }, 420);
  }

  //  Built once per celebration and thrown away with it. Plain elements
  //  rather than a canvas, because there is already a canvas underneath and
  //  this has to sit above the modal backdrop.
  function throwConfetti() {
    var box = $("confetti");
    if (!box) return;
    box.innerHTML = "";
    var tints = ["#e8a317", "#e0352b", "#3478f6", "#3fa845", "#ffffff", "#efad14"];
    for (var i = 0; i < 70; i++) {
      var b = document.createElement("i");
      b.style.setProperty("--x", (Math.random() * 100).toFixed(2) + "%");
      b.style.setProperty("--d", (0.6 + Math.random() * 0.9).toFixed(2) + "s");
      b.style.setProperty("--t", (1.6 + Math.random() * 1.8).toFixed(2) + "s");
      b.style.setProperty("--r", Math.floor(Math.random() * 720 - 360) + "deg");
      b.style.setProperty("--c", tints[i % tints.length]);
      b.style.setProperty("--w", (4 + Math.random() * 5).toFixed(1) + "px");
      box.appendChild(b);
    }
    box.classList.add("on");
  }

  $("doneNext").onclick = function () {
    Sfx.play("tock");
    if (doneStage === 0) {
      // Step two: what you won, and where it lives.
      doneStage = 1;
      $("doneTitle").textContent = "Gold bird unlocked";
      $("doneBody").textContent =
        "You can equip it in Settings — the gear at the top left. " +
        "It is just for show; it changes nothing about how you fly.";
      $("doneNext").textContent = "Done";
      return;
    }
    $("doneBack").classList.remove("show");
    $("confetti").classList.remove("on");
    $("confetti").innerHTML = "";
    renderGoldRow();
    if (tab === "shop") renderShop();
    if (tab === "bag") renderBag();
  };

  // ── the gold skin ──────────────────────────────────────────────────────
  function renderGoldRow() {
    var row = $("goldRow"), btn = $("goldBtn"), note = $("goldNote");
    if (!row) return;
    var have = !!state.goldSkin;
    row.className = "set-row" + (have ? "" : " locked");
    btn.textContent = !have ? "Locked" : state.goldOn ? "On" : "Off";
    btn.className = "btn small" + (have && state.goldOn ? " gold" : " grey");
    var t = Game.totals(state, sets);
    note.textContent = have
      ? "Yours for finishing the collection."
      : "Finish the collection to unlock — " + t.have + " of " + t.of + ".";
  }

  function applyGold() {
    if (game) game.setGold(!!state.goldSkin && !!state.goldOn);
  }

  function closeReveal() {
    $("pullBack").classList.remove("show");
    $("batchBack").classList.remove("show");
    // Checked as the reveal closes rather than as the card lands, so the
    // celebration does not appear behind the card that caused it.
    if (maybeCelebrate()) return;
    if (tab === "shop") renderShop();
    if (tab === "bag") renderBag();
  }

  $("petSlot").onclick = function () {
    Sfx.play("tock");
    openPetPicker();
  };
  $("petNone").onclick = function () {
    Game.equipPet(state, null);
    Sfx.play("tock");
    store();
    applyPet();
    renderPetSlot();
    openPetPicker();
  };
  $("petClose").onclick = function () {
    Sfx.play("tock");
    $("petBack").classList.remove("show");
  };

  $("pullDone").onclick = function () {
    Sfx.play("tock");
    closeReveal();
  };
  $("batchDone").onclick = function () {
    Sfx.play("tock");
    closeReveal();
  };
  $("pullAgain").onclick = function () {
    if (!lastPull) return;
    $("pullBack").classList.remove("show");
    doPull(lastPull.set, lastPull.index, null);
  };

  // ── the collection ─────────────────────────────────────────────────────
  function renderBag() {
    var tot = Game.totals(state, sets);
    $("bagTotals").textContent =
      "Collection — " + tot.have + " of " + tot.of +
      (tot.duplicates ? " · " + tot.duplicates + " spare" : "");
    $("bagBar").style.width = (tot.of ? (tot.have / tot.of * 100) : 0) + "%";

    var spare = Game.spareValue(state, sets);
    var sellAll = $("sellAllBtn");
    if (sellAll) {
      sellAll.textContent = spare.cards
        ? "Sell " + spare.cards + " spare" + (spare.cards === 1 ? "" : "s") +
          " · +" + spare.coins.toLocaleString()
        : "No spares to sell";
      sellAll.className = "btn small" + (spare.cards ? " gold" : " cant");
      sellAll.onclick = spare.cards ? function () {
        var r = Game.sellAllSpares(state, sets);
        if (!r.ok) { Sfx.play("nope"); return; }
        store(); renderCoins();
        Sfx.play("poof"); Sfx.play("bloop");
        renderBag();
      } : function () { Sfx.play("nope"); };
    }

    var box = $("bagSets");
    box.innerHTML = "";
    sets.forEach(function (set) {
      var prog = Game.setProgress(state, set);
      var g = document.createElement("div");
      g.className = "group";
      var h = document.createElement("h3");
      h.textContent = set.name + " — " + prog.have + "/" + prog.of;
      g.appendChild(h);

      var cells = document.createElement("div");
      cells.className = "cells";
      var grid = document.createElement("div");
      grid.className = "bag-grid";

      set.cards.forEach(function (card) {
        var n = Game.ownedCount(state, card.id);
        var d = document.createElement("div");
        // The border colour IS the rarity — it is the only place rarity is
        // shown on a card, so it has to be unmistakable.
        d.className = "card " + card.rarity + (n ? "" : " locked");
        var img = document.createElement("img");
        img.src = "assets/" + card.file;
        img.alt = "";
        img.loading = "lazy";
        var lbl = document.createElement("div");
        lbl.className = "n";
        // A count only where there is more than one; "×1" on every card is
        // noise on the ones you have exactly one of.
        lbl.textContent = n > 1 ? "×" + n : (n ? "✓" : "—");
        d.appendChild(img); d.appendChild(lbl);

        // A spare can be sold. The first copy is the collection and stays put,
        // so only cards you have more than one of are clickable.
        if (n > 1) {
          d.classList.add("sellable");
          var worth = Game.sellValue(card.rarity);
          d.title = Game.RARITY[card.rarity].label + " — tap to sell a spare for " +
                    worth + " coins (" + (n - 1) + " spare)";
          var tag = document.createElement("div");
          tag.className = "sell-tag";
          tag.textContent = "+" + worth;
          d.appendChild(tag);
          d.onclick = function () { sellOne(card, d); };
        } else {
          d.title = n ? Game.RARITY[card.rarity].label + " — your only copy"
                      : "Not found yet";
          // Tapping the only copy should say no rather than feel unresponsive.
          if (n) d.onclick = function () { Sfx.play("nope"); nudge(d); };
        }
        grid.appendChild(d);
      });

      cells.appendChild(grid);
      g.appendChild(cells);
      box.appendChild(g);
    });
  }

  //  Selling one spare, with the card blowing apart as it goes.
  function sellOne(card, el) {
    var r = Game.sellDuplicate(state, card);
    if (!r.ok) { Sfx.play("nope"); nudge(el); return; }
    store();
    renderCoins();
    Sfx.play("poof");
    Sfx.play("coin");
    burst(el, Game.RARITY[card.rarity].tint, r.coins);

    // Redrawn after the burst has played, so the card is not yanked out from
    // under the animation. The count in the corner updates immediately though,
    // because that is the thing being changed.
    var lbl = el.querySelector(".n");
    if (lbl) lbl.textContent = r.left > 1 ? "×" + r.left : "✓";
    setTimeout(function () { if (tab === "bag") renderBag(); }, 520);
  }

  //  A shake, for a tap that cannot do anything.
  function nudge(el) {
    if (!el) return;
    el.classList.remove("nudge");
    void el.offsetWidth;          // restart the animation
    el.classList.add("nudge");
  }

  //  The explosion. Particles are thrown from the card's centre with a random
  //  angle and distance, carried by a CSS transition rather than a keyframe
  //  so each one can have its own direction.
  function burst(el, tint, coins) {
    if (!el || !el.getBoundingClientRect) return;
    var b = el.getBoundingClientRect();
    var cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    var layer = $("burstLayer");

    // A flash on the card itself, so the explosion has something to come from.
    el.classList.remove("pop");
    void el.offsetWidth;
    el.classList.add("pop");

    for (var i = 0; i < 14; i++) {
      var p = document.createElement("i");
      p.className = "spark";
      p.style.left = cx + "px";
      p.style.top = cy + "px";
      p.style.background = tint;
      var a = (Math.PI * 2 * i / 14) + (Math.random() - 0.5) * 0.5;
      var dist = 46 + Math.random() * 46;
      p.style.setProperty("--dx", Math.cos(a) * dist + "px");
      p.style.setProperty("--dy", Math.sin(a) * dist + "px");
      p.style.setProperty("--rot", (Math.random() * 360 | 0) + "deg");
      p.style.animationDelay = (Math.random() * 0.05) + "s";
      layer.appendChild(p);
      (function (node) { setTimeout(function () { node.remove(); }, 700); })(p);
    }

    // The coins earned, floating up from where the card was.
    var f = document.createElement("div");
    f.className = "float-coin";
    f.textContent = "+" + coins;
    f.style.left = cx + "px";
    f.style.top = cy + "px";
    layer.appendChild(f);
    setTimeout(function () { f.remove(); }, 950);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ── the game ───────────────────────────────────────────────────────────
  function startGame() {
    var canvas = $("game");
    game = Flappy.create(canvas, {
      onPipe: function (n) {
        Game.scorePipe(state, runEffects.money);
        Sfx.play("pipe");
        $("hud").textContent = n;
        renderCoins();
      },
      onDie: function (n) {
        Sfx.play("die");
        var best = Game.endRun(state, n);
        store();
        $("dPipes").textContent = n;
        $("dEarned").textContent = (state.coins - runStart).toLocaleString();
        $("dBest").textContent = state.best;
        $("ovDead").style.display = "";
        $("ovReady").style.display = "none";
        if (best) $("dBest").parentNode.style.background = "rgba(255,200,0,.28)";
        else $("dBest").parentNode.style.background = "";
      },
      onHit: function (left, secs) {
        // A hit you survived has to sound different from one you did not, or
        // the item feels like it did nothing.
        Sfx.play("lock");
        Sfx.play("ding");
      },
      onStart: payForRun,
      onFlap: function () {
        Sfx.play("flap");
        $("ovReady").style.display = "none";
        // A pre-run choice, so it goes once the run is under way — three
        // buttons over the pipes would just be in the way.
        $("itemWrap").style.display = "none";
      },
    });
    game.start();

    function tap(e) {
      if ($("pullBack").classList.contains("show")) return;
      if (tab !== "play") return;
      if (game.state === "dead") return;      // the buttons take over here
      e.preventDefault();
      game.flap();
    }
    canvas.addEventListener("pointerdown", tap);
    document.addEventListener("keydown", function (e) {
      if (e.code === "Space" || e.key === " ") {
        if (tab !== "play") return;
        e.preventDefault();
        if (game.state === "dead") again(); else game.flap();
      }
    });

    window.addEventListener("resize", function () {
      if (tab === "play" && game) game.resize();
    });
  }

  var runEffects = { gap: 0, lives: 0, shield: 3, money: 1 };

  //  Preparing a run and paying for it are two different things, and
  //  conflating them was the bug: effects were only read when the "Again"
  //  button was pressed, so an item armed before the FIRST run of a session —
  //  or armed while sitting on the ready screen — did nothing until the round
  //  after. It looked like the item was broken.
  //
  //  Now the pipes are rebuilt to match whatever is armed the moment you arm
  //  it, so a wider gap is visible before you start, and the item itself is
  //  not spent until the run actually begins.
  function prepareRun() {
    if (!game) return;
    runEffects = Game.activeEffects(state);
    game.setEffects(runEffects);
    game.reset();
    // Re-applied every run: the pet may have been changed between them, and
    // reset() clears the trail the pet follows.
    applyPet();
    applyGold();
    $("itemWrap").style.display = "";
    renderItemBar();
    renderPetSlot();
    $("hud").textContent = "0";
    $("ovDead").style.display = "none";
    $("ovReady").style.display = "";
  }

  //  Called by the game the instant a run starts, which is the only moment
  //  that is unambiguously "you are now using these".
  function payForRun() {
    runStart = state.coins;
    var used = Game.consumeArmed(state);
    if (used.length) {
      store();
      Sfx.play("unlock");
      renderItemBar();
      renderCoins();
    }
  }

  function again() {
    prepareRun();
    renderCoins();
  }

  $("btnAgain").onclick = function () { Sfx.play("unlock"); again(); };
  $("btnToShop").onclick = function () { Sfx.play("nav"); again(); show("shop"); };

  //  The tab bar reads left-to-right, so moving right is "forward" and moving
  //  left is "back" — a single sound for both makes the bar feel flat.
  var TAB_ORDER = ["shop", "play", "bag"];
  function goTab(which) {
    if (which === tab) { Sfx.play("tock"); return; }
    var forward = TAB_ORDER.indexOf(which) > TAB_ORDER.indexOf(tab);
    Sfx.play(forward ? "nav" : "navBack");
    show(which);
  }
  $("tabPlay").onclick = function () { goTab("play"); };
  $("tabShop").onclick = function () { goTab("shop"); };
  $("tabBag").onclick = function () { goTab("bag"); };

  // ── settings ───────────────────────────────────────────────────────────
  //  One button in the navbar rather than a growing row of them.
  $("setBtn").onclick = function () {
    Sfx.play("tock");
    renderPetOpacity();
    renderGoldRow();
    $("setBack").classList.add("show");
  };
  $("goldBtn").onclick = function () {
    if (!state.goldSkin) { Sfx.play("nope"); return; }
    state.goldOn = !state.goldOn;
    Sfx.play(state.goldOn ? "flick" : "tock");
    store();
    applyGold();
    renderGoldRow();
  };
  $("setClose").onclick = function () {
    Sfx.play("tock");
    $("setBack").classList.remove("show");
  };
  $("petOpacity").oninput = function () {
    var raw = parseFloat(this.value);
    // `raw || 100` would be wrong twice over: a legitimate 0 is falsy and would
    // jump to fully solid, and unreadable input would do the same rather than
    // leaving the setting alone.
    if (!isFinite(raw)) { renderPetOpacity(); return; }
    petOpacity = Math.max(0.15, Math.min(1, raw / 100));
    renderPetOpacity();
    // Applied live, so you can see what you are choosing rather than guessing.
    if (game) game.setPetOpacity(petOpacity);
    savePetOpacity();
  };

  //  A lot of this game makes noise, so it needs an off switch.
  $("soundBtn").onclick = function () {
    var on = !Sfx.isEnabled();
    Sfx.setEnabled(on);
    $("soundBtn").textContent = on ? "🔊" : "🔇";
    try { localStorage.setItem("gotcha:sound", on ? "1" : "0"); } catch (e) {}
    // Played after enabling, so there is confirmation it works.
    if (on) Sfx.play("select");
  };
  try {
    if (localStorage.getItem("gotcha:sound") === "0") {
      Sfx.setEnabled(false);
      $("soundBtn").textContent = "🔇";
    }
  } catch (e) {}

  //  Offline support, and — more to the point — a worker that does NOT stop
  //  the app updating. See sw.js for why it is network-first.
  //
  //  Registered last, so a failure here can never stop the game loading, and
  //  guarded because a page opened from a file:// URL has no worker at all.
  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
    window.addEventListener("load", function () {
      // updateViaCache "none" so the browser cannot hand back a stale sw.js
      // from its HTTP cache — which, with max-age=600 on everything, is
      // precisely what it was doing.
      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" })
        .then(function (reg) {
          reg.addEventListener("updatefound", function () {
            var sw = reg.installing;
            if (!sw) return;
            sw.addEventListener("statechange", function () {
              // Say so rather than reloading, which would yank the screen away
              // from whatever is happening. It is already live on next launch.
              if (sw.state === "installed" && navigator.serviceWorker.controller) {
                var n = $("navTitle");
                if (n) n.textContent = TITLES[tab] + " · updated";
              }
            });
          });
        }).catch(function () { /* not fatal — the game runs without it */ });
    });
  }

  //  Checking for a new build, the only way that actually works on a phone.
  //
  //  A home-screen app can sit on old code indefinitely: the worker, the
  //  document and the scripts all have their own caches, and none of them is
  //  obliged to ask the network. So instead of hoping, the app asks a tiny
  //  file — no-store, so the answer is always real — and compares it with the
  //  build it is running. If they differ it clears its caches and reloads
  //  through a fresh URL, which is the one thing the HTTP cache cannot serve
  //  from memory.
  //
  //  localStorage is untouched by any of this, so a collection survives.

  function reloadFresh(build) {
    // Guarded, because "reload to update" that never succeeds is an infinite
    // loop. Two goes, then it gives up and says so rather than spinning.
    var tries = 0;
    try { tries = parseInt(sessionStorage.getItem("gotcha:upd:" + build) || "0", 10) || 0; }
    catch (e) {}
    if (tries >= 2) {
      var n = $("navTitle");
      if (n) n.textContent = "Update — force quit & reopen";
      return;
    }
    try { sessionStorage.setItem("gotcha:upd:" + build, String(tries + 1)); } catch (e) {}

    var go = function () {
      // A query the browser has not seen defeats the document cache; the
      // stamped ?v= on each script tag then defeats the script caches.
      location.replace(location.pathname + "?u=" + encodeURIComponent(build));
    };
    if (window.caches && caches.keys) {
      caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      }).then(go, go);
    } else { go(); }
  }

  function checkForUpdate() {
    if (location.protocol.indexOf("http") !== 0 || !window.fetch) return;
    fetch("version.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (v) {
        if (!v || !v.build) return;
        if (v.build === BUILD) {
          // Running the current build, so clear the retry counters.
          try {
            for (var i = sessionStorage.length - 1; i >= 0; i--) {
              var k = sessionStorage.key(i);
              if (k && k.indexOf("gotcha:upd:") === 0) sessionStorage.removeItem(k);
            }
          } catch (e) {}
          return;
        }
        reloadFresh(v.build);
      })
      .catch(function () { /* offline — keep playing */ });
  }

  checkForUpdate();
  // Phones do not reload; they resume. Without this, an app left open for a
  // week never asks again.
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) checkForUpdate();
  });

  // ── start ──────────────────────────────────────────────────────────────
  loadPetOpacity();
  recall();
  renderCoins();
  renderItemBar();

  // Loaded from a script rather than fetched, so opening the file directly
  // works too — a file:// page cannot fetch a local JSON file, which is why
  // the machines were missing.
  sets = (window.GOTCHA_SETS || []).slice();
  startGame();
  runStart = state.coins;
  prepareRun();
  show("play");
  if (!sets.length) $("navTitle").textContent = "Play (no sets)";

  // Exposed for testing.
  window.__gotcha = {
    get state() { return state; },
    get sets() { return sets; },
    show: show, renderShop: renderShop, renderBag: renderBag,
    renderItemBar: renderItemBar, again: again, prepareRun: prepareRun,
    renderPetSlot: renderPetSlot, openPetPicker: openPetPicker, applyPet: applyPet,
    renderPetOpacity: renderPetOpacity, renderGoldRow: renderGoldRow,
    maybeCelebrate: maybeCelebrate, applyGold: applyGold,
    game_gold_probe: function () { return game ? game._internals.gold() : null; },
    get petOpacity() { return petOpacity; },
    // What the GAME is actually carrying, not what the save says.
    game_pet_probe: function () { return game ? game._internals.petSrc() : null; },
    game_petAlpha_probe: function () { return game ? game._internals.petAlpha() : null; },
    // Test probes: the run's actual state, so a test can tell whether an item
    // reached the game rather than only whether the model thinks it did.
    game_lives_probe: function () { return game ? game.lives : -1; },
    game_gap_probe: function () { return runEffects.gap; },
    startRun: function () { if (game) game.flap(); },
  };
})();
