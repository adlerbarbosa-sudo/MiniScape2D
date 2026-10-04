/* MiniScape 2D — PACOTES DE CONTEÚDO (Injetor de Expansão do painel Dev, só admin).
   Um pacote é um JSON (ou o mesmo JSON em Base64) com itens, monstros/NPCs, mapas novos e entidades para mapas existentes. Dá para pedir ao Claude
   para gerar o pacote, colar no Dev > Injetor e aplicar SEM deploy: o jogo salva no servidor (que valida de novo) e todos os jogadores recebem na próxima sincronização.
   Segurança: pré-visualização (nada muda), validação de formato, nomes bloqueados (__proto__ etc.), limite de tamanho, e DESFAZER do último pacote.
   Reaplicar o mesmo pacote não duplica: as entidades do pacote levam a marca `pk` (nome do pacote) e as antigas são trocadas.
   Formato:
   { "name": "Cavernas do Dragão",                  // obrigatório (marca as entidades; letras, números, espaço, - _)
     "items": { "Espada de Fogo": { "name": "Espada de Fogo", "type": "equipment", "slot": "weapon", "bonusDmg": 20, "req": {"skill":"combat","lvl":30}, "sell": 120, ... } },
     "npcs":  { "dragao_base": { "name": "Dragão", "hp": 200, "maxHit": 20, "xp": 300, "lootStr": "Coins,1,200", ... } },
     "maps":  { "caverna": { "id": "caverna", "name": "Caverna", "width": 1200, "height": 800, "entities": [ {"type":"enemy","dbKey":"dragao_base","x":300,"y":300} ] } },
     "entities": { "lumbridge": [ {"type":"portal","destMap":"caverna","x":50,"y":50,"w":40,"h":40} ] },   // acrescentadas a mapas que já existem
     "replace": false }                                // true = mapas do pacote substituem os de mesmo id (padrão: mapa existente só recebe as entidades) */
(function () {
    'use strict';
    const LIM = { items: 400, npcs: 200, maps: 40, ents: 4000, bytes: 4000000 };
    const BAD = /^(__proto__|constructor|prototype)$/;
    const NAME_RE = /^[\p{L}\p{N}_ \-]{1,40}$/u, KEY_RE = /^[\p{L}\p{N}_ .'’()+%!:\-]{1,60}$/u, MAP_RE = /^[A-Za-z0-9_\-]{1,40}$/;
    const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
    const clone = (x) => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
    let undoStack = [];
    try { const s = JSON.parse(localStorage.getItem('ms_pack_undo') || '[]'); if (Array.isArray(s)) undoStack = s.slice(-3); } catch (e) { }
    const persist = () => { try { localStorage.setItem('ms_pack_undo', JSON.stringify(undoStack.slice(-3))); } catch (e) { } };

    function parse(text) {
        text = String(text || '').trim(); if (!text) throw new Error('Cole o pacote primeiro.');
        if (text.length > 4 * LIM.bytes) throw new Error('Pacote grande demais.');
        if (text[0] === '{') { try { return JSON.parse(text); } catch (e) { throw new Error('JSON com erro de sintaxe (' + e.message + ').'); } }
        try { const bin = atob(text.replace(/[^A-Za-z0-9+/=]/g, '')), by = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) by[i] = bin.charCodeAt(i); return JSON.parse(new TextDecoder('utf-8').decode(by)); }
        catch (e) { throw new Error('não é um JSON (começa com "{") nem um Base64 válido.'); }
    }
    /* valida e descreve; ctx = { itemDB, npcDB, maps } (estado atual do jogo). Devolve { errors, warns, lines } — com erros nada é aplicado */
    function check(p, ctx) {
        const errors = [], warns = [], lines = [];
        if (!isObj(p)) return { errors: ['O pacote precisa ser um objeto JSON.'], warns, lines };
        if (typeof p.name !== 'string' || !NAME_RE.test(p.name)) errors.push('"name" é obrigatório (1-40 letras, números, espaço, - ou _).');
        const items = p.items === undefined ? {} : p.items, npcs = p.npcs === undefined ? {} : p.npcs, maps = p.maps === undefined ? {} : p.maps, ents = p.entities === undefined ? {} : p.entities;
        for (const [k, v] of [['items', items], ['npcs', npcs], ['maps', maps], ['entities', ents]]) if (!isObj(v)) errors.push('"' + k + '" precisa ser um objeto.');
        if (errors.length) return { errors, warns, lines };
        try { if (JSON.stringify(p).length > LIM.bytes) errors.push('Pacote maior que ' + Math.round(LIM.bytes / 1000) + ' KB.'); } catch (e) { errors.push('JSON inválido.'); }
        const ik = Object.keys(items), nk = Object.keys(npcs), mk = Object.keys(maps), ek = Object.keys(ents);
        if (ik.length > LIM.items) errors.push('Itens demais (máx. ' + LIM.items + ').'); if (nk.length > LIM.npcs) errors.push('Monstros/NPCs demais (máx. ' + LIM.npcs + ').'); if (mk.length > LIM.maps) errors.push('Mapas demais (máx. ' + LIM.maps + ').');
        const newItems = new Set(ik), newNpcs = new Set(nk), newMaps = new Set(mk);
        let ov = 0;
        for (const k of ik) {
            const it = items[k]; if (BAD.test(k) || !KEY_RE.test(k)) { errors.push('Item com nome inválido: "' + k + '".'); continue; } if (!isObj(it)) { errors.push('Item "' + k + '" precisa ser um objeto.'); continue; }
            if (has(ctx.itemDB, k)) { ov++; warns.push('Item "' + k + '" já existe e será SUBSTITUÍDO (dá para desfazer).'); }
            if (it.name !== undefined && typeof it.name !== 'string') errors.push('Item "' + k + '": "name" deve ser texto.');
            if (it.name && it.name !== k) warns.push('Item "' + k + '": o campo "name" difere da chave; o jogo usa a chave como identificador.');
            if (typeof it.type !== 'string') errors.push('Item "' + k + '": falta "type" (equipment, consumable, resource...).');
            if (it.type === 'equipment' && typeof it.slot !== 'string') errors.push('Item "' + k + '": equipamento precisa de "slot".');
            if (it.type === 'equipment' && !isObj(it.req) && it.req !== undefined) errors.push('Item "' + k + '": "req" deve ser {"skill":"combat","lvl":N}.');
            if (it.type === 'equipment' && it.req === undefined) warns.push('Item "' + k + '": sem "req" — o nível mínimo será derivado da força do item.');
            for (const f of ['bonusDmg', 'defBonus', 'heal', 'sell', 'weight']) if (it[f] !== undefined && !(Number.isFinite(it[f]) && it[f] >= 0 && it[f] <= 1e7)) errors.push('Item "' + k + '": "' + f + '" deve ser um número entre 0 e 10.000.000.');
        }
        for (const k of nk) {
            const n = npcs[k]; if (BAD.test(k) || !/^[A-Za-z0-9_\-]{1,40}$/.test(k)) { errors.push('Monstro/NPC com chave inválida: "' + k + '" (use letras, números, _ ou -).'); continue; } if (!isObj(n)) { errors.push('Monstro "' + k + '" precisa ser um objeto.'); continue; }
            if (has(ctx.npcDB, k)) { ov++; warns.push('Monstro/NPC "' + k + '" já existe e será SUBSTITUÍDO.'); }
            if (typeof n.name !== 'string' || !n.name) errors.push('Monstro/NPC "' + k + '": falta "name".');
            if (n.behavior !== 'npc' && n.group !== 'npc' && !n.shopStr && !(Number.isFinite(n.hp) && n.hp > 0)) warns.push('Monstro "' + k + '": sem "hp" válido.');
            if (typeof n.lootStr === 'string') n.lootStr.split('|').forEach((e) => { const nm = e.split(',')[0].trim(); if (nm && nm !== 'Coins' && !has(ctx.itemDB, nm) && !newItems.has(nm)) warns.push('Monstro "' + k + '": drop "' + nm + '" não existe.'); });
        }
        let nEnt = 0;
        const checkEnt = (o, where) => {
            nEnt++; if (!isObj(o) || typeof o.type !== 'string') { errors.push(where + ': entidade sem "type".'); return; }
            for (const f of ['x', 'y']) if (!Number.isFinite(o[f])) { errors.push(where + ': entidade "' + o.type + '" sem coordenada ' + f + ' numérica.'); break; }
            if ((o.type === 'enemy' || o.type === 'npc') && o.dbKey !== undefined && !has(ctx.npcDB, o.dbKey) && !newNpcs.has(o.dbKey)) warns.push(where + ': dbKey "' + o.dbKey + '" não existe.');
            if (o.type === 'portal' && typeof o.destMap === 'string' && !has(ctx.maps, o.destMap) && !newMaps.has(o.destMap)) warns.push(where + ': portal para o mapa inexistente "' + o.destMap + '".');
            if (o.type === 'ground_item' && typeof o.item === 'string' && !has(ctx.itemDB, o.item) && !newItems.has(o.item)) warns.push(where + ': item de chão "' + o.item + '" não existe.');
        };
        for (const id of mk) {
            const m = maps[id]; if (BAD.test(id) || !MAP_RE.test(id)) { errors.push('Mapa com id inválido: "' + id + '".'); continue; } if (!isObj(m)) { errors.push('Mapa "' + id + '" precisa ser um objeto.'); continue; }
            if (!Number.isFinite(m.width) || !Number.isFinite(m.height) || m.width < 200 || m.height < 200 || m.width > 6000 || m.height > 6000) errors.push('Mapa "' + id + '": width/height devem estar entre 200 e 6000.');
            if (m.entities !== undefined && !Array.isArray(m.entities)) errors.push('Mapa "' + id + '": "entities" deve ser uma lista.'); else (m.entities || []).forEach((o) => checkEnt(o, 'Mapa "' + id + '"'));
            if (has(ctx.maps, id)) warns.push(p.replace ? 'Mapa "' + id + '" existe e será SUBSTITUÍDO.' : 'Mapa "' + id + '" já existe: só as entidades serão acrescentadas (use "replace": true para substituir).');
        }
        for (const id of ek) {
            if (BAD.test(id) || !MAP_RE.test(id)) { errors.push('"entities": id de mapa inválido "' + id + '".'); continue; }
            if (!has(ctx.maps, id) && !newMaps.has(id)) { errors.push('"entities": o mapa "' + id + '" não existe.'); continue; }
            if (!Array.isArray(ents[id])) { errors.push('"entities.' + id + '" deve ser uma lista.'); continue; } ents[id].forEach((o) => checkEnt(o, 'Mapa "' + id + '"'));
        }
        if (nEnt > LIM.ents) errors.push('Entidades demais (máx. ' + LIM.ents + ').');
        lines.push(ik.length + ' item(ns), ' + nk.length + ' monstro(s)/NPC(s), ' + mk.length + ' mapa(s), ' + nEnt + ' entidade(s)' + (ov ? ', ' + ov + ' substituição(ões)' : '') + '.');
        return { errors, warns, lines };
    }
    const tag = (o, pk) => { const c = clone(o); c.pk = pk; if (c.type === 'ground_item') c.wi = true; return c; };   // item de chão só persiste no mundo com wi (colocado pelo Dev)
    /* aplica no estado do jogo (itemDB, npcDB, gameMaps) e devolve o instantâneo para desfazer */
    function apply(p, ctx) {
        const snap = { name: p.name, at: Date.now(), items: {}, npcs: {}, maps: {} };
        const keepMap = (id) => { if (!has(snap.maps, id)) snap.maps[id] = has(ctx.maps, id) ? clone(ctx.maps[id]) : null; };
        for (const k of Object.keys(p.items || {})) { snap.items[k] = has(ctx.itemDB, k) ? clone(ctx.itemDB[k]) : null; const v = clone(p.items[k]); if (!v.name) v.name = k; ctx.itemDB[k] = v; }
        for (const k of Object.keys(p.npcs || {})) { snap.npcs[k] = has(ctx.npcDB, k) ? clone(ctx.npcDB[k]) : null; ctx.npcDB[k] = clone(p.npcs[k]); }
        const add = (id, list) => { const m = ctx.maps[id]; m.entities = (m.entities || []).filter((o) => !(o && o.pk === p.name)); (list || []).forEach((o) => m.entities.push(tag(o, p.name))); };
        for (const id of Object.keys(p.maps || {})) {
            keepMap(id);
            if (has(ctx.maps, id) && !p.replace) add(id, p.maps[id].entities);
            else { const m = clone(p.maps[id]); m.id = id; if (!m.name) m.name = id; m.entities = []; ctx.maps[id] = m; add(id, p.maps[id].entities); }
        }
        for (const id of Object.keys(p.entities || {})) { keepMap(id); add(id, p.entities[id]); }
        return snap;
    }
    function restore(snap, ctx) {
        for (const k of Object.keys(snap.items)) { if (snap.items[k] === null) delete ctx.itemDB[k]; else ctx.itemDB[k] = snap.items[k]; }
        for (const k of Object.keys(snap.npcs)) { if (snap.npcs[k] === null) delete ctx.npcDB[k]; else ctx.npcDB[k] = snap.npcs[k]; }
        for (const id of Object.keys(snap.maps)) { if (snap.maps[id] === null) delete ctx.maps[id]; else ctx.maps[id] = snap.maps[id]; }
    }

    /* ===== Auditoria de conexões: acha mapas soltos (sem entrada) e becos sem saída, e liga os soltos ===== */
    const solidDecor = (k) => { const d = window.CATALOG && CATALOG.DECOR && CATALOG.DECOR[k]; return d ? !!d.solid : !['sign', 'flowers', 'lily', 'bones', 'mushrooms', 'reeds', 'lava', 'paint'].includes(k); };
    function graph(maps) {
        const out = {}, inn = {}; const ids = Object.keys(maps || {}); ids.forEach((id) => { out[id] = new Set(); inn[id] = new Set(); });
        const link = (a, b) => { if (b && has(maps, b) && b !== a) { out[a].add(b); inn[b].add(a); } };
        ids.forEach((id) => { const m = maps[id]; if (!m) return; (m.entities || []).forEach((o) => { if (o && o.type === 'portal' && o.active !== false) link(id, o.destMap); }); (Array.isArray(m.edges) ? m.edges : []).forEach((e) => link(id, e && e.to)); });
        return { ids, out, inn };
    }
    const reach = (adj, from) => { const seen = new Set([from]), q = [from]; while (q.length) { const c = q.shift(); (adj[c] || []).forEach((n) => { if (!seen.has(n)) { seen.add(n); q.push(n); } }); } return seen; };
    function audit(maps, start) {
        const g = graph(maps); start = start && has(maps, start) ? start : (has(maps, 'lumbridge') ? 'lumbridge' : g.ids[0]);
        const fwd = reach(g.out, start), back = reach(g.inn, start);   // back = mapas de onde se consegue voltar ao início
        return { start, ids: g.ids, loose: g.ids.filter((id) => !fwd.has(id)), trapped: g.ids.filter((id) => fwd.has(id) && !back.has(id)), g };
    }
    function freeSpot(m, prefer) {   // lugar livre 64x64 (+ área de chegada abaixo) para um portal
        const W = m.width || 2000, H = m.height || 1400, ents = (m.entities || []).filter((o) => o && o.active !== false && o.w && o.type !== 'paint' && o.type !== 'ground_item' && o.type !== 'fishing_spot' && (o.type !== 'decor' || solidDecor(o.kind)));
        const vr = (o) => o.type === 'tree' ? [o.x - 12, o.y - 30, 100, 126] : [o.x, o.y, o.w, o.h], hit = (a, b) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
        let best = null, bd = 1e12;
        for (let x = 120; x < W - 180; x += 40) for (let y = 120; y < H - 260; y += 40) { const r = [x - 36, y - 24, 136, 190]; if (ents.some((o) => hit(r, vr(o)))) continue; const d = Math.hypot(x - prefer[0], y - prefer[1]); if (d < bd) { bd = d; best = [x, y]; } }
        return best;
    }
    function autoLink(maps, start) {   // devolve { snap, lines } ; altera maps no lugar
        const a = audit(maps, start), lines = [], snap = { name: 'Ligação automática de mapas', at: Date.now(), items: {}, npcs: {}, maps: {} };
        const keep = (id) => { if (!has(snap.maps, id)) snap.maps[id] = clone(maps[id]); };
        const grid = (m) => (typeof m.gridX === 'number' && typeof m.gridY === 'number') ? [m.gridX, m.gridY] : null;
        const nm = (id) => (maps[id] && maps[id].name) || id; let n = 0;
        const connect = (from, to, label) => {   // portal em "from" levando a "to" (+ portal de volta em "to" se pedido)
            const A = maps[from], Bm = maps[to], ga = grid(A), gb = grid(Bm);
            const dir = ga && gb ? [Math.sign(gb[0] - ga[0]), Math.sign(gb[1] - ga[1])] : [0, 1];
            const pa = freeSpot(A, [(A.width || 2000) / 2 + dir[0] * 700, (A.height || 1400) / 2 + dir[1] * 400]), pb = freeSpot(Bm, [(Bm.width || 2000) / 2 - dir[0] * 700, (Bm.height || 1400) / 2 - dir[1] * 400]);
            if (!pa || !pb) { lines.push('Sem espaço livre para ligar ' + nm(from) + ' → ' + nm(to) + '. Abra espaço no mapa e rode de novo.'); return false; }
            keep(from); keep(to); const id = 'auto_' + from + '_' + to;
            const mk = (m, p, dest, dx, dy, name, idp) => { m.entities = (m.entities || []).filter((o) => !(o && o.id === idp)); m.entities.push({ id: idp, type: 'portal', name, x: p[0], y: p[1], w: 64, h: 64, destMap: dest, destX: dx, destY: dy, look: 'door', active: true, pk: 'Ligação automática' }); };
            mk(A, pa, to, pb[0] + 32, pb[1] + 110, 'Caminho para ' + nm(to), id); mk(Bm, pb, from, pa[0] + 32, pa[1] + 110, 'Voltar para ' + nm(from), id + '_volta');
            lines.push('✔ ' + nm(from) + ' ⇄ ' + nm(to) + (label ? ' (' + label + ')' : '')); n++; return true;
        };
        const done = new Set(a.g.ids.filter((id) => !a.loose.includes(id)));
        // 1) mapas soltos: um por vez, liga ao alcançável mais próximo na grade (ou ao início); depois reavalia a vizinhança
        let guard = 0;
        while (guard++ < 60) {
            const g = graph(maps), fw = reach(g.out, a.start), loose = a.ids.filter((id) => !fw.has(id)); if (!loose.length) break;
            // prefere o mapa solto que já tem saídas (é a entrada natural do grupo)
            loose.sort((x, y) => (g.out[y].size + g.inn[y].size) - (g.out[x].size + g.inn[x].size));
            const L = loose[0], gl = grid(maps[L]); let anchor = a.start, bestd = 1e9;
            [...fw].forEach((id) => { if (id === L || !maps[id]) return; const gi = grid(maps[id]); const d = gl && gi ? Math.abs(gl[0] - gi[0]) + Math.abs(gl[1] - gi[1]) : (id === a.start ? 50 : 1e6 - (maps[id].env ? 1 : 0)); if (d < bestd) { bestd = d; anchor = id; } });
            if (!connect(anchor, L, 'estava solto')) break;
        }
        // 2) becos sem saída: dá um portal de volta
        const g2 = graph(maps), back2 = reach(g2.inn, a.start);
        a.ids.filter((id) => !back2.has(id)).forEach((id) => { const pred = [...g2.inn[id]][0] || a.start; connect(id, pred, 'não tinha saída'); });
        return { snap, lines, n };
    }
    window.Packs = {
        parse, check, apply, restore, LIM, audit, autoLink,
        pushUndo(s) { undoStack.push(s); undoStack = undoStack.slice(-3); persist(); },
        popUndo() { const s = undoStack.pop(); persist(); return s || null; },
        undoInfo() { const s = undoStack[undoStack.length - 1]; return s ? s.name + ' (' + new Date(s.at).toLocaleString('pt-BR') + ')' : ''; },
        readFile(inp) {   // botão "Abrir arquivo": carrega o pacote do disco no campo de texto (arquivos grandes não precisam de copiar e colar)
            const f = inp.files && inp.files[0]; if (!f) return; if (f.size > 6e6) { alert('Arquivo grande demais.'); inp.value = ''; return; }
            const r = new FileReader(); r.onload = () => { const box = document.getElementById('dev-import-code'); if (box) box.value = String(r.result || ''); const o = document.getElementById('dev-import-report'); if (o) { o.style.color = '#bdc3c7'; o.textContent = 'Arquivo "' + f.name + '" carregado. Clique em Pré-visualizar.'; } inp.value = ''; }; r.readAsText(f, 'utf-8');
        },
        sample() {
            return JSON.stringify({
                name: 'Exemplo Cavernas', replace: false,
                items: { 'Espada de Cristal': { name: 'Espada de Cristal', icon: '🗡️', type: 'equipment', slot: 'weapon', bonusDmg: 12, stackable: false, weight: 2, desc: 'Lâmina de cristal.', req: { skill: 'combat', lvl: 20 }, sell: 60 } },
                npcs: { morcego_cristal: { name: 'Morcego de Cristal', hp: 40, maxHit: 5, xp: 40, c1: '#8e44ad', c2: '#9b59b6', lootStr: 'Coins,0.6,25|Espada de Cristal,0.02,1', dialog: '', shopStr: '' } },
                maps: { caverna_cristal: { id: 'caverna_cristal', name: 'Caverna de Cristal', width: 1000, height: 700, color: '#2c3e50', entities: [{ type: 'enemy', dbKey: 'morcego_cristal', name: 'Morcego de Cristal', x: 300, y: 300, w: 30, h: 30 }, { type: 'portal', destMap: 'lumbridge', x: 40, y: 320, w: 40, h: 60 }] } },
                entities: {}
            }, null, 2);
        }
    };
})();
