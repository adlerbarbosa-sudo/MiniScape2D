/* MiniScape 2D — missões de NPC. O progresso fica em player.quests e é salvo junto com o personagem. */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    /* obj.type: 'have' (entregar itens que você carrega) | 'kill' (derrotar criaturas)
       reward: { coins, xp:{perícia:quantidade}, items:[[nome, qtd]] }  ·  req: id de missão que precisa estar concluída */
    const QUESTS = [
        { id: 'q_wood', giver: 'guide_npc', title: 'Lenha para o Inverno', intro: 'O inverno se aproxima e a vila está sem lenha. Corte algumas árvores e traga 10 Logs.', done: 'Isso vai aquecer muitas casas. Obrigado, aventureiro!', obj: { type: 'have', item: 'Logs', qty: 10 }, reward: { coins: 60, xp: { woodcutting: 40 } } },
        { id: 'q_beef', giver: 'farmer_npc', title: 'Jantar da Fazenda', intro: 'Tenho clientes famintos! Traga 5 Cooked Beef. Mate vacas, e cozinhe a carne numa fogueira.', done: 'Que cheirinho bom! Toma aqui pelo trabalho.', obj: { type: 'have', item: 'Cooked Beef', qty: 5 }, reward: { coins: 120, xp: { cooking: 60 }, items: [['Egg', 5]] } },
        { id: 'q_bars', giver: 'smith_npc', title: 'Estoque do Ferreiro', intro: 'Preciso de 3 Bronze Bar para a encomenda da guarda. Funda cobre e estanho na fornalha.', done: 'Barras de qualidade! Leve isto.', obj: { type: 'have', item: 'Bronze Bar', qty: 3 }, reward: { coins: 200, xp: { smithing: 80 }, items: [['Bronze Sword', 1]] } },
        { id: 'q_fish', giver: 'fisher_npc', title: 'Pescaria do Dia', intro: 'A taverna quer peixe assado. Traga 4 Cooked Fish (pesque com a rede e cozinhe na fogueira).', done: 'Peixe fresquinho! Você leva jeito.', obj: { type: 'have', item: 'Cooked Fish', qty: 4 }, reward: { coins: 110, xp: { fishing: 70 } } },
        { id: 'q_goblins', giver: 'guard_npc', title: 'Ameaça Goblin', intro: 'Goblins andam saqueando as estradas. Derrote 5 deles. Lembre-se: nome vermelho é agressivo!', done: 'A estrada está mais segura. A Coroa agradece.', obj: { type: 'kill', mob: 'goblin_base', qty: 5 }, reward: { coins: 150, xp: { combat: 60 } } },
        { id: 'q_slime', giver: 'priest_npc', title: 'Limpeza da Gosma', intro: 'Gosmas corrompem os poços sagrados. Derrote 6 delas para purificar a água.', done: 'Que a luz te proteja. Aceite estas poções.', obj: { type: 'kill', mob: 'slime_base', qty: 6 }, reward: { coins: 100, xp: { prayer: 40 }, items: [['Health Potion', 2]] } },
        { id: 'q_silk', giver: 'wizard_npc', title: 'Fios Arcanos', intro: 'Preciso de 3 Spider Silk para tecer um manto. Aranhas gigantes moram na floresta.', done: 'Perfeito! Pegue estas runas.', obj: { type: 'have', item: 'Spider Silk', qty: 3 }, reward: { coins: 120, xp: { magic: 60 }, items: [['Air Rune', 20], ['Mind Rune', 20]] } },
        { id: 'q_pelt', giver: 'barkeep_npc', title: 'Peles para a Taverna', intro: 'Quero forrar os bancos da taverna. Traga 3 Wolf Pelt. Lobos só caem de lobos, claro.', done: 'Ficou uma beleza! Uma rodada por conta da casa.', obj: { type: 'have', item: 'Wolf Pelt', qty: 3 }, reward: { coins: 180, items: [['Cooked Meat', 4]] } },
        { id: 'q_orcs', giver: 'guard_npc', req: 'q_goblins', title: 'Cerco dos Orcs', intro: 'Agora os orcs. São fortes: leve boa armadura e comida. Derrote 4 orcs.', done: 'Você tem coragem! Isto é para você.', obj: { type: 'kill', mob: 'orc_base', qty: 4 }, reward: { coins: 300, xp: { combat: 120 }, items: [['Iron Sword', 1]] } },
        { id: 'q_troll', giver: 'guard_npc', req: 'q_orcs', title: 'O Troll da Caverna', intro: 'Um troll bloqueia a mina. Derrote-o e o povo poderá voltar a trabalhar.', done: 'Lendário! A vila lhe deve muito.', obj: { type: 'kill', mob: 'troll_base', qty: 1 }, reward: { coins: 600, xp: { combat: 250 }, items: [['Iron Shield', 1]] } },
        { id: 'q_dragon', giver: 'guard_npc', req: 'q_troll', title: 'A Fúria do Dragão', intro: 'O Dragão Ancestral dorme no covil ao norte. Só os melhores voltam de lá. Derrote-o.', done: 'O reino está a salvo. Seu nome será cantado!', obj: { type: 'kill', mob: 'dragon_boss', qty: 1 }, reward: { coins: 2500, xp: { combat: 800 }, items: [['Dragonscale Shield', 1]] } }
    ];
    QUESTS.push(
        { id: 'q_herbs', giver: 'farmer_npc', title: 'Horta Curativa', intro: 'Plante Herb Seed nos canteiros (compre comigo) e traga 6 Healing Herb. O Sacerdote vai amar!', done: 'Que ervas viçosas! Você tem mão boa para a terra.', obj: { type: 'have', item: 'Healing Herb', qty: 6 }, reward: { coins: 100, xp: { farming: 80 }, items: [['Herb Seed', 3]] } },
        { id: 'q_bread', giver: 'farmer_npc', req: 'q_beef', title: 'Pão Quentinho', intro: 'Plante trigo, colha e faça 4 Bread na aba Ofícios. A taverna está sem pão.', done: 'Cheiro de padaria! Toma.', obj: { type: 'have', item: 'Bread', qty: 4 }, reward: { coins: 90, xp: { farming: 60, crafting: 30 } } },
        { id: 'q_brew', giver: 'priest_npc', req: 'q_slime', title: 'Poções para os Feridos', intro: 'Use o caldeirão ao lado da igreja: erva curativa + frasco vazio. Traga 3 Health Potion.', done: 'Os feridos agradecem. Que a luz te guie!', obj: { type: 'have', item: 'Health Potion', qty: 3 }, reward: { coins: 150, xp: { alchemy: 100 } } },
        { id: 'q_mana', giver: 'wizard_npc', req: 'q_silk', title: 'Elixir Arcano', intro: 'Preciso de 2 Mana Potion. Flor de mana só cresce na horta com sementes do Fazendeiro.', done: 'Excelente! O poder flui. Pegue estas runas.', obj: { type: 'have', item: 'Mana Potion', qty: 2 }, reward: { coins: 200, xp: { magic: 120, alchemy: 40 }, items: [['Water Rune', 20]] } },
        { id: 'q_steel', giver: 'smith_npc', req: 'q_bars', title: 'Aço da Guarda', intro: 'A guarda quer aço! Leve Iron Ore e 2 Coal por barra à fornalha. Traga 2 Steel Bar. Carvão se minera na mina.', done: 'Aço puro! Tome, você mereceu.', obj: { type: 'have', item: 'Steel Bar', qty: 2 }, reward: { coins: 300, xp: { smithing: 150 }, items: [['Steel Sword', 1]] } },
        { id: 'q_mithril', giver: 'smith_npc', req: 'q_steel', title: 'O Brilho do Mithril', intro: 'Mithril raro brilha no covil. Precisa de picareta de aço e Mineração 15. Traga 1 Mithril Bar (1 minério + 3 carvão).', done: 'Uma lenda forjada! O reino agradece.', obj: { type: 'have', item: 'Mithril Bar', qty: 1 }, reward: { coins: 900, xp: { smithing: 400, mining: 200 } } }
,
        { id: 'q_cata', giver: 'guard_npc', req: 'q_steel', title: 'Sombras nas Catacumbas', intro: 'Há uma entrada nas profundezas do Covil do Dragão: as Catacumbas. Derrote 5 Cavaleiros Esqueléticos lá dentro.', done: 'Coragem de verdade! Tome, você mereceu.', obj: { type: 'kill', mob: 'skeleton_knight', qty: 5 }, reward: { coins: 500, xp: { combat: 300 }, items: [['Greater Health Potion', 3]] } },
        { id: 'q_lich', giver: 'guard_npc', req: 'q_cata', title: 'O Rei sem Coroa', intro: 'O Lich Rei Ossian comanda os mortos. Destrua-o e o reino dormirá em paz.', done: 'Ele caiu! Uma lenda nasce hoje. O reino é seu devedor.', obj: { type: 'kill', mob: 'lich_boss', qty: 1 }, reward: { coins: 2000, xp: { combat: 1200, hp: 300 }, items: [['Soul Gem', 1]] } }
    );
    function add(q) { if (!QUESTS.some((x) => x.id === q.id)) QUESTS.push(q); }

    let npcKey = null;
    const st = () => { if (typeof player === 'undefined') return {}; if (!player.quests || typeof player.quests !== 'object') player.quests = {}; return player.quests; };
    const done = (id) => { const s = st()[id]; return !!(s && s.s === 'done'); };
    const active = (id) => { const s = st()[id]; return !!(s && s.s === 'active'); };
    const byId = (id) => QUESTS.find((q) => q.id === id);
    const isKnown = (q) => !q.obj.item || itemDB[q.obj.item];
    const available = (q) => !st()[q.id] && (!q.req || done(q.req)) && isKnown(q);
    function progress(q) {
        if (q.obj.type === 'have') return Math.min(q.obj.qty, getInvCount(q.obj.item));
        return Math.min(q.obj.qty, (st()[q.id] && st()[q.id].p) || 0);
    }
    const ready = (q) => active(q.id) && progress(q) >= q.obj.qty;
    const itemName = (n) => (itemDB[n] ? itemDB[n].icon + ' ' + itemDB[n].name : n);
    const mobName = (k) => (npcDB[k] ? npcDB[k].name : k);
    const objText = (q) => q.obj.type === 'have' ? `Entregar ${q.obj.qty}× ${itemName(q.obj.item)}` : `Derrotar ${q.obj.qty}× ${mobName(q.obj.mob)}`;
    const rewardText = (r) => [r.coins ? `${r.coins} moedas` : '', ...Object.keys(r.xp || {}).map((k) => `${r.xp[k]} XP de ${(player.stats.skills[k] || {}).name || k}`), ...(r.items || []).map((i) => `${i[1]}× ${itemName(i[0])}`)].filter(Boolean).join(' · ');

    function accept(id) {
        const q = byId(id); if (!q || !available(q)) return;
        st()[id] = { s: 'active', p: 0 }; if (window.Sfx) Sfx.play('accept'); setActionText(`Missão aceita: ${q.title}`, '#f1c40f'); saveDataLogic(); render(); refreshTracker();
    }
    function turnIn(id) {
        const q = byId(id); if (!q || !ready(q)) return;
        const r = q.reward || {};
        // confere o espaço ANTES de tirar qualquer coisa: nada se perde
        const inv = JSON.parse(JSON.stringify(player.inventory)); let ok = true;
        if (q.obj.type === 'have' && !removeInvItem(q.obj.item, q.obj.qty)) ok = false;
        if (ok) { if (r.coins && !addInvItem('Coins', r.coins)) ok = false; (r.items || []).forEach((i) => { if (ok && itemDB[i[0]] && !addInvItem(i[0], i[1])) ok = false; }); }
        if (!ok) { player.inventory = inv; setActionText('Inventário cheio! Libere espaço para a recompensa.', '#e74c3c'); return; }
        Object.keys(r.xp || {}).forEach((k) => addXP(k, r.xp[k]));
        st()[id] = { s: 'done', p: q.obj.qty };
        if (window.Sfx) Sfx.play('quest'); setActionText(`Missão concluída: ${q.title}!`, '#2ecc71'); addFloatingText(player.x, player.y - 30, 'Missão concluída!', '#f1c40f');
        saveDataLogic(); updateUI(); render(); refreshTracker();
    }
    function onKill(dbKey) {
        let changed = false;
        QUESTS.forEach((q) => { if (q.obj.type === 'kill' && q.obj.mob === dbKey && active(q.id)) { const s = st()[q.id]; if ((s.p || 0) < q.obj.qty) { s.p = (s.p || 0) + 1; changed = true; if (s.p >= q.obj.qty) { setActionText(`Missão "${q.title}": volte ao NPC!`, '#f1c40f'); if (window.Sfx) Sfx.play('accept'); } } } });
        if (changed) { render(); refreshTracker(); }
    }

    /* ---------- painel dentro da conversa com o NPC ---------- */
    function card(q, mode) {
        const p = progress(q);
        let h = `<div class="qcard ${mode}"><div class="qt">${esc(q.title)}${mode === 'done' ? ' <small>concluída</small>' : ''}</div>`;
        if (mode === 'done') return h + '</div>';
        h += `<div class="qi">${esc(mode === 'ready' ? q.done : q.intro)}</div><div class="qo">${esc(objText(q))}${mode !== 'new' ? ` <b>(${p}/${q.obj.qty})</b>` : ''}</div><div class="qr">Recompensa: ${esc(rewardText(q.reward || {}))}</div>`;
        if (mode === 'new') h += `<button class="shop-btn" data-q-accept="${esc(q.id)}">Aceitar missão</button>`;
        else if (mode === 'ready') h += `<button class="shop-btn" data-q-turn="${esc(q.id)}">Entregar</button>`;
        else h += `<div class="qs">Em andamento</div>`;
        return h + '</div>';
    }
    function render() {
        const host = $('npc-quests'); if (!host) return;
        if (!npcKey) { host.innerHTML = ''; return; }
        const mine = QUESTS.filter((q) => q.giver === npcKey && isKnown(q)); if (!mine.length) { host.innerHTML = ''; return; }
        const rd = mine.filter(ready), ac = mine.filter((q) => active(q.id) && !ready(q)), nw = mine.filter(available), dn = mine.filter((q) => done(q.id));
        host.innerHTML = `<h4 class="qh">Missões</h4>` + rd.map((q) => card(q, 'ready')).join('') + ac.map((q) => card(q, 'active')).join('') + nw.slice(0, 2).map((q) => card(q, 'new')).join('') + dn.map((q) => card(q, 'done')).join('');
    }
    function ensureHost() {
        if ($('npc-quests')) return; const d = $('npc-dialog'); if (!d) return;
        const h = document.createElement('div'); h.id = 'npc-quests'; d.insertAdjacentElement('afterend', h);
        h.addEventListener('click', (e) => { const a = e.target.closest('[data-q-accept]'); if (a) return accept(a.dataset.qAccept); const t = e.target.closest('[data-q-turn]'); if (t) turnIn(t.dataset.qTurn); });
    }

    /* ---------- marcadores acima dos NPCs: ! (missão nova) e ? (pronta para entregar) ---------- */
    function markerFor(key) {
        let m = null; for (const q of QUESTS) { if (q.giver !== key) continue; if (ready(q)) return '?'; if (available(q)) m = '!'; else if (active(q.id) && !m) m = '…'; }
        return m === '…' ? null : m;
    }
    function drawMarker(ctx, o, y) {
        const m = markerFor(o.dbKey); if (!m) return; const cx = o.x + (o.w || 30) / 2, T = performance.now() / 1000, by = y - 14 + Math.sin(T * 3) * 2;
        ctx.save(); ctx.font = 'bold 20px "Palatino Linotype", Georgia, serif'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,10,0,.95)'; ctx.strokeText(m, cx, by); ctx.fillStyle = m === '?' ? '#7be08a' : '#ffd24a'; ctx.fillText(m, cx, by); ctx.restore();
    }

    /* ---------- resumo para o diário de missões ---------- */
    function summary() { return QUESTS.filter((q) => active(q.id)).map((q) => ({ id: q.id, title: q.title, giverName: mobName(q.giver), text: objText(q), cur: progress(q), need: q.obj.qty, ready: ready(q) })); }
    function refreshTracker() { if (window.refreshQuestTracker) window.refreshQuestTracker(); }

    /* ---------- ligações com o jogo ---------- */
    function wire() {
        ensureHost();
        const oi = window.tryInteract; if (typeof oi === 'function') window.tryInteract = function (t) { if (t && t.type === 'npc') { npcKey = t.dbKey; ensureHost(); } const r = oi.apply(this, arguments); if (t && t.type === 'npc') render(); return r; };
        const od = window.applyDamage; if (typeof od === 'function') window.applyDamage = function (t, dmg, s) { const was = t && t.type === 'enemy' && t.active !== false && t.hp > 0; const r = od.apply(this, arguments); try { if (was && t.hp <= 0) onKill(t.dbKey); } catch (e) {} return r; };
        const ou = window.updateUI; if (typeof ou === 'function') window.updateUI = function () { const r = ou.apply(this, arguments); try { render(); } catch (e) {} return r; };
    }
    window.addEventListener('load', wire);
    window.Quests = { QUESTS, add, accept, turnIn, onKill, markerFor, drawMarker, summary, render, done, active, ready, progress };
})();
