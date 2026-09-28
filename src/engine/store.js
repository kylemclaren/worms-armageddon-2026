// ===== the one store shared by the engine (writes) and React (reads) =====
import { createStore } from 'zustand/vanilla';

export const DEFAULT_OPTIONS = {
  terrain: 'grass', worms: 4, teams: '1v1cpu', turnTime: 45, health: 100, sdRound: 10,
  ai: 'pro', mines: 9, crates: 0.4, gfx: 'auto',
};

function loadJSON(key, fallback) {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch { return fallback; }
}

export const store = createStore(() => ({
  phase: 'loading',            // loading | menu | game
  load: 0, loadText: 'Loading',
  jevEnabled: false,
  options: loadJSON('wa-opts2', DEFAULT_OPTIONS),
  playerName: (() => { try { return localStorage.getItem('wa-name') || ''; } catch { return ''; } })(),
  online: null,                // { role, code, seat, players } while in a room
  // HUD
  hud: null,                   // see bridge.js hudSnapshot()
  teams: [],
  panelOpen: false, helpOpen: false, paused: false, muted: false,
  big: null,                   // { text, key }
  over: null,                  // { title, subtitle, rows, mvp }
}));

export const setOptions = patch => {
  const options = { ...store.getState().options, ...patch };
  store.setState({ options });
  try { localStorage.setItem('wa-opts2', JSON.stringify(options)); } catch { /* storage unavailable */ }
};

export const setPlayerName = playerName => {
  store.setState({ playerName });
  try { localStorage.setItem('wa-name', playerName); } catch { /* storage unavailable */ }
};
