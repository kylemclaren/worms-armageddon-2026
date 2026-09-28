// ===== bootstrap, loop and input =====
import { loadAssets } from './assets.js';
import { sound } from './audio.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { WEAPONS } from './weapons.js';

const $ = id => document.getElementById(id);
export const BUILD = '2026-09-28 perf-telemetry';

// ---- telemetry: real frame timings from the player's machine, sent to our own server
function gpuName() {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : (gl ? 'webgl (renderer hidden)' : 'NO WEBGL');
  } catch { return 'unknown'; }
}
const tele = { frames: [], sent: 0, gpu: gpuName() };
function beacon(obj) {
  try { navigator.sendBeacon('api/telemetry', JSON.stringify({ build: BUILD, ...obj })); } catch { /* ignore */ }
}
beacon({ ev: 'load', ua: navigator.userAgent, gpu: tele.gpu, dpr: devicePixelRatio, vw: innerWidth, vh: innerHeight, cores: navigator.hardwareConcurrency });
const canvas = $('game');
const renderer = new Renderer(canvas);
const ui = new UI();
let game = null;
let paused = false;

// ------------------------------------------------------------------ loading

(async () => {
  let pi = 0, pa = 0;
  const bar = document.querySelector('.lbar'), txt = document.querySelector('.ltext');
  const upd = () => { bar.style.width = `${(pi * 0.3 + pa * 0.7) * 100}%`; };
  await Promise.all([
    loadAssets(p => { pi = p; upd(); }),
    sound.loadAll(p => { pa = p; upd(); txt.textContent = `Loading sounds… ${Math.round(p * 100)}%`; }),
  ]);
  // Jev options need the server-side proxy to have a TypeSafe key
  try {
    const st = await (await fetch('api/jev/status')).json();
    if (!st.enabled) for (const o of document.querySelectorAll('option[data-jev]')) { o.disabled = true; o.textContent += ' — needs API key'; }
  } catch { for (const o of document.querySelectorAll('option[data-jev]')) o.disabled = true; }
  $('buildTag').textContent = `build ${BUILD}`;
  $('loading').classList.add('hidden');
  $('menuMain').classList.remove('hidden');
  try {
    const saved = JSON.parse(localStorage.getItem('wa-opts') || '{}');
    for (const [k, v] of Object.entries(saved)) {
      const el = $(k);
      if (el && ![...el.options].find(o => o.value === v)?.disabled) el.value = v;
    }
  } catch { /* storage unavailable */ }
})();

function readOpts() {
  const ids = ['optTerrain', 'optWorms', 'optTeams', 'optTime', 'optHealth', 'optSD', 'optAI', 'optMines', 'optCrates', 'optGfx'];
  const raw = Object.fromEntries(ids.map(id => [id, $(id).value]));
  try { localStorage.setItem('wa-opts', JSON.stringify(raw)); } catch { /* ignore */ }
  return {
    terrain: raw.optTerrain, worms: +raw.optWorms, teams: raw.optTeams, turnTime: +raw.optTime,
    health: +raw.optHealth, sdRound: +raw.optSD, ai: raw.optAI, mines: +raw.optMines, crates: +raw.optCrates, gfx: raw.optGfx,
    testmap: new URLSearchParams(location.search).has('testmap'),
  };
}

function startGame() {
  sound.init(); sound.resume();
  $('menu').classList.add('hidden');
  $('gameover').classList.add('hidden');
  const opts = readOpts();
  gfx.mode = opts.gfx || 'auto';
  renderer.setQuality(gfx.mode === 'auto' ? 'high' : gfx.mode);
  gfx.t = 0; gfx.frames = 0; gfx.grace = 2;
  game = new Game(opts, ui);
  ui.attach(game);
  game.start();
  canvas.focus();
}

$('btnStart').onclick = startGame;
$('btnAgain').onclick = () => {
  $('gameover').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('menu').classList.remove('hidden');
  sound.stopAllLoops();
  game = null;
};
$('btnWeapons').onclick = () => ui.togglePanel();
$('btnSkip').onclick = () => { if (game?.isHumanTurn() && game.state === 'turn') { game.selectWeapon('skipgo'); game.fire(); } };
$('btnSound').onclick = () => { $('btnSound').textContent = sound.toggleMute() ? '🔇' : '🔊'; };
$('btnHelp').onclick = () => $('help').classList.toggle('hidden');
$('btnCloseHelp').onclick = () => $('help').classList.add('hidden');
$('btnResume').onclick = () => setPaused(false);
$('btnQuit').onclick = () => { setPaused(false); $('btnAgain').onclick(); };

function setPaused(p) {
  paused = p && !!game;
  $('pause').classList.toggle('hidden', !paused);
}

// ------------------------------------------------------------------ input

const keys = new Set();
const edge = { jump: false, backflip: false, fire: false, up: false, down: false };
let jumpPending = 0;
let mouseFire = false;
const mouse = { x: 0, y: 0, in: false };

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'fire',
};

window.addEventListener('keydown', e => {
  sound.resume();
  if (e.target.tagName === 'SELECT') return;
  const k = e.code;
  if (k === 'Tab') { e.preventDefault(); ui.togglePanel(); return; }
  if (k === 'Escape') {
    if (ui.panelOpen()) ui.closePanel();
    else if (!$('help').classList.contains('hidden')) $('help').classList.add('hidden');
    else if (game && game.state !== 'over') setPaused(!paused);
    return;
  }
  if (k === 'KeyP' && game) { setPaused(!paused); return; }
  if (k === 'F3') { e.preventDefault(); togglePerf(); return; }
  if (k === 'KeyH') { $('help').classList.toggle('hidden'); return; }
  if (k === 'KeyM') { $('btnSound').onclick(); return; }
  if (!game || paused) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Enter'].includes(k)) e.preventDefault();
  if (e.repeat) return;
  const m = KEYMAP[k];
  if (m) {
    keys.add(m);
    if (m === 'fire') edge.fire = true;
    if (m === 'up') edge.up = true;
    if (m === 'down') edge.down = true;
  }
  if (k === 'Enter' || k === 'NumpadEnter') {
    // double-tap Enter = backflip (as in the original)
    if (jumpPending) { jumpPending = 0; edge.backflip = true; } else jumpPending = performance.now();
  }
  if (k === 'Backspace') edge.backflip = true;
  if (k >= 'Digit1' && k <= 'Digit5') game.setFuse(+k.slice(5));
  if (k === 'KeyQ' || k === 'KeyE') cycleWeapon(k === 'KeyE' ? 1 : -1);
  if (k === 'KeyC') game.cam.follow(game.cur);
  if (k === 'ShiftLeft' || k === 'ShiftRight') keys.add('fine');
});
window.addEventListener('keyup', e => {
  const m = KEYMAP[e.code];
  if (m) keys.delete(m);
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.delete('fine');
});
window.addEventListener('blur', () => { keys.clear(); mouseFire = false; });

function cycleWeapon(d) {
  const t = game.curTeam; if (!t) return;
  const list = WEAPONS.filter(w => t.ammo[w.id] > 0);
  let i = list.findIndex(w => w.id === game.weaponId);
  for (let n = 0; n < list.length; n++) {
    i = (i + d + list.length) % list.length;
    if (game.selectWeapon(list[i].id)) return;
  }
}

// --- mouse: left = fire/target, right-drag = pan, right-click = weapons, wheel = zoom
let rdrag = null;
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  sound.resume();
  if (!game || paused) return;
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (e.pointerType === 'touch') { touchDown(e); return; }
  if (e.button === 2 || e.button === 1) { rdrag = { x: e.clientX, y: e.clientY, moved: 0 }; canvas.setPointerCapture(e.pointerId); return; }
  if (e.button !== 0) return;
  if (ui.panelOpen()) { ui.closePanel(); return; }
  if (!game.isHumanTurn()) return;
  const wp = game.weapon;
  if (wp?.needsTarget && (wp.instant || !game.target)) {
    game.ctrl.target = game.cam.toWorld(e.clientX, e.clientY);
  } else { mouseFire = true; edge.fire = true; }
});
canvas.addEventListener('pointermove', e => {
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.in = true;
  if (!game) return;
  if (e.pointerType === 'touch') { touchMove(e); return; }
  if (rdrag) {
    const dx = e.clientX - rdrag.x, dy = e.clientY - rdrag.y;
    rdrag.moved += Math.abs(dx) + Math.abs(dy);
    game.cam.pan(-dx, -dy);
    rdrag.x = e.clientX; rdrag.y = e.clientY;
    return;
  }
  if (game.isHumanTurn() && !ui.panelOpen()) {
    const wp = game.weapon;
    if (wp && !(wp.needsTarget && wp.instant) && wp.id !== 'girder') game.ctrl.aimAt = game.cam.toWorld(e.clientX, e.clientY);
  }
});
canvas.addEventListener('pointerup', e => {
  if (e.pointerType === 'touch') { touchUp(e); return; }
  if (rdrag && (e.button === 2 || e.button === 1)) {
    if (rdrag.moved < 6 && e.button === 2) ui.togglePanel();
    rdrag = null; return;
  }
  if (e.button === 0) mouseFire = false;
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (!game) return;
  if (game.weaponId === 'girder' && game.isHumanTurn()) { game.girderAng += Math.sign(e.deltaY) * Math.PI / 8; return; }
  game.cam.setZoom(game.cam.zoom * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
}, { passive: false });

// --- touch: one finger drag pans, tap targets; on-screen pad drives the worm
const touches = new Map();
let pinch = null;
function touchDown(e) {
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
  if (touches.size === 2) {
    const [a, b] = [...touches.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: game.cam.zoom };
  }
}
function touchMove(e) {
  const t = touches.get(e.pointerId); if (!t) return;
  const dx = e.clientX - t.x, dy = e.clientY - t.y;
  t.x = e.clientX; t.y = e.clientY;
  if (touches.size === 2 && pinch) {
    const [a, b] = [...touches.values()];
    game.cam.setZoom(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d);
  } else if (touches.size === 1) game.cam.pan(-dx, -dy);
}
function touchUp(e) {
  const t = touches.get(e.pointerId);
  touches.delete(e.pointerId);
  if (touches.size < 2) pinch = null;
  if (!t || !game) return;
  const moved = Math.hypot(e.clientX - t.sx, e.clientY - t.sy);
  if (moved < 10 && performance.now() - t.t < 400 && game.isHumanTurn()) {
    const p = game.cam.toWorld(e.clientX, e.clientY);
    const wp = game.weapon;
    if (wp?.needsTarget && (wp.instant || !game.target)) game.ctrl.target = p;
    else if (wp && wp.id !== 'girder') game.ctrl.aimAt = p;
    game.cam.manualT = 0;
  }
}

// On-screen pad (shown on touch devices).
const pad = $('touchPad');
if (matchMedia('(pointer: coarse)').matches) pad.classList.remove('hidden');
for (const b of pad.querySelectorAll('[data-k]')) {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); sound.resume(); b.classList.add('on');
    if (k === 'jump') edge.jump = true; else if (k === 'backflip') edge.backflip = true;
    else { keys.add(k); if (k === 'fire') edge.fire = true; if (k === 'up') edge.up = true; if (k === 'down') edge.down = true; } };
  const off = e => { e.preventDefault(); b.classList.remove('on'); keys.delete(k); };
  b.addEventListener('pointerdown', on);
  b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
}

function applyInput() {
  const c = game.ctrl;
  if (!game.isHumanTurn() || ui.panelOpen()) {
    edge.fire = edge.jump = edge.backflip = edge.up = edge.down = false;
    if (!game.isHumanTurn()) return;
    c.left = c.right = c.up = c.down = c.fire = false;
    return;
  }
  c.left = keys.has('left'); c.right = keys.has('right');
  c.up = keys.has('up'); c.down = keys.has('down');
  c.fine = keys.has('fine');
  c.fire = keys.has('fire') || mouseFire;
  if (edge.fire) { c.firePressed = true; edge.fire = false; }
  if (edge.up) { c.upPressed = true; edge.up = false; }
  if (edge.down) { c.downPressed = true; edge.down = false; }
  if (jumpPending && performance.now() - jumpPending > 230) { jumpPending = 0; edge.jump = true; }
  if (edge.jump) { c.jump = true; edge.jump = false; }
  if (edge.backflip) { c.backflip = true; edge.backflip = false; }
}

// ------------------------------------------------------------------ loop

// Auto graphics: if the machine can't hold ~48 fps (e.g. no GPU acceleration),
// step the backdrop/canvas quality down. Never steps back up, so it can't oscillate.
const gfx = { mode: 'auto', t: 0, frames: 0, grace: 2 };
const TIERS = ['high', 'medium', 'low'];
function autoQuality(dt) {
  if (gfx.mode !== 'auto' || document.hidden || paused) return;
  if (gfx.grace > 0) { gfx.grace -= dt; return; }
  gfx.t += dt; gfx.frames++;
  if (gfx.t < 2) return;
  const fps = gfx.frames / gfx.t;
  gfx.t = 0; gfx.frames = 0;
  const i = TIERS.indexOf(renderer.quality);
  if (fps < 48 && i < TIERS.length - 1) {
    renderer.setQuality(TIERS[i + 1]);
    gfx.grace = 1.5;
    ui.hint(`Graphics lowered to ${TIERS[i + 1]} for smoother play (${fps.toFixed(0)} fps) — change in the menu`, 4);
  }
}

const STEP = 1 / 60;
let acc = 0, last = performance.now();
const perf = { on: false, el: null, fps: 60, upd: 0, draw: 0, ticks: 0, n: 0 };
function togglePerf() {
  perf.on = !perf.on;
  if (!perf.el) { perf.el = document.createElement('pre'); perf.el.id = 'perf'; document.body.appendChild(perf.el); }
  perf.el.style.display = perf.on ? 'block' : 'none';
  renderer.prof = perf.on ? {} : null;
}
if (new URLSearchParams(location.search).has('perf')) togglePerf();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (game && !paused) {
    acc += dt;
    const t0 = performance.now();
    game.ai.frameStart = t0;
    let ticks = 0;
    while (acc >= STEP && ticks < 3) { applyInput(); game.update(STEP); acc -= STEP; ticks++; }
    if (acc > STEP) acc = 0; // too far behind: run slow for a moment instead of spiralling
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
        canvas: `${canvas.width}x${canvas.height}`, vw: innerWidth, vh: innerHeight, state: game.state, ai: game.ai.phase, gpu: tele.gpu });
      tele.frames = []; tele.sent = now;
    }
    if (perf.on) {
      perf.fps = perf.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
      perf.upd = perf.upd * 0.9 + (t1 - t0) * 0.1; perf.draw = perf.draw * 0.9 + (t2 - t1) * 0.1; perf.ticks = ticks;
      if ((perf.n++ & 7) === 0) {
        const p = renderer.prof || {};
        perf.el.textContent = `fps ${perf.fps.toFixed(0)}  ticks/frame ${ticks}  gfx ${gfx.mode}:${renderer.quality}\nupdate ${perf.upd.toFixed(2)}ms  draw ${perf.draw.toFixed(2)}ms\n` +
          Object.entries(p).map(([k, v]) => `  ${k.padEnd(8)} ${v.toFixed(2)}`).join('\n') +
          `\nfx ${game.fx.p.length}  objs ${game.objects.length}  ai ${game.ai.phase || '-'}  dpr ${renderer.dpr}`;
      }
    }
  } else if (game) renderer.draw(game, null);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => { renderer.resize(); renderer.bgFor = null; });

// handy for debugging from the console
window.__wa = () => game;
window.__perf = () => ({ ...perf, el: undefined, sections: { ...(renderer.prof || {}) } });
