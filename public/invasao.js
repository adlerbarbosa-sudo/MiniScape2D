/* MiniScape 2D — evento Invasão (cliente). O servidor (engagesrv.js) decide a hora, o mapa, a espécie e os ids dos invasores;
   aqui eles aparecem no mapa durante os 15 minutos do evento e somem no fim. Vida/XP/loot seguem o fluxo normal dos monstros (o servidor conhece os ids via extraMob). */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    let info = null, recv = 0, lastFetch = 0, announced = -1, warned = -1, spawnedFor = -1, busy = false;
    let skew = 0; const NOW = () => Date.now(), SN = () => Date.now() + skew;
    const ready = () => typeof gameMaps !== 'undefined' && typeof npcDB !== 'undefined' && typeof player !== 'undefined' && player;
    async function fetchInfo() {
        if (busy || NOW() - lastFetch < 25000 || (typeof isOfflineMode !== 'undefined' && isOfflineMode && !window._ivTest)) return; busy = true; lastFetch = NOW();
        try { const r = await api('/engage', { a: 'state' }); if (r && typeof r.now === 'number') skew = r.now - NOW(); if (r && r.ok !== false && r.invasion !== undefined) { info = r.invasion; recv = NOW(); } else if (r && r.invasion === null) { info = null; recv = NOW(); } } catch (e) { } busy = false;
    }
    const rnd = (seed) => { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };
    function spots(m, d, ids) {
        const W = m.width || 1600, H = m.height || 1200, w = d.w || 30, h = d.h || 30, r = rnd(ids[0]);
        const ents = (m.entities || []).filter((o) => o && o.active !== false && o.type !== 'paint' && o.type !== 'ground_item' && o.type !== 'enemy' && o.type !== 'npc');
        const hit = (x, y) => ents.some((o) => x < o.x + (o.w || 30) + 12 && x + w > o.x - 12 && y < o.y + (o.h || 30) + 12 && y + h > o.y - 12);
        return ids.map(() => { for (let k = 0; k < 40; k++) { const x = 60 + r() * (W - 120 - w), y = 60 + r() * (H - 120 - h); if (!hit(x, y)) return { x: Math.round(x), y: Math.round(y) }; } return { x: Math.round(W / 2 + r() * 80), y: Math.round(H / 2 + r() * 80) }; });
    }
    function spawn(i) {
        const m = gameMaps[i.map], d = npcDB[i.sp]; if (!m || !d) return; if (!m.entities) m.entities = [];
        const sp = spots(m, d, i.ids);
        i.ids.forEach((id, k) => { if (m.entities.some((o) => o && o.id === id)) return; m.entities.push({ id, type: 'enemy', dbKey: i.sp, name: d.name, x: sp[k].x, y: sp[k].y, w: d.w || 30, h: d.h || 30, hp: d.hp, maxHp: d.hp, attackCooldown: 0, active: true, wb: true, iv: true, homeX: sp[k].x, homeY: sp[k].y }); });
    }
    function clear() { for (const k in gameMaps) { const m = gameMaps[k]; if (m && m.entities) { for (let j = m.entities.length - 1; j >= 0; j--) if (m.entities[j] && m.entities[j].iv) m.entities.splice(j, 1); } } spawnedFor = -1; }
    function ann(t) { try { if (window.Life && Life.ann) return Life.ann(t); } catch (e) { } try { setActionText(t, '#e67e22'); } catch (e) { } }
    function hud() {
        let el = $('inv-hud'); if (!el) { const gc = $('game-container'); if (!gc) return; el = document.createElement('div'); el.id = 'inv-hud'; el.style.cssText = 'position:absolute;left:50%;top:44px;transform:translateX(-50%);z-index:40;padding:4px 12px;border-radius:10px;font:700 .78rem serif;color:#ffe9c9;background:linear-gradient(#5a2a14ee,#2c1209ee);border:2px solid #e67e22;box-shadow:0 2px 8px #0009;pointer-events:none;display:none;white-space:nowrap'; gc.appendChild(el); }
        if (!info || !ready()) { el.style.display = 'none'; return; }
        const el_ = NOW() - recv, left = info.active ? info.until - SN() : info.from - SN(); const t = Math.max(0, Math.floor(left / 1000)), tt = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
        if (!info.active && left > 300000) { el.style.display = 'none'; return; }
        el.style.display = 'block';
        if (!info.active) { el.innerHTML = `⚔ Invasão de <b>${info.name}</b> em ${info.mapName} começa em ${tt}`; return; }
        const m = gameMaps[info.map], alive = m && m.entities ? m.entities.filter((o) => o && o.iv && o.active !== false && o.hp > 0).length : info.n;
        el.innerHTML = `⚔ Invasão: <b>${info.name}</b> em ${info.mapName} · ${alive}/${info.n} · ${tt}`;
    }
    function tick() {
        if (!ready()) return; fetchInfo();
        if (info && info.active && info.until > SN()) {
            if (announced !== info.from) { announced = info.from; ann(`Invasão! ${info.name} atacam ${info.mapName}.`); }
            if (spawnedFor !== info.from && npcDB[info.sp] && gameMaps[info.map]) { spawn(info); spawnedFor = info.from; }
        } else {
            if (spawnedFor !== -1) clear();
            if (info && !info.active && info.from - SN() < 125000 && warned !== info.from) { warned = info.from; ann(`Uma invasão de ${info.name} começa em 2 minutos em ${info.mapName}.`); }
        }
        hud();
    }
    setInterval(tick, 1000);
    window.Invasao = { info: () => info };
})();
