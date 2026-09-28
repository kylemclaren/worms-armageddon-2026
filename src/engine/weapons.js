// ===== the arsenal =====
// Each weapon is data plus a `use` function. `use` returns what the turn should do next:
//   { retreat: seconds }  -> turn ends after a retreat window
//   { keep: true }        -> turn continues (rope, jetpack, first shotgun shell)
//   { control: entity }   -> player keeps driving the thing (sheep) until it's gone
import { Projectile, Mine, Sheep, Plane, Donkey, Armageddon, GRAV } from './entities.js';
import { Pigeon, Walker, SuperSheep, Arrow, Fireball, Kamikaze, Quake, spawnFlames } from './critters.js';
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
  { id: 'bazooka', name: 'Bazooka', icon: 'icon_bazooka', ammo: Infinity, charge: true, wind: true, hold: { len: 32, at: [0.42, 0.62] },
    use(g, w, a) {
      sound.at('bazooka_fire', w.x, g.cam);
      lob(g, w, a.power, { sprite: 'shell', r: 3, wind: 1, impact: true, hitsWorms: true, radius: 48, damage: 50, trail: true });
      return { retreat: 3 };
    } },
  { id: 'homing', name: 'Homing Missile', icon: 'icon_homing', ammo: 2, charge: true, needsTarget: true, hold: { icon: 'icon_bazooka', len: 32, at: [0.42, 0.62] },
    use(g, w, a) {
      sound.at('bazooka_fire', w.x, g.cam); sound.sfx('homing_lock', { vol: 0.6 });
      lob(g, w, a.power, { sprite: 'icon_homing', size: 16, spriteRot: Math.PI / 4, r: 3, impact: true, hitsWorms: true,
        radius: 48, damage: 50, trail: true, homing: true, target: { ...a.target } });
      return { retreat: 3 };
    } },
  { id: 'grenade', name: 'Grenade', icon: 'icon_grenade', ammo: Infinity, charge: true, fuse: true, hold: { up: true, len: 15 },
    use(g, w, a) {
      lob(g, w, a.power, { sprite: 'icon_grenade', size: 13, r: 3.5, impact: false, fuse: a.fuse, bounce: 0.52, friction: 0.82,
        radius: 48, damage: 50, spinRate: 8, bounceSfx: 'grenade_bounce', showFuse: true, speedMul: 0.95 });
      return { retreat: 3 };
    } },
  { id: 'cluster', name: 'Cluster Bomb', icon: 'icon_cluster', ammo: 5, charge: true, fuse: true, hold: { up: true, len: 17 },
    use(g, w, a) {
      lob(g, w, a.power, { sprite: 'icon_cluster', size: 14, r: 3.5, impact: false, fuse: a.fuse, bounce: 0.5,
        radius: 30, damage: 25, spinRate: 7, bounceSfx: 'grenade_bounce', showFuse: true, speedMul: 0.95,
        onExplode: clusterKids(5, 24, 22) });
      return { retreat: 3 };
    } },
  { id: 'banana', name: 'Banana Bomb', icon: 'icon_banana', ammo: 1, charge: true, fuse: true, hold: { up: true, len: 19 },
    use(g, w, a) {
      sound.at('banana', w.x, g.cam, { vol: 0.8 });
      lob(g, w, a.power, { sprite: 'icon_banana', size: 18, r: 4, impact: false, fuse: a.fuse, bounce: 0.6,
        radius: 70, damage: 75, spinRate: 9, bounceSfx: 'banana', showFuse: true, speedMul: 0.95,
        onExplode: clusterKids(5, 58, 50, [-620, -380], 260, true, 'icon_banana') });
      return { retreat: 3 };
    } },
  { id: 'hhg', name: 'Holy Hand Grenade', icon: 'icon_hhg', ammo: 1, charge: true, hold: { up: true, len: 19 },
    use(g, w, a) {
      lob(g, w, a.power, { sprite: 'icon_hhg', size: 18, r: 4.5, impact: false, fuse: 3, bounce: 0.18, friction: 0.5,
        radius: 110, damage: 100, holy: true, spinRate: 4, bounceSfx: 'grenade_bounce', showFuse: true, speedMul: 0.9, sfx: 'explosion_big' });
      return { retreat: 5 };
    } },
  { id: 'shotgun', name: 'Shotgun', icon: 'icon_shotgun', ammo: Infinity, shots: 2, hold: { len: 32, at: [0.36, 0.7] },
    use(g, w, a) {
      sound.at('shotgun', w.x, g.cam);
      bullet(g, w, worldAng(w), 25, 13, 260);
      g.cam.shake = Math.max(g.cam.shake, 3);
      return a.shot < 2 ? { keep: true, again: true } : { retreat: 3 };
    } },
  { id: 'minigun', name: 'Minigun', icon: 'icon_minigun', ammo: 1, hold: { len: 30, at: [0.4, 0.6] },
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
  { id: 'firepunch', name: 'Fire Punch', icon: 'icon_firepunch', ammo: Infinity, hold: null,
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
  { id: 'bat', name: 'Baseball Bat', icon: 'icon_bat', ammo: 1, hold: { len: 27, at: [0.2, 0.84], rot0: -0.82 },
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
  { id: 'dynamite', name: 'Dynamite', icon: 'icon_dynamite', ammo: 1, hold: { up: true, len: 18 },
    use(g, w) {
      sound.at('fuse', w.x, g.cam, { vol: 0.7 });
      g.add(new Projectile({ x: w.x + w.facing * 6, y: w.y - 4, vx: w.facing * 30, vy: -60, r: 4, impact: false, fuse: 5,
        bounce: 0.1, friction: 0.4, radius: 85, damage: 75, owner: w, sprite: 'icon_dynamite', size: 18, showFuse: true, sfx: 'explosion_big' }));
      return { retreat: 5 };
    } },
  { id: 'mine', name: 'Mine', icon: 'icon_mine', ammo: 2, hold: { up: true, len: 16 },
    use(g, w) {
      g.add(new Mine(w.x + w.facing * 6, w.y - 4, 2)).vx = w.facing * 30;
      return { retreat: 5 };
    } },
  { id: 'sheep', name: 'Sheep', icon: 'icon_sheep', ammo: 1, hold: { up: true, len: 25 },
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
  { id: 'armageddon', name: 'Armageddon', icon: 'icon_armageddon', ammo: 0, super: true, hold: null,
    use(g, w) { g.add(new Armageddon(g, w)); return { retreat: 0 }; } },
  { id: 'donkey', name: 'Concrete Donkey', icon: 'icon_donkey', ammo: 0, super: true, needsTarget: true, instant: true,
    use(g, w, a) { g.add(new Donkey(a.target.x, w)); return { retreat: 3 }; } },
  // ---------------------------------------------------------------- second wave
  { id: 'mortar', name: 'Mortar', icon: 'icon_mortar', ammo: 3, wind: true, hold: { len: 29, at: [0.4, 0.6] },
    use(g, w) {
      sound.at('mortar', w.x, g.cam);
      lob(g, w, 0.8, { sprite: 'shell', r: 3, wind: 1, impact: true, hitsWorms: true, radius: 30, damage: 22, trail: true,
        onExplode: clusterKids(6, 22, 16, [-300, -160], 150) });
      return { retreat: 3 };
    } },
  { id: 'pigeon', name: 'Homing Pigeon', icon: 'icon_pigeon', ammo: 1, needsTarget: true, hold: { up: true, len: 21 },
    use(g, w, a) {
      sound.at('pigeon', w.x, g.cam);
      const { x, y } = spawnFrom(w, 12);
      g.add(new Pigeon(w, x, y - 6, { ...a.target }));
      return { retreat: 3 };
    } },
  { id: 'petrol', name: 'Petrol Bomb', icon: 'icon_petrol', ammo: 1, charge: true, hold: { len: 18, at: [0.3, 0.55] },
    use(g, w, a) {
      lob(g, w, a.power, { sprite: 'icon_petrol', size: 15, r: 3, impact: true, hitsWorms: true, radius: 20, damage: 10, spinRate: 9,
        speedMul: 0.9, sfx: 'petrol', onExplode: (g, p) => spawnFlames(g, p.x, p.y, 12, 170) });
      return { retreat: 3 };
    } },
  { id: 'handgun', name: 'Handgun', icon: 'icon_handgun', ammo: 2, hold: { len: 16, at: [0.28, 0.72] },
    use(g, w) {
      const base = worldAng(w);
      for (let i = 0; i < 6; i++) g.later(i * 0.22, () => {
        if (!w.alive) return;
        sound.at('handgun', w.x, g.cam, { vol: 0.8, rate: rand(0.95, 1.08) });
        bullet(g, w, base + rand(-0.025, 0.025), 5, 7, 110);
        g.cam.shake = Math.max(g.cam.shake, 1.5);
      });
      return { retreat: 3, delay: 1.3 };
    } },
  { id: 'uzi', name: 'Uzi', icon: 'icon_uzi', ammo: 2, hold: { len: 20, at: [0.34, 0.72] },
    use(g, w) {
      sound.at('uzi', w.x, g.cam);
      const base = worldAng(w);
      for (let i = 0; i < 10; i++) g.later(i * 0.08, () => {
        if (!w.alive) return;
        bullet(g, w, base + rand(-0.06, 0.06), 5, 6, 80);
        g.cam.shake = Math.max(g.cam.shake, 1.2);
      });
      return { retreat: 3, delay: 0.9 };
    } },
  { id: 'longbow', name: 'Longbow', icon: 'icon_longbow', ammo: 2, shots: 2, hold: { len: 27, at: [0.5, 0.5] },
    use(g, w, a) {
      sound.at('bow', w.x, g.cam);
      const { x, y, v } = spawnFrom(w, 14);
      g.add(new Arrow(w, x, y, v.x * 820, v.y * 820));
      return a.shot < 2 ? { keep: true, again: true } : { retreat: 3 };
    } },
  { id: 'dragonball', name: 'Dragon Ball', icon: 'icon_dragonball', ammo: 1, hold: { up: true, len: 13, glow: true },
    use(g, w) {
      sound.at('dragonball', w.x, g.cam);
      g.add(new Fireball(w, w.x + w.facing * 12, w.y - 4, w.facing));
      return { retreat: 3 };
    } },
  { id: 'kamikaze', name: 'Kamikaze', icon: 'icon_kamikaze', ammo: 1, hold: null,
    use(g, w) {
      sound.at('kamikaze', w.x, g.cam);
      const v = w.aimVec();
      g.add(new Kamikaze(w, v.x, v.y));
      g.cam.follow(w);
      return { retreat: 0 };
    } },
  { id: 'prod', name: 'Prod', icon: 'icon_prod', ammo: Infinity, hold: null,
    use(g, w) {
      sound.at('prod', w.x, g.cam);
      for (const o of g.worms) {
        if (!o.alive || o === w) continue;
        const dx = (o.x - w.x) * w.facing;
        if (dx > -2 && dx < 22 && Math.abs(o.y - w.y) < 18) o.launch(w.facing * 150, -130);
      }
      return { retreat: 3 };
    } },
  { id: 'axe', name: 'Battle Axe', icon: 'icon_axe', ammo: 1, hold: { up: true, len: 27 },
    use(g, w) {
      sound.at('axe', w.x, g.cam);
      for (const o of g.worms) {
        if (!o.alive || o === w) continue;
        const dx = (o.x - w.x) * w.facing;
        if (dx > -2 && dx < 24 && Math.abs(o.y - w.y) < 20) {
          o.hurt(g, Math.max(1, Math.floor(o.hp / 2)), w); o.launch(w.facing * 50, -90);
          g.cam.shake = Math.max(g.cam.shake, 5);
        }
      }
      return { retreat: 3 };
    } },
  { id: 'vase', name: 'Ming Vase', icon: 'icon_vase', ammo: 1, hold: { up: true, len: 20 },
    use(g, w) {
      g.add(new Projectile({ x: w.x + w.facing * 6, y: w.y - 4, vx: w.facing * 30, vy: -60, r: 4, impact: false, fuse: 5,
        bounce: 0.1, friction: 0.4, radius: 75, damage: 75, owner: w, sprite: 'icon_vase', size: 20, showFuse: true, sfx: 'explosion_big',
        onExplode: (g, p) => { sound.at('vase', p.x, g.cam); clusterKids(3, 44, 35, [-460, -280], 200)(g, p); } }));
      return { retreat: 5 };
    } },
  { id: 'supersheep', name: 'Super Sheep', icon: 'icon_supersheep', ammo: 1, hold: { up: true, icon: 'icon_sheep', len: 25 },
    use(g, w) {
      sound.at('sheep', w.x, g.cam);
      const s = g.add(new SuperSheep(w, w.x + w.facing * 8, w.y - 4, w.facing));
      return { control: s, hint: 'SPACE to take off' };
    } },
  { id: 'oldwoman', name: 'Old Woman', icon: 'icon_oldwoman', ammo: 1, hold: null,
    use(g, w) {
      sound.at('oldwoman', w.x, g.cam);
      g.add(new Walker(w, 'oldwoman', w.x + w.facing * 10, w.y - 4, w.facing));
      return { retreat: 3 };
    } },
  { id: 'madcow', name: 'Mad Cow', icon: 'icon_madcow', ammo: 1, hold: null,
    use(g, w) {
      for (let i = 0; i < 2; i++) g.later(i * 0.7, () => {
        sound.at('cow', w.x, g.cam, { rate: rand(0.9, 1.1) });
        g.add(new Walker(w, 'madcow', w.x + w.facing * 10, w.y - 6, w.facing));
      });
      return { retreat: 3, delay: 0.8 };
    } },
  { id: 'napalm', name: 'Napalm Strike', icon: 'icon_napalm', ammo: 0, needsTarget: true, instant: true,
    use(g, w, a) {
      g.add(new Plane(g, a.target.x, w.facing, w, { n: 5, radius: 16, damage: 8, drop: (g, x, y, dir) => g.add(new Projectile({
        x, y, vx: dir * 120, vy: 60, r: 3, wind: 1, impact: true, hitsWorms: true, radius: 16, damage: 8, owner: w,
        sprite: 'icon_napalm', size: 13, spriteRot: 0, sfx: 'napalm', onExplode: (g, p) => spawnFlames(g, p.x, p.y, 7, 120) })) }));
      return { retreat: 3 };
    } },
  { id: 'minestrike', name: 'Mine Strike', icon: 'icon_minestrike', ammo: 0, needsTarget: true, instant: true,
    use(g, w, a) {
      g.add(new Plane(g, a.target.x, w.facing, w, { n: 5, radius: 0, damage: 0, gap: 30, drop: (g, x, y, dir) => {
        const m = g.add(new Mine(x, y, 1.6)); m.vx = dir * 90; m.vy = 40;
      } }));
      return { retreat: 3 };
    } },
  { id: 'sheepstrike', name: 'Sheep Strike', icon: 'icon_sheepstrike', ammo: 0, needsTarget: true, instant: true,
    use(g, w, a) {
      g.add(new Plane(g, a.target.x, w.facing, w, { n: 4, radius: 46, damage: 40, gap: 34, drop: (g, x, y, dir) => {
        sound.at('sheep', x, g.cam, { vol: 0.5, rate: rand(1, 1.3) });
        g.add(new Projectile({ x, y, vx: dir * 130, vy: 40, r: 6, impact: true, hitsWorms: true, radius: 46, damage: 40, owner: w,
          sprite: 'icon_sheep', size: 22, spinRate: 5, sfx: 'explosion_med' }));
      } }));
      return { retreat: 3 };
    } },
  { id: 'quake', name: 'Earthquake', icon: 'icon_quake', ammo: 0, hold: null,
    use(g) { g.add(new Quake(g)); return { retreat: 0 }; } },
  { id: 'scales', name: 'Scales of Justice', icon: 'icon_scales', ammo: 0, hold: null,
    use(g, w) {
      sound.sfx('scales', { vol: 0.9 });
      const teams = g.aliveTeams();
      const total = teams.reduce((s, t) => s + g.teamHp(t), 0);
      for (const t of teams) {
        const alive = t.worms.filter(x => x.alive), share = total / teams.length / alive.length;
        for (const x of alive) { x.hp = Math.max(1, Math.round(share)); g.fx.sparkle(x.x, x.y - 10, 12, '255,230,120'); }
      }
      g.ui.refreshTeams();
      return { retreat: 3 };
    } },
  { id: 'drill', name: 'Pneumatic Drill', icon: 'icon_drill', ammo: 2, util: true, hold: null,
    use(g, w) { g.startTorch(w, { down: true }); return { control: g.torch, hint: 'Drilling...' }; } },
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
  ['pigeon', 3], ['mortar', 3], ['petrol', 3], ['uzi', 3], ['longbow', 2], ['dragonball', 2], ['kamikaze', 2],
  ['axe', 2], ['vase', 2], ['supersheep', 3], ['oldwoman', 2], ['madcow', 2], ['napalm', 3], ['minestrike', 2],
  ['sheepstrike', 2], ['quake', 1], ['scales', 1],
];
export const CRATE_UTILS = [['teleport', 3], ['rope', 3], ['jetpack', 3], ['girder', 3], ['blowtorch', 2], ['drill', 2]];

export function weighted(list) {
  const tot = list.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * tot;
  for (const [id, w] of list) { if ((r -= w) <= 0) return id; }
  return list[0][0];
}

void GRAV; void TAU;
