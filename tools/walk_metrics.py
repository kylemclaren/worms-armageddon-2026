#!/usr/bin/env python3
"""Metrics + plots for a walktest recording.  usage: walk_metrics.py rec.json out.png"""
import json, math, sys
from PIL import Image, ImageDraw
rec = json.load(open(sys.argv[1]))
SEGS = [(80, 300, 'flat'), (300, 500, 'up15'), (600, 760, 'up30'), (840, 940, 'up45'), (1000, 1060, 'up60'),
        (1140, 1300, 'down30'), (1360, 1460, 'down50'), (1520, 1600, 'down65'), (1610, 1900, 'bumpy'),
        (1900, 2000, 'stairs-up'), (2000, 2100, 'stairs-down'), (2120, 2140, 'ledge10'), (2160, 2300, 'hills'),
        (2300, 2350, 'dip'), (2350, 2450, 'flat-end')]
ground = [r for r in rec if r['st'] == 'idle']
print(f"{'segment':12s} {'time':>5s} {'speed':>6s} {'jitter':>6s} {'maxJ':>5s} {'tiltErr':>7s} {'air%':>5s} frames")
for x0, x1, name in SEGS:
    rs = [r for r in rec if x0 <= r['x'] < x1]
    if len(rs) < 3: print(f"{name:12s}   (not reached / skipped)"); continue
    t = rs[-1]['t'] - rs[0]['t']
    speed = (rs[-1]['x'] - rs[0]['x']) / max(t, 1e-3)
    ys = [r.get('hy', r['ry']) for r in rs]
    acc = [abs(ys[i + 1] - 2 * ys[i] + ys[i - 1]) for i in range(1, len(ys) - 1)]   # render-y 2nd difference per tick
    jit = sum(acc) / len(acc) if acc else 0
    # terrain slope under the worm vs sprite tilt
    errs = []
    for r in rs:
        a, c = r.get('surfL'), r.get('surfR')
    air = sum(1 for r in rs if r['st'] != 'idle') / len(rs) * 100
    frames = {}
    for r in rs: frames[r['f']] = frames.get(r['f'], 0) + 1
    top = ','.join(k for k, _ in sorted(frames.items(), key=lambda kv: -kv[1])[:3])
    print(f"{name:12s} {t:5.2f} {speed:6.1f} {jit:6.3f} {max(acc) if acc else 0:5.2f} {'':>7s} {air:5.0f} {top}")
stuck = 0
for i in range(30, len(rec)):
    if rec[i]['x'] - rec[i - 30]['x'] < 1 and rec[i]['st'] == 'idle': stuck += 1
print('ticks stuck (no progress over 0.5s):', stuck, '| total time', rec[-1]['t'] - rec[0]['t'], '| final x', rec[-1]['x'])
# plot: path over the terrain profile, plus tilt trace
W, H = 1800, 700
img = Image.new('RGB', (W, H), (250, 250, 250)); d = ImageDraw.Draw(img)
xs = [r['x'] for r in rec]; x_min, x_max = 60, 2520
ymin = min(r['ry'] for r in rec) - 30; ymax = max(r['ry'] for r in rec) + 30
X = lambda x: (x - x_min) / (x_max - x_min) * (W - 20) + 10
Y = lambda y: (y - ymin) / (ymax - ymin) * (H * 0.62 - 20) + 10
surf = [(r['x'], r['surf']) for r in rec if r['surf'] and r['surf'] < 2000]
d.line([(X(x), Y(s)) for x, s in surf], fill=(120, 90, 60), width=2)
col = {'idle': (40, 140, 60), 'air': (220, 60, 40)}
for i in range(1, len(rec)):
    a, b = rec[i - 1], rec[i]
    d.line([(X(a['x']), Y(a['ry'] - 22)), (X(b['x']), Y(b['ry'] - 22))], fill=col.get(b['st'], (60, 60, 200)), width=2)
for x0, x1, name in SEGS:
    d.line([(X(x0), 0), (X(x0), H * 0.62)], fill=(220, 220, 220)); d.text((X(x0) + 2, 4), name, fill=(90, 90, 90))
# tilt (deg) band
base = H * 0.82
d.line([(10, base), (W - 10, base)], fill=(200, 200, 200))
d.line([(X(r['x']), base - r['tilt'] * 180 / math.pi * 3) for r in rec], fill=(60, 60, 200), width=2)
d.text((12, base - 60), 'tilt deg x3 (blue)', fill=(60, 60, 200))
img.save(sys.argv[2])
