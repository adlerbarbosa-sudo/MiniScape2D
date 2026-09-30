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
const cors = require('cors');
const createSocial = require('./social');
const createExtras = require('./extras');
const wsServer = require('./wsserver');

const scrypt = util.promisify(crypto.scrypt);
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cors());
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src * data: blob:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    next();
});
/* limites de corpo: rotas leves aceitam pouco; save exige login antes de ler corpo grande; restauração só admin */
app.use(['/api/sync', '/api/chat', '/api/house', '/api/market', '/api/rank', '/api/login', '/api/register', '/api/logout'], express.json({ limit: '64kb' }));
app.use('/api/save', (req, res, next) => auth(req, res, next), express.json({ limit: '8mb' }));
app.use('/api/restore', (req, res, next) => auth(req, res, () => adminOnly(req, res, next)), express.json({ limit: '30mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'ignore' }));

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
        mapVersion: Date.now(), sessions: Object.create(null)
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
    if (d.itemDB && typeof d.itemDB === 'object') out.itemDB = d.itemDB;
    if (d.npcDB && typeof d.npcDB === 'object') out.npcDB = d.npcDB;
    if (Array.isArray(d.chat)) out.chat = d.chat.slice(-50).filter(c => c && typeof c.msg === 'string').map(c => ({ sender: String(c.sender || '?').slice(0, 40), msg: c.msg.slice(0, 200), color: /^#[0-9a-f]{3,8}$/i.test(c.color) ? c.color : '#ecf0f1' }));
    out.trades = Object.create(null);
    if (d.trades && typeof d.trades === 'object') for (const id of Object.keys(d.trades)) { const t = d.trades[id]; if (t && typeof t === 'object' && typeof t.a === 'string' && typeof t.b === 'string' && t.offer && t.ok && t.applied) out.trades[id] = t; }
    if (d.market && typeof d.market === 'object') out.market = d.market;
    if (Number.isFinite(d.mapVersion)) out.mapVersion = d.mapVersion;
    if (d.sessions && typeof d.sessions === 'object') {
        for (const h of Object.keys(d.sessions)) { const s = d.sessions[h]; if (s && typeof s.user === 'string' && s.exp > Date.now()) out.sessions[h] = { user: s.user, exp: s.exp }; }
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
const SESSION_MS = 24 * 3600 * 1000;
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
function newSession(user) {
    const token = crypto.randomBytes(24).toString('hex');
    db.sessions[sha(token)] = { user, exp: Date.now() + SESSION_MS }; markDirty(); return token;
}
function auth(req, res, next) {
    const h = req.headers.authorization || ''; const t = h.startsWith('Bearer ') ? h.slice(7) : '';
    const key = t ? sha(t) : ''; const s = key && db.sessions[key];
    if (!s || s.exp < Date.now() || !hasOwn(db.users, s.user)) {
        if (s) { delete db.sessions[key]; markDirty(); }
        return res.status(401).json({ error: 'Sessão expirada. Entre novamente.', code: 'AUTH' });
    }
    req.user = s.user; req.role = db.users[s.user].role; req.tokenKey = key; next();
}
function adminOnly(req, res, next) {
    if (req.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores.' });
    next();
}

/* ---------------- LIMITES (anti-abuso simples) ---------------- */
const hits = new Map();
const failedLogins = new Map();
function rateLimit(name, max, windowMs) {
    return (req, res, next) => {
        const key = name + '|' + req.ip; const now = Date.now();
        let e = hits.get(key); if (!e || e.reset < now) { e = { n: 0, reset: now + windowMs }; hits.set(key, e); }
        if (++e.n > max) return res.status(429).json({ error: 'Muitas tentativas. Aguarde um pouco.' });
        next();
    };
}
setInterval(() => { const now = Date.now(); for (const [k, e] of failedLogins) if (e.until < now) failedLogins.delete(k); for (const [k, e] of hits) if (e.reset < now) hits.delete(k); for (const h of Object.keys(db.sessions)) if (db.sessions[h].exp < now) delete db.sessions[h]; }, 60000).unref();

/* ---------------- ESTADO EM TEMPO REAL ---------------- */
const activePlayers = Object.create(null);   // user -> {x,y,map,facing,actionAnim,equipment,lastSeen}
const serverMobs = Object.create(null);      // map -> id -> {hp,maxHp,aggro,isDead,deadTime}
const mobPos = Object.create(null);          // map -> id -> {x,y}  (enviado pelo host)
const hostByMap = Object.create(null);       // map -> username do host
const lastChat = Object.create(null);        // user -> timestamp
const social = createSocial({ db, activePlayers, markDirty });
const extras = createExtras({ db, activePlayers, markDirty });
function chatFor(user) { return db.chat.filter(c => social.chatVisible(user, c)).map(c => { if (!c.party) return c; const { sender, msg, color } = c; return { sender, msg, color }; }); }

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
    for (const m of Object.keys(serverMobs)) if (!mapsInUse.has(m)) { delete serverMobs[m]; delete mobPos[m]; }
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
    if (RESERVED.has(username.toLowerCase())) return res.status(400).json({ error: 'Nome não permitido.' });
    if (!NAME_RE.test(username)) return res.status(400).json({ error: 'Nome inválido (2 a 20 letras, números, espaço, _ . -).' });
    if (password.length < 4 || password.length > 100) return res.status(400).json({ error: 'A senha deve ter de 4 a 100 caracteres.' });
    if (Object.keys(db.users).some(n => n.toLowerCase() === username.toLowerCase())) return res.status(400).json({ error: 'Usuário já existe!' });
    if (Object.keys(db.users).length >= 5000) return res.status(400).json({ error: 'Servidor cheio.' });
    const pwHash = await hashPw(password);
    if (Object.keys(db.users).some(n => n.toLowerCase() === username.toLowerCase())) return res.status(400).json({ error: 'Usuário já existe!' });   // rechecagem: outro pedido pode ter criado o nome durante o hash
    db.users[username] = { password: pwHash, role: 'player', playerData: null };   // nunca cria admin por aqui
    markDirty(); flushDB(); res.json({ success: true });   // conta nova é gravada na hora
});

app.post('/api/login', rateLimit('login', 20, 60000), async (req, res) => {
    const lb = req.body || {};
    const username = typeof lb.username === 'string' ? lb.username.trim().slice(0, 40) : '';
    const password = typeof lb.password === 'string' ? lb.password.slice(0, 200) : '';
    const fk = req.ip + '|' + username.toLowerCase(); const f = failedLogins.get(fk);
    if (f && f.until < Date.now()) failedLogins.delete(fk);
    if (f && f.n >= 8 && f.until > Date.now()) return res.status(429).json({ error: 'Muitas tentativas erradas. Tente em alguns minutos.' });
    // busca sem diferenciar maiúsculas/minúsculas (contas antigas continuam funcionando)
    const real = hasOwn(db.users, username) ? username : Object.keys(db.users).find(n => n.toLowerCase() === username.toLowerCase());
    const user = real ? db.users[real] : null;
    if (!user) await checkPw(password, DUMMY_HASH);   // gasta o mesmo tempo: não revela se o usuário existe
    if (!user || !(await checkPw(password, user.password))) {
        const e = failedLogins.get(fk) || { n: 0, until: 0 }; e.n++; e.until = Date.now() + 5 * 60000; failedLogins.set(fk, e);
        return res.status(401).json({ error: 'Usuário ou senha incorretos!' });
    }
    failedLogins.delete(fk);
    if (!user.password.startsWith('scrypt$')) { user.password = await hashPw(password); markDirty(); }   // migra conta antiga
    const token = newSession(real);
    res.json({
        success: true, token, username: real, role: user.role, playerData: user.playerData,
        worldData: db.worldData, itemDB: db.itemDB, npcDB: db.npcDB, chat: chatFor(real), chatVer: db.chatVer, mapVersion: db.mapVersion
    });
});

app.post('/api/logout', auth, (req, res) => { delete db.sessions[req.tokenKey]; delete activePlayers[req.user]; markDirty(); res.json({ success: true }); });

app.post('/api/save', rateLimit('save', 90, 60000), (req, res) => {
    const { playerData, worldData, itemDB, npcDB } = req.body || {};
    const u = db.users[req.user]; if (!u) return res.status(401).json({ error: 'Conta não encontrada.', code: 'AUTH' });
    if (playerData !== undefined) {
        if (!playerData || typeof playerData !== 'object' || Array.isArray(playerData) || JSON.stringify(playerData).length > 1500000) return res.status(400).json({ error: 'Dados do jogador inválidos.' });
        u.playerData = playerData;
    }
    if (req.role === 'admin') {   // somente admin altera o mundo
        let changed = false;
        if (worldData && typeof worldData === 'object' && !Array.isArray(worldData)) {
            const s = JSON.stringify(worldData);
            if (s !== worldStr) { db.worldData = worldData; worldStr = s; changed = true; }
        }
        if ((itemDB && typeof itemDB === 'object') || (npcDB && typeof npcDB === 'object')) {
            if (itemDB && typeof itemDB === 'object') db.itemDB = itemDB;
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
function doSync(user, b) {
    b = b || {}; const now = Date.now();
    let map = (typeof b.map === 'string' && MAP_RE.test(b.map) && !RESERVED.has(b.map.toLowerCase())) ? b.map : 'lumbridge';
    if (!/^casa_/.test(map) && db.worldData && !hasOwn(db.worldData, map)) map = hasOwn(db.worldData, 'lumbridge') ? 'lumbridge' : map;
    const prev = activePlayers[user];
    const eq = (b.equipment && typeof b.equipment === 'object' && JSON.stringify(b.equipment).length < 6000) ? b.equipment : (prev ? prev.equipment : null);
    const fc = (b.facing && typeof b.facing === 'object') ? { x: num(b.facing.x) | 0, y: num(b.facing.y) | 0 } : { x: 0, y: 1 };
    activePlayers[user] = { x: coord(b.x, 400), y: coord(b.y, 300), map, facing: fc, actionAnim: num(b.actionAnim) | 0, equipment: eq, hp: Math.max(0, Math.min(99999, num(b.hp) | 0)), maxHp: Math.max(0, Math.min(99999, num(b.maxHp) | 0)), lastSeen: now,
        title: typeof b.title === 'string' ? extras.cleanTitle(b.title) : (prev ? prev.title : ''), emote: prev ? prev.emote : null,
        look: (b.look !== undefined && cleanLook(b.look)) || (prev ? prev.look : null) || savedLook(user) };
    if (typeof b.emote === 'string' && /^[a-z]{2,10}$/.test(b.emote) && (!prev || !prev.emote || now - prev.emote.t > 1500)) activePlayers[user].emote = { k: b.emote, t: now };
    const host = electHost(map); const isHost = host === user;

    if (!serverMobs[map]) serverMobs[map] = Object.create(null);
    if (Array.isArray(b.combatLogs)) {
        for (const log of b.combatLogs.slice(0, 20)) {
            if (!log || (typeof log.id !== 'number' && typeof log.id !== 'string')) continue;
            const id = String(log.id); if (!ID_RE.test(id) || RESERVED.has(id.toLowerCase())) continue;
            let dmg = Math.max(0, Math.min(500, num(log.dmg))); const maxHp = Math.max(1, Math.min(100000, num(log.maxHp, 10)));
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
                if (sm.hp <= 0) { sm.hp = 0; sm.isDead = true; sm.deadTime = now; sm.aggro = null; }
            }
        }
    }
    for (const id of Object.keys(serverMobs[map])) {   // respawn de 15s
        const sm = serverMobs[map][id];
        if (sm.isDead && (id === '424242' ? extras.bossHour(now) !== extras.bossHour(sm.deadTime) : now - sm.deadTime > 15000)) { sm.isDead = false; sm.hp = sm.maxHp; sm.aggro = null; }
        else if (sm.aggro && (!activePlayers[sm.aggro] || activePlayers[sm.aggro].map !== map)) sm.aggro = null;
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
app.post('/api/sync', auth, (req, res) => { res.json(doSync(req.user, req.body)); });
app.post('/api/social', rateLimit('social', 120, 60000), auth, (req, res) => { const r = social.act(req.user, req.body); res.json(Object.assign({}, r, { social: social.view(req.user) })); });

app.post('/api/house', rateLimit('house', 60, 60000), auth, (req, res) => { res.json(extras.house(req.user, req.body)); });
app.post('/api/market', rateLimit('market', 90, 60000), auth, (req, res) => { res.json(extras.market(req.user, req.body)); });
app.post('/api/rank', rateLimit('rank', 30, 60000), auth, (req, res) => { res.json(extras.ranking(req.user, req.body || {})); });

app.get('/api/map', auth, (req, res) => res.json({ worldData: db.worldData, itemDB: db.itemDB, npcDB: db.npcDB, mapVersion: db.mapVersion }));

app.post('/api/chat', auth, (req, res) => {
    const cb = req.body || {};
    let msg = typeof cb.msg === 'string' ? cb.msg.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').trim().slice(0, 200) : '';
    const now = Date.now();
    if (msg && now - (lastChat[req.user] || 0) < 800) return res.status(429).json({ error: 'Devagar!', chat: chatFor(req.user), chatVer: db.chatVer });
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
function onWsConnect(conn) {
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
            if (!s || s.exp < Date.now() || !hasOwn(db.users, s.user)) { conn.send(JSON.stringify({ t: 'auth', ok: false })); return conn.close(1008); }
            user = s.user; return void conn.send(JSON.stringify({ t: 'auth', ok: true }));
        }
        const s = db.sessions[key]; if (!s || s.exp < Date.now()) { conn.send(JSON.stringify({ t: 'auth', ok: false })); return conn.close(1008); }
        if (m.t === 'sync') { conn.send(JSON.stringify({ t: 'sync', i: m.i, d: doSync(user, m.d) })); }
        else if (m.t === 'social') { const r = social.act(user, m.d); conn.send(JSON.stringify({ t: 'social', i: m.i, d: Object.assign({}, r, { social: social.view(user) }) })); }
    });
}

/* ---------- administração ---------- */
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
    db.users[targetUser].role = newRole; markDirty(); res.json({ success: true });
});

app.get('/api/backup', auth, adminOnly, (req, res) => {
    const copy = { ...db }; delete copy.sessions; res.json(copy);
});

app.post('/api/restore', auth, adminOnly, (req, res) => {
    const { dbData } = req.body || {};
    if (!dbData || typeof dbData !== 'object' || !dbData.users) return res.status(400).json({ error: 'Backup inválido.' });
    try { const dir = path.join(DATA_DIR, 'backups'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'antes-do-restore-' + Date.now() + '.json'), JSON.stringify(db), 'utf8'); } catch (e) { console.error('[DB] snapshot pré-restore falhou:', e.message); }
    const restored = normalizeDB(dbData); restored.sessions = db.sessions;
    if (!hasOwn(restored.users, req.user)) restored.users[req.user] = db.users[req.user];   // quem restaura não perde o acesso
    restored.users[req.user].role = 'admin';
    db = restored; social.rebind(db); extras.rebind(db); worldStr = db.worldData ? JSON.stringify(db.worldData) : ''; dbStr = JSON.stringify([db.itemDB, db.npcDB]);
    db.mapVersion = Math.max(Date.now(), db.mapVersion + 1); db.chatVer++; markDirty(); flushDB();
    res.json({ success: true, mapVersion: db.mapVersion });
});

/* ---------- erros ---------- */
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
    if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Dados grandes demais.' });
    console.error('[erro]', err); res.status(500).json({ error: 'Erro interno.' });
});

const PORT = process.env.PORT || 3000;
ensureAdmin().then(() => {
    const srv = app.listen(PORT, () => console.log(`MiniScape rodando na porta ${PORT} (dados em ${sql ? path.join(DATA_DIR, "database.sqlite") : DB_FILE})`));
    if (srv && typeof srv.on === 'function') wsServer.attach(srv, { path: '/ws', onConnect: onWsConnect });
});
