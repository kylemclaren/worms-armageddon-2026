// ===== engine -> React bridge =====
// Implements the interface the engine calls on its "ui" (turnStart, refreshTeams, hint,
// frame, ...) but, instead of touching the DOM, publishes plain data to the store that
// the React HUD renders. Values are only written when they change, so React re-renders
// a component only when what it shows actually changed.
import { store } from './store.js';
import { WEAPONS, WEAPON_BY_ID } from './weapons.js';
import { toast } from './toast.js';

const FUSE_WEAPONS = new Set(['grenade', 'cluster', 'banana']);

const shallowEq = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  for (const k in a) if (a[k] !== b[k]) return false;
  for (const k in b) if (!(k in a)) return false;
  return true;
};

export class UIBridge {
  constructor() { this.g = null; this.teamT = 0; }

  attach(g) {
    this.g = g;
    store.setState({ phase: 'game', panelOpen: false, paused: false, over: null, big: null });
    this.refreshTeams();
    this.refreshWeapons();
  }

  detach() { this.g = null; store.setState({ hud: null, teams: [], panelOpen: false, over: null }); }

  bigMessage(text) { store.setState({ big: { text, key: performance.now() } }); }

  /** Control hints ("Click to choose a target") share one toast so they replace each other. */
  hint(text, dur = 2.6) { toast(text, { id: 'hint', duration: dur * 1000 }); }

  turnStart(team, worm) {
    toast.dismiss('ai');
    const who = team.brain === 'jev' ? ' · Jev' : team.cpu ? ' · CPU' : team.player ? ` · ${team.player}` : '';
    toast(team.name, { id: 'turn', description: `${worm.name}'s turn${who}`, accent: team.color, duration: 2400 });
    store.setState({ panelOpen: false });
    this.refreshTeams();
    this.refreshWeapons();
  }

  refreshTeams() {
    const g = this.g; if (!g) return;
    const maxHp = Math.max(1, ...g.teams.map(t => t.worms.length * g.opts.health));
    const teams = g.teams.map(t => ({
      idx: t.idx, name: t.name, player: t.player || null, color: t.color,
      badge: t.brain === 'jev' ? 'JEV' : t.cpu ? 'CPU' : (g.opts.teams === 'online' && t.seat === g.mySeat) ? 'YOU' : null,
      hp: g.teamHp(t), maxHp,
      worms: t.worms.map(w => ({ name: w.name, hp: Math.max(0, Math.round(w.hp)), alive: w.alive, cur: w === g.cur })),
      active: g.curTeam === t, out: !t.worms.some(w => w.alive),
    }));
    const prev = store.getState().teams;
    if (JSON.stringify(prev) !== JSON.stringify(teams)) store.setState({ teams });
  }

  refreshWeapons() { this._hud(true); }

  buildPanel() { /* the React weapon panel renders from the store */ }

  togglePanel() {
    const g = this.g, s = store.getState();
    if (s.panelOpen) return store.setState({ panelOpen: false });
    if (!g || !g.isHumanTurn() || g.state !== 'turn') return;
    store.setState({ panelOpen: true });
  }
  closePanel() { store.setState({ panelOpen: false }); }
  panelOpen() { return store.getState().panelOpen; }

  /** Called every rendered frame by the controller. */
  frame(g, dt) {
    this._hud(false);
    if ((this.teamT += dt) > 0.25) { this.teamT = 0; this.refreshTeams(); }
  }

  _hud() {
    const g = this.g; if (!g || !g.curTeam) return;
    const wp = g.weapon, t = g.curTeam;
    const hud = {
      state: g.state,
      timer: g.state === 'turn' ? (g.opts.turnTime >= 999 ? -1 : Math.max(0, Math.ceil(g.timer))) : g.state === 'retreat' ? Math.max(0, Math.ceil(g.timer)) : null,
      turnTime: g.opts.turnTime,
      retreat: g.state === 'retreat',
      wind: Math.round(g.wind * 20) / 20,
      round: g.round, suddenDeath: !!g.suddenDeath,
      teamColor: t.color, teamName: t.name,
      wormName: g.cur?.name || '',
      weaponId: wp?.id || null, weaponName: wp?.name || '', weaponIcon: wp?.icon || null,
      ammo: wp ? (t.ammo[wp.id] === Infinity ? -1 : t.ammo[wp.id]) : 0,
      fuse: g.fuse, showFuse: !!wp && FUSE_WEAPONS.has(wp.id),
      charging: !!g.charging, power: Math.round(g.power * 100) / 100,
      myTurn: g.isHumanTurn(),
      ammoSig: WEAPONS.map(w => t.ammo[w.id] === Infinity ? 'i' : t.ammo[w.id]).join(','),
    };
    if (!shallowEq(store.getState().hud, hud)) store.setState({ hud });
  }

  gameOver(g, winner) {
    const humans = g.teams.filter(t => !t.cpu);
    const mine = g.opts.teams === 'online' ? g.teams.find(t => t.seat === g.mySeat) : null;
    let title = winner ? (winner.cpu ? 'Defeat' : 'Victory!') : 'Draw';
    if (winner && humans.length > 1) title = 'Victory!';
    if (mine) title = winner === mine ? 'Victory!' : winner ? 'Defeat' : 'Draw';
    const rows = g.teams.map(t => ({
      name: t.player ? `${t.name} (${t.player})` : t.name, color: t.color,
      alive: t.worms.filter(w => w.alive).length,
      kills: t.worms.reduce((s, w) => s + w.stats.kills, 0),
      dmg: t.worms.reduce((s, w) => s + w.stats.dmgDealt, 0),
      winner: t === winner,
    }));
    const top = g.worms.slice().sort((a, b) => b.stats.dmgDealt - a.stats.dmgDealt)[0];
    store.setState({
      over: {
        title, subtitle: winner ? `${winner.name} win the match` : 'Nobody survived',
        winnerColor: winner?.color || null, rows,
        mvp: top && top.stats.dmgDealt > 0 ? { name: top.name, color: top.team.color, dmg: top.stats.dmgDealt } : null,
      },
    });
  }
}

export { WEAPON_BY_ID };
