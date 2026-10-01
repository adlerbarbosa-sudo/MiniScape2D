/* MiniScape 2D — arrastar e soltar itens (mouse e toque): reorganizar a mochila, pôr na barra rápida (1–5) ou jogar no chão.
   O inventário continua sendo um array compacto: aqui só se troca de lugar, remove (jogar fora) ou referencia por nome (barra). */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const MOVE_PX = 6;
    const say = (t, c) => { try { setActionText(t, c || '#e74c3c'); } catch (e) { } };
    const gameOn = () => typeof player !== 'undefined' && player && Array.isArray(player.inventory) && typeof currentUser !== 'undefined' && currentUser && $('game-wrapper') && $('game-wrapper').style.display !== 'none';
    const modalOpen = () => { const o = $('custom-modal-overlay'); return !!o && o.style.display !== 'none' && o.style.display !== ''; };
    const tradeOn = () => { try { const s = window.Net && Net.state && Net.state(); return !!(s && s.trade) || !!(player && player.escrow); } catch (e) { return false; } };
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const bankOn = () => typeof isBankOpen !== 'undefined' && isBankOpen && window.Bank && Bank.isOpen();
    const enchanted = (it) => !!(it && (it.ench || it.enchanted));
    function blockReason() {
        if (typeof isBankOpen !== 'undefined' && isBankOpen) return 'Feche o banco antes de mover itens para fora da mochila.';
        if (modalOpen()) return 'Feche a janela aberta antes.';
        if (tradeOn()) return 'Durante uma troca você não pode mover itens assim.';
        return '';
    }

    /* ---------- jogar no chão ---------- */
    let dropping = false;
    function doDrop(item, qty) {
        if (dropping || !gameOn()) return false;
        const inv = player.inventory, i = inv.indexOf(item); if (i < 0) { say('Esse item não está mais na mochila.'); return false; }
        if (enchanted(item)) { say('Item encantado não pode ser jogado fora.'); return false; }
        const have = item.stackable ? Math.max(1, Math.floor(item.qty) || 1) : 1;
        qty = item.stackable ? Math.min(have, Math.floor(Number(qty))) : 1; if (!(qty >= 1) || !isFinite(qty)) return false;
        dropping = true;
        try {
            const m = gameMaps[currentMap]; if (!m) return false; if (!m.entities) m.entities = [];
            if (item.stackable && qty < have) item.qty = have - qty; else inv.splice(i, 1);
            m.entities.push({ id: newEntId(), type: 'ground_item', item: item.name, qty, x: player.x + (Math.random() * 16 - 8), y: player.y + (Math.random() * 16 - 8), w: 20, h: 20, active: true, life: 18000 });
            if (player.actionToolItem === item) { player.isPerformingAction = false; player.pendingAutoAction = null; player.actionToolItem = null; }
            try { hideTooltip(); } catch (e) { }
            say('Você jogou ' + (qty > 1 ? (window.fmtNum ? fmtNum(qty) : qty) + 'x ' : '') + item.name + ' no chão. Aperte Espaço ou clique nele para pegar.', '#f1c40f');
            try { updateUI(); } catch (e) { } try { saveDataLogic(); } catch (e) { }
            return true;
        } finally { dropping = false; }
    }
    function askDrop(item) {
        const r = blockReason(); if (r) { say(r); return; }
        if (player.inventory.indexOf(item) < 0) return;
        if (enchanted(item)) { say('Item encantado não pode ser jogado fora.'); return; }
        const max = item.stackable ? Math.max(1, Math.floor(item.qty) || 1) : 1;
        if (max <= 1) { doDrop(item, 1); return; }
        let ic = ''; try { ic = Icons.html(item.name, 34); } catch (e) { }
        openModal(`<h3 style="margin:0;color:#f1c40f">Jogar fora</h3><div style="display:flex;align-items:center;gap:10px">${ic}<div><b>${esc(item.name)}</b><div style="font-size:.78rem;opacity:.8">Você tem ${window.fmtNum ? fmtNum(max) : max}. Quanto quer jogar fora?</div></div></div>` +
            `<input id="inv2-q" class="dev-input" type="text" inputmode="numeric" autocomplete="off" maxlength="10" value="1" aria-label="Quantidade">` +
            `<div id="inv2-err" style="min-height:1em;font-size:.75rem;color:#ff8a7a"></div>` +
            `<div style="display:flex;gap:8px"><button type="button" id="inv2-half" class="dev-btn" style="flex:1;padding:7px;border-radius:8px;background:#3a291a;color:#e8c469;border:1px solid #6a4c22;cursor:pointer">Metade</button><button type="button" id="inv2-all" class="dev-btn" style="flex:1;padding:7px;border-radius:8px;background:#3a291a;color:#e8c469;border:1px solid #6a4c22;cursor:pointer">Tudo</button></div>` +
            `<div style="display:flex;gap:8px"><button type="button" id="inv2-cancel" class="dev-btn" style="flex:1;padding:9px;border-radius:999px;background:#2b2118;color:#ddd;border:1px solid #6a4c22;cursor:pointer">Cancelar</button><button type="button" id="inv2-ok" class="btn-craft" style="flex:1;margin-top:0">Jogar fora</button></div>`);
        const box = $('custom-modal-box'); box.dataset.social = '0'; box.dataset.hub = ''; box.dataset.trade = ''; box.dataset.inv2 = '1'; box.style.cssText = '';
        const inp = $('inv2-q'), err = $('inv2-err');
        const curMax = () => (player.inventory.indexOf(item) < 0 ? 0 : item.stackable ? Math.max(1, Math.floor(item.qty) || 1) : 1);
        const bye = () => { document.removeEventListener('keydown', onKey, true); box.dataset.inv2 = ''; closeModal(); };
        function confirm() {
            const v = inp.value.trim();
            if (!/^\d+$/.test(v)) { err.textContent = 'Digite um número inteiro, de 1 a ' + (window.fmtNum ? fmtNum(curMax()) : curMax()) + '.'; inp.focus(); inp.select(); return; }
            let n = Number(v); if (!(n >= 1)) { err.textContent = 'A quantidade mínima é 1.'; inp.focus(); inp.select(); return; }
            const cm = curMax(); if (!cm) { bye(); say('Esse item não está mais na mochila.'); return; }
            const why = tradeOn() ? blockReason() : ''; if (why) { bye(); say(why); return; }
            n = Math.min(n, cm); bye(); doDrop(item, n);
        }
        function onKey(e) {
            if (!modalOpen() || box.dataset.inv2 !== '1') { document.removeEventListener('keydown', onKey, true); return; }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); bye(); } else if (e.key === 'Enter' && e.target !== $('inv2-cancel')) { e.preventDefault(); e.stopPropagation(); confirm(); }
        }
        document.addEventListener('keydown', onKey, true);
        $('inv2-half').onclick = () => { inp.value = String(Math.max(1, Math.floor(curMax() / 2))); err.textContent = ''; inp.focus(); };
        $('inv2-all').onclick = () => { inp.value = String(curMax()); err.textContent = ''; inp.focus(); };
        $('inv2-cancel').onclick = bye; $('inv2-ok').onclick = confirm;
        inp.addEventListener('input', () => { err.textContent = ''; });
        setTimeout(() => { try { inp.focus(); inp.select(); } catch (e) { } }, 30);
    }

    /* ---------- mover dentro da mochila ---------- */
    function moveInInv(item, j) {
        const inv = player.inventory, i = inv.indexOf(item); if (i < 0 || j === i) return;
        if (j < inv.length) { const t = inv[j]; inv[j] = inv[i]; inv[i] = t; }
        else { if (i === inv.length - 1) return; inv.splice(i, 1); inv.push(item); }
        try { updateUI(); } catch (e) { } try { saveDataLogic(); } catch (e) { }
    }

    /* ---------- motor de arrasto (Pointer Events) ---------- */
    let D = null, ghost = null, hover = null, suppressUntil = 0, lastTouch = false;
    const cellOf = (el) => el && el.closest ? el.closest('#inv-grid .item-slot') : null;
    const bankCellOf = (el) => el && el.closest ? el.closest('#bank-grid .item-slot[data-i]') : null;
    const markSrc = () => { if (!D) return; const c = D.type === 'inv' ? $('inv-grid').children[player.inventory.indexOf(D.item)] : D.type === 'bank' ? $('bank-grid').querySelector('[data-i="' + player.bank.indexOf(D.item) + '"]') : null; if (c) c.classList.add('inv2-src'); };
    const qsOf = (el) => el && el.closest ? el.closest('#qb .qb-s') : null;
    function setHover(el) { if (hover === el) return; if (hover) hover.classList.remove('inv2-over'); hover = el; if (el) el.classList.add('inv2-over'); }
    function zone(x, y) {   // onde o ponteiro está: 'out' (fora da janela), 'cell', 'qb', 'panel', 'world'
        if (!(x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight)) return { k: 'out' };
        const el = document.elementFromPoint(x, y); if (!el) return { k: 'out' };
        const c = cellOf(el); if (c) return { k: 'cell', el: c };
        const q = qsOf(el); if (q) return { k: 'qb', el: q };
        if (el.closest('#bank-win')) return { k: 'bank', el: $('bank-win') };
        if (el.closest('#ui-panel, #custom-modal-overlay, #login-overlay')) return { k: 'panel' };
        return { k: 'world' };
    }
    function begin(e) {
        if (D || !e.isPrimary || e.button !== 0 || !gameOn()) return;
        const cell = cellOf(e.target), qs = qsOf(e.target), bc = bankCellOf(e.target); let d = null;
        if (cell) { const idx = Array.prototype.indexOf.call($('inv-grid').children, cell); const item = player.inventory[idx]; if (!item) return; d = { type: 'inv', item, name: item.name }; }
        else if (bc) { const item = player.bank[+bc.dataset.i]; if (!item) return; d = { type: 'bank', item, name: item.name }; }
        else if (qs) { const slot = +qs.dataset.i, name = Array.isArray(player.qb) ? player.qb[slot] : null; if (!name) return; d = { type: 'qb', slot, name }; }
        else return;
        d.id = e.pointerId; d.sx = e.clientX; d.sy = e.clientY; d.on = false; D = d;
    }
    function start(e) {
        D.on = true; try { hideTooltip(); } catch (x) { }
        ghost = document.createElement('div'); ghost.className = 'inv2-ghost'; let ic = ''; try { ic = Icons.html(D.name, 38); } catch (x) { }
        ghost.innerHTML = ic + '<span></span>'; document.body.appendChild(ghost); document.body.classList.add('inv2-dragging');
        try { document.body.setPointerCapture(D.id); } catch (x) { }
        markSrc();
    }
    function move(e) {
        if (!D || e.pointerId !== D.id) return;
        if (!D.on) {
            if (e.pointerType === 'mouse' && e.buttons === 0) { D = null; return; }
            if (Math.hypot(e.clientX - D.sx, e.clientY - D.sy) < MOVE_PX) return; start(e);
        }
        e.preventDefault(); D.lx = e.clientX; D.ly = e.clientY; if (!raf) raf = requestAnimationFrame(tick);
        ghost.style.transform = `translate(${e.clientX - 24}px,${e.clientY - 24}px)`;
        const z = zone(e.clientX, e.clientY); setHover(z.k === 'cell' || z.k === 'qb' || (z.k === 'bank' && D.type === 'inv') ? z.el : null);
        const bk = bankOn(); ghost.lastChild.textContent = D.type === 'bank' ? (z.k === 'cell' || z.k === 'panel' ? 'Retirar' : '') : z.k === 'world' ? (bk ? '' : D.type === 'inv' ? 'Jogar fora' : 'Remover') : (z.k === 'bank' && D.type === 'inv' ? 'Depositar' : '');
        markSrc();
    }
    let raf = 0;
    function tick() {   // perto da borda da tela a página rola (no celular a mochila fica abaixo do mapa)
        raf = 0; if (!D || !D.on) return;
        const y = D.ly, h = window.innerHeight; let dy = 0; if (y < 70) dy = -Math.ceil((70 - y) / 5); else if (y > h - 70) dy = Math.ceil((y - (h - 70)) / 5);
        if (dy) { window.scrollBy(0, dy); const z = zone(D.lx, D.ly); setHover(z.k === 'cell' || z.k === 'qb' || (z.k === 'bank' && D.type === 'inv') ? z.el : null); }
        raf = requestAnimationFrame(tick);
    }
    function cleanup() {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        const id = D && D.id; D = null; setHover(null);
        if (ghost) { ghost.remove(); ghost = null; }
        document.body.classList.remove('inv2-dragging');
        document.querySelectorAll('.inv2-src').forEach((n) => n.classList.remove('inv2-src'));
        try { if (id !== undefined && document.body.hasPointerCapture(id)) document.body.releasePointerCapture(id); } catch (x) { }
    }
    function up(e) {
        if (!D || e.pointerId !== D.id) return;
        if (!D.on) { D = null; return; }
        const d = D, z = zone(e.clientX, e.clientY); suppressUntil = performance.now() + 400; cleanup();
        if (!gameOn()) return;
        if (d.type === 'inv') {
            if (z.k === 'cell') moveInInv(d.item, Array.prototype.indexOf.call($('inv-grid').children, z.el));
            else if (z.k === 'bank' && bankOn()) { if (player.inventory.indexOf(d.item) >= 0) Bank.deposit(d.item); }
            else if (z.k === 'qb') {
                const r = blockReason(); if (r) { say(r); return; } if (player.inventory.indexOf(d.item) < 0) return;
                if (window.QuickBar && QuickBar.set(+z.el.dataset.i, d.name)) say(d.name + ' na barra rápida (tecla ' + (+z.el.dataset.i + 1) + ').', '#f1c40f');
            } else if (z.k === 'world') { if (bankOn()) say('Solte o item dentro da janela do banco para guardá-lo.', '#f1c40f'); else askDrop(d.item); }
        } else if (d.type === 'bank') {
            if ((z.k === 'cell' || z.k === 'panel') && bankOn() && player.bank.indexOf(d.item) >= 0) Bank.withdraw(d.item);
        } else if (window.QuickBar) {
            if (z.k === 'qb') QuickBar.swap(d.slot, +z.el.dataset.i); else if (z.k === 'world') QuickBar.clear(d.slot);
        }
    }
    function cancel() { if (D && D.on) { suppressUntil = performance.now() + 400; } if (D) cleanup(); }

    function init() {
        const st = document.createElement('style');
        st.textContent = '#inv-grid .item-slot{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}#inv-grid .item-slot:has(*){touch-action:none}#inv-grid .item-slot.inv2-src{opacity:.35}#inv-grid .item-slot.inv2-over{box-shadow:inset 0 0 0 2px #fff,0 0 10px rgba(232,196,105,.6)}' +
            '#bank-grid .item-slot{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}#bank-grid .item-slot:has(*){touch-action:pan-y}#bank-grid .item-slot.inv2-src{opacity:.35}#bank-win.inv2-over{box-shadow:0 0 0 3px #fff,0 0 22px rgba(232,196,105,.7),0 14px 40px rgba(0,0,0,.7)!important}' +
            'body.inv2-dragging,body.inv2-dragging *{cursor:grabbing!important;-webkit-user-select:none;user-select:none}' +
            '.inv2-ghost{position:fixed;left:0;top:0;width:48px;height:48px;z-index:100000;pointer-events:none;display:flex;align-items:center;justify-content:center;border-radius:10px;background:rgba(30,20,10,.85);border:1px solid #e8c469;box-shadow:0 4px 14px rgba(0,0,0,.6);opacity:.92}.inv2-ghost .ic-item{width:38px;height:38px}.inv2-ghost span{position:absolute;top:100%;left:50%;transform:translateX(-50%);white-space:nowrap;font:700 .65rem sans-serif;color:#f1c40f;text-shadow:0 1px 2px #000;margin-top:2px}';
        document.head.appendChild(st);
        document.addEventListener('pointerdown', (e) => { suppressUntil = 0; lastTouch = e.pointerType === 'touch'; begin(e); }, true);
        window.addEventListener('pointermove', move, { passive: false });
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', (e) => { if (D && e.pointerId === D.id) cancel(); });
        document.body.addEventListener('lostpointercapture', (e) => { if (D && D.on && e.target === document.body && e.pointerId === D.id) cancel(); });
        window.addEventListener('blur', cancel); document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
        document.addEventListener('keydown', (e) => { if (D && D.on && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); } }, true);
        document.addEventListener('click', (e) => { if (performance.now() < suppressUntil) { e.stopPropagation(); e.preventDefault(); suppressUntil = 0; } }, true);
        document.addEventListener('selectstart', (e) => { if (D && D.on) e.preventDefault(); });
        document.addEventListener('contextmenu', (e) => { if ((D && D.on) || (lastTouch && cellOf(e.target) && e.target.closest('#inv-grid .item-slot:has(*)'))) e.preventDefault(); }, true);
    }
    window.Inv2 = { get dragging() { return !!(D && D.on); }, drop: doDrop, ask: askDrop, move: moveInInv, cancel };
    if (document.body) init(); else window.addEventListener('DOMContentLoaded', init);
})();
