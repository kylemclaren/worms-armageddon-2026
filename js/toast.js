// ===== Sonner-style toasts (vanilla) =====
// Behaviour modelled on sonner (collapsed stack that fans out on hover, swipe to dismiss,
// a loading toast that later resolves in place); look follows shadcn/ui's neutral theme.
// Loaders are the loading.dev designs ported in css/loaders.css.

const ICONS = {
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
};
const LOADERS = {
  orbit: '<div class="ld-orbit"><div class="ld-orbit-dot"></div><div class="ld-orbit-track ld-orbit-spin"></div></div>',
  dots: '<div class="ld-bouncing-dots">' + [0, 1, 2].map(i => `<div class="ld-bouncing-dots-dot" style="--ld-step:${i}"></div>`).join('') + '</div>',
  wave: '<div class="ld-wave">' + [0, 1, 2, 3, 4].map(i => `<div class="ld-wave-bar ld-wave-bar-center" style="--ld-step:${i}"></div>`).join('') + '</div>',
  comet: '<div class="ld-comet"><div class="ld-comet-spin"><div class="ld-comet-tail"></div><div class="ld-comet-head"></div></div></div>',
};
const MAX_VISIBLE = 3;
let host = null, seq = 0;
const live = new Map();   // id -> { el, timer, opts }

function ensureHost() {
  if (host) return host;
  host = document.createElement('ol');
  host.className = 'toaster';
  host.setAttribute('aria-live', 'polite');
  host.addEventListener('pointerenter', () => { host.classList.add('expanded'); pauseAll(true); });
  host.addEventListener('pointerleave', () => { host.classList.remove('expanded'); pauseAll(false); layout(); });
  document.body.appendChild(host);
  return host;
}

function render(t) {
  const { type = 'default', title = '', description = '', loader = 'orbit', accent } = t.opts;
  const icon = type === 'loading' ? `<span class="tIcon tLoader">${LOADERS[loader] || LOADERS.orbit}</span>`
    : ICONS[type] ? `<span class="tIcon t-${type}">${ICONS[type]}</span>` : '';
  t.el.dataset.type = type;
  t.el.style.setProperty('--accent', accent || 'transparent');
  t.el.innerHTML = `${icon}<div class="tBody"><div class="tTitle"></div>${description ? '<div class="tDesc"></div>' : ''}</div>`;
  t.el.querySelector('.tTitle').textContent = title;
  if (description) t.el.querySelector('.tDesc').textContent = description;
}

function layout() {
  const items = [...live.values()].reverse();           // newest first
  const expanded = host?.classList.contains('expanded');
  let y = 0;
  items.forEach((t, i) => {
    const el = t.el, h = el.offsetHeight || 56;
    if (expanded) { el.style.transform = `translateY(${y}px)`; y += h + 8; el.style.opacity = i < 6 ? 1 : 0; }
    else {
      // sonner's collapsed stack: each older toast peeks out below and shrinks a little
      el.style.transform = `translateY(${i * 10}px) scale(${1 - i * 0.05})`;
      el.style.opacity = i < MAX_VISIBLE ? 1 - i * 0.15 : 0;
    }
    el.style.zIndex = String(100 - i);
    el.style.pointerEvents = i < (expanded ? 6 : 1) ? 'auto' : 'none';
  });
  if (host) host.style.height = `${expanded ? y : (items[0]?.el.offsetHeight || 0) + Math.min(items.length - 1, MAX_VISIBLE - 1) * 10}px`;
}

function schedule(t) {
  clearTimeout(t.timer);
  const d = t.opts.duration ?? (t.opts.type === 'loading' ? Infinity : 3200);
  if (d !== Infinity) { t.remaining = d; t.started = performance.now(); t.timer = setTimeout(() => dismiss(t.id), d); }
}
function pauseAll(p) {
  for (const t of live.values()) {
    if (t.remaining == null || t.opts.duration === Infinity) continue;
    if (p) { clearTimeout(t.timer); t.remaining -= performance.now() - t.started; }
    else { t.started = performance.now(); t.timer = setTimeout(() => dismiss(t.id), Math.max(600, t.remaining)); }
  }
}

function swipe(t) {
  let x0 = null, dx = 0;
  t.el.addEventListener('pointerdown', e => { x0 = e.clientX; dx = 0; t.el.setPointerCapture(e.pointerId); t.el.classList.add('swiping'); });
  t.el.addEventListener('pointermove', e => { if (x0 == null) return; dx = e.clientX - x0; t.el.style.translate = `${dx}px 0`; t.el.style.opacity = String(1 - Math.min(1, Math.abs(dx) / 220)); });
  const end = () => {
    if (x0 == null) return; x0 = null; t.el.classList.remove('swiping');
    if (Math.abs(dx) > 90) dismiss(t.id, Math.sign(dx)); else { t.el.style.translate = ''; t.el.style.opacity = ''; layout(); }
  };
  t.el.addEventListener('pointerup', end); t.el.addEventListener('pointercancel', end);
}

export function toast(title, opts = {}) {
  ensureHost();
  // one toast per `id` key (e.g. 'jev', 'turn'): repeated calls update it in place
  const key = opts.id;
  if (key != null && live.has(key)) return update(key, { ...opts, title });
  const id = key ?? `t${++seq}`;
  const el = document.createElement('li');
  el.className = 'toast entering';
  const t = { id, el, opts: { ...opts, title } };
  render(t);
  host.appendChild(el);
  live.set(id, t);
  swipe(t);
  requestAnimationFrame(() => { el.classList.remove('entering'); layout(); });
  while (live.size > 8) dismiss(live.keys().next().value);
  schedule(t);
  return id;
}

export function update(id, opts) {
  const t = live.get(id);
  if (!t) return toast(opts.title ?? '', { ...opts, id });
  t.opts = { ...t.opts, ...opts };
  render(t); schedule(t); layout();
  return id;
}

export function dismiss(id, dir = 0) {
  const t = live.get(id);
  if (!t) return;
  live.delete(id); clearTimeout(t.timer);
  t.el.classList.add('leaving');
  if (dir) t.el.style.translate = `${dir * 260}px 0`;
  setTimeout(() => t.el.remove(), 260);
  layout();
}

toast.success = (title, o = {}) => toast(title, { ...o, type: 'success' });
toast.error = (title, o = {}) => toast(title, { ...o, type: 'error' });
toast.info = (title, o = {}) => toast(title, { ...o, type: 'info' });
toast.warning = (title, o = {}) => toast(title, { ...o, type: 'warning' });
toast.loading = (title, o = {}) => toast(title, { ...o, type: 'loading' });
toast.update = update;
toast.dismiss = dismiss;
