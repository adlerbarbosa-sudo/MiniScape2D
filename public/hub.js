/* MiniScape 2D — Diário do Aventureiro: diárias, conquistas, mercado, ranking, mapa-múndi e emotes (atalho: J). */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ready = () => typeof player !== 'undefined' && player && player.stats && typeof currentUser !== 'undefined' && currentUser && document.getElementById('game-wrapper') && document.getElementById('game-wrapper').style.display !== 'none';
    const online = () => typeof isOfflineMode !== 'undefined' && !isOfflineMode && typeof authToken !== 'undefined' && authToken;
    const note = (t, c) => { try { setActionText(t, c || '#2ecc71'); } catch (e) { } };
    const ic = (n, px) => (window.Icons ? Icons.html(n, px || 22) : '');
    const nonce = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    let tab = 'daily', sub = 'buy', btn = null, open = false, mkData = null, mkQ = '', rankK = 'total', rankData = null, mapSel = null, sellSel = null;

    /* ============ botão e atalho ============ */
    function css() {
        const s = document.createElement('style'); s.textContent = `
        .hub-btn{position:fixed;z-index:60;padding:4px 12px;font:700 .78rem serif;color:#f0e2bd;background:linear-gradient(#5a3d1e,#3a2410);border:2px solid #c9a24a;border-radius:8px;cursor:pointer}
        .hub-btn i{position:absolute;top:-7px;right:-7px;min-width:16px;height:16px;border-radius:8px;background:#d6301f;color:#fff;font:700 .62rem sans-serif;line-height:16px;text-align:center;font-style:normal;border:1px solid #fff5}
        #hub-box{width:100%;max-height:86vh;overflow:auto;color:#f0e2bd;font-family:sans-serif}
        #hub-box h3{margin:0 0 6px;font-family:serif;color:#e8c469}
        .hub-tabs{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}.hub-tabs b{cursor:pointer;padding:4px 9px;border-radius:6px;background:#2a1b0e;border:1px solid #6a4c22;font-size:.76rem;font-weight:600}.hub-tabs b.on{background:#7a5626;border-color:#e8c469;color:#fff}
        .hub-row{display:flex;align-items:center;gap:8px;padding:6px 8px;margin:4px 0;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(232,196,105,.18);font-size:.8rem}.hub-row.done{border-color:#4caf6a;background:rgba(76,175,106,.12)}.hub-row.lock{opacity:.55}
        .hub-row .g{flex:1;min-width:0}.hub-row small{opacity:.75;display:block}.hub-bar{height:6px;border-radius:3px;background:#0006;margin-top:4px;overflow:hidden}.hub-bar i{display:block;height:100%;background:linear-gradient(#6fd28a,#3b9a58)}
        .hb{cursor:pointer;padding:4px 10px;border-radius:6px;border:1px solid #c9a24a;background:linear-gradient(#6a4a22,#452c12);color:#f6e7c1;font:600 .74rem sans-serif}.hb:disabled{opacity:.4;cursor:default}.hb.go{background:linear-gradient(#3f9a58,#2a6e3c);border-color:#7bd68f}
        .hub-in{padding:4px 7px;border-radius:6px;border:1px solid #6a4c22;background:#1c1208;color:#f0e2bd;font-size:.8rem;width:100%;box-sizing:border-box}
        .hub-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:6px}.hub-cell{padding:6px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(232,196,105,.18);text-align:center;font-size:.72rem;cursor:pointer}.hub-cell.on{border-color:#e8c469;background:rgba(232,196,105,.16)}
        .hub-map{display:grid;gap:6px;margin:6px 0}.hub-tile{position:relative;border-radius:8px;border:2px solid #6a4c22;overflow:hidden;cursor:pointer;background:#1c1208;min-height:70px}.hub-tile.cur{border-color:#e8c469;box-shadow:0 0 8px #e8c46988}.hub-tile.sel{border-color:#7bd68f}.hub-tile canvas{width:100%;display:block}.hub-tile span{position:absolute;left:0;right:0;bottom:0;background:#000a;font-size:.68rem;text-align:center;padding:1px 2px}
        #wb-hud{position:absolute;left:50%;transform:translateX(-50%);top:76px;z-index:84;padding:4px 14px;border-radius:10px;background:rgba(20,10,4,.82);border:1px solid #ff9d3a;color:#ffd9a8;font:.74rem sans-serif;text-align:center;pointer-events:none;display:none}#wb-hud.soon{border-color:#c9a24a;color:#f0e2bd}
        #wb-hud .wb-bar{position:relative;margin-top:3px;height:12px;min-width:220px;border-radius:6px;background:#3a1208;overflow:hidden}#wb-hud .wb-bar i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(#ff9d3a,#c4531a)}#wb-hud .wb-bar span{position:relative;font-size:.62rem;line-height:12px;color:#fff}#wb-hud .wb-dead{color:#7bd68f;font-weight:700}`;
        document.head.appendChild(s);
    }
    function place() { const c = $('gameCanvas'); const r = c ? c.getBoundingClientRect() : { right: window.innerWidth - 20, top: 10 }; if (btn) { btn.style.left = Math.max(8, Math.min(window.innerWidth - 84, r.right - 208)) + 'px'; btn.style.top = Math.max(8, Math.min(window.innerHeight - 40, r.top + 66)) + 'px'; } }
    function mkBtn() {
        css(); btn = document.createElement('button'); btn.className = 'hub-btn'; btn.innerHTML = 'Diário<i style="display:none"></i>'; btn.title = 'Diário do Aventureiro (J)'; btn.style.display = 'none'; btn.onclick = () => openHub(); document.body.appendChild(btn); window.addEventListener('resize', place);
        document.addEventListener('keydown', (e) => {
            if (!ready() || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '')) return;
            const k = e.key.toLowerCase();
            if (k === 'j') { open ? closeHub() : openHub('daily'); } else if (k === 'm') { open && tab === 'map' ? closeHub() : openHub('map'); } else if (k === 'escape' && open) closeHub();
        });
    }
    function claimable() { try { const d = Life.daily(); return d ? d.q.filter((q) => q.done && !q.claimed).length : 0; } catch (e) { return 0; } }
    function tick() {
        if (!btn) return; const on = ready() && online(); btn.style.display = on ? '' : 'none'; if (!on) return; place();
        const n = claimable() + (mailN || 0), b = btn.querySelector('i'); b.style.display = n ? '' : 'none'; b.textContent = n;
    }
    function closeHub() { open = false; try { closeModal(); } catch (e) { } }
    function openHub(t) { if (!ready()) return; if (t) tab = t; open = true; render(); }
    function refresh() { if (open) render(true); }

    /* ============ janela ============ */
    const TABS = [['daily', 'Diárias'], ['ach', 'Conquistas'], ['market', 'Mercado'], ['rank', 'Ranking'], ['map', 'Mapa'], ['emote', 'Emotes']];
    function render(soft) {
        const box = $('custom-modal-box'); if (!box) return; const ov = $('custom-modal-overlay');
        if (soft && (ov.style.display === 'none' || !box.querySelector('#hub-box'))) { open = false; return; }
        const sc = box.querySelector('#hub-box') ? box.querySelector('#hub-box').scrollTop : 0;
        let body = ''; try { body = tab === 'daily' ? dailyHtml() : tab === 'ach' ? achHtml() : tab === 'market' ? marketHtml() : tab === 'rank' ? rankHtml() : tab === 'map' ? mapHtml() : emoteHtml(); } catch (e) { body = '<i>Erro ao montar esta aba.</i>'; console.error(e); }
        openModal(`<div id="hub-box"><h3>Diário do Aventureiro</h3><div class="hub-tabs">${TABS.map((t) => `<b data-t="${t[0]}" class="${tab === t[0] ? 'on' : ''}">${t[1]}${t[0] === 'daily' && claimable() ? ' •' : t[0] === 'market' && mailN ? ' •' : ''}</b>`).join('')}</div><div id="hub-body">${body}</div><div style="text-align:right;margin-top:8px"><button class="hb" data-close="1">Fechar (Esc)</button></div></div>`);
        const nb = $('custom-modal-box'); nb.dataset.social = '0'; nb.dataset.hub = '1'; nb.style.width = 'min(94vw, 680px)'; nb.style.maxWidth = 'none'; nb.style.boxSizing = 'border-box'; nb.style.padding = '16px'; const el = nb.querySelector('#hub-box'); if (el && soft) el.scrollTop = sc;
        if (tab === 'map') { try { const cur = nb.querySelector('.hub-tile.cur'), sc2 = cur && cur.closest('div[style*="overflow-x"]'); if (sc2) sc2.scrollLeft = Math.max(0, cur.offsetLeft - sc2.clientWidth / 2 + cur.offsetWidth / 2); } catch (e) { } }   // mapa-múndi largo: centra no lugar atual
        nb.onclick = onClick; afterRender();
    }
    function bar(c, n) { return `<div class="hub-bar"><i style="width:${Math.min(100, Math.round(c / n * 100))}%"></i></div>`; }

    /* ---------- diárias ---------- */
    function fmtMs(ms) { const m = Math.max(0, Math.floor(ms / 60000)); return Math.floor(m / 60) + 'h ' + (m % 60) + 'min'; }
    function dailyHtml() {
        const d = Life.daily(); const now = new Date(), reset = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
        let h = `<div style="font-size:.78rem;opacity:.85;margin-bottom:4px">Renovam à meia-noite (em ${fmtMs(reset)}). Sequência: <b>${d.streak | 0}</b> dia(s) · melhor: ${d.best | 0}. Complete as três e ganhe um bônus que cresce com a sequência.</div>`;
        h += d.q.map((q, i) => `<div class="hub-row ${q.done ? 'done' : ''}"><div class="g"><b>${esc(Life.dText(q))}</b><small>Recompensa: ${q.coins} moedas + ${q.xp} XP</small>${bar(q.p, q.need)}<small>${Math.min(q.p, q.need)}/${q.need}</small></div>${q.claimed ? '<span style="color:#7bd68f">✔ recebida</span>' : `<button class="hb go" data-claim="${i}" ${q.done ? '' : 'disabled'}>Receber</button>`}</div>`).join('');
        const b = Life.bossInfo(); h += `<h4 style="margin:12px 0 4px;color:#e8c469">Chefe de mundo</h4><div class="hub-row"><div class="g"><b>Colosso de Pedra</b><small>${b ? (b.open ? 'Está na Vila agora! Chame seus amigos.' : 'Desperta na Vila daqui a ' + fmtMs(b.next) + '.') : 'Indisponível offline.'} Todo dia, toda hora cheia, por 25 minutos.</small></div></div>`;
        return h;
    }

    /* ---------- conquistas ---------- */
    function achHtml() {
        const got = player.ach || {}; const list = Life.A; const n = list.filter((a) => got[a.id]).length;
        let h = `<div style="font-size:.78rem;margin-bottom:6px">${n} de ${list.length} conquistas. Título atual: <b style="color:#e8c469">${esc(player.title || 'nenhum')}</b> ${player.title ? '<button class="hb" data-title="">Tirar título</button>' : ''}</div>`;
        h += list.slice().sort((a, b) => (got[b.id] ? 1 : 0) - (got[a.id] ? 1 : 0)).map((a) => { let c = 0; try { c = a.cur(); } catch (e) { } const ok = !!got[a.id];
            return `<div class="hub-row ${ok ? 'done' : 'lock'}"><div class="g"><b>${esc(a.name)}</b> ${ok ? '' : ''}<small>${esc(a.desc)}</small>${ok ? '' : bar(c, a.need) + `<small>${Math.min(c, a.need)}/${a.need} · recompensa ${a.reward} moedas</small>`}</div>${ok ? (player.title === a.title ? '<span style="color:#e8c469">título em uso</span>' : `<button class="hb" data-title="${esc(a.title)}">Usar título</button>`) : ''}</div>`; }).join('');
        return h;
    }

    /* ---------- emotes ---------- */
    function emoteHtml() { return `<div style="font-size:.78rem;margin-bottom:6px">Clique para fazer um balão sobre a cabeça (todos por perto veem). No chat: <b>/e heart</b>.</div><div class="hub-grid">${Life.EM.map((k) => `<div class="hub-cell" data-em="${k}"><canvas width="40" height="40" data-emc="${k}" style="width:40px;height:40px"></canvas><br>${esc(Life.EM_NAME[k])}</div>`).join('')}</div>`; }

    /* ---------- ranking ---------- */
    async function loadRank() { if (!online()) return; try { const r = await api('/rank', { k: rankK }); if (r && r.ok) { rankData = r; if (open && tab === 'rank') render(true); } } catch (e) { } }
    function rankHtml() {
        const sk = Object.keys(player.stats.skills); const opts = [['total', 'Nível geral'], ['kills', 'Criaturas derrotadas']].concat(sk.map((k) => [k, player.stats.skills[k].name || k]));
        let h = `<select class="hub-in" id="rk-sel" style="margin-bottom:6px">${opts.map((o) => `<option value="${o[0]}" ${o[0] === rankK ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
        if (!rankData || rankData.k !== rankK) return h + '<i>Carregando...</i>';
        h += rankData.top.length ? rankData.top.map((r) => `<div class="hub-row ${r.u === currentUser ? 'done' : ''}"><b style="width:28px;color:${r.pos === 1 ? '#ffd24a' : r.pos === 2 ? '#d6dbe2' : r.pos === 3 ? '#d08a4a' : '#cbb98a'}">#${r.pos}</b><div class="g"><b>${esc(r.u)}</b>${r.title ? `<small style="color:#e8c469">‹${esc(r.title)}›</small>` : ''}</div><span>${r.v}${r.on ? ' <span style="color:#7bd68f" title="online">●</span>' : ''}</span></div>`).join('') : '<i>Ninguém ainda.</i>';
        if (rankData.me && rankData.me.pos > 20) h += `<div class="hub-row done"><b style="width:28px">#${rankData.me.pos}</b><div class="g"><b>${esc(currentUser)}</b> (você)</div><span>${rankData.me.v}</span></div>`;
        return h + '<div style="font-size:.68rem;opacity:.6;margin-top:6px">Atualiza a cada 30 segundos, com base nos personagens salvos.</div>';
    }

    /* ---------- mercado ---------- */
    let mailN = 0;
    async function mkCall(b) { try { const r = await api('/market', b); if (r && r._status === 404) { noMarket = true; return { error: 'Mercado indisponível neste servidor.', _net: true }; } return r; } catch (e) { return { error: 'Sem conexão.', _net: true }; } }
    async function loadMarket() { if (!online()) return; const r = await mkCall({ a: 'browse', q: mkQ }); if (r && r.ok) { mkData = r; mailN = r.mail | 0; if (open && tab === 'market') render(true); } }
    const coins = () => getInvCount('Coins');
    function marketHtml() {
        const S = [['buy', 'Comprar'], ['sell', 'Vender'], ['mine', 'Meus anúncios']];
        let h = `<div class="hub-tabs">${S.map((t) => `<b data-sub="${t[0]}" class="${sub === t[0] ? 'on' : ''}">${t[1]}${t[0] === 'mine' && mkData && mkData.mine.length ? ' (' + mkData.mine.length + ')' : ''}</b>`).join('')}<span style="margin-left:auto;font-size:.76rem;align-self:center">Você tem ${ic('Coins', 18)} <b>${coins()}</b></span></div>`;
        if (!online()) return h + '<i>O mercado precisa de conexão com o servidor.</i>';
        if (mailN) h += `<div class="hub-row done"><div class="g">📬 Você tem <b>${mailN}</b> item(ns) no correio. Eles chegam à mochila sozinhos (precisa de espaço).</div></div>`;
        if (!mkData) return h + '<i>Carregando...</i>';
        if (sub === 'buy') {
            h += `<input class="hub-in" id="mk-q" placeholder="Buscar item..." value="${esc(mkQ)}" style="margin-bottom:4px">`;
            h += mkData.listings.length ? mkData.listings.map((l) => `<div class="hub-row">${ic(l.item, 30)}<div class="g"><b>${esc(l.item)}</b> ×${l.qty}<small>${l.qty > 1 ? Math.round(l.price / l.qty * 100) / 100 + ' cada · ' : ''}vendedor: ${esc(l.seller)}</small></div><button class="hb go" data-buy="${esc(l.id)}" data-price="${l.price}" ${l.seller === currentUser || coins() < l.price ? 'disabled' : ''}>${l.price} ${l.seller === currentUser ? '(seu)' : ''}</button></div>`).join('') : '<i>Nenhum anúncio.</i>';
        } else if (sub === 'sell') {
            const inv = {}; player.inventory.forEach((i) => { if (i.name !== 'Coins' && Net.tradable(i.name)) inv[i.name] = (inv[i.name] || 0) + (i.qty || 1); });
            const names = Object.keys(inv); if (sellSel && !inv[sellSel.name]) sellSel = null;
            h += `<div style="font-size:.76rem;margin-bottom:4px">Escolha o item. Taxa de 5% sobre o preço. Anúncios duram 3 dias (depois o item volta pelo correio).</div><div class="hub-grid" style="margin-bottom:6px">${names.map((n) => `<div class="hub-cell ${sellSel && sellSel.name === n ? 'on' : ''}" data-sel="${esc(n)}">${ic(n, 26)}<br>${esc(n)}<br><small>×${inv[n]}</small></div>`).join('') || '<i>Mochila sem itens vendáveis.</i>'}</div>`;
            if (sellSel) { const mx = inv[sellSel.name]; h += `<div class="hub-row"><div class="g"><b>${esc(sellSel.name)}</b><div style="display:flex;gap:6px;margin-top:4px"><label style="flex:1">Quantidade (máx ${mx})<input class="hub-in" id="mk-qty" type="number" min="1" max="${mx}" value="${Math.min(sellSel.qty || 1, mx)}"></label><label style="flex:1">Preço total<input class="hub-in" id="mk-price" type="number" min="1" max="100000000" value="${sellSel.price || ''}"></label></div><small id="mk-net"></small></div><button class="hb go" data-list="1">Anunciar</button></div>`; }
        } else {
            h += mkData.mine.length ? mkData.mine.map((l) => `<div class="hub-row">${ic(l.item, 30)}<div class="g"><b>${esc(l.item)}</b> ×${l.qty}<small>${l.price} moedas · expira em ${fmtMs(l.exp - Date.now())}</small></div><button class="hb" data-cancel="${esc(l.id)}">Retirar</button></div>`).join('') : '<i>Você não tem anúncios.</i>';
        }
        return h;
    }
    async function saveConfirmed() { try { await saveDataNow(false); } catch (e) { } return typeof _saveFails === 'number' ? _saveFails === 0 : true; }
    let mkBusy = false;
    async function doList() {
        if (mkBusy) return; const q = Math.floor(Number(($('mk-qty') || {}).value)), pr = Math.floor(Number(($('mk-price') || {}).value)), name = sellSel && sellSel.name;
        if (!name || !(q >= 1) || !(pr >= 1) || pr > 100000000) return note('Confira quantidade e preço.', '#e74c3c'); if (!Net.tradable(name) || getInvCount(name) < q) return note('Você não tem esse item.', '#e74c3c');
        if (player.mkt && (player.mkt.create || player.mkt.buy)) return note('Aguarde a operação anterior terminar.', '#e74c3c');
        mkBusy = true; try {
            const inv = JSON.stringify(player.inventory); removeInvItem(name, q); player.mkt = { create: { item: name, qty: q, price: pr, nonce: nonce() } }; updateUI();
            if (!(await saveConfirmed())) { player.inventory = JSON.parse(inv); player.mkt = null; updateUI(); return note('Sem conexão para salvar. Nada foi anunciado.', '#e74c3c'); }
            await finishPending(); sellSel = null; await loadMarket();
        } finally { mkBusy = false; }
    }
    async function doBuy(id, price) {
        if (mkBusy) return; if (coins() < price) return note('Moedas insuficientes.', '#e74c3c'); if (player.mkt && (player.mkt.create || player.mkt.buy)) return note('Aguarde a operação anterior terminar.', '#e74c3c');
        mkBusy = true; try {
            const inv = JSON.stringify(player.inventory); removeInvItem('Coins', price); player.mkt = { buy: { id, price, nonce: nonce() } }; updateUI();
            if (!(await saveConfirmed())) { player.inventory = JSON.parse(inv); player.mkt = null; updateUI(); return note('Sem conexão para salvar. Nada foi comprado.', '#e74c3c'); }
            await finishPending(); await loadMarket(); await claimMail();
        } finally { mkBusy = false; }
    }
    function refund(what) { try { if (what.create) { const c = what.create; if (!addInvItem(c.item, c.qty)) dropAt(c.item, c.qty); } if (what.buy) { if (!addInvItem('Coins', what.buy.price)) dropAt('Coins', what.buy.price); } } catch (e) { } }
    function dropAt(item, qty) { try { gameMaps[currentMap].entities.push({ id: newEntId(), type: 'ground_item', item, qty, x: player.x, y: player.y, w: 20, h: 20, active: true, life: 9000 }); } catch (e) { } }
    async function finishPending() {   // conclui (ou devolve) uma operação pendente; é seguro repetir
        const p = player.mkt; if (!p || !online()) return;
        if (p.create) {
            const r = await mkCall(Object.assign({ a: 'create' }, p.create));
            if (r && r.ok) { player.mkt = null; note('Anúncio publicado!', '#2ecc71'); sfxp('coin'); await saveConfirmed(); }
            else if (r && !r._net && r._status < 500 && r._status !== 429 && r._status !== 401) { refund(p); player.mkt = null; note(r.error || 'Não foi possível anunciar. Item devolvido.', '#e74c3c'); updateUI(); await saveConfirmed(); }
        } else if (p.buy) {
            const r = await mkCall({ a: 'buy', id: p.buy.id, nonce: p.buy.nonce });
            if (r && r.ok) { player.mkt = null; note('Compra feita! O item chega pelo correio.', '#2ecc71'); sfxp('pickup'); await saveConfirmed(); }
            else if (r && !r._net && r._status < 500 && r._status !== 429 && r._status !== 401) { refund(p); player.mkt = null; note(r.error || 'Compra recusada. Moedas devolvidas.', '#e74c3c'); updateUI(); await saveConfirmed(); }
        }
    }
    const sfxp = (n) => { try { Sfx.play(n); } catch (e) { } };
    async function claimMail() {
        if (!online() || claiming) return; claiming = true; try {
            const r = await mkCall({ a: 'mail' }); if (!r || !r.ok) return; if (!Array.isArray(player.mailDone)) player.mailDone = [];
            const done = new Set(player.mailDone); const ack = [], got = []; let changed = false;
            for (const e of r.mail) {
                if (done.has(e.id)) { ack.push(e.id); continue; }
                if (!itemDB[e.item] || !addInvItem(e.item, e.qty)) continue;   // sem espaço: tenta de novo depois
                player.mailDone.push(e.id); ack.push(e.id); got.push(e); changed = true;
            }
            if (player.mailDone.length > 200) player.mailDone.splice(0, player.mailDone.length - 200);
            if (changed) { updateUI(); if (!(await saveConfirmed())) return; }   // só confirma ao servidor depois de salvar
            if (ack.length) await mkCall({ a: 'ack', ids: ack });
            got.forEach((e) => { try { addPickupText(e.item, e.qty); if (/^Venda/.test(e.why)) Life.cnt('sold'); } catch (er) { } if (/^Venda/.test(e.why)) note(e.why, '#f1c40f'); });
            if (got.length) { Life.checkAch(); loadMarket(); }
            mailN = Math.max(0, r.mail.length - ack.length);
        } finally { claiming = false; }
    }
    let claiming = false;

    /* ---------- mapa-múndi ---------- */
    function thumb(id) {
        const m = gameMaps[id], c = document.createElement('canvas'); c.width = 150; c.height = 100; const g = c.getContext('2d'); const W = m.width || 800, H = m.height || 600, s = Math.min(150 / W, 100 / H); c.style.aspectRatio = '3/2';
        const nm = ((m.name || id) + '').toLowerCase(); g.fillStyle = window.Maps2 && Maps2.MAPS[id] && /^#[0-9a-f]{6}$/i.test(m.color || '') ? m.color : /covil|caverna|cave|catacumba|mina|mine|masmorra|dragão|dragon/.test(nm) ? '#2c2a30' : /casa|home/.test(nm) ? '#6b5236' : '#4b7a38'; g.fillRect(0, 0, 150, 100);
        g.save(); g.translate((150 - W * s) / 2, (100 - H * s) / 2); g.scale(s, s);
        (m.entities || []).forEach((o) => { if (!o || o.active === false) return; const t = o.type, w = o.w || 30, h = o.h || 30;
            if (t === 'paint') { g.fillStyle = 'rgba(190,170,130,.55)'; g.fillRect(o.x, o.y, w, h); } else if (t === 'house') { g.fillStyle = '#8a4a2c'; g.fillRect(o.x, o.y, w, h); } else if (t === 'tree') { g.fillStyle = '#2f5a25'; g.fillRect(o.x, o.y, w, h * 0.8); }
            else if (typeof t === 'string' && t.startsWith('rock')) { g.fillStyle = '#8a8f96'; g.fillRect(o.x, o.y, w, h); } else if (t === 'portal') { g.fillStyle = '#4fd6ff'; g.fillRect(o.x, o.y, Math.max(w, 40), Math.max(h, 40)); } else if (t === 'npc') { g.fillStyle = '#ffd24a'; g.fillRect(o.x, o.y, 44, 44); } else if (t === 'enemy' && !o.wb) { g.fillStyle = '#d6301f'; g.fillRect(o.x, o.y, 36, 36); } });
        if (id === currentMap) { g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 8; g.beginPath(); g.arc(player.x, player.y, 26, 0, 6.3); g.fill(); g.stroke(); }
        g.restore(); return c.toDataURL();
    }
    function mapInfo(id) {
        const m = gameMaps[id]; const ents = (m.entities || []).filter((o) => o && o.active !== false); const mobs = {}, npcs = [], ports = [];
        ents.forEach((o) => { if (o.type === 'enemy' && !o.wb) { const d = npcDB[o.dbKey] || {}; const k = d.name || o.name; mobs[k] = (mobs[k] || 0) + 1; } else if (o.type === 'npc') { const mk = window.Quests ? Quests.markerFor(o.dbKey) : null; npcs.push((o.name || o.dbKey) + (mk === '!' ? ' <b style="color:#ffd24a">!</b>' : mk === '?' ? ' <b style="color:#7bd68f">?</b>' : '')); } else if (o.type === 'portal' && o.destMap && gameMaps[o.destMap]) ports.push(gameMaps[o.destMap].name || o.destMap); });
        const tr = ents.filter((o) => o.type === 'tree').length, rk = ents.filter((o) => typeof o.type === 'string' && o.type.startsWith('rock')).length, fs = ents.filter((o) => o.type === 'fishing_spot').length;
        return `<div class="hub-row"><div class="g"><b>${esc(m.name || id)}</b>${id === currentMap ? ' <span style="color:#e8c469">(você está aqui)</span>' : ''}
            <small>Criaturas: ${Object.keys(mobs).map((k) => esc(k) + ' ×' + mobs[k]).join(', ') || 'nenhuma'}</small><small>NPCs: ${npcs.join(', ') || 'nenhum'}</small>
            <small>Recursos: ${tr} árvores, ${rk} rochas, ${fs} pontos de pesca</small>${ports.length ? `<small>Portais para: ${[...new Set(ports)].map(esc).join(', ')}</small>` : ''}</div></div>`;
    }
    function mapHtml() {
        const ids = Object.keys(gameMaps).filter((k) => gameMaps[k] && gameMaps[k].entities && k !== 'casa' && !/^casa_/.test(k)); const grid = ids.filter((k) => gameMaps[k].gridX != null && gameMaps[k].gridY != null), other = ids.filter((k) => !grid.includes(k));
        if (!mapSel || !gameMaps[mapSel]) mapSel = currentMap;
        let h = '<div style="font-size:.78rem;margin-bottom:4px">Clique num lugar para ver criaturas, NPCs e recursos. Amarelo = NPC, vermelho = criatura, azul = portal, ponto branco = você.</div>';
        if (grid.length) {
            const xs = grid.map((k) => gameMaps[k].gridX), ys = grid.map((k) => gameMaps[k].gridY), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
            const ncol = x1 - x0 + 1; h += `<div style="overflow-x:auto;padding-bottom:4px"><div class="hub-map" style="grid-template-columns:repeat(${ncol},minmax(96px,1fr));min-width:${ncol * 102}px">`;   // mapa-múndi largo: rola na horizontal em vez de encolher as miniaturas
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const k = grid.find((q) => gameMaps[q].gridX === x && gameMaps[q].gridY === y); h += k ? `<div class="hub-tile ${k === currentMap ? 'cur' : ''} ${k === mapSel ? 'sel' : ''}" data-map="${esc(k)}"><img src="${thumb(k)}" style="width:100%;display:block"><span>${esc(gameMaps[k].name || k)}</span></div>` : '<div></div>'; }
            h += '</div></div>';
        }
        if (other.length) h += `<div style="font-size:.74rem;margin:6px 0 2px">Outros lugares</div><div class="hub-map" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr))">${other.map((k) => `<div class="hub-tile ${k === currentMap ? 'cur' : ''} ${k === mapSel ? 'sel' : ''}" data-map="${esc(k)}"><img src="${thumb(k)}" style="width:100%;display:block"><span>${esc(gameMaps[k].name || k)}</span></div>`).join('')}</div>`;
        return h + mapInfo(mapSel);
    }

    /* ============ eventos ============ */
    function onClick(ev) {
        const t = ev.target.closest('[data-t],[data-sub],[data-claim],[data-title],[data-em],[data-buy],[data-cancel],[data-sel],[data-list],[data-map],[data-close]'); if (!t) return; const d = t.dataset;
        if (d.close) return closeHub();
        if (d.t) { tab = d.t; if (tab === 'market') { loadMarket(); claimMail(); } if (tab === 'rank') loadRank(); return render(); }
        if (d.sub) { sub = d.sub; return render(); }
        if (d.claim != null) { Life.claim(+d.claim); return render(); }
        if (d.title != null) { player.title = d.title; try { saveDataLogic(); } catch (e) { } return render(); }
        if (d.em) { if (Life.emote(d.em)) closeHub(); return; }
        if (d.buy) { if (window.ItemSel && !ItemSel.arm('mk:' + d.buy)) { const old = t.textContent; t.textContent = 'Confirmar?'; note('Toque de novo em Confirmar para comprar (' + d.price + ' moedas).', '#f1c40f'); setTimeout(() => { if (t.isConnected && t.textContent === 'Confirmar?') t.textContent = old; }, 4000); return; } return doBuy(d.buy, +d.price); }
        if (d.cancel) return (async () => { const r = await mkCall({ a: 'cancel', id: d.cancel }); note(r.ok ? 'Anúncio retirado. O item volta pelo correio.' : (r.error || 'Erro'), r.ok ? '#2ecc71' : '#e74c3c'); await loadMarket(); await claimMail(); })();
        if (d.sel) { sellSel = { name: d.sel }; return render(); }
        if (d.list) return doList();
        if (d.map) { mapSel = d.map; return render(); }
    }
    function afterRender() {
        const b = $('hub-body'); if (!b) return;
        const q = $('mk-q'); if (q) q.addEventListener('input', () => { clearTimeout(q._t); q._t = setTimeout(async () => { mkQ = q.value; await loadMarket(); const nq = $('mk-q'); if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); } }, 350); });
        const rs = $('rk-sel'); if (rs) rs.addEventListener('change', () => { rankK = rs.value; rankData = null; render(); loadRank(); });
        const upd = () => { const n = $('mk-net'), pr = Math.floor(Number(($('mk-price') || {}).value)); if (n) n.textContent = pr >= 1 ? 'Você recebe ' + (pr - Math.floor(pr * 0.05)) + ' moedas (taxa 5%).' : ''; if (sellSel) { sellSel.qty = Math.floor(Number(($('mk-qty') || {}).value)) || 1; sellSel.price = pr || ''; } };
        ['mk-qty', 'mk-price'].forEach((id) => { const e = $(id); if (e) e.addEventListener('input', upd); }); upd();
        b.querySelectorAll('canvas[data-emc]').forEach((c) => { const g = c.getContext('2d'); g.scale(1.3, 1.3); try { Emotes.draw(g, 15, 30, { k: c.dataset.emc, until: Date.now() + 999999 }); } catch (e) { } });
        if (tab === 'rank' && !rankData) loadRank();
    }

    /* ============ correio e pendências ============ */
    let lastPoll = 0, noMarket = false;
    async function background() {
        if (!ready() || !online() || noMarket) return; const n = Date.now(); if (n - lastPoll < 20000) return; lastPoll = n;
        try { if (player.mkt) await finishPending(); await claimMail(); if (!mkData || open) { /* nada */ } } catch (e) { }
    }
    function wire() { const om = window.openModal; if (typeof om === 'function') window.openModal = function () { const b = $('custom-modal-box'); if (b) { b.style.width = ''; b.style.maxWidth = ''; b.style.boxSizing = ''; b.style.padding = ''; } return om.apply(this, arguments); }; mkBtn(); setInterval(() => { try { tick(); background(); } catch (e) { } }, 1000); }
    window.addEventListener('load', wire);
    window.Hub = { open: openHub, refresh, tick, claimMail, loadMarket };
})();
