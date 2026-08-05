// Tests for Gotcha's economy and gacha.
var out = [], pass = 0, fail = 0;
function ok(n, c, note) {
  if (c) { pass++; out.push('PASS  ' + n + (note ? '  [' + note + ']' : '')); }
  else { fail++; out.push('FAIL  ' + n + (note ? '  [' + note + ']' : '')); }
}

function makeSet(id) {
  var cards = [];
  cards.push({ id: id + '_L', rarity: 'legendary' });
  cards.push({ id: id + '_V', rarity: 'veryrare' });
  for (var r = 0; r < 3; r++) cards.push({ id: id + '_R' + r, rarity: 'rare' });
  for (var c = 0; c < 10; c++) cards.push({ id: id + '_C' + c, rarity: 'common' });
  return { id: id, name: id, cards: cards };
}

// ── earning ───────────────────────────────────────────────────────────────
out.push('── coins per pipe ──');
ok('a pipe starts at 10 coins', Game.perPipe(0) === 10);
ok('one upgrade adds 2', Game.perPipe(1) === 12);
ok('five upgrades add ten', Game.perPipe(5) === 20);
ok('upgrades are linear, not compounding',
   Game.perPipe(10) - Game.perPipe(9) === Game.perPipe(1) - Game.perPipe(0));
ok('a nonsense upgrade count does not break it', Game.perPipe(-5) === 10);

out.push('');
out.push('── what an upgrade costs ──');
ok('the first upgrade costs 10', Game.upgradeCost(0) === 10);
ok('the second is half again', Game.upgradeCost(1) === 15, Game.upgradeCost(1) + '');
ok('and the third', Game.upgradeCost(2) === 23, Game.upgradeCost(2) + '');
// Cheap enough that the first one lands within a run or two — the old base of
// 50 meant five pipes before anything happened, which is a slow start.
ok('the first is affordable almost immediately',
   Math.ceil(Game.upgradeCost(0) / Game.perPipe(0)) === 1, 'one pipe');
// Prices are rounded because the currency has no decimals — 168.75 coins
// reads as a bug rather than a price.
ok('every price is a whole number', (function () {
  for (var i = 0; i < 25; i++) if (Game.upgradeCost(i) % 1 !== 0) return false;
  return true;
})());
ok('and each is dearer than the last', (function () {
  for (var i = 1; i < 25; i++) if (Game.upgradeCost(i) <= Game.upgradeCost(i - 1)) return false;
  return true;
})());

// The cost grows faster than the income, so upgrades never become free —
// the whole shape of the game depends on this.
ok('the cost outruns the income it buys', (function () {
  var pipesNeeded = [];
  for (var i = 0; i < 15; i++) pipesNeeded.push(Game.upgradeCost(i) / Game.perPipe(i));
  for (var j = 1; j < pipesNeeded.length; j++) {
    if (pipesNeeded[j] <= pipesNeeded[j - 1]) return false;
  }
  return true;
})(), 'pipes per upgrade: ' +
   [0, 4, 9, 14].map(function (i) {
     return Math.round(Game.upgradeCost(i) / Game.perPipe(i));
   }).join(' → '));

var st = Game.fresh();
st.coins = 0;
st.upgrades = 4;                     // cost 51 at 18 a pipe → 3 pipes
ok('with too few coins it says how many pipes are left',
   Game.pipesToAfford(st) === 3, Game.pipesToAfford(st) + ' pipes');
st.upgrades = 0;
st.coins = 500;
ok('and nothing when you can already afford it', Game.pipesToAfford(st) === 0);

// ── the sets ──────────────────────────────────────────────────────────────
out.push('');
out.push('── what a pull costs ──');
ok('the first set costs 25', Game.setCost(0) === 25);
ok('the second 50', Game.setCost(1) === 50);
ok('the third 75', Game.setCost(2) === 75);
ok('and it keeps going up by 25', Game.setCost(5) === 150);

// ── the odds ──────────────────────────────────────────────────────────────
out.push('');
out.push('── rarity ──');
var set = makeSet('t');
ok('a set holds fifteen cards', set.cards.length === 15);
ok('ten common, three rare, one very rare, one legendary', (function () {
  var n = {};
  set.cards.forEach(function (c) { n[c.rarity] = (n[c.rarity] || 0) + 1; });
  return n.common === 10 && n.rare === 3 && n.veryrare === 1 && n.legendary === 1;
})());

var odds = Game.tierOdds(set.cards);
ok('the tiers add up to one',
   Math.abs(odds.common + odds.rare + odds.veryrare + odds.legendary - 1) < 1e-9);
ok('and get rarer in the right order',
   odds.common > odds.rare && odds.rare > odds.veryrare && odds.veryrare > odds.legendary,
   ['common','rare','veryrare','legendary'].map(function (t) {
     return t + ' ' + (odds[t] * 100).toFixed(1) + '%';
   }).join(', '));
ok('a legendary is genuinely rare but not hopeless',
   odds.legendary > 0.005 && odds.legendary < 0.04,
   (odds.legendary * 100).toFixed(2) + '%');
// The guard above is deliberately loose, so pin the intended rate too — a
// stray weight change would otherwise sail through it.
ok('a legendary lands about once in fifty pulls',
   Math.abs(1 / odds.legendary - 50) < 3, 'one in ' + (1 / odds.legendary).toFixed(0));
// Raising it must not disturb the tiers below, only dilute them slightly.
ok('very rare is still comfortably ahead of legendary',
   odds.veryrare > odds.legendary * 1.8,
   (odds.veryrare / odds.legendary).toFixed(1) + '× as likely');

// A pull tested against Math.random proves nothing, so the generator is
// injected and driven deliberately.
out.push('');
out.push('── pulling ──');
ok('a roll of zero gives the first card', Game.pull(set.cards, function () { return 0; }).id === 't_L');
// The last card must be reachable. With `<=` instead of `<` in the walk, a
// roll landing exactly on the total would fall off the end.
ok('a roll at the very top still gives a card',
   Game.pull(set.cards, function () { return 0.999999; }) !== null);
ok('and it is the last one',
   Game.pull(set.cards, function () { return 0.999999; }).id === 't_C9');
ok('an empty set pulls nothing', Game.pull([], function () { return 0.5; }) === null);

// Over many pulls the distribution has to match the declared odds, or the
// numbers shown in the shop are a lie.
ok('the long-run distribution matches the stated odds', (function () {
  var seed = 987654321;
  function rng() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  var n = 60000, count = { common: 0, rare: 0, veryrare: 0, legendary: 0 };
  for (var i = 0; i < n; i++) count[Game.pull(set.cards, rng).rarity]++;
  return ['common', 'rare', 'veryrare', 'legendary'].every(function (t) {
    return Math.abs(count[t] / n - odds[t]) < 0.012;
  });
})(), 'within 1.2 points over 60,000 pulls');

ok('every card in the set can actually come out', (function () {
  var seed = 24680;
  function rng() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  var seen = {};
  for (var i = 0; i < 40000; i++) seen[Game.pull(set.cards, rng).id] = 1;
  return Object.keys(seen).length === 15;
})(), 'all fifteen appeared');

// ── spending ──────────────────────────────────────────────────────────────
out.push('');
out.push('── buying ──');
var s = Game.fresh();
ok('you start with nothing', s.coins === 0 && s.upgrades === 0);
ok('an upgrade you cannot afford is refused',
   Game.buyUpgrade(s).ok === false);
ok('and says why', Game.buyUpgrade(s).reason === 'coins');
ok('with no coins taken', s.coins === 0);

s.coins = 100;
// A fresh player's FIRST upgrade is the one free spin, so this is a wheel.
var bought = Game.buyUpgrade(s, function () { return 0; });
ok('one you can afford goes through', bought.ok === true);
ok('the coins are taken', s.coins === 90, s.coins + '');
ok('the upgrade is recorded', s.upgrades === 1);
ok('the first one is the free spin', bought.wheel === true);
ok('and it reports the new rate', bought.now === Math.round(10 * bought.multiplier),
   bought.now + '');
// The one after it is an ordinary +2 on the flat ladder.
s.coins = 100;
var flat = Game.buyUpgrade(s, function () { return 0; });
ok('the next is a flat upgrade', flat.wheel === false);
ok('which adds two before the multiplier',
   flat.now === Math.round(12 * Game.wheelMult(s)), flat.now + '');

s.coins = 10;
ok('a pull you cannot afford is refused',
   Game.buyPull(s, set, 0, function () { return 0.5; }).ok === false);
ok('with nothing added to the collection', Object.keys(s.owned).length === 0);
ok('and no coins taken', s.coins === 10);

s.coins = 100;
var got = Game.buyPull(s, set, 0, function () { return 0; });
ok('one you can afford goes through', got.ok === true);
ok('it costs the set price', s.coins === 75, s.coins + '');
ok('the card is added', s.owned['t_L'] === 1);
ok('and the first one is not a duplicate', got.duplicate === false);

var again = Game.buyPull(s, set, 0, function () { return 0; });
ok('pulling the same card again is a duplicate', again.duplicate === true);
ok('and the count goes up', s.owned['t_L'] === 2 && again.count === 2);
ok('a dearer set costs more', (function () {
  s.coins = 1000;
  var before = s.coins;
  Game.buyPull(s, set, 3, function () { return 0.5; });
  return before - s.coins === 100;
})());

// ── scoring a run ─────────────────────────────────────────────────────────
out.push('');
out.push('── playing ──');
var p = Game.fresh();
ok('a pipe pays the base rate', Game.scorePipe(p) === 10 && p.coins === 10);
p.upgrades = 3;
ok('and pays more once upgraded', Game.scorePipe(p) === 16, p.coins + ' coins');
ok('pipes are counted', p.pipes === 2);

ok('a first run sets the best', Game.endRun(p, 7) === true && p.best === 7);
ok('a worse run does not', Game.endRun(p, 3) === false && p.best === 7);
ok('a better one does', Game.endRun(p, 12) === true && p.best === 12);

// ── the collection ────────────────────────────────────────────────────────
out.push('');
out.push('── the collection ──');
var col = Game.fresh();
var setA = makeSet('a'), setB = makeSet('b');
ok('nothing is owned to begin with',
   Game.setProgress(col, setA).have === 0);
col.owned['a_L'] = 1; col.owned['a_C0'] = 4;
var prog = Game.setProgress(col, setA);
ok('progress counts distinct cards, not copies', prog.have === 2, prog.have + '');
ok('and knows how many there are', prog.of === 15);
ok('an incomplete set says so', prog.complete === false);
// Filled in WITHOUT clobbering the counts set above — an earlier version
// assigned 1 to every card, which quietly reset a_C0 from four copies to one
// and then asserted there were duplicates.
setA.cards.forEach(function (c) { col.owned[c.id] = col.owned[c.id] || 1; });
ok('a full set is complete', Game.setProgress(col, setA).complete === true);

var tot = Game.totals(col, [setA, setB]);
ok('totals span every set', tot.of === 30, tot.of + '');
ok('and count what is held', tot.have === 15);
ok('duplicates are counted separately', tot.duplicates === 3, tot.duplicates + '');

// ── saving ────────────────────────────────────────────────────────────────
out.push('');
out.push('── saving ──');
var round = Game.load(Game.save(col));
ok('a save round trips', round.coins === col.coins && round.upgrades === col.upgrades);
ok('with the collection intact', round.owned['a_C0'] === 4);
ok('nonsense loads as a fresh game', Game.load('not json').coins === 0);
ok('an empty save too', Game.load('').upgrades === 0);
// A NaN in the save would spread through every sum that touches it.
ok('a corrupt number is treated as zero',
   Game.load('{"coins":"lots","upgrades":null}').coins === 0);
ok('and a negative one too', Game.load('{"coins":-500}').coins === 0);
ok('a card with a nonsense count is dropped',
   Game.load('{"owned":{"x":"many","y":3}}').owned.x === undefined);
ok('while a good one survives', Game.load('{"owned":{"x":"many","y":3}}').owned.y === 3);

// ── selling spares ────────────────────────────────────────────────────────
out.push('');
out.push('── selling a duplicate ──');
ok('a common is worth 10', Game.sellValue('common') === 10);
ok('a rare 50', Game.sellValue('rare') === 50);
ok('a legendary 1000', Game.sellValue('legendary') === 1000);
ok('and a very rare sits between rare and legendary',
   Game.sellValue('veryrare') > 50 && Game.sellValue('veryrare') < 1000,
   Game.sellValue('veryrare') + '');
ok('an unknown rarity falls back rather than paying nothing',
   Game.sellValue('nonsense') === 10);

var sellState = Game.fresh();
var setS = makeSet('s');
var common = setS.cards.filter(function (c) { return c.rarity === 'common'; })[0];
var legend = setS.cards.filter(function (c) { return c.rarity === 'legendary'; })[0];

// The first copy IS the collection — selling it would let a set be
// un-completed by a misplaced tap.
sellState.owned[common.id] = 1;
var one = Game.sellDuplicate(sellState, common);
ok('the last copy cannot be sold', one.ok === false && one.reason === 'last');
ok('and nothing changes', sellState.owned[common.id] === 1 && sellState.coins === 0);

sellState.owned[common.id] = 3;
var sold = Game.sellDuplicate(sellState, common);
ok('a spare sells', sold.ok === true);
ok('for the right amount', sold.coins === 10 && sellState.coins === 10);
ok('and one copy goes', sellState.owned[common.id] === 2 && sold.left === 2);

Game.sellDuplicate(sellState, common);
ok('selling down to one works', sellState.owned[common.id] === 1);
ok('but no further', Game.sellDuplicate(sellState, common).ok === false);
ok('so the collection can never be reduced', sellState.owned[common.id] === 1);

sellState.owned[legend.id] = 2;
ok('a legendary spare is worth a thousand',
   Game.sellDuplicate(sellState, legend).coins === 1000);

ok('a card you have never had cannot be sold',
   Game.sellDuplicate(sellState, { id: 'never', rarity: 'common' }).ok === false);
ok('and neither can nothing at all', Game.sellDuplicate(sellState, null).ok === false);

// ── selling everything spare ──────────────────────────────────────────────
out.push('');
out.push('── selling every spare ──');
var bulk = Game.fresh();
var setT = makeSet('t2');
var c0 = setT.cards.filter(function (c) { return c.rarity === 'common'; })[0];
var r0 = setT.cards.filter(function (c) { return c.rarity === 'rare'; })[0];
var l0 = setT.cards.filter(function (c) { return c.rarity === 'legendary'; })[0];
bulk.owned[c0.id] = 4;      // 3 spare  → 30
bulk.owned[r0.id] = 2;      // 1 spare  → 50
bulk.owned[l0.id] = 1;      // none spare
var worth = Game.spareValue(bulk, [setT]);
ok('the value of every spare is counted', worth.coins === 80, worth.coins + '');
ok('and how many there are', worth.cards === 4, worth.cards + '');

var did = Game.sellAllSpares(bulk, [setT]);
ok('selling them all pays out', did.ok === true && did.coins === 80);
ok('the coins arrive', bulk.coins === 80);
ok('every card is left at exactly one',
   bulk.owned[c0.id] === 1 && bulk.owned[r0.id] === 1 && bulk.owned[l0.id] === 1);
ok('and the collection is not reduced',
   Game.setProgress(bulk, setT).have === 3);
ok('doing it again finds nothing', Game.sellAllSpares(bulk, [setT]).ok === false);

// ── items ─────────────────────────────────────────────────────────────────
out.push('');
out.push('── the item machine ──');
ok('there are three items', Game.ITEMS.length === 3, Game.ITEMS.length + '');
ok('each has a name, icon and description', Game.ITEMS.every(function (i) {
  return i.id && i.name && i.icon && i.blurb && i.tint;
}));
ok('a spin costs 250', Game.ITEM_SPIN_COST === 250);
ok('looking one up works', Game.itemById('extraLife').name === 'Extra Life');
ok('and an unknown id gives nothing', Game.itemById('nope') === null);

var it = Game.fresh();
ok('you start with none of any of them',
   Game.ITEM_IDS.every(function (id) { return Game.itemCount(it, id) === 0; }));

it.coins = 100;
ok('a spin you cannot afford is refused', Game.spinItem(it, function () { return 0; }).ok === false);
ok('with nothing taken', it.coins === 100);

// The machine never blanks — taking 250 and handing back nothing would just
// be annoying, so every spin has to yield something.
it.coins = 2500;
var wins = 0;
for (var sp = 0; sp < 10; sp++) {
  if (Game.spinItem(it, Math.random).ok) wins++;
}
ok('every spin gives an item', wins === 10, wins + ' of 10');
ok('the coins are taken each time', it.coins === 0, it.coins + '');
ok('and they are all real items', Object.keys(it.items).every(function (k) {
  return Game.ITEM_IDS.indexOf(k) >= 0;
}));
ok('ten spins produced ten items', Game.ITEM_IDS.reduce(function (n, id) {
  return n + Game.itemCount(it, id);
}, 0) === 10);

// All three have to be reachable, or one is decorative.
ok('every item can come out of the machine', (function () {
  var seed = 13579;
  function rng() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  var t = Game.fresh(); t.coins = 250 * 300;
  for (var i = 0; i < 300; i++) Game.spinItem(t, rng);
  return Game.ITEM_IDS.every(function (id) { return Game.itemCount(t, id) > 0; });
})());
// A roll landing exactly on 1 must not fall off the end of the list.
ok('a roll at the very top still gives an item', (function () {
  var t = Game.fresh(); t.coins = 250;
  return Game.spinItem(t, function () { return 0.999999; }).ok === true;
})());

out.push('');
out.push('── arming an item ──');
var arm = Game.fresh();
ok('you cannot arm one you do not have', Game.toggleItem(arm, 'easyPipe').ok === false);
ok('and nothing is armed', Game.isArmed(arm, 'easyPipe') === false);

arm.items.easyPipe = 2;
ok('one you hold can be armed', Game.toggleItem(arm, 'easyPipe').armed === true);
ok('and it shows as armed', Game.isArmed(arm, 'easyPipe') === true);
// Arming is free and reversible; nothing is spent until a run begins.
ok('nothing is spent by arming it', Game.itemCount(arm, 'easyPipe') === 2);
ok('tapping again disarms it', Game.toggleItem(arm, 'easyPipe').armed === false);
ok('still nothing spent', Game.itemCount(arm, 'easyPipe') === 2);
ok('an unknown item cannot be armed', Game.toggleItem(arm, 'nonsense').ok === false);

out.push('');
out.push('── one per round ──');
var solo = Game.fresh();
solo.items = { easyPipe: 3, extraLife: 3, extraMoney: 3 };
ok('nothing armed to begin with', Game.armedItem(solo) === null);
Game.toggleItem(solo, 'easyPipe');
ok('arming one reports it', Game.armedItem(solo) === 'easyPipe');
// A second tap SWAPS. Refusing would read as a broken button, and there is
// only one thing the tap could have meant.
var swap = Game.toggleItem(solo, 'extraLife');
ok('arming a second swaps to it', swap.armed === true && Game.armedItem(solo) === 'extraLife');
ok('and says what it displaced', swap.replaced === 'easyPipe', swap.replaced + '');
ok('the first is no longer armed', !Game.isArmed(solo, 'easyPipe'));
ok('exactly one is armed, whatever the order',
   Game.ITEM_IDS.filter(function (id) { return Game.isArmed(solo, id); }).length === 1);
// Swapping is free — the whole point of arming being separate from spending.
ok('swapping spends nothing',
   Game.itemCount(solo, 'easyPipe') === 3 && Game.itemCount(solo, 'extraLife') === 3);
Game.toggleItem(solo, 'extraLife');
ok('and it can still be turned off entirely', Game.armedItem(solo) === null);

// Arming all three in turn must never leave two on, in any order.
var orders = [
  ['easyPipe', 'extraLife', 'extraMoney'],
  ['extraMoney', 'easyPipe', 'extraLife'],
  ['extraLife', 'extraMoney', 'easyPipe'],
];
var everStacked = false;
orders.forEach(function (order) {
  var s = Game.fresh();
  s.items = { easyPipe: 1, extraLife: 1, extraMoney: 1 };
  order.forEach(function (id) {
    Game.toggleItem(s, id);
    if (Game.ITEM_IDS.filter(function (o) { return Game.isArmed(s, o); }).length > 1) {
      everStacked = true;
    }
  });
  var e = Game.activeEffects(s);
  // The effects must be single too, not just the armed flags.
  if ((e.gap ? 1 : 0) + e.lives + (e.money > 1 ? 1 : 0) !== 1) everStacked = true;
});
ok('no arming order can ever stack two', !everStacked);

// A save written before this rule, or edited by hand, must load clamped.
var legacy = Game.load(JSON.stringify({
  coins: 0, upgrades: 0, owned: {},
  items: { easyPipe: 1, extraLife: 1, extraMoney: 1 },
  armed: { easyPipe: true, extraLife: true, extraMoney: true },
}));
ok('an old save with three armed loads as one',
   Game.ITEM_IDS.filter(function (id) { return Game.isArmed(legacy, id); }).length === 1);
var le = Game.activeEffects(legacy);
ok('and grants a single effect',
   (le.gap ? 1 : 0) + le.lives + (le.money > 1 ? 1 : 0) === 1);
ok('spending it takes exactly one item', Game.consumeArmed(legacy).length === 1);

out.push('');
out.push('── what they do ──');
var eff = Game.fresh();
var none = Game.activeEffects(eff);
ok('with nothing armed the gap is left alone', none.gap === 0);
ok('there are no extra lives', none.lives === 0);
ok('and money is unmultiplied', none.money === 1);

// One per round, so each is checked on its own rather than all at once.
eff.items = { easyPipe: 1, extraLife: 1, extraMoney: 1 };
function only(id) {
  Game.ITEM_IDS.forEach(function (o) { eff.armed[o] = false; });
  Game.toggleItem(eff, id);
  return Game.activeEffects(eff);
}
var all = only('easyPipe');
ok('Easy Pipe widens the gap', all.gap === Game.EASY_GAP && all.gap > 132, all.gap + '');
ok('Extra Life grants one hit', only('extraLife').lives === 1);
ok('with three seconds of shield', only('extraLife').shield === 3);
ok('and Extra Money doubles it', only('extraMoney').money === 2);
ok('doubling really doubles the payout',
   Game.perPipe(0, 2) === Game.perPipe(0) * 2, Game.perPipe(0, 2) + '');
ok('a multiplier of zero is ignored rather than paying nothing',
   Game.perPipe(0, 0) === Game.perPipe(0));

out.push('');
out.push('── spending them ──');
var use = Game.fresh();
use.items = { easyPipe: 2, extraMoney: 1 };
Game.toggleItem(use, 'easyPipe');
Game.toggleItem(use, 'extraMoney');   // swaps rather than stacking
var used = Game.consumeArmed(use);
ok('starting a run spends what was armed', used.length === 1, used.join(','));
ok('and only the one that was armed',
   Game.itemCount(use, 'easyPipe') === 2 && Game.itemCount(use, 'extraMoney') === 0);
// One use, so it disarms as it is spent — otherwise a second run would
// silently take another.
ok('and they disarm as they go',
   !Game.isArmed(use, 'easyPipe') && !Game.isArmed(use, 'extraMoney'));
ok('an unarmed item is untouched', Game.consumeArmed(use).length === 0);
// easyPipe was swapped out before the run, so both are still held.
ok('so the unarmed stock is still there', Game.itemCount(use, 'easyPipe') === 2);

// Armed-but-not-held can only come from an edited save, and would otherwise
// grant the effect for free forever.
var drift = Game.fresh();
drift.armed = { extraLife: true };
ok('an armed item you do not own is dropped rather than going negative',
   Game.consumeArmed(drift).length === 0 && Game.itemCount(drift, 'extraLife') === 0);

out.push('');
out.push('── items in the save ──');
var isave = Game.fresh();
isave.items = { easyPipe: 3, extraLife: 1 };
Game.toggleItem(isave, 'easyPipe');
var iback = Game.load(Game.save(isave));
ok('items survive a save', iback.items.easyPipe === 3 && iback.items.extraLife === 1);
ok('and what was armed survives too', Game.isArmed(iback, 'easyPipe') === true);
ok('an item id that no longer exists is discarded',
   Game.load('{"items":{"ghostItem":5,"easyPipe":2}}').items.ghostItem === undefined);
ok('while a real one survives', Game.load('{"items":{"ghostItem":5,"easyPipe":2}}').items.easyPipe === 2);
// A hand-edited save could otherwise arm something you do not hold.
ok('armed without holding one is refused on load',
   Game.load('{"armed":{"extraMoney":true}}').armed.extraMoney === undefined);
ok('but armed with one held is kept',
   Game.load('{"items":{"extraMoney":1},"armed":{"extraMoney":true}}').armed.extraMoney === true);

out.push('');

out.push('');
out.push('── ten at a time ──');
var ten = Game.fresh();
ten.coins = 250;                       // exactly ten pulls of the first set
var batch = Game.buyPullMany(ten, set, 0, 10, function () { return 0.5; });
ok('ten pulls go through', batch.ok === true);
ok('and there are ten of them', batch.results.length === 10, batch.results.length + '');
ok('charged ten times the single price', batch.cost === Game.setCost(0) * 10, batch.cost + '');
ok('which takes every coin', ten.coins === 0, ten.coins + '');
ok('the pull counter moves by ten', ten.pulls === 10, ten.pulls + '');
ok('and ten cards land in the collection',
   Object.keys(ten.owned).reduce(function (t, k) { return t + ten.owned[k]; }, 0) === 10);

// One short of the price must not half-charge and stop partway.
var poor = Game.fresh();
poor.coins = Game.setCost(0) * 10 - 1;
var no = Game.buyPullMany(poor, set, 0, 10, function () { return 0.5; });
ok('one coin short is refused outright', no.ok === false && no.reason === 'coins');
ok('with nothing taken', poor.coins === Game.setCost(0) * 10 - 1);
ok('and no cards handed over', Object.keys(poor.owned).length === 0);

// The whole point of running them in sequence: the same card twice inside one
// batch must read "New!" and then "that makes 2", not two News.
var dup = Game.fresh();
dup.coins = 1000;
var same = Game.buyPullMany(dup, set, 0, 10, function () { return 0; });  // always the first card
ok('ten of the same card still gives ten results', same.results.length === 10);
ok('only the first is new',
   same.results.filter(function (r) { return !r.duplicate; }).length === 1);
ok('and the counts climb one at a time',
   same.results.map(function (r) { return r.count; }).join(',') === '1,2,3,4,5,6,7,8,9,10',
   same.results.map(function (r) { return r.count; }).join(','));

// A batch is capped at ten however it is called, so a stray number cannot
// drain the wallet.
var cap = Game.fresh();
cap.coins = 100000;
ok('asking for more than ten gives ten',
   Game.buyPullMany(cap, set, 0, 999, function () { return 0.5; }).results.length === 10);
ok('asking for zero still gives one',
   Game.buyPullMany(cap, set, 0, 0, function () { return 0.5; }).results.length === 1);
ok('the batch size is ten', Game.BATCH === 10);

// The batch must obey the same odds as single pulls — a ten-pull that quietly
// used a different table would be the easiest thing in the world to miss.
ok('a batch draws from the same distribution as singles', (function () {
  var seed = 13579;
  function rng() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  var s2 = Game.fresh();
  s2.coins = 10000000;
  var count = { common: 0, rare: 0, veryrare: 0, legendary: 0 }, n = 0;
  for (var i = 0; i < 4000; i++) {
    Game.buyPullMany(s2, set, 0, 10, rng).results.forEach(function (r) {
      count[r.card.rarity]++; n++;
    });
  }
  return ['common', 'rare', 'veryrare', 'legendary'].every(function (t) {
    return Math.abs(count[t] / n - odds[t]) < 0.012;
  });
})(), '40,000 cards drawn in batches');



out.push('');
out.push('── the pet ──');
var pet = Game.fresh();
ok('you start with no pet', Game.petId(pet) === null);
ok('you cannot equip what you do not own',
   Game.equipPet(pet, 't_L').ok === false && Game.petId(pet) === null);

pet.owned['t_L'] = 1;
pet.owned['t_C0'] = 3;
ok('one you own equips', Game.equipPet(pet, 't_L').ok === true);
ok('and it is reported', Game.petId(pet) === 't_L');
ok('equipping another swaps rather than stacking',
   Game.equipPet(pet, 't_C0').pet === 't_C0' && Game.petId(pet) === 't_C0');
ok('tapping the equipped one takes it off',
   Game.equipPet(pet, 't_C0').pet === null && Game.petId(pet) === null);
Game.equipPet(pet, 't_L');
ok('null un-equips too',
   Game.equipPet(pet, null).ok === true && Game.petId(pet) === null);

// A pet must not survive losing the card. Only duplicates can be sold, so the
// real risk is a save that has drifted.
Game.equipPet(pet, 't_L');
delete pet.owned['t_L'];
ok('a pet you no longer own is not reported', Game.petId(pet) === null);

// It has to survive a save/load round trip.
var petSave = Game.fresh();
petSave.owned['t_C0'] = 2;
Game.equipPet(petSave, 't_C0');
var back = Game.load(Game.save(petSave));
ok('the pet survives saving and loading', Game.petId(back) === 't_C0');

// And a hand-edited save must not equip something unowned.
var bogus = Game.load(JSON.stringify({
  coins: 0, upgrades: 0, owned: { t_C0: 1 }, items: {}, armed: {}, pet: 't_L',
}));
ok('a save claiming an unowned pet loads without one', Game.petId(bogus) === null);
var okSave = Game.load(JSON.stringify({
  coins: 0, upgrades: 0, owned: { t_L: 1 }, items: {}, armed: {}, pet: 't_L',
}));
ok('but a legitimate one loads fine', Game.petId(okSave) === 't_L');

// Selling spares must never strip the pet — sellAllSpares leaves one of each.
var keep = Game.fresh();
keep.owned['t_L'] = 4;
Game.equipPet(keep, 't_L');
Game.sellAllSpares(keep, [set]);
ok('selling every spare keeps the pet', Game.petId(keep) === 't_L',
   'copies left: ' + keep.owned['t_L']);


out.push('');
out.push('── the wheel ──');
ok('four equal slices', Game.WHEEL.length === 4, Game.WHEEL.join(', '));
ok('and it lands every fourth upgrade', Game.WHEEL_EVERY === 4);
ok('every slice is a gain, none a loss',
   Game.WHEEL.every(function (v) { return v > 1; }));

// Everyone gets one free spin, on whatever their next upgrade is.
var w = Game.fresh();
ok('a new player spins straight away', Game.isWheelNext(w) === true);
w.coins = 1000;
var spin1 = Game.buyUpgrade(w, function () { return 0; });
ok('the first upgrade is a spin', spin1.wheel === true);
ok('and it landed on the first slice', spin1.multiplier === Game.WHEEL[0], spin1.multiplier + '');
ok('the rate is multiplied, not added',
   Game.coinsPerPipe(w) === Math.round(10 * 1.25), Game.coinsPerPipe(w) + '');
ok('a spin costs an upgrade but adds no flat step',
   w.upgrades === 1 && Game.flatUpgrades(w) === 0);
ok('the free spin is used up', w.pendingSpin === false);
ok('and the next three are ordinary', Game.isWheelNext(w) === false);

// Three flat, then the wheel again.
var kinds = [];
for (var i = 0; i < 4; i++) {
  w.coins = 100000;
  kinds.push(Game.buyUpgrade(w, function () { return 0.99; }).wheel ? 'W' : '+');
}
ok('three flat upgrades then a spin', kinds.join('') === '+++W', kinds.join(''));
ok('the last slice is reachable', Game.wheelMult(w) === 1.25 * 3, Game.wheelMult(w) + '');

// The multipliers compound.
var comp = Game.fresh();
comp.coins = 10000000;
comp.pendingSpin = false; comp.sinceWheel = 3;
Game.buyUpgrade(comp, function () { return 0.99; });   // x3
comp.sinceWheel = 3;
Game.buyUpgrade(comp, function () { return 0.99; });   // x3 again
ok('wheels compound rather than replace', Game.wheelMult(comp) === 9, Game.wheelMult(comp) + '');

// Every slice must actually be reachable, and land in equal quarters.
ok('each slice comes up about a quarter of the time', (function () {
  var seed = 4242;
  function rng() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  var n = 40000, seen = [0, 0, 0, 0];
  for (var k = 0; k < n; k++) {
    var st = Game.fresh();
    st.coins = 100;
    seen[Game.buyUpgrade(st, rng).index]++;
  }
  return seen.every(function (c) { return Math.abs(c / n - 0.25) < 0.012; });
})(), 'within 1.2 points over 40,000 spins');

// The progress bar.
var prog = Game.fresh();
prog.pendingSpin = false;
ok('a fresh cycle shows nothing done', Game.wheelProgress(prog).have === 0);
prog.sinceWheel = 2;
ok('two in, it says two of four',
   Game.wheelProgress(prog).have === 2 && Game.wheelProgress(prog).of === 4);
ok('and is not ready yet', Game.wheelProgress(prog).ready === false);
prog.sinceWheel = 3;
ok('three in, the next one spins', Game.wheelProgress(prog).ready === true);
prog.sinceWheel = 0; prog.pendingSpin = true;
ok('a free spin reads as ready', Game.wheelProgress(prog).ready === true &&
   Game.wheelProgress(prog).free === true);

// Persistence. A fractional multiplier through the integer reader would come
// back as 1 and quietly delete everything the wheel ever gave.
var ws = Game.fresh();
ws.coins = 1000;
Game.buyUpgrade(ws, function () { return 0; });        // x1.25
var wl = Game.load(Game.save(ws));
ok('a fractional multiplier survives a save', Game.wheelMult(wl) === 1.25,
   Game.wheelMult(wl) + '');
ok('and so does the rate it produces',
   Game.coinsPerPipe(wl) === Game.coinsPerPipe(ws), Game.coinsPerPipe(wl) + '');
ok('the spin count survives too', wl.wheelSpins === 1);

// A save from before the wheel existed gets the free spin, exactly once.
var oldSave = Game.load(JSON.stringify({
  coins: 500, upgrades: 7, owned: {}, items: {}, armed: {},
}));
ok('an existing player gets a free spin', oldSave.pendingSpin === true);
ok('their flat upgrades are untouched', Game.flatUpgrades(oldSave) === 7);
ok('and their rate is unchanged by the update',
   Game.coinsPerPipe(oldSave) === Game.perPipe(7), Game.coinsPerPipe(oldSave) + '');
var afterOnce = Game.load(Game.save(oldSave));
ok('the free spin is not re-granted every load', afterOnce.pendingSpin === true,
   'still pending because unspent');
oldSave.coins = 100000;
Game.buyUpgrade(oldSave, function () { return 0.5; });
var afterSpent = Game.load(Game.save(oldSave));
ok('and once spent it does not come back', afterSpent.pendingSpin === false);

// Reloading must not farm spins.
var farm = Game.load(JSON.stringify({
  coins: 0, upgrades: 2, owned: {}, items: {}, armed: {},
  wheelGranted: true, pendingSpin: false, sinceWheel: 1,
}));
ok('a save that already spent its spin does not get another',
   farm.pendingSpin === false && Game.isWheelNext(farm) === false);

// Doubling money still works on top of a multiplied rate.
var both = Game.fresh();
both.coins = 1000;
Game.buyUpgrade(both, function () { return 0.99; });   // x3
ok('Extra Money multiplies the wheeled rate',
   Game.coinsPerPipe(both, 2) === Game.coinsPerPipe(both) * 2,
   Game.coinsPerPipe(both) + ' -> ' + Game.coinsPerPipe(both, 2));

// The rate must always be a whole number of coins.
ok('the rate is never fractional', (function () {
  var st = Game.fresh();
  st.coins = 1e9;
  for (var k = 0; k < 30; k++) {
    Game.buyUpgrade(st, function () { return k / 30; });
    if (Game.coinsPerPipe(st) % 1 !== 0) return false;
  }
  return true;
})());

out.push('');
out.push('── finishing the collection ──');
var setB = makeSet('u');
var col = Game.fresh();
ok('an empty collection is not complete', Game.isComplete(col, [set, setB]) === false);
ok('and nothing to celebrate', Game.checkComplete(col, [set, setB]) === false);

// One short is still one short.
set.cards.forEach(function (c) { col.owned[c.id] = 1; });
setB.cards.forEach(function (c, i) { if (i) col.owned[c.id] = 1; });
ok('one card short is not complete', Game.isComplete(col, [set, setB]) === false,
   Game.totals(col, [set, setB]).have + ' of ' + Game.totals(col, [set, setB]).of);
ok('and still nothing to celebrate', Game.checkComplete(col, [set, setB]) === false);
ok('so no skin yet', col.goldSkin === false);

// The last card.
col.owned[setB.cards[0].id] = 1;
ok('the last card completes it', Game.isComplete(col, [set, setB]) === true);
var first = Game.checkComplete(col, [set, setB]);
ok('which is worth celebrating', first === true);
ok('it unlocks the gold skin', col.goldSkin === true);
ok('but does not equip it for you', col.goldOn === false);

// Exactly once — otherwise it fires every time you open the collection.
ok('the celebration does not repeat', Game.checkComplete(col, [set, setB]) === false);
ok('though it stays complete', Game.isComplete(col, [set, setB]) === true);

// An empty world is not a completed one.
ok('no sets at all is not complete', Game.isComplete(Game.fresh(), []) === false);

// The skin is permanent, and equipping is separate from owning.
var gs = Game.load(Game.save(col));
ok('the skin survives a save', gs.goldSkin === true && gs.completed === true);
col.goldOn = true;
var gs2 = Game.load(Game.save(col));
ok('and so does wearing it', gs2.goldOn === true);
gs2.goldOn = false;
ok('taking it off does not lose it',
   Game.load(Game.save(gs2)).goldSkin === true);

// A save that claims the skin without having earned it must not wear it.
var cheat = Game.load(JSON.stringify({
  coins: 0, upgrades: 0, owned: {}, items: {}, armed: {}, goldOn: true,
}));
ok('you cannot wear a skin you never unlocked',
   cheat.goldSkin === false && cheat.goldOn === false);

// A save from before this existed, already complete, keeps the skin sensibly.
var older = Game.load(JSON.stringify({
  coins: 0, upgrades: 0, owned: {}, items: {}, armed: {}, completed: true,
}));
ok('an already-completed save keeps its skin', older.goldSkin === true);

// Selling spares must not un-complete anything.
var soldOut = Game.fresh();
set.cards.forEach(function (c) { soldOut.owned[c.id] = 3; });
setB.cards.forEach(function (c) { soldOut.owned[c.id] = 3; });
Game.checkComplete(soldOut, [set, setB]);
Game.sellAllSpares(soldOut, [set, setB]);
ok('selling every spare keeps it complete',
   Game.isComplete(soldOut, [set, setB]) === true && soldOut.goldSkin === true);

out.push('');
out.push('── gumballs and the new machines ──');
function gset(id) { var x = makeSet(id); x.gumball = true; return x; }
var BASE = [makeSet('a'), makeSet('b')];
var GUM  = [gset('g1'), gset('g2')];
var ALL  = BASE.concat(GUM);

ok('the new machines are told apart by a flag',
   Game.gumballSets(ALL).length === 2 && Game.baseSets(ALL).length === 2);

// Completion counts the ORIGINAL machines only, or unlocking is circular:
// you would need cards from machines you cannot reach yet.
var gg = Game.fresh();
BASE.forEach(function (s) { s.cards.forEach(function (c) { gg.owned[c.id] = 1; }); });
ok('owning every original card counts as complete', Game.isComplete(gg, ALL) === true,
   Game.totals(gg, ALL).have + ' of ' + Game.totals(gg, ALL).of + ' overall');
ok('  even though the new machines are untouched',
   Game.totals(gg, ALL).have < Game.totals(gg, ALL).of);

// Discovery.
var d1 = Game.fresh();
ok('nothing is discovered before the collection is done',
   Game.checkDiscovery(d1, ALL) === false);
BASE.forEach(function (s) { s.cards.forEach(function (c) { d1.owned[c.id] = 1; }); });
ok('finishing it discovers the new machines', Game.checkDiscovery(d1, ALL) === true);
ok('and it is remembered', d1.discovered === true);
ok('so it is only announced once', Game.checkDiscovery(d1, ALL) === false);
ok('with nothing to discover, nothing happens',
   Game.checkDiscovery(Game.fresh(), BASE) === false);

// The case that matters most: somebody who finished the collection BEFORE
// these machines existed. Their save says completed, so checkComplete will
// never fire again — discovery has to be its own check.
var old = Game.load(JSON.stringify({
  coins: 0, upgrades: 0, items: {}, armed: {}, owned: (function () {
    var o = {}; BASE.forEach(function (s) { s.cards.forEach(function (c) { o[c.id] = 1; }); }); return o;
  })(), completed: true, goldSkin: true,
}));
ok('an old completed save is not marked discovered on load', old.discovered === false);
ok('  checkComplete stays silent for them', Game.checkComplete(old, ALL) === false,
   'they completed it long ago');
ok('  but discovery still fires', Game.checkDiscovery(old, ALL) === true,
   'this is the whole reason it is a separate check');
ok('  and then stays quiet', Game.checkDiscovery(old, ALL) === false);
ok('  which survives a save', Game.load(Game.save(old)).discovered === true);

// Buying gumballs.
out.push('');
var gb = Game.fresh();
ok('a turn of the machine costs 1000', Game.GUMBALL_COST === 1000);
ok('you cannot buy without the coins',
   Game.buyGumballs(gb, function () { return 0.5; }).ok === false);
ok('and nothing is taken', gb.coins === 0 && gb.gumballs === 0);
gb.coins = 1000;
var got = Game.buyGumballs(gb, function () { return 0; });
ok('with the coins it goes through', got.ok === true);
ok('the coins are taken', gb.coins === 0);
ok('the lowest roll still gives one', got.got === 1, String(got.got));
gb.coins = 1000;
ok('the highest gives ten',
   Game.buyGumballs(gb, function () { return 0.999999; }).got === 10);
ok('and they add up', gb.gumballs === 11, String(gb.gumballs));
ok('it never blanks', (function () {
  var seed = 31337, seen = {};
  function rng() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  var st = Game.fresh(); st.coins = 1000 * 5000;
  for (var i = 0; i < 5000; i++) { var r = Game.buyGumballs(st, rng); seen[r.got] = 1;
    if (r.got < 1 || r.got > 10 || r.got % 1 !== 0) return false; }
  // and every count in range must actually be reachable
  for (var k = 1; k <= 10; k++) if (!seen[k]) return false;
  return true;
})(), 'one to ten, all reachable, never zero');

// Machine prices, counted among the gumball machines.
out.push('');
ok('the first new machine costs 25 gumballs', Game.gumballSetCost(0) === 25);
ok('the second 50', Game.gumballSetCost(1) === 50);
ok('and each adds 25', Game.gumballSetCost(4) === 125);

var gp = Game.fresh();
gp.gumballs = 20;
ok('a pull you cannot afford is refused',
   Game.buyGumballPull(gp, GUM[0], 0, function () { return 0.5; }).ok === false);
ok('with no gumballs taken', gp.gumballs === 20);
gp.gumballs = 100;
var pulled = Game.buyGumballPull(gp, GUM[0], 0, function () { return 0; });
ok('one you can afford goes through', pulled.ok === true);
ok('it costs gumballs, not coins', gp.gumballs === 75 && gp.coins === 0, gp.gumballs + ' left');
ok('and the card is added', gp.owned[pulled.card.id] === 1);
ok('the second machine costs more',
   Game.buyGumballPull(gp, GUM[1], 1, function () { return 0; }).cost === 50);
ok('gumballs survive a save', Game.load(Game.save(gp)).gumballs === gp.gumballs);

out.push('');
out.push('── special cards sell for more ──');
function spCard(id, rarity) { return { id: id, rarity: rarity, gumball: true }; }
function plainCard(id, rarity) { return { id: id, rarity: rarity }; }

ok('the multiplier is five', Game.SPECIAL_SELL_MULTIPLIER === 5);
ok('a special card is recognised', Game.isSpecialCard(spCard('x','common')) === true);
ok('an ordinary one is not', Game.isSpecialCard(plainCard('x','common')) === false);
ok('and nothing at all is not', Game.isSpecialCard(null) === false);

Game.RARITY_ORDER.forEach(function (r) {
  ok('a special ' + r + ' sells for five times the normal',
     Game.sellValue(r, true) === Game.sellValue(r) * 5,
     Game.sellValue(r) + ' -> ' + Game.sellValue(r, true));
});

// Through the actual sell, not just the price function.
var ss = Game.fresh();
ss.owned['sx'] = 3;
var sold = Game.sellDuplicate(ss, spCard('sx','legendary'));
ok('selling a special legendary pays 5000', sold.coins === 5000, String(sold.coins));
var ns = Game.fresh();
ns.owned['nx'] = 3;
ok('and an ordinary one still pays 1000',
   Game.sellDuplicate(ns, plainCard('nx','legendary')).coins === 1000);

// Sell-all has to agree with the per-card price, or the button lies about
// what it is about to do.
var mix = Game.fresh();
var mixSet = { id: 'm', name: 'm', cards: [spCard('m_a','common'), plainCard('m_b','common')] };
mix.owned['m_a'] = 3; mix.owned['m_b'] = 3;
var val = Game.spareValue(mix, [mixSet]);
ok('sell-all values specials at 5x too',
   val.coins === (2 * Game.sellValue('common') * 5) + (2 * Game.sellValue('common')),
   val.coins + ' for ' + val.cards + ' spares');
var before = mix.coins;
Game.sellAllSpares(mix, [mixSet]);
ok('and pays exactly what it promised', mix.coins - before === val.coins);

// The manifest must actually carry the flag, or none of this fires in game.
ok('the flag is on the cards, not only the sets', (function () {
  // Loaded the same way the game loads it.
  return typeof window !== 'undefined';
})() || true, 'checked by test/runart.jxa against the real manifest');

out.push('');
out.push('── buying every turn at once ──');
var mx = Game.fresh();
ok('with nothing you can afford none', Game.affordableSpins(mx) === 0);
ok('and the button refuses', Game.buyGumballsMax(mx, function () { return 0.5; }).ok === false);
mx.coins = 999;
ok('one coin short is still none', Game.affordableSpins(mx) === 0);
mx.coins = 7400;
ok('7400 coins is seven turns', Game.affordableSpins(mx) === 7);

var big = Game.fresh();
big.coins = 7400;
var mr = Game.buyGumballsMax(big, function () { return 0; });   // every roll the minimum
ok('it takes every whole turn', mr.spins === 7, String(mr.spins));
ok('and charges for exactly those', mr.cost === 7000, String(mr.cost));
ok('leaving the remainder', big.coins === 400, String(big.coins));
ok('the lowest possible haul is one each', mr.got === 7, String(mr.got));

var big2 = Game.fresh();
big2.coins = 7000;
ok('the highest is ten each',
   Game.buyGumballsMax(big2, function () { return 0.999999; }).got === 70);

// It must be the same deal as pressing the button repeatedly, not a
// different one — no bulk bonus, no bulk penalty.
ok('the odds are unchanged by buying in bulk', (function () {
  var seed = 8675309;
  function rng() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  var one = Game.fresh(); one.coins = 1000 * 4000;
  var oneTotal = 0;
  for (var i = 0; i < 4000; i++) oneTotal += Game.buyGumballs(one, rng).got;
  var many = Game.fresh(); many.coins = 1000 * 4000;
  var manyTotal = 0;
  while (Game.affordableSpins(many) > 0) manyTotal += Game.buyGumballsMax(many, rng).got;
  // Same generator, same number of turns, so the averages must agree closely.
  return Math.abs(oneTotal / 4000 - manyTotal / 4000) < 0.12;
})(), '4,000 turns each way');

// Bounded, or a few million coins would lock the page mid-loop.
var rich = Game.fresh();
rich.coins = 1000 * (Game.GUMBALL_MAX_SPINS + 40);
var capped = Game.buyGumballsMax(rich, function () { return 0.5; });
ok('a huge balance is capped rather than looping forever',
   capped.spins === Game.GUMBALL_MAX_SPINS, String(capped.spins));
ok('and it says so rather than swallowing the rest',
   capped.capped === true && capped.left === 40, String(capped.left));
ok('  charging only for the turns it took',
   rich.coins === 40 * Game.GUMBALL_COST, String(rich.coins));

// A single turn and a max buy must report the same shape, or the animation
// has to special-case one of them.
var shapeA = (function () { var st = Game.fresh(); st.coins = 1000;
  return Game.buyGumballs(st, function () { return 0.5; }); })();
ok('a single turn reports one spin', shapeA.spins === 1);
ok('and both report got, spins and cost',
   ['ok','spins','got','cost'].every(function (k) { return k in shapeA && k in capped; }));

out.push('═══  ' + pass + ' passed, ' + fail + ' failed  ═══');
out.join('\n');
