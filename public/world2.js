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

    /* ============================ CASA ============================
       Cada casa é um espaço único por dono: o jogador sincroniza no mapa "casa_<dono>" (World2.houseKey), então dois donos nunca se cruzam.
       Editor: painel + pré-visualização (fantasma) que segue o mouse, girar com R, clicar para colocar, clicar numa peça para pegar. Móveis comprados vão para o ESTOQUE da casa. */
    const HOUSE_MAX = 60;
    const FURN = {
        bed: { n: 'Cama', c: 120, w: 58, h: 84, t: 'furniture', cat: 'Móveis', rot: 1, use: 'Descansar (recupera vida e mana)' },
        table: { n: 'Mesa', c: 60, w: 70, h: 46, t: 'furniture', cat: 'Móveis', rot: 1 },
        chair: { n: 'Cadeira', c: 25, w: 28, h: 32, t: 'furniture', cat: 'Móveis', rot: 1 },
        shelf: { n: 'Estante', c: 90, w: 76, h: 40, t: 'furniture', cat: 'Móveis', rot: 1 },
        rug_red: { n: 'Tapete vermelho', c: 40, w: 110, h: 70, t: 'paint', col: '#8a2b2b', cat: 'Decoração', rot: 1 },
        rug_blue: { n: 'Tapete azul', c: 40, w: 110, h: 70, t: 'paint', col: '#2b4a8a', cat: 'Decoração', rot: 1 },
        lamp: { n: 'Lampião', c: 35, w: 26, h: 40, t: 'decor', kind: 'lamp', cat: 'Decoração' },
        banner: { n: 'Estandarte', c: 50, w: 40, h: 60, t: 'decor', kind: 'banner', cat: 'Decoração' },
        statue: { n: 'Estátua', c: 150, w: 50, h: 70, t: 'decor', kind: 'statue', cat: 'Decoração' },
        flowers: { n: 'Flores', c: 20, w: 34, h: 30, t: 'decor', kind: 'flowers', cat: 'Decoração' },
        bush: { n: 'Arbusto', c: 20, w: 40, h: 36, t: 'decor', kind: 'bush', cat: 'Decoração' },
        barrel: { n: 'Barril', c: 30, w: 30, h: 36, t: 'decor', kind: 'barrel', cat: 'Decoração' },
        crystal: { n: 'Cristal', c: 200, w: 34, h: 44, t: 'decor', kind: 'crystal', cat: 'Decoração' },
        bank: { n: 'Baú do Banco', c: 800, w: 80, h: 48, t: 'bank', cat: 'Estações', use: 'Guarda itens como no banco' },
        furnace: { n: 'Fornalha', c: 300, w: 48, h: 72, t: 'furnace', cat: 'Estações' },
        anvil: { n: 'Bigorna', c: 200, w: 46, h: 39, t: 'anvil', cat: 'Estações' },
        cauldron: { n: 'Caldeirão', c: 400, w: 44, h: 44, t: 'cauldron', cat: 'Estações' },
        enchant_table: { n: 'Mesa de Encantamento', c: 600, w: 54, h: 46, t: 'enchant_table', cat: 'Estações' },
        dummy: { n: 'Manequim de treino', c: 900, w: 44, h: 72, t: 'furniture', cat: 'Treino', rot: 1, use: 'Treina Combate' },
        archery: { n: 'Alvo de arco', c: 900, w: 56, h: 72, t: 'furniture', cat: 'Treino', rot: 1, use: 'Treina Arco' },
        punchbag: { n: 'Saco de pancada', c: 1100, w: 40, h: 74, t: 'furniture', cat: 'Treino', rot: 1, use: 'Treina Defesa' },
        library: { n: 'Biblioteca de estudos', c: 1600, w: 104, h: 54, t: 'furniture', cat: 'Treino', rot: 1, use: 'Medita e estuda: Magia' },
        hottub: { n: 'Banheira quente', c: 1800, w: 86, h: 66, t: 'furniture', cat: 'Treino', rot: 1, use: 'Relaxa: Vitalidade' },
        trophy_dragon: { n: 'Troféu de Dragão', c: 0, w: 60, h: 50, t: 'furniture', cat: 'Troféus', rot: 1, need: 'dragon_boss', needTxt: 'Derrote o Dragão Ancestral' },
        trophy_lich: { n: 'Troféu do Lich', c: 0, w: 50, h: 56, t: 'furniture', cat: 'Troféus', rot: 1, need: 'lich_boss', needTxt: 'Derrote o Lich Rei' }
    };
    /* móveis de treino: sessões curtas, poucas por dia, XP pequena (bônus de rotina, não um lugar para viver) */
    const TRAIN = {
        dummy: { skill: 'combat', verb: 'Treinando com o manequim', icon: '⚔️' },
        archery: { skill: 'ranged', verb: 'Praticando tiro ao alvo', icon: '🏹' },
        punchbag: { skill: 'defence', verb: 'Treinando resistência', icon: '🛡️' },
        library: { skill: 'magic', verb: 'Estudando na biblioteca', icon: '📖' },
        hottub: { skill: 'hp', verb: 'Relaxando na banheira', icon: '♨️' }
    };
    const TRAIN_SECS = 8, TRAIN_PER_DAY = 6, TRAIN_PCT = 0.015, TRAIN_MIN = 20;   // 8 s por sessão, 6 por dia por móvel, ~1,5% do nível seguinte (mín. 20)
    const fixedMk = (m, k) => { if (!m.c5 || typeof m.c5 !== 'object') m.c5 = {}; if (m.c5[k]) return false; m.c5[k] = true; if (window.Content && Content.mark) Content.mark(); return true; };

    let hctx = null;   // casa em que o jogador está: { owner, items }
    const me = () => { try { return currentUser; } catch (e) { return ''; } };
    const isMine = () => !hctx || hctx.owner === me();
    function houseData() { if (!player.house || !Array.isArray(player.house.items)) player.house = { items: [] }; const h = player.house; if (!h.stock || typeof h.stock !== 'object') h.stock = {}; return h; }
    const sizeOf = (k, r) => { const f = FURN[k]; return (r & 1) ? [f.h, f.w] : [f.w, f.h]; };
    function furnEntity(it, i) {
        const f = FURN[it.k]; if (!f) return null; const r = it.r | 0, sz = sizeOf(it.k, r);
        const o = { id: 'hf_' + i + '_' + it.k, hf: true, hi: i, active: true, x: it.x, y: it.y, w: sz[0], h: sz[1], name: f.n, kind: it.k, rot: r };
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
    function canPlace(k, r, x, y) {
        const m = gameMaps.casa, f = FURN[k]; if (!m || !f) return false; const sz = sizeOf(k, r);
        if (!inHouseBounds(m, x, y, sz[0], sz[1])) return false;
        if (f.t === 'paint') return true;
        return !m.entities.some((o) => o && o.active !== false && o.hf && o.type !== 'paint' && x - 2 < o.x + (o.w || 30) && x + sz[0] + 2 > o.x && y - 2 < o.y + (o.h || 30) && y + sz[1] + 2 > o.y);
    }

    /* ---------- editor ---------- */
    const ed = { on: false, tab: 'loja', held: null, ghost: { x: 0, y: 0 }, ok: false, el: null, saveT: 0 };
    const stockOf = (k) => (houseData().stock[k] | 0);
    const saveSoon = () => { clearTimeout(ed.saveT); ed.saveT = setTimeout(() => { try { saveDataLogic(); } catch (e) { } }, 800); };
    function css() {
        if ($('house-ed-css')) return; const s = document.createElement('style'); s.id = 'house-ed-css';
        s.textContent = '#house-ed{position:fixed;right:8px;top:56px;bottom:64px;width:min(300px,46vw);z-index:70;display:none;flex-direction:column;background:linear-gradient(#2a1d12,#1c130b);border:2px solid #c9a24a;border-radius:10px;color:#f0e2bd;font:13px/1.35 sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.6)}' +
            '#house-ed .he-h{display:flex;align-items:center;gap:6px;padding:7px 9px;border-bottom:1px solid #6a4a22}#house-ed .he-h b{flex:1;font-size:14px}#house-ed .he-x{background:#4a2a20;border:1px solid #8a4a3a;color:#f0e2bd;border-radius:6px;padding:2px 8px;cursor:pointer}' +
            '#house-ed .he-t{display:flex;gap:3px;padding:6px 6px 0}#house-ed .he-t button{flex:1;padding:5px 2px;background:#3a2a18;color:#d8c898;border:1px solid #6a4a22;border-bottom:0;border-radius:6px 6px 0 0;cursor:pointer;font-size:12px}#house-ed .he-t button.on{background:#5a3d1e;color:#fff;border-color:#c9a24a}' +
            '#house-ed .he-b{flex:1;overflow:auto;padding:8px;border-top:1px solid #6a4a22}#house-ed .he-c{margin:8px 0 4px;color:#e0b84a;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.04em}' +
            '#house-ed .he-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:5px}#house-ed .he-i{position:relative;text-align:left;padding:6px 7px;background:#3a2a18;color:#f0e2bd;border:1px solid #8a6a2a;border-radius:7px;cursor:pointer}#house-ed .he-i:hover:not(:disabled){background:#4c3720}#house-ed .he-i:disabled{opacity:.45;cursor:default}#house-ed .he-i small{display:block;opacity:.8;font-size:11px}#house-ed .he-i .n{position:absolute;right:5px;top:3px;background:#c9a24a;color:#2a1d12;border-radius:9px;padding:0 6px;font-weight:700;font-size:11px}' +
            '#house-ed .he-f{padding:7px;border-top:1px solid #6a4a22;display:flex;gap:5px;flex-wrap:wrap;align-items:center;font-size:12px}#house-ed .he-f button{background:#3a2a18;color:#f0e2bd;border:1px solid #8a6a2a;border-radius:6px;padding:4px 9px;cursor:pointer}#house-ed .he-f button.ok{background:#2a5a3a;border-color:#4a9a6a}' +
            '#house-ed .he-r{display:flex;gap:4px;align-items:center;margin:3px 0}#house-ed .he-r span{flex:1}#house-ed .he-r button{background:#4a2a20;color:#f0e2bd;border:1px solid #8a4a3a;border-radius:6px;padding:2px 7px;cursor:pointer;font-size:12px}' +
            '@media(max-width:700px){#house-ed{top:auto;bottom:60px;left:6px;right:6px;width:auto;height:42vh}}';
        document.head.appendChild(s);
    }
    const heldName = () => ed.held ? FURN[ed.held.k].n : '';
    function renderPanel() {
        if (!ed.el) return; const h = houseData(), coins = getInvCount('Coins');
        const tabs = [['loja', 'Loja'], ['estoque', 'Estoque'], ['casa', 'Na casa'], ['visitas', 'Visitas']];
        let body = '';
        if (ed.tab === 'loja' || ed.tab === 'estoque') {
            const cats = {}; Object.keys(FURN).forEach((k) => { const f = FURN[k]; if (ed.tab === 'estoque' && !stockOf(k)) return; (cats[f.cat] = cats[f.cat] || []).push(k); });
            const ks = Object.keys(cats);
            if (!ks.length) body = '<p style="opacity:.75">Nenhum móvel no estoque. Compre na aba <b>Loja</b>.</p>';
            ks.forEach((c) => {
                body += '<div class="he-c">' + esc(c) + '</div><div class="he-g">';
                cats[c].forEach((k) => {
                    const f = FURN[k], lock = f.need && kills(f.need) < 1, st = stockOf(k);
                    if (ed.tab === 'loja') body += '<button class="he-i" data-buy="' + k + '" ' + (lock || (f.c > coins) ? 'disabled' : '') + '>' + (st ? '<span class="n">' + st + '</span>' : '') + '<b>' + esc(f.n) + '</b><small>' + (lock ? esc(f.needTxt) : (f.c > 0 ? f.c + ' moedas' : 'grátis')) + (f.use ? ' · ' + esc(f.use) : '') + '</small></button>';
                    else body += '<button class="he-i" data-hold="' + k + '"><span class="n">' + st + '</span><b>' + esc(f.n) + '</b><small>Clique e mova o mouse</small></button>';
                });
                body += '</div>';
            });
        } else if (ed.tab === 'casa') {
            body = h.items.length ? h.items.map((it, i) => '<div class="he-r"><span>' + esc((FURN[it.k] || {}).n || it.k) + '</span><button data-pick="' + i + '">Mover</button><button data-store="' + i + '">Guardar</button></div>').join('') : '<p style="opacity:.75">A casa está vazia.</p>';
        } else {
            const gl = h.guests || [];
            body = '<div class="he-c">Visitantes autorizados</div>' + (gl.length ? gl.map((g, i) => '<div class="he-r"><span>' + esc(g) + '</span><button data-gd="' + i + '">Remover</button></div>').join('') : '<p style="opacity:.75">Só você entra. Convide jogadores pelo nome.</p>') + '<div style="display:flex;gap:4px;margin-top:6px"><input id="gst-name" maxlength="20" placeholder="Nome do jogador" style="flex:1;background:#1c130b;color:#f0e2bd;border:1px solid #6a4a22;border-radius:6px;padding:4px 6px"><button class="he-i" style="padding:4px 10px" data-ga="1">Convidar</button></div>';
        }
        const sel = ed.held ? '<b>' + esc(heldName()) + '</b> — clique para colocar · <b>R</b> gira · <b>Esc</b> cancela' : 'Escolha um móvel ou clique numa peça da casa para mover.';
        ed.el.innerHTML = '<div class="he-h"><b>🏠 Decorar</b><span style="opacity:.8">' + h.items.length + '/' + HOUSE_MAX + ' · ' + coins + ' 🪙</span><button class="he-x" data-close="1">✕</button></div><div class="he-t">' + tabs.map((t) => '<button data-tab="' + t[0] + '" class="' + (ed.tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>').join('') + '</div><div class="he-b">' + body + '</div><div class="he-f"><span style="flex:1">' + sel + '</span>' + (ed.held ? '<button data-rot="1">↻ Girar</button><button class="ok" data-place="1">✓ Colocar</button><button data-cancel="1">✕</button>' : '') + '</div>';
    }
    function buy(k) {
        const f = FURN[k], h = houseData(); if (!f) return;
        if (f.need && kills(f.need) < 1) { setActionText(f.needTxt + ' para ganhar este troféu.', '#e74c3c'); return; }
        if (f.c > 0 && getInvCount('Coins') < f.c) { setActionText('Faltam moedas (' + f.c + ').', '#e74c3c'); return; }
        if (stockOf(k) >= 20) { setActionText('Estoque cheio para este móvel.', '#e74c3c'); return; }
        if (f.c > 0 && !removeInvItem('Coins', f.c)) return;
        h.stock[k] = stockOf(k) + 1; setActionText(f.n + ' comprado(a): está no Estoque.', '#2ecc71'); try { updateUI(); } catch (e) { } saveSoon();
        hold(k); renderPanel();   // já segura para colocar
    }
    function hold(k, from, r) {
        if (!FURN[k]) return; ed.held = { k, r: r | 0, from: from === undefined ? null : from }; ed.tab = ed.tab === 'loja' ? 'estoque' : ed.tab;
        const sz = sizeOf(k, ed.held.r); ed.ghost = { x: Math.round(player.x - sz[0] / 2), y: Math.round(player.y - sz[1] / 2 + 50) }; checkGhost();
    }
    function checkGhost() { if (!ed.held) { ed.ok = false; return; } ed.ok = canPlace(ed.held.k, ed.held.r, ed.ghost.x, ed.ghost.y); }
    function cancelHeld() {
        if (!ed.held) return; const h = ed.held;
        if (h.from !== null && h.orig) { houseData().items.splice(Math.min(h.from, houseData().items.length), 0, h.orig); refreshHouse(); saveSoon(); }   // devolve a peça ao lugar de origem
        ed.held = null; renderPanel();
    }
    function placeHeld() {
        if (!ed.held) return; checkGhost(); if (!ed.ok) { setActionText('Aqui não cabe.', '#e74c3c'); return; }
        const h = houseData(), k = ed.held.k;
        if (h.items.length >= HOUSE_MAX) { setActionText('A casa está cheia (máx. ' + HOUSE_MAX + ' peças).', '#e74c3c'); return; }
        if (ed.held.from === null) { if (stockOf(k) < 1) { ed.held = null; renderPanel(); return; } h.stock[k] = stockOf(k) - 1; if (h.stock[k] <= 0) delete h.stock[k]; }
        h.items.push({ k, x: ed.ghost.x, y: ed.ghost.y, r: ed.held.r });
        refreshHouse(); try { if (window.Sfx) Sfx.play('quest'); } catch (e) { } saveSoon();
        const again = ed.held.from === null && stockOf(k) > 0; ed.held = null; if (again) hold(k); renderPanel();
    }
    function pickPlaced(i) {
        const h = houseData(), it = h.items[i]; if (!it) return; if (ed.held) cancelHeld();
        h.items.splice(i, 1); refreshHouse(); hold(it.k, i, it.r); ed.held.orig = it; const sz = sizeOf(it.k, it.r); ed.ghost = { x: it.x, y: it.y }; checkGhost(); renderPanel();
    }
    function storePlaced(i) {
        const h = houseData(), it = h.items[i]; if (!it) return; h.items.splice(i, 1); h.stock[it.k] = stockOf(it.k) + 1; refreshHouse(); saveSoon(); renderPanel();
    }
    function storeHeld() { if (!ed.held) return; const k = ed.held.k; if (ed.held.from !== null) { const h = houseData(); h.stock[k] = stockOf(k) + 1; ed.held = null; saveSoon(); renderPanel(); } else cancelHeld(); }
    function rotateHeld(d) { if (!ed.held || !FURN[ed.held.k].rot) return; ed.held.r = (ed.held.r + (d || 1) + 4) & 3; const sz = sizeOf(ed.held.k, ed.held.r); checkGhost(); renderPanel(); }
    function openDecor() {
        if (currentMap !== 'casa' || !isMine()) { setActionText('Você só decora dentro da sua casa.', '#e74c3c'); return; }
        css(); if (!ed.el) { ed.el = document.createElement('div'); ed.el.id = 'house-ed'; document.body.appendChild(ed.el); wireEditor(); }
        try { closeModal(); } catch (e) { }
        ed.on = true; ed.el.style.display = 'flex'; ed.tab = Object.keys(houseData().stock).length ? 'estoque' : 'loja'; renderPanel();
    }
    function closeDecor() { if (ed.held) cancelHeld(); ed.on = false; ed.held = null; if (ed.el) ed.el.style.display = 'none'; try { saveDataLogic(); } catch (e) { } }
    function wireEditor() {
        ed.el.addEventListener('click', (ev) => {
            const t = ev.target.closest('button'); if (!t) return; const d = t.dataset;
            if (d.close) closeDecor(); else if (d.tab) { ed.tab = d.tab; renderPanel(); } else if (d.buy) buy(d.buy); else if (d.hold) { hold(d.hold); renderPanel(); }
            else if (d.pick !== undefined) pickPlaced(+d.pick); else if (d.store !== undefined) storePlaced(+d.store); else if (d.rot) rotateHeld(1); else if (d.place) placeHeld(); else if (d.cancel) cancelHeld();
            else if (d.gd !== undefined) { const l = (houseData().guests || []).slice(); l.splice(+d.gd, 1); setGuests(l); } else if (d.ga) { const inp = $('gst-name'), n = inp && inp.value.trim(); if (n) setGuests((houseData().guests || []).concat([n])); }
        });
        const cv = $('gameCanvas') || document.querySelector('canvas'); const at = (e) => { try { return getCoords(e); } catch (er) { return null; } };
        const move = (e) => { if (!ed.on || !ed.held) return; const p = at(e); if (!p) return; const sz = sizeOf(ed.held.k, ed.held.r); ed.ghost = { x: Math.round((p.x - sz[0] / 2) / 8) * 8, y: Math.round((p.y - sz[1] / 2) / 8) * 8 }; checkGhost(); };
        cv.addEventListener('mousemove', move);
        cv.addEventListener('mousedown', (e) => {
            if (!ed.on) return; e.stopImmediatePropagation(); e.preventDefault();
            if (e.button === 2) { if (ed.held) cancelHeld(); return; }
            if (ed.held) { move(e); placeHeld(); return; }
            const p = at(e), m = gameMaps.casa; if (!p || !m) return;   // clicou numa peça: pega para mover
            const hit = m.entities.filter((o) => o && o.hf && o.type !== 'paint' && p.x >= o.x && p.x <= o.x + o.w && p.y >= o.y && p.y <= o.y + o.h).pop() || m.entities.filter((o) => o && o.hf && p.x >= o.x && p.x <= o.x + o.w && p.y >= o.y && p.y <= o.y + o.h).pop();
            if (hit) pickPlaced(hit.hi);
        }, true);
        cv.addEventListener('touchstart', (e) => { if (!ed.on) return; e.stopImmediatePropagation(); e.preventDefault(); if (ed.held) move(e); else { const p = at(e), m = gameMaps.casa; const hit = p && m && m.entities.filter((o) => o && o.hf && o.type !== 'paint' && p.x >= o.x && p.x <= o.x + o.w && p.y >= o.y && p.y <= o.y + o.h).pop(); if (hit) pickPlaced(hit.hi); } }, { capture: true, passive: false });
        cv.addEventListener('touchmove', (e) => { if (ed.on && ed.held) { e.preventDefault(); move(e); } }, { capture: true, passive: false });
        window.addEventListener('keydown', (e) => {
            if (!ed.on) return; const tg = e.target && e.target.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA') return;
            const k = e.key.toLowerCase(); if (k === 'r') { rotateHeld(e.shiftKey ? -1 : 1); e.preventDefault(); e.stopImmediatePropagation(); }
            else if (k === 'escape') { if (ed.held) cancelHeld(); else closeDecor(); e.preventDefault(); e.stopImmediatePropagation(); }
            else if (k === 'delete' || k === 'x') { storeHeld(); e.preventDefault(); e.stopImmediatePropagation(); }
        }, true);
    }
    // fantasma + moldura verde/vermelha, desenhado por cima do mundo (chamado pelo laço de desenho)
    function drawOverlay(ctx, T) {
        if (currentMap !== 'casa') return;
        if (ed.on && ed.held) {
            const k = ed.held.k, f = FURN[k], sz = sizeOf(k, ed.held.r), e = furnEntity({ k, x: ed.ghost.x, y: ed.ghost.y, r: ed.held.r }, 'g');
            ctx.save(); ctx.globalAlpha = 0.72; try { renderEntity(ctx, e, true); } catch (er) { } ctx.restore();
            ctx.save(); ctx.lineWidth = 2; ctx.strokeStyle = ed.ok ? '#2ecc71' : '#e74c3c'; ctx.fillStyle = ed.ok ? 'rgba(46,204,113,.16)' : 'rgba(231,76,60,.22)'; ctx.fillRect(ed.ghost.x, ed.ghost.y, sz[0], sz[1]); ctx.setLineDash([6, 4]); ctx.strokeRect(ed.ghost.x, ed.ghost.y, sz[0], sz[1]); ctx.restore();
        } else if (ed.on) {
            const m = gameMaps.casa; ctx.save(); ctx.strokeStyle = 'rgba(240,226,189,.35)'; ctx.setLineDash([3, 5]); (m.entities || []).forEach((o) => { if (o && o.hf) ctx.strokeRect(o.x - 1, o.y - 1, (o.w || 30) + 2, (o.h || 30) + 2); }); ctx.restore();
        }
        if (tr && tr.on) {   // barra de progresso do treino
            const p = Math.min(1, (performance.now() - tr.t0) / (TRAIN_SECS * 1000)), x = player.x - 24, y = player.y - 48;
            ctx.save(); ctx.fillStyle = 'rgba(20,12,6,.8)'; ctx.fillRect(x - 1, y - 1, 50, 9); ctx.fillStyle = '#e0b84a'; ctx.fillRect(x, y, 48 * p, 7); ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#f0e2bd'; ctx.fillText(TRAIN[tr.fk].icon + ' ' + TRAIN[tr.fk].verb + '...', player.x, y - 4); ctx.restore();
        }
    }

    /* ---------- treino em casa ---------- */
    let tr = null;
    const today = () => new Date().toISOString().slice(0, 10);
    function trainCount(fk) { const h = houseData(); if (!h.train || h.train.d !== today()) h.train = { d: today(), n: {} }; return h.train.n[fk] | 0; }
    function startTrain(t) {
        const T = TRAIN[t.fk]; if (!T) return false; if (!isMine()) { setActionText('Só o morador treina aqui.', '#f1c40f'); return true; }
        if (tr && tr.on) return true; const n = trainCount(t.fk);
        if (n >= TRAIN_PER_DAY) { setActionText('Você já treinou bastante aqui hoje (' + TRAIN_PER_DAY + '/' + TRAIN_PER_DAY + '). Volte amanhã — e saia para aventuras!', '#f1c40f'); return true; }
        tr = { on: true, fk: t.fk, t0: performance.now(), x: player.x, y: player.y, hp: player.stats.hp }; setActionText(T.verb + '... (fique parado)', '#e0b84a'); return true;
    }
    function trainTick() {
        if (!tr || !tr.on) return; const T = TRAIN[tr.fk];
        if (currentMap !== 'casa' || Math.hypot(player.x - tr.x, player.y - tr.y) > 30 || player.stats.hp < tr.hp || ed.on) { tr = null; setActionText('Treino interrompido.', '#bdc3c7'); return; }
        if (T.skill && Math.random() < 0.15) { try { player.actionAnim = 15; } catch (e) { } }
        if (performance.now() - tr.t0 < TRAIN_SECS * 1000) return;
        const fk = tr.fk, sk = player.stats.skills[T.skill]; tr = null; if (!sk) return;
        const lv = sk.level || 1, need = Math.max(1, Balance.xpForLevel(lv + 1) - Balance.xpForLevel(lv)), xp = Math.max(TRAIN_MIN, Math.round(need * TRAIN_PCT));
        trainCount(fk); houseData().train.n[fk] = (houseData().train.n[fk] | 0) + 1;
        try { addXP(T.skill, xp, true); } catch (e) { }
        if (fk === 'hottub') { player.stats.hp = Math.min(player.stats.maxHp, player.stats.hp + Math.round(player.stats.maxHp * 0.25)); }
        setActionText(T.icon + ' +' + xp + ' XP de ' + Labels.skill(T.skill, sk.name) + ' (' + houseData().train.n[fk] + '/' + TRAIN_PER_DAY + ' hoje)', '#2ecc71'); try { updateUI(); saveSoon(); } catch (e) { }
    }
    async function setGuests(list) {
        try {
            const r = await api('/house', { a: 'guests', list });
            if (r && r.ok) { houseData().guests = r.guests; try { saveDataLogic(); } catch (e) { } const asked = list.length, got = r.guests.length; if (got < asked) setActionText('Alguns nomes não existem e foram ignorados.', '#f1c40f'); }
            else setActionText((r && r.error) || 'Não foi possível salvar os convidados.', '#e74c3c');
        } catch (e) { setActionText('Sem conexão. Tente novamente em instantes.', '#e74c3c'); }
        renderPanel();
    }
    function editDoor(o) {   // Dev: define/troca o dono de uma porta de casa (salva ao digitar, ao teclar Enter ou ao clicar em Salvar)
        const cur = esc(o.owner || '');
        openModal('<h3 style="margin-top:0">Porta de Casa</h3><p style="font-size:.8rem;opacity:.85;margin:0 0 6px">Informe o nome do usuário que mora aqui (o mesmo do login; maiúsculas não importam). Só o dono decora e convida.</p><label>Dono (nome do usuário):</label><input type="text" id="hd-owner" class="dev-input" maxlength="40" value="' + cur + '" style="margin-bottom:8px"><div id="hd-msg" style="font-size:.75rem;min-height:1em;color:#f1c40f"></div><div style="text-align:right"><button class="dev-btn" id="hd-ok" style="background:#2a5a3a;color:#fff;border-radius:6px;padding:4px 14px">Salvar</button></div>');
        const inp = $('hd-owner'), ok = $('hd-ok'), msg = $('hd-msg');
        const apply = () => { o.owner = (inp.value || '').trim().slice(0, 40); o.name = o.owner ? 'Casa de ' + o.owner : 'Casa'; try { saveDataLogic(false, true); } catch (e) { } if (msg) msg.textContent = o.owner ? 'Dono: ' + o.owner : ''; };
        inp.addEventListener('input', apply); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { apply(); closeModal(); } });
        ok.onclick = () => { apply(); closeModal(); }; setTimeout(() => { try { inp.focus(); } catch (e) { } }, 50);
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
        const exit = { m: currentMap, x: door.x + Math.round((door.w || 60) / 2) - 12, y: door.y + (door.h || 80) + 26 };
        if (ex) { ex.destMap = exit.m; ex.destX = exit.x; ex.destY = exit.y; }
        houseData().exit = exit;   // para sair no lugar certo se recarregar dentro da casa
        refreshHouse();
        const m = gameMaps.casa; switchMap('casa', Math.round((m.width || 900) / 2) - 12, (m.height || 640) - 150);
        setActionText(r.owner === me() ? 'Casa, doce casa. Use o botão Decorar.' : 'Casa de ' + r.owner, '#2ecc71');
    }
    function useFurniture(t) {
        if (t.fk === 'bed') {
            player.stats.hp = player.stats.maxHp; player.stats.mp = player.stats.maxMp;
            setActionText('Você descansou. Vida e mana restauradas.', '#2ecc71'); try { addFloatingText && addFloatingText(player.x, player.y - 30, 'Descansado', '#7aa8ff'); updateUI(); } catch (e) { }
            return true;
        }
        if (TRAIN[t.fk]) return startTrain(t);
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
        try { if (window.Fendas) window.Fendas.place(maps); } catch (e) { console.error(e); }
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
        if (o.rot) { // peça girada: desenha na orientação original, girada em torno do centro
            const r = o.rot & 3, w0 = (r & 1) ? h : w, h0 = (r & 1) ? w : h, cx = x + w / 2, cy = y + h / 2;
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(r * Math.PI / 2);
            drawEntity(ctx, Object.assign({}, o, { rot: 0, x: -w0 / 2, y: -h0 / 2, w: w0, h: h0 }), T); ctx.restore(); return;
        }
        shadow();
        if (k === 'dummy') {
            ctx.fillStyle = '#6b4a2b'; ctx.fillRect(x + w * .44, y + h * .3, w * .12, h * .7); ctx.fillRect(x + w * .2, y + h * .92, w * .6, h * .08);
            ctx.fillStyle = '#c9a86a'; ctx.fillRect(x + w * .2, y + h * .3, w * .6, h * .3); ctx.strokeRect(x + w * .2, y + h * .3, w * .6, h * .3);
            ctx.beginPath(); ctx.arc(x + w / 2, y + h * .18, w * .2, 0, 6.3); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#a03a2a'; ctx.fillRect(x + w * .1, y + h * .34, w * .8, h * .08);
        } else if (k === 'archery') {
            ctx.fillStyle = '#6b4a2b'; ctx.fillRect(x + w * .1, y + h * .55, w * .08, h * .45); ctx.fillRect(x + w * .82, y + h * .55, w * .08, h * .45);
            const cx = x + w / 2, cy = y + h * .36, R = Math.min(w, h) * .42;
            [['#f2ead2', 1], ['#222', .8], ['#3f6aa8', .62], ['#b03a3a', .44], ['#f1c40f', .22]].forEach((c) => { ctx.fillStyle = c[0]; ctx.beginPath(); ctx.arc(cx, cy, R * c[1], 0, 6.3); ctx.fill(); });
            ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.3); ctx.stroke(); ctx.strokeStyle = '#d8d0b0'; ctx.beginPath(); ctx.moveTo(cx + 3, cy - 2); ctx.lineTo(cx + R * .8, cy - R * .6); ctx.stroke(); ctx.strokeStyle = '#1c120a';
        } else if (k === 'punchbag') {
            ctx.fillStyle = '#4a3a2a'; ctx.fillRect(x + w * .1, y, w * .8, h * .06); ctx.strokeStyle = '#8a8a8a'; ctx.beginPath(); ctx.moveTo(x + w / 2, y + h * .06); ctx.lineTo(x + w / 2, y + h * .2); ctx.stroke(); ctx.strokeStyle = '#1c120a';
            ctx.fillStyle = '#8a4a2a'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x + w * .2, y + h * .2, w * .6, h * .75, 8) : ctx.rect(x + w * .2, y + h * .2, w * .6, h * .75); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#6a3418'; ctx.fillRect(x + w * .2, y + h * .5, w * .6, h * .06);
        } else if (k === 'library') {
            ctx.fillStyle = '#4a2f18'; ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
            for (let r = 0; r < 3; r++) { const yy = y + 3 + r * (h / 3); ctx.fillStyle = '#2a1a0a'; ctx.fillRect(x + 3, yy + h / 3 - 6, w - 6, 3); for (let i = 0; i < 12; i++) { ctx.fillStyle = ['#7a4aa8', '#3f6aa8', '#a24a34', '#c9a24a', '#3f8a4a'][(i + r) % 5]; ctx.fillRect(x + 5 + i * ((w - 10) / 12), yy + (i % 4), (w - 10) / 12 - 1.5, h / 3 - 9 - (i % 4)); } }
            ctx.fillStyle = 'rgba(160,120,255,' + (0.25 + 0.2 * Math.sin(T * 2.5)).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(x + w - 12, y - 4, 4, 0, 6.3); ctx.fill();
        } else if (k === 'hottub') {
            ctx.fillStyle = '#7a5a34'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 6.3); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#4aa8d8'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2 - 6, h / 2 - 6, 0, 0, 6.3); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.55)'; for (let i = 0; i < 4; i++) { const a = T * 1.2 + i * 1.6; ctx.beginPath(); ctx.arc(x + w / 2 + Math.cos(a) * w * .22, y + h / 2 + Math.sin(a * 1.3) * h * .18, 3 + (i % 2), 0, 6.3); ctx.fill(); }
            ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(x + w * .5, y + h * .1 - ((T * 12) % 14), 4, 0, 6.3); ctx.fill();
        } else if (k === 'bed') {
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
            btn.style.cssText = 'position:absolute;left:50%;top:54px;transform:translateX(-50%);z-index:60;display:none;padding:6px 14px;font-weight:700;background:linear-gradient(#5a3d1e,#3a2410);color:#f0e2bd;border:2px solid #c9a24a;border-radius:8px;cursor:pointer';
            btn.onclick = openDecor; (document.getElementById('game-container') || document.body).appendChild(btn);
        }
        btn.style.display = (typeof currentMap !== 'undefined' && currentMap === 'casa' && isMine()) ? '' : 'none';
    }
    function onLogin() { if (!player.house) player.house = { items: [] }; if (!player.bestiary) player.bestiary = {}; merge(); try { if (player.currentMap === 'casa') { hctx = { owner: me(), items: [] }; const ex = gameMaps.casa && gameMaps.casa.entities.find((o) => o && o.type === 'portal'), e = player.house.exit; if (ex && e) { ex.destMap = e.m; ex.destX = e.x; ex.destY = e.y; } refreshHouse(); } } catch (e) {} }
    function wire() {
        const oi = window.tryInteract; if (typeof oi === 'function') window.tryInteract = function (t) { if (tryInteractHook(t)) { player.actionAnim = 15; return; } return oi.apply(this, arguments); };
        const od = window.applyDamage; if (typeof od === 'function') window.applyDamage = function (t, dmg, s) { const was = t && t.type === 'enemy' && t.active !== false && t.hp > 0; const r = od.apply(this, arguments); try { if (was && t.hp <= 0) record(t.dbKey); } catch (e) {} return r; };
        setInterval(tickBtn, 400); setInterval(trainTick, 250);
    }
    window.addEventListener('load', wire);
    window.World2 = { houseKey: () => (hctx && hctx.owner ? 'casa_' + String(hctx.owner).toLowerCase().replace(/[^\w\-]/g, '_').slice(0, 34) : null), ITEMS, CREATURES, FURN, HOUSE_MAX, record, kills, beastList, beastProgress, placeInWorld, merge, drawEntity, enterHouse, editDoor, openDecor, buy, refreshHouse, drawOverlay, onLogin, TRAIN, buildCatacombs, buildHouseShell };
})();
