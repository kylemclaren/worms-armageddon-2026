// ===== physical things in the world =====
import { TAU, clamp, rand, pick } from './util.js';
import { images } from './assets.js';
import { sound } from './audio.js';
import { drawWormFrame, wormFrame, wormAtlasReady, crispImage } from './wormsprite.js';

let PX = 1; // world->device scale, refreshed each frame by the renderer
export const setPxScale = s => { PX = s; };

export const GRAV = 540;
export const WIND_ACCEL = 220; // px/s² at full wind

/**
 * Shared ballistic integrator. Sub-steps so fast shells never tunnel.
 * Returns {hit, nrm, speed} on the first terrain contact of this tick.
 */
export function stepBody(g, b, dt) {
  const T = g.terrain;
  if (b.rest) {
    if (!T.hitCircle(b.x, b.y + 2, b.r)) b.rest = false;
    else {
      // land was built on top of us (girder) — pop out
      let k = 0;
      while (T.hitCircle(b.x, b.y, b.r) && k++ < 24) b.y -= 1;
      return null;
    }
  }
  b.vy += GRAV * (b.grav ?? 1) * dt;
  if (b.wind) b.vx += g.wind * WIND_ACCEL * b.wind * dt;
  if (b.maxFall && b.vy > b.maxFall) b.vy = b.maxFall;
  const sp = Math.hypot(b.vx, b.vy);
  const n = Math.max(1, Math.ceil(sp * dt / 2));
  const sdt = dt / n;
  for (let i = 0; i < n; i++) {
    const nx = b.x + b.vx * sdt, ny = b.y + b.vy * sdt;
    if (!T.hitCircle(nx, ny, b.r)) { b.x = nx; b.y = ny; continue; }
    const nrm = T.normalAt(b.x, b.y, b.r);
    const vn = b.vx * nrm.x + b.vy * nrm.y;
    const speed = Math.max(0, -vn);
    if (b.impact) { b.x = nx; b.y = ny; return { hit: true, nrm, speed }; }
    if (vn < 0) {
      const e = b.bounce ?? 0.4;
      b.vx -= (1 + e) * vn * nrm.x; b.vy -= (1 + e) * vn * nrm.y;
      const tx = -nrm.y, ty = nrm.x, vt = b.vx * tx + b.vy * ty;
      const f = b.friction ?? 0.7;
      b.vx -= tx * vt * (1 - f); b.vy -= ty * vt * (1 - f);
    } else {
      // Blocked, yet the sampled normal says we're not moving into it (wedged on a
      // corner/spike). Bleed the velocity off, or the body keeps a speed it can
      // never use and never comes to rest, which would stall the turn forever.
      b.vx *= 0.35; b.vy *= 0.35;
    }
    let k = 0;
    while (T.hitCircle(b.x, b.y, b.r) && k++ < 12) { b.x += nrm.x; b.y += nrm.y; }
    if (Math.hypot(b.vx, b.vy) < 28 && nrm.y < -0.35) { b.vx = 0; b.vy = 0; b.rest = true; }
    // wedged in a crevice: touching every tick but going nowhere -> call it rested
    b._still = Math.hypot(b.vx, b.vy) < 45 ? (b._still || 0) + dt : 0;
    const moved = Math.abs(b.x - (b._lx ?? b.x)) + Math.abs(b.y - (b._ly ?? b.y));
    b._pinned = moved < 0.3 ? (b._pinned || 0) + dt : 0;          // position-based, whatever the velocity says
    b._lx = b.x; b._ly = b.y;
    if (b._still > 0.6 || b._pinned > 0.5) { b.vx = b.vy = 0; b.rest = true; b._still = 0; b._pinned = 0; }
    return { hit: true, nrm, speed };
  }
  // Something that keeps jittering in a crevice eventually settles.
  b._still = (Math.abs(b.vx) + Math.abs(b.vy) < 40) ? (b._still || 0) + dt : 0;
  if (b._still > 1.2 && T.hitCircle(b.x, b.y + 3, b.r)) { b.vx = b.vy = 0; b.rest = true; }
  return null;
}

function drawSprite(c, img, x, y, h, rot = 0, flip = false, alpha = 1) {
  if (!img) return;
  const w = img.width * (h / img.height);
  const src = crispImage(img, w * PX, h * PX);
  c.save();
  c.translate(x, y); if (rot) c.rotate(rot); if (flip) c.scale(-1, 1);
  if (alpha < 1) c.globalAlpha = alpha;
  c.drawImage(src, -w / 2, -h / 2, w, h);
  c.restore();
}
export { drawSprite };

// ============================================================ WORM

export class Worm {
  constructor(team, name, x, y, hp) {
    this.type = 'worm';
    this.team = team; this.name = name;
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.r = 8;
    this.hp = hp; this.shownHp = hp; this.pending = 0;
    this.facing = Math.random() < 0.5 ? 1 : -1;
    this.aim = -0.35;
    this.state = 'idle';     // idle | air | rope | jet | drown | punch | dead
    this.rest = true;
    this.bounce = 0.25; this.friction = 0.5;
    this.dead = false; this.dying = false;
    this.anim = rand(10); this.walkAcc = 0; this.spin = 0; this.flip = 0;
    this.walkDist = 0; this.landT = 0; this.dizzyT = 0; this.blinkEvery = rand(2.8, 5.2); this.blinkOff = rand(5);
    this.slope = 0; this.tilt = 0; this.ry = y + this.r + 1; this.turnT = 0;
    this.fallFrom = y;
    this.hurtT = 0;
    this.stats = { dmgDealt: 0, kills: 0 };
  }

  get alive() { return !this.dead && !this.dying; }
  busy() { return this.state === 'air' || this.state === 'drown' || this.state === 'punch'; }

  /** Direction vector of the crosshair. */
  aimVec() { return { x: Math.cos(this.aim) * this.facing, y: Math.sin(this.aim) }; }

  launch(vx, vy) {
    if (this.dead) return;
    if (this.state === 'rope') this.team.game?.releaseRope(this);
    if (this.state === 'jet') this.team.game?.stopJet(this);
    this.state = 'air'; this.rest = false;
    this.vx = vx; this.vy = vy;
    this.spin = 1;
  }

  hurt(g, n, by) {
    if (n <= 0 || this.dead) return;
    this.pending += n;
    this.hurtT = 0.4;
    this.dizzyT = 1.6;
    if (by && by !== this && by.team !== this.team) by.stats.dmgDealt += n;
    if (by && by.team && by.team !== this.team) this.lastHitBy = by;
    g.onWormHurt(this, n, by);
  }

  /** One pixel of walking: climb small steps, drop down small ledges. */
  stepWalk(g, dir) {
    const T = g.terrain;
    const nx = this.x + dir;
    let ny = this.y, k = 0;
    while (T.hitCircle(nx, ny, this.r) && k < 4) { ny--; k++; }   // 4px step-ups: pebbles ok, ~76deg+ walls block
    if (T.hitCircle(nx, ny, this.r)) return false;
    let d = 0;
    while (!T.hitCircle(nx, ny + 1, this.r) && d < 5) { ny++; d++; }
    this.x = nx; this.y = ny;
    if (d >= 5 && !T.hitCircle(this.x, this.y + 1, this.r)) {
      this.state = 'air'; this.rest = false; this.vx = dir * 30; this.vy = 0; this.spin = 0;
      this.fallFrom = this.y;
    }
    return true;
  }

  walk(g, dir, dt) {
    if (this.state !== 'idle') { this.walking = false; return; }
    if (this.facing !== dir) this.turnT = 0.14;
    this.facing = dir;
    // uphill is slow, downhill a bit quicker (slope measured by the ground probe)
    const up = -this.slope * dir;                                  // >0 when climbing
    const slopeF = up > 0 ? 1 - 0.62 * Math.sin(Math.min(up, 1.3)) : 1 + 0.28 * Math.sin(Math.min(-up, 1.2));
    // inchworm pulse: the head surges while stretched, nearly stops at the tall arch
    const phase = (this.walkDist % 16) / 16;
    const pulse = 0.5 + 1.0 * (0.5 + 0.5 * Math.cos(phase * Math.PI * 2));
    this.walkAcc += 62 * slopeF * pulse * dt;
    let blocked = false;
    while (this.walkAcc >= 1) {
      this.walkAcc -= 1;
      if (this.state !== 'idle') break;
      if (this.stepWalk(g, dir)) this.walkDist++;
      else { blocked = true; this.walkAcc = 0; break; }
    }
    // "walking" = trying to move and not blocked; ticks that advance <1px mid-pulse still count
    const moved = !blocked;
    this.walking = !blocked && this.state === 'idle';
    if (moved) {
      this._stepSnd = (this._stepSnd || 0) - dt;
      if (this._stepSnd <= 0) { sound.at('walk', this.x, g.cam, { vol: 0.35, rate: rand(0.9, 1.15) }); this._stepSnd = 0.32; }
    }
  }

  jump(back = false) {
    if (this.state !== 'idle') return;
    this.state = 'air'; this.rest = false;
    this.fallFrom = this.y;
    if (back) { this.vx = -this.facing * 55; this.vy = -390; this.flip = 1; }
    else { this.vx = this.facing * 150; this.vy = -250; }
    this.spin = 0;
    this.y -= 1;
  }

  /** First solid pixel in column x at or below fromY (within `span`), or null. */
  static groundAt(T, x, fromY, span = 26) {
    x = Math.round(x);
    for (let y = Math.floor(fromY); y < fromY + span; y++) if (T.solid(x, y)) return y;
    return null;
  }

  /** Where the sprite stands and how it leans; purely visual, physics stays pixel-exact. */
  pose(g, dt) {
    const T = g.terrain;
    let targetY = this.y + this.r + 1, targetTilt = 0;
    if (this.state === 'idle') {
      const gy = Worm.groundAt;
      const c = gy(T, this.x, this.y), l = gy(T, this.x - 7, this.y - 8), r = gy(T, this.x + 7, this.y - 8);
      if (l != null && r != null) this.slope = Math.atan2(r - l, 14);
      else if (c != null && (l ?? r) != null) this.slope = l != null ? Math.atan2(c - l, 7) : Math.atan2(r - c, 7);
      else this.slope = 0;
      targetTilt = Math.max(-0.78, Math.min(0.78, this.slope * 0.8));
      // sit the base on the ground under the footprint, averaged to ignore single-pixel grit
      const s = [c, gy(T, this.x - 3, this.y), gy(T, this.x + 3, this.y)].filter(v => v != null);
      if (s.length) targetY = Math.min(this.y + this.r + 9, s.reduce((a, b) => a + b, 0) / s.length + 1);
    }
    const kPos = 1 - Math.exp(-dt * (this.state === 'idle' ? 24 : 60));
    const kTilt = 1 - Math.exp(-dt * (this.state === 'idle' ? 12 : 6));
    this.ry += (targetY - this.ry) * kPos;
    if (Math.abs(targetY - this.ry) > 30) this.ry = targetY;            // teleports, respawns
    this.tilt += (targetTilt - this.tilt) * kTilt;
    if (this.turnT > 0) this.turnT -= dt;
  }

  update(g, dt) {
    this.anim += dt;
    if (!this.dead) this.pose(g, dt);
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.landT > 0) this.landT -= dt;
    if (this.dizzyT > 0) this.dizzyT -= dt;
    if (this.dead) return;
    if (this.shownHp !== this.hp) this.shownHp += Math.sign(this.hp - this.shownHp) * Math.min(Math.abs(this.hp - this.shownHp), dt * 60);

    if (this.state === 'drown') {
      this.vy = 38; this.y += this.vy * dt; this.x += this.vx * dt; this.vx *= 0.95;
      if (Math.random() < 0.2) g.fx.bubbles(this.x, this.y, 1);
      if (this.y > g.terrain.h + 80) { this.dead = true; this.state = 'dead'; }
      return;
    }
    if (this.y > g.waterY + 2) { g.drown(this); return; }

    if (this.state === 'rope' || this.state === 'jet' || this.state === 'torch') return; // driven by the tool

    if (this.state === 'punch') {
      this.punchT -= dt;
      this.y -= 200 * dt;
      if (g.terrain.hitCircle(this.x, this.y - 2, this.r) || this.punchT <= 0) {
        this.y += 2;
        this.state = 'air'; this.vx = 0; this.vy = 0; this.rest = false; this.fallFrom = this.y;
      }
      return;
    }

    if (this.state === 'idle') {
      // `walking` is owned by the controls (set in walk(), cleared when input stops)
      if (!g.terrain.hitCircle(this.x, this.y + 2, this.r)) {
        this.state = 'air'; this.rest = false; this.vx = 0; this.vy = 0; this.fallFrom = this.y;
      } else {
        let k = 0;
        while (g.terrain.hitCircle(this.x, this.y, this.r) && k++ < 20) this.y -= 1;
      }
      return;
    }

    if (this.state === 'air') {
      const vyBefore = this.vy;
      this.rest = false;
      const hit = stepBody(g, this, dt);
      if (this.flip > 0) this.flip = Math.max(0, this.flip - dt * 1.6);
      if (this.spin > 0) this.spin = Math.max(0, this.spin - dt * 0.5);
      if (hit && hit.speed > 360 && hit.nrm.y < -0.4 && !this.noFallDmg) {
        const dmg = Math.min(45, Math.round((hit.speed - 360) / 7));
        if (dmg > 0) {
          this.hurt(g, dmg, null);
          sound.at('thud', this.x, g.cam, { vol: 0.9 });
          g.onFallDamage(this);
        }
      } else if (hit && hit.speed > 120) {
        sound.at('thud', this.x, g.cam, { vol: 0.35, rate: 1.3 });
      }
      if (this.rest) {
        this.state = 'idle'; this.rest = true; this.vx = this.vy = 0; this.spin = 0; this.flip = 0;
        this.landT = 0.14;
        this.noFallDmg = false;
      }
      void vyBefore;
    }
  }

  draw(c, g) {
    if (this.dead) return;
    if (wormAtlasReady()) {
      const frame = wormFrame(this, g);
      this._frame = frame;
      let rot = 0;
      if (frame === 'tumble') rot = this.anim * 12 * this.facing;
      else if (this.state === 'rope') rot = Math.atan2(this.x - g.rope.ax, g.rope.ay - this.y) * 0.6;
      else if (this.state === 'drown') rot = Math.sin(this.anim * 6) * 0.3;
      const centered = frame === 'jump' || frame === 'fall' || frame === 'tumble';
      const H = 42; // world px of an idle worm
      const y = centered ? this.y - 6 : this.ry;
      if (!rot && !centered) rot = this.tilt;
      if (this.hurtT > 0 && ((this.hurtT * 20) | 0) % 2 === 0) c.globalAlpha = 0.55;
      const sq = this.turnT > 0 ? 0.72 + 0.28 * (1 - this.turnT / 0.14) : 1;   // quick squash on turning round
      drawWormFrame(c, frame, this.x, y, H, g.pxScale || 1, this.facing, rot, sq);
      c.globalAlpha = 1;
      return;
    }
    const img = images.worm;
    if (!img) return;
    const H = 34;
    const w = img.width * (H / img.height);
    c.save();
    c.translate(this.x, this.y + this.r + 1);
    c.scale(this.facing, 1);
    c.drawImage(img, -w / 2, -H, w, H);
    c.restore();
  }
}

// ============================================================ PROJECTILE

/**
 * Anything that flies and eventually blows up. Behaviour is data-driven:
 *   impact: explode on first contact     fuse: seconds until detonation
 *   wind: how much wind pushes it        onExplode(g, self) for cluster/banana children
 */
export class Projectile {
  constructor(o) {
    Object.assign(this, { type: 'proj', r: 4, bounce: 0.5, friction: 0.8, grav: 1, wind: 0,
      impact: true, fuse: 0, radius: 40, damage: 40, rot: 0, age: 0, spinRate: 0 }, o);
  }
  busy() { return !this.dead; }

  update(g, dt) {
    if (this.dead) return;
    this.age += dt;
    if (this.homing && this.age > 0.35 && this.age < 4.5) this.steer(g, dt);
    else {
      const hit = stepBody(g, this, dt);
      if (hit && this.impact) return this.detonate(g);
      if (hit && hit.speed > 60 && this.bounceSfx) {
        sound.at(this.bounceSfx, this.x, g.cam, { vol: clamp(hit.speed / 400, 0.15, 0.8), rate: rand(0.9, 1.15) });
      }
    }
    if (this.impact && this.hitsWorms) {
      for (const w of g.worms) {
        if (!w.alive || (w === this.owner && this.age < 0.25)) continue;
        if (Math.abs(w.x - this.x) < 9 + this.r && this.y > w.y - 24 && this.y < w.y + 10) return this.detonate(g);
      }
    }
    if (this.trail && Math.random() < 0.75) g.fx.trail(this.x - this.vx * 0.01, this.y - this.vy * 0.01, this.trail === 'big');
    if (this.fuse > 0) {
      this.fuse -= dt;
      if (this.fuse <= 0) {
        if (this.holy && !this.sang) {
          this.sang = true; this.fuse = 1.1;
          sound.at('holy', this.x, g.cam, { vol: 1 });
          g.fx.sparkle(this.x, this.y - 10, 26, '255,230,120');
          this.vx = this.vy = 0; this.grav = 0; this.frozen = true;
        } else return this.detonate(g);
      }
    }
    if (this.frozen) { this.vx = this.vy = 0; }
    if (this.y > g.waterY) { g.fx.splash(this.x, g.waterY, 0.7); sound.at('splash', this.x, g.cam, { vol: 0.5 }); this.dead = true; return; }
    if (this.x < -600 || this.x > g.terrain.w + 600) { this.dead = true; return; }
    if (this.spinRate) this.rot += this.spinRate * dt * Math.sign(this.vx || 1);
    else if (!this.rest) this.rot = Math.atan2(this.vy, this.vx);
  }

  steer(g, dt) {
    const t = this.target;
    const want = Math.atan2(t.y - this.y, t.x - this.x);
    let cur = Math.atan2(this.vy, this.vx);
    let d = want - cur;
    while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
    cur += clamp(d, -4.2 * dt, 4.2 * dt);
    const sp = Math.min(760, Math.hypot(this.vx, this.vy) + 900 * dt);
    this.vx = Math.cos(cur) * sp; this.vy = Math.sin(cur) * sp;
    const n = Math.max(1, Math.ceil(sp * dt / 2));
    for (let i = 0; i < n; i++) {
      this.x += this.vx * dt / n; this.y += this.vy * dt / n;
      if (g.terrain.hitCircle(this.x, this.y, this.r)) return this.detonate(g);
    }
  }

  detonate(g) {
    if (this.dead) return;
    this.dead = true;
    g.explode(this.x, this.y, this.radius, this.damage, { by: this.owner, sfx: this.sfx });
    this.onExplode?.(g, this);
  }

  draw(c) {
    if (this.dead) return;
    if (this.sprite === 'shell') {
      c.save(); c.translate(this.x, this.y); c.rotate(this.rot);
      c.fillStyle = '#3d4a2a'; c.strokeStyle = '#111'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(9, 0); c.lineTo(3, -3.5); c.lineTo(-7, -3.5); c.lineTo(-7, 3.5); c.lineTo(3, 3.5); c.closePath();
      c.fill(); c.stroke();
      c.fillStyle = '#c33'; c.fillRect(-9, -4.5, 3, 9);
      c.restore();
      return;
    }
    if (this.sprite === 'frag') {
      c.fillStyle = '#b3261e'; c.strokeStyle = '#1a0a05'; c.lineWidth = 1.2;
      c.beginPath(); c.arc(this.x, this.y, 3.2, 0, TAU); c.fill(); c.stroke();
      return;
    }
    if (this.sprite === 'meteor') {
      const g = c.createRadialGradient(this.x, this.y, 1, this.x, this.y, 9);
      g.addColorStop(0, '#fff6c0'); g.addColorStop(0.4, '#ff9a2e'); g.addColorStop(1, 'rgba(200,40,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(this.x, this.y, 9, 0, TAU); c.fill();
      c.fillStyle = '#4a2a1a'; c.beginPath(); c.arc(this.x, this.y, 4, 0, TAU); c.fill();
      return;
    }
    const img = images[this.sprite];
    drawSprite(c, img, this.x, this.y, this.size || 14, this.spriteRot ? this.rot + this.spriteRot : this.spinRate ? this.rot : 0);
    if (this.fuse > 0 && this.showFuse && !this.frozen) {
      c.font = '12px Bungee, sans-serif'; c.textAlign = 'center';
      c.lineWidth = 3; c.strokeStyle = '#000'; c.fillStyle = '#fff';
      const s = String(Math.ceil(this.fuse));
      c.strokeText(s, this.x, this.y - 14); c.fillText(s, this.x, this.y - 14);
    }
  }
}

// ============================================================ MINE

export class Mine {
  constructor(x, y, armed = 1.2) {
    Object.assign(this, { type: 'mine', x, y, vx: 0, vy: 0, r: 5, bounce: 0.3, friction: 0.5,
      arm: armed, trig: -1, rest: false, dud: Math.random() < 0.08 });
  }
  busy() { return !this.dead && (!this.rest || this.trig >= 0); }
  update(g, dt) {
    if (this.dead) return;
    stepBody(g, this, dt);
    if (this.y > g.waterY) { this.dead = true; g.fx.splash(this.x, g.waterY, 0.5); return; }
    if (this.arm > 0) { this.arm -= dt; return; }
    if (this.trig < 0) {
      for (const w of g.worms) if (w.alive && Math.hypot(w.x - this.x, w.y - this.y) < 34) {
        this.trig = 1.3; sound.at('mine_beep', this.x, g.cam, { vol: 0.8 }); break;
      }
    } else {
      this.trig -= dt;
      if (this.trig <= 0) {
        if (this.dud) { this.trig = -1; this.arm = 9999; g.fx.text(this.x, this.y - 16, 'DUD', '#ccc'); return; }
        this.dead = true;
        g.explode(this.x, this.y, 46, 48, {});
      }
    }
  }
  onBlast(g) { if (!this.dead) { this.dead = true; g.later(0.08, () => g.explode(this.x, this.y, 46, 48, {})); } }
  draw(c, g) {
    if (this.dead) return;
    drawSprite(c, images.icon_mine, this.x, this.y - 1, 15);
    const blink = this.trig >= 0 ? (g.time * 12 | 0) % 2 : (g.time * 1.5 | 0) % 2;
    if (this.arm <= 0 && blink) {
      c.fillStyle = this.trig >= 0 ? '#ff2a2a' : '#ff6b6b';
      c.beginPath(); c.arc(this.x, this.y - 8, 2.2, 0, TAU); c.fill();
    }
  }
}

// ============================================================ OIL DRUM

export class Barrel {
  constructor(x, y) {
    Object.assign(this, { type: 'barrel', x, y, vx: 0, vy: 0, r: 9, bounce: 0.2, friction: 0.5, hp: 30, rest: false });
  }
  busy() { return !this.dead && !this.rest; }
  update(g, dt) {
    if (this.dead) return;
    stepBody(g, this, dt);
    if (this.y > g.waterY) { this.dead = true; g.fx.splash(this.x, g.waterY, 0.8); }
  }
  onBlast(g, f, dmg, ex, ey) {
    if (this.dead) return;
    this.hp -= dmg * f;
    if (this.hp <= 0) {
      this.dead = true;
      g.later(0.12, () => {
        g.explode(this.x, this.y, 55, 40, { sfx: 'barrel' });
        for (let i = 0; i < 9; i++) g.add(new Flame(this.x, this.y - 6, rand(-220, 220), rand(-360, -120)));
      });
    } else {
      const a = Math.atan2(this.y - ey, this.x - ex);
      this.vx += Math.cos(a) * 260 * f; this.vy += Math.sin(a) * 260 * f - 60; this.rest = false;
    }
  }
  draw(c) { if (!this.dead) drawSprite(c, images.oildrum, this.x, this.y - 2, 24); }
}

// ============================================================ FIRE

export class Flame {
  constructor(x, y, vx, vy) {
    Object.assign(this, { type: 'flame', x, y, vx, vy, r: 2, bounce: 0.1, friction: 0.3, life: rand(3, 5), t: 0, tick: 0 });
  }
  busy() { return !this.dead; }
  update(g, dt) {
    if (this.dead) return;
    this.t += dt;
    stepBody(g, this, dt);
    if (this.t > this.life || this.y > g.waterY) { this.dead = true; return; }
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 0.25;
      for (const w of g.worms) if (w.alive && Math.abs(w.x - this.x) < 11 && Math.abs(w.y - this.y) < 16) {
        w.hurt(g, 2, null);
      }
      if (this.rest && Math.random() < 0.3) g.terrain.carve(this.x, this.y + 2, 3, false);
    }
    if (Math.random() < 0.4) g.fx.add({ k: 'fire', x: this.x + rand(-2, 2), y: this.y - 2, vx: rand(-10, 10) + g.wind * 20,
      vy: -rand(40, 90), r: rand(2.5, 5), life: rand(0.25, 0.5), t: 0, drag: 1 });
  }
  draw(c, g) {
    if (this.dead) return;
    const f = 1 - this.t / this.life;
    c.fillStyle = `rgba(255,${150 + Math.sin(g.time * 30 + this.x) * 60},40,${0.9 * f + 0.1})`;
    c.beginPath(); c.arc(this.x, this.y - 2, 3.5 * f + 1.5, 0, TAU); c.fill();
  }
}

// ============================================================ CRATE

export class Crate {
  constructor(kind, x, y, contents) {
    Object.assign(this, { type: 'crate', kind, x, y, vx: 0, vy: 0, r: 10, bounce: 0.1, friction: 0.4,
      contents, chute: true, rest: false, maxFall: 105, wind: 0 });
  }
  busy() { return !this.dead && !this.rest; }
  update(g, dt) {
    if (this.dead) return;
    this.maxFall = this.chute ? 105 : 900;
    if (this.chute) {
      // A canopy has drag: ease toward a gentle wind drift instead of accelerating
      // forever (unbounded drift sent crates streaking off-map with the camera in tow).
      this.wind = 0;
      this.vx += (g.wind * 45 - this.vx) * Math.min(1, dt * 1.5);
    }
    const hit = stepBody(g, this, dt);
    if (this.x < -150 || this.x > g.terrain.w + 150) { this.dead = true; return; }
    if (hit && this.chute) { this.chute = false; this.wind = 0; sound.at('crate_drop', this.x, g.cam, { vol: 0.8 }); }
    if (this.y > g.waterY) { this.dead = true; g.fx.splash(this.x, g.waterY, 0.8); sound.at('splash', this.x, g.cam, { vol: 0.5 }); return; }
    for (const w of g.worms) if (w.alive && Math.abs(w.x - this.x) < 18 && Math.abs(w.y - this.y) < 22) { g.collect(w, this); break; }
  }
  onBlast(g) {
    if (this.dead) return;
    this.dead = true;
    if (this.kind === 'weapon') g.later(0.1, () => g.explode(this.x, this.y, 34, 25, {}));
    else g.fx.debris(this.x, this.y, 14, ['#8a5a2b', '#5d3a17', '#c4944f']);
  }
  draw(c, g) {
    if (this.dead) return;
    const img = images[this.kind === 'health' ? 'crate_health' : this.kind === 'util' ? 'crate_utility' : 'crate_weapon'];
    const sway = this.chute ? Math.sin(g.time * 2.4 + this.x) * 0.12 : 0;
    c.save(); c.translate(this.x, this.y); c.rotate(sway);
    if (this.chute && images.parachute) {
      // canopy hangs from the crate; its rope point sits just above the lid
      const pw = 50, ph = images.parachute.height * (pw / images.parachute.width);
      c.drawImage(crispImage(images.parachute, pw * PX, ph * PX), -pw / 2, -10 - ph, pw, ph);
    }
    c.restore();
    drawSprite(c, img, this.x, this.y - 2, 22, sway);
  }
}

// ============================================================ SHEEP

export class Sheep {
  constructor(owner, x, y, dir) {
    Object.assign(this, { type: 'sheep', owner, x, y, vx: dir * 40, vy: -120, r: 7, bounce: 0.2, friction: 0.6,
      dir, t: 0, life: 14, rest: false, hopT: rand(0.6, 1.4), blocked: 0 });
  }
  busy() { return !this.dead; }
  update(g, dt) {
    if (this.dead) return;
    this.t += dt;
    if (this.t > this.life) return this.boom(g);
    if (this.rest) {
      // walk
      const T = g.terrain;
      const nx = this.x + this.dir * 70 * dt;
      let ny = this.y, k = 0;
      while (T.hitCircle(nx, ny, this.r) && k < 5) { ny--; k++; }
      if (T.hitCircle(nx, ny, this.r)) { this.hop(g, 1.25); this.blocked++; if (this.blocked > 5) { this.dir *= -1; this.blocked = 0; } }
      else { this.x = nx; this.y = ny; if (!T.hitCircle(this.x, this.y + 2, this.r)) this.rest = false; }
      this.hopT -= dt;
      if (this.hopT <= 0) this.hop(g, 1);
    } else stepBody(g, this, dt);
    if (this.y > g.waterY) { this.dead = true; g.fx.splash(this.x, g.waterY); sound.at('splash', this.x, g.cam); }
  }
  hop(g, k) {
    this.rest = false; this.vy = -250 * k; this.vx = this.dir * 110; this.hopT = rand(0.8, 1.8); this.y -= 1;
    if (Math.random() < 0.35) sound.at('sheep', this.x, g.cam, { vol: 0.7, rate: rand(0.9, 1.2) });
  }
  boom(g) {
    if (this.dead) return;
    this.dead = true;
    g.explode(this.x, this.y, 72, 75, { by: this.owner });
    g.fx.debris(this.x, this.y, 20, ['#ffffff', '#f0f0f0', '#dddddd']);
  }
  draw(c) { if (!this.dead) drawSprite(c, images.icon_sheep, this.x, this.y - 3, 20, 0, this.dir < 0); }
}

// ============================================================ BIG STUFF

/** Air strike: a plane crosses the map and drops a stick of missiles over the target. */
export class Plane {
  constructor(g, tx, dir, owner, spec) {
    Object.assign(this, { type: 'plane', tx, dir, owner, spec, dropped: 0, dead: false });
    this.y = Math.max(40, g.cam.worldTop() + 60);
    this.x = dir > 0 ? tx - 1100 : tx + 1100;
    this.speed = 520;
    sound.at('airplane', tx, g.cam, { vol: 0.9 });
  }
  busy() { return !this.dead; }
  update(g, dt) {
    this.x += this.dir * this.speed * dt;
    const n = this.spec.n, gap = 26;
    const startX = this.tx - this.dir * (gap * (n - 1) / 2) - this.dir * 90; // lead: bombs carry forward
    while (this.dropped < n && (this.x - startX) * this.dir >= this.dropped * gap) {
      g.add(new Projectile({ x: this.x, y: this.y + 10, vx: this.dir * 140, vy: 60, r: 3, wind: 1, impact: true,
        radius: this.spec.radius, damage: this.spec.damage, owner: this.owner, sprite: 'icon_homing', size: 12, spriteRot: Math.PI / 4,
        hitsWorms: true, sfx: 'explosion_small' }));
      this.dropped++;
    }
    if (Math.abs(this.x - this.tx) > 1300 && this.dropped >= n) this.dead = true;
  }
  draw(c) { drawSprite(c, images.icon_airstrike, this.x, this.y, 46, 0, this.dir < 0); }
}

export class Donkey {
  constructor(x, owner) {
    Object.assign(this, { type: 'donkey', x, y: -60, vx: 0, vy: 200, owner, hits: 0, dead: false, cool: 0 });
  }
  busy() { return !this.dead; }
  update(g, dt) {
    this.vy = Math.min(this.vy + GRAV * dt, 700);
    this.y += this.vy * dt;
    this.cool -= dt;
    if (this.cool <= 0 && g.terrain.hitCircle(this.x, this.y + 18, 14)) {
      this.hits++; this.cool = 0.12;
      g.explode(this.x, this.y + 16, 62, 50, { by: this.owner, sfx: this.hits === 1 ? 'donkey' : undefined });
      this.vy = -140;
    }
    if (this.y > g.waterY + 20 || this.hits > 8) {
      if (this.y > g.waterY) { g.fx.splash(this.x, g.waterY, 2); sound.at('splash', this.x, g.cam); }
      this.dead = true;
    }
  }
  draw(c) { drawSprite(c, images.icon_donkey, this.x, this.y, 44); }
}

export class Armageddon {
  constructor(g, owner) {
    Object.assign(this, { type: 'armageddon', owner, t: 0, dur: 7, acc: 0, dead: false });
    sound.sfx('armageddon', { vol: 1 });
    g.cam.shake = Math.max(g.cam.shake, 6);
  }
  busy() { return !this.dead; }
  update(g, dt) {
    this.t += dt; this.acc += dt;
    while (this.acc > 0.16 && this.t < this.dur) {
      this.acc -= 0.16;
      g.add(new Projectile({ x: rand(0, g.terrain.w), y: -40, vx: rand(-120, 120), vy: rand(250, 420), r: 5, wind: 0.5,
        impact: true, radius: 38, damage: 28, sprite: 'meteor', trail: 'big', hitsWorms: true, sfx: 'explosion_med' }));
    }
    if (this.t > 3.4 && !this.second) { this.second = true; sound.sfx('armageddon', { vol: 0.7 }); }
    if (this.t >= this.dur) this.dead = true;
  }
  draw() {}
}
