/* MiniScape 2D — Jornada (interface do engajamento): recompensa diária, missões diárias/semanais, Códice, Maestria e placar do Colosso.
   Toda recompensa é decidida no SERVIDOR (engagesrv.js, /api/engage) e chega pelo correio; aqui só se mostra, se pede e se informa o progresso.
   Também expõe window.Engage = { xpMul, prog, open, refresh } (usado por addXP, pesca, cozinha, forja, coleta) e soma o bônus de Maestria em Stats. */
(function () {
    'use strict';
    const E = window.EngageCore, $ = (id) => document.getElementById(id);
    if (!E) return;
    const ready = () => typeof player !== 'undefined' && player && player.stats && typeof currentUser !== 'undefined' && currentUser && $('game-wrapper') && $('game-wrapper').style.display !== 'none';
    const online = () => typeof isOfflineMode !== 'undefined' && !isOfflineMode && typeof authToken !== 'undefined' && authToken;
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fn = (n) => Number(n || 0).toLocaleString('pt-BR');
    const itemName = (n) => { try { return typeof itemLabel === 'function' ? itemLabel(n) : n; } catch (e) { return n; } };
    const rwText = (r) => [r.coins ? fn(r.coins) + ' moedas' : ''].concat((r.items || []).map((x) => x[1] + '× ' + itemName(x[0]))).filter(Boolean).join(' · ');
    const left = (ms) => { ms = Math.max(0, ms); const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000); return h >= 24 ? Math.floor(h / 24) + 'd ' + (h % 24) + 'h' : h + 'h ' + m + 'min'; };
    const SKN = { hp: 'Vida', combat: 'Corpo a corpo', defence: 'Defesa', ranged: 'Distância', magic: 'Magia', prayer: 'Oração', woodcutting: 'Lenhador', mining: 'Mineração', smithing: 'Ferraria', firemaking: 'Fogueira', cooking: 'Culinária', crafting: 'Fabricação', fishing: 'Pesca', farming: 'Fazenda', alchemy: 'Alquimia', enchanting: 'Encantamento' };
    const MASTERY_SKILLS = Object.keys(SKN);

    let S = null, off = 0, open = false, tab = 'today', busy = false, btn = null, lastFetch = 0;

    async function call(b) { try { return await api('/engage', b); } catch (e) { return { error: 'Sem conexão.', _net: true }; } }
    const note = (t, c) => { try { setActionText(t, c || '#f1c40f'); } catch (e) { } };

    /* ---------- progresso informado pelo jogo (com lote; o servidor limita por minuto) ---------- */
    const buf = {}; let flushT = 0;
    function prog(kind, n) {
        if (!online() || !/^(wood|mine|fish|rare|cook|craft)$/.test(kind)) return; n = Math.max(0, Math.floor(n) || 0); if (!n) return;
        buf[kind] = (buf[kind] || 0) + n; if (!flushT) flushT = setTimeout(flush, 6000);
    }
    async function flush() {
        flushT = 0; if (!online()) return; const ev = {}; let any = false;
        for (const k of Object.keys(buf)) { const n = Math.min(60, buf[k]); if (n > 0) { ev[k] = n; any = true; } buf[k] -= n; if (buf[k] <= 0) delete buf[k]; }
        if (Object.keys(buf).length) flushT = setTimeout(flush, 6000);
        if (any) { await call({ a: 'prog', ev }); lastFetch = 0; }
    }

    /* ---------- estado ---------- */
    async function load(force) {
        if (!online()) return null; const t = Date.now(); if (!force && S && t - lastFetch < 15000) return S; lastFetch = t;
        const r = await call({ a: 'state' }); if (r && r.ok) { S = r; off = r.now - Date.now(); } return S;
    }
    const nowS = () => Date.now() + off;
    function xpMul() { try { return E.xpEventMul(nowS(), S && S.boost ? S.boost.until : 0, S && S.boost ? S.boost.pct : 5); } catch (e) { return 1; } }

    /* ---------- bônus de Maestria em Stats ---------- */
    function masteryLevels() { const o = {}, sk = (player && player.stats && player.stats.skills) || {}; for (const k of MASTERY_SKILLS) if (sk[k]) o[k] = E.mastery(sk[k].xp).lvl; return o; }
    let mb = { atkSpd: 0, moveSpd: 0, total: 0 }, mbT = 0;
    function registerStats() { try { if (window.Stats && Stats.addSource && !Stats.hasSource('mastery')) Stats.addSource('mastery', () => { const t = Date.now(); if (t - mbT > 2000) { mbT = t; try { mb = E.masteryBonus(masteryLevels()); } catch (e) { } } return { atkSpd: mb.atkSpd, moveSpd: mb.moveSpd }; }); } catch (e) { } }

    /* ---------- tela ---------- */
    function css() {
        if ($('eng-css')) return; const s = document.createElement('style'); s.id = 'eng-css'; s.textContent = `
        .eng-btn{position:fixed;z-index:60;padding:4px 12px;font:700 .78rem serif;color:#f0e2bd;background:linear-gradient(#2f5a3a,#1c3a24);border:2px solid #7bd68f;border-radius:8px;cursor:pointer;display:none}
        .eng-btn i{position:absolute;top:-7px;right:-7px;min-width:16px;height:16px;border-radius:8px;background:#d6301f;color:#fff;font:700 .62rem sans-serif;line-height:16px;text-align:center;font-style:normal;border:1px solid #fff5}
        #eng-box{width:100%;max-height:88vh;max-height:88dvh;overflow:auto;color:#f0e2bd;font-family:sans-serif}#eng-box h3{margin:0 0 6px;font-family:serif;color:#e8c469}#eng-box h4{margin:10px 0 4px;color:#e8c469;font-family:serif;font-size:.9rem}
        .eng-days{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin:6px 0}.eng-day{padding:4px 2px;border-radius:6px;background:#ffffff0d;border:1px solid #e8c46933;text-align:center;font-size:.62rem}.eng-day.on{border-color:#7bd68f;background:#3f9a5833}.eng-day.past{opacity:.5}.eng-day b{display:block;font-size:.72rem}`;
        document.head.appendChild(s);
    }
    function place() {   // abaixo do botão Diário (Diário, Social e a estrela da árvore ocupam a linha de cima)
        if (!btn) return; const h = document.querySelector('.hub-btn'), hr = h && h.offsetWidth ? h.getBoundingClientRect() : null, c = $('gameCanvas'), r = c ? c.getBoundingClientRect() : { right: window.innerWidth - 20, top: 10 };
        const left = hr ? hr.left : r.right - 208, top = hr ? hr.bottom + 6 : r.top + 100;
        btn.style.left = Math.max(8, Math.min(window.innerWidth - 90, left)) + 'px'; btn.style.top = Math.max(8, Math.min(window.innerHeight - 40, top)) + 'px';
    }
    function badge() {
        if (!S) return 0; let n = S.daily && !S.daily.claimed ? 1 : 0;
        for (const p of ['d', 'w']) { const Q = S.quests[p]; (Q.list || []).forEach((q) => { if (q.p >= q.need && !q.done) n++; }); if (Q.list.length && Q.list.every((q) => q.done) && !Q.bonus) n++; }
        if (S.board && S.board.prev && S.board.prev.mine > 0 && !S.board.prev.claimed) n++;
        return n;
    }
    function tick() {
        if (!btn) return; const on = ready() && online(); btn.style.display = on ? 'block' : 'none'; if (!on) return; place();
        if (!S && !tick._f) { tick._f = 1; load(true).then(() => { tick._f = 0; }); }
        const n = badge(), b = btn.querySelector('i'); b.style.display = n ? '' : 'none'; b.textContent = n;
        if (open && !$('eng-box')) open = false; if (open && Date.now() - lastFetch > 30000) refresh(true);
    }
    const bar = (p, n) => '<div class="hub-bar"><i style="width:' + Math.max(0, Math.min(100, n ? p / n * 100 : 0)) + '%"></i></div>';
    const TABS = [['today', 'Hoje'], ['codex', 'Códice'], ['mastery', 'Maestria'], ['colossus', 'Colosso']];

    function viewToday() {
        const d = S.daily, ev = (S.events || []).map((e) => '<div class="hub-row done"><div class="g"><b>' + esc(e.name) + '</b><small>' + esc(e.desc) + '</small></div></div>').join('');
        const boost = S.boost && S.boost.until > nowS() ? '<div class="hub-row done"><div class="g"><b>Impulso de XP +' + S.boost.pct + '%</b><small>Termina em ' + left(S.boost.until - nowS()) + '</small></div></div>' : '';
        let h = ev + boost + '<h4>Recompensa diária ' + (d.streak ? '· sequência de ' + d.streak + ' dia(s)' : '') + '</h4><div class="eng-days">' + d.preview.map((r, i) => '<div class="eng-day ' + (i + 1 === d.next ? 'on' : (i + 1 < d.next || (d.claimed && i + 1 <= d.next) ? 'past' : '')) + '"><b>Dia ' + (i + 1) + '</b>' + esc(rwText(r) || (r.boost ? 'Impulso' : '')) + (r.boost ? '<br>+' + r.boost.pct + '% XP' : '') + '</div>').join('') + '</div>';
        h += '<div class="hub-row"><div class="g">' + (d.claimed ? 'Já recebida hoje. Próxima em ' + left(d.msLeft) + '.' : '<b>Dia ' + d.next + ':</b> ' + esc(rwText(d.preview[d.next - 1]))) + '<small>Chega pelo correio (aba Mercado do Diário).</small></div><button class="hb go" data-e="daily" ' + (d.claimed ? 'disabled' : '') + '>Receber</button></div>';
        for (const p of ['d', 'w']) {
            const Q = S.quests[p], bonus = p === 'd' ? S.quests.bonusD : S.quests.bonusW, all = Q.list.length && Q.list.every((q) => q.done);
            h += '<h4>' + (p === 'd' ? 'Missões diárias · reinicia em ' + left(S.quests.dLeft) : 'Missões semanais · reinicia em ' + left(S.quests.wLeft)) + '</h4>';
            h += Q.list.map((q) => { const ok = q.p >= q.need; return '<div class="hub-row ' + (q.done ? 'done' : '') + '"><div class="g"><b>' + esc(q.name) + '</b> <small style="display:inline">(' + fn(Math.min(q.p, q.need)) + '/' + fn(q.need) + ')</small><small>' + esc(rwText({ coins: q.c, items: q.item ? [q.item] : [] })) + ' · +' + fn(q.xp) + ' XP de ' + esc(SKN[q.xs] || q.xs) + '</small>' + bar(q.p, q.need) + '</div><button class="hb go" data-e="qclaim" data-q="' + esc(q.id) + '" ' + (q.done || !ok ? 'disabled' : '') + '>' + (q.done ? 'Recebida' : 'Receber') + '</button></div>'; }).join('');
            h += '<div class="hub-row ' + (Q.bonus ? 'done' : '') + '"><div class="g"><b>Bônus por concluir todas</b><small>' + esc(rwText(bonus)) + '</small></div><button class="hb go" data-e="qbonus" data-k="' + p + '" ' + (Q.bonus || !all ? 'disabled' : '') + '>' + (Q.bonus ? 'Recebido' : 'Receber') + '</button></div>';
        }
        return h;
    }
    function viewCodex() {
        const c = S.codex, kills = Object.values(c.kills).reduce((a, b) => a + b, 0), cnt = { maps: c.maps.length, species: Object.keys(c.kills).length, bosses: Object.keys(c.bosses).length, kills };
        let h = '<div class="hub-row"><div class="g">Mapas visitados <b>' + cnt.maps + '/' + c.mapsTotal + '</b> · Espécies <b>' + cnt.species + '</b> · Chefes <b>' + cnt.bosses + '</b> · Abates <b>' + fn(kills) + '</b></div></div>';
        h += '<h4>Marcos</h4>' + E.MS.map((m) => { const need = m.k === 'maps' && m.need === 0 ? c.mapsTotal : m.need, have = cnt[m.k], done = !!c.claimed[m.id], ok = need > 0 && have >= need; return '<div class="hub-row ' + (done ? 'done' : ok ? '' : 'lock') + '"><div class="g"><b>' + esc(m.name) + '</b><small>' + esc(m.desc) + ' · ' + esc(rwText(m)) + '</small>' + bar(have, need) + '</div><button class="hb go" data-e="mclaim" data-id="' + m.id + '" ' + (done || !ok ? 'disabled' : '') + '>' + (done ? 'Recebido' : 'Receber') + '</button></div>'; }).join('');
        const sp = Object.keys(c.kills).filter((k) => c.kills[k] >= 25).sort((a, b) => c.kills[b] - c.kills[a]).slice(0, 12);
        if (sp.length) h += '<h4>Domínio de espécies (' + E.SP_MARK + ' abates = ' + fn(E.SP_REWARD) + ' moedas)</h4>' + sp.map((k) => { const done = !!c.claimed['sk:' + k], ok = c.kills[k] >= E.SP_MARK; return '<div class="hub-row ' + (done ? 'done' : '') + '"><div class="g"><b>' + esc(c.names[k] || k) + '</b> <small style="display:inline">' + fn(c.kills[k]) + '/' + E.SP_MARK + '</small>' + bar(c.kills[k], E.SP_MARK) + '</div><button class="hb go" data-e="mclaim" data-id="sk:' + esc(k) + '" ' + (done || !ok ? 'disabled' : '') + '>' + (done ? 'Recebido' : 'Receber') + '</button></div>'; }).join('');
        return h;
    }
    function viewMastery() {
        const sk = player.stats.skills, lv = masteryLevels(), b = E.masteryBonus(lv);
        let h = '<div class="hub-row"><div class="g">Depois do nível 99 cada habilidade continua evoluindo em <b>Maestria</b> (até ' + E.MASTERY_MAX + ').<small>Bônus atual: +' + b.atkSpd + '% vel. de ataque · +' + b.moveSpd + '% vel. de movimento (somados em seus atributos).</small></div></div>';
        h += MASTERY_SKILLS.filter((k) => sk[k] && sk[k].level >= 99).map((k) => {
            const m = E.mastery(sk[k].xp), marks = E.MASTERY_STEPS.map((n) => { const id = 'ms:' + k + ':' + n, done = S && S.codex.claimed[id], ok = m.lvl >= n; return '<button class="hb go" data-e="mclaim" data-id="' + id + '" ' + (done || !ok ? 'disabled' : '') + '>' + n + (done ? ' ✓' : '') + '</button>'; }).join(' ');
            return '<div class="hub-row"><div class="g"><b>' + esc(SKN[k]) + '</b> · Maestria ' + m.lvl + (E.MASTERY_TITLES[m.lvl] ? ' (' + E.MASTERY_TITLES[m.lvl] + ')' : '') + '<small>' + (m.lvl >= E.MASTERY_MAX ? 'Máximo!' : fn(m.cur) + ' / ' + fn(m.need) + ' XP') + '</small>' + bar(m.cur, m.need || 1) + '</div><div>' + marks + '</div></div>';
        }).join('') || '<div class="hub-row lock"><div class="g">Nenhuma habilidade no nível 99 ainda. Chegue lá para liberar a Maestria e seus marcos (1, 10, 25 e 50).</div></div>';
        return h;
    }
    function viewColossus() {
        const B = S.board, top = B.top || [], prev = B.prev || {};
        let h = '<div class="hub-row"><div class="g">Dano causado a chefes nesta semana. Reinicia em ' + left(B.msLeft) + '.<small>Você: ' + fn(B.me.dmg) + ' de dano' + (B.me.rank ? ' · posição ' + B.me.rank : '') + '</small></div></div>';
        h += '<h4>Top da semana</h4>' + (top.length ? top.map((x, i) => '<div class="hub-row"><div class="g">' + (i + 1) + 'º <b>' + esc(x.u) + '</b></div><div>' + fn(x.dmg) + '</div></div>').join('') : '<div class="hub-row lock"><div class="g">Ninguém bateu em chefes ainda.</div></div>');
        h += '<h4>Semana passada</h4><div class="hub-row"><div class="g">' + (prev.mine > 0 ? 'Seu dano: <b>' + fn(prev.mine) + '</b>' : 'Você não participou.') + '</div><button class="hb go" data-e="lclaim" ' + (prev.mine > 0 && !prev.claimed ? '' : 'disabled') + '>' + (prev.claimed ? 'Recebida' : 'Receber') + '</button></div>';
        return h;
    }
    function render() {
        if (!open) return; const body = !S ? '<div class="hub-row lock"><div class="g">Carregando…</div></div>' : tab === 'codex' ? viewCodex() : tab === 'mastery' ? viewMastery() : tab === 'colossus' ? viewColossus() : viewToday();
        const keep = ($('eng-box') || {}).scrollTop || 0;
        openModal('<div id="eng-box"><h3>Jornada</h3><div class="hub-tabs">' + TABS.map((t) => '<b data-et="' + t[0] + '" class="' + (tab === t[0] ? 'on' : '') + '">' + t[1] + '</b>').join('') + '</div><div>' + body + '</div><div style="text-align:right;margin-top:8px"><button class="hb" data-eclose="1">Fechar (Esc)</button></div></div>');
        const b = $('eng-box'); if (b) b.scrollTop = keep;
    }
    async function refresh(force) { await load(force); render(); }
    function close() { open = false; try { closeModal(); } catch (e) { } }
    async function openUI(t) { if (!ready() || !online()) return; if (t) tab = t; open = true; render(); await load(true); render(); }
    async function onClick(ev) {
        const t = ev.target.closest('[data-e],[data-et],[data-eclose]'); if (!t || !open) return; const d = t.dataset;
        if (d.eclose) return close(); if (d.et) { tab = d.et; return render(); }
        if (busy || t.disabled) return; busy = true;
        try {
            const b = { a: d.e }; if (d.q) b.q = d.q; if (d.k) b.k = d.k; if (d.id) b.id = d.id;
            const r = await call(b);
            if (r && r.ok) {
                let m = 'Recompensa enviada ao correio'; if (r.given && r.given.length) m += ': ' + r.given.map((x) => x[1] + '× ' + itemName(x[0])).join(', ');
                note(m + '.', '#2ecc71');
                if (r.xp && r.xp.n > 0) { try { addXP(r.xp.skill, r.xp.n, true); saveDataLogic(); } catch (e) { } }
                try { if (window.Hub && Hub.claimMail) Hub.claimMail(); } catch (e) { }
            } else note((r && r.error) || 'Não foi possível receber agora.', '#e74c3c');
            await load(true);
        } finally { busy = false; render(); }
    }
    function init() {
        css(); registerStats(); btn = document.createElement('button'); btn.className = 'eng-btn'; btn.innerHTML = 'Jornada<i style="display:none"></i>'; btn.title = 'Jornada: diárias, missões, Códice e Maestria (N)';
        btn.onclick = () => openUI(); document.body.appendChild(btn); window.addEventListener('resize', place);
        document.addEventListener('click', onClick);
        document.addEventListener('keydown', (e) => {
            if (!ready() || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '')) return; const k = e.key.toLowerCase();
            if (k === 'n') { open ? close() : openUI('today'); } else if (k === 'escape' && open) close();
        });
        setInterval(tick, 1000);
    }
    window.Engage = Object.assign({}, window.Engage, { xpMul, prog, open: openUI, refresh, state: () => S });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
