/* MiniScape 2D — Etapa 5: Bestiário, Casa do Aventureiro e Catacumbas (masmorra com chefe).
   Tudo idempotente e aditivo: nada que o admin já editou é apagado. Mapas novos só são criados pelo admin (o servidor só conhece mapas salvos). */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    /* ============================ CONTEÚDO NOVO ============================ */
    const ITEMS = {
        'Lich Crown': { name: 'Lich Crown', icon: '👑', type: 'equipment', slot: 'head', defBonus: 12, stackable: false, weight: 2.2, desc: 'Coroa gélida do Lich Rei. Ainda sussurra.' },
        'Bone Blade': { name: 'Bone Blade', icon: '🗡️', type: 'equipment', slot: 'weapon', bonusDmg: 18, stackable: false, weight: 2.4, desc: 'Lâmina de osso das Catacumbas. Corta a armadura como papel.' },
        'Soul Gem': { name: 'Soul Gem', icon: '💠', type: 'resource', stackable: true, weight: 0.4, desc: 'Gema com uma alma presa dentro. Rara e muito valiosa.', value: 400 }
    };
    const CREATURES = {
        skeleton_knight: { name: 'Cavaleiro Esquelético', group: 'monstro', species: 'skeleton', behavior: 'aggressive', range: 110, speed: 1.0, w: 34, h: 50, hp: 90, maxHit: 11, xp: 140, c1: '#cfc8b0', c2: '#3a4a6a', lootStr: 'Bones,1,1|Coins,0.9,90|Steel Bar,0.3,1|Coal,0.4,2', dialog: '', shopStr: '', desc: 'Guarda das catacumbas, ainda de armadura.', biome: 'Catacumbas' },
        lich_boss: { name: 'Lich Rei Ossian', group: 'chefe', species: 'darkmage', behavior: 'aggressive', range: 230, speed: 0.8, w: 64, h: 92, hp: 700, maxHit: 26, xp: 3000, c1: '#12301f', c2: '#5dffb0', lootStr: 'Lich Crown,0.35,1|Soul Gem,1,2|Bone Blade,0.25,1|Mithril Bar,0.6,2|Coins,1,1200|Greater Health Potion,0.8,3', dialog: '', shopStr: '', desc: 'O rei morto-vivo das Catacumbas. Traga poções, aço e coragem.', biome: 'Catacumbas' }
    };
    try { if (window.Balance) Balance.applyNpcDB(CREATURES); } catch (e) { }   // balanceamento v2

    /* ============================ BESTIÁRIO ============================ */
    function record(key) {
        if (!key || typeof player === 'undefined' || !player) return;
        if (!player.bestiary || typeof player.bestiary !== 'object') player.bestiary = {};
        if (!Object.prototype.hasOwnProperty.call(player.bestiary, key)) { player.bestiary[key] = 0; try { const d = npcDB[key]; if (d) setActionText('Bestiário: nova criatura — ' + d.name + '!', '#e0b84a'); } catch (e) {} }
        player.bestiary[key]++;
        try { if (typeof saveDataLogic === 'function') saveDataLogic(); } catch (e) {}
        try { if (window.Sfx) Sfx.play('quest'); } catch (e) {}
    }
    function kills(key) { return (player && player.bestiary && player.bestiary[key]) | 0; }
    function beastList() {
        return Object.keys(npcDB).filter((k) => { const d = npcDB[k]; return d && d.hp > 0 && d.behavior !== 'npc' && d.group !== 'npc'; })
            .sort((a, b) => (npcDB[a].hp || 0) - (npcDB[b].hp || 0));
    }
    function beastProgress() { const l = beastList(); return { seen: l.filter((k) => kills(k) > 0).length, total: l.length }; }

    /* ============================ CASA ============================ */
    const HOUSE_MAX = 32;
    const FURN = {
        bed: { n: 'Cama', c: 120, w: 58, h: 84, t: 'furniture', use: 'Descansar (recupera vida e mana)' },
        table: { n: 'Mesa', c: 60, w: 70, h: 46, t: 'furniture' },
        chair: { n: 'Cadeira', c: 25, w: 28, h: 32, t: 'furniture' },
        shelf: { n: 'Estante', c: 90, w: 76, h: 40, t: 'furniture' },
        rug_red: { n: 'Tapete vermelho', c: 40, w: 110, h: 70, t: 'paint', col: '#8a2b2b' },
        rug_blue: { n: 'Tapete azul', c: 40, w: 110, h: 70, t: 'paint', col: '#2b4a8a' },
        lamp: { n: 'Lampião', c: 35, w: 26, h: 40, t: 'decor', kind: 'lamp' },
        banner: { n: 'Estandarte', c: 50, w: 40, h: 60, t: 'decor', kind: 'banner' },
        statue: { n: 'Estátua', c: 150, w: 50, h: 70, t: 'decor', kind: 'statue' },
        flowers: { n: 'Flores', c: 20, w: 34, h: 30, t: 'decor', kind: 'flowers' },
        bush: { n: 'Arbusto', c: 20, w: 40, h: 36, t: 'decor', kind: 'bush' },
        barrel: { n: 'Barril', c: 30, w: 30, h: 36, t: 'decor', kind: 'barrel' },
        crystal: { n: 'Cristal', c: 200, w: 34, h: 44, t: 'decor', kind: 'crystal' },
        bank: { n: 'Baú do Banco', c: 800, w: 80, h: 48, t: 'bank', use: 'Guarda itens como no banco' },
        furnace: { n: 'Fornalha', c: 300, w: 48, h: 72, t: 'furnace' },
        anvil: { n: 'Bigorna', c: 200, w: 46, h: 39, t: 'anvil' },
        cauldron: { n: 'Caldeirão', c: 400, w: 44, h: 44, t: 'cauldron' },
        enchant_table: { n: 'Mesa de Encantamento', c: 600, w: 54, h: 46, t: 'enchant_table' },
        trophy_dragon: { n: 'Troféu de Dragão', c: 0, w: 60, h: 50, t: 'furniture', need: 'dragon_boss', needTxt: 'Derrote o Dragão Ancestral' },
        trophy_lich: { n: 'Troféu do Lich', c: 0, w: 50, h: 56, t: 'furniture', need: 'lich_boss', needTxt: 'Derrote o Lich Rei' }
    };
    const fixedMk = (m, k) => { if (!m.c5 || typeof m.c5 !== 'object') m.c5 = {}; if (m.c5[k]) return false; m.c5[k] = true; if (window.Content && Content.mark) Content.mark(); return true; };

    let hctx = null;   // casa em que o jogador está: { owner, items }
    const me = () => { try { return currentUser; } catch (e) { return ''; } };
    const isMine = () => !hctx || hctx.owner === me();
    function houseData() { if (!player.house || !Array.isArray(player.house.items)) player.house = { items: [] }; return player.house; }
    function furnEntity(it, i) {
        const f = FURN[it.k]; if (!f) return null;
        const o = { id: 'hf_' + i + '_' + it.k, hf: true, active: true, x: it.x, y: it.y, w: f.w, h: f.h, name: f.n, kind: it.k };
        o.type = f.t;
        if (f.t === 'paint') o.color = f.col;
        else if (f.t === 'decor') { o.kind = f.kind; o.name = f.n; }
        if (f.t === 'furniture') o.fk = it.k;
        return o;
    }
    // reconstrói as peças da casa (só as do jogador local) dentro do mapa 'casa'
    function refreshHouse() {
        const m = gameMaps && gameMaps.casa; if (!m) return;
        m.entities = (m.entities || []).filter((o) => o && !o.hf);
        const items = (hctx && hctx.owner !== me()) ? hctx.items : houseData().items;
        items.forEach((it, i) => { const e = furnEntity(it, i); if (e) m.entities.push(e); });
    }
    function inHouseBounds(m, x, y, w, h) { return x > 60 && y > 60 && x + w < (m.width || 900) - 60 && y + h < (m.height || 640) - 90; }
    function buyFurn(k) {
        const f = FURN[k]; const m = gameMaps.casa; if (!f || !m || currentMap !== 'casa' || !isMine()) return;
        const h = houseData(); if (h.items.length >= HOUSE_MAX) { setActionText('A casa está cheia (máx. ' + HOUSE_MAX + ' peças).', '#e74c3c'); return; }
        if (f.need && kills(f.need) < 1) { setActionText(f.needTxt + ' para ganhar este troféu.', '#e74c3c'); return; }
        if (f.c > 0 && getInvCount('Coins') < f.c) { setActionText('Faltam moedas (' + f.c + ').', '#e74c3c'); return; }
        const fx = (player.facing && player.facing.x) || 0, fy = (player.facing && player.facing.y) || 1;
        let px = Math.round(player.x + fx * 60 - f.w / 2), py = Math.round(player.y + fy * 60 - f.h / 2);
        const free = (ax, ay) => inHouseBounds(m, ax, ay, f.w, f.h) && !m.entities.some((o) => o && o.active !== false && o.hf && o.type !== 'paint' && f.t !== 'paint' && ax - 4 < o.x + (o.w || 30) && ax + f.w + 4 > o.x && ay - 4 < o.y + (o.h || 30) && ay + f.h + 4 > o.y);
        let pos = null;
        if (free(px, py)) pos = { x: px, y: py };
        else for (let r = 24; r < 300 && !pos; r += 24) for (let a = 0; a < 16; a++) { const ax = Math.round(px + Math.cos(a / 16 * 6.283) * r), ay = Math.round(py + Math.sin(a / 16 * 6.283) * r); if (free(ax, ay)) { pos = { x: ax, y: ay }; break; } }
        if (!pos) { setActionText('Não há espaço livre aqui.', '#e74c3c'); return; }
        if (f.c > 0 && !removeInvItem('Coins', f.c)) return;
        h.items.push({ k, x: pos.x, y: pos.y });
        refreshHouse(); setActionText(f.n + ' colocado(a).', '#2ecc71'); try { updateUI(); saveDataLogic(); } catch (e) {}
        openDecor();
    }
    function removeFurn(i) {
        const h = houseData(); const it = h.items[i]; if (!it) return; const f = FURN[it.k];
        h.items.splice(i, 1);
        if (f && f.c > 0) { const back = Math.floor(f.c * 0.8); if (back > 0) addInvItem('Coins', back); }
        refreshHouse(); setActionText((f ? f.n : 'Peça') + ' removido(a)' + (f && f.c > 0 ? ' (devolveu 80%).' : '.'), '#f1c40f'); try { updateUI(); saveDataLogic(); } catch (e) {}
        openDecor();
    }
    function openDecor() {
        if (currentMap !== 'casa' || !isMine()) { setActionText('Você só decora dentro da sua casa.', '#e74c3c'); return; }
        const h = houseData();
        const coins = getInvCount('Coins');
        let html = `<h3 style="margin:0 0 6px">Decorar a casa <small style="opacity:.7">(${h.items.length}/${HOUSE_MAX} peças · ${coins} moedas)</small></h3><p style="margin:0 0 8px;font-size:.78rem;opacity:.85">A peça aparece à sua frente. Fique de frente para o lugar desejado.</p><div style="max-height:46vh;overflow:auto"><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px">`;
        Object.keys(FURN).forEach((k) => {
            const f = FURN[k]; const lock = f.need && kills(f.need) < 1; const poor = f.c > coins;
            html += `<button class="dev-btn" data-buy="${k}" ${lock || poor ? 'disabled' : ''} style="text-align:left;padding:6px 8px;background:#3a2a18;color:#f0e2bd;border:1px solid #8a6a2a;border-radius:6px;opacity:${lock || poor ? .5 : 1}"><b>${esc(f.n)}</b><br><small>${lock ? esc(f.needTxt) : (f.c > 0 ? f.c + ' moedas' : 'grátis')}${f.use ? ' · ' + esc(f.use) : ''}</small></button>`;
        });
        html += `</div>`;
        if (h.items.length) {
            html += `<h4 style="margin:10px 0 4px">Peças na casa</h4><div style="display:flex;flex-wrap:wrap;gap:4px">` + h.items.map((it, i) => `<button class="dev-btn" data-rm="${i}" style="padding:3px 7px;font-size:.75rem;background:#4a2a20;color:#f0e2bd;border:1px solid #8a4a3a;border-radius:6px">✕ ${esc((FURN[it.k] || {}).n || it.k)}</button>`).join('') + `</div>`;
        }
        const gl = houseData().guests || [];
        html += `<h4 style="margin:10px 0 4px">Visitantes autorizados</h4><div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:5px">` + (gl.length ? gl.map((g, i) => `<button class="dev-btn" data-gd="${i}" style="padding:3px 7px;font-size:.75rem;background:#2a3a4a;color:#f0e2bd;border:1px solid #4a7a9a;border-radius:6px">✕ ${esc(g)}</button>`).join('') : '<small style="opacity:.7">Só você entra. Adicione nomes de jogadores.</small>') + `</div><div style="display:flex;gap:4px"><input id="gst-name" class="dev-input" maxlength="30" placeholder="Nome do jogador" style="flex:1"><button class="dev-btn" data-ga="1" style="background:#2a5a3a;color:#f0e2bd;border:1px solid #4a9a6a;border-radius:6px;padding:4px 10px">Convidar</button></div>`;
        html += `</div><div style="margin-top:8px;text-align:right"><button class="dev-btn" onclick="closeModal()" style="background:#3a2a18;color:#f0e2bd;border:1px solid #8a6a2a;border-radius:6px;padding:4px 14px">Fechar</button></div>`;
        openModal(html);
        const box = $('custom-modal-box'); if (!box) return;
        box.onclick = (ev) => { const b = ev.target.closest('[data-buy]'); if (b && !b.disabled) { buyFurn(b.dataset.buy); return; } const r = ev.target.closest('[data-rm]'); if (r) { removeFurn(parseInt(r.dataset.rm)); return; }
            const gd = ev.target.closest('[data-gd]'); if (gd) { const l = (houseData().guests || []).slice(); l.splice(parseInt(gd.dataset.gd), 1); setGuests(l); return; }
            if (ev.target.closest('[data-ga]')) { const inp = $('gst-name'); const n = inp && inp.value.trim(); if (n) setGuests((houseData().guests || []).concat([n])); } };
    }
    async function setGuests(list) {
        try {
            const r = await api('/house', { a: 'guests', list });
            if (r && r.ok) { houseData().guests = r.guests; try { saveDataLogic(); } catch (e) {} const asked = list.length, got = r.guests.length; if (got < asked) setActionText('Alguns nomes não existem e foram ignorados.', '#f1c40f'); }
            else setActionText((r && r.error) || 'Não foi possível salvar os convidados.', '#e74c3c');
        } catch (e) { setActionText('Sem conexão. Tente novamente em instantes.', '#e74c3c'); }
        openDecor();
    }
    async function enterHouse(door) {
        if (!gameMaps.casa) { setActionText('Esta casa ainda não está pronta. Tente novamente mais tarde.', '#e74c3c'); return; }
        if (!door || !door.owner) { setActionText('Esta casa ainda não tem morador.', '#f1c40f'); return; }
        let r;
        try { r = await api('/house', { a: 'enter', owner: door.owner }); } catch (e) { r = null; }
        if (!r || !r.ok) { setActionText((r && r.error) || 'Não foi possível entrar agora.', '#e74c3c'); return; }
        hctx = { owner: r.owner, items: r.items || [] };
        if (r.owner === me()) { const h = houseData(); if (r.guests) h.guests = r.guests; }
        const ex = gameMaps.casa.entities.find((o) => o && o.type === 'portal');
        if (ex) { ex.destMap = currentMap; ex.destX = door.x + Math.round((door.w || 60) / 2) - 12; ex.destY = door.y + (door.h || 80) + 26; }
        refreshHouse();
        const m = gameMaps.casa; switchMap('casa', Math.round((m.width || 900) / 2) - 12, (m.height || 640) - 150);
        setActionText(r.owner === me() ? 'Casa, doce casa. Use o botão Decorar.' : 'Casa de ' + r.owner, '#2ecc71');
    }
    function useFurniture(t) {
        if (t.fk === 'bed') {
            player.stats.hp = player.stats.maxHp; player.stats.mp = player.stats.maxMp;
            setActionText('Você descansou. Vida e mana restauradas.', '#2ecc71'); try { addFloatingText && addFloatingText(player.x, player.y - 30, 'Descansado', '#7aa8ff'); updateUI(); } catch (e) {}
            return true;
        }
        if (t.fk === 'trophy_dragon' || t.fk === 'trophy_lich') { setActionText('Um troféu conquistado com suor e coragem.', '#e0b84a'); return true; }
        if (t.fk === 'shelf') { const p = beastProgress(); setActionText('Bestiário: ' + p.seen + '/' + p.total + ' criaturas descobertas.', '#e0b84a'); return true; }
        return true;
    }

    /* ============================ MAPAS NOVOS ============================ */
    function paint(id, color, x, y, w, h) { return { id, type: 'paint', name: 'Chão', color, x, y, w, h, active: true }; }
    function buildHouseShell() {
        return { id: 'casa', name: 'Casa do Aventureiro', catalogV: 2, isHome: true, width: 900, height: 640, color: '#2a1d12', gridX: null, gridY: null, spawn: { x: 438, y: 490 }, entities: [
            paint('c5_floor', '#8a6236', 60, 60, 780, 500), paint('c5_edge_t', '#5a3d1e', 40, 40, 820, 20), paint('c5_edge_b', '#5a3d1e', 40, 560, 820, 20), paint('c5_edge_l', '#5a3d1e', 40, 40, 20, 540), paint('c5_edge_r', '#5a3d1e', 840, 40, 20, 540),
            { id: 'c5_exit', type: 'portal', name: 'Sair da casa', x: 420, y: 560, w: 60, h: 60, active: true, destMap: 'lumbridge', destX: 1000, destY: 800 }
        ] };
    }
    function buildCatacombs() {
        const E = []; let n = 0; const id = () => 'c5_' + (n++);
        const CD = (window.CATALOG && CATALOG.DECOR) || {}; const DS = window.SCALE_DECOR || 1.3;
        const D = (kind, x, y) => ({ id: id(), type: 'decor', kind, name: CD[kind] ? CD[kind].name : kind, x, y, w: Math.round((CD[kind] ? CD[kind].w : 30) * DS), h: Math.round((CD[kind] ? CD[kind].h : 30) * DS), active: true });
        const mob = (key, x, y) => { const d = npcDB[key] || CREATURES[key]; return { id: id(), type: 'enemy', dbKey: key, name: d.name, x, y, w: d.w || 30, h: d.h || 30, hp: d.hp, maxHp: d.hp, attackCooldown: 0, active: true }; };
        const W = 1600, H = 1200;
        // salões e corredores
        E.push(paint('c5_hall0', '#34343f', 500, 860, 600, 260), paint('c5_cor0', '#2c2c36', 740, 560, 120, 320), paint('c5_hall1', '#34343f', 460, 460, 680, 180),
            paint('c5_west', '#30303a', 120, 460, 360, 340), paint('c5_east', '#30303a', 1120, 460, 360, 340), paint('c5_corW', '#2c2c36', 300, 800, 220, 100), paint('c5_corE', '#2c2c36', 1080, 800, 220, 100),
            paint('c5_cor1', '#2c2c36', 740, 300, 120, 180), paint('c5_boss', '#3c2f4c', 460, 60, 680, 260), paint('c5_altar', '#241a33', 690, 100, 220, 90));
        // paredes/decoração
        [[500, 870], [1040, 870], [500, 1080], [1040, 1080], [480, 470], [1080, 470], [480, 590], [1080, 590]].forEach((p) => E.push(D('gravestone', p[0], p[1])));
        [[200, 480], [360, 700], [1240, 480], [1360, 700], [640, 900], [940, 900]].forEach((p) => E.push(D('bones', p[0], p[1])));
        [[130, 470], [430, 470], [1130, 470], [1430, 470], [470, 70], [1080, 70], [700, 1090], [880, 1090]].forEach((p) => E.push(D('crystal', p[0], p[1])));
        [[520, 80], [1030, 80], [670, 290], [900, 290]].forEach((p) => E.push(D('statue', p[0], p[1])));
        [[470, 60], [1090, 60], [650, 60], [930, 60]].forEach((p) => E.push(D('banner', p[0], p[1])));
        // criaturas
        E.push(mob('skeleton_base', 560, 950), mob('skeleton_base', 980, 950), mob('bat_base', 700, 1000), mob('bat_base', 850, 900),
            mob('skeleton_knight', 640, 520), mob('skeleton_knight', 900, 520), mob('ghost_base', 200, 560), mob('ghost_base', 330, 690), mob('skeleton_knight', 250, 620),
            mob('ghost_base', 1300, 560), mob('ghost_base', 1200, 690), mob('darkmage_base', 1330, 620), mob('skeleton_knight', 1240, 560), mob('skeleton_knight', 780, 250),
            mob('skeleton_knight', 560, 200), mob('skeleton_knight', 1000, 200), mob('lich_boss', 740, 110));
        E.push({ id: 'c5_gi0', type: 'ground_item', item: 'Coins', qty: 120, x: 180, y: 700, w: 20, h: 20, life: 999999, active: true }, { id: 'c5_gi1', type: 'ground_item', item: 'Health Potion', qty: 2, x: 1420, y: 700, w: 20, h: 20, life: 999999, active: true });
        E.push({ id: 'c5_exit', type: 'portal', name: 'Saída das Catacumbas', x: 770, y: 1110, w: 60, h: 60, active: true, destMap: 'covil', destX: 1500, destY: 900 });
        return { id: 'catacumbas', name: 'Catacumbas Esquecidas', catalogV: 2, width: W, height: H, color: '#1a1a22', gridX: null, gridY: null, spawn: { x: 780, y: 1040 }, entities: E };
    }
    function findSpot(m, x, y, w, h) {
        const solid = (m.entities || []).filter((o) => o && o.active !== false && !(window.Content && Content.NONSOLID || []).includes(o.type) && o.type !== 'paint' && o.type !== 'portal');
        const free = (px, py) => px > 40 && py > 40 && px + w < (m.width || 800) - 40 && py + h < (m.height || 600) - 40 && !solid.some((o) => { const ow = o.w || 30, oh = o.h || 30; return px - 8 < o.x + ow && px + w + 8 > o.x && py - 8 < o.y + oh && py + h + 8 > o.y; });
        if (free(x, y)) return { x, y };
        for (let r = 24; r < 600; r += 24) for (let a = 0; a < 20; a++) { const px = Math.round(x + Math.cos(a / 20 * 6.283) * r), py = Math.round(y + Math.sin(a / 20 * 6.283) * r); if (free(px, py)) return { x: px, y: py }; }
        return null;
    }
    // só o admin cria mapas novos (o servidor só passa a conhecê-los quando o admin salva o mundo)
    function placeInWorld(maps) {
        if (!maps || typeof maps !== 'object') return;
        try { if (userRole !== 'admin') return; } catch (e) { return; }
        const lb = maps.lumbridge; if (!lb) return;
        if (!maps.casa) { maps.casa = buildHouseShell(); if (window.Content && Content.mark) Content.mark(); }
        if (!maps.catacumbas && npcDB.lich_boss) { maps.catacumbas = buildCatacombs(); if (window.Content && Content.mark) Content.mark(); }
        if (fixedMk(lb, 'housedoor_rm') && lb.entities) lb.entities = lb.entities.filter((o) => !(o && o.id === 'c5_door'));   // a casa agora é colocada pelo Dev, com dono
        const cv = maps.covil;
        if (cv && maps.catacumbas && fixedMk(cv, 'cataportal')) {
            const p = findSpot(cv, 1560, 880, 60, 60);
            if (p) { (cv.entities = cv.entities || []).push({ id: 'c5_cata_in', type: 'portal', name: 'Entrada das Catacumbas', x: p.x, y: p.y, w: 60, h: 60, active: true, destMap: 'catacumbas', destX: 780, destY: 1040 }); const ex = maps.catacumbas.entities.find((o) => o.id === 'c5_exit'); if (ex) { ex.destX = p.x; ex.destY = p.y + 90; } }
            else delete cv.c5.cataportal;
        }
        try { if (window.Maps2) window.Maps2.place(maps); } catch (e) { console.error(e); }   // maps2.js: 26 mapas novos + portais
        try { if (window.Edges) window.Edges.migrate(maps); } catch (e) { console.error(e); }   // edges.js: bordas naturais, entradas de masmorra e tochas (idempotente)
    }
    function merge() {
        Object.keys(ITEMS).forEach((k) => { if (!itemDB[k]) itemDB[k] = Object.assign({}, ITEMS[k]); });
        Object.keys(CREATURES).forEach((k) => { const cur = npcDB[k]; if (!cur || !cur.species) npcDB[k] = Object.assign({}, CREATURES[k]); });
        try { if (currentMap === 'casa') refreshHouse(); } catch (e) {}
    }

    /* ============================ DESENHO ============================ */
    function drawEntity(ctx, o, T) {
        const x = o.x, y = o.y, w = o.w || 40, h = o.h || 40, t = o.type;
        const shadow = () => { ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h, w * .52, 5, 0, 0, 6.3); ctx.fill(); };
        ctx.lineWidth = 2; ctx.strokeStyle = '#1c120a';
        if (t === 'house_door') {
            // porta invisível sobre a porta do prédio: só aparece no modo Dev, ou como plaquinha quando o jogador chega perto
            let dev = false; try { dev = !!isDevBuildMode; } catch (e) {}
            const near = Math.hypot(player.x - (x + w / 2), player.y - (y + h / 2)) < 90;
            if (dev) { ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h); ctx.restore(); }
            if (dev || near) {
                const txt = '\u{1F3E0} ' + (o.owner ? 'Casa de ' + o.owner : 'Porta sem dono');
                ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; const tw = ctx.measureText(txt).width + 12;
                ctx.fillStyle = 'rgba(20,12,6,.78)'; ctx.fillRect(x + w / 2 - tw / 2, y - 22, tw, 16);
                ctx.fillStyle = o.owner ? '#f0e2bd' : '#f1c40f'; ctx.fillText(txt, x + w / 2, y - 10); ctx.textAlign = 'left';
            }
            return;
        }
        const k = o.fk;
        shadow();
        if (k === 'bed') {
            ctx.fillStyle = '#5a3a1a'; ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = '#c9b48a'; ctx.fillRect(x + 4, y + 6, w - 8, h - 12);
            ctx.fillStyle = '#b03a3a'; ctx.fillRect(x + 4, y + h * .38, w - 8, h * .58); ctx.strokeRect(x + 4, y + h * .38, w - 8, h * .58);
            ctx.fillStyle = '#f2ead2'; ctx.fillRect(x + 8, y + 9, w - 16, 16); ctx.strokeRect(x + 8, y + 9, w - 16, 16);
        } else if (k === 'table') {
            ctx.fillStyle = '#6b4a2b'; ctx.fillRect(x + 4, y + h * .55, 6, h * .45); ctx.fillRect(x + w - 10, y + h * .55, 6, h * .45);
            ctx.fillStyle = '#8b6238'; ctx.fillRect(x, y, w, h * .62); ctx.strokeRect(x, y, w, h * .62);
            ctx.fillStyle = '#e8d29a'; ctx.beginPath(); ctx.arc(x + w * .3, y + h * .3, 5, 0, 6.3); ctx.fill(); ctx.fillStyle = '#c04a3a'; ctx.fillRect(x + w * .6, y + h * .2, 10, 10);
        } else if (k === 'chair') {
            ctx.fillStyle = '#6b4a2b'; ctx.fillRect(x + 3, y, w - 6, h * .45); ctx.strokeRect(x + 3, y, w - 6, h * .45); ctx.fillStyle = '#8b6238'; ctx.fillRect(x, y + h * .45, w, h * .3); ctx.strokeRect(x, y + h * .45, w, h * .3); ctx.fillRect(x + 2, y + h * .75, 4, h * .25); ctx.fillRect(x + w - 6, y + h * .75, 4, h * .25);
        } else if (k === 'shelf') {
            ctx.fillStyle = '#5a3a1a'; ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
            for (let r = 0; r < 2; r++) { const yy = y + 4 + r * (h / 2 - 2); ctx.fillStyle = '#3a2410'; ctx.fillRect(x + 3, yy + h / 2 - 8, w - 6, 3); for (let i = 0; i < 7; i++) { ctx.fillStyle = ['#a24a34', '#3f6aa8', '#3f8a4a', '#c9a24a', '#7a4aa8'][(i + r * 2) % 5]; ctx.fillRect(x + 5 + i * ((w - 10) / 7), yy + (i % 3), (w - 10) / 7 - 2, h / 2 - 10 - (i % 3)); } }
        } else if (k === 'trophy_dragon') {
            ctx.fillStyle = '#5a3a1a'; ctx.fillRect(x + w * .25, y + h * .55, w * .5, h * .45); ctx.strokeRect(x + w * .25, y + h * .55, w * .5, h * .45);
            ctx.fillStyle = '#9c1c1c'; ctx.beginPath(); ctx.moveTo(x + w * .15, y + h * .55); ctx.lineTo(x + w * .3, y + h * .1); ctx.lineTo(x + w * .5, y + h * .3); ctx.lineTo(x + w * .7, y + h * .1); ctx.lineTo(x + w * .85, y + h * .55); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#f3a33a'; ctx.beginPath(); ctx.arc(x + w * .4, y + h * .38, 2.5, 0, 6.3); ctx.arc(x + w * .6, y + h * .38, 2.5, 0, 6.3); ctx.fill();
        } else if (k === 'trophy_lich') {
            ctx.fillStyle = '#3a2a5a'; ctx.fillRect(x + w * .2, y + h * .6, w * .6, h * .4); ctx.strokeRect(x + w * .2, y + h * .6, w * .6, h * .4);
            ctx.fillStyle = '#e8e2cf'; ctx.beginPath(); ctx.arc(x + w / 2, y + h * .38, w * .28, 0, 6.3); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#12301f'; ctx.fillRect(x + w * .36, y + h * .32, 5, 7); ctx.fillRect(x + w * .58, y + h * .32, 5, 7);
            ctx.fillStyle = '#e0b84a'; ctx.beginPath(); ctx.moveTo(x + w * .2, y + h * .2); ctx.lineTo(x + w * .3, y + h * .02); ctx.lineTo(x + w * .5, y + h * .16); ctx.lineTo(x + w * .7, y + h * .02); ctx.lineTo(x + w * .8, y + h * .2); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = 'rgba(93,255,176,' + (0.35 + 0.25 * Math.sin(T * 3)).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(x + w / 2, y + h * .38, w * .4, 0, 6.3); ctx.fill();
        } else { ctx.fillStyle = 'rgba(200,200,200,.5)'; ctx.fillRect(x, y, w, h); }
    }

    /* ============================ LIGAÇÕES COM O JOGO ============================ */
    function tryInteractHook(t) {
        if (!t || t.active === false) return false;
        if (t.type === 'house_door') { enterHouse(t); return true; }
        if (t.type === 'furniture') return useFurniture(t);
        return false;
    }
    let btn = null;
    function tickBtn() {
        if (!btn) {
            btn = document.createElement('button'); btn.id = 'house-btn'; btn.textContent = 'Decorar casa'; btn.className = 'dev-btn';
            btn.style.cssText = 'position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:60;display:none;padding:6px 14px;font-weight:700;background:linear-gradient(#5a3d1e,#3a2410);color:#f0e2bd;border:2px solid #c9a24a;border-radius:8px;cursor:pointer';
            btn.onclick = openDecor; document.body.appendChild(btn);
        }
        btn.style.display = (typeof currentMap !== 'undefined' && currentMap === 'casa' && isMine()) ? '' : 'none';
    }
    function onLogin() { if (!player.house) player.house = { items: [] }; if (!player.bestiary) player.bestiary = {}; merge(); try { if (player.currentMap === 'casa') refreshHouse(); } catch (e) {} }
    function wire() {
        const oi = window.tryInteract; if (typeof oi === 'function') window.tryInteract = function (t) { if (tryInteractHook(t)) { player.actionAnim = 15; return; } return oi.apply(this, arguments); };
        const od = window.applyDamage; if (typeof od === 'function') window.applyDamage = function (t, dmg, s) { const was = t && t.type === 'enemy' && t.active !== false && t.hp > 0; const r = od.apply(this, arguments); try { if (was && t.hp <= 0) record(t.dbKey); } catch (e) {} return r; };
        setInterval(tickBtn, 400);
    }
    window.addEventListener('load', wire);
    window.World2 = { houseKey: () => (hctx && hctx.owner ? 'casa_' + String(hctx.owner).toLowerCase().replace(/[^\w\-]/g, '_').slice(0, 34) : null), ITEMS, CREATURES, FURN, HOUSE_MAX, record, kills, beastList, beastProgress, placeInWorld, merge, drawEntity, enterHouse, openDecor, buyFurn, removeFurn, refreshHouse, onLogin, buildCatacombs, buildHouseShell };
})();
