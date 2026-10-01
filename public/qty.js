/* MiniScape 2D — seletor de quantidade (−/+/campo, 1/10/Máx), usado nas lojas de NPC e no mercado entre jogadores.
   Qty.pick({ title, name, per, unit, cost, max, limits, okLabel, confirmFrom, note, onOk })
     - name: item (ícone); per: quantos itens vêm por compra (padrão 1); cost(q) ou unit: preço total em moedas
     - max: máximo permitido; limits: [['moedas', n], ['estoque', n], ['espaço', n]] (mostra quem limita)
     - confirmFrom: total a partir do qual pede um segundo toque (padrão 100); onOk(q) é chamado ao confirmar; onCancel() ao cancelar (Esc/Cancelar)
   Qty.shop(nome, preçoUnitário): abre o seletor para a loja de NPC e compra em lote (atômico: confere moedas e espaço antes e desfaz se algo falhar).
   Qty.buyShop(nome, preço, q): compra direta de q "pacotes" (sem janela).
   Qty.capacity(nome): quantas unidades ainda cabem na mochila.
   Qty.mktCost(preçoTotal, qtdAnuncio, n): preço de n unidades de um anúncio do mercado (mesma conta do servidor). */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const fn = (n) => (window.fmtNum ? fmtNum(n) : String(n));
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const say = (t, c) => { try { setActionText(t, c || '#e74c3c'); } catch (e) { } };
    const MAXQ = 99999;

    function capacity(name) {
        const b = typeof itemDB !== 'undefined' && itemDB[name]; if (!b || typeof player === 'undefined') return 0;
        if (b.stackable) return invSpaceFor(name, 1) ? Infinity : 0;
        return Math.max(0, INV_SLOTS - player.inventory.length);
    }
    function mktCost(price, qty, n) {   // idêntica ao servidor (extras.js): tudo = preço do anúncio; parte = teto proporcional, sem zerar o resto
        price = Math.floor(Number(price)); qty = Math.floor(Number(qty)); n = Math.floor(Number(n));
        if (!(price >= 1) || !(qty >= 1) || !(n >= 1) || n > qty) return null;
        if (n === qty) return price;
        if (price < 2) return null;
        let c = Number((BigInt(price) * BigInt(n) + BigInt(qty) - 1n) / BigInt(qty)); c = Math.max(1, Math.min(price - 1, c)); return c;
    }

    let cur = null;   // seletor aberto
    function close(why) { if (!cur) return; const c = cur; document.removeEventListener('keydown', c.onKey, true); const box = $('custom-modal-box'); if (box) box.dataset.qty = ''; cur = null; try { closeModal(); } catch (e) { } if (why === 'cancel' && typeof c.o.onCancel === 'function') { try { c.o.onCancel(); } catch (e) { } } }
    function pick(o) {
        if (!o || typeof o.onOk !== 'function') return;
        const per = Math.max(1, Math.floor(o.per) || 1), max = Math.max(0, Math.min(MAXQ, Math.floor(o.max) || 0));
        if (max < 1) { say(o.noMsg || 'Você não pode comprar agora.'); return; }
        const cost = typeof o.cost === 'function' ? o.cost : (q) => q * (o.unit || 0), confirmFrom = o.confirmFrom == null ? 100 : o.confirmFrom;
        let ic = ''; try { ic = Icons.html(o.name, 38); } catch (e) { }
        const lim = (o.limits || []).filter((l) => isFinite(l[1]));
        const why = lim.length ? lim.reduce((a, b) => (b[1] < a[1] ? b : a)) : null;
        openModal(`<h3 style="margin:0;color:#f1c40f">${esc(o.title || 'Quantidade')}</h3>` +
            `<div style="display:flex;align-items:center;gap:10px">${ic}<div style="min-width:0"><b>${esc(o.name)}${per > 1 ? ' ×' + per : ''}</b><div id="qty-sub" style="font-size:.76rem;opacity:.85"></div></div></div>` +
            `<div style="display:flex;gap:6px;align-items:stretch"><button type="button" id="qty-minus" aria-label="Menos" style="flex:0 0 46px;min-height:46px;font-size:1.3rem;font-weight:700" class="qty-b">−</button>` +
            `<input id="qty-in" class="dev-input" type="text" inputmode="numeric" autocomplete="off" maxlength="6" value="1" aria-label="Quantidade" style="flex:1;text-align:center;font-size:1.1rem;font-weight:700;min-height:46px">` +
            `<button type="button" id="qty-plus" aria-label="Mais" style="flex:0 0 46px;min-height:46px;font-size:1.3rem;font-weight:700" class="qty-b">+</button></div>` +
            `<div style="display:flex;gap:6px"><button type="button" class="qty-b" data-q="1" style="flex:1;min-height:40px">1</button><button type="button" class="qty-b" data-q="10" style="flex:1;min-height:40px">10</button><button type="button" class="qty-b" data-q="max" style="flex:1;min-height:40px">Máx (${fn(max)})</button></div>` +
            `<div id="qty-total" style="font-size:.95rem;color:#f4e3b0;text-align:center;min-height:1.3em"></div>` +
            `<div id="qty-err" style="min-height:1em;font-size:.72rem;color:#ff8a7a;text-align:center">${why && why[1] <= max ? 'Máximo limitado por ' + esc(why[0]) + '.' : ''}</div>` +
            (o.note ? `<div style="font-size:.7rem;opacity:.7;text-align:center">${esc(o.note)}</div>` : '') +
            `<div style="display:flex;gap:8px"><button type="button" id="qty-cancel" style="flex:1;padding:9px;border-radius:999px;background:#2b2118;color:#ddd;border:1px solid #6a4c22;cursor:pointer;min-height:44px">Cancelar</button><button type="button" id="qty-ok" class="btn-craft" style="flex:1.4;margin-top:0;min-height:44px">${esc(o.okLabel || 'Comprar')}</button></div>`);
        const box = $('custom-modal-box'); box.dataset.social = '0'; box.dataset.hub = ''; box.dataset.trade = ''; box.dataset.inv2 = ''; box.dataset.qty = '1'; box.style.cssText = '';
        box.querySelectorAll('.qty-b').forEach((b) => { b.style.cssText += ';border-radius:10px;background:#3a291a;color:#e8c469;border:1px solid #6a4c22;cursor:pointer'; });
        const inp = $('qty-in'), tot = $('qty-total'), err = $('qty-err'), okb = $('qty-ok'), sub = $('qty-sub');
        let q = Math.max(1, Math.min(max, Math.floor(o.start) || 1)), armT = 0;
        const read = () => { const v = String(inp.value).replace(/\D/g, ''); return v === '' ? NaN : Number(v); };
        function show() {
            inp.value = String(q); const c = cost(q);
            tot.innerHTML = 'Total: <b>' + fn(c) + ' ' + esc(o.currency || 'moedas') + '</b>' + (per > 1 ? ' · recebe ' + fn(q * per) + '×' : '');
            if (sub) sub.textContent = o.sub ? o.sub(q) : (q > 1 ? fn(q) + ' unidades' : '');
            okb.textContent = o.okLabel || 'Comprar'; armT = 0;
        }
        const set = (v) => { q = Math.max(1, Math.min(max, Math.floor(v) || 1)); err.textContent = ''; show(); };
        $('qty-minus').onclick = () => set(q - 1); $('qty-plus').onclick = () => set(q + 1);
        box.querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => set(b.dataset.q === 'max' ? max : Number(b.dataset.q)); });
        inp.addEventListener('input', () => { const v = read(); if (isNaN(v)) { tot.textContent = ''; return; } if (v > max) { err.textContent = 'O máximo é ' + fn(max) + '.'; } else err.textContent = ''; q = Math.max(1, Math.min(max, v || 1)); const c = cost(q); tot.innerHTML = 'Total: <b>' + fn(c) + ' ' + esc(o.currency || 'moedas') + '</b>' + (per > 1 ? ' · recebe ' + fn(q * per) + '×' : ''); if (sub) sub.textContent = o.sub ? o.sub(q) : (q > 1 ? fn(q) + ' unidades' : ''); armT = 0; okb.textContent = o.okLabel || 'Comprar'; });
        inp.addEventListener('blur', () => { const v = read(); if (!isNaN(v)) set(v); else set(1); });
        function confirm() {
            const v = read(); if (isNaN(v) || v < 1) { err.textContent = 'Digite um número de 1 a ' + fn(max) + '.'; inp.focus(); inp.select(); return; }
            q = Math.min(max, v); const c = cost(q);
            const need = confirmFrom > 0 && c >= confirmFrom && (!window.ItemSel || ItemSel.on());
            if (need && Date.now() - armT > 4000) { armT = Date.now(); okb.textContent = 'Confirmar ' + fn(c) + '?'; err.textContent = 'Toque de novo para confirmar a compra.'; err.style.color = '#f1c40f'; return; }
            close('ok'); o.onOk(q);
        }
        okb.onclick = confirm; $('qty-cancel').onclick = () => close('cancel');
        const onKey = (e) => {
            const bx = $('custom-modal-box'); if (!bx || bx.dataset.qty !== '1') { document.removeEventListener('keydown', onKey, true); return; }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close('cancel'); }
            else if (e.key === 'Enter' && e.target !== $('qty-cancel')) { e.preventDefault(); e.stopPropagation(); confirm(); }
            else if (e.target === inp && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); set(q + (e.key === 'ArrowUp' ? 1 : -1)); }
        };
        cur = { onKey, o }; document.addEventListener('keydown', onKey, true);
        show(); setTimeout(() => { try { inp.focus(); inp.select(); } catch (e) { } }, 30);
    }

    /* ---------- loja de NPC ---------- */
    function buyShop(name, price, q) {
        const b = itemDB[name]; q = Math.floor(Number(q)); price = Math.floor(Number(price));
        if (!b || !(q >= 1) || !(price > 0)) return false;
        const per = b.shopQty > 1 ? b.shopQty : 1, total = price * q, items = per * q;
        if (!(total <= 2147483647)) { say('Valor alto demais.'); return false; }
        if (getInvCount('Coins') < total) { say('Coins insuficientes!'); return false; }
        const snap = JSON.stringify(player.inventory);
        if (!invSpaceFor(name, items)) { say('Inv Cheio!'); return false; }
        // tira as moedas primeiro (libera o espaço delas) e confere de novo; se algo falhar, devolve tudo
        removeInvItem('Coins', total);
        if (!addInvItem(name, items)) { player.inventory.length = 0; JSON.parse(snap).forEach((x) => player.inventory.push(x)); say('Inv Cheio!'); try { updateUI(); } catch (e) { } return false; }
        say('Comprou ' + (items > 1 ? fn(items) + '× ' : '') + name + '!', '#2ecc71'); try { updateUI(); saveDataLogic(); } catch (e) { }
        return true;
    }
    function shop(name, price) {
        const b = itemDB[name]; price = Math.floor(Number(price)); if (!b || !(price > 0)) return;
        const per = b.shopQty > 1 ? b.shopQty : 1, coins = getInvCount('Coins');
        const byCoins = Math.floor(coins / price);
        let space; if (b.stackable) space = invSpaceFor(name, per) ? Infinity : 0; else space = Math.floor(capacity(name) / per);
        const max = Math.min(MAXQ, byCoins, space);
        if (byCoins < 1) { say('Coins insuficientes!'); return; }
        if (space < 1) { say('Inv Cheio!'); return; }
        pick({ title: 'Comprar', name, per, unit: price, max, limits: [['suas moedas', byCoins], ['espaço na mochila', space]], okLabel: 'Comprar', confirmFrom: 100, sub: (q) => fn(price) + ' moedas cada' + (q > 1 ? ' · ' + fn(q) + ' unidades' : ''), onOk: (q) => buyShop(name, price, q) });
    }

    window.Qty = { pick, close, shop, buyShop, capacity, mktCost, get open() { return !!cur; } };
})();
