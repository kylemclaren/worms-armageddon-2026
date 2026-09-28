// ===== drawing the world =====
import { images } from './assets.js';
import { drawGirder } from './terrain.js';
import { WORLD_W, WORLD_H } from './game.js';
import { setPxScale } from './entities.js';
import { TAU, clamp } from './util.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.quality = 'high';
    this.resize();
  }

  /** high: painted sky + parallax planes + stars, crisp canvas; medium: sky only, 1x canvas; low: gradient sky. */
  setQuality(q) {
    if (q === this.quality) return;
    this.quality = q;
    this.bgFor = null;         // force backdrop rebuild
    this.resize();
  }

  resize() {
    // Cap the backing store (~2.6 MP): full 2x on a big display quadruples fill cost for little gain.
    const w0 = window.innerWidth, h0 = window.innerHeight;
    this.dpr = this.quality === 'high' ? Math.max(1, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2.6e6 / (w0 * h0)))) : 1;
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.vw = w; this.vh = h;
  }

  /** Section timer, only active while the F3 profiler is open. */
  _t(name) {
    if (!this.prof) return;
    const now = performance.now();
    if (this._last) this.prof[this._lastName] = (this.prof[this._lastName] || 0) * 0.9 + (now - this._last) * 0.1;
    this._last = now; this._lastName = name;
  }

  draw(g, mouse) {
    const c = this.ctx, cam = g.cam;
    this._last = 0;
    const sk = this.skip || (this.skip = new Set((new URLSearchParams(location.search).get('skip') || '').split(',')));
    cam.vw = this.vw; cam.vh = this.vh;
    g.pxScale = cam.zoom * this.dpr;
    setPxScale(g.pxScale);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.vw, this.vh);
    this._t('sky');
    if (!sk.has('sky')) this._sky(c, g);

    c.save();
    c.translate(this.vw / 2, this.vh / 2);
    c.scale(cam.zoom, cam.zoom);
    c.translate(-cam.cx + cam.sx, -cam.cy + cam.sy);

    this._t('water0');
    if (!sk.has('water')) this._water(c, g, 0);
    this._t('shadow');
    this._t('terrain');
    if (!sk.has('terrain')) c.drawImage(g.terrain.canvas, 0, 0);

    this._t('objects');
    for (const o of g.objects) if (!o.dead && o.type !== 'plane') o.draw(c, g);
    this._t('smoke');
    g.fx.draw(c, 0);
    this._rope(c, g);
    for (const w of g.worms) if (w.state === 'idle' && !w.dead) {
      c.fillStyle = 'rgba(0,0,0,.28)';
      c.beginPath(); c.ellipse(w.x, w.ry, 10, 2.6, w.tilt, 0, TAU); c.fill();
    }
    this._t('worms');
    for (const w of g.worms) w.draw(c, g);
    this._heldWeapon(c, g);
    for (const o of g.objects) if (!o.dead && o.type === 'plane') o.draw(c, g);
    this._t('fx');
    g.fx.draw(c, 1);
    this._t('water1');
    g.marine?.draw(c, g.pxScale || 1);             // in front of submerged rock, tinted by the front water
    if (!sk.has('water')) this._water(c, g, 1);
    this._t('flakes');
    if (!sk.has('flakes') && this.quality !== 'low') this._flakes(c, g);
    this._t('labels');
    if (window.__dbg) for (const w of g.worms) if (!w.dead) {        // physics vs sprite debug overlay
      c.strokeStyle = '#00e5ff'; c.lineWidth = 0.6; c.beginPath(); c.arc(w.x, w.y, w.r, 0, TAU); c.stroke();
      c.fillStyle = '#ff2d55'; c.fillRect(w.x + (w.pivotOff || 0) * w.facing - 1, w.ry - 1, 2, 2);
    }
    if (!sk.has('labels')) this._labels(c, g);
    this._aim(c, g, mouse);
    g.fx.draw(c, 2);
    c.restore();
    this._t('post');
    if (!sk.has('post')) this._post(c, g);
    this._t('end');
  }

  /** Screen flash on big blasts: a CSS layer, so it costs nothing per pixel here. */
  _post(c, g) {
    const el = this.flashEl || (this.flashEl = document.getElementById('flashFx'));
    const o = Math.min(0.22, g.flash || 0).toFixed(2);
    if (o !== this.flashO) { el.style.opacity = o; el.style.display = o > 0 ? 'block' : 'none'; this.flashO = o; }
  }


  /**
   * Backdrop = DOM layers the GPU composites for free: a sky plate plus far and mid
   * painted planes that slide at different rates (parallax), with twinkling stars
   * or a pulsing sun/moon glow on top. We only touch their transforms per frame.
   */
  _sky(c, g) {
    const th = g.theme, cam = g.cam, vw = this.vw, vh = this.vh;
    if (!this.bg) this.bg = { sky: document.getElementById('bgSky'), fx: document.getElementById('bgFx'),
      far: document.getElementById('bgFar'), mid: document.getElementById('bgMid') };
    const bg = this.bg;
    if (this.bgFor !== th || this.bgW !== vw || this.bgH !== vh) this._setupBackdrop(th);
    const cx = clamp(cam.cx / WORLD_W, 0, 1);
    // sky: gentle drift
    const px = Math.round((cx - 0.5) * vw * 0.06), py = Math.round((cam.cy / WORLD_H - 0.5) * vh * 0.05);
    const sk = `translate3d(${-px}px,${-py}px,0)`;
    if (sk !== this.skyT) { bg.sky.style.transform = sk; this.skyT = sk; }
    // planes: horizontally span the world; vertically ride the sea line at a fraction of world speed
    const seaY = vh / 2 + (g.waterY - cam.cy) * cam.zoom;
    for (const [el, img, widthK, par, lift] of [[bg.far, images[th.far], 1.25, 0.3, 0.06], [bg.mid, images[th.mid], 1.45, 0.55, 0.04]]) {
      if (!img || this.quality !== 'high' || this.skip?.has('planes')) { if (el.style.display !== 'none') el.style.display = 'none'; continue; }
      if (el.style.display === 'none') el.style.display = 'block';
      const s = (vw * widthK * Math.pow(cam.zoom, 0.15)) / img.naturalWidth;
      const lw = img.naturalWidth * s, lh = img.naturalHeight * s;
      const x = -cx * (lw - vw);
      let bottom = vh + (seaY - vh) * par + vh * lift;
      bottom = Math.max(bottom, vh + 2);                     // never leave a gap under a plane
      const t = `translate3d(${x.toFixed(1)}px,${(bottom - lh).toFixed(1)}px,0) scale(${s.toFixed(4)})`;
      if (el._t !== t) { el.style.transform = t; el._t = t; }
    }
  }

  _setupBackdrop(th) {
    const bg = this.bg, vw = this.vw, vh = this.vh;
    this.bgFor = th; this.bgW = vw; this.bgH = vh;
    const sky = images[th.sky];
    if (this.quality === 'low' || !sky) {
      const [a, b, c] = th.grad;
      bg.sky.style.backgroundImage = `linear-gradient(180deg, ${a} 0%, ${b} 55%, ${c} 100%)`;
      bg.fx.innerHTML = '';
      return;
    }
    bg.sky.style.backgroundImage = `url("${sky.src}")`;
    for (const [el, key] of [[bg.far, th.far], [bg.mid, th.mid]]) {
      const img = images[key];
      if (img) { if (el.src !== img.src) el.src = img.src; el.style.display = 'block'; }
    }
    // Stars / glow are laid out in sky-image coordinates (background-size: cover).
    bg.fx.innerHTML = '';
    if (!sky) return;
    const bw = vw * 1.16, bh = vh * 1.16;
    const s = Math.max(bw / sky.naturalWidth, bh / sky.naturalHeight);
    const iw = sky.naturalWidth * s, ih = sky.naturalHeight * s, ox = (bw - iw) / 2, oy = (bh - ih) / 2;
    const at = (u, v) => ({ x: ox + u * iw, y: oy + v * ih });
    if (th.stars && this.quality === 'high') {
      let html = '';
      for (let i = 0; i < th.stars; i++) {
        const p = at(Math.random(), Math.random() * 0.6);
        const sz = 1.5 + Math.random() * 2.2;
        html += `<i class="star" style="left:${p.x.toFixed(0)}px;top:${p.y.toFixed(0)}px;width:${sz}px;height:${sz}px;--d:${(2 + Math.random() * 4).toFixed(1)}s;--o:${(-Math.random() * 6).toFixed(1)}s"></i>`;
      }
      bg.fx.innerHTML = html;
    }
    if (th.sun && this.quality !== 'low') {
      const p = at(th.sun.x, th.sun.y), r = th.sun.r * iw;
      const glow = document.createElement('div');
      glow.className = 'glow';
      Object.assign(glow.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${r * 2}px`, height: `${r * 2}px`,
        background: `radial-gradient(circle, rgba(${th.sun.col},.75) 0%, rgba(${th.sun.col},.25) 35%, rgba(${th.sun.col},0) 70%)` });
      bg.fx.appendChild(glow);
      if (th.sun.rays) {
        const rays = document.createElement('div');
        rays.className = 'rays';
        Object.assign(rays.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${r * 7}px`, height: `${r * 7}px` });
        bg.fx.appendChild(rays);
      }
    }
  }

  /**
   * Water, kept deliberately simple:
   *   back  - the open sea behind the islands, a clean gradient with a faint sheen
   *   front - two gentle translucent bands over the land's feet, one glossy surface
   *           line and a few twinkles. Marine life swims between the two passes.
   */
  _water(c, g, layer) {
    const [c1, c2, c3] = g.theme.water;
    const y0 = g.waterY, t = g.time;
    const x0 = Math.floor((g.cam.cx - g.cam.viewW / 2 - 60) / 10) * 10, x1 = g.cam.cx + g.cam.viewW / 2 + 60;
    const bottom = Math.max(WORLD_H + 400, g.cam.cy + g.cam.viewH);
    const wave = (x, k, sp, a) => Math.sin(x * k + t * sp) * a + Math.sin(x * k * 2.1 + t * sp * 1.4) * a * 0.3;
    const body = (off, k, sp, amp) => {
      c.beginPath(); c.moveTo(x0, bottom);
      for (let x = x0; x <= x1; x += 10) c.lineTo(x, y0 + off + wave(x, k, sp, amp));
      c.lineTo(x1, bottom); c.closePath();
    };

    if (layer === 0) {
      const gr = c.createLinearGradient(0, y0 - 24, 0, y0 + 120);
      gr.addColorStop(0, c1); gr.addColorStop(0.45, c2); gr.addColorStop(1, c3);
      c.fillStyle = gr; body(-8, 0.011, 0.5, 2.5); c.fill();
      c.globalAlpha = 0.35; c.strokeStyle = g.theme.foam; c.lineWidth = 1.2;
      c.beginPath();
      for (let x = x0; x <= x1; x += 10) { const y = y0 - 8 + wave(x, 0.011, 0.5, 2.5); x === x0 ? c.moveTo(x, y) : c.lineTo(x, y); }
      c.stroke(); c.globalAlpha = 1;
      return;
    }

    // two soft translucent bands: the back one lighter, the front one deeper
    const bands = [{ off: -5, k: 0.017, sp: 0.8, amp: 3, a: 0.4 }, { off: 3, k: 0.012, sp: -0.6, amp: 4, a: 0.64 }];
    for (const b of bands) {
      const gr = c.createLinearGradient(0, y0 + b.off - 6, 0, y0 + b.off + 150);
      gr.addColorStop(0, c1); gr.addColorStop(0.3, c2); gr.addColorStop(1, c3);
      c.globalAlpha = b.a; c.fillStyle = gr; body(b.off, b.k, b.sp, b.amp); c.fill();
    }
    // one glossy surface line with a soft glow under it
    const fb = bands[1];
    c.strokeStyle = g.theme.foam;
    c.beginPath();
    for (let x = x0; x <= x1; x += 10) { const y = y0 + fb.off + wave(x, fb.k, fb.sp, fb.amp) + 1; x === x0 ? c.moveTo(x, y) : c.lineTo(x, y); }
    c.globalAlpha = 0.16; c.lineWidth = 7; c.stroke();
    c.globalAlpha = 0.75; c.lineWidth = 1.6; c.stroke();
    // a few slow twinkles riding the surface
    c.fillStyle = '#ffffff';
    for (let x = Math.ceil(x0 / 70) * 70; x <= x1; x += 70) {
      const tw = Math.sin(t * 1.3 + x * 0.61) * Math.sin(t * 0.7 + x * 0.23);
      if (tw < 0.55) continue;
      const a = (tw - 0.55) / 0.45, y = y0 + fb.off + wave(x, fb.k, fb.sp, fb.amp) + 3, r = 1 + a * 2.2;
      c.globalAlpha = a * 0.9;
      c.beginPath(); c.moveTo(x - r * 2.2, y); c.lineTo(x, y - r * 0.5); c.lineTo(x + r * 2.2, y); c.lineTo(x, y + r * 0.5); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(x, y - r * 1.6); c.lineTo(x + r * 0.45, y); c.lineTo(x, y + r * 1.6); c.lineTo(x - r * 0.45, y); c.closePath(); c.fill();
    }
    c.globalAlpha = 1;
    this._shoreFoam(c, g, x0, x1);
  }

  /** Foam where the land meets the sea; the span list is rebuilt when land or tide change. */
  _shoreFoam(c, g, x0, x1) {
    const T = g.terrain, wy = Math.round(g.waterY);
    if (!this.shore || this.shore.ver !== T.version || this.shore.wy !== wy) {
      const spans = [];
      let run = -1;
      for (let x = 0; x <= T.w; x += 2) {
        const solid = x < T.w && (T.solid(x, wy - 1) || T.solid(x, wy + 3));
        if (solid && run < 0) run = x;
        if (!solid && run >= 0) { spans.push([run, x]); run = -1; }
      }
      this.shore = { ver: T.version, wy, spans };
    }
    const t = g.time;
    c.fillStyle = g.theme.foam;
    for (const [a, b] of this.shore.spans) {
      if (b < x0 || a > x1) continue;
      // lapping line along the waterline
      for (let x = Math.max(a, x0); x <= Math.min(b, x1); x += 6) {
        const w = 2.2 + Math.sin(x * 0.3 + t * 3.1) * 1.2;
        c.globalAlpha = 0.32 + 0.18 * Math.sin(x * 0.17 - t * 2.3);
        c.beginPath(); c.ellipse(x, wy + 1 + Math.sin(x * 0.11 + t * 2) * 1.5, w * 1.8, w * 0.7, 0, 0, TAU); c.fill();
      }
      // churning foam puffs at each end of the span
      for (const ex of [a, b]) {
        if (ex < x0 - 20 || ex > x1 + 20) continue;
        for (let i = 0; i < 3; i++) {
          const ph = t * 1.6 + i * 1.9 + ex;
          const r = 2.5 + 2 * (0.5 + 0.5 * Math.sin(ph));
          c.globalAlpha = 0.3 + 0.2 * Math.sin(ph * 1.3);
          c.beginPath(); c.arc(ex + Math.sin(ph) * 7 + (ex === a ? -3 : 3), wy - 1 + Math.cos(ph * 0.8) * 2.5, r, 0, TAU); c.fill();
        }
      }
    }
    c.globalAlpha = 1;
  }

  _flakes(c, g) {
    const kind = g.theme.flake;
    const dt = 1 / 60;
    c.save();
    for (const f of g.flakes) {
      f.x += (g.wind * 140 + (kind === 'snow' ? 6 : 0)) * f.s * dt;
      f.y += (kind === 'snow' ? 26 : kind === 'dust' ? 6 : 14) * f.s * dt;
      f.p += dt * 2;
      if (f.y > g.waterY) f.y = -20;
      if (f.x > WORLD_W + 400) f.x -= WORLD_W + 800;
      if (f.x < -400) f.x += WORLD_W + 800;
      const x = f.x + Math.sin(f.p) * 6;
      if (kind === 'snow') { c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.arc(x, f.y, 1.6 * f.s + 0.6, 0, TAU); c.fill(); }
      else if (kind === 'dust') { c.fillStyle = 'rgba(180,255,230,.5)'; c.fillRect(x, f.y, 2 * f.s, 2 * f.s); }
      else {
        c.fillStyle = f.s > 0.9 ? '#e0a040' : '#7ab648';
        c.save(); c.translate(x, f.y); c.rotate(f.p);
        c.beginPath(); c.ellipse(0, 0, 3.2 * f.s, 1.6 * f.s, 0, 0, TAU); c.fill(); c.restore();
      }
    }
    c.restore();
  }

  _labels(c, g) {
    c.save();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const w of g.worms) {
      if (w.dead || (w.state === 'drown' && w.y > g.waterY + 20)) continue;
      const col = w.team.color;
      const y = (w.state === 'idle' ? w.ry - w.r - 1 : w.y) - 46;
      c.font = '800 11px Nunito, sans-serif';
      const nameW = c.measureText(w.name).width;
      const hpStr = String(Math.max(0, Math.round(w.shownHp)));
      c.font = '900 11px Nunito, sans-serif';
      const hpW = c.measureText(hpStr).width;
      // name
      c.fillStyle = 'rgba(10,8,4,.72)';
      roundRect(c, w.x - nameW / 2 - 5, y - 21, nameW + 10, 14, 4); c.fill();
      c.font = '800 11px Nunito, sans-serif';
      c.fillStyle = col; c.fillText(w.name, w.x, y - 14);
      // hp
      c.fillStyle = 'rgba(10,8,4,.72)';
      roundRect(c, w.x - hpW / 2 - 6, y - 5, hpW + 12, 14, 4); c.fill();
      c.strokeStyle = col; c.lineWidth = 1.2; c.stroke();
      c.font = '900 11px Nunito, sans-serif';
      c.fillStyle = col; c.fillText(hpStr, w.x, y + 2.5);
    }
    // bouncing arrow over the worm whose turn it is
    const cur = g.cur;
    if (cur && cur.alive && g.state === 'turn' && g.stateT < 3) {
      const b = Math.abs(Math.sin(g.time * 6)) * 8;
      const y = cur.y - 96 - b;
      c.fillStyle = cur.team.color; c.strokeStyle = '#111'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(cur.x - 9, y - 10); c.lineTo(cur.x + 9, y - 10); c.lineTo(cur.x + 9, y);
      c.lineTo(cur.x + 15, y); c.lineTo(cur.x, y + 14); c.lineTo(cur.x - 15, y); c.lineTo(cur.x - 9, y); c.closePath();
      c.fill(); c.stroke();
    }
    c.restore();
  }

  _heldWeapon(c, g) {
    const w = g.cur;
    if (!w || !w.alive || g.state !== 'turn' || w.state !== 'idle' || w.walking) return;
    const wp = g.weapon;
    if (!wp || wp.util || wp.needsTarget && wp.instant) return;
    const img = images[wp.icon];
    if (!img) return;
    const v = w.aimVec();
    const ang = Math.atan2(v.y, v.x);
    const h = 15;
    const iw = img.width * (h / img.height);
    c.save();
    // grip sits at body level, below the (large) face of the W:A-style sprite
    c.translate(w.x + w.facing * 6, w.y + 4);
    // icons are drawn pointing right/up-right; keep them upright when facing left
    c.rotate(w.facing > 0 ? ang : ang - Math.PI);
    if (w.facing < 0) c.scale(-1, 1);
    c.drawImage(img, 0, -h / 2, iw, h);
    c.restore();
  }

  _rope(c, g) {
    if (!g.rope || !g.cur) return;
    const w = g.cur;
    c.strokeStyle = '#3a2a14'; c.lineWidth = 1.8;
    c.beginPath(); c.moveTo(g.rope.ax, g.rope.ay); c.lineTo(w.x, w.y - 6); c.stroke();
    c.fillStyle = '#999'; c.beginPath(); c.arc(g.rope.ax, g.rope.ay, 2.5, 0, TAU); c.fill();
  }

  _aim(c, g, mouse) {
    const w = g.cur;
    if (!w || !w.alive || g.state !== 'turn') return;
    const wp = g.weapon;
    const human = !w.team.cpu;
    // target-click weapons: preview under the cursor
    if (wp?.needsTarget && human && mouse) {
      const m = g.cam.toWorld(mouse.x, mouse.y);
      const ok = g.validTarget(m.x, m.y);
      if (wp.id === 'girder') {
        c.save(); c.strokeStyle = 'rgba(255,255,255,.2)'; c.setLineDash([5, 6]);
        c.beginPath(); c.arc(w.x, w.y, 260, 0, TAU); c.stroke(); c.restore();
        drawGirder(c, m.x, m.y, g.girderAng, 72, 10, ok ? 0.75 : 0.3);
      } else if (wp.id === 'teleport') {
        c.strokeStyle = ok ? 'rgba(200,140,255,.9)' : 'rgba(255,80,80,.7)'; c.lineWidth = 2;
        c.beginPath(); c.arc(m.x, m.y, 10 + Math.sin(g.time * 8) * 2, 0, TAU); c.stroke();
      } else if (!g.target) this._reticle(c, m.x, m.y, g.time, '#ffcf3d');
    }
    if (g.target) this._reticle(c, g.target.x, g.target.y, g.time, '#ff4d4d');
    if (wp && (!wp.needsTarget || !wp.instant) && !wp.util || wp?.id === 'rope') {
      if (w.state !== 'idle' && wp.id !== 'rope') return;
      const v = w.aimVec();
      const R = 58;
      const x = w.x + v.x * R, y = w.y - 6 + v.y * R;
      c.save();
      c.strokeStyle = w.team.color; c.lineWidth = 2.2;
      c.beginPath(); c.arc(x, y, 7, 0, TAU); c.stroke();
      c.beginPath(); c.moveTo(x - 11, y); c.lineTo(x - 4, y); c.moveTo(x + 4, y); c.lineTo(x + 11, y);
      c.moveTo(x, y - 11); c.lineTo(x, y - 4); c.moveTo(x, y + 4); c.lineTo(x, y + 11); c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 1.6, 0, TAU); c.fill();
      if (g.charging) {
        // growing power wedge, W:A style
        const n = 14, p = g.power;
        for (let i = 0; i < n * p; i++) {
          const t = i / n, d = 14 + t * 60;
          c.fillStyle = `hsl(${120 - t * 120},90%,55%)`;
          c.beginPath(); c.arc(w.x + v.x * d, w.y - 6 + v.y * d, 2 + t * 5, 0, TAU); c.fill();
        }
      }
      c.restore();
    }
  }

  _reticle(c, x, y, t, col) {
    c.save();
    c.translate(x, y); c.rotate(t * 1.5);
    c.strokeStyle = col; c.lineWidth = 2.5;
    for (let i = 0; i < 4; i++) {
      c.rotate(TAU / 4);
      c.beginPath(); c.arc(0, 0, 13, -0.5, 0.5); c.stroke();
    }
    c.fillStyle = col; c.beginPath(); c.arc(0, 0, 2.5, 0, TAU); c.fill();
    c.restore();
  }
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

