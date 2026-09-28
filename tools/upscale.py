#!/usr/bin/env python3
"""Tiled 4x Real-ESRGAN (anime/illustration model) on CPU via onnxruntime.
usage: upscale.py in.png out.png [max_width]"""
import sys, numpy as np, onnxruntime as ort
from PIL import Image
MODEL = "/home/sprite/tools/models/esrgan_anime.onnx"
src, dst = sys.argv[1], sys.argv[2]
maxw = int(sys.argv[3]) if len(sys.argv) > 3 else 0
sess = ort.InferenceSession(MODEL, providers=["CPUExecutionProvider"])
inp = sess.get_inputs()[0].name
img = np.asarray(Image.open(src).convert("RGB"), dtype=np.float32) / 255.0
H, W, _ = img.shape
T, P, S = 192, 12, 4
out = np.zeros((H * S, W * S, 3), np.float32)
for y in range(0, H, T):
    for x in range(0, W, T):
        y0, x0 = max(0, y - P), max(0, x - P)
        y1, x1 = min(H, y + T + P), min(W, x + T + P)
        tile = img[y0:y1, x0:x1].transpose(2, 0, 1)[None]
        r = sess.run(None, {inp: tile})[0][0].transpose(1, 2, 0)
        oy, ox = (y - y0) * S, (x - x0) * S
        th, tw = min(T, H - y) * S, min(T, W - x) * S
        out[y * S:y * S + th, x * S:x * S + tw] = r[oy:oy + th, ox:ox + tw]
    print(f"row {y}/{H}", flush=True)
im = Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8))
if maxw and im.width > maxw: im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
im.save(dst)
print("saved", dst, im.size)
