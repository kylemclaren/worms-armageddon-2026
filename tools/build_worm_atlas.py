#!/usr/bin/env python3
"""Slice a worm animation sheet and pack it into assets/gfx/worm_atlas.{png,json}.
usage: build_worm_atlas.py sheet.png"""
import json, os, subprocess, sys, tempfile, glob
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sheet = sys.argv[1]
NAMES = {"00": "idle0", "01": "idle1", "02": "idle2", "03": "idle3", "04": "blink",
         "10": "walk0", "11": "walk1", "12": "walk2", "13": "walk3", "14": "walk4",
         "20": "crouch", "21": "jump", "22": "fall", "23": "tumble", "24": "dizzy"}
CENTERED = {"jump", "fall", "tumble"}           # airborne poses pivot on their middle
tmp = tempfile.mkdtemp()
subprocess.run([sys.executable, os.path.join(ROOT, "tools/slice_sheet.py"), sheet, f"{tmp}/f", "3", "5"], check=True, capture_output=True)
frames = {}
for p in sorted(glob.glob(f"{tmp}/f_*.png")):
    key = p.rsplit("_", 1)[1][:2]
    if key in NAMES: frames[NAMES[key]] = Image.open(p)
missing = set(NAMES.values()) - set(frames)
if missing: sys.exit(f"missing frames: {missing}")

idle = frames["idle0"]
head_from_right = idle.width * 0.33              # head centre sits ~1/3 of the idle width from its right edge
PAD = 4
x = y = row_h = 0
W = 2048
meta = {"idleHeight": idle.height, "frames": {}}
placed = []
for name, im in frames.items():
    if x + im.width + PAD > W: x = 0; y += row_h + PAD; row_h = 0
    placed.append((name, im, x, y))
    ax = im.width / 2 if name in CENTERED else im.width - head_from_right
    ay = im.height / 2 if name in CENTERED else im.height
    meta["frames"][name] = {"x": x, "y": y, "w": im.width, "h": im.height, "ax": round(ax, 1), "ay": round(ay, 1)}
    x += im.width + PAD; row_h = max(row_h, im.height)
atlas = Image.new("RGBA", (W, y + row_h))
for name, im, px, py in placed: atlas.paste(im, (px, py))
atlas.save(os.path.join(ROOT, "assets/gfx/worm_atlas.png"), optimize=True)
json.dump(meta, open(os.path.join(ROOT, "assets/gfx/worm_atlas.json"), "w"), indent=1)
print("atlas", atlas.size, f"{os.path.getsize(os.path.join(ROOT, 'assets/gfx/worm_atlas.png')) // 1024} KB", len(frames), "frames")
