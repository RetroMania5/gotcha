#!/usr/bin/env python3
"""Stamp a build id through the app so a phone can tell it is out of date.

Everything that identifies a build is derived from the source itself, so the
id cannot drift from what is actually deployed:

  * version.json        what the running app fetches to compare against
  * js/app.js  BUILD    the id baked into the running app
  * sw.js      VERSION  the cache name, so a new build discards the old cache
  * index.html ?v=id    on every script and stylesheet, so the browser cannot
                        serve yesterday's JavaScript against today's HTML

Run it before committing. Re-running with no source changes is a no-op.
"""

import hashlib
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Everything that makes up "the app". Images are excluded: their names change
# when they change, and hashing 120 PNGs on every run is pure cost.
SOURCES = [
    "index.html",
    "css/ios.css",
    "css/app.css",
    "js/sfx.js",
    "js/state.js",
    "js/flappy.js",
    "js/app.js",
    "sw.js",
    "manifest.webmanifest",
    "assets/manifest.js",
]

VER_RE = re.compile(rb'\?v=[0-9a-f]{6,12}')
BUILD_RE = re.compile(rb'var BUILD = "[^"]*";')
SWVER_RE = re.compile(rb'var VERSION = "[^"]*";')


def normalise(data: bytes) -> bytes:
    """Strip the stamps themselves, so the id depends on the CODE only.

    Without this the id would depend on the previous id, and every run would
    produce a different answer for identical source.
    """
    data = VER_RE.sub(b"?v=", data)
    data = BUILD_RE.sub(b'var BUILD = "";', data)
    data = SWVER_RE.sub(b'var VERSION = "";', data)
    return data


def build_id() -> str:
    h = hashlib.sha1()
    for rel in SOURCES:
        p = ROOT / rel
        if not p.exists():
            print(f"  ! missing source: {rel}", file=sys.stderr)
            continue
        h.update(rel.encode())
        h.update(normalise(p.read_bytes()))
    return h.hexdigest()[:10]


def write_if_changed(path: pathlib.Path, data: bytes) -> bool:
    if path.exists() and path.read_bytes() == data:
        return False
    path.write_bytes(data)
    return True


def main() -> int:
    bid = build_id()
    changed = []

    # version.json — the file the app polls. no-store on the client side, so
    # this is always the real answer.
    if write_if_changed(ROOT / "version.json",
                        (json.dumps({"build": bid}) + "\n").encode()):
        changed.append("version.json")

    app = ROOT / "js/app.js"
    data = app.read_bytes()
    new = BUILD_RE.sub(b'var BUILD = "' + bid.encode() + b'";', data)
    if b'var BUILD = "' not in data:
        print("  ! js/app.js has no BUILD constant to stamp", file=sys.stderr)
        return 1
    if write_if_changed(app, new):
        changed.append("js/app.js")

    sw = ROOT / "sw.js"
    data = sw.read_bytes()
    new = SWVER_RE.sub(b'var VERSION = "gotcha-' + bid.encode() + b'";', data)
    if write_if_changed(sw, new):
        changed.append("sw.js")

    # Stamp the tags. A fresh index.html pointing at unstamped script URLs is
    # still free to load them from cache, which is how new HTML ends up running
    # old JavaScript.
    idx = ROOT / "index.html"
    html = idx.read_text()

    def stamp(m):
        attr, url = m.group(1), m.group(2)
        base = url.split("?")[0]
        if base.startswith(("http://", "https://", "//", "data:")):
            return m.group(0)
        return f'{attr}="{base}?v={bid}"'

    html2 = re.sub(r'\b(src|href)="((?:js|css|assets)/[^"]+)"', stamp, html)
    if write_if_changed(idx, html2.encode()):
        changed.append("index.html")

    print(f"  build {bid}")
    print("  updated: " + (", ".join(changed) if changed else "nothing (already current)"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
