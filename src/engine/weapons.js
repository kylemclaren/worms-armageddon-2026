// ===== the arsenal =====
// Each weapon is data plus a `use` function. `use` returns what the turn should do next:
//   { retreat: seconds }  -> turn ends after a retreat window
//   { keep: true }        -> turn continues (rope, jetpack, first shotgun shell)
//   { control: entity }   -> player keeps driving the thing (sheep) until it's gone
import { Projectile, Mine, Sheep, Plane, Donkey, Armageddon, GRAV } from './entities.js';
import { sound } from './audio.js';
import { rand, TAU, clamp } from './util.js';

export const MAX_SPEED = 900;       // launch speed at full charge
const MUZZLE = 16;

function spawnFrom(worm, dist = MUZZLE) {
  const v = worm.aimVec();
  return { x: worm.x + v.x * dist, y: worm.y - 6 + v.y * dist, v };
}

function lob(g, worm, power, o) {
  const { x, y, v } = spawnFrom(worm);
  const sp = MAX_SPEED * clamp(power, 0.05, 1) * (o.speedMul || 1);
  return g.add(new Projectile({ x, y, vx: v.x * sp, vy: v.y * sp, owner: worm, ...o }));
}

/** Hitscan bullet: march a ray, stop at land or the first worm. */
function bullet(g, worm, ang, dmg, crater, knock) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const ox = worm.x + dx * 10, oy = worm.y - 6 + dy * 10;
  for (let t = 0; t < 1400; t += 2) {
    const x = ox + dx * t, y = oy + dy * t;
    for (const w of g.worms) {
      if (!w.alive || w === worm) continue;
      if (Math.abs(w.x - x) < 8 && y > w.y - 22 && y < w.y + 9) {
        w.hurt(g, dmg, worm);
        w.launch(w.vx + dx * knock, w.vy + dy * knock - knock * 0.35);
        g.fx.add({ k: 'spark', x, y, vx: -dx * 120, vy: -dy * 120 - 50, life: 0.4, t: 0, g: 400 });
        g.tracer(ox, oy, x, y);
        return;
      }
    }
    if (g.terrain.solid(x, y)) {
      g.explode(x, y, crater, 0, { by: worm, quiet: true, small: true });
      g.tracer(ox, oy, x, y);
      return;
    }
    for (const o of g.objects) if (o.onBlast && !o.dead && Math.hypot(o.x - x, o.y - y) < (o.r || 6) + 2) {
      o.onBlast(g, 1, dmg * 2, x, y); g.tracer(ox, oy, x, y); return;
    }
  }
  g.tracer(ox, oy, ox + dx * 1400, oy + dy * 1400);
}

function worldAng(worm) { const v = worm.aimVec(); return Math.atan2(v.y, v.x); }

const clusterKids = (n, r, d, vy = [-380, -220], vx = 170, impact = true, sprite = 'frag') => (g, p) => {
  for (let i = 0; i < n; i++) g.add(new Projectile({
    x: p.x, y: p.y - 4, vx: rand(-vx, vx), vy: rand(vy[0], vy[1]), r: 3, impact, radius: r, damage: d,
    owner: p.owner, sprite, size: sprite === 'icon_banana' ? 16 : 7, spinRate: 10, bounce: 0.5, sfx: 'explosion_small',
    fuse: impact ? 0 : rand(1.2, 2.2),
  }));
};

export const WEAPONS = [
  { id: 'bazooka', name: 'Bazooka', icon: 'icon_bazooka', ammo: Infinity, charge: true, wind: true,
    use(g, w, a) {
      sound.at('bazooka_fire', w.x, g.cam);
      lob(g, w, a.power, { sprite: 'shell', r: 3, wind: 1, impact: true, hitsWorms: true, radius: 48, damage: 50, trail: true });
      return { retreat: 3 };
    } },
  { id: 'homing', name: 'Homing Missile', icon: 'icon_homing', ammo: 2, charge: true, needsTarget: true,
    use(g, w, a) {
      sound.at('bazooka_fire', w.x, g.cam); sound.sfx('homing_lock', { vol: 0.6 });
      lob(g, w, a.power, { sprite: 'icon_homing', size: 16, spriteRot: Math.PI / 4, r: 3, impact: true, hitsWorms: true,
        radius: 48, damage: 50, trail: true, homing: true, target: { ...a.target } });
      return { retreat: 3 };
    } },
  { id: 'grenade', name: 'Grenade', icon: 'icon_grenade', ammo: Infinity, charge: true, fuse: true,
    use(g, w, a) {
      lob(g, w, a.power, { sprite: 'icon_grenade', size: 13, r: 3.5, impact: false, fuse: a.fuse, bounce: 0.52, friction: 0.82,
        radius: 48, damage: 50, spinRate: 8, bounceSfx: 'grenade_bounce', showFuse: true, speedMul: 0.95 });
      return { retreat: 3 };
    } },
  { id: 'cluster', name: 'Cluster Bomb', icon: 'icon_cluster', ammo: 5, charge: true, fuse: true,
    use(g, w, a) {
      lob(g, w, a.power, { sprite: 'icon_cluster', size: 14, r: 3.5, impact: false, fuse: a.fuse, bounce: 0.5,
        radius: 30, damage: 25, spinRate: 7, bounceSfx: 'grenade_bounce', showFuse: true, speedMul: 0.95,
        onExplode: clusterKids(5, 24, 22) });
      return { retreat: 3 };
    } },
  { id: 'banana', name: 'Banana Bomb', icon: 'icon_banana', ammo: 1, charge: true, fuse: true,
    use(g, w, a) {
      sound.at('banana', w.x, g.cam, { vol: 0.8 });
      lob(g, w, a.power, { sprite: 'icon_banana', size: 18, r: 4, impact: false, fuse: a.fuse, bounce: 0.6,
        radius: 70, damage: 75, spinRate: 9, bounceSfx: 'banana', showFuse: true, speedMul: 0.95,
        onExplode: clusterKids(5, 58, 50, [-620, -380], 260, true, 'icon_banana') });
      return { retreat: 3 };
    } },
  { id: 'hhg', name: 'Holy Hand Grenade', icon: 'icon_hhg', ammo: 1, charge: true,
    use(g, w, a) {
      lob(g, w, a.power, { sprite: 'icon_hhg', size: 18, r: 4.5, impact: false, fuse: 3, bounce: 0.18, friction: 0.5,
        radius: 110, damage: 100, holy: true, spinRate: 4, bounceSfx: 'grenade_bounce', showFuse: true, speedMul: 0.9, sfx: 'explosion_big' });
      return { retreat: 5 };
    } },
  { id: 'shotgun', name: 'Shotgun', icon: 'icon_shotgun', ammo: Infinity, shots: 2,
    use(g, w, a) {
      sound.at('shotgun', w.x, g.cam);
      bullet(g, w, worldAng(w), 25, 13, 260);
      g.cam.shake = Math.max(g.cam.shake, 3);
      return a.shot < 2 ? { keep: true, again: true } : { retreat: 3 };
    } },
  { id: 'minigun', name: 'Minigun', icon: 'icon_minigun', ammo: 1,
    use(g, w) {
      sound.at('minigun', w.x, g.cam);
      const base = worldAng(w);
      for (let i = 0; i < 24; i++) g.later(i * 0.05, () => {
        if (!w.alive) return;
        bullet(g, w, base + rand(-0.09, 0.09), 3, 6, 70);
        g.cam.shake = Math.max(g.cam.shake, 1.5);
      });
      return { retreat: 3, delay: 1.2 };
    } },
  { id: 'firepunch', name: 'Fire Punch', icon: 'icon_firepunch', ammo: Infinity,
    use(g, w) {
      sound.at('firepunch', w.x, g.cam);
      for (const o of g.worms) {
        if (!o.alive || o === w) continue;
        const dx = (o.x - w.x) * w.facing;
        if (dx > -2 && dx < 24 && Math.abs(o.y - w.y) < 18) {
          o.hurt(g, 30, w); o.launch(w.facing * 170, -470);
        }
      }
      w.state = 'punch'; w.punchT = 0.33; w.rest = false;
      for (let i = 0; i < 12; i++) g.fx.add({ k: 'fire', x: w.x + w.facing * 6, y: w.y - 4, vx: rand(-30, 30), vy: rand(20, 90),
        r: rand(3, 6), life: rand(0.3, 0.6), t: 0, drag: 2 });
      return { retreat: 3 };
    } },
  { id: 'bat', name: 'Baseball Bat', icon: 'icon_bat', ammo: 1,
    use(g, w) {
      sound.at('bat', w.x, g.cam);
      const v = w.aimVec();
      let hit = false;
      for (const o of g.worms) {
        if (!o.alive || o === w) continue;
        const dx = (o.x - w.x) * w.facing;
        if (dx > -2 && dx < 26 && Math.abs(o.y - w.y) < 20) {
          o.hurt(g, 30, w); o.launch(v.x * 720, v.y * 720 - 60); hit = true;
        }
      }
      if (hit) g.cam.shake = 4;
      return { retreat: 3 };
    } },
  { id: 'dynamite', name: 'Dynamite', icon: 'icon_dynamite', ammo: 1,
    use(g, w) {
      sound.at('fuse', w.x, g.cam, { vol: 0.7 });
      g.add(new Projectile({ x: w.x + w.facing * 6, y: w.y - 4, vx: w.facing * 30, vy: -60, r: 4, impact: false, fuse: 5,
        bounce: 0.1, friction: 0.4, radius: 85, damage: 75, owner: w, sprite: 'icon_dynamite', size: 18, showFuse: true, sfx: 'explosion_big' }));
      return { retreat: 5 };
    } },
  { id: 'mine', name: 'Mine', icon: 'icon_mine', ammo: 2,
    use(g, w) {
      g.add(new Mine(w.x + w.facing * 6, w.y - 4, 2)).vx = w.facing * 30;
      return { retreat: 5 };
    } },
  { id: 'sheep', name: 'Sheep', icon: 'icon_sheep', ammo: 1,
    use(g, w) {
      sound.at('sheep', w.x, g.cam);
      const s = g.add(new Sheep(w, w.x + w.facing * 8, w.y - 4, w.facing));
      return { control: s, hint: 'SPACE to detonate the sheep' };
    } },
  { id: 'airstrike', name: 'Air Strike', icon: 'icon_airstrike', ammo: 1, needsTarget: true, instant: true,
    use(g, w, a) {
      g.add(new Plane(g, a.target.x, w.facing, w, { n: 5, radius: 30, damage: 30 }));
      return { retreat: 3 };
    } },
  { id: 'armageddon', name: 'Armageddon', icon: 'icon_armageddon', ammo: 0, super: true,
    use(g, w) { g.add(new Armageddon(g, w)); return { retreat: 0 }; } },
  { id: 'donkey', name: 'Concrete Donkey', icon: 'icon_donkey', ammo: 0, super: true, needsTarget: true, instant: true,
    use(g, w, a) { g.add(new Donkey(a.target.x, w)); return { retreat: 3 }; } },
  { id: 'rope', name: 'Ninja Rope', icon: 'icon_rope', ammo: 5, util: true,
    use(g, w) { return g.fireRope(w) ? { keep: true, noAmmo: false } : { keep: true, noAmmo: true }; } },
  { id: 'jetpack', name: 'Jet Pack', icon: 'icon_jetpack', ammo: 1, util: true,
    use(g, w) { g.startJet(w); return { keep: true }; } },
  { id: 'teleport', name: 'Teleport', icon: 'icon_teleport', ammo: 2, util: true, needsTarget: true, instant: true,
    use(g, w, a) {
      g.fx.sparkle(w.x, w.y - 8, 24);
      sound.at('teleport', w.x, g.cam);
      w.x = a.target.x; w.y = a.target.y; w.vx = w.vy = 0; w.state = 'air'; w.rest = false; w.noFallDmg = true;
      g.fx.sparkle(w.x, w.y - 8, 24);
      return { retreat: 0 };
    } },
  { id: 'girder', name: 'Girder', icon: 'icon_girder', ammo: 3, util: true, needsTarget: true, instant: true,
    use(g, w, a) {
      g.terrain.addGirder(a.target.x, a.target.y, g.girderAng);
      sound.at('girder', a.target.x, g.cam);
      return { retreat: 3 };
    } },
  { id: 'blowtorch', name: 'Blowtorch', icon: 'icon_blowtorch', ammo: 1, util: true,
    use(g, w) { g.startTorch(w); return { control: g.torch, hint: 'Tunnelling...' }; } },
  { id: 'skipgo', name: 'Skip Go', icon: 'icon_skipgo', ammo: Infinity, util: true,
    use(g, w) { sound.sfx('skip'); g.voice(w, 'boring'); return { retreat: 0, skip: true }; } },
  { id: 'surrender', name: 'Surrender', icon: 'icon_surrender', ammo: Infinity, util: true,
    use(g, w) { g.surrender(w.team); return { retreat: 0, skip: true }; } },
];

export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map(w => [w.id, w]));

export const CRATE_WEAPONS = [
  ['banana', 3], ['hhg', 2], ['sheep', 4], ['airstrike', 4], ['homing', 4], ['cluster', 4], ['dynamite', 4],
  ['minigun', 3], ['armageddon', 1], ['donkey', 1], ['mine', 3], ['bat', 3],
];
export const CRATE_UTILS = [['teleport', 3], ['rope', 3], ['jetpack', 3], ['girder', 3], ['blowtorch', 2]];

export function weighted(list) {
  const tot = list.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * tot;
  for (const [id, w] of list) { if ((r -= w) <= 0) return id; }
  return list[0][0];
}

void GRAV; void TAU;
