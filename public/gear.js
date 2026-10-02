/* MiniScape 2D — conjuntos de equipamento evolutivos (guerreiro, arqueiro, mago), joias e munição por nível.
   Tudo é ADITIVO: itens que já existem (Bronze/Iron/Steel/Mithril Sword/Shield/Body, Leather Body, Dragonscale Shield...) não mudam de atributos; só ganham a marca de conjunto (`set`).
   Campos novos num item (todos opcionais): crit (% de chance), critDmg (% a mais de dano crítico), moveSpd, atkSpd, lifesteal, luck, dr (% redução de dano), spellDmg (dano mágico plano), save (% de poupar munição/runas),
   req {skill, lvl} (nível mínimo para equipar), set (nome do conjunto), col (cor no boneco), hat ('helmet'|'hood'|'wizard'), robe (true = veste sem placas), gem (cor da gema do cajado).
   Lojas e ferreiro vendem só os níveis baixos; os altos (ouro, mithril, dragão, arcano) saem de craft e drops de chefe. */
(function () {
    'use strict';
    const ITEMS = {}, SETS = {};

    /* ---------- bônus de conjunto: vale com 3 ou mais peças (cabeça, tronco, escudo, arma) do mesmo conjunto ---------- */
    Object.assign(SETS, {
        leather: { name: 'Couro', bonus: { moveSpd: 2 } },
        bronze: { name: 'Bronze', bonus: { dr: 2 } },
        iron: { name: 'Ferro', bonus: { dr: 3 } },
        steel: { name: 'Aço', bonus: { dr: 4, atkSpd: 3 } },
        gold: { name: 'Ouro', bonus: { luck: 10, crit: 3 } },
        mithril: { name: 'Mithril', bonus: { moveSpd: 5, dr: 4 } },
        dragonscale: { name: 'Escama de Dragão', bonus: { dr: 6, crit: 5, lifesteal: 3 } },
        studded: { name: 'Couro Cravejado', bonus: { moveSpd: 3 } },
        wolf: { name: 'Lobo', bonus: { moveSpd: 6 } },
        ranger: { name: 'Patrulheiro', bonus: { crit: 5, atkSpd: 5 } },
        dragonhide: { name: 'Couro de Dragão', bonus: { crit: 6, dr: 4 } },
        apprentice: { name: 'Aprendiz', bonus: { spellDmg: 1 } },
        adept: { name: 'Adepto', bonus: { spellDmg: 2, save: 4 } },
        mystic: { name: 'Místico', bonus: { spellDmg: 3, dr: 3 } },
        arcane: { name: 'Arcano', bonus: { spellDmg: 5, save: 8, crit: 4 } }
    });
    // conjuntos antigos (só recebem a marca `set`; atributos intactos)
    const OLD_SETS = {
        'Bronze Sword': 'bronze', 'Bronze Shield': 'bronze', 'Bronze Body': 'bronze',
        'Iron Sword': 'iron', 'Iron Shield': 'iron', 'Iron Body': 'iron',
        'Steel Sword': 'steel', 'Steel Shield': 'steel', 'Steel Body': 'steel',
        'Mithril Sword': 'mithril', 'Mithril Shield': 'mithril', 'Mithril Body': 'mithril',
        'Leather Body': 'leather', 'Dragonscale Shield': 'dragonscale'
    };

    const SK = { c: 'combat', r: 'ranged', m: 'magic' };
    /* d(nome, ícone, espaço, atributos...) */
    function def(name, icon, slot, desc, o, recipe, w, craftQty) {
        const it = { name, icon, type: 'equipment', slot, stackable: false, weight: w || 2, desc };
        Object.assign(it, o || {}); if (recipe) { it.recipe = recipe; it.craftQty = craftQty || 1; }
        ITEMS[name] = it; return it;
    }
    const REQ = (k, l) => ({ skill: SK[k], lvl: l });

    /* ===== GUERREIRO: capacetes, armaduras, escudos e espadas por material ===== */
    def('Bronze Helmet', '⛑️', 'head', 'Elmo simples de bronze.', { defBonus: 1, set: 'bronze', hat: 'helmet', req: REQ('c', 1) }, 'Bronze Bar,2', 2.0);
    def('Iron Helmet', '⛑️', 'head', 'Elmo de ferro. Protege bem a cabeça.', { defBonus: 2, set: 'iron', hat: 'helmet', req: REQ('c', 5) }, 'Iron Bar,2', 2.4);
    def('Steel Helmet', '⛑️', 'head', 'Elmo de aço polido.', { defBonus: 3, set: 'steel', hat: 'helmet', req: REQ('c', 10) }, 'Steel Bar,2', 2.6);
    def('Gold Helmet', '⛑️', 'head', 'Elmo de ouro: pouca proteção, muita sorte.', { defBonus: 3, luck: 5, crit: 2, set: 'gold', hat: 'helmet', req: REQ('c', 12) }, 'Gold Bar,2', 2.8);
    def('Mithril Helmet', '⛑️', 'head', 'Elmo leve de mithril. Não pesa nas pernas.', { defBonus: 5, moveSpd: 3, set: 'mithril', hat: 'helmet', req: REQ('c', 15) }, 'Mithril Bar,2', 1.8);
    def('Dragonscale Helmet', '⛑️', 'head', 'Elmo forjado com escamas de dragão.', { defBonus: 8, dr: 2, set: 'dragonscale', hat: 'helmet', col: '#a63a2e', req: REQ('c', 30) }, 'Dragon Scale,4|Mithril Bar,1', 2.4);
    def('Wooden Shield', '🛡️', 'shield', 'Escudo de madeira. Melhor que nada.', { defBonus: 1, req: REQ('c', 1) }, 'Logs,4', 2.0);
    def('Gold Shield', '🛡️', 'shield', 'Escudo dourado, mais enfeite que defesa.', { defBonus: 5, luck: 6, set: 'gold', req: REQ('c', 12) }, 'Gold Bar,3', 3.6);
    def('Gold Body', '🦺', 'body', 'Peitoral de ouro: brilha e atrai a sorte.', { defBonus: 7, luck: 8, set: 'gold', req: REQ('c', 12) }, 'Gold Bar,5', 6.0);
    def('Gold Sword', '🗡️', 'weapon', 'Espada de ouro, afiada e vistosa.', { bonusDmg: 8, crit: 4, set: 'gold', req: REQ('c', 12) }, 'Gold Bar,2', 2.6);
    def('Dragonscale Body', '🦺', 'body', 'Armadura de escamas de dragão.', { defBonus: 18, dr: 4, set: 'dragonscale', col: '#a63a2e', req: REQ('c', 30) }, 'Dragon Scale,8|Mithril Bar,2', 7.0);
    def('Dragonscale Sword', '⚔️', 'weapon', 'Lâmina rubra forjada com escamas.', { bonusDmg: 20, crit: 5, critDmg: 20, set: 'dragonscale', col: '#c8503c', req: REQ('c', 30) }, 'Dragon Scale,5|Mithril Bar,2', 2.6);

    /* ===== ARQUEIRO: capuzes e couros, arcos e flechas ===== */
    def('Leather Hood', '🧢', 'head', 'Capuz de couro.', { defBonus: 1, set: 'leather', hat: 'hood', col: '#8b5a2b', req: REQ('r', 1) }, 'Cowhide,2', 0.6);
    def('Studded Hood', '🧢', 'head', 'Capuz de couro reforçado com rebites de ferro.', { defBonus: 2, set: 'studded', hat: 'hood', col: '#7a6a4a', req: REQ('r', 5) }, 'Cowhide,2|Iron Bar,1', 0.9);
    def('Studded Body', '🥋', 'body', 'Couro cravejado com rebites de ferro.', { defBonus: 4, set: 'studded', col: '#7a6a4a', req: REQ('r', 5) }, 'Cowhide,3|Iron Bar,1', 3.0);
    def('Wolf Hood', '🧢', 'head', 'Capuz de pele de lobo. Quente e silencioso.', { defBonus: 3, moveSpd: 3, set: 'wolf', hat: 'hood', col: '#7d838b', req: REQ('r', 10) }, 'Wolf Pelt,2|Deer Hide,1', 0.8);
    def('Wolf Hide Body', '🥋', 'body', 'Colete de pele de lobo. Deixa o passo leve.', { defBonus: 6, moveSpd: 4, set: 'wolf', col: '#7d838b', req: REQ('r', 10) }, 'Wolf Pelt,4|Deer Hide,2', 2.6);
    def('Ranger Hood', '🧢', 'head', 'Capuz verde dos patrulheiros.', { defBonus: 4, crit: 3, set: 'ranger', hat: 'hood', col: '#3f7a46', req: REQ('r', 20) }, 'Deer Hide,3|Spider Silk,3', 0.8);
    def('Ranger Body', '🥋', 'body', 'Veste de patrulheiro, costurada com seda de aranha.', { defBonus: 9, crit: 3, set: 'ranger', col: '#3f7a46', req: REQ('r', 20) }, 'Deer Hide,4|Spider Silk,4|Steel Bar,1', 3.0);
    def('Dragonhide Hood', '🧢', 'head', 'Capuz de couro de dragão.', { defBonus: 7, crit: 4, dr: 2, set: 'dragonhide', hat: 'hood', col: '#2f6a58', req: REQ('r', 30) }, 'Dragon Scale,3|Deer Hide,2', 1.0);
    def('Dragonhide Body', '🥋', 'body', 'Couro de dragão: leve e quase impenetrável.', { defBonus: 14, dr: 3, set: 'dragonhide', col: '#2f6a58', req: REQ('r', 30) }, 'Dragon Scale,6|Deer Hide,4', 3.4);
    def('Longbow', '🏹', 'weapon', 'Arco longo, mais alcance e força que o curto.', { tool: 'ranged', bonusDmg: 4, col: '#a8743a', req: REQ('r', 5) }, 'Logs,4|Cowhide,1', 1.2);
    def('Composite Bow', '🏹', 'weapon', 'Arco composto de madeira, ferro e seda. Atira mais rápido.', { tool: 'ranged', bonusDmg: 7, atkSpd: 5, col: '#8a6a3a', req: REQ('r', 15) }, 'Logs,3|Iron Bar,1|Spider Silk,2', 1.3);
    def('Elven Bow', '🏹', 'weapon', 'Arco élfico, fino e certeiro.', { tool: 'ranged', bonusDmg: 10, atkSpd: 8, crit: 4, set: 'ranger', col: '#d8c27a', req: REQ('r', 25) }, 'Logs,3|Mithril Bar,1|Spider Silk,3|Feather,4', 1.0);
    def('Dragon Bow', '🏹', 'weapon', 'Arco de escamas de dragão. Cada flecha pode ser um golpe fatal.', { tool: 'ranged', bonusDmg: 14, crit: 8, critDmg: 25, set: 'dragonhide', col: '#a63a2e', req: REQ('r', 35) }, 'Dragon Scale,3|Mithril Bar,1|Spider Silk,3', 1.4);
    def('Steel Arrow', '↗️', 'ammo', 'Flecha de ponta de aço.', { bonusDmg: 5, stackable: true, req: REQ('r', 10) }, 'Logs,1|Steel Bar,1|Feather,2', 0.01, 12);
    def('Mithril Arrow', '↗️', 'ammo', 'Flecha de mithril, voa reta.', { bonusDmg: 7, stackable: true, req: REQ('r', 20) }, 'Logs,1|Mithril Bar,1|Feather,3', 0.01, 15);
    def('Dragon Arrow', '↗️', 'ammo', 'Flecha com ponta de escama de dragão.', { bonusDmg: 10, stackable: true, req: REQ('r', 30) }, 'Dragon Scale,1|Logs,1|Feather,4', 0.01, 15);

    /* ===== MAGO: chapéus, vestes, cajados por elemento e runas ===== */
    def('Apprentice Hat', '🎩', 'head', 'Chapéu pontudo de aprendiz.', { defBonus: 1, set: 'apprentice', hat: 'wizard', col: '#4a6fc0', req: REQ('m', 1) }, 'Wool,2', 0.4);
    def('Apprentice Robe', '👘', 'body', 'Veste de lã de aprendiz.', { defBonus: 2, spellDmg: 1, set: 'apprentice', robe: true, col: '#4a6fc0', req: REQ('m', 1) }, 'Wool,4', 1.2);
    def('Adept Hat', '🎩', 'head', 'Chapéu de adepto, tecido com seda.', { defBonus: 2, spellDmg: 1, set: 'adept', hat: 'wizard', col: '#5a4fa8', req: REQ('m', 8) }, 'Wool,2|Spider Silk,2', 0.4);
    def('Adept Robe', '👘', 'body', 'Veste de adepto.', { defBonus: 4, spellDmg: 2, set: 'adept', robe: true, col: '#5a4fa8', req: REQ('m', 8) }, 'Wool,3|Spider Silk,4', 1.2);
    def('Mystic Hat', '🎩', 'head', 'Chapéu místico, sussurra feitiços.', { defBonus: 3, spellDmg: 2, set: 'mystic', hat: 'wizard', col: '#8a3fb0', req: REQ('m', 15) }, 'Spider Silk,3|Ectoplasm,2', 0.4);
    def('Mystic Robe', '👘', 'body', 'Veste místico-etérea.', { defBonus: 6, spellDmg: 3, dr: 2, set: 'mystic', robe: true, col: '#8a3fb0', req: REQ('m', 15) }, 'Spider Silk,5|Ectoplasm,4|Wool,2', 1.2);
    def('Arcane Hat', '🎩', 'head', 'Chapéu arcano, bordado com runas.', { defBonus: 5, spellDmg: 3, save: 5, set: 'arcane', hat: 'wizard', col: '#25255f', req: REQ('m', 25) }, 'Dark Tome,1|Ectoplasm,4|Spider Silk,3', 0.5);
    def('Arcane Robe', '👘', 'body', 'Veste arcana: as runas dela cuidam das suas.', { defBonus: 9, spellDmg: 5, save: 8, set: 'arcane', robe: true, col: '#25255f', req: REQ('m', 25) }, 'Dark Tome,2|Ectoplasm,6|Spider Silk,5', 1.4);
    def('Air Staff', '🦯', 'weapon', 'Cajado do ar. Poupa um pouco de runas.', { tool: 'magic', bonusDmg: 2, save: 10, gem: '#dff6ff', req: REQ('m', 3) }, 'Logs,3|Air Rune,25', 1.4);
    def('Water Staff', '🦯', 'weapon', 'Cajado da água.', { tool: 'magic', bonusDmg: 4, save: 10, gem: '#4aa8ff', req: REQ('m', 8) }, 'Logs,3|Water Rune,25|Spider Silk,1', 1.5);
    def('Earth Staff', '🦯', 'weapon', 'Cajado da terra.', { tool: 'magic', bonusDmg: 6, save: 10, gem: '#9a7a3a', req: REQ('m', 15) }, 'Logs,3|Earth Rune,25|Iron Bar,1', 1.8);
    def('Fire Staff', '🦯', 'weapon', 'Cajado do fogo.', { tool: 'magic', bonusDmg: 8, save: 10, crit: 3, gem: '#ff7a3a', req: REQ('m', 22) }, 'Logs,3|Fire Rune,25|Steel Bar,1', 1.8);
    def('Mystic Staff', '🦯', 'weapon', 'Cajado místico com núcleo de golem.', { tool: 'magic', bonusDmg: 12, atkSpd: 5, crit: 4, set: 'mystic', gem: '#c06aff', req: REQ('m', 30) }, 'Stone Core,1|Mithril Bar,1|Logs,2', 1.6);
    def('Archmage Staff', '🦯', 'weapon', 'Cajado de arquimago: guarda uma alma.', { tool: 'magic', bonusDmg: 16, crit: 6, critDmg: 20, save: 10, set: 'arcane', gem: '#ff4ad0', req: REQ('m', 40) }, 'Soul Gem,1|Mithril Bar,2|Dragon Scale,2|Logs,2', 1.8);
    ITEMS['Earth Rune'] = { name: 'Earth Rune', icon: '⛰️', type: 'resource', stackable: true, weight: 0.01, desc: 'Runa da terra.' };
    ITEMS['Fire Rune'] = { name: 'Fire Rune', icon: '🔥', type: 'resource', stackable: true, weight: 0.01, desc: 'Runa do fogo.' };

    /* ===== JOIAS (espaços Amuleto e Anel) ===== */
    def('Gold Ring', '💍', 'ring', 'Anel de ouro liso. Dá sorte.', { luck: 5 }, 'Gold Bar,1', 0.1);
    def('Ring of Swiftness', '💍', 'ring', 'Anel com pata de coelho. Seus pés agradecem.', { moveSpd: 8 }, 'Gold Bar,1|Rabbit Foot,2', 0.1);
    def('Ring of Fury', '💍', 'ring', 'Anel de presa de javali: golpes mais cruéis.', { crit: 4, critDmg: 10 }, 'Gold Bar,1|Boar Tusk,3', 0.1);
    def('Ring of Vigor', '💍', 'ring', 'Anel viscoso que amortece pancadas.', { dr: 3 }, 'Gold Bar,1|Slime Ball,5', 0.1);
    def('Gold Amulet', '📿', 'amulet', 'Amuleto de ouro da fortuna.', { luck: 8 }, 'Gold Bar,2', 0.2);
    def('Amulet of Blood', '📿', 'amulet', 'Amuleto de dente de troll: cada golpe cura um pouco.', { lifesteal: 4 }, 'Gold Bar,2|Troll Tooth,2', 0.2);
    def('Amulet of Haste', '📿', 'amulet', 'Amuleto de asa de morcego: ataques mais rápidos.', { atkSpd: 8 }, 'Gold Bar,2|Bat Wing,3', 0.2);
    def('Amulet of Warding', '📿', 'amulet', 'Amuleto com núcleo de golem: reduz o dano sofrido.', { dr: 5 }, 'Gold Bar,2|Stone Core,1', 0.3);
    def('Soul Pendant', '📿', 'amulet', 'Pingente com uma gema de alma do Lich Rei.', { crit: 6, critDmg: 25, lifesteal: 2 }, 'Soul Gem,1|Gold Bar,2', 0.3);

    /* ===== OURO: minério e barra (vem de monstros; funde na fornalha) ===== */
    ITEMS['Gold Ore'] = { name: 'Gold Ore', icon: '🟡', type: 'resource', stackable: true, weight: 2.4, desc: 'Pepita de ouro. Duas viram uma barra na fornalha (Ferraria 12).' };
    ITEMS['Gold Bar'] = { name: 'Gold Bar', icon: '🟨', type: 'resource', stackable: true, weight: 2.0, desc: 'Ouro puro. Serve para joias e para o conjunto de ouro.' };
    ITEMS['Pó Arcano'] = { name: 'Pó Arcano', icon: '✨', type: 'resource', stackable: true, weight: 0.05, desc: 'Resto de magia de itens encantados desmanchados. Vale algumas moedas e guarda um pouco de poder.', value: 6 };

    /* ===== drops de ouro (somam à tabela de cada criatura; só se ainda não tiver) ===== */
    const GOLD_DROPS = { goblin_base: 0.06, orc_base: 0.1, skeleton_base: 0.12, troll_base: 0.45, golem_base: 0.5, darkmage_base: 0.2, whelp_base: 0.5, dragon_boss: 1 };
    // lojas: só os níveis baixos
    const SHOP = {
        smith_npc: [['Bronze Helmet', 110], ['Iron Helmet', 240], ['Iron Sword', 320], ['Iron Shield', 280], ['Iron Body', 520], ['Wooden Shield', 40], ['Leather Body', 90], ['Leather Hood', 60], ['Studded Hood', 140], ['Longbow', 200], ['Iron Arrow', 6]],
        wizard_npc: [['Earth Rune', 12], ['Fire Rune', 14], ['Apprentice Hat', 70], ['Apprentice Robe', 130], ['Adept Hat', 200], ['Adept Robe', 380], ['Air Staff', 220]]
    };

    function merge() {
        try {
            Object.keys(ITEMS).forEach((k) => { if (typeof itemDB !== 'undefined' && !itemDB[k]) itemDB[k] = Object.assign({}, ITEMS[k]); });
            Object.keys(OLD_SETS).forEach((k) => { if (typeof itemDB !== 'undefined' && itemDB[k] && !itemDB[k].set) itemDB[k].set = OLD_SETS[k]; });
            if (typeof itemDB !== 'undefined' && itemDB['Shortbow'] && !itemDB['Shortbow'].req) itemDB['Shortbow'].req = REQ('r', 1);
            if (typeof npcDB !== 'undefined') {
                Object.keys(GOLD_DROPS).forEach((nk) => { const d = npcDB[nk]; if (!d || d.hp <= 0 || /Gold Ore/.test(d.lootStr || '')) return; d.lootStr = (d.lootStr ? d.lootStr + '|' : '') + 'Gold Ore,' + GOLD_DROPS[nk] + ',' + (nk === 'dragon_boss' ? 4 : 2); });
                Object.keys(SHOP).forEach((nk) => { const d = npcDB[nk]; if (!d) return; const cur = (d.shopStr || '').split('|').filter(Boolean); const have = new Set(cur.map((s) => s.split(',')[0].trim())); SHOP[nk].forEach((e) => { if (!have.has(e[0]) && itemDB[e[0]]) cur.push(e[0] + ',' + e[1]); }); d.shopStr = cur.join('|'); });
            }
            if (window.Content && Content.SMELT && !Content.SMELT.some((r) => r.id === 'gold')) Content.SMELT.push({ id: 'gold', needs: [['Gold Ore', 2]], out: 'Gold Bar', xp: 55, lvl: 12 });
        } catch (e) { console.error('Gear.merge', e); }
        try {   // magias novas (as runas novas servem para algo). No 1º merge o spellbookDB ainda não existe (zona morta do let): tenta de novo no login.
            if (!spellbookDB.some((s) => s.id === 'earth_strike')) {
                spellbookDB.push({ id: 'earth_strike', name: 'Golpe de Terra', lvl: 9, req: { 'Earth Rune': 1, 'Air Rune': 1, 'Mind Rune': 1 }, dmg: 6, color: '#b08a4a' });
                spellbookDB.push({ id: 'fire_strike', name: 'Golpe de Fogo', lvl: 14, req: { 'Fire Rune': 1, 'Air Rune': 1, 'Mind Rune': 1 }, dmg: 8, color: '#ff7a3a' });
            }
        } catch (e) { }
    }
    window.Gear = { ITEMS, SETS, REQ, merge, setOf: (it) => (it && (it.set || ((typeof itemDB !== 'undefined' && itemDB[it.name]) || {}).set)) || null };
})();
