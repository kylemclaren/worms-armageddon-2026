// Static server for the game + a server-side proxy to TypeSafe's Jev model.
// The API key lives only in the environment (or ../tools/.env); the browser
// never sees it. Only the public game files are served.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8080);

// Pick up keys from ../tools/.env without overriding real env vars.
for (const f of [path.join(ROOT, '.env'), path.join(ROOT, '../tools/.env')]) {
  try {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch { /* optional */ }
}
// Prefer the Sprites API gateway (injects credentials, no key on this machine);
// fall back to a raw TYPESAFE_API_KEY when running elsewhere.
const JEV_BASE = () => process.env.TYPESAFE_BASE_URL || '';
const JEV_KEY = () => process.env.TYPESAFE_API_KEY || '';
const jevEnabled = () => !!(JEV_BASE() || JEV_KEY());

// Game assets live in Tigris (bucket opus-worms-assets), reached through the Sprites
// S3 gateway. Fetched objects are cached on local disk; the repo copies are only a
// fallback if Tigris is unreachable.
const TIGRIS = () => (process.env.TIGRIS_ASSETS_BASE || '').replace(/\/$/, '');
const CACHE = path.join(ROOT, '.cache', 'tigris');
const inflight = new Map();

async function fromTigris(key) {
  const file = path.join(CACHE, key);
  try { return { file, size: (await fs.promises.stat(file)).size, source: 'tigris-cache' }; } catch { /* miss */ }
  if (!inflight.has(key)) inflight.set(key, (async () => {
    const r = await fetch(`${TIGRIS()}/${key}`, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`tigris ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmp, buf);
    await fs.promises.rename(tmp, file);
    return { file, size: buf.length, source: 'tigris' };
  })().finally(() => inflight.delete(key)));
  return inflight.get(key);
}

// The UI is a Vite build in dist/ (content-hashed files under /static). We only inject
// the asset version so replaced game art at the same /assets path is never stale.
const DIST = path.join(ROOT, 'dist');
function versionedIndex() {
  const h = crypto.createHash('sha1');
  for (const dir of ['assets/gfx', 'assets/audio/sfx']) for (const f of fs.readdirSync(path.join(ROOT, dir)).sort()) {
    const st = fs.statSync(path.join(ROOT, dir, f)); h.update(`${f}:${st.size}:${st.mtimeMs};`);
  }
  const assetV = h.digest('hex').slice(0, 10);
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  return html.replace('<head>', `<head>\n<script>window.ASSET_V = '${assetV}';</script>`);
}

const PUBLIC = [/^\/$/, /^\/index\.html$/, /^\/static\/[\w.-]+\.(js|css|woff2?|png|svg|map)$/,
  /^\/assets\/gfx\/[\w.-]+\.(png|jpg|webp|json)$/, /^\/assets\/audio\/(sfx|voice\/\w+)\/[\w.-]+\.mp3$/];
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.map': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.json': 'application/json' };

// crude per-IP limiter for the proxy: 40 requests / minute
const hits = new Map();
function limited(ip) {
  const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < 60000);
  h.push(now); hits.set(ip, h);
  return h.length > 40;
}

async function jev(req, res) {
  if (!jevEnabled()) return send(res, 503, { error: 'Jev is not configured on this server.' });
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  if (limited(ip)) return send(res, 429, { error: 'Slow down' });
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 96 * 1024) return send(res, 413, { error: 'Too large' }); }
  let payload;
  try { payload = JSON.parse(body); } catch { return send(res, 400, { error: 'Bad JSON' }); }
  if (!payload || typeof payload.questions !== 'object' || payload.state === undefined) return send(res, 400, { error: 'Need state and questions' });
  const out = { state: payload.state, model: 'jev-latest', questions: payload.questions };
  const url = JEV_BASE() ? `${JEV_BASE().replace(/\/$/, '')}/v1/systemone` : 'https://api.typesafe.ai/v1/systemone';
  const headers = { 'Content-Type': 'application/json' };
  if (!JEV_BASE()) headers.Authorization = `Bearer ${JEV_KEY()}`;
  // The gateway occasionally answers with a plain-text proxy error ("upstream connect error ...").
  // Retry once inside the client's 14 s budget and always hand the browser JSON.
  const deadline = Date.now() + 13000;
  let last = 'no response';
  for (let attempt = 1; attempt <= 2; attempt++) {
    const left = deadline - Date.now();
    if (left < 1500) break;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), attempt === 1 ? Math.min(7000, left) : left);
    try {
      const r = await fetch(url, { method: 'POST', signal: ctl.signal, headers, body: JSON.stringify(out) });
      const text = await r.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      if (json && r.status < 500) return send(res, r.status, json);
      last = `HTTP ${r.status}${json ? '' : `: ${text.replace(/\s+/g, ' ').slice(0, 80)}`}`;
    } catch (e) {
      last = e.name === 'AbortError' ? 'timeout' : e.message;
    } finally { clearTimeout(timer); }
    console.warn(`[jev] attempt ${attempt} failed: ${last}`);
  }
  send(res, 502, { error: last === 'timeout' ? 'Jev took too long to answer' : 'Jev\'s server hiccuped', detail: last });
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

// ------------------------------------------------------------------ multiplayer rooms
// A dumb relay: the host's browser runs the authoritative game; guests send inputs.
// Rooms are keyed by a short code; the server only forwards messages.
const rooms = new Map();                 // code -> { host, guests: Map<seat, ws>, started, names }
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O/1/I
const newCode = () => { let c; do { c = Array.from({ length: 6 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join(''); } while (rooms.has(c)); return c; };
const wsend = (ws, obj) => { if (ws && ws.readyState === 1) ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); };
const cleanName = n => String(n || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 18) || 'Player';
const players = room => [{ seat: 0, name: room.names.get(0) }, ...[...room.guests.keys()].map(s => ({ seat: s, name: room.names.get(s) }))];

const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
wss.on('connection', ws => {
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const room = ws.room && rooms.get(ws.room);
    switch (m.t) {
      case 'host': {
        if (ws.room) return;
        const code = newCode();
        rooms.set(code, { host: ws, guests: new Map(), started: false, names: new Map([[0, cleanName(m.name)]]), next: 1 });
        ws.room = code; ws.seat = 0;
        console.log(`[mp] room ${code} hosted`);
        return wsend(ws, { t: 'hosted', code, seat: 0, players: players(rooms.get(code)) });
      }
      case 'join': {
        const r = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!r) return wsend(ws, { t: 'error', error: 'No game with that code.' });
        if (r.started) return wsend(ws, { t: 'error', error: 'That game has already started.' });
        if (r.guests.size >= 3) return wsend(ws, { t: 'error', error: 'That game is full (4 players).' });
        const seat = r.next++;
        r.guests.set(seat, ws); r.names.set(seat, cleanName(m.name));
        ws.room = [...rooms.entries()].find(([, v]) => v === r)[0]; ws.seat = seat;
        const list = players(r);
        wsend(ws, { t: 'joined', code: ws.room, seat, players: list });
        wsend(r.host, { t: 'lobby', players: list });
        for (const g of r.guests.values()) if (g !== ws) wsend(g, { t: 'lobby', players: list });
        return;
      }
      case 'relay': {                     // host -> one guest (to) or all guests; guest -> host
        if (!room) return;
        const payload = JSON.stringify({ t: 'msg', from: ws.seat, msg: m.msg });
        if (ws.seat === 0) {
          if (m.msg?.t === 'start') room.started = true;
          if (m.to != null) wsend(room.guests.get(m.to), payload);
          else for (const g of room.guests.values()) wsend(g, payload);
        } else wsend(room.host, payload);
        return;
      }
    }
  });
  ws.on('close', () => {
    const code = ws.room, room = code && rooms.get(code);
    if (!room) return;
    if (ws.seat === 0) {
      for (const g of room.guests.values()) wsend(g, { t: 'host-left' });
      rooms.delete(code);
      console.log(`[mp] room ${code} closed`);
    } else {
      room.guests.delete(ws.seat); room.names.delete(ws.seat);
      wsend(room.host, { t: 'peer-left', seat: ws.seat, players: players(room) });
      for (const g of room.guests.values()) wsend(g, { t: 'lobby', players: players(room) });
    }
  });
});
// keep connections alive through proxies, drop dead ones
setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); } }, 25000);

// Crazy Machines lives in its own service on :8090; the Sprite has one public port, so forward /crazy/*.
function toCrazy(req, res) {
  const up = http.request({ host: '127.0.0.1', port: 8090, path: req.url, method: req.method, headers: req.headers }, r => {
    res.writeHead(r.statusCode || 502, r.headers); r.pipe(res);
  });
  up.on('error', () => { if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' }); res.end('Crazy Machines is starting up, try again in a moment.'); });
  req.pipe(up);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  if (p === '/crazy' || p.startsWith('/crazy/')) return toCrazy(req, res);
  if (p === '/api/jev' && req.method === 'POST') return jev(req, res);
  if (p === '/api/telemetry' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 8192) break; }
    console.log(`[telemetry] ${body.replace(/\s+/g, ' ').slice(0, 1500)}`);
    return send(res, 204, {});
  }
  if (p === '/' || p === '/index.html' || p === '/js/main.js') console.log(`[req] ${req.method} ${p} ${req.headers['user-agent']?.slice(0, 120) || ''}`);
  if (p === '/api/jev/status') return send(res, 200, { enabled: jevEnabled(), via: JEV_BASE() ? 'sprites-gateway' : 'api-key' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
  if (!PUBLIC.some(r => r.test(p)) || p.includes('..')) { res.writeHead(404); return res.end('Not found'); }
  if (p === '/' || p === '/index.html') {
    const html = versionedIndex();
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store, max-age=0', 'Content-Length': Buffer.byteLength(html) });
    return res.end(req.method === 'HEAD' ? undefined : html);
  }
  let file = p.startsWith('/static/') ? path.join(DIST, p) : path.join(ROOT, p);
  let source = 'local';
  if (TIGRIS() && p.startsWith('/assets/')) {
    try { const t = await fromTigris(p.slice(1)); file = t.file; source = t.source; }
    catch (e) { console.warn(`tigris miss ${p}: ${e.message} — serving local copy`); }
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(file);
    const immutable = ext === '.mp3' || ext === '.png' || ext === '.jpg' || ext === '.webp';
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size,
      'Cache-Control': p.startsWith('/static/') || url.search ? 'public, max-age=31536000, immutable' : immutable ? 'public, max-age=3600' : 'no-store, max-age=0',
      'X-Asset-Source': source });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
});
server.on('upgrade', (req, sock, head) => {
  if (new URL(req.url, 'http://x').pathname !== '/ws') return sock.destroy();
  wss.handleUpgrade(req, sock, head, ws => wss.emit('connection', ws, req));
});
server.listen(PORT, '0.0.0.0', () => console.log(`worms on :${PORT} — Jev ${JEV_BASE() ? 'via Sprites gateway' : JEV_KEY() ? 'via API key' : 'disabled'}, assets ${TIGRIS() ? 'from Tigris' : 'local'}`));
