/* MiniScape 2D — FENDAS: masmorra escalonada de 6 andares (5 de monstros + chefe), com nível de dificuldade, modificador semanal e placar semanal.
   O cliente joga a corrida (mapa temporário "fenda", só no seu navegador); o SERVIDOR decide: nível liberado, pontuação, recompensa, limite diário, placar e meta comunitária
   (engagesrv.js, ações rstate/rstart/rend/rclaim em /api/engage). Recompensas chegam pelo correio. Moeda das Fendas: Fragmento de Fenda (reforja de equipamento).
   Durante a corrida o jogador não sincroniza com o mapa (ninguém o vê) e o mapa/derivados de monstro nunca entram no mundo salvo. */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const W = 900, H = 640, FLOORS = 6;
    let run = null;          // corrida atual: { id, lvl, bl, mod, floor, cleared, t0, origin, keys:[npcDB derivados] }
    let ui = null, hud = null, st = null, tab = 'enter', selLvl = 1, busy = false, tickT = 0;

    /* ---------- itens ---------- */
    function merge() {
        const R = window.RIFT_ITEMS || {};
        Object.keys(R).forEach((k) => { if (!itemDB[k]) { itemDB[k] = Object.assign({}, R[k]); try { if (window.Content && Content.mark) Content.mark(); } catch (e) { } } });
        Object.keys(npcDB).forEach((k) => { if (/^rf_/.test(k)) delete npcDB[k]; });   // sobras de uma corrida interrompida nunca vão ao catálogo
    }

    /* ---------- monstros ---------- */
    function pool(target, tiers) {
        const M = (window.Balance && Balance.MOBS) || {}, out = [];
        Object.keys(M).forEach((k) => { const e = M[k]; if (!tiers.includes(e[1]) || !npcDB[k]) return; const d = npcDB[k]; if (d.group === 'npc' || d.behavior === 'npc' || d.behavior === 'passive' || d.behavior === 'skittish') return; out.push({ k, lv: e[0], tier: e[1], gap: Math.abs(e[0] - target) }); });
        out.sort((a, b) => a.gap - b.gap); return out.slice(0, 6);
    }
    function derive(key, lv, tier, mod) {
        const base = npcDB[key]; if (!base) return null; const id = 'rf_' + key + '_' + lv + '_' + tier + '_' + (mod.id || '');
        if (npcDB[id]) return id;
        const s = Balance.mobTable(lv, tier), d = Object.assign({}, base);
        const hp = Math.max(10, Math.round(s.hp * (mod.hp || 1))), dm = mod.dmg || 1;
        d.level = lv; d.tier = tier; d.hp = hp; d.hpBase = hp; d.hpLvl = 0; d.dmin = Math.round(s.dmin * dm); d.dmax = Math.round(s.dmax * dm); d.maxHit = d.dmax; d.hit = s.dmax > 0 ? Math.round(s.avg * dm / 1.2) : 0;
        d.xp = Math.max(1, Math.round(Balance.defaultXp(hp) * 0.6)); d.balV = (Balance.VERSION || 2); d.adm = true; d.behavior = 'aggressive'; d.range = Math.max(Number(d.range) || 0, 260); d.lootStr = ''; d.rift = 1;
        d.name = base.name; d.group = tier === 'boss' ? 'chefe' : (base.group || 'monstro');
        npcDB[id] = d; run.keys.push(id); return id;
    }
    function mobEnt(key, x, y, n) {
        const d = npcDB[key];
        return { id: 'rf' + (n | 0) + '_' + Math.floor(Math.random() * 1e5), type: 'enemy', dbKey: key, name: d.name, x, y, w: d.w || 30, h: d.h || 30, hp: d.hp, maxHp: d.hp, attackCooldown: 0, active: true, rift: 1 };
    }

    /* ---------- mapa do andar ---------- */
    const PAL = [['#2a2438', '#332b45'], ['#1f2f33', '#27393d'], ['#33261f', '#3f2f26'], ['#2b3320', '#343d27'], ['#331f2b', '#402636'], ['#1f2438', '#272d45']];
    function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    function buildFloor(f) {
        const R = rng((run.seedBase + f * 7919) | 0), pal = PAL[(f + run.lvl) % PAL.length], E = [];
        E.push({ id: 'rf_fl0', type: 'paint', name: 'Chão', color: pal[0], x: 0, y: 0, w: W, h: H, active: true }, { id: 'rf_fl1', type: 'paint', name: 'Chão', color: pal[1], x: 60, y: 60, w: W - 120, h: H - 120, active: true });
        for (let i = 0; i < 5; i++) E.push({ id: 'rf_pt' + i, type: 'paint', name: 'Chão', color: 'rgba(160,120,255,.07)', x: Math.round(80 + R() * (W - 260)), y: Math.round(80 + R() * (H - 240)), w: 120 + Math.round(R() * 100), h: 80 + Math.round(R() * 90), active: true });
        const DK = (window.CATALOG && CATALOG.DECOR) || {}, SC = window.SCALE_DECOR || 1.3, D = (kind, x, y) => ({ id: 'rf_d' + x + '_' + y, type: 'decor', kind, name: DK[kind] ? DK[kind].name : kind, x, y, w: Math.round((DK[kind] ? DK[kind].w : 30) * SC), h: Math.round((DK[kind] ? DK[kind].h : 30) * SC), active: true });
        const kinds = ['crystal', 'bones', 'statue']; for (let i = 0; i < 7; i++) { const x = Math.round(90 + R() * (W - 220)), y = Math.round(90 + R() * (H - 340)); E.push(D(kinds[Math.floor(R() * kinds.length)], x, y)); }
        const boss = f === FLOORS, lv = Math.min(95, Math.round(run.bl + f * 1.5)), md = run.mod;
        const n = boss ? 4 : Math.round((4 + f) * (md.more || 1)); const tiers = f >= 4 ? ['common', 'elite'] : ['light', 'common'];
        const P = pool(lv, tiers); if (!P.length) return null;
        for (let i = 0; i < n; i++) { const p = P[Math.floor(R() * P.length)], key = derive(p.k, Math.min(95, lv + (R() < .25 ? 2 : 0)), p.tier === 'light' ? 'common' : p.tier, md); if (!key) continue; const d = npcDB[key]; E.push(mobEnt(key, Math.round(100 + R() * (W - 260)), Math.round(100 + R() * (H - 400)), i)); }
        if (boss) { const B = pool(lv + 8, ['boss']); if (B.length) { const key = derive(B[0].k, Math.min(95, lv + 6), 'boss', md); if (key) E.push(mobEnt(key, W / 2 - 30, 110, 99)); } }
        return { id: 'fenda', name: 'Fenda Instável', tmp: true, env: md.dark ? 'dark' : 'dim', catalogV: 2, width: W, height: H, color: '#120d1c', gridX: null, gridY: null, spawn: { x: W / 2 - 12, y: H - 120 }, entities: E };
    }
    function enter(f) {
        const m = buildFloor(f); if (!m) { setActionText('A Fenda se fechou… (sem criaturas disponíveis)', '#e74c3c'); return false; }
        gameMaps.fenda = m; run.floor = f; run.floorT = Date.now(); run.nextShown = false;
        switchMap('fenda', m.spawn.x, m.spawn.y); try { saveDataLogic(); } catch (e) { }
        setActionText(f === FLOORS ? 'Andar final: o guardião da Fenda!' : 'Andar ' + f + ' de ' + FLOORS, '#b07aff'); return true;
    }

    /* ---------- fluxo da corrida ---------- */
    async function begin(lvl) {
        if (busy || run) return; busy = true;
        try {
            const r = await api('/engage', { a: 'rstart', lvl });
            if (!r || !r.ok) { setActionText((r && r.error) || 'Não foi possível abrir a Fenda agora.', '#e74c3c'); return; }
            run = { id: r.id, lvl: r.lvl, bl: r.bl, mod: r.mod, floor: 0, cleared: 0, t0: Date.now(), keys: [], seedBase: (Date.now() ^ (Math.random() * 1e9)) | 0, origin: { m: currentMap, x: Math.round(player.x), y: Math.round(player.y + 70) } };
            if (!run.origin.m || run.origin.m === 'fenda') run.origin = { m: 'lumbridge', x: 400, y: 300 };
            player.rift = Object.assign({}, player.rift || {}, { o: run.origin, run: 1 }); closePanel(); pendingCombatLogs.length = 0;
            if (!enter(1)) { run = null; player.rift.run = 0; }
        } catch (e) { setActionText('Sem conexão com o servidor.', '#e74c3c'); } finally { busy = false; }
    }
    async function finish(cleared) {
        if (!run) return; const r = run; run = null; hideHud();
        try { if (typeof pendingCombatLogs !== 'undefined') pendingCombatLogs.length = 0; } catch (e) { }
        const o = r.origin || { m: 'lumbridge', x: 400, y: 300 };
        if (currentMap === 'fenda') { try { switchMap(gameMaps[o.m] ? o.m : 'lumbridge', o.x, o.y); } catch (e) { } }
        delete gameMaps.fenda; r.keys.forEach((k) => { delete npcDB[k]; }); player.rift = Object.assign({}, player.rift || {}, { o, run: 0 });
        try { player.stats.hp = Math.max(player.stats.hp, Math.round(player.stats.maxHp * 0.5)); } catch (e) { }
        let res = null; try { res = await api('/engage', { a: 'rend', id: r.id, fc: r.cleared, cl: !!cleared }); } catch (e) { }
        try { saveDataLogic(); } catch (e) { }
        resultPanel(r, res, cleared);
    }
    function onTick() {
        if (!run) return;
        if (currentMap !== 'fenda') { finish(false); return; }   // morreu (voltou à vila) ou foi levado para fora
        const m = gameMaps.fenda; if (!m) { finish(false); return; }
        const alive = m.entities.filter((o) => o && o.type === 'enemy' && o.active !== false && o.hp > 0).length;
        hudUpdate(alive);
        if (alive === 0 && !run.nextShown) {
            run.cleared = Math.max(run.cleared, run.floor); run.nextShown = true;
            if (run.floor >= FLOORS) { setActionText('A Fenda foi selada!', '#2ecc71'); setTimeout(() => finish(true), 900); return; }
            m.entities.push({ id: 'rf_next', type: 'rift_next', name: 'Fissura para o próximo andar', x: W / 2 - 32, y: 90, w: 64, h: 64, active: true });
            try { player.stats.hp = Math.min(player.stats.maxHp, player.stats.hp + Math.round(player.stats.maxHp * 0.25)); } catch (e) { }
            setActionText('Andar limpo! Entre na fissura para descer. (+25% de vida)', '#2ecc71');
        }
    }
    let btn = null, btnT = 0;
    function tickBtn() {   // atalho sempre à mão na Vila (o portal também fica no mundo, perto do ponto de partida)
        if (!btn) {
            btn = document.createElement('button'); btn.id = 'rift-btn'; btn.textContent = '🔮 Fenda Instável'; btn.className = 'dev-btn';
            btn.style.cssText = 'position:absolute;left:50%;top:54px;transform:translateX(-50%);z-index:60;display:none;padding:6px 14px;font-weight:700;background:linear-gradient(#4a2f7a,#2a1850);color:#e6d8ff;border:2px solid #8a5ad8;border-radius:8px;cursor:pointer';
            btn.onclick = openPanel; (document.getElementById('game-container') || document.body).appendChild(btn);
        }
        let show = false; try { show = !run && currentMap === 'lumbridge' && !!currentUser && document.getElementById('login-overlay').style.display === 'none'; } catch (e) { }
        btn.style.display = show ? '' : 'none';
    }
    function interact(t) {
        if (!t || t.active === false) return false;
        if (t.type === 'rift_gate') { openPanel(); return true; }
        if (t.type === 'rift_next') { if (run && currentMap === 'fenda') enter(run.floor + 1); return true; }
        return false;
    }

    /* ---------- HUD ---------- */
    function hudUpdate(alive) {
        if (!hud) { hud = document.createElement('div'); hud.id = 'rift-hud'; hud.style.cssText = 'position:absolute;right:56px;top:78px;white-space:nowrap;z-index:55;background:rgba(24,14,40,.88);color:#e6d8ff;border:1px solid #8a5ad8;border-radius:8px;padding:4px 10px;font:12px/1.3 sans-serif;display:none;align-items:center;gap:8px;pointer-events:auto'; (document.getElementById('game-container') || document.body).appendChild(hud); hud.addEventListener('click', (e) => { if (e.target.dataset.leave && run && confirm('Sair da Fenda? Os andares já vencidos contam para a sua pontuação.')) finish(false); }); }
        const s = Math.floor((Date.now() - run.t0) / 1000), mm = Math.floor(s / 60), ss = String(s % 60).padStart(2, '0');
        hud.style.display = 'flex'; hud.innerHTML = '🔮 <b>Fenda nv ' + run.lvl + '</b> · ' + esc(run.mod.n) + ' · Andar <b>' + run.floor + '/' + FLOORS + '</b> · ' + (alive > 0 ? alive + ' inimigo' + (alive > 1 ? 's' : '') : 'limpo') + ' · ' + mm + ':' + ss + ' <button data-leave="1" style="background:#4a2a40;color:#e6d8ff;border:1px solid #8a5a8a;border-radius:5px;padding:1px 7px;cursor:pointer">Sair</button>';
    }
    const hideHud = () => { if (hud) hud.style.display = 'none'; };

    /* ---------- painel (entrada, placar, comunidade) ---------- */
    function css() {
        if ($('rift-css')) return; const s = document.createElement('style'); s.id = 'rift-css';
        s.textContent = '#rift-ui{position:fixed;inset:0;z-index:90;display:none;align-items:center;justify-content:center;background:rgba(5,2,12,.6)}#rift-ui .rf{width:min(460px,94vw);max-height:90vh;overflow:auto;background:linear-gradient(#241638,#150c24);border:2px solid #8a5ad8;border-radius:12px;color:#e6d8ff;font:13px/1.4 sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.7)}' +
            '#rift-ui .rh{display:flex;align-items:center;padding:10px 12px;border-bottom:1px solid #4a3270}#rift-ui .rh b{flex:1;font-size:15px}#rift-ui .rt{display:flex;gap:4px;padding:8px 10px 0}#rift-ui .rt button{flex:1;background:#2e1f48;color:#cdb8f5;border:1px solid #5a3f8a;border-radius:6px 6px 0 0;padding:5px;cursor:pointer}#rift-ui .rt button.on{background:#4a2f7a;color:#fff}' +
            '#rift-ui .rb{padding:10px 12px}#rift-ui button.go{background:linear-gradient(#7a4ad8,#4a2a9a);color:#fff;border:1px solid #b08aff;border-radius:8px;padding:8px 18px;font-weight:700;cursor:pointer}#rift-ui button.go:disabled{opacity:.5}#rift-ui .sm{background:#2e1f48;color:#e6d8ff;border:1px solid #5a3f8a;border-radius:6px;padding:3px 10px;cursor:pointer}#rift-ui .pill{display:inline-block;background:#3a2560;border:1px solid #6a4aa8;border-radius:12px;padding:1px 9px;margin:2px 3px 2px 0;font-size:12px}' +
            '#rift-ui table{width:100%;border-collapse:collapse}#rift-ui td{padding:3px 4px;border-bottom:1px solid #3a2a58}#rift-ui .me td{background:#3a2560}#rift-ui .bar{height:10px;background:#2a1c44;border-radius:5px;overflow:hidden;margin:4px 0}#rift-ui .bar i{display:block;height:100%;background:linear-gradient(90deg,#7a4ad8,#e0b84a)}';
        document.head.appendChild(s);
    }
    const fmtLeft = (ms) => { const d = Math.floor(ms / 86400000), h = Math.floor(ms % 86400000 / 3600000); return d > 0 ? d + 'd ' + h + 'h' : h + 'h ' + Math.floor(ms % 3600000 / 60000) + 'min'; };
    async function refresh() { try { const r = await api('/engage', { a: 'rstate' }); if (r && r.ok) { st = r; selLvl = Math.max(1, Math.min(selLvl, r.maxLvl)); } } catch (e) { } }
    async function openPanel() {
        if (run) return; css(); if (!ui) { ui = document.createElement('div'); ui.id = 'rift-ui'; document.body.appendChild(ui); ui.addEventListener('click', onClick); }
        ui.style.display = 'flex'; ui.innerHTML = '<div class="rf"><div class="rb">Abrindo a Fenda…</div></div>'; await refresh(); render();
    }
    function closePanel() { if (ui) ui.style.display = 'none'; }
    function render(msg) {
        if (!ui || ui.style.display === 'none') return;
        const noSrv = !st && tab !== 'forge'; if (noSrv) tab = 'forge' === tab ? tab : tab;
        const tabs = [['enter', 'Entrar'], ['rank', 'Placar'], ['comm', 'Comunidade'], ['forge', 'Reforja']]; let b = '';
        if (noSrv) b = '<p>Não foi possível falar com o servidor agora. Tente de novo em instantes.</p>';
        else if (tab === 'enter') {
            const left = Math.max(0, st.rewardCap - st.rewarded);
            b = '<p style="margin:0 0 6px">Seis andares: cinco de criaturas e um guardião. Quanto maior o nível, mais forte a Fenda — e maior a pontuação. Você começa no nível 1 e libera o próximo vencendo o atual.</p>' +
                '<div><span class="pill">Esta semana: <b>' + esc(st.mod.n) + '</b></span><span class="pill">' + esc(st.mod.d) + '</span></div>' +
                '<div style="display:flex;align-items:center;gap:8px;margin:10px 0"><button class="sm" data-lv="-1">−</button><b style="font-size:16px">Nível ' + selLvl + '</b><button class="sm" data-lv="1">+</button><span style="opacity:.8">liberado até o nível ' + st.maxLvl + '</span></div>' +
                '<p style="margin:4px 0;opacity:.85">Recompensas (fragmentos e moedas, pelo correio): <b>' + left + '</b> de ' + st.rewardCap + ' corridas restantes hoje. Depois disso você ainda disputa o placar, só sem prêmio — sem pressa, sem grind.</p>' +
                '<p style="text-align:center;margin:12px 0 4px"><button class="go" data-go="1"' + (busy ? ' disabled' : '') + '>Entrar na Fenda</button></p><p style="text-align:center;margin:0;opacity:.7;font-size:12px">Se você cair, a corrida termina e vale o que já venceu.</p>';
        } else if (tab === 'forge') {
            b = window.Reforja ? Reforja.html() : '<p>Reforja indisponível.</p>';
        } else if (tab === 'rank') {
            b = '<p style="margin:0 0 6px;opacity:.85">Placar desta semana (reinicia em ' + fmtLeft(st.left) + '). Pódio ganha prêmios na semana seguinte.</p>';
            if (st.prev) b += '<p style="margin:0 0 8px">🏆 Você ficou em <b>#' + st.prev.pos + '</b> na semana passada. ' + (st.prev.claimed ? '(prêmio resgatado)' : '<button class="sm" data-claim="prize">Resgatar prêmio</button>') + '</p>';
            b += '<table>' + (st.top.length ? st.top.map((r) => '<tr class="' + (st.me && st.me.pos === r.pos ? 'me' : '') + '"><td>#' + r.pos + '</td><td>' + esc(r.u) + '</td><td>nv ' + r.l + '</td><td>' + r.f + '/' + FLOORS + '</td><td style="text-align:right"><b>' + r.s + '</b></td></tr>').join('') : '<tr><td>Ninguém pontuou ainda. Seja o primeiro!</td></tr>') + '</table>';
            if (st.me && st.me.pos > 20) b += '<p style="margin:6px 0 0">Você: #' + st.me.pos + ' · ' + st.me.s + ' pts</p>';
            b += '<p style="margin:8px 0 0;opacity:.7;font-size:12px">Pontos = andares x100 + bônus por selar a Fenda (mais rápido, mais pontos) + nível x40.</p>';
        } else {
            const c = st.comm, pct = Math.min(100, Math.round(c.t / c.goal * 100));
            b = '<p style="margin:0 0 6px">Meta comunitária da semana: todos os andares vencidos por todos os jogadores somam aqui. Bateu a meta, <b>todo mundo que participou</b> resgata um prêmio.</p><div class="bar"><i style="width:' + pct + '%"></i></div><p style="margin:2px 0 8px"><b>' + c.t + '</b> / ' + c.goal + ' andares · sua contribuição: <b>' + c.mine + '</b></p>' +
                (c.claimed ? '<p>✅ Prêmio da semana resgatado.</p>' : c.claimable ? '<button class="go" data-claim="comm">Resgatar prêmio da comunidade</button>' : '<p style="opacity:.8">' + (c.t >= c.goal ? 'Você precisa vencer ao menos um andar nesta semana para participar.' : 'Faltam ' + (c.goal - c.t) + ' andares.') + '</p>') + '<p style="opacity:.7;font-size:12px;margin:8px 0 0">Reinicia em ' + fmtLeft(st.left) + '.</p>';
        }
        ui.innerHTML = '<div class="rf"><div class="rh"><b>🔮 Fenda Instável</b><button class="sm" data-x="1">✕</button></div><div class="rt">' + tabs.map((t) => '<button data-tab="' + t[0] + '" class="' + (tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>').join('') + '</div><div class="rb">' + (msg ? '<p style="color:#ffd27a;margin:0 0 6px">' + esc(msg) + '</p>' : '') + b + '</div></div>';
    }
    async function onClick(e) {
        if (e.target === ui) { closePanel(); return; }
        if (tab === 'forge' && window.Reforja && Reforja.click(e)) { render(); return; }
        const t = e.target.closest('button'); if (!t) return; const d = t.dataset;
        if (d.x) closePanel(); else if (d.tab) { tab = d.tab; await refresh(); render(); } else if (d.lv) { selLvl = Math.max(1, Math.min(st ? st.maxLvl : 1, selLvl + (+d.lv))); render(); } else if (d.go) begin(selLvl);
        else if (d.claim) { try { const r = await api('/engage', { a: 'rclaim', w: d.claim }); if (r && r.ok) { st = r.state || st; render('Prêmio enviado ao seu correio!'); } else render((r && r.error) || 'Não foi possível resgatar.'); } catch (er) { render('Sem conexão.'); } }
    }
    function resultPanel(r, res, cleared) {
        css(); if (!ui) { ui = document.createElement('div'); ui.id = 'rift-ui'; document.body.appendChild(ui); ui.addEventListener('click', onClick); }
        let b;
        if (!res || !res.ok) b = '<p>A corrida terminou, mas o servidor não confirmou o resultado' + (res && res.error ? ' (' + esc(res.error) + ')' : '') + '.</p>';
        else {
            st = res.state || st; try { const pr = (player.rift && typeof player.rift === 'object') ? player.rift : (player.rift = {}); if (res.cleared) pr.clr = (pr.clr | 0) + 1; if (st && st.best > (pr.bl | 0)) pr.bl = st.best; saveDataLogic(); } catch (e) { }
            b = '<p style="font-size:15px;margin:0 0 6px">' + (cleared ? '✨ <b>Fenda selada!</b>' : '💫 Corrida encerrada.') + '</p><p style="margin:2px 0">Andares vencidos: <b>' + res.fc + '/' + FLOORS + '</b> · Nível <b>' + res.lvl + '</b> · Tempo <b>' + Math.floor(res.secs / 60) + ':' + String(res.secs % 60).padStart(2, '0') + '</b></p><p style="margin:2px 0">Pontuação: <b>' + res.score + '</b>' + (res.newBest ? ' <span class="pill">novo recorde da semana!</span>' : '') + '</p>' +
                (res.shards || res.coins ? '<p style="margin:6px 0">🎁 Recompensa enviada ao <b>correio</b>: ' + res.coins + ' moedas e ' + res.shards + ' Fragmento(s) de Fenda.</p>' : res.capped ? '<p style="margin:6px 0;opacity:.85">Você já recebeu as recompensas das ' + st.rewardCap + ' corridas de hoje. A pontuação continua valendo no placar.</p>' : '') + (res.err ? '<p style="color:#ffd27a">' + esc(res.err) + '</p>' : '') +
                (cleared && st && st.best >= r.lvl && r.lvl < 30 ? '<p style="margin:6px 0">🔓 Nível ' + Math.min(30, r.lvl + 1) + ' liberado.</p>' : '');
        }
        ui.style.display = 'flex'; ui.innerHTML = '<div class="rf"><div class="rh"><b>🔮 Resultado da Fenda</b><button class="sm" data-x="1">✕</button></div><div class="rb">' + b + '<p style="text-align:center;margin:10px 0 0"><button class="sm" data-tab="rank">Ver placar</button> <button class="sm" data-x="1">Fechar</button></p></div></div>';
    }

    /* ---------- desenho e mundo ---------- */
    function drawEntity(ctx, o, T) {
        const x = o.x, y = o.y, w = o.w || 60, h = o.h || 80, cx = x + w / 2, cy = y + h / 2, pul = 0.5 + 0.5 * Math.sin(T * 2.2);
        ctx.save();
        const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, Math.max(w, h) * 0.9); g.addColorStop(0, 'rgba(200,160,255,' + (0.55 + 0.25 * pul).toFixed(2) + ')'); g.addColorStop(1, 'rgba(90,40,170,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, Math.max(w, h) * 0.9, 0, 6.3); ctx.fill();
        ctx.fillStyle = '#12081f'; ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.32, h * 0.46, 0, 0, 6.3); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(190,140,255,' + (0.7 + 0.3 * pul).toFixed(2) + ')'; ctx.stroke();
        for (let i = 0; i < 6; i++) { const a = T * 1.5 + i * 1.05; ctx.fillStyle = 'rgba(220,190,255,.8)'; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * w * 0.26, cy + Math.sin(a) * h * 0.36, 2.4, 0, 6.3); ctx.fill(); }
        if (o.type === 'rift_gate') { ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; const t = 'Fenda Instável', tw = ctx.measureText(t).width + 12; ctx.fillStyle = 'rgba(24,14,40,.82)'; ctx.fillRect(cx - tw / 2, y - 20, tw, 16); ctx.fillStyle = '#e6d8ff'; ctx.fillText(t, cx, y - 8); }
        ctx.restore();
    }
    function place(maps) {   // admin: coloca o portal de entrada perto do spawn da vila (uma vez)
        try { if (userRole !== 'admin') return; } catch (e) { return; }
        const lb = maps && maps.lumbridge; if (!lb || !lb.entities) return; if (!lb.c5 || typeof lb.c5 !== 'object') lb.c5 = {}; if (lb.c5.riftgate) return;
        if (lb.entities.some((o) => o && o.type === 'rift_gate')) { lb.c5.riftgate = true; return; }
        const sp = lb.spawn || { x: 400, y: 300 }; let p = null;
        try { p = window.Content && Content.findFree ? Content.findFree(lb, sp.x + 170, sp.y - 130, 70, 90) : null; } catch (e) { }
        if (!p) return; lb.entities.push({ id: 'c5_rift', type: 'rift_gate', name: 'Fenda Instável', x: p.x, y: p.y, w: 70, h: 90, active: true }); lb.c5.riftgate = true; try { Content.mark(); } catch (e) { }
    }
    function onLogin() {
        merge();
        try { if (player.rift && player.rift.run) { const o = player.rift.o; player.rift.run = 0; if (currentMap === 'fenda' || !gameMaps[currentMap]) switchMap(gameMaps[o && o.m] ? o.m : 'lumbridge', (o && o.x) || 400, (o && o.y) || 300); setTimeout(() => setActionText('A Fenda se fechou enquanto você estava fora.', '#b07aff'), 1500); } } catch (e) { }
        if (!tickT) tickT = setInterval(onTick, 400);
        if (!btnT) btnT = setInterval(tickBtn, 500);
    }
    function wire() {
        const oi = window.tryInteract; if (typeof oi === 'function') window.tryInteract = function (t) { if (interact(t)) { player.actionAnim = 15; return; } return oi.apply(this, arguments); };
        merge();
    }
    window.addEventListener('load', wire);
    window.Fendas = { active: () => !!run, open: openPanel, place, onLogin, drawEntity, merge, interact, _state: () => ({ run, st }), FLOORS };
})();
