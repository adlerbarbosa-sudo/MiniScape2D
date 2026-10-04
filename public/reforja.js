/* MiniScape 2D — REFORJA DAS FENDAS: raridade e afixos em equipamentos, pagos com Fragmentos de Fenda.
   Em vez de depender da sorte de um drop, o jogador escolhe uma peça (equipada ou da mochila) e "reforja": a peça ganha de 1 a 4 afixos sorteados
   (Incomum 1 · Raro 2 · Épico 3 · Lendário 4). Dá para TRAVAR 1 afixo bom (custa mais) e reforjar o resto. Garantia: depois de 10 reforjas seguidas sem chegar a 3 afixos, a próxima chega.
   Os afixos são campos comuns do item (crit, lifesteal, atkSpd...), já lidos por Stats e saneados pelo servidor (ITEM_CAPS); `rar` (1-4), `aff` ([[campo, valor], ...]) e `pt` (garantia) ficam na peça.
   A UI mora na aba "Reforja" do painel das Fendas (fendas.js). Preço: 5 fragmentos + moedas por reforja; +5 fragmentos por afixo travado. */
(function () {
    'use strict';
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const SHARD = 'Fragmento de Fenda';
    const RAR = [null, { n: 'Incomum', c: '#5ec96b' }, { n: 'Raro', c: '#4aa8ff' }, { n: 'Épico', c: '#b07aff' }, { n: 'Lendário', c: '#ffb83a' }];
    // campo: [nome, mín, máx, fatias onde pode sair, rótulo]
    const AFF = {
        crit: ['Preciso', 2, 6, 'wja', 'Crítico', '%'], critDmg: ['Letal', 10, 30, 'wja', 'Dano crítico', '%'], lifesteal: ['Vampírico', 1, 3, 'wjab', 'Roubo de vida', '%'],
        luck: ['Afortunado', 3, 10, 'wjab', 'Sorte', '%'], moveSpd: ['Veloz', 3, 8, 'jab', 'Velocidade', '%'], atkSpd: ['Ágil', 3, 8, 'wj', 'Vel. de ataque', '%'],
        dr: ['Resistente', 2, 6, 'jab', 'Redução de dano', '%'], spellDmg: ['Arcano', 4, 12, 'mj', 'Dano mágico', '%'], bonusDmg: ['Cortante', 2, 6, 'w', 'Dano', ''],
        defBonus: ['Reforçado', 1, 4, 'ab', 'Defesa', ''], save: ['Econômico', 3, 10, 'mr', 'Poupar munição/runa', '%']
    };
    const SLOTKIND = { weapon: 'w', head: 'a', body: 'a', legs: 'a', shield: 'a', boots: 'a', gloves: 'a', cape: 'a', amulet: 'j', ring: 'j' };
    const kindOf = (it) => { const k = SLOTKIND[it && it.slot] || null; if (k === 'w') return 'w' + (it.tool === 'magic' ? 'm' : it.tool === 'ranged' ? 'r' : ''); return k; };
    const eligible = (it) => !!(it && it.type === 'equipment' && !it.stackable && !it.mimic && kindOf(it) && it.slot !== 'ammo' && (!it.tool || it.tool === 'ranged' || it.tool === 'magic'));   // ferramentas (picareta, machado) não
    const power = (it) => { const b = (window.itemDB && itemDB[it.name]) || it; return (Number(b.bonusDmg) || 0) + (Number(b.defBonus) || 0) * 2; };
    const scale = (it) => Math.max(0.5, Math.min(1.8, 0.5 + power(it) / 25));
    const rarOf = (it) => Math.max(0, Math.min(4, (it && it.rar) | 0));
    const affOf = (it) => (Array.isArray(it && it.aff) ? it.aff.filter((a) => Array.isArray(a) && AFF[a[0]] && Number.isFinite(a[1])) : []);
    const cost = (it, locks) => ({ shards: 5 + 5 * locks, coins: Math.round(250 + 20 * power(it)) });

    function pickCount(it) {
        const pt = Math.max(0, (it.pt | 0));
        if (pt >= 10) return Math.random() < 0.8 ? 3 : 4;
        const w = [0, 50, 33 + pt * 2, 13 + pt * 2, 4 + (pt > 5 ? 1 : 0)], tot = w[1] + w[2] + w[3] + w[4]; let r = Math.random() * tot;
        for (let n = 1; n <= 4; n++) { if ((r -= w[n]) < 0) return n; } return 1;
    }
    function rollAffix(it, taken) {
        const k = kindOf(it), keys = Object.keys(AFF).filter((f) => [...AFF[f][3]].some((c) => k.includes(c)) && !taken.includes(f)); if (!keys.length) return null;
        const f = keys[Math.floor(Math.random() * keys.length)], a = AFF[f], s = scale(it), lo = a[1] * s, hi = a[2] * s;
        let v = Math.round(lo + Math.random() * (hi - lo)); v = Math.max(1, v); return [f, v];
    }
    function strip(it) { affOf(it).forEach((a) => { it[a[0]] = (Number(it[a[0]]) || 0) - a[1]; if (it[a[0]] <= 0 && !((itemDB[it.name] || {})[a[0]])) delete it[a[0]]; }); it.aff = []; it.rar = 0; }
    function reforge(it, lockIdx) {
        if (!eligible(it)) return { ok: false, msg: 'Esta peça não aceita reforja.' };
        const old = affOf(it), keep = old.filter((a, i) => lockIdx.includes(i)).slice(0, 1), c = cost(it, keep.length);
        if (getInvCount(SHARD) < c.shards) return { ok: false, msg: 'Faltam Fragmentos de Fenda (' + c.shards + ').' };
        if (getInvCount('Coins') < c.coins) return { ok: false, msg: 'Faltam moedas (' + c.coins + ').' };
        removeInvItem(SHARD, c.shards); removeInvItem('Coins', c.coins);
        strip(it); const n = Math.max(pickCount(it), keep.length), next = []; const taken = [];
        keep.forEach((a) => { next.push(a); taken.push(a[0]); });
        while (next.length < n) { const a = rollAffix(it, taken); if (!a) break; next.push(a); taken.push(a[0]); }
        next.forEach((a) => { it[a[0]] = (Number(it[a[0]]) || 0) + a[1]; }); it.aff = next; it.rar = next.length; it.pt = next.length >= 3 ? 0 : Math.min(30, (it.pt | 0) + 1);
        return { ok: true, rar: it.rar, msg: RAR[it.rar] ? RAR[it.rar].n + '!' : '' };
    }

    /* ---------- peças candidatas ---------- */
    function list() {
        const out = [];
        try { Object.keys(player.equipment || {}).forEach((s) => { const it = player.equipment[s]; if (eligible(it)) out.push({ src: 'eq:' + s, it, eq: true }); }); } catch (e) { }
        try { (player.inventory || []).forEach((it, i) => { if (eligible(it)) out.push({ src: 'inv:' + i, it, eq: false }); }); } catch (e) { }
        return out;
    }
    const resolve = (src) => { const [w, k] = String(src).split(':'); return w === 'eq' ? player.equipment[k] : player.inventory[+k]; };
    const affTxt = (a) => { const d = AFF[a[0]]; return d ? '<span style="color:#cdb8f5">' + esc(d[0]) + '</span> ' + d[4] + ' +' + a[1] + d[5] : ''; };
    const nameHtml = (it) => '<b style="color:' + (RAR[rarOf(it)] ? RAR[rarOf(it)].c : '#e6d8ff') + '">' + esc(it.name) + '</b>' + (rarOf(it) ? ' <small style="color:' + RAR[rarOf(it)].c + '">' + RAR[rarOf(it)].n + '</small>' : '') + (it.ench ? ' <small>+' + it.ench + '</small>' : '');

    /* ---------- UI (aba do painel das Fendas) ---------- */
    const S = { sel: null, locks: [], msg: '' };
    function html() {
        const items = list(), shards = getInvCount(SHARD), coins = getInvCount('Coins');
        let h = '<p style="margin:0 0 6px">Reforje equipamentos com <b>Fragmentos de Fenda</b>: a peça ganha de 1 a 4 afixos (Incomum → Lendário). Gostou de um afixo? <b>Trave-o</b> e reforje o resto.</p><p style="margin:0 0 8px">🔮 <b>' + shards + '</b> fragmentos · 🪙 ' + coins + '</p>';
        if (S.msg) h += '<p style="color:#ffd27a;margin:0 0 6px">' + esc(S.msg) + '</p>';
        if (!items.length) return h + '<p style="opacity:.8">Você não tem equipamento que aceite reforja (armas, armaduras e joias).</p>';
        const cur = S.sel ? resolve(S.sel) : null;
        h += '<div style="max-height:150px;overflow:auto;border:1px solid #4a3270;border-radius:6px;margin-bottom:8px">' + items.map((o) => '<div data-rsel="' + o.src + '" style="padding:4px 8px;cursor:pointer;border-bottom:1px solid #3a2a58;' + (S.sel === o.src ? 'background:#4a2f7a' : '') + '">' + nameHtml(o.it) + (o.eq ? ' <small style="opacity:.7">(equipado)</small>' : '') + '</div>').join('') + '</div>';
        if (cur && eligible(cur)) {
            const aff = affOf(cur), c = cost(cur, Math.min(1, S.locks.length));
            h += '<div style="background:#1d1230;border:1px solid #4a3270;border-radius:8px;padding:8px"><div>' + nameHtml(cur) + '</div>' + (aff.length ? aff.map((a, i) => '<div style="margin:3px 0"><label style="cursor:pointer"><input type="checkbox" data-rlock="' + i + '" ' + (S.locks.includes(i) ? 'checked' : '') + '> ' + affTxt(a) + '</label></div>').join('') : '<div style="opacity:.75;margin:4px 0">Sem afixos ainda.</div>') +
                '<div style="margin-top:6px;opacity:.9">Custo: <b>' + c.shards + '</b> fragmentos + <b>' + c.coins + '</b> moedas' + (S.locks.length ? ' <small>(1 afixo travado)</small>' : '') + '</div><p style="margin:8px 0 0;text-align:center"><button class="go" data-rgo="1" style="padding:6px 16px">⚒ Reforjar</button></p>' + ((cur.pt | 0) > 0 ? '<div style="opacity:.65;font-size:12px;margin-top:4px">Garantia: ' + Math.min(10, cur.pt | 0) + '/10 reforjas até um resultado de 3+ afixos.</div>' : '') + '</div>';
        } else h += '<p style="opacity:.8">Escolha uma peça acima.</p>';
        return h;
    }
    function click(e) {   // true se tratou o clique (o painel redesenha)
        const t = e.target, row = t.closest && t.closest('[data-rsel]');
        if (row) { S.sel = row.dataset.rsel; S.locks = []; S.msg = ''; return true; }
        if (t.dataset && t.dataset.rlock !== undefined) { const i = +t.dataset.rlock; S.locks = t.checked ? [i] : []; return true; }
        if (t.dataset && t.dataset.rgo) {
            const it = S.sel ? resolve(S.sel) : null; if (!it) return true;
            const r = reforge(it, S.locks.slice()); S.msg = r.msg || ''; if (r.ok) { S.locks = []; try { if (window.Sfx) Sfx.play('enchant'); addFloatingText(player.x, player.y - 22, it.name + ' · ' + r.msg, RAR[r.rar] ? RAR[r.rar].c : '#c9a6ff'); } catch (er) { } try { Stats && Stats.invalidate && Stats.invalidate(); saveDataLogic(); updateUI(); } catch (er) { } }
            return true;
        }
        return false;
    }

    /* ---------- tooltip: cor da raridade e lista de afixos ---------- */
    function wireTip() {
        const orig = window.showTooltip; if (typeof orig !== 'function' || orig._rf) return;
        const w = function (item) {
            orig.apply(this, arguments);
            try {
                if (!item || !rarOf(item)) return; const tip = document.getElementById('tooltip'), ti = tip && tip.querySelector('.tt-title'); if (!ti) return; const r = RAR[rarOf(item)];
                ti.style.color = r.c; ti.insertAdjacentHTML('beforeend', ' <small style="font-weight:400">· ' + r.n + '</small>');
                tip.insertAdjacentHTML('beforeend', '<div class="tt-stat" style="color:' + r.c + ';margin-top:4px">' + affOf(item).map((a) => (AFF[a[0]] ? AFF[a[0]][0] + ' (' + AFF[a[0]][4] + ' +' + a[1] + AFF[a[0]][5] + ')' : '')).join('<br>') + '</div>');
            } catch (e) { }
        }; w._rf = true; window.showTooltip = w;
    }
    window.addEventListener('load', () => setTimeout(wireTip, 0));
    window.Reforja = { html, click, reforge, eligible, AFF, RAR, affOf, rarOf, list, cost, S };
})();
