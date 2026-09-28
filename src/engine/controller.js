// ===== engine controller: loading, loop, input, match lifecycle, online =====
// React owns every menu/HUD pixel; this module owns the canvas, the simulation and the
// input devices, and exposes plain functions the React UI calls.
import { loadAssets, images } from './assets.js';
import { sound } from './audio.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { WEAPONS } from './weapons.js';
import { toast } from './toast.js';
import { Conn, NetHost, NetGuest } from './net.js';
import { THEMES } from './terrain.js';
import { store } from './store.js';
import { UIBridge } from './bridge.js';

export const BUILD = '2026-09-28 spawns';

const $ = id => document.getElementById(id);
let canvas, renderer;
const ui = new UIBridge();
let game = null;
let net = null;            // { conn, role, seat, players, host?, guest? }
const S = () => store.getState();

// ------------------------------------------------------------------ telemetry
function gpuName() {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : (gl ? 'webgl (renderer hidden)' : 'NO WEBGL');
  } catch { return 'unknown'; }
}
const tele = { frames: [], sent: 0, gpu: '' };
const beacon = obj => { try { navigator.sendBeacon('/api/telemetry', JSON.stringify({ build: BUILD, ...obj })); } catch { /* ignore */ } };

// ------------------------------------------------------------------ boot
let booted = false;
export async function boot() {
  if (booted) return; booted = true;
  canvas = $('game');
  renderer = new Renderer(canvas);
  tele.gpu = gpuName();
  beacon({ ev: 'load', ua: navigator.userAgent, gpu: tele.gpu, dpr: devicePixelRatio, vw: innerWidth, vh: innerHeight, cores: navigator.hardwareConcurrency });
  bindInput();
  requestAnimationFrame(frame);
  window.addEventListener('resize', () => { renderer.resize(); renderer.bgFor = null; });
  let pi = 0, pa = 0;
  const upd = text => store.setState({ load: pi * 0.3 + pa * 0.7, ...(text ? { loadText: text } : {}) });
  await Promise.all([
    loadAssets(p => { pi = p; upd(); }),
    sound.loadAll(p => { pa = p; upd(`Loading sounds ${Math.round(p * 100)}%`); }),
  ]);
  let jevEnabled = false;
  try { jevEnabled = !!(await (await fetch('/api/jev/status')).json()).enabled; } catch { /* offline */ }
  const o = S().options;
  const jevModes = ['1v1jev', '1v2mix', 'jevcpu'];
  store.setState({ phase: 'menu', jevEnabled, options: !jevEnabled && jevModes.includes(o.teams) ? { ...o, teams: '1v1cpu' } : o });
  console.info(`Worms Armageddon build ${BUILD}`);
  const invite = new URLSearchParams(location.search).get('join');
  if (invite) {
    history.replaceState(null, '', location.pathname);           // don't re-join on refresh
    store.setState({ inviteCode: invite.toUpperCase() });
    if (S().playerName.trim()) joinOnline(invite);
    else toast.info('You were invited to a game', { description: 'Enter your name and press Join.', duration: 8000 });
  }
}

export const imageUrl = name => images[name]?.src || '';

// ------------------------------------------------------------------ matches
function optsFromStore() {
  const o = S().options;
  return { ...o, testmap: new URLSearchParams(location.search).has('testmap') };
}

function startGame(opts) {
  sound.init(); sound.resume();
  gfx.mode = opts.gfx || 'auto';
  renderer.setQuality(gfx.mode === 'auto' ? 'high' : gfx.mode);
  gfx.t = 0; gfx.frames = 0; gfx.grace = 2;
  game = new Game(opts, ui);
  ui.attach(game);
  if (net?.role === 'host') net.host = new NetHost(net.conn, game, ui);
  if (net?.role === 'guest') net.guest = new NetGuest(net.conn, game, ui);
  if (net?.role !== 'guest') game.start();
  canvas.focus();
}

/** The big start button: local match, or (host) launch the online match. */
export function start() {
  if (!net) return startGame(optsFromStore());
  if (net.role !== 'host' || net.players.length < 2) return;
  const opts = optsFromStore();
  if (opts.terrain === 'random') { const k = Object.keys(THEMES); opts.terrain = k[Math.floor(Math.random() * k.length)]; }
  Object.assign(opts, { teams: 'online', seats: net.players, seed: (Math.random() * 1e9) | 0,
    mapStyle: Math.random() < 0.35 ? 'islands' : 'island', worms: Math.min(opts.worms, 6) });
  net.conn.relay({ t: 'start', opts });
  startGame({ ...opts, mySeat: 0 });
}

export function backToMenu() {
  if (net) leaveOnline();
  sound.stopAllLoops();
  game = null;
  ui.detach();
  store.setState({ phase: 'menu', paused: false, helpOpen: false });
}

export function setPaused(p) { store.setState({ paused: !!p && !!game }); }
export function setHelp(open) { store.setState({ helpOpen: !!open }); }
export function togglePanel() { ui.togglePanel(); }
export function closePanel() { ui.closePanel(); }
export function toggleMute() { store.setState({ muted: sound.toggleMute() }); }
export function selectWeapon(id) { if (game?.selectWeapon(id)) ui.closePanel(); }
export function setFuse(n) { game?.setFuse(n); }
export function skipTurn() { if (game?.isHumanTurn() && game.state === 'turn') { game.selectWeapon('skipgo'); game.fire(); } }
export function surrender() { if (game?.isHumanTurn() && game.state === 'turn') { game.selectWeapon('surrender'); game.fire(); } }
export function centerCamera() { if (game?.cur) game.cam.follow(game.cur); }
export const previewTerrain = key => renderer?.previewTheme?.(key);

// ------------------------------------------------------------------ input
const keys = new Set();
const edge = { jump: false, backflip: false, fire: false, up: false, down: false };
let jumpPending = 0, mouseFire = false;
const mouse = { x: 0, y: 0, in: false };
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'fire',
};
const typing = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;

/** On-screen pad (touch devices) feeds the same key state. */
export function pad(k, down) {
  sound.resume();
  if (k === 'jump') { if (down) edge.jump = true; return; }
  if (k === 'backflip') { if (down) edge.backflip = true; return; }
  if (down) { keys.add(k); if (k === 'fire') edge.fire = true; if (k === 'up') edge.up = true; if (k === 'down') edge.down = true; }
  else keys.delete(k);
}

function bindInput() {
  window.addEventListener('keydown', e => {
    sound.resume();
    if (typing(e)) return;
    const k = e.code, s = S();
    if (k === 'F3') { e.preventDefault(); togglePerf(); return; }
    if (!game) return;
    if (k === 'Tab') { e.preventDefault(); ui.togglePanel(); return; }
    if (k === 'Escape') {
      if (s.panelOpen) ui.closePanel(); else if (s.helpOpen) setHelp(false);
      else if (game.state !== 'over') setPaused(!s.paused);
      return;
    }
    if (k === 'KeyP') { setPaused(!s.paused); return; }
    if (k === 'KeyH') { setHelp(!s.helpOpen); return; }
    if (k === 'KeyM') { toggleMute(); return; }
    if (s.paused || s.helpOpen || s.panelOpen) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Enter'].includes(k)) e.preventDefault();
    if (e.repeat) return;
    const m = KEYMAP[k];
    if (m) { keys.add(m); if (m === 'fire') edge.fire = true; if (m === 'up') edge.up = true; if (m === 'down') edge.down = true; }
    if (k === 'Enter' || k === 'NumpadEnter') {
      if (jumpPending) { jumpPending = 0; edge.backflip = true; } else jumpPending = performance.now();   // double-tap = backflip
    }
    if (k === 'Backspace') edge.backflip = true;
    if (k >= 'Digit1' && k <= 'Digit5') game.setFuse(+k.slice(5));
    if (k === 'KeyQ' || k === 'KeyE') cycleWeapon(k === 'KeyE' ? 1 : -1);
    if (k === 'KeyC') centerCamera();
    if (k === 'ShiftLeft' || k === 'ShiftRight') keys.add('fine');
  });
  window.addEventListener('keyup', e => {
    const m = KEYMAP[e.code]; if (m) keys.delete(m);
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.delete('fine');
  });
  window.addEventListener('blur', () => { keys.clear(); mouseFire = false; });

  let rdrag = null;
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    sound.resume();
    if (!game || S().paused) return;
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (e.pointerType === 'touch') return touchDown(e);
    if (e.button === 2 || e.button === 1) { rdrag = { x: e.clientX, y: e.clientY, moved: 0 }; canvas.setPointerCapture(e.pointerId); return; }
    if (e.button !== 0) return;
    if (S().panelOpen) return ui.closePanel();
    if (!game.isHumanTurn()) return;
    const wp = game.weapon;
    if (wp?.needsTarget && (wp.instant || !game.target)) game.ctrl.target = game.cam.toWorld(e.clientX, e.clientY);
    else { mouseFire = true; edge.fire = true; }
  });
  canvas.addEventListener('pointermove', e => {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.in = true;
    if (!game) return;
    if (e.pointerType === 'touch') return touchMove(e);
    if (rdrag) {
      const dx = e.clientX - rdrag.x, dy = e.clientY - rdrag.y;
      rdrag.moved += Math.abs(dx) + Math.abs(dy);
      game.cam.pan(-dx, -dy); rdrag.x = e.clientX; rdrag.y = e.clientY;
      return;
    }
    if (game.isHumanTurn() && !S().panelOpen) {
      const wp = game.weapon;
      if (wp && !(wp.needsTarget && wp.instant) && wp.id !== 'girder') game.ctrl.aimAt = game.cam.toWorld(e.clientX, e.clientY);
    }
  });
  canvas.addEventListener('pointerleave', () => { mouse.in = false; });
  canvas.addEventListener('pointerup', e => {
    if (e.pointerType === 'touch') return touchUp(e);
    if (rdrag && (e.button === 2 || e.button === 1)) { if (rdrag.moved < 6 && e.button === 2) ui.togglePanel(); rdrag = null; return; }
    if (e.button === 0) mouseFire = false;
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (!game) return;
    if (game.weaponId === 'girder' && game.isHumanTurn()) { game.girderAng += Math.sign(e.deltaY) * Math.PI / 8; return; }
    game.cam.setZoom(game.cam.zoom * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
  }, { passive: false });
}

function cycleWeapon(d) {
  const t = game.curTeam; if (!t) return;
  const list = WEAPONS.filter(w => t.ammo[w.id] > 0);
  let i = list.findIndex(w => w.id === game.weaponId);
  for (let n = 0; n < list.length; n++) { i = (i + d + list.length) % list.length; if (game.selectWeapon(list[i].id)) return; }
}

const touches = new Map();
let pinch = null;
function touchDown(e) {
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
  if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: game.cam.zoom }; }
}
function touchMove(e) {
  const t = touches.get(e.pointerId); if (!t) return;
  const dx = e.clientX - t.x, dy = e.clientY - t.y; t.x = e.clientX; t.y = e.clientY;
  if (touches.size === 2 && pinch) { const [a, b] = [...touches.values()]; game.cam.setZoom(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d); }
  else if (touches.size === 1) game.cam.pan(-dx, -dy);
}
function touchUp(e) {
  const t = touches.get(e.pointerId);
  touches.delete(e.pointerId); if (touches.size < 2) pinch = null;
  if (!t || !game) return;
  if (Math.hypot(e.clientX - t.sx, e.clientY - t.sy) < 10 && performance.now() - t.t < 400 && game.isHumanTurn()) {
    const p = game.cam.toWorld(e.clientX, e.clientY), wp = game.weapon;
    if (wp?.needsTarget && (wp.instant || !game.target)) game.ctrl.target = p;
    else if (wp && wp.id !== 'girder') game.ctrl.aimAt = p;
    game.cam.manualT = 0;
  }
}

function applyInput() {
  const c = game.ctrl, s = S();
  if (game.curTeam?.remote && net?.role === 'host') return;       // that player's inputs arrive over the network
  if (!game.isHumanTurn() || s.panelOpen || s.helpOpen) {
    edge.fire = edge.jump = edge.backflip = edge.up = edge.down = false;
    if (!game.isHumanTurn()) return;
    c.left = c.right = c.up = c.down = c.fire = false;
    return;
  }
  c.left = keys.has('left'); c.right = keys.has('right'); c.up = keys.has('up'); c.down = keys.has('down');
  c.fine = keys.has('fine'); c.fire = keys.has('fire') || mouseFire;
  if (edge.fire) { c.firePressed = true; edge.fire = false; }
  if (edge.up) { c.upPressed = true; edge.up = false; }
  if (edge.down) { c.downPressed = true; edge.down = false; }
  if (jumpPending && performance.now() - jumpPending > 230) { jumpPending = 0; edge.jump = true; }
  if (edge.jump) { c.jump = true; edge.jump = false; }
  if (edge.backflip) { c.backflip = true; edge.backflip = false; }
}

// ------------------------------------------------------------------ online
const onlineState = () => net ? { role: net.role, code: net.conn.code, seat: net.seat, players: net.players } : null;
const publish = () => store.setState({ online: onlineState() });
const myName = () => {
  let n = S().playerName.trim();
  if (!n) { n = `Player ${1000 + Math.floor(Math.random() * 9000)}`; store.setState({ playerName: n }); }
  try { localStorage.setItem('wa-name', n); } catch { /* ignore */ }
  return n;
};

function wireConn(conn) {
  conn.on('lobby', m => { net.players = m.players; publish(); })
    .on('error', m => { toast.error('Could not join', { id: 'join', description: m.error }); leaveOnline(); })
    .on('peer-left', m => { net.players = m.players; publish(); if (net.host) net.host.peerLeft(m.seat); else toast.info('A player left the lobby'); })
    .on('host-left', () => { toast.error('The host left the game', { description: 'Back to the menu.' }); if (game) backToMenu(); else leaveOnline(); })
    .on('close', () => { if (net) { toast.error('Disconnected from the game server'); if (game) backToMenu(); else leaveOnline(); } })
    .on('msg', m => {
      const msg = m.msg;
      if (net?.role === 'host') net.host?.onInput(m.from, msg);
      else if (msg.t === 'start') startGame({ ...msg.opts, mySeat: net.seat });
      else net?.guest?.onMessage(msg);
    });
}

export async function hostOnline() {
  sound.init(); sound.resume();
  const conn = new Conn();
  try { await conn.open(); } catch (e) { return toast.error('Online play unavailable', { description: e.message }); }
  net = { conn, role: 'host', seat: 0, players: [] };
  wireConn(conn);
  conn.on('hosted', m => {
    conn.code = m.code; net.players = m.players; publish();
    toast.success('Game hosted', { description: `Share code ${m.code} or copy the invite link.`, duration: 5000 });
  });
  conn.send({ t: 'host', name: myName() });
}

export async function joinOnline(code) {
  sound.init(); sound.resume();
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 6) return toast.error('Enter the 6-letter room code');
  const conn = new Conn();
  try { await conn.open(); } catch (e) { return toast.error('Online play unavailable', { description: e.message }); }
  net = { conn, role: 'guest', seat: null, players: [] };
  wireConn(conn);
  toast.loading('Joining game', { id: 'join', loader: 'dots', description: code });
  conn.on('joined', m => {
    conn.code = m.code; net.seat = m.seat; net.players = m.players; publish();
    toast.success('Joined', { id: 'join', description: 'Waiting for the host to start.' });
  });
  conn.send({ t: 'join', code, name: myName() });
}

export function leaveOnline() {
  if (!net) return;
  net.host?.release();
  const c = net.conn; net = null;
  try { c.close(); } catch { /* gone */ }
  publish();
}

export const inviteLink = () => net ? `${location.origin}/?join=${net.conn.code}` : '';

// ------------------------------------------------------------------ loop
const gfx = { mode: 'auto', t: 0, frames: 0, grace: 2 };
const TIERS = ['high', 'medium', 'low'];
function autoQuality(dt) {
  if (gfx.mode !== 'auto' || document.hidden || S().paused) return;
  if (gfx.grace > 0) { gfx.grace -= dt; return; }
  gfx.t += dt; gfx.frames++;
  if (gfx.t < 2) return;
  const fps = gfx.frames / gfx.t; gfx.t = 0; gfx.frames = 0;
  const i = TIERS.indexOf(renderer.quality);
  if (fps < 48 && i < TIERS.length - 1) {
    renderer.setQuality(TIERS[i + 1]); gfx.grace = 1.5;
    toast.info(`Graphics lowered to ${TIERS[i + 1]}`, { description: `Running at ${fps.toFixed(0)} fps. You can change this in the menu.`, duration: 5000 });
  }
}

const STEP = 1 / 60;
let acc = 0, last = performance.now();
const perf = { on: false, el: null, fps: 60, upd: 0, draw: 0, n: 0 };
function togglePerf() {
  perf.on = !perf.on;
  if (!perf.el) { perf.el = document.createElement('pre'); perf.el.id = 'perf'; document.body.appendChild(perf.el); }
  perf.el.style.display = perf.on ? 'block' : 'none';
  renderer.prof = perf.on ? {} : null;
}

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (new URLSearchParams(location.search).has('perf') && !perf.el) togglePerf();
  if (game && !S().paused) {
    acc += dt;
    const t0 = performance.now();
    game.ai.frameStart = t0;
    let ticks = 0;
    while (acc >= STEP && ticks < 3) {
      applyInput();
      if (net?.guest) { net.guest.sendInput(); net.guest.update(STEP); }
      else { game.update(STEP); net?.host?.afterTick(); }
      acc -= STEP; ticks++;
    }
    if (acc > STEP) acc = 0;
    const t1 = performance.now();
    renderer.draw(game, mouse.in ? mouse : null);
    ui.frame(game, dt);
    autoQuality(dt);
    const t2 = performance.now();
    tele.frames.push([dt * 1000, t1 - t0, t2 - t1]);
    if (now - tele.sent > 5000 && tele.frames.length > 20) {
      const f = tele.frames.map(x => x[0]).sort((a, b) => a - b), q = k => f[Math.min(f.length - 1, Math.floor(f.length * k))];
      const avg = k => tele.frames.reduce((s, x) => s + x[k], 0) / tele.frames.length;
      beacon({ ev: 'perf', fps: +(1000 / avg(0)).toFixed(1), p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +f[f.length - 1].toFixed(1),
        updMs: +avg(1).toFixed(2), drawMs: +avg(2).toFixed(2), q: renderer.quality, mode: gfx.mode, dpr: renderer.dpr,
        canvas: `${canvas.width}x${canvas.height}`, vw: innerWidth, vh: innerHeight, state: game.state, gpu: tele.gpu });
      tele.frames = []; tele.sent = now;
    }
    if (perf.on && (perf.n++ & 7) === 0) {
      perf.fps = 1 / Math.max(dt, 1e-3);
      const p = renderer.prof || {};
      perf.el.textContent = `fps ${perf.fps.toFixed(0)}  gfx ${gfx.mode}:${renderer.quality}\nupdate ${(t1 - t0).toFixed(2)}ms  draw ${(t2 - t1).toFixed(2)}ms\n` +
        Object.entries(p).map(([k, v]) => `  ${k.padEnd(8)} ${v.toFixed(2)}`).join('\n');
    }
  } else if (game) renderer.draw(game, null);
  requestAnimationFrame(frame);
}

// debugging / test hooks
window.__wa = () => game;
Object.defineProperty(window, '__r', { get: () => renderer });
window.__setPaused = setPaused;
import { setOptions as _setOptions } from './store.js';
window.__store = store;
window.__toast = toast;
window.__setOptions = _setOptions;
window.__ctl = { start, backToMenu, hostOnline, joinOnline, leaveOnline, selectWeapon, togglePanel, setFuse, skipTurn };
