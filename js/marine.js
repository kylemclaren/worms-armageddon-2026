// ===== marine life: ambient creatures in the sea =====
// Drawn in front of the submerged rock but under the front water layer, so the sea tints
// them. Fish now and then leap out; everything scatters from blasts.
import { images } from './assets.js';
import { rand, pick, clamp, TAU } from './util.js';
import { crispImage } from './wormsprite.js';
import { sound } from './audio.js';

const CAST = {
  grass: [['fish_orange', 4], ['fish_blue', 4], ['fish_yellow', 3], ['turtle', 1], ['whale', 1]],
  mars:  [['alienfish', 6], ['jellyfish', 4]],
  snow:  [['fish_blue', 5], ['jellyfish', 2], ['whale', 1], ['fish_yellow', 2]],
  desert: [['fish_yellow', 4], ['fish_orange', 3], ['crab', 3], ['turtle', 1]],
};
const SPEC = {   // size (world px, height), swim speed, can leap
  fish_orange: { h: 13, v: [26, 48], leap: true }, fish_blue: { h: 12, v: [34, 58], leap: true },
  fish_yellow: { h: 13, v: [20, 36], leap: true }, alienfish: { h: 14, v: [24, 44], leap: true },
  turtle: { h: 20, v: [14, 22] }, crab: { h: 12, v: [8, 14], floor: true }, jellyfish: { h: 20, v: [4, 10], drift: true }, whale: { h: 40, v: [12, 18], spout: true },
};

export class Marine {
  constructor(g, themeKey, worldW) {
    this.g = g; this.W = worldW; this.t = 0; this.list = [];
    const cast = CAST[themeKey] || CAST.grass;
    const n = 16;
    for (let i = 0; i < n; i++) {
      const kind = weighted(cast);
      if (kind === 'whale' && this.list.some(c => c.kind === 'whale')) continue;
      this.list.push(this._spawn(kind));
    }
  }

  _spawn(kind) {
    const s = SPEC[kind];
    const dir = Math.random() < 0.5 ? 1 : -1;
    return { kind, s, x: rand(-100, this.W + 100), depth: kind === 'whale' ? rand(26, 34) : s.floor ? rand(34, 40) : rand(9, 38),
      dir, v: rand(s.v[0], s.v[1]), ph: rand(TAU), flee: 0, air: null, turn: 0, spoutT: rand(8, 20) };
  }

  onExplosion(x, y, R) {
    const wy = this.g.waterY;
    if (y < wy - R * 2) return;                       // too far above the sea to matter
    for (const c of this.list) {
      const cy = wy + c.depth;
      if (Math.hypot(c.x - x, cy - y) < R * 3.2) { c.flee = 2.2; c.dir = c.x >= x ? 1 : -1; }
    }
  }

  update(dt) {
    const g = this.g, wy = g.waterY;
    this.t += dt;
    for (const c of this.list) {
      c.ph += dt;
      if (c.air) {                                    // mid-leap: ballistic arc
        c.air.vy += 540 * dt;
        c.x += c.air.vx * dt; c.air.y += c.air.vy * dt;
        if (c.air.y > wy && c.air.vy > 0) {
          g.fx.splash(c.x, wy, 0.45);
          sound.at('splash', c.x, g.cam, { vol: 0.18, rate: rand(1.3, 1.6) });
          c.air = null; c.depth = rand(10, 22);
        }
        continue;
      }
      const speed = c.v * (c.flee > 0 ? 3.2 : 1);
      if (c.flee > 0) c.flee -= dt;
      c.x += c.dir * speed * dt;
      if (c.turn > 0) c.turn -= dt;
      // wrap the long way round off-screen, occasionally change heading
      if (c.x < -220 || c.x > this.W + 220) { c.dir *= -1; c.turn = 0.35; }
      else if (Math.random() < dt * 0.04) { c.dir *= -1; c.turn = 0.35; }
      if (c.s.drift) c.depth = clamp(c.depth + Math.sin(c.ph * 0.8) * dt * 6, 12, 40);
      // leaps: only fish, only in open water (no land at the surface there)
      if (c.s.leap && !c.flee && Math.random() < dt * 0.035 && this._openArc(c.x, c.dir, wy)) {
        c.air = { vx: c.dir * rand(70, 120), vy: -rand(190, 270), y: wy - 2 };
        g.fx.splash(c.x, wy, 0.35);
      }
      if (c.s.spout && (c.spoutT -= dt) <= 0) {
        c.spoutT = rand(10, 22);
        if (!g.terrain.solid(c.x, wy - 2)) this._spout(c.x + c.dir * 14, wy);
      }
      if (Math.random() < dt * 0.25) g.fx.add({ k: 'bubble', x: c.x + c.dir * 6, y: wy + c.depth - 3, vx: 0, vy: -rand(14, 26),
        life: rand(0.8, 1.6), t: 0, sz: rand(1, 2) });
    }
  }

  /** A leap only happens where its whole arc is open air (never in front of a cliff). */
  _openArc(x, dir, wy) {
    const T = this.g.terrain;
    for (let d = -10; d <= 140; d += 10) for (let h = 2; h <= 80; h += 13) if (T.solid(x + dir * d, wy - h)) return false;
    return true;
  }

  _spout(x, y) {
    const fx = this.g.fx;
    for (let i = 0; i < 16; i++) fx.add({ k: 'drop', x: x + rand(-3, 3), y, vx: rand(-40, 40), vy: -rand(160, 260),
      life: rand(0.6, 1.0), t: 0, g: 520, sz: rand(1.2, 2.4) });
  }

  draw(c, px) {
    const g = this.g, wy = g.waterY;
    const x0 = g.cam.cx - g.cam.viewW / 2 - 60, x1 = g.cam.cx + g.cam.viewW / 2 + 60;
    for (const cr of this.list) {
      if (cr.x < x0 || cr.x > x1) continue;
      const img = images[cr.kind];
      if (!img) continue;
      const h = cr.s.h, w = img.width * (h / img.height);
      let y, rot = 0, alpha;
      if (cr.air) { y = cr.air.y; rot = Math.atan2(cr.air.vy, Math.abs(cr.air.vx)) * cr.dir; alpha = 1; }
      else {
        y = wy + cr.depth + Math.sin(cr.ph * (cr.s.drift ? 1.6 : 2.2)) * (cr.s.drift ? 3 : 1.6);
        alpha = clamp(1.05 - cr.depth / 80, 0.55, 1);         // deeper = hazier
      }
      // gentle tail wag / jellyfish pulse, and a squash through zero when turning round
      const wag = cr.s.drift ? 1 + Math.sin(cr.ph * 3.2) * 0.07 : 1 + Math.sin(cr.ph * 9) * 0.04;
      const turnS = cr.turn > 0 ? Math.abs(Math.cos((1 - cr.turn / 0.35) * Math.PI)) : 1;
      const src = crispImage(img, w * px, h * px);
      c.save();
      c.globalAlpha = alpha;
      c.translate(cr.x, y);
      if (rot) c.rotate(rot);
      c.scale(cr.dir * Math.max(0.12, turnS) * (cr.s.drift ? 1 : wag), cr.s.drift ? 1 / wag : 1);
      c.drawImage(src, -w / 2, -h / 2, w, h);
      c.restore();
    }
  }
}

function weighted(list) {
  const tot = list.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * tot;
  for (const [k, w] of list) if ((r -= w) <= 0) return k;
  return list[0][0];
}
void pick;
