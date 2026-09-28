// ===== main menu widgets =====
// Hand-written vanilla versions of ideas from React Bits (reactbits.dev: Elastic Slider,
// Tilted Card, Click Spark, Aurora) and Rare UI (rareui.com: Gooey Nav, Animated Counter).
// The original <select> elements stay in the DOM (hidden) as the single source of truth,
// so the game's option parsing and saved preferences don't change.

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ------------------------------------------------------------------ option ranges
// Widen the discrete choices; sliders snap to these values.
const RANGES = {
  optWorms: { values: [1, 2, 3, 4, 5, 6, 7, 8], def: 4 },
  optHealth: { values: [50, 75, 100, 125, 150, 175, 200, 250], def: 100 },
  optTime: { values: [15, 20, 30, 45, 60, 75, 90, 9999], def: 45, fmt: v => v >= 999 ? '∞' : `${v}s` },
  optSD: { values: [4, 6, 8, 10, 12, 16, 20, 999], def: 10, fmt: v => v >= 999 ? 'Never' : `Rd ${v}` },
  optMines: { values: [0, 3, 5, 9, 12, 16, 20], def: 9, fmt: v => v === 0 ? 'None' : String(v) },
  optCrates: { values: [0, 0.2, 0.4, 0.6, 0.8], def: 0.4, fmt: v => ['Off', 'Few', 'Some', 'Lots', 'Chaos'][[0, 0.2, 0.4, 0.6, 0.8].indexOf(+v)] ?? v },
};

function rebuildSelect(id, r) {
  const sel = $(id);
  const keep = sel.value;
  sel.innerHTML = r.values.map(v => `<option value="${v}">${v}</option>`).join('');
  sel.value = r.values.map(String).includes(keep) ? keep : String(r.def);
}

// ------------------------------------------------------------------ rolling digits
function rollingNumber(el) {
  // each character gets a vertical strip of 0-9 that slides into place
  return text => {
    text = String(text);
    if (el._text === text) return;
    el._text = text;
    const chars = [...text];
    while (el.children.length > chars.length) el.lastChild.remove();
    chars.forEach((ch, i) => {
      let slot = el.children[i];
      if (!slot) { slot = document.createElement('span'); slot.className = 'rnSlot'; el.appendChild(slot); }
      if (/\d/.test(ch)) {
        if (!slot._strip) {
          slot.innerHTML = '<span class="rnStrip">' + '0123456789'.split('').map(d => `<span>${d}</span>`).join('') + '</span>';
          slot._strip = slot.firstChild;
        }
        slot._strip.style.transform = `translateY(${-ch * 10}%)`;
      } else { slot.textContent = ch; slot._strip = null; }
    });
  };
}

// ------------------------------------------------------------------ elastic slider
function elasticSlider(host, id, label, r) {
  const sel = $(id);
  const fmt = r.fmt || (v => String(v));
  host.insertAdjacentHTML('beforeend', `
    <div class="eSlider" data-for="${id}">
      <div class="esHead"><span class="esLabel">${label}</span><span class="esValue"></span></div>
      <div class="esTrackWrap"><div class="esTrack"><div class="esFill"></div><div class="esTicks">${r.values.map(() => '<i></i>').join('')}</div></div><div class="esKnob"></div></div>
    </div>`);
  const root = host.lastElementChild;
  const wrap = root.querySelector('.esTrackWrap'), track = root.querySelector('.esTrack');
  const fill = root.querySelector('.esFill'), knob = root.querySelector('.esKnob');
  const show = rollingNumber(root.querySelector('.esValue'));
  const n = r.values.length - 1;
  let idx = Math.max(0, r.values.map(String).indexOf(sel.value)), dragging = false;
  const paint = (t, stretch = 0) => {
    fill.style.width = `${t * 100}%`;
    knob.style.left = `${t * 100}%`;
    // elastic overdrag: the track stretches toward the pointer and thins a touch
    track.style.transform = stretch ? `scaleX(${1 + Math.abs(stretch) * 0.12}) scaleY(${1 - Math.abs(stretch) * 0.25})` : '';
    track.style.transformOrigin = stretch < 0 ? 'right center' : 'left center';
  };
  const set = (i, silent) => {
    idx = clamp(i, 0, n);
    const v = r.values[idx];
    if (sel.value !== String(v)) { sel.value = String(v); if (!silent) sel.dispatchEvent(new Event('change')); }
    show(fmt(v));
    root.querySelectorAll('.esTicks i').forEach((t, k) => t.classList.toggle('on', k <= idx));
  };
  const fromEvent = e => {
    const b = wrap.getBoundingClientRect();
    const t = (e.clientX - b.left) / b.width;
    const over = t < 0 ? t : t > 1 ? t - 1 : 0;
    return { t: clamp(t, 0, 1), over: Math.sign(over) * Math.min(1, Math.sqrt(Math.abs(over) * 3)) };
  };
  wrap.addEventListener('pointerdown', e => {
    dragging = true; wrap.setPointerCapture(e.pointerId); root.classList.add('drag');
    const { t } = fromEvent(e); set(Math.round(t * n)); paint(t);
  });
  wrap.addEventListener('pointermove', e => {
    if (!dragging) return;
    const { t, over } = fromEvent(e);
    set(Math.round(t * n)); paint(t, over);
  });
  const end = () => { if (!dragging) return; dragging = false; root.classList.remove('drag'); paint(idx / n); };
  wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end);
  wrap.tabIndex = 0;
  wrap.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { set(idx - 1); paint(idx / n); e.preventDefault(); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { set(idx + 1); paint(idx / n); e.preventDefault(); }
  });
  sel.addEventListener('change', () => { const i = r.values.map(String).indexOf(sel.value); if (i >= 0 && i !== idx) { set(i, true); paint(i / n); } });
  set(idx, true); paint(idx / n);
}

// ------------------------------------------------------------------ gooey segmented
function gooeySegment(host, id, label, items) {
  const sel = $(id);
  host.insertAdjacentHTML('beforeend', `
    <div class="gooSeg" data-for="${id}">
      <div class="gsLabel">${label}</div>
      <div class="gsBar">
        <div class="gsGoo"><i class="gsBlob"></i><i class="gsBlob trail"></i></div>
        ${items.map(([v, t]) => `<button type="button" data-v="${v}">${t}</button>`).join('')}
      </div>
    </div>`);
  const root = host.lastElementChild;
  const bar = root.querySelector('.gsBar'), blobs = root.querySelectorAll('.gsBlob');
  const place = () => {
    const btn = bar.querySelector(`button[data-v="${sel.value}"]`) || bar.querySelector('button');
    bar.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
    for (const b of blobs) { b.style.left = `${btn.offsetLeft}px`; b.style.width = `${btn.offsetWidth}px`; }
  };
  bar.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    sel.value = b.dataset.v; sel.dispatchEvent(new Event('change')); place();
  });
  sel.addEventListener('change', place);
  requestAnimationFrame(place);
  new ResizeObserver(place).observe(bar);
}

// ------------------------------------------------------------------ tilted cards
function tilt(card) {
  card.addEventListener('pointermove', e => {
    const b = card.getBoundingClientRect();
    const px = (e.clientX - b.left) / b.width - 0.5, py = (e.clientY - b.top) / b.height - 0.5;
    card.style.setProperty('--rx', `${(-py * 10).toFixed(2)}deg`);
    card.style.setProperty('--ry', `${(px * 12).toFixed(2)}deg`);
    card.style.setProperty('--gx', `${(px + 0.5) * 100}%`);
    card.style.setProperty('--gy', `${(py + 0.5) * 100}%`);
  });
  card.addEventListener('pointerleave', () => { card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); });
}

function cardPicker(host, id, cards, cls) {
  const sel = $(id);
  host.innerHTML = cards.map(c => `
    <button type="button" class="${cls}" data-v="${c.v}" ${c.disabled ? 'disabled' : ''}>
      <span class="cArt" style="${c.art || ''}">${c.icons || ''}</span>
      <span class="cTitle">${c.title}</span>
      ${c.sub ? `<span class="cSub">${c.sub}</span>` : ''}
      <span class="cGlare"></span>
    </button>`).join('');
  const sync = () => host.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === sel.value));
  host.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    sel.value = b.dataset.v; sel.dispatchEvent(new Event('change')); sync();
  });
  host.querySelectorAll('button').forEach(tilt);
  sel.addEventListener('change', sync);
  sync();
}

// ------------------------------------------------------------------ click spark
function clickSpark(btn) {
  btn.addEventListener('pointerdown', e => {
    const b = btn.getBoundingClientRect();
    const cv = document.createElement('canvas');
    const W = b.width + 160, H = b.height + 160, dpr = devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.className = 'sparkCanvas';
    Object.assign(cv.style, { width: `${W}px`, height: `${H}px`, left: `${b.left - 80}px`, top: `${b.top - 80}px` });
    document.body.appendChild(cv);
    const c = cv.getContext('2d'); c.scale(dpr, dpr);
    const ox = e.clientX - b.left + 80, oy = e.clientY - b.top + 80, t0 = performance.now();
    const rays = Array.from({ length: 14 }, (_, i) => ({ a: i / 14 * Math.PI * 2 + Math.random() * 0.2, l: 30 + Math.random() * 40 }));
    const tick = now => {
      const q = Math.min(1, (now - t0) / 480), ease = 1 - (1 - q) ** 3;
      c.clearRect(0, 0, W, H);
      c.lineCap = 'round';
      for (const r of rays) {
        const d0 = ease * r.l, d1 = d0 + 14 * (1 - q);
        c.strokeStyle = `rgba(255,${200 - q * 80},80,${1 - q})`; c.lineWidth = 3 * (1 - q) + 0.5;
        c.beginPath(); c.moveTo(ox + Math.cos(r.a) * d0, oy + Math.sin(r.a) * d0); c.lineTo(ox + Math.cos(r.a) * d1, oy + Math.sin(r.a) * d1); c.stroke();
      }
      if (q < 1) requestAnimationFrame(tick); else cv.remove();
    };
    requestAnimationFrame(tick);
  });
}

// ------------------------------------------------------------------ backdrop
function backdrop(imgFor) {
  const bg = $('menuBg');
  const cv = $('menuEmbers'), c = cv.getContext('2d');
  const embers = Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), s: 0.4 + Math.random() * 1.2, p: Math.random() * 6 }));
  let raf = 0, last = performance.now();
  const frame = now => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if ($('menu').classList.contains('hidden')) { raf = requestAnimationFrame(frame); return; }
    const dpr = Math.min(devicePixelRatio || 1, 2), W = innerWidth, H = innerHeight;
    if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    for (const e of embers) {
      e.y -= dt * 0.03 * e.s; e.p += dt * 1.5; e.x += Math.sin(e.p) * dt * 0.004;
      if (e.y < -0.02) { e.y = 1.02; e.x = Math.random(); }
      const a = 0.35 + 0.35 * Math.sin(e.p * 1.7);
      c.fillStyle = `rgba(255,${190 + e.s * 30 | 0},120,${a})`;
      c.beginPath(); c.arc(e.x * W, e.y * H, e.s * 1.6, 0, Math.PI * 2); c.fill();
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  // the menu previews the selected battlefield's sky, cross-fading between choices
  const layers = bg.querySelectorAll('.mbLayer');
  let front = 0;
  return key => {
    const url = imgFor(key);
    if (!url || layers[front].dataset.url === url) return;
    front ^= 1;
    layers[front].style.backgroundImage = `url("${url}")`;
    layers[front].dataset.url = url;
    layers[front].classList.add('on'); layers[front ^ 1].classList.remove('on');
  };
}

// ------------------------------------------------------------------ build
export function buildMenu({ skyUrl, iconUrl, jevEnabled }) {
  for (const [id, r] of Object.entries(RANGES)) rebuildSelect(id, r);

  const ic = n => `<img src="${iconUrl(n)}" alt="">`;
  cardPicker($('modeCards'), 'optTeams', [
    { v: '1v1cpu', title: 'You vs CPU', sub: 'Classic duel', icons: ic('icon_bazooka') },
    { v: '1v1jev', title: 'You vs Jev', sub: 'TypeSafe AI', icons: ic('icon_homing'), disabled: !jevEnabled },
    { v: '1v3cpu', title: 'You vs 3 CPU', sub: 'Free-for-all', icons: ic('icon_hhg') },
    { v: '1v2mix', title: 'You · Jev · CPU', sub: 'Three-way', icons: ic('icon_banana'), disabled: !jevEnabled },
    { v: '1v1', title: 'Hotseat 2P', sub: 'Pass the keyboard', icons: ic('icon_grenade') },
    { v: '4p', title: 'Hotseat 4P', sub: 'Party mode', icons: ic('icon_cluster') },
    { v: 'jevcpu', title: 'Watch Jev', sub: 'Jev vs CPU', icons: ic('icon_airstrike'), disabled: !jevEnabled },
    { v: 'cpu2', title: 'Watch CPU', sub: 'CPU vs CPU', icons: ic('icon_sheep') },
  ], 'modeCard');

  const skies = { grass: skyUrl('grass'), mars: skyUrl('mars'), snow: skyUrl('snow') };
  cardPicker($('terrainCards'), 'optTerrain', [
    { v: 'grass', title: 'Rolling Hills', art: `background-image:url('${skies.grass}')` },
    { v: 'mars', title: 'Red Planet', art: `background-image:url('${skies.mars}')` },
    { v: 'snow', title: 'Frozen Wastes', art: `background-image:url('${skies.snow}')` },
    { v: 'random', title: 'Surprise me', art: `background-image:url('${skies.grass}'),url('${skies.mars}'),url('${skies.snow}');background-size:34% 100%,34% 100%,34% 100%;background-position:0 0,50% 0,100% 0;background-repeat:no-repeat` },
  ], 'terrainCard');

  const sl = $('sliderGrid');
  elasticSlider(sl, 'optWorms', 'Worms per team', RANGES.optWorms);
  elasticSlider(sl, 'optHealth', 'Starting health', RANGES.optHealth);
  elasticSlider(sl, 'optTime', 'Turn time', RANGES.optTime);
  elasticSlider(sl, 'optSD', 'Sudden death', RANGES.optSD);
  elasticSlider(sl, 'optMines', 'Mines', RANGES.optMines);
  elasticSlider(sl, 'optCrates', 'Crates', RANGES.optCrates);

  const seg = $('segRow');
  gooeySegment(seg, 'optAI', 'CPU skill', [['beginner', 'Beginner'], ['pro', 'Pro'], ['expert', 'Expert']]);
  gooeySegment(seg, 'optGfx', 'Graphics', [['auto', 'Auto'], ['high', 'High'], ['medium', 'Med'], ['low', 'Low']]);

  clickSpark($('btnStart'));
  const setBg = backdrop(k => skies[k] || skies.grass);
  const onTerrain = () => setBg($('optTerrain').value === 'random' ? 'grass' : $('optTerrain').value);
  $('optTerrain').addEventListener('change', onTerrain);
  onTerrain();
  return { refresh: () => document.querySelectorAll('#menuMain select').forEach(s => s.dispatchEvent(new Event('change'))) };
}
