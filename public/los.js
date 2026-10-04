/* MiniScape 2D — linha de visão: nada de atacar (nem ser atacado) através de paredes.
   Segmento atacante→alvo contra as caixas de colisão (getHitbox) dos sólidos "altos": prédios, muros, rochedos, colunas, estátuas, troncos...
   Objetos baixos (cercas, barris, arbustos, minérios, lápides, caixotes...) não bloqueiam.
   Cache: lista de bloqueadores refeita a cada ~250 ms e resultados repetidos reaproveitados por ~50 ms. */
(function () {
    'use strict';
    const LOW = new Set(['fence_h', 'fence_v', 'barrel', 'crates', 'stump', 'bush', 'haystack', 'sign', 'lamp', 'campfire', 'well', 'cart', 'crystal', 'mushrooms', 'lily', 'flowers', 'gravestone', 'bones', 'reeds', 'lava', 'netrack', 'sarcophagus', 'torch', 'fountain', 'cactus', 'banner']);
    const NOBLOCK = new Set(['ground_item', 'fishing_spot', 'farm_plot', 'rift_gate', 'rift_next', 'portal', 'fire', 'paint', 'enemy', 'npc', 'furnace', 'anvil', 'bank', 'cauldron', 'enchant_table', 'house_door', 'edge_exit']);
    let cacheArr = null, cacheLen = -1, cacheT = 0, rects = [], memo = new Map(), memoT = 0;
    function build(cur) {
        const out = [];
        for (const o of cur) {
            if (!o || !o.type || o.active === false || NOBLOCK.has(o.type)) continue;
            if (typeof o.type === 'string' && o.type.startsWith('rock')) continue;   // minérios: baixos
            if (o.type === 'decor' && LOW.has(o.kind)) continue;
            let hb = null; try { hb = typeof getHitbox === 'function' ? getHitbox(o) : null; } catch (e) { }
            if (hb && hb.w > 0 && hb.h > 0) out.push(hb);
        }
        return out;
    }
    function blockers(cur) {
        const t = performance.now();
        if (cur !== cacheArr || cur.length !== cacheLen || t - cacheT > 250) { cacheArr = cur; cacheLen = cur.length; cacheT = t; rects = build(cur); memo.clear(); }
        return rects;
    }
    function segRect(ax, ay, bx, by, r) {   // Liang–Barsky
        const dx = bx - ax, dy = by - ay; let t0 = 0, t1 = 1;
        const p = [-dx, dx, -dy, dy], q = [ax - r.x, r.x + r.w - ax, ay - r.y, r.y + r.h - ay];
        for (let i = 0; i < 4; i++) {
            if (p[i] === 0) { if (q[i] < 0) return false; }
            else { const t = q[i] / p[i]; if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } }
        }
        return true;
    }
    const inside = (x, y, r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
    // true = visão livre
    function clear(ax, ay, bx, by, cur) {
        if (!cur) { const m = typeof gameMaps !== 'undefined' && gameMaps[currentMap]; cur = (m && m.entities) || []; }
        const R = blockers(cur); const t = performance.now();
        if (t - memoT > 50) { memo.clear(); memoT = t; }
        const k = (ax | 0) + ',' + (ay | 0) + ',' + (bx | 0) + ',' + (by | 0); const c = memo.get(k); if (c !== undefined) return c;
        const x0 = Math.min(ax, bx) - 1, x1 = Math.max(ax, bx) + 1, y0 = Math.min(ay, by) - 1, y1 = Math.max(ay, by) + 1; let ok = true;
        for (let i = 0; i < R.length; i++) {
            const r = R[i]; if (r.x > x1 || r.x + r.w < x0 || r.y > y1 || r.y + r.h < y0) continue;
            if (inside(ax, ay, r) || inside(bx, by, r)) continue;   // quem está encostado/dentro da própria caixa não é bloqueado por ela
            if (segRect(ax, ay, bx, by, r)) { ok = false; break; }
        }
        if (memo.size > 400) memo.clear(); memo.set(k, ok); return ok;
    }
    // entre o jogador e o centro de uma entidade (usa o meio do corpo, não os pés)
    function playerTo(o, cur) { return clear(player.x, player.y - 8, o.x + (o.w || 30) / 2, o.y + (o.h || 30) / 2, cur); }
    window.LOS = { clear, playerTo, blockers, LOW, segRect };
})();
