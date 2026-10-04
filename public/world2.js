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
        shelf: { n: 'Estante', c: 90, w: 76, h: 40, bf: 0.5, t: 'furniture', cat: 'Móveis', rot: 1 },
        rug_red: { n: 'Tapete vermelho', c: 40, w: 110, h: 70, t: 'paint', col: '#8a2b2b', cat: 'Decoração', rot: 1 },
        rug_blue: { n: 'Tapete azul', c: 40, w: 110, h: 70, t: 'paint', col: '#2b4a8a', cat: 'Decoração', rot: 1 },
        lamp: { n: 'Lampião', c: 35, w: 26, h: 40, bf: 0.3, t: 'decor', kind: 'lamp', cat: 'Decoração' },
        banner: { n: 'Estandarte', c: 50, w: 40, h: 60, bf: 0.32, t: 'decor', kind: 'banner', cat: 'Decoração' },
        statue: { n: 'Estátua', c: 150, w: 50, h: 70, bf: 0.38, t: 'decor', kind: 'statue', cat: 'Decoração' },
        flowers: { n: 'Flores', c: 20, w: 34, h: 30, t: 'decor', kind: 'flowers', cat: 'Decoração' },
        bush: { n: 'Arbusto', c: 20, w: 40, h: 36, t: 'decor', kind: 'bush', cat: 'Decoração' },
        barrel: { n: 'Barril', c: 30, w: 30, h: 36, t: 'decor', kind: 'barrel', cat: 'Decoração' },
        crystal: { n: 'Cristal', c: 200, w: 34, h: 44, bf: 0.5, t: 'decor', kind: 'crystal', cat: 'Decoração' },
        bank: { n: 'Baú do Banco', c: 800, w: 80, h: 48, t: 'bank', cat: 'Estações', use: 'Guarda itens como no banco' },
        furnace: { n: 'Fornalha', c: 300, w: 48, h: 72, t: 'furnace', cat: 'Estações' },
        anvil: { n: 'Bigorna', c: 200, w: 46, h: 39, t: 'anvil', cat: 'Estações' },
        cauldron: { n: 'Caldeirão', c: 400, w: 44, h: 44, t: 'cauldron', cat: 'Estações' },
        enchant_table: { n: 'Mesa de Encantamento', c: 600, w: 54, h: 46, t: 'enchant_table', cat: 'Estações' },
        dummy: { n: 'Manequim de treino', c: 900, w: 44, h: 72, bf: 0.34, t: 'furniture', cat: 'Treino', rot: 1, sym: 1, use: 'Treina Combate' },
        archery: { n: 'Alvo de arco', c: 900, w: 56, h: 72, bf: 0.32, t: 'furniture', cat: 'Treino', rot: 1, sym: 1, use: 'Treina Arco' },
        punchbag: { n: 'Saco de pancada', c: 1100, w: 40, h: 74, bf: 0.3, t: 'furniture', cat: 'Treino', rot: 1, sym: 1, use: 'Treina Defesa' },
        library: { n: 'Biblioteca de estudos', c: 1600, w: 104, h: 54, bf: 0.55, t: 'furniture', cat: 'Treino', rot: 1, use: 'Medita e estuda: Magia' },
        hottub: { n: 'Banheira quente', c: 1800, w: 86, h: 66, t: 'furniture', cat: 'Treino', rot: 1, sym: 1, use: 'Relaxa: Vitalidade' },
        trophy_dragon: { n: 'Troféu de Dragão', c: 0, w: 60, h: 50, bf: 0.55, t: 'furniture', cat: 'Troféus', rot: 1, sym: 1, need: 'dragon_boss', needTxt: 'Derrote o Dragão Ancestral' },
        trophy_lich: { n: 'Troféu do Lich', c: 0, w: 50, h: 56, bf: 0.55, t: 'furniture', cat: 'Troféus', rot: 1, sym: 1, need: 'lich_boss', needTxt: 'Derrote o Lich Rei' }
    };
    /* móveis de treino: sessões curtas, poucas por dia, XP pequena (bônus de rotina, não um lugar para viver) */
    const TRAIN = {
        dummy: { skill: 'combat', verb: 'Treinando com o manequim', icon: '⚔️' },
        archery: { skill: 'ranged', verb: 'Praticando tiro ao alvo', icon: '🏹' },
        punchbag: { skill: 'defence', verb: 'Treinando resistência', icon: '🛡️' },
        library: { skill: 'magic', verb: 'Estudando na biblioteca', icon: '📖' },
        hottub: { skill: 'hp', verb: 'Relaxando na banheira', icon: '♨️' }
    };
    /* treino repete sozinho (AFK) até o jogador se mexer, apanhar, abrir o editor ou clicar de novo. XP FIXA por sessão, definida no painel Dev
       (guardada em gameMaps.casa.trainXp / trainSecs, que o servidor já distribui junto com o mundo). Sem limite diário. */
    const TRAIN_DEF_XP = 40, TRAIN_DEF_SECS = 8;
    const trainXpOf = (fk) => { const c = gameMaps && gameMaps.casa && gameMaps.casa.trainXp; const v = c && Number(c[fk]); return Number.isFinite(v) && v >= 0 ? Math.min(100000, Math.round(v)) : TRAIN_DEF_XP; };
    const trainSecs = () => { const v = gameMaps && gameMaps.casa && Number(gameMaps.casa.trainSecs); return Number.isFinite(v) && v >= 2 ? Math.min(120, v) : TRAIN_DEF_SECS; };
    const fixedMk = (m, k) => { if (!m.c5 || typeof m.c5 !== 'object') m.c5 = {}; if (m.c5[k]) return false; m.c5[k] = true; if (window.Content && Content.mark) Content.mark(); return true; };

    let hctx = null;   // casa em que o jogador está: { owner, items }
    const me = () => { try { return currentUser; } catch (e) { return ''; } };
    const isMine = () => !hctx || hctx.owner === me();
    function houseData() { if (!player.house || !Array.isArray(player.house.items)) player.house = { items: [] }; const h = player.house; if (!h.stock || typeof h.stock !== 'object') h.stock = {}; return h; }
    const sizeOf = (k, r) => { const f = FURN[k]; return ((r & 1) && !f.sym) ? [f.h, f.w] : [f.w, f.h]; };   // sym: peça (quase) simétrica, o espaço no chão não troca ao girar
    function furnEntity(it, i) {
        const f = FURN[it.k]; if (!f) return null; const r = it.r | 0, sz = sizeOf(it.k, r);
        const o = { id: 'hf_' + i + '_' + it.k, hf: true, hi: i, active: true, x: it.x, y: it.y, w: sz[0], h: sz[1], name: f.n, kind: it.k, rot: r };
        o.type = f.t;
        if (f.t === 'paint') o.color = f.col;
        else if (f.t === 'decor') { o.kind = f.kind; o.name = f.n; }
        if (f.t === 'furniture') o.fk = it.k;
        if (f.bf && (!(r & 1) || f.sym)) o.bf = f.bf;   // peça ALTA: só a base (parte de baixo) ocupa o chão; o resto sobe e pode encostar/sobrepor a parede
        return o;
    }
    /* área que a peça realmente ocupa no chão (a base). Móveis altos têm base menor que o desenho. */
    function fpOf(o) { let hb = null; if (o.type !== 'paint') { try { hb = getHitbox(o); } catch (e) { } } return hb ? { x: hb.x, y: hb.y, w: hb.w, h: hb.h } : { x: o.x, y: o.y, w: o.w || 30, h: o.h || 30 }; }
    function footOf(it) { const e = furnEntity(it, 0); return e ? fpOf(e) : null; }
    function clampItem(it) {   // põe a BASE da peça dentro do piso (o desenho pode passar sobre a parede)
        const f = footOf(it); if (!f) return; const ox = f.x - it.x, oy = f.y - it.y;
        it.x = Math.round(Math.max(HB.x0 - ox, Math.min(HB.x1 - f.w - ox, it.x))); it.y = Math.round(Math.max(HB.y0 - oy, Math.min(HB.y1 - f.h - oy, it.y)));
    }
    // reconstrói as peças da casa (só as do jogador local) dentro do mapa 'casa'
    /* ---- a sala: paredes de verdade (sólidas), janelas, lareira, piso de tábuas. Montada aqui (nunca salva): vale para todas as casas ---- */
    const HB = { x0: 60, y0: 156, x1: 840, y1: 556 };   // área do piso onde cabem móveis
    function roomEntities() {
        const W = (id, x, y, w, h) => ({ id: 'hf_w_' + id, hf: true, type: 'house_wall', name: 'Parede', x, y, w, h, active: true });
        return [{ id: 'hf_room', hf: true, type: 'paint', room: true, name: 'Casa', color: '#2a1d12', x: 0, y: 0, w: 900, h: 640, active: true },
            W('top', 30, 30, 840, 124), W('left', 30, 30, 32, 560), W('right', 838, 30, 32, 560), W('bl', 30, 560, 392, 30), W('br', 478, 560, 392, 30),
            W('fire', 410, 100, 80, 56), W('out', 30, 620, 840, 20), W('outl', 30, 590, 392, 30), W('outr', 478, 590, 392, 30)];
    }
    function refreshHouse() {
        const m = gameMaps && gameMaps.casa; if (!m) return;
        m.entities = (m.entities || []).filter((o) => o && !o.hf);
        roomEntities().forEach((e) => m.entities.push(e));
        const items = (hctx && hctx.owner !== me()) ? hctx.items : houseData().items;
        if (!(hctx && hctx.owner !== me())) items.forEach((it) => { if (FURN[it.k]) clampItem(it); });   // casas antigas (sem parede) são ajustadas para dentro da sala nova
        items.forEach((it, i) => { const e = furnEntity(it, i); if (e) m.entities.push(e); });
    }
    function inHouseBounds(m, x, y, w, h) { return x >= HB.x0 && y >= HB.y0 && x + w <= HB.x1 && y + h <= HB.y1 && !(x < 500 && x + w > 400 && y + h > 500); }   // a faixa da porta fica livre
    function canPlace(k, r, x, y) {
        const m = gameMaps.casa, f = FURN[k]; if (!m || !f) return false; const fp = footOf({ k, x, y, r });
        if (!fp || !inHouseBounds(m, fp.x, fp.y, fp.w, fp.h)) return false;
        if (f.t === 'paint') return true;
        return !m.entities.some((o) => { if (!o || o.active === false || !o.hf || o.type === 'paint') return false; const b = fpOf(o); return fp.x - 2 < b.x + b.w && fp.x + fp.w + 2 > b.x && fp.y - 2 < b.y + b.h && fp.y + fp.h + 2 > b.y; });
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
    /* seta dourada que mostra a FRENTE do móvel (0 = para baixo, 1 = direita, 2 = para cima, 3 = esquerda) */
    function frontArrow(ctx, fp, r, big, T) {
        const D = [[0, 1], [1, 0], [0, -1], [-1, 0]][r & 3], cx = fp.x + fp.w / 2, cy = fp.y + fp.h / 2, ex = Math.abs(D[0]) * fp.w / 2, ey = Math.abs(D[1]) * fp.h / 2;
        const pulse = big ? 3 * Math.sin((T || 0) * 6) : 0, a0 = Math.max(ex, ey) + 4, len = (big ? 30 : 16) + pulse, hd = big ? 9 : 6, px = -D[1], py = D[0];
        const x0 = cx + D[0] * (ex + 4), y0 = cy + D[1] * (ey + 4), x1 = x0 + D[0] * len, y1 = y0 + D[1] * len;
        ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = big ? 1 : 0.65;
        ctx.strokeStyle = '#2a1706'; ctx.lineWidth = big ? 7 : 5; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x1 + D[0] * hd, y1 + D[1] * hd); ctx.lineTo(x1 + px * hd * 0.9, y1 + py * hd * 0.9); ctx.lineTo(x1 - px * hd * 0.9, y1 - py * hd * 0.9); ctx.closePath(); ctx.stroke();
        ctx.strokeStyle = '#ffd24a'; ctx.fillStyle = '#ffd24a'; ctx.lineWidth = big ? 3.4 : 2.4; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x1 + D[0] * hd, y1 + D[1] * hd); ctx.lineTo(x1 + px * hd * 0.9, y1 + py * hd * 0.9); ctx.lineTo(x1 - px * hd * 0.9, y1 - py * hd * 0.9); ctx.closePath(); ctx.fill();
        if (big) { ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#2a1706'; const lx = x1 + D[0] * (hd + 10), ly = y1 + D[1] * (hd + 10) + 3; ctx.strokeText('frente', lx, ly); ctx.fillStyle = '#fff3c0'; ctx.fillText('frente', lx, ly); }
        ctx.restore();
    }
    // fantasma + moldura verde/vermelha, desenhado por cima do mundo (chamado pelo laço de desenho)
    function drawOverlay(ctx, T) {
        if (currentMap !== 'casa') return;
        if (ed.on && ed.held) {
            const k = ed.held.k, f = FURN[k], sz = sizeOf(k, ed.held.r), e = furnEntity({ k, x: ed.ghost.x, y: ed.ghost.y, r: ed.held.r }, 'g');
            ctx.save(); ctx.globalAlpha = 0.72; try { renderEntity(ctx, e, true); } catch (er) { } ctx.restore();
            ctx.save(); ctx.lineWidth = 2; ctx.strokeStyle = ed.ok ? '#2ecc71' : '#e74c3c'; ctx.fillStyle = ed.ok ? 'rgba(46,204,113,.16)' : 'rgba(231,76,60,.22)'; const fp = footOf({ k, x: ed.ghost.x, y: ed.ghost.y, r: ed.held.r }) || { x: ed.ghost.x, y: ed.ghost.y, w: sz[0], h: sz[1] }; ctx.fillRect(fp.x, fp.y, fp.w, fp.h); ctx.setLineDash([6, 4]); ctx.strokeRect(fp.x, fp.y, fp.w, fp.h); if (fp.h < sz[1] - 1) { ctx.globalAlpha = 0.35; ctx.strokeStyle = '#f0e2bd'; ctx.setLineDash([2, 4]); ctx.strokeRect(ed.ghost.x, ed.ghost.y, sz[0], sz[1]); } ctx.restore();
            if (f.rot && f.t === 'furniture') frontArrow(ctx, fp, ed.held.r, true, T);
        } else if (ed.on) {
            const m = gameMaps.casa; ctx.save(); ctx.strokeStyle = 'rgba(240,226,189,.35)'; ctx.setLineDash([3, 5]); (m.entities || []).forEach((o) => { if (o && o.hf && o.type !== 'house_wall' && o.type !== 'paint' || (o && o.hf && o.type === 'paint' && !o.room)) ctx.strokeRect(o.x - 1, o.y - 1, (o.w || 30) + 2, (o.h || 30) + 2); }); ctx.restore();
            (m.entities || []).forEach((o) => { const ff = o && o.hf && o.fk && FURN[o.fk]; if (ff && ff.rot) frontArrow(ctx, fpOf(o), o.rot | 0, false, T); });
        }
        try { trainOverlay(ctx, T); } catch (e) { }
        if (tr && tr.on) {   // barra de progresso do treino
            const p = Math.min(1, (performance.now() - tr.t0) / (trainSecs() * 1000)), x = player.x - 24, y = player.y - 48;
            ctx.save(); ctx.fillStyle = 'rgba(20,12,6,.8)'; ctx.fillRect(x - 1, y - 1, 50, 9); ctx.fillStyle = '#e0b84a'; ctx.fillRect(x, y, 48 * p, 7); ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#f0e2bd'; ctx.fillText(TRAIN[tr.fk].icon + ' ' + TRAIN[tr.fk].verb + '...', player.x, y - 4); ctx.restore();
        }
    }

    /* ---------- treino em casa ---------- */
    let tr = null;
    const today = () => new Date().toISOString().slice(0, 10);
    /* ---- poses de treino: o personagem vai para o lugar certo de cada móvel ---- */
    function poseSpot(t) {
        const r = (t.rot | 0) & 3, D = [[0, 1], [1, 0], [0, -1], [-1, 0]][r], dx = D[0], dy = D[1];   // lado para onde o móvel está virado (0 = para baixo)
        const cx = t.x + t.w / 2, cy = t.y + t.h / 2, mw = (gameMaps.casa && gameMaps.casa.width) || 900, bTop = t.y + t.h * (1 - (t.bf || 1)), bBot = t.y + t.h;   // bTop/bBot: topo e pé da BASE (o desenho do móvel alto sobe além dela)
        const clamp = (x, y) => [Math.max(HB.x0 + 20, Math.min(HB.x1 - 20, x)), Math.max(HB.y0 + 24, Math.min(HB.y1 - 14, y))];
        let px = player.x, py = player.y; tr.back = { x: player.x, y: player.y }; tr.rot = r; tr.face = { x: -dx, y: -dy };
        if (t.fk === 'hottub') { px = cx; py = t.y + t.h / 2 + 12; tr.back = { x: cx, y: t.y + t.h + 30 }; tr.face = { x: 0, y: 1 }; }
        else if (t.fk === 'library') { [px, py] = clamp(cx + dx * (t.w / 2 + 34), dy > 0 ? bBot + 40 : dy < 0 ? bTop - 30 : cy + 12); tr.face = { x: 0, y: 1 }; }   // senta do lado em que a estante está virada
        else if (t.fk === 'archery') { [px, py] = clamp(cx + dx * (t.w / 2 + 150), dy > 0 ? bBot + 150 : dy < 0 ? bTop - 150 : bBot - 10); tr.tx = cx; tr.ty = t.y + t.h * 0.36; tr.R = Math.min(t.w, t.h) * 0.42; tr.showHits = r === 0; }
        else if (t.fk === 'punchbag') { if (r & 1) { [px, py] = clamp(cx + dx * (t.w / 2 + 28), t.y + t.h - 12); tr.dir = -dx; tr.face = { x: -dx, y: 0 }; } else { tr.dir = cx > mw / 2 ? 1 : -1; [px, py] = clamp(cx - tr.dir * (t.w / 2 + 26), t.y + t.h - 12); tr.face = { x: tr.dir, y: 0 }; } }
        else if (t.fk === 'dummy') { [px, py] = clamp(cx + dx * (t.w / 2 + 26), dy > 0 ? bBot + 10 : dy < 0 ? bTop - 18 : bBot - 6); }
        player.x = px; player.y = py; player.destX = px; player.destY = py;
        if (t.fk !== 'hottub') { try { ensurePlayerFree(); } catch (e) { } }   // nunca fica dentro de um móvel
        tr.x = player.x; tr.y = player.y;
    }
    const BEAT = { dummy: [900, 330], punchbag: [480, 240], archery: [1700, 320] };
    function trainAnim() { const b = tr && BEAT[tr.fk]; if (!b || !tr.cycT) return 0; const el = performance.now() - tr.cycT; return el < b[1] ? 15 * (1 - el / b[1]) : 0; }
    const BOW = { tool: 'ranged', name: 'Shortbow' };
    /* chamado pelo desenho do personagem principal: devolve null (normal), {skip:true} (desenhado no overlay) ou ajustes de pose */
    function trainPose(op, eq) {
        if (!tr || !tr.on || currentMap !== 'casa') return null; const k = tr.fk;
        if (k === 'hottub' || k === 'library') return { skip: true };
        const body = eq && eq.body, head = eq && eq.head;
        if (k === 'archery') return { facing: tr.face, anim: trainAnim(), equip: { weapon: BOW, shield: null, body, head } };
        if (k === 'punchbag') return { facing: tr.face, anim: trainAnim(), equip: { weapon: null, shield: null, body, head } };
        if (k === 'dummy') return { facing: tr.face, anim: trainAnim() };
        return null;
    }
    /* outros jogadores treinando (estado vem do sync): mesma pose do treino, só visual */
    function trainState() { if (!tr || !tr.on || currentMap !== 'casa') return null; return { k: tr.fk, fx: Math.sign(tr.face ? tr.face.x : 0), fy: Math.sign(tr.face ? tr.face.y : 1) }; }
    function remotePose(op, eq) {
        const t = op && op.tr; if (!t || !BEAT[t.k] && t.k !== 'library' && t.k !== 'hottub') return null;
        const b = BEAT[t.k]; let anim = 0; if (b) { const el = (performance.now() % b[0]); anim = el < b[1] ? 15 * (1 - el / b[1]) : 0; }
        const body = eq && eq.body, head = eq && eq.head, face = { x: t.fx || 0, y: t.fy === undefined ? 1 : t.fy };
        if (t.k === 'archery') return { facing: face, anim, equip: { weapon: BOW, shield: null, body, head } };
        if (t.k === 'punchbag') return { facing: face, anim, equip: { weapon: null, shield: null, body, head } };
        if (t.k === 'dummy') return { facing: face, anim };
        return null;
    }
    function remoteDeco(c, px, py, t, T) {
        if (!t) return;
        if (t.k === 'library') drawBook(c, px, py - 30, T);
        else if (t.k === 'hottub') { c.save(); c.globalAlpha = 0.5; c.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { const u = ((performance.now() / 1200) + i / 3) % 1; c.beginPath(); c.arc(px - 6 + i * 6 + Math.sin(u * 9 + i) * 2, py - 40 - u * 22, 2 + u * 2, 0, 6.3); c.fill(); } c.restore(); }
    }
    function swayAngle(o, k) {
        if (!tr || !tr.on || tr.fk !== k || tr.id !== o.id) return 0; const now = performance.now();
        if (k === 'punchbag') { const dt = (now - (tr.swingT || 1e12)) / 1000; if (dt < 0 || dt > 3) return 0; return -tr.dir * 0.4 * Math.exp(-2 * dt) * Math.cos(dt * 7.5); }
        if (k === 'dummy') { const dt = (now - (tr.shakeT || 1e12)) / 1000; if (dt < 0 || dt > 1) return 0; return 0.09 * Math.exp(-5 * dt) * Math.sin(dt * 38); }
        return 0;
    }
    function lookNaked() { const L = Object.assign({}, (window.Art && Art.defaultLook()) || {}, player.look || {}); L.shirt = L.skin || '#f1c27d'; L.pants = '#2b6cb0'; return L; }
    function drawBook(c, x, y, T) {
        c.save(); c.lineWidth = 1.2; c.strokeStyle = '#1c120a';
        c.fillStyle = '#5a2a1a'; c.beginPath(); c.moveTo(x - 11, y + 2); c.lineTo(x + 11, y + 2); c.lineTo(x + 10, y - 8); c.lineTo(x - 10, y - 8); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#f4ecd2'; c.beginPath(); c.moveTo(x - 0.8, y + 1); c.lineTo(x - 10, y + 0.4); c.lineTo(x - 9.4, y - 7); c.lineTo(x - 0.8, y - 6.2); c.closePath(); c.fill(); c.stroke();
        const flip = ((performance.now() / 1000) % 2.6) / 0.5;   // vira a página de tempos em tempos
        if (flip < 1) { const a = flip; c.fillStyle = '#fffaf0'; c.beginPath(); c.moveTo(x + 0.8, y + 1); c.lineTo(x + 0.8 - a * 8, y - 6 - Math.sin(a * 3.14) * 5); c.lineTo(x + 9.4 - a * 18, y - 7 - Math.sin(a * 3.14) * 4); c.lineTo(x + 9.4 - a * 18 + 0.4, y + 0.4); c.closePath(); c.fill(); c.stroke(); }
        else { c.fillStyle = '#f4ecd2'; c.beginPath(); c.moveTo(x + 0.8, y + 1); c.lineTo(x + 10, y + 0.4); c.lineTo(x + 9.4, y - 7); c.lineTo(x + 0.8, y - 6.2); c.closePath(); c.fill(); c.stroke(); }
        c.strokeStyle = 'rgba(70,50,30,.5)'; c.lineWidth = 0.7; c.beginPath(); for (let i = 0; i < 4; i++) { c.moveTo(x - 8.4, y - 5.4 + i * 1.7); c.lineTo(x - 2, y - 5 + i * 1.7); if (flip >= 1) { c.moveTo(x + 2, y - 5 + i * 1.7); c.lineTo(x + 8.4, y - 5.4 + i * 1.7); } } c.stroke();
        c.restore();
    }
    function trainOverlay(ctx, T) {
        if (!tr || !tr.on || currentMap !== 'casa') return; const now = performance.now(), k = tr.fk, b = BEAT[k];
        if (b) { const c = Math.floor((now - tr.t0b) / b[0]); if (c !== tr.cyc) { tr.cyc = c; tr.cycT = now; if (k === 'punchbag') tr.swingT = now + 110; else if (k === 'dummy') tr.shakeT = now + 130; else if (k === 'archery') tr.arrows.push({ t0: now + 160, x0: player.x + tr.face.x * 9, y0: player.y - 14 + tr.face.y * 4, hx: tr.tx + (Math.random() - 0.5) * tr.R * 1.3, hy: tr.ty + (Math.random() - 0.5) * tr.R * 1.3 }); } }
        const ent = tr.ent, px = player.x, py = player.y;
        if (k === 'archery') {
            for (let i = tr.arrows.length - 1; i >= 0; i--) {
                const a = tr.arrows[i], u = (now - a.t0) / 480; if (u < 0) continue;
                if (u >= 1) { tr.stuck.push({ x: a.hx, y: a.hy }); if (tr.stuck.length > 7) tr.stuck.shift(); tr.arrows.splice(i, 1); tr.hitT = now; tr.hitX = a.hx; tr.hitY = a.hy; continue; }
                const x = a.x0 + (a.hx - a.x0) * u, y = a.y0 + (a.hy - a.y0) * u - Math.sin(u * Math.PI) * 18;
                const vy = (a.hy - a.y0) - Math.cos(u * Math.PI) * 18 * Math.PI, vx = a.hx - a.x0, an = Math.atan2(vy, vx);
                ctx.save(); ctx.translate(x, y); ctx.rotate(an); ctx.lineCap = 'round'; ctx.strokeStyle = '#1c120a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(5, 0); ctx.stroke(); ctx.strokeStyle = '#d8c090'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(5, 0); ctx.stroke(); ctx.fillStyle = '#dfe6ea'; ctx.beginPath(); ctx.moveTo(5, -2.2); ctx.lineTo(9, 0); ctx.lineTo(5, 2.2); ctx.fill(); ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(-14, -2.4); ctx.lineTo(-9, -0.4); ctx.moveTo(-11, 0); ctx.lineTo(-14, 2.4); ctx.lineTo(-9, 0.4); ctx.fill(); ctx.restore();
            }
            if (tr.showHits) tr.stuck.forEach((s) => { ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = '#1c120a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - 1.5, s.y + 9); ctx.stroke(); ctx.strokeStyle = '#d8c090'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - 1.5, s.y + 9); ctx.stroke(); ctx.fillStyle = '#c0392b'; ctx.fillRect(s.x - 3, s.y + 8, 3, 2); ctx.fillRect(s.x, s.y + 8, 3, 2); ctx.restore(); });
            if (tr.hitT && now - tr.hitT < 220) { const q = (now - tr.hitT) / 220; ctx.save(); ctx.strokeStyle = 'rgba(255,240,160,' + (1 - q) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(tr.hitX, tr.hitY, 4 + q * 9, 0, 6.3); ctx.stroke(); ctx.restore(); }
        } else if (k === 'punchbag' && tr.swingT && now - tr.swingT < 140 && now > tr.swingT) {
            const q = (now - tr.swingT) / 140, bx = ent.x + ent.w / 2 - tr.dir * ent.w * 0.3, by = ent.y + ent.h * 0.58; ctx.save(); ctx.strokeStyle = 'rgba(255,240,170,' + (1 - q) + ')'; ctx.lineWidth = 2; for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3; ctx.beginPath(); ctx.moveTo(bx + Math.cos(a) * (4 + q * 4), by + Math.sin(a) * (4 + q * 4)); ctx.lineTo(bx + Math.cos(a) * (9 + q * 9), by + Math.sin(a) * (9 + q * 9)); ctx.stroke(); } ctx.restore();
        } else if (k === 'hottub') {
            const L = lookNaked(), cx = ent.x + ent.w / 2, cy = ent.y + ent.h / 2, wy = py + 8 - 27;
            ctx.save(); ctx.beginPath(); ctx.rect(cx - 60, cy - 90, 120, wy - (cy - 90)); ctx.clip();
            try { Art.drawPlayer(ctx, px, py, { x: 0, y: 1 }, 0, null, currentUser, true, { look: L, title: player.title || '' }); } catch (e) { }
            ctx.restore();
            ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy, ent.w / 2 - 6, ent.h / 2 - 6, 0, 0, 6.3); ctx.clip();
            const g = ctx.createLinearGradient(0, wy, 0, wy + 30); g.addColorStop(0, 'rgba(120,210,245,.55)'); g.addColorStop(1, 'rgba(60,150,210,.15)'); ctx.fillStyle = g; ctx.fillRect(cx - 60, wy, 120, 36);
            ctx.strokeStyle = 'rgba(220,245,255,.85)'; ctx.lineWidth = 1.6; ctx.beginPath(); for (let i = -20; i <= 20; i += 2) { const yy = wy + Math.sin(T * 3 + i * 0.5) * 1.2; if (i === -20) ctx.moveTo(px + i, yy); else ctx.lineTo(px + i, yy); } ctx.stroke();
            for (let r = 0; r < 2; r++) { const q = ((T * 0.5 + r * 0.5) % 1); ctx.strokeStyle = 'rgba(230,248,255,' + (0.5 * (1 - q)) + ')'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.ellipse(px, wy + 3, 16 + q * 14, 4 + q * 5, 0, 0, 6.3); ctx.stroke(); }
            ctx.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 7; i++) { const a = i * 1.7 + T * 0.4; ctx.beginPath(); ctx.arc(px + Math.cos(a) * (13 + (i % 3) * 4), wy + 1 + Math.sin(a * 1.3) * 2, 2 + (i % 2), 0, 6.3); ctx.fill(); }
            ctx.restore();
            for (let i = 0; i < 6; i++) { const q = ((T * 0.35 + i / 6) % 1), a = 0.28 * (1 - q); ctx.fillStyle = 'rgba(255,255,255,' + a + ')'; ctx.beginPath(); ctx.arc(cx + Math.sin(i * 2 + T) * 18, ent.y + 4 - q * 46, 6 + q * 10, 0, 6.3); ctx.fill(); }
        } else if (k === 'library') {
            const L = Object.assign({}, (window.Art && Art.defaultLook()) || {}, player.look || {}), eq = player.equipment || {}, E = { weapon: null, shield: null, body: eq.body, head: eq.head };
            const wood = '#5a3a1a', pc = L.pants || '#4a3a2a';
            ctx.save(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#1c120a';
            ctx.fillStyle = wood; ctx.fillRect(px - 12, py - 28, 24, 30); ctx.strokeRect(px - 12, py - 28, 24, 30);
            ctx.fillStyle = '#7a5430'; ctx.fillRect(px - 14, py + 1, 28, 6); ctx.strokeRect(px - 14, py + 1, 28, 6);
            ctx.save(); ctx.beginPath(); ctx.rect(px - 40, py - 120, 80, 120 + 2); ctx.clip();
            try { Art.drawPlayer(ctx, px, py + 5, { x: 0, y: 1 }, 0, E, currentUser, true, { look: L, title: player.title || '' }); } catch (e) { }
            ctx.restore();
            ctx.fillStyle = pc; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(px + sx * 4.2 - 3.6, py + 1, 7.2, 9, 3) : ctx.rect(px + sx * 4.2 - 3.6, py + 1, 7.2, 9); ctx.fill(); ctx.stroke(); ctx.fillRect(px + sx * 4.2 - 3, py + 8, 6, 8); ctx.strokeRect(px + sx * 4.2 - 3, py + 8, 6, 8); ctx.fillStyle = '#2a1c12'; ctx.beginPath(); ctx.ellipse(px + sx * 4.2, py + 17, 4.4, 2.4, 0, 0, 6.3); ctx.fill(); ctx.stroke(); ctx.fillStyle = pc; }
            drawBook(ctx, px, py - 10, T);
            ctx.fillStyle = L.skin || '#f1c27d'; ctx.beginPath(); ctx.arc(px - 9.6, py - 6, 2.4, 0, 6.3); ctx.arc(px + 9.6, py - 6, 2.4, 0, 6.3); ctx.fill(); ctx.stroke();
            for (let i = 0; i < 4; i++) { const q = ((T * 0.45 + i / 4) % 1); ctx.fillStyle = 'rgba(190,150,255,' + (0.7 * (1 - q)) + ')'; ctx.beginPath(); ctx.arc(px + Math.sin(i * 2.3 + T) * 9, py - 18 - q * 22, 1.6, 0, 6.3); ctx.fill(); }
            ctx.restore();
        }
    }
    function stopTrain(msg, col) {
        if (!tr) return; const t = tr; tr = null; if (t.fk === 'hottub' && t.back) { player.x = t.back.x; player.y = t.back.y; player.destX = player.x; player.destY = player.y; }
        try { ensurePlayerFree(); } catch (e) { }
        setActionText(msg || (t.n ? 'Treino encerrado: +' + t.xp + ' XP em ' + t.n + ' sessão(ões).' : 'Treino interrompido.'), col || '#bdc3c7');
    }
    function startTrain(t) {
        const T = TRAIN[t.fk]; if (!T) return false;
        if (tr && tr.on) { stopTrain(); return true; }   // clicar de novo no móvel para
        tr = { on: true, fk: t.fk, id: t.id, t0: performance.now(), t0b: performance.now(), cyc: -1, cycT: 0, x: player.x, y: player.y, hp: player.stats.hp, n: 0, xp: 0, arrows: [], stuck: [], dir: 1, ent: t };
        poseSpot(t);
        setActionText(T.verb + '... (repete sozinho; ande ou clique de novo para parar)', '#e0b84a'); return true;
    }
    function trainTick() {
        if (!tr || !tr.on) return; const T = TRAIN[tr.fk];
        if (currentMap !== 'casa') { stopTrain(); return; }
        if (Math.hypot(player.x - tr.x, player.y - tr.y) > 30 || player.stats.hp < tr.hp || ed.on) { stopTrain(); return; }
        if (performance.now() - tr.t0 < trainSecs() * 1000) return;
        const fk = tr.fk, sk = player.stats.skills[T.skill]; if (!sk) { stopTrain(); return; }
        const xp = trainXpOf(fk); tr.t0 = performance.now(); tr.n++; tr.xp += xp;   // já começa a próxima sessão
        if (xp > 0) { try { addXP(T.skill, xp, true); } catch (e) { } }
        if (fk === 'hottub') { player.stats.hp = Math.min(player.stats.maxHp, player.stats.hp + Math.round(player.stats.maxHp * 0.25)); tr.hp = player.stats.hp; }
        setActionText(T.icon + ' +' + xp + ' XP de ' + Labels.skill(T.skill, sk.name) + '  (total ' + tr.xp + ')', '#2ecc71'); try { updateUI(); saveSoon(); } catch (e) { }
    }
    /* ---- Dev: XP de cada móvel de treino ---- */
    function ensureDevTab() {
        try { if (userRole !== 'admin') return; } catch (e) { return; }
        const bar = document.querySelector('#tab-dev .dev-sub-tabs'); if (!bar || document.getElementById('dev-train')) return;
        const btn = document.createElement('button'); btn.className = 'dev-sub-btn'; btn.textContent = 'Treino'; btn.onclick = function () { openDevSub('dev-train', btn); renderDevTrain(); }; bar.appendChild(btn);
        const box = document.createElement('div'); box.id = 'dev-train'; box.className = 'dev-sub-content'; bar.parentNode.appendChild(box);
    }
    function renderDevTrain() {
        const box = document.getElementById('dev-train'); if (!box) return; const m = gameMaps.casa;
        if (!m) { box.innerHTML = '<p style="opacity:.8">O mapa da casa ainda não existe.</p>'; return; }
        let h = '<div class="dev-form-group"><p style="margin:0 0 8px;font-size:.82rem;opacity:.85">XP <b>fixa</b> que cada móvel de treino da casa dá por sessão. O treino repete sozinho e não tem limite diário.</p>';
        Object.keys(TRAIN).forEach((k) => { h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="flex:1">' + TRAIN[k].icon + ' ' + esc(FURN[k].n) + ' <small style="opacity:.7">(' + esc(TRAIN[k].skill) + ')</small></span><input type="number" min="0" max="100000" step="1" class="dev-input" id="dt-' + k + '" value="' + trainXpOf(k) + '" style="width:90px"> XP</div>'; });
        h += '<div style="display:flex;align-items:center;gap:8px;margin:10px 0"><span style="flex:1">⏱ Segundos por sessão</span><input type="number" min="2" max="120" step="1" class="dev-input" id="dt-secs" value="' + trainSecs() + '" style="width:90px"></div><button class="dev-save-btn" id="dt-save">Salvar</button> <span id="dt-msg" style="font-size:.8rem;opacity:.85"></span></div>';
        box.innerHTML = h;
        document.getElementById('dt-save').onclick = () => {
            const xp = {}; Object.keys(TRAIN).forEach((k) => { const v = Math.round(Number(document.getElementById('dt-' + k).value)); xp[k] = Number.isFinite(v) && v >= 0 ? Math.min(100000, v) : TRAIN_DEF_XP; });
            const sc = Math.round(Number(document.getElementById('dt-secs').value)); m.trainXp = xp; m.trainSecs = Number.isFinite(sc) && sc >= 2 ? Math.min(120, sc) : TRAIN_DEF_SECS;
            try { saveDataLogic(false, true); } catch (e) { } const ms = document.getElementById('dt-msg'); if (ms) ms.textContent = 'Salvo ✔';
        };
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
        if (r.owner !== me() && !hctx.items.length) setTimeout(() => { try { setActionText('A casa de ' + r.owner + ' ainda não tem móveis.', '#f1c40f'); } catch (e) { } }, 1200);
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
    /* ---------- a sala (desenhada uma vez em um canvas e reaproveitada; só fogo, brasas e poeira animam) ---------- */
    let _room = null;
    function buildRoom() {
        const c = document.createElement('canvas'); c.width = 900; c.height = 640; const g = c.getContext('2d'); let seed = 7; const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        g.fillStyle = '#1a120c'; g.fillRect(0, 0, 900, 640);
        // piso de tábuas
        const fx = 62, fy = 150, fw = 776, fh = 412;
        const cols = ['#a8773f', '#9c6e39', '#b0814a', '#a07038'];
        for (let r = 0, y = fy; y < fy + fh; r++, y += 26) {
            let x = fx - (r % 3) * 40; while (x < fx + fw) { const len = 110 + Math.floor(R() * 90); g.fillStyle = cols[Math.floor(R() * cols.length)]; g.fillRect(Math.max(x, fx), y, Math.min(len, fx + fw - Math.max(x, fx)), 26); g.fillStyle = 'rgba(50,28,10,.55)'; g.fillRect(x + len - 1, y, 1.5, 26); x += len; }
            g.fillStyle = 'rgba(50,28,10,.6)'; g.fillRect(fx, y + 25, fw, 1.5);
            g.strokeStyle = 'rgba(80,45,15,.18)'; g.lineWidth = 1; for (let k = 0; k < 3; k++) { const gy = y + 5 + k * 7 + R() * 3, gx = fx + R() * fw; g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx + 40 + R() * 60, gy + R() * 2 - 1); g.stroke(); }
        }
        // sombras das paredes sobre o piso
        let gr = g.createLinearGradient(0, fy, 0, fy + 46); gr.addColorStop(0, 'rgba(25,12,4,.55)'); gr.addColorStop(1, 'rgba(25,12,4,0)'); g.fillStyle = gr; g.fillRect(fx, fy, fw, 46);
        gr = g.createLinearGradient(fx, 0, fx + 30, 0); gr.addColorStop(0, 'rgba(25,12,4,.45)'); gr.addColorStop(1, 'rgba(25,12,4,0)'); g.fillStyle = gr; g.fillRect(fx, fy, 30, fh);
        gr = g.createLinearGradient(fx + fw, 0, fx + fw - 30, 0); gr.addColorStop(0, 'rgba(25,12,4,.45)'); gr.addColorStop(1, 'rgba(25,12,4,0)'); g.fillStyle = gr; g.fillRect(fx + fw - 30, fy, 30, fh);
        // parede do fundo: papel de parede creme, friso e lambri de madeira
        g.fillStyle = '#e6d5b2'; g.fillRect(40, 40, 820, 112);
        g.fillStyle = 'rgba(160,120,70,.12)'; for (let x = 44; x < 860; x += 24) g.fillRect(x, 40, 10, 112);
        g.fillStyle = 'rgba(120,80,40,.1)'; for (let x = 52; x < 860; x += 24) { g.beginPath(); g.arc(x, 74, 2.4, 0, 6.3); g.arc(x, 112, 2.4, 0, 6.3); g.fill(); }
        g.fillStyle = '#6b4a2b'; g.fillRect(40, 112, 820, 40); g.fillStyle = '#7a5434'; for (let x = 44; x < 860; x += 54) { g.fillRect(x, 118, 46, 28); g.strokeStyle = 'rgba(30,15,5,.55)'; g.lineWidth = 1.5; g.strokeRect(x, 118, 46, 28); g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(x + 2, 120, 42, 4); g.fillStyle = '#7a5434'; }
        g.fillStyle = '#8a6238'; g.fillRect(40, 108, 820, 6); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(40, 108, 820, 1.5);   // corrimão
        g.fillStyle = '#3f2813'; g.fillRect(40, 148, 820, 6); g.fillStyle = '#2a1a0a'; g.fillRect(40, 30, 820, 14); g.fillStyle = '#5a3a1a'; g.fillRect(40, 44, 820, 5);   // rodapé e sanca
        // janelas com cortinas
        const win = (wx) => {
            const wy = 54, ww = 104, wh = 66;
            gr = g.createLinearGradient(0, wy, 0, wy + wh); gr.addColorStop(0, '#9fd4f4'); gr.addColorStop(0.7, '#d8efe0'); gr.addColorStop(1, '#9ccf86'); g.fillStyle = gr; g.fillRect(wx, wy, ww, wh);
            g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.ellipse(wx + 30, wy + 18, 14, 5, 0, 0, 6.3); g.ellipse(wx + 42, wy + 15, 10, 5, 0, 0, 6.3); g.fill(); g.fillStyle = '#ffe9a0'; g.beginPath(); g.arc(wx + 84, wy + 14, 6, 0, 6.3); g.fill();
            g.fillStyle = '#5f9a4a'; g.beginPath(); g.moveTo(wx, wy + wh); g.quadraticCurveTo(wx + 30, wy + wh - 22, wx + 62, wy + wh - 8); g.quadraticCurveTo(wx + 86, wy + wh - 16, wx + ww, wy + wh - 6); g.lineTo(wx + ww, wy + wh); g.fill();
            g.strokeStyle = '#4a2f16'; g.lineWidth = 5; g.strokeRect(wx, wy, ww, wh); g.lineWidth = 3; g.beginPath(); g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh); g.moveTo(wx, wy + wh / 2); g.lineTo(wx + ww, wy + wh / 2); g.stroke();
            g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 2; g.beginPath(); g.moveTo(wx + 8, wy + wh - 8); g.lineTo(wx + 22, wy + 8); g.stroke();
            g.fillStyle = '#6b4a2b'; g.fillRect(wx - 7, wy + wh, ww + 14, 6); g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(wx - 7, wy + wh, ww + 14, 1.5);
            g.fillStyle = '#8a2b3a'; g.beginPath(); g.moveTo(wx - 9, wy - 6); g.lineTo(wx + 16, wy - 6); g.quadraticCurveTo(wx + 22, wy + 30, wx + 10, wy + wh + 2); g.lineTo(wx - 9, wy + wh + 2); g.closePath(); g.fill();
            g.beginPath(); g.moveTo(wx + ww + 9, wy - 6); g.lineTo(wx + ww - 16, wy - 6); g.quadraticCurveTo(wx + ww - 22, wy + 30, wx + ww - 10, wy + wh + 2); g.lineTo(wx + ww + 9, wy + wh + 2); g.closePath(); g.fill();
            g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; for (const sx of [-1, 1]) for (let k = 1; k < 4; k++) { const bx = sx < 0 ? wx - 9 + k * 5 : wx + ww + 9 - k * 5; g.beginPath(); g.moveTo(bx, wy - 4); g.lineTo(bx + sx * 1, wy + wh); g.stroke(); }
            g.fillStyle = '#d9a93a'; g.fillRect(wx - 12, wy - 9, ww + 24, 4); g.beginPath(); g.arc(wx - 12, wy - 7, 3, 0, 6.3); g.arc(wx + ww + 12, wy - 7, 3, 0, 6.3); g.fill();
            // feixe de luz no piso
            g.save(); g.globalAlpha = 0.11; g.fillStyle = '#fff0b0'; g.beginPath(); g.moveTo(wx + 4, 158); g.lineTo(wx + ww - 4, 158); g.lineTo(wx + ww + 120, 330); g.lineTo(wx + 60, 330); g.closePath(); g.fill(); g.restore();
        };
        win(110); win(686);
        // quadros
        const frame = (qx, qy, qw, qh, kind) => { g.fillStyle = '#4a2f16'; g.fillRect(qx - 4, qy - 4, qw + 8, qh + 8); g.fillStyle = '#d9a93a'; g.fillRect(qx - 2, qy - 2, qw + 4, qh + 4); gr = g.createLinearGradient(0, qy, 0, qy + qh); gr.addColorStop(0, kind ? '#f3c78a' : '#a8d8f0'); gr.addColorStop(1, kind ? '#8a4a3a' : '#7fb06a'); g.fillStyle = gr; g.fillRect(qx, qy, qw, qh); g.fillStyle = kind ? '#3a2a4a' : '#4a7a5a'; g.beginPath(); g.moveTo(qx, qy + qh); g.lineTo(qx + qw * .35, qy + qh * .45); g.lineTo(qx + qw * .6, qy + qh * .75); g.lineTo(qx + qw * .8, qy + qh * .5); g.lineTo(qx + qw, qy + qh); g.fill(); };
        frame(274, 66, 46, 34, 0); frame(580, 66, 46, 34, 1);
        // lareira de pedra
        const lx = 400, ly = 62, lw = 100, lh = 90;
        g.fillStyle = '#8a8478'; g.fillRect(lx, ly + 10, lw, lh - 10); g.strokeStyle = 'rgba(40,36,30,.7)'; g.lineWidth = 1.2;
        for (let r = 0; r < 7; r++) for (let q = 0; q < 6; q++) { const bx = lx + q * 17 + (r % 2) * 8, by = ly + 12 + r * 12; g.fillStyle = ['#8f897d', '#7d776b', '#9a9488'][(r + q) % 3]; g.fillRect(bx, by, 16, 11); g.strokeRect(bx, by, 16, 11); }
        g.fillStyle = '#6b4a2b'; g.fillRect(lx - 8, ly, lw + 16, 12); g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(lx - 8, ly, lw + 16, 2); g.strokeStyle = '#1c120a'; g.lineWidth = 1.5; g.strokeRect(lx - 8, ly, lw + 16, 12);
        g.fillStyle = '#1a0f08'; g.beginPath(); g.moveTo(lx + 18, ly + lh); g.lineTo(lx + 18, ly + 38); g.quadraticCurveTo(lx + lw / 2, ly + 22, lx + lw - 18, ly + 38); g.lineTo(lx + lw - 18, ly + lh); g.closePath(); g.fill(); g.strokeStyle = '#3a2a1c'; g.lineWidth = 3; g.stroke();
        g.fillStyle = '#4a3a2a'; g.fillRect(lx + 26, ly + lh - 8, lw - 52, 6);   // lenha
        g.fillStyle = '#6a4a2a'; g.fillRect(lx + 30, ly + lh - 12, 40, 6); g.fillRect(lx + 44, ly + lh - 16, 36, 6);
        // velas no console
        for (const vx of [lx + 8, lx + lw - 14]) { g.fillStyle = '#f2ead2'; g.fillRect(vx, ly - 12, 6, 12); g.strokeStyle = '#1c120a'; g.lineWidth = 1; g.strokeRect(vx, ly - 12, 6, 12); }
        // plantas nos cantos, tapete da porta
        const pot = (px, py) => { g.fillStyle = '#b8683a'; g.beginPath(); g.moveTo(px - 10, py); g.lineTo(px + 10, py); g.lineTo(px + 7, py + 16); g.lineTo(px - 7, py + 16); g.closePath(); g.fill(); g.strokeStyle = '#3a1c0a'; g.lineWidth = 1.5; g.stroke(); g.fillStyle = '#3f8a4a'; for (let k = 0; k < 7; k++) { const a = -1.9 + k * 0.5; g.beginPath(); g.ellipse(px + Math.cos(a) * 9, py - 8 + Math.sin(a) * 9, 4, 9, a + 1.57, 0, 6.3); g.fill(); g.stroke(); } };
        pot(82, 178); pot(818, 178);
        g.fillStyle = '#8a2b2b'; g.fillRect(426, 536, 48, 24); g.strokeStyle = '#d9a93a'; g.lineWidth = 2; g.strokeRect(430, 540, 40, 16); g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1; g.strokeRect(426, 536, 48, 24);
        // paredes laterais e da frente (madeira escura com brilho interno)
        g.fillStyle = '#4a2f16'; g.fillRect(30, 30, 32, 560); g.fillRect(838, 30, 32, 560); g.fillRect(30, 560, 392, 30); g.fillRect(478, 560, 392, 30);
        g.fillStyle = '#6b4a2b'; g.fillRect(58, 150, 4, 410); g.fillRect(838, 150, 4, 410); g.fillRect(62, 556, 360, 4); g.fillRect(478, 556, 360, 4);
        g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(30, 30, 3, 560); g.fillRect(838, 30, 3, 560);
        g.strokeStyle = 'rgba(20,10,4,.6)'; g.lineWidth = 1.5; for (let y = 60; y < 590; y += 40) { g.beginPath(); g.moveTo(30, y); g.lineTo(62, y); g.moveTo(838, y); g.lineTo(870, y); g.stroke(); }
        // batente da porta
        g.fillStyle = '#3f2813'; g.fillRect(414, 556, 10, 36); g.fillRect(476, 556, 10, 36); g.fillRect(414, 552, 72, 8); g.fillStyle = '#d9a93a'; g.fillRect(414, 552, 72, 2);
        // luz suave geral
        gr = g.createRadialGradient(450, 330, 80, 450, 330, 520); gr.addColorStop(0, 'rgba(255,200,120,.10)'); gr.addColorStop(1, 'rgba(10,5,0,.28)'); g.fillStyle = gr; g.fillRect(40, 40, 820, 530);
        return c;
    }
    function drawRoom(ctx, o, T) {
        if (!_room) _room = buildRoom(); ctx.drawImage(_room, o.x, o.y);
        const t = T || 0;
        // brilho quente da lareira no piso
        const fl = 0.16 + 0.05 * Math.sin(t * 7) + 0.03 * Math.sin(t * 13.3);
        const gr = ctx.createRadialGradient(450, 200, 10, 450, 210, 190); gr.addColorStop(0, 'rgba(255,170,70,' + fl + ')'); gr.addColorStop(1, 'rgba(255,170,70,0)'); ctx.fillStyle = gr; ctx.fillRect(250, 156, 400, 220);
        // fogo
        ctx.save(); ctx.beginPath(); ctx.rect(418, 100, 64, 52); ctx.clip();
        for (let i = 0; i < 6; i++) { const ph = t * 3 + i * 1.7, fx = 432 + i * 7.5 + Math.sin(ph) * 2, hh = 20 + 8 * Math.sin(ph * 1.3 + i), col = i % 2 ? '#ff9a2a' : '#ff5a1a'; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(fx - 5, 150); ctx.quadraticCurveTo(fx - 4 + Math.sin(ph) * 3, 150 - hh * 0.6, fx + Math.sin(ph * 1.2) * 2, 150 - hh); ctx.quadraticCurveTo(fx + 4, 150 - hh * 0.5, fx + 5, 150); ctx.closePath(); ctx.fill(); }
        ctx.fillStyle = '#ffe27a'; for (let i = 0; i < 3; i++) { const ph = t * 4 + i * 2.1, fx = 440 + i * 10; ctx.beginPath(); ctx.moveTo(fx - 3, 150); ctx.quadraticCurveTo(fx, 150 - 14 - 5 * Math.sin(ph), fx + 3, 150); ctx.fill(); }
        ctx.restore();
        ctx.fillStyle = 'rgba(255,230,150,' + (0.35 + 0.15 * Math.sin(t * 9)) + ')'; for (const vx of [411, 485]) { ctx.beginPath(); ctx.ellipse(vx, 44, 3, 5, 0, 0, 6.3); ctx.fill(); }
        // brasas e poeira de luz
        for (let i = 0; i < 5; i++) { const q = (t * 0.5 + i / 5) % 1; ctx.fillStyle = 'rgba(255,190,90,' + (0.8 * (1 - q)) + ')'; ctx.fillRect(436 + Math.sin(i * 3 + t) * 16, 140 - q * 40, 1.6, 1.6); }
        ctx.fillStyle = 'rgba(255,245,200,.35)'; for (let i = 0; i < 10; i++) { const x = 130 + ((i * 97 + t * 6) % 220) + (i > 5 ? 576 : 0) * 0, y = 170 + ((i * 53 + t * 5) % 150); ctx.fillRect(x, y, 1.5, 1.5); ctx.fillRect(x + 576, y, 1.5, 1.5); }
    }
    /* ---------- móveis girados: vistas de frente / costas / lado com profundidade e sombra (não é mais a arte frontal girada) ---------- */
    const WOOD = '#8b6238', WOODD = '#5a3a1a', WOODK = '#3a2410';
    let _lay = null;
    function layerCtx(w, h) { if (!_lay) _lay = document.createElement('canvas'); if (_lay.width < w) _lay.width = w; if (_lay.height < h) _lay.height = h; const c = _lay.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, _lay.width, _lay.height); return c; }
    const gshadow = (c, x, y, w, h) => { c.fillStyle = 'rgba(0,0,0,.27)'; c.beginPath(); c.ellipse(x + w / 2 + 3, y + h - 1, w * .56, Math.min(9, 4 + w * .05), 0, 0, 6.3); c.fill(); };
    const frect = (c, x, y, w, h, f) => { c.fillStyle = f; c.fillRect(x, y, w, h); c.strokeRect(x, y, w, h); };
    /* arte frontal escurecida (e espelhada) — usada para costas e para perfis de peças simétricas */
    function darkArt(ctx, o, T, k, sx, dark) {
        const f = FURN[k], PAD = 26, lw = f.w + PAD * 2, lh = f.h + PAD * 2, c = layerCtx(lw, lh);
        drawEntity(c, Object.assign({}, o, { rot: 0, ns: true, x: PAD, y: PAD, w: f.w, h: f.h }), T);
        c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(14,8,2,' + dark + ')'; c.fillRect(0, 0, lw, lh); c.globalCompositeOperation = 'source-over';
        const cx = o.x + o.w / 2, by = o.y + o.h;
        ctx.save(); ctx.translate(cx, by); ctx.scale(sx, 1); ctx.drawImage(_lay, 0, 0, lw, lh, -f.w / 2 - PAD, -f.h - PAD, lw, lh); ctx.restore();
    }
    function boxEnd(c, x, y, w, h, Hg, topCol, faceCol, T, orb) {   // caixa vista pela ponta: face frontal em baixo, tampo (mais claro) por cima
        const fy = y + h - Hg, th = Math.max(8, h - Hg), ty = fy - th, ins = Math.min(6, w * .09);
        c.fillStyle = topCol; c.beginPath(); c.moveTo(x + ins, ty); c.lineTo(x + w - ins, ty); c.lineTo(x + w, fy); c.lineTo(x, fy); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = 'rgba(255,255,255,.1)'; c.beginPath(); c.moveTo(x + ins + 3, ty + 3); c.lineTo(x + w - ins - 3, ty + 3); c.lineTo(x + w - 5, ty + th * .45); c.lineTo(x + 5, ty + th * .45); c.closePath(); c.fill();
        frect(c, x, fy, w, Hg, faceCol);
        c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(x + w * .62, fy + 1, w * .38 - 1, Hg - 2);   // lado de sombra
        c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 1; c.strokeRect(x + 6, fy + 5, w - 12, Hg - 13); c.lineWidth = 2; c.strokeStyle = '#1c120a';
        c.fillStyle = WOODK; c.fillRect(x + 1, y + h - 6, w - 2, 5);
        if (orb) { c.fillStyle = 'rgba(160,120,255,' + (0.3 + 0.2 * Math.sin(T * 2.5)).toFixed(2) + ')'; c.beginPath(); c.arc(x + w / 2, ty + th * .38, 4.5, 0, 6.3); c.fill(); }
    }
    function drawTurned(ctx, o, T, k, r) {
        const x = o.x, y = o.y, w = o.w, h = o.h, f = FURN[k]; ctx.lineWidth = 2; ctx.strokeStyle = '#1c120a';
        const flipH = r === 3;
        if (k === 'bed') {   // vista de cima girada, mas com a moldura (parede lateral) e sombra: tem espessura
            gshadow(ctx, x, y, w, h); ctx.fillStyle = WOODK; ctx.fillRect(x + 1, y + h - 8, w - 2, 8); ctx.strokeRect(x + 1, y + h - 8, w - 2, 8);
            const cx = x + w / 2, cy = y + h / 2 - 5, w0 = f.w, h0 = f.h;
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(r * Math.PI / 2); drawEntity(ctx, Object.assign({}, o, { rot: 0, ns: true, x: -w0 / 2, y: -h0 / 2, w: w0, h: h0 }), T); ctx.restore();
            ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.fillRect(x + w * .6, y + 2, w * .4 - 1, h - 12); return;
        }
        gshadow(ctx, x, y, w, h);
        if (r === 2) {   // costas
            if (k === 'library' || k === 'shelf') { frect(ctx, x, y, w, h, WOODD); ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1; for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x + w * i / 6, y + 2); ctx.lineTo(x + w * i / 6, y + h - 2); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(x + 3, y + 4); ctx.lineTo(x + w - 3, y + h - 6); ctx.moveTo(x + w - 3, y + 4); ctx.lineTo(x + 3, y + h - 6); ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = '#1c120a'; ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x + w * .66, y + 1, w * .34 - 1, h - 2); frect(ctx, x, y + h - 6, w, 6, WOODK); if (k === 'library') { ctx.fillStyle = 'rgba(160,120,255,' + (0.25 + 0.2 * Math.sin(T * 2.5)).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(x + w - 12, y - 4, 4, 0, 6.3); ctx.fill(); } return; }
            if (k === 'chair') { frect(ctx, x + 3, y, w - 6, h * .55, WOODD); ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + w / 2, y + 2); ctx.lineTo(x + w / 2, y + h * .55 - 2); ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = '#1c120a'; frect(ctx, x, y + h * .55, w, 5, WOOD); frect(ctx, x + 2, y + h * .55 + 5, 5, h * .45 - 5, WOODK); frect(ctx, x + w - 7, y + h * .55 + 5, 5, h * .45 - 5, WOODK); return; }
            if (k === 'archery') { const cx = x + w / 2, cy = y + h * .36, R = Math.min(w, h) * .42; frect(ctx, x + w * .1, y + h * .55, w * .08, h * .45, WOODK); frect(ctx, x + w * .82, y + h * .55, w * .08, h * .45, WOODK); ctx.fillStyle = '#7a5a34'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.3); ctx.fill(); ctx.stroke(); ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(cx - R * .8, cy); ctx.lineTo(cx + R * .8, cy); ctx.moveTo(cx, cy - R * .8); ctx.lineTo(cx, cy + R * .8); ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = '#1c120a'; ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.arc(cx, cy, R, -1.5, 1.6); ctx.lineTo(cx, cy); ctx.fill(); return; }
            darkArt(ctx, o, T, k, -1, 0.2); return;   // mesa, manequim, saco, banheira, troféus: espelhado e mais escuro
        }
        if (r === 0) { drawEntityFront(ctx, o, T, k); return; }
        // lados (r = 1 ou 3)
        ctx.save(); if (flipH) { ctx.translate(x + w / 2, 0); ctx.scale(-1, 1); ctx.translate(-(x + w / 2), 0); }
        if (k === 'library') boxEnd(ctx, x, y, w, h, f.h, '#6b4a2b', '#4a2f18', T, true);
        else if (k === 'shelf') boxEnd(ctx, x, y, w, h, f.h, '#7a5430', '#5a3a1a', T, false);
        else if (k === 'table') { const fy = y + h - 17, ins = 5; ctx.fillStyle = '#9a7040'; ctx.beginPath(); ctx.moveTo(x + ins, y); ctx.lineTo(x + w - ins, y); ctx.lineTo(x + w, fy); ctx.lineTo(x, fy); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(x + 8, y + 4, w - 16, 8); frect(ctx, x, fy, w, 6, WOOD); frect(ctx, x + 3, fy + 6, 6, 11, WOODD); frect(ctx, x + w - 9, fy + 6, 6, 11, WOODD); ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x + w * .62, fy + 1, w * .38 - 1, 4); ctx.fillStyle = '#e8d29a'; ctx.beginPath(); ctx.arc(x + w * .4, y + (fy - y) * .45, 4, 0, 6.3); ctx.fill(); ctx.stroke(); }
        else if (k === 'chair') { frect(ctx, x + 3, y, 6, h - 3, WOODD); frect(ctx, x + 3, y + h * .5, w - 6, 6, WOOD); frect(ctx, x + 4, y + h * .5 + 6, 5, h * .5 - 7, WOODK); frect(ctx, x + w - 10, y + h * .5 + 6, 5, h * .5 - 7, WOODK); ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x + 6, y + 1, 2, h - 5); }
        else if (k === 'archery') { const cx = x + w / 2, cy = y + h * .36, R = Math.min(w, h) * .42; frect(ctx, cx - 3, y + h * .5, 6, h * .5, WOODK); ctx.fillStyle = '#f2ead2'; ctx.beginPath(); ctx.ellipse(cx, cy, 5, R, 0, 0, 6.3); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#b03a3a'; ctx.beginPath(); ctx.ellipse(cx + 2.4, cy, 2.2, R * .44, 0, 0, 6.3); ctx.fill(); ctx.strokeStyle = '#d8d0b0'; ctx.beginPath(); ctx.moveTo(cx + 6, cy - 3); ctx.lineTo(cx + R * .9, cy - R * .5); ctx.stroke(); }
        else darkArt(ctx, o, T, k, f.w ? (SQUEEZE[k] || 0.8) : 0.8, 0.14);   // peças redondas/simétricas: perfil mais estreito e sombreado
        ctx.restore();
    }
    const SQUEEZE = { dummy: 0.64, punchbag: 0.9, hottub: 1, trophy_dragon: 0.78, trophy_lich: 0.82 };
    function drawEntityFront(ctx, o, T, k) { drawEntity(ctx, Object.assign({}, o, { rot: 0 }), T); }

    function drawEntity(ctx, o, T) {
        const x = o.x, y = o.y, w = o.w || 40, h = o.h || 40, t = o.type;
        const shadow = () => { if (o.ns) return; ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h, w * .52, 5, 0, 0, 6.3); ctx.fill(); };
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
        if (o.rot && FURN[k]) { drawTurned(ctx, o, T, k, o.rot & 3); return; }
        shadow();
        const swy = swayAngle(o, k); if (swy) { const pvx = x + w / 2, pvy = k === 'punchbag' ? y + h * 0.06 : y + h * 0.95; ctx.save(); ctx.translate(pvx, pvy); ctx.rotate(swy); ctx.translate(-pvx, -pvy); }
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
        if (swy) ctx.restore();
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
        setInterval(tickBtn, 400); setInterval(trainTick, 250); setInterval(ensureDevTab, 2000);
        // visita: reconstrói a sala se o mundo foi recarregado por baixo (sem sala/móveis) e acompanha mudanças do dono em tempo real
        setInterval(() => { try { if (currentMap !== 'casa') return; const m = gameMaps.casa; if (m && !(m.entities || []).some((o) => o && o.room)) refreshHouse(); } catch (e) { } }, 1200);
        setInterval(async () => {
            try {
                if (currentMap !== 'casa' || !hctx || hctx.owner === me() || ed.on) return;
                const r = await api('/house', { a: 'enter', owner: hctx.owner }); if (!r || !r.ok || !Array.isArray(r.items) || currentMap !== 'casa' || !hctx || hctx.owner === me()) return;
                if (JSON.stringify(r.items) !== JSON.stringify(hctx.items)) { hctx.items = r.items; refreshHouse(); }
            } catch (e) { }
        }, 7000);
    }
    window.addEventListener('load', wire);
    window.World2 = { houseKey: () => (hctx && hctx.owner ? 'casa_' + String(hctx.owner).toLowerCase().replace(/[^\w\-]/g, '_').slice(0, 34) : null), ITEMS, CREATURES, FURN, HOUSE_MAX, record, kills, beastList, beastProgress, placeInWorld, merge, drawEntity, enterHouse, editDoor, openDecor, buy, refreshHouse, drawOverlay, onLogin, TRAIN, trainPose, trainState, remotePose, remoteDeco, drawRoom, inRoom: (x, y) => x > 70 && x < 830 && y > 160 && y < 552, training: () => !!(tr && tr.on), buildCatacombs, buildHouseShell };
})();
