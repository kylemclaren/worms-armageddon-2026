#!/usr/bin/env python3
"""Weapon icons batch 2: assets/raw10/<name>.png -> assets/gfx/icon_<name>.png.
Trim to the alpha bbox (alpha > 24), pad 2px, LANCZOS so the longest side is 128px.
Opaque renders get their white/black card keyed out with prep_images.key_white."""
import os, sys, importlib.util
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets/raw10")
OUT = os.path.join(ROOT, "assets/gfx")
NAMES = ["pigeon", "mortar", "uzi", "handgun", "longbow", "dragonball", "kamikaze", "prod", "axe", "napalm",
         "minestrike", "sheepstrike", "petrol", "vase", "drill", "supersheep", "oldwoman", "madcow", "quake", "scales"]

# borrow key_white from prep_images.py without running its main loop
src = open(os.path.join(ROOT, "tools/prep_images.py")).read()
ns = {"__file__": os.path.join(ROOT, "tools/prep_images.py")}
exec(src.split("SPRITE_SIZE =")[0], ns)
key_white = ns["key_white"]

FORCE = "--force" in sys.argv
only = [a for a in sys.argv[1:] if not a.startswith("--")]
for name in only or NAMES:
    s = os.path.join(SRC, name + ".png")
    d = os.path.join(OUT, f"icon_{name}.png")
    if not os.path.exists(s): print("missing", name); continue
    if not FORCE and os.path.exists(d) and os.path.getmtime(d) > os.path.getmtime(s): continue
    im = Image.open(s).convert("RGBA")
    if (np.asarray(im.getchannel("A")) < 250).mean() < 0.05:
        print("keying opaque card:", name); im = key_white(im)
    bb = im.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    if bb:
        x0, y0, x1, y1 = bb
        im = im.crop((max(0, x0 - 2), max(0, y0 - 2), min(im.width, x1 + 2), min(im.height, y1 + 2)))
    k = 128 / max(im.size)
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    im.save(d, optimize=True)
    print(f"wrote icon_{name}.png {im.size[0]}x{im.size[1]}")
