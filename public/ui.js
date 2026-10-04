/* MiniScape 2D — interface: cena do login, Livro de Ofícios, Guia do Aventureiro, diário de missões e dicas. */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const IC = (n) => `<svg class="ic"><use href="#i-${n}"/></svg>`;

    /* ================= CENA ANIMADA DO LOGIN (vila medieval à noite) ================= */
    const scene = (function () {
        const cv = $('login-scene'); if (!cv) return null;
        const g = cv.getContext('2d');
        let W = 0, H = 0, stars = [], flies = [], t0 = performance.now(), run = true;
        function rnd(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
        function resize() {
            const d = Math.min(window.devicePixelRatio || 1, 2);
            W = cv.clientWidth; H = cv.clientHeight; cv.width = W * d; cv.height = H * d; g.setTransform(d, 0, 0, d, 0, 0);
            const r = rnd(7); stars = []; for (let i = 0; i < 90; i++) stars.push({ x: r() * W, y: r() * H * 0.6, s: r() * 1.4 + 0.3, p: r() * 6 });
            flies = []; for (let i = 0; i < 26; i++) flies.push({ x: r() * W, y: H * (0.55 + r() * 0.4), p: r() * 6, sp: 0.2 + r() * 0.5 });
        }
        function ridge(y0, amp, col, seed, step) {
            const r = rnd(seed); g.fillStyle = col; g.beginPath(); g.moveTo(0, H);
            let ph = r() * 10; for (let x = 0; x <= W + step; x += step) { g.lineTo(x, y0 - Math.sin(x * 0.004 + ph) * amp - Math.sin(x * 0.011 + ph * 2) * amp * 0.4); }
            g.lineTo(W, H); g.closePath(); g.fill();
        }
        function tower(x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); const m = w / 5; for (let i = 0; i < 3; i++) g.fillRect(x + i * m * 2, y - m * 0.9, m, m * 0.9); }
        function castle(cx, base, s, col, lit, t) {
            g.fillStyle = col; g.fillRect(cx - 90 * s, base - 70 * s, 180 * s, 70 * s);
            tower(cx - 110 * s, base - 120 * s, 40 * s, 120 * s, col); tower(cx + 70 * s, base - 120 * s, 40 * s, 120 * s, col); tower(cx - 22 * s, base - 150 * s, 44 * s, 150 * s, col);
            g.beginPath(); g.moveTo(cx - 26 * s, base - 150 * s); g.lineTo(cx, base - 190 * s); g.lineTo(cx + 26 * s, base - 150 * s); g.fill();
            g.fillStyle = lit; const w = [[cx - 8 * s, base - 120 * s], [cx - 94 * s, base - 90 * s], [cx + 86 * s, base - 90 * s], [cx - 50 * s, base - 40 * s], [cx + 40 * s, base - 40 * s]];
            w.forEach((p, i) => { g.globalAlpha = 0.75 + Math.sin(t * 2 + i * 1.7) * 0.15; g.fillRect(p[0], p[1], 7 * s, 11 * s); }); g.globalAlpha = 1;
            g.beginPath(); g.arc(cx, base, 16 * s, Math.PI, 0); g.fillStyle = '#05070f'; g.fill();
        }
        function house(x, base, w, h, col, lit, seed, t) {
            g.fillStyle = col; g.fillRect(x, base - h, w, h); g.beginPath(); g.moveTo(x - 6, base - h); g.lineTo(x + w / 2, base - h - w * 0.5); g.lineTo(x + w + 6, base - h); g.closePath(); g.fill();
            g.fillStyle = lit; g.globalAlpha = 0.8 + Math.sin(t * 3 + seed) * 0.1; g.fillRect(x + w * 0.2, base - h * 0.65, w * 0.22, h * 0.28); g.fillRect(x + w * 0.62, base - h * 0.65, w * 0.22, h * 0.28); g.globalAlpha = 1;
        }
        function pine(x, base, h, col) { g.fillStyle = col; for (let i = 0; i < 4; i++) { const yy = base - h * (i * 0.24), ww = h * (0.42 - i * 0.08); g.beginPath(); g.moveTo(x - ww, yy); g.lineTo(x, yy - h * 0.36); g.lineTo(x + ww, yy); g.fill(); } g.fillRect(x - 3, base, 6, h * 0.1); }
        function frame(now) {
            if (!run) return; requestAnimationFrame(frame);
            if ($('login-overlay').style.display === 'none') { run = false; return; }
            if (cv.clientWidth !== W || cv.clientHeight !== H) resize();
            const t = (now - t0) / 1000;
            const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#070b1e'); sky.addColorStop(0.55, '#1a2050'); sky.addColorStop(0.85, '#4a3060'); sky.addColorStop(1, '#8a4a50');
            g.fillStyle = sky; g.fillRect(0, 0, W, H);
            stars.forEach((s) => { g.globalAlpha = 0.4 + Math.sin(t * 1.5 + s.p) * 0.35; g.fillStyle = '#fff'; g.fillRect(s.x, s.y, s.s, s.s); }); g.globalAlpha = 1;
            const mx = W * 0.78, my = H * 0.2, mr = Math.min(W, H) * 0.07;
            const halo = g.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 4); halo.addColorStop(0, 'rgba(255,240,190,.35)'); halo.addColorStop(1, 'rgba(255,240,190,0)'); g.fillStyle = halo; g.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
            g.fillStyle = '#fff3c8'; g.beginPath(); g.arc(mx, my, mr, 0, 7); g.fill(); g.fillStyle = 'rgba(200,170,110,.35)'; g.beginPath(); g.arc(mx - mr * .3, my - mr * .2, mr * .22, 0, 7); g.arc(mx + mr * .25, my + mr * .3, mr * .16, 0, 7); g.fill();
            g.globalAlpha = 0.5; for (let i = 0; i < 3; i++) { const cx = ((t * (8 + i * 4) + i * 400) % (W + 300)) - 150; g.fillStyle = '#3a3a6a'; g.beginPath(); g.ellipse(cx, H * (0.16 + i * 0.09), 90, 16, 0, 0, 7); g.ellipse(cx + 40, H * (0.15 + i * 0.09), 60, 14, 0, 0, 7); g.fill(); } g.globalAlpha = 1;
            ridge(H * 0.62, 34, '#2a2650', 3, 14); castle(W * 0.28, H * 0.66, Math.max(0.7, Math.min(1.3, W / 1100)), '#171a3a', '#ffd070', t);
            ridge(H * 0.72, 26, '#1a1c3a', 5, 12);
            const r = rnd(11); for (let i = 0; i < 9; i++) house(W * (0.42 + i * 0.065) + r() * 14, H * (0.76 + r() * 0.03), 34 + r() * 20, 26 + r() * 16, '#10132c', '#ffc760', i, t);
            ridge(H * 0.82, 20, '#0d0f24', 8, 10);
            for (let i = 0; i < 16; i++) pine(i * (W / 14) + (i % 3) * 20 - 10, H * (0.86 + (i % 2) * 0.03), 70 + (i % 4) * 22, '#070914');
            g.fillStyle = '#05060f'; g.fillRect(0, H * 0.93, W, H * 0.07);
            flies.forEach((f) => { const x = f.x + Math.sin(t * f.sp + f.p) * 26, y = f.y + Math.cos(t * f.sp * 1.3 + f.p) * 14; const a = 0.4 + Math.sin(t * 2 + f.p * 3) * 0.4; const gr = g.createRadialGradient(x, y, 0, x, y, 9); gr.addColorStop(0, `rgba(255,230,120,${a})`); gr.addColorStop(1, 'rgba(255,230,120,0)'); g.fillStyle = gr; g.fillRect(x - 9, y - 9, 18, 18); });
        }
        resize(); requestAnimationFrame(frame); window.addEventListener('resize', resize);
        return { restart() { if (!run) { run = true; requestAnimationFrame(frame); } } };
    })();
    window._loginScene = scene;

    /* ================= DADOS DE ONDE CADA COISA VEM ================= */
    const NODE_DROPS = { tree: ['Logs'], rock_copper: ['Copper Ore'], rock_tin: ['Tin Ore'], rock_iron: ['Iron Ore'], rock_coal: ['Coal'], rock_mithril: ['Mithril Ore'], fishing_spot: ['Raw Fish', 'Sardinha Crua', 'Tilápia Crua', 'Carpa Crua', 'Bagre-do-Brejo Cru', 'Truta Crua', 'Robalo Cru', 'Piranha Crua', 'Salmão Cru', 'Atum Cru', 'Enguia Elétrica Crua', 'Peixe-Lua Cru', 'Peixe-espada Cru', 'Carpa Dourada Crua', 'Isca de Camarão'] };
    const NODE_LABEL = { tree: 'Árvore', rock_copper: 'Rocha de cobre', rock_tin: 'Rocha de estanho', rock_iron: 'Rocha de ferro', rock_coal: 'Veio de carvão', rock_mithril: 'Veio de mithril', fishing_spot: 'Ponto de pesca' };
    const NODE_HOW = { tree: 'Precisa de um <b>Machado</b> equipado (ou na mochila). Botão direito na árvore, ou chegue perto e aperte <b>Espaço</b>.', rock_copper: 'Precisa de uma <b>Picareta</b>. Botão direito na rocha, ou <b>Espaço</b> perto dela.', rock_tin: 'Precisa de uma <b>Picareta</b>.', rock_iron: 'Precisa de uma <b>Picareta</b>.', rock_coal: 'Precisa de uma <b>Picareta</b> e Mineração nível 5.', rock_mithril: 'Precisa de uma <b>Steel Pickaxe</b> (ou melhor) e Mineração nível 15.', fishing_spot: 'Escolha o modo ao pescar: a <b>Rede de Pesca</b> pega peixes comuns rápido, sem isca. A <b>Vara de Pesca</b> lança a linha: quando a boia afundar aperte <b>Espaço</b> (ou AÇÃO) e mantenha o cursor na zona <b>verde</b> segurando/soltando; tensão demais estoura a linha. Gasta 1 <b>isca</b> por peixe que morde (Minhoca no Pescador; ◀ ▶ troca a isca). Peixes têm raridade e tamanho; veja o <b>Diário de pesca</b> no Menu e cozinhe-os na fogueira para ganhar bônus.' };
    const SMELT = { 'Bronze Bar': 'Leve <b>1 Copper Ore + 1 Tin Ore</b> até uma <b>Fornalha</b> e aperte Espaço.', 'Iron Bar': 'Leve <b>1 Iron Ore</b> até uma <b>Fornalha</b> e aperte Espaço.', 'Steel Bar': 'Leve <b>1 Iron Ore + 2 Coal</b> à <b>Fornalha</b> (Ferraria nível 10).', 'Mithril Bar': 'Leve <b>1 Mithril Ore + 3 Coal</b> à <b>Fornalha</b> (Ferraria nível 20).' };

    function mapNameOf(id) { const m = (typeof gameMaps !== 'undefined') && gameMaps[id]; return (m && m.name) || id; }
    function mapsWith(pred) {
        const out = {}; try { Object.keys(gameMaps).forEach((mk) => { (gameMaps[mk].entities || []).forEach((o) => { if (o && pred(o)) out[mk] = (out[mk] || 0) + 1; }); }); } catch (e) {}
        return Object.keys(out);
    }
    function lootOf(name) {
        const out = [];
        Object.keys(npcDB).forEach((k) => {
            const d = npcDB[k]; if (!d || !d.lootStr) return;
            d.lootStr.split('|').forEach((p) => { const a = p.split(','); if (a[0] && a[0].trim() === name) out.push({ key: k, d, chance: parseFloat(a[1]), qty: parseInt(a[2]) || 1 }); });
        });
        return out;
    }
    function chanceWord(c) { return c >= 0.95 ? 'sempre' : c >= 0.5 ? 'frequente' : c >= 0.25 ? 'às vezes' : 'raro'; }
    function behChip(d) {
        const b = (typeof mobBehavior === 'function') ? mobBehavior(d) : d.behavior;
        return b === 'aggressive' ? ['red', 'agressivo'] : (b === 'passive' || b === 'skittish') ? ['grn', 'pacífico'] : ['yel', 'neutro'];
    }
    function shopsSelling(name) {
        const out = []; Object.keys(npcDB).forEach((k) => { const d = npcDB[k]; if (!d || !d.shopStr) return; d.shopStr.split('|').forEach((p) => { const a = p.split(','); if (a[0] && a[0].trim() === name) out.push({ key: k, d, cost: parseInt(a[1]) || 0 }); }); });
        return out;
    }
    function whereMob(key) { const maps = mapsWith((o) => o.dbKey === key); return maps.length ? maps.map(mapNameOf) : []; }
    function whereNpc(key) { return whereMob(key); }

    /* descreve todas as formas de obter um item (HTML) */
    function sourcesHtml(name) {
        const it = itemDB[name]; const parts = [];
        Object.keys(NODE_DROPS).forEach((nt) => {
            if (NODE_DROPS[nt].includes(name)) {
                const maps = mapsWith((o) => o.type === nt);
                parts.push(`<div class="src"><b>Coletar:</b> ${esc(NODE_LABEL[nt])}${maps.length ? ' em ' + maps.map((m) => `<span class="chip">${esc(mapNameOf(m))}</span>`).join('') : ''}<br>${NODE_HOW[nt]}</div>`);
            }
        });
        if (window.Content) {
            Object.keys(Content.CROPS).forEach((k) => { const c = Content.CROPS[k]; if (c.out === name) parts.push(`<div class="src"><b>Plantar:</b> ${esc(itemDB[c.seed] ? itemDB[c.seed].name : c.seed)} num <span class="chip grn">canteiro</span> (Agricultura ${c.lvl}). Cresce em ${Math.round(c.secs / 60 * 10) / 10} min. Sementes: Fazendeiro.</div>`); });
            Content.BREW.forEach((r) => { if (r.out === name) parts.push(`<div class="src"><b>Preparar:</b> no <span class="chip yel">caldeirão</span> (Alquimia ${r.lvl}): ${r.needs.map((n) => n[1] + '× ' + esc(n[0])).join(' + ')}</div>`); });
        }
        if (SMELT[name]) parts.push(`<div class="src"><b>Fundir:</b> ${SMELT[name]}</div>`);
        const cookedFrom = Object.keys(itemDB).filter((k) => itemDB[k].cooksInto === name);
        if (cookedFrom.length) parts.push(`<div class="src"><b>Cozinhar:</b> jogue ${cookedFrom.map((k) => `${Icons.html(k, 18)} ${esc(itemDB[k].name)}`).join(', ')} numa <b>fogueira</b> (use a <b>Tinderbox</b> com Logs para acender uma) e aperte Espaço perto do fogo.</div>`);
        const drops = lootOf(name);
        if (drops.length) parts.push(`<div class="src"><b>Cai de monstros:</b><br>${drops.map((x) => { const w = whereMob(x.key); const bc = behChip(x.d); return `<span class="chip ${bc[0]}">${esc(x.d.name)} · ${bc[1]}</span><span class="chip">${chanceWord(x.chance)}</span>${w.length ? ' <span style="opacity:.8">em ' + w.map(esc).join(', ') + '</span>' : ''}`; }).join('<br>')}</div>`);
        const shops = shopsSelling(name);
        if (shops.length) parts.push(`<div class="src"><b>Comprar:</b> ${shops.map((s) => `${esc(s.d.name)} (${s.cost} moedas)${whereNpc(s.key).length ? ' em ' + whereNpc(s.key).map(esc).join(', ') : ''}`).join('; ')}</div>`);
        if (it && it.recipe) parts.push(`<div class="src"><b>Criar:</b> veja a receita no Livro de Ofícios.</div>`);
        if (!parts.length) parts.push(`<div class="src">Encontrado no chão do mundo ou como recompensa. Explore os mapas!</div>`);
        return parts.join('');
    }

    /* ================= LIVRO DE OFÍCIOS ================= */
    let bookTab = 'recipes', bookSel = null;
    function parseRecipe(r) { return r.split('|').map((x) => { const p = x.split(','); return { name: p[0].trim(), qty: parseInt(p[1]) || 1 }; }); }
    function ingredientTree(name, need, depth, seen) {
        const it = itemDB[name]; const have = getInvCount(name); const icon = it ? it.icon : '?';
        let html = `<div class="ing"><span class="em">${esc(icon)}</span><div style="flex:1"><div class="nm">${need}× ${esc(name)}</div>`;
        if (it && it.recipe && depth < 3 && !seen.includes(name)) {
            html += `<div class="src"><b>Fabricável</b> — ${parseRecipe(it.recipe).map((r) => `${r.qty}× ${esc(r.name)}`).join(' + ')}</div>`;
            html += `<div class="tree-indent">${parseRecipe(it.recipe).map((r) => ingredientTree(r.name, r.qty * Math.ceil(need / (it.craftQty || 1)), depth + 1, seen.concat(name))).join('')}</div>`;
        } else html += sourcesHtml(name);
        html += `</div><span class="have ${have >= need ? 'ok' : 'no'}">${have}/${need}</span></div>`;
        return html;
    }
    function canCraft(it) { return parseRecipe(it.recipe).every((r) => getInvCount(r.name) >= r.qty); }
    function bestiaryHtml() {
        const W = window.World2; if (!W) return '<div class="book-page"><p>Bestiário indisponível.</p></div>';
        const list = W.beastList(), p = W.beastProgress();
        let h = `<div class="book-page"><h3>Bestiário</h3><p>Derrote criaturas para descobri-las. Uma vitória revela o perfil e o habitat; cinco revelam o que elas carregam. <b>${p.seen}/${p.total}</b> descobertas.</p><div class="bar" style="height:8px;background:#0003;border-radius:4px;overflow:hidden;margin:4px 0 8px"><div style="height:100%;width:${p.total ? Math.round(p.seen / p.total * 100) : 0}%;background:linear-gradient(#e0b84a,#a77a1c)"></div></div>`;
        h += list.map((k) => {
            const d = npcDB[k], n = W.kills(k);
            if (n < 1) return `<div style="margin:3px 0;opacity:.55;font-family:var(--sans);font-size:.82rem">❔ <b>???</b> <span style="opacity:.8">— ainda não encontrado${d.biome ? ' (dica: ' + esc(d.biome) + ')' : ''}</span></div>`;
            const where = whereMob(k).map(esc).join(', ') || esc(d.biome || '—'); const ch = behChip(d);
            let body = `<div style="font-size:.8rem">${esc(d.desc || '')}</div><div style="font-size:.78rem;margin-top:3px">Nível <b>${d.level || '?'}</b> · Vida <b>${fmtNum(d.hp)}</b> · ${d.dmax > 0 ? 'Dano <b>' + d.dmin + '-' + d.dmax + '</b>' : '<b>Não ataca</b>'} · <span class="chip ${ch[0]}">${ch[1]}</span></div><div style="font-size:.78rem">Habitat: ${where}</div>`;
            if (n >= 5 && d.lootStr) body += `<div style="font-size:.78rem">Carrega: ${d.lootStr.split('|').map((s) => { const a = s.split(','); const it = itemDB[a[0].trim()]; return (it ? Icons.html(a[0].trim(), 18) + ' ' : '') + esc(a[0].trim()) + ' <i>(' + chanceWord(parseFloat(a[1])) + ')</i>'; }).join(', ')}</div>`;
            else if (d.lootStr) body += `<div style="font-size:.74rem;opacity:.65">Derrote mais ${5 - n} para ver o que carrega.</div>`;
            return `<details style="margin:3px 0"><summary style="cursor:pointer;font-family:var(--sans);font-size:.84rem"><b>${esc(d.name)}</b> <span style="opacity:.7">— ${n} abate${n > 1 ? 's' : ''}${d.group === 'chefe' ? ' · CHEFE' : ''}</span></summary>${body}</details>`;
        }).join('');
        return h + '</div>';
    }
    /* Livro de receitas: clicar numa receita só a SELECIONA (detalhes no topo). Quem fabrica é o botão "Criar" (ou Enter no campo de quantidade). */
    let bookQty = 1, bookMsg = null, bookSig = '';
    function bookSigNow() {
        const tab = $('tab-craft'); if (!tab || !tab.classList.contains('active-tab')) return null;   // aba fechada: não reconstrói
        let s = bookTab + '|' + bookSel + '|' + bookQty + '|' + (bookMsg ? bookMsg.t : '');
        if (bookTab === 'recipes') { s += '|' + (INV_SLOTS - player.inventory.length); Object.values(itemDB).forEach((i) => { if (i.recipe) parseRecipe(i.recipe).forEach((r) => { s += ',' + getInvCount(r.name); }); }); s += '|' + Object.values(itemDB).filter((i) => i.recipe).length; }
        else if (bookTab === 'bestiary' && window.World2) { const W = window.World2; s += '|' + W.beastList().reduce((a, k) => a + W.kills(k), 0); }
        else if (bookTab === 'index') s += '|' + Object.keys(itemDB).length;
        return s;
    }
    function paintQty() {   // atualiza só os números (sem reconstruir o painel, para não perder o foco do campo)
        const it = itemDB[bookSel], inf = it && typeof craftInfo === 'function' ? craftInfo(bookSel) : null; if (!inf) return;
        document.querySelectorAll('#craft-list .have[data-per]').forEach((el) => { const need = +el.dataset.per * bookQty, have = +el.dataset.have; el.textContent = have + '/' + need; el.className = 'have ' + (have >= need ? 'ok' : 'no'); });
        const go = document.querySelector('#craft-list .btn-craft'); if (go) { const ok = inf.max >= 1; go.disabled = !ok; go.textContent = ok ? 'Criar' + (bookQty > 1 ? ' ×' + bookQty : '') : (inf.maxMat >= bookQty ? 'Mochila cheia' : 'Faltam materiais'); }
        const out = document.querySelector('#craft-list .rc-out b'); if (out) out.textContent = (inf.per * bookQty) + '× ' + it.name;
    }
    function bookDo() {
        if (!bookSel || typeof craftItem !== 'function') return;
        const r = craftItem(bookSel, bookQty); bookMsg = { t: r.msg, ok: r.ok }; const i2 = craftInfo(bookSel); bookQty = Math.max(1, Math.min(bookQty, i2 && i2.max ? i2.max : 1)); renderCraftBook();
    }
    function renderCraftBook() {
        const box = $('craft-list'); if (!box || typeof player === 'undefined' || !player.inventory) return;
        const sig = bookSigNow(); if (sig === null || (sig === bookSig && box.firstChild)) return; bookSig = sig;
        const list = Object.values(itemDB).filter((i) => i.recipe);
        if (bookSel && (!itemDB[bookSel] || !itemDB[bookSel].recipe)) bookSel = null;
        const keepScroll = (box.querySelector('.rc-list') || {}).scrollTop || 0;
        let h = `<div class="book"><div class="book-tabs"><div class="book-tab ${bookTab === 'recipes' ? 'on' : ''}" data-bt="recipes">Receitas</div><div class="book-tab ${bookTab === 'index' ? 'on' : ''}" data-bt="index">Onde encontrar</div><div class="book-tab ${bookTab === 'bestiary' ? 'on' : ''}" data-bt="bestiary">Bestiário</div></div>`;
        if (bookTab === 'recipes') {
            const it = bookSel ? itemDB[bookSel] : null, inf = it ? craftInfo(bookSel) : null;
            if (it && inf) {
                if (bookQty > Math.max(1, inf.max)) bookQty = Math.max(1, inf.max); if (bookQty < 1) bookQty = 1;
                const ok = inf.fits(bookQty);
                h += `<div class="book-page rc-detail"><h3>${Icons.html(it.name, 26)} ${esc(it.name)}${inf.per > 1 ? ` <small>(faz ${inf.per})</small>` : ''}</h3><p>${esc(Balance.fixDesc(it.desc || ''))}</p>`;
                h += `<div class="rc-need">` + inf.reqs.map((r) => `<div class="ing"><span class="em">${Icons.html(r.n, 22)}</span><div style="flex:1" class="nm">${esc(r.n)}</div><span class="have ${r.have >= r.q * bookQty ? 'ok' : 'no'}" data-per="${r.q}" data-have="${r.have}">${r.have}/${r.q * bookQty}</span></div>`).join('') + `</div>`;
                h += `<div class="rc-out">Resultado: <b>${inf.per * bookQty}× ${esc(it.name)}</b></div>`;
                h += `<div class="rc-qty"><button type="button" class="rc-q" data-q="-1" aria-label="Menos">−</button><input id="rc-q" type="text" inputmode="numeric" maxlength="2" autocomplete="off" value="${bookQty}" aria-label="Quantidade"><button type="button" class="rc-q" data-q="1" aria-label="Mais">+</button><button type="button" class="rc-q rc-max" data-q="max">Máx</button><span class="rc-mx">máx. ${inf.max}</span></div>`;
                h += `<button type="button" class="btn-craft" data-craft="${esc(it.name)}" ${ok ? '' : 'disabled'}>${ok ? 'Criar' + (bookQty > 1 ? ' ×' + bookQty : '') : (inf.locked ? 'Nível insuficiente' : (inf.maxMat >= bookQty ? 'Mochila cheia' : 'Faltam materiais'))}</button>`;
                h += `<div class="rc-msg ${bookMsg ? (bookMsg.ok ? 'ok' : 'no') : (inf.locked ? 'no' : '')}" role="status">${bookMsg ? esc(bookMsg.t) : (inf.locked ? esc(inf.locked) : '')}</div>`;
                h += `<details class="rc-src"><summary>De onde vêm os ingredientes</summary>${inf.reqs.map((r) => ingredientTree(r.n, r.q, 0, [it.name])).join('')}</details></div>`;
            } else h += `<div class="book-page rc-detail"><h3>Receitas</h3><p>Toque numa receita para ver os ingredientes. Nada é criado ao tocar: use o botão <b>Criar</b>.</p></div>`;
            h += `<div class="rc-list">` + list.map((i) => { const c = craftInfo(i.name), okr = c && c.max >= 1; return `<div class="rc-item ${i.name === bookSel ? 'sel' : ''} ${okr ? '' : 'lack'}" data-sel="${esc(i.name)}" tabindex="0" role="button" aria-pressed="${i.name === bookSel}"><span class="em">${Icons.html(i.name, 30)}</span><div style="flex:1"><div class="nm">${esc(i.name)}</div><div class="sub">${parseRecipe(i.recipe).map((r) => r.qty + '× ' + (itemDB[r.name] ? Icons.html(r.name, 20) : esc(r.name))).join(' + ')}</div></div><span class="${okr ? 'rc-ok' : 'rc-no'}">${okr ? 'pronto' : (c && c.locked ? 'nível' : 'falta')}</span></div>`; }).join('') + `</div>`;
        } else if (bookTab === 'bestiary') {
            h += bestiaryHtml();
        } else {
            const all = Object.values(itemDB).filter((i) => i.name !== 'Coins');
            h += `<div class="book-page"><h3>Onde encontrar cada item</h3><p>Toque em uma linha para ver como conseguir. Itens fabricáveis aparecem no Livro de Receitas.</p>` +
                all.map((i) => `<details style="margin:4px 0"><summary style="cursor:pointer;font-family:var(--sans);font-size:.82rem"><b>${Icons.html(i.name, 20)} ${esc(i.name)}</b> <span style="opacity:.7">— ${esc(i.desc || '')}</span></summary>${sourcesHtml(i.name)}</details>`).join('') + `</div>`;
        }
        box.innerHTML = h + '</div>';
        const rl = box.querySelector('.rc-list'); if (rl) rl.scrollTop = keepScroll;
        box.onclick = (ev) => {
            const c = ev.target.closest('[data-craft]'); if (c) { if (!c.disabled) bookDo(); return; }
            const q = ev.target.closest('[data-q]');
            if (q) { const inf = craftInfo(bookSel); if (!inf) return; const mx = Math.max(1, inf.max); bookQty = q.dataset.q === 'max' ? mx : Math.max(1, Math.min(mx, bookQty + (+q.dataset.q))); bookMsg = null; bookSig = ''; renderCraftBook(); return; }
            const s = ev.target.closest('[data-sel]');
            if (s) { if (bookSel !== s.dataset.sel) { bookSel = s.dataset.sel; bookQty = 1; bookMsg = null; } bookSig = ''; renderCraftBook(); const r = box.querySelector('.rc-item.sel'); try { if (r) r.focus({ preventScroll: true }); const d = box.querySelector('.rc-detail'); if (d && d.scrollIntoView) d.scrollIntoView({ block: 'nearest' }); } catch (e) { } return; }
            const b = ev.target.closest('[data-bt]'); if (b) { bookTab = b.dataset.bt; bookSig = ''; renderCraftBook(); }
        };
        const qi = $('rc-q');
        if (qi) { qi.oninput = () => { const v = qi.value.replace(/\D/g, ''); const inf = craftInfo(bookSel); const mx = Math.max(1, inf ? inf.max : 1); bookQty = Math.max(1, Math.min(mx, parseInt(v) || 1)); bookMsg = null; paintQty(); }; qi.onblur = () => { qi.value = String(bookQty); }; }
    }
    // Enter: fabrica só quando o foco está no campo de quantidade ou na receita selecionada (não rouba o Enter do chat); sem mexer no resto do teclado
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.repeat) return; const t = e.target; if (!t || !t.closest || !t.closest('#craft-list')) return;
        if (t.id === 'rc-q' || (t.classList.contains('rc-item') && t.dataset.sel === bookSel)) { e.preventDefault(); e.stopPropagation(); const inf = bookSel ? craftInfo(bookSel) : null; if (inf && inf.max >= 1) bookDo(); else if (bookSel) { const r = craftItem(bookSel, 1); bookMsg = { t: r.msg, ok: r.ok }; bookSig = ''; renderCraftBook(); } }
        else if (t.classList.contains('rc-item')) { e.preventDefault(); e.stopPropagation(); t.click(); }
        else e.stopPropagation();
    }, true);
    window.renderCraftBook = renderCraftBook;

    /* ================= GUIA DO AVENTUREIRO ================= */
    const GUIDE = [
        ['compass', 'Como se mover', `<ul><li><b>WASD</b> ou setas para andar; no celular, toque no chão.</li><li>Clique/toque num ponto para o herói ir sozinho até lá (ele contorna obstáculos).</li><li>Nas bordas do mapa há saídas para o mapa vizinho. A vila fica no centro; floresta a oeste, mina a leste, rio ao sul, covil ao norte.</li></ul>`],
        ['star', 'Habilidades (K)', `<ul><li><b>K</b> abre a árvore de Combate, Arquearia e Magia: 1 ponto a cada 2 níveis da perícia. Ativas vão para a barra (<b>Q E F G</b>).</li><li>Conjunto completo equipado libera a <b>Habilidade do Set</b> (tecla <b>Z</b>), com recarga longa.</li></ul>`],
        ['hand', 'Interagir', `<ul><li><b>Espaço</b> age no objeto mais próximo: cortar árvore, minerar, pescar, pegar item, falar com NPC, usar fornalha ou fogueira.</li><li><b>Botão direito</b> (ou segurar no celular) abre o menu com todas as ações do que está sob o cursor.</li><li>Passe o mouse sobre árvores, rochas, NPCs e monstros para ver a dica de ação embaixo da tela.</li><li><b>Mochila:</b> arraste um item para trocar de lugar, para um slot da barra rápida (<b>1–5</b>) ou para fora do painel para jogá-lo no chão (itens em pilha perguntam quanto). Botão direito num slot da barra o limpa.</li><li><b>Usar itens:</b> um clique só <b>seleciona</b> o item e mostra os botões Usar/Equipar, Jogar fora e Cancelar; clique duplo (ou toque duplo) usa direto; Esc cancela. Dá para desligar em Menu &gt; Confirmar uso de itens.</li></ul>`],
        ['sword', 'Combate', `<ul><li><b>Ctrl</b> ou o botão Atacar bate no inimigo mais próximo.</li><li>O nome sobre cada criatura mostra o tipo: <b style="color:#ff6a5a">vermelho</b> = agressivo (ataca ao ver você), <b style="color:#ffd24a">amarelo</b> = neutro (só revida), <b style="color:#7be08a">verde</b> = pacífico (foge). Ao lado do nome fica o nível (Nv).</li><li>A barra de vida só aparece depois que o monstro apanha.</li><li>Se sua vida chegar a 0 você renasce na vila. Coma comida cozida para curar: na mochila, toque no item e use o botão <b>Comer</b> (ou clique duas vezes).</li><li>Armas: espada (corpo a corpo), arco + flechas (à distância) e cajado + runas (magia). Passe o mouse na arma para ver a faixa de dano (por exemplo, <b>Dano: 9-15</b>): ela cresce com o nível da perícia e com a qualidade da arma.</li><li>Sua perícia de combate (Combate, Arquearia ou Magia) sobe quando você <b>causa dano</b>. <b>Defesa</b> e <b>Vitalidade</b> sobem quando você <b>recebe dano</b> de monstros fortes; criaturas muito fracas rendem pouco. Esquivar, bloquear ou ser curado não dá XP.</li><li>A cada nível de <b>Vitalidade</b> você ganha +10 de vida máxima; a cada nível de <b>Magia</b>, +5 de mana. Monstros muito acima do seu nível são mortais: dá para ver o nível ao lado do nome.</li></ul>`],
        ['bag', 'Coleta e ferramentas', `<ul><li><b>Árvore</b> → Logs (precisa de Machado). <b>Rocha</b> → minério (precisa de Picareta). <b>Ponto de pesca</b> → peixe cru (Rede de Pesca ou Vara de Pesca).</li><li>Machado e Picareta são vendidos pelo Ferreiro; a Rede, a Vara e as Minhocas pelo Pescador.</li><li><b>Pesca:</b> a Rede é rápida e pega peixes comuns. A Vara é mais lenta, gasta 1 isca por tentativa e pega peixes maiores e raros; selecione uma isca na mochila e use <b>Escolher isca</b> (ou clique duas vezes); escolher a mesma de novo volta ao automático. Iscas especiais vêm de baús do tesouro, peixes raros e da rede.</li><li>Recursos esgotados voltam depois de alguns segundos.</li></ul>`],
        ['book', 'Fabricar e cozinhar', `<ul><li><b>Fornalha:</b> Copper Ore + Tin Ore → Bronze Bar; Iron Ore → Iron Bar.</li><li><b>Fogueira:</b> use a Tinderbox com Logs, depois aperte Espaço perto do fogo com carne ou peixe crus.</li><li>Abra a aba <b>Ofícios</b>: toque numa receita para ver ingredientes e quanto você já tem, escolha a quantidade e aperte <b>Criar</b> (tocar na lista nunca cria nada sozinho).</li></ul>`],
        ['star', 'Perícias', `<ul><li>Cada ação treina uma perícia (Lenhador, Mineração, Culinária…) e ao subir de nível você fica melhor.</li><li>A aba Perícias mostra o nível e o XP atual/próximo nível de cada uma.</li><li>Recursos e receitas melhores pedem níveis mais altos; os requisitos aparecem na dica do item.</li></ul>`],
        ['chat', 'Chat e amigos', `<ul><li><b>Enter</b> abre o chat; digite e aperte Enter para enviar — o campo continua aberto para você seguir escrevendo. <b>Esc</b> ou Enter com o campo vazio fecha.</li><li>Fechado, o chat fica pequeno e transparente no canto para não atrapalhar.</li><li>Outros jogadores aparecem no mesmo mapa com o nome sobre a cabeça.</li></ul>`],
        ['chest', 'Vila, lojas e banco', `<ul><li>Fale com os NPCs (Espaço ou botão direito → Falar): lojas vendem ferramentas, comida e runas por moedas.</li><li>Moedas caem dos monstros. O <b>Banco</b> guarda itens além do limite da mochila (peso máximo 50 kg).</li></ul>`],
        ['flag', 'Missões de NPC', `<ul><li>NPC com <b style="color:#b07a1a">!</b> na cabeça tem missão nova; com <b style="color:#3f8a4a">?</b> você pode entregar uma missão pronta.</li><li>Fale com o NPC (botão direito → Falar) e escolha <b>Aceitar missão</b>. O progresso aparece no quadro do canto da tela.</li><li>Recompensas: moedas, experiência e itens. As missões do Guarda Real formam uma sequência até o dragão.</li></ul>`],
        ['star', 'Dia, noite e clima', `<ul><li>Um dia dura 20 minutos reais. À noite tudo escurece, as janelas e lampiões acendem, e monstros enxergam mais longe.</li><li>Chuva apaga fogueiras mais rápido. O selo no canto superior direito mostra hora e clima.</li><li>Ajuste música e efeitos na aba <b>Menu</b>.</li></ul>`],
        ['star', 'Aço e mithril', `<ul><li><b>Coal</b> (carvão) e <b>Mithril Ore</b> são minerados nas minas e no covil. Carvão pede Mineração 10; mithril pede Mineração 30 e uma <b>Steel Pickaxe</b>.</li><li>Na fornalha: <b>Iron Ore + 2 Coal → Steel Bar</b> (Ferraria 20); <b>Mithril Ore + 3 Coal → Mithril Bar</b> (Ferraria 40).</li><li>Em Ofícios você cria espadas, escudos, armaduras e picaretas de aço e mithril.</li></ul>`],
        ['bag', 'Fazenda e alquimia', `<ul><li>Compre sementes com o <b>Fazendeiro</b> e plante nos <b>canteiros</b> (botão direito). Cada planta cresce em tempo real, mesmo com você longe. Volte e colha!</li><li>No <b>caldeirão</b> (perto da igreja) misture ervas, frascos e drops de monstros para fazer poções de cura, mana, força e guarda.</li><li>Poções de força e guarda duram 3 minutos.</li></ul>`],
        ['spark', 'Encantamento', `<ul><li>Na <b>Mesa de Encantamento</b> (perto do Mago) melhore armas e armaduras <b>equipadas</b>: até +3 níveis. Cada nível dá +10% de dano (armas) ou +4 de defesa.</li><li>Usa drops de monstros (Slime Ball, Spider Silk, Ectoplasm, Dragon Scale…) e moedas.</li></ul>`],
        ['flag', 'Casa e Catacumbas', `<ul><li>Na Vila há uma <b>porta com a placa CASA</b>: sua casa é só sua. Dentro, use o botão <b>Decorar casa</b> para comprar camas, mesas, estantes, tapetes, e até <b>banco, fornalha, bigorna, caldeirão e mesa de encantamento</b>. A cama restaura vida e mana. Peças removidas devolvem 80% das moedas.</li><li>Derrotar o Dragão ou o Lich libera seus <b>troféus</b> para a casa.</li><li>No Covil do Dragão há uma <b>entrada para as Catacumbas</b>: esqueletos armados, fantasmas, magos e o <b>Lich Rei Ossian</b>. Leve poções, aço e ajuda!</li><li>O <b>Bestiário</b> (aba Ofícios) registra tudo o que você já derrotou.</li></ul>`],
        ['chat', 'Grupo e troca', `<ul><li>O botão <b>Social</b> (canto superior direito) lista quem está por perto: convide para o <b>grupo</b> (até 5, com vida de todos na tela) ou peça uma <b>troca</b> (chegue a poucos passos).</li><li>Na troca, cada um escolhe o que oferece e só conclui quando os dois confirmam. Se algo falhar, os itens voltam. Itens encantados não são trocáveis.</li><li>Chat só do grupo: escreva <b>/g mensagem</b>.</li></ul>`],
        ['spark', 'Itens Mímicos', `<ul><li>Relíquias vivas (Guerreiro, Arqueiro e Mago) que <b>crescem junto de quem as veste</b>: evoluem até o nível 50 com XP própria, mudam de <b>estágio visual</b> (níveis 1, 10, 25 e 50) e de <b>aparência</b> (Violeta, Dourado, Carmesim, Gelo, Sombra, Esmeralda; Aurora e Eclipse são especiais). Equipe todas as peças do set para ganhar o bônus completo.</li><li>Tecla <b>N</b> (ou o botão Mímicos): escolha quanto do seu XP é desviado para as peças equipadas (0% a 100%, padrão 0%) e a aparência de cada peça (ou do set inteiro). São itens pessoais: não se trocam, vendem, desmancham nem jogam fora; o Banco guarda.</li></ul>`],
        ['save', 'Progresso', `<ul><li>Seu progresso é salvo automaticamente. Use “Salvar agora” no Menu para salvar na hora.</li><li>Atalhos: <b>H</b> abre este guia, <b>I</b> mochila, <b>C</b> ofícios, <b>N</b> Mímicos, <b>Enter</b> chat.</li></ul>`],
    ];
    function renderGuide() {
        const b = $('guide-body'); if (!b) return;
        b.innerHTML = `<div class="book-page"><h3>Guia do Aventureiro</h3><p>Tudo o que você precisa para começar no reino. Cumpra o diário de missões no canto da tela para aprender na prática.</p>` +
            GUIDE.map((g) => `<h4>${IC(g[0])} ${g[1]}</h4>${g[2]}`).join('') + `<button class="btn-craft" onclick="resetQuestTracker()">Reiniciar diário de missões</button></div>`;
    }

    /* ================= DIÁRIO DE MISSÕES (tutorial) ================= */
    const sk = (k) => { try { const s = player.stats.skills[k]; return s ? s.xp + (s.level - 1) * 1000 : 0; } catch (e) { return 0; } };
    const has = (n) => { try { return getInvCount(n) > 0 || Object.values(player.equipment || {}).some((e) => e && e.name === n); } catch (e) { return false; } };
    const STEPS = [
        { t: 'Ande pela vila', h: 'Use <b>WASD</b> ou as setas, ou clique no chão. Explore os arredores.', done: () => window._qMoved },
        { t: 'Consiga um Machado', h: 'Fale com o <b>Ferreiro</b> (botão direito → Falar) e compre um <b>Bronze Axe</b>. Moedas caem dos monstros e ficam pelo chão.', done: () => has('Bronze Axe') },
        { t: 'Corte uma árvore', h: 'Botão direito numa árvore → <b>Cortar</b>, ou chegue perto e aperte <b>Espaço</b>. Você ganha Logs.', done: () => sk('woodcutting') > 0 },
        { t: 'Consiga uma Picareta e minere', h: 'Compre uma <b>Bronze Pickaxe</b> e minere rochas de cobre e estanho na mina, a leste.', done: () => sk('mining') > 0 },
        { t: 'Funda uma barra', h: 'Leve Copper Ore + Tin Ore a uma <b>Fornalha</b> e aperte Espaço para fazer um Bronze Bar.', done: () => sk('smithing') > 0 },
        { t: 'Fabrique algo', h: 'Abra a aba <b>Ofícios</b> (livro), toque numa receita de arma ou armadura e aperte <b>Criar</b>.', done: () => sk('crafting') > 0 },
        { t: 'Enfrente um monstro', h: 'Na mochila, selecione uma arma e use <b>Equipar</b>; depois aperte <b>Ctrl</b> perto de um monstro. Cuidado com os de nome vermelho!', done: () => sk('combat') > 0 || sk('ranged') > 0 || sk('magic') > 0 },
        { t: 'Cozinhe uma refeição', h: 'Na mochila, selecione a <b>Tinderbox</b> e use <b>Acender fogueira</b> (precisa de Logs) para acender uma fogueira e cozinhe carne ou peixe cru.', done: () => sk('cooking') > 0 },
    ];
    let qStep = 0, qMin = false, qAllDone = false;
    function qKey() { return 'ms_quest_' + (window.currentUser || 'anon'); }
    function renderQuest() {
        const el = $('quest-tracker'); if (!el) return;
        while (qStep < STEPS.length && STEPS[qStep].done()) qStep++;
        qAllDone = qStep >= STEPS.length;
        el.classList.toggle('done', qAllDone); el.classList.toggle('min', qMin);
        const pct = Math.round((qStep / STEPS.length) * 100);
        const nq = (qAllDone && window.Quests) ? window.Quests.summary() : [];
        el.innerHTML = qAllDone && nq.length
            ? `<h4>${IC('flag')} Missões de NPC (${nq.length}) <span class="q-x">${qMin ? 'expandir' : 'minimizar'}</span></h4><div class="q-title">${esc(nq[0].title)}</div><div class="q-hint">${nq[0].ready ? 'Pronta! Volte ao ' + esc(nq[0].giverName) + ' para entregar.' : esc(nq[0].text) + ' <b>(' + nq[0].cur + '/' + nq[0].need + ')</b>'}</div><div class="q-bar"><i style="width:${Math.round(nq[0].cur / nq[0].need * 100)}%"></i></div>`
            : qAllDone
            ? `<h4>${IC('flag')} Diário do Aventureiro <span class="q-x">ocultar</span></h4><div class="q-title">Você aprendeu o básico!</div><div class="q-hint">Fale com os NPCs da vila: quem tem um <b style="color:#b07a1a">!</b> sobre a cabeça oferece uma missão. Consulte o Guia (tecla H) quando precisar.</div><div class="q-bar"><i style="width:100%"></i></div>`
            : `<h4>${IC('flag')} Missão ${qStep + 1}/${STEPS.length} <span class="q-x">${qMin ? 'expandir' : 'minimizar'}</span></h4><div class="q-title">${esc(STEPS[qStep].t)}</div><div class="q-hint">${STEPS[qStep].h}</div><div class="q-bar"><i style="width:${pct}%"></i></div>`;
    }
    window.refreshQuestTracker = function () { renderQuest(); };
    window.resetQuestTracker = function () { qStep = 0; qMin = false; $('quest-tracker').style.display = ''; renderQuest(); };
    document.addEventListener('DOMContentLoaded', () => {
        const el = $('quest-tracker');
        if (el) el.addEventListener('click', (e) => { if (e.target.classList.contains('q-x')) { if (qAllDone && !(window.Quests && window.Quests.summary().length)) el.style.display = 'none'; else { qMin = !qMin; renderQuest(); } } else openTab('guide'); });
    });
    ['keydown', 'mousedown', 'touchstart'].forEach((ev) => document.addEventListener(ev, () => { if (ev !== 'keydown') return; }, { passive: true }));
    setInterval(() => {
        try {
            if ($('login-overlay').style.display !== 'none' || typeof player === 'undefined') return;
            if (!window._qStart) window._qStart = { x: player.x, y: player.y };
            if (!window._qMoved && Math.hypot(player.x - window._qStart.x, player.y - window._qStart.y) > 60) window._qMoved = true;
            renderQuest();
            const kh = $('key-hints'); if (kh && !kh.dataset.t) { kh.dataset.t = Date.now(); } if (kh && Date.now() - kh.dataset.t > 45000) kh.classList.add('hide');
            if (!$('tab-guide').dataset.r) { renderGuide(); $('tab-guide').dataset.r = 1; }
        } catch (e) {}
    }, 700);

    /* ================= DICA DE AÇÃO SOB O CURSOR ================= */
    function hintFor(o) {
        if (!o || o.active === false) return null;
        if (o.type === 'tree') return ['Árvore', 'Botão direito: cortar (precisa de machado)'];
        if (typeof o.type === 'string' && o.type.startsWith('rock_')) return [NODE_LABEL[o.type] || 'Rocha', 'Botão direito: minerar (precisa de picareta)'];
        if (o.type === 'fishing_spot') return ['Ponto de pesca', 'Botão direito: pescar (Rede ou Vara de Pesca)'];
        if (o.type === 'house_door') return ['Minha Casa', 'Botão direito: entrar. Só você decora a sua'];
        if (o.type === 'furniture') return [o.name || 'Móvel', o.fk === 'bed' ? 'Botão direito: descansar' : 'Peça da casa'];
        if (o.type === 'farm_plot') return ['Canteiro', 'Botão direito: plantar ou colher'];
        if (o.type === 'cauldron') return ['Caldeirão de Alquimia', 'Botão direito: preparar poções'];
        if (o.type === 'enchant_table') return ['Mesa de Encantamento', 'Botão direito: encantar equipamento'];
        if (o.type === 'furnace') return ['Fornalha', 'Botão direito: fundir (aço: Iron Ore + 2 Coal)'];
        if (o.type === 'anvil') return ['Bigorna', 'Estação de ferreiro'];
        if (o.type === 'bank') return ['Banco', 'Botão direito: abrir banco'];
        if (o.type === 'fire') return ['Fogueira', 'Espaço: cozinhar carne ou peixe crus'];
        if (o.type === 'portal') return [o.name || 'Portal', 'Chegue perto para viajar'];
        if (o.type === 'ground_item') return [(typeof o.item === 'string' ? o.item : (o.item && o.item.name)) || 'Item', 'Espaço: pegar'];
        if (o.type === 'enemy') { const d = npcDB[o.dbKey] || {}; const bc = behChip(d); return [`${o.name || d.name} (${bc[1]})`, 'Ctrl: atacar']; }
        if (o.type === 'npc') return [o.name, 'Botão direito: falar'];
        return null;
    }
    document.addEventListener('mousemove', (e) => {
        const h = $('hover-hint'); if (!h) return;
        try {
            if ($('login-overlay').style.display !== 'none' || e.target !== $('gameCanvas')) { h.classList.remove('show'); return; }
            const m = gameMaps[currentMap]; if (!m) return; const x = lastWorldX, y = lastWorldY; let best = null;
            for (const o of m.entities || []) {
                if (!o || o.active === false || o.type === 'paint') continue;
                const w = o.w || 30, hh = o.h || 30; if (x >= o.x && x <= o.x + w && y >= o.y && y <= o.y + hh) { const hf = hintFor(o); if (hf) { best = hf; if (o.type === 'enemy' || o.type === 'npc') break; } }
            }
            if (best) { h.innerHTML = `${esc(best[0])}<small>${esc(best[1])}</small>`; h.classList.add('show'); $('gameCanvas').style.cursor = 'pointer'; } else { h.classList.remove('show'); $('gameCanvas').style.cursor = 'default'; }
        } catch (er) {}
    });

    /* atalhos: H guia, I mochila, C ofícios */
    document.addEventListener('keydown', (e) => {
        if ($('login-overlay').style.display !== 'none') return;
        if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '') || e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key.toLowerCase();
        if (k === 'h') { openTab('guide'); } else if (k === 'i') { openTab('inv'); } else if (k === 'c') { openTab('craft'); }
    });
})();
