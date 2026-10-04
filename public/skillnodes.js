/* MiniScape 2D — árvores de habilidades: DADOS COMPARTILHADOS entre cliente (skilltree.js) e servidor (security.js / server.js).
   Este arquivo é a única fonte da verdade dos nós (ids, camadas, pré-requisitos, ranks, custos e efeitos). O servidor o carrega com require() e usa
   SkillNodes.clean() para recusar nós inexistentes, ranks acima do máximo, pré-requisitos quebrados e pontos acima do que as perícias do save permitem.
   Pontos de cada árvore = floor((nível da perícia - 1) / 2): Guerreiro usa Combate (combat), Arqueiro usa Arquearia (ranged), Mago usa Magia (magic).
   Cada árvore tem 6 camadas (tier 0..5) e 6 raias (lane 0..5): 3 ramos de 2 raias. Passivas custam 1 ponto por rank (max 3 a 5 ranks); ativas custam 2 por rank (max 3).
   Efeitos de passiva (por rank): dmg (% de dano da perícia da árvore: golpes comuns E habilidades), skd (% só das habilidades ativas), crit, critDmg, atkSpd, dr, lifesteal, luck,
   moveSpd, save, spellDmg (iguais aos atributos de Stats), cdr (% de redução de recarga: vira o atributo Stats.cdr, teto 40% somando itens), maxHp, maxMp (fixos), hpRegen (vida a cada 10 s), mpRegen (mana a cada 10 s).
   CAPSTONE (kind 'c', camada 6): um por árvore (Vigor Inabalável / Aljava Mágica / Fonte Arcana), 1 rank, custa 3 pontos, ALTERNÁVEL (ligado/desligado). O estado ligado fica em skillTree.tg = {id: true}. */
(function (root, factory) {
    const m = factory();
    if (typeof module === 'object' && module.exports) module.exports = m; else root.SkillNodes = m;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const TREE_IDS = ['warrior', 'archer', 'mage'];
    const TREES = {
        warrior: { id: 'warrior', name: 'Guerreiro', skill: 'combat', skillName: 'Combate', color: '#e0703a', color2: '#ffb27a', branches: ['Lâmina', 'Baluarte', 'Predador'], blurb: 'Corpo a corpo: dano bruto, defesa e sangue.' },
        archer: { id: 'archer', name: 'Arqueiro', skill: 'ranged', skillName: 'Arquearia', color: '#4fbf6a', color2: '#a8f0a8', branches: ['Precisão', 'Caçada', 'Sombra'], blurb: 'À distância: críticos, caça e mobilidade.' },
        mage: { id: 'mage', name: 'Mago', skill: 'magic', skillName: 'Magia', color: '#7b8cff', color2: '#c4ccff', branches: ['Fogo Arcano', 'Gelo e Mana', 'Luz Serena'], blurb: 'Magia: fogo, gelo, escudos e cura.' }
    };
    const NODES = Object.create(null), ORDER = { warrior: [], archer: [], mage: [] };
    const EFF_LABEL = {
        dmg: (v) => '+' + v + '% de dano', skd: (v) => '+' + v + '% de dano das habilidades', crit: (v) => '+' + v + '% de chance de crítico', critDmg: (v) => '+' + v + '% de dano crítico',
        atkSpd: (v) => '+' + v + '% de velocidade de ataque', dr: (v) => '+' + v + '% de redução de dano', lifesteal: (v) => '+' + v + '% de roubo de vida', luck: (v) => '+' + v + '% de sorte nos drops',
        moveSpd: (v) => '+' + v + '% de velocidade de movimento', save: (v) => '+' + v + '% de chance de poupar munição/runas', spellDmg: (v) => '+' + v + ' de dano mágico',
        maxHp: (v) => '+' + v + ' de vida máxima', maxMp: (v) => '+' + v + ' de mana máxima', hpRegen: (v) => '+' + v + ' de vida a cada 10 s', mpRegen: (v) => '+' + v + ' de mana a cada 10 s', cdr: (v) => '-' + v + '% de recarga das habilidades'
    };
    const EFF_KEYS = Object.keys(EFF_LABEL);
    const r1 = (v) => Math.round(v * 10) / 10;

    // Balanceamento v2: vida/mana/regeneração das passivas valem 10x / 5x (a vida base do jogador é 100 + 10 por nível de Vitalidade)
    const FLAT_SCALE = { maxHp: 10, maxMp: 5, hpRegen: 10, mpRegen: 5 };
    function add(tree, kind, id, name, tier, lane, req, max, eff, ic, branch, extra) {
        if (eff) { eff = Object.assign({}, eff); for (const k of Object.keys(FLAT_SCALE)) if (eff[k]) eff[k] = eff[k] * FLAT_SCALE[k]; }
        const n = Object.assign({ id, tree, kind, name, tier, lane, req: (req || []).map((r) => (typeof r === 'string' ? [r, 1] : r)), max, cost: kind === 'a' ? 2 : 1, eff: eff || null, ic, branch }, extra || {});
        NODES[id] = n; ORDER[tree].push(id); return n;
    }
    const P = (tree, id, name, tier, lane, req, max, eff, ic, branch, d) => add(tree, 'p', id, name, tier, lane, req, max, eff, ic, branch, { d: d || '' });
    const A = (tree, id, name, tier, lane, req, ic, branch, d) => add(tree, 'a', id, name, tier, lane, req, 3, null, ic, branch, { d: d || '' });
    const C = (tree, id, name, tier, lane, req, ic, branch, d) => add(tree, 'c', id, name, tier, lane, req, 1, null, ic, branch, { d: d || '', cost: 3 });

    /* ============================ GUERREIRO (Combate) ============================ */
    (function () {
        const t = 'warrior';
        P(t, 'w_root', 'Treino de Combate', 0, 2.5, [], 5, { dmg: 1.5 }, 'fist', 1, 'A base de todo guerreiro: cada golpe pesa um pouco mais.');
        P(t, 'w_forca', 'Força Bruta', 1, 0.5, ['w_root'], 5, { dmg: 2 }, 'sword', 0, 'Músculos treinados em mil lutas.');
        P(t, 'w_pele', 'Pele Grossa', 1, 2.5, ['w_root'], 5, { dr: 1.2 }, 'shield', 1, 'Os golpes já não doem como antes.');
        P(t, 'w_passo', 'Passo Firme', 1, 4.5, ['w_root'], 4, { moveSpd: 1.5 }, 'boot', 2, 'Quem caça precisa alcançar a presa.');
        A(t, 'w_golpe', 'Golpe Poderoso', 2, 0, [['w_forca', 2]], 'smash', 0, 'Um golpe devastador no inimigo à frente.');
        P(t, 'w_precisao', 'Golpes Precisos', 2, 1, ['w_forca'], 5, { crit: 1.2 }, 'crit', 0, 'Você vê onde a armadura é fina.');
        P(t, 'w_vigor', 'Vigor', 2, 2, ['w_pele'], 5, { maxHp: 4 }, 'heart', 1, 'Mais vida para aguentar a luta.');
        A(t, 'w_grito', 'Grito de Guerra', 2, 3, [['w_pele', 2]], 'shout', 1, 'Um brado que inflama o seu ataque e endurece a pele.');
        P(t, 'w_sangue', 'Sede de Sangue', 2, 4, ['w_passo'], 5, { lifesteal: 0.8 }, 'fang', 2, 'Cada ferida aberta alimenta você.');
        A(t, 'w_investida', 'Investida', 2, 5, [['w_passo', 2]], 'dash', 2, 'Avança em linha reta, golpeando quem estiver no caminho.');
        P(t, 'w_furia', 'Fúria Contida', 3, 0, [['w_golpe', 1]], 3, { skd: 5 }, 'rage', 0, 'As habilidades batem mais forte.');
        P(t, 'w_fiocrit', 'Fio Cruel', 3, 1, [['w_precisao', 2]], 4, { critDmg: 7 }, 'critdmg', 0, 'Os críticos abrem feridas profundas.');
        P(t, 'w_regen', 'Recuperação', 3, 2, [['w_vigor', 2]], 4, { hpRegen: 3 }, 'regen', 1, 'O corpo se refaz depressa.');
        P(t, 'w_escudo', 'Maestria de Escudo', 3, 3, [['w_grito', 1]], 4, { dr: 1.5 }, 'shield2', 1, 'Você sabe onde colocar o escudo.');
        P(t, 'w_sorte', 'Espólios de Guerra', 3, 4, [['w_sangue', 2]], 4, { luck: 3 }, 'clover', 2, 'Quem vence leva mais do campo.');
        P(t, 'w_disciplina', 'Disciplina', 3, 5, [['w_investida', 1]], 4, { cdr: 2.5 }, 'hourglass', 2, 'Treino cuidadoso: as técnicas voltam mais rápido.');
        P(t, 'w_veloz', 'Lâmina Veloz', 4, 0.5, [['w_furia', 2], ['w_fiocrit', 1]], 4, { atkSpd: 2.5 }, 'speed', 0, 'A espada parece leve nas suas mãos.');
        A(t, 'w_furor', 'Furor', 4, 1.5, [['w_fiocrit', 2], ['w_furia', 1]], 'rage2', 0, 'Entra em frenesi: ataca muito mais rápido e se cura ao ferir.');
        A(t, 'w_muralha', 'Muralha', 4, 2.5, [['w_regen', 2], ['w_escudo', 2]], 'wall', 1, 'Ergue uma barreira que absorve dano por alguns segundos.');
        P(t, 'w_instinto', 'Instinto Predador', 4, 4, [['w_sorte', 2]], 4, { crit: 1, atkSpd: 1 }, 'eye', 2, 'Você sente o ponto fraco do alvo.');
        P(t, 'w_veterano', 'Veterano', 4, 5, [['w_disciplina', 2]], 3, { maxHp: 6, dr: 1 }, 'star', 2, 'Cicatrizes são experiência.');
        P(t, 'w_mestre', 'Mestre de Armas', 5, 0.5, [['w_veloz', 2], ['w_furor', 1]], 3, { dmg: 3 }, 'sword2', 0, 'Nenhuma lâmina tem segredos para você.');
        A(t, 'w_terremoto', 'Terremoto', 5, 1.5, [['w_furor', 2]], 'quake', 0, 'Bate no chão e abala todos os inimigos ao redor.');
        P(t, 'w_inabalavel', 'Inabalável', 5, 2.5, [['w_muralha', 1]], 3, { dr: 2, maxHp: 5 }, 'tower', 1, 'Nada o derruba.');
        P(t, 'w_lenda', 'Lenda de Guerra', 5, 4.5, [['w_instinto', 2], ['w_veterano', 1]], 3, { dmg: 3, skd: 4 }, 'crown', 2, 'Seu nome é cantado nas tavernas.');
        P(t, 'w_foco', 'Foco de Batalha', 5, 3.5, [['w_instinto', 1]], 3, { cdr: 3 }, 'hourglass', 2, 'Cabeça fria, braço rápido: as técnicas voltam mais cedo.');
        P(t, 'w_maestria', 'Maestria Marcial', 6, 4, [['w_foco', 1]], 3, { cdr: 4 }, 'hourglass', 2, 'Dominar o próprio ritmo é a arte final da guerra.');
        C(t, 'w_vigor_cap', 'Vigor Inabalável', 6, 2.5, [['w_inabalavel', 1], ['w_mestre', 1]], 'vigor', 1, 'Capstone. Ligado: cada golpe corpo a corpo cura 1,5% da vida máxima e custa 3 de mana. Sem mana, o vigor descansa.');
    })();

    /* ============================ ARQUEIRO (Arquearia) ============================ */
    (function () {
        const t = 'archer';
        P(t, 'a_root', 'Treino de Arquearia', 0, 2.5, [], 5, { dmg: 1.5 }, 'bow', 1, 'Pés firmes, olho no alvo.');
        P(t, 'a_mira', 'Mira Firme', 1, 0.5, ['a_root'], 5, { dmg: 2 }, 'target', 0, 'A flecha vai exatamente onde você olha.');
        P(t, 'a_cacador', 'Aljava Farta', 1, 2.5, ['a_root'], 5, { save: 3 }, 'quiver', 1, 'Nem toda flecha se perde.');
        P(t, 'a_leve', 'Passo Leve', 1, 4.5, ['a_root'], 4, { moveSpd: 1.5 }, 'boot', 2, 'Quem não é visto não é alvo.');
        A(t, 'a_tiro', 'Tiro Preciso', 2, 0, [['a_mira', 2]], 'aim', 0, 'Uma flecha certeira que sempre acerta em cheio (crítico garantido).');
        P(t, 'a_olho', 'Olho de Falcão', 2, 1, ['a_mira'], 5, { crit: 1.2 }, 'eye', 0, 'Nada escapa ao seu olhar.');
        P(t, 'a_rastro', 'Rastreador', 2, 2, ['a_cacador'], 4, { luck: 3 }, 'clover', 1, 'Você sempre acha o melhor despojo.');
        A(t, 'a_multi', 'Disparo Múltiplo', 2, 3, [['a_cacador', 2]], 'multi', 1, 'Solta várias flechas de uma vez em leque.');
        P(t, 'a_reflexo', 'Reflexos', 2, 4, ['a_leve'], 4, { atkSpd: 2, cdr: 1.5 }, 'speed', 2, 'Saque rápido: tiro, recarga e de novo.');
        A(t, 'a_passo', 'Passo Sombrio', 2, 5, [['a_leve', 2]], 'shadow', 2, 'Esquiva para trás num salto, ficando intocável por instantes.');
        P(t, 'a_certeiro', 'Tiro Certeiro', 3, 0, [['a_tiro', 1]], 4, { critDmg: 8 }, 'critdmg', 0, 'Quando acerta, dói.');
        P(t, 'a_afiadas', 'Flechas Afiadas', 3, 1, [['a_olho', 2]], 4, { dmg: 2.5 }, 'arrow', 0, 'Pontas amoladas à mão.');
        P(t, 'a_sobrev', 'Sobrevivente', 3, 2, [['a_rastro', 1]], 4, { maxHp: 4 }, 'heart', 1, 'A mata ensina a resistir.');
        A(t, 'a_marca', 'Marca da Presa', 3, 3, [['a_multi', 1]], 'mark', 1, 'Marca um alvo: ele sofre mais dano de você.');
        P(t, 'a_folego', 'Fôlego de Caçador', 3, 4, [['a_reflexo', 1]], 4, { hpRegen: 3 }, 'regen', 2, 'Respira fundo, recupera-se.');
        P(t, 'a_camuf', 'Camuflagem', 3, 5, [['a_passo', 1]], 5, { dr: 1.2 }, 'leaf', 2, 'Você se confunde com a mata.');
        A(t, 'a_perf', 'Flecha Perfurante', 4, 0.5, [['a_certeiro', 1], ['a_afiadas', 2]], 'pierce', 0, 'Uma flecha que atravessa todos os inimigos na linha.');
        P(t, 'a_economia', 'Aljava Infinita', 4, 2, [['a_sobrev', 2], ['a_marca', 1]], 3, { save: 4, dmg: 1.5 }, 'quiver2', 1, 'Parece que as flechas nunca acabam.');
        A(t, 'a_chuva', 'Chuva de Flechas', 4, 3, [['a_marca', 2]], 'rain', 1, 'Chove uma saraivada de flechas numa área.');
        P(t, 'a_sombra', 'Sombra Veloz', 4, 4.5, [['a_folego', 2], ['a_camuf', 1]], 3, { moveSpd: 2, dr: 1 }, 'cloak', 2, 'Um vulto entre as árvores.');
        P(t, 'a_atirador', 'Atirador de Elite', 5, 0.5, [['a_perf', 1]], 3, { crit: 2, critDmg: 6 }, 'crosshair', 0, 'Cada tiro é uma sentença.');
        P(t, 'a_rajada', 'Rajada Letal', 5, 1.5, [['a_perf', 2]], 3, { skd: 5 }, 'rage', 0, 'Suas habilidades atingem com mais força.');
        P(t, 'a_mestrecaca', 'Mestre da Caça', 5, 3.5, [['a_chuva', 1], ['a_economia', 1]], 3, { luck: 4, dmg: 3 }, 'crown', 1, 'Nenhum monstro lhe escapa.');
        P(t, 'a_fantasma', 'Predador Fantasma', 5, 4.5, [['a_sombra', 2]], 3, { lifesteal: 1, atkSpd: 2 }, 'fang', 2, 'Silêncio, e então o ataque.');
        P(t, 'a_foco', 'Foco do Caçador', 5, 2.5, [['a_chuva', 1]], 3, { cdr: 3 }, 'hourglass', 1, 'Respiração calma: a próxima habilidade vem mais cedo.');
        P(t, 'a_maestria', 'Maestria do Arco', 6, 1, [['a_foco', 1]], 3, { cdr: 4 }, 'hourglass', 0, 'O arco já é parte do seu corpo.');
        C(t, 'a_aljava_cap', 'Aljava Mágica', 6, 2.5, [['a_foco', 1], ['a_atirador', 1]], 'magquiver', 1, 'Capstone. Ligado: seus disparos de arco não gastam flechas; custam mana (2 a 6 por disparo, conforme o arco). Sem mana, volta a exigir flechas.');
    })();

    /* ============================ MAGO (Magia) ============================ */
    (function () {
        const t = 'mage';
        P(t, 'm_root', 'Treino Arcano', 0, 2.5, [], 5, { dmg: 1.5 }, 'wand', 1, 'A magia obedece a quem a estuda.');
        P(t, 'm_foco', 'Foco Arcano', 1, 0.5, ['m_root'], 5, { dmg: 2 }, 'spiral', 0, 'Você concentra mais poder em cada feitiço.');
        P(t, 'm_mana', 'Reserva Arcana', 1, 2.5, ['m_root'], 5, { maxMp: 4 }, 'drop', 1, 'Mais mana para lançar mais magias.');
        P(t, 'm_luz', 'Aura Serena', 1, 4.5, ['m_root'], 5, { maxHp: 3 }, 'heart', 2, 'Uma calma que protege o corpo.');
        A(t, 'm_fogo', 'Bola de Fogo', 2, 0, [['m_foco', 2]], 'fire', 0, 'Lança uma bola de fogo que explode no alvo.');
        P(t, 'm_poder', 'Poder Elemental', 2, 1, ['m_foco'], 5, { spellDmg: 1 }, 'flame', 0, 'Feitiços mais fortes, sempre.');
        P(t, 'm_medit', 'Meditação', 2, 2, ['m_mana'], 5, { mpRegen: 2 }, 'mpregen', 1, 'Respire. A mana volta.');
        A(t, 'm_gelo', 'Raio de Gelo', 2, 3, [['m_mana', 2]], 'ice', 1, 'Raio gélido que fere e deixa o alvo lento.');
        A(t, 'm_cura', 'Cura', 2, 4, [['m_luz', 2]], 'heal', 2, 'Cura Menor; no rank 3 vira Cura Maior.');
        P(t, 'm_veu', 'Véu Etéreo', 2, 5, ['m_luz'], 5, { dr: 1.2 }, 'veil', 2, 'Um véu de luz amortece os golpes.');
        P(t, 'm_chama', 'Chama Voraz', 3, 0, [['m_fogo', 1]], 4, { crit: 1.2 }, 'crit', 0, 'O fogo busca o ponto fraco.');
        P(t, 'm_fusao', 'Fusão Arcana', 3, 1, [['m_poder', 2]], 4, { critDmg: 8 }, 'critdmg', 0, 'Os críticos explodem em energia.');
        P(t, 'm_econ', 'Economia de Runas', 3, 2, [['m_medit', 2]], 4, { save: 3 }, 'rune', 1, 'As runas duram mais.');
        P(t, 'm_gelida', 'Alma Gélida', 3, 3, [['m_gelo', 1]], 4, { cdr: 2.5 }, 'hourglass', 1, 'A calma do gelo acelera o ritmo.');
        P(t, 'm_prece', 'Prece', 3, 4, [['m_cura', 1]], 4, { hpRegen: 3 }, 'regen', 2, 'Uma oração silenciosa que cura aos poucos.');
        P(t, 'm_sorte', 'Sorte do Mago', 3, 5, [['m_veu', 2]], 4, { luck: 3 }, 'clover', 2, 'As estrelas sorriem para você.');
        A(t, 'm_nova', 'Nova Arcana', 4, 0.5, [['m_chama', 1], ['m_fusao', 2]], 'nova', 0, 'Explosão arcana em volta de você que atinge todos perto.');
        A(t, 'm_escudo', 'Escudo Arcano', 4, 2.5, [['m_econ', 2], ['m_gelida', 1]], 'bubble', 1, 'Uma bolha de energia que absorve dano por alguns segundos.');
        P(t, 'm_ceu', 'Bênção Estelar', 4, 4.5, [['m_prece', 2], ['m_sorte', 1]], 3, { maxMp: 5, hpRegen: 2 }, 'star', 2, 'A luz das estrelas renova você.');
        P(t, 'm_arquimago', 'Arquimago', 5, 0.5, [['m_nova', 1]], 3, { dmg: 3, skd: 4 }, 'crown', 0, 'Poder digno de lendas.');
        A(t, 'm_tempest', 'Tempestade', 5, 1.5, [['m_nova', 2]], 'storm', 0, 'Invoca uma tempestade de raios sobre os inimigos.');
        P(t, 'm_sabedoria', 'Sabedoria Infinita', 5, 2.5, [['m_escudo', 1]], 3, { maxMp: 6, mpRegen: 2 }, 'book', 1, 'Conhecimento é poder... e mana.');
        P(t, 'm_lenda', 'Lenda Arcana', 5, 4.5, [['m_ceu', 1]], 3, { cdr: 3, lifesteal: 1 }, 'orb', 2, 'Seu nome ecoa pela Academia.');
        P(t, 'm_ritmo', 'Foco Sereno', 5, 3.5, [['m_escudo', 1]], 3, { cdr: 3 }, 'hourglass', 1, 'A mente calma lança no tempo certo.');
        P(t, 'm_maestria', 'Maestria Arcana', 6, 4, [['m_ritmo', 1]], 3, { cdr: 4 }, 'hourglass', 2, 'As magias obedecem antes de você terminar de pensar.');
        C(t, 'm_fonte_cap', 'Fonte Arcana', 6, 2.5, [['m_sabedoria', 1], ['m_arquimago', 1]], 'fountain', 1, 'Capstone. Ligado: suas magias básicas não gastam runas; custam mais mana. Sem mana, volta a exigir runas.');
    })();

    /* ============================ HABILIDADES DE SET (ids usados pelo servidor para validar recargas salvas) ============================ */
    const SET_IDS = ['mimic_guerreiro', 'mimic_arqueiro', 'mimic_mago', 'bronze', 'iron', 'steel', 'gold', 'mithril', 'dragonscale', 'ranger', 'dragonhide', 'mystic', 'arcane'];
    const ACTIVE_IDS = Object.keys(NODES).filter((k) => NODES[k].kind === 'a');
    const CAP_IDS = Object.keys(NODES).filter((k) => NODES[k].kind === 'c');
    const BAR_SLOTS = 4;

    /* ============================ REGRAS ============================ */
    const pointsFor = (level) => { level = Math.floor(Number(level)); return Number.isFinite(level) && level > 1 ? Math.floor((Math.min(level, 99) - 1) / 2) : 0; };
    const rankOf = (ranks, id) => (ranks && ranks[id]) | 0;
    const reqOk = (n, ranks) => n.req.every((r) => rankOf(ranks, r[0]) >= r[1]);
    const costOf = (n, rank) => n.cost * rank;
    function spentOf(ranks) { let s = 0; for (const id of Object.keys(ranks || {})) { const n = NODES[id]; if (n) s += costOf(n, ranks[id] | 0); } return s; }
    const prOn = (st, id) => { const n = NODES[id]; return !!(n && st && st.pr && st.pr[id] === 1 && rankOf(st.pts && st.pts[n.tree], id) >= n.max); };   // Prestígio da habilidade: só vale com o rank máximo
    function bonusOf(ranks, pr) {   // soma dos efeitos de passiva de UMA árvore (ranks = {id: rank}); pr = {id:1} habilidades com Prestígio (efeito em dobro)
        const o = {}; if (!ranks) return o;
        for (const id of Object.keys(ranks)) { const n = NODES[id]; if (!n || !n.eff) continue; const r = ranks[id] | 0, m = (pr && pr[id] === 1 && r >= n.max) ? 2 : 1; for (const k of Object.keys(n.eff)) o[k] = r1((o[k] || 0) + n.eff[k] * r * m); }
        return o;
    }
    function bonusAll(st) {   // soma das três árvores (st = skillTree)
        const o = {}; const out = { warrior: {}, archer: {}, mage: {} };
        for (const t of TREE_IDS) { out[t] = bonusOf(st && st.pts && st.pts[t], st && st.pr); for (const k of Object.keys(out[t])) o[k] = r1((o[k] || 0) + out[t][k]); }
        o.byTree = out; return o;
    }
    function canLearn(ranks, id, free) {   // free = pontos livres da árvore; devolve '' (pode) ou o motivo
        const n = NODES[id]; if (!n) return 'Habilidade inexistente.';
        const r = rankOf(ranks, id); if (r >= n.max) return 'Já está no nível máximo.';
        if (!reqOk(n, ranks)) return 'Aprenda antes os pré-requisitos.';
        if (free < n.cost) return 'Pontos insuficientes (custa ' + n.cost + ').';
        return '';
    }
    /* limpeza usada pelo servidor (e pelo cliente ao carregar). raw = skillTree enviado; lv = {combat, ranged, magic}; now = Date.now().
       Devolve { tree, forged, trimmed } — forged = nós inexistentes / ranks impossíveis / tipos errados (indício de edição manual); trimmed = ranks removidos por pré-requisito ou excesso de pontos. */
    function clean(raw, lv, now) {
        now = now || Date.now(); let forged = 0, trimmed = 0;
        const out = { pts: { warrior: {}, archer: {}, mage: {} }, pr: {}, bar: [], hint: false, rs: { warrior: 0, archer: 0, mage: 0 }, cd: {}, ap: { hp: 0, mp: 0 }, tg: {} };
        const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
        if (!isObj(raw)) return { tree: out, forged: raw === undefined || raw === null ? 0 : 1, trimmed };
        const rp = isObj(raw.pts) ? raw.pts : {};
        for (const t of TREE_IDS) {
            const src = isObj(rp[t]) ? rp[t] : {}, kept = {};
            for (const id of Object.keys(src)) {
                const n = Object.prototype.hasOwnProperty.call(NODES, id) ? NODES[id] : null, r = src[id];
                if (!n || n.tree !== t) { forged++; continue; }
                if (typeof r !== 'number' || !Number.isInteger(r) || r < 0 || r > n.max) { forged++; continue; }
                if (r > 0) kept[id] = r;
            }
            const sorted = (ids) => ids.sort((a, b) => NODES[a].tier - NODES[b].tier || NODES[a].lane - NODES[b].lane);
            const prune = () => {   // remove nós cujos pré-requisitos ficaram sem rank (repete até estabilizar)
                let again = true; while (again) { again = false; for (const id of sorted(Object.keys(kept))) if (!reqOk(NODES[id], kept)) { trimmed += kept[id]; delete kept[id]; again = true; } }
            };
            prune();
            const lvl = lv && Number.isFinite(lv[TREES[t].skill]) ? lv[TREES[t].skill] : 1, allowed = pointsFor(lvl);
            let guard = 0;
            while (spentOf(kept) > allowed && guard++ < 400) {   // excesso: tira dos nós mais altos primeiro
                const ids = sorted(Object.keys(kept)); if (!ids.length) break;
                const id = ids[ids.length - 1]; kept[id]--; trimmed++; if (kept[id] <= 0) delete kept[id]; prune();
            }
            out.pts[t] = kept;
        }
        const learned = (id) => { const n = NODES[id]; return !!(n && n.kind === 'a' && rankOf(out.pts[n.tree], id) > 0); };
        if (Array.isArray(raw.bar)) { const seen = new Set(); for (let i = 0; i < BAR_SLOTS; i++) { const v = raw.bar[i]; if (typeof v === 'string' && learned(v) && !seen.has(v)) { out.bar.push(v); seen.add(v); } else out.bar.push(null); } }
        else out.bar = [null, null, null, null];
        out.hint = raw.hint === true;
        if (isObj(raw.rs)) for (const t of TREE_IDS) { const v = raw.rs[t]; if (typeof v === 'number' && Number.isFinite(v)) out.rs[t] = Math.max(0, Math.min(9999, Math.floor(v))); }
        if (isObj(raw.cd)) { let n = 0; for (const id of Object.keys(raw.cd)) { if (n >= 40) break; if (!(Object.prototype.hasOwnProperty.call(NODES, id) ? NODES[id].kind === 'a' : SET_IDS.indexOf(id) >= 0)) continue; const v = raw.cd[id]; if (typeof v === 'number' && Number.isFinite(v) && v > now - 1000 && v <= now + 900000) { out.cd[id] = Math.floor(v); n++; } } }
        if (isObj(raw.tg)) for (const id of CAP_IDS) if (raw.tg[id] === true && rankOf(out.pts[NODES[id].tree], id) > 0) out.tg[id] = true;   // capstone ligado (só se aprendido)
        out.pr = {}; if (isObj(raw.pr)) for (const id of Object.keys(raw.pr)) { const n = Object.prototype.hasOwnProperty.call(NODES, id) ? NODES[id] : null; if (n && raw.pr[id] === 1) out.pr[id] = 1; }   // Prestígio: o servidor confere se foi conquistado (security.js)
        const b = bonusAll(out); out.ap = { hp: Math.round(b.maxHp || 0), mp: Math.round(b.maxMp || 0) };
        return { tree: out, forged, trimmed };
    }
    return { prOn, TREE_IDS, TREES, NODES, ORDER, EFF_LABEL, EFF_KEYS, SET_IDS, ACTIVE_IDS, CAP_IDS, BAR_SLOTS, pointsFor, rankOf, reqOk, costOf, spentOf, bonusOf, bonusAll, canLearn, clean };
});
