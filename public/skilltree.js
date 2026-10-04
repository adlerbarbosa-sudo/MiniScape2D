/* MiniScape 2D — Árvores de Habilidades (tecla K): Guerreiro (Combate), Arqueiro (Arquearia) e Mago (Magia).
   - PONTOS: cada perícia gera pontos só da própria árvore: pontos = floor((nível - 1) / 2) (nível 3 = 1 ponto, nível 99 = 49). Gastos de uma árvore nunca passam do que a perícia dela permite
     (o servidor confere pelo save: SkillNodes.clean). Pontos de uma árvore não valem em outra; qualquer um pode investir em qualquer árvore (a da sua classe vem destacada com ★).
   - NÓS (skillnodes.js): passivas (1 ponto por rank, até 5 ranks) somam atributos via Stats.addSource('skilltree') e bônus próprios (dano %, vida/mana máx., regenerações, recarga);
     ativas (2 pontos por rank, até 3 ranks) vão para a barra de habilidades (teclas Q, E, F, G; no celular, botões ao lado) e têm recarga, custo e efeitos próprios.
   - ESTADO (playerData.skillTree): { pts:{warrior:{id:rank},archer:{},mage:{}}, bar:[4 ids|null], hint, rs:{resets por árvore}, cd:{id: fim da recarga em ms}, ap:{hp,mp embutidos no maxHp/maxMp} }.
   - Custos de recurso: TODAS as ativas gastam MANA (8 a 55 de mana, escala da mana v2 = 50 + 5 por nível de Magia + bônus). O Arqueiro gasta mana E flechas (respeita "poupar munição"); Guerreiro e Arqueiro recuperam +1,5 de mana/s extra (o Mago já tem mais mana).
     Exigem arma: corpo a corpo / arco+flechas / cajado. Sem mana a habilidade não sai ("Sem mana!").
   - RECARGA: básicas 4-10 s, médias 10-25 s, supremas 30-60 s (antes da redução). Atributo Stats.cdr (%; teto 40%, recarga mínima 1,5 s) soma passivas da árvore (Disciplina, Foco, Maestria...) e itens (campo `cdr`).
   - CAPSTONES (camada 6, 3 pontos, alternáveis ON/OFF, tecla X ou botão na barra; ligado/desligado fica em skillTree.tg): Aljava Mágica (arco sem flechas, gasta 2-6 de mana por disparo), Fonte Arcana (magias sem runas, gasta mais mana),
     Vigor Inabalável (golpes cercam de vigor: cada golpe corpo a corpo cura 1,5% da vida e custa 3 de mana). Ganchos em tryInteract (sem editar o código do jogo).
   - Dano das ativas = dano-base da perícia (o mesmo "d" dos golpes comuns) x multiplicador do rank x (1 + dano% + dano de habilidades%). Passa por applyDamage (crítico, roubo de vida, XP, loot, relatório ao servidor).
     Limitador de relatórios: no máx. ~9 golpes/s (rajada 8) e ~1100 de dano/s vindos de habilidades, para ficar longe dos tetos de security.js (20 relatórios/s, 3000 de dano/s, 900 por golpe).
   - Efeitos visuais, partículas e projéteis são LOCAIS (outros jogadores só veem a animação de ataque); lentidão/atordoamento valem para quem simula os monstros do mapa (o host) e para o ataque do monstro em si.
   - Redistribuir: 1ª vez grátis por árvore; depois custa 250 moedas por ponto gasto naquela árvore.
   API: SkillTree.open/close/toggle · learn(id) · reset(tree) · cast(slot) · points(tree) · state() · api (hit, aoe, ring... para setskills.js) */
(function () {
    'use strict';
    const SN = window.SkillNodes; if (!SN) { console.error('skillnodes.js não carregou'); return; }
    const $ = (id) => document.getElementById(id);
    const TREES = SN.TREES, NODES = SN.NODES, FR = 60, BAR_N = SN.BAR_SLOTS;
    const KEYS = ['q', 'e', 'f', 'g'];
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const rnd = Math.random, TAU = Math.PI * 2;
    const fnum = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
    const say = (t, c) => { try { setActionText(t, c || '#9ad3ff'); } catch (e) { } };
    const sr = (v) => { const f = Math.floor(v); return f + (rnd() < v - f ? 1 : 0); };
    const at = (arr, r) => arr[Math.max(0, Math.min(arr.length, r) - 1)];
    const gameOn = () => typeof player !== 'undefined' && player && player.stats && player.equipment && player.stats.skills && typeof currentUser !== 'undefined' && currentUser && $('game-wrapper') && $('game-wrapper').style.display !== 'none';
    const lv = (k) => { const s = player.stats.skills[k]; return s ? Math.max(1, Math.floor(s.level) || 1) : 1; };
    const ex = (o) => o.x + (o.w || 30) / 2, ey = (o) => o.y + (o.h || 30) / 2, er = (o) => Math.max(10, Math.min(o.w || 30, o.h || 30) * 0.5);
    const wpn = () => (player.equipment && player.equipment.weapon) || null;
    const isPetRide = () => { try { return !!(window.Pets && Pets.isPetMounted && Pets.isPetMounted()); } catch (e) { return false; } };

    /* ============================ ESTADO ============================ */
    const S = {
        pl: null, frame: 0, bonus: {}, pass: {}, dmgPct: { combat: 0, ranged: 0, magic: 0 }, skd: { combat: 0, ranged: 0, magic: 0 }, cdr: 0, hpRegen: 0, mpRegen: 0,
        buffs: [], barrier: null, invuln: 0, dash: null, counter: 0, counterQ: 0, Q: [], tok: 8, win: [], pj: [], zn: [], fx: [], marks: [], status: [], en: { src: null, len: -1, t: 0, list: [] },
        lvSig: '', free: { warrior: 0, archer: 0, mage: 0 }, rg: { hp: 0, mp: 0 }, inSkill: false, lastMsg: 0, extra: null, barSig: '', ui: { open: false, tab: 'warrior', sel: null, confirm: null }, tmp: []
    };
    let installed = false;

    /* ---------- estado salvo ---------- */
    function levelsNow() { return { combat: lv('combat'), ranged: lv('ranged'), magic: lv('magic') }; }
    function init() {
        S.pl = player; const r = SN.clean(player.skillTree, levelsNow(), Date.now()), st = r.tree;
        if (player.skillTree && typeof player.skillTree.ap === 'object') { st.ap = { hp: Math.max(0, +player.skillTree.ap.hp | 0), mp: Math.max(0, +player.skillTree.ap.mp | 0) }; }   // vida/mana já embutidas no maxHp/maxMp salvos
        else st.ap = { hp: 0, mp: 0 };
        while (st.bar.length < BAR_N) st.bar.push(null); st.bar.length = BAR_N; player.skillTree = st; S.lvSig = ''; S.buffs.length = 0; S.barrier = null; S.invuln = 0; S.dash = null; S.Q.length = 0; S.pj.length = 0; S.zn.length = 0; S.fx.length = 0; S.marks.length = 0; S.status.length = 0; S.tok = 8; S.win.length = 0;
        recompute(); S.free = freeAll(); S.baselined = true;
    }
    function ensure() { if (!gameOn()) return null; if (S.pl !== player) init(); return player.skillTree; }
    function points(tree) { const t = TREES[tree], st = ensure(); if (!t || !st) return { total: 0, spent: 0, free: 0, lvl: 1 }; const l = lv(t.skill), total = SN.pointsFor(l), spent = SN.spentOf(st.pts[tree]); return { total, spent, free: Math.max(0, total - spent), lvl: l }; }
    function freeAll() { const o = {}; SN.TREE_IDS.forEach((t) => { o[t] = points(t).free; }); return o; }
    const totalFree = () => SN.TREE_IDS.reduce((a, t) => a + points(t).free, 0);
    const rankOf = (id) => { const n = NODES[id], st = player && player.skillTree; return n && st ? SN.rankOf(st.pts[n.tree], id) : 0; };
    const learnedActives = () => SN.ACTIVE_IDS.filter((id) => rankOf(id) > 0);
    const STAT_KEYS = ['crit', 'critDmg', 'atkSpd', 'dr', 'lifesteal', 'luck', 'moveSpd', 'save', 'spellDmg', 'cdr'];
    function recompute() {   // soma as passivas e ajusta vida/mana máx. (embutidas no maxHp/maxMp; o servidor soma o mesmo limite)
        const st = player.skillTree, b = SN.bonusAll(st); S.bonus = b; S.pass = {}; STAT_KEYS.forEach((k) => { if (b[k] > 0) S.pass[k] = b[k]; });
        const bt = b.byTree; S.dmgPct = { combat: bt.warrior.dmg || 0, ranged: bt.archer.dmg || 0, magic: bt.mage.dmg || 0 }; S.skd = { combat: bt.warrior.skd || 0, ranged: bt.archer.skd || 0, magic: bt.mage.skd || 0 };
        S.cdr = Math.min(40, b.cdr || 0); S.hpRegen = b.hpRegen || 0; S.mpRegen = b.mpRegen || 0;
        const hp = Math.round(b.maxHp || 0), mp = Math.round(b.maxMp || 0), dh = hp - (st.ap.hp | 0), dm = mp - (st.ap.mp | 0);
        if (dh) { player.stats.maxHp = Math.max(1, player.stats.maxHp + dh); player.stats.hp = dh > 0 ? Math.min(player.stats.maxHp, player.stats.hp + dh) : Math.min(player.stats.hp, player.stats.maxHp); st.ap.hp = hp; }
        if (dm) { player.stats.maxMp = Math.max(Balance.MIN_MP, player.stats.maxMp + dm); player.stats.mp = dm > 0 ? Math.min(player.stats.maxMp, player.stats.mp + dm) : Math.min(player.stats.mp, player.stats.maxMp); st.ap.mp = mp; }
        try { Stats.invalidate(); if (dh || dm) updateUI(); } catch (e) { }
    }
    function validate() {   // níveis mudaram (subiu, ou o servidor corrigiu): tira o que passou do permitido e avisa de pontos novos
        const st = player.skillTree, r = SN.clean(st, levelsNow(), Date.now());
        if (r.trimmed || r.forged) { r.tree.ap = st.ap; r.tree.cd = st.cd || {}; while (r.tree.bar.length < BAR_N) r.tree.bar.push(null); player.skillTree = r.tree; recompute(); S.barSig = ''; }
        const f = freeAll(); let gained = 0; SN.TREE_IDS.forEach((t) => { if (f[t] > S.free[t]) gained += f[t] - S.free[t]; }); S.free = f;
        if (gained > 0 && S.baselined) {
            const first = !player.skillTree.hint; player.skillTree.hint = true;
            say(first ? 'Você ganhou um ponto de habilidade! Pressione K.' : 'Novo ponto de habilidade! (K)', '#ffe27a');
            try { addFloatingText(player.x, player.y - 60, '+' + gained + ' ponto de habilidade', '#ffe27a'); Art.burst(player.x, player.y - 14, '#ffe27a', 12, 1.3); if (window.Sfx) Sfx.play('quest'); } catch (e) { }
            try { saveDataLogic(); } catch (e) { }
        } else if (!player.skillTree.hint && totalFree() > 0) { player.skillTree.hint = true; say('Você tem pontos de habilidade! Pressione K.', '#ffe27a'); }
    }
    function adopt(raw) {   // estado vindo do servidor (depois de "ajustado")
        if (!ensure() || !raw) return; const st = player.skillTree, r = SN.clean(raw, levelsNow(), Date.now()); r.tree.ap = st.ap; r.tree.cd = Object.assign({}, r.tree.cd, st.cd); while (r.tree.bar.length < BAR_N) r.tree.bar.push(null); player.skillTree = r.tree; recompute(); S.barSig = ''; S.free = freeAll(); renderAll();
    }

    /* ============================ DANO E ALVOS ============================ */
    function baseDmg(skill) {   // dano-base (decimal) da perícia: Balance.dmgBase(nível, poder da arma); a faixa dos golpes comuns é [0,9x, 1,5x] desse valor
        const L = lv(skill), w = wpn() || {}, b = (window.Content && Content.buff) ? Content.buff('dmg') : 0;
        let rt;
        if (skill === 'combat') rt = (w.bonusDmg || 0) + b;
        else if (skill === 'ranged') { const am = player.equipment.ammo; rt = (w.bonusDmg || 0) + (am ? (am.bonusDmg || 0) : (capOn('a_aljava_cap') && w.tool === 'ranged' ? quiverBonus(w) : 0)) + b; }
        else { let sp = null; try { sp = spellbookDB.find((s) => s.id === player.activeSpell); } catch (e) { } rt = (sp ? sp.dmg : 3) + (w.bonusDmg || 0) + (window.Stats ? Stats.spellDmg() : 0); }
        return Balance.dmgBase(L, rt);
    }
    const buffDmg = () => { let v = 0; for (const b of S.buffs) if (b.until > S.frame && b.dmg) v += b.dmg; return v; };
    function sdmg(skill, mult) {
        const pc = (S.dmgPct[skill] || 0) + (S.skd[skill] || 0) + buffDmg();
        return Math.max(1, Math.round(baseDmg(skill) * mult * (1 + pc / 100) * (0.92 + rnd() * 0.16)));
    }
    function capDmg(v, mode) {   // o crítico, o conjunto Mímico, pets e marca multiplicam DEPOIS: mantém o golpe final abaixo do teto do servidor (900)
        const worst = (mode === 'crit' || (mode !== 'none' && Stats.critChance() > 0)) ? Stats.critMul() : 1;
        const L = Math.max(lv('combat'), lv('ranged'), lv('magic')), lim = Math.floor(Balance.hitCap(L) * 0.9);   // mesmo teto de Balance.hitCap (usado pelo servidor), com folga
        return Math.max(1, Math.min(v, Math.floor(lim / (worst * 1.3 * 1.5))));
    }
    function enemies() {
        const m = gameMaps[currentMap]; if (!m || !m.entities) return S.en.list.length ? (S.en.list.length = 0, S.en.list) : S.en.list;
        const cur = m.entities, n = performance.now();
        if (S.en.src !== cur || S.en.len !== cur.length || n - S.en.t > 200) { const l = S.en.list; l.length = 0; for (let i = 0; i < cur.length; i++) { const o = cur[i]; if (o && o.type === 'enemy' && o.active && o.hp > 0) l.push(o); } S.en.src = cur; S.en.len = cur.length; S.en.t = n; }
        return S.en.list;
    }
    const alive = (o) => o && o.type === 'enemy' && o.active && o.hp > 0;
    const los = (ax, ay, bx, by) => !window.LOS || LOS.clear(ax, ay, bx, by);
    function pickTarget(range, needLos) {
        const px = player.x, py = player.y - 8; let best = null, bd = 1e9, blocked = false;
        const ok = (o) => { if (!alive(o)) return -1; const d = Math.hypot(ex(o) - player.x, ey(o) - player.y) - er(o) * 0.4; if (d > range) return -1; if (needLos !== false && !los(px, py, ex(o), ey(o))) { blocked = true; return -1; } return d; };
        let rt = null; try { rt = rangedTarget; } catch (e) { }
        if (rt && ok(rt) >= 0) return rt;
        const l = enemies(); for (let i = 0; i < l.length; i++) { const d = ok(l[i]); if (d >= 0 && d < bd) { bd = d; best = l[i]; } }
        S.blocked = blocked && !best; return best;
    }
    function aoe(cx, cy, r, max, fromLos) {   // até "max" inimigos vivos num círculo, os mais próximos primeiro (lista reutilizada: não guarde o resultado)
        const out = S.tmp; out.length = 0; const l = enemies();
        for (let i = 0; i < l.length; i++) { const o = l[i]; if (!alive(o)) continue; const d = Math.hypot(ex(o) - cx, ey(o) - cy) - er(o) * 0.35; if (d > r) continue; if (fromLos && !los(cx, cy - 6, ex(o), ey(o))) continue; o._ad = d; out.push(o); }
        out.sort((a, b) => a._ad - b._ad); if (out.length > max) out.length = max; return out;
    }
    function face(x, y) { const dx = x - player.x, dy = y - player.y; if (Math.abs(dx) > Math.abs(dy)) { player.facing.x = dx > 0 ? 1 : -1; player.facing.y = 0; } else { player.facing.x = 0; player.facing.y = dy > 0 ? 1 : -1; } }
    function stun(o, fr) { o.attackCooldown = Math.max(o.attackCooldown || 0, fr); o._stun = S.frame + fr; if (S.status.indexOf(o) < 0) S.status.push(o); }
    function slow(o, fr, pct) { o._slow = S.frame + fr; o._slowp = pct; if (S.status.indexOf(o) < 0) S.status.push(o); }

    /* ---------- fila de golpes: limita relatórios/s e dano/s ao servidor ---------- */
    function hit(t, dmg, skill, mode, delay) {
        if (!alive(t) || !(dmg > 0)) return; if (S.Q.length > 80) return;
        S.Q.push({ t, dmg: capDmg(dmg, mode), sk: skill, mode: mode || '', due: S.frame + (delay || 0) });
    }
    function drain() {
        S.tok = Math.min(8, S.tok + 0.15); const Q = S.Q; if (!Q.length) return;
        const w = S.win; while (w.length && S.frame - w[0] > FR) w.splice(0, 2);
        let sum = 0; for (let i = 1; i < w.length; i += 2) sum += w[i];
        for (let i = 0; i < Q.length && S.tok >= 1;) {
            const h = Q[i]; if (!alive(h.t)) { Q.splice(i, 1); continue; } if (h.due > S.frame) { i++; continue; }
            if (w.length && sum + h.dmg > Balance.clientSkillPerSec(Math.max(lv('combat'), lv('ranged'), lv('magic')))) break;
            Q.splice(i, 1); S.tok--; sum += h.dmg; w.push(S.frame, h.dmg);
            S.inSkill = true; try { if (h.mode) Stats.force(h.mode); window.applyDamage(h.t, h.dmg, h.sk, h.dmg); } catch (e) { console.error(e); } finally { Stats.force(null); S.inSkill = false; }
        }
    }

    /* ---------- buffs, barreira, recursos ---------- */
    function addBuff(id, sec, o) {
        const b = { id, until: S.frame + Math.round(sec * FR), st: o.st || null, dmg: o.dmg || 0, name: o.name || id, col: o.col || '#ffe27a', ic: o.ic || 'star', max: Math.round(sec * FR) };
        const i = S.buffs.findIndex((x) => x.id === id); if (i >= 0) S.buffs[i] = b; else S.buffs.push(b); try { Stats.invalidate(); } catch (e) { }
    }
    function setBarrier(amount, sec, col) { S.barrier = { hp: Math.max(1, Math.round(amount)), max: Math.max(1, Math.round(amount)), until: S.frame + Math.round(sec * FR), col: col || '#8ad0ff', t0: S.frame }; }
    function heal(n, col) {
        n = Math.max(0, Math.round(n)); if (!(n > 0) || player.stats.hp <= 0) return 0; const before = player.stats.hp; player.stats.hp = Math.min(player.stats.maxHp, before + n); const g = player.stats.hp - before;
        if (g > 0) { try { Fx.dmg(floatingTexts, player.x, player.y - 50, g, 'heal'); updateUI(); } catch (e) { } } return g;
    }
    function mana(n) { const b = player.stats.mp; player.stats.mp = Math.max(0, Math.min(player.stats.maxMp, b + n)); try { updateUI(); } catch (e) { } return player.stats.mp - b; }
    function spendAmmo(n) {
        const am = player.equipment.ammo; if (!am || !(am.qty >= n)) return false; let used = 0; for (let i = 0; i < n; i++) if (!(window.Stats && Stats.saves())) used++;
        am.qty -= used; if (am.qty <= 0) player.equipment.ammo = null; try { updateUI(); } catch (e) { } return true;
    }
    const cdMs = (id) => { const st = player.skillTree; return st && st.cd && st.cd[id] ? st.cd[id] - Date.now() : 0; };
    const cdrNow = () => (window.Stats && Stats.cdrPct ? Stats.cdrPct() : S.cdr);   // redução de recarga total (árvore + itens + conjuntos), teto 40%
    const cdTime = (sec) => (window.Stats && Stats.cdTime ? Stats.cdTime(sec) : Math.min(sec, Math.max(1.5, Math.round(sec * (1 - S.cdr / 100) * 10) / 10)));   // recarga em s, mínimo 1,5 s
    function setCd(id, sec) { const st = player.skillTree; if (!st.cd) st.cd = {}; st.cd[id] = Date.now() + Math.round(cdTime(sec) * 1000); try { saveDataLogic(); } catch (e) { } }

    /* ============================ EFEITOS VISUAIS (locais) ============================ */
    const glows = Object.create(null);
    function glowSprite(col) {
        if (glows[col]) return glows[col]; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), q = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        q.addColorStop(0, col); q.addColorStop(0.35, col); q.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = 0.9; g.fillStyle = q; g.beginPath(); g.arc(32, 32, 32, 0, TAU); g.fill();
        // o gradiente acima usa a cor cheia no centro; para não "estourar" o tom, mistura com um núcleo claro
        const q2 = g.createRadialGradient(32, 32, 0, 32, 32, 14); q2.addColorStop(0, 'rgba(255,255,255,.85)'); q2.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = q2; g.globalAlpha = 1; g.beginPath(); g.arc(32, 32, 14, 0, TAU); g.fill();
        return (glows[col] = c);
    }
    function fx(o) { if (S.fx.length > 90) S.fx.shift(); o.t = 0; try { if (S.pl === player) { if (o.k === 'cone') rfx('cone', o.col, o.x, o.y, o.x + Math.cos(o.ang) * o.r, o.y + Math.sin(o.ang) * o.r, o.r); else if (o.k === 'beam') rfx('beam', o.col, o.x, o.y, o.x2, o.y2); } } catch (e) { } S.fx.push(o); return o; }
    const rfx = (k, c, x, y, tx, ty, r) => { try { if (window.RemoteFx) RemoteFx.out(k, c, x, y, tx === undefined ? x : tx, ty === undefined ? y : ty, r); } catch (e) { } };
    const ring = (x, y, r0, r1, col, life, w, sq) => (rfx('ring', col, x, y, x, y, r1), fx)({ k: 'ring', x, y, r0, r1, col, max: life || 24, w: w || 4, sq: sq == null ? 0.58 : sq });
    const flash = (x, y, r, col, life) => (rfx('flash', col, x, y, x, y, r), fx)({ k: 'flash', x, y, r, col, max: life || 14 });
    function bolt(x0, y0, x1, y1, col, life) { const n = 7, pts = []; for (let i = 0; i <= n; i++) { const k = i / n, j = (i === 0 || i === n) ? 0 : (rnd() - 0.5) * 22; pts.push(x0 + (x1 - x0) * k + j, y0 + (y1 - y0) * k + (i === 0 || i === n ? 0 : (rnd() - 0.5) * 8)); } rfx('bolt', col, x0, y0, x1, y1); fx({ k: 'bolt', pts, col, max: life || 12 }); }
    const slashFx = (x, y, ang, r, col, life) => (rfx('slash', col, x, y, x + Math.cos(ang) * r, y + Math.sin(ang) * r, r), fx)({ k: 'slash', x, y, ang, r, col, max: life || 12 });
    function sfx(n) { try { if (window.Sfx && Sfx.play) Sfx.play(n); } catch (e) { } }
    const burst = (x, y, col, n, sp) => { try { Art.burst(x, y, col, n, sp); } catch (e) { } };
    const puff = (x, y, col, n, rad, up) => { try { Art.puff(x, y, col, n, rad, up); } catch (e) { } };
    const callout = (name, col) => { try { addFloatingText(player.x, player.y - 62, name, col); } catch (e) { } };
    const pcx = () => (typeof renderPX === 'number' && renderPX) || player.x, pcy = () => (typeof renderPY === 'number' && renderPY) || player.y;

    function drawFx(c) {
        const f = S.frame;
        if (S.fx.length || S.pj.length || S.zn.length || S.buffs.length || S.barrier || S.marks.length || S.status.length || S.dash || S.extraDraw) {
            c.save();
            for (let i = 0; i < S.fx.length; i++) {
                const e = S.fx[i], p = e.t / e.max, a = 1 - p;
                if (e.k === 'ring') { const r = e.r0 + (e.r1 - e.r0) * (1 - (1 - p) * (1 - p)); c.globalAlpha = a * 0.9; c.strokeStyle = e.col; c.lineWidth = e.w * a + 1; c.beginPath(); c.ellipse(e.x, e.y, r, r * e.sq, 0, 0, TAU); c.stroke(); c.globalAlpha = a * 0.18; c.fillStyle = e.col; c.fill(); }
                else if (e.k === 'flash') { c.globalCompositeOperation = 'lighter'; c.globalAlpha = a; const r = e.r * (0.6 + p * 0.6); c.drawImage(glowSprite(e.col), e.x - r, e.y - r, r * 2, r * 2); c.globalCompositeOperation = 'source-over'; }
                else if (e.k === 'bolt') { c.globalCompositeOperation = 'lighter'; c.lineJoin = 'round'; c.lineCap = 'round'; c.globalAlpha = a; c.strokeStyle = e.col; c.lineWidth = 6 * a + 1; c.beginPath(); c.moveTo(e.pts[0], e.pts[1]); for (let k = 2; k < e.pts.length; k += 2) c.lineTo(e.pts[k], e.pts[k + 1]); c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = 2 * a + 0.6; c.stroke(); c.globalCompositeOperation = 'source-over'; }
                else if (e.k === 'slash') { c.globalAlpha = a; const sw = 1.9; c.lineCap = 'round'; for (let k = 0; k < 3; k++) { c.strokeStyle = k === 0 ? e.col : k === 1 ? '#fff' : 'rgba(255,255,255,.4)'; c.lineWidth = k === 0 ? 9 * a + 2 : k === 1 ? 3 : 1.4; c.beginPath(); c.arc(e.x, e.y, e.r * (0.9 + p * 0.25) - k * 2, e.ang - sw / 2 + p * 0.5, e.ang + sw / 2 - 0.15 + p * 0.5); c.stroke(); } }
                else if (e.k === 'arrow') { const y = e.y0 + (e.y1 - e.y0) * Math.min(1, p * 1.6); c.globalAlpha = p < 0.62 ? 0.95 : a * 2.4; c.strokeStyle = '#d8c090'; c.lineWidth = 2; c.beginPath(); c.moveTo(e.x, y - 16); c.lineTo(e.x, y); c.stroke(); c.fillStyle = '#e8eef4'; c.beginPath(); c.moveTo(e.x, y + 4); c.lineTo(e.x - 3, y - 3); c.lineTo(e.x + 3, y - 3); c.fill(); }
                else if (e.k === 'beam') { c.globalCompositeOperation = 'lighter'; c.globalAlpha = a * 0.85; c.strokeStyle = e.col; c.lineWidth = e.w * a + 1; c.lineCap = 'round'; c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(e.x2, e.y2); c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = Math.max(1, e.w * a * 0.35); c.stroke(); c.globalCompositeOperation = 'source-over'; }
                else if (e.k === 'cone') { c.globalAlpha = a * 0.55; c.fillStyle = e.col; c.beginPath(); c.moveTo(e.x, e.y); c.arc(e.x, e.y, e.r * (0.55 + p * 0.45), e.ang - e.half, e.ang + e.half); c.closePath(); c.fill(); }
                e.t++;
            }
            for (let i = S.fx.length - 1; i >= 0; i--) if (S.fx[i].t >= S.fx[i].max) S.fx.splice(i, 1);
            c.globalAlpha = 1;
            // projéteis
            for (let i = 0; i < S.pj.length; i++) {
                const p = S.pj[i]; const n = p.tn; c.globalCompositeOperation = 'lighter';
                for (let k = 0; k < n; k++) { const q = p.tr[((p.th - 1 - k) % 12 + 12) % 12]; if (!q) continue; const a = (1 - k / n) * 0.5, r = p.r * (1 - k / (n + 2)); c.globalAlpha = a; c.drawImage(glowSprite(p.col), q[0] - r * 1.6, q[1] - r * 1.6, r * 3.2, r * 3.2); }
                c.globalAlpha = 1; const gr = p.r * 2.6; c.drawImage(glowSprite(p.col), p.x - gr, p.y - gr, gr * 2, gr * 2); c.globalCompositeOperation = 'source-over';
                if (p.kind === 'arrow') { const a = Math.atan2(p.vy, p.vx); c.save(); c.translate(p.x, p.y); c.rotate(a); c.strokeStyle = p.col2 || '#d8c090'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-14, 0); c.lineTo(5, 0); c.stroke(); c.fillStyle = '#eef3f8'; c.beginPath(); c.moveTo(11, 0); c.lineTo(3, -3.4); c.lineTo(3, 3.4); c.fill(); c.fillStyle = p.col; c.beginPath(); c.moveTo(-14, 0); c.lineTo(-18, -3); c.lineTo(-11, -1); c.lineTo(-11, 1); c.lineTo(-18, 3); c.fill(); c.restore(); }
                else { c.fillStyle = '#fff'; c.beginPath(); c.arc(p.x, p.y, p.r * 0.5, 0, TAU); c.fill(); }
            }
            // marcas e status nos monstros
            for (let i = 0; i < S.marks.length; i++) { const o = S.marks[i]; if (!alive(o) || !(o._mk > f)) continue; const x = ex(o), y = o.y - 14 + Math.sin(f / 7) * 2, a = Math.min(1, (o._mk - f) / 30); c.globalAlpha = a; c.strokeStyle = '#ff4a4a'; c.lineWidth = 2.4; c.beginPath(); c.arc(x, y, 9, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(x - 13, y); c.lineTo(x - 5, y); c.moveTo(x + 5, y); c.lineTo(x + 13, y); c.moveTo(x, y - 13); c.lineTo(x, y - 5); c.moveTo(x, y + 5); c.lineTo(x, y + 13); c.stroke(); c.fillStyle = '#ffe27a'; c.beginPath(); c.arc(x, y, 2.2, 0, TAU); c.fill(); }
            for (let i = 0; i < S.status.length; i++) { const o = S.status[i]; if (!alive(o)) continue; const x = ex(o), y = o.y + (o.h || 30) - 2; if (o._stun > f) { c.globalAlpha = 0.9; c.fillStyle = '#ffe27a'; for (let k = 0; k < 3; k++) { const a = f / 9 + k * 2.1; c.beginPath(); c.arc(x + Math.cos(a) * 11, o.y - 6 + Math.sin(a) * 3, 2.4, 0, TAU); c.fill(); } } if (o._slow > f) { c.globalAlpha = 0.55; c.strokeStyle = '#8fd8ff'; c.lineWidth = 2.4; c.beginPath(); c.ellipse(x, y, er(o) + 4, (er(o) + 4) * 0.45, 0, 0, TAU); c.stroke(); c.globalAlpha = 0.18; c.fillStyle = '#8fd8ff'; c.fill(); } }
            c.globalAlpha = 1;
            // jogador: barreira, buffs, esquiva
            const px = pcx(), py = pcy();
            if (S.barrier) { const b = S.barrier, k = Math.max(0, b.hp / b.max), left = Math.min(1, (b.until - f) / 40), a = (0.35 + 0.25 * Math.sin(f / 6)) * left * (0.5 + k * 0.5); c.globalAlpha = a; c.fillStyle = b.col; c.beginPath(); c.ellipse(px, py - 18, 26, 34, 0, 0, TAU); c.fill(); c.globalAlpha = Math.min(1, a * 2.2); c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.ellipse(px, py - 18, 26, 34, 0, 0, TAU); c.stroke(); c.lineWidth = 1; c.beginPath(); c.ellipse(px, py - 18, 26, 12, 0, 0, TAU); c.stroke(); c.beginPath(); c.ellipse(px, py - 18, 12, 34, 0, 0, TAU); c.stroke(); }
            for (const b of S.buffs) { if (!(b.until > f)) continue; if (b.id === 'grito' || b.id === 'furor' || b.id === 'fury') { const a = 0.35 + 0.2 * Math.sin(f / 5); c.globalCompositeOperation = 'lighter'; c.globalAlpha = a; c.drawImage(glowSprite(b.col), px - 30, py - 30, 60, 40); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 0.7; c.strokeStyle = b.col; c.lineWidth = 2; c.beginPath(); c.ellipse(px, py + 2, 18 + Math.sin(f / 8) * 2, 7, 0, 0, TAU); c.stroke(); } }
            if (S.invuln > f) { c.globalAlpha = 0.55 + 0.25 * Math.sin(f / 3); c.strokeStyle = '#d8b8ff'; c.lineWidth = 2.4; c.beginPath(); c.ellipse(px, py - 16, 20, 30, 0, 0, TAU); c.stroke(); c.globalAlpha = 0.14; c.fillStyle = '#c8a0ff'; c.fill(); }
            if (S.extraDraw) { try { S.extraDraw(c, f); } catch (e) { } }
            c.restore();
        }
    }

    /* ---------- projéteis (reaproveitam o vetor; nada é alocado por quadro) ---------- */
    function shoot(o) {   // kind: 'orb'|'arrow'; tgt: homing; vx,vy: reto; pierce: quantos inimigos atravessa; onHit(p, t)
        if (S.pj.length >= 28) S.pj.shift();
        const p = Object.assign({ x: player.x, y: player.y - 14, vx: 0, vy: 0, sp: 8, tgt: null, kind: 'orb', r: 6, col: '#ffb04a', life: 70, pierce: 1, hits: [], dmg: 0, sk: 'combat', mode: '', tr: [], th: 0, tn: 0, walls: true, dist: 0 }, o);
        try { const tx = p.tgt ? ex(p.tgt) : p.x + (p.vx || 1) / (Math.hypot(p.vx, p.vy) || 1) * 320, ty = p.tgt ? ey(p.tgt) : p.y + (p.vy || 0) / (Math.hypot(p.vx, p.vy) || 1) * 320; rfx(p.kind === 'arrow' ? 'ranged' : 'magic', p.col, p.x, p.y, tx, ty); } catch (e) { }
        S.pj.push(p); return p;
    }
    function stepPj() {
        const cur = (gameMaps[currentMap] || {}).entities || [], en = enemies();
        for (let i = S.pj.length - 1; i >= 0; i--) {
            const p = S.pj[i]; let dead = false;
            if (p.tgt && alive(p.tgt)) { const dx = ex(p.tgt) - p.x, dy = ey(p.tgt) - p.y, d = Math.hypot(dx, dy) || 1; p.vx = dx / d * p.sp; p.vy = dy / d * p.sp; }
            else if (p.tgt) { p.tgt = null; if (!p.vx && !p.vy) { dead = true; } }
            const ox = p.x, oy = p.y; p.x += p.vx; p.y += p.vy; p.dist += Math.hypot(p.vx, p.vy);
            if (S.frame % 2 === 0) { p.tr[p.th % 12] = p.tr[p.th % 12] || [0, 0]; p.tr[p.th % 12][0] = p.x; p.tr[p.th % 12][1] = p.y; p.th++; p.tn = Math.min(p.tn + 1, p.kind === 'arrow' ? 3 : 7); }
            if (!dead && p.walls && window.LOS && !LOS.clear(ox, oy, p.x, p.y, cur)) { burst(p.x, p.y, p.col, 7, 0.9); if (p.onWall) p.onWall(p); if (!S.wallMsg || performance.now() - S.wallMsg > 1500) { S.wallMsg = performance.now(); say('A habilidade bateu na parede.', '#e67e22'); } dead = true; }
            if (!dead) {
                for (let k = 0; k < en.length; k++) {
                    const t = en[k]; if (!alive(t) || p.hits.indexOf(t) >= 0) continue; if (p.tgt && t !== p.tgt) continue;
                    if (Math.hypot(ex(t) - p.x, ey(t) - p.y) < er(t) * 0.7 + p.r + 4) { p.hits.push(t); if (p.onHit) p.onHit(p, t); if (--p.pierce <= 0) { dead = true; break; } }
                }
            }
            if (!dead && (p.life-- <= 0 || p.dist > (p.maxDist || 99999))) dead = true;
            if (dead) { if (p.onEnd) p.onEnd(p); S.pj.splice(i, 1); }
        }
    }

    /* ---------- zonas com efeito repetido (chuva de flechas, tempestade...) ---------- */
    function zone(o) { if (S.zn.length >= 6) S.zn.shift(); o.next = S.frame + (o.first || 0); S.zn.push(o); return o; }
    function stepZones() { for (let i = S.zn.length - 1; i >= 0; i--) { const z = S.zn[i]; if (S.frame >= z.next) { z.next += z.every; z.fn(z); if (--z.left <= 0) S.zn.splice(i, 1); } } }

    /* ---------- investida / esquiva ---------- */
    const SKIPC = { ground_item: 1, fishing_spot: 1, farm_plot: 1, portal: 1, fire: 1, paint: 1, enemy: 1, npc: 1 };
    function blockedAt(x, y, cur) {
        const pw = 10, ph = 10;
        for (let i = 0; i < cur.length; i++) { const o = cur[i]; if (!o || !o.type || !o.active || SKIPC[o.type]) continue; let hb = null; try { hb = getHitbox(o); } catch (e) { } if (!hb) continue; if (x - pw < hb.x + hb.w && x + pw > hb.x && y - ph < hb.y + hb.h && y + ph > hb.y) return true; }
        return false;
    }
    function startDash(dx, dy, len, sp, col, onStep) {
        const d = Math.hypot(dx, dy) || 1; S.dash = { dx: dx / d, dy: dy / d, left: len, sp, col: col || '#ffd27a', onStep, moved: 0 };
        player.isPerformingAction = false; player.pendingAutoAction = null; player.actionToolItem = null;
    }
    function stepDash() {
        const D = S.dash; if (!D) return; const m = gameMaps[currentMap]; if (!m) { S.dash = null; return; } const cur = m.entities || [], W = m.width || 800, H = m.height || 600;
        let step = Math.min(D.sp, D.left), n = Math.ceil(step / 6), sx = D.dx * step / n, sy = D.dy * step / n, stopped = false;
        for (let i = 0; i < n; i++) { const nx = player.x + sx, ny = player.y + sy; if (nx < 24 || nx > W - 24 || ny < 24 || ny > H - 24 || blockedAt(nx, ny, cur)) { stopped = true; break; } player.x = nx; player.y = ny; D.moved += Math.hypot(sx, sy); }
        player.destX = player.x; player.destY = player.y; player.pendingAutoAction = null;
        puff(player.x - D.dx * 8, player.y + 6, D.col === '#c8a0ff' ? 'rgba(160,110,230,' : 'rgba(255,200,110,', 2, 4, 0.2);
        if (D.onStep) D.onStep(D);
        D.left -= step; if (stopped || D.left <= 0.5) { burst(player.x, player.y + 4, D.col, 8, 1); S.dash = null; }
    }

    /* ============================ DEFINIÇÃO DAS ATIVAS ============================ */
    const NEED = { melee: 'uma arma corpo a corpo', bow: 'um arco', staff: 'um cajado' };
    function needOk(need) {
        const w = wpn();
        if (need === 'melee') return !!w && w.tool !== 'ranged' && w.tool !== 'magic';
        if (need === 'bow') return !!w && w.tool === 'ranged';
        if (need === 'staff') return !!w && w.tool === 'magic';
        return true;
    }
    const ACT = {};
    const def = (id, o) => { ACT[id] = Object.assign({ id, ic: NODES[id].ic, cost: null }, o); };
    const dirToward = (o) => { const dx = ex(o) - player.x, dy = ey(o) - (player.y - 8), d = Math.hypot(dx, dy) || 1; return [dx / d, dy / d]; };
    const facingVec = () => { const fx = player.facing || { x: 0, y: 1 }; const d = Math.hypot(fx.x, fx.y) || 1; return [fx.x / d, fx.y / d]; };

    /* ----- Guerreiro ----- */
    def('w_golpe', { sk: 'combat', need: 'melee', col: '#ffb04a', mp: [8, 9, 10], cd: [7, 6, 5], mult: [2.2, 2.7, 3.2], range: 85, st: [30, 40, 50],
        info: (r) => ['Alcance: ' + ACT.w_golpe.range + ' px (inimigo à frente)', 'Atordoa por ' + fnum(at(ACT.w_golpe.st, r) / FR) + ' s'],
        run(r) {
            const t = pickTarget(ACT.w_golpe.range, true); if (!t) return S.blocked ? 'Sem linha de visão: contorne a parede.' : 'Nenhum inimigo ao alcance do golpe.';
            face(ex(t), ey(t)); const ang = Math.atan2(ey(t) - player.y, ex(t) - player.x);
            slashFx(player.x + Math.cos(ang) * 14, player.y - 12 + Math.sin(ang) * 8, ang, 38, '#ffb04a', 14); flash(ex(t), ey(t), 40, '#ffb04a', 12); burst(ex(t), ey(t), '#ffd27a', 12, 1.8);
            hit(t, sdmg('combat', at(ACT.w_golpe.mult, r)), 'combat', '', 4); stun(t, at(ACT.w_golpe.st, r)); sfx('hit'); return true;
        } });
    def('w_grito', { sk: 'combat', need: 'melee', col: '#ffd24a', mp: [15, 16, 18], cd: [24, 22, 20], dur: [12, 15, 18], dmgp: [15, 20, 25], drp: [8, 10, 12],
        info: (r) => ['Duração: ' + at(ACT.w_grito.dur, r) + ' s', '+' + at(ACT.w_grito.dmgp, r) + '% de dano e +' + at(ACT.w_grito.drp, r) + '% de redução de dano', 'Intimida inimigos próximos (atrasa o ataque deles)'],
        run(r) {
            addBuff('grito', at(ACT.w_grito.dur, r), { st: { dr: at(ACT.w_grito.drp, r) }, dmg: at(ACT.w_grito.dmgp, r), name: 'Grito de Guerra', col: '#ffd24a', ic: 'shout' });
            ring(player.x, player.y + 4, 8, 150, '#ffd24a', 26, 6); ring(player.x, player.y + 4, 4, 100, '#fff2b0', 20, 3); flash(player.x, player.y - 10, 60, '#ffb04a', 18); burst(player.x, player.y - 14, '#ffd24a', 18, 1.8);
            const l = aoe(player.x, player.y, 140, 8, true); for (let i = 0; i < l.length; i++) { l[i].attackCooldown = Math.max(l[i].attackCooldown || 0, 55); }
            callout('GRITO DE GUERRA!', '#ffd24a'); sfx('quest'); return true;
        } });
    def('w_investida', { sk: 'combat', need: 'melee', col: '#ff9a4a', mp: [12, 13, 14], cd: [12, 10, 9], mult: [1.4, 1.7, 2.0], len: [160, 190, 220], st: 30,
        info: (r) => ['Distância: ' + at(ACT.w_investida.len, r) + ' px', 'Atinge até 4 inimigos no caminho e os atordoa', 'Para ao bater numa parede'],
        run(r) {
            let v = null; const k = (typeof keys !== 'undefined') ? keys : {}; let dx = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0), dy = (k.s || k.arrowdown ? 1 : 0) - (k.w || k.arrowup ? 1 : 0);
            if (!dx && !dy) { const t = pickTarget(260, false); if (t) { v = dirToward(t); } else v = facingVec(); } else v = [dx, dy];
            const len = at(ACT.w_investida.len, r), mult = at(ACT.w_investida.mult, r), x0 = player.x, y0 = player.y, d = Math.hypot(v[0], v[1]) || 1, ux = v[0] / d, uy = v[1] / d, hitSet = [];
            face(player.x + ux * 50, player.y + uy * 50);
            startDash(ux, uy, len, 13, '#ffd27a', (D) => {
                const en = enemies(); for (let i = 0; i < en.length && hitSet.length < 4; i++) { const t = en[i]; if (!alive(t) || hitSet.indexOf(t) >= 0) continue; if (Math.hypot(ex(t) - player.x, ey(t) - (player.y - 6)) < er(t) + 22) { hitSet.push(t); hit(t, sdmg('combat', mult), 'combat', '', 0); stun(t, ACT.w_investida.st); flash(ex(t), ey(t), 34, '#ffb04a', 10); burst(ex(t), ey(t), '#ffd27a', 8, 1.5); } }
            });
            ring(x0, y0 + 4, 6, 40, '#ffd27a', 14, 3); callout('Investida!', '#ffb04a'); sfx('miss'); return true;
        } });
    def('w_furor', { sk: 'combat', need: 'melee', col: '#ff5a2a', mp: [25, 28, 30], cd: [40, 36, 32], dur: [10, 12, 14], asp: [30, 35, 40], ls: [6, 8, 10],
        info: (r) => ['Duração: ' + at(ACT.w_furor.dur, r) + ' s', '+' + at(ACT.w_furor.asp, r) + '% de velocidade de ataque e +' + at(ACT.w_furor.ls, r) + '% de roubo de vida', '(os limites de atributos do jogo continuam valendo)'],
        run(r) {
            addBuff('furor', at(ACT.w_furor.dur, r), { st: { atkSpd: at(ACT.w_furor.asp, r), lifesteal: at(ACT.w_furor.ls, r) }, name: 'Furor', col: '#ff5a2a', ic: 'rage2' });
            ring(player.x, player.y + 4, 6, 90, '#ff5a2a', 22, 5); flash(player.x, player.y - 14, 56, '#ff6a2a', 18); burst(player.x, player.y - 14, '#ff8a3a', 20, 2); callout('FUROR!', '#ff7a3a'); sfx('kill'); return true;
        } });
    def('w_muralha', { sk: 'combat', need: 'melee', col: '#8ad0ff', mp: [30, 34, 38], cd: [40, 36, 32], pct: [35, 50, 65], dur: 10,
        info: (r) => ['Barreira de ' + at(ACT.w_muralha.pct, r) + '% da vida máxima (+100)', 'Absorve dano por até ' + ACT.w_muralha.dur + ' s'],
        run(r) { setBarrier(player.stats.maxHp * at(ACT.w_muralha.pct, r) / 100 + 100, ACT.w_muralha.dur, '#8ad0ff'); ring(player.x, player.y + 4, 10, 60, '#8ad0ff', 22, 5); flash(player.x, player.y - 16, 52, '#8ad0ff', 18); callout('MURALHA!', '#8ad0ff'); sfx('accept'); return true; } });
    def('w_terremoto', { sk: 'combat', need: 'melee', col: '#c89a5a', mp: [40, 45, 50], cd: [34, 31, 28], mult: [1.8, 2.2, 2.6], rad: [120, 135, 150], st: [50, 60, 70],
        info: (r) => ['Raio: ' + at(ACT.w_terremoto.rad, r) + ' px · até 8 inimigos', 'Atordoa por ' + fnum(at(ACT.w_terremoto.st, r) / FR) + ' s'],
        run(r) {
            const R = at(ACT.w_terremoto.rad, r), l = aoe(player.x, player.y, R, 8, true); if (!l.length) return 'Nenhum inimigo ao alcance do Terremoto.'; const m = at(ACT.w_terremoto.mult, r), s = at(ACT.w_terremoto.st, r);
            for (let i = 0; i < l.length; i++) { hit(l[i], sdmg('combat', m), 'combat', '', 6 + i); stun(l[i], s); burst(ex(l[i]), l[i].y + (l[i].h || 30), '#c89a5a', 8, 1.6); }
            ring(player.x, player.y + 4, 10, R, '#c89a5a', 26, 8); ring(player.x, player.y + 4, 4, R * 0.7, '#ffe0a0', 20, 4); flash(player.x, player.y, 70, '#ffb04a', 16); burst(player.x, player.y, '#8d6a3a', 22, 2.2); callout('TERREMOTO!', '#e0b070'); sfx('thunder'); return true;
        } });

    /* ----- Arqueiro ----- */
    const arrowOrb = (col) => ({ kind: 'arrow', col, r: 5, sp: 13, walls: true });
    def('a_tiro', { sk: 'ranged', need: 'bow', col: '#ff6a4a', mp: [10, 11, 12], cd: [7, 6.5, 6], mult: [3, 3.6, 4.2], range: 300, cost: { ammo: 1 },
        info: () => ['Alcance: ' + ACT.a_tiro.range + ' px', 'Crítico garantido', 'Gasta 1 flecha'],
        run(r) {
            const t = pickTarget(ACT.a_tiro.range, true); if (!t) return S.blocked ? 'Sem linha de visão: contorne a parede.' : 'Nenhum alvo ao alcance.';
            face(ex(t), ey(t)); const dm = sdmg('ranged', at(ACT.a_tiro.mult, r)); const p = shoot(Object.assign(arrowOrb('#ff6a4a'), { tgt: t, sp: 15, r: 6, dmg: dm, sk: 'ranged', maxDist: 700 }));
            p.onHit = (pp, tt) => { hit(tt, pp.dmg, 'ranged', 'crit', 0); flash(ex(tt), ey(tt), 44, '#ff6a4a', 12); burst(ex(tt), ey(tt), '#ffd27a', 14, 2); }; flash(player.x, player.y - 14, 26, '#ff9a6a', 8); callout('Tiro Preciso!', '#ff8a6a'); sfx('miss'); return true;
        } });
    def('a_multi', { sk: 'ranged', need: 'bow', col: '#7fd8ff', mp: [14, 16, 18], cd: [8, 7, 6], mult: [1, 1.1, 1.2], n: [3, 4, 5], range: 280, cost: { ammo: 2 },
        info: (r) => ['Dispara ' + at(ACT.a_multi.n, r) + ' flechas em leque', 'Gasta 2 flechas'],
        run(r) {
            const t = pickTarget(ACT.a_multi.range, true); if (!t) return S.blocked ? 'Sem linha de visão: contorne a parede.' : 'Nenhum alvo ao alcance.';
            face(ex(t), ey(t)); const v = dirToward(t), a0 = Math.atan2(v[1], v[0]), n = at(ACT.a_multi.n, r), spread = 0.2 + n * 0.035, m = at(ACT.a_multi.mult, r);
            for (let i = 0; i < n; i++) { const a = a0 + (i - (n - 1) / 2) * (spread * 2 / Math.max(1, n - 1)); const p = shoot(Object.assign(arrowOrb('#7fd8ff'), { vx: Math.cos(a) * 12, vy: Math.sin(a) * 12, dmg: sdmg('ranged', m), sk: 'ranged', maxDist: 330, life: 40 })); p.onHit = (pp, tt) => { hit(tt, pp.dmg, 'ranged', '', i); flash(ex(tt), ey(tt), 30, '#7fd8ff', 9); burst(ex(tt), ey(tt), '#bfeaff', 6, 1.3); }; }
            flash(player.x, player.y - 14, 26, '#7fd8ff', 8); callout('Disparo Múltiplo!', '#7fd8ff'); sfx('miss'); return true;
        } });
    def('a_passo', { sk: 'ranged', need: 'bow', col: '#c8a0ff', mp: [10, 11, 12], cd: [12, 11, 10], len: [150, 170, 190], inv: [1, 1.3, 1.6], spd: [3, 4, 5],
        info: (r) => ['Salta ' + at(ACT.a_passo.len, r) + ' px para longe do perigo', 'Intocável por ' + fnum(at(ACT.a_passo.inv, r)) + ' s · +30% de velocidade por ' + at(ACT.a_passo.spd, r) + ' s'],
        run(r) {
            let v; const t = pickTarget(340, false); if (t) { const d = dirToward(t); v = [-d[0], -d[1]]; } else { const f = facingVec(); v = [-f[0], -f[1]]; }
            S.invuln = S.frame + Math.round(at(ACT.a_passo.inv, r) * FR); addBuff('passo', at(ACT.a_passo.spd, r), { st: { moveSpd: 30 }, name: 'Passo Sombrio', col: '#c8a0ff', ic: 'shadow' });
            startDash(v[0], v[1], at(ACT.a_passo.len, r), 15, '#c8a0ff'); ring(player.x, player.y + 4, 4, 50, '#c8a0ff', 18, 4); flash(player.x, player.y - 14, 40, '#9a6aff', 14); callout('Passo Sombrio', '#c8a0ff'); sfx('portal'); return true;
        } });
    def('a_marca', { sk: 'ranged', need: 'bow', col: '#ff4a4a', mp: [15, 17, 19], cd: [16, 14, 12], dur: [10, 13, 16], pct: [20, 25, 30], range: 320,
        info: (r) => ['Alcance: ' + ACT.a_marca.range + ' px', 'O alvo sofre +' + at(ACT.a_marca.pct, r) + '% de dano seu por ' + at(ACT.a_marca.dur, r) + ' s'],
        run(r) {
            const t = pickTarget(ACT.a_marca.range, true); if (!t) return S.blocked ? 'Sem linha de visão: contorne a parede.' : 'Nenhum alvo ao alcance.';
            face(ex(t), ey(t)); t._mk = S.frame + at(ACT.a_marca.dur, r) * FR; t._mkp = at(ACT.a_marca.pct, r); if (S.marks.indexOf(t) < 0) S.marks.push(t);
            bolt(player.x, player.y - 16, ex(t), ey(t) - 10, '#ff6a4a', 8); ring(ex(t), t.y + (t.h || 30), 6, 46, '#ff4a4a', 20, 4); flash(ex(t), ey(t), 40, '#ff4a4a', 14); callout('Marca da Presa!', '#ff6a5a'); sfx('accept'); return true;
        } });
    def('a_perf', { sk: 'ranged', need: 'bow', col: '#9fe0ff', mp: [20, 22, 24], cd: [12, 11, 10], mult: [2.2, 2.7, 3.2], len: 340, cost: { ammo: 1 },
        info: () => ['Atravessa até 8 inimigos numa linha de ' + ACT.a_perf.len + ' px', 'Cada inimigo seguinte sofre 10% menos', 'Gasta 1 flecha'],
        run(r) {
            const t = pickTarget(ACT.a_perf.len - 20, true); let v; if (t) { v = dirToward(t); face(ex(t), ey(t)); } else { const f = facingVec(); v = f; }
            const m = at(ACT.a_perf.mult, r); let k = 0; const p = shoot(Object.assign(arrowOrb('#9fe0ff'), { vx: v[0] * 17, vy: v[1] * 17, r: 7, pierce: 8, maxDist: ACT.a_perf.len, life: 60, dmg: sdmg('ranged', m), sk: 'ranged', hits: [] }));
            p.onHit = (pp, tt) => { hit(tt, pp.dmg * Math.pow(0.9, k++), 'ranged', '', 0); flash(ex(tt), ey(tt), 34, '#9fe0ff', 10); burst(ex(tt), ey(tt), '#d8f4ff', 8, 1.6); };
            flash(player.x, player.y - 14, 30, '#9fe0ff', 9); callout('Flecha Perfurante!', '#9fe0ff'); sfx('miss'); return true;
        } });
    def('a_chuva', { sk: 'ranged', need: 'bow', col: '#ffd27a', mp: [32, 36, 40], cd: [30, 27, 24], mult: [0.8, 0.9, 1], rad: [105, 120, 135], waves: [4, 5, 6], range: 320, cost: { ammo: 3 },
        info: (r) => ['Área de ' + at(ACT.a_chuva.rad, r) + ' px · ' + at(ACT.a_chuva.waves, r) + ' saraivadas · até 6 alvos por saraivada', 'Gasta 3 flechas'],
        run(r) {
            const t = pickTarget(ACT.a_chuva.range, true); if (!t) return S.blocked ? 'Sem linha de visão: contorne a parede.' : 'Nenhum alvo ao alcance.';
            face(ex(t), ey(t)); const cx = ex(t), cy = t.y + (t.h || 30) * 0.8, R = at(ACT.a_chuva.rad, r), m = at(ACT.a_chuva.mult, r);
            ring(cx, cy, 10, R, '#ffd27a', 40, 3, 0.55); callout('Chuva de Flechas!', '#ffd27a'); sfx('miss');
            zone({ every: 27, left: at(ACT.a_chuva.waves, r), first: 8, fn: () => {
                for (let i = 0; i < 9; i++) { const a = rnd() * TAU, d = Math.sqrt(rnd()) * R, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.6; fx({ k: 'arrow', x, y0: y - 120, y1: y, max: 16 }); }
                ring(cx, cy, R * 0.5, R, '#ffd27a', 14, 2, 0.55); const l = aoe(cx, cy, R, 6, false); for (let i = 0; i < l.length; i++) { hit(l[i], sdmg('ranged', m), 'ranged', '', 4 + i); burst(ex(l[i]), ey(l[i]), '#ffe9a8', 5, 1.2); }
            } });
            return true;
        } });

    /* ----- Mago ----- */
    const magicRange = 280;
    function splashAt(x, y, r, skip, mult, skill) { const l = aoe(x, y, r, 5, false); for (let i = 0; i < l.length; i++) if (l[i] !== skip) hit(l[i], mult, skill, '', 3 + i); }
    def('m_fogo', { sk: 'magic', need: 'staff', col: '#ff7a3a', cd: [5, 4.5, 4], mult: [2.6, 3.1, 3.6], mp: [12, 12, 14], range: magicRange,
        info: () => ['Alcance: ' + magicRange + ' px', 'Explode: 50% do dano nos vizinhos (raio 55)'],
        run(r) {
            const t = pickTarget(magicRange, true); if (!t) return S.blocked ? 'Sem linha de visão: contorne a parede.' : 'Nenhum alvo ao alcance.';
            face(ex(t), ey(t)); const dm = sdmg('magic', at(ACT.m_fogo.mult, r));
            const p = shoot({ kind: 'orb', col: '#ff7a3a', r: 8, sp: 7.5, tgt: t, dmg: dm, sk: 'magic', maxDist: 600, life: 100 });
            p.onHit = (pp, tt) => { hit(tt, pp.dmg, 'magic', '', 0); splashAt(ex(tt), ey(tt), 55, tt, pp.dmg * 0.5, 'magic'); ring(ex(tt), tt.y + (tt.h || 30), 6, 58, '#ff9a3a', 18, 5); flash(ex(tt), ey(tt), 56, '#ff7a3a', 16); burst(ex(tt), ey(tt), '#ffb04a', 16, 2.2); burst(ex(tt), ey(tt), '#ff5a2a', 10, 1.4); };
            flash(player.x, player.y - 14, 26, '#ff9a4a', 8); callout('Bola de Fogo!', '#ff9a4a'); sfx('fire'); return true;
        } });
    def('m_gelo', { sk: 'magic', need: 'staff', col: '#8fd8ff', cd: [6, 5.5, 5], mult: [1.8, 2.1, 2.4], mp: [10, 10, 12], slow: [4, 5, 6], range: magicRange,
        info: (r) => ['Alcance: ' + magicRange + ' px', 'Lentidão de 50% por ' + at(ACT.m_gelo.slow, r) + ' s'],
        run(r) {
            const t = pickTarget(magicRange, true); if (!t) return S.blocked ? 'Sem linha de visão: contorne a parede.' : 'Nenhum alvo ao alcance.';
            face(ex(t), ey(t)); const dm = sdmg('magic', at(ACT.m_gelo.mult, r)), sl = at(ACT.m_gelo.slow, r);
            const p = shoot({ kind: 'orb', col: '#8fd8ff', r: 6, sp: 10, tgt: t, dmg: dm, sk: 'magic', maxDist: 600, life: 80 });
            p.onHit = (pp, tt) => { hit(tt, pp.dmg, 'magic', '', 0); slow(tt, sl * FR, 0.5); ring(ex(tt), tt.y + (tt.h || 30), 6, 44, '#bff0ff', 20, 4); flash(ex(tt), ey(tt), 46, '#8fd8ff', 14); burst(ex(tt), ey(tt), '#dff6ff', 14, 2); };
            flash(player.x, player.y - 14, 24, '#8fd8ff', 8); callout('Raio de Gelo!', '#8fd8ff'); sfx('enchant'); return true;
        } });
    def('m_cura', { sk: 'magic', need: 'staff', col: '#6fe08a', cd: [10, 9, 8], pct: [20, 30, 45], mp: [16, 18, 24],
        info: (r) => ['Cura ' + at(ACT.m_cura.pct, r) + '% da vida máxima (+ dano mágico x8)', r >= 3 ? 'Cura Maior' : 'Cura Menor (no rank 3 vira Cura Maior)'],
        run(r) {
            if (player.stats.hp >= player.stats.maxHp) return 'Sua vida já está cheia.';
            heal(player.stats.maxHp * at(ACT.m_cura.pct, r) / 100 + (window.Stats ? Stats.spellDmg() * 8 : 0), '#6fe08a');
            ring(player.x, player.y + 4, 6, 56, '#6fe08a', 24, 5); flash(player.x, player.y - 16, 54, '#6fe08a', 20); for (let i = 0; i < 10; i++) puff(player.x + (rnd() - 0.5) * 30, player.y - 6 - rnd() * 10, 'rgba(120,255,160,', 1, 4, 0.7);
            callout(r >= 3 ? 'Cura Maior!' : 'Cura Menor!', '#6fe08a'); sfx('accept'); return true;
        } });
    def('m_nova', { sk: 'magic', need: 'staff', col: '#b080ff', cd: [14, 12, 11], mult: [2, 2.4, 2.8], mp: [25, 28, 30], rad: [125, 140, 155], st: 45,
        info: (r) => ['Raio: ' + at(ACT.m_nova.rad, r) + ' px · até 8 inimigos', 'Atordoa por ' + fnum(ACT.m_nova.st / FR) + ' s'],
        run(r) {
            const R = at(ACT.m_nova.rad, r), l = aoe(player.x, player.y, R, 8, true); if (!l.length) return 'Nenhum inimigo ao alcance da Nova.'; const m = at(ACT.m_nova.mult, r);
            for (let i = 0; i < l.length; i++) { hit(l[i], sdmg('magic', m), 'magic', '', 4 + i); stun(l[i], ACT.m_nova.st); burst(ex(l[i]), ey(l[i]), '#d8b8ff', 8, 1.6); }
            ring(player.x, player.y + 4, 8, R, '#b080ff', 26, 8); ring(player.x, player.y + 4, 4, R * 0.6, '#f0e0ff', 20, 4); flash(player.x, player.y - 12, 80, '#a070ff', 18); burst(player.x, player.y - 10, '#c8a0ff', 22, 2.2); callout('Nova Arcana!', '#c8a0ff'); sfx('enchant'); return true;
        } });
    def('m_escudo', { sk: 'magic', need: 'staff', col: '#7fb8ff', cd: [22, 20, 18], pct: [25, 35, 45], mp: [20, 22, 25], dur: 12,
        info: (r) => ['Barreira de ' + at(ACT.m_escudo.pct, r) + '% da vida máxima (+ dano mágico x12)', 'Dura até ' + ACT.m_escudo.dur + ' s'],
        run(r) { setBarrier(player.stats.maxHp * at(ACT.m_escudo.pct, r) / 100 + (window.Stats ? Stats.spellDmg() * 12 : 0) + 60, ACT.m_escudo.dur, '#7fb8ff'); ring(player.x, player.y + 4, 8, 58, '#9ad0ff', 22, 5); flash(player.x, player.y - 16, 56, '#7fb8ff', 18); callout('Escudo Arcano!', '#9ad0ff'); sfx('enchant'); return true; } });
    def('m_tempest', { sk: 'magic', need: 'staff', col: '#ffe86a', cd: [36, 32, 28], mult: [1.4, 1.6, 1.8], mp: [45, 50, 55], rad: [115, 130, 145], n: [8, 10, 12], range: 300,
        info: (r) => ['Raio: ' + at(ACT.m_tempest.rad, r) + ' px · ' + at(ACT.m_tempest.n, r) + ' raios', 'Cada raio atinge um inimigo da área'],
        run(r) {
            const t = pickTarget(ACT.m_tempest.range, true); if (!t) return S.blocked ? 'Sem linha de visão: contorne a parede.' : 'Nenhum alvo ao alcance.';
            face(ex(t), ey(t)); const cx = ex(t), cy = t.y + (t.h || 30) * 0.8, R = at(ACT.m_tempest.rad, r), m = at(ACT.m_tempest.mult, r); let k = 0;
            ring(cx, cy, 12, R, '#ffe86a', 36, 4, 0.55); flash(cx, cy - 80, 70, '#6a7a98', 40); callout('Tempestade!', '#ffe86a'); sfx('thunder');
            zone({ every: 22, left: at(ACT.m_tempest.n, r), first: 10, fn: () => {
                const l = aoe(cx, cy, R, 8, false); if (!l.length) return; const o = l[(k++) % l.length]; bolt(ex(o) + (rnd() - 0.5) * 30, o.y - 150, ex(o), ey(o), '#ffe86a', 12); flash(ex(o), ey(o), 52, '#ffe86a', 12); burst(ex(o), ey(o), '#fff3a0', 10, 1.8);
                hit(o, sdmg('magic', m), 'magic', '', 2); if (k % 3 === 0) sfx('thunder');
            } });
            return true;
        } });

    /* ============================ LANÇAR ============================ */
    /* ---- Aljava Mágica / Fonte Arcana / Vigor Inabalável: custos e ganchos ---- */
    const capOn = (id) => { const st = player && player.skillTree; return !!(st && st.tg && st.tg[id] === true && rankOf(id) > 0); };
    function weaponTier(w) {   // 1..5 pelo nível mínimo e pelo dano do arco/cajado (arco de bronze = 1 ... arco de mithril/dragão = 5)
        const rq = window.Stats && Stats.reqOf ? Stats.reqOf(w) : null, L = rq ? rq.lvl : 1, d = (w && w.bonusDmg) || 0;
        const a = L >= 40 ? 5 : L >= 30 ? 4 : L >= 20 ? 3 : L >= 10 ? 2 : 1, b = d >= 14 ? 5 : d >= 10 ? 4 : d >= 7 ? 3 : d >= 4 ? 2 : 1; return Math.max(a, b);
    }
    const shotMp = (w) => Math.min(6, 1 + weaponTier(w));                  // mana por disparo da Aljava Mágica: 2 a 6 conforme o arco
    const quiverBonus = (w) => Math.min(11, 1 + 2 * (weaponTier(w) - 1)); // dano das "flechas de mana" (equivale a uma boa flecha do mesmo nível)
    const spellMp = (sp) => Math.max(4, Math.round(3 + 1.5 * Object.keys(sp.req || {}).length + (sp.lvl || 1) / 5));   // mana por magia básica da Fonte Arcana
    const VIGOR_MP = 3, VIGOR_HEAL = 1.5;
    function costOf(a, r, live) {   // live = checagem na hora de lançar (cai para flechas se a mana não der); sem live = custo "de vitrine" (barra e dicas)
        const c = a.cost || {}, o = {}; if (a.mp) o.mp = at(a.mp, r); if (c.ammo) o.ammo = c.ammo;
        if (c.ammo && capOn('a_aljava_cap') && wpn() && wpn().tool === 'ranged') { const mp = (o.mp || 0) + c.ammo * shotMp(wpn()); if (!live || player.stats.mp >= mp) { o.mp = mp; o.ammo = 0; o.q = 1; } }
        return o;
    }
    const cdOf = (a, r) => cdTime(at(a.cd, r));
    function reason(a, r) {   // '' = pode usar agora
        if (!gameOn()) return 'Entre no jogo.'; if (player.stats.hp <= 0) return 'Você está caído.';
        if (cdMs(a.id) > 0) return 'Em recarga (' + Math.ceil(cdMs(a.id) / 1000) + ' s).';
        if (!needOk(a.need)) return 'Equipe ' + NEED[a.need] + ' para usar ' + NODES[a.id].name + '.';
        const c = costOf(a, r, true), q = capOn('a_aljava_cap') && a.cost && a.cost.ammo;
        if (c.mp && player.stats.mp < c.mp) return 'Sem mana! (precisa de ' + fnum(c.mp) + ').';
        if (c.ammo) { const am = player.equipment.ammo; if (!am || am.qty < c.ammo) return q ? 'Sem mana nem flechas!' : 'Sem flechas equipadas!'; }
        return '';
    }
    function say1(t, c) { const n = performance.now(); if (n - S.lastMsg < 700) return; S.lastMsg = n; say(t, c || '#e67e22'); sfx('error'); }
    function castId(id) {
        const a = ACT[id], r = rankOf(id); if (!a || r < 1) return false;
        const why = reason(a, r); if (why) { say1(why); return false; }
        const out = a.run(r); if (out !== true) { say1(out); return false; }
        const c = costOf(a, r, true); if (c.mp) mana(-c.mp); if (c.ammo) spendAmmo(c.ammo);
        setCd(id, at(a.cd, r)); player.actionAnim = 15; try { player.attackCooldown = Math.max(player.attackCooldown || 0, 12); } catch (e) { } S.barSig = ''; return true;
    }
    function cast(slot) {
        if (!ensure() || !canCastKeys()) return false; const id = player.skillTree.bar[slot];
        if (!id) { say1('Slot vazio: clique nele para escolher uma habilidade (ou abra a árvore com K).', '#9ad3ff'); return false; }
        return castId(id);
    }
    function canCastKeys() { const ov = $('custom-modal-overlay'); return gameOn() && !S.ui.open && !(typeof chatOpen !== 'undefined' && chatOpen) && !(ov && ov.style.display !== 'none' && ov.style.display !== '') && $('login-overlay').style.display === 'none'; }

    /* ============================ TICK (1x por quadro, dentro de Stats.tick) ============================ */
    function tick() {
        if (!gameOn()) return; if (S.pl !== player) init(); S.frame++;
        if (S.frame % 15 === 0) { const sig = lv('combat') + ',' + lv('ranged') + ',' + lv('magic'); if (sig !== S.lvSig) { S.lvSig = sig; validate(); } }
        if (S.barrier && (S.barrier.hp <= 0 || S.barrier.until <= S.frame)) { if (S.barrier.hp <= 0) { const b = S.barrier; ring(player.x, player.y + 4, 10, 70, b.col, 18, 4); burst(player.x, player.y - 14, b.col, 14, 2); sfx('depleted'); } S.barrier = null; }
        for (let i = S.buffs.length - 1; i >= 0; i--) if (S.buffs[i].until <= S.frame) { S.buffs.splice(i, 1); try { Stats.invalidate(); } catch (e) { } }
        if (player.stats.hp > 0) {
            if (S.dash) stepDash(); stepPj(); stepZones(); drain();
            if (S.frame % 6 === 0) { for (const b of S.buffs) if (b.id === 'furor') puff(player.x + (rnd() - 0.5) * 16, player.y - 6, 'rgba(255,100,40,', 1, 4, 0.6); }
            if (S.counter > S.frame && S.counterQ > 0 && S.frame % 20 === 0) { S.counterQ = 0; if (S.extra && S.extra.onCounter) S.extra.onCounter(); }
            if (S.frame % 60 === 0) regen();
        } else if (S.Q.length) S.Q.length = 0;
        if (S.frame % 120 === 0) { for (let i = S.marks.length - 1; i >= 0; i--) if (!alive(S.marks[i]) || !(S.marks[i]._mk > S.frame)) S.marks.splice(i, 1); for (let i = S.status.length - 1; i >= 0; i--) { const o = S.status[i]; if (!alive(o) || !(o._stun > S.frame || o._slow > S.frame)) S.status.splice(i, 1); } const cd = player.skillTree.cd; if (cd) for (const k of Object.keys(cd)) if (cd[k] < Date.now() - 2000) delete cd[k]; }
        if (S.extra && S.extra.tick) S.extra.tick();
    }
    const MARTIAL_MP = 1.5;   // Guerreiro e Arqueiro (mana base menor): +1,5 de mana por segundo para sustentar as habilidades
    function regen() {
        const st = player.stats; if (st.hp < st.maxHp && S.hpRegen > 0) { S.rg.hp += S.hpRegen / 10; if (S.rg.hp >= 1) { const n = Math.floor(S.rg.hp); S.rg.hp -= n; heal(n); } }
        if (st.mp < st.maxMp) { S.rg.mp += Balance.MP_REGEN_FLAT + st.maxMp * 0.006 + S.mpRegen / 10 + (player.cls && player.cls !== 'mage' ? MARTIAL_MP : 0); if (S.rg.mp >= 1) { const n = Math.floor(S.rg.mp); S.rg.mp -= n; mana(n); } }
    }

    /* ============================ CAPSTONES (alternáveis) ============================ */
    const CAPS = SN.CAP_IDS.slice();
    const learnedCaps = () => (player && player.skillTree ? CAPS.filter((id) => rankOf(id) > 0) : []);
    const primaryCap = () => { const l = learnedCaps(); return l.find((id) => NODES[id].tree === player.cls) || l[0] || null; };
    const noteOnce = (k, t, c) => { const n = performance.now(); S.notes = S.notes || {}; if (n - (S.notes[k] || 0) < 5000) return; S.notes[k] = n; say(t, c || '#9ad3ff'); };
    function toggleCap(id) {
        const st = ensure(); if (!st) return false; id = id || primaryCap(); if (!id || !NODES[id] || NODES[id].kind !== 'c' || rankOf(id) < 1) { say1('Aprenda o poder final de uma árvore para poder ligá-lo (K).', '#9ad3ff'); return false; }
        if (!st.tg) st.tg = {}; const on = !(st.tg[id] === true); if (on) st.tg[id] = true; else delete st.tg[id];
        S.barSig = ''; try { saveDataLogic(); } catch (e) { } sfx(on ? 'accept' : 'click');
        const n = NODES[id]; say(n.name + (on ? ': LIGADO.' : ': desligado.'), on ? '#8affd8' : '#9aa0aa');
        try { Art.burst(player.x, player.y - 14, on ? TREES[n.tree].color2 : '#888', on ? 14 : 6, on ? 1.6 : 0.8); } catch (e) { }
        if (S.ui.open) { renderSide(); renderTree(true); } return on;
    }
    // chamado antes de cada ataque comum (tryInteract): devolve false = bloqueia (sem mana nem munição), função = rodar depois do ataque (gastar a mana), undefined = segue normal
    function capPre(t) {
        if (!gameOn() || !t || t.type !== 'enemy' || !t.active || !(player.attackCooldown <= 0) || player.stats.hp <= 0 || !player.skillTree || !player.skillTree.tg) return undefined;
        const w = wpn(), eq = player.equipment, st = player.stats, pj = () => (typeof projectiles !== 'undefined' ? projectiles.length : 0);
        if (w && w.tool === 'ranged' && capOn('a_aljava_cap')) {   // Aljava Mágica
            const cost = shotMp(w), real = eq.ammo, has = !!(real && real.qty >= 1);
            if (st.mp >= cost) {
                const pn = pj(); let tmp = null, q0 = 0;
                if (real) { q0 = real.qty; real.qty = q0 + 1; } else { tmp = { name: 'Flecha Mágica', stackable: true, bonusDmg: quiverBonus(w), qty: 2, virtual: true }; eq.ammo = tmp; }
                return () => { if (real) real.qty = q0; else if (eq.ammo === tmp) eq.ammo = null; if (pj() > pn) { mana(-cost); try { Art.burst(player.x + (player.facing ? player.facing.x * 10 : 0), player.y - 14, '#8ae0ff', 4, 0.8); } catch (e) { } } };
            }
            if (!has) { say1('Sem mana! A Aljava Mágica precisa de ' + cost + ' de mana (ou equipe flechas).'); return false; }
            noteOnce('aq', 'Sem mana: usando as flechas da aljava.'); return undefined;
        }
        if (w && w.tool === 'magic' && capOn('m_fonte_cap')) {   // Fonte Arcana
            let sp = null; try { sp = spellbookDB.find((x) => x.id === player.activeSpell); } catch (e) { }
            if (!sp || lv('magic') < sp.lvl) return undefined;
            const cost = spellMp(sp), req = sp.req || {}, hasRunes = Object.keys(req).every((k) => getInvCount(k) >= req[k]);
            if (st.mp >= cost) { const pn = pj(); S.noRune = req; return () => { S.noRune = null; if (pj() > pn) { mana(-cost); try { Art.burst(player.x, player.y - 16, '#b88aff', 4, 0.8); } catch (e) { } } }; }
            if (!hasRunes) { say1('Sem mana! A Fonte Arcana precisa de ' + cost + ' de mana (ou use runas).'); return false; }
            noteOnce('fa', 'Sem mana: usando as runas.'); return undefined;
        }
        if ((!w || (w.tool !== 'ranged' && w.tool !== 'magic')) && capOn('w_vigor_cap')) {   // Vigor Inabalável
            if (st.mp >= VIGOR_MP) return () => { if (player.attackCooldown > 0 && player.stats.mp >= VIGOR_MP) { mana(-VIGOR_MP); heal(Math.max(1, Math.round(st.maxHp * VIGOR_HEAL / 100)), '#ff8a7a'); } };
            noteOnce('vi', 'Sem mana: o Vigor Inabalável descansa.'); return undefined;
        }
        return undefined;
    }
    function capLines(n) {
        const out = [], on = capOn(n.id);
        if (n.id === 'a_aljava_cap') { const w = wpn(), tw = w && w.tool === 'ranged' ? w : null; out.push('Ligado: seus disparos de arco (comuns e das habilidades) não gastam flechas.'); out.push('Custo: ' + (tw ? shotMp(tw) + ' de mana por disparo (seu arco atual)' : '2 a 6 de mana por disparo (conforme o arco: arcos melhores custam mais)') + '.'); out.push('Sem mana, volta a usar flechas; sem nenhuma das duas, avisa "Sem mana".'); }
        else if (n.id === 'm_fonte_cap') { out.push('Ligado: suas magias básicas não gastam runas.'); out.push('Custo: um pouco mais de mana por magia (6 a 12, conforme a magia).'); out.push('Sem mana, volta a usar runas; sem nenhuma das duas, avisa "Sem mana".'); }
        else { out.push('Ligado: cada golpe corpo a corpo cura ' + String(VIGOR_HEAL).replace('.', ',') + '% da sua vida máxima.'); out.push('Custo: ' + VIGOR_MP + ' de mana por golpe. Sem mana, o vigor descansa e você luta normalmente.'); }
        out.push('Alternável: tecla X, botão na barra de habilidades ou aqui no painel.'); out.push('Estado: ' + (rankOf(n.id) > 0 ? (on ? 'LIGADO' : 'desligado') : 'ainda não aprendido')); return out;
    }

    /* ============================ GANCHOS (sem editar o código do jogo) ============================ */
    function install() {
        if (installed) return; installed = true;
        if (window.Stats) {
            const ot = Stats.tick; Stats.tick = function () { const r = ot.apply(this, arguments); try { tick(); } catch (e) { console.error('SkillTree.tick', e); } return r; };
            const or = Stats.reduce; Stats.reduce = function (d) {
                let v = or.apply(this, arguments);
                try {
                    if (S.pl === player && v > 0) {
                        if (S.invuln > S.frame) { try { Fx.dmg(floatingTexts, player.x, player.y - 50, 0, 'block'); } catch (e) { } return 0; }
                        const b = S.barrier; if (b && b.hp > 0 && b.until > S.frame) { const a = Math.min(b.hp, v); b.hp -= a; v -= a; try { Fx.dmg(floatingTexts, player.x, player.y - 50, a, 'block'); } catch (e) { } flash(player.x, player.y - 16, 40, b.col, 8); }
                        if (v > 0 && S.counter > S.frame) S.counterQ++;
                    }
                } catch (e) { }
                return v;
            };
            Stats.addSource('skilltree', () => { const o = {}; if (S.pl !== player) return o; for (const k of Object.keys(S.pass)) o[k] = S.pass[k]; for (const b of S.buffs) if (b.until > S.frame && b.st) for (const k of Object.keys(b.st)) o[k] = (o[k] || 0) + b.st[k]; return o; });
        }
        if (window.Art && Art.fxDraw) { const of = Art.fxDraw; Art.fxDraw = function (c) { of.apply(this, arguments); try { drawFx(c); } catch (e) { console.error('SkillTree.draw', e); } }; }
        const W = window;
        if (typeof W.applyDamage === 'function') {
            const o = W.applyDamage; W.applyDamage = function (t, dmg, sT, maxHit) {
                let d = dmg;
                try {
                    if (dmg > 0 && S.pl === player && !S.inSkill && !(window.Pets && Pets._P && Pets._P.own)) { const pc = (S.dmgPct[sT] || 0) + buffDmg(); if (pc > 0) d = sr(dmg * (1 + pc / 100)); }
                    if (dmg > 0 && t && t._mk > S.frame) d = sr(d * (1 + (t._mkp || 20) / 100));
                } catch (e) { }
                return o.call(this, t, d, sT, d > dmg ? Math.max(maxHit || 0, d) : maxHit);
            };
        }
        if (typeof W.getInvCount === 'function') { const o = W.getInvCount; W.getInvCount = function (n) { if (S.noRune && S.noRune[n] > 0) return 99999; return o.apply(this, arguments); }; }   // Fonte Arcana: durante o lançamento as runas "existem"
        if (typeof W.removeInvItem === 'function') { const o = W.removeInvItem; W.removeInvItem = function (n) { if (S.noRune && S.noRune[n] > 0) return true; return o.apply(this, arguments); }; }
        if (typeof W.tryInteract === 'function') {
            const o = W.tryInteract;
            W.tryInteract = function (t) {
                let post;
                try { post = capPre(t); } catch (e) { post = undefined; console.error('SkillTree.cap', e); }
                if (post === false) return;
                try { return o.apply(this, arguments); } finally { if (typeof post === 'function') { try { post(); } catch (e) { console.error('SkillTree.cap', e); } } }
            };
        }
        if (typeof W.mobStep === 'function') { const o = W.mobStep; W.mobStep = function (m, cur, ex_, ey_, ed, spd, ow, oh) { if (m && m._stun > S.frame) return false; if (m && m._slow > S.frame) spd *= (1 - (m._slowp || 0.5)); return o.call(this, m, cur, ex_, ey_, ed, spd, ow, oh); }; }
        if (typeof W.respawnAtVillage === 'function') { const o = W.respawnAtVillage; W.respawnAtVillage = function () { try { clearAll(true); } catch (e) { } return o.apply(this, arguments); }; }
        if (typeof W.switchMap === 'function') { const o = W.switchMap; W.switchMap = function () { try { clearAll(false); } catch (e) { } return o.apply(this, arguments); }; }
        if (typeof W.resyncFromServer === 'function') { const o = W.resyncFromServer; W.resyncFromServer = async function () { const r = await o.apply(this, arguments); try { const me = await api('/me'); if (me && me.playerData && me.playerData.skillTree) adopt(me.playerData.skillTree); } catch (e) { } return r; }; }
    }
    function clearAll(death) {   // morte: some tudo (buffs, barreira, esquiva, efeitos); a recarga continua. Troca de mapa: só projéteis/zonas/efeitos do mapa
        S.Q.length = 0; S.pj.length = 0; S.zn.length = 0; S.fx.length = 0; S.dash = null;
        if (death) { S.buffs.length = 0; S.barrier = null; S.invuln = 0; S.counter = 0; try { Stats.invalidate(); } catch (e) { } }
        if (S.extra && S.extra.clear) S.extra.clear(death);
    }
    function clear() { clearAll(true); }

    /* ============================ INTERFACE: texto dos nós ============================ */
    function effLines(n, rank, showNext) {
        const out = []; if (!n.eff) return out; const keys = Object.keys(n.eff);
        keys.forEach((k) => { const f = SN.EFF_LABEL[k]; if (!f) return; const cur = Math.round(n.eff[k] * rank * 10) / 10, nx = Math.round(n.eff[k] * (rank + 1) * 10) / 10; out.push({ k, cur: rank > 0 ? f(fnum(cur)) : '', nxt: showNext && rank < n.max ? f(fnum(nx)) : '' }); });
        return out;
    }
    function actStats(id, rank) {
        const a = ACT[id], r = Math.max(1, rank), out = []; if (!a) return out;
        if (a.mult) { const est = (gameOn() && needOk(a.need)) ? Math.round(baseDmg(a.sk) * at(a.mult, r)) : 0; out.push('Dano: ×' + fnum(at(a.mult, r)) + ' do seu dano-base' + (est ? ' (≈ ' + est + ')' : '')); }
        const info = a.info ? a.info(r) : []; info.forEach((l) => out.push(l));
        const c = costOf(a, r); const cs = []; if (c.mp) cs.push(fnum(c.mp) + ' de mana'); if (c.ammo) cs.push(c.ammo + (c.ammo > 1 ? ' flechas' : ' flecha')); out.push('Custo: ' + (cs.length ? cs.join(' + ') : 'nenhum (só recarga)') + (c.q ? ' (Aljava Mágica: sem flechas)' : ''));
        out.push('Recarga: ' + fnum(cdOf(a, r)) + ' s' + (cdrNow() > 0 ? ' (com ' + fnum(cdrNow()) + '% de redução de recarga)' : '')); out.push('Requer: ' + NEED[a.need] + (a.need === 'bow' ? ' e flechas' : ''));
        return out;
    }
    function nodeHtml(n, compact) {
        const st = ensure(), rank = rankOf(n.id), pt = points(n.tree), tag = n.kind === 'a' ? 'Ativa' : n.kind === 'c' ? 'Poder final · alternável' : 'Passiva';
        let h = '<div class="sk-ih"><img class="sk-big" src="' + Icons.skillUrl(n.ic) + '" alt=""><div><b class="sk-nm">' + esc(n.name) + '</b><div class="sk-tg ' + n.kind + '">' + tag + ' · ' + esc(TREES[n.tree].branches[n.branch]) + '</div></div></div>';
        h += '<div class="sk-rk" title="Rank">' + Array.from({ length: n.max }, (_, i) => '<i class="' + (i < rank ? 'on' : '') + '"></i>').join('') + '<span>Rank ' + rank + '/' + n.max + '</span></div>';
        if (n.d) h += '<p class="sk-d">' + esc(n.d) + '</p>';
        if (n.kind === 'p') {
            effLines(n, rank, true).forEach((l) => { h += '<div class="sk-ef">' + (l.cur ? '<span class="a">Agora:</span> ' + esc(l.cur) : '<span class="m">Rank 1:</span> ' + esc(SN.EFF_LABEL[l.k](fnum(n.eff[l.k])))) + '</div>'; if (l.cur && l.nxt) h += '<div class="sk-ef nx"><span>Próximo:</span> ' + esc(l.nxt) + '</div>'; });
        } else if (n.kind === 'c') {
            capLines(n).forEach((l) => { h += '<div class="sk-ef' + (/^Estado: LIGADO/.test(l) ? ' on' : '') + '">' + esc(l) + '</div>'; });
        } else {
            const rr = Math.max(1, rank); actStats(n.id, rr).forEach((l) => { h += '<div class="sk-ef">' + esc(l) + '</div>'; });
            if (rank < n.max && rank > 0) { const nx = actStats(n.id, rank + 1).filter((l) => !/^Requer|^Custo/.test(l)); if (nx.length) h += '<div class="sk-ef nx"><span>Rank ' + (rank + 1) + ':</span> ' + esc(nx.slice(0, 3).join(' · ')) + '</div>'; }
        }
        if (n.req.length) { h += '<div class="sk-rq">' + n.req.map((q) => { const m = NODES[q[0]], ok = rankOf(q[0]) >= q[1]; return '<span class="' + (ok ? 'ok' : 'no') + '">' + (ok ? '✔' : '✖') + ' ' + esc(m.name) + (q[1] > 1 ? ' (rank ' + q[1] + ')' : '') + '</span>'; }).join('') + '</div>'; }
        return h;
    }

    /* ============================ INTERFACE: janela da árvore ============================ */
    const TX = 132, TY = 86, PAD = 70;
    const nodeXY = (n) => [PAD + n.tier * TX, PAD + n.lane * TY];
    const V = { x: 0, y: 0, k: 1, drag: null, pts: new Map(), pinch: null, moved: false, cw: 600, ch: 400 };
    let ov = null, svg = null, world = null, tipEl = null;
    function buildUI() {
        if (ov) return;
        ov = document.createElement('div'); ov.id = 'sk-ov';
        ov.innerHTML = '<div id="sk-win" role="dialog" aria-label="Árvore de Habilidades"><div class="sk-hd"><span class="sk-ttl">Habilidades</span><div class="sk-tabs" id="sk-tabs"></div><button type="button" class="sk-x" data-a="close" aria-label="Fechar">×</button></div>' +
            '<div class="sk-main"><div class="sk-view" id="sk-view"><svg id="sk-svg" xmlns="http://www.w3.org/2000/svg"><defs></defs><g id="sk-world"></g></svg><div class="sk-zoom"><button type="button" data-a="zin" aria-label="Aproximar">+</button><button type="button" data-a="zout" aria-label="Afastar">−</button><button type="button" data-a="fit" aria-label="Ajustar">⤢</button></div><div class="sk-hint" id="sk-hint">Arraste para mover · roda ou pinça para zoom</div></div>' +
            '<div class="sk-side" id="sk-side"></div></div><div class="sk-ft" id="sk-ft"><div id="sk-ft-l"></div><div class="sk-strip" id="sk-strip"></div><div id="sk-ft-r"></div></div><div class="sk-cf" id="sk-cf"></div></div><div id="sk-tip"></div>';
        document.body.appendChild(ov); svg = $('sk-svg'); world = $('sk-world'); tipEl = $('sk-tip');
        ov.addEventListener('click', onClick); bindSlots($('sk-strip'), 'tree'); ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeUI(); });
        const view = $('sk-view');
        view.addEventListener('pointerdown', onPD); view.addEventListener('pointermove', onPM); view.addEventListener('pointerup', onPU); view.addEventListener('pointercancel', onPU);
        view.addEventListener('wheel', (e) => { e.preventDefault(); const r = view.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
        view.addEventListener('mouseover', onHover); view.addEventListener('mouseout', () => { tipEl.classList.remove('on'); });
        window.addEventListener('resize', () => { if (S.ui.open) { measure(); fitView(); } });
    }
    function measure() { const v = $('sk-view'); if (!v) return; const r = v.getBoundingClientRect(); V.cw = Math.max(100, r.width); V.ch = Math.max(100, r.height); }
    function bounds() {
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; SN.ORDER[S.ui.tab].forEach((id) => { const p = nodeXY(NODES[id]); x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
        return { x0: x0 - 52, y0: y0 - 50, x1: x1 + 104, y1: y1 + 50 };
    }
    function fitView() { const b = bounds(), w = b.x1 - b.x0, h = b.y1 - b.y0; const k = Math.min(V.cw / w, V.ch / h, 1.25); V.k = k; V.x = (V.cw - w * k) / 2 - b.x0 * k; V.y = (V.ch - h * k) / 2 - b.y0 * k; applyView(); }
    function applyView() { if (world) world.setAttribute('transform', 'translate(' + V.x.toFixed(1) + ',' + V.y.toFixed(1) + ') scale(' + V.k.toFixed(3) + ')'); }
    function zoomAt(cx, cy, f) { const k = Math.max(0.35, Math.min(2.2, V.k * f)); f = k / V.k; V.x = cx - (cx - V.x) * f; V.y = cy - (cy - V.y) * f; V.k = k; applyView(); }
    function onPD(e) {
        const v = $('sk-view'); if (e.target.closest('.sk-zoom')) return; try { v.setPointerCapture(e.pointerId); } catch (er) { }
        V.pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY }); V.moved = false; tipEl.classList.remove('on');
        if (V.pts.size === 2) { const a = [...V.pts.values()]; V.pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), k: V.k }; V.moved = true; }
        V.downNode = e.target.closest && e.target.closest('.sk-n') ? e.target.closest('.sk-n').dataset.id : null;
    }
    function onPM(e) {
        const p = V.pts.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
        if (V.pts.size === 2 && V.pinch) { const a = [...V.pts.values()], d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), r = $('sk-view').getBoundingClientRect(); zoomAt((a[0].x + a[1].x) / 2 - r.left, (a[0].y + a[1].y) / 2 - r.top, (V.pinch.k * d / V.pinch.d) / V.k); return; }
        if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 6) V.moved = true; if (V.moved && V.pts.size === 1) { V.x += dx; V.y += dy; applyView(); $('sk-view').classList.add('drag'); }
    }
    function onPU(e) {
        const p = V.pts.get(e.pointerId); V.pts.delete(e.pointerId); $('sk-view').classList.remove('drag'); if (V.pts.size < 2) V.pinch = null; if (!p) return;
        if (!V.moved && e.type === 'pointerup') { const el = document.elementFromPoint(e.clientX, e.clientY), nd = el && el.closest ? el.closest('.sk-n') : null; if (nd) select(nd.dataset.id); else if (V.downNode == null) { /* clicou no vazio */ } }
    }
    function onHover(e) {
        if (window.Mobile && Mobile.on && Mobile.on()) return; const nd = e.target.closest && e.target.closest('.sk-n'); if (!nd || V.pts.size) { tipEl.classList.remove('on'); return; }
        const n = NODES[nd.dataset.id]; if (!n) return; tipEl.innerHTML = nodeHtml(n, true); tipEl.classList.add('on');
        const r = nd.getBoundingClientRect(), tw = tipEl.offsetWidth, th = tipEl.offsetHeight; let x = r.right + 10, y = r.top - 6; if (x + tw > window.innerWidth - 8) x = r.left - tw - 10; if (y + th > window.innerHeight - 8) y = window.innerHeight - th - 8; tipEl.style.left = Math.max(8, x) + 'px'; tipEl.style.top = Math.max(8, y) + 'px';
    }
    function nodeState(n) {
        const r = rankOf(n.id), pt = points(n.tree), ranks = player.skillTree.pts[n.tree];
        if (r >= n.max) return 'max'; if (r > 0) return 'on'; if (!SN.reqOk(n, ranks)) return 'lock'; return pt.free >= n.cost ? 'avail' : 'soft';
    }
    function renderTree(keepView) {
        if (!world) return; const tree = S.ui.tab, T = TREES[tree], ranks = player.skillTree.pts[tree];
        const defs = '<radialGradient id="skg-' + tree + '"><stop offset="0" stop-color="' + T.color2 + '"/><stop offset="1" stop-color="' + T.color + '"/></radialGradient><radialGradient id="skg-off"><stop offset="0" stop-color="#3a2a1a"/><stop offset="1" stop-color="#1c130c"/></radialGradient><radialGradient id="skg-av"><stop offset="0" stop-color="#6a4a1c"/><stop offset="1" stop-color="#2a1c0c"/></radialGradient>';
        svg.querySelector('defs').innerHTML = defs;
        const ids = SN.ORDER[tree]; let h = '';
        // faixas dos ramos
        const b = bounds(); [0, 1, 2].forEach((bi) => { const y0 = PAD + bi * 2 * TY - 40, y1 = PAD + (bi * 2 + 1) * TY + 40, x0 = PAD + TX * 0.55; h += '<rect class="sk-band b' + bi + '" x="' + x0 + '" y="' + y0 + '" width="' + (b.x1 - x0 + 36) + '" height="' + (y1 - y0) + '" rx="28" style="--c:' + T.color + '"/><text class="sk-bl" transform="translate(' + (b.x1 + 18) + ',' + ((y0 + y1) / 2) + ') rotate(90)" text-anchor="middle">' + esc(T.branches[bi].toUpperCase()) + '</text>'; });
        // linhas
        ids.forEach((id) => { const n = NODES[id], p1 = nodeXY(n); n.req.forEach((q) => { const par = NODES[q[0]], p0 = nodeXY(par), okp = SN.rankOf(ranks, par.id) >= q[1], on = SN.rankOf(ranks, id) > 0; const dx = (p1[0] - p0[0]) * 0.5; const cls = on && okp ? 'lit' : okp ? 'av' : 'dim'; h += '<path class="sk-e ' + cls + '" d="M' + p0[0] + ',' + p0[1] + ' C' + (p0[0] + dx) + ',' + p0[1] + ' ' + (p1[0] - dx) + ',' + p1[1] + ' ' + p1[0] + ',' + p1[1] + '" style="--c:' + T.color2 + '"/>'; }); });
        // nós
        ids.forEach((id) => {
            const n = NODES[id], p = nodeXY(n), st = nodeState(n), r = rankOf(id), isA = n.kind === 'a', isC = n.kind === 'c', sel = S.ui.sel === id;
            const shape = isC ? '<circle class="rg" r="36"/><circle class="rg2" r="31"/><circle class="core" r="27" fill="url(#skg-' + (st === 'on' || st === 'max' ? tree : st === 'avail' || st === 'soft' ? 'av' : 'off') + ')"/>' : isA ? '<polygon class="rg" points="0,-31 27,-15.5 27,15.5 0,31 -27,15.5 -27,-15.5"/><polygon class="core" points="0,-26 22.5,-13 22.5,13 0,26 -22.5,13 -22.5,-13" fill="url(#skg-' + (st === 'on' || st === 'max' ? tree : st === 'avail' || st === 'soft' ? 'av' : 'off') + ')"/>' : '<circle class="rg" r="27"/><circle class="core" r="22.5" fill="url(#skg-' + (st === 'on' || st === 'max' ? tree : st === 'avail' || st === 'soft' ? 'av' : 'off') + ')"/>';
            h += '<g class="sk-n st-' + st + (isA ? ' act' : '') + (isC ? ' cap' + (capOn(id) ? ' tgon' : '') : '') + (sel ? ' sel' : '') + '" data-id="' + id + '" transform="translate(' + p[0] + ',' + p[1] + ')" style="--c:' + T.color + ';--c2:' + T.color2 + '">' + shape + '<image href="' + Icons.skillUrl(n.ic) + '" x="' + (isC ? -21 : -17) + '" y="' + (isC ? -21 : -17) + '" width="' + (isC ? 42 : 34) + '" height="' + (isC ? 42 : 34) + '"/>' +
                '<g class="bd" transform="translate(19,19)"><circle r="9.5"/><text y="3.6" text-anchor="middle">' + r + '/' + n.max + '</text></g>' + (st === 'max' ? '<text class="mx" y="-34" text-anchor="middle">★</text>' : '') + '<text class="nm" y="' + (isC ? 52 : isA ? 47 : 43) + '" text-anchor="middle">' + esc(n.name) + '</text></g>';
        });
        world.innerHTML = h; if (!keepView) fitView(); else applyView();
    }
    function renderTabs() {
        const t = $('sk-tabs'); if (!t) return; let h = '';
        SN.TREE_IDS.forEach((id) => { const T = TREES[id], pt = points(id), mine = player.cls === id || (!player.cls && id === 'warrior'); h += '<button type="button" class="sk-tab' + (S.ui.tab === id ? ' on' : '') + '" data-a="tab" data-t="' + id + '" style="--c:' + T.color + ';--c2:' + T.color2 + '"><img src="' + Icons.skillUrl(id === 'warrior' ? 'sword' : id === 'archer' ? 'bow' : 'wand') + '" alt="">' + esc(T.name) + (mine ? '<em title="Sua classe">★</em>' : '') + '<b class="' + (pt.free > 0 ? 'has' : '') + '">' + pt.free + '</b></button>'; });
        t.innerHTML = h;
    }
    function resetCost(tree) { const pt = points(tree), rs = (player.skillTree.rs && player.skillTree.rs[tree]) | 0; return rs < 1 ? 0 : Math.max(250, 250 * pt.spent); }
    function renderFoot() {
        const f = $('sk-ft-l'), f2 = $('sk-ft-r'); if (!f || !f2) return; const tree = S.ui.tab, T = TREES[tree], pt = points(tree), cost = resetCost(tree), coins = getInvCount('Coins');
        f.innerHTML = '<div class="sk-pts"><b>Pontos de ' + esc(T.name) + ': <span class="' + (pt.free > 0 ? 'hot' : '') + '">' + pt.free + '</span> disponíveis / ' + pt.total + ' totais</b><small>' + esc(T.skillName) + ' nível ' + pt.lvl + ' · 1 ponto a cada 2 níveis (' + pt.spent + ' gastos)</small></div>'; f2.innerHTML = '<button type="button" class="sk-b rs" data-a="reset"' + (pt.spent < 1 ? ' disabled' : '') + ' title="' + (cost ? 'Custa ' + cost + ' moedas' : 'A primeira vez desta árvore é grátis') + '">Redistribuir' + (pt.spent > 0 ? ' <small>' + (cost ? fmtNum(cost) + ' 🪙' : 'grátis') + '</small>' : '') + '</button>';
        f.dataset.coins = coins; renderStrip(false);
    }
    function barSlotsHtml(id) {
        const st = player.skillTree, cur = st.bar.indexOf(id), nm = (k) => (st.bar[k] && NODES[st.bar[k]] ? NODES[st.bar[k]].name : null);
        let h = '<div class="sk-bar-sel"><b>Equipar na barra</b><span class="sk-bs-note">' + (cur >= 0 ? 'Equipada no slot <b>' + keyLabel(cur) + '</b>.' : 'Escolha o slot (troca a que já estiver nele):') + '</span><div class="sk-bs-row">' + KEYS.map((k, i) => '<button type="button" class="sk-b sm' + (cur === i ? ' on' : '') + '" data-a="slot" data-i="' + i + '" title="' + (cur === i ? 'Já está no slot ' : 'Colocar no slot ') + keyLabel(i) + (nm(i) && cur !== i ? ' (substitui ' + esc(nm(i)) + ')' : '') + '"><b>' + keyLabel(i) + '</b>' + (nm(i) && cur !== i ? '<small>' + esc(nm(i)) + '</small>' : cur === i ? '<small>aqui</small>' : '<small>vazio</small>') + '</button>').join('') + '</div>';
        if (cur >= 0) h += '<button type="button" class="sk-b sm rm" data-a="unslot" title="Tirar da barra">Remover da barra</button>';
        return h + '</div>';
    }
    function renderSide() {
        const s = $('sk-side'); if (!s) return; const id = S.ui.sel; if (!id || !NODES[id] || NODES[id].tree !== S.ui.tab) { const T = TREES[S.ui.tab]; s.innerHTML = '<div class="sk-ih"><img class="sk-big" src="' + Icons.skillUrl(S.ui.tab === 'warrior' ? 'sword' : S.ui.tab === 'archer' ? 'bow' : 'wand') + '" alt=""><div><b class="sk-nm">' + esc(T.name) + '</b><div class="sk-tg">' + esc(T.blurb) + '</div></div></div><p class="sk-d">Toque num nó para ver os detalhes e gastar pontos. <b>Hexágonos</b> são habilidades <b>ativas</b> (vão para a barra); <b>círculos</b> são <b>passivas</b>; o <b>grande círculo dourado</b> no fim da árvore é o <b>poder final</b>, que você liga e desliga.</p><p class="sk-d">Os pontos desta árvore vêm do nível de <b>' + esc(T.skillName) + '</b>: 1 ponto a cada 2 níveis.</p>' + (player.cls === S.ui.tab || (!player.cls && S.ui.tab === 'warrior') ? '<p class="sk-d rec">★ Árvore recomendada para a sua classe.</p>' : ''); return; }
        const n = NODES[id], r = rankOf(id), pt = points(n.tree), why = SN.canLearn(player.skillTree.pts[n.tree], id, pt.free);
        let h = nodeHtml(n, false); h += '<div class="sk-act">';
        if (r >= n.max) h += '<button type="button" class="sk-b go" disabled>Rank máximo</button>';
        else h += '<button type="button" class="sk-b go" data-a="learn" ' + (why ? 'disabled' : '') + '>' + (r ? 'Melhorar para o rank ' + (r + 1) : 'Aprender') + ' <small>(' + n.cost + (n.cost > 1 ? ' pontos' : ' ponto') + ')</small></button>' + (why ? '<div class="sk-why">' + esc(why) + '</div>' : '');
        if (n.kind === 'c' && r > 0) { const on = capOn(id); h += '<button type="button" class="sk-b tgl' + (on ? ' on' : '') + '" data-a="togcap" data-id="' + id + '">' + (on ? 'Ligado · tocar para desligar (X)' : 'Desligado · tocar para ligar (X)') + '</button>'; }
        h += '</div>'; if (n.kind === 'a' && r > 0) h += barSlotsHtml(id);
        s.innerHTML = h;
    }
    function renderConfirm() {
        const c = $('sk-cf'); if (!c) return; const q = S.ui.confirm; if (!q) { c.classList.remove('on'); c.innerHTML = ''; return; }
        c.classList.add('on'); c.innerHTML = '<div class="sk-cfb"><b>Redistribuir ' + esc(TREES[q.tree].name) + '?</b><p>Devolve os <b>' + q.spent + ' pontos</b> gastos nesta árvore (as habilidades saem da barra). ' + (q.cost ? 'Custa <b>' + fmtNum(q.cost) + ' moedas</b>' + (q.have < q.cost ? ' <span class="no">(você tem ' + fmtNum(q.have) + ')</span>' : '') + '.' : 'A primeira vez é <b>grátis</b>; as próximas custam 250 moedas por ponto gasto.') + '</p><div><button type="button" class="sk-b go" data-a="cfok"' + (q.have < q.cost ? ' disabled' : '') + '>Confirmar</button><button type="button" class="sk-b" data-a="cfno">Cancelar</button></div></div>';
    }
    function renderAll() { if (!S.ui.open || !ov) return; renderTabs(); renderTree(true); renderSide(); renderFoot(); renderStrip(true); renderConfirm(); }
    function select(id) { S.ui.sel = id; renderTree(true); renderSide(); }
    function onClick(e) {
        const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
        if (a === 'close') closeUI(); else if (a === 'tab') { S.ui.tab = b.dataset.t; S.ui.sel = null; try { localStorage.setItem('ms_sk_tab', S.ui.tab); } catch (er) { } renderAll(); fitView(); }
        else if (a === 'zin') zoomAt(V.cw / 2, V.ch / 2, 1.25); else if (a === 'zout') zoomAt(V.cw / 2, V.ch / 2, 1 / 1.25); else if (a === 'fit') fitView();
        else if (a === 'learn') { const r = learn(S.ui.sel); if (!r.ok) say(r.msg, '#e67e22'); }
        else if (a === 'togcap') toggleCap(b.dataset.id || S.ui.sel); else if (a === 'slot') setSlot(S.ui.sel, +b.dataset.i); else if (a === 'unslot') clearSlot(S.ui.sel);
        else if (a === 'reset') { const tr = S.ui.tab, pt = points(tr); if (pt.spent > 0) { S.ui.confirm = { tree: tr, spent: pt.spent, cost: resetCost(tr), have: getInvCount('Coins') }; renderConfirm(); } }
        else if (a === 'cfno') { S.ui.confirm = null; renderConfirm(); } else if (a === 'cfok') { const q = S.ui.confirm; S.ui.confirm = null; const r = reset(q.tree); say(r.msg, r.ok ? '#6fe08a' : '#e67e22'); renderAll(); }
    }
    function openUI(tab) {
        if (!ensure()) return; buildUI(); S.ui.open = true;
        let t = tab; if (!t) { try { t = localStorage.getItem('ms_sk_tab'); } catch (e) { } } if (!TREES[t]) t = (TREES[player.cls] ? player.cls : 'warrior'); S.ui.tab = t; S.ui.confirm = null;
        try { releaseKeys(); } catch (e) { } ov.classList.add('on'); document.body.classList.add('sk-open'); measure(); renderAll(); requestAnimationFrame(() => { measure(); fitView(); });
    }
    function closeUI() { S.ui.open = false; if (ov) ov.classList.remove('on'); document.body.classList.remove('sk-open'); if (tipEl) tipEl.classList.remove('on'); S.ui.confirm = null; }
    const toggleUI = () => (S.ui.open ? closeUI() : openUI());

    /* ---------- ações ---------- */
    function learn(id) {
        const st = ensure(), n = NODES[id]; if (!st || !n) return { ok: false, msg: 'Habilidade inexistente.' };
        const ranks = st.pts[n.tree], why = SN.canLearn(ranks, id, points(n.tree).free); if (why) return { ok: false, msg: why };
        const first = !ranks[id]; ranks[id] = (ranks[id] | 0) + 1; recompute();
        if (n.kind === 'a' && first && st.bar.indexOf(id) < 0) { const i = st.bar.indexOf(null); if (i >= 0) st.bar[i] = id; }
        if (n.kind === 'c' && first) { if (!st.tg) st.tg = {}; st.tg[id] = true; say(n.name + ' aprendido e LIGADO! Tecla X (ou botão na barra) liga e desliga.', '#8affd8'); }
        S.barSig = ''; sfx('accept'); try { Art.burst(player.x, player.y - 14, TREES[n.tree].color2, 10, 1.2); } catch (e) { }
        try { saveDataLogic(); } catch (e) { } renderAll(); return { ok: true, msg: n.name + ' → rank ' + ranks[id] };
    }
    function reset(tree) {
        const st = ensure(), pt = points(tree); if (!st || !TREES[tree]) return { ok: false, msg: 'Árvore inexistente.' }; if (pt.spent < 1) return { ok: false, msg: 'Nada a redistribuir.' };
        const cost = resetCost(tree); if (cost > 0) { if (getInvCount('Coins') < cost) return { ok: false, msg: 'Moedas insuficientes (' + fmtNum(cost) + ').' }; removeInvItem('Coins', cost); }
        st.pts[tree] = {}; if (st.tg) CAPS.forEach((c) => { if (NODES[c].tree === tree) delete st.tg[c]; }); st.rs[tree] = Math.min(9999, (st.rs[tree] | 0) + 1);
        for (let i = 0; i < BAR_N; i++) if (st.bar[i] && NODES[st.bar[i]] && NODES[st.bar[i]].tree === tree) st.bar[i] = null;
        recompute(); S.barSig = ''; S.free = freeAll(); try { saveDataLogic(true); updateUI(); } catch (e) { }
        return { ok: true, msg: 'Árvore redistribuída' + (cost ? ' (−' + fmtNum(cost) + ' moedas).' : ' (grátis).') };
    }
    const saveBar = () => { S.barSig = ''; try { saveDataLogic(); } catch (e) { } if (S.ui.open) { renderSide(); renderStrip(true); } };
    function setSlot(id, i) {   // coloca a ativa `id` no slot i (substitui o que estiver lá; se já estava em outro slot, os dois trocam de lugar)
        const st = ensure(); if (!st || !NODES[id] || NODES[id].kind !== 'a' || rankOf(id) < 1 || !(i >= 0 && i < BAR_N)) return false;
        const j = st.bar.indexOf(id); if (j === i) return true; if (j >= 0) st.bar[j] = st.bar[i]; st.bar[i] = id; saveBar(); return true;
    }
    function removeAt(i) { const st = ensure(); if (!st || !(i >= 0 && i < BAR_N) || !st.bar[i]) return false; const n = NODES[st.bar[i]]; st.bar[i] = null; saveBar(); say((n ? n.name : 'Habilidade') + ' removida da barra.', '#9ad3ff'); return true; }
    function swapSlots(i, j) { const st = ensure(); if (!st || !(i >= 0 && i < BAR_N) || !(j >= 0 && j < BAR_N) || i === j) return false; const t = st.bar[i]; st.bar[i] = st.bar[j]; st.bar[j] = t; saveBar(); return true; }
    function clearSlot(id) { const st = ensure(); if (!st) return; const j = st.bar.indexOf(id); if (j >= 0) removeAt(j); }

    /* ============================ BARRA DE HABILIDADES + BOTÕES ============================ */
    let bar = null, btn = null, lastKey = '', pick = null;
    const isTouch = () => !!(window.Mobile && Mobile.on && Mobile.on());
    const keyLabel = (i) => (isTouch() ? String(i + 1) : KEYS[i].toUpperCase());   // desktop: a tecla; celular: a ordem (1-4)
    const HINT_HOVER = 'Clique direito: remover · Arraste: reordenar · ✎: trocar';
    const HINT_EDIT = 'Toque num slot para trocar · arraste para reordenar · × remove · ✎ sai';
    function slotInfo(i) {
        const id = player.skillTree.bar[i]; if (!id) return null; const a = ACT[id], r = rankOf(id); if (!a || r < 1) return null; return { id, a, r, n: NODES[id] };
    }
    function slotHtml(i, strip) {   // um slot da barra (HUD ou faixa de edição dentro da árvore): tecla, ícone, custo, recarga e botão de remover
        const s = slotInfo(i), k = keyLabel(i);
        if (!s) return '<div class="sk-s empty" data-i="' + i + '" title="Slot ' + k + ' vazio: ' + (strip ? 'selecione uma habilidade ativa na árvore e toque aqui' : 'clique para escolher uma habilidade') + '"><b class="sk-k">' + k + '</b><span>+</span></div>';
        const c = costOf(s.a, s.r), cs = c.mp ? '<s class="mp" title="Custo de mana' + (c.ammo ? ' e flechas' : '') + '">' + fnum(c.mp) + (c.ammo ? '<sup>+' + c.ammo + '➶</sup>' : '') + '</s>' : c.ammo ? '<s class="am" title="Gasta flechas">' + c.ammo + '</s>' : '';
        return '<div class="sk-s" data-i="' + i + '" style="--c:' + s.a.col + '"><div class="sk-c"><img class="sk-ic" src="' + Icons.skillUrl(s.n.ic) + '" alt=""><i class="cd"></i><u></u></div><b class="sk-k">' + k + '</b>' + cs + '<em class="sk-cb" title="Recarga">' + fnum(cdOf(s.a, s.r)) + 's</em><button type="button" class="sk-rm" tabindex="-1" aria-label="Remover ' + esc(s.n.name) + ' da barra" title="Remover da barra">×</button></div>';
    }
    /* ---- arrastar/trocar/remover (barra do jogo e faixa da árvore): toque curto = usar (ou escolher, se vazio / modo editar); arrastar para outro slot = trocar; arrastar para fora = remover; botão direito = remover ---- */
    const DR = { on: false };
    function slotOf(e) { const t = e.target && e.target.closest ? e.target.closest('.sk-s') : null; return t && !t.dataset.x && t.dataset.i !== undefined ? t : null; }
    function dragReset() { if (DR.timer) clearTimeout(DR.timer); if (DR.ghost) DR.ghost.remove(); document.querySelectorAll('.sk-s.drop,.sk-s.dragging').forEach((el) => el.classList.remove('drop', 'dragging')); DR.on = false; DR.drag = false; DR.ghost = null; DR.timer = 0; }
    function outsideAll(x, y) {
        const roots = [bar, $('sk-strip')].filter((r) => r && r.offsetWidth); for (const r of roots) { const b = r.getBoundingClientRect(); if (x >= b.left - 26 && x <= b.right + 26 && y >= b.top - 26 && y <= b.bottom + 26) return false; } return true;
    }
    function bindSlots(root, mode) {
        root.addEventListener('pointerdown', (e) => {
            if (e.button !== undefined && e.button !== 0) return; const el = slotOf(e); if (!el || !ensure()) return;
            if (e.target.closest('.sk-rm')) return;   // o ×: tratado no click
            if (mode === 'hud') e.preventDefault();
            const i = +el.dataset.i, was = !!(pick && pick.classList.contains('on') && pick._i === i); closePick(); dragReset(); DR.was = was; DR.on = true; DR.mode = mode; DR.i = i; DR.el = el; DR.x0 = e.clientX; DR.y0 = e.clientY; DR.pt = e.pointerType; DR.filled = !el.classList.contains('empty'); DR.drag = false; DR.lp = false;
            if (mode === 'hud' && e.pointerType === 'touch' && !S.edit && DR.filled) DR.timer = setTimeout(() => { if (DR.on && !DR.drag) { DR.lp = true; setEdit(true); try { navigator.vibrate && navigator.vibrate(20); } catch (er) { } say('Modo editar: toque num slot para trocar, arraste para reordenar, × remove.', '#9ad3ff'); } }, 480);
        });
        root.addEventListener('click', (e) => {
            const x = e.target.closest('.sk-rm'); if (!x) return; const el = x.closest('.sk-s'); e.preventDefault(); e.stopPropagation(); if (el) removeAt(+el.dataset.i);
        });
        root.addEventListener('contextmenu', (e) => { const el = slotOf(e); if (!el) return; e.preventDefault(); if (!el.classList.contains('empty')) removeAt(+el.dataset.i); });
        root.addEventListener('dragstart', (e) => e.preventDefault());
    }
    document.addEventListener('pointermove', (e) => {
        if (!DR.on) return; const dx = e.clientX - DR.x0, dy = e.clientY - DR.y0;
        if (!DR.drag) {
            if (Math.hypot(dx, dy) < 8) return; if (!DR.filled) { dragReset(); return; }
            if (DR.pt === 'touch' && DR.mode === 'hud' && !S.edit) { dragReset(); return; }   // no celular, arrastar na barra só no modo editar (senão atrapalha o jogo)
            if (DR.timer) { clearTimeout(DR.timer); DR.timer = 0; }
            DR.drag = true; DR.el.classList.add('dragging'); const g = document.createElement('div'); g.className = 'sk-ghost'; const im = DR.el.querySelector('.sk-ic'); g.innerHTML = '<img src="' + (im ? im.src : '') + '" alt=""><span>Solte fora para remover</span>'; document.body.appendChild(g); DR.ghost = g;
        }
        e.preventDefault(); DR.ghost.style.left = e.clientX + 'px'; DR.ghost.style.top = e.clientY + 'px';
        const out = outsideAll(e.clientX, e.clientY); DR.ghost.classList.toggle('out', out);
        document.querySelectorAll('.sk-s.drop').forEach((el) => el.classList.remove('drop')); const under = document.elementFromPoint(e.clientX, e.clientY), t = under && under.closest ? under.closest('.sk-s') : null; if (t && !t.dataset.x && t !== DR.el) t.classList.add('drop');
    }, { passive: false });
    document.addEventListener('pointerup', (e) => {
        if (!DR.on) return; const d = { ...DR }; const under = document.elementFromPoint(e.clientX, e.clientY), t = under && under.closest ? under.closest('.sk-s') : null; dragReset();
        if (d.drag) { if (t && !t.dataset.x && t.dataset.i !== undefined) swapSlots(d.i, +t.dataset.i); else if (outsideAll(e.clientX, e.clientY)) removeAt(d.i); return; }
        if (d.lp) return; onSlotTap(d.mode, d.i, d.el, d.was);
    });
    document.addEventListener('pointercancel', () => { if (DR.on) dragReset(); });
    function onSlotTap(mode, i, el, was) {
        if (mode === 'tree') {
            const id = player.skillTree.bar[i];
            if (id) { S.ui.tab = NODES[id].tree; S.ui.sel = id; renderAll(); return; }
            const sel = S.ui.sel; if (sel && NODES[sel] && NODES[sel].kind === 'a' && rankOf(sel) > 0) { setSlot(sel, i); say(NODES[sel].name + ' equipada no slot ' + keyLabel(i) + '.', '#6fe08a'); return; }
            openPick(i, el); return;
        }
        if (el.classList.contains('empty') || S.edit) { if (was) return; openPick(i, el); return; }
        cast(i);
    }
    function setEdit(v) { S.edit = !!v; if (!S.edit) closePick(); S.barSig = ''; }
    /* ---- seletor: escolher qual habilidade vai para o slot ---- */
    function closePick() { if (pick && pick.classList.contains('on')) { pick._ct = performance.now(); pick.classList.remove('on'); pick.innerHTML = ''; } }
    function openPick(i, el) {
        if (!ensure()) return; const ids = learnedActives();
        if (!pick) { pick = document.createElement('div'); pick.id = 'sk-pick'; document.body.appendChild(pick); pick.addEventListener('click', onPickClick); pick.addEventListener('pointerdown', (e) => e.stopPropagation()); document.addEventListener('pointerdown', (e) => { if (pick.classList.contains('on') && !pick.contains(e.target)) closePick(); }, true); }
        if (!ids.length) { say('Aprenda uma habilidade ativa na árvore (K) para colocar na barra.', '#9ad3ff'); openUI(); return; }
        const st = player.skillTree, cur = st.bar[i];
        let h = '<div class="sk-ph">Slot <b>' + keyLabel(i) + '</b>: escolha a habilidade</div>';
        ids.forEach((id) => { const n = NODES[id], a = ACT[id], r = rankOf(id), c = costOf(a, r), at_ = st.bar.indexOf(id); h += '<button type="button" class="sk-pr' + (at_ === i ? ' on' : '') + '" data-id="' + id + '" style="--c:' + a.col + '"><img src="' + Icons.skillUrl(n.ic) + '" alt=""><span><b>' + esc(n.name) + '</b><small>rank ' + r + ' · ' + (c.mp ? 'mana ' + fnum(c.mp) + (c.ammo ? ' + ' + c.ammo + ' flecha(s)' : '') + ' · ' : c.ammo ? c.ammo + ' flecha(s) · ' : '') + 'recarga ' + fnum(cdOf(a, r)) + ' s</small></span>' + (at_ >= 0 ? '<em>' + keyLabel(at_) + '</em>' : '') + '</button>'; });
        if (cur) h += '<button type="button" class="sk-pr rm" data-id="">Esvaziar o slot ' + keyLabel(i) + '</button>';
        pick._i = i; pick.innerHTML = h; pick.classList.add('on');
        const r = el.getBoundingClientRect(), pw = Math.min(260, window.innerWidth - 16), up = r.top - 16, dn = window.innerHeight - r.bottom - 16, above = up >= Math.min(dn, 260) || up >= dn;
        pick.style.width = pw + 'px'; pick.style.maxHeight = Math.max(110, Math.min(300, above ? up : dn)) + 'px'; const ph = Math.min(pick.scrollHeight, parseFloat(pick.style.maxHeight));
        const x = Math.max(8, Math.min(window.innerWidth - pw - 8, r.left + r.width / 2 - pw / 2)), y = above ? r.top - ph - 10 : r.bottom + 10; pick.style.left = x + 'px'; pick.style.top = Math.max(8, Math.min(window.innerHeight - ph - 8, y)) + 'px'; pick._ot = DR.pt === 'touch' ? performance.now() : 0;
    }
    function onPickClick(e) {
        if (performance.now() - (pick._ot || 0) < 350) return;   // o clique do mesmo toque que abriu o seletor
        const b = e.target.closest('.sk-pr'); if (!b || !pick._i && pick._i !== 0) return; const i = pick._i, id = b.dataset.id; closePick();
        if (!id) { removeAt(i); return; } if (setSlot(id, i)) say(NODES[id].name + ' equipada no slot ' + keyLabel(i) + '.', '#6fe08a');
    }
    /* ---- barra recolhível e móvel: estado só neste aparelho (localStorage: ms_sk_barui = {c: recolhida 0/1, x, y: posição em fração da área livre da tela}) ---- */
    const LSUI = 'ms_sk_barui'; let UIS = {}, MV = null;
    try { const o = JSON.parse(localStorage.getItem(LSUI) || 'null'); if (o && typeof o === 'object') UIS = o; } catch (e) { }
    const saveUiState = () => { try { localStorage.setItem(LSUI, JSON.stringify(UIS)); } catch (e) { } };
    const barCollapsed = () => UIS.c === 1 ? true : UIS.c === 0 ? false : isTouch();   // padrão: recolhida no celular, aberta no computador
    const hasPos = () => typeof UIS.x === 'number' && typeof UIS.y === 'number';
    function setCollapsed(v) { UIS.c = v ? 1 : 0; saveUiState(); S.barSig = ''; try { renderBar(); place(); } catch (e) { } }
    function resetBarPos() { delete UIS.x; delete UIS.y; saveUiState(); if (bar) { bar.classList.remove('mv'); bar.style.left = ''; bar.style.top = ''; } place(); say('Posição da barra restaurada.', '#9ad3ff'); }
    function clampBar(l, t) { const w = bar.offsetWidth || 60, h = bar.offsetHeight || 40, vw = window.innerWidth, vh = window.innerHeight; return { l: Math.max(0, Math.min(vw - w, l)), t: Math.max(0, Math.min(vh - h, t)), fw: Math.max(1, vw - w), fh: Math.max(1, vh - h) }; }
    function applyPos() { if (!bar) return false; if (!hasPos()) { bar.classList.remove('mv'); return false; } const w = Math.max(1, window.innerWidth - (bar.offsetWidth || 60)), h = Math.max(1, window.innerHeight - (bar.offsetHeight || 40)); const c = clampBar(UIS.x * w, UIS.y * h); bar.classList.add('mv'); bar.style.left = c.l + 'px'; bar.style.top = c.t + 'px'; return true; }
    function bigPanelOpen() {   // modais, banco, janelas e gaveta do celular ficam por cima da barra: ela some enquanto estiverem abertos
        if (document.body.classList.contains('m-drawer')) return true;
        for (const id of ['custom-modal-overlay', 'bank-win', 'mimic-win', 'pets-win', 'stats-panel', 'cg-overlay', 'sk-ov']) { const el = $(id); if (el && el.offsetWidth > 0 && getComputedStyle(el).display !== 'none') return true; }
        return false;
    }
    function bindMove() {
        bar.addEventListener('pointerdown', (e) => {
            const g = e.target.closest('.sk-gr'); if (!g || (e.button !== undefined && e.button !== 0)) return; e.preventDefault();
            const r = bar.getBoundingClientRect(); MV = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId, moved: false }; try { g.setPointerCapture(e.pointerId); } catch (er) { } bar.classList.add('moving');
        });
        document.addEventListener('pointermove', (e) => {
            if (!MV) return; const c = clampBar(e.clientX - MV.dx, e.clientY - MV.dy); MV.moved = true; bar.classList.add('mv'); bar.style.left = c.l + 'px'; bar.style.top = c.t + 'px'; e.preventDefault();
        }, { passive: false });
        const end = () => { if (!MV) return; const m = MV; MV = null; bar.classList.remove('moving'); if (m.moved) { const c = clampBar(parseFloat(bar.style.left) || 0, parseFloat(bar.style.top) || 0); UIS.x = c.l / c.fw; UIS.y = c.t / c.fh; saveUiState(); } };
        document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
    }
    function mkBar() {
        if (bar) return; bar = document.createElement('div'); bar.id = 'sk-bar'; document.body.appendChild(bar); bindSlots(bar, 'hud'); bindMove();
        bar.addEventListener('click', (e) => {
            const cb = e.target.closest('.sk-col'); if (cb) { setCollapsed(!barCollapsed()); return; }
            if (e.target.closest('.sk-rp')) { resetBarPos(); return; }
            const x = e.target.closest('.sk-ed'); if (x) { setEdit(!S.edit); return; }
            const s = e.target.closest('.sk-s'); if (s && s.dataset.cap) { toggleCap(s.dataset.cap); return; } if (s && s.dataset.x) { if (S.extra && S.extra.cast) S.extra.cast(); }
        });
        btn = document.createElement('button'); btn.type = 'button'; btn.id = 'sk-btn'; btn.title = 'Habilidades (K)'; btn.setAttribute('aria-label', 'Habilidades'); btn.innerHTML = '<img src="' + Icons.skillUrl('star') + '" alt=""><i></i>'; btn.onclick = () => toggleUI(); document.body.appendChild(btn);
    }
    function renderBar() {
        const on = gameOn(); if (!bar) return; if (!on || !ensure()) { bar.style.display = 'none'; if (btn) btn.style.display = 'none'; return; }
        const ex_ = S.extra && S.extra.slot ? S.extra.slot() : null; const learned = learnedActives().length;
        const sig = player.skillTree.bar.map((id) => (id || '-') + (id ? rankOf(id) : '')).join(',') + '|' + (ex_ ? ex_.id : '') + '|' + learned + '|' + (isTouch() ? 1 : 0) + '|' + (S.edit ? 1 : 0) + '|' + (barCollapsed() ? 1 : 0) + '|' + cdrNow() + '|' + learnedCaps().map((c) => c + (capOn(c) ? 1 : 0)).join(',');
        if (sig !== S.barSig) {
            S.barSig = sig; let h = '';
            for (let i = 0; i < BAR_N; i++) { if (!slotInfo(i) && learned < 1) continue; h += slotHtml(i, false); }
            if (h) h += '<button type="button" class="sk-ed' + (S.edit ? ' on' : '') + '" aria-label="Editar a barra" title="Editar a barra: trocar, reordenar e remover habilidades">✎</button>';
            if (ex_) h += '<div class="sk-s xs" data-x="1" style="--c:' + ex_.col + '"><div class="sk-c"><img class="sk-ic" src="' + Icons.skillUrl(ex_.ic) + '" alt=""><i class="cd"></i><u></u></div><b class="sk-k set">' + esc(isTouch() ? 'SET' : ex_.key) + '</b>' + (ex_.mp ? '<s class="mp" title="Custo de mana">' + ex_.mp + '</s>' : '') + '<em class="sk-cb" title="Recarga">' + Math.round(ex_.total) + 's</em></div>';
            { const pc = primaryCap(); learnedCaps().forEach((cid) => { const n = NODES[cid], on = capOn(cid); h += '<div class="sk-s xs cap' + (on ? ' on' : '') + '" data-x="2" data-cap="' + cid + '" style="--c:' + TREES[n.tree].color2 + '" role="button" aria-pressed="' + on + '" aria-label="' + esc(n.name) + (on ? ' ligado' : ' desligado') + '"><div class="sk-c"><img class="sk-ic" src="' + Icons.skillUrl(n.ic) + '" alt=""></div><b class="sk-k set">' + (cid === pc ? (isTouch() ? 'PODER' : 'X') : '★') + '</b><em class="sk-cb tg">' + (on ? 'Ligado' : 'Desl.') + '</em></div>'; }); if (learnedCaps().length) h = h || ' '; }
            if (h && S.edit) h += '<button type="button" class="sk-rp" title="Volta a barra para o lugar padrão">Resetar posição</button>';
            if (h) { const cl = barCollapsed(); h = '<div class="sk-hd"><span class="sk-gr" title="Arraste para mover a barra" aria-label="Mover a barra de habilidades">⠿</span><button type="button" class="sk-col" aria-expanded="' + !cl + '" aria-label="' + (cl ? 'Expandir' : 'Recolher') + ' a barra de habilidades" title="' + (cl ? 'Expandir a barra de habilidades' : 'Recolher a barra de habilidades') + '">' + (cl ? '<small>Hab.</small> ▴' : '▾') + '</button></div>' + h; }
            if (h) h += '<div class="sk-hl"><span class="h1">' + HINT_HOVER + '</span><span class="h2">' + HINT_EDIT + '</span></div>';
            bar.innerHTML = h; bar.classList.toggle('has', !!h); bar.classList.toggle('edit', !!S.edit); bar.classList.toggle('col', barCollapsed()); lastKey = '';
            if (h && !S.hintSaid) { S.hintSaid = true; let seen = false; try { seen = !!localStorage.getItem('ms_sk_barhint'); localStorage.setItem('ms_sk_barhint', '1'); } catch (e) { } if (!seen && learned > 0) say(isTouch() ? 'Dica: segure uma habilidade da barra para editar (trocar, reordenar, remover).' : 'Dica: clique com o botão direito numa habilidade da barra para removê-la; arraste para reordenar.', '#9ad3ff'); }
        }
        bar.style.display = bar.classList.contains('has') ? 'flex' : 'none';
        const kids = bar.querySelectorAll('.sk-s'); let t = '';
        for (let k = 0; k < kids.length; k++) {
            const el = kids[k]; let left = 0, tot = 1, bad = false, title = '', col = '';
            if (el.dataset.cap) { const cid = el.dataset.cap, n = NODES[cid], on = capOn(cid), tt = n.name + (on ? ' — LIGADO' : ' — desligado') + (cid === primaryCap() ? ' (tecla X)' : '') + '\n' + capLines(n).slice(0, 3).join('\n') + '\nClique para ' + (on ? 'desligar' : 'ligar'); if (el.title !== tt) el.title = tt; continue; }
            if (el.dataset.x) { const x = S.extra && S.extra.slot ? S.extra.slot() : null; if (!x) continue; left = x.left; tot = x.total; bad = !x.ok; title = x.title; }
            else { if (el.classList.contains('empty')) continue; const s = slotInfo(+el.dataset.i); if (!s) continue; left = cdMs(s.id) / 1000; tot = Math.max(1, cdOf(s.a, s.r)); const why = reason(s.a, s.r); bad = !!why && left <= 0; title = s.n.name + ' (rank ' + s.r + ') — tecla ' + KEYS[+el.dataset.i].toUpperCase() + '\n' + actStats(s.id, s.r).join('\n') + (why && left <= 0 ? '\n⚠ ' + why : '') + '\nClique direito: remover · arraste: reordenar'; }
            const p = left > 0 ? Math.min(100, left / tot * 100) : 0, cdEl = el.querySelector('.cd'), ct = el.querySelector('u'), txt = left > 0 ? (left >= 10 ? Math.ceil(left) : (Math.ceil(left * 10) / 10).toFixed(1)) : '';
            if (cdEl && cdEl._p !== p.toFixed(0)) { cdEl._p = p.toFixed(0); cdEl.style.setProperty('--p', p.toFixed(1) + '%'); }
            if (ct && ct._t !== txt) { ct._t = txt; ct.textContent = txt; }
            const was = el._cd; el._cd = left > 0; if (was && !el._cd) { el.classList.remove('rdy'); void el.offsetWidth; el.classList.add('rdy'); }
            el.classList.toggle('bad', bad); if (el.title !== title) el.title = title;
        }
        const f = totalFree(); if (btn) { btn.style.display = 'flex'; const i = btn.querySelector('i'); const sg = String(f); if (i._t !== sg) { i._t = sg; i.textContent = sg; } i.style.display = f > 0 ? '' : 'none'; btn.classList.toggle('pts', f > 0); }
    }
    /* faixa da barra dentro da árvore (rodapé): mesmas teclas, × e arrastar */
    function renderStrip(force) {
        const el = $('sk-strip'); if (!el || !S.ui.open || !ensure()) return;
        const st = player.skillTree, sig = st.bar.map((id) => id || '-').join(',') + '|' + (S.ui.sel || '') + '|' + (isTouch() ? 1 : 0); if (!force && el._sig === sig) return; if (DR.on && DR.mode === 'tree') return; el._sig = sig;
        let h = '<span class="sk-sl">Sua barra</span>'; for (let i = 0; i < BAR_N; i++) h += slotHtml(i, true);
        el.innerHTML = h + '<span class="sk-sh">Arraste para trocar ou tirar · clique direito remove</span>';
    }
    function place() {
        if (!bar) return; const q = $('qb'), c = $('gameCanvas'); const touch = !!(window.Mobile && Mobile.on && Mobile.on());
        const chat = $('chat-container'), hide = (chat && chat.classList.contains('open')) || S.ui.open || bigPanelOpen(); bar.style.visibility = hide ? 'hidden' : '';
        if (MV) { /* arrastando */ }
        else if (applyPos()) { /* posição escolhida pelo jogador */ }
        else if (!touch) {
            if (q && q.style.display !== 'none' && q.offsetWidth) { const r = q.getBoundingClientRect(); bar.style.left = (r.left + r.width / 2) + 'px'; bar.style.top = Math.max(8, r.top - (bar.offsetHeight || 44) - 6) + 'px'; }
            else if (c) { const r = c.getBoundingClientRect(); bar.style.left = (r.left + r.width / 2) + 'px'; bar.style.top = Math.max(8, r.bottom - 120) + 'px'; }
        }
        // botão de habilidades: ao lado do Social/Diário (desktop) ou na fileira do topo (celular)
        if (btn) {
            if (touch) { const top = $('m-top'); if (top && btn.parentNode !== top) top.insertBefore(btn, $('m-menu')); }
            else { if (btn.parentNode !== document.body) document.body.appendChild(btn); const s = document.querySelector('.hub-btn'), r = s ? s.getBoundingClientRect() : null, cr = c ? c.getBoundingClientRect() : null; if (r && r.width) { const so = document.querySelector('.soc-btn'), sr_ = so ? so.getBoundingClientRect() : r, right = Math.max(r.right, sr_.right); btn.style.left = Math.min(right + 8, (cr ? cr.right : window.innerWidth) - 44) + 'px'; btn.style.top = Math.min(r.top, sr_.top) + 'px'; } else if (cr) { btn.style.left = (cr.right - 52) + 'px'; btn.style.top = (cr.top + 78) + 'px'; } }
        }
    }
    function panelSk() {   // pequeno cartão na aba Perícias
        const tab = $('tab-sk'); if (!tab || !tab.classList.contains('active-tab')) return; let p = $('sk-panel'); if (!p) { p = document.createElement('div'); p.id = 'sk-panel'; tab.insertBefore(p, tab.firstChild); }
        const sig = SN.TREE_IDS.map((t) => points(t).free + '/' + points(t).total).join('|'); if (p._sig === sig && p.isConnected) return; p._sig = sig;
        p.innerHTML = '<h4>Árvore de Habilidades</h4>' + SN.TREE_IDS.map((t) => { const pt = points(t); return '<div class="sk-pl" style="--c:' + TREES[t].color2 + '"><span>' + esc(TREES[t].name) + '</span><b class="' + (pt.free > 0 ? 'hot' : '') + '">' + pt.free + ' / ' + pt.total + ' pts</b></div>'; }).join('') + '<button type="button" class="sk-b" id="sk-open2">Abrir árvore (K)</button>';
        const b = $('sk-open2'); if (b) b.onclick = () => openUI();
    }

    /* ============================ TECLADO E INÍCIO ============================ */
    document.addEventListener('keydown', (e) => {
        if (!gameOn() || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '') || (e.target && e.target.isContentEditable)) return;
        const k = (e.key || '').toLowerCase();
        if (k === 'k' && !e.repeat) { toggleUI(); return; }
        if (k === 'escape' && pick && pick.classList.contains('on')) { closePick(); return; }
        if (k === 'escape' && S.edit && !S.ui.open) { setEdit(false); return; }
        if (k === 'escape' && S.ui.open) { if (S.ui.confirm) { S.ui.confirm = null; renderConfirm(); } else closeUI(); return; }
        if (e.repeat || !canCastKeys()) return;
        const i = KEYS.indexOf(k); if (i >= 0) { cast(i); return; }
        if (k === 'z' && S.extra && S.extra.cast) S.extra.cast();
        else if (k === 'x') toggleCap();
    });
    function wire() {
        install(); mkBar();
        setInterval(() => { try { renderBar(); place(); panelSk(); if (S.ui.open) { renderFoot(); } } catch (e) { } }, 100);
        setInterval(() => { try { if (S.ui.open && ensure()) { renderTabs(); } } catch (e) { } }, 700);
    }
    window.addEventListener('load', () => setTimeout(wire, 50));
    window.SkillTree = {
        open: openUI, close: closeUI, toggle: toggleUI, learn, reset, cast, castId, points, toggleCap, capOn, capCost: () => ({ shot: wpn() && wpn().tool === 'ranged' ? shotMp(wpn()) : 0, vigor: VIGOR_MP }), costOf, cdOf, cdTime, primaryCap, learnedCaps, totalFree, ensure, adopt, recompute, validate, rankOf, learnedActives, ACT, resetCost,
        setSlot, clearSlot, removeAt, setCollapsed, isCollapsed: barCollapsed, resetBarPos, barRect: () => (bar ? bar.getBoundingClientRect() : null), swapSlots, openPicker: (i) => { const el = bar && bar.querySelector('.sk-s[data-i="' + i + '"]'); if (el) openPick(i, el); }, setEdit, isEdit: () => !!S.edit, bar: () => (ensure() ? player.skillTree.bar.slice() : []), isOpen: () => S.ui.open,
        state: () => ({ tree: ensure() ? JSON.parse(JSON.stringify(player.skillTree)) : null, frame: S.frame, buffs: S.buffs.map((b) => ({ id: b.id, left: b.until - S.frame })), barrier: S.barrier && { hp: S.barrier.hp, max: S.barrier.max }, invuln: S.invuln - S.frame, queue: S.Q.length, pj: S.pj.length, zones: S.zn.length, fx: S.fx.length, bonus: S.bonus, dmgPct: S.dmgPct, skd: S.skd, cdr: cdrNow(), tok: S.tok, caps: Object.assign({}, (player.skillTree && player.skillTree.tg) || {}) }),
        api: { S, cdTime, hit, aoe, enemies, alive, pickTarget, sdmg, baseDmg, heal, mana, addBuff, setBarrier, ring, flash, bolt, slashFx, fx, burst, puff, face, stun, slow, shoot, zone, startDash, callout, sfx, ex, ey, er, los, lv, setCd, cdMs, fnum, esc, glowSprite, dirToward, facingVec, needOk, isPetRide, say1, canCastKeys, mimicLevel: null },
        setExtra: (x) => { S.extra = x; S.barSig = ''; }, setExtraDraw: (f) => { S.extraDraw = f; }, clear
    };
})();
