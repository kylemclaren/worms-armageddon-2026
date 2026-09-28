// ===== CPU player =====
// Brute-force but honest: every candidate shot is simulated with the *same*
// integrator the real projectile uses (stepBody), against the real terrain and
// wind. The search is a generator so it spreads over frames while the worm
// "thinks". Skill only adds aiming error afterwards.
import { stepBody } from './entities.js';
import { WALKER } from './critters.js';
import { MAX_SPEED } from './weapons.js';
import { rand, clamp } from './util.js';
import { toast } from './toast.js';

const SKILL = {
  beginner: { angErr: 0.075, powErr: 0.07, budget: 0.45, think: 1.2 },
  pro:      { angErr: 0.028, powErr: 0.025, budget: 1, think: 0.9 },
  expert:   { angErr: 0.006, powErr: 0.006, budget: 1.3, think: 0.6 },
};

const BALLISTIC = {
  bazooka: { r: 3, wind: 1, impact: true, hitsWorms: true, radius: 48, damage: 50, speedMul: 1 },
  grenade: { r: 3.5, impact: false, bounce: 0.52, friction: 0.82, radius: 48, damage: 50, speedMul: 0.95, fuse: true },
  cluster: { r: 3.5, impact: false, bounce: 0.5, friction: 0.82, radius: 40, damage: 42, speedMul: 0.95, fuse: true, cost: 8 },
  banana:  { r: 4, impact: false, bounce: 0.6, friction: 0.82, radius: 80, damage: 95, speedMul: 0.95, fuse: true, cost: 45 },
  hhg:     { r: 4.5, impact: false, bounce: 0.18, friction: 0.5, radius: 110, damage: 100, speedMul: 0.9, fixedFuse: 4.1, cost: 55 },
  // mortar: no power bar (always 0.8); the six bomblets are folded into one wider blast for scoring
  mortar:  { r: 3, wind: 1, impact: true, hitsWorms: true, radius: 44, damage: 38, speedMul: 1, fixedPower: 0.8, cost: 2 },
  petrol:  { r: 3, impact: true, hitsWorms: true, radius: 20, damage: 10, speedMul: 0.9, fire: 70, cost: 6 },
};

/** Names Jev sees, with the one fact about each weapon that matters for choosing it. */
const WNAME = { bazooka: 'Bazooka', grenade: 'Grenade', cluster: 'Cluster Bomb', banana: 'Banana Bomb (rare, huge)',
  hhg: 'Holy Hand Grenade (rare, enormous)', shotgun: 'Shotgun (2 shots)', firepunch: 'Fire Punch', bat: 'Baseball Bat (knocks far)',
  airstrike: 'Air Strike (rare)', donkey: 'Concrete Donkey (super weapon)', homing: 'Homing Missile (limited)', armageddon: 'Armageddon (super weapon)',
  mortar: 'Mortar (splits into bomblets)', pigeon: 'Homing Pigeon (flies round terrain to the target)', petrol: 'Petrol Bomb (sets the area on fire)',
  handgun: 'Handgun (6 shots)', uzi: 'Uzi (10-round burst)', longbow: 'Longbow (2 arrows, knockback)', dragonball: 'Dragon Ball (short-range fireball)',
  kamikaze: 'Kamikaze (YOUR worm dies in the blast)', prod: 'Prod (a push, no damage)', axe: 'Battle Axe (halves the victim\'s health)',
  dynamite: 'Dynamite (dropped, 5s fuse, then run)', vase: 'Ming Vase (dropped, 5s fuse, then run)', sheep: 'Sheep (hops to the enemy)',
  supersheep: 'Super Sheep (flies, steered to the target)', oldwoman: 'Old Woman (walks, explodes after 5s)', madcow: 'Mad Cows (two, charge and explode)',
  napalm: 'Napalm Strike (rare, fire from the sky)', minestrike: 'Mine Strike (rare, scatters mines)', sheepstrike: 'Sheep Strike (rare, sheep bombs from the sky)',
  quake: 'Earthquake (rare, shakes everyone toward the water)', scales: 'Scales of Justice (rare, shares health equally between teams)' };
const COST = { pigeon: 12, uzi: 4, handgun: 3, longbow: 3, dragonball: 5, axe: 6, prod: 0, vase: 20, dynamite: 16, sheep: 8, supersheep: 15,
  oldwoman: 12, madcow: 14, napalm: 10, minestrike: 12, sheepstrike: 15, quake: 20, scales: 10 };
const UNSURE = new Set(['homing', 'airstrike', 'donkey', 'pigeon', 'napalm', 'minestrike', 'sheepstrike', 'sheep', 'supersheep', 'oldwoman', 'madcow', 'quake']);

export class AI {
  constructor(g) { this.g = g; }

  get skill() { return SKILL[this.g.opts.ai] || SKILL.pro; }

  begin(worm) {
    this.w = worm;
    this.jevAsked = false; this.jevWaiting = false; this.jevPick = null;
    if (worm.team.brain !== 'jev') toast.loading('CPU is thinking', { id: 'ai', loader: 'dots', description: `${worm.team.name} · ${worm.name}`, accent: worm.team.color });
    this.phase = 'think';
    this.t = 0;
    this.best = null;
    this.walked = 0;
    this.search = this._search();
  }

  // ------------------------------------------------------------ scoring

  _scoreBlast(x, y, R, dmg, skipMe = false) {
    const g = this.g, me = this.w;
    let s = 0;
    const reach = R * 1.15;
    for (const w of g.worms) {
      if (!w.alive || (skipMe && w === me)) continue;
      const d = Math.hypot(w.x - x, w.y - 4 - y);
      if (d > reach + w.r) continue;
      const f = 1 - clamp((d - w.r) / reach, 0, 1);
      const n = Math.min(w.hp, Math.round(dmg * clamp(f * 1.3, 0, 1)));
      // knockback toward the sea is worth a lot
      const nearWater = w.y > g.waterY - 90 || w.x < 140 || w.x > g.terrain.w - 140;
      const kill = n >= w.hp;
      if (w === me) s -= n * 3 + (kill ? 400 : 0);
      else if (w.team === me.team) s -= n * 1.5 + (kill ? 120 : 0);
      else s += n + (kill ? 60 : 0) + (nearWater && f > 0.3 ? 25 : 0);
    }
    return s;
  }

  /**
   * Mirror of Projectile flight for one candidate. Impact weapons return the hit
   * point; fused ones return where the bomb sits at each whole second (one
   * flight scores every fuse setting at once).
   */
  _simulate(spec, ang, power) {
    const g = this.g, me = this.w;
    const v = { x: Math.cos(ang), y: Math.sin(ang) };
    const sp = MAX_SPEED * clamp(power, 0.05, 1) * spec.speedMul;
    const b = { x: me.x + v.x * 16, y: me.y - 6 + v.y * 16, vx: v.x * sp, vy: v.y * sp,
      r: spec.r, bounce: spec.bounce, friction: spec.friction, wind: spec.wind || 0, impact: spec.impact, grav: 1 };
    const dt = 1 / 60;
    const marks = [];
    const fuses = spec.fixedFuse ? [spec.fixedFuse] : [1, 2, 3, 4, 5];
    let t = 0, fi = 0;
    const maxT = spec.impact ? 7 : fuses[fuses.length - 1];
    while (t < maxT - 1e-6) {
      t += dt;
      const hit = stepBody(g, b, dt);
      if (b.y > g.waterY || b.x < -300 || b.x > g.terrain.w + 300) return spec.impact ? null : marks;
      if (spec.impact) {
        if (hit) return { x: b.x, y: b.y, t };
        if (spec.hitsWorms) for (const w of g.worms) {
          if (!w.alive || (w === me && t < 0.25)) continue;
          if (Math.abs(w.x - b.x) < 9 + b.r && b.y > w.y - 24 && b.y < w.y + 10) return { x: b.x, y: b.y, t };
        }
      } else if (t >= fuses[fi] - 1e-6) { marks.push({ x: b.x, y: b.y, t, fuse: fuses[fi] }); fi++; }
    }
    return spec.impact ? null : marks;
  }

  /** Best (score, fuse, point) for one aim of one weapon. */
  _evalShot(id, spec, ang, p) {
    const r = this._simulate(spec, ang, p);
    if (!r) return null;
    const pts = Array.isArray(r) ? r : [r];
    let best = null;
    for (const h of pts) {
      const s = this._scoreBlast(h.x, h.y, spec.radius, spec.damage) - (spec.cost || 0) - (h.t > 5 ? 3 : 0)
        + (spec.fire ? this._fireBonus(h.x, h.y, spec.fire) : 0);
      if (!best || s > best.score) best = { score: s, kind: 'aim', weapon: id, ang, power: p, fuse: h.fuse ? Math.min(5, Math.ceil(h.fuse)) : 3, hit: h, radius: spec.radius, damage: spec.damage };
    }
    if (best) best.victim = this._nearestEnemy(best.hit.x, best.hit.y)?.name;
    return best;
  }

  *_search() {
    const g = this.g, me = this.w, team = me.team, sk = this.skill;
    const enemies = g.worms.filter(w => w.alive && w.team !== team);
    if (!enemies.length) return;
    let best = { score: 6, kind: 'skip' };
    this.pool = new Map();
    const consider = c => {
      if (!c) return;
      if (c.score > 0) {
        const key = `${c.weapon}:${c.victim ?? c.target?.name ?? '-'}`;
        const cur = this.pool.get(key);
        if (!cur || c.score > cur.score) this.pool.set(key, c);
      }
      if (c.score > best.score) best = c;
    };
    this.best = best;
    // Budget is per rendered frame (main loop stamps frameStart), so catch-up ticks
    // never multiply the search cost and drag the frame rate down.
    const budget = 4 * sk.budget;
    const deadline = performance.now() + 7000;
    const self = this;
    const pause = function* () {
      while (performance.now() - (self.frameStart || 0) > budget) yield;
    };

    // ---- close-range options: cheap to evaluate, often best
    for (const e of enemies) {
      const dx = e.x - me.x, dy = e.y - me.y, d = Math.hypot(dx, dy);
      if (Math.abs(dx) < 22 && Math.abs(dy) < 16) {
        const water = e.y > g.waterY - 120 || e.x < 160 || e.x > g.terrain.w - 160 ? 40 : 0;
        consider({ score: Math.min(30, e.hp) + (30 >= e.hp ? 60 : 0) + 10 + water, kind: 'melee', weapon: 'firepunch', facing: Math.sign(dx) || 1, aim: 0, victim: e.name, est: [{ w: e, dmg: 30 }] });
        if (team.ammo.bat > 0) consider({ score: Math.min(30, e.hp) + (30 >= e.hp ? 60 : 0) + water * 2 + 4, kind: 'melee', weapon: 'bat', facing: Math.sign(dx) || 1, aim: -0.6, victim: e.name, est: [{ w: e, dmg: 30 }] });
      }
      if (d < 520) {
        const ang = Math.atan2(e.y - 6 - (me.y - 6), dx);
        const hit = g.terrain.ray(me.x + Math.cos(ang) * 10, me.y - 6 + Math.sin(ang) * 10, Math.cos(ang), Math.sin(ang), d - 8);
        if (!hit) {
          const n = Math.min(50, e.hp);
          consider({ score: n * 0.9 + (50 >= e.hp ? 50 : 0) + (e.y > g.waterY - 100 ? 20 : 0), kind: 'aim', weapon: 'shotgun', ang, power: 1, victim: e.name, est: [{ w: e, dmg: 50 }] });
        }
      }
    }

    // ---- ballistic sweep: coarse grid, then refine the most promising aims
    const weapons = Object.keys(BALLISTIC).filter(id => team.ammo[id] > 0);
    const top = [];
    const coarseA = sk.budget < 1 ? 0.14 : 0.1, coarseP = sk.budget < 1 ? 0.125 : 0.1;
    outer:
    for (const id of weapons) {
      const spec = BALLISTIC[id];
      for (let a = -1.45; a <= 1.45; a += coarseA) {
        for (const dir of [1, -1]) {
          const ang = dir > 0 ? a : Math.PI - a;
          for (let p = spec.fixedPower ?? 0.3; p <= (spec.fixedPower ?? 1) + 0.001; p += coarseP) {
            const c = this._evalShot(id, spec, ang, p);
            yield* pause();
            if (performance.now() > deadline) break outer;
            if (!c || c.score <= 0) continue;
            consider(c); this.best = best;
            top.push(c);
          }
        }
      }
    }
    top.sort((a, b) => b.score - a.score);
    const seeds = top.slice(0, sk.budget < 1 ? 3 : 6);
    for (const s of seeds) {
      const spec = BALLISTIC[s.weapon];
      for (let da = -coarseA / 2; da <= coarseA / 2 + 1e-6; da += coarseA / 4) {
        for (let dp = -coarseP / 2; dp <= coarseP / 2 + 1e-6; dp += coarseP / 4) {
          consider(this._evalShot(s.weapon, spec, s.ang + da, spec.fixedPower ?? clamp(s.power + dp, 0.1, 1)));
          this.best = best;
          yield* pause();
          if (performance.now() > deadline) break;
        }
      }
    }

    // ---- air strike / homing / specials
    if (team.ammo.airstrike > 0) for (const e of enemies) {
      const open = !g.terrain.ray(e.x, e.y - 26, 0, -1, e.y + 200);
      if (!open) continue;
      const s = this._scoreBlast(e.x, e.y - 4, 30, 30) * 1.6 - 8;
      consider({ score: s, kind: 'target', weapon: 'airstrike', target: { x: e.x, y: e.y }, facing: Math.random() < 0.5 ? 1 : -1, victim: e.name, hit: { x: e.x, y: e.y }, radius: 45, damage: 45 });
    }
    if (team.ammo.donkey > 0) for (const e of enemies) consider({ score: this._scoreBlast(e.x, e.y, 62, 50) * 1.5, kind: 'target', weapon: 'donkey', target: { x: e.x, y: e.y }, victim: e.name, hit: { x: e.x, y: e.y }, radius: 62, damage: 70 });
    if (team.ammo.armageddon > 0 && enemies.length >= 3) consider({ score: 70, kind: 'now', weapon: 'armageddon' });
    if (team.ammo.homing > 0) for (const e of enemies) {
      // homing climbs first then dives: needs open air above us and a clear line from there
      const apex = { x: me.x + (e.x > me.x ? 60 : -60), y: me.y - 140 };
      if (g.terrain.ray(me.x, me.y - 20, apex.x - me.x, apex.y - me.y + 20, 130)) continue;
      if (g.terrain.ray(apex.x, apex.y, e.x - apex.x, e.y - 8 - apex.y, Math.hypot(e.x - apex.x, e.y - 8 - apex.y) - 14)) continue;
      const s = this._scoreBlast(e.x, e.y - 4, 48, 50) * 0.8 - 10;
      consider({ score: s, kind: 'aim', weapon: 'homing', ang: -Math.PI / 2 + (e.x > me.x ? 0.5 : -0.5), power: 0.55, target: { x: e.x, y: e.y - 4 }, victim: e.name, hit: { x: e.x, y: e.y - 4 }, radius: 48, damage: 50 });
    }
    yield* pause();
    for (const c of this._secondWave(enemies)) { if (c) consider(c); this.best = best; yield* pause(); if (performance.now() > deadline + 2000) break; }
    this.best = best;
  }

  /**
   * Candidates for the second-wave arsenal. Walkers and sheep are simulated over the real
   * terrain like the ballistic shots; the rest use line-of-sight and blast scoring.
   */
  *_secondWave(enemies) {
    const g = this.g, me = this.w, team = me.team, T = g.terrain;
    const has = id => team.ammo[id] > 0;
    const water = e => e.y > g.waterY - 110 || e.x < 150 || e.x > T.w - 150;
    const clear = (x1, y1, x2, y2) => !T.ray(x1, y1, x2 - x1, y2 - y1, Math.hypot(x2 - x1, y2 - y1) - 10);
    const kill = (n, e) => (n >= e.hp ? 60 : 0);

    for (const e of enemies) {
      const dx = e.x - me.x, dy = e.y - me.y, d = Math.hypot(dx, dy), dir = Math.sign(dx) || 1;
      // ---- hitscan guns and arrows: need a clear straight line
      if (d < 460 && clear(me.x, me.y - 6, e.x, e.y - 6)) {
        const ang = Math.atan2(e.y - me.y, dx);
        if (has('uzi') && d < 320) { const n = Math.min(e.hp, d < 160 ? 40 : 25); yield { score: n * 0.9 + kill(n, e) - COST.uzi, kind: 'aim', weapon: 'uzi', ang, power: 1, victim: e.name, est: [{ w: e, dmg: n }] }; }
        if (has('handgun')) { const n = Math.min(e.hp, 28); yield { score: n * 0.85 + kill(n, e) - COST.handgun, kind: 'aim', weapon: 'handgun', ang, power: 1, victim: e.name, est: [{ w: e, dmg: n }] }; }
        if (has('longbow') && d < 420) {
          // arrows drop a little: aim a touch high with distance
          const n = Math.min(e.hp, 30);
          yield { score: n * 0.8 + kill(n, e) + (water(e) ? 30 : 0) - COST.longbow, kind: 'aim', weapon: 'longbow', ang: ang - clamp(d / 2600, 0, 0.16), power: 1, victim: e.name, est: [{ w: e, dmg: n }] };
        }
      }
      // ---- close combat
      if (Math.abs(dy) < 14 && Math.abs(dx) < 210 && has('dragonball') && clear(me.x, me.y - 4, e.x, e.y - 4)) {
        const n = Math.min(30, e.hp);
        yield { score: n + kill(n, e) + (water(e) ? 35 : 0) - COST.dragonball, kind: 'melee', weapon: 'dragonball', facing: dir, aim: 0, victim: e.name, est: [{ w: e, dmg: 30 }] };
      }
      if (Math.abs(dx) < 22 && Math.abs(dy) < 16) {
        if (has('axe')) { const n = Math.max(1, Math.floor(e.hp / 2)); yield { score: n * 1.1 - COST.axe, kind: 'melee', weapon: 'axe', facing: dir, aim: 0, victim: e.name, est: [{ w: e, dmg: n }] }; }
        // a prod only matters if it tips them into the sea
        const land = T.standY?.(e.x + dir * 70, 8, e.y - 40, g.waterY) ?? null;
        if (has('prod') && (land == null || e.y > g.waterY - 50)) {
          yield { score: e.hp + 60, kind: 'melee', weapon: 'prod', facing: dir, aim: 0, victim: e.name, est: [{ w: e, dmg: e.hp }], note: `pushes enemy ${e.name} off the edge into the water (KILL)` };
        }
      }
      // ---- kamikaze: a straight clear run, and only worth it if it takes more than it costs
      if (has('kamikaze') && d < 420 && clear(me.x, me.y - 6, e.x, e.y - 6)) {
        const s = this._scoreBlast(e.x, e.y - 4, 62, 50, true) - me.hp * 1.4 - 30;
        yield { score: s, kind: 'aim', weapon: 'kamikaze', ang: Math.atan2(e.y - me.y, dx), power: 1, victim: e.name, hit: { x: e.x, y: e.y - 4 }, radius: 62, damage: 50,
          note: `${this._report({ hit: { x: e.x, y: e.y - 4 }, radius: 62, damage: 50 })}; your worm ${me.name} dies` };
      }
      // ---- homing pigeon: pathfinds, so no line of sight needed; a bit less reliable
      if (has('pigeon')) {
        const s = this._scoreBlast(e.x, e.y - 4, 56, 60) * (clear(me.x, me.y - 20, e.x, e.y - 8) ? 0.95 : 0.75) - COST.pigeon;
        yield { score: s, kind: 'aim', weapon: 'pigeon', facing: dir, aim: -0.7, target: { x: e.x, y: e.y - 4 }, victim: e.name, hit: { x: e.x, y: e.y - 4 }, radius: 56, damage: 60 };
      }
      // ---- strikes: need open sky over the target
      const open = !T.ray(e.x, e.y - 26, 0, -1, e.y + 200);
      if (open) {
        const f = Math.random() < 0.5 ? 1 : -1;
        if (has('napalm')) yield { score: (this._scoreBlast(e.x, e.y - 4, 32, 25) + this._fireBonus(e.x, e.y, 70)) * 1.2 - COST.napalm, kind: 'target', weapon: 'napalm', target: { x: e.x, y: e.y }, facing: f, victim: e.name, hit: { x: e.x, y: e.y }, radius: 40, damage: 35 };
        if (has('sheepstrike')) yield { score: this._scoreBlast(e.x, e.y - 4, 46, 40) * 1.6 - COST.sheepstrike, kind: 'target', weapon: 'sheepstrike', target: { x: e.x, y: e.y }, facing: f, victim: e.name, hit: { x: e.x, y: e.y }, radius: 50, damage: 55 };
        if (has('minestrike')) yield { score: this._scoreBlast(e.x, e.y - 4, 40, 30) * 0.8 - COST.minestrike, kind: 'target', weapon: 'minestrike', target: { x: e.x, y: e.y }, facing: f, victim: e.name, hit: { x: e.x, y: e.y }, radius: 40, damage: 30 };
      }
      // ---- dropped charges: only when standing on top of someone (we walk off during the fuse)
      if (Math.abs(dx) < 26 && Math.abs(dy) < 18) {
        for (const [id, R, D] of [['vase', 75, 75], ['dynamite', 85, 75]]) if (has(id)) {
          const s = this._scoreBlast(me.x, me.y - 4, R, D, true) - COST[id] - 15;
          yield { score: s, kind: 'now', weapon: id, victim: e.name, hit: { x: me.x, y: me.y - 4 }, radius: R, damage: D };
        }
      }
    }

    // ---- walkers and sheep: simulate their walk over the real terrain, both directions
    for (const dir of [1, -1]) {
      if (has('oldwoman')) { const r = this._simWalker(WALKER.oldwoman, dir); if (r) yield this._walkerPlan('oldwoman', dir, r, WALKER.oldwoman.R, WALKER.oldwoman.D, 1); }
      if (has('madcow')) { const r = this._simWalker(WALKER.madcow, dir); if (r) yield this._walkerPlan('madcow', dir, r, WALKER.madcow.R, WALKER.madcow.D, 1.6); }
      if (has('sheep')) { const r = this._simWalker({ speed: 105, fuse: 9, climb: 14, wallBoom: false }, dir, true); if (r) yield this._walkerPlan('sheep', dir, r, 76, 75, 1); }
      yield null;
    }
    // ---- super sheep: flies, the AI steers it at the nearest enemy it can see from above
    if (has('supersheep')) for (const e of enemies) {
      const lx = me.x + (e.x > me.x ? 40 : -40), ly = me.y - 90;
      if (T.ray(me.x, me.y - 20, lx - me.x, ly - me.y + 20, 80) || !clear(lx, ly, e.x, e.y - 8)) continue;
      yield { score: this._scoreBlast(e.x, e.y - 4, 76, 75) * 0.85 - COST.supersheep, kind: 'now', weapon: 'supersheep', facing: Math.sign(e.x - me.x) || 1,
        victim: e.name, hit: { x: e.x, y: e.y - 4 }, radius: 76, damage: 75, steerAt: e.name };
    }
    // ---- earthquake: worth it when enemies stand near the water and we don't
    if (has('quake')) {
      let s = -COST.quake;
      for (const w of g.worms) if (w.alive && water(w)) s += w.team === team ? -w.hp * 0.8 : w.hp * 0.6 + 20;
      yield { score: s, kind: 'now', weapon: 'quake', note: 'shakes every worm; those near the water may drown' };
    }
    // ---- scales of justice: when we're behind on health
    if (has('scales')) {
      const alive = g.aliveTeams(), total = alive.reduce((a, t) => a + g.teamHp(t), 0), share = total / alive.length;
      const mine = g.teamHp(team), gain = share - mine;
      const theirs = alive.filter(t => t !== team).reduce((a, t) => a + Math.max(0, g.teamHp(t) - share), 0);
      yield { score: gain * 1.2 + theirs * 0.3 - COST.scales, kind: 'now', weapon: 'scales',
        note: `your team goes from ${mine} to ${Math.round(share)} HP; every team ends on ${Math.round(share)}` };
    }
  }

  /** Enemies standing in flames (fire does ~20 over its life), friends counted against. */
  _fireBonus(x, y, R) {
    const me = this.w; let s = 0;
    for (const w of this.g.worms) {
      if (!w.alive || Math.abs(w.x - x) > R || Math.abs(w.y - y) > 40) continue;
      const n = Math.min(w.hp, 20);
      s += w === me ? -n * 3 : w.team === me.team ? -n * 1.5 : n;
    }
    return s;
  }

  /**
   * Dry run of a walker (Old Woman / Mad Cow / sheep hop) using the same stepping rules
   * as critters.js. Returns where it will go off, or null if it drowns.
   * stopNear: blow up beside the first enemy reached (sheep are detonated by hand).
   */
  _simWalker(K, dir, stopNear = false) {
    const g = this.g, me = this.w, T = g.terrain;
    const b = { x: me.x + dir * 10, y: me.y - 4, vx: dir * 40, vy: -120, r: 7, bounce: 0.1, friction: 0.6, rest: false };
    const dt = 1 / 30, climb = K.climb || 5;
    let t = 0, acc = 0, d = dir;
    const near = () => stopNear && g.worms.some(o => o.alive && o.team !== me.team && Math.hypot(o.x - b.x, o.y - b.y) < 38);
    while (t < K.fuse) {
      t += dt;
      if (!b.rest) stepBody(g, b, dt);
      else if (!T.hitCircle(b.x, b.y + 2, b.r)) { b.rest = false; b.vx = d * 30; b.vy = 0; }
      else {
        acc += K.speed * dt;
        while (acc >= 1 && b.rest) {
          acc -= 1;
          const nx = b.x + d;
          let ny = b.y, k = 0;
          while (T.hitCircle(nx, ny, b.r) && k < climb) { ny--; k++; }
          if (T.hitCircle(nx, ny, b.r)) { if (K.wallBoom && t > 0.6) return { x: b.x, y: b.y - 4, t }; d = -d; acc = 0; break; }
          let fall = 0;
          while (!T.hitCircle(nx, ny + 1, b.r) && fall < 8) { ny++; fall++; }
          b.x = nx; b.y = ny;
          if (fall >= 8) { b.rest = false; b.vx = d * 40; b.vy = 0; }
          if (near()) return { x: b.x, y: b.y - 4, t };
        }
      }
      if (b.y > g.waterY || b.x < -100 || b.x > T.w + 100) return null;
      if (near()) return { x: b.x, y: b.y - 4, t };
    }
    return stopNear ? null : { x: b.x, y: b.y - 4, t };
  }

  _walkerPlan(id, dir, r, R, D, mul) {
    const s = this._scoreBlast(r.x, r.y, R, D) * mul - COST[id];
    return { score: s, kind: 'now', weapon: id, facing: dir, hit: { x: r.x, y: r.y }, radius: R, damage: Math.round(D * mul),
      victim: this._nearestEnemy(r.x, r.y)?.name };
  }

  // ------------------------------------------------------------ acting

  tick(dt, c) {
    const g = this.g, w = this.w;
    if (!w || !w.alive || g.cur !== w) return;
    this.t += dt;
    c.left = c.right = c.up = c.down = c.fire = false;

    if (g.state === 'control') {
      // sheep: blow it up when it's close to an enemy, or near the end of its life
      const s = g.controlled;
      if (s?.type === 'sheep') {
        const near = g.worms.some(o => o.alive && o.team !== w.team && Math.hypot(o.x - s.x, o.y - s.y) < 40);
        if (near || s.t > 9) c.firePressed = true;
      } else if (s?.type === 'supersheep') this._steerSheep(s, c);
      return;
    }
    if (g.state === 'retreat') { this._retreat(c); return; }
    if (g.state !== 'turn') return;

    switch (this.phase) {
      case 'think': {
        const r = this.search.next();
        if (!r.done || this.t < this.skill.think) return;
        if (w.team.brain === 'jev' && !this.jevAsked) { this._askJev(); return; }
        if (this.jevWaiting) { if (this.t > 14) this.jevWaiting = false; else return; }
        const b = this.jevPick || this.best;
        if (!b || b.kind === 'skip') {
          if (this.walked < 2 && !b?.forceSkip) { this.phase = 'walk'; this.walkT = rand(1.2, 2.2); this.walkDir = this._towardEnemy(); return; }
          g.selectWeapon('skipgo'); c.firePressed = true; this.phase = 'done'; return;
        }
        this._prepare(b);
        return;
      }
      case 'walk': {
        this.walkT -= dt;
        if (w.state === 'idle') { if (this.walkDir > 0) c.right = true; else c.left = true; }
        if (this.walkT <= 0 || (this._stuck = (Math.abs(w.x - (this._lx ?? w.x)) < 0.01 ? (this._stuck || 0) + dt : 0)) > 0.5) {
          if (this._stuck > 0.5 && w.state === 'idle') c.jump = true;
          this.walked++; this.t = 0; this.phase = 'think'; this.search = this._search(); this._stuck = 0;
          this.jevAsked = false; this.jevPick = null;
        }
        this._lx = w.x;
        return;
      }
      case 'select': {
        if (this.t < 0.35) return;
        g.selectWeapon(this.plan.weapon);
        if (this.plan.fuse) g.setFuse(this.plan.fuse);
        if (this.plan.target && !g.weapon.instant) g.target = { ...this.plan.target };
        this.phase = 'face'; this.t = 0;
        return;
      }
      case 'face': {
        const p = this.plan;
        const want = p.facing ?? (p.ang !== undefined ? (Math.cos(p.ang) >= 0 ? 1 : -1) : w.facing);
        if (w.facing !== want && w.state === 'idle') {
          // a single pixel of walking turns the worm round
          w.facing = want;
        }
        if (this.t < 0.25) return;
        this.phase = p.kind === 'target' ? 'click' : p.kind === 'now' ? 'shoot' : 'aim';
        this.t = 0;
        return;
      }
      case 'aim': {
        const p = this.plan;
        const target = p.aim !== undefined ? p.aim : relAim(p.ang, w.facing);
        const d = target - w.aim;
        if (Math.abs(d) > 0.03) { if (d < 0) c.up = true; else c.down = true; return; }
        w.aim = target;
        if (this.t < 0.3) return;
        this.phase = 'shoot'; this.t = 0;
        return;
      }
      case 'click': {
        if (this.t < 0.5) return;
        c.target = { ...this.plan.target };
        if (this.plan.weapon === 'airstrike') c.target.y = 0;
        this.phase = 'done';
        return;
      }
      case 'shoot': {
        const p = this.plan;
        if (g.weapon.charge) {
          if (!g.charging) { c.fire = true; c.firePressed = true; return; }
          if (g.power < p.power - 0.001) { c.fire = true; return; }
          g.power = p.power; c.fire = false; // release on the exact power
          this.phase = p.weapon === 'shotgun' || p.weapon === 'longbow' ? 'shoot2' : 'done';
        } else {
          c.firePressed = true;
          this.phase = p.weapon === 'shotgun' || p.weapon === 'longbow' ? 'shoot2' : 'done';
        }
        this.t = 0;
        return;
      }
      case 'shoot2': {
        if (this.t < 0.9) return;
        if (g.state === 'turn' && (g.weaponId === 'shotgun' || g.weaponId === 'longbow')) c.firePressed = true;
        this.phase = 'done';
        return;
      }
    }
  }

  /** Super sheep pilot: take off, point at the target, pull up from land, detonate on arrival. */
  _steerSheep(s, c) {
    const g = this.g;
    if (!s.flying) { if (s.t > 0.35) c.firePressed = true; return; }
    const e = this.g.worms.find(o => o.alive && o.name === this.plan?.steerAt) || this._nearestEnemy(s.x, s.y);
    if (!e) return;
    if (Math.hypot(e.x - s.x, e.y - 6 - s.y) < 26 || s.flyT > 12) { c.firePressed = true; return; }
    let want = Math.atan2(e.y - 8 - s.y, e.x - s.x);
    // land dead ahead: climb away from it
    const ax = Math.cos(s.ang), ay = Math.sin(s.ang);
    if (g.terrain.hitCircle(s.x + ax * 34, s.y + ay * 34, 6) && Math.hypot(e.x - s.x, e.y - s.y) > 60) want = s.ang + (ax >= 0 ? -1.2 : 1.2);
    let d = want - s.ang;
    while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    if (d > 0.06) c.right = true; else if (d < -0.06) c.left = true;
  }

  _nearestEnemy(x, y) {
    let best = null, bd = 1e9;
    for (const e of this.g.worms) if (e.alive && e.team !== this.w.team) {
      const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** Who a candidate move is predicted to hurt, for describing it to Jev. */
  _report(c) {
    const g = this.g, me = this.w;
    if (c.note) return c.note;
    let hits = c.est || [];
    if (!c.est && c.hit) {
      hits = [];
      const reach = c.radius * 1.15;
      for (const w of g.worms) {
        if (!w.alive) continue;
        const d = Math.hypot(w.x - c.hit.x, w.y - 4 - c.hit.y);
        if (d > reach + w.r) continue;
        const f = 1 - clamp((d - w.r) / reach, 0, 1);
        const dmg = Math.round(c.damage * clamp(f * 1.3, 0, 1));
        if (dmg > 0) hits.push({ w, dmg });
      }
    }
    const parts = hits.map(({ w, dmg }) => {
      const who = w === me ? 'YOURSELF' : w.team === me.team ? `teammate ${w.name}` : `enemy ${w.name}`;
      return `${who} -${Math.min(dmg, w.hp)}${dmg >= w.hp ? ' (KILL)' : ''}`;
    });
    return parts.length ? parts.join(', ') : 'no damage predicted';
  }

  _askJev() {
    const g = this.g, me = this.w, team = me.team;
    this.jevAsked = true;
    // top options by local score, then shuffled so Jev judges content, not list position
    const opts = [...this.pool.values()].sort((a, b) => b.score - a.score).slice(0, 10).sort(() => Math.random() - 0.5);
    const criteria = {}, byKey = {};
    opts.forEach((c, i) => {
      const k = `move_${i + 1}`;
      const ammo = team.ammo[c.weapon];
      const sure = UNSURE.has(c.weapon) && !c.note ? 'if it gets there, ' : '';
      const at = c.victim ? ` aimed at ${c.victim}` : '';
      criteria[k] = `${WNAME[c.weapon] || c.weapon}${at}: ${sure}${this._report(c)}. ` +
        `${ammo === Infinity ? 'Unlimited ammo.' : `${ammo} left.`}`;
      byKey[k] = c;
    });
    if (this.walked < 1) { criteria.reposition = 'Walk toward the enemy to find a better firing position before shooting.'; byKey.reposition = { kind: 'skip' }; }
    criteria.pass = 'Skip this turn and do nothing.'; byKey.pass = { kind: 'skip', pass: true };
    if (opts.length === 0 && this.walked >= 1) { this.jevPick = null; return; }

    const worm = w => ({ name: w.name, hp: w.hp, x: Math.round(w.x), y: Math.round(w.y),
      near_water: w.y > g.waterY - 100 || w.x < 150 || w.x > g.terrain.w - 150 });
    const state = {
      game: 'Worms Armageddon: turn-based artillery. Last team with living worms wins. Water is instant death.',
      you_are: `Jev, commanding ${team.name}. It is ${me.name}'s turn.`,
      round: g.round, sudden_death: g.suddenDeath,
      wind: g.wind === 0 ? 'calm' : `${g.wind > 0 ? 'blowing right' : 'blowing left'}, strength ${Math.round(Math.abs(g.wind) * 10)}/10`,
      your_worm: worm(me),
      your_team: team.worms.filter(w => w.alive).map(worm),
      enemies: g.worms.filter(w => w.alive && w.team !== team).map(w => ({ ...worm(w), team: w.team.name })),
      team_health: Object.fromEntries(g.teams.map(t => [t.name, g.teamHp(t)])),
    };
    const questions = {
      move: { type: 'choice', criteria,
        instructions: 'Choose the best move for this turn. Kills and big damage to enemies are best; knocking enemies near the water is valuable. ' +
          'Never pick a move that damages YOURSELF or a teammate unless it also kills an enemy. Save rare weapons for kills or multi-hits; ' +
          'prefer unlimited-ammo weapons when damage is similar. Kamikaze sacrifices your worm: only when it kills more than it costs. ' +
          'Scales of Justice is good when your team is behind on health.' },
      taunt: { type: 'choice', instructions: 'Which line should your worm shout as it acts?',
        criteria: { watchthis: 'Confident show-off before a great shot', fire: 'Battle cry for an ordinary shot',
          laugh: 'Mocking laughter when about to kill someone', revenge: 'Getting even after taking damage',
          comeonthen: 'Taunting a nearby enemy', uhoh: 'Nervous about a risky or weak move' } },
    };
    this.jevWaiting = true;
    toast.loading('Jev is deciding', { id: 'jev', loader: 'orbit', description: `Weighing ${Object.keys(criteria).length} moves`, accent: team.color });
    const t0 = performance.now();
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 14000);
    fetch('api/jev', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state, questions }), signal: ctl.signal })
      .then(r => r.text().then(t => { let j = null; try { j = JSON.parse(t); } catch {} return { ok: r.ok && !!j, j: j || { error: `Jev's server hiccuped (HTTP ${r.status})` } }; }))
      .then(({ ok, j }) => {
        if (!ok || !j.answers?.move) throw new Error(j.error || (typeof j.detail === 'string' ? j.detail : 'unexpected answer'));
        const a = j.answers.move;
        const pick = byKey[a.choice];
        if (!pick) throw new Error('unknown choice');
        this.jevPick = pick.kind === 'skip' ? (pick.pass ? { kind: 'skip', forceSkip: true } : { kind: 'skip' }) : pick;
        const ms = Math.round(performance.now() - t0);
        const label = pick.kind === 'skip' ? criteria[a.choice].split('.')[0] : `${WNAME[pick.weapon]?.split(' (')[0] || pick.weapon} → ${pick.victim || 'enemy'}`;
        toast.success(`Jev: ${label}`, { id: 'jev', description: `${Math.round((a.confidence ?? 0) * 100)}% confident · ${ms} ms`, accent: team.color, duration: 3800 });
        this.g.jevLog = { choice: a.choice, confidence: a.confidence, probabilities: a.probabilities, ms, options: criteria };
        const taunt = j.answers.taunt?.choice;
        if (taunt && Math.random() < 0.8) this.g.later(0.2, () => this.g.voice(me, taunt, true));
      })
      .catch(e => {
        this.jevPick = null;
        toast.error('Jev unavailable', { id: 'jev', description: `${e.name === 'AbortError' ? 'Jev took too long' : e.message}. The local CPU plays this turn.`, duration: 4500 });
      })
      .finally(() => { clearTimeout(to); this.jevWaiting = false; });
  }

  _prepare(b) {
    toast.dismiss('ai');
    const sk = this.skill;
    const plan = { ...b };
    if (plan.ang !== undefined) plan.ang += rand(-sk.angErr, sk.angErr) * (plan.weapon === 'shotgun' ? 0.4 : 1);
    if (plan.power !== undefined && plan.weapon !== 'shotgun') plan.power = clamp(plan.power + rand(-sk.powErr, sk.powErr), 0.05, 1);
    this.plan = plan;
    this.phase = 'select'; this.t = 0;
  }

  _towardEnemy() {
    const w = this.w;
    let best = null, bd = 1e9;
    for (const e of this.g.worms) if (e.alive && e.team !== w.team) {
      const d = Math.abs(e.x - w.x); if (d < bd) { bd = d; best = e; }
    }
    return best ? Math.sign(best.x - w.x) || 1 : 1;
  }

  /** After firing, shuffle away from where the blast will land. */
  _retreat(c) {
    const w = this.w, p = this.plan;
    if (!p || w.state !== 'idle') return;
    let danger = null;
    if (p.weapon === 'dynamite' || p.weapon === 'mine' || p.weapon === 'vase') danger = p.hit || { x: w.x - w.facing * 5 };
    else if (p.hit && Math.hypot(p.hit.x - w.x, p.hit.y - w.y) < 110) danger = p.hit;
    if (!danger) return;
    if (danger.x > w.x) c.left = true; else c.right = true;
  }
}

/** Convert a world angle into the worm's facing-relative aim. */
function relAim(ang, facing) {
  const x = Math.cos(ang) * facing, y = Math.sin(ang);
  return clamp(Math.atan2(y, Math.max(1e-4, x)), -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
}
