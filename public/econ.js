/* MiniScape 2D — ECONOMIA E PROGRESSÃO: níveis mínimos, ofícios e preço de venda a NPC (fonte única; cliente E servidor/testes).
   Carregado no navegador (window.Econ) e no servidor (require('./public/econ.js')). Nada aqui toca em DOM nem em estado do jogo.

   O que mora aqui
   1) NÍVEL MÍNIMO PARA EQUIPAR (`reqOf`): tabela por tier/nome + derivação automática pela força do item. Campo do item: `req: { skill, lvl }`
      (ou só `lvl: N` no editor Dev; a perícia é escolhida pelo tipo do item). Perícias: combat (Combate), defence (Defesa), ranged (Arquearia), magic (Magia),
      cmb = "nível de combate" (joias). Ferramentas usam a perícia de ofício (mining, woodcutting).
   2) OFÍCIOS: tipos de árvore e rocha com nível, ferramentas por tier, receitas (Artesanato), fundição, culinária, fazenda, alquimia, encantamento.
      Tempo por ação diminui com o nível (`gatherFrames`), chance de sucesso e de dobrar o recurso sobem com o nível.
   3) VENDA A NPC (`makeValuer`): preço de venda por unidade. Campo do item `sell` (moedas por unidade): número > 0 = preço escolhido;
      0, null ou `nosell: true` = NÃO vendível; ausente = preço automático (pré-set). Itens exclusivos (Mímicos, pets, montarias, encantados, iscas, caixas, missão) nunca são vendidos.
      Regras anti-exploit: venda < compra na loja (sempre), venda de um item fabricado <= 1,2 x soma da venda dos materiais, e a conta fecha para fundição e culinária.
   Valores de venda: ~15% do preço de loja para equipamento/ferramenta, ~30% para recursos/comida/poções; sem preço de loja: tabela moderada (PRIM) ou força do item (gearPrice). */
(function (root, factory) {
    const m = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = m; else root.Econ = m;
})(typeof self !== 'undefined' ? self : this, function (root) {
    'use strict';

    const TABLE_V = 2;                       // versão da tabela de requisitos (itemDB guarda `reqV`)
    const MAXL = 99;
    const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : (d === undefined ? 0 : d);
    const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
    const lv99 = (v) => clamp(Math.floor(Number(v)) || 1, 1, MAXL);

    /* nomes das perícias (iguais aos do jogo, Labels.skill) */
    const SKN = { combat: 'Combate', defence: 'Defesa', ranged: 'Arquearia', magic: 'Magia', cmb: 'Nível de Combate', hp: 'Vitalidade', woodcutting: 'Lenhador', mining: 'Mineração', fishing: 'Pesca', cooking: 'Culinária', smithing: 'Ferraria', crafting: 'Artesanato', farming: 'Agricultura', alchemy: 'Alquimia', enchanting: 'Encantamento', firemaking: 'Fogueira', prayer: 'Oração' };
    const skillName = (k) => SKN[k] || String(k);

    /* ============================ 1) REQUISITO DE NÍVEL DOS EQUIPAMENTOS ============================
       Tier -> nível: Couro/Bronze 1 · Ferro 10 · Aço 20 · Ouro 25 · Mithril 40 · Dragão 75-80 · drops de chefe final 60-85. Magia: Aprendiz 1, Adepto 20, Místico 40, Arcano 60.
       Casa com o poder do item em Balance.typRating (arma ~ 4 + 0,22 x nível) e Balance.typArmor (armadura ~ 6 + 0,34 x nível). */
    const R = (s, l) => ({ skill: s, lvl: l });
    const REQ_NAME = {
        // corpo a corpo
        'Bronze Sword': R('combat', 1), 'Iron Sword': R('combat', 10), 'Steel Sword': R('combat', 20), 'Gold Sword': R('combat', 25), 'Mithril Sword': R('combat', 40), 'Bone Blade': R('combat', 60), 'Dragonscale Sword': R('combat', 75),
        'Wooden Shield': R('defence', 1), 'Bronze Shield': R('defence', 1), 'Iron Shield': R('defence', 10), 'Steel Shield': R('defence', 20), 'Gold Shield': R('defence', 25), 'Mithril Shield': R('defence', 40), 'Dragonscale Shield': R('defence', 75),
        'Bronze Body': R('defence', 1), 'Leather Body': R('defence', 1), 'Iron Body': R('defence', 10), 'Steel Body': R('defence', 20), 'Gold Body': R('defence', 25), 'Mithril Body': R('defence', 40), 'Dragonscale Body': R('defence', 75),
        'Bronze Helmet': R('defence', 1), 'Iron Helmet': R('defence', 10), 'Steel Helmet': R('defence', 20), 'Gold Helmet': R('defence', 25), 'Mithril Helmet': R('defence', 40), 'Dragonscale Helmet': R('defence', 75), 'Lich Crown': R('defence', 85),
        // arqueiro
        'Leather Hood': R('ranged', 1), 'Studded Hood': R('ranged', 10), 'Studded Body': R('ranged', 10), 'Wolf Hood': R('ranged', 20), 'Wolf Hide Body': R('ranged', 20), 'Ranger Hood': R('ranged', 40), 'Ranger Body': R('ranged', 40), 'Dragonhide Hood': R('ranged', 75), 'Dragonhide Body': R('ranged', 75),
        'Shortbow': R('ranged', 1), 'Longbow': R('ranged', 10), 'Composite Bow': R('ranged', 30), 'Elven Bow': R('ranged', 50), 'Dragon Bow': R('ranged', 80),
        'Bronze Arrow': R('ranged', 1), 'Feather Arrow': R('ranged', 1), 'Iron Arrow': R('ranged', 10), 'Steel Arrow': R('ranged', 20), 'Mithril Arrow': R('ranged', 40), 'Dragon Arrow': R('ranged', 75),
        // mago
        'Staff': R('magic', 1), 'Air Staff': R('magic', 5), 'Water Staff': R('magic', 20), 'Earth Staff': R('magic', 40), 'Fire Staff': R('magic', 60), 'Mystic Staff': R('magic', 70), 'Archmage Staff': R('magic', 80),
        'Apprentice Hat': R('magic', 1), 'Apprentice Robe': R('magic', 1), 'Adept Hat': R('magic', 20), 'Adept Robe': R('magic', 20), 'Mystic Hat': R('magic', 40), 'Mystic Robe': R('magic', 40), 'Arcane Hat': R('magic', 60), 'Arcane Robe': R('magic', 60),
        // joias (nível de combate)
        'Gold Ring': R('cmb', 10), 'Gold Amulet': R('cmb', 10), 'Ring of Swiftness': R('cmb', 15), 'Ring of Vigor': R('cmb', 20), 'Ring of Fury': R('cmb', 25), 'Amulet of Haste': R('cmb', 30), 'Amulet of Blood': R('cmb', 40), 'Amulet of Warding': R('cmb', 45), 'Soul Pendant': R('cmb', 60),
        'Ring of Focus': R('cmb', 20), 'Amulet of Clarity': R('cmb', 35), 'Ring of the Sage': R('magic', 40), 'Amulet of the Archmage': R('magic', 60),
        // ferramentas de ofício (perícia do ofício)
        'Bronze Pickaxe': R('mining', 1), 'Iron Pickaxe': R('mining', 15), 'Steel Pickaxe': R('mining', 30), 'Mithril Pickaxe': R('mining', 55),
        'Bronze Axe': R('woodcutting', 1), 'Iron Axe': R('woodcutting', 15), 'Steel Axe': R('woodcutting', 30), 'Mithril Axe': R('woodcutting', 55)
    };
    // Mímicos: nível baixo (evoluem com o jogador). cabeça 1, corpo/escudo 5, arma 10, anel 15, amuleto 20
    const MIMIC_SLOT_LVL = { head: 1, body: 5, shield: 5, weapon: 10, ring: 15, amulet: 20 };
    const MIMIC_SK = { guerreiro: { weapon: 'combat', head: 'defence', body: 'defence', shield: 'defence' }, arqueiro: { weapon: 'ranged', head: 'ranged', body: 'ranged' }, mago: { weapon: 'magic', head: 'magic', body: 'magic' } };
    function mimicReq(cls, slot) {
        const lvl = MIMIC_SLOT_LVL[slot] || 1, sk = (MIMIC_SK[cls] && MIMIC_SK[cls][slot]) || 'cmb';
        return lvl > 1 ? { skill: sk, lvl } : null;
    }
    // valores padrão ANTIGOS (gear.js doblava os níveis): se o item do banco ainda tem exatamente isso e nunca foi carimbado (reqV), é tratado como "não editado" e vira a tabela nova
    const LEGACY_LVLS = [1, 5, 8, 10, 12, 15, 16, 20, 22, 24, 25, 30, 35, 36, 40, 44, 50, 60, 70, 80];

    // poder -> nível (interpolação linear entre pontos), para itens sem entrada na tabela (criados no Dev)
    function interp(pts, x) {
        if (x <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const a = pts[i - 1], b = pts[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); }
        const a = pts[pts.length - 2], b = pts[pts.length - 1]; return Math.min(MAXL, b[1] + (b[1] - a[1]) * (x - b[0]) / (b[0] - a[0]));
    }
    const WEAPON_PTS = [[0, 1], [4, 1], [7, 10], [10, 20], [15, 40], [20, 75], [30, 90], [40, 99]];                 // bonusDmg -> nível
    const ARMOR_PTS = [[0, 1], [1, 1], [2, 10], [3, 20], [4.3, 40], [6, 75], [8, 90], [10, 99]];                      // defBonus / escala do espaço -> nível
    const SLOT_SCALE = { head: 1, body: 3, shield: 2 };
    const JEWEL_W = { crit: 2, critDmg: 0.3, moveSpd: 1, atkSpd: 1, lifesteal: 3, luck: 0.5, dr: 2, cdr: 2.5, spellDmg: 3, save: 0.8 };
    function autoSkill(it) {
        if (!it) return 'combat';
        if (it.tool === 'pickaxe') return 'mining'; if (it.tool === 'axe') return 'woodcutting';
        if (it.slot === 'ring' || it.slot === 'amulet') return 'cmb';
        if (it.slot === 'weapon') return it.tool === 'ranged' ? 'ranged' : it.tool === 'magic' ? 'magic' : 'combat';
        if (it.slot === 'ammo') return 'ranged';
        if (it.hat === 'wizard' || it.robe) return 'magic'; if (it.hat === 'hood') return 'ranged';
        return 'defence';
    }
    function autoLvl(it) {
        if (!it) return 1;
        if (it.tool === 'pickaxe' || it.tool === 'axe') { const t = Math.max(1, Math.floor(num(it.tier, 1))); return [1, 1, 15, 30, 55, 70, 85][Math.min(6, t)] || 1; }
        if (it.slot === 'weapon') return Math.round(interp(WEAPON_PTS, num(it.bonusDmg)));
        if (it.slot === 'ammo') return Math.round(interp(WEAPON_PTS, num(it.bonusDmg) * 1.4));
        if (it.slot === 'head' || it.slot === 'body' || it.slot === 'shield') return Math.round(interp(ARMOR_PTS, num(it.defBonus) / (SLOT_SCALE[it.slot] || 1)));
        if (it.slot === 'ring' || it.slot === 'amulet') { let s = 0; for (const k of Object.keys(JEWEL_W)) s += num(it[k]) * JEWEL_W[k]; return clamp(Math.round(s * 3), 1, 80); }
        return 1;
    }
    const isGear = (it) => !!it && (it.type === 'equipment' || it.type === 'tool') && (!!it.slot || !!it.tool) && it.tool !== 'net' && it.tool !== 'rod';
    const validReq = (r) => !!r && typeof r === 'object' && typeof r.skill === 'string' && r.skill && num(r.lvl) >= 1;
    /* requisito do item (objeto ou nome), SEM efeito colateral. `db` = itemDB (a definição do banco manda sobre a cópia da mochila). Devolve {skill, lvl} ou null (lvl 1 = sem requisito) */
    function reqOf(item, db) {
        if (!item) return null;
        const name = typeof item === 'string' ? item : item.name, d = (db && name && own(db, name)) ? db[name] : null, it = d || (typeof item === 'object' ? item : { name });
        if (!isGear(it) && !(typeof item === 'object' && isGear(item))) return null;
        if (it.mimic) return mimicReq(it.mimic, it.slot);
        if (it.reqV === TABLE_V && validReq(it.req)) return it.req.lvl > 1 ? { skill: it.req.skill, lvl: lv99(it.req.lvl) } : null;   // carimbado: vale o que está no item (inclusive edição do admin)
        if (own(REQ_NAME, name)) { const r = REQ_NAME[name]; return r.lvl > 1 ? { skill: r.skill, lvl: r.lvl } : null; }
        if (validReq(it.req) && !(it.reqV === undefined && own(REQ_NAME, name))) return it.req.lvl > 1 ? { skill: it.req.skill, lvl: lv99(it.req.lvl) } : null;
        if (num(it.lvl) >= 1 && !it.slot === false) { const l = lv99(it.lvl); return l > 1 ? { skill: autoSkill(it), lvl: l } : null; }
        const l = autoLvl(it); return l > 1 ? { skill: autoSkill(it), lvl: l } : null;
    }
    /* escreve `req` + `reqV` nos itens do banco (idempotente). Devolve quantos mudaram. */
    function applyReqs(db) {
        let n = 0; if (!db || typeof db !== 'object') return 0;
        for (const k of Object.keys(db)) {
            const it = db[k]; if (!it || typeof it !== 'object') continue; if (!it.name) it.name = k;
            if (!isGear(it)) continue;
            if (it.reqV === TABLE_V) continue;
            const r = reqOf(it, null);
            if (r) { if (!it.req || it.req.skill !== r.skill || it.req.lvl !== r.lvl) it.req = { skill: r.skill, lvl: r.lvl }; } else if (it.req) delete it.req;
            it.reqV = TABLE_V; n++;
        }
        return n;
    }
    /* o jogador atende? skills = player.stats.skills ({k:{level}}); cmb vem de combatLevel */
    function levelOf(skills, key, balance) {
        if (key === 'cmb') { try { if (balance && balance.combatLevel) return balance.combatLevel(skills); } catch (e) { } return 1; }
        const s = skills && skills[key]; return s ? lv99(s.level) : 1;
    }
    function check(item, skills, balance, db) {
        const r = reqOf(item, db); if (!r) return { ok: true, req: null, have: 0 };
        const have = levelOf(skills, r.skill, balance);
        return have >= r.lvl ? { ok: true, req: r, have } : { ok: false, req: r, have, msg: 'Requer ' + skillName(r.skill) + ' ' + r.lvl + ' (você tem ' + have + ').' };
    }

    /* ============================ 2) OFÍCIOS ============================ */
    const clamp01 = (v) => clamp(v, 0, 1);
    // tempo por ação cai com o nível: base x (1 - min(0,45; nível/220)); ferramenta melhor reduz mais (spd < 1)
    const levelSpeedMul = (lvl) => 1 - Math.min(0.45, lv99(lvl) / 220);
    function gatherFrames(base, lvl, toolSpd, minFrames) { return Math.max(minFrames || 24, Math.round(base * levelSpeedMul(lvl) * (toolSpd > 0 ? toolSpd : 1))); }
    // chance de a tentativa dar certo: sobe com o nível acima do requisito (e um pouco com o nível geral da perícia)
    const successChance = (lvl, req) => clamp(0.72 + 0.0035 * (lv99(lvl) - (req || 1)) + 0.001 * lv99(lvl), 0.6, 0.97);
    // chance de render o DOBRO (níveis altos)
    const doubleChance = (lvl) => clamp((lv99(lvl) - 30) * 0.004, 0, 0.28);
    // culinária: chance de queimar cai com o nível e com o excesso sobre o nível do prato
    const burnChance = (cookLvl, foodLvl) => clamp(0.28 - 0.012 * (lv99(cookLvl) - (foodLvl || 1)) - 0.002 * lv99(cookLvl), 0.02, 0.35);

    /* árvores: nível, XP base, tronco, tempo (x base), cor da marca */
    const TREES = {
        normal: { n: 'Árvore comum', lvl: 1, xp: 25, log: 'Logs', t: 1, col: '#7bc96a' },
        oak: { n: 'Carvalho', lvl: 15, xp: 38, log: 'Oak Logs', t: 1.1, col: '#b08a4a' },
        willow: { n: 'Salgueiro', lvl: 30, xp: 68, log: 'Willow Logs', t: 1.2, col: '#5fcfa0' },
        maple: { n: 'Bordo', lvl: 45, xp: 100, log: 'Maple Logs', t: 1.3, col: '#e0703a' },
        yew: { n: 'Teixo', lvl: 60, xp: 175, log: 'Yew Logs', t: 1.45, col: '#4a8a5a' },
        magic: { n: 'Árvore Mágica', lvl: 75, xp: 250, log: 'Magic Logs', t: 1.6, col: '#c58bff' }
    };
    const LOG_ITEMS = { 'Oak Logs': { n: 'Oak Logs', icon: '🪵', desc: 'Tronco de carvalho. Queima melhor e vale mais.', fm: 1.5 }, 'Willow Logs': { n: 'Willow Logs', icon: '🪵', desc: 'Tronco de salgueiro. Flexível e valioso.', fm: 2 }, 'Maple Logs': { n: 'Maple Logs', icon: '🪵', desc: 'Tronco de bordo, de veios avermelhados.', fm: 2.6 }, 'Yew Logs': { n: 'Yew Logs', icon: '🪵', desc: 'Tronco de teixo, madeira nobre.', fm: 3.4 }, 'Magic Logs': { n: 'Magic Logs', icon: '🪵', desc: 'Madeira mágica: brilha sozinha.', fm: 4.5 } };
    // mistura de árvores por mapa (peso); o tipo de cada árvore é sorteado de forma estável pelo id (igual para todo mundo); `tk` na árvore força o tipo
    const TREE_MIX = {
        _: [['normal', 1]],
        lumbridge: [['normal', 1]], campos: [['normal', 1]], casa: [['normal', 1]],
        rio: [['normal', 0.85], ['oak', 0.15]], mina: [['normal', 0.8], ['oak', 0.2]], estrada_rei: [['normal', 0.8], ['oak', 0.2]], vila_real: [['normal', 0.7], ['oak', 0.3]],
        floresta: [['normal', 0.55], ['oak', 0.35], ['willow', 0.1]], porto_mares: [['normal', 0.6], ['oak', 0.4]], praia_naufragios: [['normal', 0.5], ['oak', 0.5]],
        trilha_elfica: [['normal', 0.15], ['oak', 0.5], ['willow', 0.35]], silvaluz: [['oak', 0.25], ['willow', 0.3], ['maple', 0.3], ['magic', 0.15]],
        pantano: [['normal', 0.2], ['oak', 0.3], ['willow', 0.5]], estrada_sombria: [['oak', 0.3], ['willow', 0.4], ['maple', 0.3]], cemiterio: [['willow', 0.3], ['maple', 0.35], ['yew', 0.35]],
        trilha_serra: [['normal', 0.2], ['oak', 0.5], ['maple', 0.3]], pedralta: [['oak', 0.4], ['maple', 0.4], ['yew', 0.2]], passo_gelado: [['maple', 0.5], ['yew', 0.5]], vale_gelado: [['maple', 0.3], ['yew', 0.55], ['magic', 0.15]]
    };
    function hash01(id) {
        let n = Number(id); if (!isFinite(n)) { const s = String(id); n = 0; for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) % 1000003; }
        const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x);
    }
    function treeKind(o, mapId) {
        if (o && typeof o.tk === 'string' && own(TREES, o.tk)) return o.tk;
        const mix = (mapId && own(TREE_MIX, mapId)) ? TREE_MIX[mapId] : TREE_MIX._, h = hash01(o && o.id); let a = 0;
        for (const e of mix) { a += e[1]; if (h < a) return e[0]; } return 'normal';
    }
    /* ferramentas: tier, nível exigido, multiplicador de tempo (menor = mais rápido) */
    const TOOLS = {
        pickaxe: { 'Bronze Pickaxe': { tier: 1, lvl: 1, spd: 1 }, 'Iron Pickaxe': { tier: 2, lvl: 15, spd: 0.9 }, 'Steel Pickaxe': { tier: 3, lvl: 30, spd: 0.8 }, 'Mithril Pickaxe': { tier: 4, lvl: 55, spd: 0.7 } },
        axe: { 'Bronze Axe': { tier: 1, lvl: 1, spd: 1 }, 'Iron Axe': { tier: 2, lvl: 15, spd: 0.9 }, 'Steel Axe': { tier: 3, lvl: 30, spd: 0.8 }, 'Mithril Axe': { tier: 4, lvl: 55, spd: 0.7 } }
    };
    const toolOf = (it) => { if (!it) return null; const k = it.tool; if (!TOOLS[k]) return null; const t = TOOLS[k][it.name]; return t ? Object.assign({ kind: k }, t) : { kind: k, tier: Math.max(1, num(it.tier, 1)), lvl: autoLvl(it), spd: Math.max(0.5, 1 - 0.1 * (Math.max(1, num(it.tier, 1)) - 1)) }; };
    const GATHER_BASE = 120;   // quadros por golpe (60/s) no nível 1, árvore/rocha "comum"
    /* rochas: nível, ferramenta mínima (tier), tempo, XP base. (Content.ROCKS lê daqui) */
    const ROCKS = {
        rock_copper: { lvl: 1, tier: 1, t: 1, xp: 20 }, rock_tin: { lvl: 1, tier: 1, t: 1, xp: 20 }, rock_iron: { lvl: 15, tier: 1, t: 1.1, xp: 35 },
        rock_coal: { lvl: 30, tier: 2, t: 1.25, xp: 50 }, rock_gold: { lvl: 40, tier: 2, t: 1.4, xp: 65 }, rock_mithril: { lvl: 55, tier: 3, t: 1.6, xp: 80 }
    };
    // fundição (nível de Ferraria); culinária e outros
    const SMELT_LVL = { bronze: 1, iron: 15, steel: 30, gold: 40, mithril: 50 };
    const SMELT_IN = { 'Bronze Bar': [['Copper Ore', 1], ['Tin Ore', 1]], 'Iron Bar': [['Iron Ore', 1]], 'Steel Bar': [['Iron Ore', 1], ['Coal', 2]], 'Gold Bar': [['Gold Ore', 2]], 'Mithril Bar': [['Mithril Ore', 1], ['Coal', 3]] };
    const COOK_LVL = { 'Raw Meat': 1, 'Raw Fish': 1, 'Raw Rabbit': 1, 'Raw Chicken': 1, 'Raw Beef': 5, 'Raw Mutton': 5, 'Raw Pork': 8, 'Potato': 8, 'Raw Venison': 15, 'Raw Salmon': 20, 'Raw Eel': 28, 'Raw Moonfish': 38, 'Raw Golden Koi': 46 };
    const CROP_LVL = { wheat: 1, carrot: 1, herb: 10, potato: 15, mana: 30 };
    const BREW_LVL = { 'Health Potion': 1, 'Mana Potion': 10, 'Greater Health Potion': 20, 'Strength Potion': 35, 'Guard Potion': 45 };
    const ENCH_LVL = [1, 30, 60];
    const BREW_IN = { 'Health Potion': [['Healing Herb', 2], ['Empty Vial', 1]], 'Mana Potion': [['Mana Blossom', 2], ['Empty Vial', 1]], 'Greater Health Potion': [['Healing Herb', 3], ['Slime Ball', 1], ['Empty Vial', 1]], 'Strength Potion': [['Healing Herb', 1], ['Boar Tusk', 1], ['Empty Vial', 1]], 'Guard Potion': [['Healing Herb', 1], ['Bat Wing', 1], ['Empty Vial', 1]] };
    const FIRE_XP = { 'Logs': 40 };   // XP de Fogueira por tronco: Logs 40, os melhores rendem mais (LOG_ITEMS.fm)

    /* nível de Artesanato para fabricar: 60% do nível de equipar (ferro 6, aço 12, mithril 24, dragão 45); itens sem requisito: 1 */
    const CRAFT_FACTOR = 0.6;
    const CRAFT_NAME = { 'Bread': 1, 'Vara de Pesca': 1, 'Sela Cavalo Marrom': 20 };
    function craftLvl(item, db) {
        const name = typeof item === 'string' ? item : item && item.name; if (!name) return 1; if (own(CRAFT_NAME, name)) return CRAFT_NAME[name];
        const it = (db && own(db, name)) ? db[name] : (typeof item === 'object' ? item : null); if (!it) return 1;
        if (num(it.craftLvl) >= 1) return lv99(it.craftLvl);
        const r = reqOf(it, db); if (r && r.lvl > 1) return Math.max(1, Math.round(r.lvl * CRAFT_FACTOR));
        return 1;
    }
    const craftReq = (item, db) => { const l = craftLvl(item, db); return l > 1 ? { skill: 'crafting', lvl: l } : null; };
    const cookLvl = (it) => { if (!it) return 1; if (num(it.cookLvl) >= 1) return lv99(it.cookLvl); return own(COOK_LVL, it.name) ? COOK_LVL[it.name] : 1; };

    /* ============================ 3) VENDA A NPC ============================ */
    const RATIO_GEAR = 0.15, RATIO_RES = 0.30, CRAFT_MUL = 1.2, SELL_MAX = 2000000;
    // valores base de recursos sem preço de loja (moedas por unidade; tabela MODERADA)
    const PRIM = {
        'Logs': 2, 'Oak Logs': 4, 'Willow Logs': 7, 'Maple Logs': 12, 'Yew Logs': 22, 'Magic Logs': 40,
        'Copper Ore': 3, 'Tin Ore': 3, 'Iron Ore': 5, 'Coal': 5, 'Gold Ore': 14, 'Mithril Ore': 20,
        'Bones': 1, 'Dragon Bones': 30,
        'Raw Meat': 1, 'Raw Fish': 1, 'Raw Beef': 3, 'Raw Mutton': 3, 'Raw Chicken': 2, 'Raw Pork': 3, 'Raw Venison': 6, 'Raw Rabbit': 2,
        'Wheat': 1, 'Carrot': 1, 'Potato': 2, 'Healing Herb': 2, 'Mana Blossom': 3,
        'Cowhide': 4, 'Deer Hide': 5, 'Wolf Pelt': 6, 'Wool': 2, 'Feather': 1, 'Rabbit Foot': 6, 'Boar Tusk': 6, 'Troll Tooth': 12, 'Bat Wing': 4, 'Spider Silk': 4, 'Slime Ball': 2,
        'Ectoplasm': 8, 'Stone Core': 40, 'Dark Tome': 35, 'Dragon Scale': 60, 'Bota Velha': 1, 'Pó Arcano': 2
    };
    const FISH_RAW = [2, 6, 14, 30, 50];                 // peixe cru por raridade (comum..lendário); o cozido vale até 1,2x o cru: 2/7/16/36/60
    const FISH_HEAL = [8, 13, 21, 32, 48];
    // preço "de loja" estimado para equipamento sem loja (para derivar a venda): cresce com o nível exigido
    const GEAR_PRICE = { weapon: [150, 19], body: [200, 35.5], shield: [120, 17.8], head: [110, 14.4], ring: [100, 14], amulet: [100, 14], pickaxe: [100, 18], axe: [80, 14], ammo: [2, 0.5] };
    function gearPrice(it, lvl) {
        const k = it.tool === 'pickaxe' ? 'pickaxe' : it.tool === 'axe' ? 'axe' : it.slot; const g = GEAR_PRICE[k]; if (!g) return 0;
        return g[0] + g[1] * (Math.max(1, lvl) - 1);
    }
    const BLOCK_RE = /^(caixa|box|chest|ba[uú])\b/i;
    /* por que NÃO se vende (texto curto para a dica), ou '' */
    function blockReason(it) {
        if (!it) return 'invalido';
        if (it.nosell === true || it.nosell === 1 || it.nosell === 'true') return 'marcado';
        if (it.mimic || it.mimicSkin || it.mimicBox) return 'mimico';
        if (it.type === 'pet' || it.petId) return 'pet';
        if (it.type === 'mount' || it.mountId) return 'montaria';
        if (num(it.ench) > 0) return 'encantado';
        if (it.bait) return 'isca';
        if (it.name === 'Coins') return 'moeda';
        if (it.quest || it.type === 'quest' || it.giftOnly || it.untradeable || it.bound) return 'missao';
        if (typeof it.name === 'string' && BLOCK_RE.test(it.name)) return 'caixa';
        if (own(it, 'sell') && (it.sell === 0 || it.sell === null || it.sell === false)) return 'marcado';
        return '';
    }
    const BLOCK_TXT = { mimico: 'Itens Mímicos são ligados à conta.', pet: 'Pets não são vendidos.', montaria: 'Montarias não são vendidas.', encantado: 'Itens encantados não são vendidos a NPCs.', isca: 'Iscas não são vendidas.', moeda: '', missao: 'Itens de missão não são vendidos.', caixa: 'Caixas não são vendidas.', marcado: 'Este item não pode ser vendido.', invalido: '' };
    const blockText = (why) => own(BLOCK_TXT, why) ? BLOCK_TXT[why] : '';

    /* monta o avaliador. db = itemDB; npcDB (lojas: shopStr 'Item,preço|...'); extra = { proc: {saída: [[mat,qtd]...]} } (fundição e poções) */
    function shopPrices(npcDB, db) {
        const m = Object.create(null);
        if (npcDB && typeof npcDB === 'object') for (const k of Object.keys(npcDB)) {
            const d = npcDB[k]; if (!d || typeof d.shopStr !== 'string' || !d.shopStr) continue;
            for (const p of d.shopStr.split('|')) { const a = p.split(','); const n = (a[0] || '').trim(), c = parseInt(a[1]); if (!n || !(c > 0)) continue; const per = db && db[n] && db[n].shopQty > 1 ? db[n].shopQty : 1; const u = c / per; if (!(n in m) || u < m[n]) m[n] = u; }
        }
        if (db) for (const n of Object.keys(db)) { const it = db[n]; if (it && num(it.price) > 0) { const u = it.price / (it.shopQty > 1 ? it.shopQty : 1); if (!(n in m) || u < m[n]) m[n] = u; } }
        return m;
    }
    function makeValuer(db, npcDB, extra) {
        db = db || {}; extra = extra || {};
        const shop = shopPrices(npcDB, db), proc = Object.assign({}, SMELT_IN, BREW_IN, extra.proc || {});
        const cooksFrom = Object.create(null);   // cozido -> cru
        for (const k of Object.keys(db)) { const it = db[k]; if (it && typeof it.cooksInto === 'string') cooksFrom[it.cooksInto] = k; }
        const memo = Object.create(null), busy = Object.create(null);
        const explicitSell = (it) => (own(it, 'sell') && num(it.sell) > 0) ? Math.min(SELL_MAX, Math.floor(it.sell)) : 0;
        function matSum(list) { let s = 0; for (const m of list) { s += sell(m[0]) * m[1]; } return s; }
        function fishIdx(it) {
            if (!it || !it.fishId) return -1; const cooked = it.cooksInto ? db[it.cooksInto] : it;
            const h = cooked && cooked.heal; const i = FISH_HEAL.indexOf(h); return i;
        }
        function recipeList(it) { if (!it || !it.recipe) return null; const out = []; for (const r of String(it.recipe).split('|')) { const p = r.split(','); const n = (p[0] || '').trim(), q = parseInt(p[1]); if (!n || !(q > 0)) return null; out.push([n, q]); } return out; }
        function sell(name) {
            if (own(memo, name)) return memo[name]; if (busy[name]) return 0;
            const it = db[name]; if (!it) return 0; busy[name] = 1;
            let v = 0;
            try { v = compute(it, name); } catch (e) { v = 0; }
            busy[name] = 0; memo[name] = v; return v;
        }
        function compute(it, name) {
            if (blockReason(it)) return 0;
            const cus = explicitSell(it), shopP = own(shop, name) ? shop[name] : 0, isGearIt = isGear(it);
            let base = 0, capped = true;
            if (cus > 0) { base = cus; }
            else if (own(PRIM, name)) base = PRIM[name];
            else if (it.fishId) {
                const i = fishIdx(it);
                if (i >= 0) base = it.cooksInto ? FISH_RAW[i] : Math.floor(FISH_RAW[i] * CRAFT_MUL);
                else base = Math.max(1, Math.round(num(it.value) * RATIO_RES));
            }
            else if (shopP > 0) base = Math.round(shopP * (isGearIt ? RATIO_GEAR : RATIO_RES));
            else if (isGearIt) { const r = reqOf(it, db); base = Math.round(gearPrice(it, r ? r.lvl : 1) * RATIO_GEAR); }
            else if (num(it.value) > 0) base = Math.round(it.value * RATIO_RES);
            else if (num(it.heal) > 0 || num(it.mp) > 0) base = Math.round(Math.max(num(it.heal) * 0.6, num(it.mp) * 0.4, 1));
            else if (proc[name] || recipeList(it)) base = 1e9;            // sem outra referência: vale o teto dos materiais
            else base = 1;
            // teto 1: fabricado vale no máximo 1,2 x soma da venda dos materiais (por unidade produzida)
            const rec = recipeList(it);
            if (rec && cus <= 0 || rec && cus > 0) { const per = Math.max(1, parseInt(it.craftQty) || 1); base = Math.min(base, Math.floor(CRAFT_MUL * matSum(rec) / per)); }
            if (proc[name]) base = Math.min(base, Math.floor(CRAFT_MUL * matSum(proc[name])));
            // teto 2: o prato cozido vale no máximo 1,2 x o cru
            if (own(cooksFrom, name)) base = Math.min(base, Math.floor(CRAFT_MUL * sell(cooksFrom[name])));
            // teto 3: nunca vende por mais (nem igual) do que custa na loja
            if (shopP > 0) base = Math.min(base, Math.ceil(shopP) - 1);
            base = Math.floor(base); if (!(base >= 1)) return 0;
            return Math.min(SELL_MAX, base);
        }
        return { sell, shop, proc, blockReason, shopPrice: (n) => own(shop, n) ? shop[n] : 0, db };
    }

    /* texto padrão da tabela de venda (para README/auditoria) */
    return {
        TABLE_V, MAXL, SKN, skillName, REQ_NAME, MIMIC_SLOT_LVL, LEGACY_LVLS, reqOf, applyReqs, check, levelOf, mimicReq, autoSkill, autoLvl, isGear,
        levelSpeedMul, gatherFrames, successChance, doubleChance, burnChance, GATHER_BASE, TREES, LOG_ITEMS, TREE_MIX, treeKind, hash01, TOOLS, toolOf, ROCKS,
        SMELT_LVL, SMELT_IN, COOK_LVL, CROP_LVL, BREW_LVL, BREW_IN, ENCH_LVL, FIRE_XP, craftLvl, craftReq, cookLvl, CRAFT_FACTOR,
        PRIM, FISH_RAW, FISH_HEAL, RATIO_GEAR, RATIO_RES, CRAFT_MUL, SELL_MAX, gearPrice, blockReason, blockText, shopPrices, makeValuer
    };
});
