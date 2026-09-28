// ===== sound manager =====
// Everything here is pre-rendered ElevenLabs audio decoded into WebAudio buffers.
// Worm voices are recorded at normal pitch and sped up on playback, which is how
// you get that squeaky cartoon delivery without paying for extra generations.

import { clamp, pick, rand } from './util.js';
import { V } from './assets.js';

const SFX_BASE = 'assets/audio/sfx/';
const VOX_BASE = 'assets/audio/voice/';

export const SFX_NAMES = ['explosion_big','explosion_med','explosion_small','bazooka_fire',
  'shotgun','minigun','grenade_bounce','fuse','splash','jump','thud','teleport','crate_drop',
  'collect','mine_beep','airplane','holy','girder','firepunch','jetpack','dig','turn_start',
  'timer_tick','sudden_death','victory','wind','select','skip','drown','banana',
  'sheep','rope','bat','homing_lock','armageddon','donkey','surrender','walk','whoosh','barrel',
  'pigeon','uzi','handgun','bow','arrow_hit','dragonball','kamikaze','prod','axe','quake','scales','drill',
  'cow','oldwoman','vase','petrol','mortar','napalm'];

export const VOX_LINES = ['fire','incoming','ouch','ohdear','watchthis','takecover','missed',
  'revenge','hello','byebye','victory','nooo','comeonthen','uhoh','yessir','excellent','laugh',
  'coward','traitor','boring','leavemealone','grenade','fatality','ooof','stupid'];

export const ANN_LINES = ['ann_battle','ann_sudden','ann_timeup','ann_round','ann_reinf',
  'ann_wins','ann_draw','ann_crate'];

export const VOICE_BANKS = ['a', 'b', 'c'];

class Sound {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.muted = false;
    this.masterGain = null;
    this.sfxGain = null;
    this.voxGain = null;
    this.loops = new Map();
    this.ready = false;
  }

  /** Created lazily — browsers refuse an AudioContext before a user gesture. */
  init() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.85;
    this.masterGain.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.75;
    this.sfxGain.connect(this.masterGain);

    this.voxGain = this.ctx.createGain();
    this.voxGain.gain.value = 1.0;
    this.voxGain.connect(this.masterGain);
    return this.ctx;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  async _fetchDecode(url) {
    try {
      const res = await fetch(url + V);
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      return await this.ctx.decodeAudioData(buf);
    } catch { return null; }
  }

  async loadAll(onProgress) {
    this.init();
    const jobs = [];
    for (const n of SFX_NAMES) jobs.push([`sfx:${n}`, SFX_BASE + n + '.mp3']);
    for (const b of VOICE_BANKS)
      for (const l of VOX_LINES) jobs.push([`vox:${b}:${l}`, `${VOX_BASE}${b}/${l}.mp3`]);
    for (const a of ANN_LINES) jobs.push([`ann:${a}`, `${VOX_BASE}ann/${a}.mp3`]);

    let done = 0;
    // Limited concurrency: a few hundred parallel fetches stalls decode on Safari.
    const queue = jobs.slice();
    const worker = async () => {
      while (queue.length) {
        const [key, url] = queue.shift();
        const buf = await this._fetchDecode(url);
        if (buf) this.buffers.set(key, buf);
        onProgress?.(++done / jobs.length, key);
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    this.ready = true;
  }

  _play(key, { vol = 1, rate = 1, pan = 0, gainNode = null, detune = 0 } = {}) {
    if (this.muted || !this.ctx) return null;
    const buf = this.buffers.get(key);
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    if (detune && src.detune) src.detune.value = detune;

    const g = this.ctx.createGain();
    g.gain.value = vol;

    let node = g;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p);
      node = p;
    }
    node.connect(gainNode || this.sfxGain);
    src.connect(g);
    src.start();
    return { src, gain: g };
  }

  sfx(name, opt = {}) { return this._play(`sfx:${name}`, opt); }

  /** A worm line: bank picks the "actor", pitch-up gives the cartoon squeak. */
  vox(bank, line, opt = {}) {
    return this._play(`vox:${bank}:${line}`, {
      rate: opt.rate ?? rand(1.34, 1.46),
      vol: opt.vol ?? 1,
      pan: opt.pan ?? 0,
      gainNode: this.voxGain,
    });
  }

  /** Announcer stays at (near) natural pitch. */
  ann(line, opt = {}) {
    return this._play(`ann:${line}`, {
      rate: opt.rate ?? 1.0, vol: opt.vol ?? 1, gainNode: this.voxGain,
    });
  }

  /** Start a looping bed (fuse hiss, jetpack burn, digging). */
  loop(name, { vol = 0.5, rate = 1 } = {}) {
    if (this.muted || !this.ctx || this.loops.has(name)) return;
    const buf = this.buffers.get(`sfx:${name}`);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + 0.08);
    src.connect(g); g.connect(this.sfxGain);
    src.start();
    this.loops.set(name, { src, gain: g });
  }

  stopLoop(name, fade = 0.12) {
    const l = this.loops.get(name);
    if (!l) return;
    this.loops.delete(name);
    try {
      l.gain.gain.cancelScheduledValues(this.ctx.currentTime);
      l.gain.gain.setValueAtTime(l.gain.gain.value, this.ctx.currentTime);
      l.gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + fade);
      l.src.stop(this.ctx.currentTime + fade + 0.02);
    } catch { /* already stopped */ }
  }

  stopAllLoops() { for (const k of [...this.loops.keys()]) this.stopLoop(k, 0.05); }

  setMuted(m) {
    this.muted = m;
    if (this.masterGain) this.masterGain.gain.value = m ? 0 : 0.85;
    if (m) this.stopAllLoops();
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  /** Positional helper — callers pass world x plus the camera to get pan/volume. */
  at(name, worldX, cam, opt = {}) {
    const rel = cam.rel ? cam.rel(worldX) : 0.5;
    const pan = clamp((rel - 0.5) * 1.6, -1, 1);
    const off = Math.abs(rel - 0.5);
    const vol = (opt.vol ?? 1) * clamp(1.25 - off * 0.9, 0.18, 1);
    return this.sfx(name, { ...opt, pan, vol });
  }
}

export const sound = new Sound();

/** Grab-bag of context-appropriate worm chatter. */
export const VOX = {
  onSelect:  ['hello', 'yessir', 'comeonthen', 'watchthis'],
  onFire:    ['fire', 'incoming', 'watchthis', 'grenade'],
  onHurt:    ['ouch', 'ooof', 'nooo', 'ohdear'],
  onDeath:   ['nooo', 'byebye', 'ohdear'],
  onMiss:    ['missed', 'stupid', 'ohdear'],
  onKill:    ['excellent', 'laugh', 'fatality', 'victory'],
  onSelfHurt:['stupid', 'ohdear', 'ooof'],
  onIdle:    ['boring', 'leavemealone'],
  onTimeout: ['boring', 'ohdear'],
};
export const voxPick = cat => pick(VOX[cat]);
