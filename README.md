# Gotcha

Fly through pipes, earn coins, spend them on gacha machines full of cut-out
pictures. Open `index.html`.

Serve it over HTTP rather than opening the file directly — it fetches
`assets/manifest.json`, and a `file://` page can't:

```
python3 -m http.server 8765
```

then `http://localhost:8765`.

## How it works

**Play** — tap or press space to flap. Every pipe pays coins.

**Shop** — upgrade your rate, spin the item machine, and pull from eight gacha
machines.

**Collection** — every card in every set. Ones you haven't found are
silhouettes, so the shape teases without giving it away. Duplicates show a
count; a single copy shows a tick rather than "×1", which would be noise on
most of the grid.

**Tap a card you have spares of to sell one.** It blows apart into sparks in
its rarity colour and the coins float up. There's a "sell every spare" button
at the top for when doing it one at a time gets tedious.

| | |
|---|---|
| Common | 10 |
| Rare | 50 |
| Very rare | 200 |
| Legendary | 1000 |

**The last copy of anything can never be sold.** The first of each card *is*
the collection, and letting it go would mean a completed set could be
un-completed by a misplaced tap. Tapping a sole copy shakes the card and says
no rather than doing nothing, which reads as broken.

## Items

Three one-use items, from a **250-coin slot machine** sitting right under the
upgrade. Three reels, and **you never lose** — every spin gives you something,
so the win line is the only outcome there is. The reels stop left to right;
stopping them together would be a still image rather than a spin.

| | |
|---|---|
| ⇕ **Easy Pipe** | Wider gaps for a whole run |
| ♥ **Extra Life** | Survive one hit, then three seconds of shield |
| ✦ **Extra Money** | Double coins for a whole run |

The three appear **above the Play screen before you start**. Dimmed if you hold
none — knowing an item exists is half the reason to go and buy one — with the
count in the corner. Tap to arm, tap again to disarm; the armed one lights up
in its own colour. They vanish once you're flying, since it's a pre-run choice
and three buttons over the pipes would be in the way.

**Arming is free and reversible.** Nothing is spent until a run actually
begins, so changing your mind costs nothing — and an item disarms as it's
spent, or a second run would silently take another.

Two details in the game itself:

- **The shield lifts you clear.** Surviving a hit gives you upward momentum as
  well as the three seconds, because landing straight back into the pipe that
  hit you would make the item worthless.
- **The ground always kills**, shield or not. It's the only hard boundary in
  the game, and a bird skidding along the floor invulnerable would remove it.
- **Easy Pipe raises the top of the gap too.** Otherwise the extra room would
  all come out of the bottom pipe and the hole would drift off the screen.

## The numbers

- **10 coins a pipe** to start
- **Each upgrade adds 2**, and costs **1.5× the last** — first is 50
- **Machines cost 25, 50, 75, 100, 125, 150** per pull, in order

Upgrades are linear and prices are geometric, so the cost always outruns the
income it buys. In pipes-per-upgrade that's **5 → 14 → 69 → 384**, which is the
whole shape of the game and is asserted in the tests rather than left to chance.

Odds per pull, derived from the real weights rather than written down
separately, so what the shop shows can't drift from what the machine does:

| | |
|---|---|
| Common | 77.9% |
| Rare | 16.4% |
| Very rare | 4.3% |
| **Legendary** | **1.4%** |

## The pictures

120 images from `~/Pictures/Scratch`, sorted into eight sets of fifteen —
10 common, 3 rare, 1 very rare, 1 legendary.

Machine prices come from the set's index (`25 × (n+1)`), so adding one needs no
new price: Emberfall costs 175 a pull and Moonglass 200 with nothing
configured.

Backgrounds are removed by **flooding in from the border**, not by deleting
every pixel matching the corner colour. That distinction matters: flooding
keeps white *inside* a subject — an eye, a highlight, a page — instead of
punching holes through it.

Of 550 candidates, 245 already had usable transparency and 167 had a flat
background that could be cut; the rest were photographs and were dropped. The
survivors were scored on how much of the frame the subject fills and how
colourful it is, because a pale sliver makes a dull card.

Sets are grouped by dominant hue so each has a look of its own rather than
being a random pile, and within a set the most striking image becomes the
Legendary — a set whose best card is a pale smudge is a disappointing set.

**How much material is left.** 201 unique cut-outs exist in the folder and 120
are now in the game, leaving 81. Of those only a handful score as *decent*, and
the hue spread is badly lopsided — plenty of warm images, very few greens or
purples. Two or three more sets are physically possible; only one would hold up
against what is already there. Dropping more cut-outs into the folder is the
real fix, and the pipeline picks them up and dedupes against everything already
used.

## The look

iOS around 2012, the last version before everything went flat. Four tricks,
used everywhere:

1. **Every surface is a vertical gradient**, light at the top. Nothing in that
   interface was a flat colour.
2. **Every raised edge has a 1px white inner highlight on top and a dark
   hairline below.** That pair is what makes a bar read as a physical strip
   laid on the screen rather than a coloured band.
3. **Letterpress text, both ways round** — a white shadow below dark text on a
   light surface, a dark shadow below light text on a dark one.
4. **Textures rather than colours** behind content: linen on the sheets, gloss
   on the bars.

The tab bar glows blue under the selected tab. The score is drawn with a hard
four-way outline rather than a blur, because a soft shadow disappears against
the bright sky and that's the one number that always has to be readable.

## Notes on the game

- **Fixed timestep.** Physics stepped by a variable delta runs at double speed
  on a 120 Hz screen, and one long frame — a tab regaining focus — teleports
  the bird through a pipe without ever touching it. The accumulator is also
  clamped, so returning to a backgrounded tab doesn't simulate the whole gap
  at once.
- **Circle-against-rectangle collision**, using the nearest point on the box.
  A box-on-box approximation makes the bird clip corners it visibly missed.
- **The ceiling stops you rather than killing you.** Dying to an invisible line
  above the screen feels arbitrary.
- **The game stops when you leave the Play tab**, so you don't come back
  mid-fall.

## Sound

Synthesised, nothing loaded. Two families, and the difference between them is
the point.

**The riser** is the centrepiece — it plays while a capsule climbs and does
most of the work of making a pull feel like it matters. A riser works by doing
three things at once, all accelerating together: the pitch climbs, a wobble on
the volume speeds up (7 Hz to 34 Hz), and a noise band opens upward underneath.
Any one alone is a slide whistle. Its length is computed from the climb beat,
so it peaks at the exact moment the shell gives rather than being a guessed
number that drifts whenever the animation is retuned.

**The interface is iOS 6**, which is a distinctly different idiom from a
desktop:

- **Marimba, not bell.** The tuned overtone of a struck wooden bar is the
  *fourth* harmonic, not the inharmonic 2.76 of metal. That single ratio is
  most of what separates iOS from Mac OS X.
- **Dry.** Decays of 120–250 ms. Nothing rings — a long tail belongs to a
  desktop with speakers, not a handset.
- **Mid-band.** Everything between roughly 400 Hz and 3 kHz, because that is
  all a phone speaker of the era could reproduce, and the sounds were designed
  for it.
- **A mallet transient** before each tone. Without it a marimba note is a sine.

Fourteen of them: tock, select, nav, navBack, tritone, swoosh, lock, unlock,
shutter, bloop, poof, flick, nope, ding. The tri-tone is saved for a
legendary — using it more often would spend it.

A disabled button still makes a sound (`nope`) rather than doing nothing, which
reads as broken.

## Testing

No browser here, so the economy and gacha are tested headlessly under
JavaScriptCore — **68 assertions**.

```
osascript -l JavaScript test/runstate.jxa   # economy, gacha, items — 135
osascript -l JavaScript test/runbuy.jxa     # buying and selling, end to end
```

`runbuy.jxa` drives the real `app.js` through a DOM stub with a working timer
queue, so a whole pull sequence actually completes. It exists because a
purchase once threw silently: `playCapsule` declared `var cap` for the capsule
element, which hoisted to the top of the function and shadowed the module-level
`cap()` helper, so the first line called `undefined`. It also checks that every
sound name used anywhere resolves — naming one that does not exist is silent,
which is indistinguishable from a bug — that an abandoned pull cannot leave the
shop permanently locked, and that only cards with spares are tappable while a
sole copy refuses.

The random generator is **injected**, because a gacha tested against
`Math.random` proves nothing. That allows the real checks: that a roll of zero
gives the first card, that a roll at the very top still gives one (with `<=`
instead of `<` in the walk, the last card is unreachable), that all fifteen
cards actually appear across 40,000 pulls, and that the long-run distribution
matches the published odds within 1.2 points over 60,000.

Saves are rebuilt field by field rather than merged, because a `NaN` in `coins`
spreads through every sum that touches it — there are tests for corrupt,
negative and missing values.

The canvas game and the interface can't be exercised headlessly.

## Files

| | |
|---|---|
| `index.html` | Screens and tab bar |
| `css/ios.css` | The iOS design system |
| `css/app.css` | Layout |
| `js/state.js` | Economy, gacha, saves |
| `js/flappy.js` | The game |
| `js/app.js` | Screens and wiring |
| `assets/` | 90 cut-out images and the manifest |
| `test/` | Suite and JXA runner |
