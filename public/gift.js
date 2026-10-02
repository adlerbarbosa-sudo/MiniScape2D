/* Painel do Dev: dar itens/moedas a jogadores (online ou offline). Só aparece para admin; a rota /api/admin/give valida tudo de novo no servidor.
   O presente entra no correio do jogador (mesmo sistema do mercado): id único, entrega com confirmação, fica na fila se a mochila estiver cheia. */
(function () {
    'use strict';
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const $ = (id) => document.getElementById(id);
    let target = '', item = '', built = false, searchT = 0, busy = false;
    /* nomes de item aceitos pelo servidor (ITEM_RE em security.js): letras, números, espaço e _ . ' ’ ( ) + % ! : - ; até 40 caracteres. Os campos de texto do Dev tiram o resto na hora. */
    const ITEM_RE = /^[\p{L}\p{N}_.'’()+%!:\- ]{1,40}$/u, ITEM_BAD = /[^\p{L}\p{N}_.'’()+%!:\- ]/gu;
    const itemClean = (v) => String(v == null ? '' : v).replace(ITEM_BAD, '').slice(0, 40);
    function itemAttach(el) { if (!el || el._itemClean) return; el._itemClean = 1; el.maxLength = 40; el.addEventListener('input', () => { const c = itemClean(el.value); if (c !== el.value) { const p = el.selectionStart; el.value = c; try { el.setSelectionRange(Math.min(p, c.length), Math.min(p, c.length)); } catch (e) { } } }); }
    window.ItemInput = { RE: ITEM_RE, clean: itemClean, attach: itemAttach, valid: (n) => typeof n === 'string' && ITEM_RE.test(n) };

    function build() {
        if (built) return; const tab = $('tab-dev'); const bar = tab && tab.querySelector('.dev-sub-tabs'); if (!bar) return; built = true;
        const btn = document.createElement('button'); btn.className = 'dev-sub-btn'; btn.id = 'btn-dev-gifts'; btn.textContent = 'Presentes'; btn.style.color = '#2ecc71'; btn.style.fontWeight = 'bold';
        btn.onclick = function () { openDevSub('dev-gifts', btn); render(); loadHistory(); }; bar.appendChild(btn);
        const box = document.createElement('div'); box.id = 'dev-gifts'; box.className = 'dev-sub-content';
        box.innerHTML = `<h3 style="color:#2ecc71;margin-top:0;border-bottom:1px solid #333;padding-bottom:5px">Dar itens a jogadores</h3>
<p style="font-size:.72rem;color:#bdc3c7;margin:4px 0">O item chega pelo correio do jogador (online: em até ~20 s; offline: ao entrar). Fica na fila se a mochila estiver cheia e nunca duplica.</p>
<label style="font-size:.75rem">Jogador:</label><input id="gf-user" class="dev-input" placeholder="Buscar jogador pelo nome..." autocomplete="off" maxlength="30">
<div id="gf-users" style="max-height:110px;overflow-y:auto;margin:4px 0"></div>
<label style="font-size:.75rem">Item (catálogo inteiro: peças e aparências Mímicas, pets, montarias, iscas...):</label><input id="gf-item" class="dev-input" placeholder="Buscar item..." autocomplete="off" maxlength="40">
<div id="gf-items" style="max-height:150px;overflow-y:auto;margin:4px 0;border:1px solid #3d2e24"></div>
<div class="dev-row" style="margin-top:4px"><div style="flex:1"><label style="font-size:.75rem">Quantidade:</label><input id="gf-qty" class="dev-input" type="number" min="1" max="2147483647" value="1"></div></div>
<div id="gf-qb" style="display:flex;gap:4px;margin:4px 0"></div>
<label style="font-size:.75rem">Mensagem (opcional):</label><input id="gf-msg" class="dev-input" maxlength="100" placeholder="Ex.: Obrigado por testar!">
<div id="gf-sel" style="font-size:.78rem;margin:6px 0;color:#f1c40f"></div>
<button id="gf-send" class="dev-save-btn" style="background:#27ae60">Enviar</button>
<div id="gf-status" style="font-size:.75rem;margin-top:4px"></div>
<h4 style="color:#f39c12;margin:12px 0 4px">Últimos presentes</h4><div id="gf-hist" style="font-size:.7rem;color:#bdc3c7;max-height:140px;overflow-y:auto"></div>`;
        tab.appendChild(box);
        try { if (window.SQAdmin) SQAdmin.init(tab, bar); } catch (e) { console.error(e); }   // Missões Especiais (sqadmin.js)
        const qb = $('gf-qb'); [1, 10, 100, 1000, 100000].forEach((n) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'dev-save-btn'; b.style.cssText = 'margin:0;padding:3px 8px;width:auto;background:#3d2e24'; b.textContent = n.toLocaleString('pt-BR'); b.onclick = () => { $('gf-qty').value = n; }; qb.appendChild(b); });
        $('gf-user').addEventListener('input', () => { clearTimeout(searchT); searchT = setTimeout(searchUsers, 200); }); $('gf-user').addEventListener('focus', searchUsers);
        itemAttach($('gf-item')); itemAttach($('di-name')); $('gf-item').addEventListener('input', renderItems);
        $('gf-users').addEventListener('click', (e) => { const r = e.target.closest('[data-u]'); if (!r) return; target = r.dataset.u; $('gf-user').value = target; $('gf-users').innerHTML = ''; render(); });
        $('gf-items').addEventListener('click', (e) => { const r = e.target.closest('[data-i]'); if (!r) return; item = r.dataset.i; render(); renderItems(); });
        $('gf-send').onclick = send; render(); renderItems();
    }
    async function searchUsers() {
        const q = ($('gf-user').value || '').trim(); if (target && q.toLowerCase() !== target.toLowerCase()) target = '';
        try {
            const r = await api('/admin/search?q=' + encodeURIComponent(q)); const box = $('gf-users'); if (!box) return;
            box.innerHTML = (r.users || []).map((u) => `<div class="dev-ent-item" data-u="${esc(u.name)}" style="cursor:pointer">${u.online ? '<span style="color:#2ecc71">●</span>' : '<span style="color:#888">●</span>'} ${esc(u.name)} <small style="opacity:.6">${esc(u.role)}</small></div>`).join('') || '<small style="opacity:.6">Nenhum jogador.</small>'; render();
        } catch (e) { }
    }
    function renderItems() {
        const q = ($('gf-item').value || '').trim().toLowerCase(); const box = $('gf-items'); if (!box || typeof itemDB === 'undefined') return;
        const names = Object.keys(itemDB).filter((k) => ITEM_RE.test(k) && (!q || k.toLowerCase().includes(q) || String(itemDB[k].desc || '').toLowerCase().includes(q))).sort().slice(0, 80);
        box.innerHTML = names.map((k) => `<div class="dev-ent-item${k === item ? ' selected' : ''}" data-i="${esc(k)}" style="cursor:pointer;display:flex;align-items:center;gap:6px">${window.Icons ? Icons.html(k, 20) : ''}<span>${esc(k)}</span></div>`).join('') || '<small style="opacity:.6;padding:4px">Nenhum item.</small>';
    }
    function render() { const s = $('gf-sel'); if (s) s.innerHTML = 'Para: <b>' + esc(target || '(escolha um jogador)') + '</b> · Item: <b>' + esc(item || '(escolha um item)') + '</b>'; }
    function status(t, c) { const s = $('gf-status'); if (s) { s.textContent = t; s.style.color = c || '#bdc3c7'; } }
    async function send() {
        if (busy) return; const qty = Math.floor(Number($('gf-qty').value));
        if (!target) return status('Escolha um jogador na lista.', '#e74c3c'); if (!item) return status('Escolha um item na lista.', '#e74c3c'); if (!ITEM_RE.test(item)) return status('Esse nome de item tem caracteres que o servidor não aceita.', '#e74c3c');
        if (!(qty >= 1 && qty <= 2147483647)) return status('Quantidade inválida (1 a 2.147.483.647).', '#e74c3c');
        busy = true; status('Enviando...');
        try {
            const r = await api('/admin/give', { to: target, item, qty, msg: $('gf-msg').value || '' });
            if (r.error) status(r.error, '#e74c3c');
            else { status('Enviado para ' + r.to + (r.online ? ' (online: chega em instantes)' : ' (offline: chega quando entrar)') + '.', '#2ecc71'); try { setActionText('Presente enviado para ' + r.to + '!', '#2ecc71'); } catch (e) { } loadHistory(); }
        } catch (e) { status('Falha de conexão.', '#e74c3c'); }
        busy = false;
    }
    async function loadHistory() {
        try { const r = await api('/admin/gifts'); const h = $('gf-hist'); if (!h) return; h.innerHTML = (r.gifts || []).map((g) => `<div>${esc(String(g.t || '').slice(5, 16).replace('T', ' '))} · ${esc(g.to)} ← ${Number(g.qty).toLocaleString('pt-BR')}× ${esc(g.item)}${g.msg ? ' · “' + esc(g.msg) + '”' : ''}</div>`).join('') || '<i>Nada ainda.</i>'; } catch (e) { }
    }
    window.Gift = { init: build, _s: () => ({ target, item }) };
})();
