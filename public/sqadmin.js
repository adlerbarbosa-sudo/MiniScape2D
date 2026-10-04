/* Painel do Dev: Missões Especiais (só admin; o servidor valida tudo de novo em /api/admin/specialquest).
   O admin cria uma missão (nome, descrição, objetivo e recompensa), ativa/desativa, edita, zera os resgates ou apaga.
   Objetivos: código secreto · matar N de uma espécie · entregar N de um item · chegar a um mapa. Recompensa: qualquer item do catálogo (inclusive Mímicos e aparências) ou moedas. */
(function () {
    'use strict';
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const $ = (id) => document.getElementById(id);
    const TYPES = { code: 'Código secreto', kill: 'Matar N de uma espécie', deliver: 'Entregar item', map: 'Chegar a um mapa' };
    let quests = [], built = false, editing = null;

    function init(tab, bar) {
        if (built || !tab || !bar) return; built = true;
        const btn = document.createElement('button'); btn.className = 'dev-sub-btn'; btn.id = 'btn-dev-sq'; btn.textContent = 'Eventos'; btn.style.color = '#c58bff'; btn.style.fontWeight = 'bold';
        btn.onclick = function () { openDevSub('dev-sq', btn); load(); }; bar.appendChild(btn);
        const box = document.createElement('div'); box.id = 'dev-sq'; box.className = 'dev-sub-content';
        box.innerHTML = `<h3 style="color:#c58bff;margin-top:0;border-bottom:1px solid #333;padding-bottom:5px">Eventos</h3>
<p style="font-size:.72rem;color:#bdc3c7;margin:4px 0">Ligue ou desligue os eventos do jogo. Desligado, o evento some para os jogadores (o servidor também recusa). Novos eventos entram aqui.</p>
<div id="ev-list" style="font-size:.78rem;margin-bottom:8px"></div>
<h4 style="color:#c58bff;margin:10px 0 2px">Missões Especiais</h4>
<p style="font-size:.72rem;color:#bdc3c7;margin:4px 0">Crie missões com recompensa exclusiva (inclusive peças e aparências Mímicas). Os jogadores veem as ativas no Diário (tecla J, aba Especiais) e resgatam 1 vez; o prêmio vai pelo correio. Objetivo e resgate são conferidos no servidor.</p>
<button id="sq-new" class="dev-save-btn" style="background:#8e44ad">+ Nova missão especial</button>
<div id="sq-status" style="font-size:.75rem;margin:4px 0"></div><div id="sq-list" style="font-size:.74rem"></div>`;
        tab.appendChild(box);
        $('sq-new').onclick = () => form(null);
        loadEv(); $('ev-list').addEventListener('click', (e) => { const b = e.target.closest('[data-ev]'); if (b) setEv(b.dataset.ev, b.dataset.on === '1'); });
        $('sq-list').addEventListener('click', onList);
    }
    const EVENTS = [['fenda', '🔮 Fenda Instável', 'Masmorra infinita em andares, com placar semanal e meta comunitária. Desligada: portal e botão somem.'], ['especiais', '🎁 Missões Especiais', 'Missões criadas por você (lista abaixo), no Diário > Especiais. Desligado: a aba some e os resgates são recusados.']];
    let tog = {};
    async function loadEv() { try { const r = await api('/admin/events'); if (r && r.ok) { tog = r.toggles || {}; window.EventToggles = tog; renderEv(); } } catch (e) { } }
    function renderEv() { const b = $('ev-list'); if (!b) return; b.innerHTML = EVENTS.map((e) => { const on = e[0] === 'fenda' ? tog.fenda === true : tog.especiais !== false; return `<div class="dev-ent-item" style="display:block;border-left:3px solid ${on ? '#2ecc71' : '#7f8c8d'};margin:4px 0;padding:6px"><b>${e[1]}</b> ${on ? '<span style="color:#2ecc71">ATIVO</span>' : '<span style="color:#95a5a6">desligado</span>'}<br><small style="opacity:.75">${e[2]}</small><br><button class="dev-save-btn" data-ev="${e[0]}" data-on="${on ? 0 : 1}" style="margin:4px 0 0;padding:3px 10px;width:auto;background:${on ? '#7f8c8d' : '#27ae60'}">${on ? 'Desligar' : 'Ligar'}</button></div>`; }).join(''); }
    async function setEv(k, on) { const r = await api('/admin/events', { k, on }); if (r && r.ok) { tog = r.toggles; window.EventToggles = tog; renderEv(); status((on ? 'Evento ligado.' : 'Evento desligado.'), '#2ecc71'); } else status((r && r.error) || 'Erro.', '#e74c3c'); }
    const status = (t, c) => { const s = $('sq-status'); if (s) { s.textContent = t; s.style.color = c || '#bdc3c7'; } };
    async function load() {
        try { const r = await api('/admin/specialquest'); quests = (r && r.quests) || []; render(); } catch (e) { status('Falha de conexão.', '#e74c3c'); }
    }
    const objText = (q) => q.type === 'code' ? 'código “' + esc(q.code) + '”' : q.type === 'kill' ? 'matar ' + q.need + '× ' + esc((npcDB[q.species] && npcDB[q.species].name) || q.species) : q.type === 'map' ? 'chegar a ' + esc((gameMaps[q.map] && gameMaps[q.map].name) || q.map) : 'entregar ' + q.need + '× ' + esc(q.item);
    function render() {
        const box = $('sq-list'); if (!box) return;
        box.innerHTML = quests.map((q) => `<div class="dev-ent-item" data-id="${esc(q.id)}" style="display:block;border-left:3px solid ${q.active ? '#2ecc71' : '#7f8c8d'};margin:4px 0;padding:6px">
<b>${esc(q.name)}</b> <small style="opacity:.7">[${esc(TYPES[q.type])}]</small> ${q.active ? '<span style="color:#2ecc71">ATIVA</span>' : '<span style="color:#95a5a6">inativa</span>'}<br>
<small>Objetivo: ${objText(q)}. Recompensa: ${Number(q.reward.qty).toLocaleString('pt-BR')}× ${esc(q.reward.item)}. Resgates: ${q.claims}${q.max > 0 ? ' / ' + q.max : ''}.</small><br>
<span style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px"><button class="dev-save-btn" data-a="toggle" style="margin:0;padding:3px 8px;width:auto;background:${q.active ? '#7f8c8d' : '#27ae60'}">${q.active ? 'Desativar' : 'Ativar'}</button><button class="dev-save-btn" data-a="edit" style="margin:0;padding:3px 8px;width:auto;background:#2980b9">Editar</button><button class="dev-save-btn" data-a="reset" style="margin:0;padding:3px 8px;width:auto;background:#d68910" title="Zera resgates e progresso (todos podem resgatar de novo)">Zerar resgates</button><button class="dev-save-btn" data-a="del" style="margin:0;padding:3px 8px;width:auto;background:#c0392b">Apagar</button></span></div>`).join('') || '<i style="opacity:.6">Nenhuma missão ainda.</i>';
    }
    async function act(a, body) { const r = await api('/admin/specialquest', Object.assign({ a }, body)); if (r && r.ok) { await load(); return r; } status((r && r.error) || 'Erro.', '#e74c3c'); return r; }
    function onList(e) {
        const b = e.target.closest('[data-a]'); const row = e.target.closest('[data-id]'); if (!b || !row) return; const id = row.dataset.id, q = quests.find((x) => x.id === id); if (!q) return;
        if (b.dataset.a === 'toggle') act('toggle', { id, active: !q.active }).then((r) => { if (r && r.ok) status(q.active ? 'Missão desativada.' : 'Missão ativada.', '#2ecc71'); });
        else if (b.dataset.a === 'edit') form(q);
        else if (b.dataset.a === 'reset') { gameConfirm('Zerar resgates e progresso de "' + q.name + '"? Todos poderão resgatar de novo.', { danger: true, ok: 'Zerar' }).then((ok) => { if (ok) act('reset', { id }); }); }
        else if (b.dataset.a === 'del') { gameConfirm('Apagar a missão "' + q.name + '"?', { danger: true, ok: 'Apagar' }).then((ok) => { if (ok) act('delete', { id }); }); }
    }
    function opts(list, sel) { return list.map((k) => `<option value="${esc(k[0])}" ${k[0] === sel ? 'selected' : ''}>${esc(k[1])}</option>`).join(''); }
    function form(q) {
        editing = q; const t = q ? q.type : 'code';
        const mobs = Object.keys(npcDB || {}).filter((k) => npcDB[k] && npcDB[k].hp > 0).sort().map((k) => [k, (npcDB[k].name || k) + ' (' + k + ')']);
        const maps = Object.keys(gameMaps || {}).filter((k) => !/^casa_/.test(k)).sort().map((k) => [k, (gameMaps[k].name || k) + ' (' + k + ')']);
        const items = Object.keys(itemDB || {}).filter((k) => !window.ItemInput || ItemInput.valid(k)).sort();
        openModal(`<div id="sq-form" style="width:min(92vw,460px);max-height:84vh;overflow:auto;color:#eadfc4;font-size:.8rem">
<h3 style="margin:0 0 6px;color:#c58bff">${q ? 'Editar' : 'Nova'} missão especial</h3>
<label>Nome (2 a 40):</label><input id="sqf-name" class="dev-input" maxlength="40" value="${esc(q ? q.name : '')}">
<label>Descrição (opcional):</label><input id="sqf-desc" class="dev-input" maxlength="200" value="${esc(q ? q.desc : '')}">
<label>Objetivo:</label><select id="sqf-type" class="dev-input">${opts(Object.keys(TYPES).map((k) => [k, TYPES[k]]), t)}</select>
<div id="sqf-code" style="display:none"><label>Código secreto (3 a 30; o jogador digita, sem diferenciar maiúsculas):</label><input id="sqf-codev" class="dev-input" maxlength="30" value="${esc(q && q.code || '')}"></div>
<div id="sqf-kill" style="display:none"><label>Espécie:</label><select id="sqf-species" class="dev-input">${opts(mobs, q && q.species)}</select></div>
<div id="sqf-map" style="display:none"><label>Mapa:</label><select id="sqf-mapv" class="dev-input">${opts(maps, q && q.map)}</select></div>
<div id="sqf-deliver" style="display:none"><label>Item a entregar:</label><input id="sqf-ditem" class="dev-input" list="sqf-items" maxlength="40" value="${esc(q && q.item || '')}"></div>
<div id="sqf-n" style="display:none"><label>Quantidade do objetivo (N):</label><input id="sqf-nv" class="dev-input" type="number" min="1" max="100000" value="${q && q.need > 1 ? q.need : 5}"></div>
<hr style="border-color:#3d2e24">
<label>Recompensa — item (catálogo inteiro, ou Coins para moedas):</label><input id="sqf-ritem" class="dev-input" list="sqf-items" maxlength="40" value="${esc(q ? q.reward.item : '')}" placeholder="Ex.: Elmo Mímico do Guerreiro, Aparência Mímica Aurora, Coins">
<datalist id="sqf-items">${items.map((k) => '<option value="' + esc(k) + '">').join('')}</datalist>
<label>Quantidade da recompensa:</label><input id="sqf-rqty" class="dev-input" type="number" min="1" max="2147483647" value="${q ? q.reward.qty : 1}">
<label>Limite total de resgates (0 = sem limite; sempre 1 por jogador):</label><input id="sqf-max" class="dev-input" type="number" min="0" max="100000" value="${q ? q.max : 0}">
<label style="display:flex;gap:6px;align-items:center;margin:6px 0"><input type="checkbox" id="sqf-active" ${q && q.active ? 'checked' : ''}> Ativa (visível e resgatável)</label>
<div id="sqf-err" style="color:#e74c3c;min-height:1em"></div>
<div style="display:flex;gap:6px;justify-content:flex-end"><button class="dev-save-btn" id="sqf-cancel" style="width:auto;background:#555;margin:0">Cancelar</button><button class="dev-save-btn" id="sqf-save" style="width:auto;background:#8e44ad;margin:0">Salvar</button></div></div>`);
        const sync = () => { const ty = $('sqf-type').value; $('sqf-code').style.display = ty === 'code' ? '' : 'none'; $('sqf-kill').style.display = ty === 'kill' ? '' : 'none'; $('sqf-map').style.display = ty === 'map' ? '' : 'none'; $('sqf-deliver').style.display = ty === 'deliver' ? '' : 'none'; $('sqf-n').style.display = (ty === 'kill' || ty === 'deliver') ? '' : 'none'; };
        try { if (window.ItemInput) { ItemInput.attach($('sqf-ditem')); ItemInput.attach($('sqf-ritem')); } } catch (e) { }
        $('sqf-type').onchange = sync; sync();
        $('sqf-cancel').onclick = () => closeModal();
        $('sqf-save').onclick = async () => {
            const ty = $('sqf-type').value;
            const quest = { id: q ? q.id : undefined, name: $('sqf-name').value, desc: $('sqf-desc').value, type: ty, active: $('sqf-active').checked, max: Number($('sqf-max').value) || 0, reward: { item: $('sqf-ritem').value.trim(), qty: Math.floor(Number($('sqf-rqty').value)) } };
            if (ty === 'code') quest.code = $('sqf-codev').value; else if (ty === 'kill') { quest.species = $('sqf-species').value; quest.n = Math.floor(Number($('sqf-nv').value)); } else if (ty === 'map') quest.map = $('sqf-mapv').value; else { quest.item = $('sqf-ditem').value.trim(); quest.n = Math.floor(Number($('sqf-nv').value)); }
            const r = await api('/admin/specialquest', { a: 'save', quest });
            if (r && r.ok) { closeModal(); status('Missão salva.', '#2ecc71'); load(); } else { const e = $('sqf-err'); if (e) e.textContent = (r && r.error) || 'Erro ao salvar.'; }
        };
    }
    window.SQAdmin = { init, load, _q: () => quests };
})();
