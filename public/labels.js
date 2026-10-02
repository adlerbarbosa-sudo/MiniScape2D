/* MiniScape 2D — nomes em português para tudo que o jogador lê.
   As CHAVES internas dos itens (ex.: 'Bronze Sword') continuam as mesmas nos saves, receitas e servidor; aqui só existe o rótulo exibido.
   API:  itemLabel(nome) -> nome em português (ou o próprio nome, se já estiver em português / desconhecido)
         Labels.tr(texto) -> troca nomes de itens/perícias/magias em inglês dentro de um texto
         Labels.match(nome, busca) -> busca por nome interno OU nome em português (sem acento/maiúscula)
         Labels.missing() -> itens do catálogo que ainda estão sem rótulo (para conferência)
   Também traduz o que aparece na tela (painéis, dicas, menus, mensagens) automaticamente, sem tocar em campos de texto, chat e painéis de admin. */
(function () {
    'use strict';
    const ITEM = {
        'Bronze Pickaxe': 'Picareta de Bronze', 'Iron Pickaxe': 'Picareta de Ferro', 'Steel Pickaxe': 'Picareta de Aço', 'Mithril Pickaxe': 'Picareta de Mithril',
        'Bronze Axe': 'Machado de Bronze', 'Bronze Sword': 'Espada de Bronze', 'Iron Sword': 'Espada de Ferro', 'Steel Sword': 'Espada de Aço', 'Mithril Sword': 'Espada de Mithril', 'Gold Sword': 'Espada de Ouro', 'Dragonscale Sword': 'Espada de Escama de Dragão',
        'Bronze Shield': 'Escudo de Bronze', 'Iron Shield': 'Escudo de Ferro', 'Steel Shield': 'Escudo de Aço', 'Mithril Shield': 'Escudo de Mithril', 'Gold Shield': 'Escudo de Ouro', 'Dragonscale Shield': 'Escudo de Escama de Dragão', 'Wooden Shield': 'Escudo de Madeira',
        'Bronze Body': 'Armadura de Bronze', 'Iron Body': 'Armadura de Ferro', 'Steel Body': 'Armadura de Aço', 'Mithril Body': 'Armadura de Mithril', 'Gold Body': 'Peitoral de Ouro', 'Dragonscale Body': 'Armadura de Escama de Dragão', 'Leather Body': 'Armadura de Couro',
        'Bronze Helmet': 'Elmo de Bronze', 'Iron Helmet': 'Elmo de Ferro', 'Steel Helmet': 'Elmo de Aço', 'Gold Helmet': 'Elmo de Ouro', 'Mithril Helmet': 'Elmo de Mithril', 'Dragonscale Helmet': 'Elmo de Escama de Dragão',
        'Leather Hood': 'Capuz de Couro', 'Studded Hood': 'Capuz Cravejado', 'Studded Body': 'Couro Cravejado', 'Wolf Hood': 'Capuz de Lobo', 'Wolf Hide Body': 'Colete de Pele de Lobo', 'Ranger Hood': 'Capuz de Patrulheiro', 'Ranger Body': 'Veste de Patrulheiro', 'Dragonhide Hood': 'Capuz de Couro de Dragão', 'Dragonhide Body': 'Armadura de Couro de Dragão',
        'Shortbow': 'Arco Curto', 'Longbow': 'Arco Longo', 'Composite Bow': 'Arco Composto', 'Elven Bow': 'Arco Élfico', 'Dragon Bow': 'Arco do Dragão',
        'Bronze Arrow': 'Flecha de Bronze', 'Iron Arrow': 'Flecha de Ferro', 'Steel Arrow': 'Flecha de Aço', 'Mithril Arrow': 'Flecha de Mithril', 'Dragon Arrow': 'Flecha do Dragão', 'Feather Arrow': 'Flecha Emplumada',
        'Staff': 'Cajado', 'Air Staff': 'Cajado do Ar', 'Water Staff': 'Cajado da Água', 'Earth Staff': 'Cajado da Terra', 'Fire Staff': 'Cajado do Fogo', 'Mystic Staff': 'Cajado Místico', 'Archmage Staff': 'Cajado do Arquimago',
        'Apprentice Hat': 'Chapéu de Aprendiz', 'Apprentice Robe': 'Veste de Aprendiz', 'Adept Hat': 'Chapéu de Adepto', 'Adept Robe': 'Veste de Adepto', 'Mystic Hat': 'Chapéu Místico', 'Mystic Robe': 'Veste Mística', 'Arcane Hat': 'Chapéu Arcano', 'Arcane Robe': 'Veste Arcana',
        'Gold Ring': 'Anel de Ouro', 'Ring of Swiftness': 'Anel da Agilidade', 'Ring of Fury': 'Anel da Fúria', 'Ring of Vigor': 'Anel do Vigor', 'Gold Amulet': 'Amuleto de Ouro', 'Amulet of Blood': 'Amuleto de Sangue', 'Amulet of Haste': 'Amuleto da Pressa', 'Amulet of Warding': 'Amuleto da Proteção', 'Soul Pendant': 'Pingente da Alma',
        'Lich Crown': 'Coroa do Lich', 'Bone Blade': 'Lâmina de Osso',
        'Tinderbox': 'Pederneira', 'Knife': 'Faca', 'Coins': 'Moedas', 'Logs': 'Lenha', 'Bones': 'Ossos', 'Dragon Bones': 'Ossos de Dragão', 'Coal': 'Carvão',
        'Copper Ore': 'Minério de Cobre', 'Tin Ore': 'Minério de Estanho', 'Iron Ore': 'Minério de Ferro', 'Mithril Ore': 'Minério de Mithril', 'Gold Ore': 'Minério de Ouro',
        'Bronze Bar': 'Barra de Bronze', 'Iron Bar': 'Barra de Ferro', 'Steel Bar': 'Barra de Aço', 'Mithril Bar': 'Barra de Mithril', 'Gold Bar': 'Barra de Ouro',
        'Air Rune': 'Runa do Ar', 'Mind Rune': 'Runa da Mente', 'Water Rune': 'Runa da Água', 'Earth Rune': 'Runa da Terra', 'Fire Rune': 'Runa do Fogo',
        'Raw Meat': 'Carne Crua', 'Cooked Meat': 'Carne Assada', 'Raw Fish': 'Peixe Cru', 'Cooked Fish': 'Peixe Assado', 'Raw Beef': 'Carne de Vaca Crua', 'Cooked Beef': 'Carne de Vaca Assada',
        'Raw Mutton': 'Carneiro Cru', 'Cooked Mutton': 'Carneiro Assado', 'Raw Chicken': 'Frango Cru', 'Cooked Chicken': 'Frango Assado', 'Raw Pork': 'Carne de Porco Crua', 'Cooked Pork': 'Carne de Porco Assada',
        'Raw Venison': 'Carne de Cervo Crua', 'Cooked Venison': 'Carne de Cervo Assada', 'Raw Rabbit': 'Coelho Cru', 'Cooked Rabbit': 'Coelho Assado',
        'Raw Salmon': 'Salmão Selvagem Cru', 'Cooked Salmon': 'Salmão Selvagem Assado', 'Raw Eel': 'Enguia Crua', 'Cooked Eel': 'Enguia Grelhada', 'Raw Moonfish': 'Peixe-Lunar Cru', 'Cooked Moonfish': 'Peixe-Lunar Assado', 'Raw Golden Koi': 'Koi Dourada Crua', 'Cooked Golden Koi': 'Koi Dourada Assada',
        'Egg': 'Ovo', 'Cowhide': 'Couro de Vaca', 'Deer Hide': 'Couro de Cervo', 'Wolf Pelt': 'Pele de Lobo', 'Wool': 'Lã', 'Feather': 'Pena', 'Rabbit Foot': 'Pata de Coelho', 'Boar Tusk': 'Presa de Javali', 'Troll Tooth': 'Dente de Troll', 'Bat Wing': 'Asa de Morcego',
        'Spider Silk': 'Seda de Aranha', 'Slime Ball': 'Gosma', 'Ectoplasm': 'Ectoplasma', 'Stone Core': 'Núcleo de Pedra', 'Dark Tome': 'Tomo Sombrio', 'Dragon Scale': 'Escama de Dragão', 'Colossus Core': 'Núcleo do Colosso', 'Soul Gem': 'Gema da Alma',
        'Health Potion': 'Poção de Vida', 'Greater Health Potion': 'Poção de Vida Maior', 'Mana Potion': 'Poção de Mana', 'Strength Potion': 'Poção de Força', 'Guard Potion': 'Poção de Guarda',
        'Wheat Seed': 'Semente de Trigo', 'Carrot Seed': 'Semente de Cenoura', 'Potato Seed': 'Semente de Batata', 'Herb Seed': 'Semente de Erva', 'Mana Seed': 'Semente de Mana',
        'Wheat': 'Trigo', 'Bread': 'Pão', 'Carrot': 'Cenoura', 'Potato': 'Batata', 'Baked Potato': 'Batata Assada', 'Healing Herb': 'Erva Curativa', 'Mana Blossom': 'Flor de Mana', 'Empty Vial': 'Frasco Vazio'
    };
    const SKILL = { Health: 'Vitalidade', Combat: 'Combate', Ranged: 'Arquearia', Magic: 'Magia', Prayer: 'Oração', Woodcut: 'Lenhador', Woodcutting: 'Lenhador', Mining: 'Mineração', Smithing: 'Ferraria', Firemk: 'Fogueira', Firemaking: 'Fogueira', Cooking: 'Culinária', Crafting: 'Artesanato', Fishing: 'Pesca', Farming: 'Agricultura', Alchemy: 'Alquimia', Enchant: 'Encantamento', Enchanting: 'Encantamento' };
    const SKILL_KEY = { hp: 'Vitalidade', combat: 'Combate', ranged: 'Arquearia', magic: 'Magia', prayer: 'Oração', woodcutting: 'Lenhador', mining: 'Mineração', smithing: 'Ferraria', firemaking: 'Fogueira', cooking: 'Culinária', crafting: 'Artesanato', fishing: 'Pesca', farming: 'Agricultura', alchemy: 'Alquimia', enchanting: 'Encantamento', enchant: 'Encantamento' };
    const MISC = { 'Wind Strike': 'Golpe de Vento', 'Water Strike': 'Golpe de Água', 'Earth Strike': 'Golpe de Terra', 'Fire Strike': 'Golpe de Fogo', 'Level Up!': 'Subiu de nível!', 'Fishing Spot': 'Ponto de Pesca', 'Bank Booth': 'Banco', 'Furnace': 'Fornalha', 'Anvil': 'Bigorna', 'Campfire': 'Fogueira', 'Lvl': 'Nv' };
    const SPELL = { wind_strike: 'Golpe de Vento', water_strike: 'Golpe de Água', earth_strike: 'Golpe de Terra', fire_strike: 'Golpe de Fogo' };

    const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const label = (n) => { if (typeof n !== 'string') return n; if (Object.prototype.hasOwnProperty.call(ITEM, n)) return ITEM[n]; return n; };

    // um único regex com tudo (mais longo primeiro); só casa palavra inteira
    const ALL = Object.assign({}, MISC, SKILL, ITEM);
    const keys = Object.keys(ALL).sort((a, b) => b.length - a.length);
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const RE = new RegExp('(^|[^A-Za-zÀ-ÿ0-9_])(' + keys.map(esc).join('|') + ')(?![A-Za-zÀ-ÿ0-9_])', 'g');
    const QUICK = /[A-Z][a-z]/;   // texto sem palavra capitalizada em inglês nunca precisa do regex
    function tr(s) {
        if (typeof s !== 'string' || s.length < 2 || !QUICK.test(s)) return s;
        return s.replace(RE, (m, pre, k) => pre + ALL[k]);
    }

    /* ---------- tela: troca nomes em inglês que aparecerem em texto/tooltip/title ---------- */
    const SKIP = 'input,textarea,select,option,script,style,canvas,#chat-box,#chat-input,.chat-msg,#tab-dev,#dev-panel,.dev-sub-content,.dev-input,[data-notr],#gf-win,.gf-win,#sqf-form';
    const skip = (el) => { try { return !el || (el.closest && el.closest(SKIP)); } catch (e) { return false; } };
    function fixNode(n) {
        if (!n) return;
        if (n.nodeType === 3) { const p = n.parentNode; if (!p || p.nodeName === 'SCRIPT' || p.nodeName === 'STYLE' || skip(p)) return; const v = n.nodeValue, t = tr(v); if (t !== v) n.nodeValue = t; return; }
        if (n.nodeType !== 1 || n.nodeName === 'SCRIPT' || n.nodeName === 'STYLE' || n.nodeName === 'CANVAS' || skip(n)) return;
        if (n.nodeName === 'OPTION' || n.nodeName === 'TEXTAREA' || n.nodeName === 'INPUT') { if (n.nodeName === 'INPUT') attrs(n); return; }
        attrs(n);
        for (let c = n.firstChild; c; c = c.nextSibling) fixNode(c);
    }
    function attrs(n) { for (const a of ['title', 'aria-label']) { const v = n.getAttribute && n.getAttribute(a); if (v) { const t = tr(v); if (t !== v) n.setAttribute(a, t); } } }
    let obs = null, fixing = false;
    function start() {
        if (obs || typeof MutationObserver === 'undefined' || !document.body) return;
        obs = new MutationObserver((list) => {
            if (fixing) return; fixing = true;
            try { for (const m of list) { if (m.type === 'characterData') fixNode(m.target); else if (m.type === 'attributes') { if (!skip(m.target)) attrs(m.target); } else m.addedNodes.forEach(fixNode); } } catch (e) { }
            fixing = false;
        });
        obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-label'] });
        fixNode(document.body);
    }

    /* ---------- mensagens e textos flutuantes ---------- */
    function wrap(name, idx) {
        const W = window; if (typeof W[name] !== 'function' || W[name]._lbl) return;
        const o = W[name]; W[name] = function () { try { if (typeof arguments[idx] === 'string') arguments[idx] = tr(arguments[idx]); } catch (e) { } return o.apply(this, arguments); }; W[name]._lbl = 1;
    }
    function wrapAll() { wrap('setActionText', 0); wrap('addFloatingText', 2); }

    window.itemLabel = label;
    window.Labels = {
        ITEM, SKILL, SPELL, tr, label, norm,
        skill: (k, fb) => SKILL_KEY[k] || SKILL[fb] || fb || k,
        match: (name, q) => { q = norm(q).trim(); if (!q) return true; return norm(name).includes(q) || norm(label(name)).includes(q); },
        missing: () => { try { return Object.keys(itemDB).filter((k) => !Object.prototype.hasOwnProperty.call(ITEM, k) && /^[A-Za-z0-9' -]+$/.test(k)); } catch (e) { return []; } }
    };
    wrapAll();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { start(); wrapAll(); }); else { start(); wrapAll(); }
})();
