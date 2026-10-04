/* MiniScape 2D — pesca.
   Modos: Rede de Pesca (rápida, vários peixes comuns, sem isca) e Vara de Pesca (lança a linha, a boia afunda quando o peixe belisca, você fisga e disputa um MINIGAME:
   mantenha o cursor na zona verde; fora dela o peixe escapa, tensão demais e a linha estoura). Iscas: Minhoca, Isca Brilhante, Isca de Camarão, Isca Dourada.
   Há 21 espécies com raridade (comum a lendário) e tamanho (cm/kg) variáveis por tipo de água; cozidas dão cura e bônus temporário (buffs).
   Tudo fica no personagem: player.bait (null = automática, '__none' = sem isca), player.fishMode, player.fish ({espécie:{max,kg,count}}), player.buffs. */
(function () {
    'use strict';
    const NET = 'Rede de Pesca', ROD = 'Vara de Pesca';
    const $ = (id) => document.getElementById(id);
    const say = (t, c) => { try { setActionText(t, c || '#2ecc71'); } catch (e) { } };
    const sfx = (n) => { try { window.Sfx && Sfx.play(n); } catch (e) { } };
    const lvl = () => { try { return ((player.stats.skills.fishing || {}).level | 0) || 1; } catch (e) { return 1; } };
    const rnd = Math.random, clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;
    const fmtN = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
    const fmtKg = (k) => (k < 1 ? String(Math.round(k * 100) / 100) : String(Math.round(k * 10) / 10)).replace('.', ',');
    const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };

    /* ============================ ESPÉCIES ============================ */
    const RARN = ['comum', 'incomum', 'raro', 'épico', 'lendário'], RARC = ['#cfd6de', '#6ff09a', '#6ab7ff', '#c58bff', '#ffb347'];
    const HEAL = [8, 13, 21, 32, 48], COOKXP = [22, 38, 62, 95, 150], VAL = [10, 26, 66, 150, 380], XPB = [14, 32, 70, 130, 260], WGT = [0.25, 0.4, 0.6, 0.8, 1], RW = [100, 30, 11, 3.5, 1];
    const BUFN = { fspd: 'Pesca rápida', fxp: 'XP de pesca', luck: 'Sorte de pesca', regen: 'Regeneração', mregen: 'Mana', dmg: 'Força', def: 'Defesa' };
    const BUFPCT = { fspd: 1, fxp: 1, luck: 1 };
    const ZONEN = { rio: 'Rios e lagos', mar: 'Mar e costa', pantano: 'Pântano', gelo: 'Águas geladas', oasis: 'Oásis', caverna: 'Cavernas', lava: 'Lava' };
    const buffTxt = (k, v, s) => BUFN[k] + ' +' + v + (BUFPCT[k] ? '%' : '') + ' (' + (s >= 120 ? Math.round(s / 60) + ' min' : s + ' s') + ')';
    // id, nome, cru, cozido, raridade, cm, kg, nível de pesca, isca mínima, zonas (peso), padrão do minigame, ícone [corpo, barriga, forma], bônus [tipo, valor, segundos], clima
    const RAW = [
        ['sardinha', 'Sardinha', 'Sardinha Crua', 'Sardinha Cozida', 0, [10, 22], [0.03, 0.14], 0, 0, { mar: 1 }, 'nervoso', ['#8fb3d6', '#eef4fa', 'slim'], [['mregen', 1, 60]]],
        ['tilapia', 'Tilápia', 'Tilápia Crua', 'Tilápia Cozida', 0, [18, 45], [0.3, 2.2], 0, 0, { rio: 1, oasis: 0.5, pantano: 0.4 }, 'normal', ['#9aa88c', '#e8e3c8', ''], [['regen', 1, 60]]],
        ['carpa', 'Carpa', 'Carpa Crua', 'Carpa Cozida', 0, [30, 75], [1, 9], 0, 0, { rio: 1, pantano: 0.5 }, 'calmo', ['#b08a4a', '#efe1b0', 'round'], [['fxp', 10, 300]]],
        ['bagre', 'Bagre-do-Brejo', 'Bagre-do-Brejo Cru', 'Bagre-do-Brejo Cozido', 0, [25, 80], [0.5, 6], 0, 0, { pantano: 1, rio: 0.3 }, 'pesado', ['#6a6a58', '#c9c4a4', 'whisk'], [['def', 1, 120]]],
        ['lambari', 'Lambari-do-Oásis', 'Lambari-do-Oásis Cru', 'Lambari-do-Oásis Cozido', 0, [8, 18], [0.02, 0.12], 0, 0, { oasis: 1 }, 'nervoso', ['#e3b04a', '#fff2c4', 'slim'], [['mregen', 1, 60]]],
        ['gelo', 'Peixe-do-Gelo', 'Peixe-do-Gelo Cru', 'Peixe-do-Gelo Cozido', 0, [15, 40], [0.2, 1.6], 0, 0, { gelo: 1 }, 'normal', ['#bfe3f2', '#f2fbff', 'spike'], [['def', 1, 120]]],
        ['cego', 'Peixe-Cego', 'Peixe-Cego Cru', 'Peixe-Cego Cozido', 0, [10, 28], [0.1, 0.9], 0, 0, { caverna: 1 }, 'calmo', ['#d8c9c0', '#f4ece6', ''], [['luck', 10, 180]]],
        ['brasa', 'Peixe-Brasa', 'Peixe-Brasa Cru', 'Peixe-Brasa Cozido', 0, [12, 34], [0.1, 1.1], 0, 0, { lava: 1 }, 'nervoso', ['#e8643a', '#ffc07a', 'spike'], [['dmg', 1, 90]]],
        ['truta', 'Truta', 'Truta Crua', 'Truta Assada', 1, [25, 65], [0.3, 3], 5, 0, { rio: 1, gelo: 0.5 }, 'normal', ['#8fb878', '#f3e3c8', ''], [['fspd', 25, 300]]],
        ['robalo', 'Robalo', 'Robalo Cru', 'Robalo Assado', 1, [40, 95], [1, 9], 12, 3, { mar: 1, rio: 0.3 }, 'normal', ['#6f8aa0', '#e4edf2', ''], [['def', 1, 180]]],
        ['piranha', 'Piranha', 'Piranha Crua', 'Piranha Cozida', 1, [18, 40], [0.4, 2.4], 8, 0, { pantano: 0.6, rio: 0.25 }, 'erratico', ['#6a8a7a', '#e07a5a', 'teeth'], [['dmg', 1, 120]]],
        ['lanterna', 'Peixe-Lanterna', 'Peixe-Lanterna Cru', 'Peixe-Lanterna Cozido', 1, [15, 45], [0.2, 2], 10, 0, { caverna: 1, lava: 0.3 }, 'normal', ['#2e4a6a', '#7fe8ff', 'glow'], [['luck', 20, 240]]],
        ['salmao', 'Salmão', 'Salmão Cru', 'Salmão Cozido', 2, [50, 110], [2, 12], 8, 0, { rio: 0.7, gelo: 0.8 }, 'arrancada', ['#f08a72', '#ffd8c8', ''], [['dmg', 2, 180]], ['rain', 2.5]],
        ['atum', 'Atum', 'Atum Cru', 'Atum Cozido', 2, [80, 220], [15, 150], 20, 0, { mar: 0.9 }, 'arrancada', ['#3a5a8a', '#dfe8f2', 'round'], [['fxp', 20, 300]]],
        ['enguia', 'Enguia Elétrica', 'Enguia Elétrica Crua', 'Enguia Elétrica Cozida', 2, [60, 150], [2, 20], 12, 0, { pantano: 0.8, rio: 0.3 }, 'erratico', ['#4a6a5a', '#c4dccc', 'eel'], [['fspd', 40, 300]], ['fog', 2.5]],
        ['lua', 'Peixe-Lua', 'Peixe-Lua Cru', 'Peixe-Lua Cozido', 2, [30, 80], [1, 8], 18, 0, { rio: 0.6, oasis: 0.6, mar: 0.5, pantano: 0.5 }, 'calmo', ['#9fc4ff', '#f0f6ff', 'round'], [['luck', 25, 300]], ['night', 3, 0.25]],
        ['espada', 'Peixe-espada', 'Peixe-espada Cru', 'Peixe-espada Cozido', 3, [140, 340], [40, 300], 30, 0, { mar: 0.5 }, 'arrancada', ['#6a7fa8', '#e4e8f0', 'sword'], [['dmg', 3, 150], ['def', 1, 150]]],
        ['esturjao', 'Esturjão Glacial', 'Esturjão Glacial Cru', 'Esturjão Glacial Cozido', 3, [100, 260], [20, 180], 28, 0, { gelo: 0.5 }, 'pesado', ['#7f8fa0', '#dfe6ee', 'spike'], [['def', 3, 180], ['regen', 2, 90]]],
        ['coelacanto', 'Coelacanto', 'Coelacanto Cru', 'Coelacanto Cozido', 3, [80, 180], [30, 95], 32, 0, { caverna: 0.6, mar: 0.12 }, 'pesado', ['#3b4f78', '#8fb0e0', 'lobe'], [['luck', 30, 300], ['mregen', 2, 90]]],
        ['dourada', 'Carpa Dourada', 'Carpa Dourada Crua', 'Carpa Dourada Cozida', 4, [45, 95], [3, 14], 22, 0, { rio: 0.5, oasis: 0.8 }, 'erratico', ['#f2a93a', '#fff0b8', 'gold'], [['luck', 40, 300], ['fxp', 25, 300], ['regen', 2, 90]], ['day', 2, 0.3]],
        ['dragao', 'Peixe-dragão de Lava', 'Peixe-dragão de Lava Cru', 'Peixe-dragão de Lava Cozido', 4, [90, 220], [20, 120], 40, 0, { lava: 0.5 }, 'arrancada', ['#c0382a', '#ffb35a', 'dragon'], [['dmg', 4, 180], ['def', 3, 180], ['regen', 3, 90]]]
    ];
    const SPECIES = [], BYID = {}, BYRAW = {}, BYCOOK = {}; let STYLE = null;
    RAW.forEach((r) => {
        const s = { id: r[0], n: r[1], raw: r[2], cook: r[3], rar: r[4], cm: r[5], kg: r[6], lv: r[7], tier: r[8], z: r[9], pat: r[10], ic: r[11], buffs: r[12], wx: r[13] || null };
        SPECIES.push(s); BYID[s.id] = s; BYRAW[s.raw] = s; BYCOOK[s.cook] = s;
    });
    const PAT = {   // padrão do peixe no minigame: spd = velocidade da zona (altura/s), ivl = segundos entre movimentos, dash = chance de arrancada
        calmo: { spd: 0.2, ivl: 1.9, dash: 0.03, jit: 0 }, normal: { spd: 0.32, ivl: 1.4, dash: 0.1, jit: 0 }, nervoso: { spd: 0.5, ivl: 0.9, dash: 0.12, jit: 1 },
        arrancada: { spd: 0.3, ivl: 1.5, dash: 0.36, jit: 0 }, erratico: { spd: 0.45, ivl: 0.8, dash: 0.25, jit: 1 }, pesado: { spd: 0.2, ivl: 2.2, dash: 0.22, jit: 0 }
    };

    /* ============================ ITENS ============================ */
    const ITEMS = {
        [NET]: { name: NET, icon: '🕸️', type: 'tool', tool: 'net', stackable: false, weight: 0.5, desc: 'Pesca rápida de peixes comuns, sem isca (dá menos XP que a vara). Use no ponto de pesca.', value: 20 },
        [ROD]: { name: ROD, icon: '🎣', type: 'tool', tool: 'rod', stackable: false, weight: 0.8, desc: 'Lança a linha e vira um minigame: mantenha o cursor no verde. Peixes maiores e raros. Gasta 1 isca por peixe que morde.', recipe: 'Logs,2|Wool,1', craftQty: 1, value: 80 },
        'Minhoca': { name: 'Minhoca', icon: '🪱', type: 'resource', bait: 1, stackable: true, weight: 0.01, desc: 'Isca comum: o peixe morde bem mais. Na mochila: selecione e use "Escolher isca".', value: 2 },
        'Isca Brilhante': { name: 'Isca Brilhante', icon: '✨', type: 'resource', bait: 2, stackable: true, weight: 0.01, desc: 'Atrai peixes raros e dá mais XP. Na mochila: selecione e use "Escolher isca".', value: 25 },
        'Isca de Camarão': { name: 'Isca de Camarão', icon: '🦐', type: 'resource', bait: 3, stackable: true, weight: 0.01, desc: 'Atrai peixes grandes (Robalo). Na mochila: selecione e use "Escolher isca".', value: 35 },
        'Isca Dourada': { name: 'Isca Dourada', icon: '🌟', type: 'resource', bait: 4, stackable: true, weight: 0.01, desc: 'A melhor: peixes grandes, raros e chance de baú do tesouro. Na mochila: selecione e use "Escolher isca".', value: 120 },
        'Bota Velha': { name: 'Bota Velha', icon: '👢', type: 'resource', stackable: true, weight: 0.3, desc: 'Lixo da pescaria. Dá pra vender por uns trocados.', value: 1 },
        'Peixe Queimado': { name: 'Peixe Queimado', icon: '🍣', type: 'consumable', heal: 1, stackable: true, weight: 0.3, desc: 'Passou do ponto. Cozinhar melhora com o nível de Culinária.', value: 1, fishIcon: ['#4a4038', '#6a5a4a', ''] }
    };
    SPECIES.forEach((s) => {
        const bf = s.buffs.map((b) => ({ k: b[0], v: b[1], secs: b[2], fb: 1 })), buff = Object.assign({}, bf[0]); if (bf.length > 1) buff.more = bf.slice(1);
        const txt = s.buffs.map((b) => buffTxt(b[0], b[1], b[2])).join(' + '), zn = Object.keys(s.z).map((z) => ZONEN[z]).join(', ');
        ITEMS[s.raw] = { name: s.raw, icon: '🐟', type: 'resource', stackable: true, weight: WGT[s.rar], desc: s.n + ' (' + RARN[s.rar] + '). Pesca em: ' + zn + '. Cozinhe numa fogueira: o prato dá cura e bônus.', cooksInto: s.cook, cookXp: COOKXP[s.rar], value: VAL[s.rar], fishId: s.id, fishIcon: s.ic };
        ITEMS[s.cook] = { name: s.cook, icon: '🍣', type: 'consumable', heal: HEAL[s.rar], buff, stackable: true, weight: WGT[s.rar], desc: 'Cura ' + HEAL[s.rar] + ' HP. Bônus: ' + txt + '. Bônus do mesmo tipo não somam, só renovam.', value: Math.round(VAL[s.rar] * 1.5), fishId: s.id, fishIcon: s.ic };
    });
    try { if (window.CATALOG) Object.assign(CATALOG.ITEMS, ITEMS); } catch (e) { }

    /* melhor -> pior. rare = peso dos peixes raros, big = peso dos peixes grandes, xp = bônus de XP, chest = chance de baú, fail = escorregão (janela de fisgada menor) */
    const BAITS = [
        { n: 'Isca Dourada', tier: 4, fail: 0.06, rare: 2.6, big: 2.4, xp: 1.5, chest: 0.12 },
        { n: 'Isca de Camarão', tier: 3, fail: 0.12, rare: 1.3, big: 2.5, xp: 1.3, chest: 0.04 },
        { n: 'Isca Brilhante', tier: 2, fail: 0.10, rare: 2.4, big: 1.3, xp: 1.25, chest: 0.03 },
        { n: 'Minhoca', tier: 1, fail: 0.18, rare: 1, big: 1, xp: 1, chest: 0.01 }
    ];
    const BAIT = {}; BAITS.forEach((b) => { BAIT[b.n] = b; });
    const SHOP_ADD = { fisher_npc: 'Vara de Pesca,80|Minhoca,15|Rede de Pesca,20', merchant_base: 'Minhoca,15' };   // Minhoca vem em pacote de 10 (shopQty)
    ITEMS['Minhoca'].shopQty = 10;

    /* ---------- migração: a antiga "Net"/"Fishing Net" (nome diferente da chave = rede que não funcionava) vira "Rede de Pesca" ---------- */
    const OLD = { 'Net': 1, 'Fishing Net': 1 };
    function fixShop(s) { return typeof s === 'string' ? s.split('|').map((p) => { const k = p.split(','); if (OLD[(k[0] || '').trim()]) k[0] = NET; return k.join(','); }).join('|') : s; }
    const clone = (o) => JSON.parse(JSON.stringify(o));
    function merge() {   // depois que o itemDB/npcDB do servidor foi carregado
        try {
            if (typeof itemDB === 'undefined') return;
            for (const k in OLD) if (itemDB[k]) delete itemDB[k];
            for (const k in ITEMS) {
                if (!itemDB[k]) itemDB[k] = clone(ITEMS[k]);
                else {
                    const d = itemDB[k];
                    if (k === NET || k === ROD) { d.tool = ITEMS[k].tool; if (k === ROD) d.desc = ITEMS[k].desc; }
                    if (k === ROD && !d.recipe) d.recipe = ITEMS[k].recipe;
                    if (BAIT[k]) { d.bait = ITEMS[k].bait; d.desc = ITEMS[k].desc; }
                    if (k === 'Minhoca' && !d.shopQty) d.shopQty = 10;
                    if (ITEMS[k].fishId || k === 'Peixe Queimado') Object.assign(d, clone(ITEMS[k]));   // peixes e pratos: definição do jogo manda
                }
            }
            if (typeof npcDB !== 'undefined') for (const k in npcDB) {
                const d = npcDB[k]; if (!d || typeof d.shopStr !== 'string') continue; d.shopStr = fixShop(d.shopStr);
                if (SHOP_ADD[k] && !d._fish1) { d._fish1 = 1; const have = d.shopStr.split('|').map((p) => p.split(',')[0].trim()); SHOP_ADD[k].split('|').forEach((p) => { if (!have.includes(p.split(',')[0])) d.shopStr += (d.shopStr ? '|' : '') + p; }); }
            }
            installBuffs(); wrapInput(); injectMenuBtn();
        } catch (e) { console.error(e); }
    }
    function migrate(p) {   // itens já no personagem (mochila, banco, equipamento, barra rápida)
        try {
            const fix = (it) => { if (it && OLD[it.name]) { const q = it.qty; Object.assign(it, itemDB[NET] || ITEMS[NET]); if (q) it.qty = q; } };
            (p.inventory || []).forEach(fix); (p.bank || []).forEach(fix); if (p.equipment) for (const k in p.equipment) fix(p.equipment[k]);
            if (Array.isArray(p.qb)) p.qb = p.qb.map((n) => OLD[n] ? NET : n);
            // diário e bônus vindos do servidor/cache: só estruturas pequenas e válidas
            const f = {}; if (p.fish && typeof p.fish === 'object' && !Array.isArray(p.fish)) for (const id of Object.keys(p.fish)) { const v = p.fish[id]; if (BYID[id] && v && typeof v === 'object' && isFinite(v.max) && v.max > 0) f[id] = { max: +v.max, kg: isFinite(v.kg) ? +v.kg : 0, count: Math.max(1, v.count | 0) }; }
            p.fish = f;
            if (p.buffs && typeof p.buffs === 'object') for (const k of Object.keys(p.buffs)) { const b = p.buffs[k]; if (!b || !isFinite(b.until) || b.until < Date.now()) delete p.buffs[k]; }
        } catch (e) { console.error(e); }
    }

    /* ============================ ÁGUA POR MAPA ============================ */
    const ZMAP = { pantano: 'pantano', estrada_sombria: 'pantano', cemiterio: 'pantano', porto_mares: 'mar', praia_naufragios: 'mar', estrada_costa: 'mar', vale_gelado: 'gelo', passo_gelado: 'gelo',
        oasis: 'oasis', deserto: 'oasis', estrada_areias: 'oasis', ruinas: 'oasis', vulcao: 'lava', ninho_dragao: 'lava', mina_abandonada: 'caverna', covil_goblins: 'caverna', torre_mago: 'caverna', cripta_real: 'caverna', catacumbas: 'caverna' };
    function zoneOf(id) {
        try {
            id = id || currentMap; if (ZMAP[id]) return ZMAP[id];
            const nm = String((gameMaps[id] && gameMaps[id].name) || id || '').toLowerCase();
            if (/gelad|gelo|neve|hrim/.test(nm)) return 'gelo'; if (/pântano|pantano|brejo/.test(nm)) return 'pantano'; if (/porto|praia|costa|mar\b|naufr/.test(nm)) return 'mar';
            if (/oásis|oasis|deserto|areia/.test(nm)) return 'oasis'; if (/vulc|lava|drag/.test(nm)) return 'lava'; if (/caverna|mina|cripta|masmorra|covil|catacumba/.test(nm)) return 'caverna';
        } catch (e) { }
        return 'rio';
    }

    /* ============================ ISCAS ============================ */
    const cntOf = (n) => { try { return getInvCount(n); } catch (e) { return 0; } };
    function activeBait() {
        const sel = player.bait; if (sel === '__none') return null;
        if (sel && BAIT[sel] && cntOf(sel) > 0) return BAIT[sel];
        for (const b of BAITS) if (cntOf(b.n) > 0) return b;
        return null;
    }
    function selectBait(name) {   // "Escolher isca" na mochila: escolhe; clicar de novo volta ao automático (melhor primeiro)
        if (!BAIT[name]) return;
        if (player.bait === name) { player.bait = null; say('Isca automática: usa a melhor que você tiver.', '#bdc3c7'); }
        else { player.bait = name; say('Isca escolhida: ' + name + ' (escolha de novo para voltar ao automático).', '#3498db'); }
        try { saveDataLogic(); } catch (e) { }
        refreshHud();
    }
    function baitLine() { const b = activeBait(); return b ? b.n + ' ×' + cntOf(b.n) : null; }
    function baitLabel() { const sel = player.bait, b = activeBait(); if (sel === '__none') return 'sem isca'; if (!b) return 'sem isca'; return (sel && BAIT[sel] ? '' : 'auto: ') + b.n + ' ×' + cntOf(b.n); }
    function cycleBait(dir) {   // ◀ ▶: automática -> iscas que você tem (melhor primeiro) -> sem isca
        const owned = BAITS.filter((b) => cntOf(b.n) > 0).map((b) => b.n), list = [null].concat(owned, ['__none']);
        let i = list.indexOf(player.bait === undefined ? null : player.bait); if (i < 0) i = 0;
        player.bait = list[(i + dir + list.length) % list.length]; try { saveDataLogic(); } catch (e) { }
        refreshHud();
    }

    /* ============================ SORTEIO ============================ */
    function weather() {
        const E = window.Env; if (!E) return {};
        let rain = false, fog = false, night = false, day = false;
        try { rain = E.rainLevel() > 0.4; fog = /Neblina/.test(E.weatherLabel()); night = E.isNight(); day = E.daylight() > 0.8 && !rain && !fog; } catch (e) { }
        return { rain, fog, night, day };
    }
    const buffV = (k) => { try { const b = player.buffs && player.buffs[k]; return b && b.until > Date.now() ? b.v : 0; } catch (e) { return 0; } };
    function sizeRoll(sp, b, r) {
        r = r || rnd; let t = (r() + r() + r()) / 3; if (b && b.big > 1.2) t = Math.min(1, t + 0.05 * (b.big - 1));
        const cm = Math.round(lerp(sp.cm[0], sp.cm[1], t)), kg = clamp(lerp(sp.kg[0], sp.kg[1], Math.pow(t, 1.5)) * (0.92 + r() * 0.16), sp.kg[0], sp.kg[1] * 1.02);
        return { t, cm, kg: Math.round(kg * 100) / 100 };
    }
    function difficulty(sp, t, L, b) { let d = [0.1, 0.28, 0.48, 0.7, 0.88][sp.rar] + t * 0.14; d -= Math.min(0.2, (L - 1) * 0.004); if (b) d -= b.tier * 0.015; return clamp(d, 0.04, 1); }
    /* sorteia o que morde: { kind:'fish'|'junk'|'chest', sp, t, cm, kg, d }. o = { zone, L, bait (objeto da isca ou null), weather, luck (%), rnd } */
    function roll(o) {
        o = o || {}; const r = o.rnd || rnd, b = o.bait || null, L = o.L || 1, zone = o.zone || 'rio', w = o.weather || {}, luck = 1 + (o.luck || 0) / 100;
        if (b && r() < b.chest) return { kind: 'chest', d: 0.35 };
        if (r() < (b ? 0.035 : 0.06)) return { kind: 'junk', d: 0.05 };
        let tot = 0; const C = [];
        for (const s of SPECIES) {
            const zw = s.z[zone]; if (!zw || L < s.lv) continue; if (!b && s.rar > 0) continue; if (b && s.tier && b.tier < s.tier) continue;
            let wt = zw * RW[s.rar];
            if (s.rar >= 2) wt *= (b ? b.rare : 1) * luck; else if (s.rar === 1) wt *= b ? (b.rare > 1.2 ? 1.4 : 1) * luck : 0;
            if (b && s.rar >= 1 && s.cm[1] >= 90) wt *= Math.min(1.8, b.big);   // iscas grandes puxam peixes grandes
            if (s.wx) { const k = s.wx[0], on = k === 'rain' ? w.rain : k === 'fog' ? w.fog : k === 'night' ? w.night : w.day; wt *= on ? s.wx[1] : (s.wx[2] || 1); }
            if (wt > 0) { C.push([s, wt]); tot += wt; }
        }
        let sp = null; if (!C.length) sp = SPECIES.find((s) => s.rar === 0 && s.z[zone]) || BYID.tilapia; else { let x = r() * tot; for (const c of C) { if ((x -= c[1]) <= 0) { sp = c[0]; break; } } if (!sp) sp = C[C.length - 1][0]; }
        const z = sizeRoll(sp, b, r);
        return { kind: 'fish', sp, t: z.t, cm: z.cm, kg: z.kg, d: difficulty(sp, z.t, L, b) };
    }
    function rollNow() { const b = activeBait(); return roll({ zone: zoneOf(), L: lvl(), bait: b, weather: weather(), luck: buffV('luck') }); }

    /* ============================ ESTADO DA PESCA ============================ */
    let S = null, lastT = 0, P = [], pickSpot = null, pendingMode = null, pendingAt = 0, hintShown = false;
    const holdSrc = { key: false, mouse: false, touch: false, btn: false, test: false }; let hold = false;
    const cfg = { wait: 1, force: null };   // cfg.wait: multiplica a espera pela mordida (testes); cfg.force: { id, t } força a espécie da próxima mordida
    const tools = () => { const inv = player.inventory || []; return { net: inv.find((i) => i && i.tool === 'net'), rod: inv.find((i) => i && i.tool === 'rod') }; };
    const rememberedMode = () => { const m = lsGet('ms_fishmode'); return m === 'net' || m === 'rod' ? m : null; };
    const busy = () => !!S;
    const rodOut = () => !!(S && S.mode === 'rod');

    function start(spot, mode) {
        try {
            if (!window.Art || !player) return false;
            const t = tools();
            if (!t.net && !t.rod) { say('Você precisa de uma rede ou vara de pesca (o Pescador vende).', '#e74c3c'); return false; }
            if (S && S.spot === spot) return true;
            if (pendingMode && Date.now() - pendingAt > 20000) pendingMode = null; let rem = !!mode; if (!mode && pendingMode) { mode = pendingMode; rem = true; } pendingMode = null;
            if (mode && !t[mode]) mode = null;
            if (!mode) {
                if (t.net && t.rod) { const rem = rememberedMode(); if (rem && t[rem]) mode = rem; else { openPicker(spot); return true; } }
                else mode = t.net ? 'net' : 'rod';
            }
            return begin(spot, mode, { remember: rem });
        } catch (e) { console.error(e); return false; }
    }
    function begin(spot, mode, opt) {
        const t = tools(); if (!t[mode]) return false; opt = opt || {};
        if (Math.hypot(player.x - (spot.x + (spot.w || 46) / 2), player.y - (spot.y + (spot.h || 46) / 2)) > 150) { say('Chegue mais perto da água.', '#e74c3c'); return false; }
        wrapInput(); if (S) endSession(true);
        player.fishMode = mode; if (opt.remember) lsSet('ms_fishmode', mode);
        S = { mode, spot, phase: 'cast', t: 0, bob: null, tgt: null, dir: null, forceDir: opt.dir || null, hpLast: player.stats.hp, map: currentMap, catches: 0, fish: null, mg: null, press: false };
        player.isPerformingAction = true; player.actionTarget = spot; player.actionType = 'fish'; player.actionToolItem = t[mode]; player.actionTimer = player.actionDelay = 3000007; player._fmode = mode; player.pendingAutoAction = null;
        enter('cast'); showHud();
        say(mode === 'net' ? 'Pescando com a Rede...' : (activeBait() ? 'Vara + ' + baitLabel() : 'Vara sem isca: pesca fraca. Use ◀ ▶ ou escolha uma isca na mochila.'), mode === 'rod' && !activeBait() ? '#e8c469' : '#3498db');
        if (mode === 'rod' && !hintShown) { hintShown = true; setTimeout(() => { if (S && S.mode === 'rod') say('Quando a boia afundar, aperte Espaço/AÇÃO. Depois segure para tensionar e solte para afrouxar: fique no verde!', '#e8c469'); }, 1800); }
        return true;
    }
    function endSession(silent) {
        if (!S) return; S = null;
        try { if (player.actionType === 'fish') { player.isPerformingAction = false; player.actionToolItem = null; } } catch (e) { }
        hideHud(); try { saveDataLogic(); } catch (e) { }
    }
    function cancel(msg, col) { if (!S) return; const was = S.phase; endSession(); if (msg && was !== 'idle') say(msg, col || '#bdc3c7'); }
    function finish() { return !!S; }   // compatível com o laço antigo: a pesca agora é dirigida por draw()

    /* ---------- escolher o modo ---------- */
    function openPicker(spot) {
        if (typeof openModal !== 'function') return; pickSpot = spot; const t = tools();
        const h = '<div id="fs-pick"><h3>Como pescar?</h3>' +
            '<div class="fs-opt' + (t.net ? '' : ' off') + '" data-m="net"><b>Rede</b><small>' + (t.net ? 'Rápida: 1 a 3 peixes comuns por vez, sem isca.' : 'Você não tem uma Rede de Pesca.') + '</small></div>' +
            '<div class="fs-opt' + (t.rod ? '' : ' off') + '" data-m="rod"><b>Vara</b><small>' + (t.rod ? 'Minigame: mantenha a linha no verde. Peixes grandes e raros.' : 'Você não tem uma Vara de Pesca.') + '</small>' +
            '<div class="fs-bait"><u data-a="bp">◀</u><span id="fs-bl">' + baitLabel() + '</span><u data-a="bn">▶</u></div></div>' +
            '<button type="button" class="fs-x" data-a="x">Cancelar</button></div>';
        openModal(h); const box = $('fs-pick'); if (!box) return;
        box.onmousedown = (e) => { if (e.target.closest('[data-a],.fs-opt')) e.preventDefault(); };
        box.onclick = (e) => {
            const a = e.target.closest('[data-a]'); if (a) { const k = a.dataset.a; if (k === 'bp' || k === 'bn') { cycleBait(k === 'bp' ? -1 : 1); const l = $('fs-bl'); if (l) l.textContent = baitLabel(); } else if (k === 'x') closeModal(); return; }
            const o = e.target.closest('.fs-opt'); if (!o || o.classList.contains('off')) return;
            closeModal(); const sp = pickSpot; if (sp && sp.active !== false) begin(sp, o.dataset.m, { remember: true });
        };
    }
    function menu(spot, add, setPending) {   // opções do botão direito no ponto de pesca
        const t = tools();
        if (t.net) add('Pescar com a Rede', () => { pendingMode = 'net'; pendingAt = Date.now(); setPending(spot); });
        if (t.rod) add('Pescar com a Vara' + (baitLine() ? ' (' + baitLine() + ')' : ''), () => { pendingMode = 'rod'; pendingAt = Date.now(); setPending(spot); });
        if (!t.net && !t.rod) add('Pescar', () => setPending(spot));
    }

    /* ============================ ENTRADA (Espaço, mouse, toque, botão AÇÃO) ============================ */
    function setHold(src, on) { holdSrc[src] = !!on; const h = holdSrc.key || holdSrc.mouse || holdSrc.touch || holdSrc.btn || holdSrc.test; if (h && !hold && S && S.phase === 'bite') S.press = true; hold = h; }
    const modalOf = (id) => { const ov = $('custom-modal-overlay'); return !!(ov && ov.style.display !== 'none' && $(id)); };
    let wired = false;
    function wrapInput() {
        if (wired) return; wired = true;
        const isField = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '');
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { if (modalOf('fs-pick') || modalOf('fd-box')) { try { closeModal(); } catch (er) { } } else if (S) cancel('Você recolheu a linha.'); return; }
            if (!S || isField(e) || e.code !== 'Space') return; e.preventDefault(); e.stopImmediatePropagation(); setHold('key', true);
        }, true);
        window.addEventListener('keyup', (e) => { if (e.code === 'Space') { setHold('key', false); if (S) e.stopImmediatePropagation(); } }, true);
        const cv = () => $('gameCanvas');
        window.addEventListener('mousedown', (e) => { if (S && e.button === 0 && e.target === cv() && (S.phase === 'bite' || S.phase === 'fight')) { e.preventDefault(); e.stopImmediatePropagation(); setHold('mouse', true); } }, true);
        window.addEventListener('mouseup', () => setHold('mouse', false), true);
        window.addEventListener('touchstart', (e) => { if (S && e.target === cv() && (S.phase === 'bite' || S.phase === 'fight')) setHold('touch', true); }, true);
        const tend = (e) => { if (!e.touches || e.touches.length === 0) setHold('touch', false); };
        window.addEventListener('touchend', tend, true); window.addEventListener('touchcancel', tend, true);
        window.addEventListener('pointerdown', (e) => { const b = e.target && e.target.closest && e.target.closest('#mobile-action-btn'); if (b && S) setHold('btn', true); }, true);
        const pu = () => setHold('btn', false); window.addEventListener('pointerup', pu, true); window.addEventListener('pointercancel', pu, true);
        window.addEventListener('blur', () => { for (const k in holdSrc) holdSrc[k] = false; hold = false; });
        // o botão AÇÃO/Espaço normal cancelaria a ação: enquanto pesca, ele é só o "fisgar/segurar"
        const tp = window.tryPickupOrInteract; if (typeof tp === 'function' && !tp._fs) { const w = function () { if (S) return; return tp.apply(this, arguments); }; w._fs = 1; window.tryPickupOrInteract = w; }
        const ta = window.tryAttack; if (typeof ta === 'function' && !ta._fs) { const w2 = function () { if (S && (S.phase === 'bite' || S.phase === 'fight')) return; return ta.apply(this, arguments); }; w2._fs = 1; window.tryAttack = w2; }
        const cm = window.onCanvasMouseDown; if (typeof cm === 'function' && !cm._fs) { const w3 = function (e) { if (S && (S.phase === 'bite' || S.phase === 'fight') && e && e.type === 'touchstart') return; return cm.apply(this, arguments); }; w3._fs = 1; window.onCanvasMouseDown = w3; }
    }

    /* ============================ MECÂNICA ============================ */
    function enter(ph) { S.phase = ph; S.t = 0; }
    const DIRS = [[1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071], [-1, 0], [-0.7071, -0.7071], [0, -1], [0.7071, -0.7071]];
    const NAMED = { e: [1, 0], s: [0, 1], w: [-1, 0], n: [0, -1] };
    function waterRun(m, x, y, dx, dy) {   // distância até onde a água acaba andando nessa direção
        let s = -1, e = 0;
        for (let r = 0; r <= 260; r += 6) { const w = Art.isWater(m, x + dx * r, y + dy * r); if (s < 0) { if (w) s = r; else if (r >= 48) break; } else { if (w) e = r; else break; } }
        return s < 0 ? 0 : e;
    }
    function chooseTarget(short) {   // direção com mais água; devolve ponto sempre sobre água
        const m = gameMaps[currentMap], px = player.x, py = player.y; let best = null, bs = -1;
        const list = S.forceDir && NAMED[S.forceDir] ? [NAMED[S.forceDir]] : DIRS;
        for (const d of list) { const e = waterRun(m, px, py, d[0], d[1]); const sc = e + (S.dir && S.dir[0] === d[0] && S.dir[1] === d[1] ? 24 : 0) + rnd() * 6; if (sc > bs) { bs = sc; best = d; } }
        let e = waterRun(m, px, py, best[0], best[1]), dist;
        if (short) dist = e >= 100 ? lerp(56, Math.min(100, e - 8), rnd()) : Math.max(22, e - 6);
        else dist = e >= 130 ? lerp(120, Math.min(200, e - 10), rnd()) : e >= 50 ? e - 8 : Math.max(22, e - 4);
        if (e < 20) { const sp = S.spot; return { x: sp.x + (sp.w || 46) / 2, y: sp.y + (sp.h || 46) / 2 + 14, d: best }; }
        return { x: px + best[0] * dist, y: py + best[1] * dist, d: best };
    }
    function faceTo(d) { if (Math.abs(d[0]) > Math.abs(d[1]) + 0.01) { player.facing.x = d[0] > 0 ? 1 : -1; player.facing.y = 0; } else { player.facing.x = 0; player.facing.y = d[1] > 0 ? 1 : -1; } }
    function tipPos(len) {   // ponta da vara (ou do cabo da rede) acompanhando a mão do desenho do personagem
        const L = player.look || (Art.defaultLook && Art.defaultLook()) || { sex: 'm', race: 'human' }, D = Art.dimsOf(L.sex, L.race), f = player.facing || { x: 0, y: 1 };
        const view = f.y < 0 ? 'back' : f.y > 0 ? 'front' : 'side', flip = f.x < 0 ? -1 : 1, an = player.actionAnim > 0 ? player.actionAnim : 0, sw = an > 0 ? Math.sin((an / 15) * Math.PI) : 0;
        let hx, hy, rot, sg = 1;
        if (view === 'side') { const a = -0.25 + sw * 1.7; hx = 1 + 2 * Math.cos(a) - 12 * Math.sin(a); hy = -29 + 2 * Math.sin(a) + 12 * Math.cos(a); rot = 0.72 + a * 0.45 + sw * 0.7; }
        else if (view === 'back') { hx = -(D.sh + 2.4) - sw * 1.2; hy = -14.6 - sw * 3.6; rot = 0.34 + sw * 0.5; sg = -1; }
        else { hx = D.sh + 2.4 + sw * 1.2; hy = -14.6 - sw * 3.6; rot = 0.3 + sw * 1.7; }
        hx *= D.sx; hy *= D.sy; const tx = sg * len * Math.sin(rot), ty = -len * Math.cos(rot);
        return { x: player.x + (view === 'side' ? flip : 1) * (hx + tx), y: player.y + 8 + hy + ty };
    }
    const baseWait = () => { const b = activeBait(); let w = 4.2 + rnd() * 4.2; w -= Math.min(2, lvl() * 0.05); w *= b ? 1 - b.tier * 0.07 : 1.5; w *= 1 - Math.min(0.5, buffV('fspd') / 100); return Math.max(1.6, w) * cfg.wait; };
    function ring(x, y, r0, mx, life, a) { P.push({ ty: 'ring', x, y, t: 0, life: life || 1, r0: r0 || 2, r1: mx || 16, a: a == null ? 0.6 : a }); }
    function bubbles(x, y, n) { for (let i = 0; i < n; i++) P.push({ ty: 'bub', x: x + (rnd() - 0.5) * 8, y: y + 2, vx: (rnd() - 0.5) * 6, vy: -(10 + rnd() * 16), t: -rnd() * 0.15, life: 0.7 + rnd() * 0.5, r: 1 + rnd() * 1.6 }); }
    function splash(x, y, n) { ring(x, y, 2, 15, 0.9); ring(x, y, 2, 24, 1.2, 0.45); ring(x, y, 2, 34, 1.5, 0.3); try { Art.burst(x, y - 2, '#d6efff', n || 9, 1.2); } catch (e) { } sfx('fish'); }

    function aimStart(short) {
        const m = chooseTarget(short); S.dir = m.d; S.tgt = { x: m.x, y: m.y }; faceTo(m.d); player.actionAnim = 15;
        S.dist = Math.hypot(m.x - player.x, m.y - player.y);
    }
    function tickCast(dt) {
        const net = S.mode === 'net', W = 0.3, F = net ? 0.4 : 0.5, tip = tipPos(net ? 20 : 34);
        if (!S.tgt) aimStart(net);
        if (S.t < W) { S.bob = { x: tip.x, y: tip.y, sink: 0, vis: 0 }; return; }
        const p = clamp((S.t - W) / F, 0, 1), e = 1 - Math.pow(1 - p, 2), arc = Math.min(70, 22 + S.dist * 0.25);
        S.bob = { x: lerp(tip.x, S.tgt.x, e), y: lerp(tip.y, S.tgt.y, e) - Math.sin(p * Math.PI) * arc, sink: 0, vis: 1, fly: p };
        if (p >= 1) {
            S.bob = { x: S.tgt.x, y: S.tgt.y, sink: 0, vis: 1, ph: rnd() * 6 }; splash(S.bob.x, S.bob.y, 10);
            S.nibs = []; if (net) { S.biteAt = Math.max(0.9, (1.8 - lvl() * 0.02) * (1 - Math.min(0.5, buffV('fspd') / 100))) * Math.min(1, cfg.wait); enter('wait'); return; }
            S.biteAt = baseWait(); const n = Math.floor(rnd() * 3); for (let i = 0; i < n; i++) S.nibs.push(0.9 + rnd() * Math.max(0.1, S.biteAt - 1.8)); S.nibs.sort((a, b) => a - b); S.nibIdx = 0;
            enter('wait');
        }
    }
    function tickWait(dt) {
        const b = S.bob; if (S.mode === 'rod') {
            b.dip = Math.max(0, (b.dip || 0) - dt * 2.2);
            if (S.nibIdx < S.nibs.length && S.t >= S.nibs[S.nibIdx]) { S.nibIdx++; b.dip = 0.55; ring(b.x, b.y, 2, 13, 0.9, 0.55); bubbles(b.x, b.y, 2); }
            else if (!b.idleT || S.t - b.idleT > 1.7) { b.idleT = S.t; ring(b.x, b.y, 2, 10, 1.6, 0.28); }
        } else if (!b.idleT || S.t - b.idleT > 0.7) { b.idleT = S.t; ring(b.x, b.y, 3, 18, 1.1, 0.35); }
        if (S.t < S.biteAt) return;
        if (S.mode === 'net') { enter('haul'); S.from = { x: b.x, y: b.y }; return; }
        const bt = activeBait();
        if (!bt && rnd() < 0.5) { say('Nada mordeu... use uma isca!', '#bdc3c7'); ring(b.x, b.y, 2, 12, 0.8); S.t = 0; S.tgt = null; enter('back'); return; }
        // morde: gasta a isca e decide o que veio
        if (bt) { removeInvItem(bt.n, 1); if (player.bait === bt.n && cntOf(bt.n) <= 0) { player.bait = null; const nx = activeBait(); say('Acabou a ' + bt.n + (nx ? '; usando ' + nx.n + '.' : '.'), '#e8c469'); } refreshHud(); }
        let f = cfg.force ? Object.assign({}, cfg.force) : null; cfg.force = null;
        if (f && f.id) { const sp = BYID[f.id]; const t = f.t == null ? 0.5 : f.t; f = { kind: 'fish', sp, t, cm: Math.round(lerp(sp.cm[0], sp.cm[1], t)), kg: Math.round(lerp(sp.kg[0], sp.kg[1], Math.pow(t, 1.5)) * 100) / 100, d: difficulty(sp, t, lvl(), bt) }; }
        S.fish = f && f.kind ? f : rollNow(); if (cfg.forceD != null) S.fish.d = cfg.forceD; S.bait = bt; S.win = 1.35 - (bt ? bt.fail * 0.7 : 0) + (S.fish.d < 0.3 ? 0.2 : 0); S.press = false; enter('bite');
        bubbles(b.x, b.y, 7); ring(b.x, b.y, 2, 20, 0.9, 0.7); ring(b.x, b.y, 2, 30, 1.3, 0.4); sfx('pickup');
    }
    function tickBite(dt) {
        const b = S.bob; b.sink = Math.min(1, S.t / 0.12) * 0.9; b.dip = 0; if (S.t % 0.35 < dt) { ring(b.x, b.y, 2, 14, 0.7, 0.5); }
        if (S.press) { S.press = false; hook(); return; }
        if (S.t >= S.win) { escape('O peixe escapou! Você demorou a fisgar (a isca se perdeu).', true); }
    }
    function hook() {
        const f = S.fish; if (f.kind === 'junk') { reelIn(); return; }
        S.mg = fightInit(f.d, f.kind === 'fish' ? f.sp.pat : 'calmo', lvl(), S.bait);
        S.bob.sink = 0.55; S.bob.dip = 0; enter('fight'); sfx('click'); bubbles(S.bob.x, S.bob.y, 4);
        if (f.kind === 'fish' && (f.sp.rar >= 2 || f.t > 0.75)) addFloatingText(player.x, player.y - 76, 'Que peso! Parece grande!', '#ffd24a');
    }
    function fightInit(d, patName, L, bt) {   // estado do minigame (puro: sem DOM nem mundo)
        const pt = PAT[patName] || PAT.normal, zw = lerp(0.37, 0.19, d) + Math.min(0.05, (bt ? bt.tier * 0.008 : 0) + L * 0.0004);
        return { pos: 0.12, v: 0, zc: 0.42, zw, tgt: 0.5, spd: pt.spd * (0.7 + 0.45 * d), ivl: pt.ivl * (1.2 - 0.5 * d), dash: pt.dash * (0.6 + 0.8 * d), jit: pt.jit, tmr: 0.6, dashT: 0, dashSpd: 0.8 + 0.45 * d, P: 0.3, st: 0, d, time: 0, ing: false, ingT: 0 };
    }
    function fightStep(g, dt, hold) {   // um passo do minigame
        g.time += dt;
        g.v += (hold ? 6 : -4.4) * dt; g.v *= Math.pow(0.02, dt); g.pos += g.v * dt;
        if (g.pos > 1) { g.pos = 1; g.v = Math.min(0, -g.v * 0.25); } else if (g.pos < 0) { g.pos = 0; g.v = Math.max(0, -g.v * 0.2); }
        const lo = g.zw / 2 + 0.01, hi = 0.9 - g.zw / 2;
        g.tmr -= dt; if (g.tmr <= 0) {
            if (rnd() < g.dash) { const up = g.zc < 0.5 ? rnd() < 0.7 : rnd() < 0.3; g.tgt = up ? lerp(0.62, hi, rnd()) : lerp(lo, 0.28, rnd()); g.dashT = 0.45; g.tmr = 0.55 + rnd() * 0.3; }
            else { const step = (0.12 + 0.35 * g.d) * (rnd() < 0.5 ? -1 : 1); g.tgt = clamp(g.zc + step + (rnd() - 0.5) * 0.1, lo, hi); g.tmr = g.ivl * (0.6 + rnd() * 0.8); g.dashT = 0; }
        }
        const sp = (g.dashT > 0 ? g.dashSpd : g.spd); if (g.dashT > 0) g.dashT -= dt;
        const dz = g.tgt - g.zc; g.zc += Math.sign(dz) * Math.min(Math.abs(dz), sp * dt); if (g.jit) g.zc += Math.sin(g.time * 17) * 0.0018;
        g.zc = clamp(g.zc, lo, hi);
        g.ing = Math.abs(g.pos - g.zc) <= g.zw / 2;
        g.P += (g.ing ? 0.22 * (1 - 0.35 * g.d) : -(0.08 + 0.06 * g.d)) * dt; g.P = Math.min(1, g.P);
        if (g.pos > 0.88) g.st += 0.6 * dt; else g.st = Math.max(0, g.st - 0.7 * dt);
    }
    function tickFight(dt) {
        const g = S.mg; fightStep(g, dt, hold);
        const b = S.bob; b.sink = 0.55 + 0.25 * Math.sin(g.time * 9) * (g.ing ? 0.4 : 1); if (g.time % 0.5 < dt) { ring(b.x, b.y, 2, 16, 0.8, 0.5); if (rnd() < 0.5) bubbles(b.x, b.y, 2); }
        if (g.st >= 1) { escape('A linha estourou! O peixe escapou.', false, true); return; }
        if (g.P <= 0) { escape('O peixe escapou!', false); return; }
        if (g.P >= 1) reelIn();
        else if (g.time > 80) escape('O peixe se soltou do anzol.', false);
    }
    /* simulação do minigame com um "jogador" que reage com atraso (lagMs) e erra o alvo por ruído (testes de balanceamento) */
    function sim(d, pat, lagMs, trials, L, bt) {
        const out = { win: 0, snap: 0, drain: 0, time: 0 }, dt = 1 / 60, lag = Math.max(1, Math.round(lagMs / 16.7));
        for (let n = 0; n < (trials || 50); n++) {
            const g = fightInit(d, pat || 'normal', L || 1, bt || null), q = []; let hold = false, res = null, frames = 0;
            while (!res && frames < 4800) {
                q.push([g.pos, g.zc, g.v]); if (q.length > lag) { const o = q.shift(); hold = o[0] + o[2] * 0.12 < o[1] + (rnd() - 0.5) * 0.06; }
                fightStep(g, dt, hold); frames++;
                if (g.st >= 1) res = 'snap'; else if (g.P <= 0) res = 'drain'; else if (g.P >= 1) res = 'win'; else if (g.time > 80) res = 'drain';
            }
            out[res || 'drain']++; out.time += g.time;
        }
        out.time = Math.round(out.time / (trials || 50) * 10) / 10; return out;
    }
    function escape(msg, missed, snap) {
        const b = S.bob; sfx('error'); say(msg, '#e74c3c'); ring(b.x, b.y, 2, 18, 0.8, 0.6); bubbles(b.x, b.y, 5); S.snapLine = !!snap; S.mg = null; S.fish = null; b.sink = 0; enter('result'); S.resT = 0.9;
        if (snap) { S.snapFrom = tipPos(34); }
    }
    function reelIn() { S.reel = { x: S.bob.x, y: S.bob.y }; enter('reel'); }
    function tickReel(dt) {
        const tip = tipPos(34), p = clamp(S.t / 0.55, 0, 1), e = p * p; S.bob.x = lerp(S.reel.x, tip.x, e); S.bob.y = lerp(S.reel.y, tip.y, e) - Math.sin(p * Math.PI) * 24; S.bob.sink = 0;
        if (p >= 1) { landCatch(); }
    }
    function xpMult() { return 1 + buffV('fxp') / 100; }
    function bag(name, q) { return addInvItem(name, q) ? true : (q > 1 && addInvItem(name, 1)); }
    function recordFish(sp, cm, kg) {
        if (!player.fish || typeof player.fish !== 'object') player.fish = {};
        const r = player.fish[sp.id] || (player.fish[sp.id] = { max: 0, kg: 0, count: 0 }); r.count++;
        const rec = cm > r.max; if (rec) { r.max = cm; r.kg = kg; } return { rec, first: r.count === 1 };
    }
    function landCatch() {
        const f = S.fish, bt = S.bait, tip = tipPos(34); S.bait = null; S.catches++;
        if (!f) { enter('result'); S.resT = 0.2; return; }
        let ok = true, res = null;
        if (f.kind === 'junk') { if (bag('Bota Velha', 1)) { addXP('fishing', 2); say('Era só uma Bota Velha...', '#bdc3c7'); addPickupText('Bota Velha', 1); } else ok = false; }
        else if (f.kind === 'chest') {
            const L = lvl(), c = Math.floor((30 + rnd() * 90 + L * 3) * (bt && bt.tier >= 4 ? 2 : 1));
            if (!addInvItem('Coins', c)) ok = false; else {
                addXP('fishing', Math.round(25 * xpMult())); say('Baú do tesouro! +' + c + ' moedas', '#ffd24a'); addPickupText('Coins', c); sfx('coin'); splash(player.x, player.y - 10, 16);
                if (rnd() < 0.35) { const k = 1 + Math.floor(rnd() * 3); if (addInvItem('Isca Brilhante', k)) addPickupText('Isca Brilhante', k); }
                if ((!bt || bt.tier < 4) && rnd() < 0.12 && addInvItem('Isca Dourada', 1)) addPickupText('Isca Dourada', 1);
                try { Life.cnt('chests'); } catch (e) { } try { saveDataLogic(); } catch (e) { }
            }
        } else {
            const sp = f.sp, giant = f.t >= 0.78; let q = giant ? 2 : 1;
            const before = cntOf(sp.raw);
            if (!bag(sp.raw, q)) ok = false; else {
                q = Math.max(1, cntOf(sp.raw) - before);
                const xp = Math.round(XPB[sp.rar] * (0.7 + 0.6 * f.t) * (bt ? bt.xp : 0.6) * xpMult()); addXP('fishing', xp);
                res = recordFish(sp, f.cm, f.kg); const col = RARC[sp.rar];
                addFloatingText(player.x, player.y - 28, sp.n + ' ' + f.cm + ' cm', col); addPickupText(sp.raw, q);
                say(sp.n + ' ' + f.cm + ' cm · ' + fmtKg(f.kg) + ' kg' + (giant ? ' · EXEMPLAR GIGANTE (x2)!' : '') + (res.rec && !res.first ? ' · Novo recorde!' : '') + (res.first ? ' · Nova espécie no diário!' : ''), col);
                splash(player.x, player.y - 10, 6);
                if (sp.rar >= 2) {
                    try { Life.cnt('rarefish'); } catch (e) { } sfx('quest'); try { Art.burst(player.x, player.y - 14, sp.rar >= 4 ? '#ffd24a' : '#8fd8ff', 8 + sp.rar * 4, 1.4); } catch (e) { }
                    if (rnd() < 0.25 && addInvItem('Isca Brilhante', 1)) addPickupText('Isca Brilhante', 1);
                }
                if (sp.rar >= 2 || res.rec) { try { saveDataLogic(); } catch (e) { } }
            }
        }
        if (!ok) { addFloatingText(player.x, player.y - 15, 'Mochila cheia!', '#e74c3c'); say('Mochila cheia!', '#e74c3c'); S.stop = true; }
        S.fish = null; S.mg = null; enter('result'); S.resT = 0.7; S.catchIcon = (f.kind === 'fish' && ok) ? f.sp.raw : null; S.from = tip;
        try { updateUI(); } catch (e) { }
    }
    function netCatch() {
        const L = lvl(), z = zoneOf(); let q = 1 + (rnd() < 0.35 ? 1 : 0) + (L >= 10 && rnd() < 0.25 ? 1 : 0), got = 0, lines = [];
        const commons = SPECIES.filter((s) => s.rar === 0 && s.z[z]);
        for (let i = 0; i < q; i++) {
            let name = 'Raw Fish', sp = null;
            if (commons.length && rnd() < 0.45) { sp = commons[Math.floor(rnd() * commons.length)]; name = sp.raw; }
            if (!addInvItem(name, 1)) { if (!(name !== 'Raw Fish' && addInvItem('Raw Fish', 1))) break; sp = null; name = 'Raw Fish'; }
            got++; addXP('fishing', Math.round(5 * xpMult())); addPickupText(name, 1);
            if (sp) { const z2 = sizeRoll(sp, null); z2.t *= 0.7; const cm = Math.round(lerp(sp.cm[0], sp.cm[1], z2.t)), kg = Math.round(lerp(sp.kg[0], sp.kg[1], Math.pow(z2.t, 1.5)) * 100) / 100, r = recordFish(sp, cm, kg); lines.push(sp.n + ' ' + cm + ' cm' + (r.first ? ' (nova espécie!)' : '')); }
        }
        if (!got) { say('Mochila cheia!', '#e74c3c'); return false; }
        addFloatingText(player.x, player.y - 28, got > 1 ? 'Pescado x' + got : 'Pescado', '#3498db'); if (lines.length) say(lines.join(' · '), '#9fd8ff');
        if (L >= 3 && rnd() < 0.07) { const k = 1 + Math.floor(rnd() * 3); if (addInvItem('Isca de Camarão', k)) { say('Camarões na rede! +' + k + ' Isca de Camarão', '#e8c469'); addPickupText('Isca de Camarão', k); } }
        S.catches++; return true;
    }

    /* ---------- laço de tempo (chamado em draw, uma vez por quadro) ---------- */
    function nextCycle() {
        const t = tools(); if (!t[S.mode]) { cancel('Você precisa da ferramenta no inventário.', '#e74c3c'); return; }
        if (S.stop) { cancel(); return; } S.tgt = null; S.bob = null; S.snapLine = false; S.catchIcon = null; enter('cast');
    }
    function update(dt) {
        if (!S) return;
        if (!player.isPerformingAction || player.actionType !== 'fish') { const ph = S.phase; endSession(); if (ph === 'fight' || ph === 'bite') say('Você se afastou! O peixe escapou.', '#bdc3c7'); return; }
        if (!S.spot || S.spot.active === false || S.map !== currentMap || player.stats.hp <= 0) { endSession(); return; }
        if (player.stats.hp < S.hpLast) { const ph = S.phase; endSession(); say(ph === 'fight' || ph === 'bite' ? 'Você foi atingido! O peixe escapou.' : 'Você foi atingido! Recolheu a linha.', '#e74c3c'); return; }
        S.hpLast = player.stats.hp; player.actionTimer = player.actionDelay = 3000007;
        S.t += dt;
        switch (S.phase) {
            case 'cast': tickCast(dt); break;
            case 'wait': tickWait(dt); break;
            case 'bite': tickBite(dt); break;
            case 'fight': tickFight(dt); break;
            case 'reel': tickReel(dt); break;
            case 'haul': {
                const tip = tipPos(20), p = clamp(S.t / 0.7, 0, 1); S.bob.x = lerp(S.from.x, tip.x, p * p); S.bob.y = lerp(S.from.y, tip.y, p * p) - Math.sin(p * Math.PI) * 14;
                if (p >= 1) { splash(player.x, player.y - 6, 8); const ok = netCatch(); if (!ok) S.stop = true; enter('result'); S.resT = 0.5; S.bob = null; }
                break;
            }
            case 'back': if (S.t > 0.5) nextCycle(); break;
            case 'result': {
                if (S.t >= (S.resT || 0.7)) nextCycle();
                break;
            }
        }
    }

    /* ============================ DESENHO NO MUNDO ============================ */
    function drawParticles(ctx, dt) {
        for (let i = P.length - 1; i >= 0; i--) {
            const q = P[i]; q.t += dt; if (q.t < 0) continue; if (q.t >= q.life) { P.splice(i, 1); continue; }
            const k = q.t / q.life;
            if (q.ty === 'ring') { ctx.strokeStyle = 'rgba(235,249,255,' + (q.a * (1 - k)).toFixed(3) + ')'; ctx.lineWidth = 1; const r = lerp(q.r0, q.r1, 1 - (1 - k) * (1 - k)); ctx.beginPath(); ctx.ellipse(q.x, q.y + 1, r, r * 0.42, 0, 0, 6.2832); ctx.stroke(); }
            else { q.x += q.vx * dt; q.y += q.vy * dt; ctx.fillStyle = 'rgba(235,249,255,' + (0.7 * (1 - k)).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 6.2832); ctx.fill(); ctx.strokeStyle = 'rgba(120,170,200,' + (0.5 * (1 - k)).toFixed(3) + ')'; ctx.lineWidth = 0.6; ctx.stroke(); }
        }
    }
    function drawLine(ctx, a, b, slack, col) {
        const len = Math.hypot(b.x - a.x, b.y - a.y), sag = slack * Math.min(28, 5 + len * 0.13), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + sag;
        ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(20,30,40,0.35)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke();
        ctx.strokeStyle = col || 'rgba(250,250,245,0.95)'; ctx.lineWidth = 1; ctx.stroke();
    }
    function drawBobber(ctx, x, y, sink, T, ph) {
        const bob = Math.sin(T * 2.3 + (ph || 0)) * 0.9 * (1 - sink), cy = y - 2 + bob + sink * 6;
        const ball = (alpha) => { ctx.globalAlpha = alpha; ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 1; ctx.fillStyle = '#e8483a'; ctx.beginPath(); ctx.arc(x, cy, 4.2, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fafafa'; ctx.beginPath(); ctx.arc(x, cy, 4.2, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fillRect(x - 0.5, cy - 8, 1, 4); };
        ctx.save(); if (sink > 0.05) { ctx.globalAlpha = 0.3; ball(0.3); }
        ctx.beginPath(); ctx.rect(x - 14, y - 30, 28, 30 + 1 - 0); ctx.clip(); ball(1); ctx.restore();
        ctx.strokeStyle = 'rgba(235,249,255,0.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y + 1, 7 + sink * 2, 2.8 + sink, 0, 0, 6.2832); ctx.stroke();
    }
    function drawNet(ctx, x, y, sink, T) {
        ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.62); ctx.globalAlpha = 0.9 - sink * 0.2;
        ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 14, 0, 6.2832); ctx.stroke(); ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(240,235,215,0.9)'; ctx.beginPath(); for (let i = -10; i <= 10; i += 5) { ctx.moveTo(i, -10 + Math.abs(i) * 0.2); ctx.lineTo(i, 10 - Math.abs(i) * 0.2); ctx.moveTo(-10 + Math.abs(i) * 0.2, i); ctx.lineTo(10 - Math.abs(i) * 0.2, i); } ctx.stroke(); ctx.restore();
    }
    function drawAlert(ctx, T) {
        const x = player.x, y = player.y - 74 - Math.abs(Math.sin(T * 12)) * 5, s = 1 + Math.sin(T * 20) * 0.06;
        ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = '#d6301f'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 11, 0, 6.2832); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 17px "Trebuchet MS",Arial,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', 0, 1); ctx.restore();
    }
    function drawBar(ctx, T) {
        const g = S.mg, m = ctx.getTransform(), sx = m.a * player.x + m.e, cw = ctx.canvas.width, side = S.tgt && S.tgt.x > player.x + 20 ? -1 : 1; if (side > 0 && sx > cw * 0.78) side = -1; else if (side < 0 && sx < cw * 0.22) side = 1;   // do lado oposto da linha, sem sair da tela
        const H = 84, W = 12, PW = 40, x0 = side > 0 ? player.x + 26 : player.x - 26 - PW, y0 = player.y - 72, bx = x0 + 13, by = y0 + 6, cx = x0 + 5, lx = bx + W + 3;
        const Y = (v) => by + H * (1 - v), rr = (x, y, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };
        ctx.save(); ctx.fillStyle = 'rgba(14,10,6,0.86)'; ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 1; rr(x0, y0, PW, H + 22, 5); ctx.fill(); ctx.stroke();
        // trilha principal + zona vermelha (tensão alta demais)
        ctx.fillStyle = '#26343f'; ctx.fillRect(bx, by, W, H); ctx.fillStyle = '#7b1c14'; ctx.fillRect(bx, by, W, H * 0.12); ctx.fillStyle = 'rgba(255,90,70,0.35)'; for (let i = 0; i < 3; i++) ctx.fillRect(bx, by + i * 3.6 + 1, W, 1.4);
        // zona verde (onde o peixe está)
        const gy = Y(g.zc + g.zw / 2), gh = H * g.zw; ctx.fillStyle = g.ing ? '#4df07f' : '#2fae58'; ctx.fillRect(bx, gy, W, gh); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(bx + 1, gy + 1, 2, gh - 2);
        ctx.strokeStyle = g.ing ? '#d6ffe2' : '#8fe6ad'; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, gy + 0.5, W - 1, gh - 1);
        // peixinho no centro da zona
        const fy = Y(g.zc) + (g.dashT > 0 ? (Math.random() - 0.5) * 2 : Math.sin(T * 6) * 0.6); ctx.fillStyle = '#10341d'; ctx.beginPath(); ctx.ellipse(bx + W / 2 - 0.5, fy, 3.6, 1.9, 0, 0, 6.2832); ctx.fill(); ctx.beginPath(); ctx.moveTo(bx + W / 2 + 2.6, fy); ctx.lineTo(bx + W / 2 + 5, fy - 2); ctx.lineTo(bx + W / 2 + 5, fy + 2); ctx.fill();
        // cursor (tensão da linha)
        const cy = Y(g.pos), hot = g.pos > 0.88; ctx.strokeStyle = hot ? '#ff6a55' : '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx - 2, cy); ctx.lineTo(bx + W + 2, cy); ctx.stroke();
        ctx.fillStyle = hot ? '#ff6a55' : '#fff'; ctx.beginPath(); ctx.moveTo(bx + W + 2, cy); ctx.lineTo(bx + W + 2 + 0, cy - 3); ctx.lineTo(bx + W - 2, cy); ctx.lineTo(bx + W + 2, cy + 3); ctx.fill();
        // captura (esquerda) e linha/estouro (direita)
        ctx.fillStyle = '#26343f'; ctx.fillRect(cx, by, 4, H); ctx.fillStyle = g.P > 0.66 ? '#6fe08a' : '#f1c40f'; ctx.fillRect(cx, by + H * (1 - g.P), 4, H * g.P);
        ctx.fillStyle = '#26343f'; ctx.fillRect(lx, by, 4, H); ctx.fillStyle = g.st > 0.6 ? '#ff4a3a' : '#ff9d3a'; ctx.fillRect(lx, by + H * (1 - g.st), 4, H * g.st);
        if (g.st > 0.45 && Math.sin(T * 24) > 0) { ctx.strokeStyle = '#ff4a3a'; ctx.lineWidth = 1.2; rr(x0, y0, PW, H + 22, 5); ctx.stroke(); }
        ctx.font = 'bold 8px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; const below = g.pos < g.zc - g.zw / 2, above = g.pos > g.zc + g.zw / 2;
        ctx.fillStyle = g.ing ? '#6fe08a' : (below ? '#f1c40f' : '#ff8a6a'); ctx.fillText(g.ing ? 'ISSO!' : below ? '▲ SEGURE' : above ? '▼ SOLTE' : '', x0 + PW / 2, y0 + H + 17);
        ctx.restore();
    }
    function draw(ctx, T) {
        const dt = clamp(T - lastT, 0, 0.05); lastT = T;
        try { if (S) update(dt); } catch (e) { console.error(e); endSession(); }
        if (!S && !P.length) return;
        ctx.save();
        try {
            if (S && S.bob && S.bob.vis !== undefined) {
                const b = S.bob, rod = S.mode === 'rod', tip = tipPos(rod ? 34 : 20), ph = S.phase;
                if (S.snapLine) { const a = S.snapFrom || tip; ctx.strokeStyle = 'rgba(250,250,245,0.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.quadraticCurveTo(tip.x + 4, tip.y + 12, tip.x - 2, tip.y + 20); ctx.stroke(); }
                else {
                    if (b.vis) {
                        const slack = ph === 'fight' ? Math.max(0.1, 0.55 - S.mg.pos * 0.5) : ph === 'bite' ? 0.35 : ph === 'wait' ? 0.75 + Math.sin(T * 1.3) * 0.05 : ph === 'cast' ? 0.9 * (1 - (b.fly || 0)) + 0.1 : 0.2;
                        drawLine(ctx, tip, { x: b.x, y: b.y - (ph === 'cast' || ph === 'reel' || ph === 'haul' ? 0 : 2) }, slack, ph === 'fight' && S.mg.pos > 0.88 ? 'rgba(255,120,100,1)' : null);
                    } else drawLine(ctx, tip, { x: tip.x + 1, y: tip.y + 14 }, 1, null);
                    if (b.vis) { if (rod) drawBobber(ctx, b.x, b.y, (b.sink || 0) + (b.dip || 0) * 0.5, T, b.ph); else drawNet(ctx, b.x, b.y, b.sink || 0, T); }
                }
                if (ph === 'bite') drawAlert(ctx, T);
                if (ph === 'fight' && S.mg) drawBar(ctx, T);
                if (ph === 'result' && S.catchIcon && window.Icons && S.t < 0.7) {   // o peixe sobe da água até o personagem
                    const p = clamp(S.t / 0.5, 0, 1), fx = lerp(S.reel ? S.reel.x : player.x, player.x, p), fy = lerp(S.reel ? S.reel.y : player.y, player.y - 38, p) - Math.sin(p * Math.PI) * 26, cv = Icons.canvas(S.catchIcon);
                    ctx.globalAlpha = 1 - Math.max(0, (S.t - 0.5) / 0.2); ctx.drawImage(cv, fx - 11, fy - 11, 22, 22); ctx.globalAlpha = 1;
                }
            }
        } catch (e) { console.error(e); }
        drawParticles(ctx, dt);
        ctx.restore();
    }

    /* ============================ HUD DA PESCA (DOM) ============================ */
    function css() {
        if (STYLE) return; STYLE = document.createElement('style'); STYLE.textContent = `
        #fs-hud{position:absolute;left:50%;bottom:66px;transform:translateX(-50%);z-index:90;display:none;align-items:center;gap:6px;padding:4px 8px;border-radius:10px;background:rgba(20,12,6,.82);border:1px solid #8a6a2e;color:#f0e2bd;font:600 .72rem sans-serif;white-space:nowrap;max-width:96%}
        #fs-hud b.m{color:#e8c469}#fs-hud button,#fs-hud u{cursor:pointer;text-decoration:none;padding:2px 7px;border-radius:6px;border:1px solid #6a4c22;background:#2a1b0e;color:#f0e2bd;font:600 .7rem sans-serif}#fs-hud u{padding:2px 6px;border-radius:5px}
        #fs-hud button:hover,#fs-hud u:hover{background:#4a3016}#fs-hud em{font-style:normal;min-width:84px;text-align:center;display:inline-block}
        html.touch #fs-hud{bottom:56px;font-size:.66rem;gap:4px;padding:3px 6px}
        #fs-pick h3{margin:0 0 8px;font-family:serif;color:#e8c469;font-size:1.05rem}
        #fs-pick .fs-opt{padding:8px 10px;margin:6px 0;border-radius:9px;background:rgba(255,255,255,.06);border:1px solid rgba(232,196,105,.35);cursor:pointer;color:#f0e2bd;font-family:sans-serif}
        #fs-pick .fs-opt:hover{background:rgba(232,196,105,.16)}#fs-pick .fs-opt.off{opacity:.45;cursor:default}#fs-pick .fs-opt b{display:block;font-family:serif;color:#ffd98a}#fs-pick small{display:block;opacity:.8;margin-top:2px;font-size:.74rem}
        #fs-pick .fs-bait{margin-top:6px;display:flex;align-items:center;gap:6px;justify-content:center;font-size:.76rem}#fs-pick .fs-bait span{min-width:130px;text-align:center}
        #fs-pick u{cursor:pointer;text-decoration:none;padding:3px 9px;border-radius:6px;border:1px solid #6a4c22;background:#2a1b0e}#fs-pick u:hover{background:#4a3016}
        #fs-pick .fs-x,#fd-box .fs-x{margin-top:6px;width:100%;padding:6px;border-radius:8px;border:1px solid #c9a24a;background:linear-gradient(#6a4a22,#452c12);color:#f6e7c1;font:600 .8rem sans-serif;cursor:pointer}
        #fd-box{color:#f0e2bd;font-family:sans-serif;max-height:80vh;max-height:80dvh;overflow:auto}#fd-box h3{margin:0 0 2px;font-family:serif;color:#e8c469}#fd-box .fd-sub{font-size:.76rem;opacity:.8;margin-bottom:6px}
        #fd-box .fd-row{display:flex;align-items:center;gap:8px;padding:5px 7px;margin:3px 0;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(232,196,105,.15);font-size:.76rem}
        #fd-box .fd-row.no{opacity:.5}#fd-box .fd-row .g{flex:1;min-width:0}#fd-box .fd-row small{display:block;opacity:.75;font-size:.68rem}#fd-box .fd-row .ic-item{width:30px;height:30px;flex:none}#fd-box .fd-row .no-ic{width:30px;height:30px;flex:none;border-radius:6px;background:#0005;text-align:center;line-height:30px;opacity:.6}
        #fd-box .fd-r{font-size:.66rem;padding:1px 6px;border-radius:9px;border:1px solid currentColor;margin-left:4px;white-space:nowrap}
        #fb-hud{position:absolute;right:8px;top:128px;z-index:80;display:flex;flex-direction:column;align-items:flex-end;gap:3px;pointer-events:none}
        #fb-hud .fb-c{display:flex;align-items:center;gap:3px;padding:2px 5px 2px 3px;border-radius:9px;background:rgba(18,12,6,.78);border:1px solid rgba(232,196,105,.5);color:#f0e2bd;font:700 .62rem sans-serif}
        #fb-hud svg{width:13px;height:13px}html.touch #fb-hud{top:52px;right:6px}`;
        document.head.appendChild(STYLE);
    }
    let hud = null;
    function showHud() {
        css(); const gc = $('game-container') || document.body;
        if (!hud) {
            hud = document.createElement('div'); hud.id = 'fs-hud'; gc.appendChild(hud);
            hud.onmousedown = (e) => { if (e.target.closest('button,u')) e.preventDefault(); };
            hud.onclick = (e) => {
                const a = e.target.closest('[data-a]'); if (!a) return; const k = a.dataset.a;
                if (k === 'bp') cycleBait(-1); else if (k === 'bn') cycleBait(1);
                else if (k === 'stop') cancel('Você recolheu a linha.');
                else if (k === 'mode') { const sp = S && S.spot; endSession(); if (sp) openPicker(sp); }
            };
        }
        refreshHud(); hud.style.display = 'flex';
    }
    function hideHud() { if (hud) hud.style.display = 'none'; }
    function refreshHud() {
        if (!hud || !S) return; const t = tools(), both = t.net && t.rod;
        hud.innerHTML = '<b class="m">' + (S.mode === 'net' ? 'Rede' : 'Vara') + '</b>' + (S.mode === 'rod' ? '<u data-a="bp">◀</u><em>' + baitLabel() + '</em><u data-a="bn">▶</u>' : '') + (both ? '<button type="button" data-a="mode">Trocar modo</button>' : '') + '<button type="button" data-a="stop">Parar</button>';
    }

    /* ============================ BÔNUS TEMPORÁRIOS (buffs) ============================ */
    function setBuff(k, v, secs) {
        if (!player.buffs) player.buffs = {}; const cur = player.buffs[k], now = Date.now();
        const nv = cur && cur.until > now && cur.v > v ? cur.v : v;   // não acumula: só renova (mantém o maior valor)
        player.buffs[k] = { v: nv, until: Math.max(now + secs * 1000, cur && cur.until > now ? cur.until : 0) };
    }
    function installBuffs() {
        if (!window.Content || Content._fb) return; Content._fb = 1; const o = Content.applyBuff;
        Content.applyBuff = function (b) {
            if (!b || !b.fb) return o.apply(this, arguments);
            const all = [b].concat(b.more || []), tx = [];
            all.forEach((x) => { setBuff(x.k, x.v, x.secs); tx.push(buffTxt(x.k, x.v, x.secs)); });
            say('Bônus: ' + tx.join(' · '), '#7aa8ff'); renderBuffs(true);
        };
    }
    const BSVG = {
        fspd: '<path d="M9 1 3 9h4l-1 6 7-9H9z" fill="#ffd24a"/>', fxp: '<path d="M8 1l2 5 5 .4-4 3.4 1.3 5L8 12l-4.300 2.800L5 9.800 1 6.400 6 6z" fill="#c58bff"/>',
        luck: '<circle cx="5" cy="5" r="3" fill="#6ff09a"/><circle cx="11" cy="5" r="3" fill="#6ff09a"/><circle cx="5" cy="11" r="3" fill="#6ff09a"/><circle cx="11" cy="11" r="3" fill="#6ff09a"/>',
        regen: '<path d="M8 14C2 10 1 6 3.500 3.500 5.500 2 7.500 3 8 4.500 8.500 3 10.500 2 12.500 3.500 15 6 14 10 8 14z" fill="#ff6a6a"/>', mregen: '<path d="M8 1C5 6 3 8 3 11a5 5 0 0010 0c0-3-2-5-5-10z" fill="#5aa8ff"/>',
        dmg: '<path d="M3 13 11 5l1-3 2 2-3 1-8 8z" fill="#e8c469"/><path d="M2 14l2-2" stroke="#8b5a2b" stroke-width="2"/>', def: '<path d="M8 1 2 3v5c0 3 3 6 6 7 3-1 6-4 6-7V3z" fill="#8fb0e0"/>'
    };
    let buffSig = '';
    function renderBuffs(force) {
        if (typeof player === 'undefined' || !player || !player.buffs) { const h0 = $('fb-hud'); if (h0 && h0.innerHTML) h0.innerHTML = ''; return; }
        const now = Date.now(), act = []; for (const k of Object.keys(player.buffs)) { const b = player.buffs[k]; if (!BUFN[k]) continue; if (!b || b.until <= now) { delete player.buffs[k]; continue; } act.push([k, b]); }
        css(); let h = $('fb-hud'); const gc = $('game-container'); if (!gc) return; if (!h) { h = document.createElement('div'); h.id = 'fb-hud'; gc.appendChild(h); }
        const sig = act.map((a) => a[0] + a[1].v).join(','); if (sig !== buffSig || force) { buffSig = sig; h.innerHTML = act.map((a) => '<span class="fb-c" data-k="' + a[0] + '" title="' + BUFN[a[0]] + ' +' + (a[0] === 'regen' ? Balance.healOf(a[1].v) : a[0] === 'mregen' ? Balance.mpOf(a[1].v) : a[1].v) + (BUFPCT[a[0]] ? '%' : '') + '"><svg viewBox="0 0 16 16">' + BSVG[a[0]] + '</svg><i></i></span>').join(''); }
        act.forEach((a) => { const e = h.querySelector('[data-k="' + a[0] + '"] i'); if (e) { const s = Math.max(0, Math.round((a[1].until - now) / 1000)), t = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); if (e.textContent !== t) e.textContent = t; } });
    }
    let regT = 0;
    function buffTick() {
        try {
            if (typeof player === 'undefined' || !player || !player.stats || typeof currentUser === 'undefined' || !currentUser) return; renderBuffs();
            const now = Date.now(); if (now - regT < 3000) return; regT = now;
            const r = Balance.healOf(buffV('regen')), m = Balance.mpOf(buffV('mregen'));   // balanceamento v2: vida 10x e mana 5x
            if (r > 0 && player.stats.hp > 0 && player.stats.hp < player.stats.maxHp) { const h = Math.min(r, player.stats.maxHp - player.stats.hp); player.stats.hp += h; player.stats.hp = Math.min(player.stats.maxHp, player.stats.hp); try { Fx.dmg(floatingTexts, player.x, player.y - 50, h, 'heal'); updateUI(); } catch (e) { } if (S) S.hpLast = Math.max(S.hpLast, player.stats.hp); }
            if (m > 0 && player.stats.mp < player.stats.maxMp) { player.stats.mp = Math.min(player.stats.maxMp, player.stats.mp + m); try { updateUI(); } catch (e) { } }
        } catch (e) { }
    }
    setInterval(buffTick, 1000);

    /* ---------- cozinhar: peixes podem queimar (menos com mais nível de Culinária) ---------- */
    function cookOut(def) {
        try {
            if (!def || !def.fishId) return null; const cl = ((player.stats.skills.cooking || {}).level | 0) || 1, burn = Math.max(0.02, 0.26 - cl * 0.012);
            if (rnd() < burn) { say('Queimou! Mais Culinária reduz o risco.', '#e67e22'); return 'Peixe Queimado'; }
        } catch (e) { } return null;
    }

    /* ============================ DIÁRIO DE PESCA ============================ */
    function openDiary() {
        if (typeof openModal !== 'function' || typeof player === 'undefined' || !player) return; css();
        const F = player.fish || {}, order = SPECIES.slice().sort((a, b) => (F[b.id] ? 1 : 0) - (F[a.id] ? 1 : 0) || a.rar - b.rar || a.n.localeCompare(b.n, 'pt-BR')), got = order.filter((s) => F[s.id]).length;
        let big = null; order.forEach((s) => { const r = F[s.id]; if (r && (!big || r.kg > big.r.kg)) big = { s, r }; });
        const ic = (n) => (window.Icons ? Icons.html(n, 30) : '');
        let h = '<div id="fd-box"><h3>Diário de pesca</h3><div class="fd-sub">' + got + '/' + SPECIES.length + ' espécies' + (big ? ' · maior: ' + big.s.n + ' ' + fmtN(big.r.max) + ' cm, ' + fmtKg(big.r.kg) + ' kg' : '') + '</div>';
        order.forEach((s) => {
            const r = F[s.id], zn = Object.keys(s.z).map((z) => ZONEN[z]).join(', ');
            if (r) h += '<div class="fd-row"><span>' + ic(s.raw) + '</span><div class="g"><b>' + s.n + '</b><span class="fd-r" style="color:' + RARC[s.rar] + '">' + RARN[s.rar] + '</span><small>Recorde ' + fmtN(r.max) + ' cm · ' + fmtKg(r.kg) + ' kg · pescados ' + r.count + '</small><small>Cozido: ' + s.buffs.map((b) => buffTxt(b[0], b[1], b[2])).join(' + ') + '</small></div></div>';
            else h += '<div class="fd-row no"><span class="no-ic">?</span><div class="g"><b>???</b><span class="fd-r" style="color:' + RARC[s.rar] + '">' + RARN[s.rar] + '</span><small>' + zn + (s.lv ? ' · Pesca ' + s.lv : '') + '</small></div></div>';
        });
        h += '<button type="button" class="fs-x" id="fd-close">Fechar</button></div>';
        openModal(h); const c = $('fd-close'); if (c) c.onclick = () => closeModal();
    }
    function injectMenuBtn() {
        const cfgTab = $('tab-cfg'); if (!cfgTab || $('btn-fishdiary')) return;
        const b = document.createElement('button'); b.id = 'btn-fishdiary'; b.type = 'button'; b.className = 'dev-save-btn'; b.style.cssText = 'background:linear-gradient(#2d5a6a,#183440);margin-top:8px'; b.textContent = 'Diário de pesca'; b.onclick = openDiary;
        const anchor = $('btn-look'); if (anchor && anchor.nextSibling) cfgTab.insertBefore(b, anchor.nextSibling); else cfgTab.appendChild(b);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectMenuBtn); else injectMenuBtn();
    window.addEventListener('load', () => { injectMenuBtn(); wrapInput(); installBuffs(); });

    window.Fishing = {
        NET, ROD, BAITS, ITEMS, SPECIES, BYID, RARN, ZONEN, cfg, start, begin, cancel, finish, menu, draw, merge, migrate, selectBait, activeBait, baitLine, isBait: (n) => !!BAIT[n],
        busy, rodOut, sim, roll, rollNow, zoneOf, difficulty, cookOut, openDiary, setHold, buffV, setBuff, renderBuffs, tipPos, weather,
        state: () => S ? { phase: S.phase, mode: S.mode, t: S.t, bob: S.bob && { x: S.bob.x, y: S.bob.y, sink: S.bob.sink }, fish: S.fish && S.fish.sp ? { id: S.fish.sp.id, cm: S.fish.cm, kg: S.fish.kg, rar: S.fish.sp.rar, d: S.fish.d } : null, mg: S.mg && { pos: S.mg.pos, zc: S.mg.zc, zw: S.mg.zw, P: S.mg.P, st: S.mg.st, d: S.mg.d }, tgt: S.tgt, catches: S.catches } : null
    };
})();
