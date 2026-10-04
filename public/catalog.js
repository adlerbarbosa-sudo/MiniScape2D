/* ============================================================
   MiniScape 2D - CATÁLOGO (dados)
   Criaturas, NPCs, itens novos, construções e decoração.
   Usado pelo jogo (index.html), pelo editor DEV e pelo catalogo.html.
   Tudo aqui pode ser editado no jogo (aba DEV); o que o admin salvar
   tem prioridade sobre estes valores padrão.
   ============================================================ */
(function (root) {
    'use strict';

    /* ---------- CRIATURAS ----------
       species  : desenho (Art.js). Se faltar, usa a parte antes do "_" da chave.
       behavior : aggressive = ataca quem chegar perto | neutral = só revida |
                  passive = foge quando apanha | skittish = foge só de ver o jogador
       w,h      : tamanho padrão no mapa   speed: velocidade relativa   range: alcance de detecção
       group    : monstro | fera | recurso | chefe | npc                                            */
    const CREATURES = {
        /* --- monstros --- */
        goblin_base:   { name: 'Goblin', group: 'monstro', species: 'goblin', behavior: 'aggressive', range: 90, speed: 1.0, w: 30, h: 34, hp: 15, maxHit: 2, xp: 15, c1: '#3f9d4f', c2: '#8a5a32', lootStr: 'Bones,1,1|Raw Meat,0.4,1|Coins,0.5,15', dialog: '', shopStr: '', desc: 'Pequeno, covarde e barulhento. Ataca quem passa perto do acampamento.', biome: 'Vila, Floresta' },
        orc_base:      { name: 'Orc', group: 'monstro', species: 'orc', behavior: 'aggressive', range: 85, speed: 0.9, w: 40, h: 46, hp: 30, maxHit: 5, xp: 40, c1: '#5b7a3a', c2: '#4a4f57', lootStr: 'Bones,1,1|Coins,1,30|Iron Ore,0.2,1', dialog: '', shopStr: '', desc: 'Guerreiro brutal com machado. Bate forte, mas é lento.', biome: 'Mina, Covil' },
        wolf_base:     { name: 'Lobo Cinzento', group: 'fera', species: 'wolf', behavior: 'aggressive', range: 120, speed: 1.35, w: 44, h: 30, hp: 22, maxHit: 3, xp: 25, c1: '#8a8f98', c2: '#d8dbe0', lootStr: 'Bones,1,1|Wolf Pelt,0.45,1|Raw Meat,0.8,2', dialog: '', shopStr: '', desc: 'Rápido e sempre em bando. Fuja ou lute de costas para a parede.', biome: 'Floresta, Vale' },
        skeleton_base: { name: 'Esqueleto', group: 'monstro', species: 'skeleton', behavior: 'aggressive', range: 95, speed: 1.0, w: 30, h: 44, hp: 35, maxHit: 6, xp: 55, c1: '#e8e2cf', c2: '#5b6470', lootStr: 'Bones,1,1|Coins,0.8,40|Iron Ore,0.2,1', dialog: '', shopStr: '', desc: 'Soldado morto que se recusa a descansar.', biome: 'Mina, Covil' },
        slime_base:    { name: 'Gosma', group: 'monstro', species: 'slime', behavior: 'neutral', range: 60, speed: 0.6, w: 32, h: 26, hp: 12, maxHit: 2, xp: 12, c1: '#59d36b', c2: '#c9ffd0', lootStr: 'Slime Ball,0.7,2|Coins,0.4,10', dialog: '', shopStr: '', desc: 'Pula devagar. Só ataca se mexerem com ela.', biome: 'Vale, Floresta' },
        bat_base:      { name: 'Morcego', group: 'fera', species: 'bat', behavior: 'aggressive', range: 130, speed: 1.6, w: 36, h: 28, hp: 10, maxHit: 2, xp: 12, c1: '#4b3b63', c2: '#9c7fc4', lootStr: 'Bat Wing,0.6,1', dialog: '', shopStr: '', desc: 'Voa em zigue-zague e some na escuridão.', biome: 'Covil, Floresta' },
        spider_base:   { name: 'Aranha Gigante', group: 'fera', species: 'spider', behavior: 'aggressive', range: 100, speed: 1.15, w: 46, h: 30, hp: 28, maxHit: 4, xp: 38, c1: '#3a2a3f', c2: '#c0392b', lootStr: 'Spider Silk,0.7,2|Raw Meat,0.3,1', dialog: '', shopStr: '', desc: 'Oito patas, oito olhos e nenhuma paciência.', biome: 'Floresta, Covil' },
        rat_base:      { name: 'Rato Gigante', group: 'fera', species: 'rat', behavior: 'neutral', range: 60, speed: 1.2, w: 28, h: 18, hp: 8, maxHit: 1, xp: 8, c1: '#7a6a5c', c2: '#e6b8b0', lootStr: 'Bones,1,1', dialog: '', shopStr: '', desc: 'Ótimo para treinar os primeiros golpes.', biome: 'Vila, Vale' },
        snake_base:    { name: 'Cobra Verde', group: 'fera', species: 'snake', behavior: 'aggressive', range: 70, speed: 1.1, w: 42, h: 20, hp: 14, maxHit: 4, xp: 20, c1: '#4f9a3a', c2: '#d9c34a', lootStr: 'Raw Meat,0.4,1', dialog: '', shopStr: '', desc: 'Camuflada na grama alta. O bote é rápido.', biome: 'Vale, Floresta' },
        boar_base:     { name: 'Javali', group: 'fera', species: 'boar', behavior: 'neutral', range: 60, speed: 1.15, w: 42, h: 30, hp: 26, maxHit: 4, xp: 30, c1: '#6b4a34', c2: '#efe3c8', lootStr: 'Raw Pork,1,2|Boar Tusk,0.4,1|Bones,0.5,1', dialog: '', shopStr: '', desc: 'Só ataca se for provocado, mas aí não para mais.', biome: 'Floresta' },
        ghost_base:    { name: 'Fantasma', group: 'monstro', species: 'ghost', behavior: 'aggressive', range: 120, speed: 0.8, w: 30, h: 46, hp: 30, maxHit: 5, xp: 50, c1: '#b8d8ff', c2: '#ffffff', lootStr: 'Ectoplasm,0.7,1|Coins,0.6,35', dialog: '', shopStr: '', desc: 'Atravessa o frio do covil e assusta quem chega.', biome: 'Covil' },
        troll_base:    { name: 'Troll das Cavernas', group: 'chefe', species: 'troll', behavior: 'aggressive', range: 100, speed: 0.7, w: 58, h: 70, hp: 90, maxHit: 10, xp: 120, c1: '#6d8a5e', c2: '#7a5a3a', lootStr: 'Bones,1,1|Coins,1,120|Iron Bar,0.35,1|Troll Tooth,0.3,1', dialog: '', shopStr: '', desc: 'Gigante corcunda com um tronco de árvore como arma.', biome: 'Covil, Mina' },
        golem_base:    { name: 'Golem de Pedra', group: 'chefe', species: 'golem', behavior: 'neutral', range: 90, speed: 0.55, w: 60, h: 66, hp: 140, maxHit: 12, xp: 160, c1: '#8b8f96', c2: '#4fd6ff', lootStr: 'Stone Core,0.5,1|Iron Ore,1,3|Coins,0.7,80', dialog: '', shopStr: '', desc: 'Guardião da mina. Parece adormecido... até você bater nele.', biome: 'Mina' },
        darkmage_base: { name: 'Mago Sombrio', group: 'monstro', species: 'darkmage', behavior: 'aggressive', range: 150, speed: 0.9, w: 32, h: 48, hp: 45, maxHit: 8, xp: 90, c1: '#2b1f45', c2: '#b04bff', lootStr: 'Dark Tome,0.3,1|Air Rune,0.6,5|Mind Rune,0.6,5|Coins,0.8,60', dialog: '', shopStr: '', desc: 'Cultista que sussurra feitiços proibidos.', biome: 'Covil' },
        whelp_base:    { name: 'Filhote de Dragão', group: 'chefe', species: 'whelp', behavior: 'aggressive', range: 130, speed: 1.0, w: 64, h: 52, hp: 70, maxHit: 9, xp: 150, c1: '#3f7f5a', c2: '#e8d28a', lootStr: 'Dragon Scale,0.6,1|Coins,1,90', dialog: '', shopStr: '', desc: 'Pequeno, mas já cospe fogo. A mãe não está longe.', biome: 'Covil' },
        dragon_boss:   { name: 'Dragão Ancestral', group: 'chefe', species: 'dragon', behavior: 'aggressive', range: 190, speed: 0.75, w: 150, h: 120, hp: 400, maxHit: 22, xp: 1500, c1: '#9c1c1c', c2: '#f3a33a', lootStr: 'Dragon Scale,1,4|Dragon Bones,1,1|Coins,1,800|Iron Bar,0.6,3|Health Potion,0.5,2', dialog: '', shopStr: '', desc: 'O senhor do covil. Asas que apagam o sol, fogo que derrete aço. Leve poções.', biome: 'Covil do Dragão' },

        /* --- animais / recursos --- */
        cow_base:      { name: 'Vaca', group: 'recurso', species: 'cow', behavior: 'passive', range: 80, speed: 0.6, w: 48, h: 36, hp: 10, maxHit: 0, xp: 6, c1: '#f4f1ea', c2: '#2f2a28', lootStr: 'Raw Beef,1,2|Cowhide,0.7,1|Bones,0.3,1', dialog: '', shopStr: '', desc: 'Carne e couro para quem sabe cozinhar e costurar.', biome: 'Vila, Fazenda' },
        sheep_base:    { name: 'Ovelha', group: 'recurso', species: 'sheep', behavior: 'passive', range: 80, speed: 0.6, w: 40, h: 32, hp: 8, maxHit: 0, xp: 5, c1: '#f6f3ee', c2: '#4a4038', lootStr: 'Wool,1,2|Raw Mutton,0.8,1', dialog: '', shopStr: '', desc: 'Lã macia e carne de carneiro.', biome: 'Vila, Fazenda' },
        chicken_base:  { name: 'Galinha', group: 'recurso', species: 'chicken', behavior: 'passive', range: 80, speed: 0.9, w: 24, h: 24, hp: 4, maxHit: 0, xp: 3, c1: '#fbfbf5', c2: '#e04a3a', lootStr: 'Raw Chicken,1,1|Feather,1,3|Egg,0.5,2', dialog: '', shopStr: '', desc: 'Penas, ovos e um jantar rápido.', biome: 'Vila, Fazenda' },
        pig_base:      { name: 'Porco', group: 'recurso', species: 'pig', behavior: 'passive', range: 80, speed: 0.7, w: 40, h: 30, hp: 10, maxHit: 0, xp: 6, c1: '#f0a8a8', c2: '#c96b6b', lootStr: 'Raw Pork,1,2', dialog: '', shopStr: '', desc: 'Lento e barulhento. Bacon garantido.', biome: 'Fazenda' },
        deer_base:     { name: 'Cervo', group: 'recurso', species: 'deer', behavior: 'skittish', range: 130, speed: 1.5, w: 46, h: 52, hp: 14, maxHit: 0, xp: 14, c1: '#b07a48', c2: '#f0dfc0', lootStr: 'Raw Venison,1,2|Deer Hide,0.6,1', dialog: '', shopStr: '', desc: 'Arisco: foge assim que percebe você. Aproxime-se com calma (ou use arco).', biome: 'Floresta' },
        rabbit_base:   { name: 'Coelho', group: 'recurso', species: 'rabbit', behavior: 'skittish', range: 100, speed: 1.4, w: 22, h: 20, hp: 3, maxHit: 0, xp: 4, c1: '#c9b7a3', c2: '#ffffff', lootStr: 'Raw Rabbit,1,1|Rabbit Foot,0.2,1', dialog: '', shopStr: '', desc: 'Pula para longe ao menor barulho.', biome: 'Vale, Floresta' },

        /* --- NPCs (vendem, conversam) --- */
        merchant_base: { name: 'Mercador', group: 'npc', species: 'merchant', behavior: 'npc', w: 30, h: 44, hp: 0, maxHit: 0, xp: 0, c1: '#7a3fa0', c2: '#f1c27d', lootStr: '', dialog: 'Bem-vindo à minha loja! Tenho de tudo um pouco.', shopStr: 'Net,20|Water Rune,10|Tinderbox,50|Health Potion,40', desc: 'Vende o básico de viagem.', biome: 'Vila' },
        guide_npc:     { name: 'Guia Aldeão', group: 'npc', species: 'guide', behavior: 'npc', w: 30, h: 44, hp: 0, maxHit: 0, xp: 0, c1: '#2f78b5', c2: '#f1c27d', lootStr: '', dialog: 'Bem-vindo! Corte árvores, minere pedras, pesque e cace. Floresta a oeste, mina a leste, rio ao sul e o covil do dragão ao norte.', shopStr: '', desc: 'Explica o mundo aos novatos.', biome: 'Vila' },
        smith_npc:     { name: 'Ferreiro', group: 'npc', species: 'smith', behavior: 'npc', w: 32, h: 44, hp: 0, maxHit: 0, xp: 0, c1: '#c0662b', c2: '#e0ac7a', lootStr: '', dialog: 'Ferramentas e armaduras de primeira! Traga barras e eu te ensino o resto.', shopStr: 'Bronze Pickaxe,100|Bronze Axe,80|Bronze Sword,150|Bronze Shield,120|Bronze Body,200|Bronze Arrow,2', desc: 'Vende ferramentas e armaduras de bronze.', biome: 'Mina' },
        fisher_npc:    { name: 'Pescador', group: 'npc', species: 'fisher', behavior: 'npc', w: 30, h: 44, hp: 0, maxHit: 0, xp: 0, c1: '#1f8f7f', c2: '#f1c27d', lootStr: '', dialog: 'Use a rede nos pontos de pesca. Peixe cozido cura bem!', shopStr: 'Net,20|Tinderbox,50', desc: 'Conhece todos os pontos de pesca.', biome: 'Rio, Floresta' },
        guard_npc:     { name: 'Guarda Real', group: 'npc', species: 'guard', behavior: 'npc', w: 32, h: 46, hp: 0, maxHit: 0, xp: 0, c1: '#3a5fa8', c2: '#f1c27d', lootStr: '', dialog: 'Alto lá, viajante! A vila é segura, mas o covil ao norte não. Cuidado com o dragão.', shopStr: '', desc: 'Protege a vila e dá avisos.', biome: 'Vila' },
        priest_npc:    { name: 'Sacerdote', group: 'npc', species: 'priest', behavior: 'npc', w: 30, h: 46, hp: 0, maxHit: 0, xp: 0, c1: '#f2efe6', c2: '#f1c27d', lootStr: '', dialog: 'Que a luz te acompanhe. Poções de cura, para os corajosos.', shopStr: 'Health Potion,40', desc: 'Vende poções de cura.', biome: 'Vila' },
        wizard_npc:    { name: 'Mago Arcano', group: 'npc', species: 'wizard', behavior: 'npc', w: 30, h: 50, hp: 0, maxHit: 0, xp: 0, c1: '#2b56b8', c2: '#f1c27d', lootStr: '', dialog: 'Runas, cajados e segredos. O que procura, jovem aprendiz?', shopStr: 'Air Rune,8|Mind Rune,8|Water Rune,10|Staff,60', desc: 'Vende runas e cajados.', biome: 'Vila' },
        farmer_npc:    { name: 'Fazendeiro', group: 'npc', species: 'farmer', behavior: 'npc', w: 30, h: 44, hp: 0, maxHit: 0, xp: 0, c1: '#b5482e', c2: '#e0ac7a', lootStr: '', dialog: 'Cuide das minhas vacas e ovelhas! Elas dão lã, couro e carne de primeira.', shopStr: 'Egg,4|Bronze Axe,80', desc: 'Dono da fazenda.', biome: 'Fazenda' },
        barkeep_npc:   { name: 'Taverneiro', group: 'npc', species: 'barkeep', behavior: 'npc', w: 32, h: 44, hp: 0, maxHit: 0, xp: 0, c1: '#8a3b2a', c2: '#e0ac7a', lootStr: '', dialog: 'Uma caneca? Temos carne assada e peixe fresco!', shopStr: 'Cooked Meat,15|Cooked Fish,20|Health Potion,40', desc: 'Vende comida pronta.', biome: 'Taverna' }
    };

    try { if (root.Balance) root.Balance.applyNpcDB(CREATURES); } catch (e) { }   // balanceamento v2: vida/dano por nível (public/balance.js)

    /* ---------- ITENS NOVOS (soltos pelos monstros, cozinha, forja) ---------- */
    const ITEMS = {
        'Raw Beef':     { name: 'Raw Beef', icon: '🥩', type: 'resource', stackable: true, weight: 0.8, desc: 'Carne de vaca crua. Cozinhe na fogueira.', cooksInto: 'Cooked Beef', cookXp: 14 },
        'Cooked Beef':  { name: 'Cooked Beef', icon: '🍖', type: 'consumable', heal: 6, stackable: true, weight: 0.8, desc: 'Cura bastante HP.' },
        'Raw Mutton':   { name: 'Raw Mutton', icon: '🥩', type: 'resource', stackable: true, weight: 0.7, desc: 'Carne de ovelha crua.', cooksInto: 'Cooked Mutton', cookXp: 14 },
        'Cooked Mutton':{ name: 'Cooked Mutton', icon: '🍖', type: 'consumable', heal: 6, stackable: true, weight: 0.7, desc: 'Carneiro assado.' },
        'Raw Chicken':  { name: 'Raw Chicken', icon: '🍗', type: 'resource', stackable: true, weight: 0.5, desc: 'Frango cru.', cooksInto: 'Cooked Chicken', cookXp: 10 },
        'Cooked Chicken':{ name: 'Cooked Chicken', icon: '🍗', type: 'consumable', heal: 5, stackable: true, weight: 0.5, desc: 'Frango assado.' },
        'Raw Pork':     { name: 'Raw Pork', icon: '🥓', type: 'resource', stackable: true, weight: 0.8, desc: 'Carne de porco crua.', cooksInto: 'Cooked Pork', cookXp: 14 },
        'Cooked Pork':  { name: 'Cooked Pork', icon: '🥓', type: 'consumable', heal: 7, stackable: true, weight: 0.8, desc: 'Bacon e costela.' },
        'Raw Venison':  { name: 'Raw Venison', icon: '🥩', type: 'resource', stackable: true, weight: 0.9, desc: 'Carne de cervo crua.', cooksInto: 'Cooked Venison', cookXp: 20 },
        'Cooked Venison':{ name: 'Cooked Venison', icon: '🍖', type: 'consumable', heal: 9, stackable: true, weight: 0.9, desc: 'Carne nobre. Cura muito.' },
        'Raw Rabbit':   { name: 'Raw Rabbit', icon: '🍗', type: 'resource', stackable: true, weight: 0.4, desc: 'Coelho cru.', cooksInto: 'Cooked Rabbit', cookXp: 8 },
        'Cooked Rabbit':{ name: 'Cooked Rabbit', icon: '🍗', type: 'consumable', heal: 4, stackable: true, weight: 0.4, desc: 'Ensopado rápido.' },
        'Egg':          { name: 'Egg', icon: '🥚', type: 'consumable', heal: 2, stackable: true, weight: 0.1, desc: 'Ovo de galinha.' },
        'Cowhide':      { name: 'Cowhide', icon: '🟫', type: 'resource', stackable: true, weight: 1.0, desc: 'Couro de vaca. Serve para armaduras leves.' },
        'Deer Hide':    { name: 'Deer Hide', icon: '🟫', type: 'resource', stackable: true, weight: 0.9, desc: 'Couro fino de cervo.' },
        'Wolf Pelt':    { name: 'Wolf Pelt', icon: '🐺', type: 'resource', stackable: true, weight: 0.9, desc: 'Pele de lobo.' },
        'Wool':         { name: 'Wool', icon: '🧶', type: 'resource', stackable: true, weight: 0.2, desc: 'Lã macia.' },
        'Feather':      { name: 'Feather', icon: '🪶', type: 'resource', stackable: true, weight: 0.01, desc: 'Pena de galinha. Boa para flechas.' },
        'Rabbit Foot':  { name: 'Rabbit Foot', icon: '🐾', type: 'resource', stackable: true, weight: 0.1, desc: 'Dizem que dá sorte.' },
        'Boar Tusk':    { name: 'Boar Tusk', icon: '🦷', type: 'resource', stackable: true, weight: 0.5, desc: 'Presa de javali.' },
        'Troll Tooth':  { name: 'Troll Tooth', icon: '🦷', type: 'resource', stackable: true, weight: 0.8, desc: 'Dente enorme de troll.' },
        'Bat Wing':     { name: 'Bat Wing', icon: '🦇', type: 'resource', stackable: true, weight: 0.1, desc: 'Asa de morcego.' },
        'Spider Silk':  { name: 'Spider Silk', icon: '🕸️', type: 'resource', stackable: true, weight: 0.1, desc: 'Seda resistente.' },
        'Slime Ball':   { name: 'Slime Ball', icon: '🟢', type: 'resource', stackable: true, weight: 0.3, desc: 'Gosma grudenta.' },
        'Ectoplasm':    { name: 'Ectoplasm', icon: '👻', type: 'resource', stackable: true, weight: 0.05, desc: 'Essência de fantasma.' },
        'Stone Core':   { name: 'Stone Core', icon: '💎', type: 'resource', stackable: true, weight: 2.0, desc: 'Coração brilhante de um golem.' },
        'Dark Tome':    { name: 'Dark Tome', icon: '📕', type: 'resource', stackable: true, weight: 0.6, desc: 'Grimório proibido.' },
        'Dragon Scale': { name: 'Dragon Scale', icon: '🐉', type: 'resource', stackable: true, weight: 1.2, desc: 'Escama indestrutível.' },
        'Dragon Bones': { name: 'Dragon Bones', icon: '🦴', type: 'consumable', heal: 0, stackable: true, weight: 1.5, desc: 'Ossos de dragão.' },
        'Health Potion':{ name: 'Health Potion', icon: '🧪', type: 'consumable', heal: 20, stackable: true, weight: 0.3, desc: 'Cura 20 HP.' },
        /* equipamentos que dão utilidade aos recursos */
        'Leather Body': { name: 'Leather Body', icon: '🥋', type: 'equipment', slot: 'body', defBonus: 2, stackable: false, weight: 2.5, desc: 'Armadura leve de couro.', recipe: 'Cowhide,3', craftQty: 1 },
        'Iron Sword':   { name: 'Iron Sword', icon: '⚔️', type: 'equipment', slot: 'weapon', bonusDmg: 7, stackable: false, weight: 2.2, desc: 'Espada de ferro.', recipe: 'Iron Bar,2', craftQty: 1 },
        'Iron Shield':  { name: 'Iron Shield', icon: '🛡️', type: 'equipment', slot: 'shield', defBonus: 4, stackable: false, weight: 4.0, desc: 'Escudo de ferro.', recipe: 'Iron Bar,3', craftQty: 1 },
        'Iron Body':    { name: 'Iron Body', icon: '🦺', type: 'equipment', slot: 'body', defBonus: 6, stackable: false, weight: 7.0, desc: 'Armadura de ferro.', recipe: 'Iron Bar,5', craftQty: 1 },
        'Dragonscale Shield': { name: 'Dragonscale Shield', icon: '🛡️', type: 'equipment', slot: 'shield', defBonus: 9, stackable: false, weight: 4.5, desc: 'Escudo forjado com escamas de dragão.', recipe: 'Dragon Scale,5|Iron Bar,2', craftQty: 1 },
        'Feather Arrow': { name: 'Feather Arrow', icon: '↗️', type: 'equipment', slot: 'ammo', bonusDmg: 2, stackable: true, weight: 0.01, desc: 'Flechas emplumadas.', recipe: 'Logs,1|Feather,3', craftQty: 12 }
    };

    /* ---------- CONSTRUÇÕES ----------
       w,h: tamanho padrão  |  foot: parte de baixo que bloqueia [x0,y0,x1,y1] em frações  */
    const BUILDINGS = {
        cottage:  { name: 'Casinha de Sapê', w: 104, h: 96,  foot: [0.06, 0.52, 0.94, 1], desc: 'Casa simples de camponês, com telhado de palha e chaminé.' },
        townhouse:{ name: 'Sobrado de Madeira', w: 116, h: 132, foot: [0.04, 0.55, 0.96, 1], desc: 'Casa de dois andares com estrutura de madeira e telhado de telhas.' },
        tavern:   { name: 'Taverna', w: 160, h: 128, foot: [0.03, 0.5, 0.97, 1], desc: 'Ponto de encontro da vila: placa pendurada, chaminé fumegando e luz quente nas janelas.' },
        smithy:   { name: 'Ferraria', w: 138, h: 108, foot: [0.04, 0.5, 0.96, 1], desc: 'Forja aberta com chaminé em brasa. Combina com fornalha e bigorna.' },
        church:   { name: 'Igreja', w: 150, h: 178, foot: [0.05, 0.55, 0.95, 1], desc: 'Nave de pedra com torre do sino e vitral.' },
        wizard_tower: { name: 'Torre do Mago', w: 86, h: 190, foot: [0.14, 0.7, 0.86, 1], desc: 'Torre torta de pedra azul com telhado pontudo e estrelas.' },
        watchtower:   { name: 'Torre de Vigia', w: 76, h: 150, foot: [0.1, 0.62, 0.9, 1], desc: 'Torre de pedra com ameias e bandeira.' },
        castle:   { name: 'Castelo', w: 260, h: 190, foot: [0.02, 0.55, 0.98, 1], desc: 'Fortaleza com duas torres, muralha, portão levadiço e estandartes.' },
        windmill: { name: 'Moinho', w: 110, h: 158, foot: [0.16, 0.6, 0.84, 1], desc: 'Moinho de vento com pás giratórias.' },
        barn:     { name: 'Celeiro', w: 148, h: 116, foot: [0.03, 0.5, 0.97, 1], desc: 'Celeiro vermelho com portas grandes e feno no sótão.' },
        market:   { name: 'Barraca de Feira', w: 88, h: 70,  foot: [0.08, 0.6, 0.92, 1], desc: 'Barraca com toldo listrado e mercadorias.' },
        tent:     { name: 'Tenda de Acampamento', w: 84, h: 66, foot: [0.1, 0.55, 0.9, 1], desc: 'Tenda de lona para acampamentos e goblins.' }
    };

    /* ---------- DECORAÇÃO ---------- (solid = bloqueia; foot = área que bloqueia) */
    const DECOR = {
        well:      { name: 'Poço', w: 44, h: 52, solid: true, foot: [0.1, 0.5, 0.9, 1] },
        fountain:  { name: 'Fonte', w: 84, h: 74, solid: true, foot: [0.05, 0.45, 0.95, 1] },
        barrel:    { name: 'Barril', w: 26, h: 32, solid: true, foot: [0.05, 0.5, 0.95, 1] },
        crates:    { name: 'Caixotes', w: 44, h: 38, solid: true, foot: [0.05, 0.4, 0.95, 1] },
        haystack:  { name: 'Monte de Feno', w: 52, h: 46, solid: true, foot: [0.05, 0.4, 0.95, 1] },
        lamp:      { name: 'Poste de Luz', w: 16, h: 60, solid: true, foot: [0.25, 0.85, 0.75, 1] },
        sign:      { name: 'Placa', w: 30, h: 40, solid: true, foot: [0.3, 0.8, 0.7, 1] },
        fence_h:   { name: 'Cerca (horizontal)', w: 80, h: 26, solid: true, foot: [0, 0.55, 1, 1] },
        fence_v:   { name: 'Cerca (vertical)', w: 14, h: 80, solid: true, foot: [0, 0, 1, 1] },
        wall_h:    { name: 'Muro de Pedra (horizontal)', w: 96, h: 34, solid: true, foot: [0, 0.4, 1, 1] },
        wall_v:    { name: 'Muro de Pedra (vertical)', w: 22, h: 96, solid: true, foot: [0, 0, 1, 1] },
        flowers:   { name: 'Flores', w: 30, h: 22, solid: false },
        bush:      { name: 'Arbusto', w: 36, h: 28, solid: true, foot: [0.15, 0.5, 0.85, 1] },
        stump:     { name: 'Toco', w: 26, h: 22, solid: true, foot: [0.05, 0.4, 0.95, 1] },
        statue:    { name: 'Estátua de Cavaleiro', w: 40, h: 74, solid: true, foot: [0.1, 0.7, 0.9, 1] },
        gravestone:{ name: 'Lápide', w: 26, h: 34, solid: true, foot: [0.1, 0.6, 0.9, 1] },
        banner:    { name: 'Estandarte', w: 24, h: 64, solid: true, foot: [0.35, 0.85, 0.65, 1] },
        cart:      { name: 'Carroça', w: 66, h: 46, solid: true, foot: [0.05, 0.5, 0.95, 1] },
        campfire:  { name: 'Fogueira Decorativa', w: 30, h: 26, solid: false },
        bones:     { name: 'Ossada', w: 40, h: 22, solid: false },
        crystal:   { name: 'Cristal Mágico', w: 30, h: 46, solid: true, foot: [0.15, 0.65, 0.85, 1] },
        mushrooms: { name: 'Cogumelos', w: 26, h: 20, solid: false },
        lily:      { name: 'Vitória-régia', w: 34, h: 22, solid: false }
    };

    root.CATALOG = { CREATURES, ITEMS, BUILDINGS, DECOR };
})(typeof window !== 'undefined' ? window : globalThis);
