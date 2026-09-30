/* ============================================================
   MiniScape 2D - ARTE (núcleo + criaturas + personagens)
   Tudo desenhado por código no canvas (sem imagens externas).
   Convenção das criaturas: (0,0) = pés no centro, +x = direita,
   altura para cima = y negativo. O motor espelha quando vira p/ esquerda.
   ============================================================ */
(function (root) {
    'use strict';
    const PI = Math.PI, TAU = PI * 2, sin = Math.sin, cos = Math.cos, abs = Math.abs, max = Math.max, min = Math.min;
    const OUT = 'rgba(18,10,8,0.85)';

    /* ---------- utilidades ---------- */
    function hash(n) { if (typeof n === 'string') { let h = 7; for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) % 100003; n = h; } else if (!isFinite(n)) n = 7.7; n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); }
    function hex(c) {
        if (typeof c !== 'string') return [128, 128, 128];
        if (c[0] === '#') {
            let h = c.slice(1); if (h.length === 3) h = h.split('').map(x => x + x).join('');
            const n = parseInt(h.slice(0, 6), 16); if (isNaN(n)) return [128, 128, 128];
            return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        }
        const m = c.match(/rgba?\(([^)]+)\)/); if (m) { const p = m[1].split(',').map(parseFloat); return [p[0] | 0, p[1] | 0, p[2] | 0]; }
        return [128, 128, 128];
    }
    const _sc = {};
    function shade(c, k) {   // k<0 escurece, k>0 clareia
        const key = c + '|' + k; if (_sc[key]) return _sc[key];
        const [r, g, b] = hex(c); const t = k < 0 ? 0 : 255, a = abs(k);
        const o = 'rgb(' + Math.round(r + (t - r) * a) + ',' + Math.round(g + (t - g) * a) + ',' + Math.round(b + (t - b) * a) + ')';
        return (_sc[key] = o);
    }
    function alpha(c, a) { const [r, g, b] = hex(c); return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; }
    function mix(c1, c2, k) { const a = hex(c1), b = hex(c2); return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * k) + ',' + Math.round(a[1] + (b[1] - a[1]) * k) + ',' + Math.round(a[2] + (b[2] - a[2]) * k) + ')'; }

    function paint(g, fill, stroke, lw) {
        if (fill) { g.fillStyle = fill; g.fill(); }
        if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1.2; g.lineJoin = 'round'; g.stroke(); }
    }
    function ell(g, x, y, rx, ry, fill, stroke, lw, rot) { g.beginPath(); g.ellipse(x, y, max(0.01, rx), max(0.01, ry), rot || 0, 0, TAU); paint(g, fill, stroke, lw); }
    function poly(g, pts, fill, stroke, lw) { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); paint(g, fill, stroke, lw); }
    function rrect(g, x, y, w, h, r, fill, stroke, lw) {
        r = min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); paint(g, fill, stroke, lw);
    }
    function limb(g, x0, y0, x1, y1, w, col, outline) {
        g.lineCap = 'round';
        if (outline !== false) { g.strokeStyle = OUT; g.lineWidth = w + 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
        g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    function limb2(g, x0, y0, x1, y1, x2, y2, w, col) {   // perna/braço com joelho
        g.lineCap = 'round'; g.lineJoin = 'round';
        g.strokeStyle = OUT; g.lineWidth = w + 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x2, y2); g.stroke();
        g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    }
    function lg(g, x0, y0, x1, y1, stops) { const gr = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(s => gr.addColorStop(s[0], s[1])); return gr; }
    function rg(g, x, y, r0, r1, stops) { const gr = g.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(s => gr.addColorStop(s[0], s[1])); return gr; }
    function glow(g, x, y, r, col, a) { g.fillStyle = rg(g, x, y, 0, r, [[0, alpha(col, a)], [1, alpha(col, 0)]]); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    function tri(g, x0, y0, x1, y1, x2, y2, fill, stroke, lw) { poly(g, [x0, y0, x1, y1, x2, y2], fill, stroke, lw); }

    /* ---------- estado de animação por entidade ---------- */
    function idn(o) { const n = Number(o.id); if (isFinite(n) && n) return n; return hash(String(o.id || 1)) * 977 + 1; }   // ids de texto (catacumbas, chefe) também viram número
    function stepState(o, tx) {
        let a = o._a;
        if (!a) a = o._a = { x: o.x, y: o.y, face: 1, mv: 0, ph: hash(idn(o) * 1.7) * 6, atk: 0, hurt: 0, lastHp: o.hp, seed: hash(idn(o) * 3.3) * 50, sinceMove: 0 };
        const dx = o.x - a.x, dy = o.y - a.y, sp = Math.hypot(dx, dy);
        if (sp > 60) { a.x = o.x; a.y = o.y; a.lastHp = o.hp; return a; }   // teleporte: não anima
        a.x = o.x; a.y = o.y;
        const moving = sp > 0.06;
        // vira de lado só depois de andar para o outro lado por alguns quadros (evita "tremer" ao raspar em paredes/outros bichos)
        let want = 0;
        if (abs(dx) > 0.12) want = dx > 0 ? 1 : -1;
        else if (tx !== undefined && !moving) { const d = tx - (o.x + (o.w || 30) / 2); if (abs(d) > 10) want = d > 0 ? 1 : -1; }
        if (want && want !== a.face) { a.flip = (a.flip || 0) + 1; if (a.flip >= 7) { a.face = want; a.flip = 0; } } else a.flip = 0;
        a.mv += ((moving ? 1 : 0) - a.mv) * 0.18;
        a.ph += sp * 0.24 + 0.004;
        if (o.hp !== undefined && a.lastHp !== undefined && o.hp < a.lastHp) a.hurt = 1;
        a.lastHp = o.hp; a.hurt *= 0.9;
        if ((o.attackCooldown || 0) > 62) a.atk = 1; else a.atk *= 0.92;
        if (a.atk < 0.02) a.atk = 0; if (a.hurt < 0.02) a.hurt = 0;
        return a;
    }

    /* ============================================================
       CRIATURAS
       ============================================================ */
    const S = {};   // species -> { w,h, sh:[rx,ry], draw(g,st) }

    /* --- GOBLIN --- */
    /* braço + arma na mão: a = ângulo do braço (0 = pendurado, + = para frente/cima); a arma sai da mão e aponta para CIMA (-y), girando com wang.
       Assim nunca cruza o rosto e não fica "esticada" para o lado. */
    function held(g, sx, sy, a, len, w, armCol, handCol, wang, fn) {
        const hx = sx + sin(a) * len, hy = sy + cos(a) * len;
        limb(g, sx, sy, hx, hy, w, armCol);
        g.save(); g.translate(hx, hy); g.rotate(wang); fn(g); g.restore();
        ell(g, hx, hy, w * 0.56, w * 0.5, handCol, OUT, 1);
    }
    S.goblin = { w: 30, h: 34, sh: [10, 3], draw(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const sw = sin(ph) * mv, bob = abs(sin(ph)) * mv * 1.4, br = sin(t * 3 + st.seed) * 0.4;
        const skin = c1, skinD = shade(skin, -0.32), skinL = shade(skin, 0.28), cloth = c2, lean = atk * 3;
        limb2(g, -3, -12 - bob, -3 + sw * 3, -6, -4 + sw * 5, -0.5, 4.2, skinD);
        ell(g, -3 + sw * 5, -0.5, 3.6, 1.7, '#3b2a1d', OUT, 1);
        limb2(g, 3, -12 - bob, 3 - sw * 3, -6, 4 - sw * 5, -0.5, 4.2, skin);
        ell(g, 4 - sw * 5, -0.5, 3.6, 1.7, '#4a3524', OUT, 1);
        // braço de trás
        limb(g, -6, -22 - bob, -9 - sw * 3, -15 - bob, 3.6, skinD);
        // torso
        rrect(g, -7 + lean, -25 - bob + br, 14, 15, 4, lg(g, -7, -25, 7, -10, [[0, shade(cloth, 0.15)], [1, shade(cloth, -0.3)]]), OUT, 1.2);
        g.fillStyle = '#2c1d12'; g.fillRect(-7 + lean, -14 - bob, 14, 2.2);
        g.fillStyle = '#e0c060'; g.fillRect(-1 + lean, -14.4 - bob, 3, 3);
        poly(g, [-6, -11 - bob, 6, -11 - bob, 8, -6 - bob, -8, -6 - bob], shade(cloth, -0.2), OUT, 1);
        // cabeça
        const hx = 2 + lean * 1.4, hy = -29 - bob + br;
        tri(g, hx - 6, hy - 1, hx - 17, hy - 6 + sin(t * 5) * 0.8, hx - 6, hy + 5, skin, OUT, 1.1);
        tri(g, hx + 5, hy - 1, hx + 15, hy - 7, hx + 6, hy + 5, skinD, OUT, 1.1);
        tri(g, hx - 6.5, hy, hx - 13, hy - 3, hx - 6.5, hy + 3, '#e39a8a');
        ell(g, hx, hy, 8, 7.2, lg(g, hx - 6, hy - 7, hx + 6, hy + 7, [[0, skinL], [1, skin]]), OUT, 1.2);
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(hx - 1, hy - 5.5, 5, 1.3, 0, 0, TAU); g.fill();
        ell(g, hx + 3, hy - 1.5, 2.5, 2.3, '#ffe75a', OUT, 0.8); ell(g, hx - 3, hy - 1.5, 2.2, 2.1, '#ffe75a', OUT, 0.8);
        g.fillStyle = '#b3131b'; g.fillRect(hx + 3.2, hy - 2.6, 1.3, 2.4); g.fillRect(hx - 2.8, hy - 2.6, 1.3, 2.2);
        poly(g, [hx + 6, hy + 0.5, hx + 11, hy + 2.5, hx + 6, hy + 3.5], skinD, OUT, 0.9);
        g.strokeStyle = '#3a0d0d'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(hx - 2, hy + 4.4); g.quadraticCurveTo(hx + 2, hy + 6.8 + atk * 2, hx + 6, hy + 4); g.stroke();
        g.fillStyle = '#fff'; tri(g, hx - 1, hy + 4.5, hx + 0.6, hy + 4.7, hx - 0.2, hy + 6.6, '#fff'); tri(g, hx + 3, hy + 4.5, hx + 4.6, hy + 4.2, hx + 4, hy + 6.4, '#fff');
        // braço da frente + adaga (na mão, apontando para cima; no ataque desce para a frente)
        held(g, 8 + lean, -22 - bob, -0.25 + atk * 2.2 + sw * 0.35, 8.5, 3.8, skin, skin, 0.35 + atk * 1.7, g2 => {
            poly(g2, [-1.7, -1.5, 1.7, -1.5, 1.5, -15, 0, -19, -1.5, -15], lg(g2, -2, 0, 2, 0, [[0, '#f2f5f8'], [1, '#8f98a3']]), OUT, 1);
            g2.fillStyle = '#5b3a1e'; g2.fillRect(-3.4, -2.4, 6.8, 2.3); g2.fillRect(-1, 0, 2, 4);
        });
    } };

    /* --- ORC --- */
    S.orc = { w: 40, h: 46, sh: [15, 4], draw(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const sw = sin(ph) * mv, bob = abs(sin(ph)) * mv * 1.6, br = sin(t * 2.4 + st.seed) * 0.6;
        const skin = c1, skinD = shade(skin, -0.35), skinL = shade(skin, 0.22), metal = c2, lean = atk * 4;
        limb2(g, -5, -17 - bob, -5 + sw * 4, -9, -6 + sw * 6, -1, 7, shade('#4a3a2a', -0.2));
        limb2(g, 5, -17 - bob, 5 - sw * 4, -9, 6 - sw * 6, -1, 7, '#5a4630');
        ell(g, -6 + sw * 6, 0, 5.5, 2.4, '#251a10', OUT, 1); ell(g, 6 - sw * 6, 0, 5.5, 2.4, '#2c2014', OUT, 1);
        limb(g, -12, -34 - bob, -15 - sw * 3, -22 - bob, 6, skinD);
        // tronco
        g.save(); g.translate(lean, 0);
        g.beginPath(); g.moveTo(-13, -21 - bob); g.quadraticCurveTo(-16, -37 - bob + br, -6, -40 - bob + br); g.lineTo(6, -40 - bob + br); g.quadraticCurveTo(16, -37 - bob + br, 13, -21 - bob); g.closePath();
        paint(g, lg(g, -14, -40, 14, -20, [[0, skinL], [1, skinD]]), OUT, 1.3);
        rrect(g, -12, -27 - bob, 24, 8, 3, '#4d3a26', OUT, 1.2);
        g.fillStyle = '#c9a54a'; g.fillRect(-2, -26 - bob, 4, 6);
        // ombreiras metal
        ell(g, -13, -37 - bob, 6, 5, lg(g, -18, -42, -8, -32, [[0, shade(metal, 0.3)], [1, shade(metal, -0.3)]]), OUT, 1.2);
        ell(g, 13, -37 - bob, 6, 5, lg(g, 8, -42, 18, -32, [[0, shade(metal, 0.3)], [1, shade(metal, -0.3)]]), OUT, 1.2);
        for (let i = -1; i <= 1; i += 2) { tri(g, i * 13 - 1.5, -41 - bob, i * 13, -47 - bob, i * 13 + 1.5, -41 - bob, '#d8d8d8', OUT, 0.8); }
        // cabeça
        const hx = 3, hy = -45 - bob + br;
        ell(g, hx, hy, 8, 7.4, lg(g, hx - 6, hy - 7, hx + 6, hy + 7, [[0, skinL], [1, skin]]), OUT, 1.3);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(hx - 7, hy - 4.6, 14, 1.8);
        ell(g, hx + 3.2, hy - 1.2, 1.8, 1.6, '#ffdf3a'); ell(g, hx - 2.6, hy - 1.2, 1.8, 1.6, '#ffdf3a');
        g.fillStyle = '#c0141a'; g.fillRect(hx + 3.2, hy - 1.6, 1.1, 1.3); g.fillRect(hx - 2.4, hy - 1.6, 1.1, 1.3);
        ell(g, hx + 7, hy + 1.5, 3.2, 2.6, skinD, OUT, 1);
        g.fillStyle = '#4a0c0c'; g.beginPath(); g.moveTo(hx - 5, hy + 4); g.quadraticCurveTo(hx + 1, hy + 8 + atk * 2, hx + 7, hy + 4.5); g.lineTo(hx + 7, hy + 3.5); g.quadraticCurveTo(hx + 1, hy + 5, hx - 5, hy + 3); g.fill();
        tri(g, hx - 4.6, hy + 3.6, hx - 3, hy + 3.8, hx - 4, hy - 1, '#f4efd8', OUT, 0.7); tri(g, hx + 5.6, hy + 3.6, hx + 7.2, hy + 4, hx + 6.2, hy - 1.5, '#f4efd8', OUT, 0.7);
        tri(g, hx - 8, hy - 1, hx - 13, hy - 5, hx - 8, hy + 3, skinD, OUT, 1);
        g.restore();
        // braço da frente + machado (empunhado para cima, ao lado da cabeça; no ataque desce em arco)
        held(g, 13 + lean, -36 - bob, -0.2 + atk * 2.3 + sw * 0.3, 11, 6.5, skin, skinD, 0.32 + atk * 1.75, g2 => {
            g2.fillStyle = '#5b3a1e'; g2.strokeStyle = OUT; g2.lineWidth = 1; g2.beginPath(); g2.rect(-1.6, -26, 3.2, 34); g2.fill(); g2.stroke();
            g2.beginPath(); g2.moveTo(1.4, -25); g2.quadraticCurveTo(13, -28, 12, -16); g2.quadraticCurveTo(13, -8, 1.4, -11); g2.closePath(); paint(g2, lg(g2, 1, -25, 13, -12, [[0, '#e8ecf0'], [1, '#7c8590']]), OUT, 1.2);
        });
    } };

    /* --- LOBO --- */
    function quad(g, st, o) {   // quadrúpede genérico: pernas em pares alternados
        const { mv, ph } = st;
        const legs = o.legs; const out = [];
        for (let i = 0; i < legs.length; i++) {
            const L = legs[i]; const off = L.off; const s = sin(ph + off) * mv * (o.stride || 6), lift = max(0, cos(ph + off)) * mv * (o.lift || 3);
            out.push({ x: L.x, top: L.top, fx: L.x + s, fy: -lift, far: L.far });
        }
        return out;
    }
    S.wolf = { w: 44, h: 30, sh: [17, 4], draw(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const fur = c1, furD = shade(fur, -0.4), furL = c2, bob = abs(sin(ph)) * mv * 1.4, br = sin(t * 3 + st.seed) * 0.5, lean = atk * 5;
        const legs = quad(g, st, { legs: [{ x: -11, top: -13, off: 0, far: true }, { x: 10, top: -13, off: PI, far: true }, { x: -8, top: -13, off: PI }, { x: 12, top: -13, off: 0 }], stride: 7, lift: 4 });
        legs.forEach(L => { limb2(g, L.x, L.top - bob, L.x + (L.fx - L.x) * 0.3, -6, L.fx, L.fy, 4, L.far ? furD : fur); ell(g, L.fx + 1, L.fy, 3, 1.6, '#2b2b30', OUT, 0.8); });
        // rabo
        g.save(); g.translate(-16 + lean, -20 - bob); g.rotate(-0.5 + sin(t * (5 + mv * 6) + st.seed) * 0.28);
        g.beginPath(); g.moveTo(0, -2); g.quadraticCurveTo(-9, -3, -15, 3 + atk * 3); g.quadraticCurveTo(-8, 3, 0, 3); g.closePath(); paint(g, lg(g, 0, 0, -15, 4, [[0, fur], [1, furL]]), OUT, 1.1); g.restore();
        // corpo
        g.beginPath(); g.moveTo(-17 + lean, -17 - bob); g.quadraticCurveTo(-18 + lean, -27 - bob + br, -6, -27 - bob + br); g.quadraticCurveTo(6, -28 - bob, 14 + lean, -24 - bob); g.quadraticCurveTo(18 + lean, -15 - bob, 10 + lean, -11 - bob); g.quadraticCurveTo(-4, -8 - bob, -17 + lean, -17 - bob); g.closePath();
        paint(g, lg(g, 0, -28, 0, -9, [[0, shade(fur, -0.15)], [0.55, fur], [1, furL]]), OUT, 1.3);
        g.fillStyle = alpha(furD, 0.55); g.beginPath(); g.moveTo(-14 + lean, -22 - bob); g.quadraticCurveTo(0, -30 - bob, 12 + lean, -24 - bob); g.quadraticCurveTo(0, -25 - bob, -14 + lean, -22 - bob); g.fill();
        for (let i = 0; i < 5; i++) { g.strokeStyle = alpha(furD, 0.4); g.lineWidth = 1; g.beginPath(); g.moveTo(-9 + i * 5 + lean, -25 - bob); g.lineTo(-11 + i * 5 + lean, -18 - bob); g.stroke(); }
        // cabeça
        const hx = 16 + lean * 1.4, hy = -21 - bob + br - atk * 1;
        tri(g, hx - 5, hy - 5, hx - 3, hy - 13, hx + 1, hy - 5, furD, OUT, 1); tri(g, hx - 1, hy - 5, hx + 3, hy - 12, hx + 5, hy - 4, fur, OUT, 1);
        g.beginPath(); g.moveTo(hx - 6, hy - 4); g.quadraticCurveTo(hx, hy - 8, hx + 6, hy - 4); g.lineTo(hx + 13, hy + 0.5); g.quadraticCurveTo(hx + 14, hy + 3, hx + 10, hy + 3); g.lineTo(hx + 4, hy + 3 + atk * 3); g.quadraticCurveTo(hx - 4, hy + 6, hx - 6, hy + 2); g.closePath();
        paint(g, lg(g, hx - 6, hy - 8, hx + 12, hy + 6, [[0, fur], [1, furL]]), OUT, 1.2);
        if (atk > 0.15) { g.fillStyle = '#5a0f14'; g.beginPath(); g.moveTo(hx + 4, hy + 3); g.lineTo(hx + 12, hy + 3); g.lineTo(hx + 8, hy + 3 + atk * 6); g.closePath(); g.fill(); tri(g, hx + 5, hy + 3, hx + 6.4, hy + 3, hx + 5.7, hy + 5.4, '#fff'); tri(g, hx + 9, hy + 3, hx + 10.4, hy + 3, hx + 9.7, hy + 5.4, '#fff'); }
        ell(g, hx + 13, hy + 0.2, 2, 1.7, '#111', OUT, 0.6);
        g.fillStyle = '#ffd23f'; g.beginPath(); g.ellipse(hx + 3, hy - 1.2, 2, 1.2, 0.3, 0, TAU); g.fill(); g.fillStyle = '#111'; g.fillRect(hx + 3, hy - 2.2, 0.9, 2);
    } };

    /* --- ESQUELETO --- */
    S.skeleton = { w: 30, h: 44, sh: [10, 3], draw(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const sw = sin(ph) * mv, bob = abs(sin(ph)) * mv * 1.3, bone = c1, boneD = shade(bone, -0.35), lean = atk * 3, br = sin(t * 2.5 + st.seed) * 0.3;
        limb2(g, -3, -17 - bob, -3 + sw * 4, -9, -3 + sw * 6, -0.5, 2.6, boneD); limb2(g, 3, -17 - bob, 3 - sw * 4, -9, 3 - sw * 6, -0.5, 2.6, bone);
        ell(g, -3 + sw * 6, -0.5, 3, 1.4, boneD, OUT, 0.8); ell(g, 3 - sw * 6, -0.5, 3, 1.4, bone, OUT, 0.8);
        // pelve
        ell(g, lean * 0.4, -18 - bob, 6, 3, bone, OUT, 1);
        // escudo (costas)
        g.save(); g.translate(-8 + lean * 0.5, -25 - bob); ell(g, 0, 0, 7, 9, lg(g, -6, -8, 6, 8, [[0, '#8a6a44'], [1, '#4c3a24']]), OUT, 1.2); ell(g, 0, 0, 2.5, 3, c2, OUT, 0.8); g.restore();
        // coluna e costelas
        g.strokeStyle = boneD; g.lineWidth = 2.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(lean * 0.4, -19 - bob); g.lineTo(lean * 0.8, -33 - bob); g.stroke();
        for (let i = 0; i < 4; i++) { const y = -32 + i * 3.4 - bob + br; g.strokeStyle = OUT; g.lineWidth = 3.4; g.beginPath(); g.moveTo(-6 + lean * 0.8, y + 1); g.quadraticCurveTo(lean * 0.8, y - 1.5, 6 + lean * 0.8, y + 1); g.stroke(); g.strokeStyle = bone; g.lineWidth = 1.8; g.beginPath(); g.moveTo(-6 + lean * 0.8, y + 1); g.quadraticCurveTo(lean * 0.8, y - 1.5, 6 + lean * 0.8, y + 1); g.stroke(); }
        // braço + espada
        held(g, 8 + lean, -33 - bob, -0.1 + atk * 2.2 + sw * 0.3, 10, 2.6, bone, bone, 0.55 + atk * 1.5, g2 => {
            poly(g2, [-1.6, -2, 1.6, -2, 1.4, -19, 0, -23, -1.4, -19], lg(g2, -2, 0, 2, 0, [[0, '#dfe6ea'], [1, '#7b8792']]), OUT, 1);
            g2.fillStyle = '#6b4a24'; g2.fillRect(-4, -3, 8, 2.2); g2.fillRect(-1, -1, 2, 5);
        });
        // crânio
        const hx = 2 + lean * 1.3, hy = -39 - bob + br;
        ell(g, hx, hy, 6.4, 6, lg(g, hx - 6, hy - 6, hx + 6, hy + 6, [[0, shade(bone, 0.25)], [1, boneD]]), OUT, 1.2);
        const jaw = 1 + atk * 2 + abs(sin(t * 9)) * 0.4 * (st.mv > 0.3 ? 1 : 0);
        rrect(g, hx - 3.6, hy + 3.4, 8, 3 + jaw * 0.6, 1.2, boneD, OUT, 0.9);
        g.fillStyle = '#1a1010'; g.beginPath(); g.ellipse(hx - 2.4, hy - 0.6, 2, 2.3, 0, 0, TAU); g.ellipse(hx + 3, hy - 0.6, 2, 2.3, 0, 0, TAU); g.fill();
        g.fillStyle = '#ff2e2e'; g.fillRect(hx - 2.8, hy - 1, 1.2, 1.2); g.fillRect(hx + 2.6, hy - 1, 1.2, 1.2);
        tri(g, hx - 0.5, hy + 1.8, hx + 0.8, hy + 1.8, hx + 0.2, hy + 3.6, '#1a1010');
        g.strokeStyle = '#1a1010'; g.lineWidth = 0.7; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(hx - 3 + i * 2.2, hy + 4); g.lineTo(hx - 3 + i * 2.2, hy + 5.5 + jaw * 0.3); g.stroke(); }
    } };

    /* --- SLIME --- */
    S.slime = { w: 32, h: 26, sh: [13, 3], draw(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const hop = abs(sin(ph * 0.6)) * mv * 7, sq = 1 + sin(t * 3 + st.seed) * 0.05 - (hop < 1 ? 0.12 * mv : -0.08 * mv) + atk * 0.15, wx = 1 / sq;
        g.save(); g.translate(0, -hop); g.scale(wx, sq);
        g.beginPath(); g.moveTo(-15, 0); g.bezierCurveTo(-18, -14, -9, -25, 0, -25); g.bezierCurveTo(9, -25, 18, -14, 15, 0); g.quadraticCurveTo(0, 3, -15, 0); g.closePath();
        paint(g, rg(g, -3, -16, 1, 20, [[0, alpha(c2, 0.95)], [0.5, alpha(c1, 0.9)], [1, alpha(shade(c1, -0.35), 0.95)]]), alpha(shade(c1, -0.55), 0.9), 1.4);
        ell(g, -5, -19, 4, 2, 'rgba(255,255,255,0.55)', null, 0, -0.5); ell(g, 6, -8, 1.6, 1.6, 'rgba(255,255,255,0.35)'); ell(g, -7, -6, 1.2, 1.2, 'rgba(255,255,255,0.3)');
        ell(g, 4, -6, 2.4, 2.4, alpha(shade(c1, -0.55), 0.55));   // núcleo
        ell(g, -4, -13, 2.7, 3, '#fff', OUT, 0.8); ell(g, 4.5, -13, 2.7, 3, '#fff', OUT, 0.8);
        ell(g, -3.4, -12.6, 1.3, 1.6, '#111'); ell(g, 5.1, -12.6, 1.3, 1.6, '#111');
        g.strokeStyle = '#183c1e'; g.lineWidth = 1.1; g.beginPath(); g.arc(0.5, -8, 2.6 + atk * 1.5, 0.15, PI - 0.15); g.stroke();
        g.restore();
    } };

    /* --- MORCEGO --- */
    S.bat = { w: 36, h: 28, sh: [8, 2.4], fly: 14, draw(g, st) {
        const { t, atk, c1, c2 } = st; const hv = -14 + sin(t * 3 + st.seed) * 3 - atk * 4, fl = sin(t * 20 + st.seed) * 0.85;
        for (let side = -1; side <= 1; side += 2) {
            g.save(); g.translate(side * 3, hv - 3); g.scale(side, 1); g.rotate(-fl * 0.5);
            g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(8, -12 - fl * 7, 18, -6 - fl * 12);
            g.quadraticCurveTo(15, -1 - fl * 4, 15, 2 - fl * 3); g.quadraticCurveTo(11, 0 - fl * 2, 10.5, 4 - fl * 2);
            g.quadraticCurveTo(6, 2, 5, 6); g.quadraticCurveTo(2, 3, 0, 5); g.closePath();
            paint(g, lg(g, 0, -8, 18, 4, [[0, c1], [1, shade(c1, -0.4)]]), OUT, 1.1);
            g.strokeStyle = shade(c1, -0.55); g.lineWidth = 0.9; g.beginPath(); g.moveTo(0, 0); g.lineTo(18, -6 - fl * 12); g.moveTo(0, 0); g.lineTo(15, 2 - fl * 3); g.moveTo(0, 0); g.lineTo(10.5, 4 - fl * 2); g.stroke();
            g.restore();
        }
        ell(g, 0, hv, 5, 6.4, lg(g, -5, hv - 6, 5, hv + 6, [[0, shade(c1, 0.2)], [1, shade(c1, -0.35)]]), OUT, 1.1);
        ell(g, 0, hv - 8, 4.4, 4.2, c1, OUT, 1.1);
        tri(g, -4.2, hv - 10, -5.6, hv - 16, -1.6, hv - 11.4, c1, OUT, 1); tri(g, 4.2, hv - 10, 5.6, hv - 16, 1.6, hv - 11.4, c1, OUT, 1);
        tri(g, -3.6, hv - 11, -4.6, hv - 14.4, -2.2, hv - 11.6, c2); tri(g, 3.6, hv - 11, 4.6, hv - 14.4, 2.2, hv - 11.6, c2);
        g.fillStyle = '#ff3b3b'; g.fillRect(-3, hv - 9.2, 1.7, 1.7); g.fillRect(1.4, hv - 9.2, 1.7, 1.7);
        const o = atk > 0.1 ? 1.5 : 0; tri(g, -2.2, hv - 5.6, -1, hv - 5.6, -1.6, hv - 3.4 - o, '#fff'); tri(g, 2.2, hv - 5.6, 1, hv - 5.6, 1.6, hv - 3.4 - o, '#fff');
    } };

    /* --- ARANHA --- */
    S.spider = { w: 46, h: 30, sh: [16, 3.5], draw(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const bob = abs(sin(ph * 2)) * mv * 0.8, lean = atk * 4;
        const legPass = (far) => {
            for (let i = 0; i < 4; i++) {
                const k = (i - 1.5), bx = 4 + k * 3.4 + lean * 0.5, spread = k * 15 + (far ? -3 : 3), s = sin(ph * 1.4 + i * 1.7 + (far ? PI : 0)) * mv * 4, lift = max(0, cos(ph * 1.4 + i * 1.7 + (far ? PI : 0))) * mv * 3;
                const tx = bx + spread * 1.35 + s + 4 * (i < 2 ? 0.6 : -0.2), ty = far ? -1.5 - lift : 0 - lift, kx = bx + spread * 0.7 + (i - 1.5) * 2, ky = -23 - (far ? 0 : 1.5) + sin(t * 2 + i) * 0.4;
                g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = OUT; g.lineWidth = 3.6; g.beginPath(); g.moveTo(bx, -14 - bob); g.lineTo(kx, ky); g.lineTo(tx, ty); g.stroke();
                g.strokeStyle = far ? shade(c1, -0.3) : shade(c1, 0.1); g.lineWidth = 2; g.stroke();
            }
        };
        legPass(true);
        ell(g, -9 + lean * 0.3, -15 - bob, 12, 9.6, rg(g, -12, -20, 1, 14, [[0, shade(c1, 0.35)], [0.6, c1], [1, shade(c1, -0.4)]]), OUT, 1.3);
        g.fillStyle = c2; g.beginPath(); g.moveTo(-9 + lean * 0.3, -19 - bob); g.lineTo(-6.6 + lean * 0.3, -15 - bob); g.lineTo(-9 + lean * 0.3, -11 - bob); g.lineTo(-11.4 + lean * 0.3, -15 - bob); g.closePath(); g.fill();
        ell(g, 6 + lean, -14 - bob, 7.6, 6.4, lg(g, 0, -20, 12, -8, [[0, shade(c1, 0.25)], [1, shade(c1, -0.35)]]), OUT, 1.2);
        // olhos
        g.fillStyle = '#ff2b2b'; ell(g, 11 + lean, -17 - bob, 1.9, 1.9, '#ff2b2b', '#400', 0.6); ell(g, 8.4 + lean, -18.6 - bob, 1.5, 1.5, '#ff2b2b', '#400', 0.6);
        g.fillStyle = '#d33'; for (let i = 0; i < 4; i++) g.fillRect(6 + lean + i * 1.7, -19.8 - bob, 1.1, 1.1);
        const f = atk * 2; tri(g, 12.4 + lean, -12.4 - bob, 13.6 + lean, -12.6 - bob, 13.2 + lean, -8.4 - bob - f, '#eee', OUT, 0.7); tri(g, 10 + lean, -12.2 - bob, 11.2 + lean, -12 - bob, 10.6 + lean, -8.2 - bob - f, '#eee', OUT, 0.7);
        legPass(false);
    } };

    /* --- RATO --- */
    S.rat = { w: 28, h: 18, sh: [10, 2.6], draw(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const bob = abs(sin(ph * 1.5)) * mv * 1.1, lean = atk * 3;
        g.strokeStyle = OUT; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(-9, -6 - bob); g.bezierCurveTo(-17, -4, -13 + sin(t * 4) * 2, -12, -20 + sin(t * 3) * 3, -9); g.stroke();
        g.strokeStyle = c2; g.lineWidth = 1.4; g.stroke();
        for (let i = 0; i < 4; i++) { const x = [-6, 5, -3, 8][i], far = i < 2, s = sin(ph * 1.5 + i * 1.6) * mv * 3; limb(g, x, -5 - bob, x + s, -0.5, 2.4, far ? shade(c1, -0.3) : c1); }
        g.beginPath(); g.moveTo(-10 + lean, -6 - bob); g.quadraticCurveTo(-9 + lean, -14 - bob, 2 + lean, -14 - bob); g.quadraticCurveTo(10 + lean, -13 - bob, 12 + lean, -8 - bob); g.quadraticCurveTo(5, -2 - bob, -10 + lean, -6 - bob); g.closePath();
        paint(g, lg(g, 0, -14, 0, -3, [[0, shade(c1, 0.1)], [1, shade(c1, -0.3)]]), OUT, 1.1);
        g.beginPath(); g.moveTo(9 + lean, -13 - bob); g.quadraticCurveTo(14 + lean, -12 - bob, 17 + lean, -8.6 - bob); g.quadraticCurveTo(13 + lean, -5.6 - bob, 8 + lean, -6 - bob); g.closePath(); paint(g, c1, OUT, 1);
        ell(g, 17.4 + lean, -8.6 - bob, 1.3, 1.1, '#ff8da0', OUT, 0.5); ell(g, 6 + lean, -15 - bob, 3.2, 3.6, c2, OUT, 0.9); ell(g, 11.4 + lean, -10.4 - bob, 1.1, 1.1, '#111');
        g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 0.6; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(15 + lean, -8 - bob + i); g.lineTo(21 + lean, -9 - bob + i * 2.4); g.stroke(); }
        if (atk > 0.1) { tri(g, 14 + lean, -6.4 - bob, 15.2 + lean, -6.4 - bob, 14.6 + lean, -4.2 - bob, '#fff'); }
    } };

    /* --- COBRA --- */
    S.snake = { w: 42, h: 20, sh: [17, 2.6], draw(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const N = 16, pts = [];
        for (let i = 0; i < N; i++) { const p = i / (N - 1); pts.push({ x: -19 + p * 32 + atk * 3 * p, y: -5 - sin(t * 4 - p * 6 + ph * 2) * (2.4 + mv * 2.2) * (1 - p * 0.3) - (p > 0.78 ? (p - 0.78) * (20 + atk * 10) : 0), r: 1.6 + sin(p * PI) * 2.3 * (p < 0.85 ? 1 : 0.9) }); }
        for (let i = 0; i < N; i++) { const q = pts[i]; ell(g, q.x, q.y, q.r + 1.1, q.r + 1.1, OUT); }
        for (let i = 0; i < N; i++) { const q = pts[i]; ell(g, q.x, q.y, q.r, q.r, i % 3 === 0 ? c2 : rg(g, q.x, q.y - 1, 0.5, q.r + 1, [[0, shade(c1, 0.3)], [1, shade(c1, -0.25)]])); }
        const h = pts[N - 1]; ell(g, h.x + 3, h.y, 5.2, 3.6, lg(g, h.x, h.y - 3, h.x + 8, h.y + 3, [[0, shade(c1, 0.25)], [1, shade(c1, -0.2)]]), OUT, 1.1);
        ell(g, h.x + 4, h.y - 1.2, 1.3, 1.6, '#ffe23a', OUT, 0.5); g.fillStyle = '#111'; g.fillRect(h.x + 3.8, h.y - 2.4, 0.8, 2.4);
        if (sin(t * 5 + st.seed) > 0.3 || atk > 0.2) { g.strokeStyle = '#d61f3a'; g.lineWidth = 1; g.beginPath(); g.moveTo(h.x + 8, h.y + 0.6); g.lineTo(h.x + 13, h.y + 0.6); g.lineTo(h.x + 15, h.y - 0.6); g.moveTo(h.x + 13, h.y + 0.6); g.lineTo(h.x + 15, h.y + 1.9); g.stroke(); }
    } };

    /* --- JAVALI --- */
    S.boar = { w: 42, h: 30, sh: [16, 3.6], draw(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const fur = c1, furD = shade(fur, -0.4), bob = abs(sin(ph)) * mv * 1.2, lean = atk * 5;
        quad(g, st, { legs: [{ x: -11, top: -11, off: 0, far: true }, { x: 11, top: -11, off: PI, far: true }, { x: -8, top: -11, off: PI }, { x: 13, top: -11, off: 0 }], stride: 5, lift: 3 }).forEach(L => { limb(g, L.x, L.top - bob, L.fx, L.fy - 1, 4.6, L.far ? furD : fur); ell(g, L.fx, L.fy, 2.6, 1.5, '#241a12', OUT, 0.8); });
        g.strokeStyle = furD; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(-15, -20 - bob); g.quadraticCurveTo(-20, -24, -18, -28 + sin(t * 4) * 2); g.stroke();
        g.beginPath(); g.moveTo(-16 + lean, -15 - bob); g.quadraticCurveTo(-17 + lean, -28 - bob, -3, -28 - bob); g.quadraticCurveTo(10, -30 - bob, 15 + lean, -23 - bob); g.quadraticCurveTo(19 + lean, -13 - bob, 9 + lean, -9 - bob); g.quadraticCurveTo(-8, -7 - bob, -16 + lean, -15 - bob); g.closePath();
        paint(g, lg(g, 0, -30, 0, -8, [[0, shade(fur, 0.05)], [1, furD]]), OUT, 1.3);
        g.fillStyle = shade(furD, -0.2); for (let i = 0; i < 9; i++) { const x = -13 + i * 3.1 + lean * 0.5; tri(g, x, -27 - bob + (i % 2), x + 1.6, -32 - bob - (i % 3), x + 3.2, -27 - bob + (i % 2), shade(furD, -0.2), null); }
        const hx = 14 + lean * 1.4, hy = -18 - bob;
        ell(g, hx, hy, 8.4, 7.4, lg(g, hx - 6, hy - 7, hx + 6, hy + 7, [[0, shade(fur, 0.1)], [1, furD]]), OUT, 1.2);
        tri(g, hx - 4, hy - 6, hx - 3, hy - 12, hx + 1, hy - 6.4, furD, OUT, 1);
        ell(g, hx + 8.4, hy + 1.6, 4, 3.4, '#d59a8c', OUT, 1); ell(g, hx + 9.8, hy + 1.6, 0.8, 1.1, '#3a1a16'); ell(g, hx + 7.4, hy + 2.2, 0.8, 1.1, '#3a1a16');
        g.strokeStyle = OUT; g.lineWidth = 3.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(hx + 5, hy + 4); g.quadraticCurveTo(hx + 8, hy + 9, hx + 12, hy + 5 - atk * 2); g.stroke(); g.strokeStyle = c2; g.lineWidth = 2; g.stroke();
        ell(g, hx + 1.6, hy - 2, 1.7, 1.5, '#ffb03a', OUT, 0.5); g.fillStyle = '#111'; g.fillRect(hx + 1.6, hy - 2.8, 1, 1.8);
    } };

    /* --- FANTASMA --- */
    S.ghost = { w: 30, h: 46, sh: [10, 2.6], fly: 7, draw(g, st) {
        const { t, mv, atk, c1, c2 } = st; const hv = -8 + sin(t * 2.4 + st.seed) * 3, W = 14;
        glow(g, 0, hv - 20, 30, c1, 0.28 + atk * 0.2);
        g.save(); g.globalAlpha = 0.85;
        g.beginPath(); g.moveTo(-W, hv - 6);
        g.bezierCurveTo(-W - 2, hv - 30, -8, hv - 38, 0, hv - 38); g.bezierCurveTo(8, hv - 38, W + 2, hv - 30, W, hv - 6);
        for (let i = 0; i <= 4; i++) { const x = W - i * (W * 2 / 4), y = hv + 2 + sin(t * 4 + i * 1.5 + st.seed) * 2.6 * (i % 2 ? 1 : -1); g.quadraticCurveTo(x + W / 4, y + 4, x, y - (i % 2 ? 0 : 3)); }
        g.closePath(); paint(g, lg(g, 0, hv - 38, 0, hv + 4, [[0, '#ffffff'], [0.45, c1], [1, alpha(c1, 0.25)]]), 'rgba(160,200,255,0.9)', 1.2);
        // braços
        const wave = sin(t * 3 + st.seed) * 4 + atk * 6;
        for (let s = -1; s <= 1; s += 2) { g.beginPath(); g.moveTo(s * 11, hv - 22); g.quadraticCurveTo(s * 20, hv - 18 - wave, s * 20 + s * atk * 4, hv - 8 - wave); g.quadraticCurveTo(s * 15, hv - 12, s * 10, hv - 14); g.closePath(); paint(g, alpha(c1, 0.75), 'rgba(160,200,255,0.7)', 1); }
        g.restore();
        ell(g, -5, hv - 27, 3, 4.3, '#0a0f24'); ell(g, 5, hv - 27, 3, 4.3, '#0a0f24'); glow(g, -5, hv - 27, 5, '#7fd0ff', 0.9); glow(g, 5, hv - 27, 5, '#7fd0ff', 0.9);
        ell(g, 0, hv - 18, 2.4 + atk * 2, 3.4 + atk * 3, '#0a0f24');
    } };

    /* --- TROLL --- */
    S.troll = { w: 58, h: 70, sh: [20, 5], draw(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const sw = sin(ph) * mv, bob = abs(sin(ph)) * mv * 2.2, br = sin(t * 2 + st.seed) * 0.8, skin = c1, skinD = shade(skin, -0.38), skinL = shade(skin, 0.22), lean = atk * 5;
        limb2(g, -7, -24 - bob, -7 + sw * 4, -13, -8 + sw * 8, -1, 11, skinD); limb2(g, 8, -24 - bob, 8 - sw * 4, -13, 9 - sw * 8, -1, 11, skin);
        ell(g, -8 + sw * 8, 0, 8, 3, '#2e2a22', OUT, 1.2); ell(g, 9 - sw * 8, 0, 8, 3, '#332e26', OUT, 1.2);
        // braço de trás
        limb2(g, -17, -47 - bob, -25, -34 - bob, -24 - sw * 5, -20 - bob, 10, skinD); ell(g, -24 - sw * 5, -18 - bob, 6, 5.4, skinD, OUT, 1.1);
        g.save(); g.translate(lean, 0);
        g.beginPath(); g.moveTo(-18, -22 - bob); g.bezierCurveTo(-26, -40 - bob, -18, -56 - bob + br, 0, -55 - bob + br); g.bezierCurveTo(20, -56 - bob, 26, -40 - bob, 18, -22 - bob); g.bezierCurveTo(8, -18 - bob, -8, -18 - bob, -18, -22 - bob); g.closePath();
        paint(g, lg(g, -24, -56, 24, -20, [[0, skinL], [0.6, skin], [1, skinD]]), OUT, 1.5);
        ell(g, 2, -34 - bob, 12, 12, alpha(skinL, 0.55));   // barriga
        g.fillStyle = shade(c2, -0.1); g.beginPath(); g.moveTo(-17, -28 - bob); g.lineTo(17, -28 - bob); g.lineTo(20, -18 - bob); g.lineTo(11, -14 - bob); g.lineTo(0, -19 - bob); g.lineTo(-11, -14 - bob); g.lineTo(-20, -18 - bob); g.closePath(); paint(g, shade(c2, -0.1), OUT, 1.2);
        g.fillStyle = '#5c8a3e'; ell(g, -12, -46 - bob, 4, 2.4, '#5f8a3e'); ell(g, 10, -52 - bob, 3, 1.8, '#5f8a3e');
        for (let i = 0; i < 4; i++) ell(g, -8 + i * 7, -40 - bob + (i % 2) * 5, 1.2, 1.2, skinD);
        // cabeça pequena
        const hx = 8, hy = -58 - bob + br - atk * 2;
        ell(g, hx, hy, 10, 8.6, lg(g, hx - 8, hy - 8, hx + 8, hy + 8, [[0, skinL], [1, skin]]), OUT, 1.4);
        g.fillStyle = skinD; g.beginPath(); g.moveTo(hx - 9, hy - 3); g.quadraticCurveTo(hx, hy - 8, hx + 10, hy - 3); g.lineTo(hx + 10, hy - 1); g.quadraticCurveTo(hx, hy - 5, hx - 9, hy - 1); g.fill();
        ell(g, hx + 4.4, hy - 0.6, 1.8, 1.6, '#fff3a0'); ell(g, hx - 2.4, hy - 0.6, 1.8, 1.6, '#fff3a0'); g.fillStyle = '#111'; g.fillRect(hx + 4.6, hy - 1.2, 1, 1.2); g.fillRect(hx - 2.2, hy - 1.2, 1, 1.2);
        ell(g, hx + 9, hy + 2.4, 3.8, 3.2, skinD, OUT, 1); ell(g, hx - 7, hy + 4, 1.6, 1.6, '#7ba05a');
        g.fillStyle = '#3a0c0c'; g.beginPath(); g.moveTo(hx - 6, hy + 5); g.quadraticCurveTo(hx + 2, hy + 10 + atk * 3, hx + 9, hy + 6); g.lineTo(hx + 9, hy + 5); g.quadraticCurveTo(hx + 2, hy + 6, hx - 6, hy + 4); g.fill();
        tri(g, hx - 5, hy + 5.2, hx - 2.4, hy + 5.6, hx - 3.8, hy - 1.4, '#f2ecd0', OUT, 0.8); tri(g, hx + 6.4, hy + 6, hx + 9, hy + 6, hx + 8, hy - 0.4, '#f2ecd0', OUT, 0.8);
        g.strokeStyle = '#5a4030'; g.lineWidth = 1.2; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(hx - 6 + i * 3.4, hy - 8); g.lineTo(hx - 8 + i * 3.4 + sin(t * 2 + i) * 0.8, hy - 14); g.stroke(); }
        g.restore();
        // braço + tacape (apoiado para cima; no ataque desce pesado)
        held(g, 19 + lean, -47 - bob, -0.15 + atk * 2.3 + sw * 0.15, 20, 10, skin, skinD, 0.3 + atk * 1.75, g2 => {
            g2.beginPath(); g2.moveTo(-3, 6); g2.lineTo(3, 6); g2.lineTo(6, -30); g2.quadraticCurveTo(5, -44, -5, -42); g2.quadraticCurveTo(-9, -34, -3, 6); g2.closePath();
            paint(g2, lg(g2, -8, 0, 8, 0, [[0, '#8a6238'], [1, '#4a3018']]), OUT, 1.3);
            g2.strokeStyle = 'rgba(0,0,0,0.3)'; g2.lineWidth = 1; for (let i = 0; i < 4; i++) { g2.beginPath(); g2.moveTo(-3, -4 - i * 8); g2.lineTo(3, -2 - i * 8); g2.stroke(); }
            for (let i = 0; i < 4; i++) tri(g2, 4 + (i % 2) * 2, -14 - i * 5, 9 + (i % 2) * 2, -12 - i * 5, 4 + (i % 2) * 2, -9 - i * 5, '#c8ccd2', OUT, 0.8);
        });
    } };

    /* --- GOLEM --- */
    S.golem = { w: 60, h: 66, sh: [24, 5], draw(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const step = abs(sin(ph * 0.8)) * mv, sw = sin(ph * 0.8) * mv, br = sin(t * 1.5 + st.seed) * 0.5, lean = atk * 4, pulse = 0.6 + sin(t * 3 + st.seed) * 0.3 + atk * 0.5;
        const stone = c1, dk = shade(stone, -0.38), lt = shade(stone, 0.22);
        const blk = (x, y, w, h, r, col) => { rrect(g, x, y, w, h, r, lg(g, x, y, x + w, y + h, [[0, shade(col, 0.2)], [1, shade(col, -0.32)]]), OUT, 1.5); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + w * 0.3, y + h * 0.1); g.lineTo(x + w * 0.5, y + h * 0.5); g.lineTo(x + w * 0.4, y + h * 0.9); g.stroke(); };
        blk(-17, -22 - step * 3, 14, 22 + step * 3 - sw * 0, 4, dk); blk(4, -22 - (1 - step) * 1, 14, 22 + (1 - step), 4, stone);
        blk(-21 - sw * 3, -46 - step * 2, 12, 26, 5, dk);   // braço trás
        g.save(); g.translate(lean, -step * 2);
        blk(-15, -52 + br, 32, 33, 7, stone);
        g.fillStyle = 'rgba(80,140,60,0.75)'; ell(g, -8, -50 + br, 6, 2.4, 'rgba(90,150,60,0.8)'); ell(g, 10, -40 + br, 4, 2, 'rgba(90,150,60,0.7)');
        // núcleo
        glow(g, 1, -36 + br, 20 * pulse + 6, c2, 0.55); ell(g, 1, -36 + br, 6, 6, rg(g, 1, -36, 0, 7, [[0, '#ffffff'], [0.5, c2], [1, shade(c2, -0.5)]]), OUT, 1);
        g.strokeStyle = alpha(c2, 0.9); g.lineWidth = 1.5; g.beginPath(); g.moveTo(1, -30 + br); g.lineTo(-4, -22); g.moveTo(1, -42 + br); g.lineTo(6, -50 + br); g.stroke();
        blk(-10, -66 + br, 20, 16, 5, lt);
        g.fillStyle = '#0b0b10'; g.fillRect(-6, -60 + br, 12, 3.4); glow(g, -3, -58.4 + br, 5, c2, 0.9); glow(g, 4, -58.4 + br, 5, c2, 0.9); ell(g, -3, -58.4 + br, 1.6, 1.4, '#fff'); ell(g, 4, -58.4 + br, 1.6, 1.4, '#fff');
        g.restore();
        // braço frente (soco)
        const ang = -0.3 + atk * 1.9 + sw * 0.2; g.save(); g.translate(19 + lean, -48); g.rotate(ang); blk(-2, 0, 12, 22, 5, stone); blk(-4, 20, 16, 14, 5, lt); g.restore();
    } };

    /* --- MAGO SOMBRIO --- */
    S.darkmage = { w: 32, h: 48, sh: [11, 3], draw(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const hv = 1.5 + sin(t * 2.6 + st.seed) * 1.6, sway = sin(ph) * mv * 1.5;
        glow(g, 0, -20, 30, c2, 0.16 + atk * 0.2);
        g.beginPath(); g.moveTo(-6, -33 - hv); g.quadraticCurveTo(-15, -14, -13 + sway, -hv + 2); for (let i = 0; i <= 5; i++) { g.lineTo(-13 + i * 5.2 + sway, -hv + 2 - (i % 2) * 3 + sin(t * 3 + i) * 1.2); } g.quadraticCurveTo(15, -14, 6, -33 - hv); g.closePath();
        paint(g, lg(g, 0, -34, 0, 0, [[0, shade(c1, 0.25)], [1, shade(c1, -0.4)]]), OUT, 1.3);
        g.strokeStyle = alpha(c2, 0.8); g.lineWidth = 1.3; g.beginPath(); g.moveTo(-9, -6 - hv); g.lineTo(-7, -20 - hv); g.moveTo(9, -6 - hv); g.lineTo(7, -20 - hv); g.moveTo(-10 + sway, -3 - hv); g.quadraticCurveTo(0, -1, 10 + sway, -3 - hv); g.stroke();
        rrect(g, -7, -22 - hv, 14, 3, 1, '#7a4b1a', OUT, 0.8); ell(g, 0, -20.6 - hv, 2.4, 2.4, '#e9e2c6', OUT, 0.7);
        // capuz
        g.beginPath(); g.moveTo(-9, -31 - hv); g.quadraticCurveTo(-9, -44 - hv, 3, -50 - hv - atk * 1.5); g.quadraticCurveTo(10, -44 - hv, 9, -31 - hv); g.quadraticCurveTo(0, -27 - hv, -9, -31 - hv); g.closePath(); paint(g, lg(g, -9, -50, 9, -28, [[0, shade(c1, 0.15)], [1, shade(c1, -0.35)]]), OUT, 1.3);
        ell(g, 1, -35 - hv, 6, 6.4, '#07040c'); glow(g, -1.6, -35.4 - hv, 5.5, c2, 1); glow(g, 4, -35.4 - hv, 5.5, c2, 1); ell(g, -1.6, -35.4 - hv, 1.4, 1.1, '#fff'); ell(g, 4, -35.4 - hv, 1.4, 1.1, '#fff');
        // cajado + orbe
        const cx = 12 + atk * 3, top = -42 - hv - atk * 2; limb(g, cx, -4 - hv, cx + 1, top, 2.6, '#6a4626');
        ell(g, cx + 1, top - 5, 5.6, 5.6, rg(g, cx, top - 6, 0, 6, [[0, '#fff'], [0.4, c2], [1, shade(c2, -0.55)]]), OUT, 1); glow(g, cx + 1, top - 5, 16 + atk * 12 + sin(t * 6) * 2, c2, 0.5 + atk * 0.3);
        for (let i = 0; i < 5; i++) { const a = t * 2.4 + i * 1.26, r = 9 + atk * 7; ell(g, cx + 1 + cos(a) * r, top - 5 + sin(a) * r * 0.6, 1.2, 1.2, alpha(c2, 0.9)); }
        // mão
        ell(g, cx - 0.5, -25 - hv, 2.6, 2.4, '#7d6a8a', OUT, 0.8);
    } };

    /* --- MOLDES DE DRAGÃO (filhote e ancestral) --- */
    function dragonDraw(g, st, K) {
        const { t, mv, ph, atk, c1, c2, hurt } = st; const s = K.s;
        const sw = sin(ph * 0.7) * mv, bob = abs(sin(ph * 0.7)) * mv * 2.2 * s, br = sin(t * 1.7 + st.seed) * 1.4 * s, lean = atk * 7 * s;
        const scale = c1, dark = shade(c1, -0.5), mid = shade(c1, -0.2), lite = shade(c1, 0.28), belly = c2, bone = '#efe4c2';
        const flap = sin(t * K.flap + st.seed), flap2 = sin(t * K.flap + st.seed - 0.7);
        glow(g, -6 * s, -60 * s, 120 * s, K.aura || c1, K.glow);

        /* asa: braço + 3 dedos + membrana com recortes; origem no ombro, aponta para cima/trás */
        const wing = (bx, by, fl, col, far) => {
            const L = K.wing * s; g.save(); g.translate(bx, by); g.rotate(0.15 - fl * 0.5); g.scale(1, 0.86 + 0.14 * fl);
            const el = [-0.24 * L, -0.62 * L], wr = [-0.62 * L, -1.0 * L], f1 = [-1.12 * L, -0.82 * L], f2 = [-1.14 * L, -0.38 * L], f3 = [-0.86 * L, 0.06 * L], bk = [-0.06 * L, 0.16 * L];
            g.beginPath(); g.moveTo(0, 0); g.lineTo(el[0], el[1]); g.lineTo(wr[0], wr[1]);
            g.quadraticCurveTo((wr[0] + f1[0]) / 2 + 0.1 * L, (wr[1] + f1[1]) / 2 - 0.12 * L, f1[0], f1[1]);
            g.quadraticCurveTo((f1[0] + f2[0]) / 2 + 0.24 * L, (f1[1] + f2[1]) / 2 - 0.02 * L, f2[0], f2[1]);
            g.quadraticCurveTo((f2[0] + f3[0]) / 2 + 0.26 * L, (f2[1] + f3[1]) / 2 + 0.02 * L, f3[0], f3[1]);
            g.quadraticCurveTo((f3[0] + bk[0]) / 2 + 0.1 * L, (f3[1] + bk[1]) / 2 + 0.16 * L, bk[0], bk[1]); g.closePath();
            paint(g, lg(g, 0, 0, -1.1 * L, -0.8 * L, [[0, alpha(shade(col, -0.25), 0.98)], [0.55, alpha(shade(col, 0.05), 0.92)], [1, alpha(shade(col, 0.32), 0.85)]]), OUT, 1.8 * s);
            // veias
            g.strokeStyle = alpha(shade(col, -0.6), 0.55); g.lineWidth = 1 * s;
            [f1, f2, f3].forEach(f => { g.beginPath(); g.moveTo(wr[0], wr[1]); g.lineTo(f[0], f[1]); g.stroke(); });
            g.beginPath(); g.moveTo(el[0], el[1]); g.quadraticCurveTo(-0.5 * L, -0.42 * L, f2[0] * 0.92, f2[1] * 0.9); g.moveTo(0, 0); g.quadraticCurveTo(-0.35 * L, -0.12 * L, f3[0] * 0.9, f3[1] * 0.9); g.stroke();
            // ossos
            g.lineCap = 'round'; g.lineJoin = 'round';
            g.strokeStyle = OUT; g.lineWidth = 6.4 * s; g.beginPath(); g.moveTo(0, 0); g.lineTo(el[0], el[1]); g.lineTo(wr[0], wr[1]); g.stroke();
            g.strokeStyle = far ? shade(col, -0.35) : mid; g.lineWidth = 4.4 * s; g.stroke();
            [f1, f2, f3].forEach(f => { g.strokeStyle = OUT; g.lineWidth = 3.4 * s; g.beginPath(); g.moveTo(wr[0], wr[1]); g.lineTo(f[0], f[1]); g.stroke(); g.strokeStyle = far ? shade(col, -0.35) : mid; g.lineWidth = 2 * s; g.stroke(); tri(g, f[0] - 2 * s, f[1] - 2 * s, f[0] - 7 * s, f[1] - 2 * s, f[0] - 1.6 * s, f[1] + 3 * s, bone, OUT, 0.8); });
            ell(g, wr[0], wr[1], 3.4 * s, 3.4 * s, bone, OUT, 1); g.restore();
        };
        wing(4 * s, -78 * s - bob, flap2, shade(scale, -0.3), true);

        /* cauda */
        const segs = 16, tail = [];
        for (let i = 0; i <= segs; i++) { const p = i / segs; tail.push({ x: (-46 - p * K.tail) * s - lean * 0.2, y: (-52 + p * 26) * s + sin(t * 2.2 + p * 4.5 + st.seed) * 8 * p * s - bob * (1 - p) - sin(p * PI) * 6 * s, w: (24 * (1 - p) + 2.4) * s }); }
        for (let i = segs; i > 0; i--) { const a = tail[i], b = tail[i - 1]; limb(g, a.x, a.y, b.x, b.y, (a.w + b.w) / 2, i % 2 ? scale : mid); }
        for (let i = 1; i < segs - 1; i++) { const a = tail[i]; if (i % 2) tri(g, a.x - 3.4 * s, a.y - a.w / 2 + 1, a.x + 0.4 * s, a.y - a.w / 2 - (10 - i * 0.45) * s, a.x + 4 * s, a.y - a.w / 2 + 1, K.spike || c2, OUT, 0.9); }
        const te = tail[segs]; poly(g, [te.x + 2 * s, te.y, te.x - 6 * s, te.y - 9 * s, te.x - 20 * s, te.y, te.x - 6 * s, te.y + 9 * s], K.spike || c2, OUT, 1.3);

        /* pernas de trás */
        const hind = (x, off, far) => {
            const a = sin(ph * 0.7 + off) * mv, lift = max(0, cos(ph * 0.7 + off)) * mv * 6 * s, hx = x * s, hy = -40 * s - bob;
            const fx = (x + a * 9 + 2) * s, fy = -lift, kx = (x - 12 + a * 4) * s, ky = -20 * s;
            const col = far ? shade(scale, -0.4) : mid;
            g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = OUT; g.lineWidth = 20 * s; g.beginPath(); g.moveTo(hx, hy); g.lineTo(kx, ky); g.stroke(); g.lineWidth = 12 * s; g.beginPath(); g.moveTo(kx, ky); g.lineTo(fx, fy - 6 * s); g.stroke();
            g.strokeStyle = col; g.lineWidth = 17.6 * s; g.beginPath(); g.moveTo(hx, hy); g.lineTo(kx, ky); g.stroke(); g.lineWidth = 9.6 * s; g.beginPath(); g.moveTo(kx, ky); g.lineTo(fx, fy - 6 * s); g.stroke();
            ell(g, hx + 1 * s, hy + 4 * s, 15 * s, 19 * s, far ? shade(scale, -0.4) : scale, OUT, 1.5 * s, 0.25);
            ell(g, fx + 7 * s, fy - 1.6 * s, 13 * s, 4.6 * s, far ? dark : shade(dark, 0.1), OUT, 1.2);
            for (let k = 0; k < 3; k++) tri(g, fx + (14 + k * 3) * s, fy - 4.6 * s, fx + (20 + k * 3) * s, fy, fx + (14 + k * 3) * s, fy + 1.4 * s, bone, OUT, 0.7);
        };
        hind(-30, 0, true);
        const fore = (x, off, far) => {
            const a = sin(ph * 0.7 + off) * mv, lift = max(0, cos(ph * 0.7 + off)) * mv * 6 * s, hx = x * s, hy = -44 * s - bob, fx = (x + a * 9 + 6) * s, fy = -lift, kx = (x + 3 + a * 3) * s, ky = -22 * s; const col = far ? shade(scale, -0.4) : mid;
            g.lineCap = 'round'; g.strokeStyle = OUT; g.lineWidth = 16 * s; g.beginPath(); g.moveTo(hx, hy); g.lineTo(kx, ky); g.lineTo(fx, fy - 5 * s); g.stroke(); g.strokeStyle = col; g.lineWidth = 12.6 * s; g.beginPath(); g.moveTo(hx, hy); g.lineTo(kx, ky); g.lineTo(fx, fy - 5 * s); g.stroke();
            ell(g, fx + 6 * s, fy - 1.4 * s, 11 * s, 4 * s, far ? dark : shade(dark, 0.1), OUT, 1.2); for (let k = 0; k < 3; k++) tri(g, fx + (12 + k * 3) * s, fy - 4 * s, fx + (18 + k * 3) * s, fy, fx + (12 + k * 3) * s, fy + 1.4 * s, bone, OUT, 0.7);
        };
        fore(22, PI, true);

        /* corpo */
        g.save(); g.translate(lean * 0.35, 0);
        g.beginPath(); g.moveTo(-54 * s, -50 * s - bob); g.bezierCurveTo(-56 * s, -84 * s - bob + br, -6 * s, -94 * s - bob + br, 28 * s, -86 * s - bob + br); g.bezierCurveTo(56 * s, -80 * s - bob, 58 * s, -40 * s - bob, 34 * s, -30 * s - bob); g.bezierCurveTo(6 * s, -22 * s - bob, -44 * s - bob * 0, -26 * s - bob, -54 * s, -50 * s - bob); g.closePath();
        paint(g, lg(g, 0, -94 * s, 0, -24 * s, [[0, lite], [0.4, scale], [1, dark]]), OUT, 2.2 * s);
        g.save(); g.clip();
        g.strokeStyle = alpha(dark, 0.4); g.lineWidth = 1.1 * s; for (let r = 0; r < 9; r++) for (let c = 0; c < 15; c++) { const x = (-58 + c * 8 + (r % 2) * 4) * s, y = (-92 + r * 8) * s - bob; g.beginPath(); g.arc(x, y, 4.4 * s, 0.05, PI - 0.05); g.stroke(); }
        g.fillStyle = 'rgba(255,255,255,0.10)'; g.beginPath(); g.ellipse(-4 * s, -78 * s - bob, 34 * s, 8 * s, -0.08, 0, TAU); g.fill();
        g.beginPath(); g.moveTo(-52 * s, -38 * s - bob); g.bezierCurveTo(-14 * s, -22 * s - bob, 30 * s, -24 * s - bob, 52 * s, -48 * s - bob); g.lineTo(52 * s, -14 * s); g.lineTo(-56 * s, -14 * s); g.closePath(); g.fillStyle = lg(g, 0, -40 * s, 0, -20 * s, [[0, belly], [1, shade(belly, -0.3)]]); g.fill();
        g.strokeStyle = alpha(shade(belly, -0.5), 0.6); g.lineWidth = 1.4 * s; for (let i = 0; i < 11; i++) { g.beginPath(); g.moveTo((-48 + i * 9.4) * s, -42 * s - bob); g.quadraticCurveTo((-46 + i * 9.4) * s, -32 * s - bob, (-48 + i * 9.4) * s, -24 * s - bob); g.stroke(); }
        g.restore();
        for (let i = 0; i < 9; i++) { const x = (-46 + i * 10) * s, y = (-80 - sin((i / 8) * PI) * 12) * s - bob + br; tri(g, x - 3.6 * s, y + 5 * s, x + 1 * s, y - (10 + (i % 2) * 4) * s, x + 6 * s, y + 5 * s, K.spike || c2, OUT, 1); }
        g.restore();
        hind(-14, PI, false); fore(34, 0, false);

        /* pescoço */
        const nk = { x: 36 * s + lean * 0.4, y: -74 * s - bob }, hd = { x: K.hx * s + lean * 1.6, y: K.hy * s - bob + br * 0.5 - atk * 8 * s };
        const c1x = nk.x + 30 * s, c1y = nk.y - 4 * s, c2x = hd.x - 30 * s, c2y = hd.y + 22 * s;
        const neck = (w, col) => { g.lineCap = 'round'; g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(nk.x, nk.y); g.bezierCurveTo(c1x, c1y, c2x, c2y, hd.x - 6 * s, hd.y + 6 * s); g.stroke(); };
        neck(32 * s, OUT); neck(28 * s, lg(g, nk.x, nk.y, hd.x, hd.y, [[0, scale], [1, lite]]));
        g.strokeStyle = belly; g.lineWidth = 9 * s; g.lineCap = 'round'; g.beginPath(); g.moveTo(nk.x + 5 * s, nk.y + 9 * s); g.bezierCurveTo(c1x + 6 * s, c1y + 10 * s, c2x + 4 * s, c2y + 10 * s, hd.x - 3 * s, hd.y + 13 * s); g.stroke();
        g.strokeStyle = alpha(dark, 0.4); g.lineWidth = 1.1 * s; for (let i = 0; i < 9; i++) { const p = 0.05 + i * 0.1, bx = (1 - p) ** 3 * nk.x + 3 * (1 - p) ** 2 * p * c1x + 3 * (1 - p) * p * p * c2x + p ** 3 * (hd.x - 6 * s), by = (1 - p) ** 3 * nk.y + 3 * (1 - p) ** 2 * p * c1y + 3 * (1 - p) * p * p * c2y + p ** 3 * (hd.y + 6 * s); g.beginPath(); g.arc(bx, by, 9 * s * (1 - p * 0.35), 0.4, PI - 0.4); g.stroke(); tri(g, bx - 3 * s, by - 12 * s * (1 - p * 0.35), bx, by - 18 * s * (1 - p * 0.3), bx + 3 * s, by - 12 * s * (1 - p * 0.35), K.spike || c2, OUT, 0.8); }
        /* asa da frente */
        wing(10 * s + lean * 0.3, -82 * s - bob + br, flap, scale, false);

        /* cabeça */
        g.save(); g.translate(hd.x, hd.y); g.rotate(-0.08 + atk * 0.28 + sin(t * 1.2 + st.seed) * 0.03);
        const jaw = (K.jaw || 1) * (0.14 + atk * 0.75 + max(0, sin(t * 0.7 + st.seed * 2) - 0.92) * 6);
        // chifres
        [[-6, -16, -34, -32, -24, -20], [-2, -18, -26, -40, -18, -26]].forEach((h, i) => { g.beginPath(); g.moveTo(h[0] * s, h[1] * s); g.quadraticCurveTo(h[2] * s, h[3] * s, (h[2] - 6) * s, (h[3] - 4) * s); g.quadraticCurveTo((h[4] + (i ? 4 : 6)) * s, (h[5] - 8) * s, (h[0] + 8) * s, (h[1] + 2) * s); g.closePath(); paint(g, lg(g, h[0] * s, h[1] * s, h[2] * s, h[3] * s, [[0, '#f6edd0'], [1, '#b8a878']]), OUT, 1.2); });
        // mandíbula
        g.save(); g.translate(-2 * s, 5 * s); g.rotate(jaw);
        g.beginPath(); g.moveTo(-6 * s, 1 * s); g.lineTo(32 * s, 2 * s); g.quadraticCurveTo(46 * s, 4 * s, 44 * s, 10 * s); g.lineTo(10 * s, 15 * s); g.quadraticCurveTo(-8 * s, 12 * s, -6 * s, 1 * s); g.closePath(); paint(g, lg(g, 0, 0, 0, 15 * s, [[0, scale], [1, dark]]), OUT, 1.6);
        if (jaw > 0.22) { g.fillStyle = '#ff6a2a'; g.beginPath(); g.moveTo(0, 1 * s); g.lineTo(38 * s, 2 * s); g.lineTo(14 * s, -4 * s); g.closePath(); g.fill(); ell(g, 18 * s, 0, 6 * s, 2.4 * s, '#c0392b', null); }
        for (let i = 0; i < 6; i++) tri(g, (6 + i * 6) * s, 1.4 * s, (8.6 + i * 6) * s, 1.4 * s, (7.3 + i * 6) * s, -5 * s, '#fbf6e2', OUT, 0.6);
        g.restore();
        // crânio
        g.beginPath(); g.moveTo(-16 * s, 6 * s); g.quadraticCurveTo(-18 * s, -12 * s, -4 * s, -17 * s); g.lineTo(8 * s, -20 * s); g.lineTo(22 * s, -14 * s); g.lineTo(44 * s, -7 * s); g.quadraticCurveTo(50 * s, -3 * s, 46 * s, 3 * s); g.lineTo(22 * s, 5 * s); g.lineTo(0, 8 * s); g.closePath();
        paint(g, lg(g, 0, -20 * s, 0, 8 * s, [[0, lite], [0.6, scale], [1, mid]]), OUT, 1.8);
        g.fillStyle = alpha(dark, 0.55); g.beginPath(); g.moveTo(2 * s, -14 * s); g.quadraticCurveTo(12 * s, -20 * s, 24 * s, -12 * s); g.lineTo(20 * s, -9 * s); g.quadraticCurveTo(12 * s, -14 * s, 4 * s, -9 * s); g.closePath(); g.fill();
        for (let i = 0; i < 5; i++) tri(g, (10 + i * 6) * s, 4.6 * s, (12.6 + i * 6) * s, 4.6 * s, (11.3 + i * 6) * s, (10 + jaw * 5) * s, '#fbf6e2', OUT, 0.6);
        ell(g, 41 * s, -3.4 * s, 2.6 * s, 1.7 * s, '#1a0a0a', null, 0, -0.3);
        if (K.smoke) for (let i = 0; i < 3; i++) { const p = (t * 0.7 + i / 3 + st.seed) % 1; ell(g, (44 + p * 14) * s, (-5 - p * 18) * s, (2 + p * 5) * s, (2 + p * 5) * s, 'rgba(200,200,205,' + (0.4 * (1 - p)) + ')'); }
        glow(g, 12 * s, -9 * s, 10 * s, '#ffcf3a', 0.9); ell(g, 12 * s, -9 * s, 4.6 * s, 3 * s, '#ffe23a', OUT, 1, -0.25); ell(g, 12.8 * s, -9 * s, 1.1 * s, 2.7 * s, '#100');
        g.strokeStyle = shade(dark, -0.3); g.lineWidth = 3 * s; g.lineCap = 'round'; g.beginPath(); g.moveTo(3 * s, -14 * s); g.lineTo(20 * s, -9 * s); g.stroke();
        for (let i = 0; i < 4; i++) tri(g, (-10 + i * 5) * s, -16 * s + i * 0.6 * s, (-8 + i * 5) * s, -25 * s + i * 1.4 * s, (-4 + i * 5) * s, -16 * s + i * 0.6 * s, K.spike || c2, OUT, 0.8);
        // fogo
        if (K.fire && atk > 0.12) { const f = atk; for (let i = 0; i < 34; i++) { const p = i / 33, r0 = hash(i * 3.1 + floorT(t, 16)); const fx = (46 + p * 110 * f) * s, fy = (6 + p * 34 + (r0 - 0.5) * 16 * p) * s; const rr = (3 + p * 17) * s * (0.6 + f * 0.6); g.fillStyle = p < 0.25 ? 'rgba(255,245,170,' + (0.95 * f) + ')' : p < 0.55 ? 'rgba(255,160,40,' + (0.82 * f) + ')' : 'rgba(215,55,22,' + (0.55 * (1 - p) * f) + ')'; g.beginPath(); g.arc(fx, fy, rr, 0, TAU); g.fill(); } glow(g, (60 + 40 * f) * s, 16 * s, 46 * s, '#ff8a2a', 0.35 * f); }
        g.restore();
        if (hurt > 0.05) { g.fillStyle = 'rgba(255,255,255,' + (hurt * 0.4) + ')'; g.beginPath(); g.ellipse(-4 * s, -60 * s - bob, 52 * s, 30 * s, 0, 0, TAU); g.fill(); }
    }
    function floorT(t, r) { return Math.floor(t * r); }
    S.whelp = { w: 64, h: 52, sh: [26, 5], bounds: [110, 92], draw(g, st) { dragonDraw(g, st, { s: 0.44, wing: 110, flap: 5.5, tail: 60, hx: 66, hy: -100, glow: 0.12, fire: true, smoke: false, jaw: 1, spike: st.c2 }); } };
    S.dragon = { w: 150, h: 120, sh: [52, 8], bounds: [260, 200], draw(g, st) { dragonDraw(g, st, { s: 1, wing: 100, flap: 2.6, tail: 92, hx: 70, hy: -112, glow: 0.2, fire: true, smoke: true, jaw: 1, aura: '#ff4a1a', spike: st.c2 }); } };

    /* --- ANIMAIS --- */
    S.cow = { w: 48, h: 36, sh: [18, 4], draw(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const bob = abs(sin(ph)) * mv * 1, graze = max(0, sin(t * 0.6 + st.seed * 3) - 0.35) * (1 - mv) * 9, chew = sin(t * 6) * 0.6;
        quad(g, st, { legs: [{ x: -14, top: -14, off: 0, far: true }, { x: 13, top: -14, off: PI, far: true }, { x: -10, top: -14, off: PI }, { x: 17, top: -14, off: 0 }], stride: 4, lift: 2.5 }).forEach(L => { limb(g, L.x, L.top - bob, L.fx, L.fy - 3, 5, L.far ? shade(c1, -0.25) : c1); ell(g, L.fx, L.fy - 1.4, 3, 2, '#2e2622', OUT, 0.8); });
        g.strokeStyle = OUT; g.lineWidth = 2.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(-19, -25 - bob); g.quadraticCurveTo(-24, -20, -22, -12 + sin(t * 3) * 2); g.stroke(); g.strokeStyle = c1; g.lineWidth = 1.2; g.stroke(); ell(g, -22, -11 + sin(t * 3) * 2, 2.2, 3, c2, OUT, 0.7);
        rrect(g, -21, -30 - bob, 41, 21, 9, lg(g, 0, -30, 0, -9, [[0, shade(c1, 0.05)], [1, shade(c1, -0.22)]]), OUT, 1.3);
        g.save(); rrect(g, -21, -30 - bob, 41, 21, 9); g.clip(); ell(g, -9, -24 - bob, 7, 6, c2); ell(g, 6, -14 - bob, 6, 5, c2); ell(g, 14, -27 - bob, 5, 4, c2); g.restore();
        ell(g, -4, -9 - bob, 4, 3, '#f3a6a6', OUT, 0.8);
        const hx = 22 + atk * 3, hy = -25 - bob + graze;
        ell(g, hx, hy, 9, 7.6, lg(g, hx - 6, hy - 6, hx + 6, hy + 6, [[0, shade(c1, 0.05)], [1, shade(c1, -0.2)]]), OUT, 1.2);
        ell(g, hx, hy - 8, 3.4, 2, '#f7f1e6', OUT, 0.7); tri(g, hx - 5.4, hy - 7, hx - 8.6, hy - 10.6, hx - 3.4, hy - 8.4, '#f7f1e6', OUT, 0.8); tri(g, hx + 4.4, hy - 7, hx + 8, hy - 10.6, hx + 2.6, hy - 8.4, '#f7f1e6', OUT, 0.8);
        ell(g, hx - 6.6, hy - 2 + chew * 0.2, 4.2, 2.6, c1, OUT, 0.9, -0.3); ell(g, hx + 8, hy + 1.6, 5.4, 4.2 + chew * 0.3, '#f6b3b3', OUT, 1); ell(g, hx + 9.6, hy + 1.2, 0.9, 1.1, '#7a3a3a'); ell(g, hx + 6.6, hy + 1.8, 0.9, 1.1, '#7a3a3a');
        ell(g, hx + 1.4, hy - 2.6, 1.6, 1.6, '#111'); g.fillStyle = '#fff'; g.fillRect(hx + 1.2, hy - 3.2, 0.7, 0.7);
    } };
    S.sheep = { w: 40, h: 32, sh: [15, 3.4], draw(g, st) {
        const { t, mv, ph, c1, c2 } = st; const bob = abs(sin(ph)) * mv * 0.9, graze = max(0, sin(t * 0.55 + st.seed * 3) - 0.3) * (1 - mv) * 8;
        quad(g, st, { legs: [{ x: -9, top: -11, off: 0, far: true }, { x: 10, top: -11, off: PI, far: true }, { x: -6, top: -11, off: PI }, { x: 13, top: -11, off: 0 }], stride: 3.5, lift: 2 }).forEach(L => { limb(g, L.x, L.top - bob, L.fx, L.fy - 1, 3.2, L.far ? shade(c2, -0.2) : c2); });
        const wool = [[-11, -19, 8], [-4, -24, 9], [4, -24, 9], [11, -20, 8], [-7, -15, 8], [1, -14, 9], [9, -14, 7], [-15, -15, 6], [15, -16, 5], [-1, -19, 10]];
        wool.forEach((w, i) => ell(g, w[0], w[1] - bob + sin(t * 2 + i) * 0.3, w[2], w[2] * 0.85, i === wool.length - 1 ? c1 : rg(g, w[0] - 2, w[1] - 3, 1, w[2], [[0, '#ffffff'], [1, shade(c1, -0.2)]]), OUT, 0.9));
        const hx = 16, hy = -17 - bob + graze;
        tri(g, hx - 6, hy - 1, hx - 12, hy + 3, hx - 5, hy + 3, c2, OUT, 0.8); ell(g, hx, hy, 6.2, 5.6, lg(g, hx - 4, hy - 4, hx + 4, hy + 4, [[0, shade(c2, 0.2)], [1, c2]]), OUT, 1);
        ell(g, hx - 1, hy - 5, 5, 3.2, c1, OUT, 0.8); ell(g, hx + 3.4, hy + 1.4, 3, 2.4, shade(c2, 0.1), OUT, 0.7); ell(g, hx + 2, hy - 1.4, 1.2, 1.2, '#f3f3f3'); ell(g, hx + 2.2, hy - 1.4, 0.6, 0.8, '#111');
    } };
    S.chicken = { w: 24, h: 24, sh: [8, 2.4], draw(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const hop = abs(sin(ph * 1.6)) * mv * 1.4, peck = max(0, sin(t * 2.1 + st.seed * 3) - 0.55) * (1 - mv) * 6;
        for (let i = 0; i < 2; i++) { const s = sin(ph * 1.6 + i * PI) * mv * 3; limb(g, -1 + i * 3, -7 - hop, -1 + i * 3 + s, -0.5, 1.4, '#e8a13a'); tri(g, s + i * 3 - 1, 0, s + i * 3 + 4, 0, s + i * 3 + 1, -1.4, '#e8a13a'); }
        for (let i = 0; i < 3; i++) { g.save(); g.translate(-6, -11 - hop); g.rotate(-0.7 - i * 0.28); ell(g, -3, 0, 5.4, 2.4, i === 1 ? shade(c1, -0.1) : shade(c1, -0.18), OUT, 0.8); g.restore(); }
        g.beginPath(); g.moveTo(-7, -9 - hop); g.quadraticCurveTo(-6, -17 - hop, 2, -16 - hop); g.quadraticCurveTo(9, -13 - hop, 8, -8 - hop); g.quadraticCurveTo(2, -3 - hop, -7, -9 - hop); g.closePath(); paint(g, rg(g, 0, -14, 1, 10, [[0, '#ffffff'], [1, shade(c1, -0.22)]]), OUT, 1);
        g.save(); g.translate(-1, -10 - hop); g.rotate(sin(t * (mv > 0.3 ? 18 : 1.6) + st.seed) * 0.12); ell(g, 0, 0, 4, 2.8, shade(c1, -0.12), OUT, 0.8); g.restore();
        const hx = 6 + atk * 2, hy = -17 - hop + peck;
        ell(g, hx, hy, 3.6, 3.8, c1, OUT, 0.9); for (let i = 0; i < 3; i++) ell(g, hx - 1.4 + i * 1.6, hy - 4.2 - (i === 1 ? 0.8 : 0), 1.2, 1.4, c2, OUT, 0.5);
        tri(g, hx + 3, hy - 0.6, hx + 7.4, hy + 0.6, hx + 3, hy + 1.6, '#f0a53a', OUT, 0.6); ell(g, hx + 2.4, hy + 3, 1, 1.8, c2, OUT, 0.4); ell(g, hx + 1.2, hy - 0.8, 0.9, 0.9, '#111');
    } };
    S.pig = { w: 40, h: 30, sh: [15, 3.4], draw(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const bob = abs(sin(ph)) * mv * 1, hd = sin(t * 1.4 + st.seed) * 1.2;
        quad(g, st, { legs: [{ x: -11, top: -10, off: 0, far: true }, { x: 10, top: -10, off: PI, far: true }, { x: -7, top: -10, off: PI }, { x: 13, top: -10, off: 0 }], stride: 4, lift: 2 }).forEach(L => { limb(g, L.x, L.top - bob, L.fx, L.fy - 1, 4.4, L.far ? shade(c2, -0.1) : c1); ell(g, L.fx, L.fy - 0.8, 2.4, 1.3, '#8a4a4a', OUT, 0.6); });
        g.strokeStyle = OUT; g.lineWidth = 2.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(-16, -19 - bob); g.bezierCurveTo(-23, -21, -19, -27, -22, -23); g.stroke(); g.strokeStyle = c2; g.lineWidth = 1.2; g.stroke();
        g.beginPath(); g.moveTo(-17, -15 - bob); g.quadraticCurveTo(-18, -28 - bob, -3, -28 - bob); g.quadraticCurveTo(12, -29 - bob, 16, -21 - bob); g.quadraticCurveTo(18, -11 - bob, 8, -8 - bob); g.quadraticCurveTo(-8, -6 - bob, -17, -15 - bob); g.closePath(); paint(g, lg(g, 0, -28, 0, -8, [[0, shade(c1, 0.12)], [1, shade(c1, -0.15)]]), OUT, 1.3);
        ell(g, -5, -13 - bob, 5, 2.4, alpha(c2, 0.35));
        const hx = 16 + atk * 3, hy = -18 - bob + hd;
        tri(g, hx - 5, hy - 5, hx - 6, hy - 11, hx, hy - 6, c2, OUT, 0.9); ell(g, hx, hy, 7.6, 7, lg(g, hx - 6, hy - 6, hx + 6, hy + 6, [[0, shade(c1, 0.1)], [1, c1]]), OUT, 1.2);
        ell(g, hx + 6.6, hy + 2, 3.8, 3.2, c2, OUT, 1); ell(g, hx + 7.4, hy + 1.6, 0.7, 1, '#5a2020'); ell(g, hx + 5.6, hy + 2.2, 0.7, 1, '#5a2020'); ell(g, hx + 1.6, hy - 2, 1.2, 1.2, '#111');
    } };
    S.deer = { w: 46, h: 52, sh: [16, 3.4], draw(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const bob = abs(sin(ph * 0.9)) * mv * 2.6, alert = sin(t * 1.5 + st.seed * 3) > 0.7 ? 2 : 0, gal = mv;
        quad(g, st, { legs: [{ x: -12, top: -25, off: 0, far: true }, { x: 11, top: -25, off: 0.6, far: true }, { x: -9, top: -25, off: PI }, { x: 14, top: -25, off: PI + 0.6 }], stride: 8 + gal * 4, lift: 6 }).forEach(L => { limb2(g, L.x, L.top - bob, L.x + (L.fx - L.x) * 0.4 + 1, -13, L.fx, L.fy - 1, 3.2, L.far ? shade(c1, -0.3) : c1); ell(g, L.fx + 0.6, L.fy - 0.6, 2.4, 1.2, '#2b1f16', OUT, 0.6); });
        g.beginPath(); g.moveTo(-15, -29 - bob); g.quadraticCurveTo(-18, -38 - bob, -6, -38 - bob); g.quadraticCurveTo(8, -39 - bob, 15, -34 - bob); g.quadraticCurveTo(18, -25 - bob, 8, -22 - bob); g.quadraticCurveTo(-8, -20 - bob, -15, -29 - bob); g.closePath(); paint(g, lg(g, 0, -39, 0, -20, [[0, shade(c1, 0.05)], [0.6, c1], [1, c2]]), OUT, 1.3);
        g.fillStyle = 'rgba(255,255,255,0.75)'; [[-8, -33], [-2, -35], [5, -33], [-5, -28], [2, -29], [9, -29]].forEach(p => ell(g, p[0], p[1] - bob, 1.3, 1.1, 'rgba(255,255,255,0.75)'));
        tri(g, -14, -31 - bob, -19, -34 - bob, -15, -27 - bob, '#fff', OUT, 0.8);
        const hx = 21 + atk * 2, hy = -47 - bob - alert;
        g.strokeStyle = OUT; g.lineWidth = 7.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(11, -34 - bob); g.quadraticCurveTo(16, -40 - bob, hx - 2, hy + 3); g.stroke(); g.strokeStyle = c1; g.lineWidth = 5.6; g.stroke();
        g.strokeStyle = '#5a3d27'; g.lineWidth = 1.7; g.lineCap = 'round'; for (let s = 0; s < 2; s++) { const dx = s ? 4 : -2; g.beginPath(); g.moveTo(hx + dx, hy - 5); g.lineTo(hx + dx - 3, hy - 15); g.moveTo(hx + dx - 1.4, hy - 10); g.lineTo(hx + dx + 3, hy - 14); g.moveTo(hx + dx - 2.4, hy - 13); g.lineTo(hx + dx - 6, hy - 17); g.stroke(); }
        ell(g, hx, hy, 6.4, 5.4, lg(g, hx - 4, hy - 4, hx + 4, hy + 4, [[0, shade(c1, 0.1)], [1, c1]]), OUT, 1.1); ell(g, hx + 6, hy + 1.8, 4, 2.9, c2, OUT, 0.9); ell(g, hx + 8.6, hy + 1, 1.2, 1, '#111');
        tri(g, hx - 4, hy - 3, hx - 9, hy - 6, hx - 4, hy + 1.6, c1, OUT, 0.8); ell(g, hx + 1.2, hy - 1.4, 1.5, 1.5, '#111'); g.fillStyle = '#fff'; g.fillRect(hx + 0.8, hy - 2, 0.7, 0.7);
    } };
    S.rabbit = { w: 22, h: 20, sh: [7, 2], draw(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const jump = abs(sin(ph * 0.7)) * mv * 9, nib = sin(t * 9 + st.seed) * 0.5 * (1 - mv);
        const y = -jump; ell(g, -8, -6 + y, 3.6, 3.6, c2, OUT, 0.8);
        g.beginPath(); g.moveTo(-9, -5 + y); g.quadraticCurveTo(-9, -15 + y, 0, -14 + y); g.quadraticCurveTo(8, -13 + y, 8, -6 + y); g.quadraticCurveTo(0, -1 + y, -9, -5 + y); g.closePath(); paint(g, lg(g, 0, -15 + y, 0, -2 + y, [[0, shade(c1, 0.1)], [1, shade(c1, -0.15)]]), OUT, 1);
        const lg2 = sin(ph * 0.7) * mv * 2; ell(g, -3 + lg2, -2 + y * 0.6, 4.6, 2.2, shade(c1, -0.2), OUT, 0.7); ell(g, 5 - lg2, -1.6 + y * 0.6, 3, 1.6, c1, OUT, 0.7);
        const hx = 7, hy = -12 + y + nib;
        const ea = -0.25 + sin(t * 1.3 + st.seed) * 0.15; for (let i = 0; i < 2; i++) { g.save(); g.translate(hx - 3 + i * 3, hy - 3); g.rotate(ea - i * 0.5 + (mv > 0.3 ? -0.5 : 0)); ell(g, 0, -6, 2.1, 6.4, i ? shade(c1, -0.1) : c1, OUT, 0.8); ell(g, 0, -6, 1, 4.6, '#f5b5bd'); g.restore(); }
        ell(g, hx, hy, 4.6, 4.2, c1, OUT, 0.9); ell(g, hx + 4, hy + 1.2, 1, 0.9, '#ff8da0'); ell(g, hx + 1.6, hy - 0.6, 1.1, 1.2, '#111');
    } };

    /* ============================================================
       HUMANOS (jogador e NPCs)  view: 'front' | 'back' | 'side'
       ============================================================ */
    const SKIN = ['#f1c27d', '#e0ac7a', '#c98d5d', '#8d5a3a'];
    function human(g, o) {
        const view = o.view || 'front', mv = o.mv || 0, ph = o.ph || 0, t = o.t || 0, atk = o.atk || 0;
        const skin = o.skin || '#f1c27d', shirt = o.shirt || '#3b7dd8', pants = o.pants || '#4a3a2a', boots = o.boots || '#2a1c12', hair = o.hair || '#5a3a1e';
        const sw = sin(ph) * mv, bob = abs(sin(ph)) * mv * 1.2, br = sin(t * 2.2 + (o.seed || 0)) * 0.5;
        const shirtD = shade(shirt, -0.35), shirtL = shade(shirt, 0.2), skinD = shade(skin, -0.2);
        const side = view === 'side';
        const legY = -13 - bob;
        // pernas
        if (side) {
            limb2(g, 0, legY, sw * 3, -6, -sw * 5 + 0, -1, 5, shade(pants, -0.25)); ell(g, -sw * 5 + 1.6, -1, 4.2, 2, shade(boots, -0.1), OUT, 0.9);
            limb2(g, 0, legY, -sw * 3, -6, sw * 5, -1, 5, pants); ell(g, sw * 5 + 1.6, -1, 4.2, 2, boots, OUT, 0.9);
        } else {
            limb(g, -3.4, legY, -3.4 + sw * 0.5, -1 - max(0, sw) * 3, 5.4, pants); ell(g, -3.4 + sw * 0.5, -1 - max(0, sw) * 3, 3.6, 2, boots, OUT, 0.9);
            limb(g, 3.4, legY, 3.4 - sw * 0.5, -1 - max(0, -sw) * 3, 5.4, shade(pants, -0.1)); ell(g, 3.4 - sw * 0.5, -1 - max(0, -sw) * 3, 3.6, 2, boots, OUT, 0.9);
        }
        // capa (atrás)
        if (o.cape && view !== 'front') { g.beginPath(); g.moveTo(-6, -31 - bob); g.lineTo(6, -31 - bob); g.lineTo(8 + sw, -8 - bob); g.lineTo(-8 - sw, -8 - bob); g.closePath(); paint(g, lg(g, 0, -31, 0, -8, [[0, o.cape], [1, shade(o.cape, -0.4)]]), OUT, 1); }
        // braço de trás (side)
        const armSw = sw * 0.9;
        if (side) limb2(g, 0, -29 - bob, -armSw * 3, -23, -armSw * 5, -17 - bob, 4, shade(shirt, -0.4));
        // tronco
        const tw = side ? 8.5 : 12;
        g.beginPath(); g.moveTo(-tw / 2 - 1, -12 - bob); g.quadraticCurveTo(-tw / 2 - 1.5, -29 - bob + br, 0, -31 - bob + br); g.quadraticCurveTo(tw / 2 + 1.5, -29 - bob + br, tw / 2 + 1, -12 - bob); g.closePath();
        paint(g, lg(g, -tw / 2, -31, tw / 2, -12, [[0, shirtL], [1, shirtD]]), OUT, 1.2);
        if (o.armor) { g.strokeStyle = alpha('#ffffff', 0.35); g.lineWidth = 1; g.beginPath(); g.moveTo(-tw / 2 + 1, -26 - bob); g.lineTo(tw / 2 - 1, -26 - bob); g.moveTo(0, -30 - bob); g.lineTo(0, -14 - bob); g.stroke(); ell(g, -tw / 2 - 1, -29 - bob, 3.2, 2.6, shade(shirt, 0.15), OUT, 0.9); if (!side) ell(g, tw / 2 + 1, -29 - bob, 3.2, 2.6, shade(shirt, 0.15), OUT, 0.9); }
        if (o.apron) { const ap = o.apron; g.beginPath(); g.moveTo(-tw / 2 + 0.5, -26 - bob); g.lineTo(tw / 2 - 0.5, -26 - bob); g.lineTo(tw / 2, -9 - bob); g.lineTo(-tw / 2, -9 - bob); g.closePath(); paint(g, ap, OUT, 0.9); }
        if (o.robe) { g.beginPath(); g.moveTo(-tw / 2 - 1, -14 - bob); g.lineTo(-tw / 2 - 4, -2); g.lineTo(tw / 2 + 4, -2); g.lineTo(tw / 2 + 1, -14 - bob); g.closePath(); paint(g, lg(g, 0, -14, 0, -2, [[0, shirt], [1, shirtD]]), OUT, 1.1); }
        rrect(g, -tw / 2 - 0.5, -15 - bob, tw + 1, 2.6, 1, o.belt || '#4a2f16', OUT, 0.7);
        g.fillStyle = '#e0c060'; g.fillRect(-1.2, -15.2 - bob, 2.4, 2.6);
        if (o.pack && view !== 'front') { rrect(g, -7, -28 - bob, 14, 15, 3, '#7a5230', OUT, 1); }
        if (o.pack && view === 'front') { rrect(g, -8.5, -27 - bob, 3.4, 12, 1.5, '#6a4426', OUT, 0.8); rrect(g, 5.1, -27 - bob, 3.4, 12, 1.5, '#6a4426', OUT, 0.8); }
        // cabeça
        const hy = -37 - bob + br;
        if (view === 'back') { ell(g, 0, hy, 7, 7.4, skin, OUT, 1.1); ell(g, 0, hy - 0.5, 7.2, 7, hair, OUT, 1.1); }
        else if (side) {
            ell(g, 0.6, hy, 6.8, 7.2, lg(g, -5, hy - 7, 5, hy + 7, [[0, shade(skin, 0.1)], [1, skin]]), OUT, 1.1); ell(g, 6.8, hy + 1.4, 1.2, 1.5, skinD);
            ell(g, -1.4, hy - 1.2, 7, 7, hair, OUT, 1.1, 0); g.fillStyle = skin; g.beginPath(); g.moveTo(1, hy - 4); g.quadraticCurveTo(7, hy - 5, 7.4, hy + 2); g.lineTo(4, hy + 5); g.quadraticCurveTo(1, hy + 3, 1, hy - 4); g.fill();
            ell(g, 4, hy - 0.4, 1.5, 1.7, '#fff'); ell(g, 4.4, hy - 0.4, 0.8, 1.1, '#1a1a1a');
        } else {
            ell(g, 0, hy, 7.2, 7.6, lg(g, -5, hy - 7, 5, hy + 7, [[0, shade(skin, 0.1)], [1, skin]]), OUT, 1.1);
            g.fillStyle = hair; g.beginPath(); g.moveTo(-7.4, hy); g.quadraticCurveTo(-8, hy - 9, 0, hy - 8.4); g.quadraticCurveTo(8, hy - 9, 7.4, hy); g.quadraticCurveTo(4, hy - 4.6, 0, hy - 4); g.quadraticCurveTo(-4, hy - 4.6, -7.4, hy); g.closePath(); paint(g, hair, OUT, 1);
            ell(g, -3, hy + 0.4, 1.7, 1.9, '#fff'); ell(g, 3, hy + 0.4, 1.7, 1.9, '#fff'); ell(g, -3, hy + 0.7, 0.9, 1.2, '#1a1a1a'); ell(g, 3, hy + 0.7, 0.9, 1.2, '#1a1a1a');
            g.strokeStyle = '#7a3b2a'; g.lineWidth = 1; g.beginPath(); g.arc(0, hy + 3.4, 2 + atk, 0.25, PI - 0.25); g.stroke();
            ell(g, -5.2, hy + 2.4, 1.4, 0.9, 'rgba(230,110,110,0.35)'); ell(g, 5.2, hy + 2.4, 1.4, 0.9, 'rgba(230,110,110,0.35)');
        }
        if (o.beard) { g.fillStyle = o.beard; g.beginPath(); if (side) { g.moveTo(1, hy + 2); g.quadraticCurveTo(7, hy + 2, 6, hy + 7); g.quadraticCurveTo(3, hy + 12, -1, hy + 8); g.closePath(); } else { g.moveTo(-6, hy + 2); g.quadraticCurveTo(0, hy + 5, 6, hy + 2); g.quadraticCurveTo(6, hy + 11, 0, hy + 13); g.quadraticCurveTo(-6, hy + 11, -6, hy + 2); g.closePath(); } paint(g, o.beard, OUT, 0.9); }
        hat(g, o.hat, hy, view, o.hatColor);
        // braço da frente
        let wHand = null;
        if (side) {
            const a = -0.25 + atk * 1.7 + armSw * 0.5; g.save(); g.translate(1, -29 - bob); g.rotate(a); limb2(g, 0, 0, 1, 6, 2, 11, 4.4, shirt); ell(g, 2, 12, 2.6, 2.6, skin, OUT, 0.9); g.restore();
            wHand = { x: 1 + 2 * cos(a) - 12 * sin(a), y: -29 - bob + 2 * sin(a) + 12 * cos(a), a };
        } else {
            limb2(g, -tw / 2 - 1.5, -28 - bob, -tw / 2 - 3.6, -22, -tw / 2 - 3.2 - armSw * 1.5, -15 - bob - max(0, armSw) * 2, 4.4, shirt); ell(g, -tw / 2 - 3.2 - armSw * 1.5, -14 - bob - max(0, armSw) * 2, 2.6, 2.6, skin, OUT, 0.9);
            limb2(g, tw / 2 + 1.5, -28 - bob, tw / 2 + 3.6, -22, tw / 2 + 3.2 + armSw * 1.5, -15 - bob - max(0, -armSw) * 2, 4.4, shirt); ell(g, tw / 2 + 3.2 + armSw * 1.5, -14 - bob - max(0, -armSw) * 2, 2.6, 2.6, skin, OUT, 0.9);
            wHand = { x: tw / 2 + 3.2 + armSw * 1.5, y: -14 - bob - max(0, -armSw) * 2, a: 0 };
        }
        return { bob, hy, hand: wHand };
    }
    function hat(g, kind, hy, view, col) {
        if (!kind) return;
        const c = col;
        if (kind === 'cap') { g.beginPath(); g.moveTo(-8, hy - 1); g.quadraticCurveTo(-8, hy - 11, 0, hy - 10); g.quadraticCurveTo(8, hy - 11, 8, hy - 1); g.closePath(); paint(g, c || '#8a3b2a', OUT, 1.1); if (view !== 'back') rrect(g, view === 'side' ? 1 : -8, hy - 2.4, view === 'side' ? 9 : 16, 2.4, 1, shade(c || '#8a3b2a', -0.2), OUT, 0.8); }
        else if (kind === 'wizard') { g.beginPath(); g.moveTo(-9, hy - 4); g.quadraticCurveTo(-4, hy - 10, -1, hy - 24); g.quadraticCurveTo(3, hy - 26, 5, hy - 32); g.quadraticCurveTo(8, hy - 20, 9, hy - 4); g.quadraticCurveTo(0, hy - 1, -9, hy - 4); g.closePath(); paint(g, lg(g, 0, hy - 30, 0, hy - 2, [[0, shade(c || '#2b56b8', 0.2)], [1, shade(c || '#2b56b8', -0.3)]]), OUT, 1.2); ell(g, 0, hy - 3.6, 12, 2.8, shade(c || '#2b56b8', -0.15), OUT, 1.1); g.fillStyle = '#ffe36a'; ell(g, 2, hy - 13, 1.4, 1.4, '#ffe36a'); ell(g, -2, hy - 8, 1, 1, '#ffe36a'); }
        else if (kind === 'helmet') { g.beginPath(); g.moveTo(-8, hy + 1); g.quadraticCurveTo(-9, hy - 10, 0, hy - 10); g.quadraticCurveTo(9, hy - 10, 8, hy + 1); g.lineTo(6, hy + 1); g.lineTo(6, hy - 2); g.lineTo(-6, hy - 2); g.lineTo(-6, hy + 1); g.closePath(); paint(g, lg(g, -8, hy - 10, 8, hy, [[0, shade(c || '#b9c2cc', 0.25)], [1, shade(c || '#b9c2cc', -0.3)]]), OUT, 1.2); if (view === 'front') { g.fillStyle = '#222'; g.fillRect(-4.4, hy - 1.4, 8.8, 1.6); } tri(g, -1.4, hy - 9.6, 0, hy - 15, 1.4, hy - 9.6, '#c0392b', OUT, 0.8); }
        else if (kind === 'straw') { ell(g, 0, hy - 4, 12, 3, '#e6c46a', OUT, 1); g.beginPath(); g.moveTo(-6, hy - 4); g.quadraticCurveTo(-6, hy - 12, 0, hy - 11.6); g.quadraticCurveTo(6, hy - 12, 6, hy - 4); g.closePath(); paint(g, '#efd27a', OUT, 1); g.fillStyle = '#b5482e'; g.fillRect(-6, hy - 6, 12, 1.6); }
        else if (kind === 'hood') { g.beginPath(); g.moveTo(-8, hy + 3); g.quadraticCurveTo(-10, hy - 10, 0, hy - 11); g.quadraticCurveTo(10, hy - 10, 8, hy + 3); g.lineTo(6, hy - 2); g.quadraticCurveTo(0, hy - 6, -6, hy - 2); g.closePath(); paint(g, c || '#2f78b5', OUT, 1.1); }
        else if (kind === 'fisher') { ell(g, 0, hy - 4, 10.6, 2.6, c || '#1f8f7f', OUT, 1); g.beginPath(); g.moveTo(-6.6, hy - 4); g.quadraticCurveTo(-6.6, hy - 11, 0, hy - 10.6); g.quadraticCurveTo(6.6, hy - 11, 6.6, hy - 4); g.closePath(); paint(g, c || '#1f8f7f', OUT, 1); tri(g, 4, hy - 8, 10, hy - 14, 6, hy - 6, '#f3f3f3', OUT, 0.7); }
        else if (kind === 'mitre') { g.beginPath(); g.moveTo(-6.6, hy - 3); g.lineTo(-5, hy - 16); g.quadraticCurveTo(0, hy - 13, 5, hy - 16); g.lineTo(6.6, hy - 3); g.closePath(); paint(g, '#f8f4e6', OUT, 1.1); g.fillStyle = '#e0b03a'; g.fillRect(-0.9, hy - 14, 1.8, 10); g.fillRect(-3.6, hy - 10, 7.2, 1.8); }
        else if (kind === 'chef') { ell(g, 0, hy - 8, 8, 5.4, '#fff', OUT, 1); rrect(g, -6, hy - 5, 12, 4, 1.4, '#f2f2f2', OUT, 1); }
    }
    function prop(g, kind, hx, hy, t, atk, view) {   // objeto na mão; (hx,hy) = posição da mão
        g.save(); g.translate(hx, hy);
        const a = atk * 1.2;
        if (kind === 'staff') { g.rotate(-0.06 - a); limb(g, 0, 12, 0, -34, 2.6, '#6a4626'); ell(g, 0, -37, 4.4, 4.4, rg(g, 0, -37, 0, 5, [[0, '#fff'], [0.4, '#6ec8ff'], [1, '#2b56b8']]), OUT, 0.9); glow(g, 0, -37, 14, '#6ec8ff', 0.35 + sin(t * 4) * 0.1); }
        else if (kind === 'spear') { g.rotate(-0.04 - a); limb(g, 0, 14, 0, -40, 2.2, '#8a6a44'); tri(g, -3.2, -38, 0, -50, 3.2, -38, '#dfe6ea', OUT, 0.9); }
        else if (kind === 'hammer') { g.rotate(-0.5 - a + sin(t * 3) * 0.05); limb(g, 0, 6, 0, -16, 2.4, '#6a4626'); rrect(g, -7, -24, 14, 9, 1.6, lg(g, -7, -24, 7, -15, [[0, '#b9c2cc'], [1, '#5c6672']]), OUT, 1); }
        else if (kind === 'rod') { g.rotate(-0.9 - a * 0.3); limb(g, 0, 6, 0, -34, 1.6, '#8a6a44'); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(0, -34); g.quadraticCurveTo(10, -20, 8, -8 + sin(t * 3) * 2); g.stroke(); }
        else if (kind === 'mug') { rrect(g, -3.4, -6, 7, 8, 1.4, '#c9a25a', OUT, 0.9); ell(g, 0, -6, 3.4, 1.1, '#fff5d6', OUT, 0.6); g.strokeStyle = OUT; g.lineWidth = 1.2; g.beginPath(); g.arc(4, -2, 2.2, -1.2, 1.2); g.stroke(); }
        else if (kind === 'cross') { g.rotate(-0.06); limb(g, 0, 12, 0, -26, 2.2, '#c9a234'); g.fillStyle = '#e8c04a'; g.fillRect(-5, -22, 10, 2.6); glow(g, 0, -22, 12, '#fff2a8', 0.4); }
        else if (kind === 'book') { rrect(g, -5, -8, 10, 12, 1.4, '#7a2b2b', OUT, 1); g.fillStyle = '#e8c04a'; g.fillRect(-3.4, -5, 6.8, 1.2); }
        else if (kind === 'pitchfork') { g.rotate(-0.06 - a); limb(g, 0, 14, 0, -32, 2.2, '#8a6a44'); g.strokeStyle = '#b9c2cc'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-5, -30); g.lineTo(-5, -40); g.moveTo(0, -32); g.lineTo(0, -43); g.moveTo(5, -30); g.lineTo(5, -40); g.moveTo(-5, -32); g.lineTo(5, -32); g.stroke(); }
        else if (kind === 'scroll') { g.rotate(0.5); rrect(g, -2.4, -10, 5, 14, 2, '#f1e3b8', OUT, 0.9); g.fillStyle = '#c0392b'; g.fillRect(-2.4, -3, 5, 1.6); }
        else if (kind === 'sack') { ell(g, 0, -3, 6, 6.6, '#a8865a', OUT, 1); g.fillStyle = '#7a5a38'; g.fillRect(-2.6, -10, 5.2, 3); }
        g.restore();
    }
    /* NPC: aparência por espécie */
    const NPCLOOK = {
        merchant: { hat: 'cap', hatColor: '#7a3fa0', beard: null, pack: true, prop: 'sack', hair: '#3a2a1a' },
        guide:    { hat: 'hood', hatColor: '#2f78b5', prop: 'scroll', cape: '#2f78b5', hair: '#6a4a2a' },
        smith:    { hat: null, beard: '#4a3020', apron: '#5a4030', prop: 'hammer', hair: '#3a2416', armLen: 1 },
        fisher:   { hat: 'fisher', hatColor: '#1f8f7f', prop: 'rod', hair: '#8a6a3a', beard: '#c9a86a' },
        guard:    { hat: 'helmet', hatColor: '#b9c2cc', armor: true, prop: 'spear', cape: '#3a5fa8', hair: '#3a2a1a' },
        priest:   { hat: 'mitre', robe: true, prop: 'cross', hair: '#d8d8d8', beard: '#e8e8e8' },
        wizard:   { hat: 'wizard', hatColor: '#2b56b8', robe: true, prop: 'staff', beard: '#dcdcdc', hair: '#c9c9c9' },
        farmer:   { hat: 'straw', prop: 'pitchfork', apron: null, hair: '#7a4a1a', beard: null },
        barkeep:  { hat: null, apron: '#f2efe6', prop: 'mug', beard: '#6a3a1a', hair: '#5a3a1e' }
    };

    /* ---------- desenho de uma criatura no mundo ---------- */
    function speciesOf(key, def) { if (def && def.species) return def.species; return String(key || '').split('_')[0]; }
    function drawCreature(ctx, o, def, tx) {
        const key = o.dbKey || ''; const sp = speciesOf(key, def);
        const ow = o.w || 30, oh = o.h || 30; const a = stepState(o, tx); const now = performance.now() / 1000;
        const fx = o.x + ow / 2, fy = o.y + oh;
        if (NPCLOOK[sp]) return drawNpcHuman(ctx, o, def, sp, a, now, fx, fy);
        const S0 = S[sp];
        if (!S0) return fallbackBlob(ctx, o, def, a, now);
        const s = ow / S0.w; const face = a.face;
        // sombra
        const fly = (S0.fly || 0) * s; const sh = S0.sh || [12, 3];
        ctx.fillStyle = 'rgba(0,0,0,' + (0.28 - min(0.14, fly * 0.006)) + ')'; ctx.beginPath(); ctx.ellipse(fx, fy - 1, sh[0] * s * (1 - fly * 0.008), sh[1] * s, 0, 0, TAU); ctx.fill();
        ctx.save(); ctx.translate(fx, fy); ctx.scale(face * s, s);
        const st = { t: now, mv: a.mv, ph: a.ph, atk: a.atk, hurt: a.hurt, c1: (def && def.c1) || '#8e44ad', c2: (def && def.c2) || '#f1c27d', seed: a.seed, face: face };
        try { S0.draw(ctx, st); } catch (e) { if (!S0._err) { S0._err = 1; console.error('[art] ' + sp + ': ' + (e && e.message)); } ctx.restore(); return fallbackBlob(ctx, o, def, a, now); }
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
    }
    function fallbackBlob(ctx, o, def, a, now) {   // criaturas criadas no editor sem desenho próprio
        const ow = o.w || 30, oh = o.h || 30; const c1 = (def && def.c1) || '#8e44ad', c2 = (def && def.c2) || '#f1c27d'; const fx = o.x + ow / 2, fy = o.y + oh; const bob = abs(sin(a.ph)) * a.mv * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(fx, fy - 1, ow * 0.4, oh * 0.1, 0, 0, TAU); ctx.fill();
        ctx.save(); ctx.translate(fx, fy - bob);
        rrect(ctx, -ow * 0.32, -oh * 0.7, ow * 0.64, oh * 0.55, 6, lg(ctx, 0, -oh * 0.7, 0, -oh * 0.15, [[0, shade(c1, 0.2)], [1, shade(c1, -0.3)]]), OUT, 1.2);
        ell(ctx, 0, -oh * 0.78, ow * 0.27, ow * 0.27, c2, OUT, 1.2);
        if (o.type === 'enemy') { ctx.fillStyle = '#e33'; ctx.fillRect(-ow * 0.14, -oh * 0.82, 3, 3); ctx.fillRect(ow * 0.05, -oh * 0.82, 3, 3); }
        ctx.restore();
    }
    function drawNpcHuman(ctx, o, def, sp, a, now, fx, fy) {
        const look = NPCLOOK[sp]; const ow = o.w || 30, oh = o.h || 44; const s = ow / 30;
        ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(fx, fy - 1, 11 * s, 3.2 * s, 0, 0, TAU); ctx.fill();
        ctx.save(); ctx.translate(fx, fy); ctx.scale(s, s);
        const shirt = (def && def.c1) || '#3b7dd8', skin = (def && def.c2) || '#f1c27d';
        const pants = shade(shirt, -0.5);
        const info = human(ctx, { view: 'front', t: now, seed: a.seed, mv: a.mv, ph: a.ph, skin, shirt, pants, hair: look.hair, hat: look.hat, hatColor: look.hatColor, beard: look.beard, apron: look.apron, robe: look.robe, armor: look.armor, cape: look.cape, pack: look.pack, atk: 0 });
        if (look.prop) { const wob = sin(now * 1.6 + a.seed) * 0.6; prop(ctx, look.prop, 13, -15 - info.bob + wob, now, 0, 'front'); }
        ctx.restore();
        // ícone de conversa
        const bounce = sin(now * 3 + a.seed) * 1.5; ctx.fillStyle = '#f1c40f'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3;
        ctx.strokeText('💬', fx, fy - oh - 4 + bounce); ctx.fillText('💬', fx, fy - oh - 4 + bounce); ctx.textAlign = 'start';
    }

    /* ---------- personagem do jogador ---------- */
    const _pst = {};
    function armorColor(item, fallback) {
        if (!item || !item.name) return fallback; const n = item.name.toLowerCase();
        if (n.includes('mithril')) return '#5aa8ff'; if (n.includes('steel')) return '#c3cbd6'; if (n.includes('bone') || n.includes('lich')) return '#e6e0c8'; if (n.includes('dragon')) return '#8a2a2a'; if (n.includes('iron')) return '#9aa3ad'; if (n.includes('bronze')) return '#b8783a'; if (n.includes('leather')) return '#8b5a2b'; return fallback;
    }
    function drawPlayer(ctx, px, py, facing, anim, equip, name, isMain, extra) {
        extra = extra || {}; const key = name || '_'; const p = _pst[key] || (_pst[key] = { x: px, y: py, mv: 0, ph: 0 });
        const dx = px - p.x, dy = py - p.y, sp = Math.hypot(dx, dy); if (sp > 60) { p.x = px; p.y = py; }
        else { p.x = px; p.y = py; p.mv += ((sp > 0.08 ? 1 : 0) - p.mv) * 0.2; p.ph += sp * 0.085; }
        const now = performance.now() / 1000; const wp = equip ? equip.weapon : null, sh = equip ? equip.shield : null, body = equip ? equip.body : null;
        const view = facing.y < 0 ? 'back' : facing.y > 0 ? 'front' : 'side'; const flip = facing.x < 0 ? -1 : 1;
        const shirtCol = body ? armorColor(body, '#3b7dd8') : ((wp && wp.tool === 'magic') ? '#4a6fd8' : (wp && wp.tool === 'ranged') ? '#3f8f4f' : '#3b7dd8');
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(px, py + 8, 10, 3.6, 0, 0, TAU); ctx.fill();
        ctx.save(); ctx.translate(px, py + 8); ctx.scale(view === 'side' ? flip : 1, 1);
        const atk = anim > 0 ? sin((anim / 15) * PI) : 0;
        const info = human(ctx, { view, t: now, seed: 3, mv: p.mv, ph: p.ph, atk, skin: extra.skin || '#f1c27d', shirt: shirtCol, pants: '#4a3a2a', hair: extra.hair || '#6b4a2a', armor: !!body, cape: isMain ? '#a8342c' : (extra.cape || null), hat: equip && equip.head ? 'helmet' : null, hatColor: armorColor(equip && equip.head, '#b9c2cc') });
        // escudo e arma (mãos)
        if (sh && view !== 'back') { ctx.save(); ctx.translate(view === 'side' ? -2 : -11, -19 - info.bob); ell(ctx, 0, 0, 7.4, 8.6, lg(ctx, -6, -8, 6, 8, [[0, shade(armorColor(sh, '#9aa3ad'), 0.25)], [1, shade(armorColor(sh, '#9aa3ad'), -0.35)]]), OUT, 1.2); ell(ctx, 0, 0, 3, 3.6, shade(armorColor(sh, '#9aa3ad'), 0.35), OUT, 0.8); ctx.restore(); }
        if (wp) {
            // a arma sai da MÃO (posição vinda do corpo), inclinada para fora, com o punho por cima do cabo
            const H = info.hand || { x: view === 'side' ? 6 : 10, y: -15 - info.bob, a: 0 }; const prg = anim > 0 ? anim / 15 : 0, swing = sin(prg * PI);
            const light = wp.tool === 'magic' || wp.tool === 'ranged';
            ctx.save(); ctx.translate(H.x, H.y - swing * 2);
            let rot = view === 'side' ? 0.55 + H.a * 0.6 : (view === 'back' ? -0.3 : 0.3); rot += swing * (light ? 0.5 : 1.7) * (view === 'back' ? -1 : 1);
            ctx.rotate(rot);
            const wood = '#8b5a2b', woodL = '#b07a3f', mc = armorColor(wp, '#c9d1d8'), steel = wp.tool ? '#b9c2cc' : mc;
            const handle = (y0, y1, w) => { limb(ctx, 0, y0, 0, y1, w + 1.4, OUT); limb(ctx, 0, y0, 0, y1, w, wood); ctx.fillStyle = woodL; ctx.fillRect(-w / 2 + 0.3, y1, 0.9, y0 - y1); };
            if (wp.tool === 'magic') { handle(14, -24, 2.4); ctx.fillStyle = '#4a2f16'; ctx.fillRect(-1.8, -3, 3.6, 3); ell(ctx, 0, -29, anim > 0 ? 6 : 4.6, anim > 0 ? 6 : 4.6, rg(ctx, -1, -30, 0, 7, [[0, '#fff'], [0.4, anim > 0 ? '#1abc9c' : '#6ec8ff'], [1, '#2b56b8']]), OUT, 0.9); glow(ctx, 0, -29, 14, '#6ec8ff', 0.4); }
            else if (wp.tool === 'ranged') { ctx.strokeStyle = OUT; ctx.lineWidth = 4.4; ctx.beginPath(); ctx.arc(-4, -2, 15, -1.15, 1.15); ctx.stroke(); ctx.strokeStyle = '#a85a1a'; ctx.lineWidth = 2.6; ctx.stroke(); ctx.strokeStyle = 'rgba(240,240,240,0.9)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(2.2, -15); ctx.lineTo(2.2, 11); ctx.stroke(); }
            else if (wp.tool === 'axe') {
                handle(13, -21, 2.6);
                ctx.beginPath(); ctx.moveTo(1, -22); ctx.quadraticCurveTo(10, -27, 12, -17); ctx.quadraticCurveTo(11, -9, 3, -11); ctx.closePath(); paint(ctx, lg(ctx, 1, -24, 12, -10, [[0, shade(steel, 0.55)], [0.55, steel], [1, shade(steel, -0.35)]]), OUT, 1.1);
                ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(5, -24); ctx.quadraticCurveTo(10.6, -24, 11.2, -16); ctx.stroke();
                rrect(ctx, -2.2, -22.5, 4.4, 6, 1, '#5a5f66', OUT, 0.9);
            }
            else if (wp.tool === 'pickaxe') {
                handle(13, -20, 2.6);
                ctx.beginPath(); ctx.moveTo(-13, -14); ctx.quadraticCurveTo(-8, -25, 0, -23.5); ctx.quadraticCurveTo(8, -25, 13, -14); ctx.quadraticCurveTo(8, -20.5, 0, -19.5); ctx.quadraticCurveTo(-8, -20.5, -13, -14); ctx.closePath(); paint(ctx, lg(ctx, -12, -25, 12, -14, [[0, shade(steel, 0.55)], [0.5, steel], [1, shade(steel, -0.4)]]), OUT, 1.1);
                rrect(ctx, -2.6, -24, 5.2, 5.4, 1, '#5a5f66', OUT, 0.9);
            }
            else if (wp.tool === 'net') { handle(13, -13, 2.2); ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -20, 8, 0, TAU); ctx.stroke(); ctx.strokeStyle = 'rgba(240,240,240,0.9)'; ctx.lineWidth = 1; ctx.stroke(); for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-8, -20 + i * 4); ctx.lineTo(8, -20 + i * 4); ctx.moveTo(i * 4, -28); ctx.lineTo(i * 4, -12); ctx.stroke(); } }
            else {   // espada: lâmina, guarda, cabo e pomo
                poly(ctx, [-2.6, -5, 2.6, -5, 2.4, -26, 0, -32, -2.4, -26], lg(ctx, -3, 0, 3, 0, [[0, shade(mc, 0.55)], [0.5, shade(mc, 0.1)], [1, shade(mc, -0.35)]]), OUT, 1.1);
                ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, -27); ctx.stroke();
                rrect(ctx, -6.4, -6.8, 12.8, 3.2, 1.4, '#d2a437', OUT, 0.9); rrect(ctx, -1.7, -4, 3.4, 11, 1.2, '#6b3f1c', OUT, 0.9); ell(ctx, 0, 8, 2.4, 2.4, '#d2a437', OUT, 0.9);
            }
            // punho por cima do cabo
            ell(ctx, 0, 1, 3.1, 3.3, extra.skin || '#f1c27d', OUT, 0.9);
            ctx.restore();
        }
        ctx.restore();
        ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center'; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 3; const ny = py - (equip && equip.head ? 47 : 43); ctx.strokeText(name, px, ny); ctx.fillStyle = isMain ? '#f1c40f' : '#ffffff'; ctx.fillText(name, px, ny); ctx.textAlign = 'start';
        let ty = ny - 4;
        if (extra.title) { ctx.font = 'italic 10px Georgia, serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ty = ny - 13; const tt = '\u2039' + extra.title + '\u203a'; ctx.strokeText(tt, px, ty); ctx.fillStyle = '#e8c469'; ctx.fillText(tt, px, ty); ctx.textAlign = 'start'; ty -= 6; }
        if (extra.emote && root.Emotes) root.Emotes.draw(ctx, px, ty - 4, extra.emote);
    }

    root.Art = root.Art || {};
    function creatureTop(o, def) {   // y (mundo) do topo do desenho da criatura, para colocar nome/barra de vida
        const sp = speciesOf(o.dbKey, def), S0 = S[sp], ow = o.w || 30, oh = o.h || 30; if (NPCLOOK[sp]) return o.y + oh - Math.max(oh, 46) * 1.02;
        if (!S0) return o.y; const sc = ow / S0.w; return o.y + oh - (S0.h * (S0.bounds ? 1.12 : 1) + (S0.fly || 0)) * sc * 0.95;
    }
    Object.assign(root.Art, { creatureTop, hash, hex, shade, alpha, mix, ell, poly, rrect, limb, limb2, lg, rg, glow, tri, paint, OUT, PI, TAU, S, NPCLOOK, human, hat, prop, speciesOf, stepState, drawCreature, drawPlayer, SKIN });
})(typeof window !== 'undefined' ? window : globalThis);
