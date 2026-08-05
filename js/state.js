// ═══════════════════════════════════════════════════════════════════════
//  Gotcha — the economy and the collection
//
//  Everything here is arithmetic and probability, kept away from the DOM and
//  the canvas so it can be tested without a browser. The game itself only
//  calls into this.
// ═══════════════════════════════════════════════════════════════════════
var Game = (function () {
  "use strict";

  // ── economy ────────────────────────────────────────────────────────────
  var BASE_PER_PIPE = 10;      // coins for the first pipe you ever pass
  var UPGRADE_STEP = 2;        // what each upgrade adds
  var UPGRADE_BASE = 10;       // what the first upgrade costs
  var UPGRADE_GROWTH = 1.5;    // and the multiplier on every one after

  //  Coins per pipe after `n` upgrades. Linear, so buying is always the same
  //  size of win — it is the COST that grows, which is what makes the curve.
  function perPipe(upgrades, multiplier) {
    var base = BASE_PER_PIPE + Math.max(0, upgrades | 0) * UPGRADE_STEP;
    return base * (multiplier > 0 ? multiplier : 1);
  }

  // ── the wheel ──────────────────────────────────────────────────────────
  //  Every fourth upgrade is a spin instead of a flat +2, and the spin is a
  //  MULTIPLIER on the whole rate. Four equal quarters — the wheel is honest,
  //  and weighting it would make the good slice a lie about the picture.
  var WHEEL = [1.25, 1.5, 2, 3];
  var WHEEL_EVERY = 4;          // three flat upgrades, then a spin

  //  Counted rather than derived from `upgrades % 4`, because the one free
  //  spin everybody gets lands off the cadence and modulo would then be wrong
  //  for the rest of the game.
  function isWheelNext(state) {
    return !!state.pendingSpin || (state.sinceWheel | 0) >= WHEEL_EVERY - 1;
  }

  function wheelProgress(state) {
    return {
      have: Math.min(state.sinceWheel | 0, WHEEL_EVERY),
      of: WHEEL_EVERY,
      ready: isWheelNext(state),
      free: !!state.pendingSpin,
    };
  }

  //  What the flat upgrades have added. A spin costs a purchase but adds no
  //  +2, so the two counts are not the same thing.
  function flatUpgrades(state) {
    return Math.max(0, (state.upgrades | 0) - (state.wheelSpins | 0));
  }

  function wheelMult(state) {
    var m = Number(state.wheelMult);
    return isFinite(m) && m > 0 ? m : 1;
  }

  //  The real rate: the flat ladder, multiplied by every wheel you have ever
  //  spun. Rounded, because the currency has no halves and 12.5 coins a pipe
  //  reads as a bug.
  function coinsPerPipe(state, multiplier) {
    var base = perPipe(flatUpgrades(state)) * wheelMult(state);
    var m = multiplier > 0 ? multiplier : 1;
    return Math.round(base * m);
  }

  //  What the next upgrade costs. Rounded, because a price of 168.75 coins in
  //  a game whose currency has no decimals reads as a bug.
  function upgradeCost(upgrades) {
    return Math.round(UPGRADE_BASE * Math.pow(UPGRADE_GROWTH, Math.max(0, upgrades | 0)));
  }

  //  How many pipes it would take to earn the next upgrade back. Shown in the
  //  shop, because "500 coins" means nothing without knowing what a pipe pays.
  function pipesToAfford(state) {
    var need = upgradeCost(state.upgrades) - state.coins;
    if (need <= 0) return 0;
    return Math.ceil(need / coinsPerPipe(state));
  }

  // ── rarity ─────────────────────────────────────────────────────────────
  //  Every set has the same shape: ten common, three rare, one very rare, one
  //  legendary. The weights are per CARD, not per tier, so the tier odds fall
  //  out of how many cards are in it.
  //  Weights are per CARD, not per tier, so the tier odds fall out of how
  //  many cards are in each.
  var RARITY = {
    common:    { weight: 100, label: "Common",    tint: "#8e8e93" },
    rare:      { weight: 70,  label: "Rare",      tint: "#3478f6" },
    veryrare:  { weight: 55,  label: "Very rare", tint: "#e0352b" },
    // Raised from 18 (1.40%) to 26 (2.01%) — roughly one legendary every 50
    // pulls instead of every 71. Only this weight moves; the other tiers are
    // diluted in proportion, which keeps their relative shape intact.
    legendary: { weight: 26,  label: "Legendary", tint: "#e8a317" },
  };

  var RARITY_ORDER = ["common", "rare", "veryrare", "legendary"];

  //  What a spare copy is worth. Only duplicates can be sold — the first of
  //  anything is the collection, and letting that go would mean a set could
  //  be un-completed by a misplaced tap.
  //
  //  Very rare sits between rare and legendary on the same curve; the others
  //  are the asked-for numbers.
  var SELL_VALUE = {
    common: 10,
    rare: 50,
    veryrare: 200,
    legendary: 1000,
  };

  //  Cards from the gumball machines are worth five times as much. They cost
  //  a currency you can only get after finishing the collection, so a spare
  //  from one of them represents a great deal more work than a spare from a
  //  25-coin machine.
  var SPECIAL_SELL_MULTIPLIER = 5;

  function isSpecialCard(card) { return !!(card && card.gumball); }

  function sellValue(rarity, special) {
    var base = SELL_VALUE[rarity] || SELL_VALUE.common;
    return special ? base * SPECIAL_SELL_MULTIPLIER : base;
  }

  //  Sell one spare. Returns what happened rather than mutating quietly, so
  //  the interface can say why nothing did.
  function sellDuplicate(state, card) {
    if (!card) return { ok: false, reason: "unknown" };
    var have = state.owned[card.id] || 0;
    if (have < 2) return { ok: false, reason: "last", have: have };
    // Only duplicates can be sold, so the last copy never goes this way and an
    // equipped pet cannot be sold out from under itself.
    var coins = sellValue(card.rarity, isSpecialCard(card));
    state.owned[card.id] = have - 1;
    state.coins += coins;
    return { ok: true, coins: coins, left: have - 1 };
  }

  //  What selling every spare would fetch, for a "sell all" that knows what
  //  it is about to do.
  function spareValue(state, sets) {
    var total = 0, n = 0;
    sets.forEach(function (s) {
      s.cards.forEach(function (c) {
        var extra = Math.max(0, (state.owned[c.id] || 0) - 1);
        if (extra) { n += extra; total += extra * sellValue(c.rarity, isSpecialCard(c)); }
      });
    });
    return { coins: total, cards: n };
  }

  function sellAllSpares(state, sets) {
    var got = spareValue(state, sets);
    if (!got.cards) return { ok: false, reason: "none" };
    sets.forEach(function (s) {
      s.cards.forEach(function (c) {
        if ((state.owned[c.id] || 0) > 1) state.owned[c.id] = 1;
      });
    });
    state.coins += got.coins;
    return { ok: true, coins: got.coins, cards: got.cards };
  }

  //  The chance of each TIER in a standard set, which is what a player
  //  actually wants to know. Derived rather than written down, so it cannot
  //  disagree with the weights that are really used.
  function tierOdds(cards) {
    var total = 0, byTier = {};
    cards.forEach(function (c) {
      var w = (RARITY[c.rarity] || RARITY.common).weight;
      total += w;
      byTier[c.rarity] = (byTier[c.rarity] || 0) + w;
    });
    var out = {};
    RARITY_ORDER.forEach(function (t) { out[t] = total ? (byTier[t] || 0) / total : 0; });
    return out;
  }

  //  Pull one card. `rng` is injected so a test can make it deterministic —
  //  a gacha tested against Math.random proves nothing.
  function pull(cards, rng) {
    rng = rng || Math.random;
    var total = 0, i;
    for (i = 0; i < cards.length; i++) {
      total += (RARITY[cards[i].rarity] || RARITY.common).weight;
    }
    if (total <= 0) return null;
    var roll = rng() * total;
    for (i = 0; i < cards.length; i++) {
      roll -= (RARITY[cards[i].rarity] || RARITY.common).weight;
      // Strictly less-than would make the very last card unreachable when the
      // roll lands exactly on the total.
      if (roll < 0) return cards[i];
    }
    return cards[cards.length - 1];
  }

  // ── sets ───────────────────────────────────────────────────────────────
  //  Each set costs more than the last: 25, then 50, then 75, and so on. The
  //  index decides it, so adding a set needs no new price.
  function setCost(index) {
    return 25 * (Math.max(0, index | 0) + 1);
  }

  // ── gumballs ───────────────────────────────────────────────────────────
  //  A second currency, for the machines that appear once the first
  //  collection is finished. Coins buy gumballs; gumballs buy the new
  //  machines. Keeping them separate is the point — the new machines are not
  //  meant to be reachable by grinding coins alone at the old rate.
  var GUMBALL_COST = 1000;      // coins for one turn of the gumball machine
  var GUMBALL_MIN = 1;
  var GUMBALL_MAX = 10;
  var GUMBALL_SET_COST = 25;    // the first new machine; each one after adds this again

  //  The original machines are bought with coins; the new ones with gumballs.
  //  Told apart by a flag on the set rather than by counting, so a set can be
  //  added to either group without renumbering anything.
  function isGumballSet(set) { return !!(set && set.gumball); }
  function baseSets(sets) { return sets.filter(function (s) { return !isGumballSet(s); }); }
  function gumballSets(sets) { return sets.filter(isGumballSet); }

  //  Priced by position among the GUMBALL machines, so the first is 25
  //  whatever number it happens to be in the full list.
  function gumballSetCost(indexAmongGumball) {
    return GUMBALL_SET_COST * (Math.max(0, indexAmongGumball | 0) + 1);
  }

  //  One turn of the machine. Never blank: a thousand coins is a real amount
  //  to hand over, and a machine that can take it and give nothing back would
  //  just read as broken.
  function buyGumballs(state, rng) {
    if (state.coins < GUMBALL_COST) {
      return { ok: false, reason: 'coins', cost: GUMBALL_COST };
    }
    rng = rng || Math.random;
    var n = GUMBALL_MIN + Math.floor(rng() * (GUMBALL_MAX - GUMBALL_MIN + 1));
    if (n > GUMBALL_MAX) n = GUMBALL_MAX;      // a rng returning exactly 1
    state.coins -= GUMBALL_COST;
    state.gumballs = (state.gumballs | 0) + n;
    // spins: 1 so a single turn and a max buy report the same shape.
    return { ok: true, spins: 1, got: n, cost: GUMBALL_COST, total: state.gumballs };
  }

  //  Every turn you can afford, in one go. Each turn still rolls its own
  //  1-10 — this is a shortcut for pressing the button repeatedly, not a
  //  different deal, so the average per 1000 coins is unchanged.
  //
  //  Bounded, because at a few million coins the loop would be long enough to
  //  lock the page. Anything left over is reported rather than swallowed.
  var GUMBALL_MAX_SPINS = 500;

  function affordableSpins(state) {
    return Math.floor(state.coins / GUMBALL_COST);
  }

  function buyGumballsMax(state, rng) {
    var want = affordableSpins(state);
    if (want < 1) return { ok: false, reason: 'coins', cost: GUMBALL_COST };
    rng = rng || Math.random;
    var spins = Math.min(want, GUMBALL_MAX_SPINS);
    var got = 0;
    for (var i = 0; i < spins; i++) {
      var n = GUMBALL_MIN + Math.floor(rng() * (GUMBALL_MAX - GUMBALL_MIN + 1));
      if (n > GUMBALL_MAX) n = GUMBALL_MAX;
      got += n;
    }
    state.coins -= spins * GUMBALL_COST;
    state.gumballs = (state.gumballs | 0) + got;
    return {
      ok: true, spins: spins, got: got, cost: spins * GUMBALL_COST,
      total: state.gumballs, capped: want > spins, left: want - spins,
    };
  }

  function buyGumballPull(state, set, indexAmongGumball, rng) {
    var cost = gumballSetCost(indexAmongGumball);
    if ((state.gumballs | 0) < cost) {
      return { ok: false, reason: 'gumballs', cost: cost };
    }
    var card = pull(set.cards, rng);
    if (!card) return { ok: false, reason: 'empty' };
    state.gumballs -= cost;
    state.pulls += 1;
    var had = state.owned[card.id] || 0;
    state.owned[card.id] = had + 1;
    return { ok: true, cost: cost, card: card, duplicate: had > 0, count: had + 1 };
  }

  // ── items ──────────────────────────────────────────────────────────────
  //  One-use, bought from a slot machine and spent on a single run. Armed
  //  before you start and consumed when you do — arming is deliberately not
  //  the same as spending, so changing your mind costs nothing.
  var ITEM_SPIN_COST = 250;

  var ITEMS = [
    { id: "easyPipe",   name: "Easy Pipe",   icon: "⇕", tint: "#3fa845",
      blurb: "Wider gaps for a whole run" },
    { id: "extraLife",  name: "Extra Life",  icon: "♥", tint: "#e0352b",
      blurb: "Survive one hit, then three seconds of shield" },
    { id: "extraMoney", name: "Extra Money", icon: "✦", tint: "#efad14",
      blurb: "Double coins for a whole run" },
  ];

  var ITEM_IDS = ITEMS.map(function (i) { return i.id; });

  //  What each one actually does, in one place, so the game reads the numbers
  //  from here rather than knowing about item names.
  var EASY_GAP = 196;        // instead of the usual 132
  var SHIELD_SECONDS = 3;
  var MONEY_MULTIPLIER = 2;

  function itemById(id) {
    for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].id === id) return ITEMS[i];
    return null;
  }

  //  The machine never blanks — every spin gives you something. It is a
  //  reward for coins already earned, and a slot machine that can take 250
  //  and hand back nothing would just be annoying.
  function spinItem(state, rng) {
    if (state.coins < ITEM_SPIN_COST) {
      return { ok: false, reason: "coins", cost: ITEM_SPIN_COST };
    }
    rng = rng || Math.random;
    var item = ITEMS[Math.min(ITEMS.length - 1, Math.floor(rng() * ITEMS.length))];
    state.coins -= ITEM_SPIN_COST;
    state.items[item.id] = (state.items[item.id] || 0) + 1;
    state.spins = (state.spins || 0) + 1;
    return { ok: true, item: item, cost: ITEM_SPIN_COST, count: state.items[item.id] };
  }

  function itemCount(state, id) { return (state.items && state.items[id]) || 0; }
  function isArmed(state, id) { return !!(state.armed && state.armed[id]); }

  //  Arming is free and reversible. Nothing is spent until a run begins.
  //
  //  One item per run. Tapping a second one SWAPS to it rather than being
  //  refused — a refusal would just read as a broken button, and there is only
  //  ever one thing you could have meant by the tap.
  function toggleItem(state, id) {
    if (!itemById(id)) return { ok: false, reason: "unknown" };
    if (isArmed(state, id)) { state.armed[id] = false; return { ok: true, armed: false }; }
    if (itemCount(state, id) < 1) return { ok: false, reason: "none" };
    var replaced = armedItem(state);
    ITEM_IDS.forEach(function (other) { state.armed[other] = false; });
    state.armed[id] = true;
    return { ok: true, armed: true, replaced: replaced };
  }

  //  The single armed item, or null. The one place that decides what "armed"
  //  means, so nothing has to trust that the armed map holds only one key.
  function armedItem(state) {
    for (var i = 0; i < ITEM_IDS.length; i++) {
      if (isArmed(state, ITEM_IDS[i])) return ITEM_IDS[i];
    }
    return null;
  }

  //  What the armed item does this run. Read once at the start, so a run's
  //  rules cannot change halfway through it. Derived from the single armed
  //  item rather than from three independent lookups, so even a hand-edited
  //  save cannot stack two effects.
  function activeEffects(state) {
    var on = armedItem(state);
    return {
      gap: on === "easyPipe" ? EASY_GAP : 0,   // 0 means "leave it alone"
      lives: on === "extraLife" ? 1 : 0,
      shield: SHIELD_SECONDS,
      money: on === "extraMoney" ? MONEY_MULTIPLIER : 1,
    };
  }

  //  Spend them. Anything armed but no longer held is quietly dropped rather
  //  than going negative — the two can drift if a save is edited.
  function consumeArmed(state) {
    var used = [];
    ITEM_IDS.forEach(function (id) {
      if (!isArmed(state, id)) return;
      var have = itemCount(state, id);
      if (have < 1) { state.armed[id] = false; return; }
      state.items[id] = have - 1;
      state.armed[id] = false;         // one use, so it disarms as it is spent
      used.push(id);
    });
    return used;
  }

  // ── the save ───────────────────────────────────────────────────────────
  function fresh() {
    return {
      version: 1,
      coins: 0,
      upgrades: 0,
      best: 0,          // best pipe count in a single run
      pipes: 0,         // pipes passed, all time
      pulls: 0,
      spins: 0,
      owned: {},        // card id -> how many
      items: {},        // item id -> how many held
      armed: {},        // item id -> armed for the next run
      pet: null,        // card id of the pet that follows you, or null
      wheelMult: 1,     // everything the wheel has ever multiplied you by
      wheelSpins: 0,    // how many of your upgrades were spins
      sinceWheel: 0,    // flat upgrades since the last one
      pendingSpin: true,   // the one free spin; see load()
      wheelGranted: true,
      completed: false,    // has the collection ever been finished
      goldSkin: false,     // unlocked by finishing it
      goldOn: false,
      gumballs: 0,         // the second currency
      discovered: false
    };
  }

  function load(raw) {
    var d;
    try { d = JSON.parse(raw); } catch (e) { return fresh(); }
    if (!d || typeof d !== "object") return fresh();
    var s = fresh();
    // Field by field rather than a merge: a save from an older version is
    // missing keys, and a NaN in `coins` would spread through every sum that
    // touches it.
    s.coins = num(d.coins);
    s.upgrades = num(d.upgrades);
    s.best = num(d.best);
    s.pipes = num(d.pipes);
    s.pulls = num(d.pulls);
    s.spins = num(d.spins);
    if (d.owned && typeof d.owned === "object") {
      Object.keys(d.owned).forEach(function (k) {
        var n = num(d.owned[k]);
        if (n > 0) s.owned[k] = n;
      });
    }
    if (d.items && typeof d.items === "object") {
      // Only ids that still exist — an item removed from the game would
      // otherwise sit in the save forever with nothing to spend it on.
      ITEM_IDS.forEach(function (id) {
        var n = num(d.items[id]);
        if (n > 0) s.items[id] = n;
      });
    }
    // Completing is permanent, and so is the skin it unlocks — losing it by
    // selling a spare would be a nasty surprise. Equipping is separate from
    // owning, so turning it off does not throw it away.
    s.completed = !!d.completed;
    s.goldSkin = !!d.goldSkin || !!d.completed;
    s.goldOn = !!d.goldOn && s.goldSkin;
    s.gumballs = num(d.gumballs);
    // NOT inferred from `completed`. A save that finished the collection
    // before these machines existed must still be shown the discovery, which
    // is exactly the case checkDiscovery is there to catch.
    s.discovered = !!d.discovered;

    // The wheel. A save written before it existed has no `wheelGranted`, and
    // that is exactly who should get the free spin — everybody already
    // playing, on their next upgrade. Saved once so it cannot be farmed by
    // reloading.
    s.wheelMult = numF(d.wheelMult, 1);
    s.wheelSpins = num(d.wheelSpins);
    s.sinceWheel = num(d.sinceWheel);
    s.pendingSpin = d.wheelGranted ? !!d.pendingSpin : true;
    s.wheelGranted = true;

    // Only if it is still a card you own — an equipped pet you do not have
    // would draw nothing and read as a bug.
    if (d.pet && s.owned[d.pet]) s.pet = d.pet;
    if (d.armed && typeof d.armed === "object") {
      ITEM_IDS.forEach(function (id) {
        // Armed only counts if one is actually held; the two can drift if a
        // save is hand-edited, and an armed item you do not own would grant
        // its effect for free. One at a time, so a save written before that
        // rule (or edited since) loads as the first one rather than as both.
        if (d.armed[id] && s.items[id] > 0 && !armedItem(s)) s.armed[id] = true;
      });
    }
    return s;
  }

  //  For values that are genuinely fractional. num() floors, which would turn
  //  a x1.25 wheel into x1 on the next load.
  function numF(v, dflt) {
    var n = Number(v);
    return isFinite(n) && n > 0 ? n : dflt;
  }

  function num(v) {
    var n = Math.floor(Number(v));
    return isFinite(n) && n > 0 ? n : 0;
  }

  function save(state) { return JSON.stringify(state); }

  // ── actions ────────────────────────────────────────────────────────────
  //  Each returns what happened rather than mutating and staying quiet, so
  //  the interface can say why something did not work.
  function scorePipe(state, multiplier) {
    var got = coinsPerPipe(state, multiplier);
    state.coins += got;
    state.pipes += 1;
    return got;
  }

  function endRun(state, pipes) {
    if (pipes > state.best) { state.best = pipes; return true; }
    return false;
  }

  //  The spin's result is decided HERE, not by the animation. The wheel then
  //  animates to a result that is already true — the same way the capsule
  //  shows a card that has already been pulled. An animation that decides the
  //  outcome can be interrupted into never deciding it.
  function buyUpgrade(state, rng) {
    var cost = upgradeCost(state.upgrades);
    if (state.coins < cost) return { ok: false, reason: "coins", cost: cost };
    var wheel = isWheelNext(state);
    state.coins -= cost;
    state.upgrades += 1;

    if (wheel) {
      rng = rng || Math.random;
      var i = Math.min(WHEEL.length - 1, Math.floor(rng() * WHEEL.length));
      state.wheelMult = wheelMult(state) * WHEEL[i];
      state.wheelSpins = (state.wheelSpins | 0) + 1;
      state.sinceWheel = 0;
      state.pendingSpin = false;
      return { ok: true, cost: cost, wheel: true, index: i,
               multiplier: WHEEL[i], now: coinsPerPipe(state) };
    }

    state.sinceWheel = (state.sinceWheel | 0) + 1;
    return { ok: true, cost: cost, wheel: false, now: coinsPerPipe(state) };
  }

  function buyPull(state, set, index, rng) {
    var cost = setCost(index);
    if (state.coins < cost) return { ok: false, reason: "coins", cost: cost };
    var card = pull(set.cards, rng);
    if (!card) return { ok: false, reason: "empty" };
    state.coins -= cost;
    state.pulls += 1;
    var had = state.owned[card.id] || 0;
    state.owned[card.id] = had + 1;
    return { ok: true, cost: cost, card: card, duplicate: had > 0, count: had + 1 };
  }

  //  Ten at once. Charged for all ten up front rather than one at a time, so
  //  a batch either happens or does not — being stopped seven pulls in with
  //  the coins already gone would be the worst of both.
  //
  //  Each pull still goes through buyPull in sequence, so pulling the same
  //  card twice inside one batch reads "New!" and then "that makes 2" rather
  //  than claiming both are new.
  var BATCH = 10;

  function buyPullMany(state, set, index, n, rng) {
    n = Math.max(1, Math.min(BATCH, n | 0));
    var each = setCost(index);
    var cost = each * n;
    if (state.coins < cost) {
      return { ok: false, reason: "coins", cost: cost, each: each, n: n };
    }
    var results = [];
    for (var i = 0; i < n; i++) {
      var r = buyPull(state, set, index, rng);
      if (!r.ok) break;            // an empty set — stop rather than charge on
      results.push(r);
    }
    if (!results.length) return { ok: false, reason: "empty" };
    var spent = results.reduce(function (t, r) { return t + r.cost; }, 0);
    return { ok: true, n: results.length, cost: spent, results: results };
  }

  // ── the pet ────────────────────────────────────────────────────────────
  //  One of your cards, tagging along for the run. Purely for show — it has
  //  no effect on the game, so equipping one is never a decision you can get
  //  wrong.
  //
  //  Only something you own can be equipped, and a card must stay owned to
  //  stay equipped. Selling your last copy of your pet un-equips it rather
  //  than leaving a ghost following you around.
  function equipPet(state, id) {
    if (id === null || id === undefined) { state.pet = null; return { ok: true, pet: null }; }
    if (!state.owned[id]) return { ok: false, reason: "unowned" };
    if (state.pet === id) { state.pet = null; return { ok: true, pet: null }; }
    state.pet = id;
    return { ok: true, pet: id };
  }

  function petId(state) {
    // Checked on the way out as well as on the way in, so a save edited by
    // hand cannot equip something you do not have.
    if (state.pet && state.owned[state.pet]) return state.pet;
    return null;
  }

  // ── the collection ─────────────────────────────────────────────────────
  function ownedCount(state, id) { return state.owned[id] || 0; }

  function setProgress(state, set) {
    var have = 0;
    set.cards.forEach(function (c) { if (state.owned[c.id]) have++; });
    return { have: have, of: set.cards.length,
             complete: have === set.cards.length && set.cards.length > 0 };
  }

  // ── completing the collection ──────────────────────────────────────────
  //  Every card in every set. The reward is a gold bird, which changes
  //  nothing about how the game plays — the collection is the achievement,
  //  and paying it out in power would make the last cards a grind rather
  //  than a finish line.
  //  "Complete" means every card in the ORIGINAL machines, not every card in
  //  the game. The new machines only exist because you finished the first
  //  collection, so counting them here would make finishing impossible —
  //  you would need cards from machines you cannot reach yet.
  function isComplete(state, sets) {
    var t = totals(state, baseSets(sets));
    return t.of > 0 && t.have === t.of;
  }

  //  Called after anything that can add a card. Returns true exactly once —
  //  the run where it was actually completed — so the celebration cannot fire
  //  again on every later visit to the collection.
  function checkComplete(state, sets) {
    if (state.completed) return false;
    if (!isComplete(state, sets)) return false;
    state.completed = true;
    state.goldSkin = true;      // unlocked, not yet equipped
    state.discovered = false;   // shown next; see checkDiscovery
    return true;
  }

  //  The new machines appearing. Separate from checkComplete on purpose:
  //  somebody who finished the collection BEFORE these machines existed has
  //  completed === true already, and would otherwise never be told. This is
  //  checked on load as well as after a pull, so they see it the moment they
  //  next open the game.
  function checkDiscovery(state, sets) {
    if (state.discovered) return false;
    if (!gumballSets(sets).length) return false;   // nothing to discover
    if (!isComplete(state, sets)) return false;
    state.discovered = true;
    return true;
  }

  function totals(state, sets) {
    var have = 0, of = 0, dupes = 0;
    sets.forEach(function (s) {
      s.cards.forEach(function (c) {
        of++;
        var n = state.owned[c.id] || 0;
        if (n) have++;
        if (n > 1) dupes += n - 1;
      });
    });
    return { have: have, of: of, duplicates: dupes };
  }

  return {
    BASE_PER_PIPE: BASE_PER_PIPE, UPGRADE_STEP: UPGRADE_STEP,
    UPGRADE_BASE: UPGRADE_BASE, UPGRADE_GROWTH: UPGRADE_GROWTH,
    RARITY: RARITY, RARITY_ORDER: RARITY_ORDER, SELL_VALUE: SELL_VALUE,
    ITEMS: ITEMS, ITEM_IDS: ITEM_IDS, ITEM_SPIN_COST: ITEM_SPIN_COST,
    EASY_GAP: EASY_GAP, SHIELD_SECONDS: SHIELD_SECONDS,
    MONEY_MULTIPLIER: MONEY_MULTIPLIER,
    itemById: itemById, spinItem: spinItem, itemCount: itemCount,
    isArmed: isArmed, armedItem: armedItem, toggleItem: toggleItem,
    activeEffects: activeEffects, consumeArmed: consumeArmed,
    sellValue: sellValue, isSpecialCard: isSpecialCard,
    SPECIAL_SELL_MULTIPLIER: SPECIAL_SELL_MULTIPLIER, sellDuplicate: sellDuplicate,
    spareValue: spareValue, sellAllSpares: sellAllSpares,
    perPipe: perPipe, upgradeCost: upgradeCost, pipesToAfford: pipesToAfford,
    coinsPerPipe: coinsPerPipe, flatUpgrades: flatUpgrades, wheelMult: wheelMult,
    isComplete: isComplete, checkComplete: checkComplete,
    checkDiscovery: checkDiscovery,
    GUMBALL_COST: GUMBALL_COST, GUMBALL_MIN: GUMBALL_MIN, GUMBALL_MAX: GUMBALL_MAX,
    isGumballSet: isGumballSet, baseSets: baseSets, gumballSets: gumballSets,
    gumballSetCost: gumballSetCost, buyGumballs: buyGumballs,
    buyGumballsMax: buyGumballsMax, affordableSpins: affordableSpins,
    GUMBALL_MAX_SPINS: GUMBALL_MAX_SPINS,
    buyGumballPull: buyGumballPull,
    WHEEL: WHEEL, WHEEL_EVERY: WHEEL_EVERY,
    isWheelNext: isWheelNext, wheelProgress: wheelProgress,
    tierOdds: tierOdds, pull: pull, setCost: setCost,
    fresh: fresh, load: load, save: save,
    scorePipe: scorePipe, endRun: endRun, buyUpgrade: buyUpgrade, buyPull: buyPull,
    buyPullMany: buyPullMany, BATCH: BATCH,
    equipPet: equipPet, petId: petId,
    ownedCount: ownedCount, setProgress: setProgress, totals: totals,
  };
})();

if (typeof module !== "undefined") module.exports = Game;
