/* MiniScape 2D — Itens Mímicos: equipamentos vivos que evoluem com o personagem.
   Três sets (Guerreiro 6 peças, Arqueiro 5, Mago 5): capacete/capuz/chapéu, armadura/gibão/manto, arma, escudo (só guerreiro), anel e amuleto.
   - Cada peça tem estado próprio em player.mimic[nome] = { lvl 1..50, xp } (uma peça de cada nome por conta). Os atributos escalam com o nível e entram em
     Stats.addSource('mimic', ...) enquanto a peça estiver equipada; defesa e dano base são gravados no próprio item (defBonus / bonusDmg) para o resto do jogo.
   - XP desviado: player.mimicPct (0..100, padrão 0). De todo XP ganho em qualquer perícia, X% vai para os Mímicos equipados (divididos igualmente entre as peças abaixo do
     nível 50) e o jogador fica com (100-X)%. Restos de arredondamento se acumulam (nada se perde nem se duplica).
   - Set: parcial (2+ peças) dá o bônus base × peças/total; completo dá o bônus cheio + marcos (nível médio 10/25/50). Escala com o nível médio das peças.
   - Ligados à conta: não vão ao mercado/troca (cliente e servidor), não se desmancham, não se encantam nem se jogam fora; o banco aceita.
   - Obtenção: drops raros de chefes / chefe de mundo / masmorras, baús de pesca e a "Caixa Mímica" (artesanal, materiais raros).
   API: Mimic.grant(nome) · Mimic.setPct(n) · Mimic.addXp(nome, n) · Mimic.bonus() · Mimic.state() · Mimic.open()/close() (tecla N) · Mimic.openBox() · Mimic.PIECES */
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
        P('guerreiro', 'Elmo Mímico do Guerreiro', 'head', '⛑️', 'Um elmo que pisca quando ninguém olha. Cresce com você.', { defBonus: [2, 16], dr: [0.5, 3] }, { hat: 'helmet', w: 2.0 }),
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
    const BOX = 'Caixa Mímica';
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
    const cfg = { drop: { boss: 0.06, minor: 0.01, wboss: 0.3, deep: 0.004, chest: 0.012, fish: 0.004 }, BOX_RECIPE: 'Gold Bar,6|Dragon Scale,4|Stone Core,2|Soul Gem,1' };
    const BOSS_P = { dragon_boss: 0.1, lich_boss: 0.14, wboss_golem: 0.3 };

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
        const it = { name: p.n, icon: p.icon, type: 'equipment', slot: p.slot, stackable: false, weight: p.w || 1, desc: p.desc + ' (Mímico: evolui com XP própria; ligado à conta.)', mimic: p.cls, col: C.col };
        if (p.hat) it.hat = p.hat; if (p.robe) it.robe = true; if (p.tool) it.tool = p.tool; if (p.gem) it.gem = p.gem;
        if (st.defBonus) it.defBonus = st.defBonus; if (st.bonusDmg) it.bonusDmg = st.bonusDmg;
        return it;
    }
    function merge() {
        try {
            if (typeof itemDB === 'undefined') return;
            LIST.forEach((p) => { const d = def(p); const cur = itemDB[p.n]; if (!cur) itemDB[p.n] = d; else Object.assign(cur, d); });
            const box = { name: BOX, icon: '📦', type: 'consumable', stackable: false, weight: 2, mimicBox: true, desc: 'Uma caixa que mexe sozinha. Abra para receber uma peça Mímica aleatória (de preferência uma que você ainda não tem). Ligada à conta.', recipe: cfg.BOX_RECIPE, craftQty: 1 };
            if (!itemDB[BOX]) itemDB[BOX] = box; else Object.assign(itemDB[BOX], box);
        } catch (e) { console.error('Mimic.merge', e); }
    }
    function syncItem(it) {   // aplica os campos fixos do catálogo + defesa/dano do nível atual
        const p = it && PIECES[it.name]; if (!p) return false; delete it.req; const d = def(p), st = statsAt(p, lvlOf(it.name)); let ch = false;
        for (const k of ['icon', 'type', 'slot', 'mimic', 'col', 'hat', 'robe', 'tool', 'gem', 'weight', 'desc']) { if (d[k] !== undefined && JSON.stringify(it[k]) !== JSON.stringify(d[k])) { it[k] = d[k]; ch = true; } }
        for (const k of ['defBonus', 'bonusDmg']) { const v = st[k] || 0; if ((it[k] || 0) !== v) { if (v) it[k] = v; else delete it[k]; ch = true; } }
        if (it.ench) { delete it.ench; ch = true; }
        return ch;
    }
    function syncAll() {
        if (!gameOn()) return;
        let ch = false; const f = (it) => { if (it && PIECES[it.name] && syncItem(it)) ch = true; };
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

    /* ============================ OBTENÇÃO ============================ */
    function bestClass() {
        let best = 'guerreiro', bv = -1; try { CLS_IDS.forEach((c) => { const sk = player.stats.skills[CLS[c].skill]; const v = sk ? sk.level : 1; if (v > bv) { bv = v; best = c; } }); } catch (e) { }
        return best;
    }
    function rollPiece() {   // 70% da classe em que o jogador é mais forte, 30% de qualquer uma; prefere peça que ainda não tem
        const cls = rnd() < 0.7 ? bestClass() : CLS_IDS[Math.floor(rnd() * CLS_IDS.length)];
        const pool = LIST.filter((p) => p.cls === cls), fresh = pool.filter((p) => !owned(p.n));
        const any = LIST.filter((p) => !owned(p.n));
        const from = fresh.length ? fresh : (any.length ? any : pool);
        return from[Math.floor(rnd() * from.length)];
    }
    function grant(name, opt) {
        const p = PIECES[name]; if (!p || !ensure() || !itemDB[name]) return false; opt = opt || {};
        if (owned(name)) {   // só existe uma peça de cada nome por conta: o duplicado é absorvido como XP
            const s = stOf(name);
            if (s.lvl >= MAXLVL) { try { addInvItem('Coins', 3000); } catch (e) { } say('Você já tem ' + name + ' no nível máximo: ele virou 3.000 moedas.', '#c58bff'); }
            else { const x = Math.max(30, Math.round(need(s.lvl) * 0.6)); addXpTo(name, x); say('Você já tem ' + name + ': o duplicado foi absorvido (+' + x + ' XP).', '#c58bff'); }
            sfx('pickup'); saveSoon(); S.lastSig = ''; return true;
        }
        if (!player.mimic[name]) player.mimic[name] = { lvl: 1, xp: 0 };
        if (typeof addInvItem === 'function' && addInvItem(name, 1)) { try { addPickupText(name, 1); } catch (e) { } }
        else { try { gameMaps[currentMap].entities.push({ id: newEntId(), type: 'ground_item', item: name, qty: 1, x: player.x + 10, y: player.y + 10, w: 20, h: 20, active: true, life: 90000, np: 1 }); say('Mochila cheia: ' + name + ' caiu no chão. Pegue com Espaço.', '#e67e22'); } catch (e) { return false; } }
        if (!opt.quiet) { say('Raro! Você encontrou: ' + name + ' (Mímico)', CLS[p.cls].gold); sfx('levelup'); try { Art.burst(player.x, player.y - 14, '#c58bff', 20, 1.7); } catch (e) { } }
        syncAll(); saveSoon(); S.lastSig = ''; return true;
    }
    function lm() { try { return Stats.luckMul ? Stats.luckMul() : 1; } catch (e) { return 1; } }
    const DEEP = new Set(['cripta_real', 'torre_mago', 'ruinas', 'mina_abandonada', 'ninho_dragao', 'catacumbas']);   // masmorras profundas
    function dropChance(t, d, key) {
        if (BOSS_P[key] !== undefined) return BOSS_P[key];
        if (t.wb || /^wboss/.test(key)) return cfg.drop.wboss;
        const hp = d.hp || 0;
        if (d.group === 'chefe') return hp >= 500 ? cfg.drop.boss * 1.6 : hp >= 300 ? cfg.drop.boss : hp >= 100 ? cfg.drop.minor : 0;   // chefes de verdade; os "chefes" fracos dão pouco
        if (DEEP.has(currentMap) && hp >= 60) return cfg.drop.deep;
        return 0;
    }
    function onKill(t) {
        try {
            if (!ensure()) return; const key = t.dbKey || '', d = (typeof npcDB !== 'undefined' && npcDB[key]) || {};
            const ch = dropChance(t, d, key);
            if (ch > 0 && rnd() < ch * lm()) { const p = rollPiece(); if (p) grant(p.n); }
        } catch (e) { console.error(e); }
    }
    function fromSource(k) { try { if (ensure() && rnd() < (cfg.drop[k] || 0) * lm()) { const p = rollPiece(); if (p) grant(p.n); } } catch (e) { } }
    function openBox(index) {   // usa a Caixa Mímica da mochila (índice) ou a primeira
        if (!ensure()) return false;
        const i = typeof index === 'number' ? index : player.inventory.findIndex((x) => x && x.name === BOX); const it = player.inventory[i];
        if (!it || it.name !== BOX) { say('Você não tem uma Caixa Mímica.', '#e74c3c'); return false; }
        const p = rollPiece(); if (!p) return false;
        player.inventory.splice(i, 1);
        if (!grant(p.n, { quiet: true })) { player.inventory.splice(i, 0, it); say('Mochila cheia.', '#e74c3c'); return false; }
        say('A caixa abriu os olhos e entregou: ' + p.n + '!', CLS[p.cls].gold); sfx('levelup'); try { Art.burst(player.x, player.y - 14, '#e8b93c', 24, 1.8); updateUI(); } catch (e) { }
        return true;
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
        h += '<div class="tt-stat" style="color:#9a8fb0">Ligado à conta: não negocia, não desmancha. XP em Mímicos (N).</div>';
        return h;
    }
    const bonusText = (cls, b) => ORDER.filter((k) => b[k] > 0).map((k) => KEYLBL(cls, k) + ' ' + FMT[k](b[k])).join(', ');
    function wrapTip() { try { if (window.Stats && Stats.tipHtml && !Stats.tipHtml._mimic) { const o = Stats.tipHtml; Stats.tipHtml = function (it) { let h = ''; try { h = o.apply(this, arguments); } catch (e) { } try { h += tipHtml(it); } catch (e) { } return h; }; Stats.tipHtml._mimic = 1; } } catch (e) { } }

    /* ============================ ÍCONE E DESENHO ============================ */
    // ícone: aura roxa/dourada atrás da peça e um "selo" de baú-mímico (tampa com olhinhos e dentes) no canto
    function iconOverlay(g, SZ, it) {
        const p = PIECES[it && it.name]; if (!p) return; const C = CLS[p.cls], k = SZ / 64;
        g.save(); g.scale(k, k);
        g.globalCompositeOperation = 'destination-over';
        const r = g.createRadialGradient(32, 34, 4, 32, 34, 34); r.addColorStop(0, 'rgba(190,120,255,.5)'); r.addColorStop(0.6, 'rgba(120,70,200,.22)'); r.addColorStop(1, 'rgba(120,70,200,0)');
        g.fillStyle = r; g.fillRect(0, 0, 64, 64);
        g.globalCompositeOperation = 'source-over';
        // selo no canto inferior direito
        const x = 38, y = 40; g.lineJoin = 'round';
        g.fillStyle = '#f4efe2'; g.strokeStyle = '#1b1109'; g.lineWidth = 1;
        for (let i = 0; i < 4; i++) { const tx = x + 2.5 + i * 4.6; g.beginPath(); g.moveTo(tx, y + 11); g.lineTo(tx + 2.3, y + 17); g.lineTo(tx + 4.6, y + 11); g.closePath(); g.fill(); g.stroke(); }
        g.beginPath(); g.moveTo(x, y + 12); g.lineTo(x, y + 6); g.quadraticCurveTo(x + 11.5, y - 6, x + 23, y + 6); g.lineTo(x + 23, y + 12); g.closePath();
        const gr = g.createLinearGradient(x, y - 4, x + 23, y + 12); gr.addColorStop(0, '#b784f0'); gr.addColorStop(0.5, C.col); gr.addColorStop(1, '#2d1650'); g.fillStyle = gr; g.fill(); g.lineWidth = 2.2; g.stroke();
        g.strokeStyle = C.gold; g.lineWidth = 1.3; g.beginPath(); g.moveTo(x + 1.5, y + 10.2); g.lineTo(x + 21.5, y + 10.2); g.stroke();
        for (const ex of [x + 7.2, x + 15.8]) { g.fillStyle = '#fff3b8'; g.beginPath(); g.ellipse(ex, y + 5.4, 2.7, 2.3, 0, 0, Math.PI * 2); g.fill(); g.lineWidth = 1; g.strokeStyle = '#1b1109'; g.stroke(); g.fillStyle = '#1b1109'; g.beginPath(); g.ellipse(ex + 0.5, y + 5.6, 1.1, 1.4, 0, 0, Math.PI * 2); g.fill(); }
        // brilho no objeto
        g.fillStyle = 'rgba(255,230,150,.85)'; g.beginPath(); g.moveTo(12, 8); g.lineTo(13.4, 12); g.lineTo(17.4, 13.4); g.lineTo(13.4, 14.8); g.lineTo(12, 18.8); g.lineTo(10.6, 14.8); g.lineTo(6.6, 13.4); g.lineTo(10.6, 12); g.closePath(); g.fill();
        g.restore();
    }
    const MC = { purple: '190,120,255', gold: '255,215,110' };
    // desenho no personagem (chamado por art.js depois do corpo; pés em (0,0), vista 'side' olha para a direita)
    function overlay(ctx, view, equip, info, now) {
        if (!equip || !info) return;
        const mm = (it) => !!(it && typeof it.name === 'string' && PIECES[it.name]);
        const H = mm(equip.head), B = mm(equip.body), W = mm(equip.weapon), SH = mm(equip.shield); if (!(H || B || W || SH)) return;
        const front = view === 'front', back = view === 'back', side = view === 'side';
        const pulse = 0.5 + 0.5 * Math.sin(now * 2.3), sx = info.sx || 1, sy = info.sy || 1, bob = info.bob || 0;
        const cy = -22 * sy - bob, hy = info.hy;
        const blink = (now % 4.3) < 0.13;
        const glow = (x, y, r, c, a) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(' + c + ',' + a + ')'); g.addColorStop(1, 'rgba(' + c + ',0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        if (B) glow(0, cy, 13 * sx, MC.purple, 0.13 + 0.12 * pulse);
        if (H) glow(0, hy, 10, MC.purple, 0.12 + 0.12 * pulse);
        if (W && info.hand) glow(info.hand.x, info.hand.y - 6, 9, MC.gold, 0.1 + 0.12 * pulse);
        // faíscas douradas girando
        const sp = (cx, cy2, rx, ry, ph, a) => { const t = now * 1.5 + ph; ctx.fillStyle = 'rgba(' + MC.gold + ',' + (a * (0.5 + 0.5 * Math.sin(t * 2))).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(cx + Math.cos(t) * rx, cy2 + Math.sin(t) * ry, 0.9, 0, Math.PI * 2); ctx.fill(); };
        if (B) { sp(0, cy, 8, 9, 0, 0.9); sp(0, cy, 8, 9, 3.1, 0.9); } if (H) sp(0, hy - 2, 9, 4, 1.4, 0.9);
        ctx.restore();
        const eye = (x, y, rx, ry, dir) => {
            ctx.fillStyle = '#fff1a8'; ctx.strokeStyle = '#1b1109'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.ellipse(x, y, rx, blink ? 0.25 : ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            if (!blink) { ctx.fillStyle = '#1b1109'; ctx.beginPath(); ctx.ellipse(x + (dir || 0) * 0.35, y + 0.1, rx * 0.38, ry * 0.8, 0, 0, Math.PI * 2); ctx.fill(); }
        };
        if (B) {
            if (front) {
                eye(-2.4 * sx, cy - 3.4, 1.25, 1.2, 0); eye(2.4 * sx, cy - 3.4, 1.25, 1.2, 0);
                const ty = cy + 5.6; ctx.strokeStyle = 'rgba(30,8,50,.85)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-4.4 * sx, ty); ctx.quadraticCurveTo(0, ty + 1.4, 4.4 * sx, ty); ctx.stroke();
                ctx.fillStyle = '#f7f1e0'; ctx.strokeStyle = '#1b1109'; ctx.lineWidth = 0.35;
                for (let i = 0; i < 5; i++) { const tx = (-4 + i * 2) * sx; ctx.beginPath(); ctx.moveTo(tx - 0.9, ty + 0.5 + (i === 0 || i === 4 ? 0 : 0.5)); ctx.lineTo(tx, ty + 2.6); ctx.lineTo(tx + 0.9, ty + 0.5 + (i === 0 || i === 4 ? 0 : 0.5)); ctx.closePath(); ctx.fill(); ctx.stroke(); }
            } else if (side) {
                eye(3.2 * sx, cy - 3.4, 1.15, 1.2, 1);
                ctx.fillStyle = '#f7f1e0'; ctx.strokeStyle = '#1b1109'; ctx.lineWidth = 0.35;
                for (let i = 0; i < 2; i++) { const ty = cy + 3 + i * 2.6; ctx.beginPath(); ctx.moveTo(4.6 * sx, ty); ctx.lineTo(2.8 * sx, ty + 0.9); ctx.lineTo(4.6 * sx, ty + 1.8); ctx.closePath(); ctx.fill(); ctx.stroke(); }
            } else {   // costas: costura dourada com runa
                ctx.strokeStyle = 'rgba(' + MC.gold + ',' + (0.5 + 0.3 * pulse).toFixed(2) + ')'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-3 * sx, cy - 5); ctx.lineTo(0, cy - 2); ctx.lineTo(3 * sx, cy - 5); ctx.moveTo(0, cy - 2); ctx.lineTo(0, cy + 6); ctx.stroke();
            }
        }
        if (H && front && equip.head.hat === 'helmet') { eye(-2.5, hy + 0.9, 0.95, 0.8, 0); eye(2.5, hy + 0.9, 0.95, 0.8, 0); }
        if (H && side && equip.head.hat === 'helmet') eye(3.6, hy + 0.7, 0.9, 0.8, 1);
        if (SH) {
            if (front && info.handL) eye(info.handL.x - 1, info.handL.y - 4.4, 2.1, 1.5, 0);
            else if (back) eye(0, -21.6 * sy - bob, 2.1, 1.5, 0);
        }
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
    function pieceRow(p, cur) {
        const n = p.n, w = where(n);
        if (!w) return `<div class="mm-row lock"><span style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex:none">❔</span><div class="mm-rt"><b>???</b><small>${esc(slotName(p.slot))} · ainda não encontrado</small></div></div>`;
        const s = stOf(n), nx = s.lvl < MAXLVL ? need(s.lvl) : 0, pc = nx ? Math.min(100, s.xp / nx * 100) : 100;
        const now = statLine(statsAt(p, s.lvl), p.cls), nxt = s.lvl < MAXLVL ? statLine(statsAt(p, s.lvl + 1), p.cls) : '';
        const where_ = w === 'eq' ? 'equipada' : w === 'inv' ? 'na mochila' : 'no banco';
        const btn = w === 'eq' ? '<button class="mm-b" data-a="un" data-n="' + esc(n) + '">Tirar</button>' : w === 'inv' ? '<button class="mm-b" data-a="eq" data-n="' + esc(n) + '">Equipar</button>' : '';
        return `<div class="mm-row${w === 'eq' ? ' eq' : ''}">${img(n, 40)}<div class="mm-rt"><b>${esc(n)}</b><small>${esc(slotName(p.slot))} · ${where_} · Nível ${s.lvl}/${MAXLVL}${nx ? ' · ' + s.xp + '/' + nx + ' XP' : ' (máx.)'}</small><div class="mm-bar"><i style="width:${pc.toFixed(1)}%"></i></div><small>${esc(now)}</small>${nxt ? `<small class="nx">Nv ${s.lvl + 1}: ${esc(nxt)}</small>` : ''}</div>${btn}</div>`;
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
        h += `<div class="mm-sec">Peças · ${esc(CLS[tab].name)}</div>` + LIST.filter((p) => p.cls === tab).map((p) => pieceRow(p)).join('');
        if (nOwn === 0) h += `<div class="mm-note">Itens Mímicos são raros: caem de chefes, do chefe de mundo, de monstros das masmorras profundas e de baús de pesca. Também dá para fabricar a <b>Caixa Mímica</b> (Gold Bar, Dragon Scale, Stone Core e Soul Gem) em Ofícios. Cada peça sobe até o nível ${MAXLVL} com XP própria.</div>`;
        const box = player.inventory.filter((i) => i && i.name === BOX).length; if (box) h += `<div class="mm-box"><div>Você tem ${box} Caixa${box > 1 ? 's' : ''} Mímica${box > 1 ? 's' : ''}.</div><div><button class="mm-b" data-a="box">Abrir uma caixa</button></div></div>`;
        if (typeof userRole !== 'undefined' && userRole === 'admin') h += `<div class="mm-box"><div class="mm-sec">Admin: dar peça</div><div class="mm-adm"><select id="mm-adm-sel">${LIST.map((p) => `<option value="${esc(p.n)}">${esc(p.n)}</option>`).join('')}<option value="${BOX}">${BOX}</option></select><button class="mm-b" data-a="adm">Dar</button></div></div>`;
        h += '</div>';
        if (!force && w._h === h) return;
        const keep = w.querySelector('.mm-body'), st = keep ? keep.scrollTop : 0, sel = $('mm-adm-sel') ? $('mm-adm-sel').value : null; w._h = h; w.innerHTML = h;
        const nb = w.querySelector('.mm-body'); if (nb) nb.scrollTop = st; if (sel && $('mm-adm-sel')) $('mm-adm-sel').value = sel;
    }
    function onClick(e) {
        const el = e.target.closest('[data-a]'); if (!el) return; const a = el.dataset.a, n = el.dataset.n; if (!ensure()) return;
        if (a === 'close') close(); else if (a === 'tab') { S.ui.tab = n; render(true); }
        else if (a === 'pct') setPct(Number(n));
        else if (a === 'eq') { const i = player.inventory.findIndex((x) => x && x.name === n); if (i >= 0) { try { useItem(i); } catch (er) { } } syncAll(); render(true); }
        else if (a === 'un') { const s = SLOTS.find((x) => player.equipment[x] && player.equipment[x].name === n); if (s) { try { unequip(s); } catch (er) { } } render(true); }
        else if (a === 'box') { openBox(); render(true); }
        else if (a === 'adm') { const v = $('mm-adm-sel') && $('mm-adm-sel').value; if (v === BOX) { addInvItem(BOX, 1); updateUI(); } else if (PIECES[v]) grant(v); render(true); }
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
                let d2 = dmg, was = false, boosted = false;
                try {
                    const own = window.Pets && Pets._P && Pets._P.own;
                    if (!own && dmg > 0 && gameOn()) { const pc = bonus().dmgPct[sT] || 0; if (pc > 0) { d2 = sr(dmg * (1 + pc / 100)); boosted = d2 !== dmg; } }
                    was = !!(t && t.type === 'enemy' && t.active !== false && t.hp > 0 && !own);
                } catch (e) { }
                const r = o.call(this, t, d2, sT, boosted ? Math.max(maxHit || 0, d2) : maxHit);
                try { if (was && t.hp <= 0) onKill(t); } catch (e) { console.error(e); }
                return r;
            }; carry(o, W.applyDamage);
        }
        if (typeof W.useItem === 'function') {
            const o = W.useItem; W.useItem = function (i) {
                try { if (!(typeof isBankOpen !== 'undefined' && isBankOpen)) { const it = player.inventory[i]; if (it && it.name === BOX) { openBox(i); return; } } } catch (e) { console.error(e); }
                return o.apply(this, arguments);
            }; carry(o, W.useItem);
        }
        try { if (window.Life && Life.cnt) { const o = Life.cnt; Life.cnt = function (k) { const r = o.apply(this, arguments); if (k === 'chests') fromSource('chest'); else if (k === 'rarefish') fromSource('fish'); return r; }; carry(o, Life.cnt); } } catch (e) { }
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
    function wire() { merge(); registerStats(); wrapTip(); wrapAll(); setInterval(() => { try { tick(); } catch (e) { console.error(e); } }, 250); }
    window.addEventListener('load', () => { wire(); setTimeout(() => { registerStats(); wrapTip(); }, 1500); });

    window.Mimic = {
        PIECES, LIST, CLS, SETB, BOX, MAXLVL, cfg, merge, grant, setPct, addXp: addXpTo, need, statsAt, setInfo, bonus, equipped, where, is: isMimic, brief, tipHtml, iconOverlay, overlay, open, close, toggle, openBox, rollPiece, onKill, fromSource, divert, syncAll,
        pct: () => (gameOn() ? player.mimicPct | 0 : 0), lvl: (n) => (gameOn() ? lvlOf(n) : 1),
        state: () => ({ mimic: gameOn() ? player.mimic : null, pct: gameOn() ? player.mimicPct : 0, acc: S.acc, open: S.ui.open }), _S: S
    };
})();
