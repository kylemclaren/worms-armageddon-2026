#!/usr/bin/env python3
"""Key out the white card behind generated sprites, trim, downscale, and write
web-sized files to assets/gfx. Textures become mirrored seamless tiles."""
import os, sys
from collections import deque
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = [os.path.join(ROOT, "assets/img"), os.path.join(ROOT, "assets/raw"), os.path.join(ROOT, "assets/raw2"), os.path.join(ROOT, "assets/raw6"), os.path.join(ROOT, "assets/raw8"), os.path.join(ROOT, "assets/raw9")]
OUT = os.path.join(ROOT, "assets/gfx")
os.makedirs(OUT, exist_ok=True)

def key_white(im, thresh=228, holes=False):
    a = np.array(im.convert("RGBA"))
    h, w = a.shape[:2]
    # detect the card colour from the corners: most renders are on white, a few on black
    corners = np.concatenate([a[:8, :8, :3].reshape(-1, 3), a[:8, -8:, :3].reshape(-1, 3), a[-8:, :8, :3].reshape(-1, 3), a[-8:, -8:, :3].reshape(-1, 3)])
    dark = corners.mean() < 60
    if dark:
        pale = (a[:, :, 0] <= 26) & (a[:, :, 1] <= 26) & (a[:, :, 2] <= 26)
    else:
        pale = (a[:, :, 0] >= thresh) & (a[:, :, 1] >= thresh) & (a[:, :, 2] >= thresh)
    seen = np.zeros((h, w), bool)
    if holes and not dark:  # also drop enclosed near-white gaps (tree canopy); never for white subjects
        seen |= (a[:, :, 0] >= 243) & (a[:, :, 1] >= 243) & (a[:, :, 2] >= 243)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if pale[y, x] and not seen[y, x]: seen[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if pale[y, x] and not seen[y, x]: seen[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y-1, x), (y+1, x), (y, x-1), (y, x+1)):
            if 0 <= ny < h and 0 <= nx < w and pale[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True; q.append((ny, nx))
    alpha = a[:, :, 3].astype(np.float32)
    alpha[seen] = 0
    # soften the fringe: pale pixels touching the removed card lose alpha by brightness
    nb = np.zeros((h, w), np.int32)
    nb[1:, :] += seen[:-1, :]; nb[:-1, :] += seen[1:, :]
    nb[:, 1:] += seen[:, :-1]; nb[:, :-1] += seen[:, 1:]
    lum = a[:, :, :3].mean(axis=2)
    fringe = (nb > 0) & (~seen)
    fade = np.clip((70 - lum) / 60, 0, 1) if dark else np.clip((lum - 150) / 105, 0, 1)
    alpha[fringe] *= (1 - fade[fringe] * 0.9)
    a[:, :, 3] = alpha.astype(np.uint8)
    return Image.fromarray(a)

def trim(im, pad=4):
    bb = im.getchannel("A").point(lambda v: 255 if v > 12 else 0).getbbox()
    if not bb: return im
    x0, y0, x1, y1 = bb
    return im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))

def fit(im, m):
    s = m / max(im.size)
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS) if s < 1 else im

def seamless(im, size):
    """Offset-and-crossfade tiling: no mirror seams or chevrons."""
    im = im.convert("RGB")
    m = round(min(im.size) * 0.03)                    # generated textures often have a faint border
    t = np.asarray(im.crop((m, m, im.width - m, im.height - m)).resize((size, size), Image.LANCZOS), dtype=np.float32)
    r = np.roll(np.roll(t, size // 2, 0), size // 2, 1)  # seams of r sit in the middle, edges wrap cleanly
    ax = np.abs(np.linspace(-1, 1, size))
    w1 = np.clip((1 - ax) / 0.35, 0, 1)               # 1 in the middle, 0 at the tile edges
    wm = np.minimum.outer(w1, w1)[..., None]
    out = t * wm + r * (1 - wm)
    return Image.fromarray(out.clip(0, 255).astype(np.uint8))

SPRITE_SIZE = {"logo": 1100, "worm_base": 320, "tombstone": 128, "oildrum": 128,
               "crate_weapon": 128, "crate_health": 128, "crate_utility": 128,
               "prop_tree": 360, "whale": 220, "turtle": 160, "prop_cactus": 300, "prop_palm": 360, "prop_bones": 260, "prop_obelisk": 300, "prop_rock": 300, "prop_crystal": 300, "prop_snowman": 300}

HOLES = {"prop_tree"}

# newest art pass wins: raw9 > raw8 > raw6 > raw2 > raw > img
best = {}
for d in SRC:
    if not os.path.isdir(d): continue
    for f in sorted(os.listdir(d)):
        if f.endswith(".png"): best[f[:-4]] = os.path.join(d, f)
FORCE = "--force" in sys.argv

for name, src in sorted(best.items()):
    if True:
        if name.startswith("tex_"):
            dst = os.path.join(OUT, name + ".jpg")
            if not FORCE and os.path.exists(dst) and os.path.getmtime(dst) > os.path.getmtime(src): continue
            seamless(Image.open(src), 1024).save(dst, quality=86)
        elif name.startswith("sky_"):
            dst = os.path.join(OUT, name + ".jpg")
            if not FORCE and os.path.exists(dst) and os.path.getmtime(dst) > os.path.getmtime(src): continue
            im = Image.open(src).convert("RGB")
            if im.width > 2560: im = im.resize((2560, round(im.height * 2560 / im.width)), Image.LANCZOS)
            im.save(dst, quality=88)
        else:
            dst = os.path.join(OUT, name + ".png")
            if not FORCE and os.path.exists(dst) and os.path.getmtime(dst) > os.path.getmtime(src): continue
            im = Image.open(src).convert("RGBA")
            alpha = np.asarray(im.getchannel("A"))
            if (alpha < 250).mean() < 0.05:        # opaque card behind the subject: key it out
                im = key_white(im, holes=name in HOLES)
            im = trim(im)
            im = fit(im, SPRITE_SIZE.get(name, 128))
            im.save(dst, optimize=True)
        print("wrote", os.path.basename(dst), flush=True)
