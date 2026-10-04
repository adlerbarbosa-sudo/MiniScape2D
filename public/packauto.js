/* MiniScape 2D — PACOTES EMBUTIDOS. Os pacotes de conteúdo prontos (Reinos de Solaris, Terras Sombrias) ficam em public/packdata/ e são aplicados
   sozinhos quando o ADMIN entra no jogo, se o mundo salvo ainda não tem a versão atual deles (a versão é o hash do arquivo, listado em manifest.json).
   Nada de copiar e colar: o admin entra, o mundo é atualizado e salvo no servidor, e os jogadores recebem na próxima sincronização.
   Também alinha gridX/gridY dos mapas de exterior com o mapa-múndi (tecla M) para a grade do Dev mostrar os mesmos lugares. */
(function () {
    'use strict';
    let running = false;
    const stampId = (e) => 'pkv_' + e.id + '_' + e.ver;
    const hasStamp = (e) => { const m = gameMaps[e.stampMap]; return !!(m && (m.entities || []).some((o) => o && o.id === stampId(e))); };
    function syncGrid() {   // só mapas de exterior (têm bordas): masmorras não podem ter grade, senão a lógica antiga de grade as ligaria a vizinhos
        const pos = window.Hub && Hub.WM_POS; if (!pos) return 0; let n = 0;
        Object.keys(pos).forEach((id) => { const m = gameMaps[id]; if (!m || !Array.isArray(m.edges)) return; if (m.gridX !== pos[id][0] || m.gridY !== pos[id][1]) { m.gridX = pos[id][0]; m.gridY = pos[id][1]; n++; } });
        return n;
    }
    async function run(force) {
        if (running) return null; if (typeof userRole === 'undefined' || userRole !== 'admin' || !window.Packs) return null; running = true;
        const done = [], snaps = [];
        try {
            const res = await fetch('packdata/manifest.json?' + Date.now()); if (!res.ok) return null; const man = await res.json(); if (!Array.isArray(man)) return null;
            for (const e of man) {
                if (!force && hasStamp(e)) continue;
                const r2 = await fetch('packdata/' + e.file + '?' + e.ver); if (!r2.ok) continue;
                let p; try { p = Packs.parse(await r2.text()); } catch (er) { console.error('[packauto]', e.file, er); continue; }
                const ctx = { itemDB, npcDB, maps: gameMaps }, c = Packs.check(p, ctx);
                if (c.errors.length) { console.error('[packauto] ' + e.file, c.errors); continue; }
                snaps.push(Packs.apply(p, ctx)); done.push(p.name);
                const m = gameMaps[e.stampMap]; if (m) { m.entities = (m.entities || []).filter((o) => !(o && typeof o.id === 'string' && o.id.indexOf('pkv_' + e.id + '_') === 0)); m.entities.push({ id: stampId(e), type: 'paint', name: 'Chão', color: m.color || '#000', x: 0, y: 0, w: 2, h: 2, active: true, pk: p.name }); }
            }
            const g = syncGrid();
            if (!done.length && !g) return { done };
            let ok = false; try { ok = await saveDataLogic(true, true); } catch (er) { }
            if (ok !== true) { snaps.reverse().forEach((s) => Packs.restore(s, { itemDB, npcDB, maps: gameMaps })); console.warn('[packauto] o servidor não aceitou; nada foi mantido'); return { done: [], failed: true }; }
            try { buildDevEntityList(); loadDevMapManager(); updateUI(); } catch (er) { }
            if (done.length) { try { setActionText('Mundo atualizado: ' + done.join(', '), '#2ecc71'); } catch (er) { } }
            return { done };
        } catch (er) { console.error('[packauto]', er); return null; } finally { running = false; }
    }
    window.PackAuto = { run, syncGrid };
})();
