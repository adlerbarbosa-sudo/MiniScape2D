'use strict';
/* Armazenamento opcional em SQLite (STORAGE=sqlite). Usa o módulo embutido node:sqlite (Node 22.5+), sem dependências.
   O servidor continua mantendo tudo em memória; aqui só gravamos as linhas que mudaram (uma por conta), em transação. */
const path = require('path');

function open(file) {
    const { DatabaseSync } = require('node:sqlite');   // lança erro se a versão do Node não tiver
    const conn = new DatabaseSync(file);
    conn.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
    conn.exec(`CREATE TABLE IF NOT EXISTS users (name TEXT PRIMARY KEY, password TEXT NOT NULL, role TEXT NOT NULL, player TEXT);
               CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
               CREATE TABLE IF NOT EXISTS sessions (h TEXT PRIMARY KEY, user TEXT NOT NULL, exp INTEGER NOT NULL);`);
    const cache = { users: new Map(), kv: new Map() };   // name -> {pw, role, ref}   |  k -> ref/str
    const st = {
        upU: conn.prepare('INSERT INTO users(name,password,role,player) VALUES(?,?,?,?) ON CONFLICT(name) DO UPDATE SET password=excluded.password, role=excluded.role, player=excluded.player'),
        delU: conn.prepare('DELETE FROM users WHERE name=?'),
        upK: conn.prepare('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v'),
        allU: conn.prepare('SELECT name,password,role,player FROM users'), allK: conn.prepare('SELECT k,v FROM kv'), allS: conn.prepare('SELECT h,user,exp FROM sessions'),
        delS: conn.prepare('DELETE FROM sessions'), insS: conn.prepare('INSERT OR REPLACE INTO sessions(h,user,exp) VALUES(?,?,?)')
    };
    function isEmpty() { const r = conn.prepare('SELECT (SELECT COUNT(*) FROM users) AS u, (SELECT COUNT(*) FROM kv) AS k').get(); return r.u === 0 && r.k === 0; }
    function load() {
        if (isEmpty()) return null;
        const d = { users: Object.create(null), sessions: Object.create(null) };
        for (const r of st.allU.all()) { let p = null; try { p = r.player ? JSON.parse(r.player) : null; } catch (e) { throw new Error('conta ' + r.name + ' ilegível no SQLite'); } d.users[r.name] = { password: r.password, role: r.role, playerData: p }; }
        for (const r of st.allK.all()) { try { d[r.k] = JSON.parse(r.v); } catch (e) { throw new Error('chave ' + r.k + ' ilegível no SQLite'); } }
        for (const r of st.allS.all()) d.sessions[r.h] = { user: r.user, exp: r.exp };
        return d;
    }
    function save(db) {
        conn.exec('BEGIN');
        try {
            const seen = new Set();
            for (const name of Object.keys(db.users)) {
                const u = db.users[name]; seen.add(name); const c = cache.users.get(name);
                if (c && c.pw === u.password && c.role === u.role && c.ref === u.playerData) continue;
                st.upU.run(name, u.password, u.role, u.playerData ? JSON.stringify(u.playerData) : null); cache.users.set(name, { pw: u.password, role: u.role, ref: u.playerData });
            }
            for (const name of [...cache.users.keys()]) if (!seen.has(name)) { st.delU.run(name); cache.users.delete(name); }
            const kv = { worldData: db.worldData, itemDB: db.itemDB, npcDB: db.npcDB, chat: db.chat, chatVer: db.chatVer, mapVersion: db.mapVersion, trades: db.trades };
            for (const k of Object.keys(kv)) {
                const big = k === 'worldData' || k === 'itemDB' || k === 'npcDB';
                if (big && cache.kv.get(k) === kv[k]) continue;   // objetos grandes: compara por referência
                const s = JSON.stringify(kv[k] === undefined ? null : kv[k]); if (!big && cache.kv.get(k) === s) continue;
                st.upK.run(k, s); cache.kv.set(k, big ? kv[k] : s);
            }
            st.delS.run(); for (const h of Object.keys(db.sessions)) { const s = db.sessions[h]; st.insS.run(h, s.user, s.exp); }
            conn.exec('COMMIT');
        } catch (e) { try { conn.exec('ROLLBACK'); } catch (_) { } cache.users.clear(); cache.kv.clear(); throw e; }
    }
    function snapshot(file) { conn.exec("VACUUM INTO '" + file.replace(/'/g, "''") + "'"); }
    function close() { try { conn.close(); } catch (e) { } }
    return { load, save, snapshot, close, file: path.basename(file) };
}
module.exports = { open };
