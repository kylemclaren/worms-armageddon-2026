// ===== second arsenal wave: pigeons, grannies, cows, super sheep, arrows, quakes =====
// Same contract as entities.js: update(g, dt) runs on the host only, draw(c, g) runs
// everywhere (guests rebuild these from snapshots, so draw() may only read fields
// that net.js sends for the type).
import { TAU, clamp, rand } from './util.js';
import { images } from './assets.js';
import { sound } from './audio.js';
import { GRAV, stepBody, drawSprite, Sheep, Flame } from './entities.js';

const hitWorm = (g, x, y, r, skip) => g.worms.find(w => w.alive && w !== skip && Math.abs(w.x - x) < 9 + r && y > w.y - 24 && y < w.y + 10);

// ============================================================ HOMING PIGEON

/** Flies to the clicked point, feeling its way round land instead of ploughing into it. */
export class Pigeon {
  constructor(owner, x, y, target) {
    Object.assign(this, { type: 'pigeon', owner, x, y, target, t: 0, r: 4, speed: 240, stuck: 0 });
    this.ang = Math.atan2(target.y - y, target.x - x);
    this.vx = Math.cos(this.ang) * this.speed; this.vy = Math.sin(this.ang) * this.speed;
  }
  get follow() { return true; }
  busy() { return !this.dead; }
  _clear(g, a, d) {
    const T = g.terrain, cx = Math.cos(a), cy = Math.sin(a);
    for (let s = 6; s <= d; s += 4) if (T.hitCircle(this.x + cx * s, this.y + cy * s, this.r + 2)) return false;
    return true;
  }
  update(g, dt) {
    if (this.dead) return;
    this.t += dt;
    const tx = this.target.x, ty = this.target.y;
    const dist = Math.hypot(tx - this.x, ty - this.y);
    if (dist < 12 || this.t > 11) return this.boom(g);
    // steer toward the target, or the nearest free heading around it when land is in the way
    const want = Math.atan2(ty - this.y, tx - this.x);
    const look = Math.min(46, dist);
    let pick = null;
    for (const off of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.45, -1.45, 1.9, -1.9, 2.5, -2.5, Math.PI]) {
      // prefer turning the way we're already banking so it doesn't dither at a wall
      const a = want + off * (this._side || 1);
      if (this._clear(g, a, look)) { pick = a; if (off) this._side = Math.sign(off) * (this._side || 1); break; }
    }
    if (pick == null) { this.stuck += dt; pick = this.ang + Math.PI * 0.5; } else this.stuck = 0;
    if (this.stuck > 0.6) return this.boom(g);
    let d = pick - this.ang;
    while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
    this.ang += clamp(d, -5.5 * dt, 5.5 * dt);
    this.vx = Math.cos(this.ang) * this.speed; this.vy = Math.sin(this.ang) * this.speed;
    const n = Math.max(1, Math.ceil(this.speed * dt / 2));
    for (let i = 0; i < n; i++) {
      const nx = this.x + this.vx * dt / n, ny = this.y + this.vy * dt / n;
      if (g.terrain.hitCircle(nx, ny, this.r)) { this.stuck += dt / n; break; }
      this.x = nx; this.y = ny;
    }
    if (this.y > g.waterY) { this.dead = true; g.fx.splash(this.x, g.waterY, 0.7); sound.at('splash', this.x, g.cam, { vol: 0.5 }); }
    if (Math.random() < 0.05) g.fx.add({ k: 'smoke', x: this.x, y: this.y, vx: 0, vy: 10, r: 2, life: 0.5, t: 0, drag: 1, grow: 3, light: true });
  }
  boom(g) {
    if (this.dead) return;
    this.dead = true;
    g.explode(this.x, this.y, 56, 60, { by: this.owner });
    g.fx.debris(this.x, this.y, 16, ['#cfd6e4', '#9aa6bd', '#ffffff', '#7d8aa3']);
  }
  draw(c) {
    if (this.dead) return;
    const img = images.icon_pigeon;
    const left = this.vx < 0;
    const flap = Math.sin(this.t * 24);
    const a = Math.atan2(this.vy, Math.abs(this.vx)) * 0.5 * (left ? -1 : 1);
    if (!img) { c.fillStyle = '#9aa6bd'; c.beginPath(); c.arc(this.x, this.y, 5, 0, TAU); c.fill(); return; }
    c.save();
    c.translate(this.x, this.y); c.rotate(a); c.scale(left ? -1 : 1, 1 + flap * 0.12);
    drawSprite(c, img, 0, 0, 18);
    c.restore();
  }
}

// ============================================================ WALKERS

export const WALKER = {
  oldwoman: { icon: 'icon_oldwoman', h: 26, speed: 30, fuse: 5.5, R: 70, D: 60, sfx: 'oldwoman', wallBoom: false },
  madcow: { icon: 'icon_madcow', h: 24, speed: 58, fuse: 6, R: 56, D: 50, sfx: 'cow', wallBoom: true },
};

/** Old Woman / Mad Cow: plods along the ground, turns (or blows) at walls, fuse runs out. */
export class Walker {
  constructor(owner, kind, x, y, dir) {
    Object.assign(this, { type: 'walker', owner, kind, x, y, vx: dir * 40, vy: -120, dir, r: 7, t: 0, rest: false,
      bounce: 0.1, friction: 0.6, acc: 0, turns: 0, noise: rand(0.8, 1.6) });
  }
  get follow() { return true; }
  busy() { return !this.dead; }
  update(g, dt) {
    if (this.dead) return;
    const K = WALKER[this.kind];
    this.t += dt;
    if (this.t > K.fuse) return this.boom(g);
    if ((this.noise -= dt) <= 0) { this.noise = rand(1.6, 2.8); sound.at(K.sfx, this.x, g.cam, { vol: 0.6, rate: rand(0.95, 1.1) }); }
    const T = g.terrain;
    if (!this.rest) {
      stepBody(g, this, dt);
    } else if (!T.hitCircle(this.x, this.y + 2, this.r)) {
      this.rest = false; this.vx = this.dir * 30; this.vy = 0;
    } else {
      this.acc += K.speed * dt;
      while (this.acc >= 1 && this.rest) {
        this.acc -= 1;
        const nx = this.x + this.dir;
        let ny = this.y, k = 0;
        while (T.hitCircle(nx, ny, this.r) && k < 5) { ny--; k++; }
        if (T.hitCircle(nx, ny, this.r)) {                     // a wall
          if (K.wallBoom && this.t > 0.6) return this.boom(g);
          this.dir *= -1; this.acc = 0; this.turns++;
          break;
        }
        let d = 0;
        while (!T.hitCircle(nx, ny + 1, this.r) && d < 8) { ny++; d++; }
        this.x = nx; this.y = ny;
        if (d >= 8) { this.rest = false; this.vx = this.dir * 40; this.vy = 0; }
      }
    }
    if (this.y > g.waterY) { this.dead = true; g.fx.splash(this.x, g.waterY, 0.9); sound.at('splash', this.x, g.cam); }
    if (this.x < -150 || this.x > T.w + 150) this.dead = true;
  }
  boom(g) {
    if (this.dead) return;
    const K = WALKER[this.kind];
    this.dead = true;
    g.explode(this.x, this.y - 4, K.R, K.D, { by: this.owner, sfx: 'explosion_big' });
    g.fx.debris(this.x, this.y, 18, this.kind === 'madcow' ? ['#ffffff', '#222222', '#f2a6b8'] : ['#b9a3d9', '#e8e0f0', '#8f7ab5']);
  }
  draw(c) {
    if (this.dead) return;
    const K = WALKER[this.kind], img = images[K.icon];
    const step = Math.sin(this.t * (this.kind === 'madcow' ? 16 : 11));
    if (!img) { c.fillStyle = '#ccc'; c.fillRect(this.x - 6, this.y - 14, 12, 18); return; }
    c.save();
    c.translate(this.x, this.y + this.r);
    c.rotate(this.rest ? step * 0.07 : 0);
    c.scale(this.dir, 1);
    const w = img.width * (K.h / img.height);
    c.drawImage(img, -w / 2, -K.h - Math.abs(step) * 1.5 + 2, w, K.h);
    c.restore();
    // fuse spark on the last seconds
    if (K.fuse - this.t < 2 && (this.t * 8 | 0) % 2) {
      c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(this.x, this.y - K.h - 2, 2, 0, TAU); c.fill();
    }
  }
}

// ============================================================ SUPER SHEEP

/** Hops like a sheep until you press fire, then flies where you steer it. */
export class SuperSheep extends Sheep {
  constructor(owner, x, y, dir) {
    super(owner, x, y, dir);
    Object.assign(this, { type: 'supersheep', flying: false, ang: 0, flyT: 0, life: 30 });
  }
  get follow() { return true; }
  control(g, c, dt) {
    if (c.firePressed) {
      if (!this.flying) {
        this.flying = true; this.ang = -Math.PI / 2 + this.dir * 0.35; this.rest = false;
        sound.at('whoosh', this.x, g.cam, { vol: 0.8 }); sound.at('sheep', this.x, g.cam, { vol: 0.8, rate: 1.2 });
        g.ui.hint('← → to steer · SPACE to detonate', 3);
      } else this.boom(g);
    }
    if (this.flying) this.ang += ((c.right ? 1 : 0) - (c.left ? 1 : 0)) * 3.4 * dt;
  }
  update(g, dt) {
    if (this.dead) return;
    if (!this.flying) return super.update(g, dt);
    this.t += dt; this.flyT += dt;
    if (this.flyT > 16) return this.boom(g);
    const sp = 300;
    this.vx = Math.cos(this.ang) * sp; this.vy = Math.sin(this.ang) * sp;
    const n = Math.max(1, Math.ceil(sp * dt / 2));
    for (let i = 0; i < n; i++) {
      this.x += this.vx * dt / n; this.y += this.vy * dt / n;
      if (g.terrain.hitCircle(this.x, this.y, 6) || (this.flyT > 0.3 && hitWorm(g, this.x, this.y, 4))) return this.boom(g);
    }
    if (Math.random() < 0.5) g.fx.add({ k: 'smoke', x: this.x - this.vx * 0.03, y: this.y - this.vy * 0.03, vx: 0, vy: 0, r: 2.5, life: 0.5, t: 0, drag: 1, grow: 4, light: true });
    if (this.y > g.waterY) { this.dead = true; g.fx.splash(this.x, g.waterY, 1.1); sound.at('splash', this.x, g.cam); }
    if (this.x < -300 || this.x > g.terrain.w + 300 || this.y < -900) this.dead = true;
  }
  draw(c, g) {
    if (this.dead) return;
    if (!this.flying) return super.draw(c, g);
    const img = images.icon_supersheep || images.icon_sheep;
    const left = Math.cos(this.ang) < 0;
    c.save();
    c.translate(this.x, this.y);
    c.rotate(left ? this.ang - Math.PI : this.ang);
    if (left) c.scale(-1, 1);
    drawSprite(c, img, 0, 0, 26);
    c.restore();
  }
}

// ============================================================ ARROW

export class Arrow {
  constructor(owner, x, y, vx, vy) {
    Object.assign(this, { type: 'arrow', owner, x, y, vx, vy, rot: Math.atan2(vy, vx), stuck: false, t: 0 });
  }
  get follow() { return !this.stuck; }
  busy() { return !this.dead && !this.stuck; }
  update(g, dt) {
    if (this.dead) return;
    this.t += dt;
    if (this.stuck) { if (this.t > 14) this.dead = true; return; }
    this.vy += GRAV * 0.35 * dt;
    const n = Math.max(1, Math.ceil(Math.hypot(this.vx, this.vy) * dt / 2));
    for (let i = 0; i < n; i++) {
      this.x += this.vx * dt / n; this.y += this.vy * dt / n;
      const w = hitWorm(g, this.x, this.y, 1, this.t < 0.15 ? this.owner : null);
      if (w) {
        w.hurt(g, 15, this.owner);
        const s = Math.hypot(this.vx, this.vy) || 1;
        w.launch(w.vx + this.vx / s * 260, w.vy + this.vy / s * 260 - 90);
        sound.at('arrow_hit', this.x, g.cam, { vol: 0.8, rate: 1.2 });
        this.dead = true; return;
      }
      if (g.terrain.solid(this.x, this.y)) {
        this.stuck = true; this.t = 0;
        sound.at('arrow_hit', this.x, g.cam, { vol: 0.8 });
        g.fx.debris(this.x, this.y, 3, g.debris);
        return;
      }
    }
    this.rot = Math.atan2(this.vy, this.vx);
    if (this.y > g.waterY || this.x < -300 || this.x > g.terrain.w + 300) this.dead = true;
  }
  onBlast() { if (this.stuck) this.dead = true; }
  draw(c) {
    if (this.dead) return;
    c.save();
    c.translate(this.x, this.y); c.rotate(this.rot);
    c.strokeStyle = '#6b4423'; c.lineWidth = 1.6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-17, 0); c.lineTo(0, 0); c.stroke();
    c.fillStyle = '#c9ccd3'; c.strokeStyle = '#2a2a2a'; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(4, 0); c.lineTo(-1, -2.6); c.lineTo(-1, 2.6); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#e8483f';
    c.beginPath(); c.moveTo(-17, 0); c.lineTo(-21, -3); c.lineTo(-14, 0); c.lineTo(-21, 3); c.closePath(); c.fill();
    c.restore();
  }
}

// ============================================================ DRAGON BALL

export class Fireball {
  constructor(owner, x, y, dir) {
    Object.assign(this, { type: 'fireball', owner, x, y, vx: dir * 330, vy: 0, t: 0 });
  }
  get follow() { return true; }
  busy() { return !this.dead; }
  update(g, dt) {
    if (this.dead) return;
    this.t += dt;
    const n = 4;
    for (let i = 0; i < n; i++) {
      this.x += this.vx * dt / n;
      const w = hitWorm(g, this.x, this.y, 5, this.owner);
      if (w) {
        w.hurt(g, 30, this.owner); w.launch(Math.sign(this.vx) * 380, -360);
        g.cam.shake = Math.max(g.cam.shake, 4);
        return this.fizzle(g);
      }
      if (g.terrain.hitCircle(this.x, this.y, 4)) return this.fizzle(g);
    }
    if (this.t > 0.75) return this.fizzle(g);
    if (Math.random() < 0.8) g.fx.add({ k: 'fire', x: this.x - Math.sign(this.vx) * 6, y: this.y + rand(-3, 3), vx: -this.vx * 0.2, vy: rand(-20, 20),
      r: rand(3, 5), life: rand(0.2, 0.35), t: 0, drag: 2 });
  }
  fizzle(g) {
    this.dead = true;
    for (let i = 0; i < 12; i++) g.fx.add({ k: 'fire', x: this.x, y: this.y, vx: rand(-120, 120), vy: rand(-120, 60), r: rand(3, 6), life: rand(0.25, 0.5), t: 0, drag: 2 });
    sound.at('explosion_small', this.x, g.cam, { vol: 0.35, rate: 1.4 });
  }
  draw(c, g) {
    if (this.dead) return;
    const R = 13;
    const gr = c.createRadialGradient(this.x, this.y, 1, this.x, this.y, R);
    gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.35, 'rgba(255,190,60,.95)'); gr.addColorStop(1, 'rgba(255,80,0,0)');
    c.fillStyle = gr; c.beginPath(); c.arc(this.x, this.y, R, 0, TAU); c.fill();
    if (images.icon_dragonball) drawSprite(c, images.icon_dragonball, this.x, this.y, 14, (g?.time || 0) * 12);
  }
}

// ============================================================ KAMIKAZE

/** Drives the current worm along its aim until it hits something, then it goes out with a bang. */
export class Kamikaze {
  constructor(worm, dx, dy) {
    Object.assign(this, { type: 'kamikaze', worm, dx, dy, t: 0 });
    worm.state = 'kamikaze'; worm.rest = false;
  }
  busy() { return !this.dead; }
  update(g, dt) {
    if (this.dead) return;
    const w = this.worm;
    if (w.state !== 'kamikaze') { this.dead = true; return; }
    this.t += dt;
    const sp = 430;
    w.vx = this.dx * sp; w.vy = this.dy * sp;
    const n = Math.ceil(sp * dt / 2);
    for (let i = 0; i < n; i++) {
      w.x += w.vx * dt / n; w.y += w.vy * dt / n;
      if (g.terrain.hitCircle(w.x, w.y, w.r) || hitWorm(g, w.x, w.y, 3, w) || this.t > 2.2) return this.blast(g);
    }
    if (w.x < -100 || w.x > g.terrain.w + 100 || w.y < -600) return this.blast(g);
    for (let i = 0; i < 2; i++) g.fx.add({ k: 'fire', x: w.x - this.dx * 10 + rand(-3, 3), y: w.y - this.dy * 10 + rand(-3, 3), vx: -this.dx * 60, vy: -this.dy * 60,
      r: rand(3, 5), life: rand(0.2, 0.4), t: 0, drag: 2 });
  }
  blast(g) {
    this.dead = true;
    const w = this.worm;
    w.state = 'air'; w.vx = w.vy = 0; w.rest = false;
    g.selfHurtGrace = true;
    g.explode(w.x, w.y, 62, 50, { by: w, sfx: 'explosion_big' });
    w.hp = 0; w.pending = 0; w.shownHp = 0;
  }
  draw() {}
}

// ============================================================ EARTHQUAKE

export class Quake {
  constructor(g) {
    Object.assign(this, { type: 'quake', t: 0, dur: 3.6, beat: 0 });
    sound.sfx('quake', { vol: 1 });
  }
  busy() { return !this.dead; }
  update(g, dt) {
    if (this.dead) return;
    this.t += dt;
    g.cam.shake = Math.max(g.cam.shake, 7 * (1 - this.t / this.dur) + 2);
    if ((this.beat -= dt) <= 0) {
      this.beat = 0.32;
      for (const w of g.worms) {
        if (!w.alive || w.state === 'rope' || w.state === 'jet') continue;
        if (w.state === 'idle' || w.state === 'air') w.launch(w.vx + rand(-120, 120), Math.min(w.vy, 0) - rand(110, 210));
      }
      for (const o of g.objects) if (!o.dead && o.rest && o.type !== 'arrow') { o.rest = false; o.vx = (o.vx || 0) + rand(-70, 70); o.vy = -rand(60, 150); }
      for (let i = 0; i < 6; i++) g.fx.debris(rand(0, g.terrain.w), g.terrain.standY?.(rand(0, g.terrain.w), 4, 0, g.waterY) ?? g.waterY - 60, 3, g.debris);
    }
    if (this.t >= this.dur) this.dead = true;
  }
  draw() {}
}

// ============================================================ helpers used by weapons.js

export function spawnFlames(g, x, y, n, spread = 180) {
  for (let i = 0; i < n; i++) g.add(new Flame(x + rand(-4, 4), y - 4, rand(-spread, spread), rand(-300, -80)));
}
