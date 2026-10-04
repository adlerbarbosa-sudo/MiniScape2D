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
const BAL = require('./public/balance.js');        // balanceamento v2 (XP, vida, dano, monstros): mesma fonte do cliente
const SKILLNODES = require('./public/skillnodes.js');
const createSQ = require('./specialquests');
const createEngageSrv = require('./engagesrv');   // engajamento: recompensa diária, missões, Códice, maestria, eventos (engagesrv.js + public/engage.js)
const { cleanSQ } = createSQ;

const scrypt = util.promisify(crypto.scrypt);
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => { if (/%00|\0|%5c|\\|%2e%2e%2f|%2e%2e\//i.test(req.url)) return res.status(400).end('Não foi possível concluir. Tente de novo.'); next(); });   // bytes nulos e tentativas de sair da pasta
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
    if (!ok) return res.status(403).json({ error: 'Acesso não permitido.' });
    next();
});
/* limites de corpo por rota: leves aceitam pouco; save exige login antes de ler corpo grande; restauração só admin */
app.use(['/api/login', '/api/register'], express.json({ limit: '4kb' }));
app.use(['/api/chat', '/api/rank', '/api/logout'], express.json({ limit: '4kb' }));
app.use(['/api/house', '/api/market', '/api/social'], express.json({ limit: '16kb' }));
app.use('/api/sync', express.json({ limit: '64kb' }));
app.use('/api/save', (req, res, next) => auth(req, res, next), (req, res, next) => userLimit('save', 150, 60000)(req, res, next), express.json({ limit: '8mb' }));   // login e limite por usuário ANTES de ler o corpo grande
app.use('/api/restore', (req, res, next) => auth(req, res, () => adminOnly(req, res, next)), express.json({ limit: '30mb' }));
app.use(express.json({ limit: '64kb' }));
app.get('/balance.js', (req, res, next) => {   // XP_RATE (env) chega ao cliente: o mesmo valor vale no navegador e no servidor
    if (!(+process.env.XP_RATE > 0)) return next();
    try { const src = fs.readFileSync(path.join(__dirname, 'public', 'balance.js'), 'utf8'); res.type('application/javascript').set('Cache-Control', 'no-cache').send('self.MS_XP_RATE=' + (+process.env.XP_RATE) + ';\n' + src); } catch (e) { next(); }
});
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
        chat: [{ sender: 'Sistema', msg: 'O reino está aberto. Boa aventura!', color: '#2ecc71' }], chatVer: 1,
        mapVersion: Date.now(), sessions: Object.create(null),
        mobDeaths: Object.create(null), specialQuests: Object.create(null), specialClaims: Object.create(null), specialProg: Object.create(null), engage: createEngageSrv.cleanDB(null), toggles: { fenda: false, especiais: true }
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
    out.market = createExtras.cleanMarket(d.market);   // mercado/correio validados e sem protótipo (extras.js)
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
    out.toggles = { fenda: !!(d.toggles && d.toggles.fenda === true), especiais: !(d.toggles && d.toggles.especiais === false) };   // eventos ligados/desligados pelo admin (painel Dev > Eventos)
    out.engage = createEngageSrv.cleanDB(d.engage);   // estado de engajamento por conta (diária, missões, Códice, placar)
    if (out.worldData) healWorld(out.worldData);
    if (Number.isFinite(d.mapVersion)) out.mapVersion = d.mapVersion;
    if (d.sessions && typeof d.sessions === 'object') {
        for (const h of Object.keys(d.sessions)) { const s = d.sessions[h]; if (s && typeof s.user === 'string' && Number.isFinite(s.exp) && s.exp > Date.now() && /^[0-9a-f]{64}$/.test(h)) out.sessions[h] = { user: s.user, exp: s.exp, sid: Number.isFinite(s.sid) ? s.sid : 0, rep: s.rep ? 1 : 0 }; }
    }
    return out;
}
let recoveredFromBackup = false;   // true se o banco foi lido de uma cópia (o 1º flush não pode copiar o arquivo principal ruim por cima do .bak)
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
function backupCandidates() {   // do mais novo para o mais antigo: .tmp (se estiver completo), .bak, snapshots de hora em hora
    const c = [DB_FILE + '.tmp', DB_FILE + '.bak'];
    try { const dir = path.join(DATA_DIR, 'backups'); for (const f of fs.readdirSync(dir).filter(f => /^database-.*\.json$/.test(f)).sort().reverse()) c.push(path.join(dir, f)); } catch (e) { }
    return c;
}
function recoverFromCopies(why) {
    for (const f of backupCandidates()) {
        try { if (!fs.existsSync(f)) continue; const d = normalizeDB(readJson(f)); recoveredFromBackup = true; console.error('[DB] ' + why + ' -> restaurado de ' + f + ' (' + Object.keys(d.users).length + ' conta(s))'); return d; }
        catch (e) { console.error('[DB] ' + f + ' ilegível:', e.message); }
    }
    return null;
}
function loadJsonDB() {
    if (!fs.existsSync(DB_FILE)) {
        const r = recoverFromCopies('database.json ausente'); if (r) return r;
        if (!sql && fs.existsSync(path.join(DATA_DIR, 'database.sqlite'))) { console.error('[DB] existe database.sqlite em ' + DATA_DIR + ' mas STORAGE=sqlite não está definido: NÃO vou iniciar vazio. Defina STORAGE=sqlite (ou mova o arquivo se quiser mesmo recomeçar).'); process.exit(1); }
        return emptyDB();   // sem nenhuma cópia: instalação nova
    }
    try { return normalizeDB(readJson(DB_FILE)); }
    catch (e) {
        console.error('[DB] database.json ilegível:', e.message);
        try { const n = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('database.json.corrompido-')).length; if (n < 3) fs.copyFileSync(DB_FILE, DB_FILE + '.corrompido-' + Date.now()); } catch (_) { }   // guarda até 3 cópias do arquivo ruim (um loop de reinício não enche o disco)
        const r = recoverFromCopies('database.json corrompido'); if (r) return r;
        console.error('[DB] NÃO vou iniciar com banco vazio para não apagar suas contas. Restaure um arquivo da pasta backups/ ou corrija database.json.'); process.exit(1);
    }
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
let eng = null;   // engajamento (criado depois: precisa de extras/activePlayers)
const sec = createSecurity({ dataDir: DATA_DIR, root: __dirname, getDB: () => db, extraMob: (m, id) => (eng ? eng.extraMob(m, id) : null) });
const SEC_IP = (req) => String(req.ip || '').replace(/^::ffff:/, '');
let worldStr = db.worldData ? JSON.stringify(db.worldData) : '';
let dbStr = JSON.stringify([db.itemDB, db.npcDB]);

let dirty = false, flushTimer = null, lastSnap = 0, lastFlushMs = 0, lastBak = 0, flushErrs = 0;
let balMigrated = null;   // resultado da migração de balanceamento no início (aplicada depois que as funções de gravação existem)
/* O banco é regravado inteiro (JSON). Com milhares de contas isso custa CPU: o intervalo cresce com a duração da última gravação (8x), sem nunca passar de 30 s. STORAGE=sqlite só grava o que mudou. */
function markDirty() { dirty = true; if (!flushTimer) flushTimer = setTimeout(flushDB, Math.min(30000, Math.max(1500, lastFlushMs * 8))); }
/* operações que mexem em itens/moedas (mercado, troca, presente, missão, save com pendência) gravam NA HORA antes de responder: uma queda logo depois não faz o servidor "esquecer" algo que o cliente já viu.
   Se o banco for grande (gravação lenta), cai para um atraso curto (50 ms) para não travar o servidor. */
function persistNow() {
    dirty = true;
    if (lastFlushMs < 150) { flushDB(true); dirty = true; if (!flushTimer) flushTimer = setTimeout(flushDB, 1500); }   // grava já (sem fsync: sobrevive a kill -9) e confirma com fsync logo depois
    else { if (flushTimer) clearTimeout(flushTimer); flushTimer = setTimeout(flushDB, 50); }
}
/* ---------- balanceamento v2: migração única das contas, do catálogo de monstros e do mundo salvo (idempotente: playerData.balV, def.balV) ---------- */
function balanceMigrate() {
    const out = { accounts: 0, mobs: 0, ents: 0 };
    const treeBonus = (tree, lv) => { const r = SKILLNODES.clean(tree, lv, Date.now()), b = SKILLNODES.bonusAll(r.tree); return { hp: b.maxHp || 0, mp: b.maxMp || 0 }; };
    for (const name of Object.keys(db.users)) { const u = db.users[name]; if (u && u.playerData && typeof u.playerData === 'object' && !(u.playerData.balV >= BAL.VERSION)) { try { BAL.migratePlayer(u.playerData, { tree: treeBonus }); out.accounts++; } catch (e) { console.error('[balanceamento] conta ' + name + ':', e.message); } } }
    if (db.npcDB) out.mobs = BAL.applyNpcDB(db.npcDB);
    if (db.worldData) out.ents = BAL.applyWorld(db.worldData, db.npcDB || {});
    return out;
}
try { balMigrated = balanceMigrate(); if (balMigrated.accounts || balMigrated.mobs || balMigrated.ents) { console.log('[balanceamento] migrado: ' + balMigrated.accounts + ' conta(s), ' + balMigrated.mobs + ' monstro(s) do catálogo, ' + balMigrated.ents + ' criatura(s) do mundo.'); worldStr = db.worldData ? JSON.stringify(db.worldData) : ''; dbStr = JSON.stringify([db.itemDB, db.npcDB]); markDirty(); } } catch (e) { console.error('[balanceamento] falha na migração:', e); }

/* grava de forma atômica (arquivo temporário + fsync + rename + fsync da pasta) e mantém cópias: .bak (a cada gravação se o banco é pequeno; no máx. 1 por minuto se é grande) e snapshots de hora em hora (últimos 12) */
function flushDB(fast) {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (!dirty) return; dirty = false;
    const t0 = Date.now(); let syncMs = 0; const fsyncOk = fast !== true;   // fast: sem fsync (a pasta e o arquivo vão ao disco na próxima gravação normal)
    if (sql) {
        try {
            sql.save(db); flushErrs = 0;
            if (Date.now() - lastSnap > 3600000) { lastSnap = Date.now(); const dir = path.join(DATA_DIR, 'backups'); fs.mkdirSync(dir, { recursive: true }); sql.snapshot(path.join(dir, 'database-' + new Date().toISOString().replace(/[:.]/g, '-') + '.sqlite')); fs.readdirSync(dir).filter(f => f.startsWith('database-') && f.endsWith('.sqlite')).sort().slice(0, -12).forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch (_) { } }); }
        } catch (e) { flushErrs++; console.error('[DB] erro ao gravar (SQLite):', e.message); dirty = true; if (!flushTimer) flushTimer = setTimeout(flushDB, Math.min(60000, 2000 * flushErrs)); }
        lastFlushMs = Date.now() - t0; return;
    }
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        const tmp = DB_FILE + '.tmp', json = JSON.stringify(db);
        const fd = fs.openSync(tmp, 'w'); try { fs.writeSync(fd, json, 0, 'utf8'); if (fsyncOk) { const a = Date.now(); try { fs.fsyncSync(fd); } catch (_) { } syncMs += Date.now() - a; } } finally { fs.closeSync(fd); }
        if (!recoveredFromBackup && t0 - lastBak > (lastFlushMs < 100 ? 0 : 60000) && fs.existsSync(DB_FILE)) { try { fs.copyFileSync(DB_FILE, DB_FILE + '.bak'); lastBak = t0; } catch (_) { } }
        fs.renameSync(tmp, DB_FILE); recoveredFromBackup = false; flushErrs = 0;
        if (fsyncOk) { const a = Date.now(); try { const dfd = fs.openSync(DATA_DIR, 'r'); try { fs.fsyncSync(dfd); } finally { fs.closeSync(dfd); } } catch (_) { } syncMs += Date.now() - a; }   // grava a entrada do diretório (sobrevive a queda de energia logo após o rename)
        if (Date.now() - lastSnap > 3600000) {
            lastSnap = Date.now();
            const dir = path.join(DATA_DIR, 'backups'); fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, 'database-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'), json, 'utf8');
            fs.readdirSync(dir).filter(f => /^database-.*\.json$/.test(f)).sort().slice(0, -12).forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch (_) { } });
        }
    } catch (e) { flushErrs++; console.error('[DB] erro ao gravar:', e.message); dirty = true; if (!flushTimer) flushTimer = setTimeout(flushDB, Math.min(60000, 2000 * flushErrs)); }
    lastFlushMs = Math.max(0, Date.now() - t0 - syncMs);   // custo de CPU/E-S de gravar (o tempo de fsync não conta: espera de disco, não de processamento)
}
setInterval(() => { if (dirty) flushDB(); }, 10000).unref();
/* encerramento limpo: SIGTERM/SIGINT salvam tudo antes de sair (systemd usa SIGTERM no restart/stop) */
let shuttingDown = false, srv = null;
function shutdown(sig, code) {
    if (shuttingDown) return; shuttingDown = true;
    console.log('[' + sig + '] salvando e encerrando...');
    try { if (srv) srv.close(); } catch (e) { }
    try { dirty = true; flushDB(); } catch (e) { console.error('[DB] falha no salvamento final:', e.message); }
    try { if (sql && sql.close) sql.close(); } catch (e) { }
    process.exit(code || 0);
}
['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => shutdown(sig, 0)));
process.on('exit', () => { try { flushDB(); } catch (e) { } });
/* exceções não tratadas são registradas e o jogo continua (uma rota com defeito não derruba todo mundo); se virar enxurrada (30 em 1 min) ou faltar memória, salva e sai para o systemd reiniciar */
const crashTimes = [];
function fatalGuard(kind, e) {
    console.error('[' + kind + ']', (e && e.stack) || e);
    const now = Date.now(); crashTimes.push(now); while (crashTimes.length && now - crashTimes[0] > 60000) crashTimes.shift();
    if (crashTimes.length > 30 || (e && (e.code === 'ERR_OUT_OF_MEMORY' || /out of memory/i.test(String(e.message))))) { console.error('[fatal] erros demais; salvando e saindo para o supervisor reiniciar'); shutdown(kind, 1); }
}
process.on('unhandledRejection', e => fatalGuard('unhandledRejection', e));
process.on('uncaughtException', e => fatalGuard('uncaughtException', e));

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
const SESSION_MS = 30 * 24 * 3600 * 1000, MAX_TOMBS = 10, TOMB_MS = 7 * 24 * 3600 * 1000;   // 30 dias, renovável a cada uso; tokens "derrubados" guardados por conta (para avisar o cliente antigo)
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
/* SESSÃO ÚNICA: cada conta tem no máximo UM token válido. Um novo login marca o(s) anterior(es) como derrubados (rep=1, motivo 'outro_login') e só esse "túmulo" resta
   (para o cliente antigo receber 401 session_replaced em vez de "expirou"). `sid` cresce a cada login da conta e nunca volta. Tudo aqui é síncrono: não há janela com dois tokens válidos. */
const wsByUser = Object.create(null);   // user -> Set de conexões WebSocket abertas (derrubadas junto com a sessão)
function newSession(user, ip) {
    const token = crypto.randomBytes(32).toString('hex'); const now = Date.now();
    let maxSid = 0, hadLive = false; const mine = [];
    for (const h of Object.keys(db.sessions)) { const s = db.sessions[h]; if (s.user !== user) continue; mine.push(h); if ((s.sid | 0) > maxSid) maxSid = s.sid | 0; if (!s.rep && s.exp > now) hadLive = true; }
    for (const h of mine) { const t = db.sessions[h]; if (!t.rep) { t.rep = 1; t.repAt = now; } t.exp = Math.min(t.exp, now + TOMB_MS); }   // o túmulo só serve para avisar o cliente antigo: some em 7 dias
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
        if (++e.n > max) { sec.slog('RATE:' + name, req.user, SEC_IP(req), 'excedeu ' + max + '/' + windowMs + 'ms'); return res.status(429).json({ error: 'Calma, aventureiro! Muitas ações seguidas.', code: 'RATE' }); }
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
const extras = createExtras({ db, activePlayers, markDirty, knownItem: (n) => sec.knownItem(n) });
const sq = createSQ({ getDB: () => db, extras, sec, markDirty, giftLog: (o) => giftLog(o) });   // missões especiais do admin (specialquests.js)
eng = createEngageSrv({ getDB: () => db, extras, sec, markDirty, activePlayers });
try { const RI = require('./public/riftitems.js'); if (db.itemDB && typeof db.itemDB === 'object') { let ch = false; for (const k of Object.keys(RI)) if (!hasOwn(db.itemDB, k)) { db.itemDB[k] = RI[k]; ch = true; } if (ch) { dbStr = JSON.stringify([db.itemDB, db.npcDB]); markDirty(); } } } catch (e) { console.error('[rift-items]', e); }   // itens das Fendas entram no catálogo do servidor (o correio só entrega itens conhecidos)
function chatFor(user) { return db.chat.filter(c => social.chatVisible(user, c)).map(c => { if (!c.party) return c; const { sender, msg, color } = c; return { sender, msg, color }; }); }

/* ---------- respawn autoritativo dos monstros e chefes ----------
   O servidor guarda o instante de cada morte (db.mobDeaths, persistido) e revive por relógio próprio: não depende de ter alguém no mapa, de ser o host nem de o admin estar online.
   MOB_RESPAWN_MS (padrão 15 s) vale para monstros comuns; BOSS_RESPAWN_MS (padrão = MOB_RESPAWN_MS) para chefes de área (npcDB group 'chefe').
   O chefe de mundo (id 424242) tem regra própria: volta a cada hora cheia (extras.bossHour). Mapas casa_ não participam. */
const MOB_RESPAWN_MS = Math.max(500, +process.env.MOB_RESPAWN_MS || 15000);
const BOSS_RESPAWN_MS = Math.max(500, +process.env.BOSS_RESPAWN_MS || MOB_RESPAWN_MS);
function mobEntity(map, id) { const m = db.worldData && hasOwn(db.worldData, map) ? db.worldData[map] : null; return m && Array.isArray(m.entities) ? m.entities.find(o => o && String(o.id) === String(id)) : null; }
function mobSpecies(map, id) { if (String(id) === '424242') return 'wboss_golem'; const e = mobEntity(map, id); if (e) return typeof e.dbKey === 'string' ? e.dbKey : ''; const x = eng ? eng.extraMob(map, id) : null; return x ? x.sp : ''; }   // invasão: a espécie vem do relógio do servidor
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
const OBJ_PROPS = Object.getOwnPropertyNames(Object.prototype).map(x => x.toLowerCase());   // __proto__, constructor, hasOwnProperty, isPrototypeOf, toString, valueOf, __defineGetter__...
const RESERVED = new Set([...OBJ_PROPS, 'prototype', 'sistema']);
const NAME_BLOCK = new Set(['sistema', 'system', 'servidor', 'server', 'administrador', 'admin', 'adm', 'moderador', 'suporte', 'staff', 'gm', 'null', 'undefined']);   // ninguém se passa por staff/sistema
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
    if (RESERVED.has(username.toLowerCase()) || NAME_BLOCK.has(username.toLowerCase())) return res.status(400).json({ error: 'Nome não permitido.' });
    if (!NAME_RE.test(username)) return res.status(400).json({ error: 'Nome inválido (2 a 20 letras, números, espaço, _ . -).' });
    if (password.length > 100) return res.status(400).json({ error: 'A senha deve ter de 6 a 100 caracteres.' });
    const weak = sec.weakPassword(password, username); if (weak) return res.status(400).json({ error: weak });
    if (Object.keys(db.users).some(n => n.toLowerCase() === username.toLowerCase() || houseKeyOf(n) === houseKeyOf(username))) return res.status(400).json({ error: 'Esse nome já está em uso (ou é parecido demais com outro). Escolha outro.' });   // casa_<nome> precisa ser única
    if (Object.keys(db.users).length >= 5000) return res.status(400).json({ error: 'O reino está lotado no momento. Tente mais tarde.' });
    if (REG_PER_IP_HOUR > 0) {
        const now = Date.now(), arr = (regByIp.get(ip) || []).filter(t => now - t < 3600000);
        if (arr.length >= REG_PER_IP_HOUR) { sec.slog('REG-LIMIT', username, ip, 'limite de contas por IP/hora atingido'); return res.status(429).json({ error: 'Muitas contas criadas deste endereço. Tente novamente mais tarde.' }); }
    }
    if (hashing >= 12) return res.status(429).json({ error: 'O reino está movimentado. Tente de novo em instantes.' });
    hashing++; let pwHash; try { pwHash = await hashPw(password); } finally { hashing--; }
    if (Object.keys(db.users).some(n => n.toLowerCase() === username.toLowerCase() || houseKeyOf(n) === houseKeyOf(username))) return res.status(400).json({ error: 'Esse nome já está em uso (ou é parecido demais com outro). Escolha outro.' });   // rechecagem: outro pedido pode ter criado o nome durante o hash
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
        if (hashing >= 12) return res.status(429).json({ error: 'O reino está movimentado. Tente de novo em instantes.' });
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

app.post('/api/logout', auth, (req, res) => { delete db.sessions[req.tokenKey]; delete activePlayers[req.user]; try { social.dropUser(req.user, 'jogador saiu'); } catch (e) { console.error('[logout]', e); } const set = wsByUser[req.user]; if (set) for (const c of [...set]) { try { c.close(1000); } catch (e) { } } delete wsByUser[req.user]; markDirty(); res.json({ success: true }); });

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
/* ---------- validação do mundo / catálogos enviados pelo admin ----------
   Estrutura inválida é recusada (400) ou corrigida; problemas "de conteúdo" (portal para mapa que não existe, NPC sem catálogo...) só viram AVISOS na resposta e no log, para nunca travar o trabalho do admin. */
const MAX_MAPS = 300, MAX_ENT = 6000, MAX_CATALOG = 6000, ENT_TYPE_RE = /^[\w\-]{1,32}$/;
let _entSeq = 0; const freshEntId = () => Date.now() * 100 + (_entSeq++ % 100);   // mesmo formato do cliente
function vetWorld(raw, npcCat, itemCat) {
    const w0 = sec.scrubDeep(raw); const warns = [];
    if (!w0 || typeof w0 !== 'object' || Array.isArray(w0)) return { error: 'Mundo inválido.' };
    const world = {}; let nMaps = 0;
    for (const mk of Object.keys(w0)) {
        if (!MAP_RE.test(mk) || /^casa_/.test(mk) || RESERVED.has(mk.toLowerCase())) { warns.push('mapa "' + String(mk).slice(0, 30) + '" ignorado (nome inválido ou casa de jogador)'); continue; }
        const m = w0[mk]; if (!m || typeof m !== 'object' || Array.isArray(m)) { warns.push('mapa "' + mk + '" inválido: ignorado'); continue; }
        if (++nMaps > MAX_MAPS) return { error: 'Mapas demais (máximo ' + MAX_MAPS + ').' };
        if (!Array.isArray(m.entities)) m.entities = [];
        if (m.entities.length > MAX_ENT) return { error: 'O mapa "' + mk + '" tem entidades demais (máximo ' + MAX_ENT + ').' };
        for (const k of ['width', 'height']) if (m[k] !== undefined && !(Number.isFinite(m[k]) && m[k] >= 100 && m[k] <= 20000)) { warns.push('mapa "' + mk + '": ' + k + ' fora de 100..20000 (ajustado)'); m[k] = Math.max(100, Math.min(20000, Number.isFinite(m[k]) ? m[k] : 2000)); }
        const ids = new Set(); let dropped = 0, reid = 0;
        m.entities = m.entities.filter(o => {
            if (!o || typeof o !== 'object' || Array.isArray(o) || typeof o.type !== 'string' || !ENT_TYPE_RE.test(o.type)) { dropped++; return false; }
            for (const k of ['x', 'y', 'w', 'h']) if (o[k] !== undefined && typeof o[k] !== 'number') o[k] = 0;
            if (o.type === 'enemy' || o.type === 'npc') {   // ids de monstro: únicos no mapa e no formato que o servidor aceita nos relatórios de dano
                let id = o.id; const okId = (typeof id === 'number' && Number.isFinite(id) && id >= 0 && ID_RE.test(String(id))) || (typeof id === 'string' && ID_RE.test(id) && !RESERVED.has(id.toLowerCase()));
                if (!okId || ids.has(String(id))) { id = freshEntId(); while (ids.has(String(id))) id = freshEntId(); o.id = id; reid++; }
                ids.add(String(id));
            }
            return true;
        });
        if (dropped) warns.push('mapa "' + mk + '": ' + dropped + ' entidade(s) inválida(s) descartada(s)');
        if (reid) warns.push('mapa "' + mk + '": ' + reid + ' monstro/NPC com id repetido ou inválido receberam id novo');
        world[mk] = m;
    }
    if (!nMaps) return { error: 'O mundo precisa ter ao menos um mapa.' };
    if (!hasOwn(world, 'lumbridge')) warns.push('não existe o mapa "lumbridge" (ponto de entrada/retorno dos jogadores)');
    for (const mk of Object.keys(world)) {   // referências entre mapas e catálogos
        const m = world[mk]; let badPortal = 0, badNpc = 0, badItem = 0;
        for (const o of m.entities) {
            if (o.type === 'portal' && typeof o.destMap === 'string' && !hasOwn(world, o.destMap) && !/^casa/.test(o.destMap)) badPortal++;
            if ((o.type === 'enemy' || o.type === 'npc') && o.dbKey !== undefined && npcCat && !(typeof o.dbKey === 'string' && hasOwn(npcCat, o.dbKey))) badNpc++;
            if (o.type === 'ground_item' && typeof o.item === 'string' && !sec.knownItem(o.item) && !(itemCat && hasOwn(itemCat, o.item))) badItem++;
        }
        if (Array.isArray(m.edges)) for (const e of m.edges) if (e && typeof e.to === 'string' && !hasOwn(world, e.to)) badPortal++;
        if (badPortal) warns.push('mapa "' + mk + '": ' + badPortal + ' portal/borda aponta(m) para mapa inexistente');
        if (badNpc) warns.push('mapa "' + mk + '": ' + badNpc + ' monstro/NPC com dbKey fora do catálogo');
        if (badItem) warns.push('mapa "' + mk + '": ' + badItem + ' item(ns) de chão desconhecido(s)');
    }
    return { world, warns };
}
function vetCatalog(raw, what, extra) {
    const c = sec.scrubDeep(raw, 2000000); if (!c || typeof c !== 'object' || Array.isArray(c)) return { error: what + ' inválido.' };
    const keys = Object.keys(c); if (keys.length > MAX_CATALOG) return { error: what + ': itens demais (máximo ' + MAX_CATALOG + ').' };
    const out = {}; for (const k of keys) { if (k.length > 60 || !c[k] || typeof c[k] !== 'object' || Array.isArray(c[k])) continue; out[k] = c[k]; }
    if (extra) extra(out); return { cat: out };
}
let lastWorldBak = 0;
function backupWorld(old, why) {   // antes de substituir o mundo, guarda o anterior (no máx. 1 a cada 5 min, últimos 20)
    try {
        if (!old || Date.now() - lastWorldBak < 300000) return; lastWorldBak = Date.now();
        const dir = path.join(DATA_DIR, 'backups'); fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'world-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'), JSON.stringify({ worldData: old, itemDB: db.itemDB, npcDB: db.npcDB, why }), 'utf8');
        fs.readdirSync(dir).filter(f => /^world-.*\.json$/.test(f)).sort().slice(0, -20).forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch (_) { } });
    } catch (e) { console.error('[mundo] backup falhou:', e.message); }
}
const lastSaveAt = Object.create(null), saveBurst = Object.create(null);
app.post('/api/save', (req, res) => {
    /* sessão única: o corpo grande é lido DEPOIS do auth; se outro login derrubou esta sessão nesse meio tempo, o save velho é descartado (nunca sobrescreve o da sessão nova) */
    if (db.sessions[req.tokenKey] !== req.sess || req.sess.rep) { sec.slog('SAVE-STALE', req.user, SEC_IP(req), 'save de sessão derrubada ignorado'); return res.status(401).json({ error: REPLACED_MSG, code: 'session_replaced' }); }
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    /* numeração opcional dos saves (body.seq, crescente por sessão): um save mais antigo que chega atrasado (rede fora de ordem) é ignorado em vez de sobrescrever o mais novo */
    if (Number.isInteger(body.seq) && body.seq >= 0 && body.seq <= 1e12) { if (body.seq <= (req.sess.seq === undefined ? -1 : req.sess.seq)) { sec.slog('SAVE-OLD', req.user, SEC_IP(req), 'seq ' + body.seq + ' <= ' + req.sess.seq); return res.json({ success: true, stale: true, mapVersion: db.mapVersion }); } req.sess.seq = body.seq; }
    const { playerData, worldData, itemDB, npcDB } = body;
    const u = hasOwn(db.users, req.user) ? db.users[req.user] : null; if (!u) return res.status(401).json({ error: 'Conta não encontrada.', code: 'AUTH' });
    const ip = SEC_IP(req), now = Date.now(), isAdmin = req.role === 'admin';
    /* admin: valida o mundo/catálogos ANTES de aplicar qualquer coisa (um pedido inválido não aplica nada) */
    let wv = null, iv = null, nv = null;
    if (isAdmin) {
        if (itemDB !== undefined && itemDB !== null) { iv = vetCatalog(itemDB, 'itemDB', (o) => { delete o['Caixa Mímica']; }); if (iv.error) return res.status(400).json({ error: iv.error }); }
        if (npcDB !== undefined && npcDB !== null) { nv = vetCatalog(npcDB, 'npcDB'); if (nv.error) return res.status(400).json({ error: nv.error }); }
        if (iv && !Object.keys(iv.cat).length && db.itemDB && Object.keys(db.itemDB).length) return res.status(400).json({ error: 'itemDB vazio: recusado para não apagar o catálogo.' });
        if (nv && !Object.keys(nv.cat).length && db.npcDB && Object.keys(db.npcDB).length) return res.status(400).json({ error: 'npcDB vazio: recusado para não apagar o catálogo.' });
        if (worldData !== undefined && worldData !== null) { wv = vetWorld(worldData, nv ? nv.cat : db.npcDB, iv ? iv.cat : db.itemDB); if (wv.error) return res.status(400).json({ error: wv.error }); }
    }
    let adjusted = null, pendChanged = false;
    if (playerData !== undefined) {
        if (!isAdmin) {
            const lu = sec.lockedUntil(req.user);
            if (lu) return res.status(423).json({ error: 'Atividade suspeita detectada. Seu progresso fica em pausa por alguns minutos; tente novamente mais tarde.', code: 'LOCKED', until: lu, retryAfter: Math.max(1, Math.ceil((lu - now) / 1000)) });
            const sb = saveBurst[req.user] || (saveBurst[req.user] = []); while (sb.length && now - sb[0] > 10000) sb.shift();   // no máximo 12 saves em 10 s (o jogo salva a cada 2,5 s no máximo, mais salvamentos manuais)
            if (sb.length >= 12) { sec.slog('RATE:save-burst', req.user, ip, '12 saves em 10s'); return res.status(429).json({ error: 'Calma! O jogo está salvando rápido demais.', code: 'RATE', retryAfter: 3 }); }
            sb.push(now);
        }
        let pdLen = 0; try { pdLen = (playerData && typeof playerData === 'object' && !Array.isArray(playerData)) ? JSON.stringify(playerData).length : -1; } catch (e) { pdLen = -1; }   // JSON profundo demais estoura a pilha: tratado como inválido
        if (pdLen < 0 || pdLen > 1500000) { sec.slog('SAVE-REJECT', req.user, ip, 'playerData inválido/grande (' + pdLen + ')', true); return res.status(400).json({ error: 'Não foi possível salvar o seu progresso agora. Tente de novo em instantes.', code: 'INVALID' }); }
        if (playerData && typeof playerData === 'object' && !Array.isArray(playerData) && !(playerData.balV >= BAL.VERSION)) { sec.slog('SAVE-OUTDATED', req.user, ip, 'save sem balV (cliente desatualizado)'); return res.status(409).json({ error: 'O jogo foi atualizado (novo balanceamento). Recarregue a página (Ctrl+F5) para continuar.', code: 'OUTDATED' }); }
        const r = sec.checkSave(req.user, req.role, playerData, ip);
        if (r.error) { sec.slog('SAVE-REJECT', req.user, ip, r.error, true); return res.status(400).json({ error: r.error, code: 'INVALID' }); }
        const pd = r.pd; const pendSig = (x) => x ? JSON.stringify([x.mkt || null, x.escrow || null, (x.mailDone || []).length, (x.tradeDone || []).length, (x.mailDone || []).slice(-1)[0] || '', (x.tradeDone || []).slice(-1)[0] || '']) : '';
        pendChanged = pendSig(pd) !== pendSig(u.playerData);
        cleanFishData(pd); cleanStatsData(pd); sec.cleanTree(req.user, ip, pd, req.role); eng.cleanEngage(pd); extras.cleanPetData(pd); require('./mimicnames').cleanMimicData(pd);
        sec.checkCollections(req.user, req.role, pd, u.playerData, ip);
        u.playerData = pd; lastSaveAt[req.user] = now;
        if (r.notes.length) adjusted = r.notes.slice(0, 12);   // o cliente deve avisar: o servidor corrigiu parte do progresso enviado
        if (isAdmin && Array.isArray(body.itemNames)) sec.learnItems(body.itemNames);
    }
    let warnings = null;
    if (isAdmin) {   // somente admin altera o mundo
        let changed = false;
        if (iv) { db.itemDB = iv.cat; sec.learnItems(Object.keys(iv.cat)); }
        if (nv) db.npcDB = nv.cat;
        if (wv) {
            cleanWorld(wv.world);
            const s = JSON.stringify(wv.world);
            if (s !== worldStr) {
                backupWorld(db.worldData, 'antes do save de ' + req.user);
                const nOld = db.worldData ? Object.keys(db.worldData).length : 0, nNew = Object.keys(wv.world).length;
                db.worldData = wv.world; worldStr = s; changed = true;
                sec.slog('ADMIN-WORLD', req.user, ip, 'mundo salvo: ' + nNew + ' mapa(s) (antes ' + nOld + '), ' + Math.round(s.length / 1024) + ' KB, ' + wv.warns.length + ' aviso(s)', true);
            }
            if (wv.warns.length) { warnings = wv.warns.slice(0, 30); sec.slog('WORLD-WARN', req.user, ip, wv.warns.slice(0, 8).join(' | ')); }
        }
        if (nv || wv) {   // HP final = base + HP por nível x nível (Balance.mobHp): recalcula o catálogo, as criaturas do mundo e os monstros vivos do servidor
            try {
                BAL.applyNpcDB(db.npcDB || {});
                if (db.worldData && BAL.applyWorld(db.worldData, db.npcDB || {})) { worldStr = JSON.stringify(db.worldData); changed = true; }
                for (const mk of Object.keys(serverMobs)) for (const id of Object.keys(serverMobs[mk])) { const sm = serverMobs[mk][id], ex = sec.expectedMaxHp(mk, id); if (sm && ex > 0 && ex !== sm.maxHp) { sm.maxHp = ex; sm.hp = sm.isDead ? 0 : ex; } }
            } catch (e) { console.error('[balanceamento] HP dos monstros:', e.message); }
        }
        if (iv || nv) { const s = JSON.stringify([db.itemDB, db.npcDB]); if (s !== dbStr) { dbStr = s; changed = true; sec.slog('ADMIN-CATALOG', req.user, ip, 'catálogo de itens/NPCs salvo', true); } }
        if (changed) db.mapVersion = Math.max(Date.now(), db.mapVersion + 1);
    }
    if (pendChanged) persistNow(); else markDirty(); const out = { success: true, mapVersion: db.mapVersion }; if (adjusted) { out.adjusted = adjusted; out.warn = 'ADJUSTED'; } if (warnings) out.warnings = warnings; res.json(out);
});
/* estado salvo da conta (o cliente pode re-sincronizar depois de um aviso "adjusted") */
app.get('/api/me', auth, userLimit('me', 20, 60000), (req, res) => { const u = db.users[req.user]; const lu = sec.lockedUntil(req.user); res.json({ ok: true, username: req.user, role: req.role, playerData: u ? u.playerData : null, locked: lu || 0 }); });

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
    } catch (e) { return false; }   // na dúvida, NÃO entra (antes falhava aberto)
}
/* itens no chão compartilhados: o cliente que gera o drop o publica (sync.drops) e todos no mesmo mapa o veem; quem pega confirma em /api/drop (primeiro a chegar leva). Só memória (somem com o tempo). */
const groundDrops = Object.create(null);   // mapa -> sid -> { item, qty, x, y, by, exp }
function dropsOf(map) { return groundDrops[map] || (groundDrops[map] = Object.create(null)); }
function takeDrop(user, s) {
    const a = activePlayers[user]; if (!a || typeof s !== 'string' || !/^[a-z0-9]{6,14}$/.test(s)) return { ok: false };
    const d = groundDrops[a.map] && groundDrops[a.map][s]; if (!d || d.exp < Date.now()) return { ok: false };
    if (Math.hypot(d.x - a.x, d.y - a.y) > 420) return { ok: false };   // longe demais do item
    delete groundDrops[a.map][s]; return { ok: true };
}
function pubDrops(user, map, list) {
    if (!Array.isArray(list) || /^casa_/.test(map)) return; const m = dropsOf(map), now = Date.now();
    let mine = 0; for (const k in m) if (m[k].by === user) mine++;
    for (const d of list.slice(0, 6)) {
        if (!d || typeof d.s !== 'string' || !/^[a-z0-9]{6,14}$/.test(d.s) || m[d.s] || mine >= 40) continue;
        if (d.k === 'fire') { m[d.s] = { k: 'fire', item: 'fire', qty: 1, x: coord(d.x, 0), y: coord(d.y, 0), by: user, exp: now + Math.max(5, Math.min(300, num(d.ttl, 60))) * 1000 }; mine++; continue; }
        if (typeof d.item !== 'string' || !(sec.knownItem(d.item) || (db.itemDB && hasOwn(db.itemDB, d.item)))) continue;
        const q = Math.floor(num(d.qty, 1)); if (!(q >= 1)) continue;
        m[d.s] = { item: d.item, qty: Math.min(q, 100000), x: coord(d.x, 0), y: coord(d.y, 0), by: user, exp: now + Math.max(5, Math.min(300, num(d.ttl, 60))) * 1000 }; mine++;
        if (Object.keys(m).length > 400) break;
    }
}
function dropsView(user, map) {
    const m = groundDrops[map]; if (!m) return []; const now = Date.now(), out = [];
    for (const k of Object.keys(m)) { const d = m[k]; if (d.exp < now) { delete m[k]; continue; } if (d.by !== user) out.push({ s: k, k: d.k, item: d.item, qty: d.qty, x: d.x, y: d.y, ttl: Math.round((d.exp - now) / 1000) }); }
    return out.slice(0, 120);
}
const depleted = Object.create(null);   // mapa -> id -> { exp, by }  (árvores/rochas esgotadas: todos veem o toco)
function pubDep(user, map, list) {
    if (!Array.isArray(list) || /^casa_/.test(map)) return; const m = depleted[map] || (depleted[map] = Object.create(null)), now = Date.now();
    for (const d of list.slice(0, 8)) { if (!d || typeof d.i !== 'string' || !/^[A-Za-z0-9_\-]{1,30}$/.test(d.i)) continue; if (Object.keys(m).length >= 300) break; m[d.i] = { exp: now + Math.max(4, Math.min(120, num(d.s, 10))) * 1000, by: user }; }
}
function depView(user, map) { const m = depleted[map]; if (!m) return []; const now = Date.now(), out = []; for (const k of Object.keys(m)) { const d = m[k]; if (d.exp < now) { delete m[k]; continue; } if (d.by !== user) out.push({ i: k, s: Math.round((d.exp - now) / 1000) }); } return out.slice(0, 150); }
function dropsMine(user, map) { const m = groundDrops[map]; if (!m) return []; const now = Date.now(); return Object.keys(m).filter(k => m[k].by === user && m[k].exp >= now).slice(0, 60); }
let lastTick = 0;
function doSync(user, b, ip) {
    b = b || {}; const now = Date.now(); ip = ip || '-';
    let map = (typeof b.map === 'string' && MAP_RE.test(b.map) && !RESERVED.has(b.map.toLowerCase())) ? b.map : 'lumbridge';
    if (!/^casa_/.test(map) && db.worldData && !hasOwn(db.worldData, map)) map = hasOwn(db.worldData, 'lumbridge') ? 'lumbridge' : (Object.keys(db.worldData)[0] || map);   // mapa inexistente nunca cria estado novo
    if (/^casa_/.test(map) && sec.STRICT() && !houseMapAllowed(user, map)) { sec.slog('HOUSE-DENY', user, ip, 'sync em ' + map + ' sem convite'); map = 'lumbridge'; }
    const prev = activePlayers[user];
    const eq = (b.equipment !== undefined && b.equipment && typeof b.equipment === 'object' && JSON.stringify(b.equipment).length < 6000) ? sec.cleanSyncEquip(b.equipment) : (prev ? prev.equipment : ((hasOwn(db.users, user) && db.users[user].playerData && db.users[user].playerData.equipment && typeof db.users[user].playerData.equipment === 'object') ? sec.cleanSyncEquip(db.users[user].playerData.equipment) : null));   // sem estado (servidor reiniciou): usa o equipamento salvo
    try { if (eq) require('./mimicnames').syncVisual(eq, hasOwn(db.users, user) ? db.users[user].playerData : null); } catch (e) { }   // estágio/aparência dos Mímicos vistos pelos outros vêm do estado salvo
    const fc = (b.facing && typeof b.facing === 'object') ? { x: Math.max(-1, Math.min(1, num(b.facing.x) | 0)), y: Math.max(-1, Math.min(1, num(b.facing.y) | 0)) } : { x: 0, y: 1 };
    const role = hasOwn(db.users, user) ? db.users[user].role : 'player';
    let px = coord(b.x, 400), py = coord(b.y, 300);
    const sz = (!/^casa_/.test(map) && db.worldData && hasOwn(db.worldData, map) && db.worldData[map]) || (db.worldData && db.worldData.casa);   // limites do mapa (as casas usam o tamanho do mapa "casa")
    if (sz && Number.isFinite(sz.width) && Number.isFinite(sz.height)) { px = Math.min(px, sz.width + 40); py = Math.min(py, sz.height + 40); }
    const mv = sec.checkMove(user, role, prev, map, px, py, now, ip, b.tp === 1);   // tp: o cliente avisa um teleporte do próprio jogo (portal/renascer) px = mv.x; py = mv.y;
    activePlayers[user] = { x: px, y: py, map, facing: fc, actionAnim: Math.max(0, Math.min(60, num(b.actionAnim) | 0)), equipment: eq, hp: Math.max(0, Math.min(99999, num(b.hp) | 0)), maxHp: Math.max(0, Math.min(99999, num(b.maxHp) | 0)), lastSeen: now,
        title: typeof b.title === 'string' ? extras.cleanTitle(b.title) : (prev ? prev.title : ''), emote: prev ? prev.emote : null,
        look: (b.look !== undefined && cleanLook(b.look)) || (prev ? prev.look : null) || savedLook(user),
        pet: b.pet !== undefined ? extras.cleanPetSync(b.pet) : (prev ? prev.pet : null), mount: b.mount !== undefined ? extras.cleanMountId(b.mount) : (prev ? prev.mount : null), ms: b.ms !== undefined ? extras.cleanMountStage(b.ms) : (prev ? prev.ms : 0) };
    if (typeof b.emote === 'string' && /^[a-z]{2,10}$/.test(b.emote) && (!prev || !prev.emote || now - prev.emote.t > 1500)) activePlayers[user].emote = { k: b.emote, t: now };
    try {   // magias/flechas: eventos curtos só para os outros jogadores desenharem (sem efeito no jogo)
        let fx = (prev && Array.isArray(prev.fx)) ? prev.fx.filter(f => now - f.t < 2500) : [];
        if (Array.isArray(b.fx) && (!prev || !prev.fxAt || now - prev.fxAt > 120)) {
            for (const f of b.fx.slice(0, 4)) {
                if (!f || (f.k !== 'magic' && f.k !== 'ranged')) continue;
                const col = (typeof f.c === 'string' && /^#[0-9a-fA-F]{6}$/.test(f.c)) ? f.c : '#1abc9c';
                fx.push({ k: f.k, c: col, x: coord(f.x, px), y: coord(f.y, py), tx: coord(f.tx, px), ty: coord(f.ty, py), t: now + fx.length });
            }
            activePlayers[user].fxAt = now;
        } else if (prev) activePlayers[user].fxAt = prev.fxAt;
        activePlayers[user].fx = fx.slice(-8);
    } catch (e) { }
    try { if (!/^casa_/.test(map)) { sq.onVisit(user, map); eng.onVisit(user, map); } } catch (e) { }
    try { if (eng.isLegend(user) && !activePlayers[user].title) activePlayers[user].title = 'Lenda da Semana'; } catch (e) { }
    try { if (Array.isArray(b.drel)) for (const s of b.drel.slice(0, 20)) if (typeof s === 'string' && groundDrops[map] && groundDrops[map][s] && groundDrops[map][s].by === user) delete groundDrops[map][s]; pubDrops(user, map, b.drops); pubDep(user, map, b.dep); } catch (e) { }
    const host = electHost(map); const isHost = host === user;

    if (!serverMobs[map]) serverMobs[map] = Object.create(null);
    const killed = [];   // mortes decididas por ESTE pedido (o cliente só deve soltar o loot dos monstros que aparecem aqui)
    if (Array.isArray(b.combatLogs)) {
        const cap = sec.hitCap(user);
        for (const log of b.combatLogs.slice(0, 20)) {
            if (!log || (typeof log.id !== 'number' && typeof log.id !== 'string')) continue;
            const id = String(log.id); if (!ID_RE.test(id) || RESERVED.has(id.toLowerCase())) continue;
            const rawDmg = num(log.dmg); let dmg = Math.max(0, Math.min(250000, rawDmg)); let maxHp = Math.max(1, Math.min(2000000, num(log.maxHp, 10)));
            if (sec.STRICT() && role !== 'admin') {
                if (dmg > cap) { sec.strike(user, ip, 'dmg', 1, 'golpe ' + Math.round(rawDmg) + ' acima do teto ' + cap + ' (mob ' + id + ' em ' + map + ')'); dmg = cap; }
                if (dmg > 0 && !sec.dmgOk(user, now)) { sec.slog('RATE:dmg', user, ip, 'mais de 20 relatórios de dano por segundo'); continue; }
                const ex = sec.expectedMaxHp(map, id); if (ex > 0) maxHp = ex;   // a vida máxima vem do catálogo do servidor, não do cliente
            }
            if (dmg > 0 && sec.STRICT() && role !== 'admin' && mobPos[map] && mobPos[map][id] && Math.hypot(mobPos[map][id].x - px, mobPos[map][id].y - py) > 1400) { sec.slog('FAR-HIT', user, ip, 'golpe em mob ' + id + ' a ' + Math.round(Math.hypot(mobPos[map][id].x - px, mobPos[map][id].y - py)) + 'px (ignorado)'); continue; }   // o alcance máximo do jogo é ~220 px; 1400 cobre atraso de rede com folga
            if (dmg > 0) { const bd = dmgBudget[user] || (dmgBudget[user] = { t: now, d: 0 }); if (now - bd.t > 1000) { bd.t = now; bd.d = 0; } bd.d += dmg; if (bd.d > (role === 'admin' ? 1e9 : sec.dmgPerSec(user))) continue; }   // teto de dano por segundo (Balance.dmgPerSecCap: melhor arma/habilidade/crítico do nível mais atual do jogador; o cliente limita a si mesmo bem abaixo)
            let sm = serverMobs[map][id];
            if (!sm) {
                if (Object.keys(serverMobs[map]).length >= 400) continue;
                if (mobPos[map] && !mobPos[map][id]) continue;   // só existem monstros que o host do mapa reportou
                sm = { hp: maxHp, maxHp, aggro: null, isDead: false, deadTime: 0 }; serverMobs[map][id] = sm;
            }
            if (!sm.isDead) {
                if (dmg === 0 && sm.aggro && sm.aggro !== user && activePlayers[sm.aggro] && activePlayers[sm.aggro].map === map) continue;   // "vi você" (dano 0) não rouba o alvo de outro jogador
                const hp0 = sm.hp; sm.hp -= dmg; sm.aggro = user;   // o monstro foca em quem bateu por último
                if (dmg > 0 && id === '424242') { try { eng.onBossDamage(user, Math.min(dmg, Math.max(0, hp0))); } catch (e) { } }   // placar semanal do Colosso (dano que o servidor aceitou)
                if (sm.hp <= 0) { sm.hp = 0; sm.isDead = true; sm.deadTime = now; sm.aggro = null; noteDeath(map, id, now); killed.push(id); try { const spc = mobSpecies(map, id); sq.onKill(user, spc, map, id); eng.onKill(user, spc, map, id); } catch (e) { } }
            }
        }
    }
    if (now - lastTick > 250) { lastTick = now; try { tickRespawns(now); } catch (e) { console.error('[respawn]', e); } }   // o relógio global também roda aqui (no máx. 4x/s); o respawn não depende de quem está no mapa
    for (const id of Object.keys(serverMobs[map])) {
        const sm = serverMobs[map][id];
        if (sm.aggro && (!activePlayers[sm.aggro] || activePlayers[sm.aggro].map !== map)) sm.aggro = null;
    }
    if (isHost && b.mobPos && typeof b.mobPos === 'object') {
        const mp = Object.create(null); let n = 0;
        for (const id of Object.keys(b.mobPos)) { if (++n > 400) break; if (!ID_RE.test(id) || RESERVED.has(id.toLowerCase())) continue; const p = b.mobPos[id]; if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) mp[id] = { x: Math.round(Math.max(-1000, Math.min(21000, p.x)) * 10) / 10, y: Math.round(Math.max(-1000, Math.min(21000, p.y)) * 10) / 10 }; }
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
    const out = { t: now, drops: dropsView(user, map), dmine: dropsMine(user, map), dep: depView(user, map), toggles: db.toggles, boss: extras.bossInfo(), players, mapVersion: db.mapVersion, serverMobs: serverMobs[map], isHost, chatVer: db.chatVer, social: social.view(user) };
    if (b.chatVer !== db.chatVer) out.chat = chatFor(user);
    if (killed.length) out.kills = killed;
    const lk = sec.lockedUntil(user); if (lk) out.lock = lk;   // salvamento suspenso: o cliente deve avisar o jogador
    if (!isHost && mobPos[map]) out.mobPos = mobPos[map];
    return out;
}
/* sync: no máximo ~25/s por jogador (o jogo manda 10/s) e 150/s por IP (várias pessoas na mesma rede); acima disso o pedido é ignorado e o cliente tenta de novo */
const syncBucket = Object.create(null), syncIp = Object.create(null); const SYNC_IP_MAX = +process.env.SYNC_IP_MAX || 600;   // por IP: comunidade inteira atrás do mesmo NAT/escola
function syncAllowed(user, ip) {
    const now = Date.now(); let u = syncBucket[user]; if (!u || now - u.t > 1000) u = syncBucket[user] = { t: now, n: 0 }; u.n++;
    let i = syncIp[ip]; if (!i || now - i.t > 1000) i = syncIp[ip] = { t: now, n: 0 }; i.n++;
    if (u.n > 25 || i.n > SYNC_IP_MAX) { sec.slog('RATE:sync', user, ip, (u.n > 25 ? 'usuário ' + u.n : 'ip ' + i.n) + ' syncs/s'); return false; }
    return true;
}
setInterval(() => { const n = Date.now(); for (const k of Object.keys(syncBucket)) if (n - syncBucket[k].t > 5000) delete syncBucket[k]; for (const k of Object.keys(syncIp)) if (n - syncIp[k].t > 5000) delete syncIp[k]; for (const k of Object.keys(lastSaveAt)) if (n - lastSaveAt[k] > 3600000) { delete lastSaveAt[k]; delete saveBurst[k]; } for (const k of Object.keys(saveBurst)) { const a = saveBurst[k]; if (!a.length || n - a[a.length - 1] > 60000) delete saveBurst[k]; } for (const k of Object.keys(dmgBudget)) if (n - dmgBudget[k].t > 60000) delete dmgBudget[k]; for (const k of Object.keys(lastChat)) if (n - lastChat[k] > 3600000) delete lastChat[k]; }, 60000).unref();
app.post('/api/sync', auth, (req, res) => { if (!syncAllowed(req.user, SEC_IP(req))) return res.status(429).json({ error: 'Muitas ações seguidas. Aguarde um instante.', code: 'RATE' }); res.json(doSync(req.user, req.body, SEC_IP(req))); });
app.post('/api/social', auth, userLimit('social', 120, 60000), (req, res) => { const r = social.act(req.user, req.body); if (r && !r.error && req.body && typeof req.body.a === 'string' && req.body.a.startsWith('trade_')) persistNow(); res.json(Object.assign({}, r, { social: social.view(req.user) })); });

app.post('/api/drop', auth, userLimit('drop', 120, 60000), (req, res) => { const b = req.body || {}; res.json(b.a === 'take' ? takeDrop(req.user, b.s) : { ok: false }); });
app.post('/api/house', auth, userLimit('house', 60, 60000), (req, res) => { res.json(extras.house(req.user, req.body)); });
app.post('/api/market', auth, userLimit('market', 90, 60000), (req, res) => { const r = extras.market(req.user, req.body); if (r && r.ok && req.body && req.body.a !== 'browse' && req.body.a !== 'mail') persistNow(); res.json(r); });
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
        try {   // um defeito num pedido não pode derrubar o servidor nem a conexão dos outros
            if (m.t === 'sync') { if (!syncAllowed(user, conn.ip || '-')) return void conn.send(JSON.stringify({ t: 'sync', i: m.i, d: { error: 'Muitas ações seguidas. Aguarde um instante.', code: 'RATE' } })); conn.send(JSON.stringify({ t: 'sync', i: m.i, d: doSync(user, m.d, conn.ip) })); }
            else if (m.t === 'social') { const r = social.act(user, m.d); conn.send(JSON.stringify({ t: 'social', i: m.i, d: Object.assign({}, r, { social: social.view(user) }) })); }
        } catch (e) { console.error('[ws]', e); try { conn.send(JSON.stringify({ t: String(m.t || 'x').slice(0, 10), i: m.i, d: { error: 'Erro interno.' } })); } catch (_) { } }
    });
}

/* ---------- administração ---------- */
/* presentes do admin; o log é trilha de auditoria: 20 arquivos de 2 MB, nunca sobrescreve o histórico (todas as rotas /api/admin/* exigem sessão admin verificada no servidor) */
const GIFT_LOG = path.join(DATA_DIR, 'admin-gifts.log');
function giftLog(obj) { try { fs.mkdirSync(DATA_DIR, { recursive: true }); try { if (fs.statSync(GIFT_LOG).size > 2 * 1024 * 1024) sec.rotate(GIFT_LOG, 20); } catch (e) { } fs.appendFileSync(GIFT_LOG, JSON.stringify(obj) + '\n'); } catch (e) { } }
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
    giftLog(rec); sec.slog('ADMIN-GIVE', req.user, SEC_IP(req), to + ' <- ' + qty + 'x ' + item + ' (' + id + ')', true); persistNow();
    res.json({ success: true, id, to, online: !!activePlayers[to] && Date.now() - activePlayers[to].lastSeen < 6000 });
});
/* destrava o salvamento de um jogador (suspensão automática por atividade suspeita) — só admin, registrado no log */
app.post('/api/admin/unlock', auth, adminOnly, userLimit('unlock', 30, 60000), (req, res) => {
    const to = extras.findUser((req.body || {}).user); if (!to) return res.status(404).json({ error: 'Jogador não encontrado.' });
    const was = sec.clearLock(to); sec.slog('ADMIN-UNLOCK', req.user, SEC_IP(req), to + (was ? ' destravado' : ' (não estava suspenso)'), true); res.json({ success: true, was });
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

/* engajamento: recompensa diária (/api/daily), missões, Códice, maestria e placar (/api/engage). Relógio e recompensas SEMPRE do servidor; entrega pelo correio com id único. */
app.get('/api/daily', auth, userLimit('daily', 30, 60000), (req, res) => { const st = eng.state(req.user); res.json({ ok: true, now: st.now, daily: st.daily, boost: st.boost }); });
app.post('/api/daily', auth, userLimit('daily', 20, 60000), (req, res) => { const r = eng.act(req.user, { a: 'daily' }, SEC_IP(req)); if (r && r.ok) persistNow(); res.json(r); });
app.post('/api/engage', auth, userLimit('engage', 90, 60000), (req, res) => { const b = req.body; const r = eng.act(req.user, b, SEC_IP(req)); if (r && r.ok && b && ['daily', 'qclaim', 'qbonus', 'mclaim', 'lclaim', 'rend', 'rclaim'].includes(b.a)) persistNow(); res.json(r); });

/* missões especiais: jogadores listam e resgatam; só o admin cria/edita (specialquests.js) */
app.get('/api/specialquest/list', auth, userLimit('sqlist', 60, 60000), (req, res) => res.json({ ok: true, quests: (db.toggles && db.toggles.especiais === false) ? [] : sq.list(req.user) }));
app.post('/api/specialquest/claim', auth, userLimit('sqclaim', 20, 60000), (req, res) => { if (db.toggles && db.toggles.especiais === false) return res.json({ ok: false, error: 'Evento desativado.' }); const r = sq.claim(req.user, req.body, SEC_IP(req)); if (r && r.ok) persistNow(); res.json(r); });
app.get('/api/admin/events', auth, adminOnly, userLimit('evadm', 60, 60000), (req, res) => res.json({ ok: true, toggles: db.toggles }));
app.post('/api/admin/events', auth, adminOnly, userLimit('evadm', 60, 60000), (req, res) => {
    const b = req.body || {}; if (b.k !== 'fenda' && b.k !== 'especiais') return res.json({ ok: false, error: 'Evento desconhecido.' });
    db.toggles = db.toggles || { fenda: false, especiais: true }; db.toggles[b.k] = b.on === true; sec.slog('EVENT', req.user, SEC_IP(req), b.k + ' = ' + db.toggles[b.k]); persistNow(); res.json({ ok: true, toggles: db.toggles });
});
app.get('/api/admin/specialquest', auth, adminOnly, userLimit('sqadm', 60, 60000), (req, res) => res.json({ ok: true, quests: sq.adminList(req.user) }));
app.post('/api/admin/specialquest', auth, adminOnly, userLimit('sqadm', 60, 60000), (req, res) => res.json(sq.adminAct(req.user, req.body, SEC_IP(req))));

app.get('/api/users', auth, adminOnly, userLimit('users', 30, 60000), (req, res) => {
    const users = {}; for (const u of Object.keys(db.users)) users[u] = { role: db.users[u].role };
    res.json({ users, activePlayers: Object.keys(activePlayers) });
});

app.post('/api/users/role', auth, adminOnly, userLimit('role', 30, 60000), (req, res) => {
    const { targetUser, newRole } = req.body || {};
    if (typeof targetUser !== 'string' || !hasOwn(db.users, targetUser)) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (!ROLES.includes(newRole)) return res.status(400).json({ error: 'Cargo inválido.' });
    const admins = Object.keys(db.users).filter(n => db.users[n].role === 'admin');
    if (db.users[targetUser].role === 'admin' && newRole !== 'admin' && admins.length <= 1) return res.status(400).json({ error: 'Precisa existir ao menos 1 admin.' });
    db.users[targetUser].role = newRole; markDirty(); sec.slog('ADMIN-ROLE', req.user, SEC_IP(req), targetUser + ' -> ' + newRole, true); res.json({ success: true });
});

app.get('/api/backup', auth, adminOnly, userLimit('backup', 6, 60000), (req, res) => {
    sec.slog('ADMIN-BACKUP', req.user, SEC_IP(req), 'download do banco', true);
    const copy = { ...db }; delete copy.sessions; res.json(copy);
});

app.post('/api/restore', auth, adminOnly, userLimit('restore', 4, 60000), (req, res) => {
    const { dbData } = req.body || {};
    if (!dbData || typeof dbData !== 'object' || !dbData.users) return res.status(400).json({ error: 'Backup inválido.' });
    try { const dir = path.join(DATA_DIR, 'backups'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'antes-do-restore-' + Date.now() + '.json'), JSON.stringify(db), 'utf8'); } catch (e) { console.error('[DB] snapshot pré-restore falhou:', e.message); }
    sec.slog('ADMIN-RESTORE', req.user, SEC_IP(req), 'restauração de backup', true);
    const restored = normalizeDB(dbData); restored.sessions = db.sessions;
    if (!hasOwn(restored.users, req.user)) restored.users[req.user] = db.users[req.user];   // quem restaura não perde o acesso
    restored.users[req.user].role = 'admin';
    db = restored; try { balanceMigrate(); } catch (e) { console.error('[balanceamento] restauração:', e.message); } social.rebind(db); extras.rebind(db); for (const m of Object.keys(serverMobs)) delete serverMobs[m]; hydrateDeaths(); worldStr = db.worldData ? JSON.stringify(db.worldData) : ''; dbStr = JSON.stringify([db.itemDB, db.npcDB]);
    db.mapVersion = Math.max(Date.now(), db.mapVersion + 1); db.chatVer++; markDirty(); flushDB();
    res.json({ success: true, mapVersion: db.mapVersion });
});

/* ---------- erros ---------- */
app.use('/api', (req, res) => res.status(404).json({ error: 'Não foi possível concluir. Tente de novo.' }));
app.use((err, req, res, next) => {
    if (res.headersSent) { try { res.end(); } catch (e) { } return; }
    if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Não foi possível concluir. Tente de novo.' });
    if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Não foi possível concluir. Tente de novo.' });
    if (err instanceof URIError || (err && (err.status === 400 || err.statusCode === 400)) || (err instanceof RangeError)) return res.status(400).json({ error: 'Não foi possível concluir. Tente de novo.' });
    if (err && err.status === 404) return res.status(404).end();
    console.error('[erro]', err); res.status(500).json({ error: 'Erro interno.' });
});

const PORT = process.env.PORT || 3000, HOST = process.env.HOST || undefined;   // HOST=127.0.0.1 quando há um proxy (Caddy/nginx) na frente: ninguém acessa a porta do jogo direto nem forja X-Forwarded-For
hydrateDeaths();
ensureAdmin().then(() => {
    const onUp = () => console.log(`MiniScape rodando na porta ${PORT}${HOST ? ' (' + HOST + ')' : ''} (dados em ${sql ? path.join(DATA_DIR, "database.sqlite") : DB_FILE})`);
    srv = HOST ? app.listen(PORT, HOST, onUp) : app.listen(PORT, onUp);
    srv.on('error', (e) => { console.error('[http] não consegui abrir a porta ' + PORT + ':', e.message); process.exit(1); });   // ex.: EADDRINUSE: sai (o supervisor tenta de novo) em vez de ficar "vivo" sem atender
    srv.on('clientError', (e, sock) => { try { if (sock.writable) sock.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); else sock.destroy(); } catch (_) { } });
    srv.headersTimeout = 20000; srv.requestTimeout = 300000; srv.keepAliveTimeout = 65000;
    if (typeof srv.on === 'function') wsServer.attach(srv, { path: '/ws', onConnect: onWsConnect });
}).catch((e) => { console.error('[start]', e); process.exit(1); });
