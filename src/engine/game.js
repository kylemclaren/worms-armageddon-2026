// ===== the match: turns, damage, deaths, crates, sudden death =====
import { Terrain, THEMES } from './terrain.js';
import { FX } from './fx.js';
import { Worm, Mine, Barrel, Crate, GRAV, stepBody, drawSprite } from './entities.js';
import { WEAPONS, WEAPON_BY_ID, CRATE_WEAPONS, CRATE_UTILS, weighted } from './weapons.js';
import { sound, VOX, voxPick } from './audio.js';
import { images } from './assets.js';
import { rand, randInt, pick, clamp, TAU } from './util.js';
import { AI } from './ai.js';
import { Marine } from './marine.js';

export const WORLD_W = 2600, WORLD_H = 1250;

export const TEAM_DEFS = [
  { name: 'Red Menace', color: '#ff5a4f', bank: 'a', pitch: 1.38 },
  { name: 'Blue Berets', color: '#4fb0ff', bank: 'c', pitch: 1.3 },
  { name: 'Green Giblets', color: '#6be05a', bank: 'b', pitch: 1.46 },
  { name: 'Mellow Yellow', color: '#ffd23f', bank: 'a', pitch: 1.62 },
];
const NAMES = [
  ['Spadge', 'Boggy B', 'Clagnut', 'Nobby', 'Wedgie', 'Chunky', 'Tiddles', 'Grub'],
  ['Colonel Mustard', 'Sgt. Squirm', 'Private Wiggles', 'Major Mayhem', 'Corporal Punishment', 'Cadet Crumble', 'Admiral Ackbar', 'Captain Pants'],
  ['Wormy McWormface', 'Squishy', 'Noodle', 'Dave', 'Slimer', 'Gristle', 'Bogey', 'Sprout'],
  ['Banana Joe', 'Custard', 'Mustard', 'Lemon Drop', 'Sunny', 'Butter', 'Honey', 'Buttercup'],
];

/** Camera with smooth follow, manual pan override and shake. */
class Camera {
  constructor(g) {
    this.g = g; this.cx = WORLD_W / 2; this.cy = WORLD_H / 2; this.zoom = 1;
    this.vw = 1280; this.vh = 720; this.target = null; this.manualT = 0; this.shake = 0;
    this.sx = 0; this.sy = 0; this.fixed = null;
  }
  get viewW() { return this.vw / this.zoom; }
  get viewH() { return this.vh / this.zoom; }
  worldTop() { return this.cy - this.viewH / 2; }
  rel(x) { return (x - (this.cx - this.viewW / 2)) / this.viewW; }
  follow(t, snap = false) { this.target = t; this.manualT = 0; this.fixed = null; if (snap && t) { this.cx = t.x; this.cy = t.y; } }
  look(x, y) { this.fixed = { x, y }; this.manualT = 0; }
  pan(dx, dy) { this.cx += dx / this.zoom; this.cy += dy / this.zoom; this.manualT = 2.5; }
  setZoom(z, sx, sy) {
    const nz = clamp(z, this.minZoom(), 2.2);
    if (sx !== undefined) {
      const wx = this.cx + (sx - this.vw / 2) / this.zoom, wy = this.cy + (sy - this.vh / 2) / this.zoom;
      this.zoom = nz;
      this.cx = wx - (sx - this.vw / 2) / this.zoom; this.cy = wy - (sy - this.vh / 2) / this.zoom;
    } else this.zoom = nz;
  }
  minZoom() { return Math.max(0.3, Math.min(this.vw / (WORLD_W + 400), this.vh / (WORLD_H + 300))); }
  toWorld(sx, sy) { return { x: this.cx + (sx - this.vw / 2) / this.zoom, y: this.cy + (sy - this.vh / 2) / this.zoom }; }
  update(dt) {
    if (this.manualT > 0) this.manualT -= dt;
    else {
      const t = this.fixed || (this.target && !this.target.dead ? this.target : null);
      if (t) {
        const k = 1 - Math.exp(-dt * 4.5);
        // keep a fast projectile a bit ahead of centre
        const lead = t.vx !== undefined && t.type === 'proj' ? 0.25 : 0;
        this.cx += (t.x + (t.vx || 0) * lead - this.cx) * k;
        this.cy += (t.y - 20 + (t.vy || 0) * lead - this.cy) * k;
      }
    }
    const hw = this.viewW / 2, hh = this.viewH / 2;
    this.cx = clamp(this.cx, Math.min(hw - 200, WORLD_W / 2), Math.max(WORLD_W + 200 - hw, WORLD_W / 2));
    this.cy = clamp(this.cy, Math.min(-250 + hh, WORLD_H / 2), Math.max(WORLD_H + 40 - hh, WORLD_H / 2));
    this.shake *= Math.exp(-dt * 6);
    if (this.shake < 0.1) this.shake = 0;
    this.sx = (Math.random() - 0.5) * this.shake * 2; this.sy = (Math.random() - 0.5) * this.shake * 2;
  }
}

export class Game {
  constructor(opts, ui) {
    this.opts = opts; this.ui = ui;
    // online games pass a resolved theme, seed and map style so every client builds the same land
    const themeKey = opts.terrain === 'random' || !THEMES[opts.terrain] ? pick(Object.keys(THEMES)) : opts.terrain;
    this.themeKey = themeKey;
    this.theme = THEMES[themeKey];
    this.terrain = new Terrain(WORLD_W, WORLD_H);
    this.seed = opts.seed ?? ((Math.random() * 1e9) | 0);
    this.mapStyle = opts.mapStyle ?? (Math.random() < 0.35 ? 'islands' : 'island');
    this.oid = 0;
    this.mySeat = opts.mySeat ?? 0;
    if (opts.testmap) this.terrain.generateTest('grass');
    else this.terrain.generate(themeKey, this.seed, this.mapStyle);
    if (opts.testmap) this.theme = THEMES.grass;
    this.waterY = WORLD_H - 48;
    this.fx = new FX();
    this.cam = new Camera(this);
    this.worms = []; this.objects = []; this.timers = [];
    this.time = 0; this.state = 'intro'; this.stateT = 0;
    this.wind = 0; this.round = 1; this.turnNo = 0; this.teamIdx = -1;
    this.timer = 0; this.power = 0; this.charging = false; this.fuse = 3;
    this.girderAng = 0; this.target = null; this.rope = null; this.jet = null; this.torch = null;
    this.ctrl = blankCtrl();
    this.voiceCool = new Map();
    this.suddenDeath = false;
    this.debris = debrisColors(this.theme);
    this.ai = new AI(this);
    this._makeTeams();
    this._placeWorms();
    this._placeObjects();
    this.cam.cx = WORLD_W / 2; this.cam.cy = WORLD_H * 0.45;
    this.marine = new Marine(this, opts.testmap ? 'grass' : themeKey, WORLD_W);
    this.flakes = Array.from({ length: 90 }, () => ({ x: rand(WORLD_W + 800) - 400, y: rand(WORLD_H), s: rand(0.5, 1.2), p: rand(TAU) }));
  }

  // ------------------------------------------------------------- setup

  _makeTeams() {
    const o = this.opts;
    if (o.teams === 'online') {
      // one team per connected player; "remote" = steered by someone else's keyboard
      this.teams = o.seats.map((seat, i) => {
        const d = { ...TEAM_DEFS[i] };
        const ammo = {}; for (const w of WEAPONS) ammo[w.id] = w.ammo;
        return { ...d, idx: i, cpu: false, brain: 'human', seat: seat.seat, player: seat.name, remote: seat.seat !== this.mySeat,
          worms: [], ammo, wormIdx: -1, game: this, lastWeapon: 'bazooka', names: [...NAMES[i]] };
      });
      return;
    }
    const layout = { '1v1cpu': [0, 1], '1v1': [0, 0], '1v3cpu': [0, 1, 1, 1], '4p': [0, 0, 0, 0], 'cpu2': [1, 1],
      '1v1jev': [0, 2], 'jevcpu': [2, 1], '1v2mix': [0, 2, 1] }[o.teams] || [0, 1];
    this.teams = layout.map((cpu, i) => {
      const d = { ...TEAM_DEFS[i] };
      if (cpu === 2) d.name = 'Team Jev';
      const ammo = {};
      for (const w of WEAPONS) ammo[w.id] = w.ammo;
      return { ...d, idx: i, cpu: !!cpu, brain: cpu === 2 ? 'jev' : cpu ? 'local' : 'human', worms: [], ammo, wormIdx: -1, game: this, lastWeapon: 'bazooka',
        names: [...NAMES[i]].sort(() => Math.random() - 0.5) };
    });
  }

  _placeWorms() {
    if (this.opts.testmap) {        // walker at the start of the course, opponents parked at the far end
      this.teams.forEach((t, ti) => {
        const xs = ti === 0 ? [150] : [2390, 2420, 2500];
        xs.forEach((x, k) => {
          const y = this.terrain.standY(x, 8, 0, this.waterY - 10);
          const w = new Worm(t, t.names[k], x, y ?? 100, this.opts.health);
          t.worms.push(w); this.worms.push(w);
        });
      });
      return;
    }
    const per = this.opts.worms;
    const spots = [];
    const T = this.terrain;
    // Worms start on the open surface: sky straight above them and just to either side
    // (so not at the foot of a narrow shaft). Only if a map runs out of surface do we
    // accept a roomy cave, and only after that anywhere at all.
    const skyAbove = (x, y) => { for (let yy = y - 12; yy > 0; yy -= 3) if (T.solid(x, yy)) return false; return true; };
    const onSurface = (x, y) => skyAbove(x, y) && skyAbove(x - 12, y) && skyAbove(x + 12, y);
    const roomy = (x, y) => !T.ray(x, y - 12, 0, -1, 90) && (!T.ray(x, y - 8, -1, 0, 120) || !T.ray(x, y - 8, 1, 0, 120));
    for (let k = 0; k < per; k++) for (const t of this.teams) {
      let pos = null;
      for (let tries = 0; tries < 800 && !pos; tries++) {
        const x = rand(90, WORLD_W - 90);
        // top-most standing spot in the column; a column whose top is buried in rock falls to the checks below
        const y = T.standY(x, 8, 0, this.waterY - 50);
        if (y == null) continue;
        if (tries < 550 ? !onSurface(x, y) : tries < 700 ? !roomy(x, y) : false) continue;
        const minGap = tries < 400 ? 70 : 30;
        if (spots.some(s => Math.hypot(s.x - x, s.y - y) < minGap)) continue;
        pos = { x, y };
      }
      if (!pos) pos = { x: rand(200, WORLD_W - 200), y: 50 };
      spots.push(pos);
      const w = new Worm(t, t.names[k % t.names.length], pos.x, pos.y, this.opts.health);
      t.worms.push(w); this.worms.push(w);
    }
  }

  _placeObjects() {
    if (this.opts.testmap) return;
    const occupied = this.worms.map(w => ({ x: w.x, y: w.y }));
    const place = (n, make, gap = 40) => {
      for (let i = 0, tries = 0; i < n && tries < 400; tries++) {
        const x = rand(80, WORLD_W - 80);
        const y = this.terrain.standY(x, 6, 0, this.waterY - 40);
        if (y == null || occupied.some(o => Math.hypot(o.x - x, o.y - y) < gap)) continue;
        occupied.push({ x, y }); this.add(make(x, y)); i++;
      }
    };
    place(this.opts.mines ?? 8, (x, y) => { const m = new Mine(x, y, 0); m.rest = true; return m; }, 45);
    place(4, (x, y) => { const b = new Barrel(x, y - 3); return b; }, 60);
  }

  add(o) { o.id = ++this.oid; this.objects.push(o); return o; }
  later(t, fn) { this.timers.push({ t, fn }); }

  // ------------------------------------------------------------ helpers

  get cur() { return this.curWorm; }
  get curTeam() { return this.teams[this.teamIdx]; }
  get weapon() { return WEAPON_BY_ID[this.weaponId]; }
  isHumanTurn() { return this.curTeam && !this.curTeam.cpu && !this.curTeam.remote && this.state !== 'over'; }
  aliveTeams() { return this.teams.filter(t => !t.surrendered && t.worms.some(w => w.alive)); }
  teamHp(t) { return t.worms.reduce((s, w) => s + (w.dead ? 0 : Math.max(0, w.hp)), 0); }

  voice(w, line, force = false) {
    if (!w || !w.team) return;
    const key = w.team.idx;
    if (!force && (this.voiceCool.get(key) || 0) > this.time) return;
    this.voiceCool.set(key, this.time + 1.1);
    const l = VOX[line] ? voxPick(line) : line;
    sound.vox(w.team.bank, l, { rate: w.team.pitch + rand(-0.05, 0.05), pan: clamp((this.cam.rel(w.x) - 0.5) * 1.4, -1, 1) });
  }

  tracer(x1, y1, x2, y2) { this.fx.add({ k: 'line', x1, y1, x2, y2, life: 0.12, t: 0 }); }

  quiet() {
    if (this.timers.length || this.torch || this.jet || this.rope) return false;
    for (const o of this.objects) if (!o.dead && o.busy()) return false;
    for (const w of this.worms) if (!w.dead && w.busy()) return false;
    return true;
  }

  // --------------------------------------------------------- explosions

  explode(x, y, R, dmg, o = {}) {
    const removed = o.noCarve ? 0 : this.terrain.carve(x, y, R);
    if (o.quiet) sound.at('explosion_small', x, this.cam, { vol: 0.25, rate: rand(1.3, 1.6) });
    else sound.at(o.sfx || (R >= 70 ? 'explosion_big' : R >= 38 ? 'explosion_med' : 'explosion_small'), x, this.cam, { rate: rand(0.92, 1.08) });
    if (o.small) this.fx.debris(x, y, 5, this.debris);
    else this.fx.explosion(x, y, R, removed > 10 ? this.debris : null);
    if (!o.small) { this.cam.shake = Math.max(this.cam.shake, R / 7); this.flash = Math.max(this.flash || 0, R / 400); }
    this.marine?.onExplosion(x, y, R);
    const reach = R * 1.15;
    for (const w of this.worms) {
      if (!w.alive) continue;
      const d = Math.hypot(w.x - x, w.y - 4 - y);
      if (d > reach + w.r) continue;
      const f = 1 - clamp((d - w.r) / reach, 0, 1);
      if (dmg > 0) {
        const n = Math.round(dmg * clamp(f * 1.3, 0, 1));
        if (n > 0) w.hurt(this, n, o.by);
        const sp = (dmg * 7 + 140) * f;
        const a = Math.atan2(w.y - 4 - y, w.x - x);
        w.launch(w.vx + Math.cos(a) * sp, w.vy + Math.sin(a) * sp - sp * 0.4);
      }
    }
    for (const ob of this.objects) {
      if (ob.dead || !ob.onBlast) continue;
      const d = Math.hypot(ob.x - x, ob.y - y);
      if (d < reach + (ob.r || 5)) ob.onBlast(this, 1 - clamp(d / (reach + 5), 0, 1), dmg, x, y);
    }
    for (const ob of this.objects) if (ob.rest && Math.hypot(ob.x - x, ob.y - y) < R + 40) ob.rest = false;
  }

  drown(w) {
    if (w.state === 'drown' || w.dead) return;
    if (w === this.cur && this.rope) this.releaseRope(w);
    w.state = 'drown'; w.dying = true; w.drowned = true;
    w.hp = 0; w.pending = 0; w.vx *= 0.3;
    this.fx.splash(w.x, this.waterY, 1.4);
    sound.at('splash', w.x, this.cam);
    this.later(0.3, () => { sound.at('drown', w.x, this.cam, { vol: 0.8 }); });
    this.voice(w, pick(['nooo', 'byebye']), true);
    const by = w.lastHitBy;
    if (by && by.team !== w.team) by.stats.kills++;
    if (w === this.cur && ['turn', 'retreat', 'control'].includes(this.state)) this.endTurnNow();
  }

  onWormHurt(w, n, by) {
    if (w === this.cur && ['turn', 'retreat', 'control'].includes(this.state) && !this.selfHurtGrace) this.endTurnNow();
    if (by === w) this.later(0.4, () => this.voice(w, 'onSelfHurt'));
    else this.later(0.25, () => this.voice(w, 'onHurt'));
    if (by && by.team !== w.team) this.turnHitEnemy = true;
  }

  onFallDamage(w) {
    if (w === this.cur && this.state === 'turn') this.endTurnNow();
  }

  endTurnNow() {
    if (this.rope) this.releaseRope(this.cur);
    if (this.jet) this.stopJet(this.cur);
    this.charging = false; this.power = 0;
    sound.stopLoop('fuse');
    if (['turn', 'retreat', 'control'].includes(this.state)) this.setState('settle');
  }

  surrender(team) {
    team.surrendered = true;
    sound.sfx('surrender', { vol: 0.9 });
    for (const w of team.worms) if (w.alive) { w.hp = 0; w.pending = 0; }
  }

  // ------------------------------------------------------------ crates

  collect(w, c) {
    c.dead = true;
    sound.at('collect', c.x, this.cam);
    if (c.kind === 'health') {
      w.hp += c.contents; w.shownHp = w.hp;
      this.fx.text(c.x, c.y - 24, `+${c.contents}`, '#7dff7a', true);
    } else {
      w.team.ammo[c.contents] = (w.team.ammo[c.contents] || 0) + 1;
      this.fx.text(c.x, c.y - 24, WEAPON_BY_ID[c.contents].name, '#ffe46b', true);
      if (w === this.cur) this.ui.refreshWeapons();
    }
    this.fx.sparkle(c.x, c.y, 14, '255,240,140');
  }

  dropCrate() {
    const r = Math.random();
    const kind = r < 0.45 ? 'weapon' : r < 0.78 ? 'health' : 'util';
    const contents = kind === 'health' ? 25 : kind === 'util' ? weighted(CRATE_UTILS) : weighted(CRATE_WEAPONS);
    let x = rand(120, WORLD_W - 120);
    for (let i = 0; i < 40; i++) {
      const y = this.terrain.standY(x, 8, 0, this.waterY - 30);
      if (y != null) break;
      x = rand(120, WORLD_W - 120);
    }
    const c = this.add(new Crate(kind, x, -40, contents));
    this.cam.follow(c);
    if (Math.random() < 0.6) sound.ann('ann_crate');
    return c;
  }

  // --------------------------------------------------------- turn flow

  setState(s) { this.state = s; this.stateT = 0; }

  start() {
    this.setState('intro');
    sound.ann('ann_battle');
    this.ui.bigMessage('LET BATTLE\nCOMMENCE!');
  }

  startTurn() {
    const alive = this.aliveTeams();
    if (alive.length <= 1) return this.gameOver();
    // next team with living worms
    let i = this.teamIdx;
    for (let k = 0; k < this.teams.length; k++) {
      i = (i + 1) % this.teams.length;
      if (alive.includes(this.teams[i])) break;
    }
    if (this.turnNo > 0 && i <= this.teamIdx) this.round++;
    this.teamIdx = i;
    this.turnNo++;
    const t = this.teams[i];
    const ws = t.worms;
    let j = t.wormIdx;
    for (let k = 0; k < ws.length; k++) { j = (j + 1) % ws.length; if (ws[j].alive) break; }
    t.wormIdx = j;
    this.curWorm = ws[j];

    if (!this.suddenDeath && this.round >= this.opts.sdRound) this.startSuddenDeath();
    else if (this.suddenDeath) this.waterY = Math.max(260, this.waterY - 16);

    this.wind = Math.random() < 0.15 ? 0 : clamp(rand(-1, 1) * rand(0.5, 1.1), -1, 1);
    this.timer = this.opts.turnTime;
    this.weaponId = t.ammo[t.lastWeapon] > 0 ? t.lastWeapon : 'bazooka';
    this.power = 0; this.charging = false; this.target = null; this.shot = 0; this.usedWeapons = new Set(); this.jetFuelLeft = null;
    this.turnHitEnemy = false; this.firedThisTurn = false; this.selfHurtGrace = false;
    this.ctrl = blankCtrl();
    for (const w of this.worms) w.walking = false;
    this.setState('turn');
    this.cam.follow(this.curWorm);
    sound.sfx('turn_start', { vol: 0.6 });
    if (Math.random() < 0.55) this.later(0.35, () => this.voice(this.curWorm, 'onSelect'));
    this.ui.turnStart(t, this.curWorm);
    if (t.cpu) this.ai.begin(this.curWorm);
  }

  startSuddenDeath() {
    this.suddenDeath = true;
    sound.sfx('sudden_death'); sound.ann('ann_sudden');
    this.ui.bigMessage('SUDDEN\nDEATH!');
    for (const w of this.worms) if (w.alive) { w.hp = Math.min(w.hp, 1); w.shownHp = w.hp; }
  }

  gameOver() {
    this.setState('over');
    sound.stopAllLoops();
    const alive = this.aliveTeams();
    const winner = alive[0] || null;
    this.winner = winner;
    this.later(0.2, () => sound.ann(winner ? 'ann_wins' : 'ann_draw'));
    if (winner) {
      this.later(1.6, () => { sound.sfx('victory'); this.voice(winner.worms.find(w => w.alive), 'victory', true); });
      this.cam.follow(winner.worms.find(w => w.alive));
    }
    this.later(2.2, () => this.ui.gameOver(this, winner));
  }

  // ------------------------------------------------------------- firing

  selectWeapon(id) {
    if (this.puppet) { if (this.isHumanTurn() && this.curTeam.ammo[id] > 0) { this.netSend({ t: 'cmd', k: 'weapon', v: id }); this.weaponId = id; this.ui.refreshWeapons(); return true; } return false; }
    const t = this.curTeam;
    if (!t || this.state !== 'turn' || this.charging) return false;
    if (!(t.ammo[id] > 0)) return false;
    if (this.rope || this.jet) return false;
    if (this.shot > 0 && id !== this.weaponId) return false; // mid-shotgun
    this.weaponId = id; this.target = null;
    if (!WEAPON_BY_ID[id].util) t.lastWeapon = id;
    sound.sfx('select', { vol: 0.5 });
    this.ui.refreshWeapons();
    return true;
  }

  setFuse(n) {
    this.fuse = clamp(n, 1, 5); this.ui.refreshWeapons();
    if (this.puppet) this.netSend({ t: 'cmd', k: 'fuse', v: this.fuse });
  }

  canFire() {
    const w = this.cur;
    return this.state === 'turn' && w && w.alive && (w.state === 'idle' || (this.weaponId === 'rope' && (w.state === 'air' || w.state === 'rope')) || (this.weaponId === 'jetpack' && w.state === 'air'));
  }

  fire(extra = {}) {
    if (this.puppet) { if (this.isHumanTurn()) this.netSend({ t: 'cmd', k: 'fire' }); return; }
    const w = this.cur, wp = this.weapon, t = this.curTeam;
    if (!this.canFire() || !(t.ammo[wp.id] > 0)) return;
    if (wp.needsTarget && !this.target && !extra.target) { this.ui.hint('Click to choose a target'); return; }
    if (!wp.util) this.shot++;
    const res = wp.use(this, w, { power: this.power, target: extra.target || this.target, fuse: this.fuse, shot: this.shot }) || {};
    this.power = 0; this.charging = false;
    if (!res.noAmmo && !this.usedWeapons.has(wp.id)) {
      this.usedWeapons.add(wp.id);
      if (t.ammo[wp.id] !== Infinity) t.ammo[wp.id]--;
      this.ui.refreshWeapons();
    }
    if (!wp.util) {
      this.firedThisTurn = true;
      if (Math.random() < 0.45 && this.shot === 1) this.voice(w, wp.id === 'grenade' || wp.id === 'cluster' ? 'grenade' : 'onFire');
    }
    if (res.keep) return;
    if (res.skip) { this.setState('settle'); return; }
    if (res.control) {
      this.controlled = res.control; this.setState('control');
      if (res.hint) this.ui.hint(res.hint);
      this.cam.follow(res.control);
      return;
    }
    this.timer = (res.retreat ?? 3) + (res.delay || 0);
    this.setState('retreat');
    this.target = null;
  }

  // --------------------------------------------------------- rope & jet

  fireRope(w) {
    if (this.rope) { this.releaseRope(w); return true; }
    const v = w.aimVec();
    const ox = w.x, oy = w.y - 6;
    sound.at('rope', w.x, this.cam, { vol: 0.8 });
    const hit = this.terrain.ray(ox + v.x * 6, oy + v.y * 6, v.x, v.y, 420);
    if (!hit) { this.fx.add({ k: 'line', x1: ox, y1: oy, x2: ox + v.x * 420, y2: oy + v.y * 420, life: 0.25, t: 0, rope: true }); return false; }
    // start a little shorter than the gap so a worm fired from the ground is lifted off it
    this.rope = { ax: hit.x - v.x, ay: hit.y - v.y, len: Math.max(16, Math.hypot(w.x - hit.x, w.y - hit.y) - 10) };
    w.state = 'rope'; w.rest = false;
    w.fallFrom = w.y;
    return true;
  }

  releaseRope(w) {
    this.rope = null;
    if (w && w.state === 'rope') { w.state = 'air'; w.rest = false; w.vy -= 30; }
  }

  tickRope(w, c, dt) {
    const r = this.rope, T = this.terrain;
    const s = (c.right ? 1 : 0) - (c.left ? 1 : 0);
    if (s) { w.vx += s * 330 * dt; w.facing = s; }
    if (c.up) r.len = Math.max(16, r.len - 170 * dt);
    if (c.down) r.len = Math.min(460, r.len + 170 * dt);
    w.vy += GRAV * dt;
    w.vx *= 0.999; w.vy *= 0.999;
    const n = Math.max(1, Math.ceil(Math.hypot(w.vx, w.vy) * dt / 2));
    for (let i = 0; i < n; i++) {
      const nx = w.x + w.vx * dt / n, ny = w.y + w.vy * dt / n;
      if (T.hitCircle(nx, ny, w.r)) {
        const nm = T.normalAt(w.x, w.y, w.r), vn = w.vx * nm.x + w.vy * nm.y;
        if (vn < 0) { w.vx -= 1.4 * vn * nm.x; w.vy -= 1.4 * vn * nm.y; }
        w.vx *= 0.9; w.vy *= 0.9;
        // slide along the surface on whichever axis is free
        if (!T.hitCircle(nx, w.y, w.r)) w.x = nx;
        else if (!T.hitCircle(w.x, ny, w.r)) w.y = ny;
        break;
      }
      w.x = nx; w.y = ny;
    }
    // inextensible rope
    const dx = w.x - r.ax, dy = w.y - r.ay, d = Math.hypot(dx, dy);
    if (d > r.len) {
      const px = r.ax + dx / d * r.len, py = r.ay + dy / d * r.len;
      if (!T.hitCircle(px, py, w.r)) { w.x = px; w.y = py; } else r.len = d;
      const ux = dx / d, uy = dy / d, vr = w.vx * ux + w.vy * uy;
      if (vr > 0) { w.vx -= vr * ux; w.vy -= vr * uy; }
    }
    if (T.hitCircle(w.x, w.y, w.r)) { let k = 0; while (T.hitCircle(w.x, w.y, w.r) && k++ < 10) w.y -= 1; }
  }

  startJet(w) {
    if (this.jet) { this.stopJet(w); return; }
    this.jet = { fuel: this.jetFuelLeft ?? 100 };
    w.state = 'jet'; w.rest = false; w.vy = Math.min(w.vy, -60); w.y -= 2;
  }
  stopJet(w) {
    if (this.jet) this.jetFuelLeft = this.jet.fuel;
    this.jet = null; sound.stopLoop('jetpack');
    if (w && w.state === 'jet') { w.state = 'air'; w.rest = false; w.fallFrom = w.y; w.noFallDmg = false; }
  }
  tickJet(w, c, dt) {
    const j = this.jet;
    const thrustUp = c.up && j.fuel > 0, side = ((c.right ? 1 : 0) - (c.left ? 1 : 0)) * (j.fuel > 0 ? 1 : 0);
    if (thrustUp) { w.vy -= 1000 * dt; j.fuel -= 11 * dt; }
    if (side) { w.vx += side * 380 * dt; w.facing = side; j.fuel -= 5 * dt; }
    w.vx = clamp(w.vx * 0.995, -220, 220); w.vy = clamp(w.vy, -280, 600);
    const thrusting = thrustUp || side;
    if (thrusting) {
      sound.loop('jetpack', { vol: 0.45 });
      for (let i = 0; i < 2; i++) this.fx.add({ k: 'fire', x: w.x - w.facing * 5 + rand(-2, 2), y: w.y + 6, vx: rand(-20, 20), vy: rand(120, 220),
        r: rand(2.5, 4.5), life: rand(0.15, 0.3), t: 0, drag: 2 });
    } else sound.stopLoop('jetpack');
    w.bounce = 0.15; w.friction = 0.4;
    const wasRest = w.rest; w.rest = false;
    const hit = stepBody(this, w, dt);
    void wasRest;
    if (hit && hit.speed > 420) { w.hurt(this, Math.min(30, Math.round((hit.speed - 420) / 8)), null); }
    if (w.rest && !thrusting && (j.fuel <= 0 || hit)) { this.stopJet(w); w.state = 'idle'; w.rest = true; }
    if (j.fuel <= 0 && w.state === 'jet') this.stopJet(w);
  }

  /** Blowtorch digs along the aim; the pneumatic drill (down) bores straight down. */
  startTorch(w, o = {}) {
    this.torch = {
      t: o.down ? 3.2 : 2.8, dir: w.facing, ang: o.down ? Math.PI / 2 : clamp(w.aim, -0.5, 0.9), dead: false, x: w.x, y: w.y,
      sfx: o.down ? 'drill' : 'dig', speed: o.down ? 52 : 58, down: !!o.down,
      busy() { return !this.dead; }, update() {}, draw() {},
    };
    w.state = 'torch';
    sound.loop(this.torch.sfx, { vol: 0.5 });
  }
  tickTorch(w, dt) {
    const T = this.torch;
    T.t -= dt;
    const dx = T.down ? 0 : Math.cos(T.ang) * T.dir, dy = Math.sin(T.ang);
    this.terrain.carve(w.x + dx * 8, w.y - 3 + dy * 8, 13, true);
    if (T.down) this.cam.shake = Math.max(this.cam.shake, 1.2);
    w.x += dx * T.speed * dt; w.y += dy * T.speed * dt;
    T.x = w.x; T.y = w.y;
    for (const o of this.worms) if (o !== w && o.alive && Math.hypot(o.x - w.x - dx * 12, o.y - w.y) < 14 && !o._torched) {
      o._torched = true; o.hurt(this, 15, w); o.launch(dx * 160, -120);
    }
    if (Math.random() < 0.6) this.fx.add({ k: 'spark', x: w.x + dx * 14, y: w.y - 3 + dy * 14, vx: rand(-120, 120) - dx * 100, vy: rand(-160, 20),
      life: rand(0.2, 0.5), t: 0, g: 500 });
    if (T.t <= 0 || w.state !== 'torch') {
      T.dead = true; this.torch = null; sound.stopLoop(T.sfx || 'dig');
      for (const o of this.worms) o._torched = false;
      if (w.state === 'torch') { w.state = 'air'; w.rest = false; w.vx = 0; w.vy = 0; }
    }
  }

  // ------------------------------------------------------------ targeting

  validTarget(x, y) {
    const wp = this.weapon, w = this.cur;
    if (!wp?.needsTarget) return false;
    if (wp.id === 'teleport') return y < this.waterY - 20 && x > 10 && x < WORLD_W - 10 && y > -100 && !this.terrain.hitCircle(x, y, 9);
    if (wp.id === 'girder') {
      return Math.hypot(x - w.x, y - w.y) < 260 && !this.terrain.girderOverlaps(x, y, this.girderAng)
        && !this.worms.some(o => o.alive && Math.hypot(o.x - x, o.y - y) < 24);
    }
    return true;
  }

  clickTarget(x, y) {
    if (!this.canFire()) return;
    const wp = this.weapon;
    if (!wp.needsTarget) return;
    if (!this.validTarget(x, y)) { sound.sfx('select', { vol: 0.3, rate: 0.6 }); return; }
    if (wp.instant) this.fire({ target: { x, y } });
    else { this.target = { x, y }; sound.sfx('homing_lock', { vol: 0.4 }); this.ui.hint('Target set — now aim and fire'); }
  }

  // --------------------------------------------------------------- update

  update(dt) {
    this.time += dt; this.stateT += dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 0.9);
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      if ((t.t -= dt) <= 0) { this.timers.splice(i, 1); t.fn(); }
    }

    // controls first so this tick's physics sees the input
    if (this.cur && this.cur.team.cpu && ['turn', 'retreat', 'control'].includes(this.state)) this.ai.tick(dt, this.ctrl);
    this.tickControls(dt);

    for (const w of this.worms) w.update(this, dt);
    for (const o of this.objects) if (!o.dead) o.update(this, dt);
    if (this.torch && this.cur) this.tickTorch(this.cur, dt);
    this.objects = this.objects.filter(o => !o.dead || o.keep);
    this.fx.update(dt, this.wind, this.waterY);
    this.marine.update(dt);
    this.cam.update(dt);

    switch (this.state) {
      case 'intro':
        if (this.stateT > 2.4) this.startTurn();
        break;
      case 'turn':
        if (this.opts.turnTime < 999) this.timer -= dt;
        if (this.timer <= 0) {
          sound.ann('ann_timeup');
          this.voice(this.cur, 'onTimeout');
          this.endTurnNow();
        }
        break;
      case 'control':
        if (!this.controlled || this.controlled.dead) { this.controlled = null; this.timer = 3; this.setState('retreat'); this.cam.follow(this.cur); }
        break;
      case 'retreat':
        this.timer -= dt;
        if (this.timer <= 0) this.endTurnNow();
        break;
      case 'settle':
        this._followAction();
        if (this.quiet()) { if ((this._qt = (this._qt || 0) + dt) > 0.45) { this._qt = 0; this.applyDamage(); } }
        else this._qt = 0;
        break;
      case 'damage':
        if (this.stateT > 1.2) this.processDeaths();
        break;
      case 'deaths':
        break;
      case 'crate':
        if (this.quiet() && this.stateT > 0.5) this.startTurn();
        break;
    }
    if (['turn', 'retreat', 'control'].includes(this.state)) this._followAction();
  }

  /** Point the camera at whatever is most interesting right now. */
  _followAction() {
    if (this.cam.manualT > 0) return;
    const live = this.objects.filter(o => !o.dead && (o.type === 'proj' || o.type === 'sheep' || o.type === 'donkey' || o.type === 'plane' || o.follow));
    const flying = live.find(o => o.type !== 'plane') || live[0];
    if (flying) { if (this.cam.target !== flying) this.cam.follow(flying); return; }
    const airborne = this.worms.find(w => !w.dead && w.state === 'air' && w !== this.cur && Math.hypot(w.vx, w.vy) > 60);
    if (airborne) { if (this.cam.target !== airborne) this.cam.follow(airborne); return; }
    if (this.cur && this.cur.alive && this.state !== 'settle' && this.cam.target !== this.cur) this.cam.follow(this.cur);
  }

  applyDamage() {
    let any = false;
    for (const w of this.worms) {
      if (w.dead || w.pending <= 0) continue;
      any = true;
      const n = Math.round(w.pending);
      w.hp = Math.max(0, w.hp - n);
      w.pending = 0;
      this.fx.text(w.x, w.y - 46, `-${n}`, w.team.color, true);
    }
    if (any) { this.setState('damage'); this.ui.refreshTeams(); }
    else this.processDeaths();
  }

  processDeaths() {
    const dying = this.worms.filter(w => w.alive && w.hp <= 0);
    if (!dying.length) {
      // drowned worms finish sinking before we move on
      if (!this.quiet()) { this.setState('settle'); return; }
      return this.endOfTurn();
    }
    this.setState('deaths');
    let delay = 0;
    for (const w of dying) {
      w.dying = true;
      const by = w.lastHitBy;
      this.later(delay, () => {
        this.cam.follow(w);
        this.voice(w, 'onDeath', true);
      });
      this.later(delay + 0.7, () => {
        w.dead = true; w.state = 'dead';
        if (by && by.team !== w.team) by.stats.kills++;
        this.explode(w.x, w.y, 28, 20, { sfx: 'explosion_small' });
        this.add(new Grave(w.x, w.y - 4, w.team.color));
        if (by && by.alive && by.team !== w.team && Math.random() < 0.7) this.later(0.6, () => this.voice(by, 'onKill'));
        this.ui.refreshTeams();
      });
      delay += 1.2;
    }
    this.later(delay + 0.2, () => this.setState('settle'));
  }

  endOfTurn() {
    this.ui.refreshTeams();
    const t = this.curTeam;
    if (t && this.firedThisTurn && !this.turnHitEnemy && Math.random() < 0.5 && this.cur?.alive) this.voice(this.cur, 'onMiss');
    if (this.aliveTeams().length <= 1) return this.gameOver();
    if (this.turnNo >= 1 && Math.random() < (this.opts.crates ?? 0.4)) { this.dropCrate(); this.setState('crate'); return; }
    this.startTurn();
  }

  // -------------------------------------------------------------- controls

  tickControls(dt) {
    const w = this.cur, c = this.ctrl;
    const acting = ['turn', 'retreat', 'control'].includes(this.state);
    if (!w || !w.alive || !acting) { c.jump = c.backflip = c.firePressed = false; c.target = null; return; }

    if (this.state === 'control') {
      if (this.controlled?.control) this.controlled.control(this, c, dt);
      else if (c.firePressed && this.controlled?.type === 'sheep') this.controlled.boom(this);
      c.firePressed = false; c.jump = false; c.backflip = false;
      return;
    }

    if (w.state === 'rope' && this.rope) {
      this.tickRope(w, c, dt);
      if (c.firePressed || c.jump) { this.releaseRope(w); }
      c.firePressed = c.jump = c.backflip = false;
      return;
    }
    if (w.state === 'jet' && this.jet) {
      this.tickJet(w, c, dt);
      if (c.firePressed || c.jump) this.stopJet(w);
      c.firePressed = c.jump = c.backflip = false;
      return;
    }

    const wp = this.weapon;
    // girder preview rotates on up/down instead of aiming
    if (this.state === 'turn' && wp?.id === 'girder') {
      if (c.upPressed) this.girderAng -= Math.PI / 8;
      if (c.downPressed) this.girderAng += Math.PI / 8;
    } else if (this.state === 'turn') {
      const rate = c.fine ? 0.5 : 1.7;
      if (c.up) w.aim = Math.max(-Math.PI / 2 + 0.02, w.aim - rate * dt);
      if (c.down) w.aim = Math.min(Math.PI / 2 - 0.02, w.aim + rate * dt);
    }
    if (c.aimAt && this.state === 'turn') {
      const dx = c.aimAt.x - w.x, dy = c.aimAt.y - (w.y - 6);
      if (Math.abs(dx) > 3 && !this.charging && w.state === 'idle') w.facing = dx >= 0 ? 1 : -1;
      w.aim = clamp(Math.atan2(dy, Math.max(0.001, dx * w.facing)), -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
    }
    c.aimAt = null;
    c.upPressed = c.downPressed = false;

    if (!this.charging && w.state === 'idle') {
      const s = (c.right ? 1 : 0) - (c.left ? 1 : 0);
      if (s) w.walk(this, s, dt); else w.walking = false;
      if (c.backflip) w.jump(true); else if (c.jump) { w.jump(false); if (Math.random() < 0.3) sound.at('jump', w.x, this.cam, { vol: 0.5 }); }
    }
    c.jump = c.backflip = false;

    if (c.target) { this.clickTarget(c.target.x, c.target.y); c.target = null; }

    if (this.state === 'turn' && wp) {
      if (wp.charge) {
        if (!this.charging && c.firePressed && this.canFire()) {
          if (wp.needsTarget && !this.target) this.ui.hint('Click to choose a target first');
          else { this.charging = true; this.power = 0; }
        }
        if (this.charging) {
          if (!c.fire) this.fire();
          else {
            this.power = Math.min(1, this.power + dt / 1.15);
            if (this.power >= 1) this.fire();
          }
        }
      } else if (c.firePressed && !wp.instant) {
        if (wp.id === 'rope' || wp.id === 'jetpack' ? true : this.canFire()) this.fire();
      } else if (c.firePressed && wp.instant) this.ui.hint(wp.id === 'girder' ? 'Click to place the girder (↑↓ rotate)' : 'Click on the map to choose a target');
    }
    c.firePressed = false;
  }
}

export class Grave {
  constructor(x, y, color) {
    Object.assign(this, { type: 'grave', x, y, vx: 0, vy: -120, r: 7, bounce: 0.2, friction: 0.5, color, rest: false });
  }
  busy() { return !this.dead && !this.rest; }
  update(g, dt) { if (this.dead) return; stepBody(g, this, dt); if (this.y > g.waterY + 10) this.dead = true; }
  onBlast(g, f, dmg, ex, ey) {
    const a = Math.atan2(this.y - ey, this.x - ex);
    this.vx += Math.cos(a) * 300 * f; this.vy += Math.sin(a) * 300 * f - 80; this.rest = false;
  }
  draw(c) { drawSprite(c, images.tombstone, this.x, this.y - 3, 20); }
}

function blankCtrl() {
  return { left: false, right: false, up: false, down: false, fire: false, firePressed: false, jump: false, backflip: false,
    target: null, aimAt: null, upPressed: false, downPressed: false, fine: false };
}

function debrisColors(theme) {
  const [r, g, b] = theme.top;
  return [`rgb(${r},${g},${b})`, '#6b4a2b', '#4a3220', '#8a6a4a', '#3a2818'];
}

void randInt;
