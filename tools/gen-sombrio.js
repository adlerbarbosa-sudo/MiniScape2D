#!/usr/bin/env node
/* Gera o pacote 'Terras Sombrias' (porto + navio + continente sombrio de 7 mapas p/ jogadores fortes) em docs/packs/terras-sombrias.json.
   Uso: node tools/gen-sombrio.js (determinístico). Monstros: Balance.mobTable com dano reduzido p/ jogadores vit/def ~30-40 e muito dano. */
'use strict';
const fs = require('fs'), path = require('path');
const B = require('../public/balance.js');
const CAT = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalog-sizes.json'), 'utf8'));   // tamanhos de decor/prédios/criaturas do jogo

/* ---------- aleatório determinístico ---------- */
let seed = 20261105; const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
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
let eid = 820000; const misses = [];
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
function link(A, ad, ac, B, bd, bc, col, id, w) { w = w || 120; openSide(A, ad, ac, w, col, B.m.id, bd, bc, w, id); openSide(B, bd, bc, w, col, A.m.id, ad, ac, w, id + '_r'); }
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

/* ---------- monstros de alto nível: dano ajustado p/ jogador vit/def ~30-40 ---------- */
const DM = { light: 0.8, common: 0.8, elite: 0.8, boss: 0.7 }, HM = 1.1;
function mobH(key, name, species, level, tier, c1, c2, loot, desc, biome, extra) {
    mob(key, name, species, level, tier, c1, c2, loot, desc, biome, extra);
    const d = NPC[key], k = DM[tier] || 0.8;
    d.hp = d.hpBase = R(d.hp * HM); d.dmin = R(d.dmin * k); d.dmax = R(d.dmax * k); d.maxHit = d.dmax; d.hit = R((d.dmin + d.dmax) / 2 / 1.2 * 1); d.xp = B.defaultXp(d.hp);
    return key;
}

/* ---------- itens ---------- */
res('Osso Sombrio', '🦴', 'Osso escurecido por séculos de maré negra.', 40);
res('Lodo Negro', '🟤', 'Lodo espesso do Pântano Negro. Alquimistas pagam bem.', 55);
res('Essência Sombria', '🔮', 'Névoa roxa engarrafada. Zumbe baixinho.', 75);
res('Presa Abissal', '🦷', 'Presa curva, fria ao toque.', 95);
res('Lasca de Obsidiana', '🖤', 'Vidro vulcânico afiado como navalha.', 120);
res('Brasa Eterna', '🔥', 'Brasa que nunca apaga, nem na chuva.', 150);
res('Alma Aprisionada', '👻', 'Uma alma presa em cristal. Ela olha para você.', 190);
gear('Lâmina de Obsidiana', '🗡️', 'weapon', 'Lâmina negra e leve, corta quase sem esforço.', { bonusDmg: 20, crit: 5, col: '#2b2b3a' }, { skill: 'combat', lvl: 65 }, 0);
gear('Arco Sombrio', '🏹', 'weapon', 'Arco de osso e tendão, o disparo mal faz barulho.', { bonusDmg: 20, tool: 'ranged', crit: 5, col: '#5a4a6a' }, { skill: 'ranged', lvl: 65 }, 0);
gear('Cajado das Cinzas', '🦯', 'weapon', 'Cajado carbonizado com uma brasa viva na ponta.', { bonusDmg: 21, tool: 'magic', spellDmg: 6, col: '#e8672a' }, { skill: 'magic', lvl: 65 }, 0);
gear('Machado do Abismo', '🪓', 'weapon', 'Machado enorme forjado com metal que não reflete luz.', { bonusDmg: 24, critDmg: 12, col: '#4a2a5a' }, { skill: 'combat', lvl: 72 }, 0);
gear('Elmo de Obsidiana', '⛑️', 'head', 'Elmo de vidro vulcânico, mais resistente que parece.', { defBonus: 9, col: '#2b2b3a' }, { skill: 'defence', lvl: 65 }, 0);
gear('Peitoral de Obsidiana', '🦺', 'body', 'Peitoral pesado de placas negras.', { defBonus: 21, col: '#2b2b3a' }, { skill: 'defence', lvl: 70 }, 0);
gear('Escudo do Abismo', '🛡️', 'shield', 'Escudo roxo-escuro que parece absorver os golpes.', { defBonus: 13, dr: 4, col: '#4a2a6a' }, { skill: 'defence', lvl: 70 }, 0);
gear('Coroa do Rei Lich', '👑', 'head', 'Coroa de ossos. As técnicas voltam mais depressa.', { defBonus: 10, cdr: 6, col: '#b8a8d8' }, { skill: 'defence', lvl: 75 }, 0);
gear('Anel de Cinzas', '💍', 'ring', 'Anel quente: você ataca mais rápido.', { atkSpd: 5 }, { skill: 'cmb', lvl: 60 }, 0);
gear('Amuleto Abissal', '📿', 'amulet', 'Amuleto que amplifica a magia e reduz as esperas.', { spellDmg: 6, cdr: 5 }, { skill: 'cmb', lvl: 65 }, 0);
gear('Colete do Capitão', '🧥', 'body', 'Colete de couro reforçado tirado de um capitão afogado.', { defBonus: 15, col: '#6a4a2a' }, { skill: 'defence', lvl: 58 }, 0);

/* ---------- criaturas ---------- */
const C = (lvl, tier) => coins(lvl, tier);
const K = {};
// Costa de Ossos (52-56)
K.nauf = mobH('esqueleto_nauf', 'Náufrago Esquelético', 'skeleton', 52, 'common', '#8a8a7a', '#3a3a4a', 'Osso Sombrio,0.7,2|Bones,1,1|Coins,0.8,' + C(52, 'common'), 'Ainda tenta chegar na praia.', 'Costa de Ossos');
K.lodoM = mobH('lodo_mare', 'Lodo da Maré', 'slime', 52, 'light', '#2a4a5a', '#7fb4c8', 'Lodo Negro,0.6,1|Slime Ball,0.4,1|Coins,0.7,' + C(52, 'light'), 'Veio com a maré e ficou.', 'Costa de Ossos');
K.vorgan = mobH('capitao_afogado', 'Capitão Vorgan, o Afogado', 'skeleton', 56, 'boss', '#3a5a6a', '#c9a24a', 'Colete do Capitão,0.3,1|Osso Sombrio,1,6|Greater Health Potion,0.7,2|Coins,1,' + C(56, 'boss'), 'Afundou com o navio e nunca largou o leme.', 'Costa de Ossos', { big: 1.15 });
// Pântano Negro (55-62)
K.sang = mobH('sanguessuga_negra', 'Sanguessuga Negra', 'slime', 55, 'light', '#1f1f2a', '#9a2a3a', 'Lodo Negro,0.7,2|Coins,0.7,' + C(55, 'light'), 'Do tamanho de um braço. Gosta de você.', 'Pântano Negro');
K.cobraN = mobH('cobra_negra', 'Cobra do Brejo', 'snake', 57, 'common', '#243a2a', '#9aff6a', 'Lodo Negro,0.5,1|Presa Abissal,0.3,1|Coins,0.8,' + C(57, 'common'), 'Escondida na lama. Só aparece quando morde.', 'Pântano Negro');
K.bruxa = mobH('bruxa_brejo', 'Bruxa do Brejo', 'darkmage', 59, 'elite', '#3a2a4a', '#9aff6a', 'Essência Sombria,0.7,2|Mana Potion,0.4,2|Lodo Negro,0.5,2|Coins,0.9,' + C(59, 'elite'), 'Rói ossos e rói você com feitiços.', 'Pântano Negro', { range: 200 });
K.hidraB = mobH('hidra_brejo', 'Hidra do Brejo', 'snake', 62, 'boss', '#2a4a3a', '#9aff6a', 'Presa Abissal,1,5|Essência Sombria,0.8,3|Greater Health Potion,0.7,3|Amuleto Abissal,0.2,1|Coins,1,' + C(62, 'boss'), 'Quando cortam uma cabeça, ela morde com as outras.', 'Pântano Negro', { big: 1.15 });
// Floresta Murcha (57-66)
K.lobo = mobH('lobo_sombrio', 'Lobo Sombrio', 'wolf', 58, 'common', '#1a1a24', '#a24af0', 'Osso Sombrio,0.5,1|Wolf Pelt,0.6,1|Coins,0.8,' + C(58, 'common'), 'Olhos roxos, caça em matilha.', 'Floresta Murcha');
K.aran = mobH('aranha_abissal', 'Aranha Abissal', 'spider', 60, 'common', '#1a1a2a', '#a24af0', 'Spider Silk,0.7,2|Presa Abissal,0.3,1|Coins,0.8,' + C(60, 'common'), 'Teia que prende e queima.', 'Floresta Murcha');
K.ent = mobH('ent_apodrecido', 'Ent Apodrecido', 'golem', 63, 'elite', '#4a3a2a', '#6a8a3a', 'Essência Sombria,0.6,2|Stone Core,0.4,1|Coins,0.9,' + C(63, 'elite'), 'Uma árvore que já morreu, mas não avisou.', 'Floresta Murcha', { big: 1.1 });
K.mort = mobH('ent_mortalha', 'Ent Ancião Mortalha', 'golem', 66, 'boss', '#2a2a24', '#7bffb0', 'Escudo do Abismo,0.25,1|Essência Sombria,1,6|Alma Aprisionada,0.5,2|Greater Health Potion,0.7,3|Coins,1,' + C(66, 'boss'), 'O dono da Floresta Murcha. Já foi um guardião.', 'Floresta Murcha', { big: 1.3 });
// Cemitério dos Reis (60-68)
K.cavC = mobH('cavaleiro_caido', 'Cavaleiro Caído', 'skeleton', 62, 'common', '#8a8aa0', '#a24af0', 'Osso Sombrio,0.6,2|Steel Bar,0.4,1|Coins,0.8,' + C(62, 'common'), 'Jurou lealdade a um rei que não existe mais.', 'Cemitério dos Reis');
K.espR = mobH('espectro_real', 'Espectro Real', 'ghost', 64, 'elite', '#b8a8d8', '#ffffff', 'Alma Aprisionada,0.5,1|Essência Sombria,0.7,2|Coins,0.9,' + C(64, 'elite'), 'A corte inteira ainda dança, de madrugada.', 'Cemitério dos Reis');
K.cult = mobH('cultista_morto', 'Cultista do Abismo', 'darkmage', 63, 'elite', '#3a1a4a', '#a24af0', 'Essência Sombria,0.8,2|Mana Potion,0.5,3|Coins,0.9,' + C(63, 'elite'), 'Reza para algo muito, muito embaixo.', 'Cemitério dos Reis', { range: 210 });
K.banshee = mobH('rainha_banshee', 'Rainha Banshee Isolde', 'ghost', 68, 'boss', '#d8c8f0', '#7a4aa0', 'Cajado das Cinzas,0.15,1|Alma Aprisionada,1,5|Essência Sombria,1,5|Greater Health Potion,0.8,3|Coins,1,' + C(68, 'boss'), 'Seu grito dura uma noite inteira.', 'Cemitério dos Reis', { big: 1.2, range: 230 });
// Fortaleza de Obsidiana (64-72)
K.sold = mobH('soldado_obsidiana', 'Soldado de Obsidiana', 'orc', 66, 'common', '#2b2b3a', '#c8a02a', 'Lasca de Obsidiana,0.5,1|Iron Ore,0.4,2|Coins,0.8,' + C(66, 'common'), 'Marcha em silêncio, golpeia em silêncio.', 'Fortaleza de Obsidiana');
K.golO = mobH('golem_obsidiana', 'Golem de Obsidiana', 'golem', 68, 'elite', '#1f1f2a', '#8a4af0', 'Lasca de Obsidiana,0.8,2|Stone Core,0.5,1|Coins,0.9,' + C(68, 'elite'), 'Vidro vulcânico com vontade própria.', 'Fortaleza de Obsidiana', { big: 1.1 });
K.magoC = mobH('mago_cinzento', 'Mago Cinzento', 'darkmage', 68, 'elite', '#5a5a6a', '#ff6a2a', 'Essência Sombria,0.6,2|Mana Potion,0.5,3|Lasca de Obsidiana,0.4,1|Coins,0.9,' + C(68, 'elite'), 'Serve o Lorde. Não tem medo de nada.', 'Fortaleza de Obsidiana', { range: 220 });
K.kharzul = mobH('lorde_kharzul', 'Lorde Kharzul, o Implacável', 'orc', 72, 'boss', '#1f1f2a', '#c8a02a', 'Elmo de Obsidiana,0.3,1|Peitoral de Obsidiana,0.25,1|Lâmina de Obsidiana,0.25,1|Lasca de Obsidiana,1,6|Greater Health Potion,0.8,3|Coins,1,' + C(72, 'boss'), 'Governa a fortaleza há mil invernos.', 'Fortaleza de Obsidiana', { big: 1.25 });
// Cratera de Cinzas (66-74)
K.morcC = mobH('morcego_cinzas', 'Morcego de Cinzas', 'bat', 66, 'common', '#3a3a3a', '#ff6a2a', 'Brasa Eterna,0.4,1|Bat Wing,0.5,1|Coins,0.8,' + C(66, 'common'), 'Deixa um rastro de brasas no ar.', 'Cratera de Cinzas');
K.whelpM = mobH('filhote_magma', 'Filhote de Magma', 'whelp', 68, 'light', '#c8401a', '#ffcf5a', 'Brasa Eterna,0.6,1|Dragon Scale,0.15,1|Coins,0.7,' + C(68, 'light'), 'Pequeno e muito, muito quente.', 'Cratera de Cinzas');
K.elem = mobH('elemental_brasa', 'Elemental de Brasa', 'golem', 70, 'elite', '#d8501a', '#ffcf5a', 'Brasa Eterna,0.8,2|Stone Core,0.4,1|Coins,0.9,' + C(70, 'elite'), 'Uma fogueira que decidiu andar.', 'Cratera de Cinzas', { big: 1.1 });
K.ignaros = mobH('dragao_cinzas', 'Ignaros, Dragão das Cinzas', 'dragon', 74, 'boss', '#3a2a2a', '#ff6a2a', 'Machado do Abismo,0.2,1|Anel de Cinzas,0.3,1|Brasa Eterna,1,6|Dragon Scale,1,3|Greater Health Potion,0.8,3|Coins,1,' + C(74, 'boss'), 'Dorme sobre a lava há mil anos. Acordou mal.', 'Cratera de Cinzas');
// Cripta Abissal (68-78)
K.servo = mobH('servo_abismo', 'Servo do Abismo', 'skeleton', 70, 'common', '#4a3a6a', '#a24af0', 'Osso Sombrio,0.6,2|Essência Sombria,0.5,1|Coins,0.8,' + C(70, 'common'), 'Esqueleto que obedece sem pensar.', 'Cripta Abissal');
K.carr = mobH('carrasco_abissal', 'Carrasco Abissal', 'skeleton', 72, 'elite', '#2a1a3a', '#ff4a6a', 'Alma Aprisionada,0.5,1|Presa Abissal,0.5,1|Coins,0.9,' + C(72, 'elite'), 'Carrega um machado maior do que ele.', 'Cripta Abissal', { big: 1.1 });
K.vaelor = mobH('rei_lich_vaelor', 'Rei Lich Vaelor', 'darkmage', 78, 'boss', '#4a2a6a', '#b8a8d8', 'Coroa do Rei Lich,0.25,1|Machado do Abismo,0.2,1|Arco Sombrio,0.2,1|Alma Aprisionada,1,6|Essência Sombria,1,6|Greater Health Potion,1,3|Coins,1,' + C(78, 'boss'), 'O último governante das Terras Sombrias.', 'Cripta Abissal', { big: 1.3, range: 260 });
// NPCs
K.cap = npc('capita_marlene', 'Capitã Marlene', 'fisher', '#2a5a8a', 'Zarpo para as Terras Sombrias. Só embarque com vitalidade e defesa 30 ou mais, bastante dano e poções de sobra!', 'Greater Health Potion,150|Mana Potion,60|Strength Potion,120', 'Capitã do navio. Vende poções.', 'Porto de Aurora');
K.estivador = npc('estivador_porto', 'Estivador Bruno', 'merchant', '#8a6a3a', 'Carga para as Terras Sombrias? Eu só levo até o cais.', 'Health Potion,40|Greater Health Potion,150|Iron Arrow,6|Steel Arrow,14', 'Vende suprimentos.', 'Porto de Aurora');
K.rook = npc('capitao_rook', 'Capitão Rook', 'guard', '#3a3a5a', 'Daqui para frente a luz some. Quem volta de lá, volta diferente.', '', 'Capitão do navio.', 'Navio');
K.tomas = npc('imediato_tomas', 'Imediato Tomás', 'merchant', '#6a5a3a', 'Última chance de comprar poções antes de desembarcar.', 'Greater Health Potion,150|Mana Potion,60|Guard Potion,120', 'Vende poções.', 'Navio');
K.elara = npc('sobrevivente_elara', 'Sobrevivente Elara', 'guide', '#8a3a4a', 'Cheguei aqui há anos. O acampamento é seguro, o resto, nem tanto. Fique no caminho de terra.', 'Greater Health Potion,150|Mana Potion,60|Strength Potion,120|Guard Potion,120', 'Vende poções.', 'Costa de Ossos');
K.bran = npc('ferreiro_bran', 'Ferreiro Bran', 'smith', '#6a6a7a', 'Forjo qualquer coisa. Traga a obsidiana e o aço que eu cuido do resto.', 'Steel Pickaxe,300|Coal,15|Steel Arrow,14|Mithril Arrow,30', 'Vende ferramentas e flechas.', 'Costa de Ossos');
K.oswin = npc('eremita_oswin', 'Eremita Oswin', 'wizard', '#3a5a4a', 'Não beba a água. Mas o lodo vale ouro.', 'Mana Potion,60|Empty Vial,10|Greater Health Potion,150', 'Vende poções.', 'Pântano Negro');
K.dren = npc('cacador_dren', 'Caçador Dren', 'farmer', '#4a5a3a', 'Os lobos daqui não fogem, caçam. Fique de olho nas costas.', 'Steel Arrow,14|Mithril Arrow,30|Greater Health Potion,150', 'Vende flechas.', 'Floresta Murcha');
K.cov = npc('coveiro_ambrose', 'Coveiro Ambrose', 'priest', '#4a4a6a', 'Eu enterro quem cai. Ninguém pediu para eles levantarem.', 'Greater Health Potion,150|Mana Potion,60|Guard Potion,120', 'Vende poções.', 'Cemitério dos Reis');
K.kael = npc('intendente_kael', 'Intendente Kael', 'merchant', '#5a3a4a', 'Suprimentos para a fortaleza. O Lorde não gosta de visitantes, mas gosta de ouro.', 'Greater Health Potion,150|Mana Potion,60|Strength Potion,120|Guard Potion,120', 'Vende poções.', 'Fortaleza de Obsidiana');
K.vulc = npc('vulcanologo_pyra', 'Vulcanóloga Pyra', 'wizard', '#c8501a', 'Se o chão tremer, corra. Se o chão tremer de novo, corra mais.', 'Greater Health Potion,150|Mana Potion,60', 'Vende poções.', 'Cratera de Cinzas');

/* ============ MAPAS ============ */
const SEA = '#17405f', SEA2 = '#1d5078', WOOD = '#7a5a3a', WOOD2 = '#5c4028', ASH = '#3a3532', OBS = '#2a2a38', BLK = '#2b2630';
const GX = 8, GY = 0;
const porto = makeMap('porto_aurora', 'Porto de Aurora', 2000, 1400, '#7a7468', null, null);
const navio = makeMap('navio_sombrio', 'Navio para as Terras Sombrias', 1400, 800, SEA, null, null, 'dim');
const costa = makeMap('costa_ossos', 'Costa de Ossos', 2000, 1400, '#5a574a', GX, GY, 'dim');
const pantano = makeMap('pantano_negro', 'Pântano Negro', 2000, 1400, '#2c3a2c', GX + 1, GY, 'dim');
const fortaleza = makeMap('fortaleza_obsidiana', 'Fortaleza de Obsidiana', 2000, 1400, '#2e2a34', GX + 2, GY, 'dim');
const floresta = makeMap('floresta_murcha', 'Floresta Murcha', 2000, 1400, '#2a3a2e', GX, GY + 1, 'dim');
const cemiterio = makeMap('cemiterio_reis', 'Cemitério dos Reis', 2000, 1400, '#3a3a48', GX + 1, GY + 1, 'dim');
const cratera = makeMap('cratera_cinzas', 'Cratera de Cinzas', 2000, 1400, '#4a2e24', GX + 2, GY + 1, 'dim');
const cripta = makeMap('cripta_abissal', 'Cripta Abissal', 1600, 1200, '#10121c', null, null, 'dark');

link(costa, 'e', 700, pantano, 'w', 700, DIRT, 'som_costa_pantano');
link(pantano, 'e', 700, fortaleza, 'w', 700, STONE, 'som_pantano_fortaleza');
link(costa, 's', 1000, floresta, 'n', 1000, DIRT, 'som_costa_floresta');
link(pantano, 's', 1000, cemiterio, 'n', 1000, DIRT, 'som_pantano_cemiterio');
link(floresta, 'e', 700, cemiterio, 'w', 700, DIRT, 'som_floresta_cemiterio');
link(fortaleza, 's', 1000, cratera, 'n', 1000, STONE, 'som_fortaleza_cratera');
link(cemiterio, 'e', 700, cratera, 'w', 700, STONE, 'som_cemiterio_cratera');

const plaza = (M, col, w, h) => { M.reserve(cx - w / 2, cy - h / 2, w, h); M.paint(col, cx - w / 2 + 10, cy - h / 2 + 10, w - 20, h - 20); };
const sprinkle = (M, kinds, n, rect) => { for (const [k, c] of kinds) M.scatter((x, y) => M.decor(k, x, y), c, rect || [100, 100, 1800, 1200], 2500); };
const pastelRect = (M, cols) => cols.forEach(([c, x, y, w, h]) => M.paint(c, x, y, w, h));
const station = (M, type, name, x, y, w, h) => M.add({ type, name, x, y, w, h });

/* --- Porto de Aurora --- */
(function () {
    const M = porto;
    M.paint('#8a8478', 100, 100, 1300, 1200); M.paint('#3498db', 1480, 0, 520, 1400);
    M.paint(SAND, 1420, 0, 60, 1400);
    // cais de madeira
    M.paint(WOOD, 1180, 660, 560, 110); M.paint(WOOD2, 1180, 660, 560, 14); M.paint(WOOD2, 1180, 756, 560, 14);
    M.reserve(1160, 600, 600, 240);
    M.decor('boat', 1450, 790); M.decor('boat', 1450, 560); for (let i = 0; i < 4; i++) { M.decor('barrel', 1220 + i * 120, 640); M.decor('lamp', 1260 + i * 110, 780); }
    M.decor('crates', 1300, 590); M.decor('netrack', 1600, 600);
    M.reserve(cx - 160, cy - 120, 320, 240); M.paint(STONE, cx - 150, cy - 110, 300, 220); M.decor('fountain', cx - 24, cy - 40); M.decor('lamp', cx - 120, cy - 100); M.decor('lamp', cx + 100, cy - 100);
    M.build('tavern', 420, 200); M.build('market', 760, 190); M.build('townhouse', 330, 520); M.build('church', 330, 880); M.build('cottage', 720, 920); M.build('townhouse', 920, 1000); M.build('cottage', 1030, 220);
    station(M, 'bank', 'Banco', 880, 410, 80, 48);
    for (const [x, y] of [[1560, 300], [1700, 480], [1600, 980], [1760, 1120]]) M.add({ type: 'fishing_spot', name: 'Ponto de Pesca', x, y, w: 46, h: 46 }, false);
    M.npc(K.cap, 1390, 640); M.npc(K.estivador, 1330, 680);
    M.decor('sign', 1130, 600, { name: 'Placa: Embarque para as Terras Sombrias → Recomendado: vit/def 30+' });
    M.decor('banner', 380, 130); M.decor('banner', 820, 130); M.decor('statue', 760, 700);
    // a estrada do portão da Vila chega por cima
    M.reserve(900, 80, 220, 260);
    sprinkle(M, [['flowers', 18], ['bush', 12], ['crates', 5], ['barrel', 7], ['haystack', 3]], 0, [120, 120, 1280, 1160]);
    M.scatter((x, y) => M.tree(x, y), 22, [120, 120, 1280, 1160]);
    M.flush();
    portal(M, 'Embarcar para as Terras Sombrias', 1620, 685, 'navio_sombrio', 420, 470, 'door');
})();

/* --- Navio --- */
(function () {
    const M = navio;
    M.paint('#3498db', 80, 80, 1240, 640);
    M.paint(WOOD, 360, 280, 700, 260); M.paint(WOOD2, 360, 280, 700, 16); M.paint(WOOD2, 360, 524, 700, 16);
    for (let i = 0; i < 7; i++) M.add({ type: 'decor', kind: 'pillar', name: 'Pilar', x: 372 + i * 100, y: 250, w: 34, h: 52 }, false);
    M.reserve(360, 280, 700, 260);
    M.decor('barrel', 560, 330); M.decor('barrel', 600, 340); M.decor('crates', 800, 320); M.decor('netrack', 740, 480); M.decor('lamp', 460, 300); M.decor('lamp', 960, 300); M.decor('banner', 640, 270);
    M.npc(K.rook, 700, 410); M.npc(K.tomas, 840, 420);
    M.decor('sign', 400, 520, { name: 'Placa: Dica — leve poções e equipamento de nível alto' });
    for (let i = 0; i < 6; i++) M.decor('lily', 120 + i * 200, 120 + (i % 2) * 560, { name: 'Espuma' });
    M.flush();
    portal(M, 'Voltar ao Porto de Aurora', 380, 400, 'porto_aurora', 1540, 725, 'door');
    portal(M, 'Desembarcar na Costa de Ossos', 960, 400, 'costa_ossos', 460, 735, 'door');
})();

/* --- Costa de Ossos --- */
(function () {
    const M = costa; border(M, rocksB(M));
    M.paint('#3498db', 40, 40, 300, 1320); M.paint(SAND, 330, 40, 40, 1320);
    M.paint(WOOD, 280, 650, 330, 100); M.paint(WOOD2, 280, 650, 330, 12); M.paint(WOOD2, 280, 738, 330, 12); M.reserve(250, 600, 400, 220);
    for (const [x, y] of [[150, 300], [200, 520], [160, 1000]]) M.add({ type: 'fishing_spot', name: 'Ponto de Pesca', x, y, w: 46, h: 46 }, false);
    M.decor('boat', 130, 780); M.decor('lamp', 330, 640); M.decor('lamp', 330, 760); M.decor('crates', 540, 700); M.decor('barrel', 580, 700);
    pastelRect(M, [['#6a665a', 420, 200, 500, 360], ['#4a483e', 1100, 160, 700, 380], ['#6a665a', 400, 860, 800, 400], ['#4a483e', 1300, 820, 560, 400]]);
    plaza(M, '#6a6a60', 420, 260); M.build('tent', 880, 560); M.build('tent', 1130, 560); M.decor('campfire', cx - 14, cy - 10); M.decor('crates', cx + 130, cy + 40);
    M.npc(K.elara, cx - 90, cy - 80); M.npc(K.bran, cx + 90, cy - 80); station(M, 'furnace', 'Fornalha', cx - 210, cy - 140, 48, 72); station(M, 'anvil', 'Bigorna', cx - 210, cy - 40, 46, 39);
    M.decor('sign', 600, 600, { name: 'Placa: Costa de Ossos — acampamento seguro' });
    sprinkle(M, [['bones', 44], ['boulder', 26], ['deadtree', 22], ['mushrooms', 10], ['gravestone', 8]]);
    M.scatter((x, y) => M.rock(pick(['rock_iron', 'rock_coal', 'rock_mithril']), x, y), 10, [400, 150, 1500, 1100]);
    for (let i = 0; i < 4; i++) M.pack(K.nauf, 3, 700 + ri(0, 1100), 250 + ri(0, 900), 100);
    for (let i = 0; i < 3; i++) M.pack(K.lodoM, 3, 650 + ri(0, 1100), 250 + ri(0, 900), 90);
    M.pack('ghost_base', 2, 1500, 400, 110);
    portal(M, 'Embarcar de volta ao Porto de Aurora', 340, 665, 'navio_sombrio', 900, 470, 'door');
    M.boss(K.vorgan, 1560, 1050);
    M.flush();
})();

/* --- Pântano Negro --- */
(function () {
    const M = pantano; border(M, (x, y) => (rnd() < 0.6 ? M.decor('deadtree', x, y) : M.decor('reeds', x, y + 40)));
    const lakes = [[300, 280, 520, 300], [1180, 190, 520, 280], [330, 860, 560, 300], [1260, 860, 460, 300]];
    lakes.forEach((r) => { M.paint('#1a2a22', r[0] - 30, r[1] - 30, r[2] + 60, r[3] + 60); M.paint('#3498db', r[0], r[1], r[2], r[3]); M.reserve(r[0] - 10, r[1] - 10, r[2] + 20, r[3] + 20); });
    plaza(M, '#3a4a3a', 380, 260); M.decor('campfire', cx - 14, cy - 10); M.build('cottage', cx + 120, cy - 120); M.npc(K.oswin, cx - 70, cy - 70);
    M.decor('sign', cx + 40, cy + 100, { name: 'Placa: Pântano Negro — não beba a água' });
    for (const [x, y] of [[420, 360], [1260, 280], [440, 940], [1330, 960]]) M.add({ type: 'fishing_spot', name: 'Ponto de Pesca', x, y, w: 46, h: 46 }, false);
    M.scatter((x, y) => M.decor('reeds', x, y), 60, [100, 100, 1800, 1200], 3000);
    for (let i = 0; i < 12; i++) M.add({ type: 'decor', kind: 'lily', name: 'Vitória-régia', x: 340 + ri(0, 1300), y: 300 + ri(0, 800), w: 44, h: 29 }, false);
    sprinkle(M, [['deadtree', 26], ['mushrooms', 16], ['bones', 10], ['stump', 10], ['boulder', 8]]);
    M.scatter((x, y) => M.tree(x, y), 24, [120, 120, 1760, 1160]);
    for (let i = 0; i < 3; i++) M.pack(K.sang, 3, 300 + ri(0, 1400), 250 + ri(0, 900), 90);
    for (let i = 0; i < 4; i++) M.pack(K.cobraN, 2, 300 + ri(0, 1400), 250 + ri(0, 900), 90);
    M.pack(K.bruxa, 2, 1500, 600, 140); M.pack(K.bruxa, 2, 520, 620, 130); M.pack('bog_slime', 3, 700, 1000, 140); M.pack('marsh_wisp', 3, 1500, 1050, 150);
    M.boss(K.hidraB, 1560, 400);
    M.flush();
})();

/* --- Floresta Murcha --- */
(function () {
    const M = floresta; border(M, (x, y) => (rnd() < 0.7 ? M.decor('deadtree', x, y) : M.tree(x, y)));
    pastelRect(M, [['#1f2e24', 250, 180, 600, 400], ['#2f3a2a', 1050, 160, 700, 420], ['#2f3a2a', 220, 840, 700, 380], ['#1f2e24', 1100, 840, 700, 380]]);
    plaza(M, '#3a3a2e', 340, 240); M.decor('campfire', cx - 14, cy - 10); M.npc(K.dren, cx - 60, cy - 70); M.build('tent', cx + 80, cy - 100); M.decor('crates', cx + 130, cy + 30);
    M.decor('sign', cx + 40, cy + 90, { name: 'Placa: Floresta Murcha — lobos atacam em bando' });
    M.build('cottage', 420, 250); M.build('cottage', 1500, 930);
    sprinkle(M, [['deadtree', 40], ['stump', 22], ['mushrooms', 26], ['bones', 12], ['boulder', 12], ['bush', 12]]);
    M.scatter((x, y) => M.tree(x, y), 36, [120, 120, 1760, 1160], 2500);
    for (let i = 0; i < 4; i++) M.pack(K.lobo, 3, 300 + ri(0, 1400), 250 + ri(0, 900), 100);
    for (let i = 0; i < 3; i++) M.pack(K.aran, 3, 300 + ri(0, 1400), 250 + ri(0, 900), 90);
    M.pack(K.ent, 2, 520, 450, 130); M.pack(K.ent, 2, 1500, 1000, 130); M.pack('venom_spider', 3, 1000, 1050, 130); M.pack('forest_wisp', 3, 1500, 380, 140);
    M.boss(K.mort, 1500, 560);
    M.flush();
})();

/* --- Cemitério dos Reis --- */
(function () {
    const M = cemiterio; border(M, (x, y) => (rnd() < 0.5 ? M.decor('gravestone', x, y + 30) : M.decor('deadtree', x, y)));
    pastelRect(M, [['#2e2e3a', 200, 160, 700, 400], ['#46465a', 1100, 160, 700, 400], ['#2e2e3a', 200, 840, 760, 380], ['#46465a', 1120, 840, 760, 380]]);
    // mausoléu do portal da cripta
    { const mx = 1500, py = 300; M.add({ type: 'decor', kind: 'tomb', name: 'Mausoléu Real', x: mx - 70, y: py - 110, w: 140, h: 110 }); portal(M, 'Entrar na Cripta Abissal', mx - 32, py + 16, 'cripta_abissal', 800, 1000 - 72, 'down', { tone: ['#7a7a9a', '#3a3a4a', '#0a0a14'], glow: '170,100,255' }); M.reserve(mx - 130, py - 130, 260, 300); }
    plaza(M, '#4a4a5a', 380, 260); M.decor('statue', cx - 20, cy - 70); M.decor('torch', cx - 130, cy - 80); M.decor('torch', cx + 110, cy - 80); M.npc(K.cov, cx + 70, cy + 20);
    M.decor('sign', cx - 150, cy + 90, { name: 'Placa: Cemitério dos Reis — a cripta fica ao nordeste' });
    for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) M.decor('gravestone', 300 + c * 100 + ri(-8, 8), 900 + r * 80 + ri(-6, 6));
    sprinkle(M, [['gravestone', 40], ['tomb', 6], ['deadtree', 14], ['bones', 14], ['pillar', 8], ['statue', 4], ['sarcophagus', 4]]);
    for (let i = 0; i < 4; i++) M.pack(K.cavC, 3, 300 + ri(0, 1400), 250 + ri(0, 900), 100);
    M.pack(K.espR, 2, 600, 450, 130); M.pack(K.espR, 2, 1000, 1100, 130); M.pack(K.cult, 3, 1500, 780, 140); M.pack('grave_ghost', 3, 450, 1000, 140); M.pack('zombie', 4, 1700, 1150, 140);
    M.boss(K.banshee, 700, 250);
    M.flush();
})();

/* --- Fortaleza de Obsidiana --- */
(function () {
    const M = fortaleza; border(M, rocksB(M));
    pastelRect(M, [['#26222e', 200, 160, 700, 400], ['#3a3446', 1100, 160, 700, 400], ['#26222e', 160, 840, 760, 380], ['#3a3446', 1100, 840, 700, 380]]);
    M.reserve(cx - 360, 360, 720, 620); M.paint('#3f3a4a', cx - 360, 360, 720, 620); M.paint('#2a2634', cx - 270, 450, 540, 440);
    M.build('castle', cx - 150, 380);
    for (let i = 0; i < 8; i++) M.decor('wall_h', cx - 360 + i * 92, 940);
    for (let i = 0; i < 6; i++) { M.decor('wall_v', cx - 380, 380 + i * 98); M.decor('wall_v', cx + 360, 380 + i * 98); }
    M.decor('banner', cx - 320, 420); M.decor('banner', cx + 300, 420); M.decor('statue', cx - 270, 720); M.decor('statue', cx + 230, 720); M.decor('torch', cx - 210, 800); M.decor('torch', cx + 190, 800);
    M.build('watchtower', 260, 240); M.build('watchtower', 1580, 240); M.build('watchtower', 260, 1000); M.build('watchtower', 1580, 1000);
    M.npc(K.kael, cx + 110, 1010); station(M, 'bank', 'Banco', cx - 200, 990, 80, 48); station(M, 'furnace', 'Fornalha', cx + 220, 1000, 48, 72); station(M, 'anvil', 'Bigorna', cx + 290, 1010, 46, 39);
    M.decor('sign', cx - 80, 1030, { name: 'Placa: Fortaleza de Obsidiana — o Lorde recebe pouca visita' });
    sprinkle(M, [['boulder', 22], ['deadtree', 10], ['banner', 6], ['crystal', 6]]);
    M.scatter((x, y) => M.rock(pick(['rock_iron', 'rock_coal', 'rock_mithril']), x, y), 10, [150, 150, 1700, 1100]);
    for (let i = 0; i < 4; i++) M.pack(K.sold, 3, 300 + ri(0, 1400), 280 + ri(0, 800), 100);
    M.pack(K.golO, 2, 450, 560, 120); M.pack(K.golO, 2, 1550, 560, 120); M.pack(K.magoC, 2, 450, 1060, 120); M.pack(K.magoC, 2, 1550, 1060, 120); M.pack('dark_knight', 3, 1000, 1180, 160);
    M.boss(K.kharzul, cx - 40, 540);
    M.flush();
})();

/* --- Cratera de Cinzas --- */
(function () {
    const M = cratera; border(M, (x, y) => (rnd() < 0.6 ? M.decor('boulder', x, y + 30) : M.decor('craterrim', x, y + 10)));
    pastelRect(M, [['#3a2a24', 200, 160, 700, 400], ['#52352a', 1100, 160, 700, 400], ['#3a2a24', 160, 840, 760, 380], ['#52352a', 1100, 840, 700, 380]]);
    plaza(M, '#4a3a34', 380, 260); M.decor('campfire', cx - 14, cy - 10); M.npc(K.vulc, cx - 70, cy - 70); M.decor('crates', cx + 120, cy + 20);
    M.decor('sign', cx + 40, cy + 90, { name: 'Placa: Cratera de Cinzas — cuidado com a lava' });
    // lagos de lava (só visuais)
    for (const [x, y, w, h] of [[300, 300, 380, 200], [1250, 220, 420, 220], [320, 900, 420, 220], [1350, 930, 380, 200]]) { M.paint('#a8300f', x - 20, y - 20, w + 40, h + 40); M.paint('#e8602a', x, y, w, h); M.reserve(x - 10, y - 10, w + 20, h + 20); for (let i = 0; i < 3; i++) M.add({ type: 'decor', kind: 'lava', name: 'Lava', x: x + 60 + i * (w / 3.4), y: y + 40, w: 52, h: 39 }, false); }
    sprinkle(M, [['boulder', 34], ['deadtree', 16], ['bones', 12], ['craterrim', 10], ['torch', 8]]);
    M.scatter((x, y) => M.rock(pick(['rock_coal', 'rock_iron', 'rock_mithril', 'rock_coal']), x, y), 14, [150, 150, 1700, 1100]);
    for (let i = 0; i < 4; i++) M.pack(K.morcC, 3, 300 + ri(0, 1400), 250 + ri(0, 900), 100);
    for (let i = 0; i < 3; i++) M.pack(K.whelpM, 3, 300 + ri(0, 1400), 250 + ri(0, 900), 90);
    M.pack(K.elem, 2, 520, 620, 130); M.pack(K.elem, 2, 1500, 640, 130); M.pack('lava_golem', 1, 1000, 1100, 100); M.pack('ember_skeleton', 3, 450, 1150, 130);
    M.boss(K.ignaros, 1560, 560);
    M.flush();
})();

/* --- Cripta Abissal (masmorra) --- */
(function () {
    const M = cripta, W = 1600, H = 1200;
    M.paint('#0e1020', 120, 120, W - 240, H - 240); M.paint('#171a30', 300, 300, W - 600, H - 600);
    for (let x = 40; x < W - 100; x += 90) { wall(M, 'wall_h', x, 40); wall(M, 'wall_h', x, H - 74); }
    for (let y = 100; y < H - 100; y += 90) { wall(M, 'wall_v', 40, y); wall(M, 'wall_v', W - 62, y); }
    for (let i = 0; i < 4; i++) { M.decor('torch', 180 + i * 360, 80); M.decor('torch', 180 + i * 360, H - 130); }
    const px = 800, py = 1000; portal(M, 'Subir ao Cemitério dos Reis', px - 32, py, 'cemiterio_reis', 1500 - 32, 300 + 16 + 90, 'up'); M.reserve(px - 120, py - 80, 240, 220);
    M.scatter((x, y) => M.decor(pick(['pillar', 'sarcophagus', 'bones', 'gravestone', 'crystal']), x, y), 50, [120, 120, W - 240, H - 240], 3000);
    for (let i = 0; i < 4; i++) M.pack(K.servo, 3, 300 + ri(0, 1000), 280 + ri(0, 620), 100);
    M.pack(K.carr, 2, 420, 520, 120); M.pack(K.carr, 2, 1180, 520, 120); M.pack('necromancer', 2, 800, 720, 150);
    M.boss(K.vaelor, 800, 300);
    M.flush();
})();

/* ---------- portal da Vila para o porto ---------- */
const gate = { name: 'Estrada para o Porto de Aurora', x: 980, y: 180 };
const GATE_DECOR = [{ type: 'decor', kind: 'sign', name: 'Placa: Porto de Aurora — navios para as Terras Sombrias', x: 925, y: 182, w: R(30 * 1.3), h: R(40 * 1.3), pk: 'Terras Sombrias' }];
const gatePortal = { type: 'portal', name: gate.name, x: gate.x, y: gate.y, w: 64, h: 64, destMap: 'porto_aurora', destX: 1000, destY: 260, look: 'door', pk: 'Terras Sombrias', id: 'som_portal_vila' };
portal(porto, 'Voltar à Vila de Aldeburgo', 940, 130, 'lumbridge', gate.x + 32, gate.y + 110, 'door');

/* ---------- saída ---------- */
const MAPS = { porto_aurora: porto, navio_sombrio: navio, costa_ossos: costa, pantano_negro: pantano, floresta_murcha: floresta, cemiterio_reis: cemiterio, fortaleza_obsidiana: fortaleza, cratera_cinzas: cratera, cripta_abissal: cripta };
const maps = {}; let nEnt = 0;
for (const k of Object.keys(MAPS)) { const m = MAPS[k].m; for (const o of m.entities) o.pk = 'Terras Sombrias'; nEnt += m.entities.length; maps[k] = m; }
const pack = { name: 'Terras Sombrias', replace: true, items: ITEMS, npcs: NPC, maps, entities: { lumbridge: GATE_DECOR.concat([gatePortal]) } };
const out = path.join(__dirname, '..', 'docs', 'packs', 'terras-sombrias.json');
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(pack));
const sizes = Object.keys(maps).map((k) => k + ':' + maps[k].entities.length + ' (mobs ' + maps[k].entities.filter((o) => o.type === 'enemy').length + ')');
if (misses.length) console.log('FALTARAM:', misses.join('; '));
console.log('OK', Math.round(fs.statSync(out).size / 1024) + ' KB;', nEnt, 'entidades;', Object.keys(ITEMS).length, 'itens;', Object.keys(NPC).length, 'criaturas/NPCs\n' + sizes.join('\n'));
