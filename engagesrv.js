'use strict';
/* MiniScape 2D — Engajamento no SERVIDOR (autoridade): recompensa diária, missões diárias/semanais, Códice, Maestria, placar semanal do Colosso e eventos.
   O núcleo de regras (tabelas, sorteio, relógio) mora em public/engage.js (o mesmo arquivo roda no navegador). Aqui ficam o estado por conta (db.engage), as rotas e a segurança:
   - relógio: SEMPRE o do servidor (Date.now, ou MS_TEST_CLOCK_FILE em testes). Dia = Brasília (UTC-3); eventos = UTC.
   - recompensas (moedas/itens) vão pelo correio do mercado com id único (mesmo caminho dos presentes: nunca duplicam ao relogar); XP volta na resposta e o cliente aplica.
   - abates e mapas são contados pelo servidor (as mortes que ele mesmo decide); progresso de coleta/pesca/cozinha/fabricação vem do cliente, com orçamento por minuto (sec.spend).
   - estado em db.engage (JSON/SQLite), saneado ao carregar; playerData.engage (cliente) só guarda dados de exibição (cleanClient). */
const E = require('./public/engage.js');
const BAL = require('./public/balance.js');
const fs = require('fs');
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const nul = () => Object.create(null);
const ID_RE = /^[A-Za-z0-9_\-]{1,40}$/;
const MAXC = 10000000;
const int = (v, a, b, d) => { v = Math.floor(Number(v)); return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };
const SKILLS = ['hp', 'combat', 'defence', 'ranged', 'magic', 'prayer', 'woodcutting', 'mining', 'smithing', 'firemaking', 'cooking', 'crafting', 'fishing', 'farming', 'alchemy', 'enchanting'];
const MASTERY_REWARD = { 1: { coins: 1500 }, 10: { coins: 6000, items: [['Greater Health Potion', 3]] }, 25: { coins: 15000 }, 50: { coins: 40000, items: [['Isca Dourada', 10]] } };
const LEGEND_REWARD = [{ coins: 5000, items: [['Isca Dourada', 5], ['Greater Health Potion', 5]] }, { coins: 3000, items: [['Isca Dourada', 3]] }, { coins: 1500, items: [['Isca Dourada', 1]] }];
const PART_REWARD = { coins: 300 }, MIN_LEGEND_DMG = 1000;
const BUDGET = { wood: [120, 60], mine: [120, 60], fish: [60, 25], rare: [12, 4], cook: [120, 60], craft: [200, 120] };   // [teto, por minuto] por tipo de progresso informado pelo cliente

/* ---------- estado salvo (db.engage) ---------- */
function cleanQuests(l) {
    if (!Array.isArray(l)) return [];
    const out = [];
    for (const q of l.slice(0, 5)) {
        if (!q || typeof q !== 'object' || !/^[dw]\d$/.test(q.id) || !hasOwn(E.KIND, q.t)) continue;
        const o = { id: q.id, t: q.t, need: int(q.need, 1, 100000, 1), p: int(q.p, 0, 100000, 0), c: int(q.c, 0, 1000000, 0), xpPct: Math.max(0, Math.min(0.5, Number(q.xpPct) || 0.03)), item: null, done: q.done === true };
        if (typeof q.sp === 'string' && ID_RE.test(q.sp)) o.sp = q.sp; if (q.sk === 'mining' || q.sk === 'woodcutting') o.sk = q.sk;
        if (Array.isArray(q.item) && typeof q.item[0] === 'string' && q.item[0].length <= 40 && Number.isInteger(q.item[1]) && q.item[1] > 0 && q.item[1] <= 100) o.item = [q.item[0], q.item[1]];
        o.p = Math.min(o.p, o.need); out.push(o);
    }
    return out;
}
function cleanUser(s) {
    const o = { dd: '', st: 0, cy: 0, tc: 0, bu: 0, bp: 5, q: { d: { k: '', l: [], b: false }, w: { k: '', l: [], b: false } }, kc: nul(), bc: nul(), mv: nul(), cl: nul(), qc: 0, last: 0 };
    if (!s || typeof s !== 'object') return o;
    if (typeof s.dd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.dd)) o.dd = s.dd; o.st = int(s.st, 0, 7, 0); o.cy = int(s.cy, 0, 100000, 0); o.tc = int(s.tc, 0, 100000, 0); o.bu = int(s.bu, 0, 4e12, 0); o.bp = int(s.bp, 1, 10, 5); o.qc = int(s.qc, 0, 1e7, 0); o.last = int(s.last, 0, 4e12, 0);
    for (const p of ['d', 'w']) { const q = s.q && s.q[p]; if (q && typeof q === 'object') o.q[p] = { k: typeof q.k === 'string' ? q.k.slice(0, 12) : '', l: cleanQuests(q.l), b: q.b === true }; }
    for (const [f, cap] of [['kc', 400], ['bc', 200], ['mv', 400]]) if (s[f] && typeof s[f] === 'object') { let n = 0; for (const k of Object.keys(s[f])) { if (n >= cap) break; if (!ID_RE.test(k) || ['__proto__', 'constructor', 'prototype'].includes(k)) continue; const v = int(s[f][k], 0, MAXC, 0); if (v > 0) { o[f][k] = f === 'mv' ? 1 : v; n++; } } }
    if (s.cl && typeof s.cl === 'object') { let n = 0; for (const k of Object.keys(s.cl)) { if (n >= 600) break; if (/^[\w:\-]{1,60}$/.test(k) && !['__proto__', 'constructor', 'prototype'].includes(k) && Number.isFinite(s.cl[k])) { o.cl[k] = s.cl[k]; n++; } } }
    return o;
}

/* ---------- Fendas: placar semanal, melhor nível, limite diário de recompensas e meta comunitária (db.engage.rift) ---------- */
const WK_RE = /^S-?\d{1,6}$/;
function cleanRift(r) {
    const o = { board: nul(), claimed: nul(), best: nul(), day: nul(), comm: nul(), cclaim: nul() };
    if (!r || typeof r !== 'object') return o;
    const bad = (u) => typeof u !== 'string' || u.length > 40 || ['__proto__', 'constructor', 'prototype'].includes(u);
    if (r.board && typeof r.board === 'object') for (const w of Object.keys(r.board).slice(-8)) { if (!WK_RE.test(w) || !r.board[w] || typeof r.board[w] !== 'object') continue; const b = nul(); let n = 0; for (const u of Object.keys(r.board[w])) { if (n >= 500) break; const e = r.board[w][u]; if (bad(u) || !e || typeof e !== 'object') continue; b[u] = { s: int(e.s, 0, 100000, 0), f: int(e.f, 0, 300, 0), l: int(e.l, 1, 30, 1), t: int(e.t, 0, 4e12, 0) }; n++; } o.board[w] = b; }
    for (const f of ['claimed', 'cclaim']) if (r[f] && typeof r[f] === 'object') for (const w of Object.keys(r[f]).slice(-8)) { if (!WK_RE.test(w) || !r[f][w] || typeof r[f][w] !== 'object') continue; const b = nul(); for (const u of Object.keys(r[f][w]).slice(0, 600)) if (!bad(u) && r[f][w][u] === 1) b[u] = 1; o[f][w] = b; }
    if (r.best && typeof r.best === 'object') { let n = 0; for (const u of Object.keys(r.best)) { if (n++ >= 5000) break; if (!bad(u)) o.best[u] = int(r.best[u], 0, 30, 0); } }
    if (r.day && typeof r.day === 'object') { for (const u of Object.keys(r.day).slice(0, 5000)) { const e = r.day[u]; if (!bad(u) && e && typeof e.d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.d)) o.day[u] = { d: e.d, n: int(e.n, 0, 100, 0) }; } }
    if (r.comm && typeof r.comm === 'object') for (const w of Object.keys(r.comm).slice(-8)) { const c = r.comm[w]; if (!WK_RE.test(w) || !c || typeof c !== 'object') continue; const by = nul(); let n = 0, t = 0; if (c.by && typeof c.by === 'object') for (const u of Object.keys(c.by)) { if (n++ >= 5000) break; if (!bad(u)) { by[u] = int(c.by[u], 0, 100000, 0); t += by[u]; } } o.comm[w] = { t, by }; }
    return o;
}
function cleanDB(d) {
    const out = { users: nul(), board: nul(), bclaim: nul(), rift: cleanRift(null) };
    if (!d || typeof d !== 'object') return out;
    out.rift = cleanRift(d.rift);
    if (d.users && typeof d.users === 'object') for (const u of Object.keys(d.users)) { if (['__proto__', 'constructor', 'prototype'].includes(u) || u.length > 40) continue; out.users[u] = cleanUser(d.users[u]); }
    if (d.board && typeof d.board === 'object') for (const w of Object.keys(d.board)) { if (!/^S-?\d{1,6}$/.test(w) || !d.board[w] || typeof d.board[w] !== 'object') continue; const b = nul(); let n = 0; for (const u of Object.keys(d.board[w])) { if (n >= 300) break; if (['__proto__', 'constructor', 'prototype'].includes(u) || u.length > 40) continue; const v = int(d.board[w][u], 0, 2e9, 0); if (v > 0) { b[u] = v; n++; } } out.board[w] = b; }
    if (d.bclaim && typeof d.bclaim === 'object') for (const w of Object.keys(d.bclaim)) { if (!/^S-?\d{1,6}$/.test(w) || !d.bclaim[w] || typeof d.bclaim[w] !== 'object') continue; const b = nul(); for (const u of Object.keys(d.bclaim[w]).slice(0, 400)) if (!['__proto__', 'constructor', 'prototype'].includes(u) && d.bclaim[w][u]) b[u] = 1; out.bclaim[w] = b; }
    return out;
}

module.exports = function createEngageSrv(ctx) {
    const { getDB, extras, sec, markDirty, activePlayers } = ctx;
    /* ---------- relógio do servidor (teste: MS_TEST_CLOCK_FILE com um instante ISO ou em ms) ---------- */
    const CLOCK_FILE = process.env.MS_TEST_CLOCK_FILE || ''; let clk = { t: 0, v: null };
    function now() {
        if (!CLOCK_FILE) return Date.now(); const r = Date.now();
        if (r - clk.t > 150) { clk.t = r; try { const s = fs.readFileSync(CLOCK_FILE, 'utf8').trim(); const v = /^\d{11,}$/.test(s) ? Number(s) : Date.parse(s); clk.v = Number.isFinite(v) ? v - r : null; } catch (e) { clk.v = null; } }
        return clk.v == null ? r : r + clk.v;
    }
    const db0 = () => { const db = getDB(); if (!db.engage || typeof db.engage !== 'object' || !db.engage.users) db.engage = cleanDB(db.engage); return db.engage; };
    const S = (user) => { const g = db0(); if (!hasOwn(g.users, user)) g.users[user] = cleanUser(null); return g.users[user]; };
    const pdOf = (user) => { const db = getDB(), u = hasOwn(db.users, user) ? db.users[user] : null; return u && u.playerData && typeof u.playerData === 'object' ? u.playerData : null; };
    const skillXp = (user, k) => { const p = pdOf(user); const s = p && p.stats && p.stats.skills && p.stats.skills[k]; return s ? int(s.xp, 0, BAL.MAX_XP, 0) : 0; };
    const topCombat = (user) => { let L = 1, k0 = 'combat'; for (const k of ['combat', 'ranged', 'magic']) { const l = BAL.levelForXp(skillXp(user, k)); if (l > L) { L = l; k0 = k; } } return { L, k: k0 }; };
    const worldMaps = () => { const db = getDB(); return db.worldData ? Object.keys(db.worldData).filter((k) => !/^casa/.test(k)) : []; };

    /* ---------- espécies disponíveis para missões (só as que existem no mundo) ---------- */
    let spCache = { v: -1, list: [], bosses: [] };
    function species() {
        const db = getDB(); if (spCache.v === db.mapVersion) return spCache; const inWorld = new Set(), npc = db.npcDB || {};
        if (db.worldData) for (const mk of Object.keys(db.worldData)) { const m = db.worldData[mk]; if (m && Array.isArray(m.entities)) for (const o of m.entities) if (o && o.type === 'enemy' && typeof o.dbKey === 'string') inWorld.add(o.dbKey); }
        const list = [], bosses = [];
        for (const k of inWorld) {
            const d = hasOwn(npc, k) ? npc[k] : null; if (!d || !(d.hp > 0) || d.behavior === 'npc' || d.group === 'npc' || k === 'wboss_golem') continue;
            const lv = BAL.mobLevelOf(d), nm = typeof d.name === 'string' ? d.name : k;
            if (d.group === 'chefe' || (hasOwn(BAL.MOBS, k) && ['boss', 'raid', 'world'].includes(BAL.MOBS[k][1]))) { bosses.push({ k, name: nm, lv }); continue; }
            if (d.group === 'recurso' || !(d.maxHit > 0)) continue; list.push({ k, name: nm, lv });
        }
        list.sort((a, b) => a.lv - b.lv || (a.k < b.k ? -1 : 1)); bosses.sort((a, b) => a.lv - b.lv);
        spCache = { v: db.mapVersion, list, bosses }; return spCache;
    }
    const isBoss = (sp) => { const db = getDB(), d = db.npcDB && hasOwn(db.npcDB, sp) ? db.npcDB[sp] : null; return !!((d && d.group === 'chefe') || sp === 'wboss_golem' || (hasOwn(BAL.MOBS, sp) && ['boss', 'raid', 'world'].includes(BAL.MOBS[sp][1]))); };
    const nameOfSp = (sp) => { const db = getDB(), d = db.npcDB && hasOwn(db.npcDB, sp) ? db.npcDB[sp] : null; return d && typeof d.name === 'string' ? d.name : sp; };

    /* ---------- missões do período ---------- */
    function ensureQuests(user, t) {
        const s = S(user), keys = { d: E.dayKey(t), w: E.weekKey(t) }, c = topCombat(user), sp = species();
        for (const p of ['d', 'w']) {
            if (s.q[p].k === keys[p]) continue;
            s.q[p] = { k: keys[p], l: E.genQuests(p, user + '|' + p + '|' + keys[p], { L: c.L, species: sp.list, bosses: sp.bosses }).map((q) => Object.assign(q, { done: false })), b: false };
            markDirty();
        }
        return s;
    }
    function bump(user, pred, n) {
        const s = ensureQuests(user, now()); let ch = false;
        for (const p of ['d', 'w']) for (const q of s.q[p].l) if (!q.done && pred(q) && q.p < q.need) { q.p = Math.min(q.need, q.p + n); ch = true; }
        if (ch) markDirty();
    }
    /* ---------- ganchos do servidor ---------- */
    function onKill(user, species, map, id) {
        if (typeof species !== 'string' || !species) return; const s = S(user);
        s.kc[species] = Math.min(MAXC, (s.kc[species] || 0) + 1); const boss = isBoss(species); if (boss) s.bc[species] = Math.min(MAXC, (s.bc[species] || 0) + 1);
        bump(user, (q) => (q.t === 'kill' && q.sp === species) || (q.t === 'boss' && boss), 1); markDirty();
    }
    function onVisit(user, map) {
        const db = getDB(); if (typeof map !== 'string' || /^casa/.test(map) || !db.worldData || !hasOwn(db.worldData, map)) return; const s = S(user);
        if (!s.mv[map]) { if (Object.keys(s.mv).length >= 400) return; s.mv[map] = 1; markDirty(); }
    }
    const weekBoard = (t) => { const g = db0(), w = E.weekKey(t); if (!g.board[w]) g.board[w] = nul(); return g.board[w]; };
    function onBossDamage(user, dmg) {
        dmg = Math.floor(dmg); if (!(dmg > 0)) return; const b = weekBoard(now()); b[user] = Math.min(2e9, (b[user] || 0) + dmg); markDirty();
        const g = db0(); const keys = Object.keys(g.board); if (keys.length > 8) { keys.sort((a, c) => Number(a.slice(1)) - Number(c.slice(1))); for (const k of keys.slice(0, keys.length - 8)) { delete g.board[k]; delete g.bclaim[k]; } }
    }
    function topOf(wk, n) { const g = db0(), b = g.board[wk]; if (!b) return []; return Object.keys(b).map((u) => ({ u, dmg: b[u] })).sort((a, c) => c.dmg - a.dmg || (a.u < c.u ? -1 : 1)).slice(0, n); }
    const prevWeek = (t) => 'S' + (E.weekIdx(t) - 1);
    function legend(t) { const top = topOf(prevWeek(t), 1)[0]; return top && top.dmg >= MIN_LEGEND_DMG ? top : null; }
    function isLegend(user) { const l = legend(now()); return !!(l && l.u === user); }

    /* ---------- invasão (por hora UTC) ---------- */
    const invCache = { h: -1, v: null };
    function invasionFor(hour) {
        if (invCache.h === hour) return invCache.v; const db = getDB(), cand = []; const npc = db.npcDB || {};
        if (db.worldData) for (const mk of Object.keys(db.worldData).sort()) {
            if (/^casa/.test(mk)) continue; const m = db.worldData[mk]; if (!m || !Array.isArray(m.entities)) continue; const cnt = {};
            for (const o of m.entities) if (o && o.type === 'enemy' && typeof o.dbKey === 'string') { const d = hasOwn(npc, o.dbKey) ? npc[o.dbKey] : null; if (d && d.hp > 0 && d.maxHit > 0 && d.group !== 'chefe' && d.group !== 'recurso' && o.dbKey !== 'wboss_golem') cnt[o.dbKey] = (cnt[o.dbKey] || 0) + 1; }
            const ks = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || (a < b ? -1 : 1)); if (ks.length && Object.values(cnt).reduce((a, b) => a + b, 0) >= 4) cand.push({ map: mk, sp: ks[0] });
        }
        let v = null; if (cand.length) { const c = cand[E.hash('inv|' + hour) % cand.length]; v = { map: c.map, sp: c.sp, ids: E.invIds(hour), hour }; }
        invCache.h = hour; invCache.v = v; return v;
    }
    function invasion(t) {
        const slot = E.invasionSlot(t), inv = (slot.active || slot.nextIn <= 120000) ? invasionFor(slot.active ? slot.hour : slot.hour + 1) : null;
        if (!inv) return null; const from = slot.active ? slot.from : slot.from + E.HR, until = from + E.INV_MIN * 60000;
        const db = getDB(), d = db.npcDB && hasOwn(db.npcDB, inv.sp) ? db.npcDB[inv.sp] : null;
        return { active: slot.active, from, until, map: inv.map, sp: inv.sp, name: d ? d.name : inv.sp, ids: inv.ids, n: E.INV_N, mapName: (getDB().worldData[inv.map] || {}).name || inv.map };
    }
    function extraMob(map, id) {   // criaturas da invasão em andamento (o servidor conhece vida e espécie delas)
        const t = now(), slot = E.invasionSlot(t); if (!slot.active) return null; const inv = invasionFor(slot.hour); if (!inv || inv.map !== map) return null;
        const n = Number(id); if (!Number.isInteger(n) || !inv.ids.includes(n)) return null; const db = getDB(), d = db.npcDB && hasOwn(db.npcDB, inv.sp) ? db.npcDB[inv.sp] : null;
        return d ? { sp: inv.sp, hp: d.hp > 0 ? d.hp : 0 } : null;
    }

    /* ---------- entrega pelo correio (nunca duplica: id único; só marca o resgate depois de checar a capacidade) ---------- */
    const mailRoom = (user, n) => { const m = getDB().market && getDB().market.mail; const len = m && hasOwn(m, user) ? m[user].length : 0; return len + n <= 245; };
    function deliver(user, reward, why) {
        const list = []; if (reward.coins > 0) list.push(['Coins', reward.coins]); for (const it of reward.items || []) list.push(it);
        const ok = []; for (const [n, q] of list) { if (n !== 'Coins' && !sec.knownItem(n)) continue; ok.push([n, q]); }
        if (!mailRoom(user, ok.length)) return null; for (const [n, q] of ok) extras.giveMail(user, n, q, why);
        return ok;
    }
    const fail = (error, code) => ({ ok: false, error, code });


    /* ---------- Fendas (masmorra escalonada): o cliente joga a corrida; o servidor decide nível liberado, pontuação, recompensa e placar ---------- */
    const RIFT_SEAL = 6, RIFT_MAXFLOORS = 300, RIFT_MAXLVL = 30, RIFT_REWARDED_PER_DAY = 4, RIFT_MIN_SEC_PER_FLOOR = 5, RIFT_MAX_MS = 3 * 3600000, RIFT_REWARD_FLOORS = 40;   // infinita: o andar 6 'sela' (libera o próximo nível); chefe a cada 5; prêmio conta até 40 andares
    const RIFT_MODS = [
        { id: 'furia', n: 'Fúria', d: 'Inimigos causam +25% de dano. Recompensa +25%.', dmg: 1.25, rw: 1.25 },
        { id: 'gigantes', n: 'Gigantes', d: 'Inimigos têm +40% de vida. Recompensa +20%.', hp: 1.4, rw: 1.2 },
        { id: 'enxame', n: 'Enxame', d: '+50% de inimigos por andar. Recompensa +20%.', more: 1.5, rw: 1.2 },
        { id: 'penumbra', n: 'Penumbra', d: 'Visão reduzida na escuridão. Recompensa +15%.', dark: 1, rw: 1.15 }
    ];
    const riftMod = (t) => RIFT_MODS[((E.weekIdx(t) % RIFT_MODS.length) + RIFT_MODS.length) % RIFT_MODS.length];
    const R = () => { const g = db0(); if (!g.rift || typeof g.rift !== 'object' || !g.rift.board) g.rift = cleanRift(g.rift); return g.rift; };
    const runs = nul();   // corridas em andamento (memória: se o servidor reiniciar, a corrida é perdida)
    const riftGoal = () => Math.max(60, Math.min(3000, 50 + 15 * Object.keys(getDB().users).length));
    const RIFT_COMM_REWARD = { coins: 5000, items: [['Fragmento de Fenda', 25], ['Greater Health Potion', 5]] };
    const RIFT_PRIZE = [{ coins: 8000, items: [['Fragmento de Fenda', 40], ['Isca Dourada', 5]] }, { coins: 5000, items: [['Fragmento de Fenda', 25], ['Isca Dourada', 3]] }, { coins: 3000, items: [['Fragmento de Fenda', 15], ['Isca Dourada', 1]] }];
    function riftTop(wk) { const b = R().board[wk] || nul(); return Object.keys(b).map((u) => ({ u, s: b[u].s, f: b[u].f, l: b[u].l, t: b[u].t })).sort((a, c) => c.s - a.s || a.t - c.t || (a.u < c.u ? -1 : 1)); }
    function riftState(user) {
        const t = now(), wk = E.weekKey(t), rf = R(), top = riftTop(wk), idx = top.findIndex((r) => r.u === user), md = riftMod(t), day = E.dayKey(t), dd = rf.day[user], used = dd && dd.d === day ? dd.n : 0;
        const pk = 'S' + (E.weekIdx(t) - 1), ptop = riftTop(pk), pi = ptop.findIndex((r) => r.u === user), cm = rf.comm[wk] || { t: 0, by: nul() }, goal = riftGoal();
        const best = hasOwn(rf.best, user) ? rf.best[user] : 0, c = topCombat(user);
        const cWeek = rf.cclaim[wk] && rf.cclaim[wk][user] === 1;
        return { ok: true, wk, mod: { id: md.id, n: md.n, d: md.d }, left: E.msToNextWeek(t), seal: RIFT_SEAL, best, maxLvl: Math.min(RIFT_MAXLVL, best + 1), baseLvl: c.L,
            top: top.slice(0, 20).map((r, i) => ({ pos: i + 1, u: r.u, s: r.s, f: r.f, l: r.l })), me: idx >= 0 ? { pos: idx + 1, s: top[idx].s, f: top[idx].f, l: top[idx].l } : null, total: top.length,
            rewarded: used, rewardCap: RIFT_REWARDED_PER_DAY,
            prev: pi >= 0 && pi < 3 ? { pos: pi + 1, claimed: !!(rf.claimed[pk] && rf.claimed[pk][user]) } : null,
            comm: { t: cm.t, goal, mine: hasOwn(cm.by, user) ? cm.by[user] : 0, claimable: cm.t >= goal && hasOwn(cm.by, user) && cm.by[user] > 0 && !cWeek, claimed: !!cWeek } };
    }
    function riftStart(user, b) {
        const st = riftState(user), lvl = int(b.lvl, 1, RIFT_MAXLVL, 1); if (lvl > st.maxLvl) return fail('Nível de Fenda ainda bloqueado: vença o nível ' + (lvl - 1) + ' primeiro.', 'LOCKED');
        const t = now(), md = riftMod(t), bl = Math.max(3, Math.min(80, Math.round(st.baseLvl * 0.5 + lvl * 2)));
        const id = t.toString(36) + Math.floor(Math.random() * 1e6).toString(36); runs[user] = { id, t0: t, lvl, bl, mod: md.id };
        return { ok: true, id, lvl, bl, seal: RIFT_SEAL, mod: { id: md.id, n: md.n, d: md.d, dmg: md.dmg || 1, hp: md.hp || 1, more: md.more || 1, dark: md.dark || 0 } };
    }
    function riftEnd(user, b) {
        const r = hasOwn(runs, user) ? runs[user] : null; if (!r || r.id !== b.id) return fail('Esta corrida não existe mais.', 'NORUN');
        delete runs[user]; const t = now(), el = t - r.t0, rf = R(), wk = E.weekKey(t), md = riftMod(r.t0);
        let fc = int(b.fc, 0, RIFT_MAXFLOORS, 0); const maxByTime = Math.floor(el / (RIFT_MIN_SEC_PER_FLOOR * 1000)); if (el > RIFT_MAX_MS) fc = Math.min(fc, 60); fc = Math.min(fc, maxByTime);
        const cleared = fc >= RIFT_SEAL;
        const sec2 = Math.floor(el / 1000), score = fc < 1 ? 0 : fc * 100 + Math.floor(fc / 5) * 150 + r.lvl * 40;
        const out = { ok: true, fc, cleared, score, lvl: r.lvl, secs: sec2, shards: 0, coins: 0, capped: false, newBest: false };
        if (fc >= 1) {
            if (!rf.board[wk]) rf.board[wk] = nul(); const cur = rf.board[wk][user]; if (!cur || score > cur.s) { rf.board[wk][user] = { s: score, f: fc, l: r.lvl, t }; out.newBest = true; }
            const day = E.dayKey(t); let dd = rf.day[user]; if (!dd || dd.d !== day) dd = rf.day[user] = { d: day, n: 0 };
            if (dd.n < RIFT_REWARDED_PER_DAY) {
                dd.n++; const ef = Math.min(fc, RIFT_REWARD_FLOORS), sh = Math.max(1, Math.round((ef + (cleared ? 4 : 0)) * (1 + r.lvl * 0.05) * (md.rw || 1))), co = Math.round(ef * (60 + 12 * r.bl) * (md.rw || 1));
                const ok = deliver(user, { coins: co, items: [['Fragmento de Fenda', sh]] }, 'Fenda nível ' + r.lvl); if (ok) { out.shards = sh; out.coins = co; } else out.err = 'Correio cheio: esvazie o correio para receber as recompensas.';
                if (!cm0(rf, wk)) rf.comm[wk] = { t: 0, by: nul() }; const cm = rf.comm[wk]; cm.by[user] = (cm.by[user] || 0) + fc; cm.t += fc;
            } else out.capped = true;
            if (cleared && (!hasOwn(rf.best, user) || rf.best[user] < r.lvl)) rf.best[user] = r.lvl;
        }
        markDirty(); out.state = riftState(user); return out;
    }
    const cm0 = (rf, wk) => rf.comm[wk];
    function riftClaim(user, b) {
        const t = now(), rf = R();
        if (b.w === 'prize') {
            const pk = 'S' + (E.weekIdx(t) - 1), top = riftTop(pk), i = top.findIndex((r) => r.u === user); if (i < 0 || i > 2) return fail('Você não ficou no pódio da semana passada.', 'NOPRIZE');
            if (rf.claimed[pk] && rf.claimed[pk][user]) return fail('Prêmio já resgatado.', 'DONE'); const ok = deliver(user, RIFT_PRIZE[i], 'Pódio das Fendas #' + (i + 1)); if (!ok) return fail('Correio cheio.', 'MAIL');
            if (!rf.claimed[pk]) rf.claimed[pk] = nul(); rf.claimed[pk][user] = 1; markDirty(); return { ok: true, pos: i + 1, state: riftState(user) };
        }
        const wk = E.weekKey(t), cm = rf.comm[wk];
        if (!cm || cm.t < riftGoal() || !(cm.by[user] > 0)) return fail('A meta comunitária ainda não foi atingida (ou você não participou).', 'NOGOAL');
        if (rf.cclaim[wk] && rf.cclaim[wk][user]) return fail('Recompensa já resgatada.', 'DONE'); const ok = deliver(user, RIFT_COMM_REWARD, 'Meta comunitária das Fendas'); if (!ok) return fail('Correio cheio.', 'MAIL');
        if (!rf.cclaim[wk]) rf.cclaim[wk] = nul(); rf.cclaim[wk][user] = 1; markDirty(); return { ok: true, state: riftState(user) };
    }

    /* ---------- ações ---------- */
    function dailyClaim(user, ip) {
        const t = now(), today = E.dayKey(t), s = S(user);
        if (s.dd >= today) return fail('Você já pegou a recompensa de hoje. Volte amanhã!', 'DONE');
        const st = s.dd === E.dayKey(t - E.DAY) ? (s.st % 7) + 1 : 1, L = topCombat(user).L, rw = E.dailyReward(st, L);
        const given = deliver(user, rw, 'Recompensa diária (dia ' + st + ')'); if (!given) return fail('O correio está cheio. Esvazie-o e tente de novo.', 'MAIL');
        s.dd = today; s.st = st; s.tc++; if (st === 7) s.cy++; s.last = t;
        if (rw.boost) { s.bu = Math.max(s.bu > t ? s.bu : t, t + rw.boost.min * 60000); s.bu = Math.min(s.bu, t + 120 * 60000); s.bp = rw.boost.pct; }
        markDirty(); sec.slog('ENG-DAILY', user, ip, 'dia ' + st + ' (' + today + ') -> ' + given.map((x) => x[1] + 'x ' + x[0]).join(', '), true);
        return { ok: true, day: st, reward: rw, given };
    }
    function qClaim(user, b, ip) {
        const t = now(), s = ensureQuests(user, t), id = typeof b.q === 'string' ? b.q : ''; if (!/^[dw]\d$/.test(id)) return fail('Missão inválida.');
        const q = s.q[id[0]].l.find((x) => x.id === id); if (!q) return fail('Missão não encontrada.');
        if (q.done) return fail('Você já recebeu essa recompensa.', 'DONE'); if (q.p < q.need) return fail('Ainda falta cumprir o objetivo (' + q.p + '/' + q.need + ').', 'PROG');
        const c = topCombat(user), sk = E.SKILL_BY_Q(q, c.k), lvl = BAL.levelForXp(skillXp(user, sk)), xp = E.xpReward(q, lvl);
        const rw = { coins: q.c, items: q.item ? [q.item] : [] }; const given = deliver(user, rw, (id[0] === 'w' ? 'Missão semanal' : 'Missão diária')); if (!given) return fail('O correio está cheio. Esvazie-o e tente de novo.', 'MAIL');
        q.done = true; s.qc++; markDirty(); sec.slog('ENG-QUEST', user, ip, id + ' ' + q.t + ' -> ' + given.map((x) => x[1] + 'x ' + x[0]).join(', ') + ' +' + xp + ' XP ' + sk);
        return { ok: true, id, given, xp: { skill: sk, n: xp } };
    }
    function qBonus(user, b, ip) {
        const t = now(), s = ensureQuests(user, t), p = b.k === 'w' ? 'w' : 'd', P = s.q[p];
        if (P.b) return fail('O bônus deste período já foi recebido.', 'DONE'); if (!P.l.length || !P.l.every((q) => q.done)) return fail('Conclua todas as missões primeiro.', 'PROG');
        const rw = E.questBonus(p, topCombat(user).L), given = deliver(user, rw, p === 'w' ? 'Bônus semanal' : 'Bônus diário'); if (!given) return fail('O correio está cheio. Esvazie-o e tente de novo.', 'MAIL');
        P.b = true; markDirty(); sec.slog('ENG-BONUS', user, ip, p + ' -> ' + given.map((x) => x[1] + 'x ' + x[0]).join(', ')); return { ok: true, given };
    }
    function prog(user, ev) {
        if (!ev || typeof ev !== 'object') return; const t = now(); ensureQuests(user, t);
        for (const k of Object.keys(BUDGET)) { let n = int(ev[k], 0, 60, 0); if (!n) continue; n = sec.spend(user, 'eng:' + k, n, BUDGET[k][0], BUDGET[k][1], t); if (!n) continue;
            const kind = k === 'wood' || k === 'mine' ? 'gather' : k, skn = k === 'wood' ? 'woodcutting' : k === 'mine' ? 'mining' : null; bump(user, (q) => q.t === kind && (!skn || q.sk === skn || !q.sk), n); }
    }
    const countOf = (s, k) => k === 'maps' ? Object.keys(s.mv).length : k === 'species' ? Object.keys(s.kc).length : k === 'bosses' ? Object.keys(s.bc).length : Object.values(s.kc).reduce((a, b) => a + b, 0);
    function mClaim(user, b, ip) {
        const s = S(user), id = typeof b.id === 'string' ? b.id : ''; let rw = null, why = '';
        if (hasOwn(s.cl, id)) return fail('Você já recebeu esta recompensa.', 'DONE');
        if (E.MS_BY_ID[id]) {
            const m = E.MS_BY_ID[id], need = m.k === 'maps' && m.need === 0 ? worldMaps().length : m.need; if (!(need > 0)) return fail('Indisponível.');
            if (countOf(s, m.k) < need) return fail('Você ainda não chegou lá (' + countOf(s, m.k) + '/' + need + ').', 'PROG'); rw = { coins: m.coins, items: m.items || [] }; why = 'Códice: ' + m.name;
        } else if (/^sk:[A-Za-z0-9_\-]{1,40}$/.test(id)) {
            const sp = id.slice(3); if ((s.kc[sp] || 0) < E.SP_MARK) return fail('Você ainda não chegou lá (' + (s.kc[sp] || 0) + '/' + E.SP_MARK + ').', 'PROG'); rw = { coins: E.SP_REWARD, items: [] }; why = 'Códice: ' + nameOfSp(sp);
        } else if (/^ms:([a-z]{2,12}):(\d{1,2})$/.test(id)) {
            const mm = /^ms:([a-z]{2,12}):(\d{1,2})$/.exec(id), sk = mm[1], n = Number(mm[2]); if (!SKILLS.includes(sk) || !hasOwn(MASTERY_REWARD, n)) return fail('Marco inválido.');
            const ml = E.mastery(skillXp(user, sk)).lvl; if (ml < n) return fail('Maestria ainda baixa (' + ml + '/' + n + ').', 'PROG'); rw = MASTERY_REWARD[n]; why = 'Maestria';
        } else return fail('Marco inválido.');
        const given = deliver(user, rw, why); if (!given) return fail('O correio está cheio. Esvazie-o e tente de novo.', 'MAIL');
        s.cl[id] = now(); markDirty(); sec.slog('ENG-MILESTONE', user, ip, id + ' -> ' + given.map((x) => x[1] + 'x ' + x[0]).join(', '), true); return { ok: true, id, given };
    }
    function legendClaim(user, ip) {
        const t = now(), wk = prevWeek(t), g = db0(), board = g.board[wk]; const mine = board && hasOwn(board, user) ? board[user] : 0;
        if (!(mine > 0)) return fail('Você não participou do placar da semana passada.', 'NONE');
        if (g.bclaim[wk] && g.bclaim[wk][user]) return fail('Você já recebeu a recompensa da semana passada.', 'DONE');
        const top = topOf(wk, 3), pos = top.findIndex((x) => x.u === user); const rw = pos >= 0 && top[pos].dmg >= MIN_LEGEND_DMG ? LEGEND_REWARD[pos] : PART_REWARD;
        const given = deliver(user, rw, pos >= 0 ? 'Placar do Colosso: ' + (pos + 1) + 'º lugar' : 'Placar do Colosso'); if (!given) return fail('O correio está cheio. Esvazie-o e tente de novo.', 'MAIL');
        if (!g.bclaim[wk]) g.bclaim[wk] = nul(); g.bclaim[wk][user] = 1; markDirty(); sec.slog('ENG-BOARD', user, ip, wk + ' pos=' + (pos + 1) + ' -> ' + given.map((x) => x[1] + 'x ' + x[0]).join(', '), true); return { ok: true, pos: pos >= 0 ? pos + 1 : 0, given };
    }

    /* ---------- estado completo para o cliente ---------- */
    function state(user) {
        const t = now(), s = ensureQuests(user, t), today = E.dayKey(t), L = topCombat(user).L, c = topCombat(user);
        const claimedToday = s.dd >= today, nextDay = claimedToday ? (s.st % 7) + 1 : (s.dd === E.dayKey(t - E.DAY) ? (s.st % 7) + 1 : 1);
        const week = E.weekKey(t), board = topOf(week, 10), me = db0().board[week] && hasOwn(db0().board[week], user) ? db0().board[week][user] : 0;
        const allB = db0().board[week] || {}; const rank = me > 0 ? Object.keys(allB).filter((u) => allB[u] > me || (allB[u] === me && u < user)).length + 1 : 0;
        const pw = prevWeek(t), pBoard = db0().board[pw], pm = pBoard && hasOwn(pBoard, user) ? pBoard[user] : 0, lg = legend(t);
        const maps = worldMaps(), cl = {}; for (const k of Object.keys(s.cl)) cl[k] = 1;
        const quest = (p) => ({ k: s.q[p].k, bonus: s.q[p].b, list: s.q[p].l.map((q) => ({ id: q.id, t: q.t, sp: q.sp, sk: q.sk, need: q.need, p: q.p, c: q.c, item: q.item, done: q.done, name: E.describe(q, nameOfSp), xp: E.xpReward(q, BAL.levelForXp(skillXp(user, E.SKILL_BY_Q(q, c.k))), 0), xs: E.SKILL_BY_Q(q, c.k) })) });
        const bossFlags = {}; for (const k of Object.keys(s.bc)) bossFlags[k] = 1;
        return {
            ok: true, now: t, day: today, week, L, daily: { claimed: claimedToday, next: nextDay, streak: s.dd >= E.dayKey(t - E.DAY) ? s.st : 0, cycles: s.cy, total: s.tc, preview: E.DAILY.map((d, i) => E.dailyReward(i + 1, L)), msLeft: E.msToNextDay(t) },
            boost: { until: s.bu > t ? s.bu : 0, pct: s.bp },
            quests: { d: quest('d'), w: quest('w'), dLeft: E.msToNextDay(t), wLeft: E.msToNextWeek(t), bonusD: E.questBonus('d', L), bonusW: E.questBonus('w', L) },
            codex: { kills: s.kc, bosses: bossFlags, maps: Object.keys(s.mv), mapsTotal: maps.length, claimed: cl, names: Object.keys(s.kc).reduce((o, k) => { o[k] = nameOfSp(k); return o; }, {}) },
            events: E.eventsAt(t), invasion: invasion(t), legendNow: isLegend(user),
            board: { week, top: board, me: { dmg: me, rank }, prev: { week: pw, top: topOf(pw, 3), mine: pm, claimed: !!(db0().bclaim[pw] && db0().bclaim[pw][user]), legend: lg }, msLeft: E.msToNextWeek(t) }
        };
    }
    function act(user, b, ip) {
        b = b && typeof b === 'object' ? b : {};
        switch (b.a) {
            case 'state': return state(user);
            case 'prog': prog(user, b.ev); return { ok: true };
            case 'daily': { const r = dailyClaim(user, ip); return r; }
            case 'qclaim': return qClaim(user, b, ip);
            case 'qbonus': return qBonus(user, b, ip);
            case 'mclaim': return mClaim(user, b, ip);
            case 'lclaim': return legendClaim(user, ip);
            case 'rstate': return riftState(user);
            case 'rstart': return riftStart(user, b);
            case 'rend': return riftEnd(user, b);
            case 'rclaim': return riftClaim(user, b);
        }
        return fail('Ação desconhecida.');
    }
    const cleanEngage = (pd) => { if (pd && typeof pd === 'object' && pd.engage !== undefined) pd.engage = E.cleanClient(pd.engage, (n) => sec.knownItem(n)); };
    return { now, state, act, onKill, onVisit, onBossDamage, invasion, extraMob, isLegend, legend, cleanEngage, species, _S: S, _db0: db0 };
};
module.exports.cleanDB = cleanDB;
module.exports.cleanRift = cleanRift;
