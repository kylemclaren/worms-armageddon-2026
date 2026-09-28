// ===== destructible bitmap terrain =====
// The land is a 1-byte-per-pixel solidity mask plus a painted canvas that mirrors it.
// Everything that touches the ground (worms, grenades, rope) queries the mask; the
// canvas is purely what the player sees.

import { Noise, clamp, lerp, TAU } from './util.js';
import { images } from './assets.js';

export const THEMES = {
  grass: {
    name: 'Rolling Hills', tex: 'tex_grass', sky: 'bg_grass_sky', far: 'bg_grass_far', mid: 'bg_grass_mid',
    sun: { x: 0.52, y: 0.85, r: 0.22, col: '255,200,120', rays: true }, grad: ['#3b2a6b', '#d9735c', '#ffc98a'],
    top: [98, 196, 58], topDark: [44, 122, 36], char: '#2a1a0c',
    water: ['#48c6d8', '#1f7fb4', '#0e3663'], foam: '#e8fbff',
    props: ['prop_tree', 'prop_tree', 'prop_rock'], flake: 'leaf', haze: '255,170,120',
    ridges: [[118, 92, 150], [70, 96, 96]],
  },
  mars: {
    name: 'Red Planet', tex: 'tex_mars', sky: 'bg_mars_sky', far: 'bg_mars_far', mid: 'bg_mars_mid', stars: 28, grad: ['#0b0a24', '#3a2360', '#6b4a8a'],
    top: [214, 120, 255], topDark: [120, 50, 160], char: '#2a0f08',
    water: ['#5ed6c0', '#1f7f82', '#0b3a46'], foam: '#d8fff6',
    props: ['prop_crystal', 'prop_crystal', 'prop_rock'], flake: 'dust', haze: '120,255,210',
    ridges: [[64, 52, 120], [40, 70, 92]],
  },
  snow: {
    name: 'Frozen Wastes', tex: 'tex_snow', sky: 'bg_snow_sky', far: 'bg_snow_far', mid: 'bg_snow_mid', stars: 24, grad: ['#071430', '#1d3a6b', '#6f93c9'],
    sun: { x: 0.815, y: 0.16, r: 0.07, col: '200,225,255' },
    top: [248, 252, 255], topDark: [170, 200, 230], char: '#23344a',
    water: ['#86d8f2', '#3a92c8', '#153d6c'], foam: '#ffffff',
    props: ['prop_snowman', 'prop_rock', 'prop_snowman'], flake: 'snow', haze: '200,230,255',
    ridges: [[150, 180, 215], [110, 145, 190]],
  },
};

export class Terrain {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.mask = new Uint8Array(w * h);
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
    this.version = 0; // bumped on every edit so the AI knows its cached sims are stale
  }

  solid(x, y) {
    x |= 0; y |= 0;
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return false;
    return this.mask[y * this.w + x] !== 0;
  }

  /** Any solid pixel inside a circle (sampled — fine for small radii). */
  hitCircle(x, y, r) {
    if (this.solid(x, y)) return true;
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12;
      if (this.solid(x + Math.cos(a) * r, y + Math.sin(a) * r)) return true;
    }
    if (r > 6) for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8 + 0.3;
      if (this.solid(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55)) return true;
    }
    return false;
  }

  /** Surface normal at a circle's contact, pointing out of the ground. */
  normalAt(x, y, r) {
    let nx = 0, ny = 0;
    const rr = r + 2;
    for (let i = 0; i < 16; i++) {
      const a = i * TAU / 16, cx = Math.cos(a), cy = Math.sin(a);
      if (this.solid(x + cx * rr, y + cy * rr)) { nx -= cx; ny -= cy; }
    }
    const l = Math.hypot(nx, ny);
    if (l < 1e-4) return { x: 0, y: -1 };
    return { x: nx / l, y: ny / l };
  }

  /** March a ray; returns the first solid point or null. */
  ray(x, y, dx, dy, max) {
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    for (let t = 0; t < max; t += 1) {
      const px = x + dx * t, py = y + dy * t;
      if (this.solid(px, py)) return { x: px, y: py, t };
    }
    return null;
  }

  /** Top-most free spot a circle of radius r can stand on at column x, or null. */
  standY(x, r, fromY = 0, waterY = this.h) {
    for (let y = Math.max(fromY, r + 2); y < waterY - r; y++) {
      if (this.solid(x, y + r + 1) && !this.hitCircle(x, y, r)) return y;
    }
    return null;
  }

  // ------------------------------------------------------------------ edits

  /** Blow a hole. Returns number of pixels removed (drives debris count). */
  carve(cx, cy, r, charred = true) {
    const { w, h, mask } = this;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
    const r2 = r * r;
    let n = 0;
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy, row = y * w;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        if (dx * dx + dy * dy <= r2 && mask[row + x]) { mask[row + x] = 0; n++; }
      }
    }
    if (!n) return 0;
    const c = this.ctx;
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill();
    if (charred) {
      // Scorched rim, painted only where land survives.
      c.globalCompositeOperation = 'source-atop';
      c.strokeStyle = this.theme.char;
      c.globalAlpha = 0.85;
      c.lineWidth = 5;
      c.beginPath(); c.arc(cx, cy, r + 2.5, 0, TAU); c.stroke();
      c.globalAlpha = 0.35;
      c.lineWidth = 8;
      c.beginPath(); c.arc(cx, cy, r + 6, 0, TAU); c.stroke();
    }
    c.restore();
    this.version++;
    return n;
  }

  /** Stamp a steel girder (solid, destructible) centred on (cx,cy). */
  addGirder(cx, cy, ang, len = 72, thick = 10) {
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const hl = len / 2, ht = thick / 2;
    const ext = Math.ceil(hl + ht);
    for (let y = -ext; y <= ext; y++) for (let x = -ext; x <= ext; x++) {
      const u = x * cos + y * sin, v = -x * sin + y * cos;
      if (Math.abs(u) <= hl && Math.abs(v) <= ht) {
        const px = Math.round(cx + x), py = Math.round(cy + y);
        if (px >= 0 && py >= 0 && px < this.w && py < this.h) this.mask[py * this.w + px] = 2;
      }
    }
    drawGirder(this.ctx, cx, cy, ang, len, thick);
    this.version++;
  }

  girderOverlaps(cx, cy, ang, len = 72, thick = 10) {
    const cos = Math.cos(ang), sin = Math.sin(ang);
    for (let u = -len / 2; u <= len / 2; u += 3) for (let v = -thick / 2; v <= thick / 2; v += 3) {
      if (this.solid(cx + u * cos - v * sin, cy + u * sin + v * cos)) return true;
    }
    return false;
  }

  // -------------------------------------------------------------- generation

  generate(themeKey, seed, style = 'island') {
    const theme = THEMES[themeKey];
    this.theme = theme;
    const N = new Noise(seed);
    const { w, h, mask } = this;
    const S = 4; // density grid step; bilinear upsampled
    const gw = Math.ceil(w / S) + 2, gh = Math.ceil(h / S) + 2;
    const grid = new Float32Array(gw * gh);

    const base = h * N.range(0.4, 0.5);
    const amp = h * N.range(0.14, 0.22);
    const caveAmt = N.range(0.6, 1.0);
    const edge = N.range(330, 430);
    // Valleys that run all the way down to the sea split the land into islands.
    const dips = [];
    const nd = style === 'islands' ? N.int(1, 2) : N.chance(0.45) ? 1 : 0;
    for (let i = 0; i < nd; i++) dips.push({ x: w * (nd === 1 ? N.range(0.4, 0.6) : (i ? N.range(0.6, 0.72) : N.range(0.28, 0.4))), wd: N.range(110, 190) });
    const surfAt = x => {
      let sf = base + N.fbm1(x / 520 + 11.3, 4) * amp + N.fbm1(x / 110 + 3.1, 3) * 26;
      const ex = Math.min(x, w - x);
      if (ex < edge) sf += Math.pow(1 - ex / edge, 1.7) * (h - base + 260);   // sloping coastline
      for (const dp of dips) {
        const q = Math.abs(x - dp.x) / dp.wd;
        if (q < 1) sf += Math.pow(1 - q * q, 1.4) * (h - base + 120);
      }
      return sf;
    };
    const surfCache = new Float32Array(gw);
    for (let gx = 0; gx < gw; gx++) surfCache[gx] = surfAt(gx * S);

    for (let gy = 0; gy < gh; gy++) {
      const y = gy * S;
      for (let gx = 0; gx < gw; gx++) {
        const x = gx * S;
        const surf = surfCache[gx];
        // solidity saturates with depth so caves can still open up far below
        let d = Math.min((y - surf) / 90, 1.5);
        d += N.fbm2(x / 190 + 5, y / 150 + 9, 4) * 0.95;
        const below = y - surf;
        if (below > 45) {
          const tun = Math.abs(N.fbm2(x / 150 + 40, y / 60 + 70, 3));      // long thin tunnels
          d -= Math.max(0, 0.1 - tun) * 16 * caveAmt;
          const cav = N.fbm2(x / 170 + 99, y / 125 + 33, 3);                // round caverns
          d -= Math.max(0, cav - 0.12) * 11 * caveAmt * Math.min(1, (below - 45) / 80);
        }
        grid[gy * gw + gx] = d;
      }
    }
    for (let y = 0; y < h; y++) {
      const fy = y / S, gy = fy | 0, ty = fy - gy;
      for (let x = 0; x < w; x++) {
        const fx = x / S, gx = fx | 0, tx = fx - gx;
        const i = gy * gw + gx;
        const v = lerp(lerp(grid[i], grid[i + 1], tx), lerp(grid[i + gw], grid[i + gw + 1], tx), ty);
        mask[y * w + x] = v > 0 ? 1 : 0;
      }
    }
    this._removeSpecks(900);
    this._fillPockets(350);
    this._paint(theme);
    this._props(theme, N);
    this.bakeShadow();
    this.version++;
  }

  /**
   * Deterministic movement test course (?testmap): every slope class a worm meets,
   * left to right, so walking can be measured and compared between iterations.
   */
  generateTest(themeKey) {
    const theme = THEMES[themeKey];
    this.theme = theme;
    const { w, h, mask } = this;
    const surf = new Float32Array(w).fill(h + 10);           // no land by default
    let y = 800;
    const seg = (x0, x1, fn) => { for (let x = x0; x < x1; x++) surf[x] = fn(x - x0, x1 - x0); };
    const slope = deg => Math.tan(deg * Math.PI / 180);
    const ramp = (x0, x1, deg) => { const y0 = y; seg(x0, x1, dx => y0 - dx * slope(deg)); y = y0 - (x1 - x0) * slope(deg); };
    const flat = (x0, x1) => { const y0 = y; seg(x0, x1, () => y0); };
    flat(80, 300);
    ramp(300, 500, 15); flat(500, 600);
    ramp(600, 760, 30); flat(760, 840);
    ramp(840, 940, 45); flat(940, 1000);
    ramp(1000, 1060, 60); flat(1060, 1140);
    ramp(1140, 1300, -30); flat(1300, 1360);
    ramp(1360, 1460, -50); flat(1460, 1520);
    ramp(1520, 1600, -65); flat(1600, 1610);
    { const y0 = y; seg(1610, 1900, dx => y0 - (Math.sin(dx * 0.35) * 2.5 + Math.sin(dx * 0.11 + 1) * 3 + (dx % 37 < 5 ? 4 : 0))); }
    { const y0 = y; seg(1900, 2000, dx => y0 - Math.floor(dx / 12) * 3); y = y0 - Math.floor(99 / 12) * 3; }
    { const y0 = y; seg(2000, 2100, dx => y0 + Math.floor(dx / 20) * 6); y = y0 + Math.floor(99 / 20) * 6; }
    { const y0 = y; seg(2100, 2130, () => y0); seg(2130, 2160, () => y0 - 10); y = y0 - 10; }
    { const y0 = y; seg(2160, 2300, dx => y0 - Math.sin(dx / 140 * Math.PI * 2) * 25); }
    { const y0 = y; seg(2300, 2350, dx => y0 + 22 * (1 - Math.abs(dx - 25) / 25)); }
    flat(2350, 2450); ramp(2450, 2480, 80); flat(2480, 2520);
    this.testSurf = surf;
    for (let x = 0; x < w; x++) for (let yy = Math.max(0, Math.ceil(surf[x])); yy < h; yy++) mask[yy * w + x] = 1;
    this._paint(theme);
    this.bakeShadow();
    this.version++;
  }

  /** Drop disconnected fragments too small to stand on. */
  _removeSpecks(minSize) {
    const { w, h, mask } = this;
    const label = new Int32Array(w * h);
    const stack = new Int32Array(w * h);
    let id = 0;
    for (let p = 0; p < w * h; p++) {
      if (!mask[p] || label[p]) continue;
      id++;
      let sp = 0, count = 0;
      stack[sp++] = p; label[p] = id;
      const members = [];
      while (sp) {
        const q = stack[--sp];
        count++;
        if (count <= minSize) members.push(q);
        const x = q % w;
        if (x > 0 && mask[q - 1] && !label[q - 1]) { label[q - 1] = id; stack[sp++] = q - 1; }
        if (x < w - 1 && mask[q + 1] && !label[q + 1]) { label[q + 1] = id; stack[sp++] = q + 1; }
        if (q >= w && mask[q - w] && !label[q - w]) { label[q - w] = id; stack[sp++] = q - w; }
        if (q < w * (h - 1) && mask[q + w] && !label[q + w]) { label[q + w] = id; stack[sp++] = q + w; }
      }
      if (count < minSize) for (const q of members) mask[q] = 0;
    }
  }

  /** Fill enclosed air bubbles too small to be a real cave. */
  _fillPockets(maxSize) {
    const { w, h, mask } = this;
    const seen = new Uint8Array(w * h);
    const stack = new Int32Array(w * h);
    for (let p = 0; p < w * h; p++) {
      if (mask[p] || seen[p]) continue;
      let sp = 0, count = 0, open = false;
      const members = [];
      stack[sp++] = p; seen[p] = 1;
      while (sp) {
        const q = stack[--sp];
        count++;
        if (count <= maxSize) members.push(q);
        const x = q % w, y = (q / w) | 0;
        if (x === 0 || x === w - 1 || y === 0 || y === h - 1) open = true;
        if (x > 0 && !mask[q - 1] && !seen[q - 1]) { seen[q - 1] = 1; stack[sp++] = q - 1; }
        if (x < w - 1 && !mask[q + 1] && !seen[q + 1]) { seen[q + 1] = 1; stack[sp++] = q + 1; }
        if (y > 0 && !mask[q - w] && !seen[q - w]) { seen[q - w] = 1; stack[sp++] = q - w; }
        if (y < h - 1 && !mask[q + w] && !seen[q + w]) { seen[q + w] = 1; stack[sp++] = q + w; }
      }
      if (!open && count < maxSize) for (const q of members) mask[q] = 1;
    }
  }

  _paint(theme) {
    const { w, h, mask, ctx } = this;
    const tex = images[theme.tex];
    if (tex) {
      ctx.fillStyle = ctx.createPattern(tex, 'repeat');
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = '#7a5230'; ctx.fillRect(0, 0, w, h);
    }
    const id = ctx.getImageData(0, 0, w, h);
    const d = id.data;
    const [tr, tg, tb] = theme.top, [dr, dg, db] = theme.topDark;
    for (let x = 0; x < w; x++) {
      let depth = 0;       // solid pixels since the last air gap above
      let wob = 0, top = -1;
      for (let y = 0; y < h; y++) {
        const p = y * w + x, i = p << 2;
        if (!mask[p]) { d[i + 3] = 0; depth = 0; continue; }
        if (depth === 0) wob = ((Math.sin(x * 0.37) + Math.sin(x * 0.13 + 1.7)) * 1.6) | 0;
        if (top < 0) top = y;
        depth++;
        const topBand = 7 + wob;
        if (depth <= topBand) {
          // grass / snow / crystal crust
          const t = depth / topBand;
          const hl = depth <= 2 ? 1.15 : 1;
          d[i] = Math.min(255, lerp(tr, dr, t * t) * hl);
          d[i + 1] = Math.min(255, lerp(tg, dg, t * t) * hl);
          d[i + 2] = Math.min(255, lerp(tb, db, t * t) * hl);
        } else if (depth <= topBand + 3) {
          d[i] *= 0.45; d[i + 1] *= 0.45; d[i + 2] *= 0.45;
        } else {
          // shade by depth below the column's surface, not below the nearest cave,
          // so tunnels don't leave bright vertical bands under them
          let shade = 1 - Math.min(y - top, 420) / 420 * 0.42;
          // bevel: light from the upper-left, occlusion toward lower-right edges
          const air = (dx, dy) => { const X = x + dx, Y = y + dy; return X < 0 || X >= w || Y < 0 || Y >= h || !mask[Y * w + X]; };
          if (air(-2, -3)) shade *= 1.28; else if (air(-4, -7)) shade *= 1.12;
          if (air(2, 3)) shade *= 0.62; else if (air(5, 7)) shade *= 0.8; else if (air(8, 12)) shade *= 0.92;
          d[i] = Math.min(255, d[i] * shade); d[i + 1] = Math.min(255, d[i + 1] * shade); d[i + 2] = Math.min(255, d[i + 2] * shade);
        }
        // dark lip under overhangs
        if (y + 1 < h && !mask[p + w]) { d[i] *= 0.5; d[i + 1] *= 0.5; d[i + 2] *= 0.5; }
        else if (y + 2 < h && !mask[p + 2 * w]) { d[i] *= 0.72; d[i + 1] *= 0.72; d[i + 2] *= 0.72; }
        // side edges
        if ((x > 0 && !mask[p - 1]) || (x < w - 1 && !mask[p + 1])) {
          d[i] *= 0.62; d[i + 1] *= 0.62; d[i + 2] *= 0.62;
        }
      }
    }
    ctx.putImageData(id, 0, 0);
    this._dress(theme);
  }

  /** Soft shadow the land casts on the backdrop, baked once behind the terrain pixels. */
  bakeShadow() {
    const { w, h, ctx } = this;
    const s = document.createElement('canvas');
    s.width = Math.ceil(w / 10); s.height = Math.ceil(h / 10);   // tiny + bilinear upscale = free blur
    const sc = s.getContext('2d');
    sc.drawImage(this.canvas, 0, 0, s.width, s.height);
    sc.globalCompositeOperation = 'source-in';
    sc.fillStyle = '#000'; sc.fillRect(0, 0, s.width, s.height);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.globalAlpha = 0.3;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(s, 9, 12, w, h);
    ctx.restore();
  }

  /** Surface dressing painted on top (not solid): grass blades, snow drifts, crystal glints. */
  _dress(theme) {
    const { w, h, mask, ctx } = this;
    const N = new Noise(1234);
    const [r, g, b] = theme.top, [r2, g2, b2] = theme.topDark;
    ctx.save();
    ctx.lineCap = 'round';
    for (let x = 1; x < w - 1; x += 2) {
      for (let y = 1; y < h - 1; y++) {
        const p = y * w + x;
        if (!mask[p] || mask[p - w]) continue;
        if (theme.flake === 'leaf') {
          const n = 1 + (N.next() * 2 | 0);
          for (let k = 0; k < n; k++) {
            const bh = 3 + N.next() * 6, lean = (N.next() - 0.5) * 5;
            const t = N.next();
            ctx.strokeStyle = `rgb(${lerp(r2, r, t) * 1.08 | 0},${lerp(g2, g, t) * 1.08 | 0},${lerp(b2, b, t) | 0})`;
            ctx.lineWidth = 1 + N.next() * 0.8;
            ctx.beginPath(); ctx.moveTo(x + k, y + 1); ctx.quadraticCurveTo(x + k + lean * 0.3, y - bh * 0.6, x + k + lean, y - bh); ctx.stroke();
          }
          if (N.next() < 0.012) { // tiny flowers
            ctx.fillStyle = N.pick(['#ffe45c', '#ff8fb3', '#ffffff', '#b58cff']);
            ctx.beginPath(); ctx.arc(x, y - 6, 1.8, 0, TAU); ctx.fill();
          }
        } else if (theme.flake === 'snow') {
          if (N.next() < 0.5) {
            ctx.fillStyle = `rgba(255,255,255,${0.75 + N.next() * 0.25})`;
            ctx.beginPath(); ctx.ellipse(x, y + 0.5, 2.5 + N.next() * 3, 1.5 + N.next() * 1.8, 0, Math.PI, TAU); ctx.fill();
          }
          if (N.next() < 0.01) { ctx.fillStyle = 'rgba(210,240,255,.95)'; ctx.fillRect(x, y + 3, 1, 5 + N.next() * 7); } // icicle-ish glint
        } else {
          if (N.next() < 0.05) {
            const s = 1.5 + N.next() * 2.5;
            ctx.fillStyle = N.pick(['#ff6bf0', '#7af7ff', '#c49bff']);
            ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 6;
            ctx.beginPath(); ctx.moveTo(x, y - s * 2.2); ctx.lineTo(x + s, y + 1); ctx.lineTo(x - s, y + 1); ctx.closePath(); ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
        y += 6; // one dressing per surface run
      }
    }
    ctx.restore();
  }

  /** Scatter props across the surface and bake them into the mask. */
  _props(theme, N) {
    const count = Math.round(this.w / 260);
    const placed = [];
    for (let k = 0; k < count * 4 && placed.length < count; k++) {
      const x = N.range(160, this.w - 160);
      if (placed.some(px => Math.abs(px - x) < 180)) continue;
      const y = this.standY(x, 2, 0, this.h - 90);
      if (y == null || y < 120) continue;
      const img = images[N.pick(theme.props)];
      if (!img) continue;
      // props should read as scenery, not dwarf the worms
      const scale = N.range(0.17, 0.26) * (img.src?.includes('tree') ? 1.35 : 1);
      const pw = Math.round(img.width * scale), ph = Math.round(img.height * scale);
      const flip = N.chance(0.5);
      const px = Math.round(x - pw / 2), py = Math.round(y + 7 - ph);
      if (py < 10) continue;
      this.stamp(img, px, py, pw, ph, flip);
      placed.push(x);
    }
  }

  stamp(img, px, py, pw, ph, flip = false) {
    const c = document.createElement('canvas');
    c.width = pw; c.height = ph;
    const cx = c.getContext('2d', { willReadFrequently: true });
    if (flip) { cx.translate(pw, 0); cx.scale(-1, 1); }
    cx.drawImage(img, 0, 0, pw, ph);
    const d = cx.getImageData(0, 0, pw, ph).data;
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
      if (d[((y * pw + x) << 2) + 3] > 110) {
        const X = px + x, Y = py + y;
        if (X >= 0 && Y >= 0 && X < this.w && Y < this.h) this.mask[Y * this.w + X] = 1;
      }
    }
    this.ctx.drawImage(c, px, py);
  }
}

/** Riveted steel beam, used for both the terrain stamp and the placement preview. */
export function drawGirder(c, cx, cy, ang, len = 72, thick = 10, alpha = 1) {
  c.save();
  c.globalAlpha = alpha;
  c.translate(cx, cy); c.rotate(ang);
  const g = c.createLinearGradient(0, -thick / 2, 0, thick / 2);
  g.addColorStop(0, '#d98b4a'); g.addColorStop(0.45, '#a8582a'); g.addColorStop(1, '#5a2a10');
  c.fillStyle = g;
  c.fillRect(-len / 2, -thick / 2, len, thick);
  c.strokeStyle = '#2a1206'; c.lineWidth = 1.5;
  c.strokeRect(-len / 2 + 0.75, -thick / 2 + 0.75, len - 1.5, thick - 1.5);
  c.fillStyle = '#3a1a08';
  for (let u = -len / 2 + 6; u < len / 2 - 3; u += 10) {
    c.beginPath(); c.arc(u, 0, 1.6, 0, TAU); c.fill();
  }
  c.restore();
}
