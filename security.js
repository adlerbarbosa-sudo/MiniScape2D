'use strict';
/* MiniScape 2D - Segurança do servidor (anti-trapaça "sem autoridade total").
   Os dados do jogo (mochila, XP, moedas) vivem no cliente; aqui validamos o ENVELOPE do save e limitamos SALTOS impossíveis com tetos
   muito generosos (muito além do que um humano consegue). Em caso de violação só o campo suspeito volta ao valor anterior: nunca
   derruba a conta, nunca apaga nada. Admin é isento. SECURITY_STRICT=0 desliga as correções (continua só registrando no log). */
const fs = require('fs');
const path = require('path');

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const MAXQ = 2147483647;
const ITEM_RE = /^[\p{L}\p{N}_.'’()+%!:\- ]{1,40}$/u;   // letras, números e pontuação comum de nomes de item (nunca < > " & ` nem barras)
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SN = require('./public/skillnodes.js');
const BAL = require('./public/balance.js');   // balanceamento v2: tabela de XP, vida/mana, tetos de dano (fonte única, a mesma do cliente)   // dados compartilhados das árvores de habilidades (ids, ranks, custos)

module.exports = function createSecurity(opts) {
    const DATA_DIR = opts.dataDir, ROOT = opts.root;
    const getDB = opts.getDB;
    const STRICT = () => String(process.env.SECURITY_STRICT == null ? '1' : process.env.SECURITY_STRICT) !== '0';

    /* ---------------- log rotativo (sem senhas) ---------------- */
    const LOG = path.join(DATA_DIR, 'security.log'), LOG_MAX = 1024 * 1024, LOG_KEEP = 8;
    const lastLog = new Map();
    function rotate(file, keep) {   // file -> file.1 -> file.2 ... (descarta só o mais antigo)
        for (let i = keep - 1; i >= 1; i--) { try { fs.renameSync(file + '.' + i, file + '.' + (i + 1)); } catch (e) { } }
        fs.renameSync(file, file + '.1');
    }
    function slog(kind, user, ip, detail, always) {
        try {
            const key = kind + '|' + user; const now = Date.now(), l = lastLog.get(key);
            if (!always && l && now - l < 3000) return;   // não inunda o disco com a mesma coisa
            lastLog.set(key, now); if (lastLog.size > 2000) lastLog.clear();
            fs.mkdirSync(DATA_DIR, { recursive: true });
            try { if (fs.statSync(LOG).size > LOG_MAX) rotate(LOG, LOG_KEEP); } catch (e) { }
            const d = typeof detail === 'string' ? detail : JSON.stringify(detail || '');
            fs.appendFileSync(LOG, new Date().toISOString() + ' [' + kind + '] user=' + String(user || '-').replace(/[\r\n]/g, ' ').slice(0, 40) + ' ip=' + String(ip || '-').slice(0, 45) + ' ' + d.replace(/[\r\n]/g, ' ').slice(0, 400) + '\n');
        } catch (e) { }
    }

    /* ---------------- nomes de item conhecidos ---------------- */
    const known = new Set();
    function scanClient() {
        try {
            const dir = path.join(ROOT, 'public'); const re = /(['"`])((?:\\.|(?!\1)[^\\\n]){1,80})\1/g;
            for (const f of fs.readdirSync(dir)) {
                if (!/\.(js|html)$/.test(f)) continue; const s = fs.readFileSync(path.join(dir, f), 'utf8'); let m;
                while ((m = re.exec(s))) { const t = m[2]; if (t.includes('${')) continue; known.add(t.trim()); for (const p of t.split(/[|,]/)) known.add(p.trim()); }
            }
        } catch (e) { console.error('[SEC] varredura do cliente falhou:', e.message); }
        try { for (const n of JSON.parse(fs.readFileSync(path.join(ROOT, 'itemnames.json'), 'utf8'))) known.add(n); } catch (e) { }
        try { for (const n of require('./mimicnames').NAMES) known.add(n); } catch (e) { }
    }
    scanClient();
    const LEARN = path.join(DATA_DIR, 'learned-items.json');
    try { for (const n of JSON.parse(fs.readFileSync(LEARN, 'utf8'))) if (typeof n === 'string' && ITEM_RE.test(n)) known.add(n); } catch (e) { }
    let learnDirty = false;
    function learnItems(arr) {   // o admin envia o catálogo completo do cliente (itens novos entram sozinhos)
        if (!Array.isArray(arr)) return; let n = 0;
        for (const x of arr.slice(0, 3000)) if (typeof x === 'string' && ITEM_RE.test(x) && !known.has(x)) { known.add(x); n++; }
        if (n) { try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(LEARN, JSON.stringify([...known].filter(k => ITEM_RE.test(k)).slice(0, 20000))); } catch (e) { } }
    }
    function knownItem(name) {
        if (typeof name !== 'string' || !ITEM_RE.test(name)) return false;
        if (known.has(name)) return true;
        const db = getDB(); return !!(db.itemDB && hasOwn(db.itemDB, name));
    }

    /* ---------------- baldes de orçamento (impede "gotejar" ganhos em vários saves) ---------------- */
    const buckets = new Map();
    function spend(user, kind, amount, cap, perMin, now) {
        const key = user + '|' + kind; let b = buckets.get(key);
        if (!b) { b = { v: cap, t: now }; buckets.set(key, b); }
        b.v = Math.min(cap, b.v + (now - b.t) / 60000 * perMin); b.t = now;
        const ok = Math.min(amount, Math.floor(b.v)); b.v -= ok; return ok;
    }
    setInterval(() => { const n = Date.now(); for (const [k, b] of buckets) if (n - b.t > 3600000) buckets.delete(k); }, 600000).unref();

    /* ---------------- strikes ---------------- */
    const strikes = new Map();   // user -> {list:[ts...], lock:0, last:{kind:ts}}
    const LOCK_AT = +process.env.SEC_LOCK_STRIKES || 40, LOCK_WINDOW = 30 * 60000, LOCK_MS = 10 * 60000, STRIKE_GAP = 20000;
    /* Uma infração do MESMO tipo só soma 1 strike a cada 20 s: um falso positivo persistente (o cliente reenvia o mesmo save a cada 2,5 s) não tranca a conta em 2 minutos.
       A correção em si (voltar o campo suspeito ao valor anterior) vale sempre; o bloqueio é só para atividade suspeita sustentada. */
    function strike(user, ip, kind, n, detail) {
        let s = strikes.get(user); if (!s) { s = { list: [], lock: 0, last: Object.create(null) }; strikes.set(user, s); }
        const now = Date.now(); slog('STRIKE:' + kind, user, ip, detail);
        if (s.last[kind] && now - s.last[kind] < STRIKE_GAP) return; s.last[kind] = now;
        for (let i = 0; i < Math.min(10, n || 1); i++) s.list.push(now);
        s.list = s.list.filter(t => now - t < LOCK_WINDOW).slice(-500);
        if (s.list.length >= LOCK_AT && s.lock < now && kind !== 'speed') { s.lock = now + LOCK_MS; s.list = []; slog('LOCK', user, ip, 'saves bloqueados por ' + (LOCK_MS / 60000) + ' min (muitas violações)', true); }
    }
    function clearLock(user) { const s = strikes.get(user); if (!s) return false; s.lock = 0; s.list = []; s.last = Object.create(null); return true; }
    const strikeCount = (u) => { const s = strikes.get(u); return s ? s.list.length : 0; };
    const lockedUntil = (u) => { const s = strikes.get(u); return s && s.lock > Date.now() ? s.lock : 0; };
    setInterval(() => { const n = Date.now(); for (const [u, s] of strikes) { s.list = s.list.filter(t => n - t < LOCK_WINDOW); if (!s.list.length && s.lock < n) strikes.delete(u); } }, 300000).unref();

    /* ---------------- varredura profunda (protótipo, profundidade, tamanho, números) ---------------- */
    function scrub(root) {
        let nodes = 0;
        function go(v, depth) {
            if (v === null || typeof v === 'boolean') return v;
            if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
            if (typeof v === 'string') return v.length > 4000 ? v.slice(0, 4000) : v;
            if (typeof v !== 'object') return undefined;
            if (depth > 16 || ++nodes > 200000) throw new Error('deep');
            if (Array.isArray(v)) { const out = []; for (let i = 0; i < v.length; i++) { const x = go(v[i], depth + 1); out.push(x === undefined ? null : x); } return out; }
            const out = {};
            for (const k of Object.keys(v)) { if (BAD_KEYS.has(k) || k.length > 60) continue; const x = go(v[k], depth + 1); if (x !== undefined) out[k] = x; }
            return out;
        }
        try { return go(root, 0); } catch (e) { return undefined; }
    }

    /* cópia limpa para dados do ADMIN (mundo, catálogo de itens, NPCs): sem chaves de protótipo, números finitos, profundidade e tamanho limitados; strings longas são mantidas (ícones em data:) */
    function scrubDeep(root, maxNodes) {
        let nodes = 0; const lim = maxNodes || 3000000;
        function go(v, d) {
            if (v === null || typeof v === 'boolean') return v;
            if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
            if (typeof v === 'string') return v.length > 2000000 ? v.slice(0, 2000000) : v;
            if (typeof v !== 'object') return undefined;
            if (d > 24 || ++nodes > lim) throw new Error('deep');
            if (Array.isArray(v)) { const a = []; for (let i = 0; i < v.length; i++) { const y = go(v[i], d + 1); a.push(y === undefined ? null : y); } return a; }
            const out = {}; for (const k of Object.keys(v)) { if (BAD_KEYS.has(k) || k.length > 120) continue; const x = go(v[k], d + 1); if (x !== undefined) out[k] = x; } return out;
        }
        try { return go(root, 0); } catch (e) { return undefined; }
    }

    /* ---------------- perícias / stats ---------------- */
    const SK = { hp: ['Health', 1, 100], combat: ['Combat', 1, 100], defence: ['Defence', 1, 100], ranged: ['Ranged', 1, 100], magic: ['Magic', 1, 100], prayer: ['Prayer', 1, 50], woodcutting: ['Woodcut', 1, 50], mining: ['Mining', 1, 50], smithing: ['Smithing', 1, 50], firemaking: ['Firemk', 1, 50], cooking: ['Cooking', 1, 50], crafting: ['Crafting', 1, 50], fishing: ['Fishing', 1, 50], farming: ['Farming', 1, 50], alchemy: ['Alchemy', 1, 50], enchanting: ['Enchant', 1, 50] };
    // XP agora é TOTAL (tabela do RuneScape em balance.js): o nível é sempre derivado do XP
    const totalXp = (key, level, xp) => Math.max(0, Number(xp) || 0);
    const nextFor = (key, level) => BAL.xpNext(level);
    const num = (v, a, b, d) => (typeof v === 'number' && Number.isFinite(v)) ? Math.max(a, Math.min(b, v)) : d;
    const int = (v, a, b, d) => { v = Math.floor(Number(v)); return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };

    /* limites de campos numéricos de itens (muito acima do maior valor legítimo do catálogo + encantos + Mímicos nível 50) */
    const ITEM_CAPS = { bonusDmg: 200, defBonus: 200, heal: 5000, mp: 1000, cookXp: 5000, tier: 12, bait: 12, shopQty: 1000, luck: 100, crit: 100, critDmg: 400, moveSpd: 100, atkSpd: 100, lifesteal: 50, dr: 80, spellDmg: 100, save: 100, cdr: 60, craftQty: 1000, weight: 1000, value: 100000000, ench: 12 };
    const HEX = /^#[0-9a-fA-F]{6}$/;
    function cleanItem(it, ctx) {
        if (!it || typeof it !== 'object' || Array.isArray(it)) return null;
        if (typeof it.name !== 'string' || !ITEM_RE.test(it.name)) return null;
        if (!knownItem(it.name) && !ctx.prevNames.has(it.name)) return null;   // nome inventado (nomes que já estavam no save anterior são mantidos)
        const o = {};
        for (const k of Object.keys(it)) {
            const v = it[k];
            if (k === 'qty') continue;
            if (hasOwn(ITEM_CAPS, k)) { if (typeof v === 'number') { const c = num(v, -ITEM_CAPS[k], ITEM_CAPS[k], 0); if (c !== v) ctx.clamped++; o[k] = c; } continue; }
            if (k === 'col' || k === 'gem') { if (typeof v === 'string' && HEX.test(v)) o[k] = v; continue; }
            if (typeof v === 'string') o[k] = v.slice(0, 300);
            else if (typeof v === 'number' || typeof v === 'boolean' || v === null) o[k] = v;
            else if (v && typeof v === 'object' && JSON.stringify(v).length <= 400) o[k] = v;
        }
        if (it.qty !== undefined) {
            const q = it.qty;
            if (typeof q !== 'number' || !Number.isInteger(q) || q < 1 || q > MAXQ) { ctx.badQty++; return null; }
            o.qty = q;
        }
        return o;
    }
    function cleanList(arr, max, ctx) {
        if (!Array.isArray(arr)) return [];
        const out = [];
        for (const it of arr.slice(0, max)) { if (it === null) continue; const c = cleanItem(it, ctx); if (c) out.push(c); else ctx.dropped++; }
        return out;
    }
    const SLOTS = ['head', 'body', 'weapon', 'shield', 'ammo', 'amulet', 'ring'];
    function cleanEquip(eq, ctx) {
        const out = {}; if (!eq || typeof eq !== 'object' || Array.isArray(eq)) { for (const s of SLOTS) out[s] = null; return out; }
        for (const s of SLOTS) { const c = eq[s] ? cleanItem(eq[s], ctx) : null; if (eq[s] && !c) ctx.dropped++; out[s] = c; }
        return out;
    }
    function totals(pd) {
        const t = new Map(), ns = new Set();
        const add = (name, q, stack) => { if (typeof name !== 'string') return; t.set(name, (t.get(name) || 0) + q); if (!stack) ns.add(name); };
        const each = (it) => { if (it && typeof it.name === 'string') add(it.name, (typeof it.qty === 'number' ? it.qty : 1), it.stackable === true || typeof it.qty === 'number'); };
        for (const it of (pd.inventory || [])) each(it);
        for (const it of (pd.bank || [])) each(it);
        if (pd.equipment) for (const s of Object.keys(pd.equipment)) each(pd.equipment[s]);
        if (pd.escrow && Array.isArray(pd.escrow.items)) for (const e of pd.escrow.items) if (Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'number') add(e[0], e[1], true);
        if (pd.mkt) { if (pd.mkt.create && typeof pd.mkt.create.item === 'string' && typeof pd.mkt.create.qty === 'number') add(pd.mkt.create.item, pd.mkt.create.qty, true); if (pd.mkt.buy && typeof pd.mkt.buy.price === 'number') add('Coins', pd.mkt.buy.price, true); }
        return { t, ns };
    }
    function trim(pd, name, excess) {   // tira "excess" unidades de "name" (mochila, depois banco, depois equipamento)
        const cut = (list) => { for (let i = list.length - 1; i >= 0 && excess > 0; i--) { const it = list[i]; if (!it || it.name !== name) continue; if (typeof it.qty === 'number') { const r = Math.min(it.qty, excess); it.qty -= r; excess -= r; if (it.qty <= 0) list.splice(i, 1); } else { list.splice(i, 1); excess--; } } };
        cut(pd.inventory || []); cut(pd.bank || []);
        if (excess > 0 && pd.equipment) for (const s of SLOTS) { const it = pd.equipment[s]; if (excess > 0 && it && it.name === name) { if (typeof it.qty === 'number') { const r = Math.min(it.qty, excess); it.qty -= r; excess -= r; if (it.qty <= 0) pd.equipment[s] = null; } else { pd.equipment[s] = null; excess--; } } }
    }

    /* itens/moedas que o SERVIDOR entregou ao jogador e que o cliente ainda vai gravar: correio (mercado/presentes) e trocas concluídas */
    function credits(user, prev) {
        const db = getDB(), c = new Map(); const add = (n, q) => { if (typeof n === 'string' && Number.isFinite(q) && q > 0) c.set(n, (c.get(n) || 0) + q); };
        /* um crédito vale UMA vez: depois que um save aceito já traz o id em mailDone/tradeDone, o item faz parte da linha de base (prev) e deixa de ser crédito.
           Sem isso, quem não confirma o correio poderia "regravar" o mesmo item várias vezes e duplicá-lo. */
        const mdone = new Set(prev && Array.isArray(prev.mailDone) ? prev.mailDone : []), tdone = new Set(prev && Array.isArray(prev.tradeDone) ? prev.tradeDone : []);
        try {
            const mail = db.market && db.market.mail && db.market.mail[user]; if (Array.isArray(mail)) for (const e of mail) if (e && !mdone.has(e.id)) add(e.item, e.qty);
            if (db.trades) for (const id of Object.keys(db.trades)) {
                const t = db.trades[id]; if (!t || t.st !== 'done' || tdone.has(t.id)) continue;   // troca concluída: só o que o OUTRO lado ofereceu (a devolução de depósito já está contada no escrow)
                const s = t.a === user ? 'a' : t.b === user ? 'b' : null; if (!s || (t.applied && t.applied[s])) continue; const o = s === 'a' ? 'b' : 'a';
                for (const e of (t.offer && t.offer[o]) || []) add(e[0], e[1]);
            }
        } catch (e) { }
        return c;
    }

    /* ---------------- árvore de habilidades (playerData.skillTree) ---------------- */
    function cleanTree(user, ip, pd, role, skillsOverride) {   // limpa pd.skillTree no lugar (idempotente) e devolve {hp, mp} (vida/mana máx. permitidas pela árvore)
        if (pd.skillTree === undefined) return { hp: 0, mp: 0 };
        const src = skillsOverride || (pd.stats && pd.stats.skills) || {}, lv = {};
        for (const k of ['combat', 'ranged', 'magic']) lv[k] = int(src[k] && src[k].level, 1, 99, 1);
        const r = SN.clean(pd.skillTree, lv, Date.now());
        if (r.forged > 0) { if (role !== 'admin') strike(user, ip, 'skilltree', 1, 'skillTree forjada: ' + r.forged + ' entrada(s) inválida(s) (nó inexistente, rank impossível ou tipo errado)'); else slog('SKILLTREE', user, ip, 'admin: ' + r.forged + ' entrada(s) inválida(s) descartada(s)'); }
        else if (r.trimmed > 0) slog('SKILLTREE', user, ip, 'árvore ajustada: ' + r.trimmed + ' rank(s) removido(s) (pré-requisito ou pontos acima do permitido pelas perícias)');
        try {   // Prestígio de habilidade: só se já estava no save anterior ou se o rank máximo foi atingido (neste save ou no anterior)
            const old = getDB().users && hasOwn(getDB().users, user) ? getDB().users[user].playerData : null, ot = old && old.skillTree && typeof old.skillTree === 'object' ? old.skillTree : {}, opr = ot.pr && typeof ot.pr === 'object' ? ot.pr : {}, opts = ot.pts && typeof ot.pts === 'object' ? ot.pts : {};
            for (const id of Object.keys(r.tree.pr || {})) { const n = SN.NODES[id]; if (opr[id] === 1) continue; if (SN.rankOf(r.tree.pts[n.tree], id) >= n.max || SN.rankOf(opts[n.tree], id) >= n.max) continue; delete r.tree.pr[id]; slog('SKILLTREE', user, ip, 'prestígio de habilidade removido (rank máximo não atingido): ' + id); }
        } catch (e) { }
        { const bb = SN.bonusAll(r.tree); r.tree.ap = { hp: Math.round(bb.maxHp || 0), mp: Math.round(bb.maxMp || 0) }; }
        pd.skillTree = r.tree; return r.tree.ap;
    }

    /* ---------------- validação do save ---------------- */
    const MAP_RE = /^[\w\-]{1,40}$/;
    function mapSize(map) { const db = getDB(); const m = db.worldData && hasOwn(db.worldData, map) ? db.worldData[map] : null; return m ? [num(m.width, 100, 20000, 2000), num(m.height, 100, 20000, 2000)] : null; }
    function checkSave(user, role, pd0, ip) {
        const db = getDB(); const now = Date.now(); const u = db.users[user]; const prev = u && u.playerData && typeof u.playerData === 'object' ? u.playerData : null;
        const pd = scrub(pd0); if (pd === undefined || !pd || typeof pd !== 'object' || Array.isArray(pd)) return { error: 'Não foi possível salvar o seu progresso agora. Tente de novo em instantes.' };
        const admin = role === 'admin', strict = STRICT() && !admin;
        const ctx = { prevNames: new Set(), clamped: 0, badQty: 0, dropped: 0 };
        if (prev) { for (const l of [prev.inventory, prev.bank]) if (Array.isArray(l)) for (const it of l) if (it && typeof it.name === 'string') ctx.prevNames.add(it.name); if (prev.equipment) for (const s of Object.keys(prev.equipment)) if (prev.equipment[s] && prev.equipment[s].name) ctx.prevNames.add(prev.equipment[s].name); }
        const notes = [], env = []; let n = 0;
        /* 1) envelope: listas de itens, equipamento, posição, stats */
        if (admin) { /* admin: mantém o conteúdo, só passou pela varredura profunda */ }
        else {
            pd.inventory = cleanList(pd.inventory, 120, ctx); pd.bank = cleanList(pd.bank, 130, ctx); pd.equipment = cleanEquip(pd.equipment, ctx);
            if (pd.escrow !== undefined && pd.escrow !== null) {
                const e = pd.escrow; if (!e || typeof e !== 'object' || !Array.isArray(e.items) || typeof e.id !== 'string') pd.escrow = null;
                else pd.escrow = { id: e.id.slice(0, 60), items: e.items.slice(0, 8).filter(x => Array.isArray(x) && typeof x[0] === 'string' && ITEM_RE.test(x[0]) && Number.isInteger(x[1]) && x[1] >= 1 && x[1] <= MAXQ).map(x => [x[0], x[1]]) };
            }
            if (pd.mkt !== undefined && pd.mkt !== null) {
                const m = pd.mkt, ok = m && typeof m === 'object' && !Array.isArray(m); const o = {};
                if (ok && m.create && typeof m.create === 'object' && typeof m.create.item === 'string' && ITEM_RE.test(m.create.item) && Number.isInteger(m.create.qty) && m.create.qty >= 1 && m.create.qty <= MAXQ && Number.isInteger(m.create.price) && m.create.price >= 1 && m.create.price <= MAXQ) o.create = { item: m.create.item, qty: m.create.qty, price: m.create.price, nonce: String(m.create.nonce || '').slice(0, 40) };
                if (ok && m.buy && typeof m.buy === 'object' && typeof m.buy.id === 'string' && Number.isInteger(m.buy.price) && m.buy.price >= 1 && m.buy.price <= MAXQ) { o.buy = { id: m.buy.id.slice(0, 80), price: m.buy.price, nonce: String(m.buy.nonce || '').slice(0, 40) }; if (Number.isInteger(m.buy.qty) && m.buy.qty >= 1 && m.buy.qty <= MAXQ) o.buy.qty = m.buy.qty; }
                pd.mkt = (o.create || o.buy) ? o : null;
            }
            if (typeof pd.x !== 'number') delete pd.x; if (typeof pd.y !== 'number') delete pd.y;
            if (pd.currentMap !== undefined && (typeof pd.currentMap !== 'string' || !MAP_RE.test(pd.currentMap))) { pd.currentMap = prev && typeof prev.currentMap === 'string' ? prev.currentMap : 'lumbridge'; n++; }
            if (typeof pd.currentMap === 'string' && !/^casa_/.test(pd.currentMap) && db.worldData && !hasOwn(db.worldData, pd.currentMap) && hasOwn(db.worldData, 'lumbridge')) { pd.currentMap = 'lumbridge'; if (typeof pd.x === 'number') { /* posição vale para o mapa antigo */ } }
            const sz = mapSize(pd.currentMap);
            const W = sz ? sz[0] : 20000, H = sz ? sz[1] : 20000;
            if (typeof pd.x === 'number') pd.x = Math.max(0, Math.min(W, pd.x)); if (typeof pd.y === 'number') pd.y = Math.max(0, Math.min(H, pd.y));
            if (Array.isArray(pd.qb)) pd.qb = pd.qb.slice(0, 5).map(x => (typeof x === 'string' && x.length <= 40) ? x : null); else if (pd.qb !== undefined) delete pd.qb;
            if (Array.isArray(pd.mailDone)) pd.mailDone = pd.mailDone.filter(x => typeof x === 'string' && x.length <= 60).slice(-200); else if (pd.mailDone !== undefined) delete pd.mailDone;
            if (Array.isArray(pd.tradeDone)) pd.tradeDone = pd.tradeDone.filter(x => typeof x === 'string' && x.length <= 60).slice(-40); else if (pd.tradeDone !== undefined) delete pd.tradeDone;
            if (pd.taken !== undefined) { if (pd.taken && typeof pd.taken === 'object' && !Array.isArray(pd.taken)) { const o = {}; let c = 0; for (const k of Object.keys(pd.taken)) { if (c >= 600) break; if (/^[\w\-]{1,70}$/.test(k) && typeof pd.taken[k] === 'number') { o[k] = pd.taken[k]; c++; } } pd.taken = o; } else delete pd.taken; }
            if (pd.house !== undefined) {
                const h = pd.house; if (!h || typeof h !== 'object' || Array.isArray(h)) delete pd.house; else {
                    h.items = Array.isArray(h.items) ? h.items.slice(0, 200).filter(x => x && typeof x === 'object' && typeof x.k === 'string' && /^\w{1,24}$/.test(x.k) && Number.isFinite(x.x) && Number.isFinite(x.y)).map(x => ({ k: x.k, x: Math.max(-5000, Math.min(5000, x.x)), y: Math.max(-5000, Math.min(5000, x.y)), r: (x.r | 0) & 3 })) : [];
                    if (h.stock && typeof h.stock === 'object' && !Array.isArray(h.stock)) { const st = {}; let c = 0; for (const k of Object.keys(h.stock)) { if (c >= 60) break; if (/^\w{1,24}$/.test(k) && Number.isFinite(h.stock[k]) && h.stock[k] > 0) { st[k] = Math.min(60, h.stock[k] | 0); c++; } } h.stock = st; } else delete h.stock;
                    if (h.train && typeof h.train === 'object' && !Array.isArray(h.train)) { const tr = { d: typeof h.train.d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(h.train.d) ? h.train.d : '', n: {} }; if (h.train.n && typeof h.train.n === 'object') for (const k of Object.keys(h.train.n).slice(0, 20)) if (/^\w{1,24}$/.test(k) && Number.isFinite(h.train.n[k])) tr.n[k] = Math.max(0, Math.min(50, h.train.n[k] | 0)); h.train = tr; } else delete h.train;
                    if (h.exit && typeof h.exit === 'object' && typeof h.exit.m === 'string' && MAP_RE.test(h.exit.m) && Number.isFinite(h.exit.x) && Number.isFinite(h.exit.y)) h.exit = { m: h.exit.m, x: Math.round(h.exit.x), y: Math.round(h.exit.y) }; else delete h.exit;   // móveis: só {k, x, y}
                    h.guests = Array.isArray(h.guests) ? h.guests.slice(0, 30).filter(x => typeof x === 'string' && /^[\p{L}\p{N}_.\- ]{1,20}$/u.test(x)) : [];
                }
            }
            /* stats e perícias */
            const st = pd.stats && typeof pd.stats === 'object' && !Array.isArray(pd.stats) ? pd.stats : null;
            if (!st) { pd.stats = prev && prev.stats ? JSON.parse(JSON.stringify(prev.stats)) : undefined; if (!pd.stats) delete pd.stats; n++; }
            else {
                const sk0 = st.skills && typeof st.skills === 'object' && !Array.isArray(st.skills) ? st.skills : {}; const sk = {};
                const psk = prev && prev.stats && prev.stats.skills ? prev.stats.skills : {};
                for (const key of Object.keys(sk0)) {
                    if (!hasOwn(SK, key)) continue; const s = sk0[key]; if (!s || typeof s !== 'object') continue;
                    const xp = int(s.xp, 0, BAL.MAX_XP, 0), lvl = BAL.levelForXp(xp);   // XP manda: o nível é o que a tabela dá para esse XP (nunca um nível sem XP)
                    sk[key] = { level: BAL.levelForXp(xp), xp, next: BAL.xpNext(BAL.levelForXp(xp)), name: SK[key][0] };
                    if (s.level !== sk[key].level) n++;
                    if (strict && hasOwn(psk, key) && psk[key] && typeof psk[key].level === 'number') {
                        const p = psk[key], pxp = int(p.xp, 0, BAL.MAX_XP, 0), pl = BAL.levelForXp(pxp);
                        const gain = xp - pxp;
                        if (gain > 0) {   // orçamento generoso (jogo limpo nunca chega perto): ~4 mil XP/s sustentados por perícia, ou 1 milhão de uma vez (vários minutos sem salvar)
                            const mx = mobXpCeil(now), allow = spend(user, 'xp:' + key, gain, BAL.XP_BUDGET.cap * 2 + mx * 12, BAL.XP_BUDGET.perMin * 4 + mx * 6, now);   // monstros do Dev com XP base alto aumentam o orçamento (XP por golpe = xpBase x dano/vida)
                            if (allow < gain) { sk[key] = { level: pl, xp: pxp, next: BAL.xpNext(pl), name: SK[key][0] }; notes.push('xp:' + key + '+' + gain); n++; }
                        }
                    }
                }
                st.skills = sk;
                try {   // Prestígio de perícia: 0..5 estrelas; só sobe 1 por vez e só se a perícia estava no nível 99 no save anterior
                    const pp = prev && prev.prestige && typeof prev.prestige === 'object' ? prev.prestige : {}, np = pd.prestige && typeof pd.prestige === 'object' && !Array.isArray(pd.prestige) ? pd.prestige : {}, outp = {};
                    for (const key of Object.keys(np)) { if (!hasOwn(SK, key) || key === 'hp') continue; const want = int(np[key], 0, 5, 0), had = int(pp[key], 0, 5, 0); let v = want; if (want > had) { const pl = psk[key] && psk[key].xp !== undefined ? BAL.levelForXp(int(psk[key].xp, 0, BAL.MAX_XP, 0)) : 1; v = (pl >= 99 && want === had + 1) ? want : had; } else if (want < had) v = had; if (v > 0) outp[key] = v; }
                    for (const key of Object.keys(pp)) if (!outp[key] && hasOwn(SK, key)) outp[key] = int(pp[key], 0, 5, 0);
                    pd.prestige = outp;
                } catch (e) { }
                const tb = cleanTree(user, ip, pd, role, sk);   // a árvore de habilidades pode somar vida/mana máx. (já embutidas no maxHp/maxMp salvos)
                const hpL = sk.hp ? sk.hp.level : 1, mgL = sk.magic ? sk.magic.level : 1, hpLim = BAL.maxHpAllowed(hpL, tb.hp), mpLim = BAL.maxMpAllowed(mgL, tb.mp);   // 100 + 10 por nível de Vitalidade + classe/raça/árvore (com folga)
                const maxHp = num(st.maxHp, 1, hpLim, prev && prev.stats ? num(prev.stats.maxHp, 1, hpLim, BAL.maxHpForLevel(hpL)) : BAL.maxHpForLevel(hpL));
                if (st.maxHp !== maxHp && strict) { n++; notes.push('maxHp'); }
                st.maxHp = strict ? maxHp : st.maxHp; st.hp = num(st.hp, 0, st.maxHp, st.maxHp);
                st.maxMp = num(st.maxMp, 1, mpLim, BAL.maxMpForLevel(mgL)); st.mp = num(st.mp, 0, st.maxMp, st.maxMp);
                pd.stats = st;
            }
            /* 2) progressão: itens e moedas contra o save anterior (+ créditos entregues pelo servidor) */
            if (strict) {
                const cr = credits(user, prev); const a = totals(prev || { inventory: [], bank: [], equipment: {} }), b = totals(pd); let newDistinct = 0;
                for (const [name, q] of b.t) {
                    const before = a.t.get(name) || 0; let gain = q - before - (cr.get(name) || 0);
                    if (before === 0 && q > 0 && b.ns.has(name) && !cr.has(name)) newDistinct++;
                    if (gain <= 0) continue;
                    const stack = !b.ns.has(name);
                    const kind = name === 'Coins' ? 'coins' : stack ? 'stack:' + name : 'item:' + name;
                    const cap = name === 'Coins' ? 2000000 : stack ? 100000 : 150, rate = name === 'Coins' ? 60000 : stack ? 5000 : 15;
                    const allow = spend(user, kind, gain, cap, rate, now);
                    if (allow < gain) { const ex = gain - allow; trim(pd, name, ex); notes.push('item:' + name + '+' + ex); n++; }
                }
                if (newDistinct > 0) {
                    const allow = spend(user, 'distinct', newDistinct, 60, 6, now);
                    if (allow < newDistinct) { notes.push('distinct+' + (newDistinct - allow)); n++; let over = newDistinct - allow; for (const [name] of b.t) { if (over <= 0) break; if ((a.t.get(name) || 0) === 0 && b.ns.has(name) && !cr.has(name)) { trim(pd, name, 1e9); over--; } } }
                }
                /* Itens Mímicos são EXCLUSIVOS DO ADMIN: só podem aparecer se já estavam na conta (save anterior) ou chegaram pelo correio (presente / missão especial). Qualquer outra "origem" é revertida. */
                const MM = require('./mimicnames'), tt = totals(pd).t;
                for (const [nm, t] of tt) {
                    if (!MM.NAMES.has(nm)) continue;
                    const allowed = (a.t.get(nm) || 0) + (cr.get(nm) || 0);
                    if (t > allowed) { trim(pd, nm, t - allowed); notes.push('mimic-sem-presente:' + nm); n++; if (t - allowed >= t && pd.mimic && typeof pd.mimic === 'object' && !(a.t.get(nm) || 0)) delete pd.mimic[nm]; }   // peça forjada some inteira, inclusive o estado
                    else if (MM.PIECES.has(nm) && t > 1) { trim(pd, nm, t - 1); notes.push('mimic-dup:' + nm); n++; }
                }
            }
        }
        /* correções de ENVELOPE (item inventado, quantidade inválida, campo fora do limite) são só registradas: sem strike, para um dado "estranho" legítimo nunca virar bloqueio */
        if (ctx.dropped) env.push('itens-invalidos:' + ctx.dropped);
        if (ctx.badQty) env.push('qty-invalida:' + ctx.badQty);
        if (ctx.clamped) env.push('stats-item-clamp:' + ctx.clamped);
        if (env.length) slog('SAVE-FIX', user, ip, env.join(' '));
        if (notes.length) strike(user, ip, 'save', Math.max(1, notes.length), notes.join(' '));
        pd._sv = { t: now };
        return { pd, notes: notes.concat(env) };
    }
    /* depois de limpar pets/mímicos/montarias (extras/mimicnames): limita quantas coleções novas aparecem num intervalo curto */
    function checkCollections(user, role, pd, prev, ip) {
        if (role === 'admin' || !STRICT()) return;
        const now = Date.now(); const cnt = (o) => (o && typeof o === 'object') ? Object.keys(o).length : 0;
        const keys = (o) => (o && typeof o === 'object') ? Object.keys(o) : [];
        for (const k of ['pets', 'mounts']) {   // Mímicos fora daqui: só chegam por presente (conferido item a item no checkSave), então um set inteiro de uma vez é legítimo
            const before = new Set(keys(prev && prev[k])); const added = keys(pd[k]).filter(x => !before.has(x));
            if (!added.length) continue;
            const allow = spend(user, 'coll', added.length, 12, 0.5, now);
            if (allow < added.length) { for (const x of added.slice(allow)) delete pd[k][x]; strike(user, ip, 'coll', added.length - allow, k + ' novos: ' + added.slice(allow).join(',')); }
        }
        if (pd.mounts && typeof pd.mounts === 'object') {   // XP das montarias: orçamento por minuto (cavalgar ~300 XP/min + até 40% do XP do jogador, que já tem orçamento próprio); montaria nova começa no nível 1
            const cum = (v) => { let t = (v && v.xp) || 0; for (let l = 1; l < ((v && v.lvl) || 1); l++) t += Math.round(250 * Math.pow(1.2, l - 1)); return t; };
            let up = 0; const ups = [];
            for (const k of Object.keys(pd.mounts)) {   // montaria nova ainda não vista no save anterior conta a partir do nível 1 (o save pode atrasar em relação à compra)
                const pv = prev && prev.mounts && prev.mounts[k], p = pv && typeof pv === 'object' ? pv : { lvl: 1, xp: 0 }, n = pd.mounts[k];
                const d = cum(n) - cum(p); if (d > 0) { up += d; ups.push(k); }
            }
            if (up) {
                const allow = spend(user, 'mxp', up, 150000, 30000, now);
                if (allow < up) {
                    for (const k of ups) { const pv = prev && prev.mounts && prev.mounts[k], p = pv && typeof pv === 'object' ? pv : { lvl: 1, xp: 0 }; const nm = pd.mounts[k].name; pd.mounts[k] = { lvl: p.lvl, xp: p.xp }; if (nm) pd.mounts[k].name = nm; }
                    strike(user, ip, 'mxp', Math.min(10, Math.ceil((up - allow) / 5000)), 'XP de montaria revertido: ' + ups.join(','));
                }
            }
        }
        if (Array.isArray(pd.mimicSkins)) {   // aparências especiais: só com o item de presente (já na mochila/banco do save anterior ou ainda no correio)
            const MM = require('./mimicnames'), had = new Set(Array.isArray(prev && prev.mimicSkins) ? prev.mimicSkins : []);
            const pt = totals(prev || { inventory: [], bank: [], equipment: {} }).t, cr = credits(user, prev);
            const keep = pd.mimicSkins.filter((id) => had.has(id) || (MM.SPECIAL[id] && ((pt.get(MM.SPECIAL[id]) || 0) > 0 || (cr.get(MM.SPECIAL[id]) || 0) > 0)));
            if (keep.length !== pd.mimicSkins.length) { strike(user, ip, 'mimicskin', 1, 'aparência sem presente revertida: ' + pd.mimicSkins.filter((x) => !keep.includes(x)).join(',')); pd.mimicSkins = keep; if (pd.mimic) for (const k of Object.keys(pd.mimic)) if (pd.mimic[k].skin && !keep.includes(pd.mimic[k].skin) && !(MM.SKINS[pd.mimic[k].skin] > 0)) delete pd.mimic[k].skin; }
        }
        if (pd.mimic && prev && prev.mimic) {   // níveis dos Mímicos
            let up = 0; for (const k of Object.keys(pd.mimic)) { const p = prev.mimic[k]; if (p && pd.mimic[k].lvl > p.lvl) up += pd.mimic[k].lvl - p.lvl; }
            if (up) { const allow = spend(user, 'mimiclv', up, 25, 3, now); if (allow < up) { for (const k of Object.keys(pd.mimic)) { const p = prev.mimic[k]; if (p) pd.mimic[k] = { lvl: p.lvl, xp: p.xp }; } strike(user, ip, 'mimiclv', up - allow, 'níveis de Mímico revertidos'); } }
        }
    }

    /* ---------------- equipamento visto pelos outros jogadores (campos conhecidos apenas) ---------------- */
    function cleanSyncEquip(eq) {
        if (!eq || typeof eq !== 'object' || Array.isArray(eq)) return null; const out = {};
        for (const s of SLOTS) {
            const it = eq[s]; if (!it || typeof it !== 'object' || Array.isArray(it) || typeof it.name !== 'string' || !ITEM_RE.test(it.name)) { out[s] = null; continue; }
            const o = { name: it.name };
            for (const k of ['tool', 'hat', 'slot', 'type', 'set']) if (typeof it[k] === 'string' && /^[\w\-]{1,24}$/.test(it[k])) o[k] = it[k];
            for (const k of ['col', 'gem']) if (typeof it[k] === 'string' && HEX.test(it[k])) o[k] = it[k];
            for (const k of ['robe', 'mimic', 'stackable']) if (it[k] === true) o[k] = true;
            if (Number.isFinite(it.mst)) o.mst = int(it.mst, 0, 3, 0); if (typeof it.msk === 'string' && /^[a-z]{3,10}$/.test(it.msk)) o.msk = it.msk;
            if (Number.isFinite(it.ench)) o.ench = int(it.ench, 0, 12, 0); if (Number.isFinite(it.qty)) o.qty = int(it.qty, 0, MAXQ, 0);
            if (typeof it.icon === 'string' && it.icon.length <= 16 && !/[<>&"']/.test(it.icon)) o.icon = it.icon;
            out[s] = o;
        }
        return out;
    }

    /* ---------------- movimento ---------------- */
    const MAX_SPEED = 270;   // px/s: 2,5 px por quadro x 60 + 80% (teto global de velocidade)
    const farMap = new Map();   // user -> {x,y,n}: posição "distante" que se repete (respawn/teleporte legítimo)
    setInterval(() => { farMap.clear(); }, 600000).unref();
    const tpAt = new Map();   // último teleporte avisado pelo cliente (no máx. 1 por segundo por jogador: quem exagera volta a ser contado)
    function checkMove(user, role, prev, map, x, y, now, ip, tp) {
        if (!prev || role === 'admin' || !STRICT() || prev.map !== map || now - prev.lastSeen > 6000) { farMap.delete(user); return { x, y, ok: true, reset: true }; }
        if (tp && now - (tpAt.get(user) || 0) > 1000) { tpAt.set(user, now); farMap.delete(user); return { x, y, ok: true, tele: true }; }
        const dt = Math.min(30, Math.max(0, (now - prev.lastSeen) / 1000)); const allowed = 3 * MAX_SPEED * (dt + 0.4) + 80;
        const dist = Math.hypot(x - prev.x, y - prev.y);
        if (dist <= allowed) { farMap.delete(user); return { x, y, ok: true }; }
        const f = farMap.get(user);
        if (f && Math.hypot(x - f.x, y - f.y) <= allowed) { f.x = x; f.y = y; f.n++; if (f.n >= 3) { farMap.delete(user); slog('TELEPORT', user, ip, 'deslocamento ' + Math.round(dist) + 'px aceito após 3 syncs (respawn/teleporte?)'); return { x, y, ok: true, tele: true }; } }
        else farMap.set(user, { x, y, n: 1 });
        strike(user, ip, 'speed', 1, 'deslocamento ' + Math.round(dist) + 'px em ' + Math.round(dt * 1000) + 'ms (permitido ' + Math.round(allowed) + ') mapa ' + map);
        return { x: prev.x, y: prev.y, ok: false };
    }

    /* ---------------- dano ---------------- */
    function topCombat(user) {
        const db = getDB(); const u = db.users[user]; const sk = u && u.playerData && u.playerData.stats && u.playerData.stats.skills;
        let L = 1; if (sk) for (const k of ['combat', 'ranged', 'magic']) if (sk[k] && Number.isFinite(sk[k].level)) L = Math.max(L, Math.min(99, sk[k].level));
        return L;
    }
    // teto de UM golpe e de dano por segundo (Balance.hitCap / dmgPerSecCap: melhor arma do nível x habilidade x crítico x bônus, com folga); admin é isento no chamador
    const hitCap = (user) => BAL.hitCap(topCombat(user));
    const dmgPerSec = (user) => BAL.dmgPerSecCap(topCombat(user));
    const dmgRate = new Map();
    function dmgOk(user, now) {   // no máximo 20 relatórios de dano por segundo
        let r = dmgRate.get(user); if (!r || now - r.t > 1000) { r = { t: now, n: 0 }; dmgRate.set(user, r); } return ++r.n <= 20;
    }
    setInterval(() => { const n = Date.now(); for (const [k, r] of dmgRate) if (n - r.t > 5000) dmgRate.delete(k); }, 60000).unref();
    let _mxc = { t: 0, v: 0 };
    function mobXpCeil(now) {   // maior XP base entre os monstros do catálogo (cache de 10 s)
        if (now - _mxc.t < 10000) return _mxc.v; let v = 0; try { const c = getDB().npcDB; if (c) for (const k of Object.keys(c)) { const x = c[k] && Number(c[k].xp); if (x > v) v = x; } } catch (e) { }
        _mxc = { t: now, v: Math.min(BAL.MAX_MOB_XP, v) }; return _mxc.v;
    }
    function expectedMaxHp(map, id) {
        const db = getDB(); try {
            if (String(id) === '424242') { const d = db.npcDB && db.npcDB.wboss_golem; return d && d.hp > 0 ? d.hp : BAL.mobTable(50, 'world').hp; }
            const m = db.worldData && hasOwn(db.worldData, map) ? db.worldData[map] : null; if (!m || !Array.isArray(m.entities)) return 0;
            const e = m.entities.find(o => o && String(o.id) === String(id)); if (!e) { const x = opts.extraMob && opts.extraMob(map, id); return x && x.hp > 0 ? Math.min(2000000, x.hp) : 0; }
            const d = e.dbKey && db.npcDB && hasOwn(db.npcDB, e.dbKey) ? db.npcDB[e.dbKey] : null; const hp = e.maxHp || (d && d.hp) || e.hp || 0; return hp > 0 ? Math.min(2000000, hp) : 0;
        } catch (e) { return 0; }
    }

    /* ---------------- chat ---------------- */
    const chatState = new Map();
    function chatCheck(user, msg, now) {
        let s = chatState.get(user); if (!s) { s = { last: 0, win: [], rep: [] }; chatState.set(user, s); }
        if (now - s.last < 700) return 'Calma! Fale mais devagar.';
        s.win = s.win.filter(t => now - t < 60000); if (s.win.length >= 20) return 'Você está falando demais. Aguarde um pouco.';
        const k = msg.toLowerCase().replace(/\s+/g, ' ').trim(); s.rep = s.rep.filter(r => now - r.t < 20000);
        if (s.rep.filter(r => r.k === k).length >= 2) return 'Mensagem repetida. Tente algo diferente.';
        s.last = now; s.win.push(now); s.rep.push({ k, t: now }); return null;
    }
    setInterval(() => { const n = Date.now(); for (const [u, s] of chatState) if (n - s.last > 300000) chatState.delete(u); }, 300000).unref();

    /* ---------------- senhas ---------------- */
    const TRIVIAL = new Set(['123456', '1234567', '12345678', '123456789', '1234567890', 'password', 'senha', 'senha123', 'qwerty', 'qwerty123', 'abc123', 'abcdef', '111111', '000000', '123123', 'iloveyou', 'admin', 'admin123', 'minecraft', 'miniscape', 'runescape', 'teste123', 'password1', 'letmein']);
    function weakPassword(pw, user) {
        if (pw.length < 6) return 'A senha deve ter de 6 a 100 caracteres.';
        const l = pw.toLowerCase(); if (TRIVIAL.has(l) || /^(.)\1+$/.test(pw) || l === String(user || '').toLowerCase()) return 'Essa senha é fácil demais. Escolha outra.';
        if (/^(0123456789|abcdefghij|1234567890)/.test(l) && pw.length <= 10) return 'Essa senha é fácil demais. Escolha outra.';
        return null;
    }

    return { slog, rotate, STRICT, knownItem, learnItems, strike, strikeCount, lockedUntil, clearLock, checkSave, cleanTree, checkCollections, cleanSyncEquip, checkMove, hitCap, dmgPerSec, dmgOk, expectedMaxHp, chatCheck, weakPassword, scrub, scrubDeep, spend, totals, credits, _known: known };
};
