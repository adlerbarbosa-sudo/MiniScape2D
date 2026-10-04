/* MiniScape 2D — magias e flechas dos OUTROS jogadores (só visual). O servidor repassa eventos curtos { k, c, x, y, tx, ty, t }; aqui viram orbes/flechas que voam até o alvo. Opção em Menu > Gráficos para desligar em PCs fracos. */
(function () {
    'use strict';
    let on = true; try { if (localStorage.getItem('ms_remote_fx') === '0') on = false; } catch (e) { }
    const out = [], live = [], seen = Object.create(null), known = Object.create(null); let lastMap = null;
    function drawArrow(ctx, x, y, a) {   // mesmo desenho para a flecha própria e a dos outros jogadores
        ctx.save(); ctx.translate(x, y); ctx.rotate(a || 0); ctx.fillStyle = '#8d6e4a'; ctx.fillRect(-8, -0.9, 13, 1.8); ctx.fillStyle = '#eceff1'; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(4, -2.4); ctx.lineTo(4, 2.4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e8d8b8'; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-11, -2.4); ctx.lineTo(-7, 0); ctx.lineTo(-11, 2.4); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    function drawOrb(ctx, x, y, c, trail) {
        for (let i = 0; i < trail.length; i += 2) { ctx.globalAlpha = (i / trail.length) * 0.4; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(trail[i], trail[i + 1], 2 + i / 6, 0, 6.3); ctx.fill(); }
        ctx.globalAlpha = 1; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 6, 0, 6.3); ctx.fill(); ctx.fillStyle = '#ecf0f1'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 6.3); ctx.fill();
    }
    const RemoteFx = {
        /* projéteis do PRÓPRIO jogador (index.html): flecha e orbe com o mesmo visual que os outros jogadores veem */
        drawLocal(ctx, p) {
            if (p.type === 'ranged') { drawArrow(ctx, p.x, p.y, Math.atan2((p.ty || p.y) - p.y, (p.tx || p.x) - p.x)); return; }
            const tr = p._tr || (p._tr = []); if (p._trf !== p.x + ',' + p.y) { p._trf = p.x + ',' + p.y; tr.push(p.x, p.y); if (tr.length > 12) tr.splice(0, 2); }
            drawOrb(ctx, p.x, p.y, p.color || '#1abc9c', (typeof Quality !== 'undefined' && Quality.level > 0) ? tr : []);
        },
        get on() { return on; },
        set(v) { on = !!v; try { localStorage.setItem('ms_remote_fx', on ? '1' : '0'); } catch (e) { } if (!on) live.length = 0; },
        /* chamado quando o jogador lança: vai no próximo sync */
        out(k, c, x, y, tx, ty, r) { if (out.length < 24) { const o = { k, c: /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#1abc9c', x: Math.round(x), y: Math.round(y), tx: Math.round(tx), ty: Math.round(ty) }; if (r) o.r = Math.round(r); out.push(o); } },
        take() { return out.splice(0, 14); },
        onSync(players) {
            try {
                const map = typeof currentMap !== 'undefined' ? currentMap : null; if (map !== lastMap) { lastMap = map; live.length = 0; for (const u in known) delete known[u]; }
                if (!players) return;
                for (const u of Object.keys(players)) {
                    const fx = players[u] && players[u].fx; if (!Array.isArray(fx)) continue;
                    const first = !known[u]; known[u] = 1; const s = seen[u] || (seen[u] = Object.create(null));
                    for (const f of fx) {
                        const id = f.t + '|' + f.k + '|' + f.tx + '|' + f.ty + '|' + f.x; if (s[id]) continue; s[id] = 1;
                        if (first || !on || live.length >= 40) continue;   // na 1ª vez só marca como visto (evita repetir o que já passou)
                        if (f.k === 'xp') { try { if (Math.hypot(f.x - player.x, f.y - player.y) < 700 && f.r > 0) addFloatingText(f.x, f.y - 6, '+' + (window.fmtNum ? fmtNum(f.r) : f.r) + ' XP', '#f1c40f'); } catch (e) { } continue; }
                        if (!/^(magic|ranged|ring|flash|slash|arrow|cone|bolt|beam|dmg|burst)$/.test(f.k)) continue;
                        if (f.k === 'dmg') { try { const ty = { '#dd3333': 'hit', '#ffe27a': 'crit', '#ff8a00': 'big', '#aaaaaa': 'miss' }[f.c] || 'hit'; if (Math.hypot(f.tx - player.x, f.ty - player.y) < 700) { Fx.dmg(floatingTexts, f.tx, f.ty, f.r || 0, ty); if (f.r > 0 && window.Art && Art.burst) Art.burst(f.tx, f.ty + 14, ty === 'hit' ? '#d33' : '#ffe27a', ty === 'hit' ? 5 : 10, ty === 'hit' ? 1 : 1.6); } } catch (e) { } continue; }
                        if (f.k === 'burst') { try { if (Math.hypot(f.tx - player.x, f.ty - player.y) < 700 && window.Art && Art.burst) Art.burst(f.tx, f.ty, f.c, Math.min(14, Math.max(4, f.r || 8)), 1.2); } catch (e) { } continue; }
                        try { if (window.Sfx && Math.hypot(f.x - player.x, f.y - player.y) < 500) Sfx.play(f.k === 'magic' ? 'magic' : 'bow', 0.4); } catch (e) { }
                        if (f.k === 'magic' || f.k === 'ranged') live.push({ k: f.k, c: f.c, x: f.x, y: f.y, tx: f.tx, ty: f.ty, sp: f.k === 'ranged' ? 8 : 6, age: 0, trail: [] });
                        else live.push({ k: f.k, c: f.c, x: f.x, y: f.y, tx: f.tx, ty: f.ty, r: f.r || 40, age: 0, st: 1 });
                    }
                    const ks = Object.keys(s); if (ks.length > 40) for (const k of ks.slice(0, ks.length - 20)) delete s[k];
                }
                for (const u of Object.keys(seen)) if (!players[u]) { delete seen[u]; delete known[u]; }
            } catch (e) { }
        },
        _liveCount() { return live.length; },
        step() {
            for (let i = live.length - 1; i >= 0; i--) {
                const p = live[i];
                if (p.st) { if (++p.age > 22) live.splice(i, 1); continue; }
                const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
                if (d <= p.sp + 1 || ++p.age > 150) { try { if (window.Art && Art.burst && Quality.level > 0) Art.burst(p.tx, p.ty, p.c, p.k === 'magic' ? 9 : 4, 1); } catch (e) { } live.splice(i, 1); continue; }
                p.a = Math.atan2(dy, dx); p.x += dx / d * p.sp; p.y += dy / d * p.sp;
                if (p.k === 'magic' && Quality.level > 0) { p.trail.push(p.x, p.y); if (p.trail.length > 12) p.trail.splice(0, 2); }
            }
        },
        draw(ctx) {
            if (on && typeof otherPlayers !== 'undefined' && typeof Quality !== 'undefined' && Quality.level > 0) {
                const f = (performance.now() / 16) | 0;
                for (const u in otherPlayers) {
                    const o = otherPlayers[u]; if (!o || !o.au || o.map !== currentMap) continue; const x = o.displayX !== undefined ? o.displayX : o.x, y = o.displayY !== undefined ? o.displayY : o.y;
                    ctx.save(); ctx.globalCompositeOperation = 'lighter';
                    if (o.au.f) { ctx.globalAlpha = 0.28 + 0.12 * Math.sin(f / 6); ctx.strokeStyle = o.au.f; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y + 4, 17 + Math.sin(f / 8) * 2, 8, 0, 0, 6.3); ctx.stroke(); const g = ctx.createLinearGradient(0, y + 4, 0, y - 30); g.addColorStop(0, o.au.f); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.globalAlpha = 0.14; ctx.fillStyle = g; ctx.fillRect(x - 15, y - 30, 30, 34); }
                    if (o.au.b) { ctx.globalAlpha = 0.22 + 0.1 * Math.sin(f / 7); ctx.fillStyle = o.au.b; ctx.beginPath(); ctx.ellipse(x, y - 14, 20, 28, 0, 0, 6.3); ctx.fill(); ctx.globalAlpha = 0.6; ctx.strokeStyle = o.au.b; ctx.lineWidth = 1.5; ctx.stroke(); }
                    ctx.restore();
                }
            }
            for (const p of live) {
                if (p.st) { const u = p.age / 22, a = 1 - u; ctx.save(); ctx.globalAlpha = a * 0.9; ctx.strokeStyle = p.c; ctx.fillStyle = p.c; ctx.lineCap = 'round';
                    if (p.k === 'ring') { const rr = p.r * (1 - (1 - u) * (1 - u)); ctx.lineWidth = 4 * a + 1; ctx.beginPath(); ctx.ellipse(p.x, p.y, rr, rr * 0.58, 0, 0, 6.3); ctx.stroke(); }
                    else if (p.k === 'flash') { ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r); g.addColorStop(0, p.c); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.globalAlpha = a * 0.8; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.3); ctx.fill(); }
                    else if (p.k === 'slash') { const an = Math.atan2(p.ty - p.y, p.tx - p.x); ctx.lineWidth = 8 * a + 2; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.7, an - 0.9, an + 0.9); ctx.stroke(); }
                    else if (p.k === 'arrow') { const yy = p.y + (p.ty - p.y) * Math.min(1, u * 1.6); ctx.globalAlpha = u < 0.62 ? 0.95 : a * 2.4; ctx.strokeStyle = '#d8c090'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, yy - 16); ctx.lineTo(p.x, yy); ctx.stroke(); ctx.fillStyle = '#e8eef4'; ctx.beginPath(); ctx.moveTo(p.x, yy + 4); ctx.lineTo(p.x - 2.5, yy - 2); ctx.lineTo(p.x + 2.5, yy - 2); ctx.fill(); }
                    else if (p.k === 'cone') { const an = Math.atan2(p.ty - p.y, p.tx - p.x); ctx.globalAlpha = a * 0.5; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, p.r * (0.55 + u * 0.45), an - 0.6, an + 0.6); ctx.closePath(); ctx.fill(); }
                    else if (p.k === 'bolt' || p.k === 'beam') { ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 5 * a + 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); const mx = (p.x + p.tx) / 2 + Math.sin(p.age) * 8, my = (p.y + p.ty) / 2 + Math.cos(p.age * 2) * 8; ctx.lineTo(mx, my); ctx.lineTo(p.tx, p.ty); ctx.stroke(); }
                    ctx.restore(); continue; }
                if (p.k === 'ranged') { drawArrow(ctx, p.x, p.y, p.a); continue; }
                for (let i = 0; i < p.trail.length; i += 2) { ctx.globalAlpha = (i / p.trail.length) * 0.4; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.trail[i], p.trail[i + 1], 2 + i / 6, 0, 6.3); ctx.fill(); }
                ctx.globalAlpha = 1; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, 6.3); ctx.fill(); ctx.fillStyle = '#ecf0f1'; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, 6.3); ctx.fill();
            }
        }
    };
    window.RemoteFx = RemoteFx;
    function panel() {
        const host = document.getElementById('qual-panel'); if (!host || document.getElementById('rfx-row')) return;
        const l = document.createElement('label'); l.id = 'rfx-row'; l.className = 'aud-row'; l.style.marginTop = '6px';
        l.innerHTML = `<span>Magias de outros jogadores</span><input type="checkbox" id="rfx-chk" ${on ? 'checked' : ''}>`; host.appendChild(l);
        const n = document.createElement('div'); n.style.cssText = 'font-size:.7rem;opacity:.7'; n.textContent = 'Desmarque em computadores fracos para não desenhar magias e flechas dos outros.'; host.appendChild(n);
        document.getElementById('rfx-chk').addEventListener('change', (e) => RemoteFx.set(e.target.checked));
    }
    setInterval(panel, 1500);
})();
