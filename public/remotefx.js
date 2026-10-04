/* MiniScape 2D — magias e flechas dos OUTROS jogadores (só visual). O servidor repassa eventos curtos { k, c, x, y, tx, ty, t }; aqui viram orbes/flechas que voam até o alvo. Opção em Menu > Gráficos para desligar em PCs fracos. */
(function () {
    'use strict';
    let on = true; try { if (localStorage.getItem('ms_remote_fx') === '0') on = false; } catch (e) { }
    const out = [], live = [], seen = Object.create(null), known = Object.create(null); let lastMap = null;
    const RemoteFx = {
        get on() { return on; },
        set(v) { on = !!v; try { localStorage.setItem('ms_remote_fx', on ? '1' : '0'); } catch (e) { } if (!on) live.length = 0; },
        /* chamado quando o jogador lança: vai no próximo sync */
        out(k, c, x, y, tx, ty) { if (out.length < 8) out.push({ k, c: c || '#1abc9c', x: Math.round(x), y: Math.round(y), tx: Math.round(tx), ty: Math.round(ty) }); },
        take() { return out.splice(0, 4); },
        onSync(players) {
            try {
                const map = typeof currentMap !== 'undefined' ? currentMap : null; if (map !== lastMap) { lastMap = map; live.length = 0; for (const u in known) delete known[u]; }
                if (!players) return;
                for (const u of Object.keys(players)) {
                    const fx = players[u] && players[u].fx; if (!Array.isArray(fx)) continue;
                    const first = !known[u]; known[u] = 1; const s = seen[u] || (seen[u] = Object.create(null));
                    for (const f of fx) {
                        const id = f.t + '|' + f.k + '|' + f.tx + '|' + f.ty; if (s[id]) continue; s[id] = 1;
                        if (first || !on || live.length >= 24) continue;   // na 1ª vez só marca como visto (evita repetir o que já passou)
                        try { if (window.Sfx && Math.hypot(f.x - player.x, f.y - player.y) < 500) Sfx.play(f.k === 'magic' ? 'magic' : 'bow', 0.4); } catch (e) { }
                        live.push({ k: f.k, c: f.c, x: f.x, y: f.y, tx: f.tx, ty: f.ty, sp: f.k === 'ranged' ? 8 : 6, age: 0, trail: [] });
                    }
                    const ks = Object.keys(s); if (ks.length > 40) for (const k of ks.slice(0, ks.length - 20)) delete s[k];
                }
                for (const u of Object.keys(seen)) if (!players[u]) { delete seen[u]; delete known[u]; }
            } catch (e) { }
        },
        step() {
            for (let i = live.length - 1; i >= 0; i--) {
                const p = live[i], dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
                if (d <= p.sp + 1 || ++p.age > 150) { try { if (window.Art && Art.burst && Quality.level > 0) Art.burst(p.tx, p.ty, p.c, p.k === 'magic' ? 9 : 4, 1); } catch (e) { } live.splice(i, 1); continue; }
                p.a = Math.atan2(dy, dx); p.x += dx / d * p.sp; p.y += dy / d * p.sp;
                if (p.k === 'magic' && Quality.level > 0) { p.trail.push(p.x, p.y); if (p.trail.length > 12) p.trail.splice(0, 2); }
            }
        },
        draw(ctx) {
            for (const p of live) {
                if (p.k === 'ranged') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a || 0); ctx.fillStyle = '#795548'; ctx.fillRect(-7, -1, 12, 2); ctx.fillStyle = '#cfd8dc'; ctx.fillRect(5, -2, 3, 4); ctx.restore(); continue; }
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
