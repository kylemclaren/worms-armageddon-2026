// UI-side knowledge about the game: option ranges, modes, terrains, weapon groups.
// @ts-nocheck
import { WEAPONS } from '@/engine/weapons.js';
import { imageUrl } from '@/engine/controller.js';

export { imageUrl };
export type Weapon = { id: string; name: string; icon: string; ammo: number; util?: boolean; super?: boolean };
export const WEAPON_LIST: Weapon[] = WEAPONS;
export const WEAPON_BY_ID: Record<string, Weapon> = Object.fromEntries(WEAPONS.map((w: Weapon) => [w.id, w]));

export const WEAPON_GROUPS: { name: string; ids: string[] }[] = [
  { name: 'Artillery', ids: ['bazooka', 'homing', 'grenade', 'cluster', 'banana', 'hhg'] },
  { name: 'Guns & melee', ids: ['shotgun', 'minigun', 'firepunch', 'bat'] },
  { name: 'Explosives', ids: ['dynamite', 'mine', 'sheep'] },
  { name: 'Air support', ids: ['airstrike', 'armageddon', 'donkey'] },
  { name: 'Tools', ids: ['rope', 'jetpack', 'teleport', 'girder', 'blowtorch'] },
  { name: 'Turn', ids: ['skipgo', 'surrender'] },
];

export const MODES = [
  { v: '1v1cpu', title: 'You vs CPU', sub: 'Classic duel', icon: 'icon_bazooka' },
  { v: '1v1jev', title: 'You vs Jev', sub: 'TypeSafe AI', icon: 'icon_homing', jev: true },
  { v: '1v3cpu', title: 'You vs 3 CPU', sub: 'Free-for-all', icon: 'icon_hhg' },
  { v: '1v2mix', title: 'You · Jev · CPU', sub: 'Three-way', icon: 'icon_banana', jev: true },
  { v: '1v1', title: 'Hotseat 2P', sub: 'Pass the keyboard', icon: 'icon_grenade' },
  { v: '4p', title: 'Hotseat 4P', sub: 'Party mode', icon: 'icon_cluster' },
  { v: 'jevcpu', title: 'Watch Jev', sub: 'Jev vs CPU', icon: 'icon_airstrike', jev: true },
  { v: 'cpu2', title: 'Watch CPU', sub: 'CPU vs CPU', icon: 'icon_sheep' },
];

export const TERRAINS = [
  { v: 'grass', title: 'Rolling Hills' }, { v: 'mars', title: 'Red Planet' }, { v: 'snow', title: 'Frozen Wastes' },
  { v: 'desert', title: 'Sand Dunes' }, { v: 'random', title: 'Surprise me' },
];

export const RULES: { key: string; label: string; values: number[]; fmt?: (v: number) => string }[] = [
  { key: 'worms', label: 'Worms per team', values: [1, 2, 3, 4, 5, 6, 7, 8] },
  { key: 'health', label: 'Starting health', values: [50, 75, 100, 125, 150, 175, 200, 250] },
  { key: 'turnTime', label: 'Turn time', values: [15, 20, 30, 45, 60, 75, 90, 9999], fmt: v => (v >= 999 ? '∞' : `${v}s`) },
  { key: 'sdRound', label: 'Sudden death', values: [4, 6, 8, 10, 12, 16, 20, 999], fmt: v => (v >= 999 ? 'Never' : `Round ${v}`) },
  { key: 'mines', label: 'Mines', values: [0, 3, 5, 9, 12, 16, 20], fmt: v => (v === 0 ? 'None' : String(v)) },
  { key: 'crates', label: 'Crates', values: [0, 0.2, 0.4, 0.6, 0.8], fmt: v => ['Off', 'Few', 'Some', 'Lots', 'Chaos'][[0, 0.2, 0.4, 0.6, 0.8].indexOf(v)] ?? String(v) },
];

export const TEAM_COLORS = ['#ff5a4f', '#4fb0ff', '#6be05a', '#ffd23f'];
