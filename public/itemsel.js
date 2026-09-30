/* MiniScape 2D — proteção contra clique acidental na mochila.
   Com "Confirmar uso de itens" ligado (padrão, em Menu), um clique simples num item (ou num slot equipado) só o SELECIONA e mostra uma barra de ação
   embaixo da grade: [Usar/Comer/Equipar...] [Jogar fora] [Cancelar]. Duplo clique / duplo toque usa direto. Esc, clicar fora ou trocar de aba limpa a seleção.
   Arrastar (inv2.js) não seleciona nem usa. Desligado, volta ao clique direto. A barra rápida (1–5) continua usando direto (o jogador a montou de propósito). */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const KEY = 'ms_confirm_use', DBL_MS = 450, ARM_MS = 4000;
    let enabled = true; try { if (localStorage.getItem(KEY) === '0') enabled = false; } catch (e) { }
    let sel = null;              // { kind: 'inv', ref: item } | { kind: 'eq', slot }
    let last = { ref: null, t: 0 };
    let armKey = null, armT = 0;
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const say = (t, c) => { try { setActionText(t, c || '#e74c3c'); } catch (e) { } };
    const ready = () => typeof player !== 'undefined' && player && Array.isArray(player.inventory) && player.equipment;
    const modalOpen = () => { const o = $('custom-modal-overlay'); return !!o && o.style.display !== 'none' && o.style.display !== ''; };
    const bankOpen = () => typeof isBankOpen !== 'undefined' && isBankOpen;

    /* ---------- o que o botão principal faz com cada item ---------- */
    function primary(item) {
        if (!item) return null;
        if (item.type === 'equipment') return item.slot && player.equipment && item.slot in player.equipment ? { label: item.slot === 'ammo' ? 'Equipar munição' : 'Equipar' } : null;
        if (item.type === 'consumable') {
            if (item.name === 'Bones') return { label: 'Enterrar' };
            if (item.buff || item.mp > 0 || /potion|po[cç][aã]o/i.test(item.name)) return { label: 'Beber' };
            return { label: item.heal > 0 ? 'Comer' : 'Usar' };
        }
        if (item.name === 'Tinderbox') return { label: 'Acender fogueira' };
        if (item.bait && window.Fishing) return { label: player.bait === item.name ? 'Isca automática' : 'Escolher isca' };
        if (item.name === 'Knife') return { label: 'Usar' };
        return null;
    }
    function info(item) {
        const a = [];
        if (item.bonusDmg) a.push('Dano +' + item.bonusDmg); if (item.defBonus) a.push('Defesa +' + item.defBonus); if (item.heal) a.push('Cura ' + item.heal + ' HP'); if (item.mp) a.push('+' + item.mp + ' MP'); if (item.ench) a.push('Encantado +' + item.ench);
        return a.join(' · ');
    }

    /* ---------- barra de ação ---------- */
    function barEl(kind) {
        let b = $('isel-' + kind); if (b) return b;
        const host = $(kind === 'inv' ? 'tab-inv' : 'tab-eq'); if (!host) return null;
        b = document.createElement('div'); b.id = 'isel-' + kind; b.className = 'isel'; b.style.display = 'none'; host.appendChild(b);
        b.addEventListener('click', onBar); return b;
    }
    function current() {   // { item, idx } do que está selecionado (ou null)
        if (!sel || !ready()) return null;
        if (sel.kind === 'inv') { const i = player.inventory.indexOf(sel.ref); return i < 0 ? null : { item: sel.ref, idx: i }; }
        const it = player.equipment[sel.slot]; return it ? { item: it, slot: sel.slot } : null;
    }
    function render() {
        try {
            const bi = barEl('inv'), be = barEl('eq'); if (!bi || !be) return;
            const c = current(); if (sel && !c) sel = null;
            // destaque do slot selecionado
            document.querySelectorAll('.isel-on').forEach((n) => n.classList.remove('isel-on'));
            if (!c) { bi.style.display = be.style.display = 'none'; bi._sig = be._sig = ''; return; }
            const bar = c.slot ? be : bi, other = c.slot ? bi : be; other.style.display = 'none'; other._sig = '';
            if (c.slot) { const el = $('eq-' + c.slot); if (el && el.parentElement) el.parentElement.classList.add('isel-on'); }
            else { const g = $('inv-grid'); if (g && g.children[c.idx]) g.children[c.idx].classList.add('isel-on'); }
            const p = c.slot ? { label: 'Desequipar' } : primary(c.item);
            const sig = [c.item.name, c.item.qty || 1, p ? p.label : '-', c.slot || 'i'].join('|');
            if (bar._sig !== sig || bar.style.display === 'none') {
                bar._sig = sig; let ic = ''; try { ic = Icons.html(c.item.name, 34); } catch (e) { }
                const q = c.item.stackable && c.item.qty > 1 ? '×' + c.item.qty : '', inf = info(c.item);
                const sub = [q, inf, p ? '' : 'sem uso direto'].filter(Boolean).join(' · ');
                bar.innerHTML = `<div class="isel-top"><span class="isel-ic">${ic}</span><div class="isel-tx"><b>${esc(c.item.name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div></div>` +
                    `<div class="isel-btns">${p ? `<button type="button" class="isel-go" data-a="${c.slot ? 'unequip' : 'use'}">${esc(p.label)}</button>` : ''}${c.slot ? '' : '<button type="button" class="isel-drop" data-a="drop">Jogar fora</button>'}<button type="button" class="isel-x" data-a="cancel">Cancelar</button></div>` +
                    (p && !c.slot ? '<div class="isel-hint">Dica: clique duplo usa direto.</div>' : '');
            }
            bar.style.display = '';
        } catch (e) { }
    }
    function clear() { sel = null; last = { ref: null, t: 0 }; render(); }
    function select(s) { sel = s; render(); try { hideTooltip(); } catch (e) { } }

    /* ---------- ações ---------- */
    function doUse() {
        const c = current(); if (!c || c.slot) return; const p = primary(c.item);
        if (!p) { say('Este item não tem uso direto.', '#bdc3c7'); return; }
        if (bankOpen()) { say('Feche o banco para usar itens.'); return; }
        const it = c.item, d = (typeof itemDB !== 'undefined' && itemDB[it.name]) || it;
        if (it.type === 'consumable' && d.heal > 0 && player.stats.hp >= player.stats.maxHp && !(d.mp > 0) && !d.buff && it.name !== 'Bones') { say('Você já está com a vida cheia.'); return; }
        useItem(c.idx);
        // continua selecionado só se ainda houver o mesmo item (comer/beber de novo, trocar de isca); senão limpa
        if (!(player.inventory.indexOf(it) >= 0 && (it.type === 'consumable' || it.bait))) sel = null;
        render();
    }
    function onBar(ev) {
        const b = ev.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a, c = current();
        if (a === 'cancel') { clear(); return; }
        if (!c) { clear(); return; }
        if (a === 'use') doUse();
        else if (a === 'unequip') { const s = c.slot; unequip(s); clear(); }
        else if (a === 'drop') { if (window.Inv2) Inv2.ask(c.item); else say('Arraste o item para fora do painel para jogá-lo.'); }
    }
    function click(i) {    // clique num slot da mochila
        if (!ready()) return; const item = player.inventory[i]; if (!item) { clear(); return; }
        const n = performance.now();
        if (last.ref === item && n - last.t < DBL_MS) { last = { ref: null, t: 0 }; sel = { kind: 'inv', ref: item }; doUse(); return; }   // clique duplo: usa direto
        last = { ref: item, t: n };
        if (sel && sel.kind === 'inv' && sel.ref === item) { sel = null; render(); } else select({ kind: 'inv', ref: item });   // (sem clear(): ele zera o registro do clique duplo)
    }
    function clickEq(slot) {
        if (!ready()) return; const item = player.equipment[slot]; if (!item) { clear(); return; }
        const n = performance.now();
        if (last.eq === slot && n - last.t < DBL_MS) { last = { ref: null, t: 0 }; unequip(slot); clear(); return; }
        last = { ref: null, eq: slot, t: n };
        if (sel && sel.kind === 'eq' && sel.slot === slot) { sel = null; render(); } else select({ kind: 'eq', slot });
    }
    // confirmação leve em dois toques (compras caras): devolve true no segundo toque (em até 4 s) na mesma chave
    function arm(key) {
        if (!enabled) return true; const n = Date.now();
        if (armKey === key && n - armT < ARM_MS) { armKey = null; return true; }
        armKey = key; armT = n; return false;
    }
    function set(v) { enabled = !!v; try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch (e) { } if (!enabled) clear(); const cb = $('cfg-confirm'); if (cb) cb.checked = enabled; }

    /* ---------- menu (configurações) e estilo ---------- */
    function panel() {
        const host = $('tab-cfg'); if (!host || $('isel-panel')) return;
        const d = document.createElement('div'); d.id = 'isel-panel'; d.className = 'book-page'; d.style.margin = '10px 0';
        d.innerHTML = `<h3 style="margin:0 0 6px">Mochila</h3><label class="aud-row" style="cursor:pointer"><input type="checkbox" id="cfg-confirm" ${enabled ? 'checked' : ''}><span style="width:auto">Confirmar uso de itens</span></label><div style="font-size:.7rem;opacity:.75">Ligado: um clique só seleciona; use pelo botão ou com clique duplo. Desligado: um clique usa direto.</div>`;
        const first = host.querySelector('button'); if (first && first.nextSibling) host.insertBefore(d, first.nextSibling); else host.appendChild(d);
        $('cfg-confirm').addEventListener('change', (e) => set(e.target.checked));
    }
    function init() {
        const st = document.createElement('style');
        st.textContent = '.item-slot.isel-on,.equip-slot-box.isel-on{box-shadow:inset 0 0 0 2px #f1c40f,0 0 12px rgba(241,196,15,.65)!important;transform:none!important}' +
            '.isel{position:sticky;bottom:0;margin-top:10px;padding:8px 9px;border-radius:12px;background:linear-gradient(#2c1e12,#170f08);border:1px solid #e8c469;box-shadow:0 -6px 14px rgba(0,0,0,.55);z-index:5}' +
            '.isel-top{display:flex;align-items:center;gap:9px;margin-bottom:7px}.isel-ic{width:38px;height:38px;flex:none;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35);border:1px solid #000;border-radius:8px}.isel-ic .ic-item{width:32px;height:32px}' +
            '.isel-tx{min-width:0;display:flex;flex-direction:column}.isel-tx b{color:#f4e3b0;font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.isel-tx small{color:#bfae86;font-size:.72rem}' +
            '.isel-btns{display:flex;gap:6px}.isel-btns button{flex:1;min-height:44px;padding:6px 8px;border-radius:999px;border:1px solid #000;cursor:pointer;font-weight:700;font-size:.82rem;font-family:inherit;color:#e9dcc0;background:linear-gradient(#4a3520,#2a1c0f)}' +
            '.isel-btns .isel-go{flex:1.6;color:#2b1a05;background:linear-gradient(#f0cf7c,#b98a2e)}.isel-btns .isel-drop{color:#ffb2a4;background:linear-gradient(#4a1f1a,#2a100d)}.isel-btns button:active{filter:brightness(1.2)}' +
            '.isel-hint{margin-top:5px;font-size:.66rem;color:#9d8e6b;text-align:center}' +
            '@media(max-width:850px){.isel{position:fixed;left:8px;right:8px;bottom:64px;margin:0;z-index:103;box-shadow:0 4px 18px rgba(0,0,0,.8)}.isel-hint{display:none}.isel-top{margin-bottom:5px}}';
        document.head.appendChild(st);
        barEl('inv'); barEl('eq');
        // clicar fora (mundo, outra aba, espaço vazio) e Esc limpam a seleção
        document.addEventListener('click', (e) => {
            if (!sel) return; const t = e.target; if (!t || !t.closest || !t.isConnected) return;   // alvo já trocado por uma atualização da barra: era clique nela
            if (t.closest('#isel-inv,#isel-eq,#custom-modal-overlay')) return;
            const slot = t.closest('#inv-grid .item-slot'); if (slot && slot.children.length) return;
            if (t.closest('.equip-slot-box') && sel.kind === 'eq') return;
            clear();
        });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sel && !modalOpen()) clear(); });
        window.addEventListener('load', () => {   // openTab nasce no script do index.html (depois deste arquivo)
            const ot = window.openTab; if (typeof ot === 'function') window.openTab = function (tab) { if (sel && !(tab === 'inv' && sel.kind === 'inv') && !(tab === 'eq' && sel.kind === 'eq')) clear(); return ot.apply(this, arguments); };
            panel();
        });
        panel();
    }
    window.ItemSel = { on: () => enabled, set, click, clickEq, clear, render, arm, get selected() { return sel ? (sel.kind === 'inv' ? sel.ref && sel.ref.name : sel.slot) : null; } };
    if (document.body) init(); else window.addEventListener('DOMContentLoaded', init);
})();
