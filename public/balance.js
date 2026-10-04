/* MiniScape 2D — BALANCEAMENTO: fonte única da verdade (cliente E servidor).
   Carregado no navegador (window.Balance) e no servidor (require('./public/balance.js')). Nada aqui toca em DOM nem em estado do jogo.

   O que mora aqui
   - Tabela de XP do RuneScape (nível 99 = 13.034.431 XP), XP_RATE (multiplicador global de ganho) e a escala de XP por ação.
   - Vitalidade/HP, mana, regeneração e cura (itens guardam valores "brutos"; a escala nova é aplicada na hora de usar).
   - Dano do jogador em FAIXA FIXA [0,9x, 1,5x] da base, defesa, chance de acerto dos monstros e XP por dano causado/sofrido.
   - Tabela de monstros por nível (vida e dano), conversão de monstros/mundos antigos e tetos de validação do servidor.
   - Migração de contas antigas (balV = 2), idempotente.

   Ajustes rápidos: XP_RATE (env XP_RATE no servidor; window.MS_XP_RATE injetado em /balance.js), ESCALA do dano (LEVEL_POWER / RATING_W) e a tabela MOBS. */
(function (root, factory) {
    const m = factory();
    if (typeof module === 'object' && module.exports) module.exports = m; else root.Balance = m;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const VERSION = 2;
    const MAX_LEVEL = 99, MAX_XP = 200000000;

    /* ============================ XP (fórmula do RuneScape) ============================ */
    // XP total do nível L = floor( 1/4 * soma_{l=1}^{L-1} floor( l + 300 * 2^(l/7) ) )
    const XP = [0, 0];
    (function () { let pts = 0; for (let l = 1; l <= 130; l++) { pts += Math.floor(l + 300 * Math.pow(2, l / 7)); XP[l + 1] = Math.floor(pts / 4); } })();
    let XP_RATE = 0.65;  // multiplicador global dos ganhos (1 = ritmo puro do RuneScape). 0,65 = ritmo "longa jornada": ~300 h até o 99 de uma perícia de combate (sem VIP)
    try { if (typeof process !== 'undefined' && process.env && +process.env.XP_RATE > 0) XP_RATE = +process.env.XP_RATE; } catch (e) { }
    try { if (typeof globalThis !== 'undefined' && +globalThis.MS_XP_RATE > 0) XP_RATE = +globalThis.MS_XP_RATE; } catch (e) { }
    XP_RATE = Math.max(0.1, Math.min(50, XP_RATE));
    const xpForLevel = (L) => { L = Math.floor(Number(L)); if (!(L > 1)) return 0; return XP[Math.min(L, 126)]; };
    function levelForXp(xp) {
        xp = Number(xp); if (!(xp > 0)) return 1; let lo = 1, hi = MAX_LEVEL;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (XP[mid] <= xp) lo = mid; else hi = mid - 1; }
        return lo;
    }
    const xpNext = (L) => xpForLevel(Math.min(MAX_LEVEL, Math.max(1, Math.floor(L) || 1) + 1));   // XP total do próximo nível (no 99 fica no próprio 99)
    function skillFromXp(xp) { xp = Math.max(0, Math.min(MAX_XP, Math.floor(Number(xp)) || 0)); const level = levelForXp(xp); return { level, xp, next: xpNext(level) }; }
    function progress(sk) {   // {level, cur, need, pct} para barras de XP
        const level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(sk && sk.level) || 1)), xp = Math.max(0, Number(sk && sk.xp) || 0);
        if (level >= MAX_LEVEL) return { level, cur: 0, need: 0, pct: 100, total: xp, next: xpForLevel(MAX_LEVEL) };
        const a = xpForLevel(level), b = xpForLevel(level + 1); return { level, cur: Math.max(0, xp - a), need: b - a, pct: Math.max(0, Math.min(100, (xp - a) / (b - a) * 100)), total: xp, next: b };
    }

    /* Ganho de XP por AÇÃO (ofícios): os valores do código são "base RS"; addXP multiplica por XP_RATE e por tierScale(nível).
       tierScale simula recursos melhores a cada faixa de nível (o jogo tem poucos tipos de árvore/rocha/peixe): 1 no nível 1, ~2,8 no 99. */
    const TIER_K = 0.018;
    const tierScale = (L) => 1 + TIER_K * (Math.max(1, Math.min(MAX_LEVEL, Math.floor(L) || 1)) - 1);
    const COMBAT_SKILLS = ['combat', 'ranged', 'magic', 'hp', 'defence'];
    const isCombatSkill = (k) => COMBAT_SKILLS.indexOf(k) >= 0;
    const XP_PER_DMG = 0.09;        // XP base por ponto de dano CAUSADO na perícia usada (antes de XP_RATE): ~0,058 com XP_RATE 0,65
    const TAKEN_XP = 0.80;          // XP base por ponto de dano SOFRIDO, para Vitalidade e para Defesa (cada uma), antes de XP_RATE
    const craftXp = (units, k) => Math.round((18 + 7 * Math.max(1, units)) * Math.max(1, k || 1));   // Artesanato: depende do tamanho da receita

    /* ============================ HP, MANA E REGENERAÇÃO ============================ */
    const HP_BASE = 100, HP_PER_LEVEL = 10, MP_BASE = 50, MP_PER_LEVEL = 5, MIN_MP = 30;
    const CLASS_BONUS = { warrior: { hp: 30, mp: 0 }, archer: { hp: 0, mp: 0 }, mage: { hp: 0, mp: 40 } };
    const RACE_BONUS = { human: { hp: 0, mp: 0 }, elf: { hp: 0, mp: 20 }, dwarf: { hp: 40, mp: 0 }, orc: { hp: 20, mp: -10 } };
    const lv1 = (v) => Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(v)) || 1));
    const maxHpForLevel = (vit) => HP_BASE + HP_PER_LEVEL * (lv1(vit) - 1);
    const maxMpForLevel = (mag) => MP_BASE + MP_PER_LEVEL * (lv1(mag) - 1);
    const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const clsB = (c) => (typeof c === 'string' && own(CLASS_BONUS, c)) ? CLASS_BONUS[c] : { hp: 0, mp: 0 };
    const raceB = (r) => (typeof r === 'string' && own(RACE_BONUS, r)) ? RACE_BONUS[r] : { hp: 0, mp: 0 };
    function maxHp(vit, cls, race, tree) { return Math.max(1, maxHpForLevel(vit) + clsB(cls).hp + raceB(race).hp + (Number(tree) || 0)); }
    function maxMp(mag, cls, race, tree) { return Math.max(MIN_MP, maxMpForLevel(mag) + clsB(cls).mp + raceB(race).mp + (Number(tree) || 0)); }
    const hpRegenTick = (mx) => Math.max(1, Math.round((Number(mx) || 100) * 0.02));   // a cada 5 s (300 quadros): 2% da vida máxima
    const MP_REGEN_FLAT = 1.25;                                                       // por segundo, além de 0,6% da mana máxima
    const HEAL_MULT = 10, MP_MULT = 5;                                                // itens guardam valores "brutos"; a escala nova vale na hora de usar
    const healOf = (raw) => { raw = Number(raw); return raw > 0 ? Math.round(raw * HEAL_MULT) : 0; };
    const mpOf = (raw) => { raw = Number(raw); return raw > 0 ? Math.round(raw * MP_MULT) : 0; };
    const FLAT_HP = 10, FLAT_MP = 5;   // constantes antigas em vida/mana (barreiras, bônus da árvore)

    /* ============================ DANO DO JOGADOR (faixa fixa) ============================ */
    // base = poder_do_nível(L) x (1 + 0,04 x poder_da_arma). Dano = inteiro uniforme em [0,9 x base, 1,5 x base]. Poder da arma = bonusDmg (+ munição/magia/poções).
    const LEVEL_POWER = (L) => { L = lv1(L); return 8.5 + 0.5 * L + 0.011 * L * L; };
    const RATING_W = 0.05, LO = 0.9, HI = 1.5;
    const weaponMult = (rating) => 1 + RATING_W * Math.max(0, Number(rating) || 0);
    const dmgBase = (level, rating) => LEVEL_POWER(level) * weaponMult(rating);
    const rangeOf = (base) => { const lo = Math.max(1, Math.floor(base * LO)); return { base, lo, hi: Math.max(lo + 1, Math.ceil(base * HI)) }; };
    function playerDmgRange(level, rating, style) { return rangeOf(dmgBase(level, rating)); }   // style ('melee'|'ranged'|'magic') só documenta: todas usam a mesma fórmula
    function rollDmg(range, rnd) { const r = rnd || Math.random; return range.lo + Math.floor(r() * (range.hi - range.lo + 1)); }
    const avgOf = (range) => (range.lo + range.hi) / 2;

    /* ============================ DEFESA ============================ */
    const ARMOR_W = 4, DEF_K = 60, DEF_K_LVL = 2, RED_CAP = 0.8;   // reducao = R/(R+K), K = 60 + 2 x nivel do monstro (monstro mais forte atravessa melhor a armadura)
    const defRating = (defLevel, armor, buff) => Math.max(0, (Number(defLevel) || 1) + ARMOR_W * (Math.max(0, Number(armor) || 0) + Math.max(0, Number(buff) || 0)));
    const dmgReduction = (R, mobLevel) => { R = Math.max(0, Number(R) || 0); const K = DEF_K + DEF_K_LVL * (Number(mobLevel) > 0 ? Number(mobLevel) : 30); return Math.min(RED_CAP, R / (R + K)); };
    const mobHitChance = (mobLevel, defLevel) => Math.max(0.5, Math.min(0.97, 0.8 + 0.02 * ((Number(mobLevel) || 1) - (Number(defLevel) || 1))));
    const combatLevel = (sk) => { const g = (k) => lv1(sk && sk[k] && sk[k].level); return Math.round(0.5 * Math.max(g('combat'), g('ranged'), g('magic')) + 0.25 * (g('defence') + g('hp'))); };
    function relevance(mobLevel, cmbLevel) {   // dano sofrido de monstros muito fracos rende menos XP de Defesa/Vitalidade
        mobLevel = Number(mobLevel) || 1; cmbLevel = Math.max(1, Number(cmbLevel) || 1);
        if (mobLevel >= cmbLevel) return 1; const r = mobLevel / cmbLevel; if (r < 0.5) return 0.25; return 0.25 + (r - 0.5) / 0.5 * 0.75;
    }
    // dano de monstros ACIMA do nível do jogador sobe 4% por nível de diferença (mob +20 níveis = x1,8; teto x3,5); abaixo, cai (mob -10 níveis = x0,6, piso x0,5). Nível igual = tabela pura.
    const levelEdge = (mobLevel, cmbLevel) => Math.max(0.5, Math.min(3.5, 1 + 0.04 * ((Number(mobLevel) || 1) - Math.max(1, Number(cmbLevel) || 1))));
    const xpFromDealt = (dmg) => Math.max(0, Number(dmg) || 0) * XP_PER_DMG;
    // XP de Defesa/Vitalidade por dano sofrido; xpRatio = xpBase/vida do monstro (padrão = XP_PER_DMG): monstro de XP alto rende mais XP defensivo (fator limitado a 0 a 100)
    function damageTakenXp(dmg, mobLevel, cmbLevel, xpRatio) { const k = xpRatio > 0 ? Math.min(100, xpRatio / XP_PER_DMG) : 1, v = Math.max(0, Number(dmg) || 0) * TAKEN_XP * relevance(mobLevel, cmbLevel) * k; return { hp: v, defence: v }; }

    // requisitos de nível de itens/receitas: os níveis antigos iam até ~30; a escala nova vai até 99 (x2), alinhada com os monstros por nível
    const reqLevel = (l) => { l = Math.floor(Number(l)) || 1; return l <= 1 ? 1 : Math.min(MAX_LEVEL, l * 2); };

    /* ============================ MONSTROS ============================ */
    // Nível N tem vida = (golpes para matar) x dano médio de um jogador de nível N com equipamento típico; dano tal que o jogador típico morra em "ttd" ataques.
    const TIERS = {
        critter: { hits: 2.5, ttd: 0 }, trash: { hits: 3, ttd: 24 }, light: { hits: 5, ttd: 18 }, common: { hits: 7, ttd: 15 },
        elite: { hits: 14, ttd: 10 }, boss: { hits: 30, ttd: 7 }, raid: { hits: 60, ttd: 6 }, world: { hits: 250, ttd: 6 }
    };
    const typRating = (L) => 4 + 0.22 * L;                 // poder de arma típico no nível L
    const typArmor = (L) => 6 + 0.34 * L;                  // defBonus total equipado típico no nível L
    const typDefR = (L) => defRating(L, typArmor(L), 0);
    const playerHp = (L) => maxHpForLevel(L);
    const ATTACK_CHANCE_REF = 0.8;                         // chance de acerto do monstro contra jogador do mesmo nível
    const nice = (v) => { if (v < 200) return Math.round(v / 5) * 5; if (v < 1000) return Math.round(v / 10) * 10; if (v < 5000) return Math.round(v / 50) * 50; if (v < 20000) return Math.round(v / 100) * 100; return Math.round(v / 500) * 500; };
    function mobTable(level, tier) {
        level = lv1(level); const T = TIERS[tier] || TIERS.common;
        const avg = avgOf(rangeOf(dmgBase(level, typRating(level))));
        const hp = Math.max(10, nice(T.hits * avg));
        let dmin = 0, dmax = 0, dAvg = 0;
        if (T.ttd > 0) { dAvg = playerHp(level) / (T.ttd * (1 - dmgReduction(typDefR(level), level)) * ATTACK_CHANCE_REF); const r = rangeOf(dAvg / 1.2); dmin = r.lo; dmax = r.hi; }
        return { level, tier: T === TIERS[tier] ? tier : 'common', hp, dmin, dmax, avg: dAvg, hits: T.hits, ttd: T.ttd, playerAvg: avg };
    }
    // chave -> [nível, camada]. Nível sugerido do mapa em comentário (README). Monotônico com a distância de Aldeburgo.
    const MOBS = {
        rabbit_base: [1, 'critter'], chicken_base: [1, 'critter'], sheep_base: [2, 'critter'], cow_base: [2, 'critter'], pig_base: [2, 'critter'], deer_base: [5, 'critter'],   // animais de recurso (não atacam)
        rat_base: [2, 'trash'], bat_base: [3, 'trash'], slime_base: [3, 'light'], goblin_base: [4, 'light'], snake_base: [5, 'light'],                                          // Aldeburgo / Campos 1-5
        wolf_base: [7, 'common'], boar_base: [7, 'common'], spider_base: [9, 'common'], salt_slime: [9, 'light'], orc_base: [10, 'common'], ghost_base: [10, 'common'],           // Floresta, Trilha 6-10, Praia 9-14
        swamp_snake: [11, 'common'], skeleton_base: [12, 'common'], bog_slime: [12, 'light'], marsh_wisp: [13, 'common'], drowned: [14, 'common'], goblin_brute: [14, 'common'], // Pântano 10-16, Covil goblins
        forest_wisp: [15, 'common'], darkmage_base: [16, 'common'], dune_snake: [16, 'common'], venom_spider: [17, 'common'], dire_wolf: [18, 'common'],                      // Silvaluz 12-20, Deserto 14-22
        sand_skeleton: [20, 'common'], grave_ghost: [22, 'common'], zombie: [24, 'common'], ice_bat: [24, 'common'],                                                         // Cemitério 18-28, Passo Gelado 22-32
        sand_wraith: [28, 'common'], frost_wolf: [30, 'common'], skeleton_knight: [32, 'common'], frost_ghost: [33, 'common'], crypt_knight: [36, 'elite'], apprentice: [36, 'common'], // Ruínas 28-45, Vale Gelado 32-55, Cripta 30-70
        necromancer: [40, 'elite'], dark_knight: [44, 'elite'], ash_bat: [47, 'common'], ember_skeleton: [49, 'elite'],                                                     // Fortaleza 38-60, Vulcão 45-65
        whelp_base: [16, 'elite'], troll_base: [20, 'boss'], goblin_chief: [22, 'boss'], golem_base: [24, 'boss'], ent_elder: [26, 'boss'], sand_golem: [30, 'boss'],      // chefes de área (mina, covil, silvaluz, deserto)
        troll_elder: [38, 'boss'], dragon_boss: [40, 'boss'], ice_golem: [42, 'boss'], mummy_king: [43, 'boss'], arcane_golem: [45, 'boss'], fire_whelp: [46, 'elite'],
        lich_boss: [48, 'boss'], frost_giant: [52, 'boss'], lava_golem: [54, 'boss'], forgotten_king: [55, 'boss'], mad_mage: [58, 'boss'], warlord: [58, 'boss'], drake: [62, 'boss'],
        black_dragon: [78, 'raid'], wboss_golem: [50, 'world']
    };
    function legacyLevel(def) {   // criatura que não está na tabela (criada no editor): estima o nível pelo dano máximo antigo
        const mh = Number(def && def.maxHit) || 0, hp = Number(def && def.hp) || 0;
        return Math.max(1, Math.min(99, Math.round(Math.max(2.2 * mh, hp / 20))));
    }
    function mobSpec(key, def) {
        let lvl, tier; const e = typeof key === 'string' && own(MOBS, key) ? MOBS[key] : null;
        if (e) { lvl = e[0]; tier = e[1]; }
        else { lvl = legacyLevel(def); const g = def && def.group; tier = !(def && def.maxHit > 0) ? 'critter' : g === 'chefe' ? 'boss' : lvl < 6 ? 'light' : 'common'; }
        return mobTable(lvl, tier);
    }
    /* ---- Definição de criatura (editor DEV): o que o admin digita MANDA ----
       HP final = HP base (hpBase) + HP por nível (hpLvl) x nível. hpLvl padrão: 10 (comum) ou 100 (grupo 'chefe'); 0 vale. Nível 0/vazio = só o HP base.
       Dano base = hit + hitLvl x nível; golpe sorteado em [0,9 x base, 1,5 x base]. XP base (xp) = XP total que a criatura "vale": ver mobXpFor.
       Só as criaturas padrão do jogo (sem def.adm) usam a tabela por nível (MOBS). def.hp é SEMPRE o HP final (todo o resto do jogo lê def.hp). */
    const MOB_HP_LVL = 10, BOSS_HP_LVL = 100, MAX_MOB_HP = 2000000, MAX_MOB_XP = 10000000;
    const hpPerLevel = (def) => { const v = def && def.hpLvl; if (typeof v === 'number' && isFinite(v) && v >= 0) return v; return def && def.group === 'chefe' ? BOSS_HP_LVL : MOB_HP_LVL; };
    function mobHp(def) {   // HP final da criatura (0 = NPC, sem vida)
        if (!def) return 0;
        if (!(typeof def.hpBase === 'number' && isFinite(def.hpBase))) return Math.max(0, Number(def.hp) || 0);
        if (!(def.hpBase > 0)) return 0;
        const lvl = Math.max(0, Math.min(999, Math.floor(Number(def.level)) || 0));
        return Math.max(1, Math.min(MAX_MOB_HP, Math.round(def.hpBase + hpPerLevel(def) * lvl)));
    }
    const defaultXp = (hp) => Math.max(1, Math.round((Number(hp) || 0) * XP_PER_DMG));   // XP base padrão de quem não tem XP definido: 0,09 por ponto de vida
    function mobXpBase(def, hp) { const x = Number(def && def.xp); return x > 0 ? Math.min(MAX_MOB_XP, x) : defaultXp(hp > 0 ? hp : mobHp(def) || (def && def.hp)); }
    // XP de combate de UM golpe: xpBase x (dano efetivo / vida máxima final). Dano efetivo = limitado à vida restante (sem overkill). XP 1000 e vida 1000 = 1 XP por 1 HP tirado.
    function mobXpFor(def, dealt, maxHp, hpLeft) {
        let d = Math.max(0, Number(dealt) || 0); if (hpLeft !== undefined && hpLeft !== null) d = Math.min(d, Math.max(0, Number(hpLeft) || 0));
        const mh = Number(maxHp) > 0 ? Number(maxHp) : (mobHp(def) || Number(def && def.hp) || 0); if (!(mh > 0) || !(d > 0)) return 0;
        return mobXpBase(def, mh) * Math.min(1, d / mh);
    }
    const xpPerHp = (def, maxHp) => { const mh = Number(maxHp) > 0 ? Number(maxHp) : (mobHp(def) || Number(def && def.hp) || 0); return mh > 0 ? mobXpBase(def, mh) / mh : XP_PER_DMG; };
    function admDamage(def) {   // dano da definição do admin: base = hit + hitLvl x nível; faixa [0,9x, 1,5x]
        if (!(typeof def.hit === 'number' && isFinite(def.hit))) return false;
        const lvl = Math.max(0, Math.min(999, Math.floor(Number(def.level)) || 0)), B = Math.max(0, def.hit) + Math.max(0, Number(def.hitLvl) || 0) * lvl;
        let lo = 0, hi = 0; if (B > 0) { lo = Math.max(1, Math.floor(B * LO)); hi = Math.max(lo, Math.ceil(B * HI)); }
        def.dmin = lo; def.dmax = hi; def.maxHit = hi; return true;
    }
    // idempotente: pode rodar a cada carga/salvamento. Devolve true se mudou algo.
    function applyMob(key, def) {
        if (!def || typeof def !== 'object') return false;
        if (def.group === 'npc' || def.behavior === 'npc') return false;
        if (!(def.hp > 0) && !(def.hpBase > 0)) return false;
        const before = JSON.stringify([def.hp, def.hpBase, def.hpLvl, def.dmin, def.dmax, def.maxHit, def.xp, def.level, def.balV, def.adm]);
        const inTable = typeof key === 'string' && own(MOBS, key);
        if (def.adm) { /* definida pelo admin: vale o que ele digitou */ }
        else if (typeof def.hpBase === 'number' && isFinite(def.hpBase)) { /* já migrada */ }
        else if (inTable && !(def.balV >= VERSION)) {   // criatura padrão do jogo: tabela por nível
            const s = mobSpec(key, def);
            def.level = s.level; def.tier = s.tier; def.hp = s.hp; def.hpBase = s.hp; def.hpLvl = 0; def.dmin = s.dmin; def.dmax = s.dmax; def.maxHit = s.dmax; def.hit = s.dmax > 0 ? Math.round(s.avg / 1.2) : 0; def.balV = VERSION;
        } else if (def.balV >= VERSION) { def.hpBase = def.hp; if (!(typeof def.hpLvl === 'number')) def.hpLvl = 0; }   // já balanceada antes (vida final): preserva
        else { def.hpBase = def.hp; def.adm = true; def.balV = VERSION; }                                              // criada/ajustada pelo admin antes do v2: o que ele digitou vale como base
        if (!def.adm && inTable) def.xp = defaultXp(def.hp);   // XP base da criatura padrão: coerente com a vida da tabela
        if (typeof def.hpBase === 'number') def.hp = mobHp(def);
        if (def.adm) admDamage(def);
        return before !== JSON.stringify([def.hp, def.hpBase, def.hpLvl, def.dmin, def.dmax, def.maxHit, def.xp, def.level, def.balV, def.adm]);
    }
    function applyNpcDB(db) { let n = 0; if (!db || typeof db !== 'object') return 0; for (const k of Object.keys(db)) if (applyMob(k, db[k])) n++; return n; }
    // entidades inimigas do mundo carregam hp/maxHp copiados do catálogo: alinha com a definição já balanceada
    function applyWorld(worlds, db) {
        let n = 0; if (!worlds || typeof worlds !== 'object' || !db) return 0;
        for (const mk of Object.keys(worlds)) { const m = worlds[mk]; if (!m || !Array.isArray(m.entities)) continue;
            for (const o of m.entities) { if (!o || o.type !== 'enemy' || typeof o.dbKey !== 'string') continue; const d = own(db, o.dbKey) ? db[o.dbKey] : null; let hp = 0;
                if (d && d.hp > 0 && d.balV >= VERSION) hp = d.hp; else if (!d && own(MOBS, o.dbKey)) hp = mobSpec(o.dbKey, null).hp;
                if (hp > 0 && o.maxHp !== hp) { o.maxHp = hp; o.hp = hp; n++; } } }
        return n;
    }
    function mobDamage(def, rnd) {   // dano bruto de um golpe do monstro (antes da defesa); 0 se não ataca
        if (!def) return 0; let lo = def.dmin, hi = def.dmax;
        if (!(hi > 0)) { const mh = Number(def.maxHit) || 0; if (!(mh > 0)) return 0; hi = mh; lo = Math.max(1, Math.floor(mh * 0.6)); }
        if (!(lo >= 0)) lo = Math.floor(hi * 0.6); const r = rnd || Math.random; return lo + Math.floor(r() * (hi - lo + 1));
    }
    function mobLevelOf(def) { if (!def) return 1; if (def.level > 0) return def.level; return legacyLevel(def); }

    /* ============================ TETOS DO SERVIDOR (generosos: nunca punir jogo limpo) ============================ */
    const ratingMax = (L) => Math.min(34, 6 + 0.4 * lv1(L));
    // maior golpe teórico de um acerto: faixa máxima (melhor arma do nível) x habilidade (até x4,2) x bônus % da árvore (até x2,2) x crítico (1,5 + até 200%) x conjunto/marca/pet (x1,3 x1,5)
    const critMax = (L) => 1.5 + Math.min(2, 0.02 * lv1(L));
    const hitCap = (L) => { L = lv1(L); const skill = L < 5 ? 1 : 4.2, pct = 1 + Math.min(1.2, 0.025 * Math.floor((L - 1) / 2)); return Math.ceil(rangeOf(dmgBase(L, ratingMax(L))).hi * skill * pct * critMax(L) * 1.3 * 1.5); };   // habilidades ativas só existem a partir do nível 5 (2 pontos); dano % da árvore cresce com os pontos
    const dmgPerSecCap = (L) => Math.ceil(hitCap(L) * 3.3);   // orçamento de dano por segundo no servidor
    const clientSkillPerSec = (L) => Math.round(dmgPerSecCap(L) * 0.4);   // o próprio cliente limita a fila de habilidades bem abaixo disso
    const MAX_TREE_HP = 3000, MAX_TREE_MP = 1500;           // limite de segurança dos bônus da árvore se o servidor não souber calcular
    const maxHpAllowed = (vit, tree) => HP_BASE + HP_PER_LEVEL * (lv1(vit) - 1) + 70 + Math.max(0, Number(tree) || 0) + 40;
    const maxMpAllowed = (mag, tree) => MP_BASE + MP_PER_LEVEL * (lv1(mag) - 1) + 60 + Math.max(0, Number(tree) || 0) + 40;
    // XP por minuto por perícia que o servidor aceita (orçamento do balde): base para "player"; VIPs ganham 2x/4x de XP no jogo
    const XP_BUDGET = { perMin: 70000, cap: 500000 };
    /* VIP MODESTO (sem pay-to-win): só um empurrãozinho de XP (+10% Light, +15% Full; admin = Full). Drop, velocidade e dano NÃO mudam com VIP; o resto do VIP é conveniência/cosmético (cor e [VIP] no chat). */
    const VIP_XP = { vip_light: 1.10, vip_full: 1.15, admin: 1.15 };
    const roleXpMul = (role) => (typeof role === 'string' && Object.prototype.hasOwnProperty.call(VIP_XP, role)) ? VIP_XP[role] : 1;
    /* Impulso de iniciante: as primeiras horas são mais rápidas (x1,6 no nível 1, caindo linear até x1,0 no nível 30) para o jogador não sentir o ritmo longo logo de cara. */
    const earlyMul = (L) => 1 + 0.6 * Math.max(0, Math.min(1, (30 - lv1(L)) / 29));
    /* Bônus de eventos (Lua Cheia etc.) nunca passam de +10% somados; maestria/engajamento ficam em engage.js. */
    const EVENT_XP_CAP = 1.10;

    /* ============================ MIGRAÇÃO (contas antigas -> balV 2) ============================ */
    const SKILL_NAMES = { hp: 'Health', combat: 'Combat', defence: 'Defence', ranged: 'Ranged', magic: 'Magic', prayer: 'Prayer', woodcutting: 'Woodcut', mining: 'Mining', smithing: 'Smithing', firemaking: 'Firemk', cooking: 'Cooking', crafting: 'Crafting', fishing: 'Fishing', farming: 'Farming', alchemy: 'Alchemy', enchanting: 'Enchant' };
    const SKILL_KEYS = Object.keys(SKILL_NAMES);
    function convertOld(level, xp, next) {   // mesmo nível, mesma fração de progresso dentro do nível
        const L = lv1(level); if (L >= MAX_LEVEL) return xpForLevel(MAX_LEVEL);
        const lo = xpForLevel(L), hi = xpForLevel(L + 1), nx = Number(next) > 0 ? Number(next) : 0;
        const frac = nx > 0 ? Math.max(0, Math.min(0.999, (Number(xp) || 0) / nx)) : 0; return lo + Math.floor(frac * (hi - lo));
    }
    /* opts.tree(skillTree) -> {hp, mp}: bônus de vida/mana da árvore na escala nova (o servidor passa SkillNodes.bonusAll). Devolve o próprio pd. */
    function migratePlayer(pd, opts) {
        if (!pd || typeof pd !== 'object' || pd.balV >= VERSION) return pd;
        const st = pd.stats = (pd.stats && typeof pd.stats === 'object' && !Array.isArray(pd.stats)) ? pd.stats : {};
        const sk = st.skills = (st.skills && typeof st.skills === 'object' && !Array.isArray(st.skills)) ? st.skills : {};
        for (const key of Object.keys(sk)) {
            const s = sk[key]; if (!s || typeof s !== 'object' || !own(SKILL_NAMES, key)) continue;
            const xp = convertOld(s.level, s.xp, s.next), f = skillFromXp(xp); sk[key] = { level: f.level, xp: f.xp, next: f.next, name: SKILL_NAMES[key] };
        }
        if (!sk.defence) { const cl = sk.combat ? lv1(sk.combat.level) : 1; const f = skillFromXp(xpForLevel(cl)); sk.defence = { level: f.level, xp: f.xp, next: f.next, name: 'Defence' }; }   // antes a defesa vinha do nível de Combate
        const hpL = sk.hp ? lv1(sk.hp.level) : 1, mgL = sk.magic ? lv1(sk.magic.level) : 1; let t = { hp: 0, mp: 0 };
        try { if (opts && typeof opts.tree === 'function' && pd.skillTree && typeof pd.skillTree === 'object') t = opts.tree(pd.skillTree, { combat: sk.combat ? lv1(sk.combat.level) : 1, ranged: sk.ranged ? lv1(sk.ranged.level) : 1, magic: mgL }) || t; } catch (e) { }
        t = { hp: Math.max(0, Math.round(t.hp || 0)), mp: Math.max(0, Math.round(t.mp || 0)) };
        if (pd.skillTree && typeof pd.skillTree === 'object') pd.skillTree.ap = { hp: t.hp, mp: t.mp };
        const race = pd.race || (pd.look && pd.look.race);
        st.maxHp = maxHp(hpL, pd.cls, race, t.hp); st.hp = st.maxHp; st.maxMp = maxMp(mgL, pd.cls, race, t.mp); st.mp = st.maxMp;
        pd.balV = VERSION; return pd;
    }

    /* ============================ TEXTO ============================ */
    const fmtNum = (n) => { n = Math.round(Number(n) || 0); return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
    function fmtK(n) {   // números flutuantes: 12.345 -> "12,3k"
        n = Math.round(Number(n) || 0); const a = Math.abs(n);
        if (a < 10000) return String(n);
        if (a < 1e6) { const v = Math.round(a / 100) / 10; return (n < 0 ? '-' : '') + String(v).replace('.', ',') + 'k'; }
        return (n < 0 ? '-' : '') + String(Math.round(a / 1e5) / 10).replace('.', ',') + 'M';
    }
    // descrições antigas citam "Cura 40 HP" / "Restaura 15 MP": troca pelos valores novos
    function fixDesc(s) {
        if (typeof s !== 'string' || !s) return s;
        return s.replace(/\b(Cura|Curou|Recupera)\s+(\d+)\s*HP/g, (m, a, n) => a + ' ' + healOf(+n) + ' HP').replace(/\b(Restaura|Restaurou)\s+(\d+)\s*MP/g, (m, a, n) => a + ' ' + mpOf(+n) + ' MP')
            .replace(/\+(\d+)\s+de dano por/g, (m, n) => '+' + Math.round(RATING_W * 100 * +n) + '% de dano por').replace(/\+(\d+)\s+de defesa por/g, (m, n) => '+' + (ARMOR_W * +n) + ' de defesa por');
    }

    return {
        VERSION, MAX_LEVEL, MAX_XP, XP_RATE, XP, xpForLevel, levelForXp, xpNext, skillFromXp, progress, tierScale, TIER_K, isCombatSkill, COMBAT_SKILLS, XP_PER_DMG, TAKEN_XP, craftXp,
        HP_BASE, HP_PER_LEVEL, MP_BASE, MP_PER_LEVEL, MIN_MP, CLASS_BONUS, RACE_BONUS, maxHpForLevel, maxMpForLevel, maxHp, maxMp, hpRegenTick, MP_REGEN_FLAT, HEAL_MULT, MP_MULT, healOf, mpOf, FLAT_HP, FLAT_MP,
        LEVEL_POWER, RATING_W, LO, HI, weaponMult, dmgBase, rangeOf, playerDmgRange, rollDmg, avgOf,
        ARMOR_W, DEF_K, RED_CAP, defRating, dmgReduction, mobHitChance, levelEdge, combatLevel, relevance, xpFromDealt, damageTakenXp,
        reqLevel, TIERS, MOBS, typRating, typArmor, typDefR, mobTable, mobSpec, legacyLevel, MOB_HP_LVL, BOSS_HP_LVL, MAX_MOB_HP, MAX_MOB_XP, hpPerLevel, mobHp, defaultXp, mobXpBase, mobXpFor, xpPerHp, admDamage, applyMob, applyNpcDB, applyWorld, mobDamage, mobLevelOf,
        ratingMax, critMax, hitCap, dmgPerSecCap, clientSkillPerSec, MAX_TREE_HP, MAX_TREE_MP, maxHpAllowed, maxMpAllowed, XP_BUDGET, roleXpMul, VIP_XP, earlyMul, EVENT_XP_CAP,
        SKILL_NAMES, SKILL_KEYS, convertOld, migratePlayer, fmtNum, fmtK, fixDesc
    };
});
