/* MiniScape 2D — rede e social: canal WebSocket opcional (cai para HTTP sozinho), grupo (party) e troca entre jogadores.
   A troca é feita em fases com o servidor (ver social.js no servidor): cada lado tira as peças da mochila para um "depósito" salvo no personagem,
   só recebe depois que os dois estiverem prontos, e o depósito volta se algo falhar. Nada some e nada duplica. */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    /* ============================ TRANSPORTE ============================ */
    let stopped = false, ws = null, wsReady = false, everReady = false, failUntil = 0, seq = 0, fails = 0; const pending = new Map();
    function connect() {
        let tok = null; try { tok = authToken; } catch (e) { return; }
        if (stopped || ws || !tok || Date.now() < failUntil || location.protocol === 'file:' || typeof WebSocket === 'undefined') return;
        try {
            const w = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'); ws = w;
            w.onopen = () => w.send(JSON.stringify({ t: 'auth', token: tok }));
            w.onmessage = (e) => {
                let m; try { m = JSON.parse(e.data); } catch (x) { return; }
                if (m.t === 'replaced' || (m.t === 'auth' && m.code === 'session_replaced')) { stopped = true; try { window.onSessionReplaced && window.onSessionReplaced(); } catch (x) { } return; }
                if (m.t === 'auth') { wsReady = !!m.ok; if (m.ok) everReady = true; else failUntil = Date.now() + 30000; return; }
                const p = pending.get(m.i); if (p) { pending.delete(m.i); clearTimeout(p.to); p.res(m.d); }
            };
            const drop = () => { if (ws !== w) return; ws = null; wsReady = false; if (!everReady) fails++; failUntil = Date.now() + (everReady ? 1500 : (fails >= 3 ? 1e13 : 60000 * fails)); pending.forEach((p) => { clearTimeout(p.to); p.rej(new Error('ws')); }); pending.clear(); };
            w.onclose = drop; w.onerror = () => { try { w.close(); } catch (x) { } };
        } catch (e) { failUntil = Date.now() + 60000; }
    }
    function stop() { stopped = true; wsReady = false; const w = ws; ws = null; pending.forEach((p) => { clearTimeout(p.to); p.rej(new Error('stopped')); }); pending.clear(); try { w && w.close(); } catch (e) { } }   // sessão derrubada: sem reconexão
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
    async function socialCall(a, extra, quiet) {
        const body = Object.assign({ a }, extra || {}); let r;
        if (wsReady) { try { r = await wsCall('social', body); } catch (e) { r = null; } }
        if (!r) r = await api('/social', body);
        if (r && r.social) onState(r.social);
        if (r && r.error && !quiet) note(r.error, '#e74c3c');
        return r;
    }
    function note(t, c) { try { setActionText(t, c || '#2ecc71'); } catch (e) { } }

    /* ============================ ESTADO SOCIAL ============================ */
    let S = { party: null, invite: null, trade: null }, lastKey = '';
    const busy = {};   // ids de troca que já estão sendo processados neste cliente
    function onSync(data) { if (data && data.social) onState(data.social); try { if (window.Life) Life.onSync(data); } catch (e) { } }
    function onState(s) {
        try { if (s.xp && s.xp.length) { s.xp.forEach((e) => { try { if (window.partyXpGain) window.partyXpGain(e.s, e.x, e.f); } catch (x) { } }); } } catch (e) { }
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
    let invSeen = {}, trQty = '1'; const N = (n) => (window.fmtNum ? fmtNum(n) : n);

    /* ---------- troca: lógica ---------- */
    const INV = () => (typeof INV_SLOTS !== 'undefined' ? INV_SLOTS : 24), SM = () => window.STACK_MAX || 2147483647;
    function hasEnch(name) { return player.inventory.some((i) => i.name === name && (i.ench || i.enchanted)); }
    function tradable(name) { const d = itemDB[name]; return !!d && name !== 'Untradable' && !hasEnch(name) && !d.mimic && !d.mimicBox && !d.mimicSkin; }   // Mímicos são ligados à conta
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
            if (st) { used.forEach((e) => { if (e.n === n && r > 0) { const room = SM() - e.q; const t = Math.min(room, r); e.q += t; r -= t; } }); while (r > 0) { const t = Math.min(SM(), r); used.push({ n, q: t }); slots++; r -= t; } }
            else { for (let k = 0; k < q; k++) { used.push({ n, q: 1 }); slots++; } }
        }
        return slots <= INV();
    }
    function giveOrDrop(name, qty) {
        if (addInvItem(name, qty)) return;
        try { gameMaps[currentMap].entities.push({ id: newEntId(), type: 'ground_item', item: name, qty, x: player.x + (Math.random() * 30 - 15), y: player.y + 20, w: 20, h: 20, life: 999999, active: true, np: 1 }); note('Mochila cheia: item deixado no chão.', '#f1c40f'); } catch (e) { }
    }
    function returnEscrow() {
        const e = player.escrow; if (!e) return; player.escrow = null;
        (e.items || []).forEach((it) => giveOrDrop(it[0], it[1])); updateUI();
    }
    /* salvar e CONFIRMAR (true só se o servidor gravou). O servidor só aceita "pronto"/"confirmado" de uma troca depois de ver o save com o depósito / o recebimento. */
    async function saveOk(tries) {
        for (let k = 0; k < (tries || 2); k++) { let ok = false; try { ok = (await saveDataNow(false, { wait: true })) === true; } catch (x) { } if (ok) return true; const st = window.saveStatus ? saveStatus() : {}; if (st.why === 'LOCKED') return false; await new Promise((r) => setTimeout(r, 900)); }
        return false;
    }
    /* confirmação de recebimento: salva antes; se o servidor ainda disser "Salvamento pendente", salva de novo e repete UMA vez */
    async function ackTrade(needSave) {
        if (needSave && !(await saveOk(2))) return { error: 'Guardando o seu progresso. Tente de novo em instantes.', _nosave: true };
        let r = await socialCall('trade_ack', null, true);
        if (r && typeof r.error === 'string' && (r.code === 'PENDING' || /^(Salvamento pendente|Guardando o seu progresso)/.test(r.error))) { if (!(await saveOk(2))) return r; r = await socialCall('trade_ack', null, true); }
        if (r && r.error && !(r.social && r.social.trade === null)) note(r.error, '#e74c3c');
        return r;
    }
    const retryAt = {};   // id da fase -> quando tentar de novo (evita laço a cada sync se o save/ack falhar)
    async function handleTrade(v) {
        const e = player.escrow;
        if (!v) { if (e && !busy['ret'] && Date.now() >= (retryAt['ret'] || 0)) { busy['ret'] = 1; returnEscrow(); const ok = await saveOk(1); if (!ok) retryAt['ret'] = Date.now() + 8000; delete busy['ret']; note('Troca cancelada: seus itens voltaram.', '#f1c40f'); } return; }
        if (v.st === 'commit' && v.readyMine === null && !busy[v.id]) {
            busy[v.id] = 1;
            let pass = false;
            try {
                pass = canCommit(v);
                if (pass) {
                    for (const [n, q] of v.mine) removeInvItem(n, q); player.escrow = { id: v.id, items: v.mine.map((x) => [x[0], x[1]]) }; updateUI();
                    if (!(await saveOk(2))) { pass = false; returnEscrow(); note('Não deu para salvar a troca agora. Seus itens ficaram com você.', '#e74c3c'); }   // sem depósito salvo o servidor não deixa concluir: devolve já e avisa que não pode
                }
            } catch (x) { pass = false; }
            await socialCall('trade_ready', { pass });
        } else if (v.st === 'done' && !v.applied && !busy['ap' + v.id] && Date.now() >= (retryAt['ap' + v.id] || 0)) {
            busy['ap' + v.id] = 1;
            try {
                const done = player.tradeDone || (player.tradeDone = []); let fresh = false;
                if (done.indexOf(v.id) < 0) {
                    v.theirs.forEach((it) => giveOrDrop(it[0], it[1])); player.escrow = null; done.push(v.id); if (done.length > 20) done.shift(); fresh = true;
                    updateUI(); note('Troca concluída com ' + v.other + '!', '#2ecc71'); try { Sfx && Sfx.play('quest'); } catch (x) { }
                }
                const r = await ackTrade(true);   // salva (com tradeDone) e só então confirma
                if (r && r.error) retryAt['ap' + v.id] = Date.now() + (r._nosave ? 6000 : 3000);
            } finally { delete busy['ap' + v.id]; }
        } else if (v.st === 'cancel' && !v.applied && !busy['cn' + v.id] && Date.now() >= (retryAt['cn' + v.id] || 0)) {
            busy['cn' + v.id] = 1;
            try {
                if (e && e.id === v.id) { returnEscrow(); await saveOk(1); }
                note('Troca cancelada' + (v.why ? ' (' + v.why + ')' : '') + '.', '#f1c40f');
                const r = await ackTrade(false); if (r && r.error) retryAt['cn' + v.id] = Date.now() + 3000;
            } finally { delete busy['cn' + v.id]; }
        }
    }

    /* ============================ INTERFACE ============================ */
    let hud = null, btn = null;
    // XP de grupo: quem causa dano repassa o XP base; juntamos por 1,2 s e mandamos num pedido só
    let _px = {}, _pxT = 0;
    window.partyShareXp = function (sk, x) {
        if (!S.party || S.party.members.length < 2 || !(x > 0)) return; _px[sk] = (_px[sk] || 0) + x;
        if (_pxT) return; _pxT = setTimeout(() => { const o = _px; _px = {}; _pxT = 0; Object.keys(o).forEach((k) => { socialCall('party_xp', { s: k, x: Math.round(o[k]) }, true).catch(() => { }); }); }, 1200);
    };
    function place() {
        const c = document.getElementById('gameCanvas'); const r = c ? c.getBoundingClientRect() : { right: window.innerWidth - 20, top: 10 };
        if (btn) { btn.style.left = Math.max(8, r.right - 118) + 'px'; btn.style.top = (r.top + 66) + 'px'; }
        if (hud) { hud.style.left = Math.max(8, (r.left || 0) + 10) + 'px'; hud.style.top = (r.top + 96) + 'px'; }
    }
    function mkUi() {
        if (btn) return;
        const css = document.createElement('style');
        css.textContent = '.soc-btn{position:fixed;z-index:60;padding:4px 12px;font:700 .78rem serif;color:#f0e2bd;background:linear-gradient(#5a3d1e,#3a2410);border:2px solid #c9a24a;border-radius:8px;cursor:pointer}.soc-hud{position:fixed;z-index:59;width:150px;display:none;background:linear-gradient(#2a1c0e,#1b110a);border:2px solid #c9a24a;border-radius:10px;padding:5px 8px 6px;font:700 .72rem serif;color:#f0e2bd;pointer-events:none;box-shadow:0 2px 8px #0008}.soc-hud .h{display:flex;justify-content:space-between;color:#e8c46a;font-size:.7rem;letter-spacing:.5px;border-bottom:1px solid #6a4a1a;padding-bottom:2px;margin-bottom:3px}.soc-hud .r{margin:4px 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.soc-hud .r small{float:right;font:.62rem sans-serif;opacity:.85}.soc-hud .b{height:6px;margin-top:1px;background:#000a;border:1px solid #000;border-radius:4px;overflow:hidden}.soc-hud .b i{display:block;height:100%;background:linear-gradient(#7be07f,#2f9a3c)}.soc-hud .b i.m{background:linear-gradient(#f2d36a,#c08a1e)}.soc-hud .b i.l{background:linear-gradient(#e0523f,#a12a1e)}.soc-b{background:#3a2a18;color:#f0e2bd;border:1px solid #8a6a2a;border-radius:6px;padding:4px 10px;cursor:pointer;margin:2px;font:inherit}.soc-b:disabled{opacity:.45;cursor:default}.soc-b.ok{border-color:#5ab26a;background:#24452b}.soc-col{flex:1;min-width:0}.soc-it{display:inline-block;margin:2px;padding:2px 6px;background:#0004;border:1px solid #6a4a1a;border-radius:6px;font-size:.78rem}';
        document.head.appendChild(css);
        btn = document.createElement('button'); btn.className = 'soc-btn'; btn.textContent = 'Social'; btn.style.display = 'none'; btn.onclick = openSocial; document.body.appendChild(btn);
        hud = document.createElement('div'); hud.className = 'soc-hud'; document.body.appendChild(hud);
        window.addEventListener('resize', place);
    }
    function renderHud() {
        if (!hud) return; const p = S.party;
        if (!p) { hud.style.display = 'none'; return; }
        hud.style.display = 'block'; place();
        hud.innerHTML = `<div class="h"><span>GRUPO</span><span>${p.members.length}</span></div>` + p.members.map((m) => { const pc = m.maxHp ? Math.max(0, Math.min(100, Math.round(m.hp / m.maxHp * 100))) : 0; return `<div class="r" style="opacity:${m.on ? 1 : .45}">${m.u === p.leader ? '<span style="color:#f1c40f">★</span> ' : ''}${esc(m.u)}<small>${m.on ? m.hp + '/' + m.maxHp : 'off'}</small><div class="b"><i class="${pc < 30 ? 'l' : pc < 60 ? 'm' : ''}" style="width:${pc}%"></i></div></div>`; }).join('');
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
        const fmt = (a) => a.length ? a.map((x) => `<span class="soc-it">${Icons.html(x[0], 20)} ${esc(x[0])} ×${N(x[1])}</span>`).join('') : '<i style="opacity:.6">nada</i>';
        const mine = v.mine.map((x) => `<span class="soc-it">${Icons.html(x[0], 20)} ${esc(x[0])} ×${N(x[1])} <a href="#" data-rm="${esc(x[0])}" style="color:#e0523f">✕</a></span>`).join('') || '<i style="opacity:.6">nada</i>';
        const invHtml = Object.keys(have).filter((n) => tradable(n) && n !== 'Untradable').map((n) => `<button class="soc-b" data-add="${esc(n)}" ${v.st !== 'open' || (mineMap[n] || 0) >= have[n] ? 'disabled' : ''} title="Shift = todos">${Icons.html(n, 20)} ${esc(n)} <small>${N(have[n] - (mineMap[n] || 0))}</small></button>`).join('');
        openModal(`<h3 style="margin:0 0 6px">Troca com ${esc(v.other)}</h3><div style="display:flex;gap:10px"><div class="soc-col"><b>Você oferece</b><div>${mine}</div>${v.okMine ? '<div style="color:#7bd67b;font-size:.75rem">✔ você confirmou</div>' : ''}</div><div class="soc-col"><b>${esc(v.other)} oferece</b><div>${fmt(v.theirs)}</div>${v.okTheirs ? '<div style="color:#7bd67b;font-size:.75rem">✔ confirmou</div>' : ''}</div></div>
            <h4 style="margin:8px 0 2px">Sua mochila (clique para oferecer, Shift para todos)</h4><div style="font-size:.74rem;margin-bottom:4px">Quantidade por clique: <input id="tr-q" type="text" inputmode="numeric" autocomplete="off" maxlength="10" value="${trQty}" style="width:96px;padding:2px 6px;border-radius:6px;border:1px solid #6a4c22;background:#1c1208;color:#f0e2bd"></div><div style="max-height:26vh;overflow:auto">${invHtml || '<i>vazia</i>'}</div>
            <div style="text-align:right;margin-top:8px">${v.st === 'commit' ? '<i>Concluindo...</i>' : `<button class="soc-b ${v.okMine ? 'ok' : ''}" id="tr-ok">${v.okMine ? 'Desfazer confirmação' : 'Confirmar'}</button>`}<button class="soc-b" id="tr-cancel" ${v.st === 'commit' ? 'disabled' : ''}>Cancelar</button></div><div style="font-size:.7rem;opacity:.7;margin-top:4px">Ao mudar a oferta, as confirmações são zeradas. Itens encantados não podem ser trocados.</div>`);
        const b = $('custom-modal-box'); b.dataset.trade = '1'; b.dataset.social = '0';
        b.onclick = async (ev) => {
            if (v.st !== 'open') return; const rm = ev.target.closest('[data-rm]'); const ad = ev.target.closest('[data-add]');
            if (rm) { ev.preventDefault(); await socialCall('trade_offer', { items: v.mine.filter((x) => x[0] !== rm.dataset.rm) }); }
            else if (ad && !ad.disabled) { const n = ad.dataset.add; const cur = mineMap[n] || 0; const step = Math.max(1, Math.floor(Number(String(trQty).replace(/\D/g, ''))) || 1); const q = ev.shiftKey ? have[n] : cur + step; const items = v.mine.filter((x) => x[0] !== n).concat([[n, Math.min(q, have[n], 2147483647)]]); if (items.length > 8) { note('No máximo 8 tipos de item.', '#e74c3c'); return; } await socialCall('trade_offer', { items }); }
        };
        const tq = $('tr-q'); if (tq) tq.addEventListener('input', () => { trQty = tq.value.replace(/\D/g, '').slice(0, 10) || '1'; });
        const ok = $('tr-ok'); if (ok) ok.onclick = () => socialCall('trade_ok', { v: !v.okMine }); $('tr-cancel').onclick = () => socialCall('trade_cancel');
    }

    /* ============================ LIGAÇÕES ============================ */
    function wire() {
        mkUi();
        setInterval(() => { try { if (btn) btn.style.display = (typeof currentUser !== 'undefined' && currentUser && !isOfflineMode && document.getElementById('game-wrapper').style.display !== 'none') ? '' : 'none'; if (btn && btn.style.display === '') place(); } catch (e) { } }, 700);
    }
    window.addEventListener('load', wire);
    window.Net = { stop, sync, onSync, socialCall, connect, state: () => S, open: () => wsReady, canCommit, tradable, openSocial, _returnEscrow: returnEscrow };
})();
