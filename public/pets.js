/* MiniScape 2D — Pets e Montarias.
   PETS: 12 companheiros (itens "Pet X": drop raro, pesca/baús, loja). Um pet equipado segue o dono (steering suave, colisão simples, teletransporte com poeira se ficar preso),
   dá bônus em % e tem modos: Seguir / Atacar / Coletar itens / Coletar moedas / Coletar tudo. Ganha XP quando o jogador ganha XP (nível máx. 10).
   MONTARIAS: 9 selas ("Sela X"): velocidade em % (tecla V ou botão). Velocidade + bônus; LUTA montado (melee, arco e magia). Pets nível 10+ também são montáveis, mas NÃO se luta montado no pet. Desmonta em interior/loja/banco/pesca.
   Dados no jogador: player.pet {id,name,lvl,xp,mode}, player.pets {id:{lvl,xp,name}}, player.mounts {id:{lvl 1..30,xp,name?}} (formato antigo 1 é migrado), player.mount (id escolhido). Nada disso é fonte de verdade no servidor
   (cleanPetData/cleanPetSync em extras.js só sanitizam). O pet roda 100% no cliente; os outros jogadores veem `pet` {id,l} e `mount` pelo /sync e desenham o seguidor localmente.
   Integração com atributos: Pets.bonus() -> {xp,luck,spd,crit,dmg,coins,regen,mregen} em %. Crítico e sorte de drop entram no sistema de atributos como fonte 'pets'
   (Stats.addSource: o jogo aplica no golpe e no loot); a velocidade (pet + montaria) soma com itens/correr e o TOTAL tem teto de +80% (player.speed é ajustado só durante update());
   XP, dano, moedas e regeneração em % são aplicados aqui (wrappers de addXP/applyDamage/update + pós-processamento do loot). Sem window.Stats, crítico e sorte também são aplicados aqui. */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const TAU = Math.PI * 2, rnd = Math.random, hyp = Math.hypot, clamp = (v, a, b) => v < a ? a : v > b ? b : v;
    const say = (t, c) => { try { setActionText(t, c || '#f1c40f'); } catch (e) { } };
    const sfx = (n) => { try { window.Sfx && Sfx.play(n); } catch (e) { } };
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const sr = (v) => { const f = Math.floor(v); return f + (rnd() < v - f ? 1 : 0); };   // arredondamento estocástico (bônus pequenos em números inteiros)
    const gameOn = () => typeof player !== 'undefined' && player && player.stats && $('game-wrapper') && $('game-wrapper').style.display !== 'none';

    /* ============================ DADOS ============================ */
    const RARN = ['Comum', 'Incomum', 'Raro', 'Épico', 'Lendário'], RARC = ['#cfd6de', '#6ff09a', '#6ab7ff', '#c58bff', '#ffb347'];
    const STN = { xp: 'XP', luck: 'Sorte de drop', spd: 'Velocidade', crit: 'Crítico', dmg: 'Dano', coins: 'Moedas', regen: 'Regen. de vida', mregen: 'Regen. de mana' };
    const PET_MLVL = 10, PM_MUL = 1.5, PM_SPD = 8, MAXLVL = 10, SPD_CAP = 80,   // pet nível 10+ vira montaria: bônus x1,5 só montado, +8% (+2% por raridade) de velocidade
     COLLECT_R = 160, COLLECT_CD = 72;
    // id: [nome, raridade, {atributos % no nível 1}, voa?, dica de onde vem]
    const PETS = {
        gato: ['Gato', 0, { coins: 4, spd: 2 }, 0, 'Loja do Mercador, ratos e pesca'],
        cachorro: ['Cachorro', 0, { xp: 2, dmg: 3 }, 0, 'Goblins e javalis (raro)'],
        coelho: ['Coelho', 0, { spd: 4, luck: 2 }, 0, 'Loja do Fazendeiro e coelhos'],
        raposa: ['Raposa', 1, { luck: 4, crit: 2 }, 0, 'Cervos, cobras e baús de pesca'],
        coruja: ['Coruja', 1, { xp: 4, mregen: 8 }, 1, 'Morcegos e magos sombrios'],
        slime: ['Slime', 1, { regen: 8, coins: 3 }, 0, 'Gosmas'],
        lobinho: ['Lobinho', 2, { dmg: 5, crit: 3 }, 0, 'Lobos e trolls'],
        fada: ['Fada', 2, { luck: 5, mregen: 10, regen: 4 }, 1, 'Fantasmas e baús de pesca'],
        golem: ['Golem Mini', 2, { dmg: 4, regen: 8 }, 0, 'Golens de pedra'],
        dragao_gelo: ['Dragãozinho de Gelo', 3, { xp: 6, regen: 10, crit: 2 }, 0, 'Filhotes de dragão e o Lich Rei'],
        dragao_fogo: ['Dragãozinho de Fogo', 3, { dmg: 7, crit: 4, xp: 3 }, 0, 'Filhotes de dragão e o Dragão Ancestral'],
        fenix: ['Fênix Filhote', 4, { xp: 8, luck: 6, coins: 8, regen: 10 }, 1, 'Dragão Ancestral, Colosso e peixes lendários']
    };
    // id: [nome, raridade, velocidade %, voa?, dica]
    const MOUNTS = {
        cav_marrom: ['Cavalo Marrom', 0, 40, 0, 'Loja do Fazendeiro ou criar (couro + ferro)'],
        cav_branco: ['Cavalo Branco', 1, 45, 0, 'Loja do Mercador'],
        cav_guerra: ['Cavalo de Guerra', 2, 50, 0, 'Orcs, trolls e cavaleiros esqueléticos'],
        lobo_gigante: ['Lobo Gigante', 2, 55, 0, 'Lobos e trolls'],
        pantera: ['Pantera das Sombras', 3, 66, 0, 'Lich Rei Ossian'],
        cav_esqueleto: ['Cavalo Esqueleto', 3, 62, 0, 'Esqueletos e Lich Rei Ossian'],
        cav_fogo: ['Cavalo de Fogo', 3, 70, 0, 'Dragões e o Colosso'],
        unicornio: ['Unicórnio', 4, 72, 0, 'Colosso e baús de pesca'],
        dragao: ['Dragão Jovem', 4, 80, 1, 'Dragão Ancestral']
    };
    const PET_IDS = Object.keys(PETS), MOUNT_IDS = Object.keys(MOUNTS);
    /* ---- evolução das montarias: nível 1..30, XP própria (cavalgar), estágios visuais nos níveis 10/20/30 ----
       velocidade = base * (1 + até 20% relativo no nível 30), sempre sob o teto global SPD_CAP; bônus secundário por espécie ganha +valor a cada estágio (só montado). */
    const MLVL = 30, MXP_PX = 40, MXP_SEC = 10, STAGEN = ['Filhote', 'Adestrada', 'Veterana', 'Lendária'];
    const mNeed = (l) => Math.round(250 * Math.pow(1.2, l - 1));   // mesma curva do servidor (extras.js)
    const mStage = (l) => Math.min(3, Math.floor((l | 0) / 10));
    const MSEC = { cav_marrom: ['coins', 2, 'Moedas'], cav_branco: ['regen', 3, 'Regen. de vida'], cav_guerra: ['xp', 2, 'XP'], lobo_gigante: ['luck', 2, 'Sorte de drop'], pantera: ['luck', 2, 'Sorte de drop'],
        cav_esqueleto: ['mregen', 4, 'Regen. de mana'], cav_fogo: ['xp', 2, 'XP'], unicornio: ['regen', 4, 'Regen. de vida'], dragao: ['xp', 3, 'XP'] };
    const MSTAGE_DESC = { cav_marrom: ['Arreios de couro', 'Armadura de cavalo de guerra e aura', 'Penacho e aura forte com faíscas'], cav_branco: ['Arreios de couro', 'Armadura de cavalo de guerra e aura', 'Penacho e aura forte com faíscas'],
        cav_guerra: ['Arreios reforçados', 'Aura de guerra', 'Penacho e aura forte com faíscas'], lobo_gigante: ['Arreios', 'Aura gélida', 'Crista dourada e aura forte'], pantera: ['Arreios', 'Aura sombria', 'Crista dourada e aura forte'],
        cav_esqueleto: ['Arreios', 'Aura espectral', 'Aura espectral forte'], cav_fogo: ['Arreios', 'Rastro de brasas e aura', 'Penacho e aura forte'], unicornio: ['Arreios dourados', 'Aura de brilho', 'Penacho e aura forte'],
        dragao: ['Arreios e +5% de tamanho', 'Aura e +10% de tamanho', '+15% de tamanho e aura forte'] };
    const MODES = { follow: 'Seguir apenas', attack: 'Atacar (ajuda na luta)', items: 'Coletar itens', coins: 'Coletar só moedas', all: 'Coletar tudo' };
    const petItem = (id) => 'Pet ' + PETS[id][0], mountItem = (id) => 'Sela ' + MOUNTS[id][0];
    const dropMul = { v: 1 };   // multiplicador global de chance (balanceamento)

    // chances de drop por criatura (dbKey): ['pet:id'|'mount:id', chance]
    const DROP = {
        rat_base: [['pet:gato', 0.006]], rabbit_base: [['pet:coelho', 0.008]], chicken_base: [['pet:coelho', 0.002]], goblin_base: [['pet:cachorro', 0.004]],
        wolf_base: [['pet:lobinho', 0.008], ['mount:lobo_gigante', 0.003]], boar_base: [['pet:cachorro', 0.003]], bat_base: [['pet:coruja', 0.006]], spider_base: [['pet:coruja', 0.003]],
        slime_base: [['pet:slime', 0.01]], snake_base: [['pet:raposa', 0.004]], deer_base: [['pet:raposa', 0.005]], ghost_base: [['pet:fada', 0.012]],
        darkmage_base: [['pet:coruja', 0.012], ['pet:fada', 0.006]], skeleton_base: [['mount:cav_esqueleto', 0.002]], orc_base: [['mount:cav_guerra', 0.004]],
        skeleton_knight: [['mount:cav_esqueleto', 0.01], ['mount:cav_guerra', 0.006]], troll_base: [['pet:lobinho', 0.03], ['mount:lobo_gigante', 0.02], ['mount:cav_guerra', 0.01]],
        golem_base: [['pet:golem', 0.07]], whelp_base: [['pet:dragao_fogo', 0.04], ['pet:dragao_gelo', 0.04], ['mount:cav_fogo', 0.01]],
        dragon_boss: [['pet:dragao_fogo', 0.15], ['pet:fenix', 0.04], ['mount:dragao', 0.06], ['mount:cav_fogo', 0.08]],
        lich_boss: [['mount:cav_esqueleto', 0.3], ['pet:dragao_gelo', 0.1], ['mount:pantera', 0.12]],
        wboss_golem: [['pet:golem', 0.4], ['mount:cav_fogo', 0.12], ['pet:fenix', 0.05], ['mount:unicornio', 0.04]]
    };
    const SRC = {
        chest: [['pet:raposa', 0.04], ['pet:fada', 0.02], ['mount:cav_branco', 0.03], ['mount:unicornio', 0.01]],
        fish: [['pet:gato', 0.03], ['pet:slime', 0.02], ['pet:fenix', 0.004]]
    };

    /* ============================ ESTADO ============================ */
    const P = { ref: null, mounted: false, pm: false, ver: 0, bc: null, bcV: -1, fol: Object.create(null), others: Object.create(null), tgt: null, tgtT: 0, cd: 0, atkCd: 0, scanT: 0, skip: Object.create(null), fullT: 0, regenAcc: 0, mregenAcc: 0,
        mst: Object.create(null), solidsMap: '', solids: [], solidsT: 0, lastMap: '', ownerIdle: 0, flash: 0, ui: { tab: 'pet', open: false }, lastSig: '', gotAny: false, dustAcc: 0 };

    function ensure() {
        if (!gameOn()) return false;
        if (P.ref !== player) { P.ref = player; P.mounted = false; P.pm = false; P.tgt = null; P.skip = Object.create(null); P.fol = Object.create(null); P.lastMap = ''; bump(); }
        if (!player.pets || typeof player.pets !== 'object' || Array.isArray(player.pets)) player.pets = {};
        if (!player.mounts || typeof player.mounts !== 'object' || Array.isArray(player.mounts)) player.mounts = {};
        for (const k of Object.keys(player.pets)) if (!PETS[k]) delete player.pets[k];
        for (const k of Object.keys(player.mounts)) { if (!MOUNTS[k]) { delete player.mounts[k]; continue; } const m = player.mounts[k];
            if (!m || typeof m !== 'object' || Array.isArray(m)) player.mounts[k] = { lvl: 1, xp: 0 }; else { m.lvl = clamp(Math.floor(m.lvl) || 1, 1, MLVL); m.xp = m.lvl >= MLVL ? 0 : Math.max(0, Math.min(mNeed(m.lvl) - 1, Math.floor(m.xp) || 0)); if (typeof m.name !== 'string') delete m.name; } }
        const p = player.pet;
        if (p && (!PETS[p.id] || !player.pets[p.id])) { if (p && PETS[p.id]) player.pets[p.id] = { lvl: clamp(p.lvl | 0 || 1, 1, MAXLVL), xp: Math.max(0, p.xp | 0) }; else player.pet = null; }
        if (player.pet) { const pp = player.pet, s = player.pets[pp.id]; if (s) { pp.lvl = clamp(s.lvl | 0 || 1, 1, MAXLVL); pp.xp = Math.max(0, s.xp | 0); pp.name = s.name || ''; } if (!MODES[pp.mode]) pp.mode = 'follow'; }
        if (player.mount && !player.mounts[player.mount]) player.mount = null;
        if (!player.mount) { const k = Object.keys(player.mounts)[0]; if (k) player.mount = k; }
        return true;
    }
    const mLvl = (id) => (player.mounts && player.mounts[id] && player.mounts[id].lvl) | 0 || 1;
    const mountSpd = (id, lvl) => r1(MOUNTS[id][2] * (1 + 0.2 * (clamp(lvl | 0 || 1, 1, MLVL) - 1) / (MLVL - 1)));
    const mountSec = (id, lvl) => { const d = MSEC[id]; return d ? { k: d[0], v: d[1] * mStage(lvl), label: d[2], per: d[1] } : null; };
    const mountName = (id) => { const m = player.mounts && player.mounts[id]; return (m && m.name) || MOUNTS[id][0]; };
    const petDef = (id) => PETS[id] && { id, name: PETS[id][0], rar: PETS[id][1], st: PETS[id][2], fly: !!PETS[id][3], where: PETS[id][4] };
    const mountDef = (id) => MOUNTS[id] && { id, name: MOUNTS[id][0], rar: MOUNTS[id][1], spd: MOUNTS[id][2], fly: !!MOUNTS[id][3], where: MOUNTS[id][4] };
    const pmSpd = (id) => PM_SPD + 2 * PETS[id][1];
    const petCan = () => !!(player.pet && PETS[player.pet.id] && player.pet.lvl >= PET_MLVL);
    const lvlMul = (l) => 1 + (clamp(l | 0, 1, MAXLVL) - 1) * 0.06;
    const r1 = (v) => Math.round(v * 10) / 10;
    function petStats(id, lvl) { const d = PETS[id]; if (!d) return {}; const o = {}; for (const k of Object.keys(d[2])) o[k] = r1(d[2][k] * lvlMul(lvl)); return o; }
    const needXP = (l) => Math.round(70 * Math.pow(1.45, l - 1));
    const fmtPct = (v) => '+' + String(r1(v)).replace('.', ',') + '%';

    /* ---- bônus ---- */
    function bonus() {
        if (P.bcV === P.ver && P.bc) return P.bc;
        const b = { xp: 0, luck: 0, spd: 0, crit: 0, dmg: 0, coins: 0, regen: 0, mregen: 0 };
        try {
            if (gameOn() && P.pm && player.pet && PETS[player.pet.id] && player.pet.lvl >= PET_MLVL) { const s = petStats(player.pet.id, player.pet.lvl); for (const k of Object.keys(s)) b[k] += s[k] * PM_MUL; b.spd += pmSpd(player.pet.id); }   // atributos do pet: SÓ montado
            if (gameOn() && P.mounted && player.mount && MOUNTS[player.mount]) { const lv = mLvl(player.mount); b.spd += mountSpd(player.mount, lv); const sc = mountSec(player.mount, lv); if (sc && sc.v > 0) b[sc.k] += sc.v; }
        } catch (e) { }
        b.spd = Math.min(SPD_CAP, b.spd); P.bc = b; P.bcV = P.ver; return b;
    }
    // crítico e sorte de drop passam pelo sistema de atributos (Stats) quando ele existe: registramos a fonte 'pets' e ele aplica no golpe/drop.
    const viaStats = () => !!(window.Stats && typeof Stats.hasSource === 'function' && Stats.hasSource('pets'));
    function registerStats() {
        try { if (window.Stats && typeof Stats.addSource === 'function' && !Stats.hasSource('pets')) Stats.addSource('pets', () => { const b = bonus(); return { crit: b.crit, luck: b.luck }; }); } catch (e) { }
    }
    const bump = () => { P.ver++; try { if (window.Stats && Stats.invalidate) Stats.invalidate(); } catch (e) { } };
    const luckMul = () => { try { if (viaStats() && Stats.luckMul) return Stats.luckMul(); } catch (e) { } return 1 + bonus().luck / 100; };
    // velocidade: pet + montaria somam com os atributos/correr e o total nunca passa de +80% (SPD_CAP)
    function speedFactor() {   // multiplicador para player.speed (o Stats.spd depois aplica (1+bônus dele))
        const mine = bonus().spd; if (!(mine > 0)) return 1;
        let their = 0; try { if (window.Stats && Stats.moveBonus) their = Stats.moveBonus(); } catch (e) { }
        const total = Math.min(SPD_CAP, their + mine); return (1 + total / 100) / (1 + their / 100);
    }

    /* ============================ ITENS ============================ */
    const ICONC = { 0: '#8a8f98', 1: '#3f9a58', 2: '#3a76b8', 3: '#8e4fc0', 4: '#d8902a' };
    function bonusText(id) { const s = petStats(id, 1); return Object.keys(s).map((k) => fmtPct(s[k]) + ' ' + STN[k]).join(', '); }
    function buildItems() {
        const it = {};
        PET_IDS.forEach((id) => {
            const n = petItem(id); it[n] = { name: n, icon: '🐾', type: 'pet', petId: id, stackable: false, weight: 0.2, value: 400 + PETS[id][1] * 900, desc: PETS[id][0] + ' (' + RARN[PETS[id][1]] + '). ' + bonusText(id) + '. Use para adicionar à sua coleção de pets.' };
        });
        MOUNT_IDS.forEach((id) => {
            const n = mountItem(id); it[n] = { name: n, icon: '🐎', type: 'mount', mountId: id, stackable: false, weight: 0.5, value: 800 + MOUNTS[id][1] * 1500, desc: MOUNTS[id][0] + ' (' + RARN[MOUNTS[id][1]] + '). Velocidade +' + MOUNTS[id][2] + '%. Use para adicionar à sua coleção de montarias (V monta e desmonta).' };
        });
        it['Sela Cavalo Marrom'].recipe = 'Cowhide,10|Iron Bar,3'; it['Sela Cavalo Marrom'].craftQty = 1;
        return it;
    }
    const ITEMS = buildItems();
    try { if (window.CATALOG && CATALOG.ITEMS) Object.assign(CATALOG.ITEMS, ITEMS); } catch (e) { }
    const SHOPS = { merchant_base: [['Pet Gato', 1500], ['Sela Cavalo Branco', 9000]], farmer_npc: [['Pet Coelho', 1200], ['Sela Cavalo Marrom', 6000]] };
    function merge() {
        try {
            if (typeof itemDB !== 'undefined') for (const k of Object.keys(ITEMS)) { const cur = itemDB[k]; if (!cur) itemDB[k] = Object.assign({}, ITEMS[k]); else { cur.type = ITEMS[k].type; cur.petId = ITEMS[k].petId; cur.mountId = ITEMS[k].mountId; cur.stackable = false; if (ITEMS[k].recipe && !cur.recipe) { cur.recipe = ITEMS[k].recipe; cur.craftQty = 1; } } }
            if (typeof npcDB !== 'undefined') for (const nk of Object.keys(SHOPS)) { const n = npcDB[nk]; if (!n || n.hp > 0) continue; let s = n.shopStr || ''; SHOPS[nk].forEach(([name, cost]) => { if (s.indexOf(name + ',') < 0) s += (s ? '|' : '') + name + ',' + cost; }); n.shopStr = s; }
        } catch (e) { console.error(e); }
    }
    /* ícone do item (usado por icons.js): medalhão com o retrato do pet/montaria */
    function itemIcon(it, SZ) {
        try {
            const cv = document.createElement('canvas'); cv.width = cv.height = SZ || 64; const c = cv.getContext('2d'), S = cv.width, mount = !!it.mountId, id = it.mountId || it.petId, rar = (mount ? MOUNTS[id] : PETS[id]);
            if (!rar) return null; const col = ICONC[rar[1]];
            const gr = c.createRadialGradient(S * 0.4, S * 0.3, 2, S / 2, S / 2, S * 0.56); gr.addColorStop(0, '#fff6d8'); gr.addColorStop(0.45, col); gr.addColorStop(1, '#1b1109');
            c.beginPath(); c.arc(S / 2, S / 2, S * 0.45, 0, TAU); c.fillStyle = gr; c.globalAlpha = 0.85; c.fill(); c.globalAlpha = 1; c.lineWidth = 3; c.strokeStyle = '#1b1109'; c.stroke();
            c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,240,190,.55)'; c.beginPath(); c.arc(S / 2, S / 2, S * 0.4, 0, TAU); c.stroke();
            const art = PetArt.portrait(id, mount ? 'mount' : 'pet', Math.round(S * 0.84)); c.drawImage(art, S * 0.08, S * 0.1);
            if (mount) { c.fillStyle = '#6b3a1c'; c.strokeStyle = '#1b1109'; c.lineWidth = 1.4; c.beginPath(); c.rect(S * 0.66, S * 0.74, S * 0.24, S * 0.14); c.fill(); c.stroke(); }
            return cv;
        } catch (e) { return null; }
    }
    window.PetIcon = itemIcon;

    /* ---- usar item: adiciona à coleção ---- */
    function useItem(index) {
        ensure(); const item = player.inventory[index]; if (!item) return false;
        const pid = item.petId || (itemDB[item.name] && itemDB[item.name].petId), mid = item.mountId || (itemDB[item.name] && itemDB[item.name].mountId);
        if (pid && PETS[pid]) {
            if (player.pets[pid]) { say('Você já tem ' + PETS[pid][0] + ' na coleção. Guarde o item para trocar ou vender.', '#e67e22'); return true; }
            player.inventory.splice(index, 1); player.pets[pid] = { lvl: 1, xp: 0 }; bump();
            say('Novo pet: ' + PETS[pid][0] + '!', RARC[PETS[pid][1]]); sfx('levelup');
            if (!player.pet) equipPet(pid, true);
            try { hideTooltip(); } catch (e) { } afterChange(); return true;
        }
        if (mid && MOUNTS[mid]) {
            if (player.mounts[mid]) { say('Você já tem ' + MOUNTS[mid][0] + '. Guarde o item para trocar ou vender.', '#e67e22'); return true; }
            player.inventory.splice(index, 1); player.mounts[mid] = { lvl: 1, xp: 0 }; if (!player.mount) player.mount = mid; bump();
            say('Nova montaria: ' + MOUNTS[mid][0] + '! Aperte V para montar.', RARC[MOUNTS[mid][1]]); sfx('levelup');
            try { hideTooltip(); } catch (e) { } afterChange(); return true;
        }
        return false;
    }
    function afterChange() { bump(); try { updateUI(); } catch (e) { } try { saveDataLogic(); } catch (e) { } renderChips(); if (P.ui.open) renderPanel(true); }

    /* ---- equipar / guardar ---- */
    function commitPet() { const p = player.pet; if (!p || !PETS[p.id]) return; const s = player.pets[p.id] || (player.pets[p.id] = {}); s.lvl = p.lvl; s.xp = p.xp; if (p.name) s.name = p.name; else delete s.name; }
    function equipPet(id, silent) {
        ensure(); if (!PETS[id] || !player.pets[id]) return false; if (player.pet) commitPet();
        const s = player.pets[id], keep = player.pet && player.pet.mode;
        P.pm = false; player.pet = { id, name: s.name || '', lvl: clamp(s.lvl | 0 || 1, 1, MAXLVL), xp: Math.max(0, s.xp | 0), mode: MODES[keep] ? keep : 'follow' };
        P.tgt = null; delete P.fol.me; bump(); if (!silent) say(PETS[id][0] + ' equipado.', RARC[PETS[id][1]]); afterChange(); return true;
    }
    function unequipPet() { ensure(); if (!player.pet) return; commitPet(); const n = PETS[player.pet.id][0]; P.pm = false; player.pet = null; P.tgt = null; delete P.fol.me; bump(); say(n + ' guardado.', '#bdc3c7'); afterChange(); }
    function setMode(m) { ensure(); if (!player.pet || !MODES[m]) return; player.pet.mode = m; P.tgt = null; bump(); try { saveDataLogic(); } catch (e) { } renderChips(); if (P.ui.open) renderPanel(true); }
    function rename(n) { ensure(); if (!player.pet) return; n = String(n || '').replace(/[^\p{L}\p{N} '\-]/gu, '').trim().slice(0, 14); player.pet.name = n; commitPet(); try { saveDataLogic(); } catch (e) { } renderChips(); if (P.ui.open) renderPanel(true); }
    function renameMount(n) { ensure(); const id = player.mount; if (!id || !player.mounts[id]) return; n = String(n || '').replace(/[^\p{L}\p{N} '\-]/gu, '').trim().slice(0, 14); if (n) player.mounts[id].name = n; else delete player.mounts[id].name; try { saveDataLogic(); } catch (e) { } renderChips(); if (P.ui.open) renderPanel(true); }
    function mountGain(xp) {   // XP da montaria atual (cavalgar). Sobe de nível sozinho.
        const id = player.mount, m = id && player.mounts[id]; if (!m || m.lvl >= MLVL || !(xp > 0)) return; m.xp += xp; let up = false, st0 = mStage(m.lvl);
        while (m.lvl < MLVL && m.xp >= mNeed(m.lvl)) { m.xp -= mNeed(m.lvl); m.lvl++; up = true; }
        if (m.lvl >= MLVL) m.xp = 0;
        if (up) {
            bump(); const st = mStage(m.lvl); say(mountName(id) + ' subiu para o nível ' + m.lvl + '!' + (st > st0 ? ' Nova fase: ' + STAGEN[st] + '!' : ''), st > st0 ? '#ffb347' : '#6ff09a'); sfx('levelup');
            try { if (window.Art) Art.burst(player.x, player.y - 14, st > st0 ? '#ffd27a' : '#9ff0b6', st > st0 ? 28 : 14, 1.6); } catch (e) { } try { saveDataLogic(); } catch (e) { } renderChips();
        }
        if (P.ui.open && (++_mTick & 15) === 0) renderPanel(true);
    }
    let _mTick = 0;
    function chooseMount(id) { ensure(); if (!MOUNTS[id] || !player.mounts[id]) return; player.mount = id; if (P.mounted) { bump(); } try { saveDataLogic(); } catch (e) { } renderChips(); if (P.ui.open) renderPanel(true); }

    /* ---- XP do pet (ganha quando o jogador ganha XP) ---- */
    function onXP(a) {
        const p = player.pet; if (!p || !PETS[p.id] || !(a > 0)) return; if (p.lvl >= MAXLVL) return;
        p.xp += Math.max(1, Math.round(a * 0.35)); let up = false;
        while (p.lvl < MAXLVL && p.xp >= needXP(p.lvl)) { p.xp -= needXP(p.lvl); p.lvl++; up = true; }
        if (p.lvl >= MAXLVL) p.xp = 0;
        commitPet();
        if (up) { bump(); say((p.name || PETS[p.id][0]) + ' subiu para o nível ' + p.lvl + '!' + (p.lvl >= PET_MLVL ? ' Agora dá para MONTAR nele (tecla V ou painel do pet) e ganhar os atributos!' : ''), '#f1c40f'); sfx('levelup'); try { const F = P.fol.me; if (F && window.Art) Art.burst(F.x, F.y - 10, '#ffe27a', 14, 1.4); } catch (e) { } if (P.ui.open) renderPanel(true); }
        P.xpDirty = true;
    }

    /* ============================ MONTARIA ============================ */
    const INDOOR = new Set(['casa', 'catacumba', 'catacumbas', 'covil', 'caverna', 'cavernas', 'cripta', 'criptas', 'masmorra', 'masmorras', 'dungeon', 'cave', 'mina', 'minas', 'interior', 'taverna', 'loja', 'banco']);
    function indoor(mapId) {
        try {
            mapId = mapId || currentMap; const m = gameMaps[mapId]; if (m && (m.noMount === true || m.indoor === true)) return true;
            const toks = ((mapId || '') + ' ' + ((m && m.name) || '')).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z]+/);
            return toks.some((t) => INDOOR.has(t));
        } catch (e) { return false; }
    }
    function mountBlock(onPet) {
        if (!gameOn()) return 'x'; ensure();
        if (onPet) { if (!player.pet || !PETS[player.pet.id]) return 'Você não tem pet equipado.'; if (player.pet.lvl < PET_MLVL) return 'Só dá para montar pets a partir do nível ' + PET_MLVL + '.'; }
        else if (!player.mount) return 'Você não tem montaria.';
        if (player.stats.hp <= 0) return 'Você está sem vida.';
        if (indoor()) return 'Não dá para montar aqui dentro.';
        try { if (isBankOpen || isNPCOpen) return 'Feche a loja/banco para montar.'; } catch (e) { }
        try { if (window.Bank && Bank.isOpen && Bank.isOpen()) return 'Feche o banco para montar.'; } catch (e) { }
        try { if (window.Fishing && Fishing.busy && Fishing.busy()) return 'Termine de pescar para montar.'; } catch (e) { }
        if (player.isPerformingAction) return 'Termine a ação para montar.';
        return '';
    }
    function mount() { const why = mountBlock(); if (why) { if (why !== 'x') say(why, '#e74c3c'); return false; } if (P.mounted) return true; if (P.pm) dismountPet(); P.mounted = true; bump(); puffAt(player.x, player.y + 6, 7); sfx('click'); say('Montou: ' + mountName(player.mount) + ' (Nv ' + mLvl(player.mount) + ', +' + String(mountSpd(player.mount, mLvl(player.mount))).replace('.', ',') + '% velocidade).', '#6ff09a'); renderChips(); return true; }
    function dismount(msg) { if (!P.mounted) return; P.mounted = false; bump(); puffAt(player.x, player.y + 6, 6); if (msg) say(msg, '#e67e22'); renderChips(); }
    function toggleMount() { ensure(); if (P.mounted) dismount('Desmontou.'); else mount(); }
    /* ---- montar no PET (nível 10+): o jogador senta no pet (que cresce), ganha os atributos dele mas NÃO pode atacar montado ("Desmonte do pet para lutar"; ao ser atingido desmonta); desmontado o pet volta a seguir/coletar/atacar mas sem dar atributos ---- */
    function mountPet() {
        const why = mountBlock(true); if (why) { if (why !== 'x') say(why, '#e74c3c'); return false; } if (P.pm) return true;
        if (P.mounted) dismount(); P.pm = true; P.tgt = null; delete P.fol.me; bump(); puffAt(player.x, player.y + 6, 7); sfx('click');
        const id = player.pet.id; say('Montou em ' + (player.pet.name || PETS[id][0]) + '! Atributos ativos (x' + String(PM_MUL).replace('.', ',') + ') e +' + pmSpd(id) + '% de velocidade. Não dá para lutar montado no pet.', '#6ff09a'); renderChips(); if (P.ui.open) renderPanel(true); return true;
    }
    function dismountPet(msg) { if (!P.pm) return; P.pm = false; delete P.fol.me; bump(); puffAt(player.x, player.y + 6, 6); if (msg) say(msg, '#e67e22'); renderChips(); if (P.ui.open) renderPanel(true); }   // o seguidor reaparece ao lado no próximo tick
    function petNoFight() {   // montado no pet não se luta: só aviso curto (sem acumular), cancela perseguição/mira
        try { rangedTarget = null; player.pendingAutoAction = null; } catch (e) { }
        const n = performance.now(); if (!P.nfT || n - P.nfT > 1200) { P.nfT = n; say('Desmonte do pet para lutar.', '#e67e22'); }
    }
    function togglePetMount() { ensure(); if (P.pm) dismountPet('Desmontou do pet.'); else mountPet(); }
    function ride() {   // tecla V / botão: desmonta o que estiver montado; senão monta a montaria comum (se houver) ou o pet nível 10+
        ensure(); if (P.mounted) return dismount('Desmontou.'); if (P.pm) return dismountPet('Desmontou do pet.');
        if (player.mount) return mount(); if (petCan()) return mountPet(); say(player.pet ? 'Você ainda não tem montaria (pets só são montáveis no nível ' + PET_MLVL + ').' : 'Você ainda não tem montaria.', '#bdc3c7');
    }
    const mountOfMe = () => (P.mounted && player.mount && MOUNTS[player.mount]) ? player.mount : null;
    function puffAt(x, y, n) { try { if (window.Art && Art.puff) Art.puff(x, y, 'rgba(205,195,170,', n || 6, 5, 0.5); } catch (e) { } }

    /* ============================ COLISÃO DOS SEGUIDORES ============================ */
    const NOSOLID = ['ground_item', 'fishing_spot', 'farm_plot', 'portal', 'fire', 'paint', 'enemy', 'npc', 'house_door'];
    function solids() {
        const m = gameMaps[currentMap]; if (!m) return [];
        const now = performance.now();
        if (P.solidsMap !== currentMap || now - P.solidsT > 400) {
            P.solidsMap = currentMap; P.solidsT = now; const out = [];
            for (const o of (m.entities || [])) { if (!o || !o.type || !o.active || NOSOLID.indexOf(o.type) >= 0) continue; let hb = null; try { hb = getHitbox(o); } catch (e) { } if (hb && hb.w > 0 && hb.h > 0) out.push(hb); }
            P.solids = out;
        }
        return P.solids;
    }
    const PR = 5;
    function blocked(x, y, fly) {
        const m = gameMaps[currentMap]; if (!m) return false; const W = m.width || 800, H = m.height || 600;
        if (x < 8 || y < 8 || x > W - 8 || y > H - 8) return true;
        const S = P.solids;
        for (let i = 0; i < S.length; i++) { const h = S[i]; if (x + PR > h.x && x - PR < h.x + h.w && y + PR > h.y && y - PR < h.y + h.h) return true; }
        if (!fly) { try { if (window.Art && Art.isWater && Art.isWater(m, x, y)) return true; } catch (e) { } }
        return false;
    }
    function freeSpot(ox, oy, hx, hy, fly) {
        const base = Math.atan2(-hy, -hx);
        for (const r of [28, 36, 46, 58]) for (const da of [0, 0.7, -0.7, 1.4, -1.4, 2.1, -2.1, 3.1]) { const a = base + da, x = ox + Math.cos(a) * r, y = oy + Math.sin(a) * r; if (!blocked(x, y, fly)) return { x, y }; }
        return { x: ox, y: oy + 2 };
    }

    /* ============================ SEGUIDOR (pet) ============================ */
    function newFol(ox, oy) { return { x: ox, y: oy + 12, vx: 0, vy: 0, lox: ox, loy: oy, hx: 0, hy: 1, fx: 0, fy: 1, view: 'front', flip: 1, ph: 0, mv: 0, idle: 0, stuck: 0, far: 0, map: currentMap, ox: ox, oy: oy, blockedNow: false, atk: 0, tp: 0, side: rnd() < 0.5 ? 1 : -1, last: performance.now() }; }
    function teleport(F, ox, oy, fly) {
        puffAt(F.x, F.y + 2, 6); const s = freeSpot(ox, oy, F.hx, F.hy, fly); F.x = s.x; F.y = s.y; F.vx = F.vy = 0; F.stuck = 0; F.far = 0; F.tp = 18; F.map = currentMap; puffAt(F.x, F.y + 2, 7);
    }
    // um passo do seguidor. goal = {x,y} opcional (alvo de coleta/ataque); dt em quadros
    function stepFol(F, ox, oy, fly, dt, goal, ownerSpd) {
        const m = gameMaps[currentMap]; if (!m) return;
        if (F.map !== currentMap) { F.lox = ox; F.loy = oy; teleport(F, ox, oy, fly); return; }
        const odx = ox - F.lox, ody = oy - F.loy; F.lox = ox; F.loy = oy; const osp = hyp(odx, ody) / dt;
        if (osp > 0.15 && osp < 40) { const k = 1 / (osp * dt); F.hx += (odx * k - F.hx) * 0.1; F.hy += (ody * k - F.hy) * 0.1; const hl = hyp(F.hx, F.hy) || 1; F.hx /= hl; F.hy /= hl; F.idle = 0; } else F.idle += dt;
        const t = performance.now() / 1000, dOwner = hyp(ox - F.x, oy - F.y);
        if (dOwner > 330 || (dOwner > 210 && (F.far += dt) > 70)) { teleport(F, ox, oy, fly); return; } if (dOwner <= 210) F.far = 0;
        let tx, ty, arrive = 7;
        if (goal) { tx = goal.x; ty = goal.y; arrive = goal.r || 6; }
        else {
            const sp = 24 + (osp > 1 ? 4 : 0), px = -F.hy, py = F.hx, off = F.side * (10 + sin1(t * 1.3) * 4) + sin1(t * 2.1) * 3;
            const k = clamp((F.idle - 20) / 50, 0, 1);   // dono parado: o pet se acomoda ao lado (visível), em vez de atrás do corpo
            const sp2 = sp * (1 - k) + 8 * k, off2 = off * (1 - k) + F.side * (27 + sin1(t * 1.1) * 2) * k;
            tx = ox - F.hx * sp2 + px * off2; ty = oy - F.hy * sp2 + py * off2 + 4 * k; arrive = osp > 0.15 ? 5 : 9;
            if (F.idle > 25 && dOwner < 60) arrive = 12;
        }
        const dx = tx - F.x, dy = ty - F.y, dist = hyp(dx, dy);
        const vmax = Math.max(2.4, ownerSpd * 1.28 + 0.9) * (goal ? 1.25 : 1);
        let wantV = dist > arrive ? Math.min(vmax, 0.7 + dist * 0.1) : 0;
        const dvx = dist > 0.001 ? dx / dist * wantV : 0, dvy = dist > 0.001 ? dy / dist * wantV : 0;
        F.vx += (dvx - F.vx) * Math.min(1, 0.16 * dt); F.vy += (dvy - F.vy) * Math.min(1, 0.16 * dt);
        let mx = F.vx * dt, my = F.vy * dt, moved = false, blockedNow = false;
        if (Math.abs(mx) + Math.abs(my) > 0.01) {
            if (!blocked(F.x + mx, F.y + my, fly)) { F.x += mx; F.y += my; moved = true; }
            else {
                blockedNow = true; const sp0 = hyp(mx, my) || 1;
                // desliza pelos eixos e depois tenta desviar girando a direção
                if (!blocked(F.x + mx, F.y, fly) && Math.abs(mx) > 0.05) { F.x += mx; moved = true; }
                else if (!blocked(F.x, F.y + my, fly) && Math.abs(my) > 0.05) { F.y += my; moved = true; }
                else {
                    const a0 = Math.atan2(my, mx);
                    for (const da of [0.7, -0.7, 1.3, -1.3, 1.9, -1.9]) { const a = a0 + da, nx = F.x + Math.cos(a) * sp0, ny = F.y + Math.sin(a) * sp0; if (!blocked(nx, ny, fly)) { F.x = nx; F.y = ny; F.vx = Math.cos(a) * sp0 / dt; F.vy = Math.sin(a) * sp0 / dt; moved = true; break; } }
                }
                if (!moved) { F.vx *= 0.5; F.vy *= 0.5; }
            }
        }
        if (blocked(F.x, F.y, fly)) { F.stuck += dt * 2; if (F.stuck > 40) { teleport(F, ox, oy, fly); return; } }   // preso dentro de um sólido
        if (dist > 26 && (!moved || blockedNow)) F.stuck += dt; else F.stuck = Math.max(0, F.stuck - dt * 2);
        if (F.stuck > 120) { if (goal) { F.stuck = 0; F.giveUp = true; } else { teleport(F, ox, oy, fly); return; } }
        const sp1 = hyp(F.vx, F.vy); F.mv += ((sp1 > 0.2 ? 1 : 0) - F.mv) * Math.min(1, 0.2 * dt); F.ph += sp1 * 0.14 * dt;
        // direção para onde olha: movimento; parado, olha para o dono
        let lx = F.vx, ly = F.vy; if (sp1 < 0.25) { lx = ox - F.x; ly = oy - F.y; }
        if (hyp(lx, ly) > 0.01) { F.fx += (lx / hyp(lx, ly) - F.fx) * 0.15; F.fy += (ly / hyp(lx, ly) - F.fy) * 0.15; }
        const ax = Math.abs(F.fx), ay = Math.abs(F.fy);
        if (F.view === 'side') { if (ay > ax * 1.25) F.view = F.fy > 0 ? 'front' : 'back'; } else { if (ax > ay * 1.25) F.view = 'side'; else F.view = F.fy > 0 ? 'front' : 'back'; }
        if (F.view === 'side' && Math.abs(F.fx) > 0.2) F.flip = F.fx > 0 ? 1 : -1;
        if (F.tp > 0) F.tp -= dt;
        F.ox = ox; F.oy = oy;
    }
    const sin1 = Math.sin;

    /* ---- coleta e ataque do pet (só o dono local) ---- */
    function eligible(o, mode) {
        if (!o || !o.active || o.type !== 'ground_item' || typeof o.item !== 'string' || o.np || o.ench || o.owner) return false;
        const coin = o.item === 'Coins'; if (mode === 'coins') return coin; if (mode === 'items') return !coin; return mode === 'all';
    }
    function scanGround(F, mode) {
        const m = gameMaps[currentMap]; if (!m) return null; let best = null, bd = 1e9; const now = performance.now();
        for (const o of (m.entities || [])) {
            if (!eligible(o, mode)) continue; const id = o.id; if (id != null && P.skip[id] && P.skip[id] > now) continue;
            const cx = o.x + 10, cy = o.y + 10; if (hyp(player.x - cx, player.y - cy) > COLLECT_R) continue; if (!itemDB[o.item]) continue;
            const d = hyp(F.x - cx, F.y - cy); if (d < bd) { bd = d; best = o; }
        }
        return best;
    }
    function petCollect(o) {   // mesma função de pegar do jogador (addInvItem): sem duplicar, 1 por vez
        if (!o.active) return false;
        if (typeof invSpaceFor === 'function' && !invSpaceFor(o.item, o.qty)) { P.skip[o.id] = performance.now() + 20000; const now = performance.now(); if (now - P.fullT > 15000) { P.fullT = now; say('Mochila cheia: o pet não consegue coletar.', '#e74c3c'); } return false; }
        if (addInvItem(o.item, o.qty)) { o.active = false; try { if (window.onGroundTaken) onGroundTaken(o); } catch (e) { } try { addPickupText(o.item, o.qty); } catch (e) { } try { updateUI(); saveDataLogic(); } catch (e) { } return true; }
        P.skip[o.id] = performance.now() + 20000; return false;
    }
    function petAttack(F, t) {
        if (!t || !t.active || t.hp <= 1) return false;
        const lvl = player.pet.lvl, dmg = Math.min(t.hp - 1, 1 + Math.floor(lvl / 3) + sr(bonus().dmg * 0.05)); if (dmg < 1) return false;
        P.own = true; try { applyDamage(t, dmg, 'combat', Math.max(1, dmg)); } catch (e) { } P.own = false;
        F.atk = 14; try { Art.burst(t.x + (t.w || 30) / 2, t.y + (t.h || 30) / 2, '#fff2b0', 5, 1.1); } catch (e) { } return true;
    }

    /* ============================ TICK (1x por quadro de lógica) ============================ */
    let _tickN = 0;
    function tick() {
        if (!ensure()) return;
        const m = gameMaps[currentMap]; if (!m) return;
        if (P.lastMap !== currentMap) { const was = P.lastMap; P.lastMap = currentMap; P.solidsT = 0; if (was && P.mounted && indoor()) dismount('Desmontou: não dá para montar aqui dentro.'); if (P.pm && indoor()) dismountPet('Desmontou: não dá para montar aqui dentro.'); P.tgt = null; P.skip = Object.create(null); }
        if (P.mounted && (player.stats.hp <= 0 || !player.mount || !MOUNTS[player.mount])) dismount('Desmontou.');
        if (P.pm && (player.stats.hp <= 0 || !petCan())) dismountPet('Desmontou.');
        if (P.pm && P.hp0 !== undefined && player.stats.hp < P.hp0 && player.stats.hp > 0) dismountPet('Você foi atingido e desmontou do pet.');
        P.hp0 = player.stats.hp;
        if (P.pm) { try { if ((window.Fishing && Fishing.busy && Fishing.busy()) || player.isPerformingAction) dismountPet('Desmontou para agir.'); } catch (e) { } }
        if (P.mounted) { try { if ((window.Fishing && Fishing.busy && Fishing.busy()) || player.isPerformingAction) dismount('Desmontou para agir.'); } catch (e) { } }
        // montaria: estado de animação e poeira
        const mid = mountOfMe(); if (mid) { const st = mstate('me'), sp = hyp(player.x - (st.tx === undefined ? player.x : st.tx), player.y - (st.ty === undefined ? player.y : st.ty)); st.tx = player.x; st.ty = player.y; if (sp > 0 && sp < 30) { P.mxpPx = (P.mxpPx || 0) + sp; P.mxpT = (P.mxpT || 0) + 1; let g = Math.floor(P.mxpPx / MXP_PX); if (P.mxpT >= 60 * MXP_SEC) { P.mxpT = 0; g += 1; } if (g > 0) { P.mxpPx -= g * MXP_PX; if (P.mxpPx < 0) P.mxpPx = 0; mountGain(g); } P.dustAcc += sp; if (P.dustAcc > 26 && !MOUNTS[mid][3]) { P.dustAcc = 0; if (mid === 'cav_fogo' && mStage(mLvl(mid)) >= 2) { try { Art.burst(player.x, player.y + 8, '#ff8a1c', 3, 0.7); } catch (e) { } } else puffAt(player.x, player.y + 8, 3); } } }
        // regeneração em % (vida e mana)
        { const b = bonus(); if (b.regen > 0 && player.stats.hp > 0 && player.stats.hp < player.stats.maxHp) { const base = 1 + Math.floor((player.stats.skills.hp.level || 10) / 10); P.regenAcc += (b.regen / 100) * base / 60 * 1.5; if (P.regenAcc >= 1) { P.regenAcc -= 1; player.stats.hp = Math.min(player.stats.maxHp, player.stats.hp + 1); try { updateUI(); } catch (e) { } } }
            if (b.mregen > 0 && player.stats.mp < player.stats.maxMp) { P.mregenAcc += (player.stats.maxMp * b.mregen / 100) / 3600 * 4; if (P.mregenAcc >= 1) { P.mregenAcc -= 1; player.stats.mp = Math.min(player.stats.maxMp, player.stats.mp + 1); try { updateUI(); } catch (e) { } } } }
        const pet = player.pet; if (!pet || !PETS[pet.id] || P.pm) { delete P.fol.me; return; }
        solids();
        let F = P.fol.me; if (!F) { F = P.fol.me = newFol(player.x, player.y); teleport(F, player.x, player.y, PETS[pet.id][3]); F.tp = 0; }
        const fly = !!PETS[pet.id][3], ownerSpd = hyp(player.x - (F.lox || player.x), player.y - (F.loy || player.y));
        if (P.cd > 0) P.cd--; if (P.atkCd > 0) P.atkCd--; if (F.atk > 0) F.atk--;
        let goal = null; const mode = pet.mode;
        if (!P.mounted && (mode === 'items' || mode === 'coins' || mode === 'all')) {
            if (P.tgt && (!P.tgt.active || hyp(player.x - (P.tgt.x + 10), player.y - (P.tgt.y + 10)) > COLLECT_R + 40)) P.tgt = null;
            if (!P.tgt && ++P.scanT >= 20) { P.scanT = 0; P.tgt = scanGround(F, mode); }
            if (P.tgt) {
                goal = { x: P.tgt.x + 10, y: P.tgt.y + 10 + 2, r: 4 };
                if (hyp(F.x - goal.x, F.y - goal.y) < 11 && P.cd <= 0) { if (petCollect(P.tgt)) { P.cd = COLLECT_CD; sfx('pickup'); try { Art.burst(F.x, F.y - 8, '#ffe27a', 6, 1); } catch (e) { } } P.tgt = null; }
                else if (F.giveUp) { P.skip[P.tgt.id] = performance.now() + 12000; P.tgt = null; F.giveUp = false; }
            }
        } else if (mode === 'attack') {   // também ajuda quando o dono luta montado na montaria comum
            const t = P.hit; if (t && t.active && t.hp > 1 && P.hitT > 0 && hyp(player.x - (t.x + (t.w || 30) / 2), player.y - (t.y + (t.h || 30) / 2)) < 280) {
                const cx = t.x + (t.w || 30) / 2, cy = t.y + (t.h || 30) + 2, d = hyp(F.x - cx, F.y - cy);
                // fica de lado do inimigo (do lado do dono) e ataca em intervalos
                const ax = player.x - cx, ay = player.y - cy, al = hyp(ax, ay) || 1; goal = { x: cx + ax / al * 24, y: cy + ay / al * 12, r: 5 };
                if (d < 40 && P.atkCd <= 0) { if (petAttack(F, t)) P.atkCd = Math.max(80, 150 - pet.lvl * 6); }
            }
            if (P.hitT > 0) P.hitT--; else P.hit = null;
        }
        stepFol(F, player.x, player.y, fly, 1, goal, ownerSpd);
        if (F.idle > 540 && !goal) F.sleep = true; else if (F.idle < 20) F.sleep = false;
        if (P.xpDirty) { P.xpDirty = false; if (P.ui.open && (++_tickN & 7) === 0) renderPanel(true); }
    }
    function mstate(key) { return P.mst[key] || (P.mst[key] = { ph: 0, mv: 0, lx: 0, ly: 0, view: null, vc: 0, face: 1, fc: 0, still: 0 }); }

    /* ============================ DESENHO ============================ */
    function inView(VW, x, y, m) { return x > VW.x - m && x < VW.x + VW.w + m && y > VW.y - m && y < VW.y + VW.h + m; }
    function drawFollower(ctx, F, id, key, T, lvlScale) {
        const sleep = !!F.sleep && F.mv < 0.1, flash = F.tp > 0;
        if (flash) { ctx.save(); ctx.globalAlpha = 0.55 + 0.45 * (1 - F.tp / 18); }
        PetArt.pet(ctx, id, F.x, F.y, { view: sleep ? 'side' : F.view, flip: F.flip, t: T + (key.length * 0.7), ph: F.ph, mv: F.mv, sleep: sleep, scale: 1.08 + (lvlScale || 0) });
        if (flash) ctx.restore();
        if (sleep) { const z = (T * 0.8) % 1; ctx.save(); ctx.font = 'bold 9px Arial'; ctx.fillStyle = 'rgba(255,255,255,' + (0.9 - z * 0.8) + ')'; ctx.strokeStyle = 'rgba(0,0,0,' + (0.5 - z * 0.4) + ')'; ctx.lineWidth = 2; const zx = F.x + 8 + z * 6, zy = F.y - 18 - z * 10; ctx.strokeText('z', zx, zy); ctx.fillText('z', zx, zy); ctx.restore(); }
        if (F.atk > 0) { ctx.save(); ctx.strokeStyle = 'rgba(255,240,170,' + (F.atk / 14) + ')'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(F.x + F.flip * 8, F.y - 9, 7 + (14 - F.atk) * 0.7, -0.9, 0.9); ctx.stroke(); ctx.restore(); }
    }
    // chamado por draw(): empurra pets (meus e dos outros) na fila de profundidade
    function queue(rq, VW) {
        if (!gameOn() || typeof window.PetArt === 'undefined') return; const T = performance.now() / 1000;
        try {
            const F = P.fol.me;
            if (F && player.pet && PETS[player.pet.id] && inView(VW, F.x, F.y, 70)) { const id = player.pet.id, lv = player.pet.lvl; rq.push({ type: 'fn', sortY: F.y + 3, fn: (c) => drawFollower(c, F, id, 'me', T, lv >= MAXLVL ? 0.06 : 0) }); }
            if (typeof otherPlayers !== 'undefined') {
                let n = 0;
                for (const u of Object.keys(otherPlayers)) {
                    const op = otherPlayers[u], inf = P.others[u]; if (!op || !inf || !inf.pet || !PETS[inf.pet.id] || inf.pet.m) { delete P.fol['o:' + u]; continue; }
                    const ox = op.displayX !== undefined ? op.displayX : op.x, oy = op.displayY !== undefined ? op.displayY : op.y;
                    if (!inView(VW, ox, oy, 120)) { delete P.fol['o:' + u]; continue; } if (++n > 40) break;
                    let Fo = P.fol['o:' + u]; const now = performance.now();
                    if (!Fo) { Fo = P.fol['o:' + u] = newFol(ox, oy); Fo.map = currentMap; const s = freeSpot(ox, oy, 0, 1, !!PETS[inf.pet.id][3]); Fo.x = s.x; Fo.y = s.y; }
                    const dt = clamp((now - Fo.last) / 16.667, 0.2, 4); Fo.last = now; solids();
                    const osp = hyp(ox - Fo.lox, oy - Fo.loy) / dt;
                    stepFol(Fo, ox, oy, !!PETS[inf.pet.id][3], dt, null, osp);
                    if (Fo.idle > 540) Fo.sleep = true; else if (Fo.idle < 20) Fo.sleep = false;
                    const id = inf.pet.id; rq.push({ type: 'fn', sortY: Fo.y + 3, fn: (c) => drawFollower(c, Fo, id, u, T, 0) });
                }
                for (const k of Object.keys(P.fol)) if (k.charAt(0) === 'o' && k.charAt(1) === ':' && !otherPlayers[k.slice(2)]) delete P.fol[k];
            }
        } catch (e) { console.error(e); }
    }

    /* ---- montaria: mesma lógica de vista do Art.drawPlayer, para o cavalo e o cavaleiro olharem para o mesmo lado ---- */
    function mountOf(item) {
        if (!gameOn()) return null;
        if (item.isMain) return (P.pm && petCan()) ? '@' + player.pet.id : mountOfMe();
        const inf = P.others[item.name]; if (inf && inf.pet && inf.pet.m && PETS[inf.pet.id] && inf.pet.l >= PET_MLVL) return '@' + inf.pet.id;
        return inf && inf.mount && MOUNTS[inf.mount] ? inf.mount : null;
    }
    function viewOf(st, px, py, facing, anim, now) {
        const dx = px - st.lx, dy = py - st.ly, sp = hyp(dx, dy); let moving = false;
        if (sp > 60 || st.view === null) { st.ph = st.ph; } else { moving = sp > 0.08; st.mv += ((moving ? 1 : 0) - st.mv) * 0.2; st.ph += sp * 0.062; }
        st.lx = px; st.ly = py; if (moving || anim > 0) st.still = now;
        let wv = facing.y < 0 ? 'back' : facing.y > 0 ? 'front' : 'side'; const wf = facing.x < 0 ? -1 : 1;
        if (!moving && anim <= 0 && now - st.still > 2.8) wv = 'front';
        if (!st.view) st.view = wv; else if (wv !== st.view) { if (++st.vc >= 4) { st.view = wv; st.vc = 0; } } else st.vc = 0;
        if (wf !== st.face && st.view === 'side') { if (++st.fc >= 3) { st.face = wf; st.fc = 0; } } else if (st.view !== 'side') { st.face = wf; st.fc = 0; } else st.fc = 0;
        return moving;
    }
    function drawMounted(ctx, item, mid, equip, extra, T, mapObj) {
        const key = item.isMain ? 'me' : item.name, st = mstate(key), px = item.px, py = item.py, facing = item.op.facing || { x: 0, y: 1 }, now = T;
        viewOf(st, px, py, facing, item.op.actionAnim || 0, now);
        const onP = mid.charAt(0) === '@', mk = onP ? mid.slice(1) : mid, gy = py + 8, fly = onP ? !!PETS[mk][3] : !!MOUNTS[mid][3];
        const draw = () => {
            (onP ? PetArt.petMount : PetArt.mount)(ctx, mk, px, gy, { view: st.view, flip: st.face, t: T + key.length, ph: st.ph, mv: st.mv, scale: 1, stage: item.isMain ? mStage(mLvl(mid)) : ((P.others[item.name] && P.others[item.name].ms) | 0) }, (seat) => {
                const sit = Object.assign({}, extra, { sit: true });
                const rpy = seat.y + 12 - 8;   // pés do cavaleiro = quadril + 12 (o quadril fica a ~12px acima dos pés)
                const info = Art.drawPlayer(ctx, seat.x, rpy, facing, item.op.actionAnim || 0, equip, item.name, item.isMain, sit);
                // coxas e botas ao lado da sela
                const look = extra.look || (Art.defaultLook ? Art.defaultLook() : null), pc = (look && look.pants) || '#4a3a2a';
                const v = info && info.view || st.view, fl = info && info.flip || st.face, hipY = seat.y + 0.5, d = fly ? 0 : 0;
                ctx.save(); ctx.lineCap = 'round';
                if (v === 'side') { const lx = seat.x + fl * 1.5; ctx.strokeStyle = '#1b1109'; ctx.lineWidth = 6.4; ctx.beginPath(); ctx.moveTo(lx, hipY); ctx.lineTo(lx + fl * 2.2, hipY + 8); ctx.stroke(); ctx.strokeStyle = pc; ctx.lineWidth = 4.6; ctx.stroke(); ctx.strokeStyle = '#2a1c12'; ctx.lineWidth = 4.2; ctx.beginPath(); ctx.moveTo(lx + fl * 2.2, hipY + 8); ctx.lineTo(lx + fl * 2.6, hipY + 11.4); ctx.stroke(); }
                else { for (const s of [-1, 1]) { const lx = seat.x + s * 4.4; ctx.strokeStyle = '#1b1109'; ctx.lineWidth = 5.6; ctx.beginPath(); ctx.moveTo(lx - s * 1.6, hipY - 1); ctx.lineTo(lx + s * 3.4, hipY + 6.4); ctx.stroke(); ctx.strokeStyle = pc; ctx.lineWidth = 3.8; ctx.stroke(); ctx.strokeStyle = '#2a1c12'; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(lx + s * 3.4, hipY + 6.4); ctx.lineTo(lx + s * 3.8, hipY + 9.4); ctx.stroke(); } }
                ctx.restore();
            });
        };
        if (!fly && mapObj && window.Art && Art.isWater && Art.isWater(mapObj, px, py)) Art.drawSubmerged(ctx, px, py, 34, 56, 0.34, T, draw); else draw();
    }

    /* ============================ SINCRONIA (multiplayer) ============================ */
    function fill(payload) {
        if (!gameOn()) return; payload.pet = (player.pet && PETS[player.pet.id]) ? { id: player.pet.id, l: player.pet.lvl, m: (P.pm && petCan()) ? 1 : 0 } : null; payload.mount = mountOfMe(); payload.ms = payload.mount ? mStage(mLvl(payload.mount)) : 0;
    }
    function onSync(data) {
        if (!data || !data.players) return;
        for (const u of Object.keys(data.players)) { const p = data.players[u]; if (!p) continue; const o = P.others[u] || (P.others[u] = {}); o.pet = p.pet && PETS[p.pet.id] ? { id: p.pet.id, l: p.pet.l | 0 || 1, m: p.pet.m ? 1 : 0 } : null; o.mount = p.mount && MOUNTS[p.mount] ? p.mount : null; o.ms = clamp(p.ms | 0, 0, 3); }
        for (const u of Object.keys(P.others)) if (!data.players[u]) { delete P.others[u]; delete P.mst[u]; }
    }

    /* ============================ DROPS ============================ */
    function grant(kind, id) {
        const name = kind === 'pet' ? petItem(id) : mountItem(id); if (!itemDB[name]) return false;
        if (typeof addInvItem === 'function' && addInvItem(name, 1)) { try { addPickupText(name, 1); } catch (e) { } }
        else { try { gameMaps[currentMap].entities.push({ id: newEntId(), type: 'ground_item', item: name, qty: 1, x: player.x + 10, y: player.y + 10, w: 20, h: 20, active: true, life: 18000, np: 1 }); } catch (e) { return false; } }
        const rar = (kind === 'pet' ? PETS : MOUNTS)[id][1]; say('Raro! Você encontrou: ' + name + ' (' + RARN[rar] + ')', RARC[rar]); sfx('levelup'); try { Art.burst(player.x, player.y - 14, RARC[rar], 18, 1.6); } catch (e) { }
        try { saveDataLogic(); updateUI(); } catch (e) { } return true;
    }
    function rollList(list, mult) {
        for (const [what, ch] of list) { if (rnd() < ch * mult * dropMul.v) { const [k, id] = what.split(':'); if ((k === 'pet' && PETS[id]) || (k === 'mount' && MOUNTS[id])) return grant(k, id); } }
        return false;
    }
    function onKill(t) {
        try {
            const key = t.dbKey || ''; const d = (typeof npcDB !== 'undefined' && npcDB[key]) || {}; const mult = luckMul();
            let list = DROP[key];
            if (!list) { if (d.group === 'chefe' || (d.hp || 0) >= 80) { const pool = PET_IDS.filter((i) => PETS[i][1] >= 1); list = [['pet:' + pool[Math.floor(rnd() * pool.length)], 0.025]]; } else if (d.hp > 0 && d.xp >= 20) { const pool = PET_IDS.filter((i) => PETS[i][1] === 0); list = [['pet:' + pool[Math.floor(rnd() * pool.length)], 0.0012]]; } }
            if (list) rollList(list, mult);
        } catch (e) { console.error(e); }
    }
    function rollSource(k) { try { rollList(SRC[k] || [], luckMul()); } catch (e) { } }

    /* ============================ WRAPPERS (sem editar o código do jogo) ============================ */
    function wrapAll() {
        const W = window;
        if (typeof W.addXP === 'function' && !W.addXP._pets) { const o = W.addXP; W.addXP = function (sK, a) { let a2 = a; try { if (ensure() && a > 0) { const b = bonus(); if (b.xp > 0) a2 = sr(a * (1 + b.xp / 100)); } if (a > 0 && player.pet) onXP(a); } catch (e) { } return o.call(this, sK, a2); }; W.addXP._pets = 1; }
        if (typeof W.applyDamage === 'function' && !W.applyDamage._pets) {
            const o = W.applyDamage; W.applyDamage = function (t, dmg, sT, maxHit) {
                if (P.own) return o.apply(this, arguments);
                let d2 = dmg, crit = false, n0 = -1, cur = null, was = false;
                try {
                    ensure(); const b = bonus();
                    if (dmg > 0) { if (b.dmg > 0) d2 = sr(dmg * (1 + b.dmg / 100)); if (!viaStats() && b.crit > 0 && rnd() * 100 < b.crit) { d2 = Math.max(d2 + 1, Math.ceil(d2 * 1.5)); crit = true; } }
                    if (t && t.type === 'enemy') { P.hit = t; P.hitT = 300; }
                    was = !!(t && t.active !== false && t.hp > 0); const m = gameMaps[currentMap]; cur = m && m.entities; n0 = cur ? cur.length : -1;
                } catch (e) { }
                const r = o.call(this, t, d2, sT, crit ? Math.max(maxHit || 0, d2) : maxHit);
                try { if (was && t && t.hp <= 0) { if (!t._lootDeferred) postKill(t, cur, n0); onKill(t); } } catch (e) { console.error(e); }   // online: o loot só sai quando o servidor confirma a morte (index.html: dropLootNow chama Pets.postKill)
                return r;
            }; W.applyDamage._pets = 1;
        }
        if (typeof W.switchMap === 'function' && !W.switchMap._pets) { const o = W.switchMap; W.switchMap = function (id, x, y) { const r = o.apply(this, arguments); try { ensure(); if (P.mounted && indoor()) dismount('Desmontou: não dá para montar aqui dentro.'); if (P.pm && indoor()) dismountPet('Desmontou: não dá para montar aqui dentro.'); P.tgt = null; const F = P.fol.me; if (F) { F.map = ''; } } catch (e) { } return r; }; W.switchMap._pets = 1; }
        if (typeof W.useItem === 'function' && !W.useItem._pets) { const o = W.useItem; W.useItem = function (i) { try { if (!(typeof isBankOpen !== 'undefined' && isBankOpen)) { const it = player.inventory[i]; if (it && (it.petId || it.mountId || (itemDB[it.name] && (itemDB[it.name].petId || itemDB[it.name].mountId)))) { if (useItem(i)) return; } } } catch (e) { console.error(e); } return o.apply(this, arguments); }; W.useItem._pets = 1; }
        if (typeof W.beginAttack === 'function' && !W.beginAttack._pets) { const o = W.beginAttack; W.beginAttack = function (obj) { if (P.pm && obj && obj.type === 'enemy') { petNoFight(); return true; } return o.apply(this, arguments); }; W.beginAttack._pets = 1; }
        if (typeof W.respawnAtVillage === 'function' && !W.respawnAtVillage._pets) { const o = W.respawnAtVillage; W.respawnAtVillage = function () { try { if (P.pm) dismountPet('Você caiu e desmontou do pet.'); } catch (e) { } return o.apply(this, arguments); }; W.respawnAtVillage._pets = 1; }
        if (typeof W.tryAttack === 'function' && !W.tryAttack._pets) { const o = W.tryAttack; W.tryAttack = function () { if (P.pm) { petNoFight(); return; } return o.apply(this, arguments); }; W.tryAttack._pets = 1; }
        if (typeof W.tryInteract === 'function' && !W.tryInteract._pets) {
            const o = W.tryInteract; W.tryInteract = function (t) {
                if (P.pm && t && t.type === 'enemy') { petNoFight(); return; }
                try { if (P.pm && t && t.active !== false && t.type !== 'enemy' && t.type !== 'ground_item' && t.type !== 'portal' && t.type !== 'paint' && t.type !== 'decor') dismountPet('Desmontou do pet.'); } catch (e) { }
                try { if (P.mounted && t && t.active !== false) { const ty = t.type; if (ty === 'enemy') { /* montaria comum luta normalmente */ } else if (ty !== 'ground_item' && ty !== 'portal' && ty !== 'paint' && ty !== 'decor') dismount('Desmontou.'); } } catch (e) { }
                return o.apply(this, arguments);
            }; W.tryInteract._pets = 1;
        }
        if (typeof W.update === 'function' && !W.update._pets) {
            const o = W.update; W.update = function () {
                let s0 = null; try { if (gameOn() && ensure()) { const m = speedFactor(); if (m !== 1) { s0 = player.speed; player.speed = s0 * m; } } } catch (e) { }
                try { return o.apply(this, arguments); } finally { if (s0 !== null) player.speed = s0; try { tick(); } catch (e) { console.error(e); } }
            }; W.update._pets = 1;
        }
        // portais/mapa de grade e outros caminhos de viagem passam por switchMap (acima). Pesca e baús:
        try { if (window.Life && Life.cnt && !Life.cnt._pets) { const o = Life.cnt; Life.cnt = function (k, n) { const r = o.apply(this, arguments); if (k === 'chests') rollSource('chest'); else if (k === 'rarefish') rollSource('fish'); return r; }; Life.cnt._pets = 1; } } catch (e) { }
        try { if (window.Net && Net.sync && !Net.sync._pets) { const o = Net.sync; Net.sync = function (p) { try { fill(p); } catch (e) { } return o.apply(this, arguments); }; Net.sync._pets = 1; } } catch (e) { }
        try { if (window.Net && Net.onSync && !Net.onSync._pets) { const o = Net.onSync; Net.onSync = function (d) { try { onSync(d); } catch (e) { } return o.apply(this, arguments); }; Net.onSync._pets = 1; } } catch (e) { }
    }
    // moedas e sorte de drop em % (usa os itens que acabaram de cair no chão)
    function postKill(t, cur, n0) {
        if (!cur || n0 < 0) return; const b = bonus(); if (!(b.coins > 0 || (b.luck > 0 && !viaStats()))) return;
        const d = (typeof npcDB !== 'undefined' && npcDB[t.dbKey]) || null;
        for (let i = n0; i < cur.length; i++) { const o = cur[i]; if (o && o.type === 'ground_item' && o.item === 'Coins' && b.coins > 0) o.qty = Math.max(o.qty, sr(o.qty * (1 + b.coins / 100))); }
        if (b.luck > 0 && !viaStats() && d && d.lootStr) {   // +x% de chance relativa nos itens que não são garantidos
            d.lootStr.split('|').forEach((p) => { const q = p.split(','); const ch = parseFloat(q[1]); const nm = (q[0] || '').trim(); if (q.length >= 3 && ch < 1 && itemDB[nm] && rnd() < ch * b.luck / 100) cur.push({ id: newEntId(), type: 'ground_item', item: nm, qty: Math.floor(rnd() * parseInt(q[2])) + 1, x: t.x + (rnd() * 20) - 10, y: t.y, w: 20, h: 20, active: true, life: 3000 }); });
        }
    }

    /* ============================ UI ============================ */
    const CSS = `
#pet-row{display:none;gap:6px;margin-top:6px;align-items:center;flex-wrap:wrap}
#pet-row.on{display:flex}
.pet-chip{display:flex;align-items:center;gap:6px;height:34px;padding:2px 10px 2px 4px;border-radius:999px;border:1px solid #000;cursor:pointer;color:#e9dcc0;font:700 .72rem var(--serif,Georgia,serif);background:linear-gradient(#4a3520,#2a1b0e);box-shadow:inset 0 1px 0 rgba(255,235,170,.25);white-space:nowrap;max-width:100%}
.pet-chip:hover{filter:brightness(1.15)}
.pet-chip img{width:26px;height:26px;image-rendering:auto;border-radius:50%;background:rgba(0,0,0,.35)}
.pet-chip small{color:#f1c40f;font:700 .66rem var(--sans,sans-serif)}
.pet-chip.mnt.on{background:linear-gradient(#3f7a45,#22492a)}
#pets-win{display:none;position:absolute;z-index:131;left:50%;top:12px;transform:translateX(-50%);width:min(430px,calc(100% - 24px));max-height:calc(100% - 28px);flex-direction:column;gap:7px;padding:10px;border-radius:14px;color:var(--text,#eadfc4);background:linear-gradient(#2c1e12,#1a110a);border:3px solid var(--gold-0,#8a6420);box-shadow:0 0 0 2px #000,0 14px 40px rgba(0,0,0,.7);font-family:var(--sans,sans-serif)}
#pets-win.on{display:flex}
#pets-win .pw-h{display:flex;align-items:center;gap:6px;flex:none}
#pets-win .pw-t{font-family:var(--serif,Georgia,serif);color:var(--gold-2,#e8c469);font-size:1.02rem;flex:1}
#pets-win .pw-tab,#pets-win .pw-b{min-height:34px;padding:4px 12px;border-radius:999px;border:1px solid #000;cursor:pointer;font:700 .76rem var(--serif,Georgia,serif);color:#e9dcc0;background:linear-gradient(#4a3520,#2a1b0e)}
#pets-win .pw-tab.on{color:#2b1a05;background:linear-gradient(#f0cf7c,#b98a2e)}
#pets-win .pw-b.go{color:#2b1a05;background:linear-gradient(#f0cf7c,#b98a2e)} #pets-win .pw-b.bad{color:#ffb2a4;background:linear-gradient(#4a1f1a,#2a100d)}
#pets-win .pw-x{width:34px;height:34px;flex:none;border-radius:50%;border:1px solid #000;cursor:pointer;font-size:1.25rem;line-height:1;color:#ffb2a4;background:linear-gradient(#4a1f1a,#2a100d)}
#pets-win .pw-body{overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:8px;min-height:0;padding-right:2px}
#pets-win .pw-card{display:flex;gap:10px;align-items:center;padding:8px;border-radius:10px;background:rgba(0,0,0,.3);border:1px solid rgba(232,196,105,.25)}
#pets-win .pw-card canvas,#pets-win .pw-card img{width:64px;height:64px;flex:none;border-radius:10px;background:radial-gradient(circle,rgba(255,255,255,.12),rgba(0,0,0,.25))}
#pets-win .pw-ct{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
#pets-win .pw-ct b{color:#f4e3b0;font-size:.95rem} #pets-win .pw-ct small{color:#bfae86;font-size:.74rem}
#pets-win .pw-bar{height:8px;border-radius:5px;background:#120c07;border:1px solid #000;overflow:hidden} #pets-win .pw-bar i{display:block;height:100%;background:linear-gradient(#7fd8ff,#3a76b8)}
#pets-win .pw-st{display:flex;flex-wrap:wrap;gap:4px} #pets-win .pw-st span{padding:2px 8px;border-radius:999px;background:rgba(111,240,154,.12);border:1px solid rgba(111,240,154,.35);color:#9ff0b6;font-size:.72rem}
#pets-win .pw-sec{font:700 .72rem var(--serif,Georgia,serif);color:#bfae86;letter-spacing:.5px;text-transform:uppercase;margin-top:2px}
#pets-win .pw-mode{display:flex;align-items:center;gap:8px;min-height:36px;padding:4px 8px;border-radius:8px;cursor:pointer;background:rgba(0,0,0,.22);border:1px solid transparent;font-size:.8rem}
#pets-win .pw-mode.on{border-color:var(--gold-1,#c79a3a);background:rgba(232,196,105,.12)} #pets-win .pw-mode i{width:14px;height:14px;border-radius:50%;border:2px solid #c79a3a;flex:none} #pets-win .pw-mode.on i{background:radial-gradient(#f0cf7c 40%,transparent 45%)}
#pets-win .pw-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:6px}
#pets-win .pw-cell{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 4px;border-radius:10px;background:rgba(0,0,0,.28);border:1px solid rgba(232,196,105,.18);cursor:pointer;text-align:center;min-height:92px}
#pets-win .pw-cell.on{border-color:var(--gold-1,#c79a3a);box-shadow:0 0 0 1px #000,0 0 8px rgba(232,196,105,.35)} #pets-win .pw-cell.lock{opacity:.4;cursor:default;filter:grayscale(1)}
#pets-win .pw-cell img{width:46px;height:46px} #pets-win .pw-cell b{font-size:.7rem;color:#f4e3b0;line-height:1.1} #pets-win .pw-cell small{font-size:.64rem;color:#bfae86}
#pets-win .pw-hint{font-size:.72rem;color:var(--muted,#a89a7c);line-height:1.35}
#pets-win input.pw-in{background:#0f0905;border:1px solid #000;color:#f4e3b0;border-radius:6px;padding:3px 6px;font-size:.85rem;width:140px}
html.touch #pets-win{left:6px;right:6px;top:6px;transform:none;width:auto;max-height:calc(100% - 12px)}
body.pets-open #qb{display:none!important}
#mount-btn{display:none}
html.touch #m-ctl #mount-btn{display:flex;width:58px;height:58px;flex:none;border-radius:50%;margin:0 0 6px 0;padding:0;background:linear-gradient(#5b7bd8,#2c3f7a);align-items:center;justify-content:center}
html.touch #m-ctl #mount-btn img{width:42px;height:42px;pointer-events:none} html.touch #m-ctl #mount-btn.on{background:linear-gradient(#5aa05a,#2d6a35)}
html.touch #pet-row{position:absolute;left:calc(max(8px,env(safe-area-inset-left)) + 142px);top:6px;z-index:96;margin:0;flex-direction:row;align-items:flex-start}
html.touch .pet-chip{height:38px;padding:2px 8px 2px 3px;background:linear-gradient(rgba(74,53,32,.85),rgba(42,27,14,.85))} html.touch .pet-chip img{width:30px;height:30px} html.touch .pet-chip span{display:none}
html.touch body.m-drawer #pet-row{display:none!important}
html.touch #pet-row .mnt{display:none}
`;
    function injectCSS() { if ($('pets-css')) return; const s = document.createElement('style'); s.id = 'pets-css'; s.textContent = CSS; document.head.appendChild(s); }
    const img = (id, kind, s) => '<img alt="" draggable="false" src="' + portraitUrl(id, kind, s) + '">';
    const _pu = Object.create(null);
    function portraitUrl(id, kind, s) { const k = kind + id + s; return _pu[k] || (_pu[k] = PetArt.portrait(id, kind, s).toDataURL()); }
    function petStatLinesM(id, lvl) { const s = petStats(id, lvl); return Object.keys(s).map((k) => '<span>' + fmtPct(s[k] * PM_MUL) + ' ' + STN[k] + '</span>').join(''); }
    function statLines(id, lvl) { const s = petStats(id, lvl); return Object.keys(s).map((k) => '<span>' + fmtPct(s[k]) + ' ' + STN[k] + '</span>').join(''); }

    function ensureDOM() {
        if (!gameOn()) return false; injectCSS();
        if (!$('pet-row')) {
            const row = document.createElement('div'); row.id = 'pet-row';
            row.innerHTML = '<button type="button" class="pet-chip pet" id="pet-chip" aria-label="Gerenciar pet"></button><button type="button" class="pet-chip mnt" id="mount-chip" aria-label="Montar ou desmontar"></button>';
            const hud = document.querySelector('.hud-header'); if (hud && hud.parentNode) hud.parentNode.insertBefore(row, hud.nextSibling); else document.body.appendChild(row);
            $('pet-chip').onclick = () => togglePanel('pet'); $('mount-chip').onclick = () => ride();
        }
        if (!$('pets-win')) {
            const w = document.createElement('div'); w.id = 'pets-win'; const gc = $('game-container') || document.body; gc.appendChild(w);
            w.addEventListener('click', onPanelClick);
        }
        // celular: o HUD de cima some (.hud-header) e a linha de chips vai para o canto; botão de montar ao lado do Atacar
        if (document.documentElement.classList.contains('touch')) {
            const row = $('pet-row'), gc = $('game-container'); if (row && gc && row.parentNode !== gc) gc.appendChild(row);
            const ctl = $('m-ctl'); if (ctl && !$('mount-btn')) { const b = document.createElement('button'); b.type = 'button'; b.id = 'mount-btn'; b.className = 'mobile-btn'; b.setAttribute('aria-label', 'Montar'); b.addEventListener('click', (e) => { e.preventDefault(); ride(); }); ctl.insertBefore(b, ctl.firstChild); }
        }
        return true;
    }
    function renderChips() {
        if (!ensureDOM()) return; ensure(); const row = $('pet-row'), pc = $('pet-chip'), mc = $('mount-chip'), mb = $('mount-btn');
        const pet = player.pet, hasM = !!player.mount && Object.keys(player.mounts).length > 0, hasPM = petCan(), hasAny = !!pet || hasM || Object.keys(player.pets).length > 0;
        row.classList.toggle('on', hasAny);
        const sig = (pet ? pet.id + pet.lvl + pet.name + pet.mode : '-') + '|' + (hasM ? player.mount + mLvl(player.mount) + (player.mounts[player.mount] && player.mounts[player.mount].name || '') : '-') + P.mounted + P.pm + hasPM + '|' + hasAny;
        if (sig === P.lastSig) return; P.lastSig = sig;
        if (pet && PETS[pet.id]) { pc.style.display = ''; pc.innerHTML = img(pet.id, 'pet', 52) + '<span>' + esc(pet.name || PETS[pet.id][0]) + '</span><small>Nv ' + pet.lvl + '</small>'; pc.title = 'Pet: ' + (pet.name || PETS[pet.id][0]) + ' — ' + MODES[pet.mode] + '. Clique para gerenciar (P)'; }
        else if (hasAny) { pc.style.display = ''; pc.innerHTML = '<span>Pets</span>'; pc.title = 'Seus pets e montarias (P)'; } else pc.style.display = 'none';
        if (hasM && MOUNTS[player.mount]) { mc.style.display = ''; mc.classList.toggle('on', P.mounted); mc.innerHTML = img(player.mount, 'mount', 52) + '<span>' + (P.mounted ? 'Desmontar' : 'Montar') + '</span><small>V</small>'; mc.title = mountName(player.mount) + ' Nv ' + mLvl(player.mount) + ' (+' + mountSpd(player.mount, mLvl(player.mount)) + '% velocidade)'; if (mb) { mb.style.display = ''; mb.classList.toggle('on', P.mounted); mb.innerHTML = img(player.mount, 'mount', 64); mb.title = mc.title; } }
        else { mc.style.display = 'none'; if (mb) mb.style.display = 'none'; }
        if (hasPM && (P.pm || !hasM)) { const pn = pet.name || PETS[pet.id][0]; mc.style.display = ''; mc.classList.toggle('on', P.pm); mc.innerHTML = img(pet.id, 'pet', 52) + '<span>' + (P.pm ? 'Desmontar' : 'Montar no pet') + '</span><small>V</small>'; mc.title = pn + ' Nv ' + pet.lvl + ': montado dá os atributos do pet (x' + PM_MUL + ') e você ataca normalmente'; if (mb) { mb.style.display = ''; mb.classList.toggle('on', P.pm); mb.innerHTML = img(pet.id, 'pet', 64); mb.title = mc.title; } }
    }
    function togglePanel(tab) { if (P.ui.open && (!tab || P.ui.tab === tab)) { closePanel(); return; } openPanel(tab); }
    function openPanel(tab) { if (!ensureDOM()) return; ensure(); if (tab) P.ui.tab = tab; P.ui.open = true; $('pets-win').classList.add('on'); document.body.classList.add('pets-open'); renderPanel(true); }
    function closePanel() { P.ui.open = false; const w = $('pets-win'); if (w) w.classList.remove('on'); document.body.classList.remove('pets-open'); }
    function cell(kind, id, owned, cur) {
        const d = kind === 'pet' ? PETS[id] : MOUNTS[id], rar = d[1];
        if (!owned) return '<div class="pw-cell lock" title="' + esc(d[4]) + '">' + img(id, kind, 64).replace('<img', '<img style="filter:brightness(0)"') + '<b>???</b><small>' + RARN[rar] + '</small></div>';
        const lv = kind === 'pet' ? (player.pets[id].lvl | 0 || 1) : mLvl(id);
        return '<div class="pw-cell' + (cur ? ' on' : '') + '" data-a="' + (kind === 'pet' ? 'eqp' : 'selm') + '" data-id="' + id + '">' + img(id, kind, 64) + '<b style="color:' + RARC[rar] + '">' + esc(d[0]) + '</b><small>' + (kind === 'pet' ? 'Nv ' + lv : 'Nv ' + lv + ' · +' + String(mountSpd(id, lv)).replace('.', ',') + '%') + '</small></div>';
    }
    function renderPanel(force) {
        const w = $('pets-win'); if (!w || !P.ui.open) return; ensure(); const tab = P.ui.tab;
        const pet = player.pet, nP = Object.keys(player.pets).length, nM = Object.keys(player.mounts).length;
        let h = '<div class="pw-h"><span class="pw-t">Pets e Montarias</span><button class="pw-tab' + (tab === 'pet' ? ' on' : '') + '" data-a="tab" data-id="pet">Pets ' + nP + '/' + PET_IDS.length + '</button><button class="pw-tab' + (tab === 'mount' ? ' on' : '') + '" data-a="tab" data-id="mount">Montarias ' + nM + '/' + MOUNT_IDS.length + '</button><button class="pw-x" data-a="close" aria-label="Fechar">×</button></div><div class="pw-body">';
        if (tab === 'pet') {
            if (pet && PETS[pet.id]) {
                const d = PETS[pet.id], need = pet.lvl >= MAXLVL ? 1 : needXP(pet.lvl), pct = pet.lvl >= MAXLVL ? 100 : clamp(pet.xp / need * 100, 0, 100);
                const nameEl = P.ui.renaming ? '<input class="pw-in" id="pw-name" maxlength="14" value="' + esc(pet.name || '') + '" placeholder="' + esc(d[0]) + '"><button class="pw-b go" data-a="rnok">OK</button>' : '<b>' + esc(pet.name || d[0]) + '</b> <button class="pw-b" data-a="ren" style="min-height:24px;padding:0 8px;font-size:.66rem">Nome</button>';
                h += '<div class="pw-card">' + img(pet.id, 'pet', 128) + '<div class="pw-ct"><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' + nameEl + '</div><small>' + esc(d[0]) + ' · <span style="color:' + RARC[d[1]] + '">' + RARN[d[1]] + '</span> · Nível ' + pet.lvl + (pet.lvl >= MAXLVL ? ' (máx.)' : '') + '</small><div class="pw-bar"><i style="width:' + pct + '%"></i></div><small>' + (pet.lvl >= MAXLVL ? 'Nível máximo' : pet.xp + ' / ' + need + ' XP') + '</small></div></div>';
                h += '<div class="pw-sec">Atributos <small style="color:#ffd27a">(só montado)</small></div><div class="pw-st">' + (pet.lvl >= PET_MLVL ? petStatLinesM(pet.id, pet.lvl) + '<span>+' + pmSpd(pet.id) + '% Velocidade</span>' : statLines(pet.id, pet.lvl)) + '</div>';
                h += pet.lvl >= PET_MLVL ? '<div class="pw-hint" style="color:#ffd27a">Bônus ativos só montado: ' + (P.pm ? 'ATIVOS agora.' : 'inativos agora (desmontado).') + ' Montado, o pet cresce, você ganha os atributos acima (x' + String(PM_MUL).replace('.', ',') + ') e <b>não pode lutar</b> montado: desmonte para atacar (e ao ser atingido você desmonta).</div><div><button class="pw-b go" data-a="pmnt">' + (P.pm ? 'Desmontar do pet' : 'Montar no pet') + (player.mount ? '' : ' (V)') + '</button></div>' : '<div class="pw-hint">No <b>nível ' + PET_MLVL + '</b> o pet fica grande o bastante para você montar nele. Montado você ganha os atributos acima (x' + String(PM_MUL).replace('.', ',') + ') mas não luta montado. Desmontado, o pet só ajuda a coletar e lutar, sem dar atributos.</div>';
                h += '<div class="pw-sec">O que o pet faz</div>' + Object.keys(MODES).map((k) => '<div class="pw-mode' + (pet.mode === k ? ' on' : '') + '" data-a="mode" data-id="' + k + '"><i></i>' + MODES[k] + '</div>').join('');
                h += '<div class="pw-hint">Coleta itens e moedas do chão num raio de ' + COLLECT_R + ' px (1 a cada 1,2 s) e só se houver espaço na mochila. Atacar: ajuda com dano pequeno, nunca dá o golpe final. Enquanto você está montado nele o pet só carrega você.</div><div><button class="pw-b bad" data-a="unp">Guardar pet</button></div>';
            } else h += '<div class="pw-hint">Nenhum pet equipado. Pets são raros: caem de monstros e chefes, de baús de pesca e há alguns à venda. Use o item <b>Pet ...</b> da mochila e escolha abaixo.</div>';
            h += '<div class="pw-sec">Coleção de pets</div><div class="pw-grid">' + PET_IDS.map((id) => cell('pet', id, !!player.pets[id], !!(pet && pet.id === id))).join('') + '</div>';
        } else {
            const cm = player.mount && MOUNTS[player.mount];
            if (cm) {
                const id = player.mount, d = MOUNTS[id], m = player.mounts[id], lv = m.lvl, st = mStage(lv), need = lv >= MLVL ? 1 : mNeed(lv), pct = lv >= MLVL ? 100 : clamp(m.xp / need * 100, 0, 100);
                const spd = mountSpd(id, lv), sc = mountSec(id, lv), nxt = lv < MLVL ? mountSpd(id, lv + 1) : spd, nst = st < 3 ? (st + 1) * 10 : 0, sd = MSEC[id];
                const nameEl = P.ui.renamingM ? '<input class="pw-in" id="pw-mname" maxlength="14" value="' + esc(m.name || '') + '" placeholder="' + esc(d[0]) + '"><button class="pw-b go" data-a="mrnok">OK</button>' : '<b>' + esc(m.name || d[0]) + '</b> <button class="pw-b" data-a="mren" style="min-height:24px;padding:0 8px;font-size:.66rem">Nome</button>';
                h += '<div class="pw-card">' + '<img alt="" draggable="false" src="' + PetArt.portrait(id, 'mount', 128, st).toDataURL() + '">' + '<div class="pw-ct"><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' + nameEl + '</div><small>' + esc(d[0]) + ' · <span style="color:' + RARC[d[1]] + '">' + RARN[d[1]] + '</span>' + (d[3] ? ' · voa baixo' : '') + '</small>'
                    + '<small>Nível ' + lv + (lv >= MLVL ? ' (máx.)' : '') + ' · Fase: <b style="color:#ffd27a">' + STAGEN[st] + '</b></small><div class="pw-bar"><i style="width:' + pct + '%"></i></div><small>' + (lv >= MLVL ? 'Nível máximo' : 'XP ' + m.xp.toLocaleString('pt-BR') + ' / ' + need.toLocaleString('pt-BR')) + '</small>'
                    + '<div><button class="pw-b go" data-a="mnt">' + (P.mounted ? 'Desmontar' : 'Montar') + ' (V)</button></div></div></div>';
                h += '<div class="pw-sec">Bônus atuais</div><div class="pw-st"><span>+' + String(spd).replace('.', ',') + '% Velocidade</span>' + (sc && sc.v > 0 ? '<span>' + fmtPct(sc.v) + ' ' + sc.label + '</span>' : '') + '</div>';
                h += '<div class="pw-sec">Próximo</div><div class="pw-hint">' + (lv < MLVL ? 'Nível ' + (lv + 1) + ': velocidade +' + String(nxt).replace('.', ',') + '%.' : 'Nível máximo alcançado.') + (nst ? ' No nível ' + nst + ' (fase ' + STAGEN[st + 1] + '): ' + esc(MSTAGE_DESC[id][st]) + (sd ? ' e +' + sd[1] + '% ' + sd[2] + ' (só montado)' : '') + '.' : '') + '</div>';
                h += '<div class="pw-hint">A montaria ganha XP enquanto você cavalga (1 XP a cada ' + MXP_PX + ' px, mais um pouco pelo tempo). A velocidade cresce até +20% sobre a base no nível 30, sempre dentro do teto de +' + SPD_CAP + '% (pets + montaria). Montado você não luta; ela some em casas, cavernas, lojas e banco.</div>';
            }
            else h += '<div class="pw-hint">Nenhuma montaria ainda. Compre uma <b>Sela Cavalo...</b> no Fazendeiro/Mercador, crie a sela de couro, ou encontre selas raras com chefes. Use a sela da mochila para aprender a montaria.</div>';
            h += '<div class="pw-sec">Coleção de montarias</div><div class="pw-grid">' + MOUNT_IDS.map((id) => cell('mount', id, !!player.mounts[id], player.mount === id)).join('') + '</div>';
        }
        h += '</div>';
        if (!force && w._h === h) return; const keep = w.querySelector('.pw-body'), st = keep ? keep.scrollTop : 0; w._h = h; w.innerHTML = h; const nb = w.querySelector('.pw-body'); if (nb) nb.scrollTop = st;
        const minp = $('pw-mname'); if (minp) { minp.focus(); minp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') { renameMount(minp.value); P.ui.renamingM = false; renderPanel(true); } else if (e.key === 'Escape') { P.ui.renamingM = false; renderPanel(true); } }; }
        const inp = $('pw-name'); if (inp) { inp.focus(); inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') { rename(inp.value); P.ui.renaming = false; renderPanel(true); } else if (e.key === 'Escape') { P.ui.renaming = false; renderPanel(true); } }; }
    }
    function onPanelClick(e) {
        const el = e.target.closest('[data-a]'); if (!el) return; const a = el.dataset.a, id = el.dataset.id; ensure();
        if (a === 'close') closePanel(); else if (a === 'tab') { P.ui.tab = id; P.ui.renaming = false; P.ui.renamingM = false; renderPanel(true); }
        else if (a === 'mode') setMode(id); else if (a === 'pmnt') togglePetMount(); else if (a === 'unp') unequipPet(); else if (a === 'eqp') { if (!player.pet || player.pet.id !== id) equipPet(id); }
        else if (a === 'selm') chooseMount(id); else if (a === 'mnt') toggleMount(); else if (a === 'ren') { P.ui.renaming = true; renderPanel(true); }
        else if (a === 'mren') { P.ui.renamingM = true; renderPanel(true); } else if (a === 'mrnok') { const i = $('pw-mname'); renameMount(i ? i.value : ''); P.ui.renamingM = false; renderPanel(true); }
        else if (a === 'rnok') { const i = $('pw-name'); rename(i ? i.value : ''); P.ui.renaming = false; renderPanel(true); }
        renderChips();
    }

    document.addEventListener('keydown', (e) => {
        if (!gameOn()) return; if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '') || e.ctrlKey || e.metaKey || e.altKey) return;
        const k = (e.key || '').toLowerCase();
        if (k === 'v') ride();
        else if (k === 'p') { ensure(); togglePanel(); }
        else if (k === 'escape' && P.ui.open) closePanel();
    });

    /* ============================ INICIALIZAÇÃO ============================ */
    function wire() {
        wrapAll(); merge(); registerStats();
        try { if (typeof updateUI === 'function') { /* mantém os chips em dia sem tocar no updateUI */ } } catch (e) { }
        setInterval(() => { try { if (gameOn() && ensure()) { renderChips(); if (P.ui.open) renderPanel(false); } } catch (e) { } }, 500);
    }
    window.addEventListener('load', () => { wire(); setTimeout(() => { wrapAll(); registerStats(); }, 1500); });

    window.Pets = {
        PETS, MOUNTS, PET_IDS, MOUNT_IDS, MODES, RARN, RARC, cfg: { dropMul, COLLECT_R, SPD_CAP, MAXLVL },
        bonus, speedFactor, merge, tick, queue, mountOf, drawMounted, itemIcon, fill, onSync, onXP, useItem, equip: equipPet, unequip: unequipPet, setMode, rename, renameMount, mountSpd, mStage, mNeed, mLvl, mount, dismount, toggleMount, choose: chooseMount,
        open: openPanel, close: closePanel, indoor, petItem, mountItem, petStats, grant, rollSource, onKill, postKill,
        mountPet, dismountPet, togglePetMount, ride, petCan, PET_MLVL, PM_MUL, isMounted: () => P.mounted, isPetMounted: () => P.pm, state: () => ({ mounted: P.mounted, pm: P.pm, pet: player && player.pet, fol: P.fol.me && { x: P.fol.me.x, y: P.fol.me.y, view: P.fol.me.view, sleep: !!P.fol.me.sleep, mv: P.fol.me.mv }, tgt: !!P.tgt, others: P.others }),
        _P: P
    };
})();
