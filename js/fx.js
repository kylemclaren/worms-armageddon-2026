// ===== particles: purely cosmetic, never touch game state =====
import { rand, pick, TAU, clamp } from './util.js';

export class FX {
  constructor() { this.p = []; }

  add(o) { if (this.p.length < 2400) this.p.push(o); return o; }

  explosion(x, y, R, terrainColor) {
    this.add({ k: 'flash', x, y, r: R * 1.9, life: 0.16, t: 0 });
    this.add({ k: 'ring', x, y, r: R * 0.4, R: R * 1.5, life: 0.35, t: 0 });
    const nFire = Math.round(8 + R * 0.35);
    for (let i = 0; i < nFire; i++) {
      const a = rand(TAU), s = rand(0.2, 1) * R * 3.2;
      this.add({ k: 'fire', x: x + Math.cos(a) * R * 0.25, y: y + Math.sin(a) * R * 0.25,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, r: rand(R * 0.18, R * 0.42),
        life: rand(0.35, 0.75), t: 0, drag: 3.2 });
    }
    const nSmoke = Math.round(5 + R * 0.18);
    for (let i = 0; i < nSmoke; i++) {
      const a = rand(TAU), s = rand(10, 60);
      this.add({ k: 'smoke', x: x + rand(-R, R) * 0.4, y: y + rand(-R, R) * 0.4,
        vx: Math.cos(a) * s, vy: -rand(20, 60), r: rand(R * 0.25, R * 0.5),
        life: rand(1.2, 2.4), t: rand(-0.25, 0), drag: 1, grow: R * 0.6 });
    }
    const nSpark = Math.round(6 + R * 0.25);
    for (let i = 0; i < nSpark; i++) {
      const a = rand(TAU), s = rand(200, 520);
      this.add({ k: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80,
        life: rand(0.3, 0.8), t: 0, g: 600 });
    }
    if (terrainColor) this.debris(x, y, Math.round(R * 0.45), terrainColor);
  }

  debris(x, y, n, colors) {
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI, 0) + rand(-0.4, 0.4), s = rand(120, 420);
      this.add({ k: 'debris', x: x + rand(-8, 8), y: y + rand(-8, 8), vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rand(0.8, 1.6), t: 0, g: 700, sz: rand(1.5, 3.8), c: pick(colors), rot: rand(TAU), vr: rand(-12, 12) });
    }
  }

  splash(x, y, big = 1) {
    for (let i = 0; i < 14 * big; i++) {
      const a = rand(-Math.PI * 0.85, -Math.PI * 0.15), s = rand(80, 320) * Math.sqrt(big);
      this.add({ k: 'drop', x: x + rand(-6, 6), y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rand(0.5, 1.1), t: 0, g: 700, sz: rand(1.5, 3.5) });
    }
    this.add({ k: 'ring', x, y, r: 4, R: 28 * big, life: 0.5, t: 0, flat: true, col: '255,255,255' });
  }

  bubbles(x, y, n = 6) {
    for (let i = 0; i < n; i++) this.add({ k: 'bubble', x: x + rand(-6, 6), y: y + rand(-4, 4),
      vx: rand(-10, 10), vy: -rand(20, 60), life: rand(0.6, 1.4), t: rand(-0.4, 0), sz: rand(1.5, 3.5) });
  }

  trail(x, y, big = false) {
    this.add({ k: 'smoke', x, y, vx: rand(-8, 8), vy: rand(-18, -4), r: big ? 6 : 3.5,
      life: big ? 0.9 : 0.6, t: 0, drag: 1, grow: big ? 14 : 8, light: true });
  }

  sparkle(x, y, n = 18, col = '190,130,255') {
    for (let i = 0; i < n; i++) {
      const a = rand(TAU), s = rand(30, 160);
      this.add({ k: 'star', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.5, 1.1), t: 0,
        sz: rand(2, 4.5), col, drag: 2 });
    }
  }

  text(x, y, str, color, big = false) {
    this.add({ k: 'text', x, y, vx: 0, vy: -34, drag: 1.2, str, color, life: 1.8, t: 0, big });
  }

  update(dt, wind, waterY) {
    const P = this.p;
    let j = 0;
    for (let i = 0; i < P.length; i++) {
      const o = P[i];
      o.t += dt;
      if (o.t >= o.life) continue;
      if (o.t >= 0) {
        if (o.g) o.vy += o.g * dt;
        if (o.drag) { const f = Math.exp(-o.drag * dt); o.vx *= f; o.vy *= f; }
        if (o.k === 'smoke') o.vx += wind * 40 * dt;
        if (o.vx !== undefined) { o.x += o.vx * dt; o.y += o.vy * dt; }
        if (o.vr) o.rot += o.vr * dt;
        if ((o.k === 'debris' || o.k === 'drop' || o.k === 'spark') && o.y > waterY) continue;
      }
      P[j++] = o;
    }
    P.length = j;
  }

  /** Two passes so smoke sits behind fire. */
  draw(c, layer) {
    const halos = [];
    for (const o of this.p) {
      if (o.t < 0) continue;
      const q = o.t / o.life;
      switch (o.k) {
        case 'smoke': {
          if (layer !== 0) break;
          const r = o.r + (o.grow || 0) * q;
          c.fillStyle = o.light ? `rgba(230,230,230,${0.45 * (1 - q)})` : `rgba(60,55,50,${0.55 * (1 - q)})`;
          c.beginPath(); c.arc(o.x, o.y, r, 0, TAU); c.fill();
          break;
        }
        case 'fire': {
          if (layer !== 1) break;
          const r = o.r * (1 - q * 0.6);
          const hue = 50 - q * 45;
          c.fillStyle = `hsla(${hue},100%,${62 - q * 20}%,${1 - q})`;
          c.beginPath(); c.arc(o.x, o.y, r, 0, TAU); c.fill();
          if (halos.length < 160) halos.push(o);
          break;
        }
        case 'flash': {
          if (layer !== 1) break;
          const g = c.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
          g.addColorStop(0, `rgba(255,255,230,${0.95 * (1 - q)})`);
          g.addColorStop(0.4, `rgba(255,210,90,${0.6 * (1 - q)})`);
          g.addColorStop(1, 'rgba(255,120,20,0)');
          c.fillStyle = g;
          c.beginPath(); c.arc(o.x, o.y, o.r, 0, TAU); c.fill();
          break;
        }
        case 'ring': {
          if (layer !== 1) break;
          const r = o.r + (o.R - o.r) * Math.sqrt(q);
          c.strokeStyle = `rgba(${o.col || '255,240,200'},${0.7 * (1 - q)})`;
          c.lineWidth = 3 * (1 - q) + 1;
          c.beginPath();
          if (o.flat) c.ellipse(o.x, o.y, r, r * 0.25, 0, 0, TAU); else c.arc(o.x, o.y, r, 0, TAU);
          c.stroke();
          break;
        }
        case 'spark': {
          if (layer !== 1) break;
          c.strokeStyle = `rgba(255,${200 - q * 120},80,${1 - q})`;
          c.lineWidth = 2;
          c.beginPath(); c.moveTo(o.x, o.y); c.lineTo(o.x - o.vx * 0.03, o.y - o.vy * 0.03); c.stroke();
          break;
        }
        case 'debris': {
          if (layer !== 1) break;
          c.save(); c.translate(o.x, o.y); c.rotate(o.rot);
          c.globalAlpha = clamp((1 - q) * 3, 0, 1);
          c.fillStyle = o.c; c.fillRect(-o.sz / 2, -o.sz / 2, o.sz, o.sz);
          c.restore();
          break;
        }
        case 'drop': {
          if (layer !== 1) break;
          c.fillStyle = `rgba(210,240,255,${0.9 * (1 - q)})`;
          c.beginPath(); c.arc(o.x, o.y, o.sz, 0, TAU); c.fill();
          break;
        }
        case 'bubble': {
          if (layer !== 1) break;
          c.strokeStyle = `rgba(230,250,255,${0.8 * (1 - q)})`; c.lineWidth = 1;
          c.beginPath(); c.arc(o.x + Math.sin(o.t * 9) * 2, o.y, o.sz, 0, TAU); c.stroke();
          break;
        }
        case 'star': {
          if (layer !== 1) break;
          c.fillStyle = `rgba(${o.col},${1 - q})`;
          const s = o.sz * (1 - q * 0.5);
          c.beginPath();
          c.moveTo(o.x, o.y - s); c.lineTo(o.x + s * 0.3, o.y - s * 0.3); c.lineTo(o.x + s, o.y);
          c.lineTo(o.x + s * 0.3, o.y + s * 0.3); c.lineTo(o.x, o.y + s); c.lineTo(o.x - s * 0.3, o.y + s * 0.3);
          c.lineTo(o.x - s, o.y); c.lineTo(o.x - s * 0.3, o.y - s * 0.3); c.closePath(); c.fill();
          break;
        }
        case 'line': {
          if (layer !== 1) break;
          c.strokeStyle = o.rope ? `rgba(90,60,30,${1 - q})` : `rgba(255,240,170,${0.9 * (1 - q)})`;
          c.lineWidth = o.rope ? 1.5 : 1.2;
          c.beginPath(); c.moveTo(o.x1, o.y1); c.lineTo(o.x2, o.y2); c.stroke();
          break;
        }
        case 'text': {
          if (layer !== 2) break;
          const a = q < 0.75 ? 1 : 1 - (q - 0.75) / 0.25;
          const pop = q < 0.08 ? 0.6 + q / 0.08 * 0.5 : q < 0.14 ? 1.1 - (q - 0.08) / 0.06 * 0.1 : 1;
          c.save(); c.globalAlpha = a;
          c.translate(o.x, o.y); c.scale(pop, pop);
          c.font = `${o.big ? 22 : 16}px "Luckiest Guy", Bungee, sans-serif`;
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.lineWidth = 4; c.strokeStyle = '#150d02'; c.strokeText(o.str, 0, 0);
          c.fillStyle = o.color; c.fillText(o.str, 0, 0);
          c.restore();
          break;
        }
      }
    }
    if (halos.length) {
      // one additive pass = cheap bloom without a blend-mode switch per particle
      c.globalCompositeOperation = 'lighter';
      for (const o of halos) {
        const q = o.t / o.life, r = o.r * (1 - q * 0.6) * 2.2;
        c.fillStyle = `hsla(${60 - q * 45},100%,55%,${0.18 * (1 - q)})`;
        c.beginPath(); c.arc(o.x, o.y, r, 0, TAU); c.fill();
      }
      c.globalCompositeOperation = 'source-over';
    }
  }
}
