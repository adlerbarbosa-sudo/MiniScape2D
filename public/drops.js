/* MiniScape 2D — itens no chão compartilhados entre jogadores do mesmo mapa.
   Quem gera o drop (loot de monstro, item largado) o publica no próximo sync; os outros o veem como item normal (marca sh) e disputam: quem confirma primeiro em /api/drop leva. */
(function () {
    'use strict';
    const mine = Object.create(null);   // sid -> entidade publicada por mim
    const sid = () => { let s = ''; for (let i = 0; i < 9; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]; return s; };
    const offline = () => typeof isOfflineMode !== 'undefined' && isOfflineMode;
    const DropSync = {
        /* chamado ao montar o sync: devolve { drops, drel } a enviar */
        collect() {
            const out = { drops: [], drel: [], dep: [] };
            try {
                const m = typeof gameMaps !== 'undefined' && gameMaps[currentMap]; if (!m || !m.entities || /^casa_/.test(currentMap) || currentMap === 'casa') return out;
                const now = Date.now();
                for (const o of m.entities) {
                    if (!o) continue;
                    if ((o.type === 'tree' || (typeof o.type === 'string' && o.type.indexOf('rock') === 0)) && o.id != null) {   // recurso esgotado por mim: avisa os outros
                        if (o.active === false) { if (!o._rd && !o._dpub && out.dep.length < 8) { o._dpub = 1; out.dep.push({ i: String(o.id), s: 10 }); } } else if (o._dpub) delete o._dpub;
                        if (o._rd && now >= o._rd) { o.active = true; if (o.maxHp) o.hp = o.maxHp; delete o._rd; }
                        continue;
                    }
                    if (o.type === 'fire' && o.active !== false && !o.sh && !o.sid && !o.wi) { if (out.drops.length < 6) { o.sid = sid(); mine[o.sid] = o; out.drops.push({ s: o.sid, k: 'fire', x: Math.round(o.x), y: Math.round(o.y), ttl: Math.max(5, Math.min(300, Math.round((o.life || 3000) / 60))) }); } continue; }
                    if (o.type !== 'ground_item' || o.wi || o.sh || o.sid || o.active === false || typeof o.item !== 'string') continue;
                    if (out.drops.length >= 6) break; o.sid = sid(); mine[o.sid] = o;
                    out.drops.push({ s: o.sid, item: o.item, qty: Math.max(1, Math.floor(o.qty || 1)), x: Math.round(o.x), y: Math.round(o.y), ttl: Math.max(5, Math.min(300, Math.round((o.life || 3000) / 60))) });
                }
                for (const k of Object.keys(mine)) { const o = mine[k]; if (!o || o.active === false || m.entities.indexOf(o) < 0) { if (out.drel.length < 20) { out.drel.push(k); delete mine[k]; } } }
            } catch (e) { }
            return out;
        },
        /* resposta do sync: lista de drops dos outros jogadores neste mapa */
        onDep(list) {
            try { if (!Array.isArray(list)) return; const m = gameMaps[currentMap]; if (!m || !m.entities) return; const now = Date.now(); for (const d of list) { if (!d || typeof d.i !== 'string') continue; const o = m.entities.find((e) => e && e.id != null && String(e.id) === d.i && (e.type === 'tree' || (typeof e.type === 'string' && e.type.indexOf('rock') === 0))); if (o && o.active !== false && !o._dpub) { o.active = false; o._rd = now + Math.max(3, d.s | 0) * 1000; } } } catch (e) { }
        },
        onSync(list, live) {
            try {
                if (Array.isArray(live)) { const L = Object.create(null); live.forEach((k) => { L[k] = 1; }); for (const k of Object.keys(mine)) { const o = mine[k]; if (L[k]) o._ack = 1; else if (o && o._ack) { o.active = false; delete mine[k]; } } }
                if (!Array.isArray(list)) return; const m = gameMaps[currentMap]; if (!m) return; if (!m.entities) m.entities = [];
                const want = Object.create(null); list.forEach((d) => { if (d && typeof d.s === 'string') want[d.s] = d; });
                const have = Object.create(null);
                for (let i = m.entities.length - 1; i >= 0; i--) { const o = m.entities[i]; if (o && o.sh && o.sid) { if (want[o.sid] && o.active !== false) have[o.sid] = 1; else m.entities.splice(i, 1); } }
                for (const k of Object.keys(want)) { if (have[k]) continue; const d = want[k]; if (d.k !== 'fire' && (typeof d.item !== 'string' || !(typeof itemDB !== 'undefined' && itemDB[d.item]))) continue;
                    if (d.k === 'fire') { m.entities.push({ id: (typeof newEntId === 'function' ? newEntId() : 'sd_' + k), type: 'fire', name: 'Fire', x: +d.x, y: +d.y, w: 30, h: 30, active: true, sh: 1, sid: k, np: 1, life: Math.max(300, (d.ttl | 0) * 60 + 60) }); continue; }
                    m.entities.push({ id: (typeof newEntId === 'function' ? newEntId() : 'sd_' + k), type: 'ground_item', item: d.item, qty: Math.max(1, d.qty | 0), x: +d.x, y: +d.y, w: 20, h: 20, active: true, np: 1, sh: 1, sid: k, life: Math.max(300, (d.ttl | 0) * 60 + 60) }); }
            } catch (e) { }
        },
        /* confirma a coleta no servidor: Promise<boolean> (offline ou sem sid: sempre true) */
        async take(o) {
            if (!o || !o.sid || offline()) return true;
            try { const r = await api('/drop', { a: 'take', s: o.sid }); if (r && r.ok) { delete mine[o.sid]; return true; } } catch (e) { return false; }
            o.active = false; return false;   // alguém pegou antes (ou expirou)
        }
    };
    window.DropSync = DropSync;
})();
