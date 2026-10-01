/* MiniScape 2D — conteúdo novo: minérios (carvão, mithril), aço e mithril, agricultura, alquimia e encantamento.
   Tudo é acrescentado sem apagar nada do que o admin já editou (itens, mapas e NPCs existentes continuam iguais). */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    /* ============================ ITENS ============================ */
    const ITEMS = {
        'Coal': { name: 'Coal', icon: '⚫', type: 'resource', stackable: true, weight: 1.6, desc: 'Carvão. Usado na fornalha para fazer aço e mithril.' },
        'Mithril Ore': { name: 'Mithril Ore', icon: '🔷', type: 'resource', stackable: true, weight: 2.4, desc: 'Minério azulado, raro e resistente.' },
        'Steel Bar': { name: 'Steel Bar', icon: '⬛', type: 'resource', stackable: true, weight: 2.0, desc: 'Aço: 1 Iron Ore + 2 Coal na fornalha.' },
        'Mithril Bar': { name: 'Mithril Bar', icon: '🟦', type: 'resource', stackable: true, weight: 2.0, desc: 'Mithril: 1 Mithril Ore + 3 Coal na fornalha.' },
        'Steel Sword': { name: 'Steel Sword', icon: '🗡️', type: 'equipment', slot: 'weapon', bonusDmg: 10, stackable: false, weight: 2.4, desc: 'Espada de aço.', recipe: 'Steel Bar,2', craftQty: 1 },
        'Steel Shield': { name: 'Steel Shield', icon: '🛡️', type: 'equipment', slot: 'shield', defBonus: 6, stackable: false, weight: 4.2, desc: 'Escudo de aço.', recipe: 'Steel Bar,3', craftQty: 1 },
        'Steel Body': { name: 'Steel Body', icon: '🦺', type: 'equipment', slot: 'body', defBonus: 9, stackable: false, weight: 7.5, desc: 'Armadura de aço.', recipe: 'Steel Bar,5', craftQty: 1 },
        'Steel Pickaxe': { name: 'Steel Pickaxe', icon: '⛏️', type: 'equipment', slot: 'weapon', tool: 'pickaxe', tier: 3, stackable: false, weight: 2.0, desc: 'Minera mithril.', recipe: 'Steel Bar,2|Logs,1', craftQty: 1 },
        'Mithril Sword': { name: 'Mithril Sword', icon: '⚔️', type: 'equipment', slot: 'weapon', bonusDmg: 15, stackable: false, weight: 2.0, desc: 'Leve e afiada como poucas.', recipe: 'Mithril Bar,2', craftQty: 1 },
        'Mithril Shield': { name: 'Mithril Shield', icon: '🛡️', type: 'equipment', slot: 'shield', defBonus: 9, stackable: false, weight: 3.6, desc: 'Escudo de mithril.', recipe: 'Mithril Bar,3', craftQty: 1 },
        'Mithril Body': { name: 'Mithril Body', icon: '🦺', type: 'equipment', slot: 'body', defBonus: 13, stackable: false, weight: 6.0, desc: 'Armadura de mithril.', recipe: 'Mithril Bar,5', craftQty: 1 },
        'Mithril Pickaxe': { name: 'Mithril Pickaxe', icon: '⛏️', type: 'equipment', slot: 'weapon', tool: 'pickaxe', tier: 4, stackable: false, weight: 1.8, desc: 'A melhor picareta.', recipe: 'Mithril Bar,2|Logs,1', craftQty: 1 },
        'Wheat Seed': { name: 'Wheat Seed', icon: '🌱', type: 'resource', stackable: true, weight: 0.05, desc: 'Semente de trigo. Plante num canteiro da fazenda.' },
        'Carrot Seed': { name: 'Carrot Seed', icon: '🌱', type: 'resource', stackable: true, weight: 0.05, desc: 'Semente de cenoura.' },
        'Potato Seed': { name: 'Potato Seed', icon: '🌱', type: 'resource', stackable: true, weight: 0.05, desc: 'Semente de batata (Agricultura 5).' },
        'Herb Seed': { name: 'Herb Seed', icon: '🌱', type: 'resource', stackable: true, weight: 0.05, desc: 'Semente de erva curativa (Agricultura 3).' },
        'Mana Seed': { name: 'Mana Seed', icon: '🌱', type: 'resource', stackable: true, weight: 0.05, desc: 'Semente de flor de mana (Agricultura 10).' },
        'Wheat': { name: 'Wheat', icon: '🌾', type: 'resource', stackable: true, weight: 0.2, desc: 'Trigo. Vira Bread na aba Ofícios.' },
        'Bread': { name: 'Bread', icon: '🍞', type: 'consumable', heal: 6, stackable: true, weight: 0.3, desc: 'Pão fresco. Cura 6 HP.', recipe: 'Wheat,3', craftQty: 1 },
        'Carrot': { name: 'Carrot', icon: '🥕', type: 'consumable', heal: 3, stackable: true, weight: 0.2, desc: 'Cenoura crocante.' },
        'Potato': { name: 'Potato', icon: '🥔', type: 'resource', stackable: true, weight: 0.3, desc: 'Asse na fogueira.', cooksInto: 'Baked Potato', cookXp: 12 },
        'Baked Potato': { name: 'Baked Potato', icon: '🥔', type: 'consumable', heal: 8, stackable: true, weight: 0.3, desc: 'Batata assada. Cura 8 HP.' },
        'Healing Herb': { name: 'Healing Herb', icon: '🌿', type: 'resource', stackable: true, weight: 0.1, desc: 'Erva curativa. Base das poções.' },
        'Mana Blossom': { name: 'Mana Blossom', icon: '🌸', type: 'resource', stackable: true, weight: 0.1, desc: 'Flor de mana. Base das poções de mana.' },
        'Empty Vial': { name: 'Empty Vial', icon: '🫙', type: 'resource', stackable: true, weight: 0.1, desc: 'Frasco vazio para poções.' },
        'Greater Health Potion': { name: 'Greater Health Potion', icon: '🧪', type: 'consumable', heal: 40, stackable: true, weight: 0.3, desc: 'Cura 40 HP.' },
        'Mana Potion': { name: 'Mana Potion', icon: '🧪', type: 'consumable', mp: 15, stackable: true, weight: 0.3, desc: 'Restaura 15 MP.' },
        'Strength Potion': { name: 'Strength Potion', icon: '🧪', type: 'consumable', buff: { k: 'dmg', v: 3, secs: 180 }, stackable: true, weight: 0.3, desc: '+3 de dano por 3 minutos.' },
        'Guard Potion': { name: 'Guard Potion', icon: '🧪', type: 'consumable', buff: { k: 'def', v: 3, secs: 180 }, stackable: true, weight: 0.3, desc: '+3 de defesa por 3 minutos.' }
    };

    /* ============================ MINÉRIOS ============================ */
    const ROCKS = {
        rock_copper: { ore: 'Copper Ore', hp: 2, color: '#d35400', lvl: 1, tier: 1, xp: 20, label: 'Rocha de cobre' },
        rock_tin: { ore: 'Tin Ore', hp: 2, color: '#bdc3c7', lvl: 1, tier: 1, xp: 20, label: 'Rocha de estanho' },
        rock_iron: { ore: 'Iron Ore', hp: 3, color: '#7f8c8d', lvl: 1, tier: 1, xp: 25, label: 'Rocha de ferro' },
        rock_coal: { ore: 'Coal', hp: 3, color: '#2b2b33', lvl: 5, tier: 1, xp: 32, label: 'Veio de carvão' },
        rock_mithril: { ore: 'Mithril Ore', hp: 5, color: '#4f86d6', lvl: 15, tier: 3, xp: 70, label: 'Veio de mithril', toolName: 'Steel Pickaxe' }
    };
    const TIER = { 'Bronze Pickaxe': 1, 'Iron Pickaxe': 2, 'Steel Pickaxe': 3, 'Mithril Pickaxe': 4 };
    const tierOf = (it) => (it && (it.tier || TIER[it.name])) || 1;
    function bestTool(kind) {
        const cands = []; const wp = player.equipment && player.equipment.weapon; if (wp && wp.tool === kind) cands.push(wp);
        (player.inventory || []).forEach((i) => { if (i.tool === kind) cands.push(i); });
        cands.sort((a, b) => tierOf(b) - tierOf(a)); return cands[0] || null;
    }

    /* ============================ FORNALHA ============================ */
    const SMELT = [
        { id: 'mithril', needs: [['Mithril Ore', 1], ['Coal', 3]], out: 'Mithril Bar', xp: 70, lvl: 20 },
        { id: 'steel', needs: [['Iron Ore', 1], ['Coal', 2]], out: 'Steel Bar', xp: 42, lvl: 10 },
        { id: 'iron', needs: [['Iron Ore', 1]], out: 'Iron Bar', xp: 25, lvl: 1 },
        { id: 'bronze', needs: [['Copper Ore', 1], ['Tin Ore', 1]], out: 'Bronze Bar', xp: 15, lvl: 1 }
    ];
    let smeltRec = null;
    const hasNeeds = (r) => r.needs.every((n) => getInvCount(n[0]) >= n[1]);
    function startSmelt(furnace) {
        const lvl = player.stats.skills.smithing.level; let blocked = null, rec = null;
        for (const r of SMELT) { if (!hasNeeds(r)) continue; if (lvl < r.lvl) { blocked = blocked || r; continue; } rec = r; break; }
        if (!rec) { setActionText(blocked ? `Requer Ferraria nível ${blocked.lvl} para ${blocked.out}.` : 'Sem minérios para fundir. (Aço: Iron Ore + 2 Coal)', '#e74c3c'); return; }
        smeltRec = rec; player.isPerformingAction = true; player.actionTarget = furnace; player.actionType = 'smelt'; player.actionTimer = player.actionDelay = Math.max(30, 100 - lvl * 2);
    }
    function finishSmelt() {
        const r = smeltRec; player.isPerformingAction = false; smeltRec = null; if (!r || !hasNeeds(r)) return;
        const snap = JSON.stringify(player.inventory); r.needs.forEach((n) => removeInvItem(n[0], n[1]));
        if (addInvItem(r.out, 1)) { addXP('smithing', r.xp); addFloatingText(player.x, player.y - 18, '+' + r.out, '#f1c40f'); } else { player.inventory = JSON.parse(snap); setActionText('Inventário cheio!', '#e74c3c'); }
    }

    /* ============================ AGRICULTURA ============================ */
    const CROPS = {
        wheat: { seed: 'Wheat Seed', out: 'Wheat', name: 'Trigo', secs: 150, xp: 12, lvl: 1, col: '#e6c85a' },
        carrot: { seed: 'Carrot Seed', out: 'Carrot', name: 'Cenoura', secs: 120, xp: 10, lvl: 1, col: '#e8862a' },
        potato: { seed: 'Potato Seed', out: 'Potato', name: 'Batata', secs: 210, xp: 16, lvl: 5, col: '#c8a86a' },
        herb: { seed: 'Herb Seed', out: 'Healing Herb', name: 'Erva curativa', secs: 180, xp: 20, lvl: 3, col: '#57c46a' },
        mana: { seed: 'Mana Seed', out: 'Mana Blossom', name: 'Flor de mana', secs: 300, xp: 28, lvl: 10, col: '#7aa8ff' }
    };
    const farm = () => { if (!player.farm || typeof player.farm !== 'object') player.farm = {}; return player.farm; };
    const cropState = (o) => { const s = farm()[o.id]; if (!s || !CROPS[s.crop]) return null; const c = CROPS[s.crop], el = (Date.now() - s.at) / 1000; return { crop: s.crop, c, el, k: Math.max(0, Math.min(1, el / c.secs)), ready: el >= c.secs }; };
    const fmt = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
    function plotClick(o) {
        const st = cropState(o);
        if (st && st.ready) return harvest(o, st);
        if (st) { setActionText(`${st.c.name} crescendo: faltam ${fmt(st.c.secs - st.el)}`, '#f1c40f'); return; }
        const lvl = player.stats.skills.farming.level; const seeds = Object.keys(CROPS).filter((k) => getInvCount(CROPS[k].seed) > 0);
        if (!seeds.length) { setActionText('Você precisa de sementes. O Fazendeiro vende.', '#e74c3c'); return; }
        const usable = seeds.filter((k) => lvl >= CROPS[k].lvl);
        if (!usable.length) { setActionText(`Agricultura nível ${Math.min(...seeds.map((k) => CROPS[k].lvl))} necessária.`, '#e74c3c'); return; }
        if (usable.length === 1) return plant(o.id, usable[0]);
        openModal(`<h3 style="margin:0 0 8px;color:#e8c469">Plantar</h3>` + usable.map((k) => `<button class="dev-save-btn" style="margin:3px 0" onclick="Content.plantSel('${esc(String(o.id))}','${k}')">${esc(CROPS[k].name)} <small>(${fmt(CROPS[k].secs)})</small></button>`).join('') + `<button class="dev-save-btn" style="background:#555" onclick="closeModal()">Cancelar</button>`);
    }
    function findPlot(id) { const m = gameMaps[currentMap]; return m && (m.entities || []).find((e) => e && String(e.id) === String(id) && e.type === 'farm_plot'); }
    function plant(id, crop) {
        const o = findPlot(id), c = CROPS[crop]; if (!o || !c || cropState(o)) return;
        if (Math.hypot(player.x - (o.x + o.w / 2), player.y - (o.y + o.h / 2)) > 130) { setActionText('Chegue mais perto do canteiro.', '#e74c3c'); return; }
        if (player.stats.skills.farming.level < c.lvl || !removeInvItem(c.seed, 1)) { setActionText('Não foi possível plantar.', '#e74c3c'); return; }
        farm()[o.id] = { crop, at: Date.now() }; addXP('farming', 4); if (window.Sfx) Sfx.play('plant'); addFloatingText(o.x + o.w / 2, o.y, 'Plantado', '#78d08a'); closeModal(); saveDataLogic(); updateUI();
    }
    function harvest(o, st) {
        const c = st.c; const n = 2 + Math.floor(Math.random() * 3) + (player.stats.skills.farming.level >= 10 ? 1 : 0);
        if (!invSpaceFor(c.out, n)) { setActionText('Inventário cheio!', '#e74c3c'); return; }
        addInvItem(c.out, n); delete farm()[o.id]; addXP('farming', c.xp);
        if (Math.random() < 0.4 && invSpaceFor(c.seed, 1)) { addInvItem(c.seed, 1); addFloatingText(o.x + o.w / 2, o.y - 14, '+semente', '#78d08a'); }
        if (window.Sfx) Sfx.play('harvest'); addFloatingText(o.x + o.w / 2, o.y, '+' + n + ' ' + c.out, '#f1c40f'); saveDataLogic(); updateUI();
    }

    /* ============================ ALQUIMIA ============================ */
    const BREW = [
        { out: 'Health Potion', needs: [['Healing Herb', 2], ['Empty Vial', 1]], xp: 25, lvl: 1 },
        { out: 'Mana Potion', needs: [['Mana Blossom', 2], ['Empty Vial', 1]], xp: 35, lvl: 4 },
        { out: 'Greater Health Potion', needs: [['Healing Herb', 3], ['Slime Ball', 1], ['Empty Vial', 1]], xp: 55, lvl: 8 },
        { out: 'Strength Potion', needs: [['Healing Herb', 1], ['Boar Tusk', 1], ['Empty Vial', 1]], xp: 70, lvl: 12 },
        { out: 'Guard Potion', needs: [['Healing Herb', 1], ['Bat Wing', 1], ['Empty Vial', 1]], xp: 80, lvl: 15 }
    ];
    const nm = (n) => (itemDB[n] ? itemDB[n].icon + ' ' + itemDB[n].name : n);
    function openCauldron() {
        const lvl = player.stats.skills.alchemy.level;
        let h = `<h3 style="margin:0 0 4px;color:#e8c469">Caldeirão de Alquimia</h3><p style="font-size:.74rem;color:#cdbf9b;margin:0 0 8px">Alquimia nível ${lvl}. Ervas vêm da fazenda, o frasco vem do Sacerdote e do Fazendeiro; os outros ingredientes caem de monstros.</p><div style="max-height:52vh;overflow:auto">`;
        BREW.forEach((r, i) => {
            const ok = r.needs.every((n) => getInvCount(n[0]) >= n[1]) && lvl >= r.lvl;
            h += `<div class="shop-item" style="flex-direction:column;align-items:stretch;gap:4px"><div><b>${esc(nm(r.out))}</b> <small style="opacity:.7">nível ${r.lvl} · ${r.xp} XP</small><div style="font-size:.7rem;opacity:.8">${esc((itemDB[r.out] || {}).desc || '')}</div></div><div style="font-size:.72rem">${r.needs.map((n) => `<span style="color:${getInvCount(n[0]) >= n[1] ? '#78d08a' : '#e0584a'}">${n[1]}× ${esc(nm(n[0]))} (${getInvCount(n[0])})</span>`).join(' · ')}</div><button class="shop-btn" ${ok ? '' : 'disabled'} onclick="Content.brew(${i})">${lvl < r.lvl ? 'Requer nível ' + r.lvl : 'Preparar'}</button></div>`;
        });
        openModal(h + `</div><button class="dev-save-btn" style="background:#555" onclick="closeModal()">Fechar</button>`);
    }
    function brew(i) {
        const r = BREW[i]; if (!r || player.stats.skills.alchemy.level < r.lvl || !r.needs.every((n) => getInvCount(n[0]) >= n[1])) { setActionText('Faltam ingredientes.', '#e74c3c'); return; }
        const snap = JSON.stringify(player.inventory); r.needs.forEach((n) => removeInvItem(n[0], n[1]));
        if (!addInvItem(r.out, 1)) { player.inventory = JSON.parse(snap); setActionText('Inventário cheio!', '#e74c3c'); return; }
        addXP('alchemy', r.xp); if (window.Sfx) Sfx.play('brew'); addFloatingText(player.x, player.y - 18, '+' + r.out, '#7aa8ff'); saveDataLogic(); updateUI(); openCauldron();
    }

    /* ============================ ENCANTAMENTO ============================ */
    const ENCH = [
        { lvl: 1, needs: [['Slime Ball', 3]], coins: 50, xp: 40 },
        { lvl: 8, needs: [['Spider Silk', 3], ['Bat Wing', 2]], coins: 150, xp: 90 },
        { lvl: 15, needs: [['Ectoplasm', 3], ['Dragon Scale', 1]], coins: 400, xp: 200 }
    ];
    const SLOTS = [['weapon', 'Arma'], ['shield', 'Escudo'], ['body', 'Tronco'], ['head', 'Cabeça']];
    function openEnchant() {
        const lvl = player.stats.skills.enchanting.level;
        let h = `<h3 style="margin:0 0 4px;color:#e8c469">Mesa de Encantamento</h3><p style="font-size:.74rem;color:#cdbf9b;margin:0 0 8px">Encantamento nível ${lvl}. Cada nível dá +2 de dano em armas ou +1 de defesa em armaduras (máx. 3 níveis). O item precisa estar <b>equipado</b>.</p><div style="max-height:52vh;overflow:auto">`;
        let any = false;
        SLOTS.forEach(([slot, label]) => {
            const it = player.equipment && player.equipment[slot]; if (!it || it.stackable) return; any = true; if (it.mimic) { h += `<div class="shop-item" style="flex-direction:column;align-items:stretch;gap:4px"><div><b>${label}: ${esc(it.icon)} ${esc(it.name)}</b></div><small style="opacity:.75">Itens Mímicos evoluem com XP própria e não podem ser encantados.</small></div>`; return; } const cur = it.ench || 0, nx = ENCH[cur];
            h += `<div class="shop-item" style="flex-direction:column;align-items:stretch;gap:4px"><div><b>${label}: ${esc(it.icon)} ${esc(it.name)}</b> <small>${cur ? '(+' + cur + ')' : ''}</small></div>`;
            if (!nx) h += `<div style="font-size:.74rem;color:#78d08a">Encantamento máximo.</div>`;
            else { const ok = lvl >= nx.lvl && nx.needs.every((n) => getInvCount(n[0]) >= n[1]) && getInvCount('Coins') >= nx.coins; h += `<div style="font-size:.72rem">${nx.needs.map((n) => `<span style="color:${getInvCount(n[0]) >= n[1] ? '#78d08a' : '#e0584a'}">${n[1]}× ${esc(nm(n[0]))}</span>`).join(' · ')} · <span style="color:${getInvCount('Coins') >= nx.coins ? '#78d08a' : '#e0584a'}">${nx.coins} moedas</span></div><button class="shop-btn" ${ok ? '' : 'disabled'} onclick="Content.enchant('${slot}')">${lvl < nx.lvl ? 'Requer nível ' + nx.lvl : 'Encantar +' + (cur + 1)}</button>`; }
            h += `</div>`;
        });
        if (!any) h += `<p style="font-size:.8rem">Equipe uma arma ou armadura para encantá-la.</p>`;
        openModal(h + `</div><button class="dev-save-btn" style="background:#555" onclick="closeModal()">Fechar</button>`);
    }
    function enchant(slot) {
        const it = player.equipment && player.equipment[slot]; if (!it) return; if (it.mimic) { setActionText('Itens Mímicos não podem ser encantados.', '#e74c3c'); return; } const cur = it.ench || 0, nx = ENCH[cur];
        if (!nx || player.stats.skills.enchanting.level < nx.lvl || !nx.needs.every((n) => getInvCount(n[0]) >= n[1]) || getInvCount('Coins') < nx.coins) { setActionText('Faltam requisitos.', '#e74c3c'); return; }
        nx.needs.forEach((n) => removeInvItem(n[0], n[1])); removeInvItem('Coins', nx.coins);
        it.ench = cur + 1; if (it.bonusDmg !== undefined || slot === 'weapon') it.bonusDmg = (it.bonusDmg || 0) + 2; else it.defBonus = (it.defBonus || 0) + 1;
        addXP('enchanting', nx.xp); if (window.Sfx) Sfx.play('enchant'); addFloatingText(player.x, player.y - 22, it.name + ' +' + it.ench, '#c9a6ff'); saveDataLogic(); updateUI(); openEnchant();
    }

    /* ============================ EFEITOS TEMPORÁRIOS (poções) ============================ */
    function buff(k) { const b = player && player.buffs && player.buffs[k]; return b && b.until > Date.now() ? b.v : 0; }
    function applyBuff(b) { if (!player.buffs) player.buffs = {}; player.buffs[b.k] = { v: b.v, until: Date.now() + b.secs * 1000 }; setActionText(`${b.k === 'dmg' ? 'Força' : 'Guarda'} +${b.v} por ${Math.round(b.secs / 60)} min`, '#7aa8ff'); }

    /* ============================ MUNDO: canteiros, estações e minérios novos ============================ */
    const NONSOLID = ['ground_item', 'fishing_spot', 'portal', 'fire', 'paint', 'enemy', 'npc', 'farm_plot', 'house_door'];
    function findFree(m, x, y, w, h) {
        const W = m.width || 800, H = m.height || 600; const solid = (m.entities || []).filter((o) => o && o.active !== false && !NONSOLID.includes(o.type));
        const free = (px, py) => px > 40 && py > 40 && px + w < W - 40 && py + h < H - 40 && !solid.some((o) => { const ow = o.w || 30, oh = o.h || 30; return px - 6 < o.x + ow && px + w + 6 > o.x && py - 6 < o.y + oh && py + h + 6 > o.y; });
        if (free(x, y)) return { x, y };
        for (let r = 24; r < 500; r += 24) for (let a = 0; a < 20; a++) { const px = Math.round(x + Math.cos(a / 20 * 6.283) * r), py = Math.round(y + Math.sin(a / 20 * 6.283) * r); if (free(px, py)) return { x: px, y: py }; }
        return null;
    }
    function put(m, o) { const p = findFree(m, o.x, o.y, o.w, o.h); if (!p) return false; o.x = p.x; o.y = p.y; o.active = true; (m.entities = m.entities || []).push(o); return true; }
    const rockEnt = (k, id, x, y) => ({ id, type: k, name: k, x, y, w: 38, h: 38, hp: ROCKS[k].hp, maxHp: ROCKS[k].hp, color: ROCKS[k].color });
    let dirty = false;
    function placeInWorld(maps) {
        if (!maps || typeof maps !== 'object') return;
        const mk = (m, k) => { if (!m.c3 || typeof m.c3 !== 'object') m.c3 = {}; if (m.c3[k]) return false; m.c3[k] = true; dirty = true; return true; };   // cada peça é colocada uma única vez por mapa
        const findNpc = (key) => { for (const id of Object.keys(maps)) { const e = (maps[id].entities || []).find((o) => o && o.type === 'npc' && o.dbKey === key); if (e) return { m: maps[id], e }; } return null; };
        const lb = maps.lumbridge;
        const fa = findNpc('farmer_npc');
        if (fa && mk(fa.m, 'plots')) {
            const f = fa.e, m = fa.m;
            const blk = findFree(m, f.x + 90, f.y - 60, 3 * 64, 2 * 58) || findFree(m, f.x - 260, f.y - 200, 3 * 64, 2 * 58);   // um bloco livre para toda a horta
            if (blk) for (let i = 0; i < 6; i++) (m.entities = m.entities || []).push({ id: 'c3_plot_' + i, type: 'farm_plot', name: 'Canteiro', active: true, x: blk.x + (i % 3) * 64, y: blk.y + Math.floor(i / 3) * 58, w: 56, h: 46 });
        }
        const pr = findNpc('priest_npc'); if (pr && mk(pr.m, 'cauldron')) put(pr.m, { id: 'c3_cauldron', type: 'cauldron', name: 'Caldeirão', x: pr.e.x + 80, y: pr.e.y + 20, w: 44, h: 44 });
        const wz = findNpc('wizard_npc') || findNpc('priest_npc') || fa; const wOff = findNpc('wizard_npc') ? 80 : 150; if (wz && mk(wz.m, 'enchant')) put(wz.m, { id: 'c3_enchant', type: 'enchant_table', name: 'Mesa de Encantamento', x: wz.e.x + wOff, y: wz.e.y + 20, w: 54, h: 46 });
        ['mina', 'covil'].forEach((k) => {
            const m = maps[k]; if (!m || !mk(m, 'rocks')) return;
            const irons = (m.entities || []).filter((o) => o && o.type === 'rock_iron'); const W = m.width || 1800, H = m.height || 1400;
            const coals = k === 'mina' ? 5 : 3, mith = k === 'covil' ? 3 : 2;
            for (let i = 0; i < coals; i++) { const a = irons[i % Math.max(1, irons.length)] || { x: W * 0.3 + i * 80, y: H * 0.4 }; put(m, rockEnt('rock_coal', 'c3_coal_' + i, a.x + 70 + i * 12, a.y + 20)); }
            for (let i = 0; i < mith; i++) put(m, rockEnt('rock_mithril', 'c3_mith_' + i, W * (0.62 + i * 0.1), H * (0.25 + (i % 2) * 0.4)));
        });
        try { if (window.World2) World2.placeInWorld(maps); } catch (e) { console.error(e); }
    }

    /* ============================ DESENHO ============================ */
    function drawEntity(ctx, o, T) {
        const t = o.type, x = o.x, y = o.y, w = o.w || 40, h = o.h || 40;
        if (t === 'farm_plot') {
            ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x + 2, y + 4, w, h);
            const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#6b4a2b'); g.addColorStop(1, '#4a3019'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = '#2c1c0e'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
            ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.5; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + 4, y + i * h / 4); ctx.lineTo(x + w - 4, y + i * h / 4); ctx.stroke(); }
            const st = typeof player !== 'undefined' ? cropState(o) : null;
            if (st) {
                const c = st.c, k = st.k, cols = 3, rows = 2;
                for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
                    const px = x + w * (q + 0.5) / cols, py = y + h * (r + 0.75) / rows, hgt = 4 + k * 15 + Math.sin(T * 2 + q + r) * (st.ready ? 0.6 : 0.3);
                    ctx.strokeStyle = '#3f8a4a'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + 2, py - hgt * 0.6, px + (k > 0.5 ? 2 : 0), py - hgt); ctx.stroke();
                    if (k > 0.35) { ctx.fillStyle = '#4da85a'; ctx.beginPath(); ctx.ellipse(px - 3, py - hgt * 0.5, 3.4, 1.8, -0.6, 0, 6.3); ctx.ellipse(px + 3, py - hgt * 0.65, 3.4, 1.8, 0.6, 0, 6.3); ctx.fill(); }
                    if (st.ready) { ctx.fillStyle = c.col; ctx.strokeStyle = 'rgba(30,20,5,.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, py - hgt, 3.6, 0, 6.3); ctx.fill(); ctx.stroke(); }
                }
                if (st.ready) { ctx.fillStyle = 'rgba(255,240,150,' + (0.5 + 0.4 * Math.sin(T * 5)).toFixed(2) + ')'; ctx.font = 'bold 14px serif'; ctx.textAlign = 'center'; ctx.fillText('✦', x + w / 2, y - 4 + Math.sin(T * 3) * 2); ctx.textAlign = 'start'; }
            }
        } else if (t === 'cauldron') {
            const cx = x + w / 2, by = y + h; ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(cx, by, w * 0.55, 6, 0, 0, 6.3); ctx.fill();
            ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - w * .3, by); ctx.lineTo(cx - w * .36, by - 6); ctx.moveTo(cx + w * .3, by); ctx.lineTo(cx + w * .36, by - 6); ctx.stroke();
            const g = ctx.createLinearGradient(x, y, x + w, by); g.addColorStop(0, '#5b5f68'); g.addColorStop(1, '#22242a'); ctx.fillStyle = g; ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.ellipse(cx, y + h * .42, w * .5, h * .42, 0, 0, 6.3); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#3a7d5a'; ctx.beginPath(); ctx.ellipse(cx, y + h * .22, w * .4, h * .13, 0, 0, 6.3); ctx.fill(); ctx.strokeStyle = 'rgba(200,255,220,.5)'; ctx.stroke();
            for (let i = 0; i < 3; i++) { const p = (T * 0.6 + i / 3) % 1; ctx.fillStyle = 'rgba(180,255,210,' + (0.6 * (1 - p)).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(cx + Math.sin(T * 2 + i * 2) * w * .18, y + h * .2 - p * 16, 2.4 + p * 2, 0, 6.3); ctx.fill(); }
        } else if (t === 'enchant_table') {
            const cx = x + w / 2, by = y + h; ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(cx, by, w * .55, 6, 0, 0, 6.3); ctx.fill();
            ctx.fillStyle = '#3a2a5a'; ctx.strokeStyle = '#150d26'; ctx.lineWidth = 2; ctx.fillRect(x + 4, y + h * .35, w - 8, h * .65); ctx.strokeRect(x + 4, y + h * .35, w - 8, h * .65);
            ctx.fillStyle = '#5a3f8a'; ctx.fillRect(x, y + h * .28, w, h * .16); ctx.strokeRect(x, y + h * .28, w, h * .16);
            const fl = Math.sin(T * 2) * 3; ctx.fillStyle = 'rgba(190,150,255,.9)'; ctx.beginPath(); ctx.moveTo(cx, y - 2 + fl); ctx.lineTo(cx + 7, y + 10 + fl); ctx.lineTo(cx, y + 20 + fl); ctx.lineTo(cx - 7, y + 10 + fl); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
            ctx.fillStyle = 'rgba(200,170,255,.25)'; ctx.beginPath(); ctx.arc(cx, y + 10 + fl, 18 + Math.sin(T * 3) * 2, 0, 6.3); ctx.fill();
        }
    }

    /* ============================ LIGAÇÕES COM O JOGO ============================ */
    function merge() {
        try { if (window.World2) World2.merge(); } catch (e) {}
        Object.keys(ITEMS).forEach((k) => { if (!itemDB[k]) itemDB[k] = Object.assign({}, ITEMS[k]); else if (ITEMS[k].tier && !itemDB[k].tier) itemDB[k].tier = ITEMS[k].tier; });
        if (itemDB['Iron Pickaxe'] && !itemDB['Iron Pickaxe'].tier) itemDB['Iron Pickaxe'].tier = 2; if (itemDB['Bronze Pickaxe'] && !itemDB['Bronze Pickaxe'].tier) itemDB['Bronze Pickaxe'].tier = 1;
        // lojas: sementes e frascos
        const add = (npc, extra) => { const d = npcDB[npc]; if (!d) return; const cur = (d.shopStr || '').split('|').filter(Boolean); const have = new Set(cur.map((s) => s.split(',')[0].trim())); extra.forEach((e) => { if (!have.has(e[0]) && itemDB[e[0]]) cur.push(e[0] + ',' + e[1]); }); d.shopStr = cur.join('|'); };
        add('farmer_npc', [['Wheat Seed', 6], ['Carrot Seed', 6], ['Potato Seed', 12], ['Herb Seed', 20], ['Mana Seed', 40], ['Empty Vial', 8]]);
        add('priest_npc', [['Empty Vial', 8], ['Health Potion', 45]]);
        add('smith_npc', [['Coal', 15]]);
        try { if (typeof gameMaps !== 'undefined') placeInWorld(gameMaps); } catch (e) {}
    }
    function tryInteractHook(t) {
        if (!t || t.active === false) return false;
        if (t.type === 'farm_plot') { plotClick(t); return true; }
        if (t.type === 'cauldron') { openCauldron(); return true; }
        if (t.type === 'enchant_table') { openEnchant(); return true; }
        return false;
    }
    function onLogin() { try { placeInWorld(gameMaps); } catch (e) { console.error(e); } if (!player.farm) player.farm = {}; if (!player.buffs) player.buffs = {}; try { if (window.World2) World2.onLogin(); } catch (e) {} try { if (dirty && userRole === 'admin') { worldDirty = true; dirty = false; setTimeout(() => { try { saveDataLogic(false, true); } catch (e) {} }, 1500); } } catch (e) {} }
    function mark() { dirty = true; }
    function wire() {
        const oi = window.tryInteract; if (typeof oi === 'function') window.tryInteract = function (t) { if (tryInteractHook(t)) { player.actionAnim = 15; return; } return oi.apply(this, arguments); };
    }
    window.addEventListener('load', wire);
    window.Content = { ITEMS, ROCKS, SMELT, CROPS, BREW, ENCH, NONSOLID, merge, tierOf, bestTool, startSmelt, finishSmelt, plantSel: plant, brew, enchant, buff, applyBuff, drawEntity, placeInWorld, onLogin, mark, findFree, cropState, openCauldron, openEnchant };
})();
