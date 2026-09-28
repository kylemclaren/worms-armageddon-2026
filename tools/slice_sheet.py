#!/usr/bin/env python3
"""Cut a generated sprite sheet into frames.
Works with transparent sheets (preferred: OpenAI background=transparent) and with
painted backdrops: region-grow from the image border across smooth background
gradients, stopping at the character's hard dark outline.
usage: slice_sheet.py sheet.png out_prefix rows cols"""
import sys
from collections import deque
import numpy as np
from PIL import Image

src, prefix, rows, cols = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
im = Image.open(src).convert("RGBA")
a = np.asarray(im).astype(np.int16)
H, W = a.shape[:2]

if a[..., 3].min() < 250:            # already transparent
    alpha = a[..., 3].astype(np.float32) / 255
else:
    rgb = a[..., :3]
    bg = np.zeros((H, W), bool)
    q = deque()
    for x in range(W):
        for y in (0, H - 1): bg[y, x] = True; q.append((y, x))
    for y in range(H):
        for x in (0, W - 1): bg[y, x] = True; q.append((y, x))
    lum = rgb.mean(axis=2)
    while q:
        y, x = q.popleft()
        c = rgb[y, x]
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < H and 0 <= nx < W and not bg[ny, nx]:
                d = np.abs(rgb[ny, nx] - c).sum()
                # background drifts smoothly; the outline is a sharp step to dark
                if d < 26 and not (lum[ny, nx] < 70 and lum[y, x] - lum[ny, nx] > 12):
                    bg[ny, nx] = True; q.append((ny, nx))
    alpha = (~bg).astype(np.float32)
    # 1px erode + soften to lose the halo fringe
    from PIL import ImageFilter
    m = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    alpha = np.asarray(m).astype(np.float32) / 255

out = np.dstack([a[..., :3], (alpha * 255)]).astype(np.uint8)
full = Image.fromarray(out, "RGBA")
# Find each character as a connected blob (grid cells clip tall poses), then order
# blobs into the rows x cols reading order by their centroids.
from scipy import ndimage
lab, n = ndimage.label(alpha > 0.15)
sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
objs = ndimage.find_objects(lab)
blobs = []
for i in range(1, n + 1):
    if sizes[i - 1] < 25: continue                       # dust
    sl = objs[i - 1]; y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
    cy, cx = ndimage.center_of_mass(lab == i)
    blobs.append(dict(i=i, size=sizes[i - 1], cy=cy, cx=cx, box=[x0, y0, x1, y1]))
blobs.sort(key=lambda b: -b["size"])
big, small = blobs[: rows * cols], blobs[rows * cols:]
# Detached details (eyebrows, dizzy stars, motion lines) join the nearest character.
members = {b["i"]: [b["i"]] for b in big}
for sm in small:
    def gap(b):
        x0, y0, x1, y1 = b["box"]
        dx = max(x0 - sm["cx"], 0, sm["cx"] - x1); dy = max(y0 - sm["cy"], 0, sm["cy"] - y1)
        return (dx * dx + dy * dy) ** 0.5
    host = min(big, key=gap)
    if gap(host) < min(H / rows, W / cols) * 0.35:
        members[host["i"]].append(sm["i"])
        hb, sb = host["box"], sm["box"]
        host["box"] = [min(hb[0], sb[0]), min(hb[1], sb[1]), max(hb[2], sb[2]), max(hb[3], sb[3])]
frames = []
for b in big:
    r = min(rows - 1, int(b["cy"] / (H / rows))); c = min(cols - 1, int(b["cx"] / (W / cols)))
    mask = np.isin(lab, members[b["i"]])
    x0, y0, x1, y1 = b["box"]
    fr = out.copy(); fr[..., 3] = (fr[..., 3] * mask).astype(np.uint8)
    frames.append((r, c, Image.fromarray(fr[y0:y1, x0:x1], "RGBA")))
for r, c, f in sorted(frames, key=lambda t: (t[0], t[1])):
    f.save(f"{prefix}_{r}{c}.png")
    print(f"{prefix}_{r}{c}.png", f.size)
