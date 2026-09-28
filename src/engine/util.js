// ===== small maths / helper library =====
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp  = (a, b, t) => a + (b - a) * t;
export const rand  = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick  = arr => arr[Math.floor(Math.random() * arr.length)];
export const dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
export const dist  = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
export const sign  = v => v < 0 ? -1 : v > 0 ? 1 : 0;

/** Smallest signed difference between two angles. */
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Deterministic value noise — seeded so a map can be reproduced. */
export class Noise {
  constructor(seed = Date.now()) {
    this.seed = seed >>> 0;
    this.p = new Uint8Array(512);
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;
    // Fisher-Yates driven by the seeded RNG so the permutation is reproducible.
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
  }
  /** xorshift32 — returns [0,1) */
  next() {
    let x = this.seed;
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;  x >>>= 0;
    this.seed = x;
    return x / 4294967296;
  }
  range(a, b) { return a + this.next() * (b - a); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }

  grad(h, x) { return (h & 1) ? -x : x; }
  /** 1-D value/gradient noise in [-1,1] */
  n1(x) {
    const xi = Math.floor(x) & 255, xf = x - Math.floor(x);
    const u = xf * xf * (3 - 2 * xf);
    return lerp(this.grad(this.p[xi], xf), this.grad(this.p[xi + 1], xf - 1), u) * 2;
  }
  /** 2-D value noise in [-1,1] */
  n2(x, y) {
    const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const aa = this.p[this.p[xi] + yi], ab = this.p[this.p[xi] + yi + 1];
    const ba = this.p[this.p[xi + 1] + yi], bb = this.p[this.p[xi + 1] + yi + 1];
    const x1 = lerp(this.grad(aa, xf), this.grad(ba, xf - 1), u);
    const x2 = lerp(this.grad(ab, xf), this.grad(bb, xf - 1), u);
    return lerp(x1, x2, v) * 1.6;
  }
  /** Fractal sum of `oct` octaves. */
  fbm1(x, oct = 4, lac = 2, gain = 0.5) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += this.n1(x * freq) * amp; norm += amp;
      freq *= lac; amp *= gain;
    }
    return sum / norm;
  }
  fbm2(x, y, oct = 4, lac = 2, gain = 0.5) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += this.n2(x * freq, y * freq) * amp; norm += amp;
      freq *= lac; amp *= gain;
    }
    return sum / norm;
  }
}

/** Ease helpers for UI/camera work. */
export const ease = {
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inOutCubic: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outBack: t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  outElastic: t => t === 0 ? 0 : t === 1 ? 1
    : Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * (TAU / 3)) + 1,
};

/** Format seconds as M:SS (or just SS below a minute). */
export function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  if (s < 60) return String(s);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Wait helper for cut-scene style sequencing. */
export const wait = ms => new Promise(r => setTimeout(r, ms));
