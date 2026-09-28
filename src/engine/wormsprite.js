// ===== worm animation atlas with crisp, exactly-sized frame caches =====
// Canvas drawImage downsampling a 250px frame to ~40 device px each frame is soft and
// shimmers. Instead each frame is pre-scaled once (stepwise halving, then one
// high-quality pass) to the device-pixel size it is actually shown at, and drawn 1:1.

let atlas = null, meta = null;
const cache = new Map();   // `${frame}|${deviceH}|${flip}` -> canvas

export async function loadWormAtlas(base, v = '') {
  const [img, json] = await Promise.all([
    new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = base + 'worm_atlas.png' + v; }),
    fetch(base + 'worm_atlas.json' + v).then(r => r.ok ? r.json() : null).catch(() => null),
  ]);
  atlas = img; meta = json;
  return !!(atlas && meta);
}

export const wormAtlasReady = () => !!(atlas && meta);

/** Footprint of a frame in world px for a worm drawn `worldH` tall: base length behind/ahead of the head anchor. */
export function wormFootprint(name, worldH) {
  const f = meta?.frames[name];
  if (!f) return { tail: worldH * 0.55, head: worldH * 0.25 };
  const k = worldH / meta.idleHeight;
  return { tail: f.ax * k, head: (f.w - f.ax) * k };
}

function frameCanvas(name, deviceH, flip) {
  const f = meta.frames[name];
  const key = `${name}|${deviceH}|${flip ? 1 : 0}`;
  let c = cache.get(key);
  if (c) return c;
  const s = deviceH / meta.idleHeight;                // one scale for every frame
  const tw = Math.max(1, Math.round(f.w * s)), th = Math.max(1, Math.round(f.h * s));
  let src = document.createElement('canvas');
  src.width = f.w; src.height = f.h;
  src.getContext('2d').drawImage(atlas, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
  while (src.width / 2 >= tw * 1.1 && src.height / 2 >= th * 1.1) {
    const n = document.createElement('canvas');
    n.width = Math.round(src.width / 2); n.height = Math.round(src.height / 2);
    const x = n.getContext('2d'); x.imageSmoothingQuality = 'high';
    x.drawImage(src, 0, 0, n.width, n.height);
    src = n;
  }
  c = document.createElement('canvas');
  c.width = tw; c.height = th;
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  if (flip) { x.translate(tw, 0); x.scale(-1, 1); }
  x.drawImage(src, 0, 0, tw, th);
  c.ax = (flip ? f.w - f.ax : f.ax) * s; c.ay = f.ay * s;
  if (cache.size > 400) cache.clear();               // zoom changes create new sizes; keep it bounded
  cache.set(key, c);
  return c;
}

/**
 * Draw a worm frame so its anchor lands on (x, y) in world space.
 * pxScale = world->device scale (camera zoom x devicePixelRatio).
 */
export function drawWormFrame(c, name, x, y, worldH, pxScale, facing, rot = 0, sx = 1, offX = 0) {
  // bucket device sizes to 2px so small zoom changes reuse caches
  const deviceH = Math.max(8, Math.round(worldH * pxScale / 2) * 2);
  const fc = frameCanvas(name, deviceH, facing < 0);
  const k = 1 / pxScale;
  c.save();
  c.translate(x, y);
  if (rot) c.rotate(rot);
  if (offX) c.translate(offX, 0);          // pivot at the footprint midpoint, anchor at the head
  if (sx !== 1) c.scale(sx, 1 / Math.sqrt(sx));
  c.drawImage(fc, -fc.ax * k, -fc.ay * k, fc.width * k, fc.height * k);
  c.restore();
}

/** Any sprite, pre-scaled to exact device size (cached per image+size). */
const imgCache = new WeakMap();
export function crispImage(img, tw, th) {
  tw = Math.max(1, Math.round(tw)); th = Math.max(1, Math.round(th));
  if (tw >= img.width * 0.9) return img;          // not shrinking much: draw as-is
  let m = imgCache.get(img);
  if (!m) { m = new Map(); imgCache.set(img, m); }
  const key = tw * 10000 + th;
  let c = m.get(key);
  if (c) return c;
  let src = img;
  while (src.width / 2 >= tw * 1.1) {
    const n = document.createElement('canvas');
    n.width = Math.round(src.width / 2); n.height = Math.round(src.height / 2);
    const x = n.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, n.width, n.height);
    src = n;
  }
  c = document.createElement('canvas'); c.width = tw; c.height = th;
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, tw, th);
  if (m.size > 24) m.clear();
  m.set(key, c);
  return c;
}

/** Pick the animation frame for a worm from its physical state. */
export function wormFrame(w, g) {
  if (w.state === 'drown') return 'fall';
  if (w.state === 'rope' || w.state === 'jet') return w.vy < 0 ? 'jump' : 'fall';
  if (w.state === 'kamikaze') return 'jump';
  if (w.state === 'air' || w.state === 'punch') {
    if (w.spin > 0.2 || w.flip > 0) return 'tumble';
    // a one-frame step off a lip isn't a fall: keep the ground pose briefly
    if ((w.airT || 0) < 0.12 && w.state === 'air' && w._groundFrame) return w._groundFrame;
    return w.vy < -40 ? 'jump' : 'fall';
  }
  const gf = groundFrame(w, g);
  w._groundFrame = gf;
  return gf;
}

function groundFrame(w, g) {
  if (w.landT > 0) return 'crouch';
  if (w.walking) return `walk${Math.floor(w.walkDist / 3.2) % 5}`;
  if (w.dizzyT > 0) return 'dizzy';
  if (g.cur === w && g.charging) return 'crouch';
  // idle: slow breathing through 4 frames, with a blink every few seconds
  const t = w.anim;
  if ((t + w.blinkOff) % w.blinkEvery < 0.14) return 'blink';
  return `idle${Math.floor(t * 3.2) % 4}`;
}
