#!/usr/bin/env python3
"""Parallax background planes: chroma-key the far/mid layers, soften any painted
sky band along their top edge, and write web-ready WebP files to assets/gfx."""
import os, sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets/raw3_up")
FALLBACK = os.path.join(ROOT, "assets/raw3")
OUT = os.path.join(ROOT, "assets/gfx")


def key_chroma(im):
    a = np.asarray(im.convert("RGB"), dtype=np.float32)
    h, w, _ = a.shape
    key = np.concatenate([a[:6, :6].reshape(-1, 3), a[:6, -6:].reshape(-1, 3)]).mean(axis=0)
    d = np.sqrt(((a - key) ** 2).sum(axis=2))
    alpha = np.clip((d - 70) / 90, 0, 1)                       # soft edge between 70 and 160
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    if key[1] > key[0] and key[1] > key[2]:                    # green screen: pull green spill
        g[:] = np.minimum(g, np.maximum(r, b) * 1.05)
    else:                                                      # magenta: pull red+blue spill
        m = np.minimum(r, b)
        spill = np.clip(m - g, 0, None) * 0.6 * (1 - alpha)
        r -= spill; b -= spill
    # fade a hard, flat top edge (model painted its own sky strip behind the subject)
    solid = alpha > 0.5
    tops = np.where(solid.any(axis=0), solid.argmax(axis=0), h)
    valid = tops[tops < h]
    if len(valid) and np.std(valid) < 0.03 * h:
        y0 = int(np.percentile(valid, 50))
        span = int(h * 0.14)
        ramp = np.clip((np.arange(h) - y0) / span, 0, 1)[:, None]
        alpha *= ramp
    out = np.dstack([np.clip(a, 0, 255), alpha * 255]).astype(np.uint8)
    img = Image.fromarray(out, "RGBA")
    bb = img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if bb:  # crop empty space above; layers are bottom-anchored
        img = img.crop((0, max(0, bb[1] - 4), img.width, img.height))
    return img


# Atmospheric perspective: distant planes lean toward the sky colour, soften and dim,
# so the playable terrain always reads as the sharpest, most saturated thing on screen.
HAZE = {"grass": (255, 186, 150), "mars": (110, 86, 170), "snow": (140, 170, 225)}
# Depth of field: everything behind the play area is softly out of focus, so the
# eye stays on the (sharp) terrain and worms. Blur radii are at the 3072px source.
DEPTH = {"far": dict(mix=0.42, blur=4.2, bright=0.92), "mid": dict(mix=0.26, blur=2.8, bright=0.8)}
SKY_BLUR, SKY_CALM = 3.0, 0.12   # sky: gentle blur + pull 12% toward mid-grey to lower contrast


def atmos(img, t, layer):
    p = DEPTH[layer]
    a = np.asarray(img, dtype=np.float32)
    rgb, al = a[..., :3], a[..., 3:]
    lum = rgb.mean(axis=2, keepdims=True)
    rgb = rgb * 0.8 + lum * 0.2                                 # a touch less saturated
    rgb = rgb * (1 - p["mix"]) + np.array(HAZE[t], np.float32) * p["mix"]
    rgb *= p["bright"]
    out = Image.fromarray(np.dstack([rgb.clip(0, 255), al]).astype(np.uint8), "RGBA")
    return out.filter(ImageFilter.GaussianBlur(p["blur"]))


for t in ("grass", "mars", "snow"):
    for layer in ("sky", "far", "mid"):
        name = f"bg_{t}_{layer}"
        src = os.path.join(SRC, name + ".png")
        if not os.path.exists(src):
            src = os.path.join(FALLBACK, name + ".png")
            print("(not upscaled yet)", name)
        im = Image.open(src)
        if im.width > 3072:
            im = im.resize((3072, round(im.height * 3072 / im.width)), Image.LANCZOS)
        dst = os.path.join(OUT, name + ".webp")
        if layer == "sky":
            sky = im.convert("RGB").filter(ImageFilter.GaussianBlur(SKY_BLUR))
            arr = np.asarray(sky, dtype=np.float32)
            arr = arr * (1 - SKY_CALM) + arr.mean(axis=(0, 1), keepdims=True) * SKY_CALM
            Image.fromarray(arr.clip(0, 255).astype(np.uint8)).save(dst, quality=84, method=6)
        else:
            atmos(key_chroma(im), t, layer).save(dst, quality=86, method=6)
        print("wrote", os.path.basename(dst), Image.open(dst).size, f"{os.path.getsize(dst) // 1024} KB", flush=True)
