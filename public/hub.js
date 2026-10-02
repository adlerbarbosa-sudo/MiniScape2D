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
        #hub-box{width:100%;max-height:88vh;max-height:88dvh;overflow:auto;color:#f0e2bd;font-family:sans-serif}
        #hub-box h3{margin:0 0 6px;font-family:serif;color:#e8c469}
        .hub-tabs{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}.hub-tabs b{cursor:pointer;padding:4px 9px;border-radius:6px;background:#2a1b0e;border:1px solid #6a4c22;font-size:.76rem;font-weight:600}.hub-tabs b.on{background:#7a5626;border-color:#e8c469;color:#fff}
        .hub-row{display:flex;align-items:center;gap:8px;padding:6px 8px;margin:4px 0;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(232,196,105,.18);font-size:.8rem}.hub-row.done{border-color:#4caf6a;background:rgba(76,175,106,.12)}.hub-row.lock{opacity:.55}
        .hub-row .g{flex:1;min-width:0}.hub-row small{opacity:.75;display:block}.hub-bar{height:6px;border-radius:3px;background:#0006;margin-top:4px;overflow:hidden}.hub-bar i{display:block;height:100%;background:linear-gradient(#6fd28a,#3b9a58)}
        .hb{cursor:pointer;padding:4px 10px;border-radius:6px;border:1px solid #c9a24a;background:linear-gradient(#6a4a22,#452c12);color:#f6e7c1;font:600 .74rem sans-serif}.hb:disabled{opacity:.4;cursor:default}.hb.go{background:linear-gradient(#3f9a58,#2a6e3c);border-color:#7bd68f}
        .hub-in{padding:4px 7px;border-radius:6px;border:1px solid #6a4c22;background:#1c1208;color:#f0e2bd;font-size:.8rem;width:100%;box-sizing:border-box}
        .hub-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:6px}.hub-cell{padding:6px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(232,196,105,.18);text-align:center;font-size:.72rem;cursor:pointer}.hub-cell.on{border-color:#e8c469;background:rgba(232,196,105,.16)}
        .hub-map{display:grid;gap:6px;margin:6px 0}.hub-tile{position:relative;border-radius:8px;border:2px solid #6a4c22;overflow:hidden;cursor:pointer;background:#1c1208;min-height:70px}.hub-tile.cur{border-color:#e8c469;box-shadow:0 0 8px #e8c46988}.hub-tile.sel{border-color:#7bd68f}.hub-tile canvas{width:100%;display:block}.hub-tile span{position:absolute;left:0;right:0;bottom:0;background:#000a;font-size:.68rem;text-align:center;padding:1px 2px}
        #wm-view{position:relative;overflow:auto;height:clamp(190px,56dvh,600px);border-radius:10px;border:1px solid #6a4c22;background:radial-gradient(ellipse at 50% 40%,#2b2112,#150e07);cursor:grab;touch-action:pan-x pan-y;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}#wm-view.drag{cursor:grabbing;user-select:none}
        @media(max-height:460px){.wm-hint{display:none}#wm-view{height:max(150px,44dvh)}}
        #wm-world{position:relative}.wm-lines{position:absolute;left:0;top:0;pointer-events:none}.wm-lines line{stroke:rgba(232,196,105,.32);stroke-width:2;stroke-dasharray:5 4}
        .wm-tile{position:absolute!important;min-height:0!important;margin:0}.wm-tile img{width:100%;height:100%;object-fit:cover;display:block;-webkit-user-drag:none}.wm-tile span{line-height:1.1;max-height:2.3em;overflow:hidden;display:block;padding:1px 3px 2px!important}
        .wm-you{position:absolute;right:3px;top:3px;width:9px;height:9px;border-radius:50%;background:#ffe27a;box-shadow:0 0 0 2px #0008,0 0 8px #ffe27a}.wm-bar{display:flex;gap:6px;align-items:center;margin-bottom:5px}.wm-bar .hb{min-width:38px;min-height:30px}
        #wb-hud{position:absolute;left:50%;transform:translateX(-50%);top:3px;z-index:84;max-width:92%;white-space:nowrap;padding:1px 10px;border-radius:999px;background:rgba(20,10,4,.72);border:1px solid #ff9d3a;color:#ffd9a8;font:.64rem sans-serif;line-height:1.5;text-align:center;pointer-events:none;display:none}#wb-hud.soon{border-color:#c9a24a;color:#f0e2bd}
        #wb-hud .wb-bar{position:relative;display:inline-block;vertical-align:middle;margin-left:6px;height:9px;width:90px;border-radius:5px;background:#3a1208;overflow:hidden}#wb-hud .wb-bar i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(#ff9d3a,#c4531a)}#wb-hud .wb-bar span{position:relative;font-size:.5rem;line-height:9px;color:#fff}#wb-hud .wb-dead{display:inline;margin-left:6px;color:#7bd68f;font-weight:700}
        #wb-ann{position:absolute;left:50%;transform:translateX(-50%);top:24px;z-index:130;max-width:80%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:1px 12px;border-radius:999px;background:rgba(20,10,4,.8);border:1px solid #ff9d3a;color:#ffd9a8;font:700 .66rem sans-serif;line-height:1.55;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .45s}#wb-ann.show{opacity:1;pointer-events:auto}
        html.touch #wb-hud,html.touch #wb-ann{left:50%;right:auto;transform:translateX(-50%);font-size:.54rem;max-width:38vw;overflow:hidden;text-overflow:ellipsis}html.touch #wb-hud{top:27px}html.touch #wb-ann{top:44px}html.touch #wb-hud .wb-bar{width:56px;height:7px}html.touch #wb-hud .wb-bar span{display:none}`;
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
    const TABS = [['daily', 'Diárias'], ['special', 'Especiais'], ['ach', 'Conquistas'], ['market', 'Mercado'], ['rank', 'Ranking'], ['map', 'Mapa'], ['emote', 'Emotes']];
    function render(soft) {
        const box = $('custom-modal-box'); if (!box) return; const ov = $('custom-modal-overlay');
        if (soft && (ov.style.display === 'none' || !box.querySelector('#hub-box'))) { open = false; return; }
        const sc = box.querySelector('#hub-box') ? box.querySelector('#hub-box').scrollTop : 0;
        let body = ''; try { body = tab === 'daily' ? dailyHtml() : tab === 'special' ? specialHtml() : tab === 'ach' ? achHtml() : tab === 'market' ? marketHtml() : tab === 'rank' ? rankHtml() : tab === 'map' ? mapHtml() : emoteHtml(); } catch (e) { body = '<i>Erro ao montar esta aba.</i>'; console.error(e); }
        openModal(`<div id="hub-box"><h3>Diário do Aventureiro</h3><div class="hub-tabs">${TABS.map((t) => `<b data-t="${t[0]}" class="${tab === t[0] ? 'on' : ''}">${t[1]}${t[0] === 'daily' && claimable() ? ' •' : t[0] === 'special' && sqReady() ? ' •' : t[0] === 'market' && mailN ? ' •' : ''}</b>`).join('')}</div><div id="hub-body">${body}</div><div style="text-align:right;margin-top:8px"><button class="hb" data-close="1">Fechar (Esc)</button></div></div>`);
        const nb = $('custom-modal-box'); nb.dataset.social = '0'; nb.dataset.hub = '1'; nb.style.width = tab === 'map' ? 'min(96vw, 1040px)' : 'min(94vw, 680px)'; nb.style.maxWidth = 'none'; nb.style.boxSizing = 'border-box'; nb.style.padding = '16px'; const el = nb.querySelector('#hub-box'); if (el && soft) el.scrollTop = sc;
        nb.onclick = onClick; afterRender();
    }
    function bar(c, n) { return `<div class="hub-bar"><i style="width:${Math.min(100, Math.round(c / n * 100))}%"></i></div>`; }

    /* ---------- diárias ---------- */
    function fmtMs(ms) { const m = Math.max(0, Math.floor(ms / 60000)); return Math.floor(m / 60) + 'h ' + (m % 60) + 'min'; }
    function dailyHtml() {
        const d = Life.daily(); const now = new Date(), reset = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
        let h = `<div style="font-size:.78rem;opacity:.85;margin-bottom:4px">Renovam à meia-noite (em ${fmtMs(reset)}). Sequência: <b>${d.streak | 0}</b> dia(s) · melhor: ${d.best | 0}. Complete as três e ganhe um bônus que cresce com a sequência.</div>`;
        h += d.q.map((q, i) => `<div class="hub-row ${q.done ? 'done' : ''}"><div class="g"><b>${esc(Life.dText(q))}</b><small>Recompensa: ${fn(q.coins)} moedas + ${q.xp} XP</small>${bar(q.p, q.need)}<small>${Math.min(q.p, q.need)}/${q.need}</small></div>${q.claimed ? '<span style="color:#7bd68f">✔ recebida</span>' : `<button class="hb go" data-claim="${i}" ${q.done ? '' : 'disabled'}>Receber</button>`}</div>`).join('');
        const b = Life.bossInfo(); h += `<h4 style="margin:12px 0 4px;color:#e8c469">Chefe de mundo</h4><div class="hub-row"><div class="g"><b>Colosso de Pedra</b><small>${b ? (b.open ? 'Está na Vila agora! Chame seus amigos.' : 'Desperta na Vila daqui a ' + fmtMs(b.next) + '.') : 'Indisponível offline.'} Todo dia, toda hora cheia, por 25 minutos.</small></div></div>`;
        return h;
    }

    /* ---------- missões especiais (criadas pelo admin; objetivo e resgate validados no servidor) ---------- */
    let sqData = null, sqBusy = false;
    const sqReady = () => !!(sqData && sqData.some((q) => !q.claimed && q.active && q.prog >= q.need && q.type !== 'code'));
    async function loadSpecial() { if (!online()) return; try { const r = await api('/specialquest/list'); if (r && r.ok) { sqData = r.quests; if (open && tab === 'special') render(true); } } catch (e) { } }
    function sqObj(q) {
        if (q.type === 'code') return 'Descubra e digite o código secreto.';
        if (q.type === 'kill') return 'Derrote ' + q.need + '× ' + esc((npcDB[q.species] && npcDB[q.species].name) || q.species) + '.';
        if (q.type === 'map') return 'Chegue a ' + esc((gameMaps[q.map] && gameMaps[q.map].name) || q.map) + '.';
        return 'Entregue ' + q.need + '× ' + esc(q.item) + '.';
    }
    function specialHtml() {
        if (!online()) return '<i>As missões especiais só ficam disponíveis online.</i>';
        if (!sqData) return '<i>Carregando...</i>';
        let h = '<div style="font-size:.78rem;opacity:.85;margin-bottom:4px">Missões especiais, com recompensas exclusivas. Cada uma pode ser resgatada <b>uma vez</b> por jogador; o prêmio chega pelo correio.</div>';
        if (!sqData.length) return h + '<i>Nenhuma missão especial ativa agora.</i>';
        return h + sqData.map((q) => {
            const done = q.claimed, ok = q.active && q.prog >= q.need && q.left !== 0;
            const rw = '<span style="display:inline-flex;align-items:center;gap:4px">' + ic(q.reward.item, 22) + esc(q.reward.item) + (q.reward.qty > 1 ? ' ×' + fn(q.reward.qty) : '') + '</span>';
            let act = '';
            if (done) act = '<span style="color:#7bd68f">✔ resgatada</span>';
            else if (q.left === 0) act = '<span style="color:#e67e22">esgotada</span>';
            else if (q.type === 'code') act = '<input class="hub-in" data-sqcode="' + esc(q.id) + '" maxlength="30" placeholder="Código" style="width:110px;margin-right:4px"><button class="hb go" data-sqc="' + esc(q.id) + '">Resgatar</button>';
            else act = '<button class="hb go" data-sqc="' + esc(q.id) + '" ' + (ok ? '' : 'disabled') + '>Resgatar</button>';
            return '<div class="hub-row ' + (done ? 'done' : '') + '"><div class="g"><b>' + esc(q.name) + '</b>' + (q.desc ? '<small>' + esc(q.desc) + '</small>' : '') + '<small>Objetivo: ' + sqObj(q) + '</small>' + (q.type === 'code' ? '' : bar(q.prog, q.need) + '<small>' + Math.min(q.prog, q.need) + '/' + q.need + '</small>') + '<small>Recompensa: ' + rw + (q.left > 0 ? ' · restam ' + q.left : '') + '</small></div><div style="display:flex;align-items:center;flex-wrap:wrap;justify-content:flex-end;gap:4px">' + act + '</div></div>';
        }).join('');
    }
    async function sqClaim(id) {
        if (sqBusy) return; const q = (sqData || []).find((x) => x.id === id); if (!q) return; sqBusy = true;
        try {
            const inp = document.querySelector('[data-sqcode="' + id + '"]'); const r = await api('/specialquest/claim', { id, code: inp ? inp.value : undefined });
            if (!r || !r.ok) { note((r && r.error) || 'Não foi possível resgatar.', '#e74c3c'); }
            else {
                if (r.take) { try { removeInvItem(r.take.item, r.take.qty); updateUI(); saveDataLogic(); } catch (e) { } }
                note('Missão especial concluída: ' + r.name + '! A recompensa chega pelo correio.', '#2ecc71'); try { Sfx.play('quest'); } catch (e) { }
                await claimMail();
            }
        } catch (e) { note('Sem conexão.', '#e74c3c'); }
        sqBusy = false; await loadSpecial(); if (open) render(true);
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
        const sk = Object.keys(player.stats.skills); const opts = [['total', 'Nível geral'], ['kills', 'Criaturas derrotadas']].concat(sk.map((k) => [k, (window.Labels ? Labels.skill(k, player.stats.skills[k].name) : (player.stats.skills[k].name || k))]));
        let h = `<select class="hub-in" id="rk-sel" style="margin-bottom:6px">${opts.map((o) => `<option value="${o[0]}" ${o[0] === rankK ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
        if (!rankData || rankData.k !== rankK) return h + '<i>Carregando...</i>';
        h += rankData.top.length ? rankData.top.map((r) => `<div class="hub-row ${r.u === currentUser ? 'done' : ''}"><b style="width:28px;color:${r.pos === 1 ? '#ffd24a' : r.pos === 2 ? '#d6dbe2' : r.pos === 3 ? '#d08a4a' : '#cbb98a'}">#${r.pos}</b><div class="g"><b>${esc(r.u)}</b>${r.title ? `<small style="color:#e8c469">‹${esc(r.title)}›</small>` : ''}</div><span>${r.v}${r.on ? ' <span style="color:#7bd68f" title="online">●</span>' : ''}</span></div>`).join('') : '<i>Ninguém ainda.</i>';
        if (rankData.me && rankData.me.pos > 20) h += `<div class="hub-row done"><b style="width:28px">#${rankData.me.pos}</b><div class="g"><b>${esc(currentUser)}</b> (você)</div><span>${rankData.me.v}</span></div>`;
        return h + '<div style="font-size:.68rem;opacity:.6;margin-top:6px">Atualiza a cada 30 segundos, com base nos personagens salvos.</div>';
    }

    /* ---------- mercado ---------- */
    let mailN = 0;
    async function mkCall(b) { try { const r = await api('/market', b); if (r && r._status === 404) { noMarket = true; return { error: 'O Mercado está indisponível no momento.', _net: true }; } return r; } catch (e) { return { error: 'Sem conexão.', _net: true }; } }
    async function loadMarket() { if (!online()) return; const r = await mkCall({ a: 'browse', q: mkQ }); if (r && r.ok) { mkData = r; mailN = r.mail | 0; if (open && tab === 'market') render(true); } }
    const coins = () => getInvCount('Coins'), fn = (n) => (window.fmtNum ? fmtNum(n) : String(n));
    function marketHtml() {
        const S = [['buy', 'Comprar'], ['sell', 'Vender'], ['mine', 'Meus anúncios']];
        let h = `<div class="hub-tabs">${S.map((t) => `<b data-sub="${t[0]}" class="${sub === t[0] ? 'on' : ''}">${t[1]}${t[0] === 'mine' && mkData && mkData.mine.length ? ' (' + mkData.mine.length + ')' : ''}</b>`).join('')}<span style="margin-left:auto;font-size:.76rem;align-self:center">Você tem ${ic('Coins', 18)} <b>${fn(coins())}</b></span></div>`;
        if (!online()) return h + '<i>O Mercado só fica disponível online.</i>';
        if (mailN) h += `<div class="hub-row done"><div class="g">📬 Você tem <b>${mailN}</b> item(ns) no correio. Eles chegam à mochila sozinhos (precisa de espaço).</div></div>`;
        if (!mkData) return h + '<i>Carregando...</i>';
        if (sub === 'buy') {
            h += `<input class="hub-in" id="mk-q" placeholder="Buscar item..." value="${esc(mkQ)}" style="margin-bottom:4px">`;
            h += mkData.listings.length ? mkData.listings.map((l) => `<div class="hub-row">${ic(l.item, 30)}<div class="g"><b>${esc(l.item)}</b> ×${fn(l.qty)}<small>${l.qty > 1 ? fn(Math.round(l.price / l.qty * 100) / 100) + ' cada · ' : ''}vendedor: ${esc(l.seller)}</small></div><button class="hb go" data-buy="${esc(l.id)}" data-price="${l.price}" data-lq="${l.qty}" ${l.seller === currentUser || coins() < (l.qty > 1 && window.Qty ? (Qty.mktCost(l.price, l.qty, 1) || l.price) : l.price) ? 'disabled' : ''}>${l.qty > 1 && window.Qty ? 'Comprar…' : fn(l.price)} ${l.seller === currentUser ? '(seu)' : ''}</button></div>`).join('') : '<i>Nenhum anúncio.</i>';
        } else if (sub === 'sell') {
            const inv = {}; player.inventory.forEach((i) => { if (i.name !== 'Coins' && Net.tradable(i.name)) inv[i.name] = (inv[i.name] || 0) + (i.qty || 1); });
            const names = Object.keys(inv); if (sellSel && !inv[sellSel.name]) sellSel = null;
            h += `<div style="font-size:.76rem;margin-bottom:4px">Escolha o item. Taxa de 5% sobre o preço. Anúncios duram 3 dias (depois o item volta pelo correio).</div><div class="hub-grid" style="margin-bottom:6px">${names.map((n) => `<div class="hub-cell ${sellSel && sellSel.name === n ? 'on' : ''}" data-sel="${esc(n)}">${ic(n, 26)}<br>${esc(n)}<br><small>×${fn(inv[n])}</small></div>`).join('') || '<i>Mochila sem itens vendáveis.</i>'}</div>`;
            if (sellSel) { const mx = inv[sellSel.name]; h += `<div class="hub-row"><div class="g"><b>${esc(sellSel.name)}</b><div style="display:flex;gap:6px;margin-top:4px"><label style="flex:1">Quantidade (máx ${fn(mx)})<input class="hub-in" id="mk-qty" type="number" min="1" max="${mx}" value="${Math.min(sellSel.qty || 1, mx)}"></label><label style="flex:1">Preço total<input class="hub-in" id="mk-price" type="number" min="1" max="2147483647" value="${sellSel.price || ''}"></label></div><small id="mk-net"></small></div><button class="hb go" data-list="1">Anunciar</button></div>`; }
        } else {
            h += mkData.mine.length ? mkData.mine.map((l) => `<div class="hub-row">${ic(l.item, 30)}<div class="g"><b>${esc(l.item)}</b> ×${fn(l.qty)}<small>${fn(l.price)} moedas · expira em ${fmtMs(l.exp - Date.now())}</small></div><button class="hb" data-cancel="${esc(l.id)}">Retirar</button></div>`).join('') : '<i>Você não tem anúncios.</i>';
        }
        return h;
    }
    /* salvar e CONFIRMAR: devolve true só se o servidor gravou (o mercado só age sobre o que o save já trouxe). Espera um 429 curto passar. */
    async function saveConfirmed() { try { return (await saveDataNow(false, { wait: true })) === true; } catch (e) { return false; } }
    function saveFailText(tail) { const st = window.saveStatus ? saveStatus() : {}; return (st.why === 'LOCKED' ? st.msg + ' ' : st.why === 'RATE' ? 'Salvando rápido demais, tente de novo em instantes. ' : 'Sem conexão. Tente novamente em instantes. ') + tail; }
    /* chamada de 2ª fase (criar/comprar): se o servidor ainda não viu o pendente salvo ("Salvamento pendente"), salva de novo e repete UMA vez */
    async function mkPending(body) {
        let r = await mkCall(body);
        if (r && !r._net && typeof r.error === 'string' && (r.code === 'PENDING' || /^(Salvamento pendente|Guardando o seu progresso)/.test(r.error))) {
            if (!(await saveConfirmed())) return { error: 'Guardando o seu progresso. Tente de novo em instantes.', _wait: true };
            r = await mkCall(body);
        }
        return r;
    }
    let mkBusy = false;
    async function doList() {
        if (mkBusy) return; const q = Math.floor(Number(($('mk-qty') || {}).value)), pr = Math.floor(Number(($('mk-price') || {}).value)), name = sellSel && sellSel.name;
        if (!name || !(q >= 1) || !(pr >= 1) || pr > 2147483647) return note('Confira quantidade e preço.', '#e74c3c'); if (!Net.tradable(name) || getInvCount(name) < q) return note('Você não tem esse item.', '#e74c3c');
        if (player.mkt && (player.mkt.create || player.mkt.buy)) return note('Aguarde a operação anterior terminar.', '#e74c3c');
        mkBusy = true; try {
            const inv = JSON.stringify(player.inventory); removeInvItem(name, q); player.mkt = { create: { item: name, qty: q, price: pr, nonce: nonce() } }; updateUI();
            if (!(await saveConfirmed())) { player.inventory = JSON.parse(inv); player.mkt = null; updateUI(); return note(saveFailText('Nada foi anunciado.'), '#e74c3c'); }
            await finishPending(); sellSel = null; await loadMarket();
        } finally { mkBusy = false; }
    }
    // compra em quantidade: abre o seletor (máximo = o que cabe nas moedas, no estoque do anúncio e na mochila)
    function askBuy(id) {
        const l = mkData && mkData.listings.find((x) => x.id === id); if (!l || !window.Qty) return;
        if (l.seller === currentUser) return note('Esse anúncio é seu.', '#e74c3c');
        const cap = Qty.capacity(l.item), c = coins(); let byCoins = 0;
        let lo = 1, hi = l.qty; while (lo <= hi) { const mid = Math.floor((lo + hi) / 2), cs = Qty.mktCost(l.price, l.qty, mid); if (cs !== null && cs <= c) { byCoins = mid; lo = mid + 1; } else hi = mid - 1; }
        if (byCoins < 1) return note('Moedas insuficientes.', '#e74c3c');
        if (cap < 1) return note('Mochila cheia: libere espaço para comprar.', '#e74c3c');
        const max = Math.min(l.qty, byCoins, cap);
        const canPart = Qty.mktCost(l.price, l.qty, 1) !== null;   // preço 1 não dá para dividir: só o lote inteiro
        if (!canPart) { if (c < l.price) return note('Moedas insuficientes.', '#e74c3c'); return doBuy(l.id, l.price, l.qty); }
        Qty.pick({ title: 'Comprar no mercado', name: l.item, max, limits: [['suas moedas', byCoins], ['estoque do anúncio', l.qty], ['espaço na mochila', cap]], cost: (q) => Qty.mktCost(l.price, l.qty, q) || 0, currency: 'moedas', okLabel: 'Comprar', confirmFrom: 100,
            sub: (q) => (l.qty > 1 ? fn(Math.round(Qty.mktCost(l.price, l.qty, q) / q * 100) / 100) + ' cada · ' : '') + 'estoque ' + fn(l.qty) + ' · vendedor: ' + l.seller, onOk: async (q) => { await doBuy(l.id, Qty.mktCost(l.price, l.qty, q), q); openHub('market'); }, onCancel: () => openHub('market') });
    }
    async function doBuy(id, price, qty) {
        if (mkBusy) return; if (coins() < price) return note('Moedas insuficientes.', '#e74c3c'); if (player.mkt && (player.mkt.create || player.mkt.buy)) return note('Aguarde a operação anterior terminar.', '#e74c3c');
        mkBusy = true; try {
            const inv = JSON.stringify(player.inventory); removeInvItem('Coins', price); player.mkt = { buy: qty ? { id, price, qty, nonce: nonce() } : { id, price, nonce: nonce() } }; updateUI();
            if (!(await saveConfirmed())) { player.inventory = JSON.parse(inv); player.mkt = null; updateUI(); return note(saveFailText('Nada foi comprado.'), '#e74c3c'); }
            await finishPending(); await loadMarket(); await claimMail();
        } finally { mkBusy = false; }
    }
    function refund(what) { try { if (what.create) { const c = what.create; if (!addInvItem(c.item, c.qty)) dropAt(c.item, c.qty); } if (what.buy) { if (!addInvItem('Coins', what.buy.price)) dropAt('Coins', what.buy.price); } } catch (e) { } }
    function dropAt(item, qty) { try { gameMaps[currentMap].entities.push({ id: newEntId(), type: 'ground_item', item, qty, x: player.x, y: player.y, w: 20, h: 20, active: true, np: 1, life: 9000 }); } catch (e) { } }
    async function finishPending() {   // conclui (ou devolve) uma operação pendente; é seguro repetir
        const p = player.mkt; if (!p || !online()) return;
        if (p.create) {
            const r = await mkPending(Object.assign({ a: 'create' }, p.create));
            if (r && r._wait) return;   // o servidor ainda não tem o pendente salvo: continua pendente e tenta de novo depois (nada é devolvido nem duplicado)
            if (r && r.ok) { player.mkt = null; note('Anúncio publicado!', '#2ecc71'); sfxp('coin'); await saveConfirmed(); }
            else if (r && !r._net && r._status < 500 && r._status !== 429 && r._status !== 401) { refund(p); player.mkt = null; note(r.error || 'Não foi possível anunciar. Item devolvido.', '#e74c3c'); updateUI(); await saveConfirmed(); }
        } else if (p.buy) {
            const r = await mkPending(p.buy.qty ? { a: 'buy', id: p.buy.id, nonce: p.buy.nonce, qty: p.buy.qty, cost: p.buy.price } : { a: 'buy', id: p.buy.id, nonce: p.buy.nonce, cost: p.buy.price });
            if (r && r._wait) return;
            if (r && r.ok) { player.mkt = null; note('Compra feita! ' + (r.qty > 1 ? 'Os ' + r.qty + ' itens chegam' : 'O item chega') + ' pelo correio.', '#2ecc71'); sfxp('pickup'); await saveConfirmed(); }
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
                if (!itemDB[e.item]) continue;
                if (!(window.Mimic && Mimic.takeMail && Mimic.takeMail(e.item)) && !addInvItem(e.item, e.qty)) continue;   // sem espaço: tenta de novo depois (Mímico repetido vira XP em Mimic.takeMail)
                player.mailDone.push(e.id); ack.push(e.id); got.push(e); changed = true;
            }
            if (player.mailDone.length > 200) player.mailDone.splice(0, player.mailDone.length - 200);
            if (changed) { updateUI(); if (!(await saveConfirmed())) return; }   // só confirma ao servidor depois de salvar
            if (ack.length) await mkCall({ a: 'ack', ids: ack });
            got.forEach((e) => { try { addPickupText(e.item, e.qty); if (/^Venda/.test(e.why)) Life.cnt('sold'); } catch (er) { } if (/^Venda/.test(e.why)) note(e.why, '#f1c40f'); else if (/^Missão especial/.test(e.why)) { note('Recompensa da missão: ' + itemLabel(e.item) + ' x ' + fn(e.qty), '#2ecc71'); try { Sfx.play('quest'); } catch (er) { } } else if (/^Presente/.test(e.why)) { { const _x = String(e.why).replace(/^Presente( do administrador)?:?\s*/, ''); note('Você recebeu um presente: ' + itemLabel(e.item) + ' x ' + fn(e.qty) + (_x ? ' \u2014 "' + _x + '"' : ''), '#2ecc71'); } try { Sfx.play('quest'); } catch (er) { } } });
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
            <small>Recursos: ${tr} árvores, ${rk} rochas, ${fs} pontos de pesca</small>${ports.length ? `<small>Portais para: ${[...new Set(ports)].map(esc).join(', ')}</small>` : ''}${edgeNames(id)}</div></div>`;
    }
    function edgeNames(id) { const e = ((gameMaps[id] && gameMaps[id].edges) || []).filter((q) => gameMaps[q.to]); if (!e.length) return ''; const L = { n: 'norte', s: 'sul', e: 'leste', w: 'oeste' }; return `<small>Saídas: ${e.map((q) => esc(gameMaps[q.to].name || q.to) + ' (' + L[q.d] + ')').join(', ')}</small>`; }
    /* Posições do mapa-múndi (x: leste+, y: sul+). Lumbridge no centro; leste = Vila Real/deserto; norte = serra e gelo; oeste = floresta élfica;
       sul = pântano (e a costa a oeste do Vale do Rio); sudeste = cemitério, fortaleza, vulcão e dragão. Mapas que não estão aqui usam gridX/gridY (se livres) ou ficam perto de quem se liga a eles. */
    const WM_POS = {
        lumbridge: [0, 0], floresta: [-1, 0], trilha_elfica: [-2, 0], silvaluz: [-3, 0], torre_mago: [-4, 0],
        covil: [0, -1], mina: [1, 0], trilha_serra: [1, -1], pedralta: [1, -2], mina_abandonada: [1, -3], passo_gelado: [2, -2], vale_gelado: [3, -2],
        campos: [1, 1], estrada_rei: [2, 1], vila_real: [3, 1], estrada_areias: [4, 1], deserto: [5, 1], oasis: [6, 1], ruinas: [7, 1],
        rio: [0, 1], pantano: [0, 2], covil_goblins: [0, 3], estrada_costa: [-1, 1], porto_mares: [-1, 2], praia_naufragios: [-2, 2],
        estrada_sombria: [3, 2], cemiterio: [3, 3], cripta_real: [4, 3], fortaleza: [2, 3], vulcao: [1, 3], ninho_dragao: [1, 4]
    };
    const WM_W = 120, WM_H = 80, WM_G = 8;
    let wmZoom = null, wmThumbs = {};
    function worldIds() { return Object.keys(gameMaps).filter((k) => gameMaps[k] && gameMaps[k].entities && k !== 'casa' && !/^casa_/.test(k)).sort(); }
    function portalsOf(id) { const r = []; ((gameMaps[id] && gameMaps[id].entities) || []).forEach((o) => { if (o && o.type === 'portal' && o.destMap && o.destMap !== id && gameMaps[o.destMap]) r.push(o.destMap); }); (((gameMaps[id] && gameMaps[id].edges) || [])).forEach((e) => { if (e && e.to !== id && gameMaps[e.to]) r.push(e.to); }); return r; }   // portais (entradas de lugares fechados) + saídas pela borda
    function worldLayout() {   // determinístico: cada mapa ganha uma célula própria (sem colisão)
        const ids = worldIds(), cells = {}, used = {}, key = (x, y) => x + ',' + y, isInt = (v) => typeof v === 'number' && isFinite(v) && Math.floor(v) === v && Math.abs(v) < 1000;
        const put = (id, x, y) => { cells[id] = [x, y]; used[key(x, y)] = id; };
        const free = (x, y) => !used[key(x, y)];
        const spiral = (x, y) => { if (free(x, y)) return [x, y]; for (let r = 1; r < 60; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; if (free(x + dx, y + dy)) return [x + dx, y + dy]; } return [x, y + 99]; };
        ids.filter((k) => WM_POS[k]).sort((a, b) => a.localeCompare(b)).forEach((k) => put(k, WM_POS[k][0], WM_POS[k][1]));
        const rest = ids.filter((k) => !cells[k]);
        rest.forEach((k) => { const m = gameMaps[k]; if (isInt(m.gridX) && isInt(m.gridY) && free(m.gridX, m.gridY)) put(k, m.gridX, m.gridY); });
        let pend = rest.filter((k) => !cells[k]), guard = 0;
        while (pend.length && guard++ < 200) {   // perto de um mapa já colocado que se liga a ele (portais nos dois sentidos)
            const next = [];
            pend.forEach((k) => {
                const nb = portalsOf(k).concat(ids.filter((o) => cells[o] && portalsOf(o).includes(k))).filter((o) => cells[o]);
                if (nb.length) { const c = cells[nb[0]], p = spiral(c[0], c[1]); put(k, p[0], p[1]); } else next.push(k);
            });
            if (next.length === pend.length) break; pend = next;
        }
        if (pend.length) { let y1 = -Infinity, x0 = Infinity; Object.values(cells).forEach((c) => { y1 = Math.max(y1, c[1]); x0 = Math.min(x0, c[0]); }); if (!isFinite(y1)) { y1 = -1; x0 = 0; } pend.forEach((k, i) => { const p = spiral(x0 + (i % 6), y1 + 1 + Math.floor(i / 6)); put(k, p[0], p[1]); }); }
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; ids.forEach((k) => { const c = cells[k]; x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); });
        if (!ids.length) { x0 = x1 = y0 = y1 = 0; }
        return { ids, cells, x0, x1, y0, y1 };
    }
    function thumbCached(id) { const m = gameMaps[id], k = id + '|' + ((m.entities || []).length) + '|' + (id === currentMap ? Math.round(player.x / 25) + ',' + Math.round(player.y / 25) : ''); if (!wmThumbs[id] || wmThumbs[id].k !== k) wmThumbs[id] = { k, u: thumb(id) }; return wmThumbs[id].u; }
    function mapHtml() {
        if (!mapSel || !gameMaps[mapSel]) mapSel = currentMap;
        return `<div class="wm-hint" style="font-size:.76rem;margin-bottom:4px">Toque num lugar para ver criaturas, NPCs e recursos. Amarelo = NPC, vermelho = criatura, azul = entrada de masmorra/lugar fechado, linha tracejada = caminho pela borda, ponto branco = você. Arraste para mover; use + / − para aproximar.</div>
        <div class="wm-bar"><button class="hb" data-wz="out" aria-label="Afastar">−</button><button class="hb" data-wz="in" aria-label="Aproximar">+</button><button class="hb" data-wz="fit">Ajustar</button><span id="wm-count" style="margin-left:auto;font-size:.72rem;opacity:.75"></span></div>
        <div id="wm-view"><div id="wm-world"></div></div><div id="wm-info">${mapInfo(mapSel)}</div>`;
    }
    function wmFit(view, L) {
        const cw = (L.x1 - L.x0 + 1) * (WM_W + WM_G) + WM_G, ch = (L.y1 - L.y0 + 1) * (WM_H + WM_G) + WM_G, vw = Math.max(200, view.clientWidth - 4), vh = Math.max(140, view.clientHeight - 4);
        return Math.max(0.45, Math.min(1.6, vw / cw, vh / ch));
    }
    function wmBuild(keepCenter) {
        const view = $('wm-view'), world = $('wm-world'); if (!view || !world) return; const L = worldLayout();
        if (wmZoom == null) wmZoom = wmFit(view, L); wmZoom = Math.max(0.45, Math.min(2.2, wmZoom));
        const old = keepCenter ? { fx: (view.scrollLeft + view.clientWidth / 2) / Math.max(1, world.offsetWidth), fy: (view.scrollTop + view.clientHeight / 2) / Math.max(1, world.offsetHeight) } : null;
        const s = wmZoom, tw = Math.round(WM_W * s), th = Math.round(WM_H * s), g = Math.max(4, Math.round(WM_G * s)), ncol = L.x1 - L.x0 + 1, nrow = L.y1 - L.y0 + 1, W = ncol * (tw + g) + g, H = nrow * (th + g) + g;
        const pos = (id) => ({ x: g + (L.cells[id][0] - L.x0) * (tw + g), y: g + (L.cells[id][1] - L.y0) * (th + g) });
        let lines = '', seen = {};
        L.ids.forEach((a) => portalsOf(a).forEach((b) => { const kk = a < b ? a + '|' + b : b + '|' + a; if (seen[kk] || !L.cells[b]) return; seen[kk] = 1; const p = pos(a), q = pos(b); lines += `<line x1="${p.x + tw / 2}" y1="${p.y + th / 2}" x2="${q.x + tw / 2}" y2="${q.y + th / 2}"/>`; }));
        const fs = Math.max(8, Math.min(13, Math.round(11 * s)));
        world.style.width = W + 'px'; world.style.height = H + 'px';
        world.innerHTML = `<svg width="${W}" height="${H}" class="wm-lines">${lines}</svg>` + L.ids.map((id) => { const p = pos(id), m = gameMaps[id];
            return `<div class="hub-tile wm-tile ${id === currentMap ? 'cur' : ''} ${id === mapSel ? 'sel' : ''}" data-map="${esc(id)}" title="${esc(m.name || id)}" style="left:${p.x}px;top:${p.y}px;width:${tw}px;height:${th}px"><img alt="" draggable="false" src="${thumbCached(id)}"><span style="font-size:${fs}px">${esc(m.name || id)}</span>${id === currentMap ? '<i class="wm-you"></i>' : ''}</div>`; }).join('');
        const cnt = $('wm-count'); if (cnt) cnt.textContent = L.ids.length + ' lugares';
        if (old) { view.scrollLeft = old.fx * W - view.clientWidth / 2; view.scrollTop = old.fy * H - view.clientHeight / 2; }
        else { const cur = world.querySelector('.wm-tile.cur'); if (cur) { view.scrollLeft = Math.max(0, cur.offsetLeft - view.clientWidth / 2 + cur.offsetWidth / 2); view.scrollTop = Math.max(0, cur.offsetTop - view.clientHeight / 2 + cur.offsetHeight / 2); } }
    }
    function wmInit() {   // arrastar com o mouse para mover (no toque a rolagem nativa já funciona); Ctrl+roda aproxima
        const view = $('wm-view'); if (!view || view._wm) return; view._wm = 1; let d = null;
        view.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' || e.button !== 0) return; d = { x: e.clientX, y: e.clientY, sl: view.scrollLeft, st: view.scrollTop, moved: false }; });
        window.addEventListener('pointermove', (e) => { if (!d || !view.isConnected) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; if (!d.moved && Math.hypot(dx, dy) < 5) return; d.moved = true; view.classList.add('drag'); view.scrollLeft = d.sl - dx; view.scrollTop = d.st - dy; });
        window.addEventListener('pointerup', () => { if (d && d.moved) { view._nc = performance.now() + 250; } d = null; view.classList.remove('drag'); });
        view.addEventListener('click', (e) => { if (view._nc && performance.now() < view._nc) { e.stopPropagation(); e.preventDefault(); } }, true);
        view.addEventListener('wheel', (e) => { if (!e.ctrlKey) return; e.preventDefault(); wmZoom = (wmZoom || 1) * (e.deltaY < 0 ? 1.15 : 1 / 1.15); wmBuild(true); }, { passive: false });
    }

    /* ============ eventos ============ */
    function onClick(ev) {
        const t = ev.target.closest('[data-t],[data-sub],[data-claim],[data-title],[data-em],[data-buy],[data-cancel],[data-sel],[data-list],[data-map],[data-wz],[data-close],[data-sqc]'); if (!t) return; const d = t.dataset;
        if (d.close) return closeHub();
        if (d.sqc) return sqClaim(d.sqc);
        if (d.t) { tab = d.t; if (tab === 'market') { loadMarket(); claimMail(); } if (tab === 'rank') loadRank(); if (tab === 'special') loadSpecial(); return render(); }
        if (d.sub) { sub = d.sub; return render(); }
        if (d.claim != null) { Life.claim(+d.claim); return render(); }
        if (d.title != null) { player.title = d.title; try { saveDataLogic(); } catch (e) { } return render(); }
        if (d.em) { if (Life.emote(d.em)) closeHub(); return; }
        if (d.buy && +d.lq > 1 && window.Qty) return askBuy(d.buy);
        if (d.buy) { if (window.ItemSel && !ItemSel.arm('mk:' + d.buy)) { const old = t.textContent; t.textContent = 'Confirmar?'; note('Toque de novo em Confirmar para comprar (' + d.price + ' moedas).', '#f1c40f'); setTimeout(() => { if (t.isConnected && t.textContent === 'Confirmar?') t.textContent = old; }, 4000); return; } return doBuy(d.buy, +d.price); }
        if (d.cancel) return (async () => { const r = await mkCall({ a: 'cancel', id: d.cancel }); note(r.ok ? 'Anúncio retirado. O item volta pelo correio.' : (r.error || 'Erro'), r.ok ? '#2ecc71' : '#e74c3c'); await loadMarket(); await claimMail(); })();
        if (d.sel) { sellSel = { name: d.sel }; return render(); }
        if (d.list) return doList();
        if (d.map) { mapSel = d.map; document.querySelectorAll('#wm-world .wm-tile').forEach((n) => n.classList.toggle('sel', n.dataset.map === mapSel)); const inf = $('wm-info'); if (inf) inf.innerHTML = mapInfo(mapSel); return; }
        if (d.wz) { if (d.wz === 'fit') wmZoom = null; else wmZoom = (wmZoom || 1) * (d.wz === 'in' ? 1.25 : 0.8); return wmBuild(d.wz !== 'fit'); }
    }
    function afterRender() {
        const b = $('hub-body'); if (!b) return;
        const q = $('mk-q'); if (q) q.addEventListener('input', () => { clearTimeout(q._t); q._t = setTimeout(async () => { mkQ = q.value; await loadMarket(); const nq = $('mk-q'); if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); } }, 350); });
        const rs = $('rk-sel'); if (rs) rs.addEventListener('change', () => { rankK = rs.value; rankData = null; render(); loadRank(); });
        const upd = () => { const n = $('mk-net'), pr = Math.floor(Number(($('mk-price') || {}).value)); if (n) n.textContent = pr >= 1 ? 'Você recebe ' + fn(pr - Math.floor(pr * 0.05)) + ' moedas (taxa 5%).' : ''; if (sellSel) { sellSel.qty = Math.floor(Number(($('mk-qty') || {}).value)) || 1; sellSel.price = pr || ''; } };
        ['mk-qty', 'mk-price'].forEach((id) => { const e = $(id); if (e) e.addEventListener('input', upd); }); upd();
        b.querySelectorAll('canvas[data-emc]').forEach((c) => { const g = c.getContext('2d'); g.scale(1.3, 1.3); try { Emotes.draw(g, 15, 30, { k: c.dataset.emc, until: Date.now() + 999999 }); } catch (e) { } });
        if (tab === 'rank' && !rankData) loadRank();
        if (tab === 'special' && !sqData) loadSpecial();
        if (tab === 'map') { wmInit(); wmBuild(false); }
    }

    /* ============ correio e pendências ============ */
    let lastPoll = 0, noMarket = false;
    async function background() {
        if (!ready() || !online() || noMarket) return; const n = Date.now(); if (n - lastPoll < 20000) return; lastPoll = n;
        try { if (!background.sq || n - background.sq > 60000) { background.sq = n; loadSpecial(); } } catch (e) { }
        try { if (player.mkt) await finishPending(); await claimMail(); if (!mkData || open) { /* nada */ } } catch (e) { }
    }
    function wire() { const om = window.openModal; if (typeof om === 'function') window.openModal = function () { const b = $('custom-modal-box'); if (b) { b.style.width = ''; b.style.maxWidth = ''; b.style.boxSizing = ''; b.style.padding = ''; } return om.apply(this, arguments); }; mkBtn(); setInterval(() => { try { tick(); background(); } catch (e) { } }, 1000); }
    window.addEventListener('load', wire);
    window.Hub = { open: openHub, refresh, tick, claimMail, loadMarket };
})();
