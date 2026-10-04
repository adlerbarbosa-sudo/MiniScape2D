/* MiniScape 2D — ENGAJAMENTO: recompensa diária com sequência, missões diárias/semanais, Códice (coleção), Maestria além do 99,
   eventos por relógio de servidor (Lua Cheia, Invasão), placar semanal do Colosso, metas visíveis ("Próximo marco").
   Arquivo UMD, como balance.js: o NÚCLEO (funções puras: relógio de Brasília, tabelas, sorteio de missões, maestria, eventos) roda no servidor
   (require('./public/engage.js')) e no navegador (window.Engage). A parte de INTERFACE só liga no navegador.
   Autoridade: tudo que dá recompensa é decidido no SERVIDOR (engagesrv.js) com o relógio do servidor; o cliente só mostra e pede.
   Dia/semana = fuso America/Sao_Paulo (UTC-3 fixo, sem horário de verão desde 2019). Eventos usam UTC. */
(function (root, factory) {
    const core = factory();
    if (typeof module === 'object' && module.exports) module.exports = core; else root.EngageCore = core;
    if (typeof window !== 'undefined' && typeof document !== 'undefined') { try { if (core._ui) core._ui(root); } catch (e) { console.error('[engage]', e); } }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const HR = 3600000, DAY = 86400000, BRT = -3 * HR;
    const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const B = (typeof module === 'object' && module.exports) ? require('./balance.js') : (typeof window !== 'undefined' ? window.Balance : null);

    /* ============================ RELÓGIO (Brasília) ============================ */
    const dayIdx = (t) => Math.floor((t + BRT) / DAY);
    const dayKey = (t) => new Date(t + BRT).toISOString().slice(0, 10);
    const weekIdx = (t) => Math.floor((dayIdx(t) - 4) / 7);          // a semana começa na segunda-feira (BRT)
    const msToNextDay = (t) => (dayIdx(t) + 1) * DAY - BRT - t;
    const msToNextWeek = (t) => ((weekIdx(t) + 1) * 7 + 4) * DAY - BRT - t;
    const hourIdx = (t) => Math.floor(t / HR);                       // UTC
    function hash(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
    function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

    /* ============================ RECOMPENSA DIÁRIA (sequência 1-7, depois ciclo) ============================ */
    const DAILY = [
        { coins: 150, items: [] },
        { coins: 100, items: [['Minhoca', 5]] },
        { coins: 200, items: [['Health Potion', 3]] },
        { coins: 0, items: [['Isca Brilhante', 2]], boost: { pct: 5, min: 30 } },
        { coins: 300, items: [['Mana Potion', 5]] },
        { coins: 0, items: [['Greater Health Potion', 2], ['Isca de Camarão', 2]] },
        { coins: 800, items: [['Isca Dourada', 3], ['Greater Health Potion', 3]], boost: { pct: 5, min: 60 }, big: true }
    ];
    const tierOf = (L) => Math.max(0, Math.min(4, Math.floor((Number(L) || 1) / 20)));
    const dailyReward = (day, L) => { const d = DAILY[Math.max(0, Math.min(6, day - 1))], k = 1 + 0.5 * tierOf(L); return { coins: Math.round(d.coins * k), items: d.items.map((x) => x.slice()), boost: d.boost ? Object.assign({}, d.boost) : null, big: !!d.big, day }; };

    /* ============================ MISSÕES (diárias e semanais) ============================ */
    const KIND = {
        kill: { coins: 90, ev: false }, boss: { coins: 150, ev: false }, gather: { coins: 70, ev: 'gather' }, fish: { coins: 80, ev: 'fish' },
        rare: { coins: 120, ev: 'rare' }, cook: { coins: 60, ev: 'cook' }, craft: { coins: 70, ev: 'craft' }
    };
    const NEED_D = { kill: [10, 12, 14, 16, 18], boss: [1, 1, 1, 1, 1], gather: [30, 40, 50, 60, 70], fish: [10, 12, 14, 16, 18], rare: [1, 1, 1, 2, 2], cook: [15, 20, 25, 30, 35], craft: [8, 10, 12, 15, 18] };
    const NEED_W = { kill: [80, 100, 120, 140, 160], boss: [3, 3, 4, 5, 5], gather: [200, 250, 300, 350, 400], fish: [60, 70, 80, 90, 100], rare: [5, 6, 7, 8, 10], cook: [90, 110, 130, 150, 170], craft: [40, 50, 60, 70, 80] };
    const SK_OF = { gather: ['woodcutting', 'mining'], fish: ['fishing'], rare: ['fishing'], cook: ['cooking'], craft: ['crafting'] };
    /* ctx = { L (nível de combate), species: [{k, name, lv}], bosses: [{k,name,lv}] } ; devolve a lista de missões do período */
    function genQuests(period, seed, ctx) {
        const r = rng(hash(seed)), T = tierOf(ctx.L), weekly = period === 'w', NEED = weekly ? NEED_W : NEED_D, out = [];
        const pick = (a) => a[Math.floor(r() * a.length)];
        const near = (ctx.species || []).filter((s) => s.lv >= ctx.L - 14 && s.lv <= ctx.L + 8);
        let pool = near.length >= 2 ? near : (ctx.species || []).slice().sort((a, b) => Math.abs(a.lv - ctx.L) - Math.abs(b.lv - ctx.L)).slice(0, 4);
        const mk = (t, extra) => { const q = Object.assign({ id: period + out.length, t, need: NEED[t][T], p: 0, c: 0 }, extra || {}); out.push(q); return q; };
        if (pool.length) { const s = pick(pool); mk('kill', { sp: s.k }); } else mk('gather');
        const used = new Set(out.map((q) => q.t));
        const others = ['gather', 'fish', 'cook', 'craft'].concat(weekly ? ['rare'] : []);
        const o1 = pick(others.filter((x) => !used.has(x))); used.add(o1); const q1 = mk(o1); if (o1 === 'gather') q1.sk = pick(SK_OF.gather);
        if (weekly || r() < 0.4) { if ((ctx.bosses || []).length || true) mk('boss'); }
        else { const o2 = pick(others.filter((x) => !used.has(x) && x !== 'rare')); used.add(o2); const q2 = mk(o2); if (o2 === 'gather') q2.sk = pick(SK_OF.gather); }
        out.forEach((q, i) => { q.id = period + i; q.c = Math.round(KIND[q.t].coins * (weekly ? 5 : 1) * (1 + 0.5 * T)); q.xpPct = weekly ? 0.12 : 0.03; q.item = null; });
        if (weekly) { out[0].item = ['Greater Health Potion', 2]; out[1].item = [T >= 2 ? 'Isca Dourada' : 'Isca Brilhante', T >= 2 ? 2 : 4]; out[2].item = ['Mana Potion', 6]; }
        else if (r() < 0.5) out[out.length - 1].item = [pick(['Health Potion', 'Mana Potion', 'Minhoca']), 3];
        return out;
    }
    const questBonus = (period, L) => { const k = 1 + 0.5 * tierOf(L); return period === 'w' ? { coins: Math.round(1200 * k), items: [['Greater Health Potion', 3], ['Isca Dourada', 2]] } : { coins: Math.round(150 * k), items: [['Health Potion', 2]] }; };
    const SKILL_BY_Q = (q, topCombat) => q.t === 'kill' || q.t === 'boss' ? topCombat : q.t === 'gather' ? (q.sk || 'woodcutting') : q.t === 'fish' || q.t === 'rare' ? 'fishing' : q.t === 'cook' ? 'cooking' : 'crafting';
    function xpReward(q, lvl, xp) {   // % do trecho do nível atual (mínimo fixo); no 99 usa o trecho da Maestria
        const L = Math.max(1, Math.min(99, Math.floor(lvl) || 1)); const span = L >= 99 ? 500000 : (B.xpForLevel(L + 1) - B.xpForLevel(L));
        const floor = (q.id[0] === 'w' ? 600 : 150) * (1 + tierOf(L)); return Math.max(floor, Math.round(span * q.xpPct));
    }
    function describe(q, nameOf) {
        nameOf = nameOf || ((k) => k); const n = q.need;
        switch (q.t) {
            case 'kill': return 'Derrote ' + n + '× ' + nameOf(q.sp);
            case 'boss': return n > 1 ? 'Derrote ' + n + ' chefes' : 'Derrote um chefe';
            case 'gather': return (q.sk === 'mining' ? 'Minere ' : 'Corte lenha: ') + n + (q.sk === 'mining' ? ' vezes' : ' vezes');
            case 'fish': return 'Pesque ' + n + ' peixes';
            case 'rare': return 'Pesque ' + n + (n > 1 ? ' peixes raros' : ' peixe raro');
            case 'cook': return 'Cozinhe ' + n + ' itens';
            case 'craft': return 'Fabrique ou forje ' + n + ' itens';
        }
        return '?';
    }

    /* ============================ MAESTRIA (XP além do 99) ============================ */
    const MASTERY_MAX = 50, MASTERY_BASE = 500000, MASTERY_STEP = 25000;
    const masteryNeed = (m) => MASTERY_BASE + MASTERY_STEP * (m - 1);               // XP para passar do nível de maestria m-1 para m
    const masteryCum = (m) => { m = Math.max(0, Math.min(MASTERY_MAX, m | 0)); return m * MASTERY_BASE + MASTERY_STEP * m * (m - 1) / 2; };
    function mastery(xp) {
        const x99 = B.xpForLevel(99), over = Math.max(0, (Number(xp) || 0) - x99); let m = 0;
        while (m < MASTERY_MAX && over >= masteryCum(m + 1)) m++;
        const cur = over - masteryCum(m), need = m >= MASTERY_MAX ? 0 : masteryNeed(m + 1);
        return { lvl: m, cur, need, pct: m >= MASTERY_MAX ? 100 : Math.min(100, cur / need * 100), over };
    }
    const MASTERY_TITLES = { 1: 'Veterano', 10: 'Mestre', 25: 'Grão-Mestre', 50: 'Lendário' };
    const MASTERY_STEPS = [1, 10, 25, 50];
    // bônus mecânicos pequenos e com teto (o cliente soma em Stats): +0,1% vel. de ataque por nível de maestria de combate (máx. +8%); +0,01% vel. de movimento por nível somado (máx. +4%)
    function masteryBonus(levels) {
        let atk = 0, tot = 0; for (const k of Object.keys(levels || {})) { const v = Math.max(0, Math.min(MASTERY_MAX, levels[k] | 0)); tot += v; if (k === 'combat' || k === 'ranged' || k === 'magic') atk += v; }
        return { atkSpd: Math.min(8, Math.round(atk * 0.1 * 10) / 10), moveSpd: Math.min(4, Math.round(tot * 0.01 * 100) / 100), total: tot };
    }

    /* ============================ MARCOS DO CÓDICE ============================ */
    const MS = [
        { id: 'map5', k: 'maps', need: 5, name: 'Andarilho', desc: 'Visite 5 mapas diferentes.', coins: 300, title: 'Andarilho' },
        { id: 'map12', k: 'maps', need: 12, name: 'Explorador', desc: 'Visite 12 mapas diferentes.', coins: 800, items: [['Greater Health Potion', 2]], title: 'Explorador' },
        { id: 'map20', k: 'maps', need: 20, name: 'Viajante do Reino', desc: 'Visite 20 mapas diferentes.', coins: 2000, items: [['Isca Dourada', 2]], title: 'Viajante do Reino' },
        { id: 'mapAll', k: 'maps', need: 0, name: 'Cartógrafo do Reino', desc: 'Visite todos os mapas do reino.', coins: 6000, items: [['Isca Dourada', 5], ['Greater Health Potion', 5]], title: 'Cartógrafo' },
        { id: 'sp10', k: 'species', need: 10, name: 'Curioso', desc: 'Derrote 10 espécies diferentes.', coins: 400, title: 'Curioso' },
        { id: 'sp25', k: 'species', need: 25, name: 'Estudioso de Feras', desc: 'Derrote 25 espécies diferentes.', coins: 1200, items: [['Greater Health Potion', 3]], title: 'Estudioso de Feras' },
        { id: 'sp50', k: 'species', need: 50, name: 'Naturalista Real', desc: 'Derrote 50 espécies diferentes.', coins: 4000, items: [['Isca Dourada', 3]], title: 'Naturalista Real' },
        { id: 'bs3', k: 'bosses', need: 3, name: 'Caça-Chefes', desc: 'Derrote 3 chefes diferentes.', coins: 800, title: 'Caça-Chefes' },
        { id: 'bs8', k: 'bosses', need: 8, name: 'Terror dos Chefes', desc: 'Derrote 8 chefes diferentes.', coins: 3000, items: [['Greater Health Potion', 4]], title: 'Terror dos Chefes' },
        { id: 'bs15', k: 'bosses', need: 15, name: 'Flagelo dos Reis', desc: 'Derrote 15 chefes diferentes.', coins: 8000, items: [['Isca Dourada', 5]], title: 'Flagelo dos Reis' },
        { id: 'kt2500', k: 'kills', need: 2500, name: 'Ceifador', desc: 'Derrote 2.500 criaturas.', coins: 2500, title: 'Ceifador' },
        { id: 'kt10000', k: 'kills', need: 10000, name: 'Lenda de Batalha', desc: 'Derrote 10.000 criaturas.', coins: 9000, items: [['Isca Dourada', 5]], title: 'Lenda de Batalha' }
    ];
    const SP_MARK = 500, SP_REWARD = 600;   // 500 abates de uma espécie: marco por espécie (moedas)
    const MS_BY_ID = {}; MS.forEach((m) => { MS_BY_ID[m.id] = m; });

    /* ============================ EVENTOS (relógio UTC, determinísticos) ============================ */
    const MOON_XP = 1.10;   // Lua Cheia: sábado e domingo (UTC), +10% de XP — o teto de eventos/impulsos é +10% (Balance.EVENT_XP_CAP)
    const isMoon = (t) => { const d = new Date(t).getUTCDay(); return d === 0 || d === 6; };
    const INV_MIN = 15, INV_N = 10;   // Invasão: todo início de hora (UTC) por 15 min, com 10 invasores
    function invasionSlot(t) { const h = hourIdx(t), start = h * HR, el = t - start; return { hour: h, from: start, until: start + INV_MIN * 60000, active: el < INV_MIN * 60000, nextIn: el < INV_MIN * 60000 ? 0 : HR - el }; }
    const invIds = (hour) => Array.from({ length: INV_N }, (_, i) => 9000000 + (hour % 4000) * 20 + i);
    function xpEventMul(t, boostUntil, boostPct) {
        let m = 1; if (isMoon(t)) m += MOON_XP - 1; if (boostUntil && boostUntil > t) m += (boostPct || 5) / 100;
        return Math.min(B ? B.EVENT_XP_CAP : 1.1, m);
    }
    function eventsAt(t) {
        const ev = []; if (isMoon(t)) { const d = new Date(t), left = DAY - (t % DAY); ev.push({ id: 'moon', name: 'Lua Cheia', desc: '+10% de XP em tudo, o fim de semana inteiro.', until: t + left, xp: 1.1 }); }
        return ev;
    }

    /* ============================ SANEAMENTO DE playerData.engage (cliente) ============================ */
    const ITEM_RE = /^[\p{L}\p{N}_.'’()+%!:\- ]{1,40}$/u, KEY_RE = /^[A-Za-z0-9_\-]{1,40}$/;
    function cleanClient(e, known) {   // só dados de exibição (Códice de receitas/drops, resumo do dia); nada aqui dá recompensa
        const out = { recipes: [], drops: {}, today: { d: '', xp: 0, kills: 0 }, seen: 0 };
        if (!e || typeof e !== 'object' || Array.isArray(e)) return out;
        if (Array.isArray(e.recipes)) for (const x of e.recipes.slice(0, 400)) if (typeof x === 'string' && ITEM_RE.test(x) && (!known || known(x)) && !out.recipes.includes(x)) out.recipes.push(x);
        if (e.drops && typeof e.drops === 'object' && !Array.isArray(e.drops)) { let n = 0; for (const k of Object.keys(e.drops)) { if (n >= 200) break; if (!KEY_RE.test(k) || !Array.isArray(e.drops[k])) continue; const a = []; for (const x of e.drops[k].slice(0, 16)) if (typeof x === 'string' && ITEM_RE.test(x) && (!known || known(x)) && !a.includes(x)) a.push(x); if (a.length) { out.drops[k] = a; n++; } } }
        if (e.today && typeof e.today === 'object') { out.today = { d: typeof e.today.d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.today.d) ? e.today.d : '', xp: Math.max(0, Math.min(1e9, Math.floor(Number(e.today.xp)) || 0)), kills: Math.max(0, Math.min(1e6, Math.floor(Number(e.today.kills)) || 0)) }; }
        out.seen = Math.max(0, Math.min(4e12, Math.floor(Number(e.seen)) || 0));
        return out;
    }

    const core = {
        HR, DAY, BRT, dayIdx, dayKey, weekIdx, weekKey: (t) => 'S' + weekIdx(t), msToNextDay, msToNextWeek, hourIdx, hash, rng,
        DAILY, dailyReward, tierOf, KIND, NEED_D, NEED_W, genQuests, questBonus, SKILL_BY_Q, xpReward, describe,
        MASTERY_MAX, masteryNeed, masteryCum, mastery, MASTERY_TITLES, MASTERY_STEPS, masteryBonus,
        MS, MS_BY_ID, SP_MARK, SP_REWARD, isMoon, MOON_XP, INV_MIN, INV_N, invasionSlot, invIds, xpEventMul, eventsAt, cleanClient
    };
    return core;
});
