// ===== DOM HUD =====
import { WEAPONS } from './weapons.js';
import { images } from './assets.js';
import { fmtTime } from './util.js';
import { toast } from './toast.js';

const badge = t => t.brain === 'jev' ? '<span class="tbBadge jev">JEV</span>' : t.cpu ? '<span class="tbBadge">CPU</span>' : '';

const $ = id => document.getElementById(id);

export class UI {
  constructor() {
    this.g = null;
    this.hintT = 0;
    this.iconURLs = {};
    this.onPick = null;
  }

  attach(g) {
    this.g = g;
    $('hud').classList.remove('hidden');
    this.buildPanel();
    this.refreshTeams();
    this.refreshWeapons();
  }

  iconURL(id) {
    if (!this.iconURLs[id] && images[id]) this.iconURLs[id] = images[id].toDataURL ? images[id].toDataURL() : images[id].src;
    return this.iconURLs[id] || '';
  }

  bigMessage(text) {
    const el = $('bigMsg');
    el.textContent = text;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  /** Control hints ("Click to choose a target") share one toast slot so they replace each other. */
  hint(text, dur = 2.6) {
    toast(text, { id: 'hint', duration: dur * 1000 });
  }

  turnStart(team, worm) {
    toast.dismiss('ai');
    toast(team.name, { id: 'turn', description: `${worm.name}'s turn${team.brain === 'jev' ? ' · Jev' : team.cpu ? ' · CPU' : ''}`, accent: team.color, duration: 2400 });
    this.refreshTeams();
    this.refreshWeapons();
    this.closePanel();
  }

  refreshTeams() {
    const g = this.g; if (!g) return;
    const maxHp = Math.max(1, ...g.teams.map(t => t.worms.length * g.opts.health));
    $('teamBars').innerHTML = g.teams.map(t => {
      const hp = g.teamHp(t);
      const dead = !t.worms.some(w => w.alive);
      const active = g.curTeam === t;
      return `<div class="teamBar${dead ? ' dead' : ''}${active ? ' active' : ''}" style="color:${t.color}">
        <div class="tbTop"><span class="tbName">${badge(t)}${t.name}</span><span class="tbHp">${hp}</span></div>
        <div class="tbTrack"><div class="tbFill" style="width:${Math.min(100, hp / maxHp * 100)}%;background:${t.color}"></div></div>
        <div class="tbWorms">${t.worms.map(w => `<i class="tbWorm${w.alive ? ' alive' : ''}${w === g.cur ? ' cur' : ''}"></i>`).join('')}</div>
      </div>`;
    }).join('');
  }

  buildPanel() {
    const p = $('weaponPanel');
    p.innerHTML = WEAPONS.map(w => `<div class="wSlot" data-id="${w.id}">
      <img src="${this.iconURL(w.icon)}" alt="">
      <span class="wAmmo"></span><span class="wTip">${w.name}</span></div>`).join('');
    p.onclick = e => {
      const s = e.target.closest('.wSlot'); if (!s) return;
      if (this.g?.selectWeapon(s.dataset.id)) this.closePanel();
    };
  }

  refreshWeapons() {
    const g = this.g; if (!g || !g.curTeam) return;
    const t = g.curTeam, wp = g.weapon;
    if (wp) {
      $('cwIcon').src = this.iconURL(wp.icon);
      $('cwName').textContent = wp.name;
      const a = t.ammo[wp.id];
      $('cwAmmo').textContent = a === Infinity ? '∞' : `× ${a}`;
    }
    for (const s of document.querySelectorAll('.wSlot')) {
      const a = t.ammo[s.dataset.id];
      s.classList.toggle('empty', !(a > 0));
      s.classList.toggle('sel', s.dataset.id === g.weaponId);
      s.querySelector('.wAmmo').textContent = a === Infinity ? '' : a > 0 ? a : '';
    }
    const fuseW = wp && ['grenade', 'cluster', 'banana'].includes(wp.id);
    $('fuseBox').classList.toggle('hidden', !fuseW);
    $('fuseVal').textContent = g.fuse;
  }

  togglePanel() {
    const g = this.g;
    const p = $('weaponPanel');
    if (p.classList.contains('hidden')) {
      if (!g || !g.isHumanTurn() || g.state !== 'turn') return;
      this.refreshWeapons();
      p.classList.remove('hidden');
    } else p.classList.add('hidden');
  }
  closePanel() { $('weaponPanel').classList.add('hidden'); }
  panelOpen() { return !$('weaponPanel').classList.contains('hidden'); }

  frame(g, dt) {
    if (!g) return;
    if (this.hintT > 0 && (this.hintT -= dt) <= 0) $('hint').classList.remove('on');
    // timer
    const tb = $('timerBox'), tt = $('turnTimer');
    let tv = '';
    if (g.state === 'turn') tv = g.opts.turnTime >= 999 ? '∞' : fmtTime(g.timer);
    else if (g.state === 'retreat') tv = fmtTime(g.timer);
    else tv = '·';
    if (tt.textContent !== tv) tt.textContent = tv;
    tb.classList.toggle('low', g.state === 'turn' && g.timer <= 5 && g.opts.turnTime < 999);
    tb.classList.toggle('retreat', g.state === 'retreat');
    tb.style.borderColor = g.curTeam ? g.curTeam.color : '';
    // wind
    const wv = g.wind;
    const fill = $('windFill');
    fill.style.left = wv >= 0 ? '50%' : `${50 + wv * 50}%`;
    fill.style.width = `${Math.abs(wv) * 50}%`;
    fill.style.background = wv >= 0 ? 'linear-gradient(90deg,#63d0ff,#2f8fd8)' : 'linear-gradient(270deg,#63d0ff,#2f8fd8)';
    $('windVal').textContent = (wv > 0 ? '→' : wv < 0 ? '←' : '') + Math.round(Math.abs(wv) * 10);
    $('roundNo').textContent = g.suddenDeath ? 'Sudden Death' : `Round ${g.round}`;
    // power
    $('powerBar').classList.toggle('on', g.charging);
    $('powerFill').style.width = `${g.power * 100}%`;
    if (g.state === 'deaths' || g.state === 'damage') this.refreshTeams();
  }

  gameOver(g, winner) {
    $('goTitle').textContent = winner ? (winner.cpu ? 'DEFEAT' : 'VICTORY!') : 'DRAW';
    const humans = g.teams.filter(t => !t.cpu);
    if (winner && humans.length > 1) $('goTitle').textContent = 'VICTORY!';
    $('goSub').innerHTML = winner ? `<span style="color:${winner.color}">${winner.name}</span> win the match` : 'Nobody survived…';
    const rows = g.teams.map(t => {
      const dmg = t.worms.reduce((s, w) => s + w.stats.dmgDealt, 0);
      const kills = t.worms.reduce((s, w) => s + w.stats.kills, 0);
      const alive = t.worms.filter(w => w.alive).length;
      return `<div class="goRow" style="color:${t.color}"><span>${t.name}</span>
        <span>${alive} alive · ${kills} kills · <b>${dmg}</b> dmg</span></div>`;
    });
    const all = g.worms.slice().sort((a, b) => b.stats.dmgDealt - a.stats.dmgDealt)[0];
    if (all && all.stats.dmgDealt > 0) rows.push(`<div class="goRow"><span>Most violent worm</span><span style="color:${all.team.color}">${all.name} (${all.stats.dmgDealt})</span></div>`);
    $('goStats').innerHTML = rows.join('');
    $('gameover').classList.remove('hidden');
  }
}
