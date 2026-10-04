#!/usr/bin/env node
/* Gera o pacote de conteúdo "Reinos de Solaris" (7 mapas ligados, monstros, chefes, itens, NPCs) em docs/packs/reinos-de-solaris.json.
   Uso: node tools/gen-expansion.js   (determinístico: mesma saída sempre).
   Estatísticas de monstros vêm de Balance.mobTable (mesma tabela do jogo), então a dificuldade acompanha o nível. */
'use strict';
const fs = require('fs'), path = require('path');
const B = require('../public/balance.js');
const CAT = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalog-sizes.json'), 'utf8'));   // tamanhos de decor/prédios/criaturas do jogo

/* ---------- aleatório determinístico ---------- */
let seed = 20261004; const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = (a, b) => Math.floor(a + rnd() * (b - a + 1)), pick = (a) => a[Math.floor(rnd() * a.length)];
const R = Math.round;

/* ---------- monstros ---------- */
const NPC = {};      // chave -> definição (npcDB)
const ITEMS = {};
const SIZE = { common: 1, light: 0.9, trash: 0.85, elite: 1.15, boss: 1.3 };
function mob(key, name, species, level, tier, c1, c2, loot, desc, biome, extra) {
    const base = CAT.cre[species] || { w: 40, h: 40 }, k = SIZE[tier] || 1, s = B.mobTable(level, tier);
    const group = tier === 'boss' ? 'chefe' : (species === 'wolf' || species === 'boar' || species === 'bat' || species === 'spider' || species === 'snake' || species === 'rat') ? 'fera' : 'monstro';
    const hp = s.hp;
    NPC[key] = Object.assign({
        name, group, species, behavior: 'aggressive', range: tier === 'boss' ? 150 : 110, speed: tier === 'boss' ? 0.65 : 1, w: R(base.w * k * (extra && extra.big || 1)), h: R(base.h * k * (extra && extra.big || 1)),
        hp, maxHit: s.dmax, xp: B.defaultXp(hp), c1, c2, lootStr: loot, dialog: '', shopStr: '', desc, biome, level, tier, hpBase: hp, hpLvl: 0, dmin: s.dmin, dmax: s.dmax, hit: s.dmax > 0 ? R(s.avg / 1.2) : 0, balV: B.VERSION
    }, extra && extra.def || {});
    if (extra && extra.range) NPC[key].range = extra.range;
    return key;
}
function npc(key, name, species, c1, dialog, shop, desc, biome) {
    const base = CAT.cre[species] || { w: 30, h: 44 };
    NPC[key] = { name, group: 'npc', species, behavior: 'npc', w: base.w, h: base.h, hp: 0, maxHit: 0, xp: 0, c1, c2: '#f1c27d', lootStr: '', dialog, shopStr: shop || '', desc, biome };
    return key;
}
const coins = (lvl, tier) => Math.round(lvl * (tier === 'boss' ? 10 : tier === 'elite' ? 5 : 3));

/* ---------- itens ---------- */
function res(name, icon, desc, sell, weight) { ITEMS[name] = { name, icon, type: 'resource', stackable: true, weight: weight || 0.3, desc, sell }; }
function gear(name, icon, slot, desc, stats, req, sell, extra) { ITEMS[name] = Object.assign({ name, icon, type: 'equipment', slot, stackable: false, weight: slot === 'weapon' ? 2 : 1.5, desc, req }, stats, sell ? { sell } : { nosell: true }, extra || {}); }
res('Insígnia do Salteador', '🪙', 'Insígnia de latão dos salteadores das colinas.', 8);
res('Esporo Brilhante', '🍄', 'Esporos que brilham no escuro. Alquimistas pagam bem.', 12);
res('Escama Cristalina', '🐟', 'Escama transparente de peixe do Lago Cristalino.', 18);
res('Fragmento Solar', '☀️', 'Lasca de pedra aquecida por um sol de séculos atrás.', 32);
res('Pena de Trovão', '🪶', 'Pena que estala de eletricidade ao toque.', 45);
res('Cristal Bruto', '💎', 'Cristal azulado ainda preso à rocha.', 60);
res('Lasca de Tempestade', '⚡', 'Fragmento de raio solidificado. Ainda zumbe.', 90);
gear('Lâmina das Colinas', '🗡️', 'weapon', 'Espada leve e afiada, tomada de um capitão de salteadores.', { bonusDmg: 7, col: '#c9a24a' }, { skill: 'combat', lvl: 12 }, 30);
gear('Capuz de Esporos', '🧢', 'head', 'Capuz tecido com fibras de cogumelo. Traz sorte a quem caça.', { defBonus: 3, luck: 4, col: '#8a4a9a' }, { skill: 'ranged', lvl: 22 }, 40);
gear('Arco do Lago', '🏹', 'weapon', 'Arco de junco trançado. Silencioso e preciso.', { bonusDmg: 7, tool: 'ranged', crit: 4, col: '#2a8f9f' }, { skill: 'ranged', lvl: 30 }, 110);
gear('Escudo de Escamas', '🛡️', 'shield', 'Escamas cristalinas coladas em madeira.', { defBonus: 7, col: '#4fd6ff' }, { skill: 'defence', lvl: 28 }, 90);
gear('Cajado Solar', '🦯', 'weapon', 'Cajado com um fragmento de sol preso na ponta.', { bonusDmg: 10, tool: 'magic', spellDmg: 4, col: '#ffcf5a' }, { skill: 'magic', lvl: 55 }, 0);
gear('Elmo Solar', '⛑️', 'head', 'Elmo dourado das Ruínas Solares.', { defBonus: 6, col: '#e8c15a' }, { skill: 'defence', lvl: 45 }, 0);
gear('Peitoral Solar', '🦺', 'body', 'Peitoral dourado que reflete a luz.', { defBonus: 14, col: '#e8c15a' }, { skill: 'defence', lvl: 45 }, 0);
gear('Martelo do Trovão', '🔨', 'weapon', 'Martelo pesado que solta faíscas a cada golpe.', { bonusDmg: 16, critDmg: 10, col: '#7fb4ff' }, { skill: 'combat', lvl: 50 }, 0);
gear('Anel do Trovão', '💍', 'ring', 'Anel que vibra: seus golpes saem mais rápidos.', { atkSpd: 4 }, { skill: 'cmb', lvl: 40 }, 0);
gear('Escudo da Tempestade', '🛡️', 'shield', 'Escudo azul-aço que desvia golpes.', { defBonus: 10, dr: 3, col: '#5aa4f0' }, { skill: 'defence', lvl: 60 }, 0);
gear('Lâmina da Tempestade', '⚔️', 'weapon', 'Lâmina que brilha como um relâmpago.', { bonusDmg: 19, crit: 5, col: '#7fe3ff' }, { skill: 'combat', lvl: 60 }, 0);
gear('Coroa de Cristal', '👑', 'head', 'Coroa de cristal puro. As técnicas voltam mais depressa.', { defBonus: 7, cdr: 5, col: '#8fe9ff' }, { skill: 'defence', lvl: 55 }, 0);
gear('Amuleto de Cristal', '📿', 'amulet', 'Amuleto de cristal que amplifica a magia.', { spellDmg: 5, cdr: 4 }, { skill: 'cmb', lvl: 50 }, 0);

/* criaturas (nível, camada) */
const K = {};
K.ladrao = mob('ladrao_colina', 'Salteador das Colinas', 'goblin', 9, 'common', '#7a5a3a', '#c9a24a', 'Bones,1,1|Insígnia do Salteador,0.5,1|Health Potion,0.1,1|Coins,0.8,' + coins(9, 'common'), 'Rouba viajantes desde antes do moinho.', 'Colinas Ventosas');
K.capitao = mob('capitao_salteadores', 'Capitão Dente-de-Ferro', 'orc', 15, 'boss', '#8a3a2a', '#c9a24a', 'Lâmina das Colinas,0.3,1|Insígnia do Salteador,1,5|Greater Health Potion,0.5,2|Coins,1,' + coins(15, 'boss'), 'Chefe dos salteadores. Ninguém passou pelas colinas sem pagar.', 'Colinas Ventosas', { big: 1.0 });
K.cogu = mob('cogumelo_andante', 'Cogumelo Andante', 'slime', 14, 'light', '#c0392b', '#f5e6c8', 'Esporo Brilhante,0.7,2|Slime Ball,0.4,1|Coins,0.7,' + coins(14, 'light'), 'Um cogumelo que decidiu passear. E morder.', 'Floresta dos Cogumelos');
K.fant = mob('esporo_fantasma', 'Espectro de Esporos', 'ghost', 18, 'common', '#c9a0ff', '#ffffff', 'Ectoplasm,0.5,1|Esporo Brilhante,0.6,2|Coins,0.8,' + coins(18, 'common'), 'Névoa de esporos com raiva.', 'Floresta dos Cogumelos');
K.tece = mob('tecela_esporos', 'Tecelã de Esporos', 'spider', 19, 'common', '#6b3a7a', '#7bffb0', 'Spider Silk,0.7,2|Esporo Brilhante,0.6,2|Coins,0.8,' + coins(19, 'common'), 'Tece teias que brilham em verde.', 'Floresta dos Cogumelos');
K.rainha = mob('rainha_esporos', 'Rainha dos Esporos', 'spider', 24, 'boss', '#7a2a6a', '#7bffb0', 'Capuz de Esporos,0.3,1|Esporo Brilhante,1,6|Spider Silk,1,5|Mana Potion,0.6,3|Coins,1,' + coins(24, 'boss'), 'Governa a floresta de baixo de um chapéu gigante.', 'Floresta dos Cogumelos');
K.sapo = mob('sapo_gigante', 'Sapo-boi Gigante', 'slime', 13, 'light', '#6a9f3a', '#e8e0a0', 'Slime Ball,0.5,1|Escama Cristalina,0.4,1|Coins,0.7,' + coins(13, 'light'), 'Do tamanho de um cachorro. Coaxa como um trovão.', 'Lago Cristalino');
K.serp = mob('serpente_cristal', 'Serpente Cristalina', 'snake', 17, 'common', '#4fd6ff', '#ffffff', 'Escama Cristalina,0.7,2|Raw Fish,0.4,1|Coins,0.8,' + coins(17, 'common'), 'Escamas de vidro, mordida de fogo.', 'Lago Cristalino');
K.hidra = mob('serpente_lago', 'Leviatã do Lago', 'snake', 24, 'boss', '#2a8f9f', '#fff2b0', 'Arco do Lago,0.3,1|Escudo de Escamas,0.3,1|Escama Cristalina,1,6|Raw Salmon,0.6,3|Coins,1,' + coins(24, 'boss'), 'Dono das águas fundas. Os pescadores só falam dele baixinho.', 'Lago Cristalino', { big: 1.15 });
K.escar = mob('escaravelho_solar', 'Escaravelho Solar', 'spider', 27, 'common', '#d4a017', '#fff2b0', 'Fragmento Solar,0.6,1|Spider Silk,0.4,1|Coins,0.8,' + coins(27, 'common'), 'Carapaça dourada que queima ao toque.', 'Ruínas Solares');
K.sacerd = mob('sacerdote_solar', 'Sacerdote Solar', 'darkmage', 31, 'elite', '#ffcf5a', '#fff7c2', 'Fragmento Solar,0.8,2|Mana Potion,0.4,2|Coins,0.9,' + coins(31, 'elite'), 'Reza para um sol que já se apagou.', 'Ruínas Solares');
K.guard = mob('guardiao_solar', 'Guardião Solar', 'golem', 36, 'boss', '#e8c15a', '#fff7c2', 'Elmo Solar,0.3,1|Peitoral Solar,0.25,1|Cajado Solar,0.2,1|Fragmento Solar,1,6|Stone Core,0.6,1|Coins,1,' + coins(36, 'boss'), 'Guarda o templo desde antes da areia.', 'Ruínas Solares', { big: 1.15 });
K.falcao = mob('falcao_trovao', 'Falcão do Trovão', 'bat', 35, 'common', '#e6e6f2', '#f1c40f', 'Pena de Trovão,0.7,2|Bat Wing,0.4,1|Coins,0.8,' + coins(35, 'common'), 'Cada bater de asas é um estalo.', 'Montanha do Trovão');
K.orcT = mob('orc_trovao', 'Orc do Trovão', 'orc', 37, 'common', '#4a6a8a', '#f1c40f', 'Bones,1,1|Pena de Trovão,0.4,1|Iron Ore,0.3,2|Coins,0.8,' + coins(37, 'common'), 'Marcha com tempestade nas costas.', 'Montanha do Trovão');
K.ogro = mob('ogro_relampago', 'Ogro Relâmpago', 'troll', 41, 'elite', '#6a8aa8', '#7fe3ff', 'Troll Tooth,0.4,1|Pena de Trovão,0.8,2|Coal,0.5,3|Coins,0.9,' + coins(41, 'elite'), 'Um gigante que atrai raios de propósito.', 'Montanha do Trovão');
K.rei = mob('rei_troll', 'Rei Troll Grumak', 'troll', 46, 'boss', '#5a7a6a', '#f1c40f', 'Martelo do Trovão,0.3,1|Anel do Trovão,0.25,1|Pena de Trovão,1,6|Mithril Ore,0.6,3|Coins,1,' + coins(46, 'boss'), 'Governa a montanha com um martelo do tamanho de um boi.', 'Montanha do Trovão', { big: 1.1 });
K.arau = mob('arauto_tempestade', 'Arauto da Tempestade', 'darkmage', 50, 'elite', '#2b4a8a', '#7fd3ff', 'Lasca de Tempestade,0.7,1|Mana Potion,0.5,3|Greater Health Potion,0.4,2|Coins,0.9,' + coins(50, 'elite'), 'Invoca raios com um dedo.', 'Cidadela da Tempestade');
K.cavR = mob('cavaleiro_raio', 'Cavaleiro do Raio', 'skeleton', 48, 'elite', '#9fb4d9', '#7fe3ff', 'Lasca de Tempestade,0.6,1|Steel Bar,0.4,2|Bone Blade,0.02,1|Coins,0.9,' + coins(48, 'elite'), 'Armadura vazia que ainda marcha.', 'Cidadela da Tempestade');
K.lord = mob('senhor_tempestade', 'Lorde da Tempestade', 'darkmage', 58, 'boss', '#1c2f5a', '#7fe3ff', 'Lâmina da Tempestade,0.3,1|Escudo da Tempestade,0.25,1|Lasca de Tempestade,1,6|Greater Health Potion,0.8,3|Coins,1,' + coins(58, 'boss'), 'Governa a cidadela e o céu em cima dela.', 'Cidadela da Tempestade', { big: 1.1, range: 230 });
K.morc = mob('morcego_cristal', 'Morcego de Cristal', 'bat', 40, 'common', '#9b59b6', '#bfe9ff', 'Cristal Bruto,0.4,1|Bat Wing,0.5,1|Coins,0.8,' + coins(40, 'common'), 'Asas que tilintam como sino.', 'Caverna dos Cristais');
K.golC = mob('golem_cristal', 'Golem de Cristal', 'golem', 46, 'elite', '#6ad2ff', '#ffffff', 'Cristal Bruto,0.8,2|Stone Core,0.5,1|Coins,0.9,' + coins(46, 'elite'), 'Parece uma estátua de gelo azul. Parece.', 'Caverna dos Cristais');
K.cora = mob('cristal_ancestral', 'Coração de Cristal', 'golem', 54, 'boss', '#8fe9ff', '#ffffff', 'Coroa de Cristal,0.3,1|Amuleto de Cristal,0.25,1|Cristal Bruto,1,6|Mithril Ore,0.6,3|Coins,1,' + coins(54, 'boss'), 'O núcleo vivo da caverna. Brilha mais a cada golpe que recebe.', 'Caverna dos Cristais', { big: 1.2 });
K.moleiro = npc('moleiro_npc', 'Moleiro Tobias', 'farmer', '#8a6a3a', 'Farinha fresca todo dia! Cuidado com o Capitão Dente-de-Ferro, ele ronda a estrada.', 'Bread,25|Health Potion,40|Wheat Seed,10|Carrot Seed,10', 'Vende pão e sementes.', 'Colinas Ventosas');
K.herb = npc('herbalista_npc', 'Herbalista Mirta', 'priest', '#6a9a5a', 'Os esporos brilham de noite. Não respire fundo perto da Rainha.', 'Healing Herb,30|Empty Vial,10|Mana Potion,60|Herb Seed,15', 'Vende ervas e frascos.', 'Floresta dos Cogumelos');
K.pesc = npc('pescador_lago', 'Pescador Caio', 'fisher', '#1f8f7f', 'O lago tem um monstro lá no fundo. Mas os peixes... ah, os peixes!', 'Minhoca,15|Isca Brilhante,60|Rede de Pesca,20', 'Vende iscas.', 'Lago Cristalino');
K.arq = npc('arqueologa_npc', 'Arqueóloga Nefri', 'wizard', '#8a5a2a', 'O Guardião não é um monstro, é um zelador. Mas não gosta de visitas.', 'Greater Health Potion,150|Mana Potion,60', 'Vende poções.', 'Ruínas Solares');
K.anao = npc('ferreiro_montanha', 'Anão Brokk', 'smith', '#7a8a9a', 'Aço de montanha, trovão no martelo! Traga pena de trovão que eu pago.', 'Steel Pickaxe,300|Coal,15|Iron Arrow,6|Steel Arrow,14', 'Vende ferramentas e flechas.', 'Montanha do Trovão');
K.guardaC = npc('guarda_cidadela', 'Sentinela da Cidadela', 'guard', '#3a5fa8', 'Alto! A tempestade lá em cima não perdoa curiosos.', '', 'Guarda dos portões.', 'Cidadela da Tempestade');
K.inten = npc('intendente_cidadela', 'Intendente Valdric', 'merchant', '#5a4a8a', 'Suprimentos para quem pretende subir a torre. Se pretende voltar, leve o dobro.', 'Greater Health Potion,150|Mana Potion,60|Strength Potion,120', 'Vende poções.', 'Cidadela da Tempestade');

/* ---------- construção de mapas ---------- */
let eid = 810000; const misses = [];
const DEC = CAT.dec, BLD = CAT.bld;
const TREE_W = 76, TREE_H = 96, SCALE_DECOR = 1.3, SCALE_BUILD = 1.75;
const DIRT = '#5c4033', STONE = '#7f8c8d', SAND = '#cdb57a';

function makeMap(id, name, w, h, color, gx, gy, env) {
    const m = { id, name, catalogV: 2, width: w, height: h, color, gridX: gx, gridY: gy, entities: [], edges: [] }; if (env) m.env = env;
    const queue = [], keep = [], occ = []; const ovl = (a, b, p) => a[0] - p < b[0] + b[2] && a[0] + a[2] + p > b[0] && a[1] - p < b[1] + b[3] && a[1] + a[3] + p > b[1];
    const free = (r, pad, struct) => !occ.some((o) => ovl(r, o, pad === undefined ? 10 : pad)) && (struct || !keep.some((o) => ovl(r, o, 0))) && r[0] >= 40 && r[1] >= 40 && r[0] + r[2] <= w - 40 && r[1] + r[3] <= h - 40;
    const add = (o, keep) => { o.id = o.id === undefined ? eid++ : o.id; o.active = true; m.entities.push(o); if (keep !== false) occ.push([o.x, o.y, o.w || 30, o.h || 30]); return o; };
    const api = {
        m, occ, free, add,
        block(x, y, ww, hh) { occ.push([x, y, ww, hh]); },
        reserve(x, y, ww, hh) { keep.push([x, y, ww, hh]); },
        paint(color, x, y, ww, hh) { m.entities.push({ id: eid++, type: 'paint', name: 'Chão', color, x: R(x), y: R(y), w: R(ww), h: R(hh), active: true }); },
        decor(kind, x, y, extra) { const d = DEC[kind] || { w: 30, h: 30 }; const ww = R(d[1] * SCALE_DECOR), hh = R(d[2] * SCALE_DECOR); if (!free([x, y, ww, hh], 4, !api._sc)) return null; return add(Object.assign({ type: 'decor', kind, name: d[0], x: R(x), y: R(y), w: ww, h: hh }, extra || {}), d[3]); },
        build(style, x, y) { const b = BLD[style]; const ww = R(b[1] * SCALE_BUILD), hh = R(b[2] * SCALE_BUILD); if (!free([x, y, ww, hh], 14, !api._sc)) return null; return add({ type: 'house', style, name: b[0], x: R(x), y: R(y), w: ww, h: hh }); },
        tree(x, y) { if (!free([x, y + 40, TREE_W, TREE_H - 40], 6)) return null; return add({ type: 'tree', name: 'Oak Tree', x: R(x), y: R(y), w: TREE_W, h: TREE_H, hp: 3, maxHp: 3 }); },
        rock(k, x, y) { const hp = { rock_copper: 2, rock_tin: 2, rock_iron: 3, rock_coal: 3, rock_mithril: 5 }[k], col = { rock_copper: '#d35400', rock_tin: '#bdc3c7', rock_iron: '#7f8c8d', rock_coal: '#2b2b33', rock_mithril: '#4f86d6' }[k]; if (!free([x, y, 38, 38], 10)) return null; return add({ type: k, name: k, x: R(x), y: R(y), w: 38, h: 38, hp, maxHp: hp, color: col }); },
        fish(x, y) { if (!free([x, y, 46, 46], 8)) return null; return add({ type: 'fishing_spot', name: 'Ponto de Pesca', x: R(x), y: R(y), w: 46, h: 46 }); },
        mob(key, x, y) { const d = NPC[key] || CAT.npc[key]; if (!d) throw new Error('criatura desconhecida: ' + key); if (!free([x, y, d.w, d.h], 24)) return null; return add({ type: 'enemy', dbKey: key, name: d.name, x: R(x), y: R(y), w: d.w, h: d.h, hp: d.hp, maxHp: d.hp, attackCooldown: 0 }); },
        boss(key, x, y) { const d = NPC[key]; return add({ type: 'enemy', dbKey: key, name: d.name, x: R(x), y: R(y), w: d.w, h: d.h, hp: d.hp, maxHp: d.hp, attackCooldown: 0 }); },
        npc(key, x, y) { const d = NPC[key] || CAT.npc[key]; return add({ type: 'npc', dbKey: key, name: d.name, x: R(x), y: R(y), w: d.w, h: d.h, hp: 0, maxHp: 0 }); },
        scatter(fn, n, rect, tries) { queue.push(() => { api._sc = true; let c = 0; for (let t = 0; t < (tries || n * 25) && c < n; t++) { const x = rect[0] + rnd() * rect[2], y = rect[1] + rnd() * rect[3]; if (fn(x, y)) c++; } api._sc = false; return c; }); },
        flush() { while (queue.length) queue.shift()(); },
        pack(key, n, cx, cy, spread) { let c = 0; for (let t = 0; t < n * 60 && c < n; t++) { const sp = spread * (1 + t / (n * 20)); if (api.mob(key, cx + (rnd() - 0.5) * sp * 2, cy + (rnd() - 0.5) * sp * 2)) c++; } if (c < n) misses.push(m.id + ' ' + key + ' ' + c + '/' + n); return c; }
    };
    return api;
}
/* abertura entre mapas: estrada de terra do centro até a borda + registro da borda nos dois lados */
function pointOf(M, d, c) { return d === 'w' ? [0, c] : d === 'e' ? [M.m.width, c] : d === 'n' ? [c, 0] : [c, M.m.height]; }
function openSide(M, d, c, w, col, to, td, tc, tw, linkId) {
    const W = M.m.width, H = M.m.height, hz = d === 'e' || d === 'w', cx = W / 2, cy = H / 2;
    // corredor reservado (nada de árvore/pedra nele) e estrada
    if (hz) { const x0 = d === 'w' ? 0 : cx, x1 = d === 'w' ? cx : W, b0 = d === 'w' ? 0 : cx + 320, b1 = d === 'w' ? cx - 320 : W; M.block(b0, c - w / 2 - 20, b1 - b0, w + 40); M.paint(col, x0, c - w / 2, x1 - x0, w); M.paint(col, cx - w / 2, Math.min(c, cy) - w / 2, w, Math.abs(c - cy) + w); }
    else { const y0 = d === 'n' ? 0 : cy, y1 = d === 'n' ? cy : H, b0 = d === 'n' ? 0 : cy + 260, b1 = d === 'n' ? cy - 260 : H; M.block(c - w / 2 - 20, b0, w + 40, b1 - b0); M.paint(col, c - w / 2, y0, w, y1 - y0); M.paint(col, Math.min(c, cx) - w / 2, cy - w / 2, Math.abs(c - cx) + w, w); }
    M.m.edges.push({ id: linkId, d, a: R(c - w / 2 + 12), b: R(c + w / 2 - 12), to, td, ta: R(tc - tw / 2 + 12), tb: R(tc + tw / 2 - 12) });
}
/* placa ao lado da abertura (dentro do mapa), dizendo para onde a estrada leva */
function signAt(M, d, c, w, label) { if (!label) return; const hz = d === 'e' || d === 'w', W = M.m.width, H = M.m.height, off = w / 2 + 34; const x = hz ? (d === 'w' ? 150 : W - 190) : c + off, y = hz ? c + off : (d === 'n' ? 130 : H - 170); M.decor('sign', x, y, { name: 'Placa: → ' + label }); }
function link(A, ad, ac, B, bd, bc, col, id, w) { w = w || 120; openSide(A, ad, ac, w, col, B.m.id, bd, bc, w, id); openSide(B, bd, bc, w, col, A.m.id, ad, ac, w, id + '_r'); if (col !== '#7a5a3a') { signAt(A, ad, ac, w, B.m.name); signAt(B, bd, bc, w, A.m.name); } }
/* moldura de árvores/arbustos ao redor do mapa, deixando as aberturas livres */
function border(M, treeFn, opts) {
    const W = M.m.width, H = M.m.height, step = 64;
    for (let x = 20; x < W - 40; x += step) for (const y of [8, 70]) treeFn(x + ri(-10, 10), y + ri(-6, 6));
    for (let x = 20; x < W - 40; x += step) for (const y of [H - 104, H - 168]) treeFn(x + ri(-10, 10), y + ri(-6, 6));
    for (let y = 130; y < H - 170; y += step) for (const x of [6, 66]) treeFn(x + ri(-6, 6), y + ri(-10, 10));
    for (let y = 130; y < H - 170; y += step) for (const x of [W - 82, W - 142]) treeFn(x + ri(-6, 6), y + ri(-10, 10));
}
const wall = (M, kind, x, y) => { const d = DEC[kind]; M.add({ type: 'decor', kind, name: d[0], x: R(x), y: R(y), w: R(d[1] * SCALE_DECOR), h: R(d[2] * SCALE_DECOR) }); };
const trees = (M) => (x, y) => M.tree(x, y);
const rocksB = (M) => (x, y) => (rnd() < 0.6 ? M.decor('boulder', x, y + 30) : M.decor('deadtree', x, y));
const cactusB = (M) => (x, y) => (rnd() < 0.5 ? M.decor('boulder', x, y + 30) : rnd() < 0.5 ? M.decor('cactus', x, y + 10) : M.decor('deadtree', x, y));
const portal = (M, name, x, y, dest, dx, dy, look, extra) => M.add(Object.assign({ type: 'portal', name, x: R(x), y: R(y), w: 64, h: 64, destMap: dest, destX: R(dx), destY: R(dy) }, look ? { look } : {}, extra || {}));
const cx = 1000, cy = 700;

/* ============ 1. COLINAS VENTOSAS ============ */
const GX = 2, GY = 0;   // mapa-múndi: leste da Mina de Pedra (1,0); a fileira do lago/ruínas/cidadela fica ao NORTE (y-1)
const colinas = makeMap('colinas_ventosas', 'Colinas Ventosas', 2000, 1400, '#6f9a3a', GX, GY);
const cogumelos = makeMap('floresta_cogumelos', 'Floresta dos Cogumelos', 2000, 1400, '#38503e', GX + 1, GY);
const montanha = makeMap('montanha_trovao', 'Montanha do Trovão', 2000, 1400, '#6a6f78', GX + 2, GY);
const lago = makeMap('lago_cristalino', 'Lago Cristalino', 2000, 1400, '#4f8a4a', GX, GY - 1);
const ruinas = makeMap('ruinas_solares', 'Ruínas Solares', 2000, 1400, '#c9a25a', GX + 1, GY - 1);
const cidadela = makeMap('cidadela_tempestade', 'Cidadela da Tempestade', 2000, 1400, '#4a4f5c', GX + 2, GY - 1);
const caverna = makeMap('caverna_cristais', 'Caverna dos Cristais', 1600, 1200, '#1c2438', null, null, 'dark');

/* ligação com o mundo: a estrada leste da Mina de Pedra (borda leste, c=700, como a oeste da Vila) leva às Colinas Ventosas */
const EXT = [];
function extLink(M, d, c, w, other, od, oc, id, col, label) { openSide(M, d, c, w, col, other, od, oc, w, id); signAt(M, d, c, w, label); EXT.push({ map: other, e: { id: id + '_r', d: od, a: R(oc - w / 2 + 12), b: R(oc + w / 2 - 12), to: M.m.id, td: d, ta: R(c - w / 2 + 12), tb: R(c + w / 2 - 12), w, col, label: M.m.name } }); }
extLink(colinas, 'w', 700, 120, 'mina', 'e', 700, 'sol_mina_colinas', DIRT, 'Mina de Pedra');
/* ligações (grade 3x2 + a caverna acima da montanha, por portal) */
link(colinas, 'e', 700, cogumelos, 'w', 700, DIRT, 'sol_colinas_cogumelos');
link(cogumelos, 'e', 700, montanha, 'w', 700, DIRT, 'sol_cogumelos_montanha');
link(colinas, 'n', 1000, lago, 's', 1000, DIRT, 'sol_colinas_lago');
link(cogumelos, 'n', 1000, ruinas, 's', 1000, DIRT, 'sol_cogumelos_ruinas');
link(montanha, 'n', 1000, cidadela, 's', 1000, STONE, 'sol_montanha_cidadela');
link(lago, 'e', 700, ruinas, 'w', 700, SAND, 'sol_lago_ruinas');
link(ruinas, 'e', 700, cidadela, 'w', 700, SAND, 'sol_ruinas_cidadela');

/* --- Colinas --- */
(function () {
    const M = colinas; border(M, trees(M));
    for (const [c, x, y, w, h] of [['#7fae44', 150, 150, 700, 380], ['#5f8a32', 1100, 120, 760, 340], ['#86b84a', 300, 800, 800, 420], ['#5f8a32', 1300, 850, 600, 380]]) M.paint(c, x, y, w, h);
    // aberturas já bloqueiam o corredor; reserva o centro (praça) e a chegada do portal
    M.reserve(cx - 150, cy - 110, 300, 220);
    M.paint(STONE, cx - 130, cy - 90, 260, 180); M.decor('well', cx - 22, cy - 40); M.decor('lamp', cx - 110, cy - 80); M.decor('lamp', cx + 94, cy - 80); M.decor('sign', cx + 40, cy + 70, { name: 'Placa: Colinas Ventosas — salteadores na estrada!' });
    M.build('windmill', 1200, 250); M.build('windmill', 340, 880); M.build('barn', 1450, 900); M.build('cottage', 560, 250); M.build('cottage', 820, 880); M.build('townhouse', 1380, 460); M.build('tent', 220, 1060); M.build('tent', 330, 1130); M.build('tent', 150, 1150);
    // campos cercados
    for (let i = 0; i < 6; i++) { M.decor('fence_h', 1150 + i * 84, 560); M.decor('fence_h', 1150 + i * 84, 700); }
    for (let i = 0; i < 3; i++) { M.decor('haystack', 1180 + i * 130, 610); }
    M.decor('cart', 1500, 660); M.decor('crates', 270, 1010); M.decor('barrel', 400, 1060); M.decor('campfire', 280, 1090);
    M.npc(K.moleiro, 1130, 330);
    M.scatter((x, y) => M.decor('flowers', x, y), 40, [100, 100, 1800, 1200]);
    M.scatter((x, y) => M.decor('bush', x, y), 22, [100, 100, 1800, 1200]);
    M.scatter((x, y) => M.tree(x, y), 34, [140, 140, 1720, 1100]);
    for (let i = 0; i < 6; i++) M.pack(i % 2 ? 'boar_base' : 'wolf_base', 1, 500 + ri(0, 1100), 450 + ri(0, 600), 10);
    M.pack(K.ladrao, 5, 280, 1100, 140); M.pack(K.ladrao, 4, 1400, 330, 120);
    M.boss(K.capitao, 250, 1180 - 120);
    M.pack('rabbit_base', 3, 700, 600, 200); M.pack('sheep_base', 4, 1250, 640, 120); M.pack('cow_base', 3, 1600, 760, 160);
    M.ground = true;
    M.flush();
})();
/* --- Floresta dos Cogumelos --- */
(function () {
    const M = cogumelos; border(M, trees(M));
    for (const [c, x, y, w, h] of [['#4a3a5a', 250, 180, 600, 400], ['#2d4a36', 1050, 150, 700, 420], ['#4a3a5a', 1100, 820, 700, 400], ['#2d4a36', 260, 820, 600, 380]]) M.paint(c, x, y, w, h);
    M.reserve(cx - 150, cy - 110, 300, 220); M.paint('#5a4a6a', cx - 140, cy - 100, 280, 200);
    M.decor('crystal', cx - 20, cy - 70); M.decor('mushrooms', cx - 90, cy + 10); M.decor('mushrooms', cx + 50, cy + 20); M.decor('campfire', cx - 14, cy + 50);
    M.npc(K.herb, cx + 100, cy - 50);
    M.build('cottage', 420, 260); M.build('cottage', 1500, 980); M.build('wizard_tower', 1450, 230);
    M.scatter((x, y) => M.decor('mushrooms', x, y), 90, [100, 100, 1800, 1200], 2500);
    M.scatter((x, y) => M.tree(x, y), 70, [120, 120, 1760, 1160], 2500);
    M.scatter((x, y) => M.decor('bush', x, y), 18, [100, 100, 1800, 1200]);
    M.scatter((x, y) => M.decor('stump', x, y), 14, [100, 100, 1800, 1200]);
    for (let i = 0; i < 5; i++) M.pack(K.cogu, 3, 400 + ri(0, 1300), 250 + ri(0, 900), 90);
    for (let i = 0; i < 3; i++) M.pack(K.tece, 2, 400 + ri(0, 1300), 250 + ri(0, 900), 90);
    M.pack(K.fant, 4, 1550, 650, 160); M.pack('venom_spider', 3, 600, 1000, 130); M.pack('forest_wisp', 3, 500, 450, 140);
    M.boss(K.rainha, 1450, 560);
    M.flush();
})();
/* --- Lago Cristalino --- */
(function () {
    const M = lago, WATER = '#3498db'; border(M, trees(M));
    // lago irregular no centro-sul + areia em volta
    const lakes = [[560, 560, 900, 520], [460, 640, 160, 360], [1440, 640, 200, 380], [680, 1060, 640, 170]];
    lakes.forEach((r) => M.paint(SAND, r[0] - 36, r[1] - 36, r[2] + 72, r[3] + 72)); lakes.forEach((r) => M.paint(WATER, r[0], r[1], r[2], r[3])); lakes.forEach((r) => M.reserve(r[0] - 10, r[1] - 10, r[2] + 20, r[3] + 20));
    M.reserve(cx - 150, 250, 300, 190); M.paint(STONE, 800, 270, 400, 150);
    M.build('tavern', 1050, 200); M.build('cottage', 740, 210); M.build('market', 1360, 280); M.build('cottage', 330, 300);
    M.npc(K.pesc, 980, 440); M.decor('well', 900, 450); M.decor('netrack', 1240, 450); M.decor('boat', 1000, 560); M.decor('crates', 1330, 420); M.decor('barrel', 1390, 440);
    for (const [x, y] of [[600, 590], [1440, 590], [940, 530], [760, 1010], [1280, 1010], [520, 760]]) M.add({ type: 'fishing_spot', name: 'Ponto de Pesca', x, y, w: 46, h: 46 }, false);
    M.scatter((x, y) => M.decor('reeds', x, y), 40, [380, 480, 1240, 760], 3000); M.scatter((x, y) => M.decor('lily', x, y), 0, [0, 0, 1, 1]);
    for (let i = 0; i < 14; i++) M.add({ type: 'decor', kind: 'lily', name: 'Vitória-régia', x: 640 + ri(0, 700), y: 620 + ri(0, 380), w: R(34 * 1.3), h: R(22 * 1.3) }, false);
    M.scatter((x, y) => M.tree(x, y), 46, [120, 120, 1760, 1160], 3000);
    M.scatter((x, y) => M.decor('flowers', x, y), 30, [100, 100, 1800, 1200]);
    M.pack(K.sapo, 4, 400, 540, 120); M.pack(K.sapo, 3, 1560, 560, 120); M.pack(K.serp, 4, 480, 1100, 130); M.pack(K.serp, 4, 1500, 1100, 130); M.pack('drowned', 3, 780, 1150, 120); M.pack('swamp_snake', 3, 1220, 1150, 120);
    M.boss(K.hidra, 700, 1140);
    M.flush();
})();
/* --- Ruínas Solares --- */
(function () {
    const M = ruinas; border(M, cactusB(M));
    for (const [c, x, y, w, h] of [['#b8984a', 200, 150, 700, 420], ['#d9b968', 1100, 160, 700, 380], ['#b8984a', 160, 820, 760, 400], ['#d9b968', 1100, 850, 760, 380]]) M.paint(c, x, y, w, h);
    M.reserve(cx - 300, cy - 200, 600, 400); M.paint('#a8935a', cx - 300, cy - 200, 600, 400); M.paint('#8a7646', cx - 220, cy - 130, 440, 260);
    for (let i = 0; i < 5; i++) { M.decor('pillar', cx - 280 + i * 130, cy - 230); M.decor('pillar', cx - 280 + i * 130, cy + 160); }
    M.decor('statue', cx - 20, cy - 60); M.decor('sarcophagus', cx - 120, cy + 40); M.decor('sarcophagus', cx + 60, cy + 40); M.decor('banner', cx - 220, cy - 180); M.decor('banner', cx + 190, cy - 180);
    M.decor('ruinarch', 420, 300); M.decor('ruinarch', 1450, 1000); M.npc(K.arq, 760, 460); M.build('tent', 840, 520); M.decor('crates', 740, 520); M.decor('campfire', 700, 540);
    M.scatter((x, y) => M.decor('pillar', x, y), 12, [120, 120, 1760, 1160], 1500); M.scatter((x, y) => M.decor('boulder', x, y), 22, [120, 120, 1760, 1160]);
    M.scatter((x, y) => M.decor('cactus', x, y), 24, [120, 120, 1760, 1160]); M.scatter((x, y) => M.decor('bones', x, y), 12, [120, 120, 1760, 1160]); M.scatter((x, y) => M.decor('deadtree', x, y), 12, [120, 120, 1760, 1160]);
    M.scatter((x, y) => M.rock(pick(['rock_iron', 'rock_coal', 'rock_iron', 'rock_mithril']), x, y), 10, [150, 150, 1700, 1100]);
    for (let i = 0; i < 4; i++) M.pack(K.escar, 3, 300 + ri(0, 1400), 250 + ri(0, 900), 90);
    M.pack('sand_skeleton', 4, 420, 1000, 130); M.pack('sand_wraith', 3, 1550, 360, 130); M.pack('dune_snake', 4, 1500, 760, 140); M.pack(K.sacerd, 3, 1100, 330, 140);
    M.boss(K.guard, cx + 130, cy - 110);
    M.flush();
})();
/* --- Montanha do Trovão --- */
(function () {
    const M = montanha; border(M, rocksB(M));
    // entrada da Caverna dos Cristais (reservada antes do resto)
    { const mx = 560, py = 330; M.add({ type: 'decor', kind: 'cavemouth', name: 'Boca de Caverna', x: mx - 76, y: py + 8 - 114, w: 152, h: 114 }); portal(M, 'Entrar na Caverna dos Cristais', mx - 32, py, 'caverna_cristais', 800, 1080, 'down', { tone: ['#9a9aa8', '#5a5c64', '#15161c'], glow: '120,220,255' }); M.reserve(mx - 110, py - 130, 220, 300); }
    for (const [c, x, y, w, h] of [['#5d636d', 200, 180, 700, 400], ['#7a808a', 1100, 160, 700, 380], ['#5d636d', 160, 840, 760, 380], ['#7a808a', 1120, 860, 720, 380]]) M.paint(c, x, y, w, h);
    M.reserve(cx - 150, cy - 110, 300, 220); M.paint(STONE, cx - 130, cy - 90, 260, 180); M.decor('campfire', cx - 14, cy - 20); M.decor('lamp', cx - 110, cy - 90); M.decor('lamp', cx + 94, cy - 90);
    M.npc(K.anao, cx + 70, cy - 40); M.build('smithy', 1120, 300); M.decor('crates', 1090, 520); M.decor('barrel', 1300, 540); M.decor('cart', 1380, 520);
    M.scatter((x, y) => M.decor('boulder', x, y), 48, [100, 100, 1800, 1200], 3000); M.scatter((x, y) => M.decor('deadtree', x, y), 18, [100, 100, 1800, 1200]); M.scatter((x, y) => M.decor('icespire', x, y), 8, [100, 100, 1800, 1200]);
    M.scatter((x, y) => M.rock(pick(['rock_iron', 'rock_coal', 'rock_mithril', 'rock_iron', 'rock_coal']), x, y), 16, [150, 150, 1700, 1100]);
    M.scatter((x, y) => M.tree(x, y), 16, [120, 120, 1760, 1160]);
    for (let i = 0; i < 4; i++) M.pack(K.falcao, 3, 300 + ri(0, 1400), 250 + ri(0, 900), 100);
    M.pack(K.orcT, 5, 450, 450, 140); M.pack(K.orcT, 4, 1500, 1000, 140); M.pack('troll_base', 2, 1450, 420, 120); M.pack(K.ogro, 3, 500, 1020, 140); M.pack(K.ogro, 2, 1560, 640, 120);
    M.boss(K.rei, 1500, 300);
    M.flush();
})();
/* --- Cidadela da Tempestade --- */
(function () {
    const M = cidadela; border(M, rocksB(M));
    for (const [c, x, y, w, h] of [['#3f4452', 200, 160, 700, 420], ['#555b6a', 1100, 160, 700, 420], ['#3f4452', 160, 820, 760, 400], ['#555b6a', 1100, 840, 760, 400]]) M.paint(c, x, y, w, h);
    M.reserve(cx - 340, 380, 680, 560); M.paint('#6b7080', cx - 340, 380, 680, 560); M.paint('#4f5565', cx - 250, 470, 500, 380);
    M.build('castle', cx - 150, 400);
    for (let i = 0; i < 8; i++) { const wx = cx - 340 + i * 96; if (wx + 125 > cx - 100 && wx < cx + 100) continue; M.decor('wall_h', wx, 900); }   // vão do portão (entrada pelo sul)
    for (let i = 0; i < 5; i++) { M.decor('wall_v', cx - 360, 400 + i * 98); M.decor('wall_v', cx + 340, 400 + i * 98); }
    M.decor('banner', cx - 300, 430); M.decor('banner', cx + 280, 430); M.decor('statue', cx - 250, 720); M.decor('statue', cx + 210, 720); M.decor('lamp', cx - 200, 800); M.decor('lamp', cx + 180, 800);
    M.build('watchtower', 260, 240); M.build('watchtower', 1580, 240); M.build('watchtower', 260, 960); M.build('watchtower', 1580, 960);
    M.npc(K.guardaC, cx - 140, 960); M.npc(K.inten, cx + 120, 960); M.decor('crates', cx + 200, 970); M.decor('barrel', cx + 250, 990);
    M.scatter((x, y) => M.decor('boulder', x, y), 22, [100, 100, 1800, 1200]); M.scatter((x, y) => M.decor('deadtree', x, y), 12, [100, 100, 1800, 1200]); M.scatter((x, y) => M.decor('banner', x, y), 8, [100, 100, 1800, 1200]);
    for (let i = 0; i < 4; i++) M.pack(K.cavR, 2, 300 + ri(0, 1400), 280 + ri(0, 800), 100);
    M.pack(K.arau, 3, 450, 560, 120); M.pack(K.arau, 3, 1550, 560, 120); M.pack('dark_knight', 3, 450, 1050, 120); M.pack('necromancer', 2, 1550, 1050, 110); M.pack('crypt_knight', 3, 1000, 1120, 150);
    M.boss(K.lord, cx - 30, 560);
    M.flush();
})();
/* --- Caverna dos Cristais (masmorra) --- */
(function () {
    const M = caverna, W = 1600, H = 1200;
    M.paint('#141a2c', 120, 120, W - 240, H - 240); M.paint('#1d2640', 300, 300, W - 600, H - 600);
    // paredes de pedra no contorno
    for (let x = 40; x < W - 100; x += 90) { wall(M, 'wall_h', x, 40); wall(M, 'wall_h', x, H - 74); }
    for (let y = 100; y < H - 100; y += 90) { wall(M, 'wall_v', 40, y); wall(M, 'wall_v', W - 62, y); }
    for (let i = 0; i < 4; i++) { M.decor('torch', 180 + i * 360, 80); M.decor('torch', 180 + i * 360, H - 130); }
    // saída (portal subindo) na parte de baixo
    const px = 800, py = 1000; portal(M, 'Subir à Montanha do Trovão', px - 32, py, 'montanha_trovao', 560, 330 + 64 + 44, 'up'); M.reserve(px - 120, py - 80, 240, 220);
    M.scatter((x, y) => M.decor('crystal', x, y), 60, [120, 120, W - 240, H - 240], 3000); M.scatter((x, y) => M.decor('boulder', x, y), 26, [120, 120, W - 240, H - 240]);
    M.scatter((x, y) => M.rock(pick(['rock_mithril', 'rock_iron', 'rock_coal']), x, y), 10, [150, 150, W - 300, H - 300]);
    for (let i = 0; i < 4; i++) M.pack(K.morc, 3, 300 + ri(0, 1000), 250 + ri(0, 600), 100);
    M.pack(K.golC, 3, 420, 520, 120); M.pack(K.golC, 3, 1180, 520, 120); M.pack('ice_bat', 3, 800, 700, 160);
    M.boss(K.cora, 720, 300);
    M.flush();
})();

/* ---------- portal do mundo para o reino (Vila) ---------- */


/* ---------- saída ---------- */
const MAPS = { colinas_ventosas: colinas, floresta_cogumelos: cogumelos, montanha_trovao: montanha, lago_cristalino: lago, ruinas_solares: ruinas, cidadela_tempestade: cidadela, caverna_cristais: caverna };
const maps = {}; let nEnt = 0;
for (const k of Object.keys(MAPS)) { const m = MAPS[k].m; for (const o of m.entities) o.pk = 'Reinos de Solaris'; m.entities.forEach((o) => { if (o.type === 'enemy' || o.type === 'npc') { /* ids numéricos únicos */ } }); nEnt += m.entities.length; maps[k] = m; }
const pack = {
    name: 'Reinos de Solaris', replace: true,
    items: ITEMS, npcs: NPC, maps,
    entities: {},
    edges: EXT.reduce((a, x) => { (a[x.map] = a[x.map] || []).push(x.e); return a; }, {})
};
const out = path.join(__dirname, '..', 'docs', 'packs', 'reinos-de-solaris.json');
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(pack));
const sizes = Object.keys(maps).map((k) => k + ':' + maps[k].entities.length + ' (mobs ' + maps[k].entities.filter((o) => o.type === 'enemy').length + ')');
if (misses.length) console.log('FALTARAM:', misses.join('; '));
console.log('OK', Math.round(fs.statSync(out).size / 1024) + ' KB;', nEnt, 'entidades;', Object.keys(ITEMS).length, 'itens;', Object.keys(NPC).length, 'criaturas/NPCs\n' + sizes.join('\n'));
