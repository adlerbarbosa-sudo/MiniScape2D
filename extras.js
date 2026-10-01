'use strict';
/* MiniScape 2D — mercado entre jogadores, correio, ranking e horário do chefe de mundo.
   Como nos outros sistemas, os itens vivem no cliente: o mercado usa CORREIO com confirmação (ack) para nada se perder ou duplicar:
   - quem vende tira o item da mochila, grava "pendente" e só então publica (o mesmo "nonce" nunca publica duas vezes);
   - quem compra paga, grava "pendente" e só então compra (o mesmo "nonce" nunca compra duas vezes);
   - o item comprado, o dinheiro da venda e as devoluções chegam pelo correio; o cliente entrega, salva e só depois confirma. */
const MIMIC = require('./mimicnames');
const ITEM_RE = /^[\p{L}\p{N}_.'\- ]{1,40}$/u;
const NONCE_RE = /^[A-Za-z0-9_\-]{6,40}$/;
const MAX_LISTINGS = 8, LIST_MS = 3 * 86400000, FEE = 0.05, MAX_MAIL = 60;
const BOSS_PERIOD = 3600000, BOSS_OPEN_MS = 25 * 60000;
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
/* preço de n unidades de um anúncio (qty unidades, preço total price): o lote inteiro custa exatamente o preço; uma parte custa o teto proporcional (nunca 0 e nunca o preço todo).
   BigInt evita estouro de inteiro (preço e quantidade chegam a 2^31). Devolve null se não dá para comprar em partes. */
function lotCost(price, qty, n) {
    if (!Number.isSafeInteger(price) || !Number.isSafeInteger(qty) || !Number.isSafeInteger(n) || price < 1 || qty < 1 || n < 1 || n > qty) return null;
    if (n === qty) return price; if (price < 2) return null;
    let c = Number((BigInt(price) * BigInt(n) + BigInt(qty) - 1n) / BigInt(qty)); return Math.max(1, Math.min(price - 1, c));
}

module.exports = function createExtras(ctx) {
    let db = ctx.db; const { markDirty, activePlayers } = ctx;
    function ensure() {
        if (!db.market || typeof db.market !== 'object') db.market = {};
        const m = db.market; if (!m.listings || typeof m.listings !== 'object') m.listings = Object.create(null);
        if (!m.mail || typeof m.mail !== 'object') m.mail = Object.create(null);
        if (!m.done || typeof m.done !== 'object') m.done = Object.create(null);
        return m;
    }
    ensure();
    const err = (e) => ({ error: e });
    const pushMail = (user, item, qty, why) => {
        const m = ensure(); const arr = m.mail[user] || (m.mail[user] = []);
        arr.push({ id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), item, qty, why, t: Date.now() });
        if (arr.length > 300) arr.splice(0, arr.length - 300);
    };
    const pub = (l) => ({ id: l.id, seller: l.seller, item: l.item, qty: l.qty, price: l.price, exp: l.t + LIST_MS });

    function market(user, b) {
        const m = ensure(); if (!b || typeof b.a !== 'string') return err('Pedido inválido.');
        switch (b.a) {
            case 'browse': {
                const q = typeof b.q === 'string' ? b.q.toLowerCase().slice(0, 30) : '';
                const list = Object.values(m.listings).filter((l) => !q || l.item.toLowerCase().includes(q)).sort((x, y) => x.price / x.qty - y.price / y.qty).slice(0, 80).map(pub);
                return { ok: true, listings: list, mine: Object.values(m.listings).filter((l) => l.seller === user).map(pub), mail: (m.mail[user] || []).length };
            }
            case 'create': {
                const item = b.item, qty = Math.floor(Number(b.qty)), price = Math.floor(Number(b.price));
                if (typeof item !== 'string' || !ITEM_RE.test(item) || !(qty >= 1 && qty <= 2147483647) || !(price >= 1 && price <= 2147483647)) return err('Anúncio inválido.');
                if (MIMIC.NAMES.has(item)) return err('Itens Mímicos são ligados à sua conta e não podem ser vendidos.');
                if (typeof b.nonce !== 'string' || !NONCE_RE.test(b.nonce)) return err('Pedido inválido.');
                const id = user + ':' + b.nonce;
                if (m.listings[id] || m.done['c:' + id]) return { ok: true, id };   // repetido: já publicado
                if (Object.values(m.listings).filter((l) => l.seller === user).length >= MAX_LISTINGS) return err('Você já tem ' + MAX_LISTINGS + ' anúncios.');
                m.listings[id] = { id, seller: user, item, qty, price, t: Date.now() }; markDirty(); return { ok: true, id };
            }
            case 'buy': {
                if (typeof b.nonce !== 'string' || !NONCE_RE.test(b.nonce) || typeof b.id !== 'string') return err('Pedido inválido.');
                const dk = 'b:' + user + ':' + b.nonce; if (m.done[dk]) return { ok: true, dup: true };
                const l = hasOwn(m.listings, b.id) ? m.listings[b.id] : null; if (!l) return err('Esse anúncio já foi vendido ou retirado.');
                if (l.seller === user) return err('Você não pode comprar o próprio anúncio.');
                // compra em quantidade: qty (inteiro de 1 ao que resta no anúncio); sem qty = o anúncio inteiro. cost = o que o comprador já pagou; tem que bater com a conta do servidor.
                let n = l.qty;
                if (b.qty !== undefined) { if (typeof b.qty !== 'number' || !Number.isInteger(b.qty) || b.qty < 1) return err('Quantidade inválida.'); n = b.qty; }
                if (n > l.qty) return err('O anúncio só tem ' + l.qty + ' unidade(s) agora.');
                const cost = lotCost(l.price, l.qty, n); if (cost === null) return err('Esse anúncio só pode ser comprado inteiro.');
                if (b.cost !== undefined && b.cost !== cost) return err('O preço mudou. Atualize a lista e tente de novo.');
                m.done[dk] = 1; const whole = n === l.qty;
                if (whole) { delete m.listings[b.id]; m.done['c:' + b.id] = 1; }
                else { l.qty -= n; l.price -= cost; }   // o resto continua à venda; a soma dos preços se conserva
                pushMail(user, l.item, n, 'Compra no mercado');
                const net = cost - Math.floor(cost * FEE); if (net > 0) pushMail(l.seller, 'Coins', net, 'Venda de ' + n + '× ' + l.item + ' (taxa de 5%)');
                const keys = Object.keys(m.done); if (keys.length > 4000) for (const k of keys.slice(0, keys.length - 3000)) delete m.done[k];
                markDirty(); return { ok: true, price: cost, qty: n, left: whole ? 0 : l.qty };
            }
            case 'cancel': {
                const l = typeof b.id === 'string' && hasOwn(m.listings, b.id) ? m.listings[b.id] : null; if (!l || l.seller !== user) return err('Anúncio não encontrado.');
                delete m.listings[b.id]; pushMail(user, l.item, l.qty, 'Anúncio cancelado'); markDirty(); return { ok: true };
            }
            case 'mail': return { ok: true, mail: (m.mail[user] || []).slice(0, MAX_MAIL) };
            case 'ack': {
                const ids = Array.isArray(b.ids) ? b.ids.filter((x) => typeof x === 'string').slice(0, MAX_MAIL) : []; const set = new Set(ids);
                if (m.mail[user]) { m.mail[user] = m.mail[user].filter((e) => !set.has(e.id)); if (!m.mail[user].length) delete m.mail[user]; markDirty(); }
                return { ok: true };
            }
            default: return err('Ação desconhecida.');
        }
    }
    setInterval(() => {   // anúncios vencidos voltam pelo correio
        const m = ensure(), now = Date.now(); let ch = false;
        for (const id of Object.keys(m.listings)) { const l = m.listings[id]; if (now - l.t > LIST_MS) { delete m.listings[id]; pushMail(l.seller, l.item, l.qty, 'Anúncio expirado'); ch = true; } }
        if (ch) markDirty();
    }, 60000).unref();

    /* ---------- ranking (calculado dos personagens salvos; guardado 30 s) ---------- */
    let rankCache = { t: 0, data: null };
    function computeRanks() {
        const rows = [];
        for (const u of Object.keys(db.users)) {
            const p = db.users[u].playerData; if (!p || typeof p !== 'object' || !p.stats || !p.stats.skills) continue;
            const sk = p.stats.skills; let total = 0, xp = 0; const per = {};
            for (const k of Object.keys(sk)) { const s = sk[k]; if (!s || typeof s.level !== 'number') continue; total += s.level | 0; xp += (s.xp | 0); per[k] = { level: s.level | 0, xp: s.xp | 0 }; }
            let kills = 0; if (p.bestiary && typeof p.bestiary === 'object') for (const k of Object.keys(p.bestiary)) kills += (p.bestiary[k] | 0);
            rows.push({ u, total, xp, per, kills, title: typeof p.title === 'string' ? p.title.slice(0, 28) : '' });
        }
        return rows;
    }
    function ranking(user, b) {
        const now = Date.now(); if (!rankCache.data || now - rankCache.t > 30000) rankCache = { t: now, data: computeRanks() };
        const rows = rankCache.data; const key = typeof b.k === 'string' && /^[a-z_]{2,20}$/.test(b.k) ? b.k : 'total';
        const val = (r) => key === 'total' ? r.total : key === 'kills' ? r.kills : (r.per[key] ? r.per[key].level : 0);
        const sub = (r) => key === 'kills' ? 0 : key === 'total' ? r.xp : (r.per[key] ? r.per[key].xp : 0);
        const list = rows.filter((r) => val(r) > 0).sort((a, c) => val(c) - val(a) || sub(c) - sub(a) || (a.u < c.u ? -1 : 1));
        const idx = list.findIndex((r) => r.u === user);
        return { ok: true, k: key, top: list.slice(0, 20).map((r, i) => ({ pos: i + 1, u: r.u, v: val(r), title: r.title, on: !!activePlayers[r.u] && now - activePlayers[r.u].lastSeen < 6000 })), me: idx >= 0 ? { pos: idx + 1, v: val(list[idx]) } : null, total: list.length };
    }

    /* ---------- chefe de mundo: janela de 25 min a cada hora cheia ---------- */
    function bossHour(t) { return Math.floor((t == null ? Date.now() : t) / BOSS_PERIOD); }
    function bossOpen(t) { t = t == null ? Date.now() : t; return t % BOSS_PERIOD < BOSS_OPEN_MS; }
    function bossInfo() { const t = Date.now(); return { h: bossHour(t), open: bossOpen(t), left: bossOpen(t) ? BOSS_OPEN_MS - (t % BOSS_PERIOD) : 0, next: bossOpen(t) ? 0 : BOSS_PERIOD - (t % BOSS_PERIOD) }; }


    // ---- casas de jogadores (porta colocada pelo Dev, vinculada a um dono) ----
    const findUser = (n) => { if (typeof n !== 'string') return null; n = n.trim().slice(0, 40); if (!n) return null; if (Object.prototype.hasOwnProperty.call(db.users, n)) return n; const l = n.toLowerCase(); return Object.keys(db.users).find((k) => k.toLowerCase() === l) || null; };
    const houseOf = (u) => { const pd = db.users[u] && db.users[u].playerData; if (!pd || typeof pd !== 'object') return null; if (!pd.house || typeof pd.house !== 'object') pd.house = { items: [] }; if (!Array.isArray(pd.house.items)) pd.house.items = []; if (!Array.isArray(pd.house.guests)) pd.house.guests = []; return pd.house; };
    function house(user, b) {
        b = b || {};
        if (b.a === 'enter') {
            const owner = findUser(b.owner); if (!owner) return { ok: false, error: 'Esta casa ainda não tem um dono válido.' };
            const h = houseOf(owner); if (!h) return owner === user ? { ok: true, owner, items: [], guests: [] } : { ok: false, error: 'O dono ainda não montou a casa.' };
            const me = user.toLowerCase();
            const isAdmin = db.users[user] && db.users[user].role === 'admin';
            if (owner !== user && !isAdmin && !h.guests.some((g) => String(g).toLowerCase() === me)) return { ok: false, error: 'Casa de ' + owner + ': você não foi convidado.' };
            return { ok: true, owner, items: h.items.slice(0, 60), guests: owner === user ? h.guests.slice(0, 30) : undefined };
        }
        if (b.a === 'guests') {
            const h = houseOf(user); if (!h) return { ok: false, error: 'Salve o jogo antes (jogue alguns segundos) e tente de novo.' };
            const list = []; (Array.isArray(b.list) ? b.list : []).slice(0, 30).forEach((n) => { const u = findUser(n); if (u && u !== user && !list.includes(u)) list.push(u); });
            h.guests = list; markDirty(); return { ok: true, guests: list };
        }
        return { ok: false, error: 'Pedido inválido.' };
    }

    /* ---------- pets e montarias: só ids conhecidos (lista branca) e números limitados ---------- */
    const PET_IDS = new Set(['gato', 'cachorro', 'coelho', 'raposa', 'coruja', 'slime', 'lobinho', 'fada', 'golem', 'dragao_fogo', 'dragao_gelo', 'fenix']);
    const MOUNT_IDS = new Set(['cav_marrom', 'cav_branco', 'cav_guerra', 'lobo_gigante', 'cav_esqueleto', 'cav_fogo', 'unicornio', 'pantera', 'dragao']);
    const PET_MODES = new Set(['follow', 'attack', 'items', 'coins', 'all']);
    const pInt = (v, a, b, d) => { v = Math.floor(Number(v)); return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };
    function cleanPetSync(p) { if (!p || typeof p !== 'object' || Array.isArray(p) || typeof p.id !== 'string' || !PET_IDS.has(p.id)) return null; return { id: p.id, l: pInt(p.l, 1, 10, 1) }; }
    function cleanMountId(m) { return typeof m === 'string' && MOUNT_IDS.has(m) ? m : null; }
    function cleanPetData(pd) {
        if (!pd || typeof pd !== 'object') return;
        const nm = (s) => (typeof s === 'string' ? s.replace(/[^\p{L}\p{N} '\-]/gu, '').trim().slice(0, 14) : '');
        const st = (v) => { if (!v || typeof v !== 'object' || Array.isArray(v)) return null; const o = { lvl: pInt(v.lvl, 1, 10, 1), xp: pInt(v.xp, 0, 1e9, 0) }; const n = nm(v.name); if (n) o.name = n; return o; };
        if (pd.pets !== undefined) { const out = {}; if (pd.pets && typeof pd.pets === 'object' && !Array.isArray(pd.pets)) for (const k of Object.keys(pd.pets)) { if (!PET_IDS.has(k)) continue; const s = st(pd.pets[k]); if (s) out[k] = s; } pd.pets = out; }
        if (pd.pet !== undefined) {
            let o = null; const v = pd.pet;
            if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.id === 'string' && PET_IDS.has(v.id)) { o = st(v) || { lvl: 1, xp: 0 }; o.id = v.id; o.mode = PET_MODES.has(v.mode) ? v.mode : 'follow'; }
            pd.pet = o;
        }
        if (pd.mounts !== undefined) { const out = {}; if (pd.mounts && typeof pd.mounts === 'object' && !Array.isArray(pd.mounts)) for (const k of Object.keys(pd.mounts)) if (MOUNT_IDS.has(k) && pd.mounts[k]) out[k] = 1; pd.mounts = out; }
        if (pd.mount !== undefined) pd.mount = cleanMountId(pd.mount);
        if (pd.petsOpts !== undefined) { const v = pd.petsOpts; pd.petsOpts = (v && typeof v === 'object' && !Array.isArray(v)) ? { auto: v.auto === false ? false : true } : { auto: true }; }
    }

    function rebind(nd) { db = nd; ensure(); rankCache = { t: 0, data: null }; }
    return { house, market, ranking, rebind, lotCost, cleanPetSync, cleanMountId, cleanPetData, bossInfo, bossHour, bossOpen, cleanTitle: (s) => (typeof s === 'string' ? s.replace(/[^\p{L}\p{N} '\-]/gu, '').trim().slice(0, 28) : '') };
};
