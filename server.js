'use strict';
/* ============================================================
   MiniScape 2D - Servidor (V81)
   - Contas com senha criptografada (scrypt) + token de sessão
   - Banco em memória, gravado em disco com atraso (sem ler o arquivo a cada requisição)
   - Só admin altera mundo/itens/NPCs, lista contas, faz backup/restauração
   - Chat sanitizado e limitado; remetente vem do servidor (não dá pra falsificar)
   - Servidor escolhe um "host" por mapa para simular os monstros e repassa as posições
   Variáveis de ambiente:
     PORT            porta (padrão 3000)
     ADMIN_USER      nome da conta admin (padrão "Admin")
     ADMIN_PASSWORD  senha do admin (RECOMENDADO definir no Render). Se faltar, é gerada
                     uma senha aleatória e mostrada UMA vez nos logs.
     DATA_DIR        pasta onde salvar database.json (use o disco persistente do Render)
   ============================================================ */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const util = require('util');
const createSocial = require('./social');
const createExtras = require('./extras');
const wsServer = require('./wsserver');
const createSecurity = require('./security');
const createSQ = require('./specialquests');
const { cleanSQ } = createSQ;

const scrypt = util.promisify(crypto.scrypt);
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => { if (/%00|\0|%5c|\\|%2e%2e%2f|%2e%2e\//i.test(req.url)) return res.status(400).end('Pedido inválido.'); next(); });   // bytes nulos e tentativas de sair da pasta
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
    /* O jogo usa scripts e handlers inline (onclick), então 'unsafe-inline' é necessário; o resto é fechado: sem plugins, sem <base>, sem iframes, sem formulários externos */
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
});
/* CORS restrito: só a própria origem (a API não envia Access-Control-Allow-*). Pedido de outra origem é recusado; "file://" (Origin: null) só vale vindo do próprio computador (modo de desenvolvimento). */
app.use('/api', (req, res, next) => {
    const o = req.headers.origin; if (!o) return next();
    let ok = false; try { ok = new URL(o).host === req.headers.host; } catch (e) { ok = false; }
    if (!ok && o === 'null' && /^(::1|::ffff:127\.0\.0\.1|127\.0\.0\.1)$/.test(req.socket.remoteAddress || '')) { res.setHeader('Access-Control-Allow-Origin', 'null'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); if (req.method === 'OPTIONS') return res.status(204).end(); ok = true; }
    if (!ok) return res.status(403).json({ error: 'Origem não permitida.' });
    next();
});
/* limites de corpo por rota: leves aceitam pouco; save exige login antes de ler corpo grande; restauração só admin */
app.use(['/api/login', '/api/register'], express.json({ limit: '4kb' }));
app.use(['/api/chat', '/api/rank', '/api/logout'], express.json({ limit: '4kb' }));
app.use(['/api/house', '/api/market', '/api/social'], express.json({ limit: '16kb' }));
app.use('/api/sync', express.json({ limit: '64kb' }));
app.use('/api/save', (req, res, next) => auth(req, res, next), express.json({ limit: '8mb' }));
app.use('/api/restore', (req, res, next) => auth(req, res, () => adminOnly(req, res, next)), express.json({ limit: '30mb' }));
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'ignore', index: 'index.html' }));

/* ---------------- BANCO DE DADOS (em memória + disco) ---------------- */
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DB_FILE = path.join(DATA_DIR, 'database.json');
const ROLES = ['player', 'vip_light', 'vip_full', 'admin'];
const NAME_RE = /^[\p{L}\p{N}_.\- ]{2,20}$/u;
const MAP_RE = /^[\w\-]{1,40}$/;

function emptyDB() {
    return {
        users: Object.create(null), worldData: null, itemDB: null, npcDB: null,
        chat: [{ sender: 'Sistema', msg: 'Servidor online!', color: '#2ecc71' }], chatVer: 1,
        mapVersion: Date.now(), sessions: Object.create(null),
        mobDeaths: Object.create(null), specialQuests: Object.create(null), specialClaims: Object.create(null), specialProg: Object.create(null)
    };
}
function normalizeDB(d) {
    const out = emptyDB();
    if (!d || typeof d !== 'object') return out;
    if (d.users && typeof d.users === 'object') {
        for (const name of Object.keys(d.users)) {
            const u = d.users[name];
            if (!u || typeof u !== 'object' || typeof u.password !== 'string') continue;
            out.users[name] = {
                password: u.password,
                role: ROLES.includes(u.role) ? u.role : 'player',
                playerData: (u.playerData && typeof u.playerData === 'object') ? u.playerData : null
            };
        }
    }
    if (d.worldData && typeof d.worldData === 'object') out.worldData = d.worldData;
    if (d.itemDB && typeof d.itemDB === 'object') { out.itemDB = d.itemDB; delete out.itemDB['Caixa Mímica']; }   // Caixa Mímica foi removida (Mímicos só por presente do admin)
    if (d.npcDB && typeof d.npcDB === 'object') out.npcDB = d.npcDB;
    if (Array.isArray(d.chat)) out.chat = d.chat.slice(-50).filter(c => c && typeof c.msg === 'string').map(c => ({ sender: String(c.sender || '?').slice(0, 40), msg: c.msg.slice(0, 200), color: /^#[0-9a-f]{3,8}$/i.test(c.color) ? c.color : '#ecf0f1' }));
    out.trades = Object.create(null);
    if (d.trades && typeof d.trades === 'object') for (const id of Object.keys(d.trades)) { const t = d.trades[id]; if (t && typeof t === 'object' && typeof t.a === 'string' && typeof t.b === 'string' && t.offer && t.ok && t.applied) out.trades[id] = t; }
    if (d.market && typeof d.market === 'object') out.market = d.market;
    out.mobDeaths = Object.create(null);   // map -> id -> instante da morte (respawn autoritativo do servidor, sobrevive a reinício)
    if (d.mobDeaths && typeof d.mobDeaths === 'object') for (const mk of Object.keys(d.mobDeaths)) {
        const m = d.mobDeaths[mk]; if (!MAP_RE.test(mk) || /^casa_/.test(mk) || !m || typeof m !== 'object') continue; const o = Object.create(null);
        for (const id of Object.keys(m)) if (/^[A-Za-z0-9_\-]{1,30}$/.test(id) && Number.isFinite(m[id]) && m[id] > 0) o[id] = Math.min(m[id], Date.now());
        if (Object.keys(o).length) out.mobDeaths[mk] = o;
    }
    out.specialQuests = Object.create(null); out.specialClaims = Object.create(null); out.specialProg = Object.create(null);   // missões especiais do admin (veja a seção abaixo)
    if (d.specialQuests && typeof d.specialQuests === 'object') for (const id of Object.keys(d.specialQuests)) { const q = cleanSQ(d.specialQuests[id], id); if (q) out.specialQuests[id] = q; }
    if (d.specialClaims && typeof d.specialClaims === 'object') for (const id of Object.keys(d.specialClaims)) { const c = d.specialClaims[id]; if (out.specialQuests[id] && c && typeof c === 'object' && !Array.isArray(c)) { const o = Object.create(null); for (const u of Object.keys(c)) if (Number.isFinite(c[u])) o[u] = c[u]; out.specialClaims[id] = o; } }
    if (d.specialProg && typeof d.specialProg === 'object') for (const id of Object.keys(d.specialProg)) { const c = d.specialProg[id]; if (out.specialQuests[id] && c && typeof c === 'object' && !Array.isArray(c)) { const o = Object.create(null); for (const u of Object.keys(c)) if (Number.isFinite(c[u]) && c[u] >= 0) o[u] = Math.min(1e6, Math.floor(c[u])); out.specialProg[id] = o; } }
    if (out.worldData) healWorld(out.worldData);
    if (Number.isFinite(d.mapVersion)) out.mapVersion = d.mapVersion;
    if (d.sessions && typeof d.sessions === 'object') {
        for (const h of Object.keys(d.sessions)) { const s = d.sessions[h]; if (s && typeof s.user === 'string' && s.exp > Date.now()) out.sessions[h] = { user: s.user, exp: s.exp, sid: Number.isFinite(s.sid) ? s.sid : 0, rep: s.rep ? 1 : 0 }; }
    }
    return out;
}
function loadJsonDB() {
    try {
        if (fs.existsSync(DB_FILE)) return normalizeDB(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
    } catch (e) {
        console.error('[DB] database.json ilegível:', e.message);
        try { fs.copyFileSync(DB_FILE, DB_FILE + '.corrompido-' + Date.now()); } catch (_) { }
        try { if (fs.existsSync(DB_FILE + '.bak')) { console.error('[DB] restaurando de database.json.bak'); return normalizeDB(JSON.parse(fs.readFileSync(DB_FILE + '.bak', 'utf8'))); } } catch (e2) { console.error('[DB] .bak também ilegível:', e2.message); }
        console.error('[DB] NÃO vou iniciar com banco vazio para não apagar suas contas. Restaure um arquivo da pasta backups/ ou corrija database.json.'); process.exit(1);
    }
    return emptyDB();
}
/* STORAGE=sqlite grava em SQLite (node:sqlite, Node 22.5+); o padrão continua sendo database.json. Na 1ª vez, o JSON existente é importado (o arquivo original é mantido). */
let sql = null;
if ((process.env.STORAGE || '').toLowerCase() === 'sqlite') {
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); sql = require('./sqlitestore').open(path.join(DATA_DIR, 'database.sqlite')); }
    catch (e) { console.error('[DB] SQLite indisponível (' + e.message + '). Usando database.json.'); sql = null; }
}
function loadDB() {
    if (!sql) return loadJsonDB();
    let d = null;
    try { d = sql.load(); } catch (e) { console.error('[DB] SQLite ilegível:', e.message, '— NÃO vou iniciar vazio para não apagar suas contas.'); process.exit(1); }
    if (d) return normalizeDB(d);
    const migrated = loadJsonDB();   // banco SQL vazio: importa o JSON (ou começa do zero se não houver)
    try { sql.save(migrated); console.log('[DB] SQLite inicializado com ' + Object.keys(migrated.users).length + ' conta(s).'); } catch (e) { console.error('[DB] falha ao inicializar o SQLite:', e.message); process.exit(1); }
    return migrated;
}
let db = loadDB();
const sec = createSecurity({ dataDir: DATA_DIR, root: __dirname, getDB: () => db });
const SEC_IP = (req) => String(req.ip || '').replace(/^::ffff:/, '');
let worldStr = db.worldData ? JSON.stringify(db.worldData) : '';
let dbStr = JSON.stringify([db.itemDB, db.npcDB]);

let dirty = false, flushTimer = null, lastSnap = 0;
function markDirty() { dirty = true; if (!flushTimer) flushTimer = setTimeout(flushDB, 1500); }
/* grava de forma atômica (arquivo temporário + fsync + rename) e mantém cópias: .bak (último save bom) e snapshots de hora em hora (últimos 12) */
function flushDB() {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (!dirty) return; dirty = false;
    if (sql) {
        try {
            sql.save(db);
            if (Date.now() - lastSnap > 3600000) { lastSnap = Date.now(); const dir = path.join(DATA_DIR, 'backups'); fs.mkdirSync(dir, { recursive: true }); sql.snapshot(path.join(dir, 'database-' + new Date().toISOString().replace(/[:.]/g, '-') + '.sqlite')); fs.readdirSync(dir).filter(f => f.startsWith('database-') && f.endsWith('.sqlite')).sort().slice(0, -12).forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch (_) { } }); }
        } catch (e) { console.error('[DB] erro ao gravar (SQLite):', e.message); dirty = true; if (!flushTimer) flushTimer = setTimeout(flushDB, 5000); }
        return;
    }
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        const tmp = DB_FILE + '.tmp', json = JSON.stringify(db);
        const fd = fs.openSync(tmp, 'w'); fs.writeSync(fd, json, 0, 'utf8'); try { fs.fsyncSync(fd); } catch (_) { } fs.closeSync(fd);
        if (fs.existsSync(DB_FILE)) { try { fs.copyFileSync(DB_FILE, DB_FILE + '.bak'); } catch (_) { } }
        fs.renameSync(tmp, DB_FILE);
        if (Date.now() - lastSnap > 3600000) {
            lastSnap = Date.now();
            const dir = path.join(DATA_DIR, 'backups'); fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, 'database-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'), json, 'utf8');
            fs.readdirSync(dir).filter(f => f.startsWith('database-')).sort().slice(0, -12).forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch (_) { } });
        }
    } catch (e) { console.error('[DB] erro ao gravar:', e.message); dirty = true; if (!flushTimer) flushTimer = setTimeout(flushDB, 5000); }
}
setInterval(() => { if (dirty) flushDB(); }, 10000).unref();
['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => { flushDB(); process.exit(0); }));
process.on('exit', flushDB);
process.on('unhandledRejection', e => console.error('[unhandledRejection]', e));
process.on('uncaughtException', e => { console.error('[uncaughtException]', e); });

/* ---------------- SENHAS ---------------- */
async function hashPw(pw) {
    const salt = crypto.randomBytes(16);
    const h = await scrypt(pw, salt, 64);
    return 'scrypt$' + salt.toString('hex') + '$' + h.toString('hex');
}
async function checkPw(pw, stored) {
    if (typeof pw !== 'string' || typeof stored !== 'string') return false;
    if (stored.startsWith('scrypt$')) {
        const [, s, h] = stored.split('$'); if (!s || !h) return false; const hb = Buffer.from(h, 'hex');
        const calc = await scrypt(pw, Buffer.from(s, 'hex'), hb.length);
        return calc.length === hb.length && crypto.timingSafeEqual(calc, hb);
    }
    const a = Buffer.from(pw), b = Buffer.from(stored);   // contas antigas (texto puro)
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const DUMMY_HASH = 'scrypt$' + '00'.repeat(16) + '$' + '00'.repeat(64);

/* ---------------- ADMIN INICIAL ---------------- */
const LEAKED_PASSWORDS = ['Adleradm'];   // senha que estava publicada no GitHub
async function ensureAdmin() {
    const adminName = (process.env.ADMIN_USER || 'Admin').trim();
    const envPass = process.env.ADMIN_PASSWORD;
    if (envPass) {
        const u = db.users[adminName];
        if (!u) db.users[adminName] = { password: await hashPw(envPass), role: 'admin', playerData: null };
        else if (!(await checkPw(envPass, u.password)) || u.role !== 'admin') { u.password = await hashPw(envPass); u.role = 'admin'; }
        markDirty(); return;
    }
    let rotated = false;
    for (const name of Object.keys(db.users)) {
        const u = db.users[name];
        if (u.role !== 'admin') continue;
        for (const leaked of LEAKED_PASSWORDS) {
            if (await checkPw(leaked, u.password)) {
                const np = crypto.randomBytes(9).toString('base64url'); u.password = await hashPw(np); rotated = true; markDirty();
                console.log(`\n[ADMIN] A senha antiga da conta "${name}" era pública. Nova senha: ${np}\n[ADMIN] Defina ADMIN_PASSWORD no ambiente para fixar sua própria senha.\n`);
            }
        }
    }
    const hasAdmin = Object.keys(db.users).some(n => db.users[n].role === 'admin');
    if (!hasAdmin) {
        const np = crypto.randomBytes(9).toString('base64url');
        db.users[adminName] = { password: await hashPw(np), role: 'admin', playerData: null }; markDirty();
        console.log(`\n[ADMIN] Conta admin criada -> usuário: ${adminName}  senha: ${np}\n[ADMIN] Anote e troque definindo ADMIN_PASSWORD no ambiente.\n`);
    }
}

/* ---------------- SESSÕES ---------------- */
const SESSION_MS = 30 * 24 * 3600 * 1000, MAX_TOMBS = 50;   // 30 dias, renovável a cada uso; tokens "derrubados" guardados por conta (para avisar o cliente antigo)
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
/* SESSÃO ÚNICA: cada conta tem no máximo UM token válido. Um novo login marca o(s) anterior(es) como derrubados (rep=1, motivo 'outro_login') e só esse "túmulo" resta
   (para o cliente antigo receber 401 session_replaced em vez de "expirou"). `sid` cresce a cada login da conta e nunca volta. Tudo aqui é síncrono: não há janela com dois tokens válidos. */
const wsByUser = Object.create(null);   // user -> Set de conexões WebSocket abertas (derrubadas junto com a sessão)
function newSession(user, ip) {
    const token = crypto.randomBytes(32).toString('hex'); const now = Date.now();
    let maxSid = 0, hadLive = false; const mine = [];
    for (const h of Object.keys(db.sessions)) { const s = db.sessions[h]; if (s.user !== user) continue; mine.push(h); if ((s.sid | 0) > maxSid) maxSid = s.sid | 0; if (!s.rep && s.exp > now) hadLive = true; }
    for (const h of mine) if (!db.sessions[h].rep) { db.sessions[h].rep = 1; db.sessions[h].repAt = now; }
    const tombs = mine.sort((a, b) => (db.sessions[b].sid | 0) - (db.sessions[a].sid | 0));
    for (const h of tombs.slice(MAX_TOMBS)) delete db.sessions[h];
    const sid = maxSid + 1; db.sessions[sha(token)] = { user, exp: now + SESSION_MS, sid, rep: 0 };
    const wasOnline = !!activePlayers[user] && now - activePlayers[user].lastSeen < 15000;
    if (hadLive) {
        sec.slog('session_replaced', user, ip, 'sid ' + (sid - 1) + ' -> ' + sid + (wasOnline ? ' (estava online)' : ''));
        delete activePlayers[user];                                  // some do mapa na hora (sem fantasma duplicado)
        try { social.dropUser(user, 'outro login na conta'); } catch (e) { console.error('[sessão]', e); }   // cancela trocas pendentes (o depósito volta para quem tinha)
        const set = wsByUser[user]; if (set) for (const c of [...set]) { try { c.send(JSON.stringify({ t: 'replaced' })); c.close(1008); } catch (e) { } }
        delete wsByUser[user];
    }
    markDirty(); if (hadLive) flushDB();   // o último save válido da sessão antiga já está em db.users: grava antes de seguir
    return { token, sid, replaced: hadLive && wasOnline };
}
const REPLACED_MSG = 'Sua conta foi conectada em outro lugar. Você foi desconectado.';
function auth(req, res, next) {
    const h = req.headers.authorization || ''; const t = h.startsWith('Bearer ') ? h.slice(7, 200) : '';
    const key = t ? sha(t) : ''; const s = key && hasOwn(db.sessions, key) ? db.sessions[key] : null;
    if (s && s.rep) return res.status(401).json({ error: REPLACED_MSG, code: 'session_replaced' });
    if (!s || s.exp < Date.now() || !hasOwn(db.users, s.user)) {
        if (s) { delete db.sessions[key]; markDirty(); }
        return res.status(401).json({ error: 'Sessão expirada. Entre novamente.', code: 'AUTH' });
    }
    if (s.exp - Date.now() < SESSION_MS - 3600000) { s.exp = Date.now() + SESSION_MS; markDirty(); }   // renova (no máximo 1 gravação por hora)
    req.user = s.user; req.role = db.users[s.user].role; req.tokenKey = key; req.sess = s; next();
}
function adminOnly(req, res, next) {
    if (req.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores.' });
    next();
}

/* ---------------- LIMITES (anti-abuso) ---------------- */
const hits = new Map();
const failedLogins = new Map();      // ip|usuário -> {n, until}
const userFails = new Map();         // usuário -> {n, t}   (só gera ATRASO: nunca bloqueia a conta de outra pessoa)
const ipFails = new Map();           // ip -> {n, t, until}
const regByIp = new Map();           // ip -> [timestamps]
const REG_PER_IP_HOUR = process.env.REG_PER_IP_HOUR != null ? Math.max(0, +process.env.REG_PER_IP_HOUR) : 5;   // 0 = sem limite
function rateLimit(name, max, windowMs) {
    return (req, res, next) => {
        const key = name + '|' + req.ip; const now = Date.now();
        let e = hits.get(key); if (!e || e.reset < now) { e = { n: 0, reset: now + windowMs }; hits.set(key, e); }
        if (++e.n > max) { sec.slog('RATE:' + name, req.user || '-', SEC_IP(req), 'excedeu ' + max + '/' + windowMs + 'ms'); return res.status(429).json({ error: 'Muitas tentativas. Aguarde um pouco.' }); }
        next();
    };
}
/* limite por USUÁRIO (depois do login): token bucket simples */
const userHits = new Map();
function userLimit(name, max, windowMs) {
    return (req, res, next) => {
        const key = name + '|' + req.user; const now = Date.now();
        let e = userHits.get(key); if (!e || e.reset < now) { e = { n: 0, reset: now + windowMs }; userHits.set(key, e); }
        if (++e.n > max) { sec.slog('RATE:' + name, req.user, SEC_IP(req), 'excedeu ' + max + '/' + windowMs + 'ms'); return res.status(429).json({ error: 'Devagar! Muitas ações seguidas.', code: 'RATE' }); }
        next();
    };
}
let hashing = 0;   // scrypt simultâneos: evita que uma enxurrada de logins/registros trave o servidor
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
setInterval(() => { const now = Date.now(); for (const [k, e] of failedLogins) if (e.until < now) failedLogins.delete(k); for (const [k, e] of hits) if (e.reset < now) hits.delete(k); for (const [k, e] of userHits) if (e.reset < now) userHits.delete(k); for (const [k, e] of userFails) if (now - e.t > 600000) userFails.delete(k); for (const [k, e] of ipFails) if (now - e.t > 600000 && e.until < now) ipFails.delete(k); for (const [k, a] of regByIp) { const b = a.filter(t => now - t < 3600000); if (b.length) regByIp.set(k, b); else regByIp.delete(k); } for (const h of Object.keys(db.sessions)) if (db.sessions[h].exp < now) delete db.sessions[h]; }, 60000).unref();

/* ---------------- ESTADO EM TEMPO REAL ---------------- */
const activePlayers = Object.create(null);   // user -> {x,y,map,facing,actionAnim,equipment,lastSeen}
const serverMobs = Object.create(null);      // map -> id -> {hp,maxHp,aggro,isDead,deadTime}
const mobPos = Object.create(null);          // map -> id -> {x,y}  (enviado pelo host)
const hostByMap = Object.create(null);       // map -> username do host
const lastChat = Object.create(null);        // user -> timestamp
const social = createSocial({ db, activePlayers, markDirty });
const extras = createExtras({ db, activePlayers, markDirty });
const sq = createSQ({ getDB: () => db, extras, sec, markDirty, giftLog: (o) => giftLog(o) });   // missões especiais do admin (specialquests.js)
function chatFor(user) { return db.chat.filter(c => social.chatVisible(user, c)).map(c => { if (!c.party) return c; const { sender, msg, color } = c; return { sender, msg, color }; }); }

/* ---------- respawn autoritativo dos monstros e chefes ----------
   O servidor guarda o instante de cada morte (db.mobDeaths, persistido) e revive por relógio próprio: não depende de ter alguém no mapa, de ser o host nem de o admin estar online.
   MOB_RESPAWN_MS (padrão 15 s) vale para monstros comuns; BOSS_RESPAWN_MS (padrão = MOB_RESPAWN_MS) para chefes de área (npcDB group 'chefe').
   O chefe de mundo (id 424242) tem regra própria: volta a cada hora cheia (extras.bossHour). Mapas casa_ não participam. */
const MOB_RESPAWN_MS = Math.max(500, +process.env.MOB_RESPAWN_MS || 15000);
const BOSS_RESPAWN_MS = Math.max(500, +process.env.BOSS_RESPAWN_MS || MOB_RESPAWN_MS);
function mobEntity(map, id) { const m = db.worldData && hasOwn(db.worldData, map) ? db.worldData[map] : null; return m && Array.isArray(m.entities) ? m.entities.find(o => o && String(o.id) === String(id)) : null; }
function mobSpecies(map, id) { if (String(id) === '424242') return 'wboss_golem'; const e = mobEntity(map, id); return e && typeof e.dbKey === 'string' ? e.dbKey : ''; }
function mobIsBoss(map, id) { const k = mobSpecies(map, id); const d = k && db.npcDB && hasOwn(db.npcDB, k) ? db.npcDB[k] : null; return !!(d && d.group === 'chefe'); }
function respawnMs(map, id) { return mobIsBoss(map, id) ? BOSS_RESPAWN_MS : MOB_RESPAWN_MS; }
function respawnDue(map, id, deadTime, now) { return String(id) === '424242' ? extras.bossHour(now) !== extras.bossHour(deadTime) : now - deadTime >= respawnMs(map, id); }
function noteDeath(map, id, t) { if (/^casa_/.test(map)) return; if (!db.mobDeaths[map]) db.mobDeaths[map] = Object.create(null); db.mobDeaths[map][id] = t; markDirty(); }
function tickRespawns(now) {
    now = now || Date.now();
    for (const map of Object.keys(db.mobDeaths)) {
        const dm = db.mobDeaths[map]; let ch = false;
        for (const id of Object.keys(dm)) {
            if (!respawnDue(map, id, dm[id], now)) continue;
            delete dm[id]; ch = true; const sm = serverMobs[map] && serverMobs[map][id];
            if (sm) { sm.isDead = false; sm.hp = sm.maxHp; sm.aggro = null; }
        }
        if (ch) { if (!Object.keys(dm).length) delete db.mobDeaths[map]; markDirty(); }
    }
    for (const map of Object.keys(serverMobs)) {   // mortos "soltos" (sem registro persistente) também voltam
        for (const id of Object.keys(serverMobs[map])) { const sm = serverMobs[map][id]; if (sm.isDead && respawnDue(map, id, sm.deadTime, now)) { sm.isDead = false; sm.hp = sm.maxHp; sm.aggro = null; } }
        if (!mapsLive(map) && !Object.keys(serverMobs[map]).length) delete serverMobs[map];
    }
}
const mapsLive = (m) => Object.values(activePlayers).some(p => p.map === m);
function hydrateDeaths() {   // depois de um reinício: quem estava morto continua morto até a hora certa
    for (const map of Object.keys(db.mobDeaths)) {
        if (!serverMobs[map]) serverMobs[map] = Object.create(null);
        for (const id of Object.keys(db.mobDeaths[map])) if (!serverMobs[map][id]) { const mx = sec.expectedMaxHp(map, id) || 1; serverMobs[map][id] = { hp: 0, maxHp: mx, aggro: null, isDead: true, deadTime: db.mobDeaths[map][id] }; }
    }
}
setInterval(() => { try { tickRespawns(Date.now()); } catch (e) { console.error('[respawn]', e); } }, 1000).unref();

const num = (v, d = 0) => Number.isFinite(v) ? v : d;
const RESERVED = new Set(['__proto__', 'constructor', 'prototype', 'hasownproperty', 'tostring', 'valueof', 'sistema']);
const ID_RE = /^[A-Za-z0-9_\-]{1,30}$/;
const coord = (v, d) => Math.max(0, Math.min(20000, num(v, d)));
const dmgBudget = Object.create(null);   // user -> {t,d}
function cleanupPlayers() {
    const now = Date.now();
    for (const u of Object.keys(activePlayers)) if (now - activePlayers[u].lastSeen > 5000) delete activePlayers[u];
    const mapsInUse = new Set(Object.values(activePlayers).map(p => p.map));
    for (const m of Object.keys(hostByMap)) { const h = hostByMap[m]; if (!activePlayers[h] || activePlayers[h].map !== m) delete hostByMap[m]; }
    for (const m of Object.keys(serverMobs)) if (!mapsInUse.has(m)) {   // mapa vazio: só os mortos ficam guardados (o relógio de respawn continua); os feridos curam
        for (const id of Object.keys(serverMobs[m])) if (!serverMobs[m][id].isDead) delete serverMobs[m][id];
        if (!Object.keys(serverMobs[m]).length) delete serverMobs[m]; delete mobPos[m];
    }
}
setInterval(cleanupPlayers, 2000).unref();
function electHost(map) {
    const cur = hostByMap[map];
    if (cur && activePlayers[cur] && activePlayers[cur].map === map) return cur;
    const names = Object.keys(activePlayers).filter(u => activePlayers[u].map === map).sort();
    if (names.length) { hostByMap[map] = names[0]; return names[0]; }
    return null;
}

/* ---------------- ROTAS ---------------- */
app.get('/healthz', (req, res) => res.json({ ok: true, players: Object.keys(activePlayers).length }));

app.post('/api/register', rateLimit('reg', 10, 60000), async (req, res) => {
    const rb = req.body || {};
    const username = typeof rb.username === 'string' ? rb.username.trim() : '';
    const password = typeof rb.password === 'string' ? rb.password : '';
    const ip = SEC_IP(req);
    if (RESERVED.has(username.toLowerCase())) return res.status(400).json({ error: 'Nome não permitido.' });
    if (!NAME_RE.test(username)) return res.status(400).json({ error: 'Nome inválido (2 a 20 letras, números, espaço, _ . -).' });
    if (password.length > 100) return res.status(400).json({ error: 'A senha deve ter de 6 a 100 caracteres.' });
    const weak = sec.weakPassword(password, username); if (weak) return res.status(400).json({ error: weak });
    if (Object.keys(db.users).some(n => n.toLowerCase() === username.toLowerCase())) return res.status(400).json({ error: 'Usuário já existe!' });
    if (Object.keys(db.users).length >= 5000) return res.status(400).json({ error: 'Servidor cheio.' });
    if (REG_PER_IP_HOUR > 0) {
        const now = Date.now(), arr = (regByIp.get(ip) || []).filter(t => now - t < 3600000);
        if (arr.length >= REG_PER_IP_HOUR) { sec.slog('REG-LIMIT', username, ip, 'limite de contas por IP/hora atingido'); return res.status(429).json({ error: 'Muitas contas criadas deste endereço. Tente novamente mais tarde.' }); }
    }
    if (hashing >= 12) return res.status(429).json({ error: 'Servidor ocupado. Tente de novo em instantes.' });
    hashing++; let pwHash; try { pwHash = await hashPw(password); } finally { hashing--; }
    if (Object.keys(db.users).some(n => n.toLowerCase() === username.toLowerCase())) return res.status(400).json({ error: 'Usuário já existe!' });   // rechecagem: outro pedido pode ter criado o nome durante o hash
    db.users[username] = { password: pwHash, role: 'player', playerData: null };   // nunca cria admin por aqui
    if (REG_PER_IP_HOUR > 0) { const arr = regByIp.get(ip) || []; arr.push(Date.now()); regByIp.set(ip, arr); }
    markDirty(); flushDB(); res.json({ success: true });   // conta nova é gravada na hora
});

const userLocks = new Map();   // usuário -> fim da fila de logins em andamento
async function withUserLock(key, fn) {
    const prev = userLocks.get(key) || Promise.resolve(); let rel; const cur = new Promise(r => { rel = r; }); const tail = prev.then(() => cur); userLocks.set(key, tail);
    await prev;
    try { return await fn(); } finally { rel(); if (userLocks.get(key) === tail) userLocks.delete(key); }
}
app.post('/api/login', rateLimit('login', 20, 60000), async (req, res) => {
    const lb = req.body || {};
    const username = typeof lb.username === 'string' ? lb.username.trim().slice(0, 40) : '';
    const password = typeof lb.password === 'string' ? lb.password.slice(0, 200) : '';
    const ip = SEC_IP(req), now0 = Date.now(), lk = username.toLowerCase();
    const fk = req.ip + '|' + lk; const f = failedLogins.get(fk);
    if (f && f.until < now0) failedLogins.delete(fk);
    if (f && f.n >= 8 && f.until > now0) return res.status(429).json({ error: 'Muitas tentativas erradas. Tente em alguns minutos.' });
    const ipf = ipFails.get(req.ip); if (ipf && ipf.until > now0) return res.status(429).json({ error: 'Muitas tentativas erradas deste endereço. Tente em alguns minutos.' });
    /* atraso progressivo por usuário (qualquer IP): só atrasa, não bloqueia, então ninguém consegue trancar a conta de outra pessoa */
    const uf = userFails.get(lk); if (uf && now0 - uf.t < 600000 && uf.n > 3) await sleep(Math.min(3000, (uf.n - 3) * 250));
    /* SESSÃO ÚNICA: logins da mesma conta são atendidos um por vez (só o último vence e nunca existem dois tokens válidos) */
    return withUserLock(lk, async () => {
        // busca sem diferenciar maiúsculas/minúsculas (contas antigas continuam funcionando)
        const real = hasOwn(db.users, username) ? username : Object.keys(db.users).find(n => n.toLowerCase() === lk);
        const user = real ? db.users[real] : null;
        if (hashing >= 12) return res.status(429).json({ error: 'Servidor ocupado. Tente de novo em instantes.' });
        hashing++; let okPw = false;
        try { if (!user) await checkPw(password, DUMMY_HASH); okPw = !!user && await checkPw(password, user.password); } finally { hashing--; }   // sem usuário: gasta o mesmo tempo (não revela se existe)
        if (!okPw) {
            const e = failedLogins.get(fk) || { n: 0, until: 0 }; e.n++; e.until = Date.now() + 5 * 60000; failedLogins.set(fk, e);
            const u2 = userFails.get(lk) || { n: 0, t: 0 }; u2.n++; u2.t = Date.now(); userFails.set(lk, u2);
            const i2 = ipFails.get(req.ip) || { n: 0, t: 0, until: 0 }; i2.n = (Date.now() - i2.t > 600000 ? 0 : i2.n) + 1; i2.t = Date.now(); if (i2.n >= 30) { i2.until = Date.now() + 5 * 60000; i2.n = 0; sec.slog('BRUTEFORCE', lk, ip, '30 senhas erradas em 10 min: IP em espera por 5 min', true); } ipFails.set(req.ip, i2);
            if (u2.n === 5 || u2.n === 20 || u2.n % 100 === 0) sec.slog('LOGIN-FAIL', lk, ip, u2.n + ' falhas recentes para este usuário', true);
            return res.status(401).json({ error: 'Usuário ou senha incorretos!' });
        }
        failedLogins.delete(fk); userFails.delete(lk);
        if (!user.password.startsWith('scrypt$')) { user.password = await hashPw(password); markDirty(); }   // migra conta antiga (texto puro) para scrypt
        const ns = newSession(real, ip);
        res.json({
            success: true, token: ns.token, sid: ns.sid, replaced: ns.replaced, username: real, role: user.role, playerData: user.playerData,
            worldData: db.worldData, itemDB: db.itemDB, npcDB: db.npcDB, chat: chatFor(real), chatVer: db.chatVer, mapVersion: db.mapVersion
        });
    });
});

app.post('/api/logout', auth, (req, res) => { delete db.sessions[req.tokenKey]; delete activePlayers[req.user]; markDirty(); res.json({ success: true }); });

/* diário de pesca e bônus temporários: só estruturas pequenas e válidas (qualquer outra coisa é descartada) */
function cleanFishData(pd) {
    const num = (v, a, b) => (typeof v === 'number' && isFinite(v) && v >= a && v <= b) ? v : null;
    if (pd.fish !== undefined) {
        const out = {}; let n = 0;
        if (pd.fish && typeof pd.fish === 'object' && !Array.isArray(pd.fish)) for (const k of Object.keys(pd.fish)) {
            if (n >= 64) break; if (!/^[a-z_]{2,24}$/.test(k)) continue; const v = pd.fish[k]; if (!v || typeof v !== 'object') continue;
            const max = num(v.max, 0.1, 2000); if (max === null) continue; const kg = num(v.kg, 0, 2000), c = num(v.count, 1, 1e7);
            out[k] = { max: Math.round(max * 10) / 10, kg: kg === null ? 0 : Math.round(kg * 100) / 100, count: c === null ? 1 : Math.floor(c) }; n++;
        }
        pd.fish = out;
    }
    if (pd.buffs !== undefined) {
        const out = {}; let n = 0, now = Date.now();
        if (pd.buffs && typeof pd.buffs === 'object' && !Array.isArray(pd.buffs)) for (const k of Object.keys(pd.buffs)) {
            if (n >= 16) break; if (!/^[a-z]{2,10}$/.test(k)) continue; const b = pd.buffs[k]; if (!b || typeof b !== 'object') continue;
            const v = num(b.v, -100, 1000), u = num(b.until, 0, now + 86400000); if (v === null || u === null) continue; out[k] = { v, until: u }; n++;
        }
        pd.buffs = out;
    }
    if (pd.bait !== undefined && pd.bait !== null && (typeof pd.bait !== 'string' || pd.bait.length > 40)) pd.bait = null;
    if (pd.fishMode !== undefined && pd.fishMode !== 'net' && pd.fishMode !== 'rod') delete pd.fishMode;
}

/* energia de corrida (0 a 100): qualquer outra coisa vira 100 */
function cleanStatsData(pd) {
    if (pd.energy !== undefined) { const e = pd.energy; pd.energy = (typeof e === 'number' && isFinite(e)) ? Math.max(0, Math.min(100, Math.round(e * 10) / 10)) : 100; }
}

/* mundo salvo pelo admin: itens que os jogadores largaram/drops ficam de fora (temporários); itens fixos colocados no Dev ficam; marcas de "já pego" não persistem */
/* monstros vivem no mundo salvo SEMPRE vivos: quem está morto é decidido pelo servidor (db.mobDeaths). Um mundo salvo por um admin com monstros "mortos" (active:false) os deixava mortos para sempre. */
function healWorld(w) {
    if (!w || typeof w !== 'object') return w; let n = 0;
    for (const mk of Object.keys(w)) {
        const m = w[mk]; if (!m || typeof m !== 'object' || !Array.isArray(m.entities)) continue;
        for (const o of m.entities) if (o && typeof o === 'object' && o.type === 'enemy') {
            if (o.active === false) { o.active = true; n++; }
            const mx = Number.isFinite(o.maxHp) && o.maxHp > 0 ? o.maxHp : null; if (mx && !(o.hp >= mx)) o.hp = mx; if (o.aggroTarget) o.aggroTarget = null;
        }
    }
    if (n) console.log('[mundo] ' + n + ' monstro(s) salvo(s) como mortos foram revividos (o respawn agora é do servidor).');
    return w;
}
function cleanWorld(w) {
    healWorld(w);
    for (const mk of Object.keys(w)) {
        const m = w[mk]; if (!m || typeof m !== 'object' || !Array.isArray(m.entities)) continue;
        m.entities = m.entities.filter(o => {
            if (!o || typeof o !== 'object') return false;
            if (o.type === 'ground_item' && (o.np || o.owner || (!o.wi && !(o.life >= 50000)))) return false;   // temporários: largados por jogadores (np), drops de monstro (life 3000-18000)
            return true;
        });
        for (const o of m.entities) if (o.type === 'ground_item') { if (o.tk) { o.active = true; delete o.tk; } delete o.rt; }
    }
    return w;
}
const lastSaveAt = Object.create(null), saveBurst = Object.create(null);
app.post('/api/save', rateLimit('save', 90, 60000), (req, res) => {
    /* sessão única: o corpo grande é lido DEPOIS do auth; se outro login derrubou esta sessão nesse meio tempo, o save velho é descartado (nunca sobrescreve o da sessão nova) */
    if (db.sessions[req.tokenKey] !== req.sess || req.sess.rep) { sec.slog('SAVE-STALE', req.user, SEC_IP(req), 'save de sessão derrubada ignorado'); return res.status(401).json({ error: REPLACED_MSG, code: 'session_replaced' }); }
    const { playerData, worldData, itemDB, npcDB } = req.body || {};
    const u = db.users[req.user]; if (!u) return res.status(401).json({ error: 'Conta não encontrada.', code: 'AUTH' });
    const ip = SEC_IP(req), now = Date.now(), isAdmin = req.role === 'admin';
    if (playerData !== undefined) {
        if (!isAdmin) {
            const lu = sec.lockedUntil(req.user);
            if (lu) return res.status(423).json({ error: 'Salvamento suspenso por alguns minutos por atividade suspeita. Se isso for um engano, avise o administrador.', code: 'LOCKED', until: lu });
            const sb = saveBurst[req.user] || (saveBurst[req.user] = []); while (sb.length && now - sb[0] > 10000) sb.shift();   // no máximo 12 saves em 10 s (o jogo salva a cada 2,5 s no máximo, mais salvamentos manuais)
            if (sb.length >= 12) { sec.slog('RATE:save-burst', req.user, ip, '12 saves em 10s'); return res.status(429).json({ error: 'Devagar! Salvando rápido demais.', code: 'RATE' }); }
            sb.push(now);
        }
        let pdLen = 0; try { pdLen = (playerData && typeof playerData === 'object' && !Array.isArray(playerData)) ? JSON.stringify(playerData).length : -1; } catch (e) { pdLen = -1; }   // JSON profundo demais estoura a pilha: tratado como inválido
        if (pdLen < 0 || pdLen > 1500000) { sec.slog('SAVE-REJECT', req.user, ip, 'playerData inválido/grande (' + pdLen + ')', true); return res.status(400).json({ error: 'Dados do jogador inválidos.' }); }
        const r = sec.checkSave(req.user, req.role, playerData, ip);
        if (r.error) { sec.slog('SAVE-REJECT', req.user, ip, r.error, true); return res.status(400).json({ error: r.error }); }
        const pd = r.pd;
        cleanFishData(pd); cleanStatsData(pd); extras.cleanPetData(pd); require('./mimicnames').cleanMimicData(pd);
        sec.checkCollections(req.user, req.role, pd, u.playerData, ip);
        u.playerData = pd; lastSaveAt[req.user] = now;
        if (isAdmin && Array.isArray(req.body.itemNames)) sec.learnItems(req.body.itemNames);
    }
    if (isAdmin) {   // somente admin altera o mundo
        let changed = false;
        if (worldData && typeof worldData === 'object' && !Array.isArray(worldData)) {
            cleanWorld(worldData);
            const s = JSON.stringify(worldData);
            if (s !== worldStr) { db.worldData = worldData; worldStr = s; changed = true; }
        }
        if ((itemDB && typeof itemDB === 'object') || (npcDB && typeof npcDB === 'object')) {
            if (itemDB && typeof itemDB === 'object') { db.itemDB = itemDB; sec.learnItems(Object.keys(itemDB)); }
            if (npcDB && typeof npcDB === 'object') db.npcDB = npcDB;
            const s = JSON.stringify([db.itemDB, db.npcDB]); if (s !== dbStr) { dbStr = s; changed = true; }
        }
        if (changed) db.mapVersion = Math.max(Date.now(), db.mapVersion + 1);
    }
    markDirty(); res.json({ success: true, mapVersion: db.mapVersion });
});

/* aparência do personagem (look): só aceita campos conhecidos com valores válidos; qualquer coisa fora disso é descartada */
const LOOK_RACES = new Set(['human', 'elf', 'dwarf', 'orc']);
const LOOK_HEX = /^#[0-9a-fA-F]{6}$/;
function cleanLook(l) {
    if (!l || typeof l !== 'object' || Array.isArray(l)) return null;
    const sex = l.sex, race = l.race, hs = l.hairStyle;
    if (sex !== 'm' && sex !== 'f') return null;
    if (typeof race !== 'string' || !LOOK_RACES.has(race)) return null;
    if (typeof hs !== 'number' || !Number.isInteger(hs) || hs < 0 || hs > 7) return null;
    for (const k of ['hair', 'skin', 'shirt', 'pants']) if (typeof l[k] !== 'string' || !LOOK_HEX.test(l[k])) return null;
    return { sex, race, hairStyle: hs, hair: l.hair.toLowerCase(), skin: l.skin.toLowerCase(), shirt: l.shirt.toLowerCase(), pants: l.pants.toLowerCase(), beard: l.beard === 1 ? 1 : 0 };
}

function savedLook(user) { const u = hasOwn(db.users, user) ? db.users[user] : null; return u && u.playerData && typeof u.playerData === 'object' ? cleanLook(u.playerData.look) : null; }
/* casa_<dono>: só o dono, convidados e admin entram (o mesmo critério de /api/house) */
const houseKeyOf = (n) => 'casa_' + String(n).toLowerCase().replace(/[^\w\-]/g, '_').slice(0, 34);
function houseMapAllowed(user, map) {
    try {
        if (db.users[user] && db.users[user].role === 'admin') return true;
        const owner = Object.keys(db.users).find(n => houseKeyOf(n) === map); if (!owner) return false; if (owner === user) return true;
        const h = db.users[owner].playerData && db.users[owner].playerData.house; const me = user.toLowerCase();
        return !!(h && Array.isArray(h.guests) && h.guests.some(g => String(g).toLowerCase() === me));
    } catch (e) { return true; }
}
function doSync(user, b, ip) {
    b = b || {}; const now = Date.now(); ip = ip || '-';
    let map = (typeof b.map === 'string' && MAP_RE.test(b.map) && !RESERVED.has(b.map.toLowerCase())) ? b.map : 'lumbridge';
    if (!/^casa_/.test(map) && db.worldData && !hasOwn(db.worldData, map)) map = hasOwn(db.worldData, 'lumbridge') ? 'lumbridge' : map;
    if (/^casa_/.test(map) && sec.STRICT() && !houseMapAllowed(user, map)) { sec.slog('HOUSE-DENY', user, ip, 'sync em ' + map + ' sem convite'); map = 'lumbridge'; }
    const prev = activePlayers[user];
    const eq = (b.equipment !== undefined && b.equipment && typeof b.equipment === 'object' && JSON.stringify(b.equipment).length < 6000) ? sec.cleanSyncEquip(b.equipment) : (prev ? prev.equipment : null);
    try { if (eq) require('./mimicnames').syncVisual(eq, hasOwn(db.users, user) ? db.users[user].playerData : null); } catch (e) { }   // estágio/aparência dos Mímicos vistos pelos outros vêm do estado salvo
    const fc = (b.facing && typeof b.facing === 'object') ? { x: Math.max(-1, Math.min(1, num(b.facing.x) | 0)), y: Math.max(-1, Math.min(1, num(b.facing.y) | 0)) } : { x: 0, y: 1 };
    const role = hasOwn(db.users, user) ? db.users[user].role : 'player';
    let px = coord(b.x, 400), py = coord(b.y, 300);
    const sz = (!/^casa_/.test(map) && db.worldData && hasOwn(db.worldData, map) && db.worldData[map]) || (db.worldData && db.worldData.casa);   // limites do mapa (as casas usam o tamanho do mapa "casa")
    if (sz && Number.isFinite(sz.width) && Number.isFinite(sz.height)) { px = Math.min(px, sz.width + 40); py = Math.min(py, sz.height + 40); }
    const mv = sec.checkMove(user, role, prev, map, px, py, now, ip); px = mv.x; py = mv.y;
    activePlayers[user] = { x: px, y: py, map, facing: fc, actionAnim: Math.max(0, Math.min(60, num(b.actionAnim) | 0)), equipment: eq, hp: Math.max(0, Math.min(99999, num(b.hp) | 0)), maxHp: Math.max(0, Math.min(99999, num(b.maxHp) | 0)), lastSeen: now,
        title: typeof b.title === 'string' ? extras.cleanTitle(b.title) : (prev ? prev.title : ''), emote: prev ? prev.emote : null,
        look: (b.look !== undefined && cleanLook(b.look)) || (prev ? prev.look : null) || savedLook(user),
        pet: b.pet !== undefined ? extras.cleanPetSync(b.pet) : (prev ? prev.pet : null), mount: b.mount !== undefined ? extras.cleanMountId(b.mount) : (prev ? prev.mount : null), ms: b.ms !== undefined ? extras.cleanMountStage(b.ms) : (prev ? prev.ms : 0) };
    if (typeof b.emote === 'string' && /^[a-z]{2,10}$/.test(b.emote) && (!prev || !prev.emote || now - prev.emote.t > 1500)) activePlayers[user].emote = { k: b.emote, t: now };
    try { if (!/^casa_/.test(map)) sq.onVisit(user, map); } catch (e) { }
    const host = electHost(map); const isHost = host === user;

    if (!serverMobs[map]) serverMobs[map] = Object.create(null);
    if (Array.isArray(b.combatLogs)) {
        const cap = sec.hitCap(user);
        for (const log of b.combatLogs.slice(0, 20)) {
            if (!log || (typeof log.id !== 'number' && typeof log.id !== 'string')) continue;
            const id = String(log.id); if (!ID_RE.test(id) || RESERVED.has(id.toLowerCase())) continue;
            const rawDmg = num(log.dmg); let dmg = Math.max(0, Math.min(500, rawDmg)); let maxHp = Math.max(1, Math.min(100000, num(log.maxHp, 10)));
            if (sec.STRICT() && role !== 'admin') {
                if (dmg > cap) { sec.strike(user, ip, 'dmg', 1, 'golpe ' + Math.round(rawDmg) + ' acima do teto ' + cap + ' (mob ' + id + ' em ' + map + ')'); dmg = cap; }
                if (dmg > 0 && !sec.dmgOk(user, now)) { sec.slog('RATE:dmg', user, ip, 'mais de 20 relatórios de dano por segundo'); continue; }
                const ex = sec.expectedMaxHp(map, id); if (ex > 0) maxHp = ex;   // a vida máxima vem do catálogo do servidor, não do cliente
            }
            if (dmg > 0) { const bd = dmgBudget[user] || (dmgBudget[user] = { t: now, d: 0 }); if (now - bd.t > 1000) { bd.t = now; bd.d = 0; } bd.d += dmg; if (bd.d > 1500) continue; }   // teto de dano por segundo
            let sm = serverMobs[map][id];
            if (!sm) {
                if (Object.keys(serverMobs[map]).length >= 400) continue;
                if (mobPos[map] && !mobPos[map][id]) continue;   // só existem monstros que o host do mapa reportou
                sm = { hp: maxHp, maxHp, aggro: null, isDead: false, deadTime: 0 }; serverMobs[map][id] = sm;
            }
            if (!sm.isDead) {
                if (dmg === 0 && sm.aggro && sm.aggro !== user && activePlayers[sm.aggro] && activePlayers[sm.aggro].map === map) continue;   // "vi você" (dano 0) não rouba o alvo de outro jogador
                sm.hp -= dmg; sm.aggro = user;   // o monstro foca em quem bateu por último
                if (sm.hp <= 0) { sm.hp = 0; sm.isDead = true; sm.deadTime = now; sm.aggro = null; noteDeath(map, id, now); try { sq.onKill(user, mobSpecies(map, id), map, id); } catch (e) { } }
            }
        }
    }
    tickRespawns(now);   // o relógio global também roda aqui (não custa nada); o respawn não depende de quem está no mapa
    for (const id of Object.keys(serverMobs[map])) {
        const sm = serverMobs[map][id];
        if (sm.aggro && (!activePlayers[sm.aggro] || activePlayers[sm.aggro].map !== map)) sm.aggro = null;
    }
    if (isHost && b.mobPos && typeof b.mobPos === 'object') {
        const mp = Object.create(null); let n = 0;
        for (const id of Object.keys(b.mobPos)) { if (++n > 400) break; if (!ID_RE.test(id) || RESERVED.has(id.toLowerCase())) continue; const p = b.mobPos[id]; if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) mp[id] = { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }; }
        mobPos[map] = mp;
    }
    if (mobPos[map]) {   // "leash": o monstro desiste se o alvo ficou muito longe
        for (const id of Object.keys(serverMobs[map])) {
            const sm = serverMobs[map][id], mp0 = mobPos[map][id], ap = sm.aggro && activePlayers[sm.aggro];
            if (sm.aggro && mp0 && ap && Math.hypot(mp0.x - ap.x, mp0.y - ap.y) > 450) sm.aggro = null;
        }
    }

    const players = {};
    for (const u of Object.keys(activePlayers)) if (u !== user && activePlayers[u].map === map) players[u] = activePlayers[u];
    const out = { t: now, boss: extras.bossInfo(), players, mapVersion: db.mapVersion, serverMobs: serverMobs[map], isHost, chatVer: db.chatVer, social: social.view(user) };
    if (b.chatVer !== db.chatVer) out.chat = chatFor(user);
    if (!isHost && mobPos[map]) out.mobPos = mobPos[map];
    return out;
}
/* sync: no máximo ~25/s por jogador (o jogo manda 10/s) e 150/s por IP (várias pessoas na mesma rede); acima disso o pedido é ignorado e o cliente tenta de novo */
const syncBucket = Object.create(null), syncIp = Object.create(null);
function syncAllowed(user, ip) {
    const now = Date.now(); let u = syncBucket[user]; if (!u || now - u.t > 1000) u = syncBucket[user] = { t: now, n: 0 }; u.n++;
    let i = syncIp[ip]; if (!i || now - i.t > 1000) i = syncIp[ip] = { t: now, n: 0 }; i.n++;
    if (u.n > 25 || i.n > 150) { sec.slog('RATE:sync', user, ip, (u.n > 25 ? 'usuário ' + u.n : 'ip ' + i.n) + ' syncs/s'); return false; }
    return true;
}
setInterval(() => { const n = Date.now(); for (const k of Object.keys(syncBucket)) if (n - syncBucket[k].t > 5000) delete syncBucket[k]; for (const k of Object.keys(syncIp)) if (n - syncIp[k].t > 5000) delete syncIp[k]; for (const k of Object.keys(lastSaveAt)) if (n - lastSaveAt[k] > 3600000) { delete lastSaveAt[k]; delete saveBurst[k]; } }, 60000).unref();
app.post('/api/sync', auth, (req, res) => { if (!syncAllowed(req.user, SEC_IP(req))) return res.status(429).json({ error: 'rate', code: 'RATE' }); res.json(doSync(req.user, req.body, SEC_IP(req))); });
app.post('/api/social', auth, userLimit('social', 120, 60000), (req, res) => { const r = social.act(req.user, req.body); res.json(Object.assign({}, r, { social: social.view(req.user) })); });

app.post('/api/house', auth, userLimit('house', 60, 60000), (req, res) => { res.json(extras.house(req.user, req.body)); });
app.post('/api/market', auth, userLimit('market', 90, 60000), (req, res) => { res.json(extras.market(req.user, req.body)); });
app.post('/api/rank', auth, userLimit('rank', 30, 60000), (req, res) => { res.json(extras.ranking(req.user, req.body || {})); });

app.get('/api/map', auth, userLimit('map', 30, 60000), (req, res) => res.json({ worldData: db.worldData, itemDB: db.itemDB, npcDB: db.npcDB, mapVersion: db.mapVersion }));

app.post('/api/chat', auth, (req, res) => {
    const cb = req.body || {};
    let msg = typeof cb.msg === 'string' ? cb.msg.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').trim().slice(0, 200) : '';
    const now = Date.now();
    if (msg) { const why = sec.chatCheck(req.user, msg, now); if (why) { sec.slog('CHAT-BLOCK', req.user, SEC_IP(req), why + ' | ' + msg.slice(0, 40)); return res.status(429).json({ error: why, chat: chatFor(req.user), chatVer: db.chatVer }); } }
    if (msg) {
        lastChat[req.user] = now;
        const role = req.role;
        const color = role === 'admin' ? '#e74c3c' : role === 'vip_full' ? '#f1c40f' : role === 'vip_light' ? '#3498db' : '#ecf0f1';
        const prefix = role === 'admin' ? '[ADM] ' : role.startsWith('vip') ? '[VIP] ' : '';
        const pid = cb.party ? social.partyOf(req.user) : null;
        if (cb.party && !pid) return res.json({ error: 'Você não está em um grupo.', chat: chatFor(req.user), chatVer: db.chatVer });
        db.chat.push(pid ? { sender: '[Grupo] ' + req.user, msg, color: '#7bd67b', party: pid } : { sender: prefix + req.user, msg, color }); if (db.chat.length > 50) db.chat.shift();
        db.chatVer++; markDirty();
    }
    res.json({ chat: chatFor(req.user), chatVer: db.chatVer });
});


/* ---------------- WEBSOCKET (opcional; o cliente cai para HTTP se falhar) ---------------- */
const wsByIp = Object.create(null);
function onWsConnect(conn, req) {
    let ip = req && req.socket ? String(req.socket.remoteAddress || '').replace(/^::ffff:/, '') : '-';
    if (req && req.headers && req.headers['x-forwarded-for']) { const parts = String(req.headers['x-forwarded-for']).split(',').map(x => x.trim()).filter(Boolean); if (parts.length) ip = parts[parts.length - 1].replace(/^::ffff:/, ''); }   // confia só no último salto (nosso proxy)
    conn.ip = ip; wsByIp[ip] = (wsByIp[ip] || 0) + 1; conn.on('close', () => { if (--wsByIp[ip] <= 0) delete wsByIp[ip]; });
    if (wsByIp[ip] > 20) { sec.slog('RATE:ws-conns', '-', ip, 'mais de 20 conexões WebSocket do mesmo IP'); return conn.close(1008); }
    let user = null, key = '', n = 0, win = Date.now();
    const kill = setTimeout(() => { if (!user) conn.close(1008); }, 5000); kill.unref();
    conn.on('close', () => clearTimeout(kill));
    conn.on('message', (txt) => {
        let m; try { m = JSON.parse(txt); } catch (e) { return conn.close(1003); }
        if (!m || typeof m !== 'object') return;
        const t0 = Date.now(); if (t0 - win > 1000) { win = t0; n = 0; } if (++n > 40) return;   // no máximo 40 mensagens por segundo
        if (!user) {
            if (m.t !== 'auth' || typeof m.token !== 'string') return conn.close(1008);
            key = sha(m.token); const s = db.sessions[key];
            if (s && s.rep) { conn.send(JSON.stringify({ t: 'auth', ok: false, code: 'session_replaced' })); return conn.close(1008); }
            if (!s || s.exp < Date.now() || !hasOwn(db.users, s.user)) { conn.send(JSON.stringify({ t: 'auth', ok: false })); return conn.close(1008); }
            user = s.user; (wsByUser[user] || (wsByUser[user] = new Set())).add(conn); conn.on('close', () => { const set = wsByUser[user]; if (set) { set.delete(conn); if (!set.size) delete wsByUser[user]; } });
            return void conn.send(JSON.stringify({ t: 'auth', ok: true }));
        }
        const s = db.sessions[key]; if (!s || s.exp < Date.now() || s.rep) { conn.send(JSON.stringify(s && s.rep ? { t: 'replaced' } : { t: 'auth', ok: false })); return conn.close(1008); }
        if (m.t === 'sync') { if (!syncAllowed(user, conn.ip || '-')) return void conn.send(JSON.stringify({ t: 'sync', i: m.i, d: { error: 'rate', code: 'RATE' } })); conn.send(JSON.stringify({ t: 'sync', i: m.i, d: doSync(user, m.d, conn.ip) })); }
        else if (m.t === 'social') { const r = social.act(user, m.d); conn.send(JSON.stringify({ t: 'social', i: m.i, d: Object.assign({}, r, { social: social.view(user) }) })); }
    });
}

/* ---------- administração ---------- */
/* presentes do admin (todas as rotas /api/admin/* exigem sessão admin verificada no servidor) */
const GIFT_LOG = path.join(DATA_DIR, 'admin-gifts.log');
function giftLog(obj) { try { fs.mkdirSync(DATA_DIR, { recursive: true }); try { if (fs.statSync(GIFT_LOG).size > 2 * 1024 * 1024) fs.renameSync(GIFT_LOG, GIFT_LOG + '.1'); } catch (e) { } fs.appendFileSync(GIFT_LOG, JSON.stringify(obj) + '\n'); } catch (e) { } }
app.post('/api/admin/give', auth, adminOnly, userLimit('give', 60, 60000), (req, res) => {
    const b = req.body || {}; const to = extras.findUser(b.to);
    if (!to) return res.status(404).json({ error: 'Jogador não encontrado.' });
    const item = typeof b.item === 'string' ? b.item.trim() : ''; const qty = b.qty;
    if (!sec.knownItem(item)) return res.status(400).json({ error: 'Item desconhecido.' });
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > 2147483647) return res.status(400).json({ error: 'Quantidade inválida (1 a 2.147.483.647).' });
    const msg = typeof b.msg === 'string' ? b.msg.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) : '';
    const id = extras.giveMail(to, item, qty, msg);
    if (!id) return res.status(400).json({ error: 'O correio de ' + to + ' está cheio (peça para ele esvaziar).' });
    const rec = { t: new Date().toISOString(), admin: req.user, to, item, qty, msg, id, ip: SEC_IP(req) };
    giftLog(rec); sec.slog('ADMIN-GIVE', req.user, SEC_IP(req), to + ' <- ' + qty + 'x ' + item + ' (' + id + ')', true);
    res.json({ success: true, id, to, online: !!activePlayers[to] && Date.now() - activePlayers[to].lastSeen < 6000 });
});
app.get('/api/admin/gifts', auth, adminOnly, userLimit('gifts', 30, 60000), (req, res) => {
    let rows = []; try { rows = fs.readFileSync(GIFT_LOG, 'utf8').trim().split('\n').slice(-40).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean).reverse(); } catch (e) { }
    res.json({ gifts: rows });
});
app.get('/api/admin/search', auth, adminOnly, userLimit('search', 120, 60000), (req, res) => {
    const q = String(req.query.q || '').toLowerCase().slice(0, 30); const now = Date.now();
    const list = Object.keys(db.users).filter(n => !q || n.toLowerCase().includes(q)).sort().slice(0, 30).map(n => ({ name: n, role: db.users[n].role, online: !!activePlayers[n] && now - activePlayers[n].lastSeen < 6000 }));
    res.json({ users: list });
});

/* missões especiais: jogadores listam e resgatam; só o admin cria/edita (specialquests.js) */
app.get('/api/specialquest/list', auth, userLimit('sqlist', 60, 60000), (req, res) => res.json({ ok: true, quests: sq.list(req.user) }));
app.post('/api/specialquest/claim', auth, userLimit('sqclaim', 20, 60000), (req, res) => res.json(sq.claim(req.user, req.body, SEC_IP(req))));
app.get('/api/admin/specialquest', auth, adminOnly, userLimit('sqadm', 60, 60000), (req, res) => res.json({ ok: true, quests: sq.adminList(req.user) }));
app.post('/api/admin/specialquest', auth, adminOnly, userLimit('sqadm', 60, 60000), (req, res) => res.json(sq.adminAct(req.user, req.body, SEC_IP(req))));

app.get('/api/users', auth, adminOnly, (req, res) => {
    const users = {}; for (const u of Object.keys(db.users)) users[u] = { role: db.users[u].role };
    res.json({ users, activePlayers: Object.keys(activePlayers) });
});

app.post('/api/users/role', auth, adminOnly, (req, res) => {
    const { targetUser, newRole } = req.body || {};
    if (typeof targetUser !== 'string' || !hasOwn(db.users, targetUser)) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (!ROLES.includes(newRole)) return res.status(400).json({ error: 'Cargo inválido.' });
    const admins = Object.keys(db.users).filter(n => db.users[n].role === 'admin');
    if (db.users[targetUser].role === 'admin' && newRole !== 'admin' && admins.length <= 1) return res.status(400).json({ error: 'Precisa existir ao menos 1 admin.' });
    db.users[targetUser].role = newRole; markDirty(); sec.slog('ADMIN-ROLE', req.user, SEC_IP(req), targetUser + ' -> ' + newRole, true); res.json({ success: true });
});

app.get('/api/backup', auth, adminOnly, (req, res) => {
    sec.slog('ADMIN-BACKUP', req.user, SEC_IP(req), 'download do banco', true);
    const copy = { ...db }; delete copy.sessions; res.json(copy);
});

app.post('/api/restore', auth, adminOnly, (req, res) => {
    const { dbData } = req.body || {};
    if (!dbData || typeof dbData !== 'object' || !dbData.users) return res.status(400).json({ error: 'Backup inválido.' });
    try { const dir = path.join(DATA_DIR, 'backups'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'antes-do-restore-' + Date.now() + '.json'), JSON.stringify(db), 'utf8'); } catch (e) { console.error('[DB] snapshot pré-restore falhou:', e.message); }
    sec.slog('ADMIN-RESTORE', req.user, SEC_IP(req), 'restauração de backup', true);
    const restored = normalizeDB(dbData); restored.sessions = db.sessions;
    if (!hasOwn(restored.users, req.user)) restored.users[req.user] = db.users[req.user];   // quem restaura não perde o acesso
    restored.users[req.user].role = 'admin';
    db = restored; social.rebind(db); extras.rebind(db); for (const m of Object.keys(serverMobs)) delete serverMobs[m]; hydrateDeaths(); worldStr = db.worldData ? JSON.stringify(db.worldData) : ''; dbStr = JSON.stringify([db.itemDB, db.npcDB]);
    db.mapVersion = Math.max(Date.now(), db.mapVersion + 1); db.chatVer++; markDirty(); flushDB();
    res.json({ success: true, mapVersion: db.mapVersion });
});

/* ---------- erros ---------- */
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
    if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Dados grandes demais.' });
    if (err instanceof URIError || (err && (err.status === 400 || err.statusCode === 400)) || (err instanceof RangeError)) return res.status(400).json({ error: 'Pedido inválido.' });
    if (err && err.status === 404) return res.status(404).end();
    console.error('[erro]', err); res.status(500).json({ error: 'Erro interno.' });
});

const PORT = process.env.PORT || 3000;
hydrateDeaths();
ensureAdmin().then(() => {
    const srv = app.listen(PORT, () => console.log(`MiniScape rodando na porta ${PORT} (dados em ${sql ? path.join(DATA_DIR, "database.sqlite") : DB_FILE})`));
    if (srv && typeof srv.on === 'function') wsServer.attach(srv, { path: '/ws', onConnect: onWsConnect });
});
