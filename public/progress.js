/* MiniScape 2D — PROGRESSÃO NO CLIENTE: liga o econ.js (fonte única de níveis, ofícios e preços) ao jogo.
   O que este arquivo faz (nada aqui mexe em regras de segurança: o servidor continua validando XP, moedas e itens por orçamento):
   1) ÁRVORES e ROCHAS por nível: cada árvore tem tipo (comum, carvalho, salgueiro, bordo, teixo, mágica) que exige nível de Lenhador; cada rocha exige Mineração
      e picareta do tier certo. O machado/picareta também tem nível mínimo. Falhar o golpe é possível e fica mais raro com o nível; nos níveis altos às vezes rende o dobro.
   2) VELOCIDADE por nível: o tempo de cada ação (cortar, minerar, fundir, cozinhar) cai até ~45% até o nível 99 (antes parava de melhorar no nível 30).
   3) CULINÁRIA e ARTESANATO por nível (prato e receita têm nível mínimo).
   4) VENDA A NPC: lojas passam a comprar itens do jogador (preço pré-set do econ.js, ou o `sell` que o admin definir no item).
   5) NÍVEL MÍNIMO de equipar em TODOS os itens (stats.js usa Econ.reqOf) + guarda de equipamento: o que não cabe no nível é guardado na mochila.
   6) Campos novos no editor de itens do Dev: "Preço de venda (NPC)" e "Nível mínimo".
   API: window.Progress = { startGather, finishGather, cookable, cookMsg, cookFrames, fireLog, fireXp, sellPrice, sell, treeOf, state }. */
(function () {
    'use strict';
    const E = window.Econ; if (!E) return;
    const $ = (id) => document.getElementById(id);
    const ready = () => typeof player !== 'undefined' && player && player.stats && player.stats.skills && player.inventory && player.equipment;
    const lvl = (k) => { const s = ready() && player.stats.skills[k]; return s ? Math.max(1, s.level | 0) : 1; };
    const SKN = { woodcutting: 'Lenhador', mining: 'Mineração', cooking: 'Culinária', crafting: 'Artesanato', smithing: 'Ferraria', cmb: 'Nível de Combate' };
    const nm = (n) => (typeof itemLabel === 'function' ? itemLabel(n) : n);
    const say = (t, c) => { try { setActionText(t, c || '#e74c3c'); } catch (e) { } };
    const fmt = (n) => (typeof fmtNum === 'function' ? fmtNum(n) : String(n));
    const esc2 = (s) => (typeof esc === 'function' ? esc(s) : String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
    const dbItems = () => (typeof itemDB !== 'undefined' ? itemDB : {});

    /* ============================ TABELAS (uma vez, quando o catálogo existe) ============================ */
    const LOG_PT = { 'Oak Logs': 'Lenha de Carvalho', 'Willow Logs': 'Lenha de Salgueiro', 'Maple Logs': 'Lenha de Bordo', 'Yew Logs': 'Lenha de Teixo', 'Magic Logs': 'Lenha Mágica' };
    function setup() {
        // troncos novos no catálogo (sem sobrescrever o que o admin tiver editado)
        try {
            const db = dbItems();
            for (const k of Object.keys(E.LOG_ITEMS)) { if (!db[k]) { const l = E.LOG_ITEMS[k]; db[k] = { name: k, icon: l.icon || '🪵', type: 'resource', stackable: true, weight: 1.5, desc: l.desc || 'Tronco.' }; } }
            if (window.Labels && Labels.ITEM) for (const k of Object.keys(LOG_PT)) if (!Labels.ITEM[k]) Labels.ITEM[k] = LOG_PT[k];
        } catch (e) { console.error('[progress] troncos', e); }
        // rochas e fornalha: os níveis passam a vir do econ.js
        try {
            if (window.Content && Content.ROCKS) for (const k of Object.keys(Content.ROCKS)) { const r = E.ROCKS[k]; if (r) { Content.ROCKS[k].lvl = r.lvl; Content.ROCKS[k].tier = r.tier; Content.ROCKS[k].xp = r.xp; Content.ROCKS[k].t = r.t; } }
            if (window.Content && Content.SMELT) for (const r of Content.SMELT) if (E.SMELT_LVL[r.id] > 0) r.lvl = E.SMELT_LVL[r.id];
        } catch (e) { console.error('[progress] tabelas', e); }
    }

    /* ============================ ÁRVORES E ROCHAS ============================ */
    const treeOf = (o) => { const k = E.treeKind(o, typeof currentMap !== 'undefined' ? currentMap : ''); return Object.assign({ id: k }, E.TREES[k] || E.TREES.normal); };
    function nodeOf(o) {
        if (!o) return null;
        if (o.type === 'tree') { const t = treeOf(o); return { kind: 'tree', skill: 'woodcutting', tool: 'axe', lvl: t.lvl, tier: 1, xp: t.xp, t: t.t, item: t.log, name: t.n, tt: t.id }; }
        const r = E.ROCKS[o.type], c = window.Content && Content.ROCKS && Content.ROCKS[o.type]; if (!r || !c) return null;   // rocha fora das tabelas: segue o código antigo
        return { kind: 'rock', skill: 'mining', tool: 'pickaxe', lvl: r.lvl, tier: r.tier, xp: r.xp, t: r.t, item: c.ore, name: c.label || o.type };
    }
    // melhor ferramenta que o jogador PODE usar (nível da ferramenta <= nível da perícia); `locked` = a melhor que ele tem mas ainda não alcança
    function pickTool(kind, skill) {
        const L = lvl(skill), c = [], wp = player.equipment.weapon; if (wp && wp.tool === kind) c.push(wp);
        player.inventory.forEach((i) => { if (i && i.tool === kind) c.push(i); });
        let best = null, locked = null;
        for (const it of c) { const t = E.toolOf(it); if (!t) continue; const rec = { it, t }; if (t.lvl <= L) { if (!best || t.tier > best.t.tier || (t.tier === best.t.tier && t.spd < best.t.spd)) best = rec; } else if (!locked || t.tier > locked.t.tier) locked = rec; }
        return { best, locked };
    }
    const toolNameFor = (kind, tier) => { const T = E.TOOLS[kind] || {}; const n = Object.keys(T).find((k) => T[k].tier >= tier); return n ? nm(n) : 'ferramenta melhor'; };
    /* chamado ao interagir com árvore/rocha. true = tratado aqui (iniciou ou recusou com mensagem); false = deixa o código antigo cuidar */
    function startGather(o) {
        if (!ready()) return false; const n = nodeOf(o); if (!n) return false;
        const L = lvl(n.skill), tk = pickTool(n.tool, n.skill);
        if (!tk.best) {
            if (tk.locked) say('Requer ' + SKN[n.skill] + ' nível ' + tk.locked.t.lvl + ' para usar ' + nm(tk.locked.it.name) + '.');
            else say(n.tool === 'axe' ? 'Requer um machado no inventário.' : 'Requer pickaxe no inventário.');
            return true;
        }
        if (L < n.lvl) { say('Requer ' + SKN[n.skill] + ' nível ' + n.lvl + ' (' + n.name + '). Você tem ' + L + '.'); return true; }
        if (n.kind === 'rock' && tk.best.t.tier < n.tier) { say('Requer uma picareta melhor: ' + toolNameFor('pickaxe', n.tier) + '.'); return true; }
        player.isPerformingAction = true; player.actionTarget = o; player.actionType = n.kind === 'tree' ? 'chop' : 'mine'; player.actionToolItem = tk.best.it;
        player.actionTimer = player.actionDelay = E.gatherFrames(E.GATHER_BASE * (n.t || 1), L, tk.best.t.spd, 24);
        if (n.kind === 'tree' && n.tt !== 'normal') say(n.name + ' (nível ' + n.lvl + ')', '#9ad39a');
        return true;
    }
    /* fim de um golpe (o laço do jogo chama a cada actionTimer<=0). true = tratado; o laço depois cuida de esgotar o recurso e reiniciar o tempo */
    function finishGather(o, kind) {
        if (!ready()) return false; const n = nodeOf(o); if (!n || (kind === 'chop') !== (n.kind === 'tree')) return false;
        const L = lvl(n.skill), tk = pickTool(n.tool, n.skill);
        if (tk.best) player.actionDelay = E.gatherFrames(E.GATHER_BASE * (n.t || 1), L, tk.best.t.spd, 24);   // subiu de nível no meio: acelera
        if (Math.random() > E.successChance(L, n.lvl)) { addFloatingText(player.x, player.y - 22, n.kind === 'tree' ? 'Errou o golpe' : 'Escorregou', '#bdc3c7'); return true; }
        const qty = 1 + (Math.random() < E.doubleChance(L) ? 1 : 0);
        if (!addInvItem(n.item, qty)) { player.isPerformingAction = false; say('Mochila cheia!'); return true; }
        if (o.hp !== undefined) o.hp--;
        addXP(n.skill, n.xp);
        if (qty > 1) addFloatingText(player.x, player.y - 32, 'Dobro! +' + qty, '#f1c40f');
        try { if (window.Engage && Engage.prog) Engage.prog(n.kind === 'tree' ? 'wood' : 'mine', qty); } catch (e) { }
        return true;
    }

    /* ============================ FOGO, COZINHA, FUNDIÇÃO ============================ */
    const LOG_ORDER = ['Logs', 'Oak Logs', 'Willow Logs', 'Maple Logs', 'Yew Logs', 'Magic Logs'];
    const fireLog = () => { if (!ready()) return null; for (const n of LOG_ORDER) if (getInvCount(n) >= 1) return n; return null; };
    const fireXp = (log) => Math.round((E.FIRE_XP.Logs || 40) * ((E.LOG_ITEMS[log] && E.LOG_ITEMS[log].fm) || 1));
    function cookable() {
        if (!ready()) return undefined; const L = lvl('cooking');
        return player.inventory.find((i) => { const d = dbItems()[i.name]; return d && d.cooksInto && L >= E.cookLvl(d); });
    }
    function cookMsg() {
        if (!ready()) return 'Você não tem nada cru para cozinhar.'; const L = lvl('cooking');
        const lk = player.inventory.find((i) => { const d = dbItems()[i.name]; return d && d.cooksInto && L < E.cookLvl(d); });
        return lk ? 'Requer Culinária nível ' + E.cookLvl(dbItems()[lk.name]) + ' para cozinhar ' + nm(lk.name) + '.' : 'Você não tem nada cru para cozinhar.';
    }
    const cookFrames = () => E.gatherFrames(80, lvl('cooking'), 1, 20);

    /* ============================ VENDA A NPC ============================ */
    let valuer = null, valSig = '';
    function val() {
        const db = dbItems(), npc = typeof npcDB !== 'undefined' ? npcDB : {}, sig = Object.keys(db).length + ':' + Object.keys(npc).length + ':' + (valuer ? 1 : 0);
        if (!valuer || sig !== valSig) { valuer = E.makeValuer(db, npc); valSig = sig; }
        return valuer;
    }
    const invalidate = () => { valuer = null; };
    function sellPrice(it) {   // por unidade; 0 = não vendível
        if (!it) return 0; const def = dbItems()[it.name]; if (!def) return 0;
        const inst = Object.assign({}, def, it); if (val().blockReason(inst)) return 0;
        return val().sell(it.name) | 0;
    }
    function sell(idx, qty) {
        if (!ready()) return false; const it = player.inventory[idx]; if (!it) return false;
        const price = sellPrice(it); if (!(price > 0)) { say('Esse item não pode ser vendido.'); return false; }
        const have = it.stackable ? Math.max(1, it.qty | 0) : 1; qty = Math.max(1, Math.min(Math.floor(Number(qty)) || 1, have));
        const total = price * qty; if (!Number.isSafeInteger(total) || total <= 0) return false;
        const snap = JSON.stringify(player.inventory), name = it.name;
        if (it.stackable) removeInvItem(name, qty); else player.inventory.splice(idx, 1);
        if (!addInvItem('Coins', total)) { const back = JSON.parse(snap); player.inventory.length = 0; back.forEach((x) => player.inventory.push(x)); say('Mochila cheia!'); return false; }
        addFloatingText(player.x, player.y - 24, '+' + fmt(total) + ' moedas', '#f1c40f');
        say('Vendeu ' + (qty > 1 ? qty + '× ' : '') + nm(name) + ' por ' + fmt(total) + ' moedas.', '#f1c40f');
        try { if (window.Sfx && Sfx.play) Sfx.play('pickup'); } catch (e) { }
        try { saveDataLogic(); } catch (e) { } try { updateUI(); } catch (e) { }
        return true;
    }
    let shopNpc = null, sellSig = '', armed = null;
    function sellBox() {
        let b = $('npc-sell'); if (b) return b; const tab = $('tab-npc'); if (!tab) return null;
        b = document.createElement('div'); b.id = 'npc-sell'; tab.appendChild(b);
        b.addEventListener('click', (ev) => {
            const t = ev.target.closest('[data-sell]'); if (!t) return; const idx = +t.dataset.sell, q = t.dataset.q === 'all' ? 1e9 : +t.dataset.q, total = +t.dataset.total || 0;
            if (total >= 500 && armed !== t.dataset.sell + ':' + t.dataset.q) { armed = t.dataset.sell + ':' + t.dataset.q; t.textContent = 'Confirmar ' + fmt(total) + ' 🪙?'; setTimeout(() => { if (armed === t.dataset.sell + ':' + t.dataset.q) armed = null; sellSig = ''; renderSell(); }, 3500); return; }
            armed = null; sell(idx, q); sellSig = ''; renderSell();
        });
        return b;
    }
    function shopActive() { const tab = $('tab-npc'); return !!(shopNpc && shopNpc.shopStr && tab && tab.classList.contains('active-tab')); }
    function renderSell() {
        const b = sellBox(); if (!b || !ready()) return;
        if (!shopActive()) { if (b.innerHTML) { b.innerHTML = ''; sellSig = ''; } return; }
        const rows = []; player.inventory.forEach((it, i) => { const p = sellPrice(it); if (p > 0) rows.push({ i, it, p, q: it.stackable ? Math.max(1, it.qty | 0) : 1 }); });
        const sig = rows.map((r) => r.i + ':' + r.it.name + ':' + r.q + ':' + r.p).join('|') + '#' + (armed || '');
        if (sig === sellSig) return; sellSig = sig;
        let h = '<h4 style="margin:12px 0 4px;color:#f39c12;border-top:1px solid #3d2e24;padding-top:8px">Vender</h4>';
        if (!rows.length) h += '<div style="opacity:.7;font-size:.8rem">Você não tem nada que este mercador compre.</div>';
        for (const r of rows) {
            const btn = (q, label) => `<button class="shop-btn" data-sell="${r.i}" data-q="${q}" data-total="${r.p * (q === 'all' ? r.q : q)}">${label}</button>`;
            h += `<div class="shop-item"><span>${typeof Icons !== 'undefined' ? Icons.html(r.it.name, 24) : ''} ${esc2(nm(r.it.name))}${r.q > 1 ? ' ×' + fmt(r.q) : ''} <small style="opacity:.75">(${fmt(r.p)} 🪙 cada)</small></span><span>`
                + (r.q > 1 ? btn(1, 'Vender 1') + (r.q >= 10 ? btn(10, '×10') : '') + btn('all', 'Tudo (' + fmt(r.p * r.q) + ' 🪙)') : btn(1, 'Vender (' + fmt(r.p) + ' 🪙)')) + '</span></div>';
        }
        b.innerHTML = h;
    }
    function wrapShop() {
        const o = window.openShop; if (typeof o !== 'function' || o._ps) return;
        const w = function (nData) { const r = o.apply(this, arguments); try { shopNpc = nData; invalidate(); sellSig = ''; renderSell(); } catch (e) { console.error(e); } return r; }; w._ps = 1; window.openShop = w;
    }

    /* ============================ NÍVEL MÍNIMO: guarda de equipamento ============================ */
    let seenUser = null, seenAt = 0;
    function guard() {
        if (!ready() || typeof currentUser === 'undefined' || !currentUser || !window.Stats || !Stats.canEquip) return;
        const now = Date.now(); if (seenUser !== currentUser) { seenUser = currentUser; seenAt = now; return; } if (now - seenAt < 4000) return;   // espera o save carregar
        if (typeof userRole !== 'undefined' && userRole === 'admin') return;
        let moved = 0;
        for (const slot of Object.keys(player.equipment)) {
            const it = player.equipment[slot]; if (!it) continue; const c = Stats.canEquip(it); if (c.ok) continue;
            if (it.stackable) { if (!addInvItem(it.name, it.qty || 1)) continue; }
            else { if (player.inventory.length >= (typeof INV_SLOTS !== 'undefined' ? INV_SLOTS : 28)) continue; player.inventory.push(it); }
            player.equipment[slot] = null; moved++; say(nm(it.name) + ' guardado na mochila. ' + c.msg);
        }
        if (moved) { try { updateUI(); saveDataLogic(); } catch (e) { } }
    }

    /* ============================ EDITOR DE ITENS (Dev): preço de venda e nível mínimo ============================ */
    function devFields() {
        if ($('di-sell') || !$('di-recipe')) return; const grp = $('di-recipe').closest('.dev-form-group'); if (!grp) return;
        const d = document.createElement('div'); d.className = 'dev-row';
        d.innerHTML = '<div class="dev-form-group" style="flex:1"><label>Preço de venda (NPC):</label><input type="number" min="0" id="di-sell" class="dev-input" placeholder="vazio = automático · 0 = não vende"></div>'
            + '<div class="dev-form-group" style="flex:1"><label>Nível mínimo (equipar):</label><input type="number" min="1" max="99" id="di-lvl" class="dev-input" placeholder="vazio = automático"></div>';
        grp.parentNode.insertBefore(d, grp);
    }
    function wrapDevForm() {
        const o = window.loadDevItemForm; if (typeof o !== 'function' || o._ps) return;
        const w = function () { const r = o.apply(this, arguments); try { devFields(); const k = $('dev-item-select').value, it = k !== 'NEW' ? dbItems()[k] : null; $('di-sell').value = it && it.sell !== undefined && it.sell !== null ? it.sell : ''; const rq = it && it.reqV === E.TABLE_V && it.req ? it.req.lvl : (it && it.lvl) || ''; $('di-lvl').value = rq; } catch (e) { } return r; };
        w._ps = 1; window.loadDevItemForm = w;
    }

    function state() { return { shop: !!shopNpc, tree: null, valuer: !!valuer }; }
    window.Progress = { startGather, finishGather, cookable, cookMsg, cookFrames, fireLog, fireXp, sellPrice, sell, treeOf, nodeOf, invalidate, renderSell, guard, state };

    function boot() { setup(); wrapShop(); wrapDevForm(); devFields(); setInterval(() => { try { if (!shopNpc || !shopActive()) { if (shopNpc && !(typeof isNPCOpen !== 'undefined' && isNPCOpen) && !shopActive()) { /* aba fechada */ } } renderSell(); } catch (e) { } }, 700); setInterval(() => { try { guard(); } catch (e) { } }, 2000); setInterval(() => { try { wrapShop(); wrapDevForm(); devFields(); } catch (e) { } }, 3000); }
    if (document.readyState === 'complete') setTimeout(boot, 300); else window.addEventListener('load', () => setTimeout(boot, 300));
    // o catálogo é mesclado no login: refaz as tabelas e os troncos quando o jogo começa
    let setupFor = null; setInterval(() => { try { if (ready() && typeof currentUser !== 'undefined' && currentUser && setupFor !== currentUser) { setupFor = currentUser; setup(); invalidate(); } } catch (e) { } }, 1500);
})();
