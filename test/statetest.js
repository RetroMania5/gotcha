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
var bought = Game.buyUpgrade(s);
ok('one you can afford goes through', bought.ok === true);
ok('the coins are taken', s.coins === 90, s.coins + '');
ok('the upgrade is recorded', s.upgrades === 1);
ok('and it reports the new rate', bought.now === 12);

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
out.push('── what they do ──');
var eff = Game.fresh();
var none = Game.activeEffects(eff);
ok('with nothing armed the gap is left alone', none.gap === 0);
ok('there are no extra lives', none.lives === 0);
ok('and money is unmultiplied', none.money === 1);

eff.items = { easyPipe: 1, extraLife: 1, extraMoney: 1 };
Game.toggleItem(eff, 'easyPipe');
Game.toggleItem(eff, 'extraLife');
Game.toggleItem(eff, 'extraMoney');
var all = Game.activeEffects(eff);
ok('Easy Pipe widens the gap', all.gap === Game.EASY_GAP && all.gap > 132, all.gap + '');
ok('Extra Life grants one hit', all.lives === 1);
ok('with three seconds of shield', all.shield === 3);
ok('and Extra Money doubles it', all.money === 2);
ok('doubling really doubles the payout',
   Game.perPipe(0, 2) === Game.perPipe(0) * 2, Game.perPipe(0, 2) + '');
ok('a multiplier of zero is ignored rather than paying nothing',
   Game.perPipe(0, 0) === Game.perPipe(0));

out.push('');
out.push('── spending them ──');
var use = Game.fresh();
use.items = { easyPipe: 2, extraMoney: 1 };
Game.toggleItem(use, 'easyPipe');
Game.toggleItem(use, 'extraMoney');
var used = Game.consumeArmed(use);
ok('starting a run spends what was armed', used.length === 2, used.join(','));
ok('one of each is taken',
   Game.itemCount(use, 'easyPipe') === 1 && Game.itemCount(use, 'extraMoney') === 0);
// One use, so they disarm as they are spent — otherwise a second run would
// silently take another.
ok('and they disarm as they go',
   !Game.isArmed(use, 'easyPipe') && !Game.isArmed(use, 'extraMoney'));
ok('an unarmed item is untouched', Game.consumeArmed(use).length === 0);
ok('so the spare is still there', Game.itemCount(use, 'easyPipe') === 1);

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
out.push('═══  ' + pass + ' passed, ' + fail + ' failed  ═══');
out.join('\n');
