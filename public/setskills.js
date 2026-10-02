/* MiniScape 2D — Habilidades de Set. Um conjunto COMPLETO equipado libera uma habilidade especial (tecla Z / botão brilhante ao lado da barra), com recarga longa.
   - Mímico (todas as peças da classe): Fúria Imortal / Baluarte Mímico (guerreiro: o jogador escolhe pelo "alternar" de Shift+Z não existe; usa Fúria Imortal), Tempestade Fantasma (arqueiro), Eclipse Arcano (mago). Recarga 60-120 s,
     poder cresce com o nível médio das peças Mímicas (1..50).
   - Conjuntos evolutivos (Gear.SETS com 3+ peças): bronze, ferro, aço, ouro, mithril, escama de dragão, patrulheiro, couro de dragão, místico e arcano. Recarga 90-180 s, efeito menor.
   - Desfez o conjunto: o botão some. A recarga é guardada em playerData.skillTree.cd (ids de set na lista branca do servidor), então relogar não reinicia.
   - Sem peso de arma: funcionam com qualquer arma; não funcionam montado em pet. Danos passam pela fila limitada de SkillTree (mesmos tetos do servidor). Efeitos visuais locais.
   Mostra "Habilidade do Set: X — ..." nas dicas dos itens do conjunto e no painel Mímico. */
(function () {
    'use strict';
    const ST = window.SkillTree, SN = window.SkillNodes; if (!ST || !SN) return;
    const A = ST.api, FR = 60, TAU = Math.PI * 2, $ = (id) => document.getElementById(id);
    const esc = A.esc;
    const gameOn = () => typeof player !== 'undefined' && player && player.equipment && player.stats && typeof currentUser !== 'undefined' && currentUser;
    const hasHud = () => { try { return !!ST.ensure(); } catch (e) { return false; } };

    /* ---------- catálogo ---------- */
    const K = {};   // id -> {name, desc, cd(avg), col, ic, sk, set:'mimic:cls'|'gear', run(sc)}
    const sc = (avg) => 1 + Math.max(0, avg) / 50;           // 1..2 conforme o nível médio das peças Mímicas
    const pctHp = (p) => player.stats.maxHp * p / 100;
    const ringBlast = (R, mult, skill, stunFr, col, n) => {
        const l = A.aoe(player.x, player.y, R, n || 8, true); for (let i = 0; i < l.length; i++) { A.hit(l[i], A.sdmg(skill, mult), skill, '', 5 + i); if (stunFr) A.stun(l[i], stunFr); A.burst(A.ex(l[i]), A.ey(l[i]), col, 8, 1.6); }
        A.ring(player.x, player.y + 4, 10, R, col, 28, 8); A.ring(player.x, player.y + 4, 4, R * 0.65, '#fff', 20, 4); A.flash(player.x, player.y - 12, 90, col, 20); A.burst(player.x, player.y - 10, col, 24, 2.3); return l.length;
    };
    const def = (id, o) => { K[id] = Object.assign({ id, ic: 'star', col: '#ffd24a' }, o); };

    def('mimic_guerreiro', { name: 'Fúria Imortal', ic: 'rage2', col: '#c070ff', sk: 'combat', cd: (v) => Math.round(120 - v * 1.2),
        desc: (v) => 'Barreira de ' + Math.round(40 + v * 0.6) + '% da vida máx., +' + Math.round(25 + v * 0.7) + '% de dano e +10% de roubo de vida por ' + Math.round(8 + v / 5) + ' s.',
        run(v) { A.setBarrier(pctHp(40 + v * 0.6) + 10, 8 + v / 5, '#c070ff'); A.addBuff('fury', 8 + v / 5, { dmg: Math.round(25 + v * 0.7), st: { lifesteal: 10 }, name: 'Fúria Imortal', col: '#c070ff', ic: 'rage2' }); A.ring(player.x, player.y + 4, 8, 120, '#c070ff', 28, 7); A.flash(player.x, player.y - 14, 80, '#c070ff', 22); A.burst(player.x, player.y - 14, '#e0b0ff', 26, 2.4); A.callout('FÚRIA IMORTAL!', '#d8a0ff'); A.sfx('quest'); return true; } });
    def('mimic_arqueiro', { name: 'Tempestade Fantasma', ic: 'rain', col: '#8affd8', sk: 'ranged', cd: (v) => Math.round(110 - v * 1.2),
        desc: (v) => 'Chuva de flechas espectrais num raio de 150 px: ' + Math.round(6 + v / 10) + ' saraivadas, até 8 alvos cada.',
        run(v) {
            const t = A.pickTarget(340, true) || null, cx = t ? A.ex(t) : player.x + (player.facing ? player.facing.x : 0) * 140, cy = t ? A.ey(t) : player.y + (player.facing ? player.facing.y : 1) * 140, R = 150, m = 0.9 * sc(v);
            A.ring(cx, cy, 10, R, '#8affd8', 44, 4, 0.55); A.callout('Tempestade Fantasma!', '#8affd8'); A.sfx('thunder');
            A.zone({ every: 22, left: Math.round(6 + v / 10), first: 8, fn: () => { for (let i = 0; i < 12; i++) { const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * R; A.fx({ k: 'arrow', x: cx + Math.cos(a) * d, y0: cy + Math.sin(a) * d * 0.6 - 130, y1: cy + Math.sin(a) * d * 0.6, max: 16 }); } A.ring(cx, cy, R * 0.5, R, '#8affd8', 14, 2, 0.55); const l = A.aoe(cx, cy, R, 8, false); for (let i = 0; i < l.length; i++) { A.hit(l[i], A.sdmg('ranged', m), 'ranged', '', 3 + i); A.burst(A.ex(l[i]), A.ey(l[i]), '#bfffe9', 5, 1.2); } } });
            return true;
        } });
    def('mimic_mago', { name: 'Eclipse Arcano', ic: 'nova', col: '#9a6aff', sk: 'magic', cd: (v) => Math.round(115 - v * 1.1),
        desc: (v) => 'Explosão de ' + (170) + ' px: dano ×' + (3 * sc(v)).toFixed(1).replace('.', ',') + ' em até 8 inimigos, atordoa e devolve ' + Math.round(25 + v / 2) + '% da mana.',
        run(v) { ringBlast(170, 3 * sc(v), 'magic', 60, '#9a6aff'); A.mana(player.stats.maxMp * (25 + v / 2) / 100); A.flash(player.x, player.y - 20, 130, '#2a0a5a', 26); A.callout('ECLIPSE ARCANO!', '#c8a0ff'); A.sfx('thunder'); return true; } });

    def('bronze', { name: 'Pele de Bronze', ic: 'shield', col: '#d08a4a', cd: () => 90, desc: () => 'Barreira de 20% da vida máx. por 10 s.', run() { A.setBarrier(pctHp(20) + 6, 10, '#d08a4a'); A.ring(player.x, player.y + 4, 8, 56, '#d08a4a', 22, 5); A.callout('Pele de Bronze', '#d08a4a'); A.sfx('accept'); return true; } });
    def('iron', { name: 'Pele de Ferro', ic: 'shield2', col: '#aab4c0', cd: () => 110, desc: () => 'Barreira de 30% da vida máx. e +15% de redução de dano por 10 s.', run() { A.setBarrier(pctHp(30) + 8, 10, '#aab4c0'); A.addBuff('ferro', 10, { st: { dr: 15 }, name: 'Pele de Ferro', col: '#aab4c0', ic: 'shield2' }); A.ring(player.x, player.y + 4, 8, 64, '#cfd8e0', 24, 6); A.flash(player.x, player.y - 14, 56, '#aab4c0', 16); A.callout('Pele de Ferro!', '#cfd8e0'); A.sfx('accept'); return true; } });
    def('steel', { name: 'Giro de Aço', ic: 'sword2', col: '#8ac0ff', sk: 'combat', cd: () => 100, desc: () => 'Giro em volta de você: dano ×3 em até 8 inimigos (raio 110 px).', run() { if (!A.aoe(player.x, player.y, 110, 1, true).length) return 'Nenhum inimigo ao alcance do Giro.'; A.slashFx(player.x, player.y - 8, 0, 54, '#8ac0ff', 14); A.slashFx(player.x, player.y - 8, Math.PI, 54, '#cfe6ff', 14); ringBlast(110, 3, 'combat', 0, '#8ac0ff'); A.callout('Giro de Aço!', '#8ac0ff'); A.sfx('hit'); return true; } });
    def('gold', { name: 'Toque Dourado', ic: 'clover', col: '#ffd24a', cd: () => 120, desc: () => '+15% de crítico e +30% de sorte por 15 s.', run() { A.addBuff('ouro', 15, { st: { crit: 15, luck: 30 }, name: 'Toque Dourado', col: '#ffd24a', ic: 'clover' }); A.ring(player.x, player.y + 4, 8, 70, '#ffd24a', 24, 5); A.burst(player.x, player.y - 14, '#ffe27a', 22, 2); A.callout('Toque Dourado!', '#ffd24a'); A.sfx('quest'); return true; } });
    def('mithril', { name: 'Passo Mítrico', ic: 'speed', col: '#9ae0ff', cd: () => 100, desc: () => '+25% de velocidade por 12 s e intocável por 1,5 s.', run() { A.addBuff('mithril', 12, { st: { moveSpd: 25 }, name: 'Passo Mítrico', col: '#9ae0ff', ic: 'speed' }); A.S.invuln = A.S.frame + Math.round(1.5 * FR); A.ring(player.x, player.y + 4, 6, 60, '#9ae0ff', 20, 4); A.callout('Passo Mítrico!', '#9ae0ff'); A.sfx('portal'); return true; } });
    def('dragonscale', { name: 'Sopro de Dragão', ic: 'flame', col: '#ff5a2a', sk: 'combat', cd: () => 150, desc: () => 'Cone de fogo à frente: dano ×4 em até 8 inimigos (alcance 190 px).',
        run() { const t = A.pickTarget(220, false), v = t ? A.dirToward(t) : A.facingVec(), ang = Math.atan2(v[1], v[0]); const l = A.aoe(player.x, player.y, 190, 8, true).filter((o) => { const d = Math.atan2(A.ey(o) - player.y, A.ex(o) - player.x) - ang; return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) < 0.75; }); if (!l.length) return 'Nenhum inimigo no cone de fogo.';
            const hs = l.slice(); A.face(player.x + v[0] * 50, player.y + v[1] * 50); A.fx({ k: 'cone', x: player.x, y: player.y - 10, ang, half: 0.75, r: 190, col: '#ff6a2a', max: 24 }); A.fx({ k: 'cone', x: player.x, y: player.y - 10, ang, half: 0.4, r: 170, col: '#ffd27a', max: 18 });
            for (let i = 0; i < hs.length; i++) { A.hit(hs[i], A.sdmg('combat', 4), 'combat', '', 4 + i); A.burst(A.ex(hs[i]), A.ey(hs[i]), '#ff7a3a', 10, 2); } for (let i = 0; i < 16; i++) A.puff(player.x + v[0] * (20 + i * 10), player.y - 8 + v[1] * (20 + i * 10), 'rgba(255,110,40,', 2, 8, 0.4); A.callout('Sopro de Dragão!', '#ff7a3a'); A.sfx('fire'); return true; } });
    def('ranger', { name: 'Olho de Falcão', ic: 'eye', col: '#6fe08a', cd: () => 120, desc: () => '+20% de crítico e +15% de velocidade de ataque por 12 s.', run() { A.addBuff('falcao', 12, { st: { crit: 20, atkSpd: 15 }, name: 'Olho de Falcão', col: '#6fe08a', ic: 'eye' }); A.ring(player.x, player.y + 4, 6, 60, '#6fe08a', 20, 4); A.flash(player.x, player.y - 14, 44, '#6fe08a', 14); A.callout('Olho de Falcão!', '#6fe08a'); A.sfx('accept'); return true; } });
    def('dragonhide', { name: 'Flecha Dragão', ic: 'pierce', col: '#ff6a3a', sk: 'ranged', cd: () => 120, desc: () => 'Flecha flamejante que atravessa até 6 inimigos: dano ×5, crítico garantido.',
        run() { const t = A.pickTarget(360, true); if (!t) return A.S.blocked ? 'Sem linha de visão: contorne a parede.' : 'Nenhum alvo ao alcance.'; A.face(A.ex(t), A.ey(t)); const v = A.dirToward(t); let k = 0;
            const p = A.shoot({ kind: 'arrow', col: '#ff6a3a', r: 8, vx: v[0] * 15, vy: v[1] * 15, pierce: 6, maxDist: 420, life: 60, dmg: A.sdmg('ranged', 5), sk: 'ranged' }); p.onHit = (pp, tt) => { A.hit(tt, pp.dmg * Math.pow(0.9, k++), 'ranged', 'crit', 0); A.flash(A.ex(tt), A.ey(tt), 50, '#ff6a3a', 12); A.burst(A.ex(tt), A.ey(tt), '#ffb04a', 12, 2); };
            A.flash(player.x, player.y - 14, 36, '#ff8a4a', 10); A.callout('Flecha Dragão!', '#ff7a3a'); A.sfx('fire'); return true; } });
    def('mystic', { name: 'Surto Místico', ic: 'orb', col: '#c06aff', cd: () => 120, desc: () => 'Restaura 50% da mana e cura 20% da vida máx.', run() { A.mana(player.stats.maxMp * 0.5); A.heal(pctHp(20)); A.ring(player.x, player.y + 4, 6, 60, '#c06aff', 24, 5); A.flash(player.x, player.y - 14, 56, '#c06aff', 18); A.burst(player.x, player.y - 14, '#e0b0ff', 16, 1.8); A.callout('Surto Místico!', '#d8a0ff'); A.sfx('enchant'); return true; } });
    def('arcane', { name: 'Nova Congelante', ic: 'ice', col: '#8fd8ff', sk: 'magic', cd: () => 140, desc: () => 'Onda gélida: dano ×3 em até 8 inimigos (raio 140 px), lentidão de 6 s e atordoamento breve.',
        run() { const l = A.aoe(player.x, player.y, 140, 8, true); if (!l.length) return 'Nenhum inimigo ao alcance da Nova.'; l.slice().forEach((o) => A.slow(o, 6 * FR, 0.5)); ringBlast(140, 3, 'magic', 40, '#8fd8ff'); A.callout('Nova Congelante!', '#bff0ff'); A.sfx('enchant'); return true; } });

    /* ---------- detecção do conjunto completo ---------- */
    function gearSetCount(id) { let n = 0; try { for (const k of Object.keys(itemDB)) if (itemDB[k] && itemDB[k].set === id) n++; } catch (e) { } return n; }
    function activeSet() {   // id da habilidade liberada agora (Mímico tem prioridade) ou null
        if (!gameOn()) return null;
        try { if (window.Mimic) for (const c of ['guerreiro', 'arqueiro', 'mago']) { const si = Mimic.setInfo(c); if (si.full) return { id: 'mimic_' + c, avg: si.avg }; } } catch (e) { }
        const cnt = {}; ['head', 'body', 'weapon', 'shield'].forEach((s) => { const it = player.equipment[s]; const set = it && (window.Gear ? Gear.setOf(it) : null); if (set && !(window.Mimic && Mimic.is(it))) cnt[set] = (cnt[set] || 0) + 1; });
        let best = null; for (const id of Object.keys(cnt)) { if (!K[id]) continue; const need = Math.min(4, gearSetCount(id)); if (need >= 3 && cnt[id] >= need) { if (!best || SN.SET_IDS.indexOf(id) > SN.SET_IDS.indexOf(best)) best = id; } }
        return best ? { id: best, avg: 0 } : null;
    }
    const levelFor = (a) => (a && a.avg) || 0;
    const setOfItem = (it) => { if (!it) return null; if (window.Mimic && Mimic.is(it)) { const p = Mimic.PIECES[it.name]; return p ? 'mimic_' + p.cls : null; } try { const s = window.Gear && Gear.setOf(it); return s && K[s] && Math.min(4, gearSetCount(s)) >= 3 ? s : null; } catch (e) { return null; } };
    const line = (id) => { const k = K[id]; if (!k) return ''; const a = activeSet(), v = id.indexOf('mimic_') === 0 && a && a.id === id ? a.avg : (id.indexOf('mimic_') === 0 ? 1 : 0); return 'Habilidade do Set: ' + k.name + ' — ' + k.desc(v) + ' Recarga ' + k.cd(v) + ' s (tecla Z).'; };

    /* ---------- lançar ---------- */
    function cdLeft() { const a = activeSet(); return a ? A.cdMs(a.id) / 1000 : 0; }
    function cast() {
        if (!hasHud() || !A.canCastKeys()) return false; const a = activeSet(); if (!a) { A.say1('Nenhuma habilidade de set liberada: equipe o conjunto completo.', '#9ad3ff'); return false; }
        if (player.stats.hp <= 0) return false; if (A.isPetRide()) { A.say1('Desmonte do pet para lutar.'); return false; }
        const k = K[a.id], ms = A.cdMs(a.id); if (ms > 0) { A.say1(k.name + ' em recarga (' + Math.ceil(ms / 1000) + ' s).'); return false; }
        const v = levelFor(a), out = k.run(v); if (out !== true) { A.say1(out); return false; }
        A.setCd(a.id, k.cd(v)); player.actionAnim = 15; return true;
    }
    function slot() {
        const a = activeSet(); if (!a) return null; const k = K[a.id], v = levelFor(a), left = A.cdMs(a.id) / 1000, bad = player.stats.hp <= 0 || A.isPetRide();
        return { id: a.id, key: 'Z', col: k.col, ic: k.ic, left, total: k.cd(v), ok: !bad, title: 'Habilidade do Set: ' + k.name + ' (Z)\n' + k.desc(v) + '\nRecarga: ' + k.cd(v) + ' s' };
    }
    ST.setExtra({ cast, slot, clear() { }, tick() { } });
    ST.sets = { K, activeSet, cast, line, setOfItem };

    /* ---------- dicas de itens e painel Mímico ---------- */
    if (window.Stats && Stats.tipHtml) {
        const o = Stats.tipHtml; Stats.tipHtml = function (it) { let h = o.apply(this, arguments); try { const s = setOfItem(it); if (s) { const act = activeSet(); h += '<div class="tt-stat" style="color:' + K[s].col + '">' + esc(line(s)) + (act && act.id === s ? ' (ativa)' : '') + '</div>'; } } catch (e) { } return h; };
    }
    function injectMimic() {
        const w = $('mimic-win'); if (!w || !w.classList.contains('on')) return; const body = w.querySelector('.mm-body'); if (!body || body.querySelector('.ss-box')) return;
        let tab = 'guerreiro'; try { tab = (Mimic._S && Mimic._S.ui.tab) || tab; } catch (e) { } const id = 'mimic_' + tab; if (!K[id]) return; const si = Mimic.setInfo(tab), v = si.full ? si.avg : 1;
        const d = document.createElement('div'); d.className = 'mm-box ss-box'; d.style.borderColor = K[id].col;
        d.innerHTML = '<div class="mm-sec">Habilidade do Set</div><div style="display:flex;gap:8px;align-items:center"><img src="' + Icons.skillUrl(K[id].ic) + '" alt="" width="36" height="36" style="filter:' + (si.full ? 'drop-shadow(0 0 6px ' + K[id].col + ')' : 'grayscale(1) opacity(.6)') + '"><div><b style="color:' + K[id].col + '">' + esc(K[id].name) + '</b><div style="font-size:.74rem;opacity:.9">' + esc(K[id].desc(v)) + ' Recarga ' + K[id].cd(v) + ' s.</div><div style="font-size:.7rem;color:' + (si.full ? '#9ad39a' : '#e8a070') + '">' + (si.full ? 'Ativa (tecla Z).' : 'Equipe as ' + si.T + ' peças (' + si.n + '/' + si.T + ').') + '</div></div></div>';
        body.insertBefore(d, body.firstChild);
    }
    setInterval(() => { try { injectMimic(); } catch (e) { } }, 350);

    /* ---------- linha no painel de Equipamentos ---------- */
    setInterval(() => {
        try {
            const t = $('tab-eq'); if (!t || !gameOn()) return; let p = $('ss-eq'); const a = activeSet(), cur = a ? a.id : '';
            if (!p) { p = document.createElement('div'); p.id = 'ss-eq'; t.appendChild(p); } if (p._c === cur) return; p._c = cur;
            p.style.cssText = 'margin-top:8px;font-size:.72rem;padding:6px 8px;border-radius:8px;background:rgba(0,0,0,.25);border:1px solid ' + (a ? K[cur].col : 'rgba(255,255,255,.12)') + ';color:' + (a ? K[cur].col : '#8a8f9a');
            p.textContent = a ? line(cur) : 'Habilidade do Set: complete um conjunto (3+ peças) para liberar.';
        } catch (e) { }
    }, 600);
})();
