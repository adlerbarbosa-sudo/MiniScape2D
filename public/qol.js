/* MiniScape 2D — conforto: barra rápida de itens (teclas 1–5; o jogador arrasta itens da mochila para os slots) e qualidade gráfica (com ajuste automático em aparelhos fracos). */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const ok = () => typeof player !== 'undefined' && player && player.inventory && typeof currentUser !== 'undefined' && currentUser && $('game-wrapper') && $('game-wrapper').style.display !== 'none';

    /* ---------- qualidade ---------- */
    const NAMES = ['Baixo', 'Médio', 'Alto']; let level = 2, auto = true;
    try { const v = localStorage.getItem('ms_quality'); if (v !== null && +v >= 0 && +v <= 2) { level = +v; auto = false; } } catch (e) { }
    const Quality = { get level() { return level; }, drops: () => [70, 150, 260][level], fxCap: () => [80, 200, 400][level], names: NAMES, set(v, manual) { level = Math.max(0, Math.min(2, v | 0)); if (manual) { auto = false; try { localStorage.setItem('ms_quality', String(level)); } catch (e) { } } if (window.Env) try { Env._resetDrops && Env._resetDrops(); } catch (e) { } } };
    window.Quality = Quality;
    /* mede o fps logo depois de entrar no jogo: abaixo de 40 passa para Médio; se ainda ficar abaixo de 26, para Baixo (só se o jogador nunca escolheu) */
    function watchFps() {
        let frames = 0, t0 = 0, checks = 0;
        function loop(t) {
            if (!t0) t0 = t; frames++;
            if (t - t0 >= 3000) {
                const fps = frames * 1000 / (t - t0); frames = 0; t0 = t;
                if (auto && ok() && !document.hidden) {
                    checks++;
                    if (level > 0 && fps < (level === 2 ? 40 : 26)) { Quality.set(level - 1); try { setActionText('Gráficos ajustados para ' + NAMES[level] + ' (muda em Menu > Gráficos).', '#f1c40f'); } catch (e) { } const sel = $('qual-sel'); if (sel) sel.value = level; }
                }
                if (checks >= 4 || !auto) return;
            }
            requestAnimationFrame(loop);
        }
        const start = () => { if (ok()) requestAnimationFrame(loop); else setTimeout(start, 1000); };
        setTimeout(start, 4000);
    }
    function panel() {
        const host = $('tab-cfg'); if (!host || $('qual-panel')) return; const d = document.createElement('div'); d.id = 'qual-panel'; d.className = 'book-page'; d.style.marginBottom = '10px';
        d.innerHTML = `<h3 style="margin:0 0 6px">Gráficos</h3><label class="aud-row"><span>Qualidade</span><select id="qual-sel" style="flex:1">${NAMES.map((n, i) => `<option value="${i}" ${i === level ? 'selected' : ''}>${n}</option>`).join('')}</select></label><div style="font-size:.7rem;opacity:.7">Baixo desliga partículas do ambiente, luzes suaves, sombras e ondinhas da água. O jogo já escolhe sozinho se ficar lento.</div>`;
        const a = $('audio-panel'); if (a && a.nextSibling) host.insertBefore(d, a.nextSibling); else host.insertBefore(d, host.firstChild);
        $('qual-sel').addEventListener('change', (e) => Quality.set(+e.target.value, true));
    }

    /* ---------- barra rápida ---------- */
    /* Cada slot guarda o NOME de um item (player.qb). Só o jogador arruma: arraste da mochila (inv2.js); nada é preenchido sozinho. */
    let bar = null, lastTouch = false;
    const modalOpen = () => { const o = $('custom-modal-overlay'); return !!o && o.style.display !== 'none' && o.style.display !== ''; };
    const say = (t, c) => { try { setActionText(t, c || '#bdc3c7'); } catch (e) { } };
    const equippedSlot = (n) => { try { return Object.keys(player.equipment || {}).find((k) => player.equipment[k] && player.equipment[k].name === n) || null; } catch (e) { return null; } };
    function norm() {
        if (!Array.isArray(player.qb)) player.qb = [];
        if (player.qb.length !== 5 || player.qb.some((n) => n !== null && typeof n !== 'string')) { const q = player.qb.slice(0, 5).map((n) => (typeof n === 'string' && n ? n : null)); while (q.length < 5) q.push(null); player.qb = q; }
    }
    const QuickBar = {
        get slots() { norm(); return player.qb.slice(); },
        set(i, name) {   // coloca o item no slot i; se já estava em outro slot, os dois trocam
            if (!(i >= 0 && i < 5) || typeof name !== 'string' || !name) return false; norm();
            const k = player.qb.indexOf(name); if (k === i) return true;
            if (k >= 0) player.qb[k] = player.qb[i]; player.qb[i] = name; render(true); try { saveDataLogic(); } catch (e) { } return true;
        },
        swap(i, j) { if (!(i >= 0 && i < 5 && j >= 0 && j < 5) || i === j) return; norm(); const t = player.qb[i]; player.qb[i] = player.qb[j]; player.qb[j] = t; render(true); try { saveDataLogic(); } catch (e) { } },
        clear(i) { if (!(i >= 0 && i < 5)) return; norm(); if (!player.qb[i]) return; player.qb[i] = null; render(true); try { saveDataLogic(); } catch (e) { } },
        use: (i) => use(i)
    };
    window.QuickBar = QuickBar;
    function use(i) {
        if (!ok() || modalOpen()) return; norm(); const n = player.qb[i]; if (!n) { say('Slot vazio: arraste um item da mochila para cá.'); return; }
        if (typeof isBankOpen !== 'undefined' && isBankOpen) { say('Feche o banco para usar a barra rápida.'); return; }
        const idx = player.inventory.findIndex((it) => it && it.name === n);
        if (idx < 0) { say(equippedSlot(n) ? 'Já equipado.' : 'Você não tem mais ' + n + '.'); return; }
        const it = player.inventory[idx], d = itemDB[n] || it;
        if (it.type === 'consumable') {
            if (d.heal > 0 && player.stats.hp >= player.stats.maxHp && !(d.mp > 0) && !d.buff && n !== 'Bones') { say('Você já está com a vida cheia.'); return; }
        } else if (it.type === 'equipment') {
            if (equippedSlot(n) && player.inventory.filter((x) => x && x.name === n).length === 0) { say('Já equipado.'); return; }
        } else if (n !== 'Tinderbox' && n !== 'Knife' && !d.bait) { say(n + ' não tem efeito ao usar.'); return; }
        useItem(idx); try { Sfx.play('pickup'); } catch (e) { }
    }
    let lastKey = '';
    function render(force) {
        if (!bar) return; const on = ok(); bar.style.display = on ? 'flex' : 'none'; if (!on) return; norm();
        const key = player.qb.map((n) => n ? n + ':' + getInvCount(n) + (equippedSlot(n) ? 'E' : '') : '-').join('|'); if (key === lastKey && !force) return; lastKey = key;
        bar.innerHTML = player.qb.map((n, i) => {
            if (!n) return `<div class="qb-s empty" data-i="${i}" title="Arraste um item da mochila para cá (tecla ${i + 1})"><b>${i + 1}</b></div>`;
            const c = getInvCount(n), eq = !!equippedSlot(n), gone = c <= 0 && !eq; let ic = ''; try { ic = window.Icons ? Icons.html(n, 30) : ''; } catch (e) { }
            return `<div class="qb-s${gone ? ' gone' : ''}" data-i="${i}" data-n="${esc2(n)}" title="${esc2(n)} (tecla ${i + 1}) · botão direito limpa · arraste para trocar de lugar"><b>${i + 1}</b>${ic}${c > 0 ? '<u>' + c + '</u>' : ''}${eq ? '<em>E</em>' : ''}</div>`;
        }).join('');
    }
    const esc2 = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function place() {
        const c = $('gameCanvas'); if (!c || !bar) return; const ch = $('chat-container'); bar.style.visibility = ch && ch.classList.contains('open') ? 'hidden' : '';
        if (window.innerWidth <= 850) { bar.style.left = window.innerWidth / 2 + 'px'; bar.style.top = Math.max(8, window.innerHeight - 56) + 'px'; return; }   // celular: fixa no rodapé da tela (a página rola)
        const r = c.getBoundingClientRect(); const w = bar.offsetWidth || 240; bar.style.left = Math.max(w / 2 + 6, Math.min(window.innerWidth - w / 2 - 6, r.left + r.width / 2)) + 'px'; bar.style.top = Math.max(8, Math.min(window.innerHeight - 56, r.bottom - 64)) + 'px';
    }
    function mk() {
        const s = document.createElement('style'); s.textContent = '#qb{position:fixed;transform:translateX(-50%);z-index:101;gap:5px;padding:4px 6px;border-radius:10px;background:rgba(20,12,4,.68);border:1px solid rgba(232,196,105,.5);display:none}.qb-s{position:relative;width:40px;height:40px;border-radius:7px;background:rgba(0,0,0,.4);border:1px solid #6a4c22;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}.qb-s:not(.empty){touch-action:none}.qb-s:hover{border-color:#e8c469}.qb-s.empty{opacity:.4}.qb-s.gone{opacity:.45}.qb-s.gone .ic-item{filter:grayscale(.8)}.qb-s.inv2-over{border-color:#fff;box-shadow:0 0 8px #e8c469}.qb-s b{position:absolute;left:3px;top:1px;font:700 .58rem sans-serif;color:#e8c469;text-shadow:0 1px 1px #000}.qb-s u{position:absolute;right:3px;bottom:1px;font:700 .62rem sans-serif;color:#fff;text-decoration:none;text-shadow:0 1px 2px #000}.qb-s em{position:absolute;right:3px;top:1px;font:700 .5rem sans-serif;font-style:normal;color:#9be39b;text-shadow:0 1px 1px #000;opacity:.85}@media(max-width:850px){.qb-s{width:36px;height:36px}body{padding-bottom:64px!important}}';
        document.head.appendChild(s); bar = document.createElement('div'); bar.id = 'qb'; document.body.appendChild(bar);
        bar.addEventListener('pointerdown', (e) => { lastTouch = e.pointerType === 'touch'; });
        bar.addEventListener('click', (e) => { const s = e.target.closest('.qb-s'); if (s) use(+s.dataset.i); });
        bar.addEventListener('contextmenu', (e) => { const s = e.target.closest('.qb-s'); if (s) { e.preventDefault(); if (!lastTouch && !(window.Inv2 && Inv2.dragging)) QuickBar.clear(+s.dataset.i); } });
        document.addEventListener('keydown', (e) => { if (!ok() || e.repeat || e.ctrlKey || e.altKey || e.metaKey || modalOpen() || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '') || (e.target && e.target.isContentEditable)) return; if (e.key >= '1' && e.key <= '5') { use(+e.key - 1); } });
        window.addEventListener('resize', place);
    }
    function wire() { mk(); setInterval(() => { try { place(); render(); panel(); } catch (e) { } }, 500); watchFps(); }
    window.addEventListener('load', wire);
})();
