#!/usr/bin/env python3
"""Check the card art: no duplicates, no backgrounds, no missing files.

Written after two of the five new machines shipped holding pictures that were
already in the game. They had been deduplicated against each other but never
against the original 120 — deduplicating a batch is not the same as
deduplicating the collection, and only a whole-collection check catches it.

Run directly for a readable report, or with --json for test/runart.jxa.
"""

import json
import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

# A pair counts as the same picture when BOTH the composited image and the
# alpha silhouette are close. Either alone gives false positives: two
# different objects on white share a silhouette-ish hash, and the same object
# recoloured shares an image hash.
THRESHOLD = 6
WANT_RARITY = {"common": 10, "rare": 3, "veryrare": 1, "legendary": 1}


def dhash(im, channel):
    g = im.convert("RGBA")
    if channel == "a":
        g = g.split()[3]
    else:
        bg = Image.new("RGB", g.size, (255, 255, 255))
        bg.paste(g, mask=g.split()[3])
        g = bg.convert("L")
    g = g.resize((9, 8), Image.LANCZOS)
    px = g.load()
    bits = 0
    for y in range(8):
        for x in range(8):
            bits = (bits << 1) | (1 if px[x, y] > px[x + 1, y] else 0)
    return bits


def main():
    sets = json.loads((ASSETS / "manifest.json").read_text())
    cards, missing, opaque, not_square = [], [], [], []
    unmarked_special, marked_plain = [], []
    bad_size, bad_rarity, ids = [], [], {}
    dup_ids = []

    for s in sets:
        if len(s["cards"]) != 15:
            bad_size.append(f"{s['id']}:{len(s['cards'])}")
        counts = {}
        for c in s["cards"]:
            counts[c["rarity"]] = counts.get(c["rarity"], 0) + 1
            # The 5x sell price is read off the CARD, because a card is sold
            # from the collection where its set is not to hand. So every card
            # in a gumball set must carry the flag, and no other card may.
            if s.get("gumball") and not c.get("gumball"):
                unmarked_special.append(c["id"])
            if not s.get("gumball") and c.get("gumball"):
                marked_plain.append(c["id"])
            if c["id"] in ids:
                dup_ids.append(c["id"])
            ids[c["id"]] = True

            p = ASSETS / c["file"]
            if not p.exists():
                missing.append(c["file"])
                continue
            im = Image.open(p).convert("RGBA")
            if im.size[0] != im.size[1]:
                not_square.append(c["file"])
            a = im.split()[3]
            if a.getextrema()[0] > 8:
                opaque.append(c["file"])
            cards.append((c["file"], dhash(im, "rgb"), dhash(im, "a")))
        if counts != WANT_RARITY:
            bad_rarity.append(f"{s['id']}:{counts}")

    duplicates, compared = [], 0
    closest, closest_pair = 999, ["", ""]
    for i in range(len(cards)):
        for j in range(i + 1, len(cards)):
            compared += 1
            dr = bin(cards[i][1] ^ cards[j][1]).count("1")
            da = bin(cards[i][2] ^ cards[j][2]).count("1")
            if dr <= THRESHOLD and da <= THRESHOLD:
                duplicates.append([cards[i][0], cards[j][0]])
            if dr + da < closest:
                closest, closest_pair = dr + da, [cards[i][0], cards[j][0]]

    report = {
        "sets": len(sets),
        "cards": len(cards),
        "compared": compared,
        "duplicates": duplicates,
        "missing": missing,
        "opaque": opaque,
        "notSquare": not_square,
        "badSize": bad_size,
        "badRarity": bad_rarity,
        "dupIds": dup_ids,
        "closest": closest,
        "closestPair": closest_pair,
        "unmarkedSpecial": unmarked_special,
        "markedPlain": marked_plain,
    }

    if "--json" in sys.argv:
        print(json.dumps(report))
        return 0

    print(f"  {report['sets']} machines, {report['cards']} cards, "
          f"{compared:,} pairs compared")
    for label, key in [("duplicates", "duplicates"), ("missing files", "missing"),
                       ("with a background", "opaque"), ("not square", "notSquare"),
                       ("wrong set size", "badSize"), ("wrong rarity mix", "badRarity"),
                       ("duplicate ids", "dupIds"),
                       ("special, unmarked", "unmarkedSpecial"),
                       ("plain, marked special", "markedPlain")]:
        v = report[key]
        print(f"  {label:<20} {len(v)}" + (f"  {v}" if v else ""))
    print(f"  closest pair         distance {closest} "
          f"({closest_pair[0]} vs {closest_pair[1]})")
    return 1 if duplicates or missing or opaque else 0


if __name__ == "__main__":
    raise SystemExit(main())
