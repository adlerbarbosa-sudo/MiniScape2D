/* MiniScape 2D — rede e social: canal WebSocket opcional (cai para HTTP sozinho), grupo (party) e troca entre jogadores.
   A troca é feita em fases com o servidor (ver social.js no servidor): cada lado tira as peças da mochila para um "depósito" salvo no personagem,
   só recebe depois que os dois estiverem prontos, e o depósito volta se algo falhar. Nada some e nada duplica. */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    /* ============================ TRANSPORTE ============================ */
    let ws = null, wsReady = false, everReady = false, failUntil = 0, seq = 0, fails = 0; const pending = new Map();
    function connect() {
        let tok = null; try { tok = authToken; } catch (e) { return; }
        if (ws || !tok || Date.now() < failUntil || location.protocol === 'file:' || typeof WebSocket === 'undefined') return;
        try {
            const w = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'); ws = w;
            w.onopen = () => w.send(JSON.stringify({ t: 'auth', token: tok }));
            w.onmessage = (e) => {
                let m; try { m = JSON.parse(e.data); } catch (x) { return; }
                if (m.t === 'auth') { wsReady = !!m.ok; if (m.ok) everReady = true; else failUntil = Date.now() + 30000; return; }
                const p = pending.get(m.i); if (p) { pending.delete(m.i); clearTimeout(p.to); p.res(m.d); }
            };
            const drop = () => { if (ws !== w) return; ws = null; wsReady = false; if (!everReady) fails++; failUntil = Date.now() + (everReady ? 1500 : (fails >= 3 ? 1e13 : 60000 * fails)); pending.forEach((p) => { clearTimeout(p.to); p.rej(new Error('ws')); }); pending.clear(); };
            w.onclose = drop; w.onerror = () => { try { w.close(); } catch (x) { } };
        } catch (e) { failUntil = Date.now() + 60000; }
    }
    function wsCall(t, d) {
        return new Promise((res, rej) => {
            const i = ++seq; const to = setTimeout(() => { pending.delete(i); rej(new Error('timeout')); try { ws && ws.close(); } catch (x) { } }, 2500);
            pending.set(i, { res, rej, to }); try { ws.send(JSON.stringify({ t, i, d })); } catch (e) { pending.delete(i); clearTimeout(to); rej(e); }
        });
    }
    async function sync(payload) {
        try { if (player && player.stats) { payload.hp = player.stats.hp; payload.maxHp = player.stats.maxHp; } } catch (e) { }
        if (wsReady) { try { return await wsCall('sync', payload); } catch (e) { throw e; } }
        connect(); return api('/sync', payload);
    }
    async function socialCall(a, extra) {
        const body = Object.assign({ a }, extra || {}); let r;
        if (wsReady) { try { r = await wsCall('social', body); } catch (e) { r = null; } }
        if (!r) r = await api('/social', body);
        if (r && r.social) onState(r.social);
        if (r && r.error) note(r.error, '#e74c3c');
        return r;
    }
    function note(t, c) { try { setActionText(t, c || '#2ecc71'); } catch (e) { } }

    /* ============================ ESTADO SOCIAL ============================ */
    let S = { party: null, invite: null, trade: null }, lastKey = '';
    const busy = {};   // ids de troca que já estão sendo processados neste cliente
    function onSync(data) { if (data && data.social) onState(data.social); try { if (window.Life) Life.onSync(data); } catch (e) { } }
    function onState(s) {
        S = s;
        const key = JSON.stringify(s);
        try { handleTrade(s.trade).catch((e) => console.error('[troca]', e)); } catch (e) { console.error('[troca]', e); }
        if (key === lastKey) return; lastKey = key;
        renderHud();
        if (s.invite && !invSeen[s.invite.from]) { invSeen[s.invite.from] = Date.now(); showInvite(s.invite.from); }
        if (!s.invite) invSeen = {};
        renderTradeUI();
        const m = $('custom-modal-box'); if (m && m.dataset.social === '1' && !s.trade) renderSocialModal();
    }
    let invSeen = {};

    /* ---------- troca: lógica ---------- */
    const INV = () => (typeof INV_SLOTS !== 'undefined' ? INV_SLOTS : 24);
    function hasEnch(name) { return player.inventory.some((i) => i.name === name && (i.ench || i.enchanted)); }
    function tradable(name) { const d = itemDB[name]; return !!d && name !== 'Untradable' && !hasEnch(name); }
    function invCounts() { const m = {}; player.inventory.forEach((i) => { m[i.name] = (m[i.name] || 0) + (i.qty || 1); }); return m; }
    function canCommit(v) {
        const have = invCounts();
        for (const [n, q] of v.mine) if (!tradable(n) || (have[n] || 0) < q) return false;
        for (const [n] of v.theirs) if (!itemDB[n]) return false;
        const sim = player.inventory.map((i) => ({ n: i.name, q: i.qty || 1 }));
        for (const [n, q] of v.mine) { let r = q; for (let k = sim.length - 1; k >= 0 && r > 0; k--) if (sim[k].n === n) { const t = Math.min(r, sim[k].q); sim[k].q -= t; r -= t; } }
        let used = sim.filter((e) => e.q > 0);
        let slots = used.length;
        for (const [n, q] of v.theirs) {
            const st = itemDB[n].stackable; let r = q;
            if (st) { used.forEach((e) => { if (e.n === n && r > 0) { const room = 254 - e.q; const t = Math.min(room, r); e.q += t; r -= t; } }); while (r > 0) { const t = Math.min(254, r); used.push({ n, q: t }); slots++; r -= t; } }
            else { for (let k = 0; k < q; k++) { used.push({ n, q: 1 }); slots++; } }
        }
        return slots <= INV();
    }
    function giveOrDrop(name, qty) {
        if (addInvItem(name, qty)) return;
        try { gameMaps[currentMap].entities.push({ id: newEntId(), type: 'ground_item', item: name, qty, x: player.x + (Math.random() * 30 - 15), y: player.y + 20, w: 20, h: 20, life: 999999, active: true }); note('Mochila cheia: item deixado no chão.', '#f1c40f'); } catch (e) { }
    }
    function returnEscrow() {
        const e = player.escrow; if (!e) return; player.escrow = null;
        (e.items || []).forEach((it) => giveOrDrop(it[0], it[1])); updateUI();
    }
    async function handleTrade(v) {
        const e = player.escrow;
        if (!v) { if (e && !busy['ret']) { busy['ret'] = 1; returnEscrow(); try { await saveDataNow(true); } catch (x) { } delete busy['ret']; note('Troca cancelada: seus itens voltaram.', '#f1c40f'); } return; }
        if (v.st === 'commit' && v.readyMine === null && !busy[v.id]) {
            busy[v.id] = 1;
            let pass = false;
            try { pass = canCommit(v); if (pass) { for (const [n, q] of v.mine) removeInvItem(n, q); player.escrow = { id: v.id, items: v.mine.map((x) => [x[0], x[1]]) }; updateUI(); await saveDataNow(true); } } catch (x) { pass = false; }
            await socialCall('trade_ready', { pass });
        } else if (v.st === 'done' && !v.applied && !busy['ap' + v.id]) {
            busy['ap' + v.id] = 1;
            const done = player.tradeDone || (player.tradeDone = []);
            if (done.indexOf(v.id) < 0) {
                v.theirs.forEach((it) => giveOrDrop(it[0], it[1])); player.escrow = null; done.push(v.id); if (done.length > 20) done.shift();
                updateUI(); try { await saveDataNow(true); } catch (x) { } note('Troca concluída com ' + v.other + '!', '#2ecc71'); try { Sfx && Sfx.play('quest'); } catch (x) { }
            }
            await socialCall('trade_ack'); delete busy['ap' + v.id];
        } else if (v.st === 'cancel' && !v.applied && !busy['cn' + v.id]) {
            busy['cn' + v.id] = 1;
            if (e && e.id === v.id) { returnEscrow(); try { await saveDataNow(true); } catch (x) { } }
            note('Troca cancelada' + (v.why ? ' (' + v.why + ')' : '') + '.', '#f1c40f');
            await socialCall('trade_ack'); delete busy['cn' + v.id];
        }
    }

    /* ============================ INTERFACE ============================ */
    let hud = null, btn = null;
    function place() {
        const c = document.getElementById('gameCanvas'); const r = c ? c.getBoundingClientRect() : { right: window.innerWidth - 20, top: 10 };
        if (btn) { btn.style.left = Math.max(8, r.right - 118) + 'px'; btn.style.top = (r.top + 66) + 'px'; }
        if (hud) { hud.style.left = Math.max(8, r.right - 190) + 'px'; hud.style.top = (r.top + 98) + 'px'; }
    }
    function mkUi() {
        if (btn) return;
        const css = document.createElement('style');
        css.textContent = '.soc-btn{position:fixed;z-index:60;padding:4px 12px;font:700 .78rem serif;color:#f0e2bd;background:linear-gradient(#5a3d1e,#3a2410);border:2px solid #c9a24a;border-radius:8px;cursor:pointer}.soc-hud{position:fixed;z-index:59;width:176px;display:none;background:rgba(30,20,10,.72);border:1px solid #8a6a2a;border-radius:8px;padding:5px 7px;font:.72rem sans-serif;color:#f0e2bd;pointer-events:none}.soc-hud .r{margin:3px 0}.soc-hud .b{height:5px;background:#000a;border-radius:3px;overflow:hidden}.soc-hud .b i{display:block;height:100%;background:linear-gradient(#e0523f,#a12a1e)}.soc-b{background:#3a2a18;color:#f0e2bd;border:1px solid #8a6a2a;border-radius:6px;padding:4px 10px;cursor:pointer;margin:2px;font:inherit}.soc-b:disabled{opacity:.45;cursor:default}.soc-b.ok{border-color:#5ab26a;background:#24452b}.soc-col{flex:1;min-width:0}.soc-it{display:inline-block;margin:2px;padding:2px 6px;background:#0004;border:1px solid #6a4a1a;border-radius:6px;font-size:.78rem}';
        document.head.appendChild(css);
        btn = document.createElement('button'); btn.className = 'soc-btn'; btn.textContent = 'Social'; btn.style.display = 'none'; btn.onclick = openSocial; document.body.appendChild(btn);
        hud = document.createElement('div'); hud.className = 'soc-hud'; document.body.appendChild(hud);
        window.addEventListener('resize', place);
    }
    function renderHud() {
        if (!hud) return; const p = S.party;
        if (!p) { hud.style.display = 'none'; return; }
        hud.style.display = 'block'; place();
        hud.innerHTML = '<div style="font-weight:700;color:#7bd67b">Grupo</div>' + p.members.map((m) => `<div class="r" style="opacity:${m.on ? 1 : .45}">${m.u === p.leader ? '★ ' : ''}${esc(m.u)}<div class="b"><i style="width:${m.maxHp ? Math.round(m.hp / m.maxHp * 100) : 0}%"></i></div></div>`).join('');
    }
    function showInvite(from) {
        openModal(`<h3 style="margin:0 0 8px">Convite de grupo</h3><p><b>${esc(from)}</b> convidou você para um grupo.</p><div style="text-align:right"><button class="soc-b" id="soc-yes">Aceitar</button><button class="soc-b" id="soc-no">Recusar</button></div>`);
        const b = $('custom-modal-box'); if (b) b.dataset.social = '0';
        $('soc-yes').onclick = async () => { closeModal(); await socialCall('party_accept'); }; $('soc-no').onclick = async () => { closeModal(); await socialCall('party_decline'); };
    }
    function nearby() {
        const out = []; try { Object.keys(otherPlayers).forEach((u) => { const o = otherPlayers[u]; if (o && o.map === currentMap) out.push({ u, d: Math.round(Math.hypot((o.x || 0) - player.x, (o.y || 0) - player.y)) }); }); } catch (e) { }
        return out.sort((a, b) => a.d - b.d);
    }
    function renderSocialModal() {
        const p = S.party, me = window.currentUser; const lead = p && p.leader === me;
        let h = `<h3 style="margin:0 0 6px">Social</h3><h4 style="margin:6px 0 2px">Grupo</h4>`;
        if (p) {
            h += p.members.map((m) => `<div style="margin:2px 0">${m.u === p.leader ? '★ ' : ''}<b>${esc(m.u)}</b> <small>${m.on ? 'HP ' + m.hp + '/' + m.maxHp : 'offline'}</small>${lead && m.u !== me ? ` <button class="soc-b" data-kick="${esc(m.u)}">Expulsar</button>` : ''}</div>`).join('') + `<button class="soc-b" id="soc-leave">Sair do grupo</button><div style="font-size:.74rem;opacity:.8">Converse só com o grupo: <b>/g mensagem</b></div>`;
        } else h += `<div style="font-size:.8rem;opacity:.85">Você não está em um grupo. Convide alguém abaixo.</div>`;
        const list = nearby();
        h += `<h4 style="margin:10px 0 2px">Jogadores por perto</h4>` + (list.length ? list.map((o) => `<div style="margin:2px 0"><b>${esc(o.u)}</b> <small>(${o.d}px)</small> <button class="soc-b" data-inv="${esc(o.u)}" ${p && !lead ? 'disabled' : ''}>Convidar</button><button class="soc-b" data-trade="${esc(o.u)}" ${o.d > 300 ? 'disabled' : ''}>Trocar</button></div>`).join('') : `<div style="font-size:.8rem;opacity:.8">Ninguém neste mapa agora.</div>`);
        h += `<div style="text-align:right;margin-top:8px"><button class="soc-b" onclick="closeModal()">Fechar</button></div>`;
        openModal(h); const b = $('custom-modal-box'); if (!b) return; b.dataset.social = '1';
        b.onclick = async (ev) => {
            const t = ev.target.closest('button'); if (!t) return;
            if (t.dataset.inv) { const r = await socialCall('party_invite', { to: t.dataset.inv }); if (r && r.ok) note('Convite enviado a ' + t.dataset.inv + '.'); }
            else if (t.dataset.trade) { const r = await socialCall('trade_request', { to: t.dataset.trade }); if (r && r.ok) { closeModal(); note('Pedido de troca enviado.'); } }
            else if (t.dataset.kick) await socialCall('party_kick', { to: t.dataset.kick });
            else if (t.id === 'soc-leave') await socialCall('party_leave');
        };
    }
    function openSocial() { if (S.trade && (S.trade.st === 'open' || S.trade.st === 'invite')) { tradeKey = ''; renderTradeUI(); return; } renderSocialModal(); }

    /* ---------- janela de troca ---------- */
    let tradeKey = '';
    function renderTradeUI() {
        const v = S.trade; const box = $('custom-modal-box');
        if (!v || (v.st !== 'invite' && v.st !== 'open' && v.st !== 'commit')) { if (tradeKey) { tradeKey = ''; if (box && box.dataset.trade === '1') closeModal(); } return; }
        const key = JSON.stringify(v) + '|' + player.inventory.length; if (key === tradeKey) return; tradeKey = key;
        if (v.st === 'invite') {
            if (v.starter) { openModal(`<h3 style="margin:0 0 8px">Troca</h3><p>Aguardando <b>${esc(v.other)}</b> aceitar...</p><div style="text-align:right"><button class="soc-b" id="tr-cancel">Cancelar</button></div>`); }
            else openModal(`<h3 style="margin:0 0 8px">Pedido de troca</h3><p><b>${esc(v.other)}</b> quer trocar itens com você.</p><div style="text-align:right"><button class="soc-b" id="tr-yes">Aceitar</button><button class="soc-b" id="tr-cancel">Recusar</button></div>`);
            const b = $('custom-modal-box'); b.dataset.trade = '1'; b.dataset.social = '0';
            const y = $('tr-yes'); if (y) y.onclick = () => socialCall('trade_accept'); $('tr-cancel').onclick = () => socialCall('trade_cancel'); return;
        }
        const have = invCounts(); const mineMap = {}; v.mine.forEach((x) => { mineMap[x[0]] = x[1]; });
        const fmt = (a) => a.length ? a.map((x) => `<span class="soc-it">${Icons.html(x[0], 20)} ${esc(x[0])} ×${x[1]}</span>`).join('') : '<i style="opacity:.6">nada</i>';
        const mine = v.mine.map((x) => `<span class="soc-it">${Icons.html(x[0], 20)} ${esc(x[0])} ×${x[1]} <a href="#" data-rm="${esc(x[0])}" style="color:#e0523f">✕</a></span>`).join('') || '<i style="opacity:.6">nada</i>';
        const invHtml = Object.keys(have).filter((n) => tradable(n) && n !== 'Untradable').map((n) => `<button class="soc-b" data-add="${esc(n)}" ${v.st !== 'open' || (mineMap[n] || 0) >= have[n] ? 'disabled' : ''} title="Shift = todos">${Icons.html(n, 20)} ${esc(n)} <small>${have[n] - (mineMap[n] || 0)}</small></button>`).join('');
        openModal(`<h3 style="margin:0 0 6px">Troca com ${esc(v.other)}</h3><div style="display:flex;gap:10px"><div class="soc-col"><b>Você oferece</b><div>${mine}</div>${v.okMine ? '<div style="color:#7bd67b;font-size:.75rem">✔ você confirmou</div>' : ''}</div><div class="soc-col"><b>${esc(v.other)} oferece</b><div>${fmt(v.theirs)}</div>${v.okTheirs ? '<div style="color:#7bd67b;font-size:.75rem">✔ confirmou</div>' : ''}</div></div>
            <h4 style="margin:8px 0 2px">Sua mochila (clique para oferecer 1, Shift para todos)</h4><div style="max-height:26vh;overflow:auto">${invHtml || '<i>vazia</i>'}</div>
            <div style="text-align:right;margin-top:8px">${v.st === 'commit' ? '<i>Concluindo...</i>' : `<button class="soc-b ${v.okMine ? 'ok' : ''}" id="tr-ok">${v.okMine ? 'Desfazer confirmação' : 'Confirmar'}</button>`}<button class="soc-b" id="tr-cancel" ${v.st === 'commit' ? 'disabled' : ''}>Cancelar</button></div><div style="font-size:.7rem;opacity:.7;margin-top:4px">Ao mudar a oferta, as confirmações são zeradas. Itens encantados não podem ser trocados.</div>`);
        const b = $('custom-modal-box'); b.dataset.trade = '1'; b.dataset.social = '0';
        b.onclick = async (ev) => {
            if (v.st !== 'open') return; const rm = ev.target.closest('[data-rm]'); const ad = ev.target.closest('[data-add]');
            if (rm) { ev.preventDefault(); await socialCall('trade_offer', { items: v.mine.filter((x) => x[0] !== rm.dataset.rm) }); }
            else if (ad && !ad.disabled) { const n = ad.dataset.add; const cur = mineMap[n] || 0; const q = ev.shiftKey ? have[n] : cur + 1; const items = v.mine.filter((x) => x[0] !== n).concat([[n, Math.min(q, have[n])]]); if (items.length > 8) { note('No máximo 8 tipos de item.', '#e74c3c'); return; } await socialCall('trade_offer', { items }); }
        };
        const ok = $('tr-ok'); if (ok) ok.onclick = () => socialCall('trade_ok', { v: !v.okMine }); $('tr-cancel').onclick = () => socialCall('trade_cancel');
    }

    /* ============================ LIGAÇÕES ============================ */
    function wire() {
        mkUi();
        setInterval(() => { try { if (btn) btn.style.display = (typeof currentUser !== 'undefined' && currentUser && !isOfflineMode && document.getElementById('game-wrapper').style.display !== 'none') ? '' : 'none'; if (btn && btn.style.display === '') place(); } catch (e) { } }, 700);
    }
    window.addEventListener('load', wire);
    window.Net = { sync, onSync, socialCall, connect, state: () => S, open: () => wsReady, canCommit, tradable, openSocial, _returnEscrow: returnEscrow };
})();
