// ===== online multiplayer =====
// Host-authoritative: the host's browser runs the real simulation. Guests run a
// "puppet" game that only draws: it generates the same terrain from the shared seed,
// applies the host's crater/girder events in order, and interpolates snapshots of
// worms and objects (~30/s). Guests send their controls on their own turn.
import { sound } from './audio.js';
import { toast } from './toast.js';
import { Projectile, Mine, Barrel, Flame, Crate, Sheep, Plane, Donkey, Armageddon } from './entities.js';
import { Grave } from './game.js';

// ------------------------------------------------------------------ connection
export class Conn {
  constructor() { this.ws = null; this.handlers = new Map(); this.seat = null; this.code = null; }
  on(t, fn) { this.handlers.set(t, fn); return this; }
  open() {
    if (this.ws && this.ws.readyState <= 1) return Promise.resolve();
    return new Promise((res, rej) => {
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      this.ws = ws;
      ws.onopen = () => res();
      ws.onerror = () => rej(new Error('Could not reach the game server'));
      ws.onclose = () => this.handlers.get('close')?.();
      ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } this.handlers.get(m.t)?.(m); };
    });
  }
  send(obj) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  relay(msg, to) { this.send({ t: 'relay', msg, to }); }
  close() { try { this.ws?.close(); } catch { /* already closed */ } this.ws = null; }
}

// ------------------------------------------------------------------ serialisation
const r1 = v => Math.round(v * 10) / 10, r3 = v => Math.round(v * 1000) / 1000;
const FIELDS = {
  proj: ['x', 'y', 'vx', 'vy', 'rot', 'sprite', 'size', 'spriteRot', 'spinRate', 'fuse', 'showFuse', 'frozen', 'trail', 'r'],
  mine: ['x', 'y', 'trig', 'arm', 'dud'], barrel: ['x', 'y'], flame: ['x', 'y', 't', 'life'],
  crate: ['x', 'y', 'kind', 'chute'], sheep: ['x', 'y', 'vx', 'vy', 'rest', 'dir', 't', 'squash', 'r'],
  grave: ['x', 'y', 'color'], plane: ['x', 'y', 'dir'], donkey: ['x', 'y'], armageddon: ['t'],
};
const CLASSES = { proj: Projectile, mine: Mine, barrel: Barrel, flame: Flame, crate: Crate, sheep: Sheep,
  grave: Grave, plane: Plane, donkey: Donkey, armageddon: Armageddon };
const W_FIELDS = ['x', 'y', 'vx', 'vy', 'state', 'facing', 'aim', 'hp', 'pending', 'dead', 'dying', 'spin', 'flip',
  'walking', 'walkDist', 'hurtT', 'dizzyT', 'landT', 'airT'];

function packObj(o) {
  const f = FIELDS[o.type]; if (!f) return null;
  const out = { id: o.id, ty: o.type };
  for (const k of f) { const v = o[k]; out[k] = typeof v === 'number' ? (k === 'rot' || k === 'spriteRot' ? r3(v) : r1(v)) : v; }
  return out;
}

// ------------------------------------------------------------------ host
export class NetHost {
  constructor(conn, game, ui) {
    this.conn = conn; this.g = game; this.ui = ui; this.tick = 0; this.q = []; this.remote = new Map();
    this.lastAmmo = '';
    this._capture();
    game.netSend = null;
    // late joiners are not supported; everyone gets the roster once
    conn.relay({ t: 'init', names: game.worms.map(w => w.name), hp: game.worms.map(w => w.hp) });
  }

  /** Mirror everything a guest needs to see/hear: craters, girders, effects, sounds, HUD. */
  _capture() {
    const g = this.g, q = this.q, T = g.terrain, fx = g.fx, ui = this.ui;
    const wrap = (obj, name, pack) => { const orig = obj[name].bind(obj); obj[name] = (...a) => { q.push(pack(...a)); return orig(...a); }; };
    // terrain edits carry full precision: guests must carve exactly the same pixels
    wrap(T, 'carve', (x, y, r, ch = true) => ['carve', x, y, r, ch ? 1 : 0]);
    wrap(T, 'addGirder', (x, y, a) => ['girder', x, y, a]);
    wrap(fx, 'explosion', (x, y, R, col) => ['fx', 'explosion', r1(x), r1(y), r1(R), col ? 1 : 0]);
    wrap(fx, 'splash', (x, y, big) => ['fx', 'splash', r1(x), r1(y), big ?? 1]);
    wrap(fx, 'sparkle', (x, y, n, col) => ['fx', 'sparkle', r1(x), r1(y), n ?? 18, col]);
    wrap(fx, 'text', (x, y, s, c, big) => ['fx', 'text', r1(x), r1(y), s, c, big ? 1 : 0]);
    wrap(fx, 'debris', (x, y, n, cols) => ['fx', 'debris', r1(x), r1(y), n, cols]);
    wrap(g, 'tracer', (x1, y1, x2, y2) => ['tracer', r1(x1), r1(y1), r1(x2), r1(y2)]);
    // sounds: sound.at calls sound.sfx internally; only record the outermost call
    let depth = 0;
    this._soundRestore = [];
    for (const m of ['sfx', 'at', 'vox', 'ann', 'loop', 'stopLoop']) {
      const orig = sound[m];
      this._soundRestore.push([m, orig]);
      sound[m] = (...a) => {
        if (depth === 0) {
          if (m === 'at') q.push(['snd', 'at', a[0], r1(a[1]), a[3] || {}]);
          else q.push(['snd', m, ...a]);
        }
        depth++; try { return orig.apply(sound, a); } finally { depth--; }
      };
    }
    wrap(ui, 'bigMessage', t => ['ui', 'big', t]);
    wrap(ui, 'turnStart', (team, worm) => ['turn', team.idx, g.worms.indexOf(worm)]);
    wrap(ui, 'gameOver', (game, winner) => ['over', winner ? winner.idx : -1, game.worms.map(w => [w.stats.dmgDealt, w.stats.kills])]);
    // control hints go only to whoever is steering the current worm
    const hint = ui.hint.bind(ui);
    ui.hint = (text, dur) => {
      const t = g.curTeam;
      if (t?.remote) this.conn.relay({ t: 'ev', e: [['ui', 'hint', text, dur]] }, t.seat);
      else hint(text, dur);
    };
  }

  release() { for (const [m, f] of this._soundRestore || []) sound[m] = f; }

  /** Guest input for its own turn. */
  onInput(seat, m) {
    const g = this.g, t = g.curTeam;
    if (!t || !t.remote || t.seat !== seat) return;
    if (m.t === 'in') {
      const c = g.ctrl, i = m.c;
      c.left = !!i.l; c.right = !!i.r; c.up = !!i.u; c.down = !!i.d; c.fire = !!i.f; c.fine = !!i.fn;
      if (i.fp) c.firePressed = true; if (i.j) c.jump = true; if (i.b) c.backflip = true;
      if (i.up) c.upPressed = true; if (i.dp) c.downPressed = true;
      if (i.tg) c.target = i.tg; if (i.am) c.aimAt = i.am;
      if (i.ga != null) g.girderAng = i.ga;
    } else if (m.t === 'cmd') {
      if (m.k === 'weapon') g.selectWeapon(m.v);
      else if (m.k === 'fuse') g.setFuse(m.v);
      else if (m.k === 'fire') g.fire();
    }
  }

  afterTick() {
    this.tick++;
    if (this.tick % 2) return;
    const g = this.g;
    const ammo = JSON.stringify(g.curTeam?.ammo || {}).replace(/null/g, '"inf"');
    const snap = {
      t: 'snap', k: this.tick,
      s: [g.state, g.teamIdx, g.worms.indexOf(g.curWorm), r1(g.timer), r3(g.wind), g.weaponId, r3(g.power), g.charging ? 1 : 0,
        g.fuse, g.round, g.suddenDeath ? 1 : 0, r1(g.waterY), g.target, g.rope, r3(g.girderAng), g.turnNo, r1(g.cam.shake), r3(g.flash || 0)],
      w: g.worms.map(w => W_FIELDS.map(k => { const v = w[k]; return typeof v === 'number' ? (k === 'aim' ? r3(v) : r1(v)) : typeof v === 'boolean' ? (v ? 1 : 0) : v; })),
      o: g.objects.filter(o => !o.dead).map(packObj).filter(Boolean),
      e: this.q.splice(0),
    };
    if (ammo !== this.lastAmmo) { snap.a = JSON.parse(ammo); this.lastAmmo = ammo; }
    this.conn.relay(snap);
  }

  /** A guest dropped: its team is taken over by the CPU so the match can continue. */
  peerLeft(seat) {
    const g = this.g;
    for (const t of g.teams) if (t.seat === seat && t.remote) {
      t.remote = false; t.cpu = true; t.brain = 'local';
      toast.warning(`${t.player || t.name} left`, { description: 'The CPU takes over their team.' });
      if (g.curTeam === t && g.state === 'turn') g.ai.begin(g.cur);
    }
    this.ui.refreshTeams();
  }
}

// ------------------------------------------------------------------ guest
export class NetGuest {
  constructor(conn, game, ui) {
    this.conn = conn; this.g = game; this.ui = ui; this.lastSent = ''; this.sentAt = 0; this.hpSig = '';
    game.puppet = true;
    game.objects = [];
    game.netSend = (msg) => conn.relay(msg);
    this.objs = new Map();
  }

  onMessage(m) {
    const g = this.g;
    if (m.t === 'init') { m.names.forEach((n, i) => { if (g.worms[i]) { g.worms[i].name = n; g.worms[i].hp = g.worms[i].shownHp = m.hp[i]; } }); this.ui.refreshTeams(); }
    else if (m.t === 'ev') this._events(m.e);
    else if (m.t === 'snap') this._snap(m);
  }

  _events(list) {
    const g = this.g;
    for (const e of list) {
      switch (e[0]) {
        case 'carve': g.terrain.carve(e[1], e[2], e[3], !!e[4]); break;
        case 'girder': g.terrain.addGirder(e[1], e[2], e[3]); break;
        case 'fx': {
          const [, k, ...a] = e;
          if (k === 'explosion') g.fx.explosion(a[0], a[1], a[2], a[3] ? g.debris : null);
          else g.fx[k]?.(...a);
          if (k === 'explosion') g.marine?.onExplosion(a[0], a[1], a[2]);
          break;
        }
        case 'tracer': g.tracer(e[1], e[2], e[3], e[4]); break;
        case 'snd': {
          const [, m, ...a] = e;
          if (m === 'at') sound.at(a[0], a[1], g.cam, a[2]); else sound[m]?.(...a);
          break;
        }
        case 'ui': if (e[1] === 'big') this.ui.bigMessage(e[2]); else if (e[1] === 'hint') this.ui.hint(e[2], e[3]); break;
        case 'turn': {
          g.teamIdx = e[1]; g.curWorm = g.worms[e[2]];
          this.ui.turnStart(g.teams[e[1]], g.worms[e[2]]);
          if (g.curTeam.seat === g.mySeat) toast('Your turn', { id: 'yourturn', kind: 'turn', eyebrow: g.curTeam.name, tag: 'You', description: `${g.curWorm.name} is up`, accent: g.curTeam.color, duration: 2200 });
          g.cam.follow(g.curWorm);
          break;
        }
        case 'over': {
          e[2].forEach((st, i) => { if (g.worms[i]) { g.worms[i].stats.dmgDealt = st[0]; g.worms[i].stats.kills = st[1]; } });
          g.state = 'over';
          this.ui.gameOver(g, e[1] >= 0 ? g.teams[e[1]] : null);
          break;
        }
      }
    }
  }

  _snap(m) {
    const g = this.g;
    this._events(m.e || []);
    const s = m.s;
    [g.state, g.teamIdx] = [s[0], s[1]];
    g.curWorm = g.worms[s[2]];
    const hudSig = `${s[5]}|${s[8]}|${s[1]}`;
    g.timer = s[3]; g.wind = s[4]; g.weaponId = s[5]; g.power = s[6]; g.charging = !!s[7]; g.fuse = s[8];
    if (hudSig !== this.hudSig) { this.hudSig = hudSig; this.ui.refreshWeapons(); }
    g.round = s[9]; g.suddenDeath = !!s[10]; g.waterY = s[11]; g.target = s[12]; g.rope = s[13]; g.girderAng = s[14];
    g.turnNo = s[15]; g.cam.shake = Math.max(g.cam.shake, s[16]); g.flash = Math.max(g.flash || 0, s[17]);
    if (m.a && g.curTeam) { for (const k in m.a) g.curTeam.ammo[k] = m.a[k] === 'inf' ? Infinity : m.a[k]; this.ui.refreshWeapons(); }
    // worms: interpolate positions between snapshots, take the rest as-is
    m.w.forEach((arr, i) => {
      const w = g.worms[i]; if (!w) return;
      w._px = w.x; w._py = w.y; w._k = 0;
      W_FIELDS.forEach((k, j) => {
        if (k === 'x') w._tx = arr[j]; else if (k === 'y') w._ty = arr[j];
        else if (k === 'dead' || k === 'dying' || k === 'walking') w[k] = !!arr[j];
        else w[k] = arr[j];
      });
      if (w._first !== true) { w.x = w._tx; w.y = w._ty; w.ry = w.y + w.r + 1; w._first = true; }
    });
    const hpSig = g.worms.map(w => w.hp + (w.dead ? 'd' : '')).join(',');
    if (hpSig !== this.hpSig) { this.hpSig = hpSig; this.ui.refreshTeams(); }
    // objects: create/update/remove by id
    const seen = new Set();
    for (const d of m.o) {
      seen.add(d.id);
      let o = this.objs.get(d.id);
      if (!o) {
        const C = CLASSES[d.ty]; if (!C) continue;
        o = Object.create(C.prototype);
        Object.assign(o, { type: d.ty, dead: false }, d);
        o._px = o.x; o._py = o.y;
        this.objs.set(d.id, o);
      }
      o._px = o.x; o._py = o.y; o._k = 0;
      for (const k in d) if (k !== 'x' && k !== 'y') o[k] = d[k];
      o._tx = d.x; o._ty = d.y;
    }
    for (const [id, o] of this.objs) if (!seen.has(id)) this.objs.delete(id);
    g.objects = [...this.objs.values()];
  }

  /** Puppet frame: interpolate, animate, effects. No physics or rules. */
  update(dt) {
    const g = this.g;
    g.time += dt; g.stateT += dt;
    if (g.flash > 0) g.flash = Math.max(0, g.flash - dt * 0.9);
    const k = dt * 30;                                 // snapshots arrive ~30/s
    for (const w of g.worms) {
      w.anim += dt;
      if (w._tx != null) { w._k = Math.min(1, (w._k || 0) + k); w.x = w._px + (w._tx - w._px) * w._k; w.y = w._py + (w._ty - w._py) * w._k; }
      if (!w.dead) w.pose(g, dt);
      if (w.shownHp !== w.hp) w.shownHp += Math.sign(w.hp - w.shownHp) * Math.min(Math.abs(w.hp - w.shownHp), dt * 60);
    }
    for (const o of g.objects) {
      if (o._tx != null) { o._k = Math.min(1, (o._k || 0) + k); o.x = o._px + (o._tx - o._px) * o._k; o.y = o._py + (o._ty - o._py) * o._k; }
      if (o.type === 'proj' && o.trail && Math.random() < 0.75) g.fx.trail(o.x, o.y, o.trail === 'big');
    }
    g.fx.update(dt, g.wind, g.waterY);
    g.marine.update(dt);
    g.cam.update(dt);
    g._followAction();
  }

  /** Send this player's controls while it's their turn. */
  sendInput() {
    const g = this.g, c = g.ctrl;
    if (!g.isHumanTurn()) return;
    const i = { l: +c.left, r: +c.right, u: +c.up, d: +c.down, f: +c.fire, fn: +c.fine };
    if (c.firePressed) i.fp = 1; if (c.jump) i.j = 1; if (c.backflip) i.b = 1;
    if (c.upPressed) i.up = 1; if (c.downPressed) i.dp = 1;
    if (c.target) i.tg = { x: r1(c.target.x), y: r1(c.target.y) };
    if (c.aimAt) i.am = { x: r1(c.aimAt.x), y: r1(c.aimAt.y) };
    if (g.weaponId === 'girder') i.ga = r3(g.girderAng);
    c.firePressed = c.jump = c.backflip = c.upPressed = c.downPressed = false; c.target = null; c.aimAt = null;
    const sig = JSON.stringify(i), now = performance.now();
    if (sig === this.lastSent && now - this.sentAt < 250) return;   // unchanged: heartbeat only
    this.lastSent = sig; this.sentAt = now;
    this.conn.relay({ t: 'in', c: i });
  }
}
