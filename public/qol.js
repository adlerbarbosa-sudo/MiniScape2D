/* MiniScape 2D — conforto: barra rápida de itens (teclas 1–5) e qualidade gráfica (com ajuste automático em aparelhos fracos). */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const ok = () => typeof player !== 'undefined' && player && player.inventory && typeof currentUser !== 'undefined' && currentUser && $('game-wrapper') && $('game-wrapper').style.display !== 'none';

    /* ---------- qualidade ---------- */
    const NAMES = ['Baixa', 'Média', 'Alta']; let level = 2, auto = true;
    try { const v = localStorage.getItem('ms_quality'); if (v !== null && +v >= 0 && +v <= 2) { level = +v; auto = false; } } catch (e) { }
    const Quality = { get level() { return level; }, drops: () => [70, 150, 260][level], fxCap: () => [80, 200, 400][level], names: NAMES, set(v, manual) { level = Math.max(0, Math.min(2, v | 0)); if (manual) { auto = false; try { localStorage.setItem('ms_quality', String(level)); } catch (e) { } } if (window.Env) try { Env._resetDrops && Env._resetDrops(); } catch (e) { } } };
    window.Quality = Quality;
    function watchFps() {
        let frames = 0, t0 = performance.now(), checks = 0;
        function loop(t) {
            frames++; if (t - t0 >= 3000) {
                const fps = frames * 1000 / (t - t0); frames = 0; t0 = t; checks++;
                if (auto && ok() && !document.hidden && level > 0 && fps < (level === 2 ? 38 : 24) && checks <= 4) { Quality.set(level - 1); try { setActionText('Qualidade gráfica ajustada para ' + NAMES[level] + ' (ajuste em Menu).', '#f1c40f'); } catch (e) { } const s = $('qual-sel'); if (s) s.value = level; }
                if (checks >= 4) return;
            } requestAnimationFrame(loop);
        }
        setTimeout(() => requestAnimationFrame(loop), 8000);
    }
    function panel() {
        const host = $('tab-cfg'); if (!host || $('qual-panel')) return; const d = document.createElement('div'); d.id = 'qual-panel'; d.className = 'book-page'; d.style.marginBottom = '10px';
        d.innerHTML = `<h3 style="margin:0 0 6px">Gráficos</h3><label class="aud-row"><span>Qualidade</span><select id="qual-sel" style="flex:1">${NAMES.map((n, i) => `<option value="${i}" ${i === level ? 'selected' : ''}>${n}</option>`).join('')}</select></label><div style="font-size:.7rem;opacity:.7">Menos chuva, partículas e luzes em aparelhos mais fracos. Também ajusta sozinha se o jogo ficar lento.</div>`;
        const a = $('audio-panel'); if (a && a.nextSibling) host.insertBefore(d, a.nextSibling); else host.insertBefore(d, host.firstChild);
        $('qual-sel').addEventListener('change', (e) => Quality.set(+e.target.value, true));
    }

    /* ---------- barra rápida ---------- */
    let bar = null, cand = [];
    const isFood = (n) => { const d = itemDB[n]; return d && d.type === 'consumable' && (d.heal > 0 || d.mp > 0 || d.buff) && n !== 'Bones'; };
    const power = (n) => { const d = itemDB[n] || {}; return (d.heal || 0) + (d.mp || 0) * 0.8 + (d.buff ? 6 : 0); };
    function candidates() { const s = new Set(); player.inventory.forEach((i) => { if (isFood(i.name)) s.add(i.name); }); return [...s].sort((a, b) => power(b) - power(a)); }
    function fill() {
        if (!Array.isArray(player.qb)) player.qb = [null, null, null, null, null]; cand = candidates();
        player.qb = player.qb.slice(0, 5); while (player.qb.length < 5) player.qb.push(null);
        player.qb = player.qb.map((n) => (n && getInvCount(n) > 0 ? n : null));
        for (let i = 0; i < 5; i++) if (!player.qb[i]) { const c = cand.find((n) => !player.qb.includes(n)); if (c) player.qb[i] = c; }
    }
    function use(i) {
        if (!ok() || typeof isBankOpen !== 'undefined' && isBankOpen) return; const n = player.qb && player.qb[i]; if (!n) return;
        const idx = player.inventory.findIndex((it) => it.name === n); if (idx < 0) return; if (n === 'Bones') return;
        const d = itemDB[n]; if (d && d.heal > 0 && player.stats.hp >= player.stats.maxHp && !(d.mp > 0) && !d.buff) { try { setActionText('Você já está com a vida cheia.', '#bdc3c7'); } catch (e) { } return; }
        useItem(idx); try { Sfx.play('pickup'); } catch (e) { }
    }
    function cycle(i) { const c = candidates(); if (!c.length) return; const cur = player.qb[i], pos = c.indexOf(cur); const rest = c.filter((n) => !player.qb.includes(n) || n === cur); const nxt = rest[(rest.indexOf(cur) + 1) % rest.length] || c[(pos + 1) % c.length]; player.qb[i] = nxt; render(true); }
    let lastKey = '';
    function render(force) {
        if (!bar) return; const on = ok(); bar.style.display = on ? 'flex' : 'none'; if (!on) return; fill();
        const key = player.qb.map((n) => n ? n + ':' + getInvCount(n) : '-').join('|'); if (key === lastKey && !force) return; lastKey = key;
        bar.innerHTML = player.qb.map((n, i) => `<div class="qb-s ${n ? '' : 'empty'}" data-i="${i}" title="${n ? n + ' (tecla ' + (i + 1) + ') · botão direito troca' : 'Vazio'}"><b>${i + 1}</b>${n ? (window.Icons ? Icons.html(n, 30) : '') + '<u>' + getInvCount(n) + '</u>' : ''}</div>`).join('');
    }
    function place() { const c = $('gameCanvas'); if (!c || !bar) return; const r = c.getBoundingClientRect(); const w = bar.offsetWidth || 240; bar.style.left = Math.max(w / 2 + 6, Math.min(window.innerWidth - w / 2 - 6, r.left + r.width / 2)) + 'px'; bar.style.top = Math.max(8, Math.min(window.innerHeight - 56, r.bottom - 64)) + 'px'; }
    function mk() {
        const s = document.createElement('style'); s.textContent = '#qb{position:fixed;transform:translateX(-50%);z-index:58;gap:5px;padding:4px 6px;border-radius:10px;background:rgba(20,12,4,.68);border:1px solid rgba(232,196,105,.5);display:none}.qb-s{position:relative;width:40px;height:40px;border-radius:7px;background:rgba(0,0,0,.4);border:1px solid #6a4c22;display:flex;align-items:center;justify-content:center;cursor:pointer}.qb-s:hover{border-color:#e8c469}.qb-s.empty{opacity:.4}.qb-s b{position:absolute;left:3px;top:1px;font:700 .58rem sans-serif;color:#e8c469;text-shadow:0 1px 1px #000}.qb-s u{position:absolute;right:3px;bottom:1px;font:700 .62rem sans-serif;color:#fff;text-decoration:none;text-shadow:0 1px 2px #000}@media(max-width:700px){.qb-s{width:36px;height:36px}}';
        document.head.appendChild(s); bar = document.createElement('div'); bar.id = 'qb'; document.body.appendChild(bar);
        bar.addEventListener('click', (e) => { const s = e.target.closest('.qb-s'); if (s) use(+s.dataset.i); }); bar.addEventListener('contextmenu', (e) => { const s = e.target.closest('.qb-s'); if (s) { e.preventDefault(); cycle(+s.dataset.i); } });
        document.addEventListener('keydown', (e) => { if (!ok() || e.repeat || e.ctrlKey || e.altKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '')) return; if (e.key >= '1' && e.key <= '5') { use(+e.key - 1); } });
        window.addEventListener('resize', place);
    }
    function wire() { mk(); setInterval(() => { try { place(); render(); panel(); } catch (e) { } }, 500); watchFps(); }
    window.addEventListener('load', wire);
})();
