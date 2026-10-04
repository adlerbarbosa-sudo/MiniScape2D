/* MiniScape 2D — PRESTÍGIO. Duas camadas:
   1) Prestígio da PERÍCIA (aqui): perícia no nível 99 -> "Prestigiar": a perícia volta ao nível 1 (XP 0) e ganha 1 estrela (até 5). Cada estrela dá +10% de XP nessa perícia, para sempre.
      Se a perícia é de uma árvore (Combate/Arquearia/Magia), os pontos dessa árvore são zerados (os Prestígios de habilidade já conquistados ficam, mas só valem com o rank máximo de novo). Vitalidade não prestigia.
   2) Prestígio da HABILIDADE (skilltree.js): rank máximo -> botão ✦ Prestigiar na árvore: efeitos em dobro, menos mana.
   Estado: player.prestige = { perícia: estrelas }. O servidor (security.js) só aceita +1 estrela por vez, com a perícia no 99 no save anterior. */
(function () {
    'use strict';
    const MAXS = 5, PCT = 0.10, $ = (id) => document.getElementById(id);
    const ok = () => typeof player !== 'undefined' && player && player.stats && player.stats.skills;
    const stars = (k) => { const p = ok() && player.prestige; return p && typeof p === 'object' ? Math.max(0, Math.min(MAXS, p[k] | 0)) : 0; };
    const xpMul = (k) => 1 + PCT * stars(k);
    const can = (k) => { if (!ok() || k === 'hp') return false; const s = player.stats.skills[k]; return !!s && s.level >= 99 && stars(k) < MAXS; };
    const TREE_OF = { combat: 'warrior', ranged: 'archer', magic: 'mage' };
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const nm = (k) => { try { return Labels.skill(k, player.stats.skills[k].name); } catch (e) { return (player.stats.skills[k] && player.stats.skills[k].name) || k; } };
    async function doPrestige(k) {
        if (!can(k)) return { ok: false, msg: 'Chegue ao nível 99 para prestigiar.' };
        try { await saveDataNow(true); } catch (e) { }   // o servidor precisa ter o nível 99 salvo antes de aceitar a estrela
        const sk = player.stats.skills[k], old = sk.level;
        if (!player.prestige || typeof player.prestige !== 'object') player.prestige = {};
        player.prestige[k] = stars(k) + 1; sk.xp = 0; sk.level = 1; sk.next = Balance.xpNext(1);
        if (k === 'magic') { player.stats.maxMp = Math.max(Balance.MIN_MP, player.stats.maxMp - Balance.MP_PER_LEVEL * (old - 1)); player.stats.mp = Math.min(player.stats.mp, player.stats.maxMp); }
        try { if (TREE_OF[k] && window.SkillTree) SkillTree.prestigeReset(TREE_OF[k]); } catch (e) { console.error(e); }
        try { Stats.invalidate(); updateUI(); Art.burst(player.x, player.y - 16, '#ffd24a', 24, 2); addFloatingText(player.x, player.y - 50, '✦ Prestígio!', '#ffd24a'); setActionText(nm(k) + ': Prestígio ' + player.prestige[k] + '! +' + Math.round(PCT * 100 * player.prestige[k]) + '% de XP.', '#ffd24a'); } catch (e) { }
        try { await saveDataNow(true); } catch (e) { }
        return { ok: true };
    }
    function render() {
        if (!ok()) return; const keys = Object.keys(player.stats.skills).filter((k) => k !== 'hp');
        let h = '<h3 style="margin:0 0 4px;color:#ffd24a">✦ Prestígio</h3><div style="font-size:.78rem;opacity:.85;margin-bottom:6px">No nível 99 você pode recomeçar a perícia: ela volta ao nível 1, ganha uma estrela (+10% de XP nessa perícia, até 5 estrelas) e, se tiver árvore de habilidades, os pontos dela são zerados. Habilidades com rank máximo ganham o botão ✦ Prestigiar na árvore (K).</div><div style="max-height:46vh;overflow:auto">';
        keys.forEach((k) => { const s = player.stats.skills[k], st = stars(k); h += `<div style="display:flex;align-items:center;gap:6px;margin:3px 0;padding:3px 6px;background:#0004;border:1px solid #6a4a1a;border-radius:6px"><b style="flex:1">${esc(nm(k))}</b><small>nv ${s.level}</small><span style="color:#ffd24a;min-width:64px;text-align:right">${'✦'.repeat(st)}${'<span style="opacity:.25">✦</span>'.repeat(MAXS - st)}</span><button class="soc-b" data-pk="${esc(k)}" ${can(k) ? '' : 'disabled'}>Prestigiar</button></div>`; });
        h += '</div><div style="text-align:right;margin-top:8px"><button class="soc-b" onclick="closeModal()">Fechar</button></div>';
        openModal(h); const b = $('custom-modal-box'); if (!b) return; b.dataset.social = '1';
        b.onclick = (ev) => { const t = ev.target.closest('button[data-pk]'); if (!t || t.disabled) return; const k = t.dataset.pk; confirmBox(k); };
    }
    function confirmBox(k) {
        const tr = TREE_OF[k];
        openModal(`<h3 style="margin:0 0 6px;color:#ffd24a">Prestigiar ${esc(nm(k))}?</h3><p style="font-size:.85rem">A perícia volta ao <b>nível 1</b>${tr ? ' e os <b>pontos da árvore</b> são zerados (você escolhe de novo)' : ''}. Em troca: <b>+${Math.round(PCT * 100)}% de XP</b> nessa perícia para sempre (estrela ${stars(k) + 1} de ${MAXS}).</p><div style="text-align:right"><button class="soc-b ok" id="pr-yes">Prestigiar</button><button class="soc-b" id="pr-no">Cancelar</button></div>`);
        const b = $('custom-modal-box'); if (b) b.dataset.social = '1';
        $('pr-yes').onclick = async () => { closeModal(); await doPrestige(k); }; $('pr-no').onclick = () => { closeModal(); render(); };
    }
    function inject() {   // botão "Prestígio" no painel de perícias e na árvore de habilidades
        try {
            const sl = $('skills-list'); if (sl && !$('pr-open')) { const b = document.createElement('button'); b.id = 'pr-open'; b.className = 'soc-b'; b.textContent = '✦ Prestígio'; b.style.cssText = 'margin:4px 0;color:#ffd24a;border-color:#ffd24a'; b.onclick = render; sl.parentNode.insertBefore(b, sl); }
            const ft = $('sk-ft-r'); if (ft && !$('pr-open2')) { const b = document.createElement('button'); b.id = 'pr-open2'; b.type = 'button'; b.className = 'sk-b'; b.textContent = '✦ Prestígio'; b.style.cssText = 'color:#ffd24a;border-color:#ffd24a'; b.onclick = render; ft.appendChild(b); }
        } catch (e) { }
    }
    setInterval(inject, 1500);
    window.Prestige = { stars, xpMul, can, open: render, doPrestige };
})();
