/* MiniScape 2D — pesca: Rede de Pesca (rápida, peixes comuns, sem isca) e Vara de Pesca (mais lenta, usa 1 isca por tentativa).
   Iscas: Minhoca (comum, em lojas), Isca Brilhante (+raridade), Isca de Camarão (peixes maiores), Isca Dourada (maiores + baú de tesouro).
   Tudo fica no personagem: player.bait (isca escolhida) e player.fishMode ('net' | 'rod'). Itens entram pelo catálogo, que o jogo já mescla. */
(function () {
    'use strict';
    const NET = 'Rede de Pesca', ROD = 'Vara de Pesca';
    const say = (t, c) => { try { setActionText(t, c || '#2ecc71'); } catch (e) { } };
    const sfx = (n) => { try { window.Sfx && Sfx.play(n); } catch (e) { } };
    const lvl = () => ((player.stats.skills.fishing || {}).level | 0) || 1;

    /* ---------- itens ---------- */
    const ITEMS = {
        [NET]: { name: NET, icon: '🕸️', type: 'tool', tool: 'net', stackable: false, weight: 0.5, desc: 'Pesca rápida de peixes comuns, sem isca (dá menos XP que a vara). Use no ponto de pesca.', value: 20 },
        [ROD]: { name: ROD, icon: '🎣', type: 'tool', tool: 'rod', stackable: false, weight: 0.8, desc: 'Mais lenta que a rede, mas pega peixes maiores e raros. Gasta 1 isca por tentativa.', recipe: 'Logs,2|Wool,1', craftQty: 1, value: 80 },
        'Minhoca': { name: 'Minhoca', icon: '🪱', type: 'resource', bait: 1, stackable: true, weight: 0.01, desc: 'Isca comum: o peixe morde bem mais. Na mochila: selecione e use "Escolher isca".', value: 2 },
        'Isca Brilhante': { name: 'Isca Brilhante', icon: '✨', type: 'resource', bait: 2, stackable: true, weight: 0.01, desc: 'Atrai peixes raros e dá mais XP. Na mochila: selecione e use "Escolher isca".', value: 25 },
        'Isca de Camarão': { name: 'Isca de Camarão', icon: '🦐', type: 'resource', bait: 3, stackable: true, weight: 0.01, desc: 'Atrai peixes grandes (Robalo). Na mochila: selecione e use "Escolher isca".', value: 35 },
        'Isca Dourada': { name: 'Isca Dourada', icon: '🌟', type: 'resource', bait: 4, stackable: true, weight: 0.01, desc: 'A melhor: peixes grandes, raros e chance de baú do tesouro. Na mochila: selecione e use "Escolher isca".', value: 120 },
        'Truta Crua': { name: 'Truta Crua', icon: '🐟', type: 'resource', stackable: true, weight: 0.5, desc: 'Truta pescada de vara (Pesca 5). Cozinhe na fogueira.', cooksInto: 'Truta Assada', cookXp: 28, value: 16 },
        'Truta Assada': { name: 'Truta Assada', icon: '🍣', type: 'consumable', heal: 11, stackable: true, weight: 0.5, desc: 'Cura bastante.', value: 24 },
        'Robalo Cru': { name: 'Robalo Cru', icon: '🐟', type: 'resource', stackable: true, weight: 0.8, desc: 'Peixe grande (Pesca 12, Isca de Camarão ou Dourada). Cozinhe na fogueira.', cooksInto: 'Robalo Assado', cookXp: 54, value: 70 },
        'Robalo Assado': { name: 'Robalo Assado', icon: '🍣', type: 'consumable', heal: 19, stackable: true, weight: 0.8, desc: 'Cura muito.', value: 100 }
    };
    try { if (window.CATALOG) Object.assign(CATALOG.ITEMS, ITEMS); } catch (e) { }

    /* melhor -> pior. rare = peso dos peixes raros, big = peso dos peixes grandes, xp = bônus de XP, chest = chance de baú, fail = chance de escapar */
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
    function merge() {   // depois que o itemDB/npcDB do servidor foi carregado
        try {
            if (typeof itemDB === 'undefined') return;
            for (const k in OLD) if (itemDB[k]) delete itemDB[k];
            for (const k in ITEMS) if (!itemDB[k]) itemDB[k] = Object.assign({}, ITEMS[k]);
            else { const d = itemDB[k]; if (k === NET || k === ROD) { d.tool = ITEMS[k].tool; } if (k === ROD && !d.recipe) d.recipe = ITEMS[k].recipe; if (BAIT[k]) { d.bait = ITEMS[k].bait; d.desc = ITEMS[k].desc; } if (k === 'Minhoca' && !d.shopQty) d.shopQty = 10; }
            if (typeof npcDB !== 'undefined') for (const k in npcDB) {
                const d = npcDB[k]; if (!d || typeof d.shopStr !== 'string') continue; d.shopStr = fixShop(d.shopStr);
                if (SHOP_ADD[k] && !d._fish1) { d._fish1 = 1; const have = d.shopStr.split('|').map((p) => p.split(',')[0].trim()); SHOP_ADD[k].split('|').forEach((p) => { if (!have.includes(p.split(',')[0])) d.shopStr += (d.shopStr ? '|' : '') + p; }); }
            }
        } catch (e) { console.error(e); }
    }
    function migrate(p) {   // itens já no personagem (mochila, banco, equipamento, barra rápida)
        try {
            const fix = (it) => { if (it && OLD[it.name]) { const q = it.qty; Object.assign(it, itemDB[NET] || ITEMS[NET]); if (q) it.qty = q; } };
            (p.inventory || []).forEach(fix); (p.bank || []).forEach(fix); if (p.equipment) for (const k in p.equipment) fix(p.equipment[k]);
            if (Array.isArray(p.qb)) p.qb = p.qb.map((n) => OLD[n] ? NET : n);
        } catch (e) { console.error(e); }
    }

    /* ---------- iscas ---------- */
    const cntOf = (n) => { try { return getInvCount(n); } catch (e) { return 0; } };
    function activeBait() {
        const sel = player.bait; if (sel && BAIT[sel] && cntOf(sel) > 0) return BAIT[sel];
        for (const b of BAITS) if (cntOf(b.n) > 0) return b;
        return null;
    }
    function selectBait(name) {   // "Escolher isca" na mochila: escolhe; clicar de novo volta ao automático (melhor primeiro)
        if (!BAIT[name]) return;
        if (player.bait === name) { player.bait = null; say('Isca automática: usa a melhor que você tiver.', '#bdc3c7'); }
        else { player.bait = name; say('Isca escolhida: ' + name + ' (escolha de novo para voltar ao automático).', '#3498db'); }
        try { saveDataLogic(); } catch (e) { }
    }
    function baitLine() { const b = activeBait(); return b ? b.n + ' ×' + cntOf(b.n) : null; }

    /* ---------- começar a pescar ---------- */
    const tools = () => { const inv = player.inventory || []; return { net: inv.find((i) => i && i.tool === 'net'), rod: inv.find((i) => i && i.tool === 'rod') }; };
    function start(spot, mode) {
        const t = tools(); mode = mode || player.fishMode;
        if ((mode === 'rod' && !t.rod) || (mode === 'net' && !t.net)) mode = null;
        if (!mode) mode = t.net ? 'net' : (t.rod ? 'rod' : null);
        if (!mode) { say('Precisa de uma Rede de Pesca ou Vara de Pesca (o Pescador vende).', '#e74c3c'); return false; }
        player.fishMode = mode; const L = lvl(); let delay, msg;
        if (mode === 'net') { delay = Math.max(36, 120 - L * 3); msg = 'Pescando com a Rede de Pesca...'; }
        else { const b = activeBait(); delay = Math.max(70, (b ? 200 : 260) - L * 4); msg = b ? 'Pescando com a Vara + ' + b.n + ' (×' + cntOf(b.n) + ')' : 'Vara sem isca: pesca fraca. Selecione uma isca na mochila e use Escolher isca.'; }
        player.isPerformingAction = true; player.actionTarget = spot; player.actionType = 'fish'; player.actionToolItem = mode === 'net' ? t.net : t.rod; player.actionTimer = player.actionDelay = delay; player._fmode = mode;
        say(msg, b2c(mode)); return true;
    }
    const b2c = (mode) => mode === 'rod' && !activeBait() ? '#e8c469' : '#3498db';
    function menu(spot, add, setPending) {   // opções do botão direito no ponto de pesca
        const t = tools();
        if (t.net) add('Pescar com a Rede', () => { player.fishMode = 'net'; setPending(spot); });
        if (t.rod) add('Pescar com a Vara' + (baitLine() ? ' (' + baitLine() + ')' : ''), () => { player.fishMode = 'rod'; setPending(spot); });
        if (!t.net && !t.rod) add('Pescar', () => setPending(spot));
    }

    /* ---------- resultado de cada ciclo ---------- */
    const rnd = Math.random;
    function full() { player.isPerformingAction = false; player.actionToolItem = null; say('Inventário cheio!', '#e74c3c'); return false; }
    function splash(spot, col, n) { try { Art.burst(spot.x + (spot.w || 46) / 2, spot.y + (spot.h || 46) / 2, col || '#a8dcff', n || 9, 1.3); } catch (e) { } }
    function give(n, q) { if (addInvItem(n, q)) return true; return q > 1 && addInvItem(n, 1); }
    function net(spot) {
        const L = lvl(); let q = 1 + (rnd() < 0.35 ? 1 : 0) + (L >= 10 && rnd() < 0.25 ? 1 : 0);
        if (!addInvItem('Raw Fish', q)) { q = 1; if (!addInvItem('Raw Fish', 1)) return full(); }
        addXP('fishing', 5 * q); addFloatingText(player.x, player.y - 15, 'Pescado', '#3498db'); addPickupText('Raw Fish', q); splash(spot);
        if (L >= 3 && rnd() < 0.07) { const k = 1 + Math.floor(rnd() * 3); if (addInvItem('Isca de Camarão', k)) { say('Camarões na rede! +' + k + ' Isca de Camarão', '#e8c469'); addPickupText('Isca de Camarão', k); } }
        return true;
    }
    function weather() {
        const E = window.Env; if (!E) return {};
        let rain = false, fog = false, night = false, day = false;
        try { rain = E.rainLevel() > 0.4; fog = /Neblina/.test(E.weatherLabel()); night = E.isNight(); day = E.daylight() > 0.8 && !rain && !fog; } catch (e) { }
        return { rain, fog, night, day };
    }
    function pickFish(L, b) {
        const w = weather(), T = [['Raw Fish', b && b.tier >= 3 ? 60 : 100, 22, 'c']];
        if (b) {
            if (L >= 5) T.push(['Truta Crua', 45 * (b.big > 1.2 ? 1.5 : 1), 45, 'c']);
            if (b.tier >= 3 && L >= 12) T.push(['Robalo Cru', 28 * b.big, 85, 'r']);
            if (w.rain && L >= 8) T.push(['Raw Salmon', 30 * b.rare, 65, 'r']);
            if (w.fog && L >= 12) T.push(['Raw Eel', 26 * b.rare, 75, 'r']);
            if (w.night && !w.rain && L >= 18) T.push(['Raw Moonfish', 16 * b.rare, 120, 'r']);
            if (w.day && L >= 22) T.push(['Raw Golden Koi', 8 * b.rare, 160, 'r']);
        }
        const tot = T.reduce((s, x) => s + x[1], 0); let r = rnd() * tot; for (const x of T) { if ((r -= x[1]) <= 0) return x; }
        return T[0];
    }
    function rod(spot) {
        const L = lvl(), b = activeBait();
        if (b) { removeInvItem(b.n, 1); if (player.bait === b.n && cntOf(b.n) <= 0) { player.bait = null; const nx = activeBait(); say('Acabou a ' + b.n + (nx ? '; usando ' + nx.n + '.' : '.'), '#e8c469'); } }
        const cx = spot.x + (spot.w || 46) / 2, cy = spot.y + (spot.h || 46) / 2;
        if (b && rnd() < b.chest) {   // baú do tesouro
            const c = Math.floor((30 + rnd() * 90 + L * 3) * (b.tier >= 4 ? 2 : 1)); if (!addInvItem('Coins', c)) return full();
            addXP('fishing', 25); say('Baú do tesouro! +' + c + ' moedas', '#ffd24a'); addPickupText('Coins', c); sfx('coin'); splash(spot, '#ffd24a', 16);
            if (rnd() < 0.35) { const k = 1 + Math.floor(rnd() * 3); if (addInvItem('Isca Brilhante', k)) addPickupText('Isca Brilhante', k); }
            if (b.tier < 4 && rnd() < 0.12 && addInvItem('Isca Dourada', 1)) addPickupText('Isca Dourada', 1);
            try { Life.cnt('chests'); } catch (e) { } try { saveDataLogic(); } catch (e) { } return true;
        }
        if (rnd() < (b ? b.fail : 0.45)) { addXP('fishing', 3); say(b ? 'O peixe escapou!' : 'Nada mordeu... use uma isca!', '#bdc3c7'); splash(spot, '#dfefff', 4); return true; }
        const f = pickFish(L, b), name = f[0];
        if (!addInvItem(name, 1)) return full();
        addXP('fishing', Math.round(f[2] * (b ? b.xp : 0.45))); addFloatingText(player.x, player.y - 15, 'Pescado', '#3498db'); addPickupText(name, 1); splash(spot);
        if (f[3] === 'r') {
            try { Life.cnt('rarefish'); } catch (e) { } sfx('quest'); say('Peixe raro: ' + name.replace(/^Raw /, '') + '!', '#e8c469'); splash(spot, '#8fd8ff', 14);
            if (rnd() < 0.25 && addInvItem('Isca Brilhante', 1)) { addPickupText('Isca Brilhante', 1); }
            try { saveDataLogic(); } catch (e) { }
        }
        return true;
    }
    function finish(spot) {   // chamado quando o tempo do ciclo acaba; false = parar
        const mode = player._fmode || (tools().net ? 'net' : 'rod'); const t = tools();
        if (mode === 'net' ? !t.net : !t.rod) { player.isPerformingAction = false; player.actionToolItem = null; say('Você precisa da ferramenta no inventário.', '#e74c3c'); return false; }
        const ok = mode === 'net' ? net(spot) : rod(spot);
        if (ok && mode === 'rod') { const b = activeBait(); player.actionDelay = Math.max(70, (b ? 200 : 260) - lvl() * 4); }
        else if (ok) player.actionDelay = Math.max(36, 120 - lvl() * 3);
        return ok;
    }

    /* ---------- boia e ondinhas (leve: só linhas e círculos) ---------- */
    function draw(ctx, T) {
        if (!player || !player.isPerformingAction || player.actionType !== 'fish' || !player.actionTarget) return;
        const s = player.actionTarget, cx = s.x + (s.w || 46) / 2, cy = s.y + (s.h || 46) / 2, near = player.actionTimer < 28 && player._fmode === 'rod';
        ctx.save(); ctx.lineWidth = 1;
        for (let i = 0; i < 2; i++) { const p = ((T * 0.7) + i * 0.5) % 1; ctx.strokeStyle = 'rgba(230,248,255,' + (0.5 * (1 - p)) + ')'; ctx.beginPath(); ctx.ellipse(cx, cy + 2, 4 + p * 13, 1.6 + p * 5, 0, 0, 6.283); ctx.stroke(); }
        if (player._fmode === 'rod') {
            const bob = near ? Math.sin(T * 30) * 1.6 + 1.5 : Math.sin(T * 2.4) * 0.8, hx = player.x + (player.facing && player.facing.x ? player.facing.x * 12 : 0), hy = player.y - 34;
            ctx.strokeStyle = 'rgba(245,245,245,0.85)'; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo((hx + cx) / 2, Math.min(hy, cy) - 16, cx, cy + bob - 3); ctx.stroke();
            ctx.fillStyle = '#e8483a'; ctx.beginPath(); ctx.arc(cx, cy + bob - 3, 3, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy + bob - 3, 3, 0, Math.PI); ctx.fill();
            if (near) { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(cx, cy + 2, 7 + (T * 20 % 5), 3, 0, 0, 6.283); ctx.stroke(); }
        }
        ctx.restore();
    }

    window.Fishing = { NET, ROD, BAITS, ITEMS, start, finish, menu, draw, merge, migrate, selectBait, activeBait, baitLine, isBait: (n) => !!BAIT[n] };
})();
