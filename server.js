// =====================================================================
//  server.js  -  Servidor multijugador (SIN dependencias, solo Node 18+)
//  - Sirve el juego (index.html, client.js, models.pack) por HTTP
//  - WebSocket en /ws (protocolo implementado a mano, no hace falta "npm install")
//  - Cuentas: registro / inicio de sesión (contraseñas con scrypt, nombres únicos)
//  - Máximo 4 jugadores reales. Sin bots.
//
//  OWNER (administrador): se decide SOLO acá en el servidor, por nombre de usuario.
//    Opción 1: variable de entorno OWNERS="mi_usuario"   (varios: "a,b")
//    Opción 2: escribirlo en la lista OWNERS_FIJOS de abajo.
//
//  Otras variables: PORT=3000  DATA_DIR=.  (dónde guardar data.json)  GROW_SPEED=1
// =====================================================================
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { World, MAX_PLAYERS } from './gamecore.js';

// >>> Poné acá tu usuario de owner (en minúsculas o como lo registraste), por ejemplo: ['6767']
const OWNERS_FIJOS = [];

const OWNERS = new Set([...OWNERS_FIJOS, ...String(process.env.OWNERS || '').split(',')].map((x) => x.trim().toLowerCase()).filter(Boolean));
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = +process.env.PORT || 3000;
const DATA_FILE = path.join(process.env.DATA_DIR || __dirname, 'data.json');
const STARTED = Date.now();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.pack': 'application/octet-stream', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8' };
const CORS = { 'access-control-allow-origin': '*' };

// ---------------- Cuentas ----------------
const accounts = new Map(); // nombre en minúsculas -> { name, salt, hash, tokens:[sha256], created }
const normName = (s) => String(s || '').normalize('NFKC').trim();
const USER_RE = /^[\p{L}\p{N}_]{3,14}$/u;
const RESERVED = new Set(['admin', 'administrador', 'owner', 'dueño', 'dueno', 'moderador', 'mod', 'servidor', 'server', 'sam', 'steve']);
const isOwner = (lower) => OWNERS.has(lower);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const scrypt = (pass, salt) => new Promise((res, rej) => crypto.scrypt(pass, salt, 32, (e, k) => (e ? rej(e) : res(k.toString('hex')))));
const safeEq = (a, b) => { const A = Buffer.from(a), B = Buffer.from(b); return A.length === B.length && crypto.timingSafeEqual(A, B); };
function nameState(raw) {
  const name = normName(raw);
  if (!USER_RE.test(name)) return { ok: false, msg: 'Usá 3 a 14 letras, números o _ (sin espacios)' };
  const lower = name.toLowerCase();
  if (accounts.has(lower)) return { ok: false, taken: true, msg: 'Este nombre de usuario ya está en uso' };
  if (RESERVED.has(lower) && !isOwner(lower)) return { ok: false, msg: 'Ese nombre está reservado' };
  return { ok: true, name, lower };
}
// límite de intentos por IP
const tries = new Map();
function throttled(ip, max = 20) {
  const now = Date.now(); const a = (tries.get(ip) || []).filter((t) => now - t < 60000); a.push(now); tries.set(ip, a);
  return a.length > max;
}
setInterval(() => { const now = Date.now(); for (const [k, a] of tries) if (!a.some((t) => now - t < 60000)) tries.delete(k); }, 60000);
const ipOf = (req) => String((req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')).split(',')[0].trim();

// ---------------- HTTP estático ----------------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'application/json', ...CORS }); return res.end(JSON.stringify({ ok: true, players: world.players.size, max: MAX_PLAYERS })); }
  if (url.pathname === '/api/name') { // ¿está libre este nombre?
    res.writeHead(200, { 'content-type': 'application/json', ...CORS });
    if (throttled(ipOf(req), 60)) return res.end(JSON.stringify({ ok: false, msg: 'Demasiados intentos' }));
    const r = nameState(url.searchParams.get('u')); return res.end(JSON.stringify({ ok: r.ok, taken: !!r.taken, msg: r.msg || '' }));
  }
  let p; try { p = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); } if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(__dirname, p)); const ext = path.extname(file);
  if (!file.startsWith(__dirname + path.sep) || !MIME[ext] || path.basename(file) === 'server.js') { res.writeHead(404); return res.end('404'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'content-type': MIME[ext], 'cache-control': ext === '.pack' ? 'public, max-age=3600' : 'no-cache' }); res.end(buf);
  });
});

// ---------------- Mundo ----------------
const conns = new Map(); // id de jugador -> estado del socket
const world = new World({
  send: (id, msg) => { const c = conns.get(id); if (c) wsSend(c.sock, JSON.stringify(msg)); },
  broadcast: (msg, except) => { const s = JSON.stringify(msg); for (const [id, c] of conns) if (id !== except) wsSend(c.sock, s); },
  kick: (id, why) => { const c = conns.get(id); if (c) { wsSend(c.sock, JSON.stringify({ t: 'error', msg: why })); wsClose(c.sock, 1008); } },
  extra: () => ({ accounts: accounts.size, uptime: Math.round((Date.now() - STARTED) / 1000), owners: [...OWNERS] }),
});
try {
  const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  for (const k in d.accounts || {}) accounts.set(k, d.accounts[k]);
  world.importProfiles(d.profiles || {});
  console.log('Datos cargados:', accounts.size, 'cuentas');
} catch {}
let last = Date.now(), posTimer = 0;
setInterval(() => {
  const now = Date.now(), dt = Math.min(1, (now - last) / 1000); last = now;
  world.tick(dt); posTimer += dt;
  if (posTimer >= 0.1) { posTimer = 0; if (conns.size) { const s = JSON.stringify(world.positionsMsg()); for (const c of conns.values()) if (c.sock.writableLength < 200000) wsSend(c.sock, s); } }
}, 100);
function save() {
  try { fs.writeFileSync(DATA_FILE + '.tmp', JSON.stringify({ accounts: Object.fromEntries(accounts), profiles: world.exportProfiles() })); fs.renameSync(DATA_FILE + '.tmp', DATA_FILE); }
  catch (e) { console.error('No se pudo guardar:', e.message); }
}
setInterval(save, 30000);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { save(); process.exit(0); });

// ---------------- Autenticación ----------------
const authErr = (st, msg) => { wsSend(st.sock, JSON.stringify({ t: 'autherr', msg })); st.authing = false; };
async function auth(st, m) {
  if (st.authing || st.acct) return; st.authing = true;
  if (++st.authTries > 12 || throttled(st.ip)) { authErr(st, 'Demasiados intentos. Esperá un minuto.'); return; }
  try {
    const avatar = String(m.avatar || 'farmer').slice(0, 20);
    let acct;
    if (m.t === 'register') {
      const pass = String(m.pass || '');
      const r = nameState(m.user); if (!r.ok) return authErr(st, r.msg);
      if (pass.length < 4 || pass.length > 64) return authErr(st, 'La contraseña debe tener entre 4 y 64 caracteres');
      if (accounts.has(r.lower)) return authErr(st, 'Este nombre de usuario ya está en uso');
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = await scrypt(pass, salt);
      if (accounts.has(r.lower)) return authErr(st, 'Este nombre de usuario ya está en uso'); // por si otro se registró mientras tanto
      acct = { name: r.name, lower: r.lower, salt, hash, tokens: [], created: Date.now() };
      accounts.set(r.lower, acct);
    } else {
      const a = accounts.get(normName(m.user).toLowerCase());
      if (!a) return authErr(st, m.t === 'resume' ? 'Sesión vencida, iniciá sesión de nuevo' : 'Usuario o contraseña incorrectos');
      if (m.t === 'login') {
        const h = await scrypt(String(m.pass || '').slice(0, 64), a.salt);
        if (!safeEq(h, a.hash)) return authErr(st, 'Usuario o contraseña incorrectos');
      } else if (!(a.tokens || []).includes(sha(String(m.token || '')))) return authErr(st, 'Sesión vencida, iniciá sesión de nuevo');
      acct = a; acct.lower = normName(a.name).toLowerCase();
    }
    const token = crypto.randomBytes(24).toString('hex');
    acct.tokens = [...(acct.tokens || []).slice(-4), sha(token)];
    startSession(st, acct, token, avatar);
  } catch (e) { console.error('auth', e.message); authErr(st, 'Error del servidor'); }
}
function startSession(st, acct, token, avatar) {
  // sesión duplicada: se cierra la anterior
  for (const [id, c] of [...conns]) if (c.acct === acct) { wsSend(c.sock, JSON.stringify({ t: 'error', msg: 'Iniciaste sesión desde otro lugar' })); wsClose(c.sock, 1008); conns.delete(id); world.leave(id); c.id = null; }
  if (world.players.size >= MAX_PLAYERS) { wsSend(st.sock, JSON.stringify({ t: 'full', msg: `Servidor lleno (${MAX_PLAYERS}/${MAX_PLAYERS} jugadores). Probá más tarde.` })); wsClose(st.sock, 1013); return; }
  const pid = world.nextId; conns.set(pid, st); st.acct = acct;
  wsSend(st.sock, JSON.stringify({ t: 'authok', user: acct.name, token, owner: isOwner(acct.lower) }));
  const r = world.join('acct:' + acct.lower, { name: acct.name, avatar, owner: isOwner(acct.lower) });
  if (r.error) { conns.delete(pid); wsSend(st.sock, JSON.stringify({ t: 'error', msg: r.error })); wsClose(st.sock, 1013); return; }
  st.id = r.id; clearTimeout(st.joinTimer); save();
}

// ---------------- WebSocket (RFC 6455 mínimo) ----------------
function wsSend(sock, text) {
  if (sock.destroyed || !sock.writable) return;
  const payload = Buffer.from(text); const n = payload.length; let head;
  if (n < 126) head = Buffer.from([0x81, n]);
  else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 126; head.writeUInt16BE(n, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
  sock.write(Buffer.concat([head, payload]));
}
function wsClose(sock, code = 1000) { try { const b = Buffer.alloc(4); b[0] = 0x88; b[1] = 2; b.writeUInt16BE(code, 2); sock.end(b); } catch {} }

server.on('upgrade', (req, sock) => {
  const url = new URL(req.url, 'http://x'); const key = req.headers['sec-websocket-key'];
  if (url.pathname !== '/ws' || !key) { sock.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  sock.setNoDelay(true);
  const st = { sock, buf: Buffer.alloc(0), frag: [], id: null, acct: null, authing: false, authTries: 0, ip: ipOf(req), rate: 0, rateT: Date.now() };
  sock.on('data', (chunk) => { try { onData(st, chunk); } catch (e) { console.error('ws error', e.message); sock.destroy(); } });
  const gone = () => { if (st.id != null) { world.leave(st.id); conns.delete(st.id); st.id = null; } clearTimeout(st.joinTimer); };
  sock.on('close', gone); sock.on('error', gone);
  st.joinTimer = setTimeout(() => { if (st.id == null) sock.destroy(); }, 120000);
});
function onData(st, chunk) {
  st.buf = Buffer.concat([st.buf, chunk]);
  for (;;) {
    const b = st.buf; if (b.length < 2) return;
    const fin = !!(b[0] & 0x80), op = b[0] & 15, masked = !!(b[1] & 0x80);
    let len = b[1] & 127, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
    if (len > 65536) { st.sock.destroy(); return; }
    const total = off + (masked ? 4 : 0) + len; if (b.length < total) return;
    let payload = b.subarray(off + (masked ? 4 : 0), total);
    if (masked) { const mk = b.subarray(off, off + 4); const o = Buffer.alloc(len); for (let i = 0; i < len; i++) o[i] = payload[i] ^ mk[i & 3]; payload = o; }
    st.buf = b.subarray(total);
    if (op === 8) { wsClose(st.sock); return; }
    if (op === 9) { if (payload.length < 126) st.sock.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); continue; }
    if (op === 10) continue;
    if (op === 1 || op === 2) st.frag = [payload]; else if (op === 0) st.frag.push(payload); else continue;
    if (!fin) continue;
    const text = Buffer.concat(st.frag).toString('utf8'); st.frag = [];
    onMessage(st, text);
  }
}
function onMessage(st, text) {
  const now = Date.now();
  if (now - st.rateT > 1000) { st.rateT = now; st.rate = 0; }
  if (++st.rate > 80) return; // anti-flood
  let m; try { m = JSON.parse(text); } catch { return; }
  if (!m || typeof m !== 'object') return;
  if (!st.acct) { if (m.t === 'register' || m.t === 'login' || m.t === 'resume') auth(st, m); return; }
  if (st.id == null) return;
  world.handle(st.id, m);
}

server.listen(PORT, () => console.log(`Cultiva tu Jardín - servidor en http://localhost:${PORT}  (máx ${MAX_PLAYERS} jugadores)${OWNERS.size ? '  owners: ' + [...OWNERS].join(', ') : ''}`));
