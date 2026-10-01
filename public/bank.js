/* MiniScape 2D — Banco: JANELA À PARTE (#bank-win, sobre o mapa). A mochila continua visível e ativa no painel lateral (celular: gaveta ao lado).
   Depositar: arraste o item da mochila até a janela, ou selecione na mochila e use "Depositar" (clique duplo deposita direto).
   Retirar: clique no item do banco (botões 1 / 10 / Tudo / Qtd) ou arraste-o até a mochila. Pilhas pedem quantidade (padrão Tudo).
   Os itens trocam de lista sem serem recriados (encantados e dados extras ficam intactos); empilháveis simples (sem ench) se juntam até STACK_MAX. */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const BANK_SLOTS = 120, DBL_MS = 450;
    const say = (t, c) => { try { setActionText(t, c || '#e74c3c'); } catch (e) { } };
    const fmt = (n) => (window.fmtNum ? fmtNum(n) : String(n));
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const gameOn = () => typeof player !== 'undefined' && player && Array.isArray(player.inventory) && $('game-wrapper') && $('game-wrapper').style.display !== 'none';
    const tradeOn = () => { try { const s = window.Net && Net.state && Net.state(); return !!(s && s.trade) || !!(player && player.escrow); } catch (e) { return false; } };
    const stk = (it) => !!(it && (it.stackable || (typeof itemDB !== 'undefined' && itemDB[it.name] && itemDB[it.name].stackable)));
    const plain = (it) => !(it.ench || it.enchanted);
    const qtyOf = (it) => (stk(it) ? Math.max(1, Math.floor(Number(it.qty)) || 1) : 1);
    const MAXQ = () => (window.STACK_MAX || 2147483647);
    const slotsMax = () => (typeof INV_SLOTS !== 'undefined' ? INV_SLOTS : 30);
    let open = false, win = null, sel = null, last = { ref: null, t: 0 }, search = '', origin = null, Q = null, lastSig = '';

    /* ---------- núcleo: move `qty` de `item` de uma lista para outra; devolve quanto moveu (0 = não coube) ---------- */
    function transfer(src, dst, item, qty, limit) {
        const have = qtyOf(item), si = src.indexOf(item); if (si < 0) return 0;
        qty = Math.min(have, Math.floor(Number(qty))); if (!(qty >= 1) || !isFinite(qty)) return 0;
        if (stk(item) && plain(item)) {
            const same = dst.filter((x) => x && x.name === item.name && stk(x) && plain(x));
            const room = same.reduce((s, x) => s + Math.max(0, MAXQ() - qtyOf(x)), 0) + Math.max(0, limit - dst.length) * MAXQ();
            qty = Math.min(qty, room); if (qty < 1) return 0;
            let r = qty;
            for (const x of same) { if (r <= 0) break; const t = Math.min(r, MAXQ() - qtyOf(x)); if (t > 0) { x.qty = qtyOf(x) + t; r -= t; } }
            while (r > 0) { const t = Math.min(r, MAXQ()); dst.push(Object.assign({}, item, { qty: t })); r -= t; }
            if (qty >= have) src.splice(si, 1); else item.qty = have - qty;
            return qty;
        }
        if (dst.length >= limit) return 0;
        if (stk(item) && qty < have) { dst.push(Object.assign({}, item, { qty })); item.qty = have - qty; return qty; }   // pilha encantada: separa só a parte
        src.splice(si, 1); dst.push(item); return stk(item) ? have : 1;
    }
    function after() { try { hideTooltip(); } catch (e) { } try { updateUI(); } catch (e) { } try { saveDataLogic(); } catch (e) { } render(true); }
    function guard() {
        if (!gameOn() || !open) return false;
        if (tradeOn()) { say('Durante uma troca você não pode usar o banco.'); return false; }
        return true;
    }
    function doDeposit(item, qty) {
        if (!guard()) return 0; if (!Array.isArray(player.bank)) player.bank = [];
        if (player.inventory.indexOf(item) < 0) { say('Esse item não está mais na mochila.'); return 0; }
        const want = Math.min(qtyOf(item), Math.floor(Number(qty)) || 0), n = transfer(player.inventory, player.bank, item, want, BANK_SLOTS);
        if (n < 1) say('Banco cheio!'); else if (n < want) say('Banco cheio: guardou ' + fmt(n) + ' de ' + fmt(want) + '.');
        else say('Guardou ' + (n > 1 ? fmt(n) + '× ' : '') + item.name + '.', '#3498db');
        if (n) after(); return n;
    }
    function doWithdraw(item, qty) {
        if (!guard()) return 0;
        if (player.bank.indexOf(item) < 0) { say('Esse item não está mais no banco.'); return 0; }
        const want = Math.min(qtyOf(item), Math.floor(Number(qty)) || 0), name = item.name, n = transfer(player.bank, player.inventory, item, want, slotsMax());
        if (n < 1) say('Mochila cheia!'); else if (n < want) say('Mochila cheia: retirou ' + fmt(n) + ' de ' + fmt(want) + '.');
        else say('Retirou ' + (n > 1 ? fmt(n) + '× ' : '') + name + '.', '#3498db');
        if (n) { if (sel === item && player.bank.indexOf(item) < 0) sel = null; after(); } return n;
    }
    function depositAll() {
        if (!guard()) return; const all = player.inventory.slice(); let n = 0;
        for (const it of all) { if (transfer(player.inventory, player.bank, it, qtyOf(it), BANK_SLOTS)) n++; }
        const left = all.filter((it) => player.inventory.indexOf(it) >= 0).length;
        if (!n) say(all.length ? 'Banco cheio!' : 'A mochila está vazia.'); else if (left) say('Banco cheio: sobraram ' + left + ' item(ns) na mochila.'); else say('Guardou tudo da mochila.', '#3498db');
        if (n) after();
    }
    /* ---------- pedido de quantidade (dentro da janela do banco, para ela não fechar) ---------- */
    function ask(dir, item) {
        if (!guard()) return; const max = qtyOf(item);
        if (max <= 1) { dir === 'dep' ? doDeposit(item, 1) : doWithdraw(item, 1); return; }
        Q = { dir, item, max }; renderQ();
    }
    function closeQ() { Q = null; const p = $('bk-q'); if (p) p.style.display = 'none'; }
    function renderQ() {
        const p = $('bk-q'); if (!p) return; if (!Q) { p.style.display = 'none'; return; }
        let ic = ''; try { ic = Icons.html(Q.item.name, 34); } catch (e) { }
        p.innerHTML = `<div class="bk-qt">${ic}<div><b>${Q.dir === 'dep' ? 'Depositar' : 'Retirar'} ${esc(Q.item.name)}</b><small>Você tem ${fmt(Q.max)}. Quanto?</small></div></div>` +
            `<input id="bk-qi" class="dev-input" type="text" inputmode="numeric" autocomplete="off" maxlength="10" value="${Q.max}" aria-label="Quantidade"><div id="bk-qe"></div>` +
            `<div class="bk-qb"><button type="button" data-q="1">1</button><button type="button" data-q="10">10</button><button type="button" data-q="half">Metade</button><button type="button" data-q="all">Tudo</button></div>` +
            `<div class="bk-qb"><button type="button" data-q="cancel">Cancelar</button><button type="button" class="go" data-q="ok">${Q.dir === 'dep' ? 'Depositar' : 'Retirar'}</button></div>`;
        p.style.display = 'flex'; const i = $('bk-qi'); setTimeout(() => { try { i.focus(); i.select(); } catch (e) { } }, 20);
    }
    function confirmQ() {
        if (!Q) return; const i = $('bk-qi'), v = i.value.trim(), e = $('bk-qe');
        if (!/^\d+$/.test(v) || !(Number(v) >= 1)) { e.textContent = 'Digite um número inteiro de 1 a ' + fmt(Q.max) + '.'; i.focus(); i.select(); return; }
        const q = Q; closeQ(); const n = Math.min(Number(v), qtyOf(q.item)); q.dir === 'dep' ? doDeposit(q.item, n) : doWithdraw(q.item, n);
    }

    /* ---------- janela ---------- */
    function build() {
        if (win) return win; const gc = $('game-container'); if (!gc) return null;
        win = document.createElement('div'); win.id = 'bank-win'; win.setAttribute('role', 'dialog'); win.setAttribute('aria-label', 'Banco');
        win.innerHTML = '<div class="bk-h"><b class="bk-t">Banco</b><input id="bk-s" type="search" placeholder="Buscar..." autocomplete="off" maxlength="30" aria-label="Buscar no banco"><span id="bk-c" class="bk-c"></span><button type="button" id="bk-all" class="bk-b">Depositar tudo</button><button type="button" id="bk-x" class="bk-x" aria-label="Fechar banco">&times;</button></div>' +
            '<div id="bank-grid" class="grid-container"></div><div id="bk-f" class="bk-f"></div><div id="bk-q" class="bk-q" style="display:none"></div>';
        gc.appendChild(win);
        $('bk-x').onclick = () => close(); $('bk-all').onclick = depositAll;
        const s = $('bk-s'); s.addEventListener('input', () => { search = s.value.trim().toLowerCase(); render(true); }); s.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); if (s.value) { s.value = ''; search = ''; render(true); } else close(); } });
        const g = $('bank-grid');
        g.addEventListener('click', (e) => {
            const c = e.target.closest('.item-slot'); if (!c || !c.dataset.i) { sel = null; render(true); return; } const it = player.bank[+c.dataset.i]; if (!it) return;
            const n = performance.now();
            if (last.ref === it && n - last.t < DBL_MS) { last = { ref: null, t: 0 }; sel = it; ask('wd', it); render(true); return; }
            last = { ref: it, t: n }; sel = sel === it ? null : it; render(true);
        });
        g.addEventListener('mouseover', (e) => { const c = e.target.closest('.item-slot'); if (c && c.dataset.i && player.bank[+c.dataset.i]) { try { showTooltip(player.bank[+c.dataset.i]); } catch (x) { } } });
        g.addEventListener('mouseout', (e) => { if (e.target.closest('.item-slot')) { try { hideTooltip(); } catch (x) { } } });
        $('bk-f').addEventListener('click', (e) => {
            const b = e.target.closest('[data-w]'); if (!b || !sel || player.bank.indexOf(sel) < 0) return; const a = b.dataset.w, m = qtyOf(sel);
            if (a === 'ask') ask('wd', sel); else doWithdraw(sel, a === 'all' ? m : +a);
        });
        $('bk-q').addEventListener('click', (e) => {
            const b = e.target.closest('[data-q]'); if (!b || !Q) return; const a = b.dataset.q, i = $('bk-qi');
            if (a === 'cancel') closeQ(); else if (a === 'ok') confirmQ(); else { i.value = String(a === 'all' ? Q.max : a === 'half' ? Math.max(1, Math.floor(Q.max / 2)) : Math.min(+a, Q.max)); $('bk-qe').textContent = ''; i.focus(); }
        });
        $('bk-q').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); confirmQ(); } else if (e.key === 'Escape') { e.preventDefault(); closeQ(); } });
        win.addEventListener('keydown', (e) => e.stopPropagation());
        return win;
    }
    function render(force) {
        if (!win || !open || typeof player === 'undefined' || !Array.isArray(player.bank)) return;
        if (sel && player.bank.indexOf(sel) < 0) sel = null;
        const si = sel ? player.bank.indexOf(sel) : -1;
        const sig = search + '#' + si + '#' + player.bank.map((x) => x.name + '*' + (x.qty || 1) + (x.ench ? 'e' + x.ench : '')).join('|');
        if (!force && sig === lastSig) return; lastSig = sig;
        const g = $('bank-grid'), sc = g.scrollTop; let h = '';
        const cell = (it, i) => { let ic = ''; try { ic = Icons.html(it.name); } catch (e) { } return `<div class="item-slot${i === si ? ' isel-on' : ''}" data-i="${i}">${ic}${stk(it) && qtyOf(it) > 1 ? `<span class="item-qty">${window.fmtQty ? fmtQty(qtyOf(it)) : qtyOf(it)}</span>` : ''}</div>`; };
        if (search) { player.bank.forEach((it, i) => { if (String(it.name).toLowerCase().includes(search)) h += cell(it, i); }); if (!h) h = '<div class="bk-empty">Nada encontrado.</div>'; }
        else { const n = Math.max(BANK_SLOTS, player.bank.length); for (let i = 0; i < n; i++) h += player.bank[i] ? cell(player.bank[i], i) : '<div class="item-slot"></div>'; }
        g.innerHTML = h; g.scrollTop = sc;
        $('bk-c').textContent = player.bank.length + '/' + BANK_SLOTS;
        const f = $('bk-f');
        if (!sel) f.innerHTML = '<span class="bk-hint">Arraste itens da mochila até aqui, ou selecione na mochila e use <b>Depositar</b>. Clique num item do banco para retirar.</span>';
        else {
            let ic = ''; try { ic = Icons.html(sel.name, 32); } catch (e) { } const m = qtyOf(sel);
            f.innerHTML = `<div class="bk-fi"><span class="bk-fic">${ic}</span><div class="bk-ft"><b>${esc(sel.name)}</b><small>${m > 1 ? '×' + fmt(m) : ''}${sel.ench ? ' Encantado +' + sel.ench : ''}</small></div></div><div class="bk-fb">` +
                (m > 1 ? '<button type="button" data-w="1">1</button>' : '') + (m > 10 ? '<button type="button" data-w="10">10</button>' : '') +
                `<button type="button" class="go" data-w="all">${m > 1 ? 'Tudo' : 'Retirar'}</button>` + (m > 2 ? '<button type="button" data-w="ask">Qtd...</button>' : '') + '</div>';
        }
    }

    /* ---------- abrir / fechar ---------- */
    function openBank() {
        if (!gameOn() || !build()) return; if (!Array.isArray(player.bank)) player.bank = [];
        if (open) { render(true); return; }
        try { closeMenus(); } catch (e) { } try { openTab('inv'); } catch (e) { }
        open = true; try { isBankOpen = true; } catch (e) { }
        origin = { x: player.x, y: player.y, map: typeof currentMap !== 'undefined' ? currentMap : null }; sel = null; Q = null; search = ''; const s = $('bk-s'); if (s) s.value = '';
        win.style.display = 'flex'; document.body.classList.add('bank-open'); closeQ();
        try { if (window.Mobile && Mobile.on()) Mobile.setDrawer(true, true); } catch (e) { }
        say('Banco aberto.', '#3498db'); try { updateUI(); } catch (e) { } render(true);
    }
    function close() {
        const was = open; open = false; try { isBankOpen = false; } catch (e) { }
        if (win) win.style.display = 'none'; document.body.classList.remove('bank-open'); closeQ(); sel = null; lastSig = '';
        if (was) { try { if (window.Mobile && Mobile.on() && Mobile.autoOpened()) Mobile.setDrawer(false); } catch (e) { } try { updateUI(); } catch (e) { } }
    }
    function init() {
        document.addEventListener('keydown', (e) => {
            if (!open || e.key !== 'Escape') return;
            if (window.Inv2 && Inv2.dragging) return;
            if (Q) { closeQ(); return; }
            const m = $('custom-modal-overlay'); if (m && m.style.display !== 'none' && m.style.display !== '') return;
            close();
        });
        setInterval(() => { if (!open) return; try { if (!gameOn() || (typeof currentMap !== 'undefined' && currentMap !== origin.map) || Math.hypot(player.x - origin.x, player.y - origin.y) > 160) close(); else render(); } catch (e) { } }, 300);
        window.addEventListener('load', () => { const om = window.openModal; if (typeof om === 'function') window.openModal = function () { close(); return om.apply(this, arguments); }; });
    }
    window.Bank = {
        open: openBank, close, isOpen: () => open, SLOTS: BANK_SLOTS, render,
        deposit: (item) => { if (guard()) ask('dep', item); }, depositQty: doDeposit, withdraw: (item) => { if (guard()) ask('wd', item); }, withdrawQty: doWithdraw, depositAll,
        get selected() { return sel; }
    };
    if (document.body) init(); else window.addEventListener('DOMContentLoaded', init);
})();
