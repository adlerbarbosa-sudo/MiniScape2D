/* MiniScape 2D — efeitos de combate e de ambiente: números de dano, morte animada, poeira, lascas, faíscas e respingos. */
(function () {
    'use strict';
    const ghosts = [];
    const KIND = {
        hit: { fill: '#fff3c4', line: '#7a1f12', size: 18 }, crit: { fill: '#ffc233', line: '#8a1a0a', size: 26 },
        miss: { fill: '#cfd6de', line: '#2a3038', size: 13 }, hurt: { fill: '#ff6a55', line: '#3a0a06', size: 19 },
        block: { fill: '#7fc3ff', line: '#0c2440', size: 14 }, heal: { fill: '#6ff09a', line: '#0c3a1c', size: 15 }, xp: { fill: '#e6c8ff', line: '#301048', size: 13 }
    };
    // cria o texto flutuante de dano (usa a lista do jogo: floatingTexts)
    function dmg(list, x, y, val, kind) {
        const k = KIND[kind] || KIND.hit; const text = kind === 'crit' ? val + '!' : kind === 'miss' ? 'Errou' : kind === 'block' ? 'Bloqueou' : kind === 'heal' ? '+' + val : String(val);
        list.push({ x, y, text, dmg: true, kind, age: 0, life: kind === 'crit' ? 70 : 56, vx: (Math.random() - 0.5) * 0.7, k });
    }
    function drawDmg(ctx, ft) {
        const age = ft.age++, k = ft.k, big = ft.kind === 'crit';
        const rise = age < 16 ? age * 1.5 : 24 + (age - 16) * 0.28, pop = age < 9 ? 1 + (9 - age) * (big ? 0.1 : 0.06) : 1, a = Math.min(1, ft.life / 18);
        const sh = big && age < 12 ? (Math.random() - 0.5) * 2.2 : 0;
        ctx.save(); ctx.globalAlpha = a; ctx.translate(ft.x + ft.vx * age + sh, ft.y - rise); ctx.scale(pop, pop);
        ctx.font = 'bold ' + k.size + 'px "Trebuchet MS", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.lineWidth = 4.5; ctx.strokeStyle = k.line; ctx.strokeText(ft.text, 0, 0);
        if (big) { ctx.shadowColor = '#ff8a00'; ctx.shadowBlur = 10; }
        ctx.fillStyle = k.fill; ctx.fillText(ft.text, 0, 0); ctx.restore(); ft.life--;
    }
    // morte: o bicho encolhe, escurece e some (em vez de sumir de uma vez)
    function ghost(o) { try { const c = Object.assign({}, o); c.active = true; ghosts.push({ o: c, age: 0 }); if (ghosts.length > 30) ghosts.shift(); } catch (e) {} }
    function drawGhosts(ctx, drawFn) {
        for (let i = ghosts.length - 1; i >= 0; i--) {
            const g = ghosts[i], t = g.age++, N = 26; if (t >= N) { ghosts.splice(i, 1); continue; }
            const o = g.o, cx = o.x + (o.w || 30) / 2, fy = o.y + (o.h || 30), p = t / N;
            ctx.save(); ctx.globalAlpha = 1 - p * p; ctx.translate(cx, fy); ctx.scale(1 + p * 0.25, 1 - p * 0.55); ctx.translate(-cx, -fy);
            if (t < 4) ctx.filter = 'brightness(2.2)';
            try { drawFn(ctx, o); } catch (e) { ghosts.splice(i, 1); }
            ctx.restore();
        }
    }
    window.Fx = { dmg, drawDmg, ghost, drawGhosts, KIND };

    /* ---------- partículas ligadas às ações do jogador ---------- */
    function wire() {
        let lx = null, ly = null, acc = 0, lastAnim = 0;
        setInterval(() => {
            try {
                if (typeof player === 'undefined' || !window.Art || !Art.puff) return; if (document.getElementById('login-overlay').style.display !== 'none') return;
                if (lx != null) { const mv = Math.hypot(player.x - lx, player.y - ly); if (mv < 40) acc += mv; } lx = player.x; ly = player.y;
                if (acc > 24) { acc = 0; const m = gameMaps[currentMap]; const wet = window.Env && Env.rainLevel && Env.rainLevel() > 0.4; Art.puff(player.x, player.y + 8, wet ? 'rgba(120,150,190,' : 'rgba(165,145,112,', wet ? 1 : 2, wet ? 2 : 3); }
                if (player.isPerformingAction && player.actionAnim === 10 && lastAnim !== 10) {
                    const t = player.actionTarget, ty = player.actionType; if (t) {
                        const cx = t.x + (t.w || 30) / 2, cy = t.y + (t.h || 30) * 0.55;
                        if (ty === 'chop') Art.burst(cx, cy, '#b8874f', 7, 1.1);
                        else if (ty === 'mine') { Art.burst(cx, cy, '#ffe7a0', 5, 1.6); Art.burst(cx, cy, t.color || '#9aa0a8', 4, 0.9); }
                        else if (ty === 'fish') { Art.burst(cx, cy, '#a8dcff', 9, 1.3); }
                        else if (ty === 'smelt_brz' || ty === 'smelt_iron') Art.burst(cx, cy, '#ff9a3c', 6, 1.4);
                        else if (ty === 'cook') Art.puff(cx, cy - 10, 'rgba(200,200,205,', 2, 4, 0.5);
                    }
                }
                lastAnim = player.actionAnim;
            } catch (e) {}
        }, 60);
        if (typeof window.addFloatingText === 'function') { const o = window.addFloatingText; window.addFloatingText = function (x, y, t) { const r = o.apply(this, arguments); try { if (t === 'Level Up!') { Art.burst(player.x, player.y - 10, '#ffd24a', 22, 1.8); Art.burst(player.x, player.y - 10, '#fff2b0', 10, 1); } } catch (e) {} return r; }; }
    }
    window.addEventListener('load', wire);
})();
