/* MiniScape 2D — Desmanchar (reciclar) equipamentos e ferramentas.
   Regras (justas: nunca devolve tudo, então fabricar e desmanchar não dá lucro nem XP infinito):
   - com receita: devolve 50% (arredondado para baixo) de cada material; se der 0 no total e a receita tiver 2 ou mais unidades, devolve 1 do material principal (o mais valioso).
     Receita de 1 unidade só (ex.: Bronze Sword) não rende nada: o desmanche é bloqueado (jogue fora, se quiser).
   - sem receita (drops): devolve um pouco do material do tipo (barra, couro, escama, ossos...) conforme o espaço do item (arma 2, escudo 3, tronco 5, cabeça 2, joia 1) x 50%.
   - encantado: materiais base x 35% (sem o mínimo de 1) + Pó Arcano (1 + 25% das unidades gastas, por nível de encantamento). O encantamento se perde. Nunca devolve moedas.
   - munição empilhada: desmancha em lotes inteiros (o tamanho do lote é o da fabricação).
   - só item da mochila (equipado: desequipe antes; durante uma troca: bloqueado). Tudo ou nada: se não couber na mochila, nada acontece.
   API: Recycle.can(item) · Recycle.preview(item, lotes) -> { ok, why, give:[{name,qty}], ench, batch, maxBatches } · Recycle.run(item, lotes) -> { ok, give, msg } · Recycle.ask(item) (janela de confirmação). */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const RATE = 0.5, RATE_ENCH = 0.35, DUST_FRAC = 0.25;
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fn = (n) => (window.fmtNum ? fmtNum(n) : String(n));
    const say = (t, c) => { try { setActionText(t, c || '#e74c3c'); } catch (e) { } };
    const ready = () => typeof player !== 'undefined' && player && Array.isArray(player.inventory);
    const DB = () => (typeof itemDB !== 'undefined' ? itemDB : {});

    function parse(rec) { return String(rec || '').split('|').map((r) => { const p = r.split(','); return { n: (p[0] || '').trim(), q: parseInt(p[1]) }; }).filter((r) => r.n && r.q > 0 && DB()[r.n]); }
    const prio = (n) => (/ bar$|scale|core|gem|tome|ectoplasm/i.test(' ' + n) ? 3 : /hide|pelt|silk|tusk|tooth|wing|slime|bones/i.test(n) ? 2 : 1);
    function mainOf(mats) { return mats.slice().sort((a, b) => prio(b.n) - prio(a.n) || b.q - a.q)[0]; }
    const SLOT_UNITS = { weapon: 2, shield: 3, body: 5, head: 2, ring: 1, amulet: 1 };
    // sem receita: material do tipo pelo nome
    const SCRAP = [[/lich/i, 'Ectoplasm'], [/bone/i, 'Bones'], [/dragon/i, 'Dragon Scale'], [/mithril/i, 'Mithril Bar'], [/steel/i, 'Steel Bar'], [/gold/i, 'Gold Bar'], [/iron/i, 'Iron Bar'], [/bronze/i, 'Bronze Bar'], [/leather|hide/i, 'Cowhide'], [/robe|hat|wizard/i, 'Wool']];
    function scrapMats(it) {
        const u = SLOT_UNITS[it.slot] || (it.tool ? 2 : 0); if (!u) return null;
        for (const [re, mat] of SCRAP) if (re.test(it.name) && DB()[mat]) return [{ n: mat, q: u }];
        return null;
    }
    function enchantUnits(level) {   // unidades de material gastas nos níveis 1..level (ENCH em content.js)
        const E = (window.Content && Content.ENCH) || []; let units = 0, lv = 0;
        for (let i = 0; i < level && i < E.length; i++) { const u = E[i].needs.reduce((a, n) => a + n[1], 0); units += u; lv++; }
        return { units, levels: lv, perLevel: E.slice(0, lv).map((e) => e.needs.reduce((a, n) => a + n[1], 0)) };
    }
    const eligible = (it) => !!it && (it.type === 'equipment' || it.type === 'tool') && it.name !== 'Coins' && !!DB()[it.name];

    function blockReason(item) {
        if (!ready()) return 'Jogo ainda não carregou.';
        if (item && (item.mimic || item.mimicBox)) return 'Itens Mímicos não podem ser desmanchados: evoluem com você.';
        if (!eligible(item)) return 'Este item não pode ser desmanchado.';
        if (player.equipment && Object.keys(player.equipment).some((k) => player.equipment[k] === item)) return 'Desequipe o item antes de desmanchar.';
        if (player.inventory.indexOf(item) < 0) return 'Esse item não está na mochila.';
        try { const s = window.Net && Net.state && Net.state(); if ((s && s.trade) || player.escrow) return 'Termine ou cancele a troca antes de desmanchar.'; } catch (e) { }
        try { if (typeof isBankOpen !== 'undefined' && isBankOpen) return 'Feche o banco antes de desmanchar.'; } catch (e) { }
        return '';
    }

    function preview(item, batches) {
        const why = blockReason(item); const r = { ok: false, why, give: [], ench: 0, batch: 1, maxBatches: 1 };
        if (why) return r;
        const base = DB()[item.name] || item, ench = Math.max(0, Math.floor(Number(item.ench || 0)) || 0); r.ench = ench;
        const stack = !!item.stackable, per = stack ? Math.max(1, parseInt(base.craftQty) || 1) : 1; r.batch = per;
        r.maxBatches = stack ? Math.floor((item.qty || 1) / per) : 1;
        if (r.maxBatches < 1) { r.why = 'Precisa de pelo menos ' + per + ' unidades para desmanchar (um lote).'; return r; }
        const k = Math.max(1, Math.min(r.maxBatches, Math.floor(Number(batches)) || 1)); r.k = k;
        let mats = parse(base.recipe), fromScrap = false;
        if (!mats.length) { mats = scrapMats(item) || []; fromScrap = true; }
        const acc = {};
        const add = (n, q) => { if (q > 0) acc[n] = (acc[n] || 0) + q; };
        if (mats.length) {
            const frac = ench > 0 ? RATE_ENCH : RATE;
            mats.forEach((m) => add(m.n, Math.floor(m.q * k * frac)));
            const total = mats.reduce((a, m) => a + m.q, 0);
            if (!ench && !Object.keys(acc).length && total >= 2) add(mainOf(mats).n, 1);   // mínimo: 1 do material principal
        }
        if (ench > 0) {
            const eu = enchantUnits(ench); let dust = 0; eu.perLevel.forEach((u) => { dust += 1 + Math.floor(u * DUST_FRAC); }); if (DB()['Pó Arcano'] && dust > 0) add('Pó Arcano', dust);
        }
        r.give = Object.keys(acc).map((n) => ({ name: n, qty: acc[n] }));
        if (!r.give.length) { r.why = mats.length ? 'Rende menos de 1 material: não vale desmanchar (se não quiser, jogue fora).' : 'Este item não tem receita nem material conhecido: não dá para desmanchar.'; return r; }
        r.ok = true; r.fromScrap = fromScrap; return r;
    }
    const can = (item) => eligible(item) && !(item.mimic || item.mimicBox);

    // desmancha de verdade (tudo ou nada). Devolve { ok, give, msg }
    function run(item, batches) {
        const p = preview(item, batches); if (!p.ok) { say(p.why); return { ok: false, msg: p.why, give: [] }; }
        const snap = JSON.stringify(player.inventory), stack = !!item.stackable, units = stack ? p.k * p.batch : 1;
        const idx = player.inventory.indexOf(item);
        // tira o item (ou os lotes) da mochila
        if (stack && (item.qty || 1) > units) item.qty -= units; else player.inventory.splice(idx, 1);
        let ok = true; for (const g of p.give) { if (!addInvItem(g.name, g.qty)) { ok = false; break; } }
        if (!ok) { const back = JSON.parse(snap); player.inventory.length = 0; back.forEach((x) => player.inventory.push(x)); const m = 'Mochila sem espaço para o que você receberia. Nada foi desmanchado.'; say(m); try { updateUI(); } catch (e) { } return { ok: false, msg: m, give: [] }; }
        if (player.actionToolItem === item) { player.isPerformingAction = false; player.pendingAutoAction = null; player.actionToolItem = null; }
        const txt = p.give.map((g) => fn(g.qty) + '× ' + g.name).join(', ');
        const msg = 'Desmanchou ' + (stack && units > 1 ? fn(units) + '× ' : '') + item.name + (p.ench ? ' (+' + p.ench + ')' : '') + ': recebeu ' + txt + '.';
        say(msg, '#2ecc71'); try { if (window.Sfx) Sfx.play('pickup'); } catch (e) { }
        try { hideTooltip(); } catch (e) { } try { if (window.ItemSel) ItemSel.clear(); } catch (e) { } try { updateUI(); saveDataLogic(); } catch (e) { }
        return { ok: true, msg, give: p.give, units };
    }

    /* ---------- janela de confirmação ---------- */
    let askKey = null;
    function ask(item) {
        const why = blockReason(item); if (why) { say(why); return; }
        let p = preview(item, 1); if (!p.ok) { say(p.why); return; }
        let k = 1; let ic = ''; try { ic = Icons.html(item.name, 38); } catch (e) { }
        const rows = (pp) => pp.give.map((g) => { let i = ''; try { i = Icons.html(g.name, 24); } catch (e) { } return `<div style="display:flex;align-items:center;gap:6px;font-size:.85rem">${i}<b style="color:#8fe39f">${fn(g.qty)}×</b> ${esc(g.name)}</div>`; }).join('');
        const stack = p.maxBatches > 1 || (item.stackable && p.batch > 1);
        const html = () => `<h3 style="margin:0;color:#f1c40f">Desmanchar</h3><div style="display:flex;align-items:center;gap:10px">${ic}<div style="min-width:0"><b>${esc(item.name)}${p.ench ? ' <span style="color:#c9a6ff">+' + p.ench + '</span>' : ''}</b><div style="font-size:.74rem;opacity:.8">${item.stackable ? 'Você tem ' + fn(item.qty || 1) + ' (lote de ' + p.batch + ')' : 'Este item será destruído.'}</div></div></div>` +
            (item.stackable && p.maxBatches > 1 ? `<div style="display:flex;gap:6px;align-items:center;justify-content:center"><button type="button" id="rc-m" class="qty-b" style="min-width:44px;min-height:44px;font-size:1.2rem">−</button><div id="rc-k" style="min-width:90px;text-align:center;font-weight:700">${k} lote(s) = ${fn(k * p.batch)}</div><button type="button" id="rc-p" class="qty-b" style="min-width:44px;min-height:44px;font-size:1.2rem">+</button><button type="button" id="rc-x" class="qty-b" style="min-height:44px;padding:0 10px">Máx</button></div>` : '') +
            `<div style="background:rgba(0,0,0,.3);border:1px solid #5a4020;border-radius:10px;padding:8px"><div style="font-size:.78rem;color:#e8c469;margin-bottom:4px">Você receberá:</div>${rows(p)}</div>` +
            `<div style="font-size:.7rem;opacity:.75">${p.ench ? 'O encantamento será perdido e só uma parte dos materiais volta.' : 'Só uma parte dos materiais volta (menos que o custo de fabricação).'}</div>` +
            `<div style="display:flex;gap:8px"><button type="button" id="rc-no" style="flex:1;padding:9px;border-radius:999px;background:#2b2118;color:#ddd;border:1px solid #6a4c22;cursor:pointer;min-height:44px">Cancelar</button><button type="button" id="rc-ok" class="btn-craft" style="flex:1.4;margin-top:0;min-height:44px">Desmanchar</button></div>`;
        const draw = () => {
            openModal(html()); const box = $('custom-modal-box'); box.dataset.social = '0'; box.dataset.hub = ''; box.dataset.trade = ''; box.dataset.inv2 = ''; box.dataset.rc = '1'; box.style.cssText = '';
            box.querySelectorAll('.qty-b').forEach((b) => { b.style.cssText += ';border-radius:10px;background:#3a291a;color:#e8c469;border:1px solid #6a4c22;cursor:pointer'; });
            const re = (nk) => { k = Math.max(1, Math.min(p.maxBatches, nk)); p = preview(item, k); if (!p.ok) { bye(); say(p.why); return; } draw(); };
            if ($('rc-m')) { $('rc-m').onclick = () => re(k - 1); $('rc-p').onclick = () => re(k + 1); $('rc-x').onclick = () => re(p.maxBatches); }
            $('rc-no').onclick = bye; $('rc-ok').onclick = () => { const kk = k; bye(); run(item, kk); };
        };
        const bye = () => { document.removeEventListener('keydown', onKey, true); const bx = $('custom-modal-box'); if (bx) bx.dataset.rc = ''; try { closeModal(); } catch (e) { } };
        const onKey = (e) => { const bx = $('custom-modal-box'); if (!bx || bx.dataset.rc !== '1') { document.removeEventListener('keydown', onKey, true); return; } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); bye(); } else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); const kk = k; bye(); run(item, kk); } };
        document.addEventListener('keydown', onKey, true); draw();
    }

    window.Recycle = { can, preview, run, ask, blockReason, RATE, RATE_ENCH };
})();
