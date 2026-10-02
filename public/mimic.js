/* MiniScape 2D — Itens Mímicos: equipamentos vivos que evoluem com o personagem.
   Três sets (Guerreiro 6 peças, Arqueiro 5, Mago 5): capacete/capuz/chapéu, armadura/gibão/manto, arma, escudo (só guerreiro), anel e amuleto.
   - Cada peça tem estado próprio em player.mimic[nome] = { lvl 1..50, xp, skin? } (uma peça de cada nome por conta). Os atributos escalam com o nível e entram em
     Stats.addSource('mimic', ...) enquanto a peça estiver equipada; defesa e dano base são gravados no próprio item (defBonus / bonusDmg) para o resto do jogo.
   - XP desviado: player.mimicPct (0..100, padrão 0). De todo XP ganho em qualquer perícia, X% vai para os Mímicos equipados (divididos igualmente entre as peças abaixo do
     nível 50) e o jogador fica com (100-X)%. Restos de arredondamento se acumulam (nada se perde nem se duplica).
   - Set: parcial (2+ peças) dá o bônus base × peças/total; completo dá o bônus cheio + marcos (nível médio 10/25/50). Escala com o nível médio das peças.
   - Ligados à conta: não vão ao mercado/troca (cliente e servidor), não se desmancham, não se encantam nem se jogam fora; o banco aceita.
   - EXCLUSIVOS DO ADMIN: sem drops e sem receita. Só chegam por presente (DEV > Presentes) ou recompensa de Missão Especial, sempre pelo correio.
   - Aparência: 4 estágios visuais por nível da peça (1, 10, 25, 50) e skins (Violeta, Dourado, Carmesim, Gelo, Sombra, Esmeralda por nível; Aurora e Eclipse só por presente).
     A escolha fica em player.mimic[nome].skin (o servidor valida) e é vista pelos outros jogadores.
   API: Mimic.setPct(n) · Mimic.addXp(nome, n) · Mimic.setSkin(nome, skin) · Mimic.setSkinAll(classe, skin) · Mimic.bonus() · Mimic.state() · Mimic.open()/close() (tecla N) · Mimic.PIECES */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const rnd = () => Math.random();
    const MAXLVL = 50, XP_BASE = 50, XP_GROW = 1.11;
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const say = (t, c) => { try { setActionText(t, c || '#c58bff'); } catch (e) { } };
    const sfx = (n) => { try { window.Sfx && Sfx.play(n); } catch (e) { } };
    const sr = (v) => { const f = Math.floor(v); return f + (rnd() < v - f ? 1 : 0); };
    const r1 = (v) => Math.round(v * 10) / 10;
    const fnum = (v) => String(r1(v)).replace('.', ',');
    const clampI = (v, a, b, d) => { v = Math.floor(Number(v)); return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };
    const gameOn = () => typeof player !== 'undefined' && player && player.stats && player.equipment && $('game-wrapper') && $('game-wrapper').style.display !== 'none';
    const need = (l) => Math.round(XP_BASE * Math.pow(XP_GROW, l - 1));

    /* ============================ DADOS ============================ */
    const CLS = {
        guerreiro: { name: 'Mímico do Guerreiro', short: 'Guerreiro', skill: 'combat', col: '#7a44b8', gold: '#e8b93c', ico: '⚔️' },
        arqueiro: { name: 'Mímico do Arqueiro', short: 'Arqueiro', skill: 'ranged', col: '#9a4aa8', gold: '#e8b93c', ico: '🏹' },
        mago: { name: 'Mímico do Mago', short: 'Mago', skill: 'magic', col: '#5d5fd6', gold: '#f0d060', ico: '🪄' }
    };
    const CLS_IDS = Object.keys(CLS);
    const SLOTS = ['head', 'body', 'weapon', 'shield', 'amulet', 'ring'];
    // st: atributo -> [no nível 1, no nível 50]
    const P = (cls, n, slot, icon, desc, st, extra) => Object.assign({ cls, n, slot, icon, desc, st }, extra || {});
    const LIST = [
        P('guerreiro', 'Elmo Mímico do Guerreiro', 'head', '⛑️', 'Um elmo que pisca quando ninguém olha.', { defBonus: [2, 16], dr: [0.5, 3] }, { hat: 'helmet', w: 2.0 }),
        P('guerreiro', 'Peitoral Mímico do Guerreiro', 'body', '🦺', 'Armadura viva: range os dentes a cada golpe que você recebe.', { defBonus: [4, 30], dr: [1, 5] }, { w: 6.0 }),
        P('guerreiro', 'Espada Mímica do Guerreiro', 'weapon', '🗡️', 'Lâmina faminta: quanto mais você luta, mais afiada ela fica.', { bonusDmg: [5, 26], crit: [1, 5], critDmg: [0, 25] }, { w: 2.4 }),
        P('guerreiro', 'Escudo Mímico do Guerreiro', 'shield', '🛡️', 'Um escudo com um olho no meio que vigia o seu flanco.', { defBonus: [3, 22], dr: [0.5, 4] }, { w: 3.2 }),
        P('guerreiro', 'Anel Mímico do Guerreiro', 'ring', '💍', 'Anel de dentes miúdos: morde o inimigo e cura o dono.', { crit: [1, 4], lifesteal: [0.5, 3] }, { w: 0.1 }),
        P('guerreiro', 'Amuleto Mímico do Guerreiro', 'amulet', '📿', 'Amuleto que ronrona quando você está em perigo.', { dr: [1, 5], atkSpd: [1, 6] }, { w: 0.2 }),
        P('arqueiro', 'Capuz Mímico do Arqueiro', 'head', '🧢', 'Capuz de sombras com dois olhinhos dourados lá no fundo.', { defBonus: [2, 12], crit: [1, 5] }, { hat: 'hood', w: 0.8 }),
        P('arqueiro', 'Gibão Mímico do Arqueiro', 'body', '🥋', 'Gibão que se ajusta ao corpo e deixa o passo leve.', { defBonus: [3, 22], moveSpd: [1, 6] }, { w: 3.0 }),
        P('arqueiro', 'Arco Mímico do Arqueiro', 'weapon', '🏹', 'Arco que sussurra o alvo certo antes de você soltar a corda.', { bonusDmg: [4, 24], atkSpd: [1, 8], crit: [1, 5] }, { tool: 'ranged', w: 1.3 }),
        P('arqueiro', 'Anel Mímico do Arqueiro', 'ring', '💍', 'Anel guloso: às vezes come a flecha antes de ela sair da aljava.', { crit: [1, 4], save: [2, 10] }, { w: 0.1 }),
        P('arqueiro', 'Amuleto Mímico do Arqueiro', 'amulet', '📿', 'Amuleto de olho vivo para tesouros e golpes certeiros.', { luck: [2, 10], critDmg: [5, 30] }, { w: 0.2 }),
        P('mago', 'Chapéu Mímico do Mago', 'head', '🎩', 'Chapéu pontudo que murmura feitiços (e pede biscoitos).', { defBonus: [1, 8], save: [2, 8] }, { hat: 'wizard', w: 0.5 }),
        P('mago', 'Manto Mímico do Mago', 'body', '👘', 'Manto que abre uma boca discreta no forro quando há magia por perto.', { defBonus: [2, 14], spellDmg: [1, 6], dr: [0.5, 3] }, { robe: true, w: 1.3 }),
        P('mago', 'Cajado Mímico do Mago', 'weapon', '🦯', 'Cajado com uma gema que pisca como um olho curioso.', { bonusDmg: [4, 24], spellDmg: [1, 5], atkSpd: [1, 6] }, { tool: 'magic', gem: '#ffd34a', w: 1.7 }),
        P('mago', 'Anel Mímico do Mago', 'ring', '💍', 'Anel que guarda runas na boca e as devolve quando você precisa.', { save: [2, 10], spellDmg: [0, 2] }, { w: 0.1 }),
        P('mago', 'Amuleto Mímico do Mago', 'amulet', '📿', 'Amuleto de sorte com um sorriso de dentes pequenos.', { luck: [2, 10], crit: [1, 4] }, { w: 0.2 })
    ];
    const PIECES = Object.create(null); LIST.forEach((p) => { PIECES[p.n] = p; });
    const BOX_OLD = 'Caixa Mímica';   // descontinuada
    /* ---------- aparências (skins) e estágios visuais ---------- */
    // lvl: nível da PEÇA que libera (0 = só por presente do admin) · a/b: cores do brilho e do destaque (r,g,b) · col: cor da peça (null = cor da classe) · acc/eye: cores de detalhe · fx: partículas do tema · rb: arco-íris
    const SK = {
        violeta: { n: 'Violeta', lvl: 1, a: '190,120,255', b: '255,215,110', col: null, acc: '#e8b93c', eye: '#fff1a8', fx: 'spark', d: 'O padrão: aura violeta e faíscas douradas.' },
        dourado: { n: 'Dourado', lvl: 10, a: '255,205,90', b: '255,246,190', col: '#d9a526', acc: '#fff0a0', eye: '#fff6c8', fx: 'star', d: 'Brilho de ouro e estrelinhas.' },
        carmesim: { n: 'Carmesim', lvl: 20, a: '240,64,72', b: '255,170,70', col: '#b8202e', acc: '#ffb347', eye: '#ffe0a0', fx: 'ember', d: 'Brasas e chamas vivas.' },
        gelo: { n: 'Gelo', lvl: 30, a: '120,200,255', b: '230,246,255', col: '#4a90c8', acc: '#e8fbff', eye: '#e8fbff', fx: 'snow', d: 'Cristais e flocos de neve.' },
        sombra: { n: 'Sombra', lvl: 40, a: '120,70,190', b: '210,120,255', col: '#3a2358', acc: '#c58bff', eye: '#ff7af0', fx: 'wisp', d: 'Fumaça escura e olhos magenta.' },
        esmeralda: { n: 'Esmeralda', lvl: 50, a: '70,220,140', b: '200,255,170', col: '#1f9a62', acc: '#c8ffb0', eye: '#eaffd0', fx: 'leaf', d: 'Folhas e brilho de floresta.' },
        aurora: { n: 'Aurora', lvl: 0, a: '255,160,255', b: '160,255,220', col: '#c060e0', acc: '#ffffff', eye: '#ffffff', fx: 'prism', rb: 1, d: 'Aparência especial: cores que mudam como uma aurora.' },
        eclipse: { n: 'Eclipse', lvl: 0, a: '255,190,60', b: '255,230,150', col: '#241a38', acc: '#ffd34a', eye: '#ffd34a', fx: 'ring', d: 'Aparência especial: corpo negro com coroa solar.' }
    };
    const SKIN_IDS = Object.keys(SK);
    const SPECIAL = { aurora: 'Aparência Mímica Aurora', eclipse: 'Aparência Mímica Eclipse' };   // item de presente que libera a aparência
    const stageOf = (l) => (l >= 50 ? 3 : l >= 25 ? 2 : l >= 10 ? 1 : 0);
    const STAGE_NAME = ['Despertar', 'Desperto', 'Ancestral', 'Lendário'];
    const STAGE_DESC = ['aura sutil, olhos e dentes', '+ brilho forte, olhos extras e runas no corpo', '+ runas orbitando, terceiro olho, dentes maiores e partículas do tema', '+ halo, asas etéreas e aura intensa'];
    const STAGE_LVL = [1, 10, 25, 50];
    const SET_N = {}; CLS_IDS.forEach((c) => { SET_N[c] = LIST.filter((p) => p.cls === c).length; });
    const SKEYS = ['crit', 'critDmg', 'moveSpd', 'atkSpd', 'lifesteal', 'luck', 'dr', 'spellDmg', 'save'];   // chaves do Stats
    const LBL = { defBonus: 'Defesa', bonusDmg: 'Dano', crit: 'Crítico', critDmg: 'Dano crítico', moveSpd: 'Vel. de movimento', atkSpd: 'Vel. de ataque', lifesteal: 'Roubo de vida', luck: 'Sorte', dr: 'Redução de dano', spellDmg: 'Dano mágico', save: 'Poupar munição/runas', dmgPct: 'Dano', mregen: 'Regen. de mana' };
    const FMT = { defBonus: (v) => '+' + v, bonusDmg: (v) => '+' + v, crit: (v) => fnum(v) + '%', critDmg: (v) => '+' + fnum(v) + '%', moveSpd: (v) => '+' + fnum(v) + '%', atkSpd: (v) => '+' + fnum(v) + '%', lifesteal: (v) => fnum(v) + '%', luck: (v) => '+' + fnum(v) + '%', dr: (v) => fnum(v) + '%', spellDmg: (v) => '+' + fnum(v), save: (v) => fnum(v) + '%', dmgPct: (v) => '+' + fnum(v) + '%', mregen: (v) => '+' + fnum(v) + '%' };
    const ORDER = ['defBonus', 'bonusDmg', 'dmgPct', 'crit', 'critDmg', 'moveSpd', 'atkSpd', 'lifesteal', 'luck', 'dr', 'spellDmg', 'save', 'mregen'];
    const KEYLBL = (cls, k) => (k === 'dmgPct' ? (cls === 'mago' ? 'Dano mágico' : cls === 'arqueiro' ? 'Dano à distância' : 'Dano corpo a corpo') : LBL[k]);
    // bônus de set: base (escala com o nível médio) + marcos fixos (nível médio 10/25/50)
    const SETB = {
        guerreiro: { base: { dmgPct: 10, dr: 5 }, ms: [[10, { lifesteal: 2 }], [25, { critDmg: 20, dr: 3 }], [50, { dmgPct: 10, crit: 5 }]] },
        arqueiro: { base: { crit: 12, save: 15 }, ms: [[10, { moveSpd: 5 }], [25, { critDmg: 25, atkSpd: 5 }], [50, { dmgPct: 8, crit: 6 }]] },
        mago: { base: { dmgPct: 12, mregen: 8 }, ms: [[10, { spellDmg: 2 }], [25, { save: 10, crit: 4 }], [50, { dmgPct: 8, spellDmg: 3 }]] }
    };
    const cfg = { adminOnly: true };   // sem drops e sem receita: só presente do admin / missão especial

    /* ---------- atributos por nível ---------- */
    const curve = (l) => Math.pow((Math.max(1, Math.min(MAXLVL, l)) - 1) / (MAXLVL - 1), 0.85);
    function statsAt(p, l) {
        const o = {}, f = curve(l);
        for (const k of Object.keys(p.st)) { const a = p.st[k][0], b = p.st[k][1], v = a + (b - a) * f; o[k] = (k === 'defBonus' || k === 'bonusDmg') ? Math.round(v) : r1(v); }
        return o;
    }
    function statLine(o, cls, only) {
        return ORDER.filter((k) => o[k] > 0 && (!only || only(k))).map((k) => KEYLBL(cls, k) + ' ' + FMT[k](o[k])).join(' · ');
    }

    /* ============================ ESTADO ============================ */
    const S = { ref: null, acc: 0, rot: 0, ui: { open: false, tab: null }, lastSig: '', ftxt: 0, fsum: 0, mAcc: 0, syncSig: '', saveT: 0 };
    function ensure() {
        if (!gameOn()) return false;
        if (S.ref !== player) { S.ref = player; S.acc = 0; S.rot = 0; S.syncSig = ''; }
        if (!player.mimic || typeof player.mimic !== 'object' || Array.isArray(player.mimic)) player.mimic = {};
        for (const k of Object.keys(player.mimic)) {
            const v = player.mimic[k]; if (!PIECES[k] || !v || typeof v !== 'object') { delete player.mimic[k]; continue; }
            v.lvl = clampI(v.lvl, 1, MAXLVL, 1); v.xp = v.lvl >= MAXLVL ? 0 : clampI(v.xp, 0, 1e7, 0);
        }
        if (!Array.isArray(player.mimicSkins)) player.mimicSkins = [];
        player.mimicSkins = player.mimicSkins.filter((s, i, a) => SPECIAL[s] && a.indexOf(s) === i);
        for (const k of Object.keys(player.mimic)) { const v = player.mimic[k]; if (v.skin !== undefined && !(typeof v.skin === 'string' && v.skin !== 'violeta' && SK[v.skin] && skinUnlocked(v.skin, v.lvl))) delete v.skin; }
        try { convertBoxes(); } catch (e) { }
        player.mimicPct = clampI(player.mimicPct, 0, 100, 0);
        // toda peça encontrada (mochila, banco, equipada) tem estado
        const have = (it) => { if (it && PIECES[it.name] && !player.mimic[it.name]) player.mimic[it.name] = { lvl: 1, xp: 0 }; };
        player.inventory.forEach(have); (player.bank || []).forEach(have); SLOTS.forEach((s) => have(player.equipment[s]));
        return true;
    }
    const stOf = (n) => (player.mimic && player.mimic[n]) || { lvl: 1, xp: 0 };
    const lvlOf = (n) => stOf(n).lvl;
    const isMimic = (it) => !!(it && typeof it.name === 'string' && PIECES[it.name]);
    function equipped() {   // [{name, p, lvl}] das peças Mímicas equipadas (por nome)
        const out = []; if (!gameOn()) return out;
        for (const s of SLOTS) { const it = player.equipment[s]; if (it && PIECES[it.name] && PIECES[it.name].slot === s) out.push({ name: it.name, p: PIECES[it.name], lvl: lvlOf(it.name) }); }
        return out;
    }
    function where(name) {   // 'eq' | 'inv' | 'bank' | ''
        if (!gameOn()) return '';
        if (SLOTS.some((s) => player.equipment[s] && player.equipment[s].name === name)) return 'eq';
        if (player.inventory.some((i) => i && i.name === name)) return 'inv';
        if ((player.bank || []).some((i) => i && i.name === name)) return 'bank';
        return '';
    }
    const owned = (name) => !!where(name);

    /* ---------- set ---------- */
    function setInfo(cls) {
        const eq = equipped().filter((e) => e.p.cls === cls), n = eq.length, T = SET_N[cls], B = SETB[cls];
        const avg = n ? eq.reduce((a, e) => a + e.lvl, 0) / n : 1, full = n === T, sf = 1 + 0.5 * (avg - 1) / (MAXLVL - 1);
        const b = {}; let ratio = full ? 1 : (n >= 2 ? n / T : 0);
        if (ratio > 0) for (const k of Object.keys(B.base)) b[k] = r1(B.base[k] * sf * ratio);
        const ms = B.ms.map(([lv, add]) => ({ lvl: lv, add, on: full && Math.floor(avg) >= lv }));
        if (full) ms.forEach((m) => { if (m.on) for (const k of Object.keys(m.add)) b[k] = r1((b[k] || 0) + m.add[k]); });
        return { cls, n, T, avg: Math.floor(avg), full, partial: !full && n >= 2, b, ms, base: B.base };
    }
    function bonus() {   // { dmgPct por perícia, mregen } do que está equipado agora
        const o = { dmgPct: { combat: 0, ranged: 0, magic: 0 }, mregen: 0 };
        if (!gameOn()) return o;
        CLS_IDS.forEach((c) => { const si = setInfo(c); if (si.b.dmgPct) o.dmgPct[CLS[c].skill] += si.b.dmgPct; if (si.b.mregen) o.mregen += si.b.mregen; });
        return o;
    }
    function statSource() {   // fonte 'mimic' do Stats: atributos das peças equipadas + bônus de set
        const t = {}; if (!gameOn()) return t;
        const add = (o) => SKEYS.forEach((k) => { if (o[k] > 0) t[k] = (t[k] || 0) + o[k]; });
        equipped().forEach((e) => add(statsAt(e.p, e.lvl)));
        CLS_IDS.forEach((c) => add(setInfo(c).b));
        return t;
    }
    function registerStats() { try { if (window.Stats && Stats.addSource && !Stats.hasSource('mimic')) Stats.addSource('mimic', statSource); } catch (e) { } }

    /* ---------- itens: definição e sincronia com o nível ---------- */
    function def(p) {
        const C = CLS[p.cls], st = statsAt(p, 1);
        const it = { name: p.n, icon: p.icon, type: 'equipment', slot: p.slot, stackable: false, weight: p.w || 1, desc: p.desc + ' Uma relíquia viva que cresce junto de quem a veste.', mimic: p.cls, col: C.col };
        if (p.hat) it.hat = p.hat; if (p.robe) it.robe = true; if (p.tool) it.tool = p.tool; if (p.gem) it.gem = p.gem;
        if (st.defBonus) it.defBonus = st.defBonus; if (st.bonusDmg) it.bonusDmg = st.bonusDmg;
        return it;
    }
    function merge() {
        try {
            if (typeof itemDB === 'undefined') return;
            LIST.forEach((p) => { const d = def(p); const cur = itemDB[p.n]; if (!cur) itemDB[p.n] = d; else Object.assign(cur, d); });
            Object.keys(SPECIAL).forEach((id) => { const n = SPECIAL[id], d = { name: n, icon: '🎨', type: 'consumable', stackable: false, weight: 0.1, mimicSkin: id, desc: 'Libera a aparência "' + SK[id].n + '" para as suas peças Mímicas (use o item). ' + SK[id].d }; if (!itemDB[n]) itemDB[n] = d; else Object.assign(itemDB[n], d); });
            if (itemDB[BOX_OLD]) delete itemDB[BOX_OLD];   // Caixa Mímica e sua receita foram removidas
        } catch (e) { console.error('Mimic.merge', e); }
    }
    function syncItem(it) {   // aplica os campos fixos do catálogo + defesa/dano do nível atual + estágio/aparência
        const p = it && PIECES[it.name]; if (!p) return false; delete it.req; const d = def(p), st = statsAt(p, lvlOf(it.name)), sk = skinOf(it.name); let ch = false;
        d.col = skinCol(p, sk);
        for (const k of ['icon', 'type', 'slot', 'mimic', 'col', 'hat', 'robe', 'tool', 'gem', 'weight', 'desc']) { if (d[k] !== undefined && JSON.stringify(it[k]) !== JSON.stringify(d[k])) { it[k] = d[k]; ch = true; } }
        for (const k of ['defBonus', 'bonusDmg']) { const v = st[k] || 0; if ((it[k] || 0) !== v) { if (v) it[k] = v; else delete it[k]; ch = true; } }
        const ms = stageOf(lvlOf(it.name)); if (it.mst !== ms) { it.mst = ms; ch = true; }
        if (sk !== 'violeta') { if (it.msk !== sk) { it.msk = sk; ch = true; } } else if (it.msk !== undefined) { delete it.msk; ch = true; }
        if (it.ench) { delete it.ench; ch = true; }
        return ch;
    }
    function syncAll(force) {
        if (!gameOn()) return;
        let ch = !!force; const f = (it) => { if (it && PIECES[it.name] && syncItem(it)) ch = true; };
        player.inventory.forEach(f); (player.bank || []).forEach(f); SLOTS.forEach((s) => f(player.equipment[s]));
        if (ch) { try { Stats.invalidate && Stats.invalidate(); updateUI(); } catch (e) { } }
    }

    /* ============================ XP ============================ */
    function addXpTo(name, n) {   // devolve quantos níveis subiu
        const p = PIECES[name]; if (!p || !ensure()) return 0; n = Math.floor(Number(n)); if (!(n > 0)) return 0;
        const s = player.mimic[name] || (player.mimic[name] = { lvl: 1, xp: 0 }); if (s.lvl >= MAXLVL) return 0;
        s.xp += n; let up = 0;
        while (s.lvl < MAXLVL && s.xp >= need(s.lvl)) { s.xp -= need(s.lvl); s.lvl++; up++; }
        if (s.lvl >= MAXLVL) s.xp = 0;
        if (up) levelUp(name, s.lvl);
        return up;
    }
    function levelUp(name, lvl) {
        try {
            const p = PIECES[name]; syncAll(); Stats.invalidate && Stats.invalidate();
            say(name + ' subiu para o nível ' + lvl + '!', CLS[p.cls].gold); sfx('levelup');
            if (window.Art && Art.burst) Art.burst(player.x, player.y - 16, '#c58bff', 16, 1.5);
            if (typeof addFloatingText === 'function') addFloatingText(player.x, player.y - 52, 'Mímico Nv ' + lvl, '#c58bff');
            saveSoon();
        } catch (e) { }
    }
    function saveSoon() { try { if (typeof saveDataLogic === 'function') saveDataLogic(); } catch (e) { } }
    function targets() { return equipped().filter((e) => e.lvl < MAXLVL); }
    // XP ganho 'a': devolve o que o jogador mantém (a - desviado) e distribui o desviado entre as peças equipadas abaixo do nível 50
    function divert(a) {
        if (!(a > 0) || !isFinite(a) || !ensure()) return a;
        const pct = player.mimicPct | 0; if (pct <= 0) { S.acc = 0; return a; }
        const tg = targets(); if (!tg.length) { S.acc = 0; return a; }
        S.acc += a * pct; let m = Math.floor(S.acc / 100 + 1e-9); S.acc -= m * 100; if (S.acc < 0) S.acc = 0;
        if (m > a) { S.acc += (m - a) * 100; m = Math.floor(a); }
        if (m <= 0) return a;
        const base = Math.floor(m / tg.length); let rest = m - base * tg.length;
        tg.forEach((t) => { addXpTo(t.name, base); });
        while (rest > 0) { const t = tg[S.rot++ % tg.length]; addXpTo(t.name, 1); rest--; }
        S.fsum += m; const now = performance.now();
        if (now - S.ftxt > 1200) { try { addFloatingText(player.x, player.y - 34, '+' + S.fsum + ' XP Mímico', '#c58bff'); } catch (e) { } S.ftxt = now; S.fsum = 0; }
        S.dirty = true;
        return a - m;
    }
    function setPct(v) { if (!ensure()) return 0; player.mimicPct = clampI(v, 0, 100, 0); S.acc = 0; S.lastSig = ''; saveSoon(); render(true); return player.mimicPct; }

    /* ============================ APARÊNCIA ============================ */
    const skinUnlocked = (id, lvl) => !!SK[id] && (SK[id].lvl > 0 ? (lvl | 0) >= SK[id].lvl : !!(player.mimicSkins && player.mimicSkins.indexOf(id) >= 0));
    const skinOf = (name) => { const s = player && player.mimic && player.mimic[name]; return s && s.skin && SK[s.skin] && skinUnlocked(s.skin, s.lvl) ? s.skin : 'violeta'; };
    const skinCol = (p, id) => (id === 'violeta' || !SK[id] || !SK[id].col) ? CLS[p.cls].col : SK[id].col;
    function setSkin(name, id, quiet) {
        if (!ensure()) return false; const p = PIECES[name], s = player.mimic[name]; if (!p || !s || !SK[id]) return false;
        if (!skinUnlocked(id, s.lvl)) { if (!quiet) say(SK[id].lvl > 0 ? SK[id].n + ' libera no nível ' + SK[id].lvl + ' da peça.' : SK[id].n + ' é uma aparência especial, ainda não liberada.', '#e67e22'); return false; }
        if (id === 'violeta') delete s.skin; else s.skin = id;
        syncAll(true); S.lastSig = ''; saveSoon(); render(true); return true;
    }
    function setSkinAll(cls, id) {   // aplica em todas as peças do set que você tem e que já têm essa aparência liberada
        if (!ensure() || !CLS[cls] || !SK[id]) return 0; let n = 0, skip = 0;
        LIST.filter((p) => p.cls === cls && owned(p.n)).forEach((p) => { if (skinUnlocked(id, lvlOf(p.n))) { if (setSkin(p.n, id, true)) n++; } else skip++; });
        say(n ? SK[id].n + ' aplicada em ' + n + ' peça' + (n > 1 ? 's' : '') + (skip ? ' (' + skip + ' ainda sem essa aparência)' : '.') : 'Nenhuma peça sua tem a aparência ' + SK[id].n + ' liberada.', n ? '#c58bff' : '#e67e22');
        S.lastSig = ''; render(true); return n;
    }
    function useSkinItem(index) {   // consome "Aparência Mímica X" (presente do admin) e libera a aparência
        if (!ensure()) return false; const it = player.inventory[index]; const id = it && (it.mimicSkin || (itemDB[it.name] && itemDB[it.name].mimicSkin)); if (!it || !SK[id]) return false;
        if (player.mimicSkins.indexOf(id) >= 0) { say('Você já liberou a aparência ' + SK[id].n + '. Guarde o item.', '#e67e22'); return true; }
        player.inventory.splice(index, 1); player.mimicSkins.push(id); syncAll(true); S.lastSig = '';
        say('Aparência liberada: ' + SK[id].n + '! Escolha-a no painel dos Mímicos (N).', '#c58bff'); sfx('levelup'); try { Art.burst(player.x, player.y - 14, '#c58bff', 22, 1.7); updateUI(); } catch (e) { }
        saveSoon(); render(true); return true;
    }

    /* ============================ OBTENÇÃO (só por presente do admin) ============================ */
    /* Não existe drop nem receita. Peças chegam pelo correio (presente do DEV ou missão especial) como itens comuns; esta função cuida do duplicado e do aviso. */
    function bestClass() {
        let best = 'guerreiro', bv = -1; try { CLS_IDS.forEach((c) => { const sk = player.stats.skills[CLS[c].skill]; const v = sk ? sk.level : 1; if (v > bv) { bv = v; best = c; } }); } catch (e) { }
        return best;
    }
    function takeMail(name) {   // chamado pelo correio (hub.js) antes de pôr o item na mochila: peça já possuída vira XP (nunca há duas do mesmo nome)
        if (!PIECES[name] || !ensure()) return false; if (!owned(name)) { try { setTimeout(() => announce(name), 50); } catch (e) { } return false; }
        absorb(name); return true;
    }
    function absorb(name) {   // já tem a peça: o duplicado vira XP (60% do nível atual) ou 3.000 moedas no nível máximo
        const s = stOf(name);
        if (s.lvl >= MAXLVL) { try { addInvItem('Coins', 3000); } catch (e) { } say('Você já tem ' + name + ' no nível máximo: o duplicado virou 3.000 moedas.', '#c58bff'); }
        else { const x = Math.max(30, Math.round(need(s.lvl) * 0.6)); addXpTo(name, x); say('Você já tem ' + name + ': o duplicado foi absorvido (+' + x + ' XP).', '#c58bff'); }
        sfx('pickup'); saveSoon(); S.lastSig = '';
    }
    function announce(name) { const p = PIECES[name]; if (!p) return; say('Você recebeu uma relíquia rara: ' + name + '!', CLS[p.cls].gold); sfx('levelup'); try { Art.burst(player.x, player.y - 14, '#c58bff', 20, 1.7); } catch (e) { } }
    function grant(name, opt) {   // só admin (testes/uso próprio); jogadores comuns recebem pelo correio e o servidor reverte qualquer outra origem
        opt = opt || {}; if (typeof userRole === 'undefined' || userRole !== 'admin') return false;
        const p = PIECES[name]; if (!p || !ensure() || !itemDB[name]) return false;
        if (owned(name)) { absorb(name); return true; }
        if (!(typeof addInvItem === 'function' && addInvItem(name, 1))) return false;   // mochila cheia: nada é registrado (evita peça "possuída" sem item)
        if (!player.mimic[name]) player.mimic[name] = { lvl: 1, xp: 0 };
        try { addPickupText(name, 1); } catch (e) { }
        if (!opt.quiet) announce(name);
        syncAll(); saveSoon(); S.lastSig = ''; return true;
    }
    function convertBoxes() {   // a Caixa Mímica foi descontinuada: quem tinha uma recebe 5.000 moedas por caixa
        const cut = (list) => { let n = 0; for (let i = list.length - 1; i >= 0; i--) if (list[i] && list[i].name === BOX_OLD) { list.splice(i, 1); n++; } return n; };
        const n = cut(player.inventory) + cut(player.bank || []); if (!n) return;
        try { addInvItem('Coins', 5000 * n); } catch (e) { }
        say('Sua Caixa Mímica foi trocada por ' + (5000 * n).toLocaleString('pt-BR') + ' moedas.', '#c58bff'); saveSoon();
    }

    /* ============================ TOOLTIP / ITEM ============================ */
    function brief(it) {   // uma linha para a barra de seleção da mochila
        const p = it && PIECES[it.name]; if (!p || !gameOn()) return '';
        const s = stOf(it.name), l = statLine(statsAt(p, s.lvl), p.cls, (k) => k !== 'defBonus' && k !== 'bonusDmg');
        return 'Mímico Nv ' + s.lvl + '/' + MAXLVL + (l ? ' · ' + l : '');
    }
    function tipHtml(it) {
        const p = it && PIECES[it.name]; if (!p || !gameOn()) return '';
        const s = stOf(it.name), C = CLS[p.cls], nx = s.lvl < MAXLVL ? need(s.lvl) : 0, cur = statsAt(p, s.lvl);
        let h = `<div class="tt-stat" style="color:#c58bff">Mímico · Nível ${s.lvl}/${MAXLVL}${nx ? ' · XP ' + s.xp + '/' + nx : ' (máx.)'}</div>`;
        const l = statLine(cur, p.cls, (k) => k !== 'defBonus' && k !== 'bonusDmg'); if (l) h += `<div class="tt-stat" style="color:#7fd0ff">${esc(l)}</div>`;
        const si = setInfo(p.cls), bt = bonusText(p.cls, si.base);
        h += `<div class="tt-stat" style="color:${C.gold}">${esc(C.name)} (${si.n}/${si.T} equipadas)${si.full ? ' ✔ completo' : ''}: ${esc(bt)}${si.full ? '' : ' (completo)'}</div>`;
        { const sk = skinOf(it.name), st = stageOf(s.lvl); h += `<div class="tt-stat" style="color:#c58bff">Estágio ${st + 1}/4 · ${STAGE_NAME[st]} · Aparência ${esc(SK[sk].n)}</div>`; }
        h += '<div class="tt-stat" style="color:#9a8fb0">Item pessoal: não pode ser trocado, vendido nem desmanchado. Evolui com o portador (painel dos Mímicos: tecla N).</div>';
        return h;
    }
    const bonusText = (cls, b) => ORDER.filter((k) => b[k] > 0).map((k) => KEYLBL(cls, k) + ' ' + FMT[k](b[k])).join(', ');
    function wrapTip() { try { if (window.Stats && Stats.tipHtml && !Stats.tipHtml._mimic) { const o = Stats.tipHtml; Stats.tipHtml = function (it) { let h = ''; try { h = o.apply(this, arguments); } catch (e) { } try { h += tipHtml(it); } catch (e) { } return h; }; Stats.tipHtml._mimic = 1; } } catch (e) { } }

    /* ============================ ÍCONE E DESENHO ============================ */
    const hsl2rgb = (h, s, l) => { h = ((h % 360) + 360) % 360; const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2; let r = 0, g = 0, b = 0; if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; } return Math.round((r + m) * 255) + ',' + Math.round((g + m) * 255) + ',' + Math.round((b + m) * 255); };
    const thOf = (it) => SK[it && it.msk] || SK.violeta;
    const colA = (th, now) => (th.rb ? hsl2rgb(now * 50, 0.85, 0.66) : th.a);
    const colB = (th, now) => (th.rb ? hsl2rgb(now * 50 + 150, 0.85, 0.76) : th.b);
    const ownState = (name) => { const s = gameOn() && player.mimic && player.mimic[name]; return s ? { skin: skinOf(name), stage: stageOf(s.lvl) } : { skin: 'violeta', stage: 0 }; };
    const iconKey = (name) => { const o = ownState(name); return o.skin + o.stage; };
    // ícone: aura (cor da aparência) atrás da peça e um "selo" de baú-mímico (tampa com olhinhos e dentes) no canto; o estágio acrescenta anel e brilhos
    function iconOverlay(g, SZ, it) {
        const p = PIECES[it && it.name]; if (!p) return; const st = ownState(it.name), TH = SK[st.skin], k = SZ / 64, now = 1.2, cA = colA(TH, now), cB = colB(TH, now), body = skinCol(p, st.skin), gold = TH.acc;
        g.save(); g.scale(k, k);
        g.globalCompositeOperation = 'destination-over';
        const r = g.createRadialGradient(32, 34, 4, 32, 34, 34); r.addColorStop(0, 'rgba(' + cA + ',.5)'); r.addColorStop(0.6, 'rgba(' + cA + ',.22)'); r.addColorStop(1, 'rgba(' + cA + ',0)');
        g.fillStyle = r; g.fillRect(0, 0, 64, 64);
        g.globalCompositeOperation = 'source-over';
        if (st.stage >= 2) { g.strokeStyle = 'rgba(' + cB + ',' + (st.stage >= 3 ? 0.85 : 0.5) + ')'; g.lineWidth = st.stage >= 3 ? 2.2 : 1.4; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.stroke(); }
        // selo no canto inferior direito
        const x = 38, y = 40; g.lineJoin = 'round';
        g.fillStyle = '#f4efe2'; g.strokeStyle = '#1b1109'; g.lineWidth = 1;
        for (let i = 0; i < 4; i++) { const tx = x + 2.5 + i * 4.6; g.beginPath(); g.moveTo(tx, y + 11); g.lineTo(tx + 2.3, y + 17); g.lineTo(tx + 4.6, y + 11); g.closePath(); g.fill(); g.stroke(); }
        g.beginPath(); g.moveTo(x, y + 12); g.lineTo(x, y + 6); g.quadraticCurveTo(x + 11.5, y - 6, x + 23, y + 6); g.lineTo(x + 23, y + 12); g.closePath();
        const gr = g.createLinearGradient(x, y - 4, x + 23, y + 12); gr.addColorStop(0, 'rgb(' + cA + ')'); gr.addColorStop(0.5, body); gr.addColorStop(1, '#2d1650'); g.fillStyle = gr; g.fill(); g.lineWidth = 2.2; g.stroke();
        g.strokeStyle = gold; g.lineWidth = 1.3; g.beginPath(); g.moveTo(x + 1.5, y + 10.2); g.lineTo(x + 21.5, y + 10.2); g.stroke();
        for (const ex of [x + 7.2, x + 15.8]) { g.fillStyle = TH.eye; g.beginPath(); g.ellipse(ex, y + 5.4, 2.7, 2.3, 0, 0, Math.PI * 2); g.fill(); g.lineWidth = 1; g.strokeStyle = '#1b1109'; g.stroke(); g.fillStyle = '#1b1109'; g.beginPath(); g.ellipse(ex + 0.5, y + 5.6, 1.1, 1.4, 0, 0, Math.PI * 2); g.fill(); }
        if (st.stage >= 1) { g.fillStyle = TH.eye; g.strokeStyle = '#1b1109'; g.lineWidth = 0.8; g.beginPath(); g.ellipse(x + 11.5, y + 1.6, 1.6, 1.4, 0, 0, Math.PI * 2); g.fill(); g.stroke(); }   // terceiro olho
        // brilho no objeto (mais brilhos a cada estágio)
        const star = (cx, cy, s) => { g.beginPath(); g.moveTo(cx, cy - s); g.lineTo(cx + s * 0.28, cy - s * 0.28); g.lineTo(cx + s, cy); g.lineTo(cx + s * 0.28, cy + s * 0.28); g.lineTo(cx, cy + s); g.lineTo(cx - s * 0.28, cy + s * 0.28); g.lineTo(cx - s, cy); g.lineTo(cx - s * 0.28, cy - s * 0.28); g.closePath(); g.fill(); };
        g.fillStyle = 'rgba(' + cB + ',.9)'; star(12, 13, 6);
        if (st.stage >= 1) star(50, 12, 3.6); if (st.stage >= 2) star(8, 36, 3); if (st.stage >= 3) { star(54, 28, 3.2); star(26, 5, 2.8); }
        g.restore();
    }

    /* ---- desenho no personagem (chamado por art.js depois do corpo; pés em (0,0), vista 'side' olha para a direita) ---- */
    function fxParticle(ctx, TH, kind, x, y, s, a, t, k) {
        if (a <= 0.02) return;
        if (kind === 'wisp') { ctx.fillStyle = 'rgba(28,12,48,' + (0.32 * a).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(x, y, 1.6 + (1 - a) * 2.4, 0, 6.283); ctx.fill(); return; }
        if (kind === 'leaf') { ctx.save(); ctx.translate(x, y); ctx.rotate(t * 2 + k); ctx.fillStyle = 'rgba(' + TH.a + ',' + (0.85 * a).toFixed(3) + ')'; ctx.beginPath(); ctx.ellipse(0, 0, 1.9 * s, 0.9 * s, 0, 0, 6.283); ctx.fill(); ctx.restore(); return; }
        if (kind === 'star') { ctx.fillStyle = 'rgba(' + TH.b + ',' + (0.95 * a).toFixed(3) + ')'; const r = 1.9 * s; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.3, y - r * 0.3); ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.3, y + r * 0.3); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.3, y + r * 0.3); ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.3, y - r * 0.3); ctx.closePath(); ctx.fill(); return; }
        if (kind === 'ember') { ctx.fillStyle = 'rgba(' + (k % 2 ? TH.b : TH.a) + ',' + (0.95 * a).toFixed(3) + ')'; ctx.fillRect(x - 0.7 * s, y - 0.7 * s, 1.4 * s, 1.4 * s); return; }
        ctx.fillStyle = 'rgba(' + (kind === 'snow' ? TH.b : (k % 2 ? TH.b : TH.a)) + ',' + (0.9 * a).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(x, y, (kind === 'snow' ? 1.1 : 0.95) * s, 0, 6.283); ctx.fill();
    }
    function overlay(ctx, view, equip, info, now) {
        if (!equip || !info) return;
        const mm = (it) => (it && typeof it.name === 'string' && PIECES[it.name] ? it : null);
        const H = mm(equip.head), B = mm(equip.body), W = mm(equip.weapon), SH = mm(equip.shield); if (!(H || B || W || SH)) return;
        const stg = (it) => (it ? it.mst | 0 : 0), S = Math.max(stg(H), stg(B), stg(W), stg(SH)), main = B || H || W || SH, TM = thOf(main);
        const front = view === 'front', back = view === 'back', side = view === 'side';
        const pulse = 0.5 + 0.5 * Math.sin(now * 2.3), sx = info.sx || 1, sy = info.sy || 1, bob = info.bob || 0;
        const cy = -22 * sy - bob, hy = info.hy, blink = (now % 4.3) < 0.13, kk = 1 + 0.3 * S;
        const glow = (x, y, r, c, a) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(' + c + ',' + Math.min(0.6, a).toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + c + ',0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
        const cA = colA(TM, now), cB = colB(TM, now), flap = Math.sin(now * 2.2) * 0.12;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        if (B) glow(0, cy, 13 * sx * (1 + 0.1 * S), colA(thOf(B), now), (0.13 + 0.12 * pulse) * kk);
        if (H) glow(0, hy, 10 * (1 + 0.08 * S), colA(thOf(H), now), (0.12 + 0.12 * pulse) * kk);
        if (W && info.hand) glow(info.hand.x, info.hand.y - 6, 9, colB(thOf(W), now), (0.1 + 0.12 * pulse) * kk);
        if (SH && info.handL && front) glow(info.handL.x - 1, info.handL.y - 4.4, 7, colA(thOf(SH), now), (0.1 + 0.1 * pulse) * kk);
        if (S >= 3) {   // asas etéreas (translúcidas) e halo
            const wa = 0.2 + 0.1 * pulse;
            const wing = (sg, scl) => {
                ctx.save(); ctx.translate(sg * 4.5 * sx * scl, cy - 6); ctx.rotate(sg * (0.12 + flap)); const q = sx * scl;
                const gr = ctx.createLinearGradient(0, 0, sg * 26 * q, -16); gr.addColorStop(0, 'rgba(' + cA + ',' + (wa + 0.16).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(' + cB + ',0.02)');
                ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(sg * 14 * q, -24, sg * 27 * q, -17); ctx.quadraticCurveTo(sg * 21 * q, -9, sg * 25 * q, -2); ctx.quadraticCurveTo(sg * 16 * q, -3, sg * 20 * q, 6); ctx.quadraticCurveTo(sg * 10 * q, 2, sg * 12 * q, 10); ctx.quadraticCurveTo(sg * 5 * q, 6, 0, 8); ctx.closePath(); ctx.fill();
                ctx.strokeStyle = 'rgba(' + cB + ',' + (wa + 0.25).toFixed(3) + ')'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(sg * 25 * q, -13); ctx.moveTo(0, 3); ctx.lineTo(sg * 22 * q, -2); ctx.moveTo(0, 5); ctx.lineTo(sg * 16 * q, 6); ctx.stroke(); ctx.restore();
            };
            if (side) wing(-1, 0.8); else { wing(-1, 1); wing(1, 1); }
            const hh = hy - ((H && H.hat === 'wizard') ? 22 : 12) * sy;   // halo sobre a cabeça
            ctx.strokeStyle = 'rgba(' + cB + ',' + (0.55 + 0.3 * pulse).toFixed(3) + ')'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(0, hh, 7.5 * (side ? 0.7 : 1), 2.2, 0, 0, Math.PI * 2); ctx.stroke();
            for (let i = 0; i < 3; i++) { const a = now * 1.8 + i * 2.09; ctx.fillStyle = 'rgba(' + cB + ',0.9)'; ctx.beginPath(); ctx.arc(Math.cos(a) * 7.5 * (side ? 0.7 : 1), hh + Math.sin(a) * 2.2, 0.9, 0, 6.283); ctx.fill(); }
        }
        // faíscas girando em volta do corpo
        const sp = (cx, cy2, rx, ry, ph, a) => { const t = now * 1.5 + ph; ctx.fillStyle = 'rgba(' + cB + ',' + (a * (0.5 + 0.5 * Math.sin(t * 2))).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(cx + Math.cos(t) * rx, cy2 + Math.sin(t) * ry, 0.9, 0, Math.PI * 2); ctx.fill(); };
        if (B) { sp(0, cy, 8, 9, 0, 0.9); sp(0, cy, 8, 9, 3.1, 0.9); if (S >= 1) sp(0, cy, 10, 6, 1.6, 0.8); } if (H) sp(0, hy - 2, 9, 4, 1.4, 0.9);
        if (S >= 2) {   // runas orbitando
            for (let i = 0; i < 3; i++) {
                const a = now * 1.3 + i * 2.094, dx = Math.cos(a) * 15 * sx, dz = Math.sin(a), ry = cy + dz * 4 - 2; const al = 0.45 + 0.4 * (side ? 1 : (dz > 0 ? 1 : 0.35));
                ctx.save(); ctx.translate(dx, ry); ctx.rotate(a); ctx.strokeStyle = 'rgba(' + cB + ',' + al.toFixed(3) + ')'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-1.8, 1.6); ctx.lineTo(0, -2); ctx.lineTo(1.8, 1.6); ctx.moveTo(-1.2, 0.3); ctx.lineTo(1.2, 0.3); ctx.stroke(); ctx.restore();
            }
        }
        // partículas do tema (quantidade cresce com o estágio)
        const nP = Math.min(9, 2 + 2 * S), fx = TM.fx;
        for (let i = 0; i < nP; i++) {
            const ph = (now * (fx === 'snow' || fx === 'leaf' ? 0.28 : 0.42) + i / nP) % 1, wob = Math.sin(i * 12.9 + now * 1.6) * (fx === 'snow' ? 11 : 9) * sx;
            const rising = !(fx === 'snow' || fx === 'leaf'), y = rising ? (cy + 12 - ph * 42) : (cy - 26 + ph * 38), a = Math.sin(ph * Math.PI);
            if (fx === 'wisp') { ctx.globalCompositeOperation = 'source-over'; fxParticle(ctx, TM, fx, wob, y, 1, a, now, i); ctx.globalCompositeOperation = 'lighter'; }
            else fxParticle(ctx, TM, fx === 'ring' ? 'spark' : fx === 'prism' ? 'snow' : fx, wob, y, 1 + (S >= 3 ? 0.3 : 0), a, now, i);
        }
        if (TM.fx === 'ring' && B) { ctx.strokeStyle = 'rgba(' + cA + ',' + (0.5 + 0.3 * pulse).toFixed(3) + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, hy - 2, 8.5, 2.4, 0, 0, 6.283); ctx.stroke(); }
        ctx.restore();
        const eyeC = (it) => thOf(it).eye;
        const eye = (x, y, rx, ry, dir, c) => {
            ctx.fillStyle = c || TM.eye; ctx.strokeStyle = '#1b1109'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.ellipse(x, y, rx, blink ? 0.25 : ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            if (!blink) { ctx.fillStyle = '#1b1109'; ctx.beginPath(); ctx.ellipse(x + (dir || 0) * 0.35, y + 0.1, rx * 0.38, ry * 0.8, 0, 0, Math.PI * 2); ctx.fill(); }
        };
        if (B) {
            const ec = eyeC(B), sB = stg(B);
            if (front) {
                eye(-2.4 * sx, cy - 3.4, 1.25, 1.2, 0, ec); eye(2.4 * sx, cy - 3.4, 1.25, 1.2, 0, ec);
                if (sB >= 1) { eye(-7.2 * sx, cy - 6.4, 0.85, 0.8, 0, ec); eye(7.2 * sx, cy - 6.4, 0.85, 0.8, 0, ec); }   // olhos nos ombros
                if (sB >= 2) eye(0, cy - 6.4, 0.95, 0.9, 0, ec);   // terceiro olho
                const ty = cy + 5.6; ctx.strokeStyle = 'rgba(30,8,50,.85)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-4.4 * sx, ty); ctx.quadraticCurveTo(0, ty + 1.4, 4.4 * sx, ty); ctx.stroke();
                ctx.fillStyle = '#f7f1e0'; ctx.strokeStyle = '#1b1109'; ctx.lineWidth = 0.35; const nT = sB >= 2 ? 7 : 5, stp = sB >= 2 ? 1.35 : 2;
                for (let i = 0; i < nT; i++) { const tx = (-(nT - 1) / 2 + i) * stp * sx; const edge = i === 0 || i === nT - 1; ctx.beginPath(); ctx.moveTo(tx - 0.9, ty + 0.5 + (edge ? 0 : 0.5)); ctx.lineTo(tx, ty + (sB >= 2 ? 3.1 : 2.6)); ctx.lineTo(tx + 0.9, ty + 0.5 + (edge ? 0 : 0.5)); ctx.closePath(); ctx.fill(); ctx.stroke(); }
                if (sB >= 1) { ctx.strokeStyle = 'rgba(' + colB(thOf(B), now) + ',' + (0.5 + 0.3 * pulse).toFixed(2) + ')'; ctx.lineWidth = 0.7; for (const sg of [-1, 1]) { const rx = sg * 8.6 * sx; ctx.beginPath(); ctx.moveTo(rx, cy - 1); ctx.lineTo(rx, cy + 7); for (let i = 0; i < 3; i++) { ctx.moveTo(rx - 0.9, cy + i * 2.6); ctx.lineTo(rx + 0.9, cy + i * 2.6); } ctx.stroke(); } }
            } else if (side) {
                eye(3.2 * sx, cy - 3.4, 1.15, 1.2, 1, ec); if (sB >= 1) eye(3.6 * sx, cy - 6.4, 0.8, 0.75, 1, ec);
                ctx.fillStyle = '#f7f1e0'; ctx.strokeStyle = '#1b1109'; ctx.lineWidth = 0.35; const nT = sB >= 2 ? 3 : 2;
                for (let i = 0; i < nT; i++) { const ty = cy + 2.2 + i * 2.4; ctx.beginPath(); ctx.moveTo(4.6 * sx, ty); ctx.lineTo(2.8 * sx, ty + 0.9); ctx.lineTo(4.6 * sx, ty + 1.8); ctx.closePath(); ctx.fill(); ctx.stroke(); }
                if (sB >= 1) { ctx.strokeStyle = 'rgba(' + colB(thOf(B), now) + ',' + (0.5 + 0.3 * pulse).toFixed(2) + ')'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-1 * sx, cy - 2); ctx.lineTo(-1 * sx, cy + 6); ctx.moveTo(-2 * sx, cy); ctx.lineTo(0, cy); ctx.moveTo(-2 * sx, cy + 3); ctx.lineTo(0, cy + 3); ctx.stroke(); }
            } else {   // costas: costura com runa
                ctx.strokeStyle = 'rgba(' + colB(thOf(B), now) + ',' + (0.5 + 0.3 * pulse).toFixed(2) + ')'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-3 * sx, cy - 5); ctx.lineTo(0, cy - 2); ctx.lineTo(3 * sx, cy - 5); ctx.moveTo(0, cy - 2); ctx.lineTo(0, cy + 6); ctx.stroke();
                if (sB >= 1) { ctx.beginPath(); ctx.arc(0, cy + 1, 4.6, 0.3, Math.PI - 0.3); ctx.moveTo(-5 * sx, cy - 4); ctx.lineTo(-5 * sx, cy + 4); ctx.moveTo(5 * sx, cy - 4); ctx.lineTo(5 * sx, cy + 4); ctx.stroke(); }
                if (sB >= 2) eye(0, cy - 7, 0.9, 0.85, 0, ec);
            }
        }
        if (H && front && H.hat === 'helmet') { const ec = eyeC(H); eye(-2.5, hy + 0.9, 0.95, 0.8, 0, ec); eye(2.5, hy + 0.9, 0.95, 0.8, 0, ec); if (stg(H) >= 2) eye(0, hy - 1.6, 0.8, 0.75, 0, ec); }
        if (H && side && H.hat === 'helmet') { eye(3.6, hy + 0.7, 0.9, 0.8, 1, eyeC(H)); if (stg(H) >= 2) eye(2.6, hy - 1.6, 0.7, 0.65, 1, eyeC(H)); }
        if (SH) {
            if (front && info.handL) eye(info.handL.x - 1, info.handL.y - 4.4, 2.1, 1.5, 0, eyeC(SH));
            else if (back) eye(0, -21.6 * sy - bob, 2.1, 1.5, 0, eyeC(SH));
        }
    }

    /* ---- prévia do boneco (painel): usa a aparência e o estágio reais (ou um estágio de teste) ---- */
    function previewEquip(cls, stageForce) {
        const eq = { head: null, body: null, weapon: null, shield: null };
        LIST.filter((p) => p.cls === cls && owned(p.n)).forEach((p) => {
            if (eq[p.slot] === undefined) return; const sk = skinOf(p.n), lv = lvlOf(p.n);
            const it = Object.assign({}, itemDB[p.n] || def(p)); it.col = skinCol(p, sk); it.mst = stageForce != null ? stageForce : stageOf(lv); if (sk !== 'violeta') it.msk = sk; else delete it.msk; eq[p.slot] = it;
        });
        return eq;
    }
    function drawPreviews() {
        const w = $('mimic-win'); if (!w || !S.ui.open || !window.Art || !Art.drawLook) return; const t = performance.now() / 1000;
        const eq = previewEquip(S.ui.tab, S.ui.pvStage); const look = (gameOn() && player.look) || (Art.defaultLook ? Art.defaultLook() : null);
        ['front', 'side', 'back'].forEach((v) => {
            const c = $('mm-pv-' + v); if (!c) return; const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
            const grd = g.createRadialGradient(c.width / 2, c.height * 0.55, 6, c.width / 2, c.height * 0.55, c.width * 0.7); grd.addColorStop(0, 'rgba(120,80,190,.28)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(0, 0, c.width, c.height);
            try { Art.drawLook(g, c.width / 2, c.height - 16, look, v, { scale: 2.5, t, equip: eq, mv: 0 }); } catch (e) { console.error(e); }
        });
    }

    /* ============================ PAINEL ============================ */
    const CSS = `
#mimic-win{display:none;position:absolute;z-index:131;left:50%;top:12px;transform:translateX(-50%);width:min(460px,calc(100% - 24px));max-height:calc(100% - 28px);flex-direction:column;gap:7px;padding:10px;border-radius:14px;color:var(--text,#eadfc4);background:linear-gradient(#2a1a3a,#150d20);border:3px solid #6a3fa0;box-shadow:0 0 0 2px #000,0 14px 40px rgba(0,0,0,.7),0 0 24px rgba(160,100,255,.25);font-family:var(--sans,sans-serif)}
#mimic-win.on{display:flex}
#mimic-win .mm-h{display:flex;align-items:center;gap:6px;flex-wrap:wrap} #mimic-win .mm-t{font:700 1rem var(--serif,Georgia,serif);color:#e8c469;margin-right:auto}
#mimic-win .mm-x{width:32px;height:32px;border-radius:50%;border:1px solid #000;background:#3a2150;color:#eadfc4;font-size:1.1rem;cursor:pointer}
#mimic-win .mm-body{display:flex;flex-direction:column;gap:7px;overflow-y:auto;min-height:0;padding-right:2px}
#mimic-win .mm-tab{min-height:32px;padding:0 10px;border-radius:999px;border:1px solid #000;background:#33204a;color:#cdbfe6;font:700 .72rem var(--sans,sans-serif);cursor:pointer} #mimic-win .mm-tab.on{background:linear-gradient(#8a55c8,#5a2f96);color:#fff}
#mimic-win .mm-sec{font:700 .72rem var(--serif,Georgia,serif);color:#bfa9e0;letter-spacing:.5px;text-transform:uppercase}
#mimic-win .mm-box{padding:7px 9px;border-radius:10px;background:rgba(0,0,0,.28);border:1px solid rgba(190,140,255,.25);display:flex;flex-direction:column;gap:5px}
#mimic-win .mm-pcts{display:flex;flex-wrap:wrap;gap:4px} #mimic-win .mm-pb{min-width:38px;min-height:32px;padding:0 6px;border-radius:8px;border:1px solid #000;background:#33204a;color:#e6dcf5;font:700 .74rem var(--sans,sans-serif);cursor:pointer} #mimic-win .mm-pb.on{background:linear-gradient(#e8b93c,#a8791a);color:#2a1700}
#mimic-win .mm-split{display:flex;height:12px;border-radius:7px;overflow:hidden;border:1px solid #000;background:#120a1c} #mimic-win .mm-split i{display:block;height:100%} #mimic-win .mm-split .a{background:linear-gradient(#7fd0ff,#3a76b8)} #mimic-win .mm-split .b{background:linear-gradient(#c58bff,#7a44b8)}
#mimic-win .mm-note{font-size:.72rem;color:#a99bc4;line-height:1.35} #mimic-win .mm-note b{color:#e8c469}
#mimic-win .mm-set{font-size:.76rem;line-height:1.4} #mimic-win .mm-ok{color:#8ff0b0} #mimic-win .mm-ms{opacity:.55} #mimic-win .mm-ms.on{opacity:1;color:#e8c469}
#mimic-win .mm-row{display:flex;gap:8px;align-items:center;padding:6px;border-radius:10px;background:rgba(0,0,0,.28);border:1px solid rgba(190,140,255,.18)} #mimic-win .mm-row.eq{border-color:#e8b93c}
#mimic-win .mm-row.lock{opacity:.4;filter:grayscale(.8)}
#mimic-win .mm-row img{width:40px;height:40px;flex:none} #mimic-win .mm-rt{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
#mimic-win .mm-rt b{font-size:.78rem;color:#f4e3b0;line-height:1.15} #mimic-win .mm-rt small{font-size:.66rem;color:#bfb0d8;line-height:1.3} #mimic-win .mm-rt .nx{color:#8a7fa6}
#mimic-win .mm-bar{height:7px;border-radius:5px;background:#120a1c;border:1px solid #000;overflow:hidden} #mimic-win .mm-bar i{display:block;height:100%;background:linear-gradient(#e8b93c,#a8791a)}
#mimic-win .mm-b{min-height:30px;padding:0 10px;border-radius:8px;border:1px solid #000;background:linear-gradient(#8a55c8,#5a2f96);color:#fff;font:700 .7rem var(--sans,sans-serif);cursor:pointer;flex:none}
#mimic-win .mm-adm{display:flex;gap:6px;align-items:center;flex-wrap:wrap} #mimic-win select{background:#0f0905;border:1px solid #000;color:#f4e3b0;border-radius:6px;padding:3px 6px;font-size:.78rem;max-width:100%}
#mimic-chip{display:none;align-items:center;gap:6px;height:34px;padding:2px 10px 2px 4px;border-radius:999px;border:1px solid #000;cursor:pointer;color:#e9dcc0;font:700 .72rem var(--serif,Georgia,serif);background:linear-gradient(#5a3a86,#2a1648);box-shadow:inset 0 1px 0 rgba(220,180,255,.3),0 0 8px rgba(160,100,255,.35);white-space:nowrap}
#mimic-chip.show{display:flex} #mimic-chip:hover{filter:brightness(1.15)} #mimic-chip img{width:26px;height:26px;border-radius:50%;background:rgba(0,0,0,.35)} #mimic-chip small{color:#e8c469;font:700 .66rem var(--sans,sans-serif)}
#pet-row:has(#mimic-chip.show){display:flex}
#mimic-win .mm-pv{display:flex;gap:4px;justify-content:center;flex-wrap:wrap} #mimic-win .mm-pv canvas{width:96px;height:128px;border-radius:10px;background:rgba(0,0,0,.28);border:1px solid rgba(190,140,255,.2)}
#mimic-win .mm-sk{display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin-top:2px} #mimic-win .mm-sw{width:24px;height:24px;border-radius:50%;border:2px solid #000;cursor:pointer;padding:0;position:relative;box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}
#mimic-win .mm-sw.on{border-color:#fff;box-shadow:0 0 0 2px #e8b93c} #mimic-win .mm-sw.lock{opacity:.38;filter:grayscale(.7)} #mimic-win .mm-sw.lock::after{content:'🔒';position:absolute;inset:0;font-size:11px;line-height:20px;text-align:center}
#mimic-win .mm-stg{display:flex;gap:4px;flex-wrap:wrap;align-items:center} #mimic-win .mm-stg .mm-pb{min-width:0;padding:0 8px;font-size:.68rem}
@media(max-width:520px){#mimic-win .mm-pv canvas{width:30%;min-width:84px;height:auto;aspect-ratio:3/4}}
html.touch #mimic-chip{height:38px;padding:2px 8px 2px 3px} html.touch #mimic-chip img{width:30px;height:30px} html.touch #mimic-chip span{display:none}
html.touch #mimic-win{left:6px;right:6px;top:6px;transform:none;width:auto;max-height:calc(100% - 12px)}
body.mimic-open #qb{display:none!important}`;
    function injectCSS() { if ($('mimic-css')) return; const s = document.createElement('style'); s.id = 'mimic-css'; s.textContent = CSS; document.head.appendChild(s); }
    function ensureDOM() {
        if (!gameOn()) return false; injectCSS();
        if (!$('mimic-win')) { const w = document.createElement('div'); w.id = 'mimic-win'; ($('game-container') || document.body).appendChild(w); w.addEventListener('click', onClick); }
        if (!$('mimic-chip')) {
            const row = $('pet-row'); if (row) { const b = document.createElement('button'); b.type = 'button'; b.id = 'mimic-chip'; b.setAttribute('aria-label', 'Itens Mímicos'); b.onclick = () => toggle(); row.appendChild(b); }
        }
        return true;
    }
    const img = (name, px) => { try { return Icons.html(name, px); } catch (e) { return ''; } };
    const swatch = (id) => { const th = SK[id]; return th.rb ? 'conic-gradient(#ff7ab0,#ffd37a,#7affb0,#7ad0ff,#c58bff,#ff7ab0)' : 'linear-gradient(135deg,rgb(' + th.a + '),' + (th.col || '#7a44b8') + ')'; };
    function skinRow(name, lvl, cur, cls) {   // seletor de aparência de UMA peça (cls = '' ) ou do set inteiro (name = '')
        const ids = SKIN_IDS.filter((id) => SK[id].lvl > 0 || (player.mimicSkins && player.mimicSkins.indexOf(id) >= 0));
        return '<div class="mm-sk">' + ids.map((id) => { const th = SK[id], ok = name ? skinUnlocked(id, lvl) : LIST.some((p) => p.cls === cls && owned(p.n) && skinUnlocked(id, lvlOf(p.n)));
            const tip = th.n + ' — ' + th.d + (th.lvl > 0 && !ok ? ' (nível ' + th.lvl + (name ? ' da peça' : '') + ')' : '');
            return `<button class="mm-sw${cur === id ? ' on' : ''}${ok ? '' : ' lock'}" style="background:${swatch(id)}" data-a="${name ? 'skin' : 'skinall'}" data-n="${esc(name || cls)}" data-s="${id}" title="${esc(tip)}" aria-label="${esc(th.n)}"></button>`; }).join('') + '</div>';
    }
    function pieceRow(p, cur) {
        const n = p.n, w = where(n);
        if (!w) return `<div class="mm-row lock"><span style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex:none">❔</span><div class="mm-rt"><b>???</b><small>${esc(slotName(p.slot))} · ainda não encontrado</small></div></div>`;
        const s = stOf(n), nx = s.lvl < MAXLVL ? need(s.lvl) : 0, pc = nx ? Math.min(100, s.xp / nx * 100) : 100;
        const now = statLine(statsAt(p, s.lvl), p.cls), nxt = s.lvl < MAXLVL ? statLine(statsAt(p, s.lvl + 1), p.cls) : '';
        const where_ = w === 'eq' ? 'equipada' : w === 'inv' ? 'na mochila' : 'no banco', sk = skinOf(n), st = stageOf(s.lvl);
        const btn = w === 'eq' ? '<button class="mm-b" data-a="un" data-n="' + esc(n) + '">Tirar</button>' : w === 'inv' ? '<button class="mm-b" data-a="eq" data-n="' + esc(n) + '">Equipar</button>' : '';
        return `<div class="mm-row${w === 'eq' ? ' eq' : ''}">${img(n, 40)}<div class="mm-rt"><b>${esc(n)}</b><small>${esc(slotName(p.slot))} · ${where_} · Nível ${s.lvl}/${MAXLVL}${nx ? ' · ' + s.xp + '/' + nx + ' XP' : ' (máx.)'}</small><div class="mm-bar"><i style="width:${pc.toFixed(1)}%"></i></div><small>${esc(now)}</small>${nxt ? `<small class="nx">Nv ${s.lvl + 1}: ${esc(nxt)}</small>` : ''}<small>Estágio ${st + 1}/4: <b style="color:#e8c469">${STAGE_NAME[st]}</b> · Aparência: <b style="color:#c58bff">${esc(SK[sk].n)}</b></small>${skinRow(n, s.lvl, sk, p.cls)}</div>${btn}</div>`;
    }
    const slotName = (s) => ({ head: 'Cabeça', body: 'Corpo', weapon: 'Arma', shield: 'Escudo', ring: 'Anel', amulet: 'Amuleto' }[s] || s);
    function setBox(cls) {
        const si = setInfo(cls), C = CLS[cls], any = si.n > 0;
        let h = `<div class="mm-box mm-set"><div><b style="color:${C.gold}">${esc(C.name)}</b> · Set ${si.n}/${si.T}${si.full ? ' <span class="mm-ok">✔ completo</span>' : ''}</div>`;
        const bt = bonusText(cls, any ? si.b : {});
        if (si.full) h += `<div>Bônus: ${esc(bt)}</div>`;
        else if (si.partial) h += `<div>Parcial (${si.n}/${si.T}): ${esc(bt)}<br><span class="mm-note">Completo: ${esc(bonusText(cls, si.base))} + marcos</span></div>`;
        else h += `<div class="mm-note">Com 2+ peças: parte do bônus. Completo: <b>${esc(bonusText(cls, si.base))}</b> (cresce com o nível médio).</div>`;
        h += `<div class="mm-ms-w">` + si.ms.map((m) => `<div class="mm-ms${m.on ? ' on' : ''}">${m.on ? '✔' : '○'} Nível médio ${m.lvl}: ${esc(bonusText(cls, m.add))}</div>`).join('') + `</div>`;
        if (si.n) h += `<div class="mm-note">Nível médio das peças equipadas: ${si.avg}.</div>`;
        return h + '</div>';
    }
    function render(force) {
        const w = $('mimic-win'); if (!w || !S.ui.open || !ensure()) return;
        const pct = player.mimicPct | 0, tg = targets(), eqN = equipped().length;
        if (!S.ui.tab) S.ui.tab = (equipped()[0] && equipped()[0].p.cls) || bestClass();
        const tab = S.ui.tab, nOwn = LIST.filter((p) => owned(p.n)).length;
        let h = `<div class="mm-h"><span class="mm-t">Itens Mímicos</span>${CLS_IDS.map((c) => `<button class="mm-tab${tab === c ? ' on' : ''}" data-a="tab" data-n="${c}">${esc(CLS[c].short)} ${LIST.filter((p) => p.cls === c && owned(p.n)).length}/${SET_N[c]}</button>`).join('')}<button class="mm-x" data-a="close" aria-label="Fechar">×</button></div><div class="mm-body">`;
        h += `<div class="mm-box"><div class="mm-sec">XP desviado ao Mímico</div><div class="mm-pcts">${[0, 10, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100].map((v) => `<button class="mm-pb${pct === v ? ' on' : ''}" data-a="pct" data-n="${v}">${v}%</button>`).join('')}</div>` +
            `<div class="mm-split" title="Divisão do XP"><i class="a" style="width:${100 - pct}%"></i><i class="b" style="width:${pct}%"></i></div>` +
            `<div><b>Você recebe ${100 - pct}%</b> · <b style="color:#c58bff">Mímicos ${pct}%</b></div>` +
            `<div class="mm-note">${eqN === 0 ? 'Nenhuma peça Mímica equipada: por enquanto o XP fica todo com você.' : tg.length === 0 ? 'Todas as peças equipadas estão no nível máximo: o XP fica todo com você.' : 'Dividido igualmente entre ' + tg.length + ' peça' + (tg.length > 1 ? 's' : '') + ' equipada' + (tg.length > 1 ? 's' : '') + ' abaixo do nível ' + MAXLVL + '. Vale para toda perícia e combate.'}</div></div>`;
        h += setBox(tab);
        const ownedCls = LIST.filter((p) => p.cls === tab && owned(p.n)), pvS = S.ui.pvStage;
        if (ownedCls.length) {
            h += `<div class="mm-box"><div class="mm-sec">Prévia · ${esc(CLS[tab].name)}</div><div class="mm-pv"><canvas id="mm-pv-front" width="192" height="256"></canvas><canvas id="mm-pv-side" width="192" height="256"></canvas><canvas id="mm-pv-back" width="192" height="256"></canvas></div>` +
                `<div class="mm-stg"><span class="mm-note">Estágio: </span><button class="mm-pb${pvS == null ? ' on' : ''}" data-a="pvs" data-n="auto">Atual</button>${[0, 1, 2, 3].map((k) => `<button class="mm-pb${pvS === k ? ' on' : ''}" data-a="pvs" data-n="${k}" title="${esc(STAGE_NAME[k] + ': ' + STAGE_DESC[k])}">${STAGE_NAME[k]} (Nv ${STAGE_LVL[k]})</button>`).join('')}</div>` +
                `<div class="mm-note">${pvS == null ? 'Mostrando o estágio real das suas peças.' : '<b>' + STAGE_NAME[pvS] + '</b>: ' + STAGE_DESC[pvS] + '. (Só prévia: o estágio real depende do nível de cada peça.)'}</div>` +
                `<div class="mm-sec">Aplicar a todo o set</div>${skinRow('', 1, '', tab)}<div class="mm-note">Aparências liberam pelo nível da peça (Dourado 10, Carmesim 20, Gelo 30, Sombra 40, Esmeralda 50); Aurora e Eclipse são aparências especiais. Cada peça aceita só as que já liberou.</div></div>`;
        }
        h += `<div class="mm-sec">Peças · ${esc(CLS[tab].name)}</div>` + LIST.filter((p) => p.cls === tab).map((p) => pieceRow(p)).join('');
        if (nOwn === 0) h += `<div class="mm-note">Relíquias vivas que crescem junto de quem as veste. Cada peça sobe até o nível ${MAXLVL} com XP própria e muda de aparência com o nível.</div>`;
        h += '</div>';
        if (!force && w._h === h) return;
        const keep = w.querySelector('.mm-body'), st = keep ? keep.scrollTop : 0; w._h = h; w.innerHTML = h;
        const nb = w.querySelector('.mm-body'); if (nb) nb.scrollTop = st; drawPreviews();
    }
    function onClick(e) {
        const el = e.target.closest('[data-a]'); if (!el) return; const a = el.dataset.a, n = el.dataset.n; if (!ensure()) return;
        if (a === 'close') close(); else if (a === 'tab') { S.ui.tab = n; render(true); }
        else if (a === 'pct') setPct(Number(n));
        else if (a === 'eq') { const i = player.inventory.findIndex((x) => x && x.name === n); if (i >= 0) { try { useItem(i); } catch (er) { } } syncAll(); render(true); }
        else if (a === 'un') { const s = SLOTS.find((x) => player.equipment[x] && player.equipment[x].name === n); if (s) { try { unequip(s); } catch (er) { } } render(true); }
        else if (a === 'skin') setSkin(n, el.dataset.s);
        else if (a === 'skinall') setSkinAll(n, el.dataset.s);
        else if (a === 'pvs') { S.ui.pvStage = n === 'auto' ? null : Number(n); render(true); }
    }
    function open(tab) { if (!ensureDOM() || !ensure()) return; if (tab && CLS[tab]) S.ui.tab = tab; S.ui.open = true; $('mimic-win').classList.add('on'); document.body.classList.add('mimic-open'); try { window.Pets && Pets.close && Pets.close(); } catch (e) { } render(true); }
    function close() { S.ui.open = false; const w = $('mimic-win'); if (w) w.classList.remove('on'); document.body.classList.remove('mimic-open'); }
    function toggle() { if (S.ui.open) close(); else open(); }
    function chip() {
        if (!ensureDOM() || !ensure()) return; const c = $('mimic-chip'); if (!c) return;
        const nOwn = LIST.filter((p) => owned(p.n)).length, eq = equipped(), pct = player.mimicPct | 0;
        const sig = nOwn + '|' + eq.map((e) => e.name + e.lvl).join(',') + '|' + pct; if (sig === S.lastSig) return; S.lastSig = sig;
        c.classList.toggle('show', nOwn > 0);
        if (nOwn > 0) { const nm = (eq[0] && eq[0].name) || LIST.find((p) => owned(p.n)).n; c.innerHTML = img(nm, 26) + '<span>Mímicos</span><small>' + (pct ? pct + '%' : 'N') + '</small>'; c.title = 'Itens Mímicos (' + nOwn + ' peças) — XP desviado: ' + pct + '% (tecla N)'; }
    }
    document.addEventListener('keydown', (e) => {
        if (!gameOn() || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '') || e.ctrlKey || e.metaKey || e.altKey) return;
        const k = (e.key || '').toLowerCase();
        if (k === 'n') toggle(); else if (k === 'escape' && S.ui.open) close();
    });

    /* ============================ GANCHOS (sem editar o código do jogo) ============================ */
    let wrapped = false;
    const carry = (from, to) => { try { Object.keys(from).forEach((k) => { if (k[0] === '_') to[k] = from[k]; }); } catch (e) { } };   // mantém as marcas de outros módulos (evita embrulhar duas vezes)
    function wrapAll() {
        if (wrapped) return; wrapped = true; const W = window;
        if (typeof W.addXP === 'function') { const o = W.addXP; W.addXP = function (sK, a) { let a2 = a; try { if (a > 0 && typeof player !== 'undefined' && player && player.stats && player.stats.skills && player.stats.skills[sK]) a2 = divert(a); } catch (e) { console.error(e); } return o.call(this, sK, a2); }; carry(o, W.addXP); }
        if (typeof W.applyDamage === 'function') {
            const o = W.applyDamage; W.applyDamage = function (t, dmg, sT, maxHit) {
                let d2 = dmg, boosted = false;
                try {
                    const own = window.Pets && Pets._P && Pets._P.own;
                    if (!own && dmg > 0 && gameOn()) { const pc = bonus().dmgPct[sT] || 0; if (pc > 0) { d2 = sr(dmg * (1 + pc / 100)); boosted = d2 !== dmg; } }
                } catch (e) { }
                return o.call(this, t, d2, sT, boosted ? Math.max(maxHit || 0, d2) : maxHit);
            }; carry(o, W.applyDamage);
        }
        if (typeof W.useItem === 'function') {
            const o = W.useItem; W.useItem = function (i) {
                try { if (!(typeof isBankOpen !== 'undefined' && isBankOpen)) { const it = player.inventory[i]; if (it && (it.mimicSkin || (itemDB[it.name] && itemDB[it.name].mimicSkin))) { if (useSkinItem(i)) return; } } } catch (e) { console.error(e); }
                return o.apply(this, arguments);
            }; carry(o, W.useItem);
        }
    }
    function mana() {   // regen de mana do set do Mago: mregen% da mana máxima a cada 10 s
        const m = bonus().mregen; if (!(m > 0) || !(player.stats.hp > 0) || player.stats.mp >= player.stats.maxMp) { S.mAcc = 0; return; }
        S.mAcc += player.stats.maxMp * m / 100 * 0.25 / 10; if (S.mAcc >= 1) { const g = Math.floor(S.mAcc); S.mAcc -= g; player.stats.mp = Math.min(player.stats.maxMp, player.stats.mp + g); try { updateUI(); } catch (e) { } }
    }
    function tick() {
        if (!gameOn() || !ensure()) return;
        const sig = LIST.map((p) => (where(p.n) ? lvlOf(p.n) : 0)).join(','); if (sig !== S.syncSig) { S.syncSig = sig; syncAll(); }
        chip(); mana();
        if (S.ui.open) { try { const pw = $('pets-win'); if (pw && pw.classList.contains('on')) close(); else render(false); } catch (e) { } }
    }
    function wire() { merge(); registerStats(); wrapTip(); wrapAll(); setInterval(() => { try { tick(); } catch (e) { console.error(e); } }, 250); setInterval(() => { try { if (S.ui.open) drawPreviews(); } catch (e) { } }, 90); }
    window.addEventListener('load', () => { wire(); setTimeout(() => { registerStats(); wrapTip(); }, 1500); });

    window.Mimic = {
        PIECES, LIST, CLS, SETB, SK, SKIN_IDS, SPECIAL, MAXLVL, cfg, merge, grant, takeMail, setPct, addXp: addXpTo, need, statsAt, setInfo, bonus, equipped, where, is: isMimic, brief, tipHtml, iconOverlay, iconKey, overlay, open, close, toggle, divert, syncAll,
        setSkin, setSkinAll, skinOf, skinUnlocked, stageOf, useSkinItem, previewEquip, drawPreviews,
        pct: () => (gameOn() ? player.mimicPct | 0 : 0), lvl: (n) => (gameOn() ? lvlOf(n) : 1),
        state: () => ({ mimic: gameOn() ? player.mimic : null, skins: gameOn() ? player.mimicSkins : null, pct: gameOn() ? player.mimicPct : 0, acc: S.acc, open: S.ui.open }), _S: S
    };
})();
