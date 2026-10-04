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
    /* cinemática de 2 ossos: devolve o joelho/cotovelo entre (hx,hy) e (fx,fy); dir = +1 dobra para a frente (+x), -1 para trás */
    function ik(hx, hy, fx, fy, l1, l2, dir) {
        let vx = fx - hx, vy = fy - hy, d = Math.hypot(vx, vy) || 0.001; const reach = (l1 + l2) * 0.998; if (d > reach) { vx *= reach / d; vy *= reach / d; d = reach; fx = hx + vx; fy = hy + vy; }
        const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a)); let nx = -vy / d, ny = vx / d; if (nx * dir < 0) { nx = -nx; ny = -ny; }
        return [hx + vx / d * a + nx * h, hy + vy / d * a + ny * h, fx, fy];
    }
    /* braço articulado: ombro redondo, braço, cotovelo (junta visível), antebraço mais fino e punho */
    function arm2(g, x0, y0, x1, y1, x2, y2, w, col, cuff) {
        g.lineCap = 'round'; g.lineJoin = 'round';
        limb(g, x0, y0, x1, y1, w, col); limb(g, x1, y1, x2, y2, w * 0.86, col);
        g.fillStyle = col; g.beginPath(); g.arc(x1, y1, w * 0.5, 0, TAU); g.fill();   // cotovelo (cobre a emenda do contorno)
        g.strokeStyle = shade(col, -0.35); g.lineWidth = 0.7; g.beginPath(); g.arc(x1, y1, w * 0.46, 0.4, 2.6); g.stroke();
        g.fillStyle = col; g.beginPath(); g.arc(x0, y0, w * 0.56, 0, TAU); g.fill();   // ombro
        if (cuff) { const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1, cx = x2 - dx / d * 1.8, cy = y2 - dy / d * 1.8; g.strokeStyle = cuff; g.lineWidth = w * 0.9; g.lineCap = 'butt'; g.beginPath(); g.moveTo(cx - dy / d * 0.01, cy + dx / d * 0.01); g.lineTo(cx + dx / d * 1.6, cy + dy / d * 1.6); g.stroke(); g.lineCap = 'round'; }
    }
    function lg(g, x0, y0, x1, y1, stops) { const gr = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(s => gr.addColorStop(s[0], s[1])); return gr; }
    function rg(g, x, y, r0, r1, stops) { const gr = g.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(s => gr.addColorStop(s[0], s[1])); return gr; }
    function glow(g, x, y, r, col, a) { g.fillStyle = rg(g, x, y, 0, r, [[0, alpha(col, a)], [1, alpha(col, 0)]]); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    function tri(g, x0, y0, x1, y1, x2, y2, fill, stroke, lw) { poly(g, [x0, y0, x1, y1, x2, y2], fill, stroke, lw); }

    /* ---------- estado de animação por entidade ---------- */
    function idn(o) { const n = Number(o.id); if (isFinite(n) && n) return n; return hash(String(o.id || 1)) * 977 + 1; }   // ids de texto (catacumbas, chefe) também viram número
    function stepState(o, tx, ty) {
        let a = o._a;
        if (!a) a = o._a = { x: o.x, y: o.y, face: 1, mv: 0, ph: hash(idn(o) * 1.7) * 6, atk: 0, hurt: 0, lastHp: o.hp, seed: hash(idn(o) * 3.3) * 50, sinceMove: 0, view: null, vc: 0, turn: 0, wind: 0, aq: 0, atkOn: 0, lx: 0, ly: 0 };
        const dx = o.x - a.x, dy = o.y - a.y, sp = Math.hypot(dx, dy);
        if (sp > 60) { a.x = o.x; a.y = o.y; a.lastHp = o.hp; return a; }   // teleporte: não anima
        a.x = o.x; a.y = o.y;
        const moving = sp > 0.06;
        // vira de lado só depois de andar para o outro lado por alguns quadros (evita "tremer" ao raspar em paredes/outros bichos)
        let want = 0;
        if (abs(dx) > 0.12) want = dx > 0 ? 1 : -1;
        else if (tx !== undefined && !moving) { const d = tx - (o.x + (o.w || 30) / 2); if (abs(d) > 10) want = d > 0 ? 1 : -1; }
        if (want && want !== a.face) { a.flip = (a.flip || 0) + 1; if (a.flip >= 7) { a.face = want; a.flip = 0; a.turn = 1; } } else a.flip = 0;
        // vista (frente / costas / perfil) com histerese: precisa pedir a mesma vista por ~8 quadros para trocar
        const adx = abs(dx), ady = abs(dy), cx = o.x + (o.w || 30) / 2, cy = o.y + (o.h || 30) / 2;
        let wv = null, ex = 0, ey = 0, near = false;
        if (tx !== undefined) { ex = tx - cx; ey = (ty !== undefined ? ty : cy) - cy; near = ex * ex + ey * ey < 260 * 260 && ex * ex + ey * ey > 400; }
        if (moving) { if (ady > adx * 0.8 && ady > 0.07) wv = dy > 0 ? 'front' : 'back'; else if (adx > 0.07) wv = 'side'; }
        else if (near && ty !== undefined) { if (abs(ey) > abs(ex) * 1.5) wv = ey > 0 ? 'front' : 'back'; else if (abs(ex) > abs(ey) * 1.5) wv = 'side'; }
        if (wv && wv !== a.view) { a.vc++; if (a.vc >= 8) { if (a.view) a.turn = 1; a.view = wv; a.vc = 0; } } else a.vc = 0;
        // para onde "olha" (cabeça/olhos): movimento ou alvo próximo
        let tlx = 0, tly = 0; if (moving) { tlx = max(-1, min(1, dx * 3)); tly = max(-1, min(1, dy * 3)); } else if (near) { tlx = max(-1, min(1, ex / 110)); tly = max(-1, min(1, ey / 110)); }
        a.lx += (tlx - a.lx) * 0.1; a.ly += (tly - a.ly) * 0.1; a.turn *= 0.82;
        a.mv += ((moving ? 1 : 0) - a.mv) * 0.18;
        a.ph += sp * 0.24 + 0.004;
        if (o.hp !== undefined && a.lastHp !== undefined && o.hp < a.lastHp) a.hurt = 1;
        a.lastHp = o.hp; a.hurt *= 0.9;
        // ataque: ~5 quadros de recuo (antecipação) e então o golpe
        const cd = o.attackCooldown || 0;
        if (cd > 62) { if (!a.atkOn) { a.atkOn = 1; a.aq = 5; } } else a.atkOn = 0;
        if (a.aq > 0) { a.aq--; a.wind = min(1, a.wind + 0.3); a.atk *= 0.9; } else { a.wind *= 0.55; if (a.atkOn) a.atk = 1; else a.atk *= 0.92; }
        if (a.atk < 0.02) a.atk = 0; if (a.hurt < 0.02) a.hurt = 0; if (a.wind < 0.02) a.wind = 0; if (a.turn < 0.02) a.turn = 0;
        return a;
    }

    /* ============================================================
       CRIATURAS
       ============================================================ */
    const S = {};   // species -> { w,h, sh:[rx,ry], draw(g,st) }

    /* --- GOBLIN --- */
    /* braço + arma na mão: a = ângulo do braço (0 = pendurado, + = para frente/cima); a arma sai da mão e aponta para CIMA (-y), girando com wang.
       Assim nunca cruza o rosto e não fica "esticada" para o lado. */
    let HD = 1;   // lado do cotovelo: +1 para fora (frente), -1 para trás (perfil)
    const heldS = (...a) => { HD = -1; try { held(...a); } finally { HD = 1; } };
    function held(g, sx, sy, a, len, w, armCol, handCol, wang, fn) {
        const hx = sx + sin(a) * len, hy = sy + cos(a) * len, bd = len * 0.16, ex = (sx + hx) / 2 + HD * cos(a) * bd, ey = (sy + hy) / 2 - HD * sin(a) * bd;   // cotovelo dobra para fora
        limb2(g, sx, sy, ex, ey, hx, hy, w, armCol);
        g.save(); g.translate(hx, hy); g.rotate(wang); fn(g); g.restore();
        ell(g, hx, hy, w * 0.56, w * 0.5, handCol, OUT, 1);
    }
    S.goblin = { w: 30, h: 34, sh: [10, 3], draw(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const back = st.view === 'back', lk = (st.turn || 0) * 0.9; const sw = sin(ph) * mv, bob = abs(sin(ph)) * mv * 1.4, br = sin(t * 3 + st.seed) * 0.4;
        const skin = c1, skinD = shade(skin, -0.32), skinL = shade(skin, 0.28), cloth = c2, lean = atk * 3;
        limb2(g, -3, -12 - bob, -3 + sw * 3, -6, -4 + sw * 5, -0.5, 4.2, skinD);
        ell(g, -3 + sw * 5, -0.5, 3.6, 1.7, '#3b2a1d', OUT, 1);
        limb2(g, 3, -12 - bob, 3 - sw * 3, -6, 4 - sw * 5, -0.5, 4.2, skin);
        ell(g, 4 - sw * 5, -0.5, 3.6, 1.7, '#4a3524', OUT, 1);
        // braço de trás
        limb2(g, -6, -22 - bob, -9.5 - sw * 2, -17 - bob, -9 - sw * 3, -10.5 - bob, 3.6, skinD); ell(g, -9 - sw * 3, -9.5 - bob, 2.1, 2, skinD, OUT, 0.9);
        // torso
        rrect(g, -7 + lean, -25 - bob + br, 14, 15, 4, lg(g, -7, -25, 7, -10, [[0, shade(cloth, 0.15)], [1, shade(cloth, -0.3)]]), OUT, 1.2);
        g.fillStyle = '#2c1d12'; g.fillRect(-7 + lean, -14 - bob, 14, 2.2);
        if (!back) { g.fillStyle = '#e0c060'; g.fillRect(-1 + lean, -14.4 - bob, 3, 3); } else { g.strokeStyle = shade(cloth, -0.5); g.lineWidth = 1; g.beginPath(); g.moveTo(lean, -24 - bob); g.lineTo(lean + 0.6, -15 - bob); g.stroke(); }
        poly(g, [-6, -11 - bob, 6, -11 - bob, 8, -6 - bob, -8, -6 - bob], shade(cloth, -0.2), OUT, 1);
        // cabeça
        const hx = 2 + lean * 1.4, hy = -29 - bob + br;
        tri(g, hx - 6, hy - 1, hx - 17, hy - 6 + sin(t * 5) * 0.8, hx - 6, hy + 5, skin, OUT, 1.1);
        tri(g, hx + 5, hy - 1, hx + 15, hy - 7, hx + 6, hy + 5, skinD, OUT, 1.1);
        if (!back) tri(g, hx - 6.5, hy, hx - 13, hy - 3, hx - 6.5, hy + 3, '#e39a8a');
        ell(g, hx, hy, 8, 7.2, lg(g, hx - 6, hy - 7, hx + 6, hy + 7, [[0, skinL], [1, skin]]), OUT, 1.2);
        if (back) { g.strokeStyle = shade(skinD, -0.3); g.lineWidth = 1; g.lineCap = 'round'; for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(hx + k * 2.4, hy - 6.8); g.lineTo(hx + k * 3.4, hy - 3.4); g.stroke(); } g.fillStyle = alpha(skinD, 0.5); g.beginPath(); g.ellipse(hx, hy + 3.5, 5, 2.2, 0, 0, TAU); g.fill(); }
        else {
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(hx - 1, hy - 5.5, 5, 1.3, 0, 0, TAU); g.fill();
        ell(g, hx + 3, hy - 1.5, 2.5, 2.3, '#ffe75a', OUT, 0.8); ell(g, hx - 3, hy - 1.5, 2.2, 2.1, '#ffe75a', OUT, 0.8);
        g.fillStyle = '#b3131b'; g.fillRect(hx + 3.2 + lk, hy - 2.6, 1.3, 2.4); g.fillRect(hx - 2.8 + lk, hy - 2.6, 1.3, 2.2);
        poly(g, [hx + 6, hy + 0.5, hx + 11, hy + 2.5, hx + 6, hy + 3.5], skinD, OUT, 0.9);
        g.strokeStyle = '#3a0d0d'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(hx - 2, hy + 4.4); g.quadraticCurveTo(hx + 2, hy + 6.8 + atk * 2, hx + 6, hy + 4); g.stroke();
        g.fillStyle = '#fff'; tri(g, hx - 1, hy + 4.5, hx + 0.6, hy + 4.7, hx - 0.2, hy + 6.6, '#fff'); tri(g, hx + 3, hy + 4.5, hx + 4.6, hy + 4.2, hx + 4, hy + 6.4, '#fff');
        }
        // braço da frente + adaga (na mão, apontando para cima; no ataque desce para a frente)
        held(g, 8 + lean, -22 - bob, -0.25 + atk * 2.2 + sw * 0.35, 12.5, 3.8, skin, skin, 0.35 + atk * 1.7, g2 => {
            poly(g2, [-1.7, -1.5, 1.7, -1.5, 1.5, -15, 0, -19, -1.5, -15], lg(g2, -2, 0, 2, 0, [[0, '#f2f5f8'], [1, '#8f98a3']]), OUT, 1);
            g2.fillStyle = '#5b3a1e'; g2.fillRect(-3.4, -2.4, 6.8, 2.3); g2.fillRect(-1, 0, 2, 4);
        });
    } };

    /* --- ORC --- */
    S.orc = { w: 40, h: 46, sh: [15, 4], draw(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const back = st.view === 'back', lk = (st.turn || 0) * 0.9; const sw = sin(ph) * mv, bob = abs(sin(ph)) * mv * 1.6, br = sin(t * 2.4 + st.seed) * 0.6;
        const skin = c1, skinD = shade(skin, -0.35), skinL = shade(skin, 0.22), metal = c2, lean = atk * 4;
        limb2(g, -5, -17 - bob, -5 + sw * 4, -9, -6 + sw * 6, -1, 7, shade('#4a3a2a', -0.2));
        limb2(g, 5, -17 - bob, 5 - sw * 4, -9, 6 - sw * 6, -1, 7, '#5a4630');
        ell(g, -6 + sw * 6, 0, 5.5, 2.4, '#251a10', OUT, 1); ell(g, 6 - sw * 6, 0, 5.5, 2.4, '#2c2014', OUT, 1);
        limb2(g, -12, -34 - bob, -17 - sw * 2, -27 - bob, -15 - sw * 3, -18 - bob, 6, skinD); ell(g, -15 - sw * 3, -17 - bob, 3.4, 3.2, skinD, OUT, 1);
        // tronco
        g.save(); g.translate(lean, 0);
        g.beginPath(); g.moveTo(-13, -21 - bob); g.quadraticCurveTo(-16, -37 - bob + br, -6, -40 - bob + br); g.lineTo(6, -40 - bob + br); g.quadraticCurveTo(16, -37 - bob + br, 13, -21 - bob); g.closePath();
        paint(g, lg(g, -14, -40, 14, -20, [[0, skinL], [1, skinD]]), OUT, 1.3);
        rrect(g, -12, -27 - bob, 24, 8, 3, '#4d3a26', OUT, 1.2);
        if (!back) { g.fillStyle = '#c9a54a'; g.fillRect(-2, -26 - bob, 4, 6); }
        // ombreiras metal
        ell(g, -13, -37 - bob, 6, 5, lg(g, -18, -42, -8, -32, [[0, shade(metal, 0.3)], [1, shade(metal, -0.3)]]), OUT, 1.2);
        ell(g, 13, -37 - bob, 6, 5, lg(g, 8, -42, 18, -32, [[0, shade(metal, 0.3)], [1, shade(metal, -0.3)]]), OUT, 1.2);
        for (let i = -1; i <= 1; i += 2) { tri(g, i * 13 - 1.5, -41 - bob, i * 13, -47 - bob, i * 13 + 1.5, -41 - bob, '#d8d8d8', OUT, 0.8); }
        // cabeça
        const hx = 3, hy = -45 - bob + br;
        ell(g, hx, hy, 8, 7.4, lg(g, hx - 6, hy - 7, hx + 6, hy + 7, [[0, skinL], [1, skin]]), OUT, 1.3);
        if (back) { g.fillStyle = '#16100c'; g.beginPath(); g.moveTo(hx - 7, hy - 3); g.quadraticCurveTo(hx, hy - 12, hx + 7, hy - 3); g.quadraticCurveTo(hx, hy - 6, hx - 7, hy - 3); g.fill(); g.strokeStyle = shade(skinD, -0.3); g.lineWidth = 1; g.beginPath(); g.moveTo(hx - 3, hy + 3); g.lineTo(hx + 3, hy + 3); g.stroke(); }
        else {
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(hx - 7, hy - 4.6, 14, 1.8);
        ell(g, hx + 3.2, hy - 1.2, 1.8, 1.6, '#ffdf3a'); ell(g, hx - 2.6, hy - 1.2, 1.8, 1.6, '#ffdf3a');
        g.fillStyle = '#c0141a'; g.fillRect(hx + 3.2 + lk, hy - 1.6, 1.1, 1.3); g.fillRect(hx - 2.4 + lk, hy - 1.6, 1.1, 1.3);
        ell(g, hx + 7, hy + 1.5, 3.2, 2.6, skinD, OUT, 1);
        g.fillStyle = '#4a0c0c'; g.beginPath(); g.moveTo(hx - 5, hy + 4); g.quadraticCurveTo(hx + 1, hy + 8 + atk * 2, hx + 7, hy + 4.5); g.lineTo(hx + 7, hy + 3.5); g.quadraticCurveTo(hx + 1, hy + 5, hx - 5, hy + 3); g.fill();
        tri(g, hx - 4.6, hy + 3.6, hx - 3, hy + 3.8, hx - 4, hy - 1, '#f4efd8', OUT, 0.7); tri(g, hx + 5.6, hy + 3.6, hx + 7.2, hy + 4, hx + 6.2, hy - 1.5, '#f4efd8', OUT, 0.7);
        }
        tri(g, hx - 8, hy - 1, hx - 13, hy - 5, hx - 8, hy + 3, skinD, OUT, 1);
        g.restore();
        // braço da frente + machado (empunhado para cima, ao lado da cabeça; no ataque desce em arco)
        held(g, 13 + lean, -36 - bob, -0.2 + atk * 2.3 + sw * 0.3, 17, 6, skin, skinD, 0.32 + atk * 1.75, g2 => {
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
        const { t, mv, ph, atk, c1, c2 } = st; const back = st.view === 'back', lk = (st.turn || 0) * 0.8; const sw = sin(ph) * mv, bob = abs(sin(ph)) * mv * 1.3, bone = c1, boneD = shade(bone, -0.35), lean = atk * 3, br = sin(t * 2.5 + st.seed) * 0.3;
        limb2(g, -3, -17 - bob, -3 + sw * 4, -9, -3 + sw * 6, -0.5, 2.6, boneD); limb2(g, 3, -17 - bob, 3 - sw * 4, -9, 3 - sw * 6, -0.5, 2.6, bone);
        ell(g, -3 + sw * 6, -0.5, 3, 1.4, boneD, OUT, 0.8); ell(g, 3 - sw * 6, -0.5, 3, 1.4, bone, OUT, 0.8);
        // pelve
        ell(g, lean * 0.4, -18 - bob, 6, 3, bone, OUT, 1);
        // escudo (costas)
        if (!back) { g.save(); g.translate(-8 + lean * 0.5, -25 - bob); ell(g, 0, 0, 7, 9, lg(g, -6, -8, 6, 8, [[0, '#8a6a44'], [1, '#4c3a24']]), OUT, 1.2); ell(g, 0, 0, 2.5, 3, c2, OUT, 0.8); g.restore(); }
        // coluna e costelas
        g.strokeStyle = boneD; g.lineWidth = 2.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(lean * 0.4, -19 - bob); g.lineTo(lean * 0.8, -33 - bob); g.stroke();
        for (let i = 0; i < 4; i++) { const y = -32 + i * 3.4 - bob + br; g.strokeStyle = OUT; g.lineWidth = 3.4; g.beginPath(); g.moveTo(-6 + lean * 0.8, y + 1); g.quadraticCurveTo(lean * 0.8, y - 1.5, 6 + lean * 0.8, y + 1); g.stroke(); g.strokeStyle = bone; g.lineWidth = 1.8; g.beginPath(); g.moveTo(-6 + lean * 0.8, y + 1); g.quadraticCurveTo(lean * 0.8, y - 1.5, 6 + lean * 0.8, y + 1); g.stroke(); }
        if (back) { for (let i = 0; i < 6; i++) ell(g, lean * 0.8, -33 + i * 2.6 - bob, 1.5, 1.2, shade(bone, 0.1), OUT, 0.6); g.save(); g.translate(-2 + lean * 0.5, -25 - bob); ell(g, 0, 0, 7, 9, '#6b4f30', OUT, 1.2); ell(g, 0, 0, 5, 7, '#7e5e3a'); ell(g, 0, 0, 2.2, 2.6, c2, OUT, 0.8); g.restore(); }
        // braço + espada
        held(g, 8 + lean, -33 - bob, -0.1 + atk * 2.2 + sw * 0.3, 15, 2.8, bone, bone, 0.55 + atk * 1.5, g2 => {
            poly(g2, [-1.6, -2, 1.6, -2, 1.4, -19, 0, -23, -1.4, -19], lg(g2, -2, 0, 2, 0, [[0, '#dfe6ea'], [1, '#7b8792']]), OUT, 1);
            g2.fillStyle = '#6b4a24'; g2.fillRect(-4, -3, 8, 2.2); g2.fillRect(-1, -1, 2, 5);
        });
        // crânio
        const hx = 2 + lean * 1.3, hy = -39 - bob + br;
        ell(g, hx, hy, 6.4, 6, lg(g, hx - 6, hy - 6, hx + 6, hy + 6, [[0, shade(bone, 0.25)], [1, boneD]]), OUT, 1.2);
        if (back) { g.strokeStyle = alpha(boneD, 0.8); g.lineWidth = 0.9; g.beginPath(); g.moveTo(hx - 4, hy - 1); g.quadraticCurveTo(hx, hy - 4, hx + 4, hy - 1); g.moveTo(hx, hy - 5.5); g.lineTo(hx, hy + 3); g.stroke(); rrect(g, hx - 3, hy + 3.6, 6.4, 2.6, 1, boneD, OUT, 0.8); }
        else {
        const jaw = 1 + atk * 2 + abs(sin(t * 9)) * 0.4 * (st.mv > 0.3 ? 1 : 0);
        rrect(g, hx - 3.6, hy + 3.4, 8, 3 + jaw * 0.6, 1.2, boneD, OUT, 0.9);
        g.fillStyle = '#1a1010'; g.beginPath(); g.ellipse(hx - 2.4, hy - 0.6, 2, 2.3, 0, 0, TAU); g.ellipse(hx + 3, hy - 0.6, 2, 2.3, 0, 0, TAU); g.fill();
        g.fillStyle = '#ff2e2e'; g.fillRect(hx - 2.8 + lk, hy - 1, 1.2, 1.2); g.fillRect(hx + 2.6 + lk, hy - 1, 1.2, 1.2);
        tri(g, hx - 0.5, hy + 1.8, hx + 0.8, hy + 1.8, hx + 0.2, hy + 3.6, '#1a1010');
        g.strokeStyle = '#1a1010'; g.lineWidth = 0.7; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(hx - 3 + i * 2.2, hy + 4); g.lineTo(hx - 3 + i * 2.2, hy + 5.5 + jaw * 0.3); g.stroke(); }
        }
    } };

    /* --- SLIME --- */
    S.slime = { w: 32, h: 26, sh: [13, 3], draw(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const hop = abs(sin(ph * 0.6)) * mv * 7, sq = 1 + sin(t * 3 + st.seed) * 0.05 - (hop < 1 ? 0.12 * mv : -0.08 * mv) + atk * 0.15, wx = 1 / sq;
        g.save(); g.translate(0, -hop); g.scale(wx, sq);
        g.beginPath(); g.moveTo(-15, 0); g.bezierCurveTo(-18, -14, -9, -25, 0, -25); g.bezierCurveTo(9, -25, 18, -14, 15, 0); g.quadraticCurveTo(0, 3, -15, 0); g.closePath();
        paint(g, rg(g, -3, -16, 1, 20, [[0, alpha(c2, 0.95)], [0.5, alpha(c1, 0.9)], [1, alpha(shade(c1, -0.35), 0.95)]]), alpha(shade(c1, -0.55), 0.9), 1.4);
        ell(g, -5, -19, 4, 2, 'rgba(255,255,255,0.55)', null, 0, -0.5); ell(g, 6, -8, 1.6, 1.6, 'rgba(255,255,255,0.35)'); ell(g, -7, -6, 1.2, 1.2, 'rgba(255,255,255,0.3)');
        ell(g, 4, -6, 2.4, 2.4, alpha(shade(c1, -0.55), 0.55));   // núcleo
        const sv = st.view, lk = (st.turn || 0) * 1.4 + (sv === 'side' ? 3.2 : 0), ly = (st.lookY || 0) * 0.8, bl = (t + st.seed) % 4.2 < 0.12;
        if (sv !== 'back') {   // de costas a gosma não tem rosto (só o núcleo e o brilho aparecem)
            if (bl) { g.strokeStyle = '#183c1e'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(-6.6 + lk, -13); g.lineTo(-1.6 + lk, -13); g.moveTo(2.2 + lk, -13); g.lineTo(7.2 + lk, -13); g.stroke(); }
            else { ell(g, -4 + lk, -13, 2.7, 3, '#fff', OUT, 0.8); ell(g, 4.5 + lk, -13, 2.7, 3, '#fff', OUT, 0.8); ell(g, -3.4 + lk * 1.25, -12.6 + ly, 1.3, 1.6, '#111'); ell(g, 5.1 + lk * 1.25, -12.6 + ly, 1.3, 1.6, '#111'); }
            g.strokeStyle = '#183c1e'; g.lineWidth = 1.1; g.beginPath(); g.arc(0.5 + lk, -8, 2.6 + atk * 1.5, 0.15, PI - 0.15); g.stroke();
        }
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
        const gv = st.view, lk = (st.turn || 0) * 1.2;
        if (gv === 'back') { g.strokeStyle = 'rgba(160,200,255,0.7)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, hv - 36); g.quadraticCurveTo(3, hv - 24, 0, hv - 10); g.moveTo(-6, hv - 30); g.quadraticCurveTo(-8, hv - 20, -5, hv - 10); g.moveTo(6, hv - 30); g.quadraticCurveTo(8, hv - 20, 5, hv - 10); g.stroke(); }
        else if (gv === 'side') { ell(g, 1.5, hv - 27, 2.6, 4.3, '#0a0f24'); glow(g, 1.5, hv - 27, 5, '#7fd0ff', 0.9); ell(g, 8.5, hv - 27, 2.2, 4, '#0a0f24'); glow(g, 8.5, hv - 27, 4.5, '#7fd0ff', 0.9); ell(g, 8, hv - 18, 1.8 + atk * 2, 3 + atk * 3, '#0a0f24'); }
        else { ell(g, -5 + lk, hv - 27, 3, 4.3, '#0a0f24'); ell(g, 5 + lk, hv - 27, 3, 4.3, '#0a0f24'); glow(g, -5 + lk, hv - 27, 5, '#7fd0ff', 0.9); glow(g, 5 + lk, hv - 27, 5, '#7fd0ff', 0.9);
        ell(g, lk, hv - 18, 2.4 + atk * 2, 3.4 + atk * 3, '#0a0f24'); }
    } };

    /* --- TROLL --- */
    S.troll = { w: 58, h: 70, sh: [20, 5], draw(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const back = st.view === 'back', lk = (st.turn || 0) * 1.1; const sw = sin(ph) * mv, bob = abs(sin(ph)) * mv * 2.2, br = sin(t * 2 + st.seed) * 0.8, skin = c1, skinD = shade(skin, -0.38), skinL = shade(skin, 0.22), lean = atk * 5;
        limb2(g, -7, -24 - bob, -7 + sw * 4, -13, -8 + sw * 8, -1, 11, skinD); limb2(g, 8, -24 - bob, 8 - sw * 4, -13, 9 - sw * 8, -1, 11, skin);
        ell(g, -8 + sw * 8, 0, 8, 3, '#2e2a22', OUT, 1.2); ell(g, 9 - sw * 8, 0, 8, 3, '#332e26', OUT, 1.2);
        // braço de trás
        limb2(g, -17, -47 - bob, -25, -35 - bob, -22 - sw * 4, -21 - bob, 9, skinD); ell(g, -22 - sw * 4, -19 - bob, 5.4, 5, skinD, OUT, 1.1);
        g.save(); g.translate(lean, 0);
        g.beginPath(); g.moveTo(-18, -22 - bob); g.bezierCurveTo(-26, -40 - bob, -18, -56 - bob + br, 0, -55 - bob + br); g.bezierCurveTo(20, -56 - bob, 26, -40 - bob, 18, -22 - bob); g.bezierCurveTo(8, -18 - bob, -8, -18 - bob, -18, -22 - bob); g.closePath();
        paint(g, lg(g, -24, -56, 24, -20, [[0, skinL], [0.6, skin], [1, skinD]]), OUT, 1.5);
        if (!back) ell(g, 2, -34 - bob, 12, 12, alpha(skinL, 0.55)); else { g.strokeStyle = alpha(skinD, 0.7); g.lineWidth = 1.4; g.beginPath(); g.moveTo(1, -52 - bob); g.lineTo(1, -26 - bob); g.stroke(); for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(-9, -46 + k * 6 - bob); g.quadraticCurveTo(1, -43 + k * 6 - bob, 11, -46 + k * 6 - bob); g.stroke(); } }   // barriga / costas
        g.fillStyle = shade(c2, -0.1); g.beginPath(); g.moveTo(-17, -28 - bob); g.lineTo(17, -28 - bob); g.lineTo(20, -18 - bob); g.lineTo(11, -14 - bob); g.lineTo(0, -19 - bob); g.lineTo(-11, -14 - bob); g.lineTo(-20, -18 - bob); g.closePath(); paint(g, shade(c2, -0.1), OUT, 1.2);
        g.fillStyle = '#5c8a3e'; ell(g, -12, -46 - bob, 4, 2.4, '#5f8a3e'); ell(g, 10, -52 - bob, 3, 1.8, '#5f8a3e');
        for (let i = 0; i < 4; i++) ell(g, -8 + i * 7, -40 - bob + (i % 2) * 5, 1.2, 1.2, skinD);
        // cabeça pequena
        const hx = 8, hy = -58 - bob + br - atk * 2;
        ell(g, hx, hy, 10, 8.6, lg(g, hx - 8, hy - 8, hx + 8, hy + 8, [[0, skinL], [1, skin]]), OUT, 1.4);
        g.fillStyle = skinD; g.beginPath(); g.moveTo(hx - 9, hy - 3); g.quadraticCurveTo(hx, hy - 8, hx + 10, hy - 3); g.lineTo(hx + 10, hy - 1); g.quadraticCurveTo(hx, hy - 5, hx - 9, hy - 1); g.fill();
        if (back) { ell(g, hx - 8.6, hy + 1, 2.2, 3, skinD, OUT, 0.9); ell(g, hx + 8.6, hy + 1, 2.2, 3, skinD, OUT, 0.9); g.fillStyle = alpha(skinD, 0.55); g.beginPath(); g.ellipse(hx, hy + 3, 6, 3, 0, 0, TAU); g.fill(); }
        else {
        ell(g, hx + 4.4, hy - 0.6, 1.8, 1.6, '#fff3a0'); ell(g, hx - 2.4, hy - 0.6, 1.8, 1.6, '#fff3a0'); g.fillStyle = '#111'; g.fillRect(hx + 4.6 + lk, hy - 1.2, 1, 1.2); g.fillRect(hx - 2.2 + lk, hy - 1.2, 1, 1.2);
        ell(g, hx + 9, hy + 2.4, 3.8, 3.2, skinD, OUT, 1); ell(g, hx - 7, hy + 4, 1.6, 1.6, '#7ba05a');
        g.fillStyle = '#3a0c0c'; g.beginPath(); g.moveTo(hx - 6, hy + 5); g.quadraticCurveTo(hx + 2, hy + 10 + atk * 3, hx + 9, hy + 6); g.lineTo(hx + 9, hy + 5); g.quadraticCurveTo(hx + 2, hy + 6, hx - 6, hy + 4); g.fill();
        tri(g, hx - 5, hy + 5.2, hx - 2.4, hy + 5.6, hx - 3.8, hy - 1.4, '#f2ecd0', OUT, 0.8); tri(g, hx + 6.4, hy + 6, hx + 9, hy + 6, hx + 8, hy - 0.4, '#f2ecd0', OUT, 0.8);
        }
        g.strokeStyle = '#5a4030'; g.lineWidth = 1.2; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(hx - 6 + i * 3.4, hy - 8); g.lineTo(hx - 8 + i * 3.4 + sin(t * 2 + i) * 0.8, hy - 14); g.stroke(); }
        g.restore();
        // braço + tacape (apoiado para cima; no ataque desce pesado)
        held(g, 19 + lean, -47 - bob, -0.15 + atk * 2.3 + sw * 0.15, 25, 9, skin, skinD, 0.3 + atk * 1.75, g2 => {
            g2.beginPath(); g2.moveTo(-3, 6); g2.lineTo(3, 6); g2.lineTo(6, -30); g2.quadraticCurveTo(5, -44, -5, -42); g2.quadraticCurveTo(-9, -34, -3, 6); g2.closePath();
            paint(g2, lg(g2, -8, 0, 8, 0, [[0, '#8a6238'], [1, '#4a3018']]), OUT, 1.3);
            g2.strokeStyle = 'rgba(0,0,0,0.3)'; g2.lineWidth = 1; for (let i = 0; i < 4; i++) { g2.beginPath(); g2.moveTo(-3, -4 - i * 8); g2.lineTo(3, -2 - i * 8); g2.stroke(); }
            for (let i = 0; i < 4; i++) tri(g2, 4 + (i % 2) * 2, -14 - i * 5, 9 + (i % 2) * 2, -12 - i * 5, 4 + (i % 2) * 2, -9 - i * 5, '#c8ccd2', OUT, 0.8);
        });
    } };

    /* --- GOLEM --- */
    S.golem = { w: 60, h: 66, sh: [24, 5], draw(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const back = st.view === 'back', lk = (st.turn || 0) * 0.8; const step = abs(sin(ph * 0.8)) * mv, sw = sin(ph * 0.8) * mv, br = sin(t * 1.5 + st.seed) * 0.5, lean = atk * 4, pulse = 0.6 + sin(t * 3 + st.seed) * 0.3 + atk * 0.5;
        const stone = c1, dk = shade(stone, -0.38), lt = shade(stone, 0.22);
        const blk = (x, y, w, h, r, col) => { rrect(g, x, y, w, h, r, lg(g, x, y, x + w, y + h, [[0, shade(col, 0.2)], [1, shade(col, -0.32)]]), OUT, 1.5); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + w * 0.3, y + h * 0.1); g.lineTo(x + w * 0.5, y + h * 0.5); g.lineTo(x + w * 0.4, y + h * 0.9); g.stroke(); };
        blk(-17, -22 - step * 3, 14, 22 + step * 3 - sw * 0, 4, dk); blk(4, -22 - (1 - step) * 1, 14, 22 + (1 - step), 4, stone);
        blk(-21 - sw * 3, -46 - step * 2, 12, 26, 5, dk);   // braço trás
        g.save(); g.translate(lean, -step * 2);
        blk(-15, -52 + br, 32, 33, 7, stone);
        g.fillStyle = 'rgba(80,140,60,0.75)'; ell(g, -8, -50 + br, 6, 2.4, 'rgba(90,150,60,0.8)'); ell(g, 10, -40 + br, 4, 2, 'rgba(90,150,60,0.7)');
        // núcleo
        if (back) { for (let k = 0; k < 3; k++) { g.strokeStyle = alpha(c2, 0.35 + pulse * 0.4); g.lineWidth = 1.6; g.beginPath(); g.moveTo(-9, -44 + k * 7 + br); g.lineTo(11, -44 + k * 7 + br); g.stroke(); } g.strokeStyle = dk; g.lineWidth = 1.2; g.beginPath(); g.moveTo(1, -50 + br); g.lineTo(1, -22); g.stroke(); glow(g, 1, -36 + br, 14 * pulse + 6, c2, 0.25); }
        else {
        glow(g, 1, -36 + br, 20 * pulse + 6, c2, 0.55); ell(g, 1, -36 + br, 6, 6, rg(g, 1, -36, 0, 7, [[0, '#ffffff'], [0.5, c2], [1, shade(c2, -0.5)]]), OUT, 1);
        g.strokeStyle = alpha(c2, 0.9); g.lineWidth = 1.5; g.beginPath(); g.moveTo(1, -30 + br); g.lineTo(-4, -22); g.moveTo(1, -42 + br); g.lineTo(6, -50 + br); g.stroke();
        }
        blk(-10, -66 + br, 20, 16, 5, lt);
        if (back) { g.strokeStyle = dk; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-6, -58 + br); g.lineTo(6, -58 + br); g.moveTo(0, -64 + br); g.lineTo(0, -52 + br); g.stroke(); glow(g, 0, -58 + br, 6, c2, 0.3 * pulse); }
        else {
        g.fillStyle = '#0b0b10'; g.fillRect(-6, -60 + br, 12, 3.4); glow(g, -3, -58.4 + br, 5, c2, 0.9); glow(g, 4, -58.4 + br, 5, c2, 0.9); ell(g, -3 + lk, -58.4 + br, 1.6, 1.4, '#fff'); ell(g, 4 + lk, -58.4 + br, 1.6, 1.4, '#fff');
        }
        g.restore();
        // braço frente (soco)
        const ang = -0.3 + atk * 1.9 + sw * 0.2; g.save(); g.translate(19 + lean, -48); g.rotate(ang); blk(-2, 0, 12, 22, 5, stone); blk(-4, 20, 16, 14, 5, lt); g.restore();
    } };

    /* --- MAGO SOMBRIO --- */
    S.darkmage = { w: 32, h: 48, sh: [11, 3], draw(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const back = st.view === 'back', lk = (st.turn || 0) * 1.2; const hv = 1.5 + sin(t * 2.6 + st.seed) * 1.6, sway = sin(ph) * mv * 1.5;
        glow(g, 0, -20, 30, c2, 0.16 + atk * 0.2);
        g.beginPath(); g.moveTo(-6, -33 - hv); g.quadraticCurveTo(-15, -14, -13 + sway, -hv + 2); for (let i = 0; i <= 5; i++) { g.lineTo(-13 + i * 5.2 + sway, -hv + 2 - (i % 2) * 3 + sin(t * 3 + i) * 1.2); } g.quadraticCurveTo(15, -14, 6, -33 - hv); g.closePath();
        paint(g, lg(g, 0, -34, 0, 0, [[0, shade(c1, 0.25)], [1, shade(c1, -0.4)]]), OUT, 1.3);
        g.strokeStyle = alpha(c2, 0.8); g.lineWidth = 1.3; g.beginPath(); g.moveTo(-9, -6 - hv); g.lineTo(-7, -20 - hv); g.moveTo(9, -6 - hv); g.lineTo(7, -20 - hv); g.moveTo(-10 + sway, -3 - hv); g.quadraticCurveTo(0, -1, 10 + sway, -3 - hv); g.stroke();
        rrect(g, -7, -22 - hv, 14, 3, 1, '#7a4b1a', OUT, 0.8); if (!back) ell(g, 0, -20.6 - hv, 2.4, 2.4, '#e9e2c6', OUT, 0.7);
        // capuz
        g.beginPath(); g.moveTo(-9, -31 - hv); g.quadraticCurveTo(-9, -44 - hv, 3, -50 - hv - atk * 1.5); g.quadraticCurveTo(10, -44 - hv, 9, -31 - hv); g.quadraticCurveTo(0, -27 - hv, -9, -31 - hv); g.closePath(); paint(g, lg(g, -9, -50, 9, -28, [[0, shade(c1, 0.15)], [1, shade(c1, -0.35)]]), OUT, 1.3);
        if (back) { g.strokeStyle = shade(c1, -0.5); g.lineWidth = 1.1; g.beginPath(); g.moveTo(1, -48 - hv); g.quadraticCurveTo(2, -40 - hv, 1, -31 - hv); g.stroke(); }
        else { ell(g, 1 + lk, -35 - hv, 6, 6.4, '#07040c'); glow(g, -1.6 + lk, -35.4 - hv, 5.5, c2, 1); glow(g, 4 + lk, -35.4 - hv, 5.5, c2, 1); ell(g, -1.6 + lk, -35.4 - hv, 1.4, 1.1, '#fff'); ell(g, 4 + lk, -35.4 - hv, 1.4, 1.1, '#fff'); }
        // cajado + orbe
        const cx = 12 + atk * 3, top = -42 - hv - atk * 2; limb(g, cx, -4 - hv, cx + 1, top, 2.6, '#6a4626');
        ell(g, cx + 1, top - 5, 5.6, 5.6, rg(g, cx, top - 6, 0, 6, [[0, '#fff'], [0.4, c2], [1, shade(c2, -0.55)]]), OUT, 1); glow(g, cx + 1, top - 5, 16 + atk * 12 + sin(t * 6) * 2, c2, 0.5 + atk * 0.3);
        for (let i = 0; i < 5; i++) { const a = t * 2.4 + i * 1.26, r = 9 + atk * 7; ell(g, cx + 1 + cos(a) * r, top - 5 + sin(a) * r * 0.6, 1.2, 1.2, alpha(c2, 0.9)); }
        // mão
        ell(g, cx - 0.5, -25 - hv, 2.6, 2.4, '#7d6a8a', OUT, 0.8);
    } };

    function dragonWing(g, K, s, mid, bx, by, fl, col, far) {
        const bone = '#efe4c2', L = K.wing * s; g.save(); g.translate(bx, by); g.rotate(0.15 - fl * 0.5); g.scale(1, 0.86 + 0.14 * fl);
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
        }
    /* --- MOLDES DE DRAGÃO (filhote e ancestral) --- */
    function dragonDraw(g, st, K) {
        const { t, mv, ph, atk, c1, c2, hurt } = st; const s = K.s;
        const sw = sin(ph * 0.7) * mv, bob = abs(sin(ph * 0.7)) * mv * 2.2 * s, br = sin(t * 1.7 + st.seed) * 1.4 * s, lean = atk * 7 * s;
        const scale = c1, dark = shade(c1, -0.5), mid = shade(c1, -0.2), lite = shade(c1, 0.28), belly = c2, bone = '#efe4c2';
        const flap = sin(t * K.flap + st.seed), flap2 = sin(t * K.flap + st.seed - 0.7);
        glow(g, -6 * s, -60 * s, 120 * s, K.aura || c1, K.glow);

        /* asa: braço + 3 dedos + membrana com recortes; origem no ombro, aponta para cima/trás */
        const wing = (bx, by, fl, col, far) => dragonWing(g, K, s, mid, bx, by, fl, col, far);
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

    /*@VIEWS*/
    /* ============================================================
       VISTAS: cada espécie pode ter v = { front, back, side } e home ('front' p/ bípedes, 'side' p/ bichos).
       'front'/'back' não espelham com a direção (só 'side' espelha); st.turn (-1..1) = para onde olha, st.lookY = cima/baixo.
       ============================================================ */
    function legS(g, st, hx, hy, off, stride, lf, w, col, shoe, sl) {   // perna de perfil com passada e pé levantando
        const a = sin(st.ph + off) * st.mv, lift = max(0, cos(st.ph + off)) * st.mv * lf, fx0 = hx + a * stride, fy0 = -0.5 - lift, lh = (-hy - 0.5) / 2 + 0.1 + st.mv * (-hy) * 0.025, K = ik(hx, hy, fx0, fy0, lh, lh, 1), fx = K[2], fy = K[3];
        limb2(g, hx, hy, K[0], K[1], fx, fy, w, col);
        ell(g, fx + sl * 0.3, fy, sl, max(1.2, w * 0.36), shoe, OUT, 0.9);
    }
    function eyeLk(g, x, y, rx, ry, col, pup, lk) { ell(g, x, y, rx, ry, col, OUT, 0.8); g.fillStyle = pup; g.fillRect(x - 0.5 + lk, y - ry * 0.8, 1.2, ry * 1.6); }

    function goblinSide(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const sw = sin(ph) * mv, bob = abs(sin(ph)) * mv * 1.4, br = sin(t * 3 + st.seed) * 0.4, lean = atk * 3;
        const skin = c1, skinD = shade(skin, -0.32), skinL = shade(skin, 0.28), cloth = c2;
        legS(g, st, -0.5, -12 - bob, 0, 4.5, 3, 4.2, skinD, '#3b2a1d', 4); legS(g, st, 1, -12 - bob, PI, 4.5, 3, 4.2, skin, '#4a3524', 4);
        limb2(g, 0, -22 - bob, -sw * 3, -18 - bob, -sw * 4.5, -14 - bob, 3.4, skinD); ell(g, -sw * 4.5, -13.4 - bob, 2, 1.9, skinD, OUT, 0.8);
        g.beginPath(); g.moveTo(-5 + lean * 0.5, -11 - bob); g.quadraticCurveTo(-7 + lean * 0.5, -20 - bob, -4 + lean, -25 - bob + br); g.quadraticCurveTo(1 + lean, -27.5 - bob + br, 5 + lean, -23 - bob + br); g.quadraticCurveTo(6.4 + lean * 0.8, -17 - bob, 5, -11 - bob); g.closePath(); paint(g, cloth, OUT, 1.2);
        g.fillStyle = alpha(shade(cloth, -0.5), 0.45); g.beginPath(); g.moveTo(1, -24 - bob); g.quadraticCurveTo(6.4, -18 - bob, 5, -11 - bob); g.lineTo(1, -11 - bob); g.fill();
        g.fillStyle = '#2c1d12'; g.fillRect(-5.4, -14.4 - bob, 10.8, 2.2); g.fillStyle = '#e0c060'; g.fillRect(2.4, -14.6 - bob, 2.6, 2.8);
        poly(g, [-5, -11.5 - bob, 5, -11.5 - bob, 7, -6 - bob, -6, -6 - bob], shade(cloth, -0.2), OUT, 1);
        const hx = 3 + lean * 1.2, hy = -29.5 - bob + br;
        tri(g, hx - 3.5, hy - 2, hx - 15, hy - 6.5 + sin(t * 5) * 0.8, hx - 3.5, hy + 3.5, skinD, OUT, 1.1); tri(g, hx - 4.2, hy - 1.4, hx - 11, hy - 4.2, hx - 4.2, hy + 2, '#e39a8a');
        ell(g, hx, hy, 7, 6.8, skin, OUT, 1.2); ell(g, hx - 1.6, hy + 1.2, 4.4, 4.6, alpha(skinL, 0.5)); g.fillStyle = 'rgba(0,0,0,0.16)'; g.beginPath(); g.ellipse(hx - 1, hy - 5.2, 4.6, 1.3, 0, 0, TAU); g.fill();
        poly(g, [hx + 5.4, hy - 1.4, hx + 12.5, hy + 2, hx + 5.6, hy + 3.4], skin, OUT, 1); ell(g, hx + 10.4, hy + 2, 0.7, 0.6, skinD);
        eyeLk(g, hx + 3.2, hy - 1.6, 2.4, 2.2, '#ffe75a', '#b3131b', 0.6); g.strokeStyle = '#27381a'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(hx + 0.6, hy - 4.2); g.lineTo(hx + 6, hy - 2.6); g.stroke();
        g.strokeStyle = '#3a0d0d'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(hx + 1.2, hy + 4.2); g.quadraticCurveTo(hx + 5, hy + 5.8 + atk * 2, hx + 8, hy + 3.9); g.stroke(); tri(g, hx + 3, hy + 4.4, hx + 4.8, hy + 4.4, hx + 3.9, hy + 6.6, '#fff');
        heldS(g, 1 + lean, -22 - bob, 0.4 + atk * 1.5 - sw * 0.25, 11.5, 3.8, skin, skin, 0.7 + atk * 1.3, g2 => {
            poly(g2, [-1.7, -1.5, 1.7, -1.5, 1.5, -15, 0, -19, -1.5, -15], '#d3dae1', OUT, 1); g2.fillStyle = '#9aa3ad'; g2.fillRect(0.2, -14, 1.2, 12);
            g2.fillStyle = '#5b3a1e'; g2.fillRect(-3.4, -2.4, 6.8, 2.3); g2.fillRect(-1, 0, 2, 4);
        });
    }
    function orcSide(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const sw = sin(ph) * mv, bob = abs(sin(ph)) * mv * 1.6, br = sin(t * 2.4 + st.seed) * 0.6, lean = atk * 4;
        const skin = c1, skinD = shade(skin, -0.35), skinL = shade(skin, 0.22), metal = c2;
        legS(g, st, -1, -17 - bob, 0, 5, 3.4, 7, shade('#4a3a2a', -0.2), '#251a10', 6); legS(g, st, 2, -17 - bob, PI, 5, 3.4, 7, '#5a4630', '#2c2014', 6);
        limb2(g, -2, -35 - bob, -sw * 4, -27 - bob, -sw * 6, -19 - bob, 6, skinD); ell(g, -sw * 6, -18 - bob, 3.6, 3.4, skinD, OUT, 1);
        g.save(); g.translate(lean, 0);
        g.beginPath(); g.moveTo(-9, -20 - bob); g.quadraticCurveTo(-13, -34 - bob + br, -6, -39.5 - bob + br); g.quadraticCurveTo(3, -41.5 - bob + br, 9, -36 - bob + br); g.quadraticCurveTo(13, -28 - bob, 9, -20 - bob); g.closePath(); paint(g, skin, OUT, 1.3);
        g.fillStyle = alpha(skinD, 0.5); g.beginPath(); g.moveTo(3, -39 - bob + br); g.quadraticCurveTo(13, -28 - bob, 9, -20 - bob); g.lineTo(2, -20 - bob); g.fill();
        ell(g, 3, -30 - bob, 4.4, 6, alpha(skinL, 0.5));
        rrect(g, -9.4, -27 - bob, 19, 7.4, 3, '#4d3a26', OUT, 1.2); g.fillStyle = '#c9a54a'; g.fillRect(5, -26 - bob, 3, 5);
        ell(g, 0.5, -37 - bob, 5.4, 4.6, metal, OUT, 1.2); ell(g, -0.6, -38.4 - bob, 3, 2, shade(metal, 0.3)); tri(g, -1.4, -40.8 - bob, 0.5, -46.5 - bob, 2.4, -40.8 - bob, '#d8d8d8', OUT, 0.8);
        const hx = 4 + lean * 0.4, hy = -45 - bob + br;
        tri(g, hx - 4.6, hy - 1, hx - 12.5, hy - 5, hx - 4.6, hy + 3, skinD, OUT, 1);
        ell(g, hx, hy, 7.2, 7, skin, OUT, 1.3); g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.moveTo(hx - 5, hy - 5); g.lineTo(hx + 7, hy - 3.2); g.lineTo(hx + 7, hy - 1.8); g.lineTo(hx - 5, hy - 3.2); g.fill();
        ell(g, hx + 6.6, hy + 2.4, 4.4, 4.2, skinL, OUT, 1.1); ell(g, hx + 10, hy + 1.2, 1, 0.8, skinD);
        eyeLk(g, hx + 3.4, hy - 0.6, 2, 1.8, '#ffdf3a', '#c0141a', 0.4); g.strokeStyle = '#1a0f08'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(hx + 0.6, hy - 3.6); g.lineTo(hx + 6.4, hy - 1.8); g.stroke();
        g.fillStyle = '#4a0c0c'; g.beginPath(); g.moveTo(hx + 1, hy + 5.2); g.quadraticCurveTo(hx + 5, hy + 7.4 + atk * 2, hx + 9.4, hy + 4.8); g.lineTo(hx + 9, hy + 4); g.lineTo(hx + 1, hy + 4); g.fill();
        tri(g, hx + 4.4, hy + 5.4, hx + 6.2, hy + 5.2, hx + 5.8, hy + 0.8, '#f4efd8', OUT, 0.8);
        g.restore();
        heldS(g, 5 + lean, -35 - bob, 0.35 + atk * 1.55 - sw * 0.2, 16, 6, skin, skinD, 0.8 + atk * 1.5, g2 => {
            g2.fillStyle = '#5b3a1e'; g2.strokeStyle = OUT; g2.lineWidth = 1; g2.beginPath(); g2.rect(-1.6, -26, 3.2, 34); g2.fill(); g2.stroke();
            g2.beginPath(); g2.moveTo(1.4, -25); g2.quadraticCurveTo(13, -28, 12, -16); g2.quadraticCurveTo(13, -8, 1.4, -11); g2.closePath(); paint(g2, '#aab3bd', OUT, 1.2); g2.fillStyle = '#e8ecf0'; g2.beginPath(); g2.moveTo(2, -23.5); g2.quadraticCurveTo(10.5, -25.5, 10.6, -17); g2.lineTo(6, -17); g2.closePath(); g2.fill();
        });
    }
    function skeletonSide(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const sw = sin(ph) * mv, bob = abs(sin(ph)) * mv * 1.3, bone = c1, boneD = shade(bone, -0.35), lean = atk * 3, br = sin(t * 2.5 + st.seed) * 0.3;
        legS(g, st, 0, -17 - bob, 0, 4.5, 3, 2.6, boneD, boneD, 3); legS(g, st, 0.6, -17 - bob, PI, 4.5, 3, 2.6, bone, bone, 3);
        // escudo no braço de trás
        g.save(); g.translate(1.5 - sw * 2, -25 - bob); ell(g, 0, 0, 3.4, 9, '#5a4228', OUT, 1.2); ell(g, 0.4, 0, 1.6, 6, '#7a5a38'); ell(g, 0.8, 0, 1.2, 1.4, c2, OUT, 0.6); g.restore();
        ell(g, lean * 0.4 + 0.5, -18 - bob, 4.4, 3, bone, OUT, 1);
        g.strokeStyle = OUT; g.lineWidth = 4.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(lean * 0.4, -19 - bob); g.quadraticCurveTo(-1.6 + lean * 0.5, -26 - bob, lean * 0.9, -33 - bob); g.stroke(); g.strokeStyle = boneD; g.lineWidth = 2.4; g.stroke();
        ell(g, 1.2 + lean * 0.7, -26.5 - bob + br, 5.2, 7.6, bone, OUT, 1.2); ell(g, 0, -26.5 - bob + br, 2.4, 6.4, alpha(boneD, 0.5));
        for (let i = 0; i < 4; i++) { const y = -31 + i * 3.4 - bob + br; g.strokeStyle = boneD; g.lineWidth = 1.3; g.beginPath(); g.moveTo(-1.6 + lean * 0.8, y); g.quadraticCurveTo(3.4 + lean * 0.8, y + 1.2, 5.6 + lean * 0.8, y + 0.4); g.stroke(); }
        const hx = 2.5 + lean * 1.3, hy = -39 - bob + br, jaw = 1 + atk * 2 + abs(sin(t * 9)) * 0.4 * (st.mv > 0.3 ? 1 : 0);
        ell(g, hx, hy, 6, 5.8, bone, OUT, 1.2); ell(g, hx + 3.6, hy + 2.6, 3.6, 2.4, shade(bone, -0.1), OUT, 0.9);
        rrect(g, hx - 1, hy + 3.6, 7, 2.4 + jaw * 0.6, 1.1, boneD, OUT, 0.9);
        g.fillStyle = '#1a1010'; g.beginPath(); g.ellipse(hx + 2.6, hy - 0.6, 2.2, 2.4, 0, 0, TAU); g.fill(); g.fillStyle = '#ff2e2e'; g.fillRect(hx + 2.6 + (st.turn || 0) * 0.3, hy - 1, 1.3, 1.3);
        tri(g, hx + 5.4, hy + 1.2, hx + 6.6, hy + 1.2, hx + 6.2, hy + 2.6, '#1a1010'); g.strokeStyle = '#1a1010'; g.lineWidth = 0.7; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(hx + 1.4 + i * 2, hy + 3.8); g.lineTo(hx + 1.4 + i * 2, hy + 5.3 + jaw * 0.3); g.stroke(); }
        heldS(g, 1 + lean, -32 - bob, 0.4 + atk * 1.4 - sw * 0.25, 14, 2.8, bone, bone, 0.7 + atk * 1.3, g2 => {
            poly(g2, [-1.6, -2, 1.6, -2, 1.4, -19, 0, -23, -1.4, -19], '#d6dde2', OUT, 1); g2.fillStyle = '#9aa3ad'; g2.fillRect(0.2, -18, 1, 14); g2.fillStyle = '#6b4a24'; g2.fillRect(-4, -3, 8, 2.2); g2.fillRect(-1, -1, 2, 5);
        });
    }
    function trollSide(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const sw = sin(ph) * mv, bob = abs(sin(ph)) * mv * 2.2, br = sin(t * 2 + st.seed) * 0.8, skin = c1, skinD = shade(skin, -0.38), skinL = shade(skin, 0.22), lean = atk * 5;
        legS(g, st, -2, -24 - bob, 0, 7, 4, 11, skinD, '#2e2a22', 8); legS(g, st, 3, -24 - bob, PI, 7, 4, 11, skin, '#332e26', 8);
        limb2(g, -4, -47 - bob, -sw * 4 - 3, -34 - bob, -sw * 6 - 4, -21 - bob, 8.6, skinD); ell(g, -sw * 6 - 4, -19 - bob, 5, 4.6, skinD, OUT, 1.1);
        g.save(); g.translate(lean, 0);
        g.beginPath(); g.moveTo(-12, -22 - bob); g.bezierCurveTo(-20, -40 - bob, -14, -56 - bob + br, -2, -55 - bob + br); g.bezierCurveTo(12, -56 - bob, 17, -40 - bob, 12, -22 - bob); g.bezierCurveTo(4, -18 - bob, -6, -18 - bob, -12, -22 - bob); g.closePath(); paint(g, skin, OUT, 1.5);
        g.fillStyle = alpha(skinD, 0.5); g.beginPath(); g.moveTo(5, -54 - bob + br); g.bezierCurveTo(17, -40 - bob, 12, -26 - bob, 9, -20 - bob); g.lineTo(4, -20 - bob); g.bezierCurveTo(8, -34 - bob, 8, -46 - bob, 5, -54 - bob + br); g.fill();
        ell(g, 4, -33 - bob, 8, 10, alpha(skinL, 0.55)); ell(g, -9, -48 - bob, 5, 3, '#5f8a3e');
        g.beginPath(); g.moveTo(-12, -28 - bob); g.lineTo(13, -28 - bob); g.lineTo(15, -18 - bob); g.lineTo(6, -14 - bob); g.lineTo(-6, -15 - bob); g.lineTo(-14, -18 - bob); g.closePath(); paint(g, shade(c2, -0.1), OUT, 1.2);
        const hx = 9, hy = -56 - bob + br - atk * 2;
        ell(g, hx, hy, 8.6, 8, skin, OUT, 1.4); g.fillStyle = skinD; g.beginPath(); g.moveTo(hx - 7, hy - 3); g.quadraticCurveTo(hx, hy - 8, hx + 8, hy - 3); g.lineTo(hx + 8, hy - 1); g.quadraticCurveTo(hx, hy - 5, hx - 7, hy - 1); g.fill();
        ell(g, hx + 9.4, hy + 2.6, 4.6, 4, skinD, OUT, 1); ell(g, hx - 6, hy + 1, 2.6, 3.6, skinD, OUT, 0.9);
        ell(g, hx + 3.6, hy - 0.8, 2, 1.8, '#fff3a0'); g.fillStyle = '#111'; g.fillRect(hx + 4.2 + (st.turn || 0) * 0.3, hy - 1.6, 1.1, 1.6);
        g.fillStyle = '#3a0c0c'; g.beginPath(); g.moveTo(hx - 1, hy + 5.4); g.quadraticCurveTo(hx + 6, hy + 10 + atk * 3, hx + 12, hy + 6); g.lineTo(hx + 12, hy + 5); g.quadraticCurveTo(hx + 6, hy + 6, hx - 1, hy + 4.6); g.fill();
        tri(g, hx + 6.4, hy + 6, hx + 9.4, hy + 6, hx + 8.2, hy - 0.4, '#f2ecd0', OUT, 0.8);
        g.strokeStyle = '#5a4030'; g.lineWidth = 1.2; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(hx - 4 + i * 3.4, hy - 7.4); g.lineTo(hx - 5.4 + i * 3.4 + sin(t * 2 + i) * 0.8, hy - 13); g.stroke(); }
        g.restore();
        heldS(g, 5 + lean, -46 - bob, 0.3 + atk * 1.6 - sw * 0.15, 24, 9, skin, skinD, 0.65 + atk * 1.55, g2 => {
            g2.beginPath(); g2.moveTo(-3, 6); g2.lineTo(3, 6); g2.lineTo(6, -30); g2.quadraticCurveTo(5, -44, -5, -42); g2.quadraticCurveTo(-9, -34, -3, 6); g2.closePath(); paint(g2, '#6c4a28', OUT, 1.3);
            g2.fillStyle = 'rgba(255,220,160,0.18)'; g2.fillRect(-2, -40, 2.2, 44);
            for (let i = 0; i < 4; i++) tri(g2, 4 + (i % 2) * 2, -14 - i * 5, 9 + (i % 2) * 2, -12 - i * 5, 4 + (i % 2) * 2, -9 - i * 5, '#c8ccd2', OUT, 0.8);
        });
    }
    function golemSide(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const step = abs(sin(ph * 0.8)) * mv, sw = sin(ph * 0.8) * mv, br = sin(t * 1.5 + st.seed) * 0.5, lean = atk * 4, pulse = 0.6 + sin(t * 3 + st.seed) * 0.3 + atk * 0.5;
        const stone = c1, dk = shade(stone, -0.38), lt = shade(stone, 0.22);
        const blk = (x, y, w, h, r, col) => { rrect(g, x, y, w, h, r, col, OUT, 1.5); g.fillStyle = alpha(shade(col, 0.3), 0.35); g.fillRect(x + 1.5, y + 1.5, w * 0.35, h - 3); g.fillStyle = alpha(shade(col, -0.45), 0.3); g.fillRect(x + w * 0.66, y + 1.5, w * 0.3, h - 3); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + w * 0.3, y + h * 0.1); g.lineTo(x + w * 0.5, y + h * 0.5); g.lineTo(x + w * 0.4, y + h * 0.9); g.stroke(); };
        blk(-9 + sw * 5, -22 - step * 3, 12, 22 + step * 3, 4, dk); blk(-5 - sw * 5, -22 - (1 - step), 12, 22 + (1 - step), 4, stone);
        blk(-6 + sw * 4, -46 - step * 2, 11, 25, 5, dk);
        g.save(); g.translate(lean, -step * 2);
        blk(-10, -52 + br, 22, 33, 7, stone); g.fillStyle = 'rgba(90,150,60,0.75)'; ell(g, -4, -50 + br, 5, 2.2, 'rgba(90,150,60,0.8)');
        glow(g, 9, -36 + br, 10 * pulse + 5, c2, 0.5); ell(g, 10.5, -36 + br, 2.6, 5.4, shade(c2, 0.2), OUT, 1); g.strokeStyle = alpha(c2, 0.85); g.lineWidth = 1.4; g.beginPath(); g.moveTo(2, -40 + br); g.lineTo(8, -36 + br); g.lineTo(3, -28 + br); g.stroke();
        blk(-7, -66 + br, 17, 16, 5, lt); g.fillStyle = '#0b0b10'; g.fillRect(2, -60 + br, 8, 3.4); glow(g, 6, -58.4 + br, 5, c2, 0.9); ell(g, 6 + (st.turn || 0) * 0.5, -58.4 + br, 1.6, 1.4, '#fff');
        g.restore();
        const ang = -(0.22 + atk * 1.9 + sw * 0.32); g.save(); g.translate(2 + lean, -48); g.rotate(ang); blk(-3, 0, 12, 22, 5, stone); blk(-5, 20, 16, 14, 5, lt); g.restore();
    }
    function darkmageSide(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const hv = 1.5 + sin(t * 2.6 + st.seed) * 1.6, sway = sin(ph) * mv * 1.5;
        glow(g, 0, -20, 28, c2, 0.16 + atk * 0.2);
        g.beginPath(); g.moveTo(-8, -34 - hv); g.quadraticCurveTo(-14 + sway, -14, -12 + sway * 2, -hv + 2); for (let i = 0; i <= 4; i++) g.lineTo(-12 + i * 4.8 + sway, -hv + 2 - (i % 2) * 3 + sin(t * 3 + i) * 1.2); g.quadraticCurveTo(10, -14, 5, -33 - hv); g.closePath(); paint(g, shade(c1, -0.08), OUT, 1.3);
        g.fillStyle = alpha(shade(c1, -0.55), 0.45); g.beginPath(); g.moveTo(1, -32 - hv); g.quadraticCurveTo(9, -14, 8 + sway, -hv + 2); g.lineTo(0, -hv + 2); g.fill();
        g.strokeStyle = alpha(c2, 0.8); g.lineWidth = 1.3; g.beginPath(); g.moveTo(-5, -4 - hv); g.lineTo(-5, -22 - hv); g.moveTo(-9 + sway, -3 - hv); g.quadraticCurveTo(0, -1, 9 + sway, -3 - hv); g.stroke();
        rrect(g, -6, -22 - hv, 12, 3, 1, '#7a4b1a', OUT, 0.8);
        g.beginPath(); g.moveTo(-9, -31 - hv); g.quadraticCurveTo(-11, -45 - hv, 0, -50 - hv - atk * 1.5); g.quadraticCurveTo(8, -46 - hv, 9, -36 - hv); g.quadraticCurveTo(10, -32 - hv, 6, -29 - hv); g.quadraticCurveTo(-2, -27 - hv, -9, -31 - hv); g.closePath(); paint(g, shade(c1, 0.04), OUT, 1.3);
        ell(g, 3.4, -36 - hv, 4.6, 5.8, '#07040c'); glow(g, 5.2 + (st.turn || 0) * 0.6, -36.4 - hv, 5.2, c2, 1); ell(g, 5.2 + (st.turn || 0) * 0.6, -36.4 - hv, 1.5, 1.1, '#fff');
        const cx = 9 + atk * 3, top = -42 - hv - atk * 2; limb(g, cx, -4 - hv, cx + 1, top, 2.6, '#6a4626');
        ell(g, cx + 1, top - 5, 5.6, 5.6, rg(g, cx, top - 6, 0, 6, [[0, '#fff'], [0.4, c2], [1, shade(c2, -0.55)]]), OUT, 1); glow(g, cx + 1, top - 5, 16 + atk * 12 + sin(t * 6) * 2, c2, 0.5 + atk * 0.3);
        for (let i = 0; i < 5; i++) { const a = t * 2.4 + i * 1.26, r = 9 + atk * 7; ell(g, cx + 1 + cos(a) * r, top - 5 + sin(a) * r * 0.6, 1.2, 1.2, alpha(c2, 0.9)); }
        limb2(g, 2, -29 - hv, 6, -26 - hv, cx - 1, -25 - hv, 3.6, shade(c1, 0.1)); ell(g, cx - 0.5, -25 - hv, 2.6, 2.4, '#7d6a8a', OUT, 0.8);
    }
    const backOf = fn => (g, st) => { g.save(); g.scale(-1, 1); fn(g, st); g.restore(); };   // costas = mesma figura espelhada (a mão da arma vai para o outro lado)
    S.goblin.home = 'front'; S.goblin.v = { front: S.goblin.draw, back: backOf(S.goblin.draw), side: goblinSide };
    S.orc.home = 'front'; S.orc.v = { front: S.orc.draw, back: backOf(S.orc.draw), side: orcSide };
    S.skeleton.home = 'front'; S.skeleton.v = { front: S.skeleton.draw, back: backOf(S.skeleton.draw), side: skeletonSide };
    S.troll.home = 'front'; S.troll.v = { front: S.troll.draw, back: backOf(S.troll.draw), side: trollSide };
    S.golem.home = 'front'; S.golem.v = { front: S.golem.draw, back: backOf(S.golem.draw), side: golemSide };
    S.darkmage.home = 'front'; S.darkmage.v = { front: S.darkmage.draw, back: backOf(S.darkmage.draw), side: darkmageSide };
    S.ghost.home = 'front'; S.ghost.v = { front: S.ghost.draw, back: S.ghost.draw, side: (g, st) => { g.save(); g.scale(0.84, 1); S.ghost.draw(g, st); g.restore(); } };

    /* ---------- quadrúpedes e bichos: vistas 3/4 de frente e de costas (perfil = desenho original) ---------- */
    function ball(g, x, y, rx, ry, col, lw) {   // forma com 3 tons chapados (sem gradiente): sombra, base e realce
        ell(g, x, y, rx, ry, shade(col, -0.26), OUT, lw || 1.2); ell(g, x - rx * 0.07, y - ry * 0.1, rx * 0.89, ry * 0.86, col); ell(g, x - rx * 0.3, y - ry * 0.4, rx * 0.4, ry * 0.28, alpha(shade(col, 0.45), 0.5));
    }
    function fourLegs(g, st, P, near, bob, col, hoof) {   // 4 patas: as de longe (menores/escuras) e as de perto, com passada alternada
        const sw = sin(st.ph) * st.mv, cd = shade(col, -0.3);
        for (let k = 0; k < 2; k++) {   // k=0: de longe, k=1: de perto
            for (let s = -1; s <= 1; s += 2) {
                const x = s * (P.lx + (k ? 0 : 1.7)), l = max(0, (k ? s * sw : -s * sw)) * P.lift, top = P.top - bob + (k ? 0 : -1.4), fy = -l - (k ? 0 : 1.4), kx = x + (near === 'rear' && k ? s * 0.8 : 0);
                limb(g, kx, top, x, fy - 0.8, P.lw * (k ? 1 : 0.88), k ? col : cd); ell(g, x, fy, P.lw * 0.62, P.lw * 0.34, hoof, OUT, 0.8);
            }
        }
    }
    function quadFront(g, st, P, c, face, deco) {
        const { t, mv, ph, atk } = st; const bob = abs(sin(ph)) * mv * P.bob, br = sin(t * 2.4 + st.seed) * 0.4, sway = sin(ph) * mv * 0.6;
        g.save(); g.translate(sway, 0);
        fourLegs(g, st, P, 'front', bob, P.legc || c, P.hoof || '#2b2b30');
        ball(g, 0, P.by - bob, P.bw, P.bh, c); if (deco) deco(g, st, bob, c);
        const hx = (st.turn || 0) * P.tn, hy = P.hy - bob + br + (st.lookY > 0.5 ? 0.8 : 0);
        if (P.hs) { g.save(); g.translate(hx, hy); g.scale(P.hs, P.hs); face(g, 0, 0, st, c); g.restore(); } else face(g, hx, hy, st, c);
        g.restore();
    }
    function quadBack(g, st, P, c, nape, tail, deco) {
        const { t, mv, ph, atk } = st; const bob = abs(sin(ph)) * mv * P.bob, br = sin(t * 2.4 + st.seed) * 0.4, sway = sin(ph) * mv * 0.6;
        g.save(); g.translate(sway, 0);
        fourLegs(g, st, P, 'rear', bob, P.legc || c, P.hoof || '#2b2b30');
        ball(g, 0, P.by - bob, P.bw, P.bh, c);
        nape(g, (st.turn || 0) * P.tn * 0.6, P.by - bob + br - P.bh * 0.66, st, c);
        ball(g, -P.bw * 0.46, P.by + P.bh * 0.32 - bob, P.bw * 0.52, P.bh * 0.66, c); ball(g, P.bw * 0.46, P.by + P.bh * 0.32 - bob, P.bw * 0.52, P.bh * 0.66, c);
        if (deco) deco(g, st, bob, c);
        tail(g, st, bob, c);
        g.restore();
    }
    const eye2 = (g, x, y, rx, ry, col, pup, lk) => { ell(g, x, y, rx, ry, col, OUT, 0.5); ell(g, x + lk, y + 0.1, rx * 0.4, ry * 0.8, pup); };

    /* LOBO */
    const P_WOLF = { hs: 1.12, bw: 8, bh: 8.2, by: -15, hy: -21.5, lx: 4.5, lw: 3.8, top: -10, lift: 4, bob: 1.2, tn: 1.6 };
    function wolfFace(g, hx, hy, st, c) {
        const cd = shade(c, -0.38), cl = st.c2, atk = st.atk, lk = (st.turn || 0) * 0.9;
        tri(g, hx - 6, hy - 3, hx - 7.2, hy - 12.4, hx - 1.4, hy - 5.4, cd, OUT, 1); tri(g, hx + 6, hy - 3, hx + 7.2, hy - 12.4, hx + 1.4, hy - 5.4, c, OUT, 1);
        tri(g, hx - 5.2, hy - 4.6, hx - 6.2, hy - 10, hx - 2.6, hy - 5.6, '#caa9a0'); tri(g, hx + 5.2, hy - 4.6, hx + 6.2, hy - 10, hx + 2.6, hy - 5.6, '#caa9a0');
        tri(g, hx - 6.8, hy + 1, hx - 10.4, hy + 4.4, hx - 5, hy + 5.4, c, OUT, 0.9); tri(g, hx + 6.8, hy + 1, hx + 10.4, hy + 4.4, hx + 5, hy + 5.4, c, OUT, 0.9);
        ball(g, hx, hy, 7, 6.2, c);
        g.strokeStyle = alpha(cd, 0.6); g.lineWidth = 1; g.beginPath(); g.moveTo(hx, hy - 6); g.lineTo(hx, hy - 2.5); g.stroke();
        ell(g, hx, hy + 3.2, 3.9, 3.4, cl, OUT, 0.9);
        if (atk > 0.12) { ell(g, hx, hy + 4.6 + atk * 1.2, 2.5, 0.8 + atk * 2.4, '#5a0f14'); tri(g, hx - 2.2, hy + 4, hx - 1, hy + 4, hx - 1.6, hy + 6, '#fff'); tri(g, hx + 1, hy + 4, hx + 2.2, hy + 4, hx + 1.6, hy + 6, '#fff'); }
        else { g.strokeStyle = '#3a2020'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(hx, hy + 2.4); g.lineTo(hx, hy + 4.2); g.moveTo(hx - 2, hy + 5); g.quadraticCurveTo(hx, hy + 6, hx + 2, hy + 5); g.stroke(); }
        ell(g, hx, hy + 1.8, 1.8, 1.3, '#16161a', OUT, 0.5);
        eye2(g, hx - 3.2, hy - 1.4, 1.7, 1.2, '#ffd23f', '#111', lk); eye2(g, hx + 3.2, hy - 1.4, 1.7, 1.2, '#ffd23f', '#111', lk);
        g.strokeStyle = cd; g.lineWidth = 1; g.beginPath(); g.moveTo(hx - 5, hy - 3.2); g.lineTo(hx - 1.6, hy - 2); g.moveTo(hx + 5, hy - 3.2); g.lineTo(hx + 1.6, hy - 2); g.stroke();
    }
    function wolfDeco(g, st, bob, c) { ell(g, 0, -11.5 - bob, 3.8, 5.2, st.c2, null); g.strokeStyle = alpha(shade(c, -0.4), 0.45); g.lineWidth = 1; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * 4.2, -21 - bob); g.lineTo(i * 4.8, -15 - bob); g.stroke(); } }
    function wolfNape(g, hx, hy, st, c) { const cd = shade(c, -0.38); tri(g, hx - 5.4, hy - 1, hx - 6.6, hy - 9.4, hx - 1, hy - 3, cd, OUT, 1); tri(g, hx + 5.4, hy - 1, hx + 6.6, hy - 9.4, hx + 1, hy - 3, c, OUT, 1); ball(g, hx, hy + 1, 5.6, 4.8, c); }
    function wolfTail(g, st, bob, c) { const w = sin(st.t * (5 + st.mv * 6) + st.seed) * 2.6 + st.atk * 1.5; limb(g, 0, -16 - bob, w, -5, 5.6, c); ell(g, w * 1.05, -3.8, 2.2, 3, shade(c, -0.5), OUT, 0.9); g.strokeStyle = alpha(shade(c, -0.4), 0.5); g.lineWidth = 0.9; g.beginPath(); g.moveTo(-1, -14 - bob); g.lineTo(w - 1, -7); g.stroke(); }
    S.wolf.v = { side: S.wolf.draw, front: (g, st) => quadFront(g, st, P_WOLF, st.c1, wolfFace, wolfDeco), back: (g, st) => quadBack(g, st, P_WOLF, st.c1, wolfNape, wolfTail) };

    /* JAVALI */
    const P_BOAR = { hs: 1.1, bw: 9.6, bh: 8.6, by: -15.5, hy: -14.5, lx: 6, lw: 4.6, top: -9, lift: 3, bob: 1.1, tn: 1.6, legc: null, hoof: '#241a12' };
    function boarFace(g, hx, hy, st, c) {
        const cd = shade(c, -0.4), lk = (st.turn || 0) * 0.8, atk = st.atk;
        tri(g, hx - 7, hy - 3, hx - 9.4, hy - 10, hx - 2.4, hy - 6.2, cd, OUT, 1); tri(g, hx + 7, hy - 3, hx + 9.4, hy - 10, hx + 2.4, hy - 6.2, cd, OUT, 1);
        g.fillStyle = shade(cd, -0.2); for (let i = 0; i < 5; i++) tri(g, hx - 5 + i * 2.5, hy - 8, hx - 4 + i * 2.5, hy - 12 - (i % 2) * 1.6, hx - 2.8 + i * 2.5, hy - 8, shade(cd, -0.2), null);
        ball(g, hx, hy, 8.6, 7.6, c);
        ell(g, hx, hy + 3.4, 5.2, 3.8, '#d59a8c', OUT, 1); ell(g, hx - 1.6, hy + 3.6, 0.9, 1.2, '#3a1a16'); ell(g, hx + 1.6, hy + 3.6, 0.9, 1.2, '#3a1a16');
        const o = atk * 1.4; tri(g, hx - 5.6, hy + 4.4, hx - 7.4, hy + 7.6 + o, hx - 3.6, hy + 5.6, c2tusk(st), OUT, 0.8); tri(g, hx + 5.6, hy + 4.4, hx + 7.4, hy + 7.6 + o, hx + 3.6, hy + 5.6, c2tusk(st), OUT, 0.8);
        eye2(g, hx - 4.2, hy - 1.6, 1.5, 1.4, '#ffb03a', '#111', lk); eye2(g, hx + 4.2, hy - 1.6, 1.5, 1.4, '#ffb03a', '#111', lk);
        g.strokeStyle = cd; g.lineWidth = 1.2; g.beginPath(); g.moveTo(hx - 6.4, hy - 3.6); g.lineTo(hx - 2.6, hy - 2.2); g.moveTo(hx + 6.4, hy - 3.6); g.lineTo(hx + 2.6, hy - 2.2); g.stroke();
    }
    const c2tusk = st => st.c2;
    function boarDeco(g, st, bob, c) { g.fillStyle = shade(c, -0.55); for (let i = 0; i < 7; i++) tri(g, -9 + i * 3, -22.5 - bob - (i % 2) * 0.6, -7.6 + i * 3, -26 - bob - (i % 3), -6 + i * 3, -22.5 - bob, shade(c, -0.55), null); }
    function boarNape(g, hx, hy, st, c) { const cd = shade(c, -0.4); tri(g, hx - 6, hy - 1, hx - 8, hy - 7, hx - 1.4, hy - 3, cd, OUT, 1); tri(g, hx + 6, hy - 1, hx + 8, hy - 7, hx + 1.4, hy - 3, cd, OUT, 1); ball(g, hx, hy + 1.4, 6.4, 5, c); for (let i = 0; i < 5; i++) tri(g, hx - 5 + i * 2.5, hy - 2, hx - 4 + i * 2.5, hy - 6 - (i % 2) * 1.4, hx - 2.8 + i * 2.5, hy - 2, shade(c, -0.55), null); }
    function boarTail(g, st, bob, c) { g.strokeStyle = OUT; g.lineWidth = 2.6; g.lineCap = 'round'; const w = sin(st.t * 4) * 1.2; g.beginPath(); g.moveTo(0, -17 - bob); g.quadraticCurveTo(3 + w, -21 - bob, 1, -23 - bob); g.stroke(); g.strokeStyle = shade(c, -0.4); g.lineWidth = 1.2; g.stroke(); }
    S.boar.v = { side: S.boar.draw, front: (g, st) => quadFront(g, st, P_BOAR, st.c1, boarFace, boarDeco), back: (g, st) => quadBack(g, st, P_BOAR, st.c1, boarNape, boarTail, boarDeco) };

    /* RATO */
    const P_RAT = { hs: 1.1, bw: 5.6, bh: 4.8, by: -7, hy: -8.2, lx: 2.6, lw: 2.2, top: -4, lift: 2, bob: 0.8, tn: 1.2, hoof: '#c9a090' };
    function ratFace(g, hx, hy, st, c) {
        const cd = shade(c, -0.3), lk = (st.turn || 0) * 0.5;
        ell(g, hx - 4.6, hy - 3.6, 3, 3.4, c, OUT, 0.9); ell(g, hx - 4.6, hy - 3.6, 1.8, 2.1, '#f5b5bd'); ell(g, hx + 4.6, hy - 3.6, 3, 3.4, c, OUT, 0.9); ell(g, hx + 4.6, hy - 3.6, 1.8, 2.1, '#f5b5bd');
        ball(g, hx, hy, 4.8, 4.2, c, 1); tri(g, hx - 2.6, hy + 1, hx + 2.6, hy + 1, hx, hy + 5, shade(c, 0.1), OUT, 0.9); ell(g, hx, hy + 4.6, 1, 0.8, '#ff8da0');
        ell(g, hx - 2.2, hy - 1, 1, 1.1, '#111'); ell(g, hx + 2.2, hy - 1, 1, 1.1, '#111'); ell(g, hx - 2.2 + lk * 0.3, hy - 1.3, 0.3, 0.3, '#fff'); 
        g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 0.5; for (let i = -1; i <= 1; i += 2) for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(hx + i * 2, hy + 3 + k * 0.6); g.lineTo(hx + i * 7, hy + 3 + k * 1.8); g.stroke(); }
        if (st.atk > 0.1) { tri(g, hx - 1.4, hy + 4.4, hx - 0.4, hy + 4.4, hx - 0.9, hy + 6.2, '#fff'); tri(g, hx + 0.4, hy + 4.4, hx + 1.4, hy + 4.4, hx + 0.9, hy + 6.2, '#fff'); }
    }
    function ratNape(g, hx, hy, st, c) { ell(g, hx - 3.4, hy - 1.6, 2.6, 3, c, OUT, 0.9); ell(g, hx - 3.4, hy - 1.6, 1.4, 1.8, '#f5b5bd'); ell(g, hx + 3.4, hy - 1.6, 2.6, 3, c, OUT, 0.9); ell(g, hx + 3.4, hy - 1.6, 1.4, 1.8, '#f5b5bd'); ball(g, hx, hy + 1.6, 4, 3.2, c, 1); }
    function ratTail(g, st, bob, c) { g.lineCap = 'round'; g.strokeStyle = OUT; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -5 - bob); g.bezierCurveTo(-5, -2, 5 + sin(st.t * 4) * 2, -0.5, 1, 1); g.stroke(); g.strokeStyle = st.c2; g.lineWidth = 1.4; g.stroke(); }
    S.rat.v = { side: S.rat.draw, front: (g, st) => quadFront(g, st, P_RAT, st.c1, ratFace, null), back: (g, st) => quadBack(g, st, P_RAT, st.c1, ratNape, ratTail, null) };

    /* VACA */
    const P_COW = { hs: 1.16, bw: 11.2, bh: 10.4, by: -21, hy: -22, lx: 6.6, lw: 5.2, top: -12, lift: 2.5, bob: 0.9, tn: 1.8, hoof: '#4a4038' };
    function cowFace(g, hx, hy, st, c) {
        const cd = shade(c, -0.22), lk = (st.turn || 0) * 0.8, ch = sin(st.t * 6) * 0.5, c2 = st.c2;
        tri(g, hx - 6.4, hy - 6, hx - 10.6, hy - 11.6, hx - 4, hy - 8.6, '#f7f1e6', OUT, 0.9); tri(g, hx + 6.4, hy - 6, hx + 10.6, hy - 11.6, hx + 4, hy - 8.6, '#f7f1e6', OUT, 0.9);
        ell(g, hx - 9, hy - 2.4, 4.2, 2.3, c, OUT, 0.9, -0.3); ell(g, hx + 9, hy - 2.4, 4.2, 2.3, c, OUT, 0.9, 0.3);
        ball(g, hx, hy, 7.4, 8, c, 1.1); ell(g, hx - 3, hy - 4.6, 3.4, 2.8, c2, null); ell(g, hx, hy - 7.2, 3.6, 1.8, '#f7f1e6', OUT, 0.7);
        ell(g, hx, hy + 4.6, 5.2, 3.6 + ch * 0.2, '#f6b3b3', OUT, 1); ell(g, hx - 1.8, hy + 4.4, 0.9, 1.1, '#7a3a3a'); ell(g, hx + 1.8, hy + 4.4, 0.9, 1.1, '#7a3a3a');
        eye2(g, hx - 4, hy - 1.2, 1.5, 1.5, '#fff', '#111', lk); eye2(g, hx + 4, hy - 1.2, 1.5, 1.5, '#fff', '#111', lk);
    }
    function cowDeco(g, st, bob, c) { ell(g, -4.4, -26 - bob, 3.6, 2.8, st.c2, null); ell(g, 5, -22 - bob, 3, 3.6, st.c2, null); }
    function cowNape(g, hx, hy, st, c) { tri(g, hx - 5, hy - 1, hx - 9.6, hy - 6, hx - 2.4, hy - 3.6, '#f7f1e6', OUT, 0.9); tri(g, hx + 5, hy - 1, hx + 9.6, hy - 6, hx + 2.4, hy - 3.6, '#f7f1e6', OUT, 0.9); ell(g, hx - 7, hy + 1, 3.6, 2, c, OUT, 0.9, -0.3); ell(g, hx + 7, hy + 1, 3.6, 2, c, OUT, 0.9, 0.3); ball(g, hx, hy + 2, 6, 4.6, c); ell(g, hx + 1, hy + 1, 3, 2, st.c2, null); }
    function cowBackDeco(g, st, bob, c) { ell(g, -5, -23 - bob, 3.8, 3.4, st.c2, null); ell(g, 6, -16 - bob, 3, 3.6, st.c2, null); ell(g, 0, -9 - bob, 2.8, 1.8, '#f3a6a6', OUT, 0.7); }
    function cowTail(g, st, bob, c) { const w = sin(st.t * 3 + st.seed) * 1.8; g.lineCap = 'round'; g.strokeStyle = OUT; g.lineWidth = 2.4; g.beginPath(); g.moveTo(0, -27 - bob); g.quadraticCurveTo(w * 1.4, -20, w, -11); g.stroke(); g.strokeStyle = c; g.lineWidth = 1.1; g.stroke(); ell(g, w, -9.4, 2, 3.2, st.c2, OUT, 0.7); }
    S.cow.v = { side: S.cow.draw, front: (g, st) => quadFront(g, st, P_COW, st.c1, cowFace, cowDeco), back: (g, st) => quadBack(g, st, P_COW, st.c1, cowNape, cowTail, cowBackDeco) };

    /* OVELHA */
    const P_SHEEP = { bw: 11.4, bh: 10.4, by: -19.5, hy: -16.5, lx: 4.4, lw: 3, top: -10, lift: 2, bob: 0.8, tn: 1.6, hoof: '#2b2b2e' };
    function woolPuffs(g, st, bob, c, back) {
        const cl = c; const w = [[-8, -24, 5.4], [0, -27, 6.4], [8, -24, 5.4], [-10, -17, 5.2], [10, -17, 5.2], [-5, -12.4, 5], [5, -12.4, 5]];
        for (let i = 0; i < w.length; i++) ball(g, w[i][0], w[i][1] - bob + sin(st.t * 2 + i) * 0.25, w[i][2], w[i][2] * 0.9, cl, 0.9);
    }
    function sheepFace(g, hx, hy, st, c) {
        const c2 = st.c2, lk = (st.turn || 0) * 0.8;
        ell(g, hx - 6.6, hy - 1.4, 3.6, 1.9, c2, OUT, 0.8, 0.35); ell(g, hx + 6.6, hy - 1.4, 3.6, 1.9, c2, OUT, 0.8, -0.35);
        ball(g, hx, hy - 5.4, 5.6, 3.4, c, 0.9);
        ball(g, hx, hy, 4.8, 5.8, c2, 1);
        eye2(g, hx - 2.4, hy - 1.2, 1.3, 1.3, '#f3f3f3', '#111', lk); eye2(g, hx + 2.4, hy - 1.2, 1.3, 1.3, '#f3f3f3', '#111', lk);
        ell(g, hx, hy + 3, 2.4, 1.6, shade(c2, 0.2), null); ell(g, hx - 0.8, hy + 3, 0.5, 0.5, '#111'); ell(g, hx + 0.8, hy + 3, 0.5, 0.5, '#111');
    }
    function sheepBody(g, st, bob, c) { }
    function sheepFront(g, st) {
        const bob = abs(sin(st.ph)) * st.mv * 0.8, sway = sin(st.ph) * st.mv * 0.6; g.save(); g.translate(sway, 0);
        fourLegs(g, st, P_SHEEP, 'front', bob, st.c2, '#2b2b2e'); woolPuffs(g, st, bob, st.c1); sheepFace(g, (st.turn || 0) * 1.6, -16.5 - bob + sin(st.t * 2.4 + st.seed) * 0.4, st, st.c1); g.restore();
    }
    function sheepBack(g, st) {
        const bob = abs(sin(st.ph)) * st.mv * 0.8, sway = sin(st.ph) * st.mv * 0.6; g.save(); g.translate(sway, 0);
        fourLegs(g, st, P_SHEEP, 'rear', bob, st.c2, '#2b2b2e'); ball(g, 0, -19 - bob, 10, 8.6, st.c1, 0.9); ell(g, (st.turn || 0), -26 - bob, 4.4, 3.4, st.c2, OUT, 0.9); woolPuffs(g, st, bob, st.c1); ball(g, 0, -15 - bob, 3, 2.6, st.c1, 0.8); g.restore();
    }
    S.sheep.v = { side: S.sheep.draw, front: sheepFront, back: sheepBack };

    /* PORCO */
    const P_PIG = { hs: 1.1, bw: 10, bh: 8.8, by: -14.5, hy: -15.5, lx: 6, lw: 4.4, top: -9, lift: 2, bob: 1, tn: 1.6, legc: null, hoof: '#8a4a4a' };
    function pigFace(g, hx, hy, st, c) {
        const c2 = st.c2, lk = (st.turn || 0) * 0.8;
        tri(g, hx - 6.4, hy - 3.4, hx - 8.6, hy - 10, hx - 1.6, hy - 6, c2, OUT, 0.9); tri(g, hx + 6.4, hy - 3.4, hx + 8.6, hy - 10, hx + 1.6, hy - 6, c2, OUT, 0.9);
        ball(g, hx, hy, 8, 7.2, c, 1.1);
        ell(g, hx, hy + 2.8, 4.4, 3.4, c2, OUT, 1); ell(g, hx - 1.6, hy + 2.8, 0.8, 1.2, '#5a2020'); ell(g, hx + 1.6, hy + 2.8, 0.8, 1.2, '#5a2020');
        eye2(g, hx - 4.2, hy - 1.6, 1.3, 1.3, '#fff', '#111', lk); eye2(g, hx + 4.2, hy - 1.6, 1.3, 1.3, '#fff', '#111', lk);
    }
    function pigDeco(g, st, bob, c) { ell(g, 0, -10.5 - bob, 6, 3, alpha(st.c2, 0.35), null); }
    function pigNape(g, hx, hy, st, c) { tri(g, hx - 6, hy, hx - 8.4, hy - 6.6, hx - 1.6, hy - 3, st.c2, OUT, 0.9); tri(g, hx + 6, hy, hx + 8.4, hy - 6.6, hx + 1.6, hy - 3, st.c2, OUT, 0.9); ball(g, hx, hy + 1.6, 6.6, 5, c); }
    function pigTail(g, st, bob, c) { g.lineCap = 'round'; g.lineJoin = 'round'; const w = sin(st.t * 4 + st.seed) * 0.8; g.strokeStyle = OUT; g.lineWidth = 2.8; g.beginPath(); g.moveTo(0, -17 - bob); g.bezierCurveTo(4 + w, -20, -2, -23, 2 + w, -25 - bob); g.stroke(); g.strokeStyle = st.c2; g.lineWidth = 1.3; g.stroke(); }
    S.pig.v = { side: S.pig.draw, front: (g, st) => quadFront(g, st, P_PIG, st.c1, pigFace, pigDeco), back: (g, st) => quadBack(g, st, P_PIG, st.c1, pigNape, pigTail, pigDeco) };

    /* CERVO (pernas e pescoço longos) */
    const P_DEER = { bw: 5.6, bh: 8.4, by: -33, hy: -47, lx: 3.4, lw: 2.8, top: -26, lift: 6, bob: 2, tn: 1.4, hoof: '#2a1c12' };
    function deerFace(g, hx, hy, st, c) {
        const c2 = st.c2, lk = (st.turn || 0) * 0.6, alertH = sin(st.t * 1.5 + st.seed * 3) > 0.7 ? -1.4 : 0; hy += alertH;
        limb(g, hx * 0.4, -36 - abs(sin(st.ph)) * st.mv * 2, hx, hy + 3, 5.4, c);
        g.strokeStyle = '#5a3d27'; g.lineWidth = 1.7; g.lineCap = 'round';
        for (let s = -1; s <= 1; s += 2) { g.beginPath(); g.moveTo(hx + s * 2.6, hy - 4.4); g.lineTo(hx + s * 5, hy - 12); g.moveTo(hx + s * 3.8, hy - 8.4); g.lineTo(hx + s * 7.6, hy - 10.8); g.moveTo(hx + s * 4.4, hy - 10.4); g.lineTo(hx + s * 3, hy - 14.6); g.stroke(); }
        ell(g, hx - 6.6, hy - 2.4, 4.2, 2, c, OUT, 0.9, -0.5); ell(g, hx - 6.6, hy - 2.4, 2.6, 1, '#e9c9a8', null, 0, -0.5); ell(g, hx + 6.6, hy - 2.4, 4.2, 2, c, OUT, 0.9, 0.5); ell(g, hx + 6.6, hy - 2.4, 2.6, 1, '#e9c9a8', null, 0, 0.5);
        ball(g, hx, hy, 4.6, 5.2, c, 1); ell(g, hx, hy + 3.4, 2.7, 2.6, c2, OUT, 0.8); ell(g, hx, hy + 4.6, 1.3, 0.9, '#111');
        eye2(g, hx - 2.8, hy - 1.2, 1.2, 1.3, '#fff', '#111', lk); eye2(g, hx + 2.8, hy - 1.2, 1.2, 1.3, '#fff', '#111', lk);
    }
    function deerDeco(g, st, bob, c) { g.fillStyle = 'rgba(255,255,255,0.75)'; [[-3, -37], [2, -35], [-1, -30], [3.4, -28], [-3.6, -26]].forEach(p => ell(g, p[0], p[1] - bob, 1.1, 1, 'rgba(255,255,255,0.75)')); ell(g, 0, -27 - bob, 3.2, 4.2, alpha(st.c2, 0.6), null); }
    function deerNape(g, hx, hy, st, c) {
        g.strokeStyle = '#5a3d27'; g.lineWidth = 1.7; g.lineCap = 'round'; for (let s = -1; s <= 1; s += 2) { g.beginPath(); g.moveTo(hx + s * 2.4, hy - 1); g.lineTo(hx + s * 5, hy - 8); g.moveTo(hx + s * 3.6, hy - 5); g.lineTo(hx + s * 7.6, hy - 7); g.stroke(); }
        ell(g, hx - 5.6, hy + 0.6, 3.8, 1.9, c, OUT, 0.9, -0.5); ell(g, hx + 5.6, hy + 0.6, 3.8, 1.9, c, OUT, 0.9, 0.5); ball(g, hx, hy + 2.4, 4.2, 4.2, c, 1);
    }
    function deerTail(g, st, bob, c) { const w = sin(st.t * 3 + st.seed) * 0.6; ell(g, 0, -22 - bob, 4.8, 5.4, '#fdf6ea', OUT, 0.9); ell(g, w, -20 - bob, 2.2, 3.2, '#fff', null); }
    S.deer.v = { side: S.deer.draw, front: (g, st) => quadFront(g, st, P_DEER, st.c1, deerFace, deerDeco), back: (g, st) => quadBack(g, st, P_DEER, st.c1, deerNape, deerTail, null) };

    /* GALINHA */
    function chickenFront(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const hop = abs(sin(ph * 1.6)) * mv * 1.4, peck = max(0, sin(t * 2.1 + st.seed * 3) - 0.55) * (1 - mv) * 4, lk = (st.turn || 0), sway = sin(ph * 1.6) * mv * 0.8;
        g.save(); g.translate(sway, 0);
        for (let i = -1; i <= 1; i += 2) { const s = max(0, sin(ph * 1.6 + (i > 0 ? 0 : PI))) * mv * 2.4; limb(g, i * 2.4, -6 - hop, i * 2.4, -0.5 - s, 1.4, '#e8a13a'); tri(g, i * 2.4 - 2.4, -s, i * 2.4 + 2.4, -s, i * 2.4, -2.4 - s, '#e8a13a', OUT, 0.5); }
        for (let s = -1; s <= 1; s += 2) { g.save(); g.translate(s * 6.2, -11 - hop); g.rotate(s * (0.28 + sin(t * (mv > 0.3 ? 18 : 1.6) + st.seed) * 0.08)); ell(g, 0, 0, 2.8, 5.4, shade(c1, -0.14), OUT, 0.8); g.restore(); }
        ball(g, 0, -9.4 - hop, 6.2, 6.2, c1, 1); ell(g, 0, -7 - hop, 3.4, 3.4, alpha('#ffffff', 0.7));
        const hx = lk * 1.4, hy = -17.5 - hop + peck;
        ball(g, hx, hy, 3.8, 4.1, c1, 0.9); for (let i = 0; i < 3; i++) ell(g, hx - 1.4 + i * 1.4, hy - 4.4 - (i === 1 ? 0.8 : 0), 1.2, 1.4, c2, OUT, 0.5);
        tri(g, hx - 1.4, hy + 0.6, hx + 1.4, hy + 0.6, hx, hy + 4 + atk, '#f0a53a', OUT, 0.6); ell(g, hx, hy + 4.4, 1, 1.5, c2, OUT, 0.4);
        ell(g, hx - 2.2, hy - 0.8, 0.9, 0.9, '#111'); ell(g, hx + 2.2, hy - 0.8, 0.9, 0.9, '#111'); ell(g, hx - 2.2 + lk * 0.3, hy - 1.1, 0.3, 0.3, '#fff');
        g.restore();
    }
    function chickenBack(g, st) {
        const { t, mv, ph, c1, c2 } = st; const hop = abs(sin(ph * 1.6)) * mv * 1.4, sway = sin(ph * 1.6) * mv * 0.8; g.save(); g.translate(sway, 0);
        for (let i = -1; i <= 1; i += 2) { const s = max(0, sin(ph * 1.6 + (i > 0 ? 0 : PI))) * mv * 2.4; limb(g, i * 2.4, -6 - hop, i * 2.4, -0.5 - s, 1.4, '#e8a13a'); tri(g, i * 2.4 - 2.4, -s, i * 2.4 + 2.4, -s, i * 2.4, -2.4 - s, '#e8a13a', OUT, 0.5); }
        ball(g, (st.turn || 0) * 0.8, -17 - hop, 3.6, 3.6, c1, 0.9); for (let i = 0; i < 3; i++) ell(g, (st.turn || 0) * 0.8 - 1.2 + i * 1.2, -20.6 - hop, 1, 1.2, c2, OUT, 0.5);
        for (let i = -2; i <= 2; i++) { g.save(); g.translate(i * 1.4, -12 - hop); g.rotate(i * 0.22 + sin(t * 3 + i) * 0.04); ell(g, 0, -4.4, 1.9, 5, i % 2 ? shade(c1, -0.2) : shade(c1, -0.1), OUT, 0.7); g.restore(); }
        ball(g, 0, -9 - hop, 6.2, 6, c1, 1);
        for (let s = -1; s <= 1; s += 2) { g.save(); g.translate(s * 5.2, -11 - hop); g.rotate(s * 0.12); ell(g, 0, 0, 2.6, 5.2, shade(c1, -0.16), OUT, 0.8); g.restore(); }
        g.restore();
    }
    S.chicken.v = { side: S.chicken.draw, front: chickenFront, back: chickenBack };

    /* COELHO */
    function rabbitFront(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const jump = abs(sin(ph * 0.7)) * mv * 9, nib = sin(t * 9 + st.seed) * 0.5 * (1 - mv), lk = (st.turn || 0), y = -jump;
        ell(g, -5.6, -1.4 + y * 0.6, 2.6, 1.4, c2, OUT, 0.7); ell(g, 5.6, -1.4 + y * 0.6, 2.6, 1.4, c2, OUT, 0.7);
        ball(g, 0, -7 + y, 6.8, 6, c1, 1); ell(g, 0, -5.4 + y, 3.4, 3.6, alpha(c2, 0.55), null);
        const ea = sin(t * 1.3 + st.seed) * 0.12 + (mv > 0.3 ? -0.25 : 0), hx = lk * 1.2, hy = -13.6 + y + nib;
        for (let s = -1; s <= 1; s += 2) { g.save(); g.translate(hx + s * 2.6, hy - 2.6); g.rotate(s * (0.18 + ea)); ell(g, 0, -6, 2, 6.6, c1, OUT, 0.8); ell(g, 0, -6, 0.9, 4.8, '#f5b5bd'); g.restore(); }
        ball(g, hx, hy, 4.6, 4.2, c1, 0.9); ell(g, hx, hy + 1.8, 2, 1.6, shade(c1, 0.22), null); ell(g, hx, hy + 1.4, 0.9, 0.7, '#ff8da0');
        ell(g, hx - 2.4, hy - 0.8, 1, 1.1, '#111'); ell(g, hx + 2.4, hy - 0.8, 1, 1.1, '#111'); ell(g, hx - 2.4 + lk * 0.3, hy - 1.1, 0.3, 0.3, '#fff');
        g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(hx - 1.4, hy + 2); g.lineTo(hx - 6, hy + 1.4); g.moveTo(hx + 1.4, hy + 2); g.lineTo(hx + 6, hy + 1.4); g.stroke();
    }
    function rabbitBack(g, st) {
        const { t, mv, ph, c1, c2 } = st; const jump = abs(sin(ph * 0.7)) * mv * 9, y = -jump, lk = (st.turn || 0), ea = sin(t * 1.3 + st.seed) * 0.12 + (mv > 0.3 ? -0.25 : 0);
        ell(g, -4.6, -1.6 + y * 0.6, 2.8, 1.5, shade(c1, -0.15), OUT, 0.7); ell(g, 4.6, -1.6 + y * 0.6, 2.8, 1.5, shade(c1, -0.15), OUT, 0.7);
        ball(g, 0, -7 + y, 6.8, 6, c1, 1);
        for (let s = -1; s <= 1; s += 2) { g.save(); g.translate(lk * 0.8 + s * 2.6, -13.6 + y); g.rotate(s * (0.18 + ea)); ell(g, 0, -6, 2, 6.6, c1, OUT, 0.8); g.restore(); }
        ball(g, lk * 0.8, -13 + y, 4, 3.4, c1, 0.9);
        ball(g, -3.2, -4 + y, 3.4, 3.6, c1, 0.9); ball(g, 3.2, -4 + y, 3.4, 3.6, c1, 0.9); ball(g, 0, -4.6 + y, 3, 3, c2, 0.9);
    }
    S.rabbit.v = { side: S.rabbit.draw, front: rabbitFront, back: rabbitBack };

    /* ---------- aranha: de frente (olhos e presas) e de costas (abdômen grande) ---------- */
    function spiderLegs(g, st, c1, back, bob) {
        const { t, mv, ph } = st;
        for (let k = 0; k < 2; k++) {   // k=0 lado oposto (escuro), k=1 lado próximo
            for (let s = -1; s <= 1; s += 2) for (let i = 0; i < 4; i++) {
                const q = ph * 1.4 + i * 1.7 + (s > 0 ? PI : 0), lift = max(0, cos(q)) * mv * 3, d = sin(q) * mv * 2.4;
                const reach = 12 + i * 3.2 + (i === 0 ? -3 : 0), fx = s * reach + d * s, fy = -lift - (i === 0 && !back ? -1 : 0.6), kx = s * (6 + i * 2.6), ky = -22 - (i === 1 || i === 2 ? 4 : 0) + sin(t * 2 + i + k) * 0.4;
                const by = (back ? -13 : -12) - bob + (i - 1.5) * 0.4, bx = s * (3.4 + (i - 1.5) * 0.4);
                if ((k === 0) !== (i % 2 === 0)) continue;   // alterna: pares/ímpares em duas passadas (ordem de profundidade)
                g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = OUT; g.lineWidth = 3.6; g.beginPath(); g.moveTo(bx, by); g.lineTo(kx, ky); g.lineTo(fx, fy); g.stroke();
                g.strokeStyle = k === 0 ? shade(c1, -0.3) : shade(c1, 0.1); g.lineWidth = 2; g.stroke();
            }
        }
    }
    function spiderFront(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const bob = abs(sin(ph * 2)) * mv * 0.8, lk = (st.turn || 0) * 0.8;
        spiderLegs(g, st, c1, false, bob);
        ball(g, 0, -19 - bob, 8.4, 7.4, c1, 1.3); g.fillStyle = c2; g.beginPath(); g.moveTo(0, -24 - bob); g.lineTo(2.2, -19.4 - bob); g.lineTo(0, -15 - bob); g.lineTo(-2.2, -19.4 - bob); g.closePath(); g.fill();
        ball(g, 0, -11.5 - bob, 7, 6, c1, 1.2);
        for (let s = -1; s <= 1; s += 2) { ell(g, s * 2.8 + lk, -14.6 - bob, 2, 2, '#ff2b2b', '#400', 0.6); ell(g, s * 5.2 + lk * 0.8, -12.6 - bob, 1.1, 1.1, '#ff2b2b', '#400', 0.4); ell(g, s * 1.2 + lk, -17 - bob, 0.9, 0.9, '#d33'); }
        const f = atk * 2.4; for (let s = -1; s <= 1; s += 2) { limb(g, s * 5.2, -8 - bob, s * 5, -4 - bob - f * 0.3, 2.6, shade(c1, -0.2)); tri(g, s * 5.2 - 1.2, -5 - bob, s * 5.2 + 1.2, -5 - bob, s * 4.4, -1.4 - bob - f, '#eee', OUT, 0.7); }
        ell(g, 0, -8.4 - bob, 2, 1.2, '#2a1020', null);
    }
    function spiderBack(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const bob = abs(sin(ph * 2)) * mv * 0.8;
        spiderLegs(g, st, c1, true, bob);
        ball(g, 0, -9 - bob, 6, 5, c1, 1.2);
        ball(g, 0, -17 - bob, 10, 10.4, c1, 1.4);
        g.fillStyle = c2; g.beginPath(); g.moveTo(0, -25 - bob); g.lineTo(3.2, -18 - bob); g.lineTo(0, -10.5 - bob); g.lineTo(-3.2, -18 - bob); g.closePath(); g.fill();
        g.strokeStyle = alpha(shade(c1, -0.5), 0.6); g.lineWidth = 1; for (let i = -1; i <= 1; i += 2) { g.beginPath(); g.moveTo(i * 4, -24 - bob); g.quadraticCurveTo(i * 8, -17 - bob, i * 4, -10 - bob); g.stroke(); }
        ell(g, 0, -8.4 - bob + sin(t * 3) * 0.3, 2.6, 2.2, shade(c1, -0.35), OUT, 0.8);
    }
    S.spider.home = 'side'; S.spider.v = { side: S.spider.draw, front: spiderFront, back: spiderBack };

    /* ---------- cobra: de frente (capelo aberto) e de costas (rabo enrolado + capelo com "olhos") ---------- */
    function snakeFront(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const lk = (st.turn || 0) * 1.4, sw = sin(t * 2 + st.seed) * 1.2, raise = atk * 3, wig = sin(ph * 2) * mv * 1.2;
        const ring = (y, rx, ry, col, x) => { ell(g, x, y, rx + 1, ry + 1, OUT); ell(g, x, y, rx, ry, col); ell(g, x - rx * 0.2, y - ry * 0.3, rx * 0.5, ry * 0.3, alpha(shade(col, 0.45), 0.5)); };
        ring(-2.4, 11, 3.6, shade(c1, -0.15), wig); ring(-5.6, 9, 3.4, c1, -wig); g.save(); g.translate(0, 0);
        ring(-9, 7, 3.2, shade(c1, 0.04), wig * 0.5); ell(g, 0, -6.4, 3.6, 1.2, alpha(c2, 0.75), null);
        // pescoço + capelo
        limb(g, 0, -10, sw * 0.5, -17 - raise, 7, c1);
        ball(g, sw * 0.5 + lk * 0.5, -21 - raise, 8.6, 8, c1, 1.3); ell(g, sw * 0.5 + lk * 0.5, -17.6 - raise, 4.2, 5.4, alpha(c2, 0.85), null);
        g.strokeStyle = alpha(shade(c1, -0.5), 0.6); g.lineWidth = 0.8; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(sw * 0.5 + lk * 0.5 + i * 2.2, -22 - raise); g.lineTo(sw * 0.5 + lk * 0.5 + i * 2.6, -14 - raise); g.stroke(); }
        const hx = sw * 0.5 + lk, hy = -23.4 - raise;
        ball(g, hx, hy, 5.2, 4.6, shade(c1, 0.1), 1.1); eye2(g, hx - 2.4, hy - 0.6, 1.3, 1.5, '#ffe23a', '#111', lk * 0.3); eye2(g, hx + 2.4, hy - 0.6, 1.3, 1.5, '#ffe23a', '#111', lk * 0.3);
        if (sin(t * 5 + st.seed) > 0.3 || atk > 0.2) { g.strokeStyle = '#d61f3a'; g.lineWidth = 1; g.beginPath(); g.moveTo(hx, hy + 3.4); g.lineTo(hx, hy + 8); g.lineTo(hx - 1.4, hy + 10); g.moveTo(hx, hy + 8); g.lineTo(hx + 1.4, hy + 10); g.stroke(); }
        if (atk > 0.1) { tri(g, hx - 1.6, hy + 3.4, hx - 0.6, hy + 3.4, hx - 1.1, hy + 6.4, '#fff'); tri(g, hx + 0.6, hy + 3.4, hx + 1.6, hy + 3.4, hx + 1.1, hy + 6.4, '#fff'); }
        g.restore();
    }
    function snakeBack(g, st) {
        const { t, mv, ph, atk, c1, c2 } = st; const sw = sin(t * 2 + st.seed) * 1.2, raise = atk * 3, wig = sin(ph * 2) * mv * 1.2;
        const ring = (y, rx, ry, col, x) => { ell(g, x, y, rx + 1, ry + 1, OUT); ell(g, x, y, rx, ry, col); ell(g, x - rx * 0.2, y - ry * 0.3, rx * 0.5, ry * 0.3, alpha(shade(col, 0.45), 0.5)); };
        limb(g, 0, -10, sw * 0.5, -17 - raise, 7, c1); ball(g, sw * 0.5, -21 - raise, 8.6, 8, c1, 1.3);
        ell(g, sw * 0.5 - 3, -21 - raise, 2, 2.6, c2, '#222', 0.6); ell(g, sw * 0.5 + 3, -21 - raise, 2, 2.6, c2, '#222', 0.6); ell(g, sw * 0.5 - 3, -21 - raise, 0.8, 1.2, '#111'); ell(g, sw * 0.5 + 3, -21 - raise, 0.8, 1.2, '#111');
        ball(g, sw * 0.5, -26.6 - raise, 4.6, 3.4, shade(c1, 0.1), 1.1);
        ring(-9, 7, 3.2, c1, wig * 0.5); ring(-5.6, 9, 3.4, shade(c1, -0.08), -wig); ring(-2.4, 11, 3.6, shade(c1, -0.18), wig);
        g.lineCap = 'round'; g.strokeStyle = OUT; g.lineWidth = 3.2; g.beginPath(); g.moveTo(7, -3); g.quadraticCurveTo(14, -2, 12, 0.6 + sin(t * 3) * 0.6); g.stroke(); g.strokeStyle = c1; g.lineWidth = 1.7; g.stroke();
    }
    S.snake.v = { side: S.snake.draw, front: snakeFront, back: snakeBack };

    /* ---------- morcego: perfil e costas (de frente é o desenho original) ---------- */
    function batSide(g, st) {
        const { t, atk, c1, c2 } = st; const hv = -14 + sin(t * 3 + st.seed) * 3 - atk * 4, fl = sin(t * 20 + st.seed) * 0.85, lk = (st.turn || 0) * 0.5;
        const wing = (dx, sc, col) => {
            g.save(); g.translate(dx, hv - 2); g.rotate(-fl * 0.5 - 0.2); g.scale(sc, sc);
            g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-4, -12 - fl * 7, -2, -17 - fl * 12); g.quadraticCurveTo(-8, -9 - fl * 8, -12, -8 - fl * 7); g.quadraticCurveTo(-11, -3 - fl * 3, -16, -2 - fl * 3); g.quadraticCurveTo(-8, 1, -7, 5); g.quadraticCurveTo(-3, 3, 0, 5); g.closePath();
            paint(g, col, OUT, 1.1); g.strokeStyle = shade(col, -0.45); g.lineWidth = 0.8; g.beginPath(); g.moveTo(0, 0); g.lineTo(-2, -17 - fl * 12); g.moveTo(0, 0); g.lineTo(-16, -2 - fl * 3); g.stroke(); g.restore();
        };
        wing(-1, 0.85, shade(c1, -0.35));
        ball(g, 0, hv, 4.4, 6.2, c1, 1.1);
        g.save(); g.translate(0, hv); g.rotate(0.15); tri(g, -3, 4, -9, 8 + sin(t * 8) * 1, -2, 7, shade(c1, -0.3), OUT, 0.8); g.restore();
        ball(g, 2.4, hv - 7.6, 4.2, 3.9, c1, 1.1); ell(g, 6.4, hv - 6.2, 2.4, 1.8, shade(c1, 0.15), OUT, 0.8); ell(g, 7.8, hv - 6.8, 0.6, 0.5, '#111');
        tri(g, 0.4, hv - 10.4, -0.8, hv - 16.6, 3.6, hv - 11.4, c1, OUT, 1); tri(g, 0.8, hv - 10.8, 0.2, hv - 14.6, 2.6, hv - 11.4, c2);
        g.fillStyle = '#ff3b3b'; g.fillRect(3.6 + lk, hv - 9.2, 1.9, 1.9);
        const o = atk > 0.1 ? 1.5 : 0; tri(g, 5, hv - 4.8, 6.2, hv - 4.8, 5.6, hv - 2.4 - o, '#fff');
        wing(1, 1, c1);
    }
    function batBack(g, st) {
        const { t, atk, c1, c2 } = st; const hv = -14 + sin(t * 3 + st.seed) * 3 - atk * 4, fl = sin(t * 20 + st.seed) * 0.85;
        for (let side = -1; side <= 1; side += 2) {
            g.save(); g.translate(side * 3, hv - 3); g.scale(side, 1); g.rotate(-fl * 0.5);
            g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(8, -12 - fl * 7, 18, -6 - fl * 12); g.quadraticCurveTo(15, -1 - fl * 4, 15, 2 - fl * 3); g.quadraticCurveTo(11, 0 - fl * 2, 10.5, 4 - fl * 2); g.quadraticCurveTo(6, 2, 5, 6); g.quadraticCurveTo(2, 3, 0, 5); g.closePath();
            paint(g, shade(c1, -0.12), OUT, 1.1); g.strokeStyle = shade(c1, -0.55); g.lineWidth = 0.9; g.beginPath(); g.moveTo(0, 0); g.lineTo(18, -6 - fl * 12); g.moveTo(0, 0); g.lineTo(15, 2 - fl * 3); g.moveTo(0, 0); g.lineTo(10.5, 4 - fl * 2); g.stroke(); g.restore();
        }
        ball(g, 0, hv, 5, 6.4, c1, 1.1); g.strokeStyle = alpha(shade(c1, -0.55), 0.6); g.lineWidth = 1; g.beginPath(); g.moveTo(0, hv - 4); g.lineTo(0, hv + 5); g.stroke();
        tri(g, -2.6, hv + 5, 2.6, hv + 5, 0, hv + 9, shade(c1, -0.25), OUT, 0.8);
        ball(g, (st.turn || 0) * 0.6, hv - 8, 4.4, 4, c1, 1.1); tri(g, -4.2, hv - 10, -5.6, hv - 16, -1.6, hv - 11.4, c1, OUT, 1); tri(g, 4.2, hv - 10, 5.6, hv - 16, 1.6, hv - 11.4, c1, OUT, 1);
    }
    S.bat.home = 'front'; S.bat.v = { front: S.bat.draw, back: batBack, side: batSide };
    S.slime.home = 'front'; S.slime.v = { front: S.slime.draw, back: S.slime.draw, side: S.slime.draw };

    /* ---------- dragões: de frente (asas abertas, cabeça grande) e de costas (espinhos e cauda) ---------- */
    function dragonFront(g, st, K, back) {
        const { t, mv, ph, atk, c1, c2, hurt } = st; const s = K.s;
        const sw = sin(ph * 0.7) * mv, bob = abs(sin(ph * 0.7)) * mv * 2.2 * s, br = sin(t * 1.7 + st.seed) * 1.4 * s, tn = (st.turn || 0) * 3 * s, lk = (st.turn || 0) * 2 * s;
        const scale = c1, dark = shade(c1, -0.5), mid = shade(c1, -0.2), lite = shade(c1, 0.28), belly = c2, bone = '#efe4c2', spike = K.spike || c2;
        const flap = sin(t * K.flap + st.seed), flap2 = sin(t * K.flap + st.seed - 0.7);
        glow(g, 0, -60 * s, 120 * s, K.aura || c1, K.glow);
        // asas abertas (a da direita é espelhada)
        dragonWing(g, K, s, mid, -14 * s, -80 * s - bob + br, flap2, shade(scale, -0.25), true);
        g.save(); g.scale(-1, 1); dragonWing(g, K, s, mid, -14 * s, -80 * s - bob + br, flap, shade(scale, -0.1), false); g.restore();
        // cauda (aparece atrás/ao lado)
        const tw = sin(t * 2 + st.seed) * 6 * s;
        if (!back) { limb(g, 6 * s, -24 * s, 26 * s + tw, -16 * s, 14 * s, mid); limb(g, 26 * s + tw, -16 * s, 40 * s + tw, -8 * s, 8 * s, scale); poly(g, [40 * s + tw, -8 * s, 48 * s + tw, -16 * s, 52 * s + tw, -6 * s, 46 * s + tw, 0], spike, OUT, 1.1); }
        // patas
        const hind = (x) => { ell(g, x * s, -24 * s - bob, 13 * s, 17 * s, mid, OUT, 1.5 * s); ell(g, x * 1.08 * s, -2 * s, 11 * s, 4 * s, dark, OUT, 1.2); for (let k = -1; k <= 1; k++) tri(g, (x * 1.08 + k * 4.4 - 1.4) * s, -3.4 * s, (x * 1.08 + k * 4.4 + 1.4) * s, -3.4 * s, (x * 1.08 + k * 4.4) * s, 2 * s, bone, OUT, 0.7); };
        const back_ = back;
        hind(-26); hind(26);
        const foreLeg = (x, off) => { const l = max(0, sin(ph * 0.7 + off)) * mv * 5 * s; limb(g, x * s, -52 * s - bob, x * s, -l - 4 * s, 12 * s, shade(scale, -0.1)); ell(g, x * s, -l - 2 * s, 10 * s, 4 * s, dark, OUT, 1.2); for (let k = -1; k <= 1; k++) tri(g, (x + k * 3.6 - 1.2) * s, -l - 4 * s, (x + k * 3.6 + 1.2) * s, -l - 4 * s, (x + k * 3.6) * s, -l + 2 * s, bone, OUT, 0.7); };
        if (!back_) { foreLeg(-15, 0); foreLeg(15, PI); }
        // corpo
        ell(g, 0, -56 * s - bob, 26 * s, 30 * s, scale, OUT, 2 * s); ell(g, -6 * s, -62 * s - bob, 16 * s, 20 * s, alpha(lite, 0.35));
        if (!back_) {
            ell(g, 0, -50 * s - bob, 14 * s, 24 * s, belly, OUT, 1.2); g.strokeStyle = alpha(shade(belly, -0.5), 0.55); g.lineWidth = 1.2 * s; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(-12 * s, (-66 + i * 8) * s - bob); g.quadraticCurveTo(0, (-62 + i * 8) * s - bob, 12 * s, (-66 + i * 8) * s - bob); g.stroke(); }
        } else { for (let i = 0; i < 6; i++) tri(g, -4 * s, (-84 + i * 9) * s - bob, 0, (-92 + i * 9) * s - bob + (i % 2), 4 * s, (-84 + i * 9) * s - bob, spike, OUT, 1); }
        if (back_) { foreLeg(-15, 0); foreLeg(15, PI); }
        // cauda por cima (de costas: vem até o espectador)
        if (back_) { limb(g, 0, -20 * s, tw, -6 * s, 16 * s, mid); limb(g, tw, -6 * s, tw * 1.4, 4 * s, 9 * s, scale); poly(g, [tw * 1.4 - 8 * s, 2 * s, tw * 1.4, 10 * s, tw * 1.4 + 8 * s, 2 * s, tw * 1.4, -4 * s], spike, OUT, 1.2); for (let i = 0; i < 3; i++) tri(g, tw * i * 0.3 - 3 * s, (-18 + i * 8) * s, tw * i * 0.3, (-26 + i * 8) * s, tw * i * 0.3 + 3 * s, (-18 + i * 8) * s, spike, OUT, 0.9); }
        // pescoço + cabeça
        const hx = tn, hy = (back_ ? -98 : -100) * s - bob + br - atk * 6 * s;
        limb(g, 0, -80 * s - bob, hx * 0.6, hy + 8 * s, 24 * s, scale);
        if (back_) {
            for (let i = 0; i < 4; i++) tri(g, hx * 0.6 - 3 * s, (-84 - i * 5) * s - bob, hx * 0.6, (-92 - i * 5) * s - bob, hx * 0.6 + 3 * s, (-84 - i * 5) * s - bob, spike, OUT, 0.9);
            for (let sd = -1; sd <= 1; sd += 2) { g.strokeStyle = OUT; g.lineWidth = 7 * s; g.lineCap = 'round'; g.beginPath(); g.moveTo(hx + sd * 8 * s, hy - 2 * s); g.quadraticCurveTo(hx + sd * 22 * s, hy - 14 * s, hx + sd * 16 * s, hy - 28 * s); g.stroke(); g.strokeStyle = bone; g.lineWidth = 4.2 * s; g.stroke(); }
            ell(g, hx, hy, 15 * s, 13 * s, scale, OUT, 1.8 * s); ell(g, hx, hy - 3 * s, 9 * s, 6 * s, alpha(lite, 0.4)); for (let i = 0; i < 3; i++) tri(g, hx - 3 * s, (hy - 10 * s) - i * 1, hx, hy - (16 + i * 2) * s, hx + 3 * s, (hy - 10 * s) - i * 1, spike, OUT, 0.8);
        } else {
            const jaw = (K.jaw || 1) * (0.1 + atk * 0.8 + max(0, sin(t * 0.7 + st.seed * 2) - 0.92) * 6);
            // chifres grossos varridos para cima e para fora + espinhos de bochecha
            for (let sd = -1; sd <= 1; sd += 2) { g.strokeStyle = OUT; g.lineWidth = 9 * s; g.lineCap = 'round'; g.beginPath(); g.moveTo(hx + sd * 10 * s, hy - 7 * s); g.quadraticCurveTo(hx + sd * 27 * s, hy - 6 * s, hx + sd * 23 * s, hy - 33 * s); g.stroke(); g.strokeStyle = bone; g.lineWidth = 5.6 * s; g.stroke();
                tri(g, hx + sd * 13 * s, hy + 0 * s, hx + sd * 27 * s, hy + 3 * s, hx + sd * 12 * s, hy + 8 * s, mid, OUT, 1); tri(g, hx + sd * 12 * s, hy + 8 * s, hx + sd * 23 * s, hy + 13 * s, hx + sd * 10 * s, hy + 14 * s, mid, OUT, 1); }
            for (let k = -1; k <= 1; k++) tri(g, hx + k * 5 * s - 2.4 * s, hy - 11 * s, hx + k * 5 * s, hy - (19 - abs(k) * 3) * s, hx + k * 5 * s + 2.4 * s, hy - 11 * s, spike, OUT, 0.9);   // crista
            ell(g, hx, hy, 17 * s, 13.5 * s, scale, OUT, 1.8 * s); ell(g, hx - 3 * s, hy - 6 * s, 10 * s, 5 * s, alpha(lite, 0.4));
            // mandíbula larga e boca
            ell(g, hx, hy + (15 + jaw * 10) * s, 11 * s, 6.4 * s, mid, OUT, 1.5); if (jaw > 0.2) { ell(g, hx, hy + (11 + jaw * 6) * s, 9 * s, (3 + jaw * 6) * s, '#7a1c10'); ell(g, hx, hy + (11 + jaw * 6) * s, 5 * s, (2 + jaw * 4) * s, '#ff8a2a'); }
            for (let sd = -1; sd <= 1; sd += 2) tri(g, hx + sd * 5 * s, hy + (16 + jaw * 8) * s, hx + sd * 8.4 * s, hy + (16 + jaw * 8) * s, hx + sd * 6.6 * s, hy + (8 + jaw * 2) * s, '#fbf6e2', OUT, 0.7);   // presas de baixo
            ball(g, hx, hy + 9 * s, 13 * s, 9 * s, lite, 1.4 * s);   // focinho largo
            for (let sd = -1; sd <= 1; sd += 2) { ell(g, hx + sd * 4.6 * s, hy + 6.6 * s, 1.9 * s, 1.2 * s, '#1a0a0a', null, 0, -sd * 0.5); tri(g, hx + sd * 7 * s, hy + 13 * s, hx + sd * 10.4 * s, hy + 13 * s, hx + sd * 8.8 * s, hy + (21 + jaw * 4) * s, '#fbf6e2', OUT, 0.7); tri(g, hx + sd * 2 * s, hy + 14 * s, hx + sd * 4.6 * s, hy + 14 * s, hx + sd * 3.4 * s, hy + (18 + jaw * 3) * s, '#fbf6e2', OUT, 0.6); }   // narinas e presas de cima
            // olhos de fera: fenda estreita, canto de dentro mais baixo; sobrancelha pesada descendo para o centro (olhar feroz)
            for (let sd = -1; sd <= 1; sd += 2) { const ex = hx + sd * 8.6 * s, ey = hy - 2.4 * s; glow(g, ex, ey, 10 * s, '#ff9a2a', 0.8); ell(g, ex, ey, 4.8 * s, 2.5 * s, '#ffd23a', OUT, 1, -sd * 0.42); ell(g, ex + lk * 0.5, ey, 0.9 * s, 2.3 * s, '#100', null, 0, -sd * 0.42);
                g.strokeStyle = OUT; g.lineWidth = 5 * s; g.lineCap = 'round'; g.beginPath(); g.moveTo(hx + sd * 2 * s, hy - 2 * s); g.lineTo(hx + sd * 14.4 * s, hy - 9.4 * s); g.stroke(); g.strokeStyle = shade(dark, -0.15); g.lineWidth = 3.4 * s; g.stroke();
                tri(g, hx + sd * 12 * s, hy - 8.4 * s, hx + sd * 16.6 * s, hy - 13.6 * s, hx + sd * 15 * s, hy - 7 * s, spike, OUT, 0.7); }
            if (K.smoke) for (let i = 0; i < 2; i++) { const p = (t * 0.7 + i / 2 + st.seed) % 1; ell(g, hx + (i ? 3 : -3) * s, hy + (10 + p * 10) * s, (2 + p * 5) * s, (2 + p * 5) * s, 'rgba(200,200,205,' + (0.4 * (1 - p)) + ')'); }
            if (K.fire && atk > 0.12) { const f = atk; for (let i = 0; i < 26; i++) { const p = i / 25, r0 = hash(i * 3.1 + floorT(t, 16)), fy = hy + (12 + p * 60 * f) * s, fx = hx + (r0 - 0.5) * 16 * p * s * 1.6, rr = (3 + p * 14) * s * (0.6 + f * 0.6); g.fillStyle = p < 0.25 ? 'rgba(255,240,150,0.9)' : p < 0.6 ? 'rgba(255,150,40,0.7)' : 'rgba(220,60,20,' + (0.5 * (1 - p)) + ')'; g.beginPath(); g.arc(fx, fy, rr, 0, TAU); g.fill(); } }
        }
        if (hurt > 0.05) { g.fillStyle = 'rgba(255,255,255,' + (hurt * 0.4) + ')'; g.beginPath(); g.ellipse(0, -60 * s - bob, 40 * s, 34 * s, 0, 0, TAU); g.fill(); }
    }
    const K_WHELP = { s: 0.44, wing: 110, flap: 5.5, tail: 60, glow: 0.12, fire: true, smoke: false, jaw: 1 }, K_DRAGON = { s: 1, wing: 100, flap: 2.6, tail: 92, glow: 0.2, fire: true, smoke: true, jaw: 1, aura: '#ff4a1a' };
    const dfv = (K, back) => (g, st) => { K.spike = st.c2; dragonFront(g, st, K, back); };
    S.whelp.home = 'side'; S.whelp.v = { side: S.whelp.draw, front: dfv(K_WHELP, false), back: dfv(K_WHELP, true) };
    S.dragon.home = 'side'; S.dragon.v = { side: S.dragon.draw, front: dfv(K_DRAGON, false), back: dfv(K_DRAGON, true) };

    /*@/VIEWS*/

    /* ============================================================
       HUMANOS (jogador e NPCs)  view: 'front' | 'back' | 'side'
       Aparência: sex 'm'|'f', race human|elf|dwarf|orc, hairStyle 0..7, cores.
       ============================================================ */
    const SKIN = ['#f1c27d', '#e0ac7a', '#c98d5d', '#8d5a3a'];
    const PAL = {
        skin: {
            human: ['#f8d9b8', '#f1c27d', '#e0ac7a', '#c98d5d', '#8d5a3a'],
            elf: ['#f6e4d2', '#ecd3b2', '#d4ad88'],
            dwarf: ['#eab995', '#d39b72', '#b77a55'],
            orc: ['#86b25c', '#62984a', '#4f8a5a']
        },
        hair: ['#1c1410', '#3a2416', '#6b4a2a', '#8f5d2c', '#c08a3e', '#e3c77a', '#a8341c', '#8a8a92', '#e8e8ec', '#3b5a9f', '#7a3f9a', '#2f8a5a'],
        cloth: [['#3b7dd8', '#4a3a2a'], ['#c0453a', '#3a3a44'], ['#3f9a52', '#4a3a2a'], ['#d9a93a', '#5a3a26'], ['#7a4fb0', '#33303f'], ['#d8d2c0', '#5a4a38'], ['#2f3a4f', '#2a2a30'], ['#2f9a9a', '#3a3a44'], ['#b8683a', '#3a2c22'], ['#c25a8a', '#3a3340']]
    };
    const HAIR_NAMES = ['Curto', 'Repartido', 'Espetado', 'Ondulado', 'Longo liso', 'Longo com franja', 'Rabo de cavalo', 'Coque'];
    function D_(sx, sy, sh, wa, hp, hr, iris) { return { sx, sy, sh, wa, hp, hr, iris }; }
    const DIMS = {
        human: { m: D_(1, 1.05, 6.2, 5.2, 5.6, 7.2, '#4a3020'), f: D_(0.97, 1.02, 5.3, 3.9, 5.7, 7.0, '#4a3020') },
        elf: { m: D_(0.96, 1.1, 5.6, 4.6, 5.2, 6.8, '#2f8f6a'), f: D_(0.93, 1.08, 4.9, 3.6, 5.3, 6.6, '#3a7fb0') },
        dwarf: { m: D_(1.08, 0.9, 6.9, 6.2, 6.4, 7.6, '#2a2a3a'), f: D_(1.04, 0.9, 6.0, 4.8, 6.3, 7.4, '#2a2a3a') },
        orc: { m: D_(1.1, 1.06, 7.2, 6.0, 5.8, 7.6, '#d8a020'), f: D_(1.05, 1.03, 6.3, 4.6, 5.6, 7.3, '#d8a020') }
    };
    function dimsOf(sex, race) { const r = DIMS[race] || DIMS.human; return sex === 'f' ? r.f : r.m; }
    const _defLook = { sex: 'm', race: 'human', hairStyle: 0, hair: '#6b4a2a', skin: '#f1c27d', shirt: '#3b7dd8', pants: '#4a3a2a', beard: 0 };
    function defaultLook() { return _defLook; }
    const _HEX6 = /^#[0-9a-fA-F]{6}$/;
    function cleanLook(l) {   // cópia validada (ou null): mesmas regras do servidor
        if (!l || typeof l !== 'object' || Array.isArray(l)) return null;
        if (l.sex !== 'm' && l.sex !== 'f') return null; if (!DIMS.hasOwnProperty(l.race)) return null;
        if (typeof l.hairStyle !== 'number' || !Number.isInteger(l.hairStyle) || l.hairStyle < 0 || l.hairStyle > 7) return null;
        for (const k of ['hair', 'skin', 'shirt', 'pants']) if (typeof l[k] !== 'string' || !_HEX6.test(l[k])) return null;
        return { sex: l.sex, race: l.race, hairStyle: l.hairStyle, hair: l.hair.toLowerCase(), skin: l.skin.toLowerCase(), shirt: l.shirt.toLowerCase(), pants: l.pants.toLowerCase(), beard: l.beard === 1 ? 1 : 0 };
    }

    /* ----- formas suaves (cada ponto vira "controle" de uma curva quadrática; y relativo a dy) ----- */
    function blob(g, p, dy) {
        const n = p.length / 2; g.beginPath();
        g.moveTo((p[2 * n - 2] + p[0]) / 2, (p[2 * n - 1] + p[1]) / 2 + dy);
        for (let i = 0; i < n; i++) { const j = (i + 1) % n; g.quadraticCurveTo(p[2 * i], p[2 * i + 1] + dy, (p[2 * i] + p[2 * j]) / 2, (p[2 * i + 1] + p[2 * j + 1]) / 2 + dy); }
        g.closePath();
    }
    function polyp(g, p, dy) { g.beginPath(); g.moveTo(p[0], p[1] + dy); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1] + dy); g.closePath(); }
    function symm(half) { const a = []; for (let i = 0; i < half.length; i++) a.push(half[i][0], half[i][1]); for (let i = half.length - 2; i >= 0; i--) a.push(-half[i][0], half[i][1]); return a; }
    const _hc = {};
    function memo(key, fn) { return _hc[key] || (_hc[key] = fn()); }

    /* pinta um pedaço de cabelo: contorno + sombra à direita + brilho */
    function hairFill(g, hc, dy, hy, hr, shine) {
        g.fillStyle = hc; g.fill(); g.strokeStyle = OUT; g.lineWidth = 1.05; g.lineJoin = 'round'; g.stroke();
        g.save(); g.clip();
        g.globalAlpha = 0.3; g.fillStyle = shade(hc, -0.55); g.fillRect(hr * 0.34, hy - 14, 14, 40);
        g.globalAlpha = 0.5; g.strokeStyle = shade(hc, 0.45); g.lineWidth = 1.2; g.lineCap = 'round';
        if (shine !== false) { g.beginPath(); g.moveTo(-hr * 0.78, hy - 4.6); g.quadraticCurveTo(-hr * 0.55, hy - 7.6, -hr * 0.05, hy - 8.0); g.stroke(); }
        g.restore(); g.globalAlpha = 1;
    }
    function strandLines(g, hc, segs) {   // fios escuros finos
        g.save(); g.globalAlpha = 0.4; g.strokeStyle = shade(hc, -0.6); g.lineWidth = 0.7; g.lineCap = 'round'; g.beginPath();
        for (let i = 0; i < segs.length; i += 4) { g.moveTo(segs[i], segs[i + 1]); g.lineTo(segs[i + 2], segs[i + 3]); } g.stroke(); g.restore(); g.globalAlpha = 1;
    }
    function bunShape(g, cx, cy, hc, hr) {
        g.beginPath(); g.ellipse(cx, cy, 3.7, 3.3, 0, 0, TAU); hairFill(g, hc, cy + 8, cy + 8, hr, false);
        g.strokeStyle = shade(hc, 0.4); g.globalAlpha = 0.6; g.lineWidth = 0.9; g.beginPath(); g.arc(cx - 0.4, cy, 2.0, 3.5, 5.3); g.stroke(); g.globalAlpha = 1;
    }
    const COVER = { helmet: 1, hood: 1, wizard: 1, mitre: 1, chef: 1, straw: 1, cap: 1, fisher: 1 };
    const LONGB = [0, 0, 0, 1, 1, 1, 0, 0];   // estilos com massa atrás da cabeça

    /* ---------- CABELO: camada de trás (atrás dos ombros/tronco) ---------- */
    function hairBehind(g, st, view, hy, hr, hc) {
        if (view === 'front') {
            if (st === 3) { blob(g, memo('f3b' + hr, () => symm([[hr + 0.8, -3], [hr + 2.2, 2.4], [hr + 1.9, 7.2], [hr + 0.2, 9.6], [3.6, 8]])), hy); hairFill(g, hc, hy, hy, hr, false); }
            else if (st === 4 || st === 5) { blob(g, memo('f4b' + hr, () => symm([[hr + 0.8, -3], [hr + 2.4, 3], [hr + 2.4, 11], [hr + 1.6, 15.6], [hr - 1.4, 16.4], [3, 15.6]])), hy); hairFill(g, hc, hy, hy, hr, false); }
            else if (st === 6) { blob(g, memo('f6b' + hr, () => [hr - 1.4, -3.4, hr + 2.6, 0, hr + 3.4, 6.6, hr + 2.6, 13.4, hr + 0.6, 15, hr - 0.4, 8, hr - 2.4, 2.4]), hy); hairFill(g, hc, hy, hy, hr, false); }
        } else if (view === 'side') {
            if (st === 3) { blob(g, [-1, -7, -7.6, -5, -9, 1.6, -8.6, 7.8, -6, 9.6, -3.2, 7, -1.6, 2], hy); hairFill(g, hc, hy, hy, hr, false); }
            else if (st === 4 || st === 5) { blob(g, [-1.4, -6.6, -7.8, -4.6, -10, 3, -10.4, 12, -9.2, 16.6, -6.2, 15.8, -4.4, 11, -3, 3], hy); hairFill(g, hc, hy, hy, hr, false); }
            else if (st === 6) { blob(g, [-6, -5.4, -10.6, -2, -12.4, 5.6, -11.6, 12.6, -9, 15.4, -8.4, 9.6, -6.6, 3], hy); hairFill(g, hc, hy, hy, hr, false); }
        }
    }
    function hairLocksFront(g, st, hy, hr, hc) {
        if (st !== 4 && st !== 5) return;
        const p = memo('f4o' + hr, () => [hr + 1.3, -1, hr + 2.0, 6, hr + 1.5, 12.6, hr - 0.2, 15.2, hr - 4.2, 13.6, hr - 4.4, 6, hr - 3.0, 0]);
        blob(g, p, hy); hairFill(g, hc, hy, hy, hr, false); strandLines(g, hc, [hr - 0.4, hy + 2, hr - 0.6, hy + 12]);
        g.save(); g.scale(-1, 1); blob(g, p, hy); hairFill(g, hc, hy, hy, hr, false); strandLines(g, hc, [hr - 0.4, hy + 2, hr - 0.6, hy + 12]); g.restore();
    }
    function hairBackOver(g, st, hy, hr, hc) {   // de costas: cabelo longo/rabo sobre as costas (antes da cabeça)
        if (st === 4 || st === 5) { blob(g, memo('b4' + hr, () => symm([[hr + 0.5, -3], [hr + 1.8, 4], [hr + 2.0, 12], [hr + 0.6, 17.4], [3.4, 19.2], [0, 19.6]])), hy); hairFill(g, hc, hy, hy, hr, false); strandLines(g, hc, [-2.4, hy + 6, -2.8, hy + 16, 2.4, hy + 6, 2.8, hy + 16]); }
        else if (st === 6) { blob(g, memo('b6' + hr, () => symm([[2.6, -5], [3.6, 2], [3.4, 11], [1.6, 17.6], [0, 18.4]])), hy); hairFill(g, hc, hy, hy, hr, false); strandLines(g, hc, [-0.8, hy + 2, -1, hy + 15, 1, hy + 2, 1.2, hy + 15]); }
    }

    /* ---------- CABELO: sobre a cabeça ---------- */
    function capFront(hr, line) { return [0, -8.9, hr * 0.74, -8.3, hr + 0.9, -4.6, hr + 0.95, -0.4].concat(line, [-(hr + 0.95), -0.4, -(hr + 0.9), -4.6, -hr * 0.74, -8.3]); }
    function hairHeadFront(g, st, hy, hr, hc, covered) {
        if (covered) return;
        if (st === 2) {
            const p = memo('f2' + hr, () => { const a = [], n = 12, R = hr + 0.9; for (let i = 0; i <= n; i++) { const th = PI + (PI * i) / n, tip = (i % 2 === 0) ? 1.3 : 1.0; const rr = (i === 0 || i === n) ? 1 : tip; a.push(cos(th) * R * rr, -0.4 + sin(th) * 8.6 * rr); } return a.concat([hr + 0.2, 2.6, hr - 1.2, 0.2, hr - 2.6, -2.8, 4, -4.6, 2, -2.8, 0, -4.8, -2, -2.8, -4, -4.6, -(hr - 2.6), -2.8, -(hr - 1.2), 0.2, -(hr + 0.2), 2.6]); });
            polyp(g, p, hy); hairFill(g, hc, hy, hy, hr); return;
        }
        let line;
        if (st === 0) line = memo('l0' + hr, () => symm([[hr + 0.3, 2.8], [hr - 1.0, 0.2], [hr - 2.4, -2.8], [2.8, -4.3], [0, -4.7]]));
        else if (st === 1) line = memo('l1' + hr, () => [hr + 0.3, 2.8, hr - 0.6, -0.2, hr - 2.4, -1.4, 2.4, -2.6, -0.6, -3.8, -3.4, -5, -(hr - 2.2), -3.2, -(hr - 1.0), 0.2, -(hr + 0.3), 2.8]);
        else if (st === 3) line = memo('l3' + hr, () => symm([[hr + 0.7, 5.4], [hr - 0.4, 0.8], [hr - 2.3, -2.6], [3.0, -4.2], [0, -4.8]]));
        else if (st === 4) line = memo('l4' + hr, () => symm([[hr + 0.7, 6.4], [hr - 0.5, 0.8], [hr - 2.3, -2.8], [3.2, -4.4], [0, -4.9]]));
        else if (st === 5) line = memo('l5' + hr, () => [hr + 0.5, 6.4, hr - 0.6, -0.2, 5.2, -1.6, 3.4, -0.6, 1.6, -1.8, 0, -0.7, -1.6, -1.8, -3.4, -0.6, -5.2, -1.6, -(hr - 0.6), -0.2, -(hr + 0.5), 6.4]);
        else line = memo('l6' + hr, () => symm([[hr + 0.1, 2.2], [hr - 1.0, -0.6], [hr - 2.4, -3.4], [2.8, -4.9], [0, -5.3]]));
        if (st === 7) { bunShape(g, 0, hy - 10.4, hc, hr); }
        blob(g, capFront(hr, line), hy); hairFill(g, hc, hy, hy, hr);
        if (st === 1) { g.strokeStyle = shade(hc, -0.55); g.lineWidth = 0.8; g.beginPath(); g.moveTo(-3.4, hy - 4.8); g.quadraticCurveTo(-3.6, hy - 6.6, -2.6, hy - 8.4); g.stroke(); strandLines(g, hc, [-1, hy - 3.4, 4, hy - 1.4, 0.4, hy - 6, 5.6, hy - 2.6]); }
        else if (st === 0) strandLines(g, hc, [-2.4, hy - 6, -4, hy - 3.6, 1.6, hy - 6.6, 3, hy - 4.4]);
        else if (st === 6 || st === 7) { strandLines(g, hc, [0, hy - 8, 0, hy - 5.6, 3, hy - 7.4, 4.6, hy - 4.6]); if (st === 6) { rrect(g, hr - 2.6, hy - 6.6, 3.4, 2.6, 1, '#c0392b', OUT, 0.7); } else rrect(g, -2.4, hy - 10.6, 4.8, 1.8, 0.8, '#c0392b', OUT, 0.7); }
        else if (st === 3 || st === 4) strandLines(g, hc, [-3.4, hy - 7.6, -5.2, hy - 2.4, 3.4, hy - 7.6, 5.2, hy - 2.4]);
        else if (st === 5) strandLines(g, hc, [-2.6, hy - 7, -2.6, hy - 2.4, 2.6, hy - 7, 2.6, hy - 2.4]);
    }
    function earFront(g, race, hy, hr, skin, tip) {
        for (let s = -1; s <= 1; s += 2) {
            if (race === 'elf') { if (tip) { tri(g, s * (hr - 0.6), hy - 0.2, s * (hr + 4.6), hy - 4.2, s * (hr - 0.2), hy + 3.4, skin, OUT, 0.9); g.strokeStyle = shade(skin, -0.25); g.lineWidth = 0.7; g.beginPath(); g.moveTo(s * (hr + 0.6), hy + 0.2); g.lineTo(s * (hr + 2.8), hy - 2.2); g.stroke(); } }
            else if (race === 'orc') { if (!tip) tri(g, s * (hr - 0.6), hy, s * (hr + 3), hy - 2.4, s * (hr - 0.2), hy + 3, skin, OUT, 0.9); }
            else if (!tip) ell(g, s * (hr - 0.1), hy + 1.2, 1.6, 2.1, skin, OUT, 0.85);
        }
    }

    function faceFront(g, o, D, hy, hr, skin, hc, atk, F) {
        const race = o.race || 'human', irisC = D.iris, skinD = shade(skin, -0.25);
        // nariz: ponta suave com sombra por baixo e brilho (sem o traço em 'L')
        { const nw = race === 'dwarf' ? 1.9 : race === 'orc' ? 1.8 : race === 'elf' ? 1.0 : 1.35, tipY = hy + (race === 'elf' ? 2.1 : 2.3);
          g.save(); g.strokeStyle = skinD; g.globalAlpha = 0.28; g.lineWidth = 0.8; g.lineCap = 'round'; g.beginPath(); g.moveTo(-0.9, hy + 0.7); g.quadraticCurveTo(-0.6, hy + 1.6, -nw * 0.7, tipY - 0.2); g.stroke(); g.restore();
          ell(g, 0, tipY, nw, 0.95, shade(skin, race === 'orc' ? -0.2 : race === 'dwarf' ? -0.1 : -0.06), skinD, 0.55);
          ell(g, -nw * 0.25, tipY - 0.3, nw * 0.4, 0.3, shade(skin, 0.28));
          g.save(); g.strokeStyle = shade(skin, -0.5); g.globalAlpha = 0.65; g.lineWidth = 0.7; g.lineCap = 'round'; g.beginPath(); g.moveTo(-nw * 0.55, tipY + 0.75); g.lineTo(-nw * 0.25, tipY + 0.75); g.moveTo(nw * 0.25, tipY + 0.75); g.lineTo(nw * 0.55, tipY + 0.75); g.stroke(); g.restore(); }
        ell(g, -hr * 0.66, hy + 2.7, 1.6, 1.0, 'rgba(225,100,100,0.3)'); ell(g, hr * 0.66, hy + 2.7, 1.6, 1.0, 'rgba(225,100,100,0.3)');
        // olhos
        const ey = hy + 0.6, ex = race === 'elf' ? 3.1 : 3.0, ew = race === 'elf' ? 1.75 : 1.6, eh = race === 'orc' ? 1.5 : 1.85;
        const lk = (o.lookX || 0) * 0.6, bl = ((o.t || 0) + (o.seed || 0) * 1.7) % 4.6 < 0.12;   // olhos acompanham; pisca de vez em quando
        for (let s = -1; s <= 1; s += 2) {
            if (bl) { ell(g, s * ex, ey, ew, eh, skin, null); continue; }
            ell(g, s * ex, ey, ew, eh, '#fff', 'rgba(18,10,8,0.55)', 0.6); ell(g, s * ex + lk, ey + 0.25, 1.05, 1.3, irisC); ell(g, s * ex + lk, ey + 0.3, 0.55, 0.75, '#0c0806'); ell(g, s * ex + lk - 0.35, ey - 0.35, 0.38, 0.38, '#fff');
        }
        // pálpebra superior / cílios
        g.strokeStyle = F ? '#1a100c' : shade(skin, -0.55); g.lineWidth = F ? 0.95 : 0.8; g.lineCap = 'round';
        for (let s = -1; s <= 1; s += 2) { g.beginPath(); g.moveTo(s * (ex - ew - 0.1), ey - 0.5); g.quadraticCurveTo(s * ex, ey - eh - 0.9, s * (ex + ew + 0.2), ey - 0.6 - (race === 'elf' ? 0.6 : 0)); g.stroke(); if (F) { g.lineWidth = 0.7; g.beginPath(); g.moveTo(s * (ex + ew + 0.1), ey - 0.7); g.lineTo(s * (ex + ew + 1.1), ey - 1.6); g.stroke(); } }
        // sobrancelhas (ficam escondidas pela franja)
        const bc = shade(hc, -0.25); g.strokeStyle = bc; g.lineCap = 'round';
        const bw = (race === 'dwarf' || race === 'orc') ? 1.5 : (F ? 0.75 : 1.05);
        g.lineWidth = bw;
        for (let s = -1; s <= 1; s += 2) { g.beginPath(); if (race === 'orc') { g.moveTo(s * 1.2, ey - 2.3); g.lineTo(s * 4.6, ey - 3.4); } else { g.moveTo(s * 1.7, ey - 2.5); g.quadraticCurveTo(s * 3.2, ey - 3.4 - (F ? 0.3 : 0), s * 4.7, ey - 2.4 + (race === 'elf' ? -0.6 : 0)); } g.stroke(); }
        // boca
        const my = hy + 3.7;
        if (F) { ell(g, 0, my, 1.7, 0.85 + atk * 0.4, '#c4565c'); g.strokeStyle = '#7a2a30'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(-1.6, my); g.lineTo(1.6, my); g.stroke(); }
        else { g.strokeStyle = '#7a3b2a'; g.lineWidth = 1; g.beginPath(); g.arc(0, hy + 3.3, 1.9 + atk, 0.25, PI - 0.25); g.stroke(); }
        if (race === 'orc') { tri(g, -2.6, my + 0.9, -1.8, my - 1.9, -1.0, my + 0.9, '#f4efdc', OUT, 0.6); tri(g, 1.0, my + 0.9, 1.8, my - 1.9, 2.6, my + 0.9, '#f4efdc', OUT, 0.6); }
    }
    function faceSide(g, o, D, hy, hr, skin, hc, atk, F) {
        const race = o.race || 'human', skinD = shade(skin, -0.25), ex = 4.2;
        // nariz de perfil: ponte suave, ponta arredondada (por raça)
        { const n = race === 'elf' ? 1.9 : race === 'dwarf' ? 2.7 : race === 'orc' ? 2.1 : 1.6;
          g.beginPath(); g.moveTo(6.4, hy - 1.2); g.quadraticCurveTo(7.2 + n * 0.55, hy + 0.2, 7.0 + n, hy + (race === 'elf' ? 1.5 : 2.0)); g.quadraticCurveTo(7.0 + n * 0.8, hy + 3.0 + (race === 'dwarf' ? 0.3 : 0), 6.2, hy + 2.9); g.closePath(); paint(g, skin, OUT, 0.85);
          ell(g, 6.6 + n * 0.55, hy + 1.1, 0.5, 0.35, shade(skin, 0.28));
          if (race === 'orc' || race === 'dwarf') ell(g, 6.5 + n * 0.5, hy + 2.7, 0.6, 0.35, shade(skin, -0.55)); }
        // olho
        ell(g, ex, hy + 0.5, 1.45, 1.75, '#fff', 'rgba(18,10,8,0.55)', 0.6); ell(g, ex + 0.5, hy + 0.65, 0.95, 1.25, D.iris); ell(g, ex + 0.6, hy + 0.7, 0.5, 0.7, '#0c0806'); ell(g, ex + 0.2, hy + 0.1, 0.35, 0.35, '#fff');
        g.strokeStyle = F ? '#1a100c' : shade(skin, -0.55); g.lineWidth = F ? 0.95 : 0.8; g.lineCap = 'round'; g.beginPath(); g.moveTo(ex - 1.5, hy - 0.4); g.quadraticCurveTo(ex, hy - 2.2, ex + 1.8, hy - 0.4); g.stroke();
        if (F) { g.lineWidth = 0.7; g.beginPath(); g.moveTo(ex - 1.4, hy - 0.6); g.lineTo(ex - 2.3, hy - 1.5); g.stroke(); }
        g.strokeStyle = shade(hc, -0.25); g.lineWidth = (race === 'dwarf' || race === 'orc') ? 1.5 : (F ? 0.75 : 1.05); g.beginPath(); g.moveTo(ex - 1.3, hy - 2.7); g.quadraticCurveTo(ex + 0.8, hy - 3.6, ex + 2.6, hy - 2.6); g.stroke();
        // boca
        const my = hy + 4.3;
        if (F) { ell(g, 6.0, my, 1.0, 0.7 + atk * 0.4, '#c4565c'); } else { g.strokeStyle = '#7a3b2a'; g.lineWidth = 0.95; g.beginPath(); g.moveTo(4.6, my); g.lineTo(6.6, my - 0.2 + atk * 0.6); g.stroke(); }
        if (race === 'orc') tri(g, 5.0, my + 0.6, 5.6, my - 2.0, 6.4, my + 0.6, '#f4efdc', OUT, 0.6);
        ell(g, 3.0, hy + 3.0, 1.3, 0.9, 'rgba(225,100,100,0.28)');
    }
    function earSide(g, race, hy, skin, tip) {
        if (race === 'elf') { if (tip) { tri(g, 0.4, hy + 0.2, -5.0, hy - 2.6, -0.4, hy + 3.2, skin, OUT, 0.85); g.strokeStyle = shade(skin, -0.25); g.lineWidth = 0.6; g.beginPath(); g.moveTo(-0.2, hy + 1.4); g.lineTo(-3.0, hy - 1); g.stroke(); } }
        else if (race === 'orc') { if (!tip) tri(g, 0.4, hy - 0.2, -2.8, hy - 3.2, -0.4, hy + 2.8, skin, OUT, 0.9); }
        else if (!tip) { ell(g, -0.8, hy + 1.8, 1.25, 1.8, skin, OUT, 0.7); ell(g, -0.7, hy + 1.9, 0.5, 0.9, shade(skin, -0.25)); }
    }

    /* cabelo de lado (olhando para a direita) */
    function hairHeadSide(g, st, hy, hr, hc, covered) {
        if (covered) return;
        let p;
        if (st === 2) {
            polyp(g, [5.4, -3.2, 6.2, -7.4, 4.0, -8.4, 4.0, -12.0, 1.6, -9.6, -0.8, -13.0, -3.0, -9.6, -6.0, -11.6, -6.4, -7.4, -8.2, -6.2, -7.8, 0, -7.0, 5, -4.6, 4.6, -2.6, 2.6, -0.6, -0.6, 1.4, -1.6, 2.2, 1.8, 3.4, -2.4], hy); hairFill(g, hc, hy, hy, hr); return;
        }
        const fringe = st === 1 ? [6.6, -0.6, 6.9, -4.4] : st === 5 ? [6.8, -0.4, 7.0, -4.6] : [5.6, -3.2, 6.6, -5.6];
        const nape = (st === 3 || st === 4 || st === 5) ? [-7.6, 0.8, -7.4, 5.6, -5.4, 5.6, -3.2, 3.4] : [-7.6, 0.8, -6.8, 4.4, -4.8, 4.0, -2.6, 2.2];
        const sb = (st === 3 || st === 4 || st === 5) ? [-0.6, -0.6, 1.4, -1.2, 2.2, 3.6, 3.4, -1.6] : [-0.6, -0.8, 1.4, -1.6, 2.0, 1.8, 3.2, -2.2];
        p = fringe.concat([3.6, -8.8, -1.0, -9.2, -5.8, -7.8, -7.8, -3.6], nape, sb, st === 5 ? [5.4, -2.0, 6.2, -1.4] : st === 1 ? [4.6, -2.6] : []);
        if (st === 7) bunShape(g, -3.6, hy - 9.6, hc, hr);
        blob(g, p, hy); hairFill(g, hc, hy, hy, hr);
        if (st === 6) rrect(g, -8, hy - 6.6, 3, 3.4, 1, '#c0392b', OUT, 0.7);
        if (st === 7) rrect(g, -6.6, hy - 11.4, 3.6, 1.8, 0.8, '#c0392b', OUT, 0.7);
        strandLines(g, hc, [-5.4, hy - 6.4, -6.4, hy - 1.6, -2.4, hy - 7.6, -4.4, hy - 3.4]);
    }
    /* cabelo de costas: a cabeça toda é cabelo */
    function headBack(g, st, hy, hr, hc, skin, covered, race) {
        if (covered) { ell(g, 0, hy, hr, 7.5, hc, OUT, 1.1); return; }
        if (st === 3) { blob(g, memo('b3' + hr, () => symm([[0, -8.7], [hr * 0.75, -8.1], [hr + 1.0, -4.6], [hr + 2.0, 0.4], [hr + 2.0, 6], [hr + 0.6, 9.4], [3.4, 9.2], [0, 9.6]])), hy); hairFill(g, hc, hy, hy, hr); return; }
        if (st === 2) {
            polyp(g, memo('b2' + hr, () => { const a = [], n = 12, R = hr + 0.5; for (let i = 0; i <= n; i++) { const th = PI + (PI * i) / n, tip = (i % 2 === 0) ? 1.3 : 1.0; const rr = (i === 0 || i === n) ? 1 : tip; a.push(cos(th) * R * rr, -0.2 + sin(th) * 8.0 * rr); } a.push(hr + 0.3, 3.6, 0, 6.6, -(hr + 0.3), 3.6); return a; }), hy);
            hairFill(g, hc, hy, hy, hr); return;
        }
        if (st === 7) bunShape(g, 0, hy - 10.4, hc, hr);
        blob(g, memo('b0' + hr, () => symm([[0, -8.7], [hr * 0.75, -8.1], [hr + 0.9, -4.6], [hr + 1.1, 0.2], [hr + 0.3, 4.8], [hr - 2.2, 7.2], [0, 7.8]])), hy); hairFill(g, hc, hy, hy, hr);
        if (st === 1) { g.strokeStyle = shade(hc, -0.55); g.lineWidth = 0.8; g.beginPath(); g.moveTo(-3.4, hy - 7.6); g.quadraticCurveTo(-1.6, hy - 5, -0.6, hy - 0.4); g.stroke(); }
        else { strandLines(g, hc, [-2.4, hy - 6, -3.6, hy - 1, 2.4, hy - 6, 3.8, hy - 1]); }
        if (st === 6) { rrect(g, -2.4, hy - 6.6, 4.8, 2.6, 1, '#c0392b', OUT, 0.7); }
        if (st === 7) { rrect(g, -2.4, hy - 10.6, 4.8, 1.8, 0.8, '#c0392b', OUT, 0.7); }
    }

    function beardShape(g, col, view, hy, hr, dwarf) {
        if (view === 'back') return;
        const L = dwarf ? 14 : 11;
        if (view === 'side') {
            g.beginPath(); g.moveTo(1.4, hy + 1.6); g.quadraticCurveTo(7.4, hy + 2.6, 6.6, hy + 6.4); g.quadraticCurveTo(5.2, hy + L + 0.4, 0.6, hy + L - 1.6); g.quadraticCurveTo(-1.4, hy + 7, 0.4, hy + 2.8); g.closePath(); paint(g, col, OUT, 0.95);
            g.strokeStyle = shade(col, -0.45); g.globalAlpha = 0.5; g.lineWidth = 0.7; g.beginPath(); g.moveTo(4.2, hy + 5.4); g.lineTo(3.4, hy + L - 2); g.moveTo(1.8, hy + 4.4); g.lineTo(1.6, hy + L - 3.4); g.stroke(); g.globalAlpha = 1;
        } else {
            g.beginPath(); g.moveTo(-hr + 0.5, hy + 2.6); g.quadraticCurveTo(-3.6, hy + 3.4, 0, hy + 4.2); g.quadraticCurveTo(3.6, hy + 3.4, hr - 0.5, hy + 2.6); g.quadraticCurveTo(hr + 0.6, hy + 8.6, 0, hy + L + 1); g.quadraticCurveTo(-hr - 0.6, hy + 8.6, -hr + 0.5, hy + 2.6); g.closePath(); paint(g, col, OUT, 0.95);
            g.strokeStyle = shade(col, -0.45); g.globalAlpha = 0.5; g.lineWidth = 0.7; g.beginPath(); g.moveTo(-2.6, hy + 6.4); g.lineTo(-2, hy + L - 1); g.moveTo(0, hy + 6.8); g.lineTo(0, hy + L); g.moveTo(2.6, hy + 6.4); g.lineTo(2, hy + L - 1); g.stroke(); g.globalAlpha = 1;
            g.strokeStyle = shade(col, -0.5); g.lineWidth = 0.8; g.beginPath(); g.moveTo(-3.4, hy + 3.6); g.quadraticCurveTo(-1.6, hy + 4.4, 0, hy + 4.0); g.quadraticCurveTo(1.6, hy + 4.4, 3.4, hy + 3.6); g.stroke();
        }
    }

    /* ---------- o corpo ---------- */
    function human(g, o) {
        const D = dimsOf(o.sex, o.race), view = o.view || 'front', mv = o.mv || 0, ph = o.ph || 0, t = o.t || 0, atk = o.atk || 0;
        const race = o.race || 'human', F = o.sex === 'f';
        const skin = o.skin || '#f1c27d', shirt = o.shirt || '#3b7dd8', pants = o.pants || '#4a3a2a', boots = o.boots || '#2a1c12', hair = o.hair || '#5a3a1e';
        const st = (o.hairStyle | 0) & 7, hasStyle = true;   // sem estilo informado = curto (0)
        const side = view === 'side', back = view === 'back';
        const sw = sin(ph) * mv, bob = abs(sin(ph)) * mv * 1.2, br = sin(t * 2.2 + (o.seed || 0)) * 0.5;
        const SH = D.sh, WA = D.wa, HP = D.hp, hr = D.hr, sd = 2.6 + SH * 0.25;
        const shirtD = shade(shirt, -0.35), shirtL = shade(shirt, 0.22), skinD = shade(skin, -0.22), pantsD = shade(pants, -0.3);
        const LG = 3.2, HK = 0.87;   // LG: pernas mais longas (o resto do corpo sobe); HK: cabeça menor (proporção de RPG)
        const legY = -13 - LG - bob, armSw = sw * 0.9, hy = -37 - bob + br, aw = 4.2;
        const sx = D.sx, sy = D.sy;
        const covered = !!(o.hat && COVER[o.hat]);
        const hc = hair;
        // --- mãos (geometria)
        const info = { bob: bob * sy, hy: (hy - LG) * sy, hand: null, handL: null, sx, sy };
        const headXf = () => { g.translate(0, hy + 7); g.scale(HK, HK / sy); g.translate(0, -(hy + 7)); };
        const lift = o.bow ? 0 : atk * 3.6;
        let wa0;   // braço de arma: frente = direita da tela; costas = esquerda da tela; lado = braço próximo
        if (side) {
            const a = o.bow ? (-0.25 + armSw * 0.5 * (1 - o.bt) - o.bt * 1.2) : (-0.25 + atk * 1.7 + armSw * 0.5); wa0 = { a, x: 1 + 2 * cos(a) - 12 * sin(a), y: -29 - bob + 2 * sin(a) + 12 * cos(a) };
        } else {
            const hxx = SH + 2.4, ly = -14.6 - bob - armSw * 1.6, ry_ = -14.6 - bob + armSw * 1.6;
            if (back) wa0 = { a: 0, x: hxx + atk * 1.2, y: ry_ - lift }; else wa0 = { a: 0, x: -hxx - atk * 1.2, y: ly - lift };   // arma na mão DIREITA do personagem (frente: esquerda da tela; costas: direita da tela)
            info.handL = back ? { x: -hxx * sx, y: (ly - LG) * sy } : { x: hxx * sx, y: (ry_ - LG) * sy };   // escudo na esquerda do personagem
        }
        info.hand = { x: wa0.x * sx, y: (wa0.y - LG) * sy, a: wa0.a, bt: o.bow ? o.bt : undefined };

        if (o.under) o.under(g, info);   // asas/capa de peças especiais: atrás de todo o corpo
        g.save(); if (sx !== 1 || sy !== 1) g.scale(sx, sy);
        g.translate(0, -LG);
        // capa (NPC): atrás do tronco
        const cape = o.cape;
        if (cape && !back) {
            const cs = side ? -1 : 0;
            g.beginPath();
            if (side) { g.moveTo(-sd + 0.5, -29 - bob); g.lineTo(-sd - 1.5 - sw * 1.4, -7 - bob); g.quadraticCurveTo(-sd - 4.5, -5 - bob, -sd + 4, -6.4 - bob); g.lineTo(sd - 2, -29 - bob); g.closePath(); }
            else { g.moveTo(-SH + 0.4, -29.4 - bob); g.lineTo(-SH - 3.6, -7 - bob); g.quadraticCurveTo(0, -4.4 - bob, SH + 3.6, -7 - bob); g.lineTo(SH - 0.4, -29.4 - bob); g.closePath(); }
            paint(g, cape, OUT, 1.1);
            g.save(); g.clip(); g.globalAlpha = 0.3; g.fillStyle = shade(cape, -0.6); g.fillRect(side ? -sd - 6 : -14, -12 - bob, 30, 14); g.restore(); g.globalAlpha = 1;
        }
        // pernas (desenhadas no referencial do chão)
        g.save(); g.translate(0, LG);
        if (side) {
            const hipH = -legY, lL = (hipH - 1) / 2 + 0.1 + mv * 0.3;   // joelho sempre dobra para a frente; passo com pé que levanta na fase de balanço
            for (const far of [1, 0]) {
                const p = ph + (far ? 0 : PI), fxx = Math.sin(p) * mv * 4.2, lift = Math.max(0, Math.cos(p)) * mv * 3, K = ik(0, legY, fxx, -1 - lift, lL, lL, 1);
                limb2(g, 0, legY, K[0], K[1], K[2], K[3], 5, far ? pantsD : pants); const sc = far ? shade(boots, -0.15) : boots;
                ell(g, K[2] + 1.6, K[3], 4.2, 2.05, sc, OUT, 0.9, -Math.cos(p) * mv * 0.12); if (!far) ell(g, K[2] + 2, K[3] - 0.6, 2.4, 0.8, shade(boots, 0.25));
            }
        } else {
            const lx = F ? 3.1 : 3.4;
            const fl = -1 - max(0, sw) * 3, fr = -1 - max(0, -sw) * 3;
            limb(g, -lx, legY, -lx + sw * 0.5, fl, 5.4, pants); ell(g, -lx + sw * 0.5, fl, 3.7, 2.1, boots, OUT, 0.9); ell(g, -lx + sw * 0.5 - 0.6, fl - 0.6, 1.8, 0.7, shade(boots, 0.25));
            limb(g, lx, legY, lx - sw * 0.5, fr, 5.4, pantsD); ell(g, lx - sw * 0.5, fr, 3.7, 2.1, boots, OUT, 0.9); ell(g, lx - sw * 0.5 - 0.6, fr - 0.6, 1.8, 0.7, shade(boots, 0.25));
        }
        g.restore();
        // braço de trás (lado)
        if (side && !(o.bow && o.bt > 0.02)) { const hxA = -Math.sin(ph) * mv * 5.2, hyA = -17.5 - bob - Math.max(0, Math.sin(ph)) * mv * 1.8, E = ik(0, -29 - bob, hxA, hyA, 6.5, 6.5, -1); arm2(g, 0, -29 - bob, E[0], E[1], E[2], E[3], 4, shade(shirt, -0.45)); ell(g, E[2], E[3] + 0.6, 2.3, 2.3, skinD, OUT, 0.9); }
        // objetos atrás do corpo (arma de costas, escudo de lado): desenhados sem a escala do corpo
        if (o.behind && (back || side)) { g.save(); g.scale(1 / sx, 1 / sy); g.translate(0, LG * sy); o.behind(g, info); g.restore(); }
        // cabelo atrás (frente/lado)
        if (hasStyle && !back) { g.save(); headXf(); hairBehind(g, st, view, hy, hr, hc); g.restore(); }
        // pescoço
        if (!back) { g.fillStyle = skinD; g.fillRect(side ? -1.8 : -2.3, -34 - bob + br, side ? 4.2 : 4.6, 5); }
        else { g.fillStyle = skinD; g.fillRect(-2.3, -34 - bob + br, 4.6, 5); }
        // tronco
        g.beginPath();
        const sy0 = -27.8 - bob + br, ty0 = -31 - bob + br;
        if (side) {
            g.moveTo(-sd - 0.8, -12 - bob); g.quadraticCurveTo(-sd - 1.6, -21 - bob, -sd - 0.3, sy0 + 0.4); g.quadraticCurveTo(-sd * 0.5, ty0 - 0.8, 0.6, ty0); g.quadraticCurveTo(sd * 0.9, ty0 + 0.2, sd + 0.5, sy0 + 0.6);
            g.quadraticCurveTo(sd + (F ? 2.2 : 1.2), -21 - bob, sd + 0.7, -12 - bob); g.closePath();
        } else {
            const cw = 2 * (WA + 0.6) - 0.5 * (HP + SH + 1.1);
            g.moveTo(-HP - 0.6, -12 - bob); g.quadraticCurveTo(-cw, -19 - bob, -SH - 0.5, sy0 + 1.0); g.quadraticCurveTo(-SH - 0.5, sy0 - 1.2, -SH * 0.55, sy0 - 2.3); g.quadraticCurveTo(-2.8, ty0 - 0.4, -2.4, ty0);
            g.lineTo(2.4, ty0); g.quadraticCurveTo(2.8, ty0 - 0.4, SH * 0.55, sy0 - 2.3); g.quadraticCurveTo(SH + 0.5, sy0 - 1.2, SH + 0.5, sy0 + 1.0); g.quadraticCurveTo(cw, -19 - bob, HP + 0.6, -12 - bob); g.closePath();
        }
        paint(g, shirt, OUT, 1.2);
        // sombra do lado direito do tronco (sem clip: repete a curva da direita)
        g.beginPath();
        if (side) { g.moveTo(0.6, ty0); g.quadraticCurveTo(sd * 0.9, ty0 + 0.2, sd + 0.5, sy0 + 0.6); g.quadraticCurveTo(sd + (F ? 2.2 : 1.2), -21 - bob, sd + 0.7, -12 - bob); g.lineTo(0.6, -12 - bob); }
        else { const cw2 = 2 * (WA + 0.6) - 0.5 * (HP + SH + 1.1); g.moveTo(1.6, ty0); g.lineTo(2.4, ty0); g.quadraticCurveTo(2.8, ty0 - 0.4, SH * 0.55, sy0 - 2.3); g.quadraticCurveTo(SH + 0.5, sy0 - 1.2, SH + 0.5, sy0 + 1.0); g.quadraticCurveTo(cw2, -19 - bob, HP + 0.6, -12 - bob); g.lineTo(1.6, -12 - bob); }
        g.closePath(); g.globalAlpha = 0.3; g.fillStyle = shirtD; g.fill(); g.globalAlpha = 1;
        if (!side && !back) { g.fillStyle = skin; g.beginPath(); g.moveTo(-2.6, ty0 - 0.2); g.lineTo(2.6, ty0 - 0.2); g.lineTo(0, ty0 + 3.4); g.closePath(); g.fill(); g.strokeStyle = shirtD; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-2.6, ty0); g.lineTo(0, ty0 + 3.4); g.lineTo(2.6, ty0); g.stroke(); }
        const AT = o.armorT != null ? o.armorT : 2, AC = o.armorCol || '#aab3bd';
        if (o.armor) armorBody(g, view, AT, AC, SH, WA, HP, sd, bob);
        if (o.apron && !back) { const hw = side ? sd : WA + 0.6; g.beginPath(); g.moveTo(-hw + 0.5, -26 - bob); g.lineTo(hw - 0.5, -26 - bob); g.lineTo(hw + 0.4, -9 - bob); g.lineTo(-hw - 0.4, -9 - bob); g.closePath(); paint(g, o.apron, OUT, 0.9); }
        if (o.robe) { const hw = side ? sd : HP; g.beginPath(); g.moveTo(-hw - 0.6, -14 - bob); g.lineTo(-hw - 3.6, 1.2); g.lineTo(hw + 3.6, 1.2); g.lineTo(hw + 0.6, -14 - bob); g.closePath(); paint(g, shirt, OUT, 1.1); g.save(); g.clip(); g.globalAlpha = 0.3; g.fillStyle = shirtD; g.fillRect(1.6, -16 - bob, 14, 16); g.restore(); g.globalAlpha = 1; }
        // cinto
        const bw = side ? sd + 0.5 : (WA * 0.5 + HP * 0.5 + 0.9);
        rrect(g, -bw, -15.4 - bob, bw * 2, 2.6, 1, o.belt || '#4a2f16', OUT, 0.7);
        if (!back) { g.fillStyle = '#e0c060'; g.fillRect(side ? sd - 1.6 : -1.2, -15.6 - bob, 2.4, 2.8); }
        if (o.pack && view !== 'front') rrect(g, -7, -28 - bob, 14, 15, 3, '#7a5230', OUT, 1);
        if (o.pack && view === 'front') { rrect(g, -SH - 1.6, -27 - bob, 3.4, 12, 1.5, '#6a4426', OUT, 0.8); rrect(g, SH - 1.8, -27 - bob, 3.4, 12, 1.5, '#6a4426', OUT, 0.8); }
        // (costas) capa por cima, escudo nas costas, cabelo longo sobre as costas
        if (back) {
            if (cape) { g.beginPath(); g.moveTo(-SH + 0.2, -29.6 - bob); g.quadraticCurveTo(0, -31.4 - bob, SH - 0.2, -29.6 - bob); g.lineTo(SH + 3.2 + sw, -6 - bob); g.quadraticCurveTo(0, -3.6 - bob, -SH - 3.2 - sw, -6 - bob); g.closePath(); paint(g, cape, OUT, 1.1); g.save(); g.clip(); g.globalAlpha = 0.3; g.fillStyle = shade(cape, -0.6); g.fillRect(1.4, -30 - bob, 12, 30); g.restore(); g.globalAlpha = 1; }
            if (hasStyle) { g.save(); headXf(); hairBackOver(g, st, hy, hr, hc); g.restore(); }
            if (o.onBack) { g.save(); g.scale(1 / sx, 1 / sy); g.translate(0, LG * sy); o.onBack(g, info); g.restore(); }
        }
        if (!side && !back && hasStyle) hairLocksFront(g, st, hy, hr, hc);
        // braços (frente/costas)
        if (!side) {
            const hxx = SH + 2.4, ly = -14.6 - bob - armSw * 1.6, ry_ = -14.6 - bob + armSw * 1.6;
            const wl = back ? 0 : lift, wr = back ? lift : 0, wx = o.bow ? 0 : atk * 1.2, bt = o.bow ? o.bt : 0;
            let lhx = -hxx - (back ? 0 : wx), lhy = ly - wl, rhx = hxx + (back ? wx : 0), rhy = ry_ - wr;
            if (o.bow && bt > 0) {   // arqueiro: a mão da arma segura o arco; a outra sobe até a corda (no peito)
                if (back) { lhx = lhx + (1 - lhx) * 0.0; rhx = rhx + (-1.5 - rhx) * bt; rhy = rhy + (-25 - rhy) * bt; }
                else { rhx = rhx + (1.5 - rhx) * bt; rhy = rhy + (-25 - rhy) * bt; }
            }
            arm2(g, -SH - 0.4, -27.4 - bob, -SH - 3.8, -21 - bob * 0.5, lhx, lhy, aw, shirt); ell(g, lhx, lhy + 0.6, 2.5, 2.5, skin, OUT, 0.9);
            arm2(g, SH + 0.4, -27.4 - bob, SH + 3.8, -21 - bob * 0.5, rhx, rhy, aw, shirt); ell(g, rhx, rhy + 0.6, 2.5, 2.5, skin, OUT, 0.9);
            if (o.armor) { armorPad(g, AT, AC, -SH - 0.6, -28.4 - bob, -1); armorPad(g, AT, AC, SH + 0.6, -28.4 - bob, 1); }
        }
        // cabeça (em frente/costas gira de leve para o lado do movimento ou do alvo: 3/4 suave)
        g.save(); headXf();
        const hrr = side ? hr * 0.94 : hr, tn = side ? 0 : (o.turn || 0);
        if (tn) { g.save(); g.translate(tn * 0.9, 0); g.translate(0, hy + 6); g.rotate(tn * 0.05 * (back ? -1 : 1)); g.translate(0, -(hy + 6)); }
        if (back) {
            if (race !== 'elf') earFront(g, race, hy, hr, skin, false);
            headBack(g, st, hy, hr, hc, skin, covered, race);
            if (race === 'elf') earFront(g, race, hy, hr, skin, true);
        } else if (side) {
            ell(g, 0.5, hy, hrr, 7.4, skin, OUT, 1.1);
            faceSide(g, o, D, hy, hr, skin, hc, atk, F);
            if (hasStyle) hairHeadSide(g, st, hy, hr, hc, covered);
            if (race !== 'elf') { if (hasStyle && !covered && (st === 3 || st === 4 || st === 5)) { /* cabelo cobre a orelha */ } else earSide(g, race, hy, skin, false); }
            if (race === 'elf') earSide(g, race, hy, skin, true);
        } else {
            if (race !== 'elf') earFront(g, race, hy, hr, skin, false);
            ell(g, 0, hy, hr, 7.5, skin, OUT, 1.1);
            g.beginPath(); g.ellipse(0, hy, hr - 0.6, 6.9, 0, -1.15, 1.35); g.closePath(); g.globalAlpha = 0.2; g.fillStyle = skinD; g.fill(); g.globalAlpha = 1;
            faceFront(g, o, D, hy, hr, skin, hc, atk, F);
            if (hasStyle) hairHeadFront(g, st, hy, hr, hc, covered);
            if (race === 'elf') earFront(g, race, hy, hr, skin, true);
        }
        if (o.beard && !back) beardShape(g, o.beard, view, hy, hr, race === 'dwarf');
        hat(g, o.hat, hy, view, o.hatColor, o.hatStyle);
        if (tn) g.restore();
        g.restore();   // headXf
        // braço da frente (lado)
        if (side) {
            if (o.bow && o.bt > 0.02) {   // mão de puxar: do ombro até a corda, na altura do arco
                const hx2 = wa0.x - 9.5 - 4 * o.bt, hy2 = wa0.y - 1; arm2(g, 0, -29 - bob, (hx2 - 0.5) * 0.5 - 2.6, (hy2 - 29 - bob) / 2 + 3.4, hx2, hy2, 4, shade(shirt, -0.18)); ell(g, hx2, hy2, 2.4, 2.4, skin, OUT, 0.9);
            }
            const a = wa0.a; g.save(); g.translate(1, -29 - bob); g.rotate(a); arm2(g, 0, 0, -0.9, 6, 2, 11.6, 4.4, shirt); ell(g, 2, 12.4, 2.6, 2.6, skin, OUT, 0.9); g.restore();
            if (o.armor) armorPad(g, AT, AC, 1, -29.2 - bob, 1);
        }
        g.restore();
        return info;
    }
    /* ---------- armaduras: peitoral, ombreiras e elmos por tier ---------- */
    function armorBody(g, view, T, c, SH, WA, HP, sd, bob) {
        const y = (v) => v - bob, hi = shade(c, 0.42), dk = shade(c, -0.42), side = view === 'side', back = view === 'back';
        const path = () => {
            g.beginPath();
            if (side) { g.moveTo(-sd + 0.2, y(-29.4)); g.quadraticCurveTo(0.6, y(-31.2), sd + 0.1, y(-29)); g.lineTo(sd + 0.55, y(-16.2)); g.lineTo(-sd - 0.55, y(-16.2)); }
            else { g.moveTo(-SH + 0.2, y(-29)); g.quadraticCurveTo(0, y(-31.2), SH - 0.2, y(-29)); g.quadraticCurveTo(SH + 0.5, y(-22), WA + 1.3, y(-16.2)); g.lineTo(-WA - 1.3, y(-16.2)); g.quadraticCurveTo(-SH - 0.5, y(-22), -SH + 0.2, y(-29)); }
            g.closePath();
        };
        const hw = side ? sd : SH;
        path(); paint(g, T === 0 ? c : lg(g, -hw, y(-30), hw, y(-16), [[0, shade(c, 0.32)], [0.55, c], [1, shade(c, -0.32)]]), OUT, 1.1);
        g.save(); path(); g.clip(); g.globalAlpha = 0.26; g.fillStyle = dk; g.fillRect(side ? 0.8 : hw * 0.3, y(-33), 20, 20); g.restore(); g.globalAlpha = 1;
        g.lineCap = 'round';
        const ridge = (col, a) => { g.save(); g.globalAlpha = a; g.strokeStyle = col; g.lineWidth = 0.9; g.beginPath(); g.moveTo(side ? 1.4 : 0, y(-29)); g.lineTo(side ? 1.4 : 0, y(-16.4)); g.stroke(); g.restore(); };
        const rivet = (x, yy) => { ell(g, x, y(yy), 0.7, 0.7, hi, OUT, 0.4); };
        if (T === 0) {   // couro: costura, cordões e tiras
            g.strokeStyle = dk; g.lineWidth = 0.8; g.beginPath(); g.moveTo(side ? 1.4 : 0, y(-28)); g.lineTo(side ? 1.4 : 0, y(-17)); g.stroke();
            if (!side && !back) { g.lineWidth = 0.7; g.beginPath(); for (let i = 0; i < 4; i++) { const yy = -26 + i * 3; g.moveTo(-1.8, y(yy)); g.lineTo(1.8, y(yy + 1.6)); g.moveTo(1.8, y(yy)); g.lineTo(-1.8, y(yy + 1.6)); } g.stroke(); }
            g.save(); g.globalAlpha = 0.7; g.strokeStyle = shade(c, -0.55); g.lineWidth = 1.3; g.beginPath(); g.moveTo(-hw + 1.2, y(-28.4)); g.lineTo(hw - 1.2, y(-17)); g.stroke(); g.restore();
        } else if (T <= 2) {
            ridge(dk, 0.55); if (!side) { ridge(hi, 0); g.save(); g.globalAlpha = 0.5; g.strokeStyle = hi; g.lineWidth = 0.9; g.beginPath(); g.moveTo(-hw + 1.4, y(-27)); g.quadraticCurveTo(-hw * 0.5, y(-25.4), -hw * 0.18, y(-26.6)); g.stroke(); g.restore(); }
            rivet(-hw + 1.7, -27.6); rivet(hw - 1.7, -27.6); rivet(-WA - 0.2, -17.6); rivet(WA + 0.2, -17.6);
        } else if (T === 3) {
            ridge(dk, 0.55); g.save(); g.globalAlpha = 0.55; g.strokeStyle = dk; g.lineWidth = 0.8; for (const yy of [-23, -19.6]) { g.beginPath(); g.moveTo(-hw + 0.9, y(yy)); g.lineTo(hw - 0.9, y(yy)); g.stroke(); } g.restore();
            g.save(); g.globalAlpha = 0.6; g.strokeStyle = hi; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-hw + 1.4, y(-27)); g.quadraticCurveTo(-hw * 0.5, y(-25.6), -hw * 0.18, y(-26.6)); g.stroke(); g.restore();
            rivet(-hw + 1.7, -27.6); rivet(hw - 1.7, -27.6);
        } else if (T === 4) {
            g.save(); g.strokeStyle = '#fff0a0'; g.globalAlpha = 0.9; g.lineWidth = 1.3; path(); g.stroke(); g.restore();
            if (!back) { ridge(dk, 0.35); ell(g, side ? 2 : 0, y(-23.5), 1.8, 2.2, '#d8342b', OUT, 0.8); ell(g, side ? 1.6 : -0.5, y(-24.2), 0.6, 0.6, '#ffb0a0'); }
            else ridge('#fff0a0', 0.7);
        } else if (T === 5) {
            glow(g, 0, y(-23), 9, '#6ec8ff', 0.22);
            g.save(); g.strokeStyle = '#d4f6ff'; g.globalAlpha = 0.9; g.lineWidth = 1; g.beginPath(); if (side) { g.moveTo(-sd + 1, y(-26)); g.lineTo(2, y(-22)); g.lineTo(sd - 0.4, y(-26)); } else { g.moveTo(-hw + 1.6, y(-27)); g.lineTo(0, y(-21.4)); g.lineTo(hw - 1.6, y(-27)); g.moveTo(-hw + 2.6, y(-23.4)); g.lineTo(0, y(-18.6)); g.lineTo(hw - 2.6, y(-23.4)); } g.stroke(); g.restore();
        } else if (T === 6) {
            g.strokeStyle = shade('#6b6450', 0.0); g.lineWidth = 0.9; g.beginPath();
            if (!side) { g.moveTo(0, y(-29)); g.lineTo(0, y(-16.6)); for (let i = 0; i < 4; i++) { const yy = -27 + i * 3.1; g.moveTo(-0.8, y(yy)); g.quadraticCurveTo(-hw * 0.6, y(yy - 1.2), -hw + 1.6, y(yy + 1.8)); g.moveTo(0.8, y(yy)); g.quadraticCurveTo(hw * 0.6, y(yy - 1.2), hw - 1.6, y(yy + 1.8)); } }
            else for (let i = 0; i < 4; i++) { const yy = -27 + i * 3.1; g.moveTo(-sd + 0.8, y(yy)); g.quadraticCurveTo(0, y(yy - 1.4), sd - 0.6, y(yy + 1.6)); }
            g.stroke();
        } else {   // dragão: escamas e debrum vermelho
            g.save(); path(); g.clip(); g.strokeStyle = dk; g.globalAlpha = 0.65; g.lineWidth = 0.7; for (let r = 0; r < 6; r++) for (let q = -3; q <= 3; q++) { g.beginPath(); g.arc(q * 3.4 + (r & 1) * 1.7, y(-28 + r * 2.5), 1.7, 0, PI); g.stroke(); } g.restore();
            g.save(); g.strokeStyle = '#c0392b'; g.lineWidth = 1.1; path(); g.stroke(); g.restore();
        }
        if (T >= 3) {   // gorjal (colar) e saiote de placas
            if (!side) ell(g, 0, y(-30.4), 4.4, 1.7, T === 4 ? '#e6c24a' : c, OUT, 0.9); else ell(g, 0.4, y(-30.4), 3.4, 1.7, T === 4 ? '#e6c24a' : c, OUT, 0.9);
            const tw = side ? sd : HP; g.save(); for (let i = -1; i <= 1; i++) { if (side && i) continue; const px = side ? 0.2 : i * (tw * 0.66); rrect(g, px - (side ? tw : tw * 0.34), y(-12.4), side ? tw * 2 : tw * 0.68, 5, 1.2, T === 4 ? '#e6c24a' : shade(c, -0.1), OUT, 0.8); } g.restore();
        }
    }
    function armorPad(g, T, c, x, yy, dir) {
        const hi = shade(c, 0.4), dk = shade(c, -0.4);
        if (T === 0) { ell(g, x, yy + 0.4, 2.6, 2, shade(c, -0.1), OUT, 0.8); return; }
        if (T === 5) { tri(g, x - dir * 2.2, yy + 1.8, x + dir * 5.2, yy - 5.4, x + dir * 3.4, yy + 2, '#8fd0ff', OUT, 0.8); tri(g, x - dir * 1.6, yy + 1.2, x + dir * 3.6, yy - 3.2, x + dir * 2.6, yy + 1.8, '#d4f6ff', null); }
        if (T === 6) { tri(g, x - 1.4, yy - 1.4, x + dir * 0.6, yy - 6.4, x + 1.0, yy - 1.4, '#e6e0c8', OUT, 0.7); tri(g, x + dir * 1.4, yy - 1.2, x + dir * 4.4, yy - 4.4, x + dir * 3.6, yy - 0.4, '#e6e0c8', OUT, 0.7); }
        if (T === 7) { tri(g, x - 1.2, yy - 1.4, x + dir * 0.4, yy - 7.4, x + 1.2, yy - 1.4, '#d8d0c0', OUT, 0.7); tri(g, x + dir * 1.6, yy - 1.0, x + dir * 5.6, yy - 4.2, x + dir * 4, yy, '#d8d0c0', OUT, 0.7); }
        if (T === 3) ell(g, x, yy + 1.4, 3.5, 2.2, dk, OUT, 0.9);
        ell(g, x, yy, 3.2, 2.4, T === 4 ? '#e6c24a' : c, OUT, 0.9); g.strokeStyle = hi; g.globalAlpha = 0.7; g.lineWidth = 0.8; g.beginPath(); g.arc(x - dir * 0.4, yy - 0.2, 1.9, 3.5, 5.2); g.stroke(); g.globalAlpha = 1;
        if (T === 4) { g.strokeStyle = '#fff0a0'; g.lineWidth = 0.7; g.beginPath(); g.ellipse(x, yy, 3.2, 2.4, 0, 0, TAU); g.stroke(); }
    }
    function helmKind(it) {
        const n = String((it && it.name) || '').toLowerCase(); if (/crown|tiara|circlet/.test(n)) return 'crown';
        const t = gearTier(it); return t >= 7 ? 'horned' : t === 6 ? 'skull' : t === 5 ? 'winged' : t === 4 ? 'gold' : t === 3 ? 'visor' : 'open';
    }
    function crownHat(g, hy, view, c) {
        const base = c && c !== '#b9c2cc' ? c : '#e6c24a', lt = shade(base, 0.4), w = view === 'side' ? 6.6 : 7.4, x0 = view === 'side' ? -0.4 : 0;
        g.beginPath(); g.moveTo(x0 - w, hy - 3.8);
        const n = 5; for (let i = 0; i < n; i++) { const xa = x0 - w + (2 * w) * (i / n), xb = x0 - w + (2 * w) * ((i + 0.5) / n), xc = x0 - w + (2 * w) * ((i + 1) / n); g.lineTo(xa + 0.4, hy - 6.4); g.lineTo(xb, hy - 11.6 + (i === 2 ? -2.4 : 0)); g.lineTo(xc - 0.4, hy - 6.4); }
        g.lineTo(x0 + w, hy - 3.8); g.quadraticCurveTo(x0, hy - 2.4, x0 - w, hy - 3.8); g.closePath(); paint(g, base, OUT, 1.1);
        g.strokeStyle = lt; g.globalAlpha = 0.8; g.lineWidth = 0.9; g.beginPath(); g.moveTo(x0 - w + 0.6, hy - 5); g.quadraticCurveTo(x0, hy - 3.6, x0 + w - 0.6, hy - 5); g.stroke(); g.globalAlpha = 1;
        if (view !== 'back') { ell(g, x0, hy - 4.4, 1.3, 1.2, '#d8342b', OUT, 0.6); if (view === 'front') { ell(g, x0 - 4, hy - 4.6, 0.8, 0.8, '#3b9ee8', OUT, 0.5); ell(g, x0 + 4, hy - 4.6, 0.8, 0.8, '#3b9ee8', OUT, 0.5); } }
    }
    function helmet(g, hy, view, c, style) {
        style = style || 'visor';
        const base = style === 'gold' ? '#e6c24a' : style === 'skull' ? '#e6e0c8' : style === 'horned' ? '#6a2a2a' : style === 'winged' ? '#9fc4f0' : (c || '#b9c2cc'), dk = shade(base, -0.35), lt = shade(base, 0.35);
        const open = style === 'open' || style === 'gold';
        // asas / chifres ficam atrás da calota
        if (style === 'winged') { for (let sgn = -1; sgn <= 1; sgn += 2) { if (view === 'side' && sgn > 0) continue; const X = view === 'side' ? -1 : sgn * 8; g.beginPath(); g.moveTo(X, hy - 3); g.quadraticCurveTo(X + sgn * 6, hy - 6, X + sgn * 10, hy - 15); g.quadraticCurveTo(X + sgn * 5, hy - 12, X + sgn * 4.4, hy - 11); g.quadraticCurveTo(X + sgn * 8, hy - 9.6, X + sgn * 5, hy - 7.6); g.quadraticCurveTo(X + sgn * 4, hy - 5, X, hy - 1); g.closePath(); paint(g, '#eaf6ff', OUT, 0.9); g.strokeStyle = 'rgba(80,120,170,.5)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(X + sgn * 2, hy - 4); g.lineTo(X + sgn * 8, hy - 12); g.stroke(); } }
        if (style === 'horned') { for (let sgn = -1; sgn <= 1; sgn += 2) { if (view === 'side' && sgn > 0) continue; const X = view === 'side' ? -2 : sgn * 7.4; g.beginPath(); g.moveTo(X, hy - 4); g.quadraticCurveTo(X + sgn * 6.6, hy - 5, X + sgn * 6, hy - 15); g.quadraticCurveTo(X + sgn * 3.4, hy - 8.4, X - sgn * 1.4, hy - 7); g.closePath(); paint(g, '#efe6cc', OUT, 0.9); } }
        g.beginPath();
        if (view === 'side') { g.moveTo(-8.2, hy + 3.6); g.quadraticCurveTo(-9.6, hy - 9, -0.6, hy - 9.6); g.quadraticCurveTo(7.6, hy - 9, 7.4, hy - 1.6); g.lineTo(7.4, hy - 0.6); g.lineTo(1.8, hy - 0.6); g.lineTo(1.8, hy + 4); g.lineTo(-1.2, hy + 4); g.lineTo(-1.6, hy + 3.4); g.closePath(); }
        else if (view === 'back') { g.moveTo(-8, hy + 3.4); g.quadraticCurveTo(-9.4, hy - 10, 0, hy - 10); g.quadraticCurveTo(9.4, hy - 10, 8, hy + 3.4); g.quadraticCurveTo(0, hy + 5, -8, hy + 3.4); g.closePath(); }
        else if (open) { g.moveTo(-8, hy + 3); g.quadraticCurveTo(-9.4, hy - 10, 0, hy - 10); g.quadraticCurveTo(9.4, hy - 10, 8, hy + 3); g.lineTo(6.2, hy + 3); g.lineTo(5.4, hy - 2.4); g.quadraticCurveTo(0, hy - 4.6, -5.4, hy - 2.4); g.lineTo(-6.2, hy + 3); g.closePath(); }
        else { g.moveTo(-8, hy + 3); g.quadraticCurveTo(-9.4, hy - 10, 0, hy - 10); g.quadraticCurveTo(9.4, hy - 10, 8, hy + 3); g.lineTo(6, hy + 3); g.lineTo(6, hy - 0.8); g.lineTo(-6, hy - 0.8); g.lineTo(-6, hy + 3); g.closePath(); }
        paint(g, base, OUT, 1.2);
        g.save(); g.clip(); g.globalAlpha = 0.4; g.fillStyle = dk; g.fillRect(view === 'side' ? -1 : 2, hy - 12, 12, 20); g.globalAlpha = 0.6; g.fillStyle = lt; g.beginPath(); g.ellipse(view === 'side' ? -2.4 : -3.4, hy - 6.2, 1.8, 2.8, -0.5, 0, TAU); g.fill(); g.restore(); g.globalAlpha = 1;
        // aro (faixa)
        g.strokeStyle = style === 'gold' ? '#fff0a0' : dk; g.lineWidth = 1.6; g.lineCap = 'butt'; g.beginPath();
        if (view === 'side') { g.moveTo(-8.4, hy - 2.4); g.quadraticCurveTo(0, hy - 4.4, 7.5, hy - 2.6); } else { g.moveTo(-8.3, hy - 2.4); g.quadraticCurveTo(0, hy - 4.4, 8.3, hy - 2.4); } g.stroke();
        if (view === 'front') {
            if (!open) { g.fillStyle = '#1c1c22'; g.fillRect(-4.6, hy - 0.2, 9.2, 1.7); if (style === 'skull') { ell(g, -2.4, hy + 0.6, 1.3, 1.1, '#1c1c22'); ell(g, 2.4, hy + 0.6, 1.3, 1.1, '#1c1c22'); } }
            rrect(g, -1.1, hy - 3.6, 2.2, open ? 7.2 : 6.6, 0.8, base, OUT, 0.8);   // protetor de nariz
            if (style === 'gold') ell(g, 0, hy - 5.4, 1.5, 1.4, '#d8342b', OUT, 0.7);
        } else if (view === 'side') { if (!open) { g.fillStyle = '#1c1c22'; g.fillRect(2.6, hy - 0.4, 4.6, 1.6); } else { rrect(g, 6.2, hy - 2.4, 1.6, 6, 0.8, base, OUT, 0.7); } }
        if (style === 'visor') tri(g, -1.8, hy - 9.4, 0, hy - 17, 1.8, hy - 9.4, '#c0392b', OUT, 0.8);
        else if (style === 'open') { g.strokeStyle = dk; g.lineWidth = 0.9; g.beginPath(); g.moveTo(0, hy - 9.8); g.lineTo(0, hy - 5); g.stroke(); }
        else if (style === 'gold') tri(g, -1.4, hy - 9.4, 0, hy - 14, 1.4, hy - 9.4, '#fff0a0', OUT, 0.7);
        else if (style === 'skull') { for (let i = -2; i <= 2; i++) tri(g, i * 3 - 1, hy - 9.4 + Math.abs(i) * 0.8, i * 3, hy - 13.4 + Math.abs(i) * 1.4, i * 3 + 1, hy - 9.4 + Math.abs(i) * 0.8, '#d8d0c0', OUT, 0.6); }
    }
    function hat(g, kind, hy, view, col, style) {
        if (!kind) return;
        const c = col;
        if (kind === 'cap') { g.beginPath(); g.moveTo(-8, hy - 1); g.quadraticCurveTo(-8, hy - 11, 0, hy - 10); g.quadraticCurveTo(8, hy - 11, 8, hy - 1); g.closePath(); paint(g, c || '#8a3b2a', OUT, 1.1); if (view !== 'back') rrect(g, view === 'side' ? 1 : -8, hy - 2.4, view === 'side' ? 9 : 16, 2.4, 1, shade(c || '#8a3b2a', -0.2), OUT, 0.8); }
        else if (kind === 'wizard') { g.beginPath(); g.moveTo(-9, hy - 4); g.quadraticCurveTo(-4, hy - 10, -1, hy - 24); g.quadraticCurveTo(3, hy - 26, 5, hy - 32); g.quadraticCurveTo(8, hy - 20, 9, hy - 4); g.quadraticCurveTo(0, hy - 1, -9, hy - 4); g.closePath(); paint(g, lg(g, 0, hy - 30, 0, hy - 2, [[0, shade(c || '#2b56b8', 0.2)], [1, shade(c || '#2b56b8', -0.3)]]), OUT, 1.2); ell(g, 0, hy - 3.6, 12, 2.8, shade(c || '#2b56b8', -0.15), OUT, 1.1); g.fillStyle = '#ffe36a'; ell(g, 2, hy - 13, 1.4, 1.4, '#ffe36a'); ell(g, -2, hy - 8, 1, 1, '#ffe36a'); }
        else if (kind === 'helmet') helmet(g, hy, view, c, style);
        else if (kind === 'crown') crownHat(g, hy, view, c);
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
        else if (kind === 'hammer') { g.rotate(-0.14 - a + sin(t * 3) * 0.03); limb(g, 0, 6, 0, -16, 2.4, '#6a4626'); rrect(g, -7, -24, 14, 9, 1.6, lg(g, -7, -24, 7, -15, [[0, '#b9c2cc'], [1, '#5c6672']]), OUT, 1); }
        else if (kind === 'rod') { g.rotate(-0.3 - a * 0.3); limb(g, 0, 8, 0, -34, 1.6, '#8a6a44'); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(0, -34); g.quadraticCurveTo(10, -20, 8, -8 + sin(t * 3) * 2); g.stroke(); }
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
        merchant: { hat: 'cap', hatColor: '#7a3fa0', beard: null, pack: true, prop: 'sack', hair: '#3a2a1a', hs: 0 },
        guide:    { hat: 'hood', hatColor: '#2f78b5', prop: 'scroll', cape: '#2f78b5', hair: '#6a4a2a', hs: 3 },
        smith:    { hat: null, beard: '#4a3020', apron: '#5a4030', prop: 'hammer', hair: '#3a2416', armLen: 1, hs: 0 },
        fisher:   { hat: 'fisher', hatColor: '#1f8f7f', prop: 'rod', hair: '#8a6a3a', beard: '#c9a86a', hs: 3 },
        guard:    { hat: 'helmet', hatColor: '#b9c2cc', armor: true, prop: 'spear', cape: '#3a5fa8', hair: '#3a2a1a', hs: 0 },
        priest:   { hat: 'mitre', robe: true, prop: 'cross', hair: '#d8d8d8', beard: '#e8e8e8', hs: 0 },
        wizard:   { hat: 'wizard', hatColor: '#2b56b8', robe: true, prop: 'staff', beard: '#dcdcdc', hair: '#c9c9c9', hs: 4 },
        farmer:   { hat: 'straw', prop: 'pitchfork', apron: null, hair: '#7a4a1a', beard: null, hs: 1 },
        barkeep:  { hat: null, apron: '#f2efe6', prop: 'mug', beard: '#6a3a1a', hair: '#5a3a1e', hs: 1 }
    };

    /* ---------- desenho de uma criatura no mundo ---------- */
    const shadowsOn = () => !(root.Quality && root.Quality.level === 0);   // gráficos Baixo: sem sombras de criaturas
    function speciesOf(key, def) { if (def && def.species) return def.species; return String(key || '').split('_')[0]; }
    function drawCreature(ctx, o, def, tx, ty) {
        const key = o.dbKey || ''; const sp = speciesOf(key, def);
        const ow = o.w || 30, oh = o.h || 30; const a = stepState(o, tx, ty); const now = performance.now() / 1000;
        const fx = o.x + ow / 2, fy = o.y + oh;
        if (NPCLOOK[sp]) return drawNpcHuman(ctx, o, def, sp, a, now, fx, fy);
        const S0 = S[sp];
        if (!S0) return fallbackBlob(ctx, o, def, a, now);
        const s = ow / S0.w; const face = a.face;
        if (!a.view) a.view = S0.home || 'side';
        let view = a.view; const fn = (S0.v && S0.v[view]) || null; if (!fn) view = S0.v ? (S0.home || 'side') : 'side';
        const side = view === 'side';
        // sombra
        const fly = (S0.fly || 0) * s; const sh = S0.sh || [12, 3]; const shw = side ? 1 : (S0.shF || 0.8);
        if (shadowsOn()) { ctx.fillStyle = 'rgba(0,0,0,' + (0.28 - min(0.14, fly * 0.006)) + ')'; ctx.beginPath(); ctx.ellipse(fx, fy - 1, sh[0] * s * shw * (1 - fly * 0.008), sh[1] * s * (side ? 1 : 1.12), 0, 0, TAU); ctx.fill(); }
        ctx.save(); ctx.translate(fx, fy); ctx.scale((side ? face : 1) * s, s);
        if (a.turn > 0.03) ctx.scale(1 - 0.2 * a.turn, 1);   // "giro" ao trocar de vista
        if (a.wind > 0.03) { if (side) ctx.translate(-a.wind * 2.6, 0); else ctx.scale(1 + a.wind * 0.03, 1 - a.wind * 0.055); }   // antecipação do golpe
        const st = { t: now, mv: a.mv, ph: a.ph, atk: a.atk, wind: a.wind, hurt: a.hurt, c1: (def && def.c1) || '#8e44ad', c2: (def && def.c2) || '#f1c27d', seed: a.seed, face: face, view: view, turn: a.lx, lookY: a.ly };
        try { (fn || S0.draw)(ctx, st); } catch (e) { if (!S0._err) { S0._err = 1; console.error('[art] ' + sp + ': ' + (e && e.message)); } ctx.restore(); return fallbackBlob(ctx, o, def, a, now); }
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
    }
    function fallbackBlob(ctx, o, def, a, now) {   // criaturas criadas no editor sem desenho próprio
        const ow = o.w || 30, oh = o.h || 30; const c1 = (def && def.c1) || '#8e44ad', c2 = (def && def.c2) || '#f1c27d'; const fx = o.x + ow / 2, fy = o.y + oh; const bob = abs(sin(a.ph)) * a.mv * 2;
        if (shadowsOn()) { ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(fx, fy - 1, ow * 0.4, oh * 0.1, 0, 0, TAU); ctx.fill(); }
        ctx.save(); ctx.translate(fx, fy - bob);
        rrect(ctx, -ow * 0.32, -oh * 0.7, ow * 0.64, oh * 0.55, 6, lg(ctx, 0, -oh * 0.7, 0, -oh * 0.15, [[0, shade(c1, 0.2)], [1, shade(c1, -0.3)]]), OUT, 1.2);
        ell(ctx, 0, -oh * 0.78, ow * 0.27, ow * 0.27, c2, OUT, 1.2);
        if (o.type === 'enemy') { ctx.fillStyle = '#e33'; ctx.fillRect(-ow * 0.14, -oh * 0.82, 3, 3); ctx.fillRect(ow * 0.05, -oh * 0.82, 3, 3); }
        ctx.restore();
    }
    function drawNpcHuman(ctx, o, def, sp, a, now, fx, fy) {
        const look = NPCLOOK[sp]; const ow = o.w || 30, oh = o.h || 44; const s = ow / 30;
        let view = a.view || 'front'; if (view === 'back' && a.mv < 0.35) view = 'front';   // parado nunca dá as costas ao jogador
        const side = view === 'side';
        if (shadowsOn()) { ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(fx, fy - 1, 11 * s, 3.2 * s, 0, 0, TAU); ctx.fill(); }
        ctx.save(); ctx.translate(fx, fy); ctx.scale((side ? a.face : 1) * s, s);
        if (a.turn > 0.03) ctx.scale(1 - 0.2 * a.turn, 1);
        const shirt = (def && def.c1) || '#3b7dd8', skin = (def && def.c2) || '#f1c27d';
        const pants = shade(shirt, -0.5);
        const lean = a.mv * (side ? 0.045 : 0) + sin(a.ph) * a.mv * (side ? 0 : 0.025);
        if (lean) { ctx.translate(0, -10); ctx.rotate(lean); ctx.translate(0, 10); }
        const info = human(ctx, { view: view, t: now, seed: a.seed, mv: a.mv, ph: a.ph, skin, shirt, pants, hair: look.hair, hairStyle: look.hs, hat: look.hat, hatColor: look.hatColor, beard: look.beard, apron: look.apron, robe: look.robe, armor: look.armor, cape: look.cape, pack: look.pack, atk: 0, turn: side ? 0 : a.lx, lookX: side ? 0 : a.lx });
        if (look.prop) { const wob = sin(now * 1.6 + a.seed) * 0.6; if (view === 'back') { ctx.save(); ctx.scale(-1, 1); prop(ctx, look.prop, 13, -18.2 - info.bob + wob, now, 0, 'front'); ctx.restore(); } else prop(ctx, look.prop, side ? 7 : 13, -18.2 - info.bob + wob, now, 0, view); }
        ctx.restore();
        // ícone de conversa
        const bounce = sin(now * 3 + a.seed) * 1.5; ctx.fillStyle = '#f1c40f'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3;
        ctx.strokeText('💬', fx, fy - oh - 4 + bounce); ctx.fillText('💬', fx, fy - oh - 4 + bounce); ctx.textAlign = 'start';
    }

    /* ---------- personagem do jogador ---------- */
    const _pst = {};
    function armorColor(item, fallback) {
        if (!item || !item.name) return fallback; if (typeof item.col === 'string' && /^#[0-9a-fA-F]{6}$/.test(item.col)) return item.col; const n = item.name.toLowerCase();
        if (n.includes('gold')) return '#e6c24a';
        if (n.includes('mithril')) return '#5aa8ff'; if (n.includes('steel')) return '#c3cbd6'; if (n.includes('bone') || n.includes('lich')) return '#e6e0c8'; if (n.includes('dragon')) return '#8a2a2a'; if (n.includes('iron')) return '#9aa3ad'; if (n.includes('bronze')) return '#b8783a'; if (n.includes('leather')) return '#8b5a2b'; return fallback;
    }
    // estado do quadro atual (funções estáticas abaixo leem daqui: sem closures por quadro)
    const _W = { wp: null, sh: null, view: 'front', anim: 0, skin: '#f1c27d', D: null };
    /* ============ ESTILO DOS ITENS EQUIPADOS (cada tipo/tier tem forma própria, não só outra cor) ============ */
    function gearTier(it) {
        const n = String((it && it.name) || '').toLowerCase();
        if (/dragon/.test(n)) return 7; if (/lich|bone/.test(n)) return 6; if (/mithril/.test(n)) return 5; if (/gold/.test(n)) return 4;
        if (/steel/.test(n)) return 3; if (/iron/.test(n)) return 2; if (/bronze/.test(n)) return 1; if (/leather|wood|cloth|linen/.test(n)) return 0;
        const v = Math.max((it && it.bonusDmg) | 0, (it && (it.bonusDef || it.def)) | 0);
        return v >= 15 ? 6 : v >= 10 ? 5 : v >= 7 ? 3 : v >= 4 ? 2 : 1;
    }
    const HEXC = /^#[0-9a-fA-F]{6}$/;
    function gearCol(it, fb) { const n = String((it && it.name) || '').toLowerCase(); if (!(it && HEXC.test(it.col || '')) && /wood/.test(n)) return '#a8743a'; return armorColor(it, fb); }
    function swordKind(it) {
        const n = String((it && it.name) || '').toLowerCase(), t = gearTier(it);
        if (/dagger|knife|shiv|dirk/.test(n)) return 'dagger'; if (/mace|club|hammer|flail|maul/.test(n)) return 'mace';
        if (/scimitar|sabre|saber|katana|cutlass|curved/.test(n)) return 'curved'; if (/great|claymore|2h|zweih|executioner/.test(n)) return 'great';
        if (t >= 7) return 'dragon'; if (t === 6) return 'bone'; if (t === 5) return 'mithril'; if (t === 4) return 'gold'; if (t === 3) return 'long';
        return t === 2 ? 'broad' : 'short';
    }
    function drawSwordShape(ctx, kind, mc) {
        const ln = (x0, y0, x1, y1, w, c) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
        const grip = (len, c, wrap) => { rrect(ctx, -1.6, -4, 3.2, len, 1.2, c || '#6b3f1c', OUT, 0.9); if (wrap) { ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 0.7; for (let y = -2; y < len - 5; y += 2.4) { ctx.beginPath(); ctx.moveTo(-1.6, y); ctx.lineTo(1.6, y + 1.2); ctx.stroke(); } } };
        const blade = (pts, hi) => { poly(ctx, pts, lg(ctx, -3.4, 0, 3.4, 0, [[0, shade(hi || mc, 0.55)], [0.5, shade(hi || mc, 0.12)], [1, shade(hi || mc, -0.4)]]), OUT, 1.1); };
        const guard = (w, c, curve) => { ctx.beginPath(); ctx.moveTo(-w, -6.6 + (curve ? 1.6 : 0)); ctx.quadraticCurveTo(0, -8.4 - (curve ? 1 : 0), w, -6.6 + (curve ? 1.6 : 0)); ctx.lineTo(w - 0.6, -3.9); ctx.quadraticCurveTo(0, -5.6, -w + 0.6, -3.9); ctx.closePath(); paint(ctx, c, OUT, 0.9); };
        const gold = '#d2a437', pommel = (c, r) => ell(ctx, 0, 8.6, r || 2.3, r || 2.3, c, OUT, 0.9);
        if (kind === 'dagger') { blade([-1.7, -5, 1.7, -5, 1.4, -17, 0, -21, -1.4, -17], mc); ln(0, -7, 0, -17, 0.7, 'rgba(255,255,255,.5)'); guard(3.6, '#8a6a3a'); grip(8, '#5a3a1c', 1); pommel('#8a6a3a', 1.9); }
        else if (kind === 'mace') { rrect(ctx, -1.3, -22, 2.6, 30, 1.2, '#6b3f1c', OUT, 0.9); ell(ctx, 0, -24, 5, 5, lg(ctx, -5, -29, 5, -19, [[0, shade(mc, 0.5)], [1, shade(mc, -0.4)]]), OUT, 1); for (let a = 0; a < 6; a++) { const r = a * 1.0472; tri(ctx, Math.cos(r - 0.3) * 4.6, -24 + Math.sin(r - 0.3) * 4.6, Math.cos(r) * 8, -24 + Math.sin(r) * 8, Math.cos(r + 0.3) * 4.6, -24 + Math.sin(r + 0.3) * 4.6, shade(mc, 0.1), OUT, 0.7); } ell(ctx, 0, 8.6, 2, 2, '#8a6a3a', OUT, 0.8); }
        else if (kind === 'curved') { ctx.beginPath(); ctx.moveTo(-2.4, -5); ctx.quadraticCurveTo(-3.2, -20, 4.8, -29); ctx.quadraticCurveTo(3.2, -18, 2.6, -5); ctx.closePath(); paint(ctx, lg(ctx, -3, 0, 4, 0, [[0, shade(mc, 0.55)], [0.5, shade(mc, 0.1)], [1, shade(mc, -0.4)]]), OUT, 1.1); ell(ctx, 0, -5.4, 4.6, 1.5, '#d2a437', OUT, 0.9); grip(9, '#5a3a1c', 1); pommel('#d2a437', 2); }
        else if (kind === 'great') { blade([-3.4, -6, 3.4, -6, 3, -36, 0, -42, -3, -36], mc); ln(0, -9, 0, -36, 1, 'rgba(255,255,255,.5)'); guard(8.6, '#7a7f88', 1); grip(13, '#4a2f16', 1); pommel('#7a7f88', 2.6); }
        else if (kind === 'broad') { blade([-3.2, -5, 3.2, -5, 3.0, -23, 0, -29, -3.0, -23], mc); ln(0, -8, 0, -23, 0.9, 'rgba(255,255,255,.45)'); guard(6.6, '#8a6a3a'); grip(10, '#6b3f1c', 1); pommel('#8a6a3a'); }
        else if (kind === 'long') { blade([-2.8, -5, 2.8, -5, 2.5, -29, 0, -35, -2.5, -29], mc); ln(0, -8, 0, -30, 1, 'rgba(255,255,255,.55)'); ln(-1, -9, -1, -28, 0.5, 'rgba(0,0,0,.18)'); guard(7.6, '#c9a234', 1); grip(11, '#2f3b52', 1); pommel('#c9a234', 2.5); }
        else if (kind === 'gold') { blade([-2.8, -5, 2.8, -5, 2.5, -29, 0, -35, -2.5, -29], '#e6c24a'); ln(0, -8, 0, -30, 1, 'rgba(255,255,255,.6)'); guard(8, '#e6c24a', 1); ell(ctx, 0, -5.6, 1.5, 1.5, '#d8342b', OUT, 0.7); grip(11, '#7a1f1f', 1); pommel('#e6c24a', 2.6); ell(ctx, 0, 8.6, 1, 1, '#d8342b'); }
        else if (kind === 'mithril') { glow(ctx, 0, -20, 15, '#6ec8ff', 0.28); blade([-2.6, -5, 2.6, -5, 2.3, -30, 0, -37, -2.3, -30], '#9fd2ff'); ln(0, -8, 0, -31, 1, 'rgba(255,255,255,.75)'); ctx.beginPath(); ctx.moveTo(-8.6, -9); ctx.quadraticCurveTo(-4, -10, 0, -6.4); ctx.quadraticCurveTo(4, -10, 8.6, -9); ctx.quadraticCurveTo(5, -4.4, 0, -3.4); ctx.quadraticCurveTo(-5, -4.4, -8.6, -9); ctx.closePath(); paint(ctx, '#3b6fc4', OUT, 0.9); ell(ctx, 0, -5.4, 1.6, 1.6, '#bff0ff', OUT, 0.6); grip(11, '#20304f', 1); pommel('#3b6fc4', 2.6); }
        else if (kind === 'bone') { ctx.beginPath(); ctx.moveTo(-2.6, -5); ctx.lineTo(-3.6, -11); ctx.lineTo(-2.4, -13); ctx.lineTo(-3.4, -19); ctx.lineTo(-2.2, -21); ctx.lineTo(-2.6, -28); ctx.lineTo(0, -35); ctx.lineTo(2.6, -28); ctx.lineTo(2.2, -21); ctx.lineTo(3.4, -19); ctx.lineTo(2.4, -13); ctx.lineTo(3.6, -11); ctx.lineTo(2.6, -5); ctx.closePath(); paint(ctx, lg(ctx, -3, 0, 3, 0, [[0, '#f4efdc'], [1, '#b8b095']]), OUT, 1.1); ln(0, -8, 0, -30, 0.7, 'rgba(90,70,40,.4)'); ell(ctx, 0, -5.4, 4.6, 2, '#e6e0c8', OUT, 0.9); ell(ctx, -1, -5.6, 0.8, 0.8, '#2a2418'); ell(ctx, 1, -5.6, 0.8, 0.8, '#2a2418'); grip(10, '#4a4030', 0); ell(ctx, 0, 8.6, 2.4, 2.4, '#e6e0c8', OUT, 0.9); }
        else if (kind === 'dragon') { glow(ctx, 0, -18, 15, '#ff5a1a', 0.32); ctx.beginPath(); ctx.moveTo(-2.8, -5); ctx.lineTo(-4.2, -9); ctx.lineTo(-2.6, -11); ctx.lineTo(-4.0, -16); ctx.lineTo(-2.4, -18); ctx.lineTo(-3.4, -24); ctx.lineTo(-2.2, -26); ctx.lineTo(0, -37); ctx.lineTo(2.2, -26); ctx.lineTo(2.6, -22); ctx.lineTo(2.6, -5); ctx.closePath(); paint(ctx, lg(ctx, -4, 0, 3, 0, [[0, '#ff7a3a'], [0.45, '#b62a22'], [1, '#4a0f12']]), OUT, 1.1); ln(0.4, -8, 0.4, -30, 0.8, 'rgba(255,200,120,.7)'); ctx.beginPath(); ctx.moveTo(-9, -4); ctx.lineTo(-5, -9.4); ctx.lineTo(-2, -6.4); ctx.lineTo(0, -8.4); ctx.lineTo(2, -6.4); ctx.lineTo(5, -9.4); ctx.lineTo(9, -4); ctx.lineTo(4, -4.6); ctx.lineTo(0, -3.2); ctx.lineTo(-4, -4.6); ctx.closePath(); paint(ctx, '#2a1416', OUT, 0.9); grip(10, '#2a1416', 1); tri(ctx, -2, 7.6, 0, 12.6, 2, 7.6, '#c0392b', OUT, 0.8); }
        else { blade([-2.5, -5, 2.5, -5, 2.4, -24, 0, -30, -2.4, -24], mc); ln(0, -8, 0, -25, 0.8, 'rgba(255,255,255,.5)'); guard(5.6, '#c9a234'); grip(10, '#6b3f1c', 1); pommel('#c9a234'); }
    }
    function shieldKind(it) {
        const n = String((it && it.name) || '').toLowerCase(), t = gearTier(it);
        if (/wood|buckler/.test(n)) return 'wood'; if (t >= 7) return 'dragon'; if (t === 6) return 'bone'; if (t === 5) return 'mithril'; if (t === 4) return 'gold'; if (t >= 2) return 'heater'; return 'round';
    }
    function drawShieldFace(g, cx, cy, rx, ry, col, kind) {
        kind = kind || 'round';
        const dk = shade(col, -0.38), lt = shade(col, 0.32);
        const shade2 = (clipDraw) => { g.save(); clipDraw(); g.clip(); g.globalAlpha = 0.3; g.fillStyle = dk; g.fillRect(cx + rx * 0.15, cy - ry - 3, rx * 2, ry * 2 + 6); g.restore(); g.globalAlpha = 1; };
        if (kind === 'heater' || kind === 'gold' || kind === 'mithril') {
            const path = (k) => { const x = rx * k, yt = cy - ry * k, yb = cy + ry * 1.12 * (k > 0.9 ? 1 : 0.9); g.beginPath(); g.moveTo(cx - x, yt + 0.8); g.quadraticCurveTo(cx, yt - 2.2, cx + x, yt + 0.8); g.lineTo(cx + x, cy + ry * 0.12); g.quadraticCurveTo(cx + x * 0.85, cy + ry * 0.8, cx, yb); g.quadraticCurveTo(cx - x * 0.85, cy + ry * 0.8, cx - x, cy + ry * 0.12); g.closePath(); };
            path(1); paint(g, dk, OUT, 1.2); path(0.82); g.fillStyle = col; g.fill();
            shade2(() => path(0.82));
            g.strokeStyle = lt; g.globalAlpha = 0.6; g.lineWidth = 0.8; path(0.82); g.stroke(); g.globalAlpha = 1;
            if (kind === 'heater') { g.fillStyle = shade(col, -0.2); g.fillRect(cx - 0.9, cy - ry * 0.8, 1.8, ry * 1.7); g.fillRect(cx - rx * 0.6, cy - ry * 0.28, rx * 1.2, 1.8); ell(g, cx, cy - ry * 0.2, 1.5, 1.5, lt, OUT, 0.6); }
            else if (kind === 'gold') { ell(g, cx, cy - ry * 0.12, rx * 0.42, ry * 0.4, '#d8342b', OUT, 0.9); ell(g, cx - 0.5, cy - ry * 0.25, 0.9, 0.7, '#ff9a8a'); for (const [dx, dy] of [[-0.62, -0.7], [0.62, -0.7]]) ell(g, cx + rx * dx, cy + ry * dy, 1, 1, lt, OUT, 0.5); }
            else { glow(g, cx, cy, rx * 1.6, '#6ec8ff', 0.28); tri(g, cx - rx * 0.7, cy - ry * 0.55, cx, cy - ry * 0.05, cx - rx * 0.1, cy + ry * 0.55, '#bff0ff', OUT, 0.7); tri(g, cx + rx * 0.7, cy - ry * 0.55, cx, cy - ry * 0.05, cx + rx * 0.1, cy + ry * 0.55, '#8fd0ff', OUT, 0.7); }
            return;
        }
        if (kind === 'wood') {
            ell(g, cx, cy, rx, ry, dk, OUT, 1.2); g.save(); g.beginPath(); g.ellipse(cx, cy, rx - 1, ry - 1, 0, 0, TAU); g.clip(); g.fillStyle = col; g.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
            g.strokeStyle = shade(col, -0.35); g.lineWidth = 0.8; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(cx + i * rx * 0.4, cy - ry); g.lineTo(cx + i * rx * 0.4, cy + ry); g.stroke(); }
            g.fillStyle = shade(col, -0.3); g.fillRect(cx - rx, cy - 1.2, rx * 2, 2.4); g.restore(); ell(g, cx, cy, rx * 0.3, ry * 0.26, '#8a929c', OUT, 0.8); return;
        }
        if (kind === 'bone') {
            ell(g, cx, cy, rx, ry, dk, OUT, 1.2); ell(g, cx, cy, rx - 1.1, ry - 1.1, '#e6e0c8', null);
            ell(g, cx - rx * 0.28, cy - ry * 0.1, rx * 0.2, ry * 0.2, '#2a2418'); ell(g, cx + rx * 0.28, cy - ry * 0.1, rx * 0.2, ry * 0.2, '#2a2418');
            g.strokeStyle = '#2a2418'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(cx - rx * 0.4, cy + ry * 0.45); g.lineTo(cx + rx * 0.4, cy + ry * 0.45); for (let i = -1; i <= 1; i++) { g.moveTo(cx + i * rx * 0.2, cy + ry * 0.35); g.lineTo(cx + i * rx * 0.2, cy + ry * 0.55); } g.stroke(); return;
        }
        if (kind === 'dragon') {
            for (let a = 0; a < 8; a++) { const r = a * 0.7854; tri(g, cx + Math.cos(r - 0.22) * rx, cy + Math.sin(r - 0.22) * ry, cx + Math.cos(r) * (rx + 3), cy + Math.sin(r) * (ry + 3), cx + Math.cos(r + 0.22) * rx, cy + Math.sin(r + 0.22) * ry, '#d8d0c0', OUT, 0.7); }
            ell(g, cx, cy, rx, ry, dk, OUT, 1.2); ell(g, cx, cy, rx - 1.2, ry - 1.2, col, null);
            g.save(); g.beginPath(); g.ellipse(cx, cy, rx - 1.2, ry - 1.2, 0, 0, TAU); g.clip(); g.strokeStyle = shade(col, -0.45); g.lineWidth = 0.8; for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) { g.beginPath(); g.arc(cx + c * 3.2 + (r & 1) * 1.6, cy + r * 3, 1.7, 0, PI); g.stroke(); } g.restore();
            ell(g, cx, cy, rx * 0.34, ry * 0.3, '#e8c04a', OUT, 0.8); return;
        }
        // round (bronze / padrão): aro, bossa, rebites
        ell(g, cx, cy, rx, ry, dk, OUT, 1.2); ell(g, cx, cy, rx - 1.3, ry - 1.3, col, null); ell(g, cx - 0.8, cy - 1.2, rx - 2.6, ry - 2.8, shade(col, 0.12), null);
        g.strokeStyle = lt; g.globalAlpha = 0.7; g.lineWidth = 0.9; g.beginPath(); g.ellipse(cx, cy, rx - 0.9, ry - 0.9, 0, 3.5, 5.0); g.stroke(); g.globalAlpha = 1;
        for (let a = 0; a < 6; a++) { const r = a * 1.0472 + 0.5; ell(g, cx + Math.cos(r) * (rx - 1.9), cy + Math.sin(r) * (ry - 1.9), 0.55, 0.55, lt); }
        ell(g, cx, cy, rx * 0.36, ry * 0.3, lt, OUT, 0.8);
    }
    function shieldOnBack(g, info) {   // arqueiros levam o escudo nas costas
        if (!_W.shBack) return; const sh = _W.sh, sx = info.sx || 1, sy = info.sy || 1;
        drawShieldFace(g, 0, -23 * sy - (info.bob || 0), 6.6 * sx, 8 * sy, gearCol(sh, '#9aa3ad'), shieldKind(sh));
    }
    function underFn(g, info) {
        try { if (_W.shBack && _W.view === 'front') { const sx = info.sx || 1, sy = info.sy || 1; drawShieldFace(g, -4.4 * sx, -25 * sy - (info.bob || 0), 6.6 * sx, 8 * sy, gearCol(_W.sh, '#9aa3ad'), shieldKind(_W.sh)); } } catch (e) { }
        try { if (_W.eq && _W.eq.body && _W.eq.body.mimic) root.Mimic.under(g, _W.view, _W.eq, info, _W.now); } catch (e) { }
    }
    function behindFn(g, info) {   // arma de costas / escudo de lado e de costas: ficam ATRÁS do tronco (o escudo é carregado no braço, não nas costas)
        const W = _W;
        if (W.view === 'back') {
            if (W.sh && !W.shBack) { const c = gearCol(W.sh, '#9aa3ad'), H = info.handL, k = shieldKind(W.sh); ell(g, H.x - 2.6, H.y - 3.6, 2.5, 8.4, shade(c, -0.32), OUT, 1.1); ell(g, H.x - 2.2, H.y - 3.6, 1.2, 6.6, shade(c, 0.02), null); if (k === 'dragon') for (let i = -2; i <= 2; i++) tri(g, H.x - 4.6, H.y - 3.6 + i * 3, H.x - 7.2, H.y - 3.6 + i * 3.4, H.x - 4.6, H.y - 2.2 + i * 3, '#d8d0c0', OUT, 0.5); }
            if (W.wp) drawWeapon(g, W.wp, info.hand, 'back', W.anim, W.skin);
        } else if (W.view === 'side' && W.sh && W.shBack) {
            const sdd = 2.6 + W.D.sh * 0.25, c = gearCol(W.sh, '#9aa3ad'), cx = -(sdd + 2.2) * W.D.sx, cy = -21 * W.D.sy - info.bob;
            ell(g, cx, cy, 2.6, 8.2, shade(c, -0.3), OUT, 1.1); ell(g, cx - 0.2, cy, 1.4, 6.6, shade(c, 0.05), null);
        } else if (W.view === 'side' && W.sh) {
            const sdd = 2.6 + W.D.sh * 0.25, c = gearCol(W.sh, '#9aa3ad'), cx = (sdd + 3.2) * W.D.sx, cy = -19.5 * W.D.sy - info.bob;
            ell(g, cx, cy, 2.6, 8.2, shade(c, -0.3), OUT, 1.1); ell(g, cx + 0.2, cy, 1.4, 6.6, shade(c, 0.05), null); ell(g, cx, cy, 0.9, 1.6, shade(c, 0.35), null);
        }
    }
    function onBackFn() { }
    /* arco: a mão segura o CABO (centro do arco, origem); a corda fica atrás e puxa um pouco no disparo. Formas do Mímico: w_long, w_recurve, w_dragon, w_elven */
    function drawBowShape(ctx, wp, pull, view) {
        const fm = typeof wp.mfm === 'string' ? wp.mfm : '', hexc = (typeof wp.col === 'string' && /^#[0-9a-fA-F]{6}$/.test(wp.col)) ? wp.col : '#a85a1a';
        const P = { std: { L: 19, b: 8, r: 0, col: hexc, tip: '#e8d8a8', w: 3.2 }, w_long: { L: 25, b: 7, r: 0, col: '#8b5a2b', tip: '#d8c090', w: 2.8 }, w_recurve: { L: 20, b: 9.5, r: 5, col: '#6b3f1e', tip: '#e8b93c', w: 3.2 }, w_dragon: { L: 23, b: 9.5, r: 5, col: '#8e1b22', tip: '#e8b93c', w: 3.6 }, w_elven: { L: 24, b: 9.5, r: 4, col: '#dcc690', tip: '#e8b93c', w: 2.6 } };
        const B = P[fm] || P.std, N = 14, pt = (u, sg) => { const x = -B.b * u * u + B.r * Math.pow(Math.max(0, u - 0.62) / 0.38, 2) * 1; return [x, sg * u * B.L]; };
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const tipT = pt(1, -1), tipB = pt(1, 1), pl = pull * 4;
        // corda
        ctx.strokeStyle = 'rgba(245,245,245,0.92)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(tipT[0], tipT[1]); ctx.lineTo(tipT[0] - 1 - pl, 0); ctx.lineTo(tipB[0], tipB[1]); ctx.stroke();
        if (pull > 0.12 && view === 'side') {   // flecha encaixada: da corda até além do cabo
            const x0 = tipT[0] - 1 - pl; ctx.strokeStyle = OUT; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(17, 0); ctx.stroke(); ctx.strokeStyle = '#d8c090'; ctx.lineWidth = 1.2; ctx.stroke();
            ctx.fillStyle = '#cfd8dc'; ctx.strokeStyle = OUT; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(16.5, -2); ctx.lineTo(21, 0); ctx.lineTo(16.5, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#e8483a'; ctx.beginPath(); ctx.moveTo(x0 + 0.4, 0); ctx.lineTo(x0 + 3.6, -2); ctx.lineTo(x0 + 4.4, 0); ctx.lineTo(x0 + 3.6, 2); ctx.closePath(); ctx.fill();
        }
        // braços (afinam até a ponta): contorno primeiro, depois a cor
        for (const pass of [0, 1]) for (const sg of [-1, 1]) for (let k = 0; k < N; k++) {
            const a = pt(k / N, sg), b = pt((k + 1) / N, sg), w = (B.w * (1 - 0.5 * k / N)) + (pass ? 0 : 1.5);
            ctx.strokeStyle = pass ? B.col : OUT; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 0.7; for (const sg of [-1, 1]) { ctx.beginPath(); for (let k = 1; k < N - 2; k++) { const a = pt(k / N, sg); ctx.lineTo(a[0] + 0.7, a[1]); } ctx.stroke(); }
        // pontas (nock)
        for (const t of [tipT, tipB]) ell(ctx, t[0], t[1], 1.5, 1.5, B.tip, OUT, 0.6);
        if (fm === 'w_dragon') {   // chifre de dragão: espinhos dourados nas costas dos braços e garras nas pontas
            ctx.fillStyle = '#e8b93c'; ctx.strokeStyle = OUT; ctx.lineWidth = 0.6;
            for (const sg of [-1, 1]) {
                for (let i = 0; i < 4; i++) { const a = pt(0.2 + i * 0.2, sg), l = 3.6 - i * 0.6; ctx.beginPath(); ctx.moveTo(a[0] + 0.9, a[1] - sg * 1.3); ctx.lineTo(a[0] + 0.9 + l, a[1] + sg * 0.6 - sg * l * 0.2); ctx.lineTo(a[0] + 1, a[1] + sg * 1.4); ctx.closePath(); ctx.fill(); ctx.stroke(); }
                const t = pt(1, sg); ctx.beginPath(); ctx.moveTo(t[0] - 1.4, t[1]); ctx.quadraticCurveTo(t[0] + 2.5, t[1] + sg * 1.5, t[0] + 3.4, t[1] + sg * 5); ctx.quadraticCurveTo(t[0] + 0.6, t[1] + sg * 2.6, t[0] + 1.2, t[1] - sg * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();   // garra na ponta
                ctx.strokeStyle = 'rgba(255,170,120,0.55)'; ctx.lineWidth = 0.6; ctx.beginPath(); for (let k = 1; k < N - 3; k++) { const a = pt(k / N, sg); ctx.lineTo(a[0] - 0.6, a[1]); } ctx.stroke(); ctx.strokeStyle = OUT;
            }
            for (const sg of [-1, 1]) { ctx.beginPath(); ctx.moveTo(1.2, sg * 1.4); ctx.quadraticCurveTo(5.4, sg * 4.6, 2.4, sg * 8); ctx.quadraticCurveTo(3, sg * 4.4, -0.4, sg * 3.2); ctx.closePath(); ctx.fillStyle = '#e8b93c'; ctx.fill(); ctx.stroke(); }   // asinhas douradas no cabo
        } else if (fm === 'w_elven') {
            ctx.fillStyle = B.tip; ctx.strokeStyle = OUT; ctx.lineWidth = 0.6;
            for (const sg of [-1, 1]) for (let i = 0; i < 3; i++) { const a = pt(0.28 + i * 0.22, sg); ctx.beginPath(); ctx.moveTo(a[0] + 0.8, a[1]); ctx.quadraticCurveTo(a[0] + 4.4, a[1] - sg * 1.2, a[0] + 1.2, a[1] - sg * 3.6); ctx.quadraticCurveTo(a[0] + 1.6, a[1] - sg * 1.4, a[0] + 0.8, a[1]); ctx.fill(); ctx.stroke(); }
        } else if (fm === 'w_recurve') {
            ctx.strokeStyle = B.tip; ctx.lineWidth = 1; for (const sg of [-1, 1]) { const a = pt(0.12, sg), b2 = pt(0.2, sg); ctx.beginPath(); ctx.moveTo(a[0] - 1.6, a[1]); ctx.lineTo(b2[0] - 1.6, b2[1]); ctx.stroke(); }
        }
        // empunhadura (cabo) e gema
        rrect(ctx, -2.2, -4.6, 4.4, 9.2, 1.6, fm === 'w_dragon' ? '#3a1f1a' : fm === 'w_elven' ? '#4f6b3a' : '#4a2f16', OUT, 0.9);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.6; for (let y = -3; y <= 3; y += 2) { ctx.beginPath(); ctx.moveTo(-2, y); ctx.lineTo(2, y + 1); ctx.stroke(); }
        if (fm === 'w_elven') ell(ctx, 1.2, 0, 1.3, 1.3, '#7dffb0', OUT, 0.5); else if (fm === 'w_dragon') ell(ctx, 1.2, 0, 1.3, 1.3, '#ff8a3a', OUT, 0.5);
    }
    function drawWeapon(ctx, wp, H, view, anim, skin) {
        const prg = anim > 0 ? anim / 15 : 0, swing = sin(prg * PI);
        const light = wp.tool === 'magic' || wp.tool === 'ranged';
        ctx.save(); ctx.translate(H.x, H.y);
        let rot;
        if (view === 'front') { ctx.scale(-1, 1); rot = 0.3 + swing * (light ? 0.5 : 1.7); }
        else if (view === 'back') rot = 0.34 + swing * (light ? 0.15 : 0.5);
        else if (view === 'side') rot = 0.72 + H.a * 0.45 + swing * (light ? 0.3 : 0.7);
        else rot = 0.3;
        if (wp.tool === 'ranged') rot = rot * 0.3 - 0.04;   // arco fica quase na vertical
        ctx.rotate(rot);
        const wood = '#8b5a2b', woodL = '#b07a3f', mc = armorColor(wp, '#c9d1d8'), steel = wp.tool ? '#b9c2cc' : mc;
        const handle = (y0, y1, w) => { limb(ctx, 0, y0, 0, y1, w + 1.4, OUT); limb(ctx, 0, y0, 0, y1, w, wood); ctx.fillStyle = woodL; ctx.fillRect(-w / 2 + 0.3, y1, 0.9, y0 - y1); };
        if (wp.tool === 'magic') { handle(14, -24, 2.4); ctx.fillStyle = '#4a2f16'; ctx.fillRect(-1.8, -3, 3.6, 3); ell(ctx, 0, -29, anim > 0 ? 6 : 4.6, anim > 0 ? 6 : 4.6, rg(ctx, -1, -30, 0, 7, [[0, '#fff'], [0.4, anim > 0 ? '#1abc9c' : (/^#[0-9a-fA-F]{6}$/.test(wp.gem || '') ? wp.gem : '#6ec8ff')], [1, '#2b56b8']]), OUT, 0.9); glow(ctx, 0, -29, 14, /^#[0-9a-fA-F]{6}$/.test(wp.gem || '') ? wp.gem : '#6ec8ff', 0.4); }
        else if (wp.tool === 'ranged') drawBowShape(ctx, wp, H.bt != null ? H.bt : swing, view);
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
        else if (wp.tool === 'rod') { handle(14, -34, 1.9); ctx.strokeStyle = 'rgba(245,245,245,0.9)'; ctx.lineWidth = 0.8; if (!root.__rodOut) { ctx.beginPath(); ctx.moveTo(0, -34); ctx.quadraticCurveTo(9, -28, 7, -16); ctx.stroke(); ell(ctx, 7, -14.6, 1.6, 1.6, '#e8483a', OUT, 0.6); } ell(ctx, -2.4, -7, 2.4, 2.4, '#8a929c', OUT, 0.7); }
        else drawSwordShape(ctx, swordKind(wp), mc);   // espada (formas por tipo/tier)
        ell(ctx, 0, 1, 3.1, 3.3, skin, OUT, 0.9);   // punho por cima do cabo
        ctx.restore();
    }
    const _baseO = {};
    /* desenha a pessoa com os pés em (0,0); a vista 'side' olha para a direita (quem chama espelha) */
    function renderPerson(ctx, view, mv, ph, anim, equip, L, now, turn) {
        const wp = equip ? equip.weapon : null, sh = equip ? equip.shield : null, body = equip ? equip.body : null, hd = equip ? equip.head : null;
        const D = dimsOf(L.sex, L.race), atk = anim > 0 ? sin((anim / 15) * PI) : 0;
        _W.wp = wp; _W.sh = sh; _W.view = view; _W.anim = anim; _W.skin = L.skin || '#f1c27d'; _W.D = D;
        const o = _baseO; o.view = view; o.t = now; o.seed = 3; o.turn = turn || 0; o.lookX = turn || 0; o.mv = mv; o.ph = ph; o.atk = atk; o.sex = L.sex; o.race = L.race; o.hairStyle = L.hairStyle | 0; o.hair = L.hair; o.skin = L.skin; o.shirt = (body && body.robe) ? armorColor(body, L.shirt) : L.shirt; o.armorT = body ? gearTier(body) : null; o.armorCol = body ? armorColor(body, '#aab3bd') : null; o.pants = L.pants;
        o.armor = !!body && !body.robe; o.hat = hd ? (hd.hat === 'wizard' || hd.hat === 'hood' ? hd.hat : (helmKind(hd) === 'crown' ? 'crown' : 'helmet')) : null; o.hatStyle = hd ? helmKind(hd) : null; o.hatColor = armorColor(hd, '#b9c2cc'); o.beard = (L.sex !== 'f' && (L.beard === 1 || (L.beard === undefined && L.race === 'dwarf'))) ? shade(L.hair || '#5a3a1e', -0.08) : null;
        const bow = !!(wp && wp.tool === 'ranged'); o.bow = bow; o.bt = bow ? 0.85 * (1 - 0.85 * (anim > 0 ? sin((anim / 15) * PI) : 0)) : 0; _W.shBack = !!(bow && sh); o.behind = (wp || sh) ? behindFn : null; o.onBack = (bow && sh) ? shieldOnBack : (sh ? onBackFn : null); o.cape = null; o.apron = null; o.robe = !!(body && body.robe); o.pack = null; o.belt = null; o.boots = null; o.hatColor = o.hatColor;
        _W.eq = equip; _W.now = now; o.under = (_W.shBack && view === 'front') || (body && body.mimic && root.Mimic && root.Mimic.under && view !== 'back') ? underFn : null;
        const info = human(ctx, o);
        if (view === 'front' && sh && !_W.shBack) { const H = info.handL; drawShieldFace(ctx, H.x + 1.2, H.y - 4.4, 6.6, 7.8, gearCol(sh, '#9aa3ad'), shieldKind(sh)); }
        if (wp && view !== 'back') drawWeapon(ctx, wp, info.hand, view, anim, _W.skin);
        if (equip && root.Mimic && ((hd && hd.mimic) || (body && body.mimic) || (wp && wp.mimic) || (sh && sh.mimic))) { try { root.Mimic.overlay(ctx, view, equip, info, now); } catch (e) { } }   // itens Mímicos (mimic.js)
        return info;
    }
    function drawPlayer(ctx, px, py, facing, anim, equip, name, isMain, extra) {
        extra = extra || {}; const key = name || '_'; const now = performance.now() / 1000;
        const p = _pst[key] || (_pst[key] = { x: px, y: py, mv: 0, ph: 0, view: null, vc: 0, face: 1, fc: 0, turn: 0, lx: 0, still: now });
        const dx = px - p.x, dy = py - p.y, sp = Math.hypot(dx, dy); let moving = false;
        if (sp > 60) { p.x = px; p.y = py; }
        else { p.x = px; p.y = py; moving = sp > 0.08; p.mv += ((moving ? 1 : 0) - p.mv) * 0.2; p.ph += sp * (isMain && root.Stats && root.Stats.running ? 0.095 : 0.085); }
        if (moving || anim > 0) p.still = now;
        // vista pedida pelo facing (a direção do ÚLTIMO movimento). Parado, o personagem continua voltado para onde andou: nada de "virar para a frente" sozinho.
        // Sem componente horizontal no facing (andando para cima/baixo) o lado do espelho é mantido, para não piscar ao trocar de vista.
        const wv = facing.y < 0 ? 'back' : facing.y > 0 ? 'front' : 'side', wf = facing.x < 0 ? -1 : facing.x > 0 ? 1 : p.face;
        if (!p.view) p.view = wv;
        else if (wv !== p.view) { if (++p.vc >= 4) { p.view = wv; p.vc = 0; p.turn = 1; } } else p.vc = 0;
        if (wf !== p.face && p.view === 'side') { if (++p.fc >= 3) { p.face = wf; p.fc = 0; p.turn = 1; } } else if (p.view !== 'side') p.face = wf, p.fc = 0; else p.fc = 0;
        const view = p.view, flip = p.face; p.turn *= 0.8; if (p.turn < 0.02) p.turn = 0;
        // cabeça: gira para o lado do movimento (3/4 suave) e, parado de frente, olha em volta de leve
        let tl = moving ? Math.max(-1, Math.min(1, dx * 0.7)) : (view === 'front' ? sin(now * 0.55 + sp) * 0.28 : 0); p.lx += (tl - p.lx) * 0.12;
        const L = extra.look || _defLook, D = dimsOf(L.sex, L.race);
        const bobS = abs(sin(p.ph)) * p.mv;
        if (extra.sit) { ctx.save(); ctx.beginPath(); ctx.rect(px - 70, py + 8 - 320, 140, 320 - 12); ctx.clip(); }   // montado (pets.js): só da cintura para cima; as pernas ficam atrás da montaria
        else { ctx.fillStyle = 'rgba(0,0,0,' + (0.3 - bobS * 0.04) + ')'; ctx.beginPath(); ctx.ellipse(px, py + 8, (10 - bobS * 0.8) * D.sx, 3.6 - bobS * 0.2, 0, 0, TAU); ctx.fill(); }
        ctx.save(); ctx.translate(px, py + 8); ctx.scale(view === 'side' ? flip : 1, 1);
        if (p.turn > 0.03) ctx.scale(1 - 0.18 * p.turn, 1);
        const lean = view === 'side' ? 0.02 * p.mv : sin(p.ph) * 0.03 * p.mv; if (lean) { ctx.translate(0, -9); ctx.rotate(lean); ctx.translate(0, 9); }
        root.__rodOut = !!(isMain && root.Fishing && root.Fishing.rodOut && root.Fishing.rodOut());   // pescando: a linha da vara é desenhada pelo fishing.js
        renderPerson(ctx, view, p.mv, p.ph, anim, equip, L, now, view === 'side' ? 0 : p.lx); root.__rodOut = false;
        ctx.restore();
        ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center'; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 3; const ny = py + 8 - ((equip && equip.head) ? (equip.head.hat === 'wizard' ? 68 : 55) : 51) * D.sy; ctx.strokeText(name, px, ny); ctx.fillStyle = isMain ? '#f1c40f' : '#ffffff'; ctx.fillText(name, px, ny); ctx.textAlign = 'start';
        let ty = ny - 4;
        if (extra.title) { ctx.font = 'italic 10px Georgia, serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ty = ny - 13; const tt = '‹' + extra.title + '›'; ctx.strokeText(tt, px, ty); ctx.fillStyle = '#e8c469'; ctx.fillText(tt, px, ty); ctx.textAlign = 'start'; ty -= 6; }
        if (extra.emote && root.Emotes) root.Emotes.draw(ctx, px, ty - 4, extra.emote);
        if (extra.sit) ctx.restore();
        return { view: view, flip: flip, mv: p.mv, ph: p.ph, D: D };
    }
    /* prévia sem nome: (x,y) = pés. opts: t, scale, weapon ('sword'|'axe'|'pickaxe'|'bow'|'staff'|'net'), shield, body, head (true), flip, anim, mv, ph */
    const _WPN = { sword: { name: 'Bronze Sword' }, axe: { tool: 'axe', name: 'Bronze Axe' }, pickaxe: { tool: 'pickaxe', name: 'Bronze Pickaxe' }, bow: { tool: 'ranged', name: 'Shortbow' }, staff: { tool: 'magic', name: 'Staff' }, net: { tool: 'net', name: 'Net' } };
    const _EQ = { weapon: null, shield: { name: 'Bronze Shield' }, body: { name: 'Bronze Platebody' }, head: { name: 'Bronze Helm' } };
    function drawLook(ctx, x, y, look, view, opts) {
        opts = opts || {}; const L = look || _defLook, sc = opts.scale || 1, t = opts.t !== undefined ? opts.t : performance.now() / 1000; view = view || 'front';
        const D = dimsOf(L.sex, L.race);
        const eq = opts.equip || { weapon: _WPN[opts.weapon] || null, shield: opts.shield ? _EQ.shield : null, body: opts.body ? _EQ.body : null, head: opts.head ? _EQ.head : null };
        ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 0, 10 * D.sx, 3.6, 0, 0, TAU); ctx.fill();
        if (view === 'side' && opts.flip) ctx.scale(-1, 1);
        renderPerson(ctx, view, opts.mv || 0, opts.ph || 0, opts.anim || 0, eq, L, t);
        ctx.restore();
    }


    root.Art = root.Art || {};
    function creatureTop(o, def) {   // y (mundo) do topo do desenho da criatura, para colocar nome/barra de vida
        const sp = speciesOf(o.dbKey, def), S0 = S[sp], ow = o.w || 30, oh = o.h || 30; if (NPCLOOK[sp]) return o.y + oh - Math.max(oh, 46) * 1.02;
        if (!S0) return o.y; const sc = ow / S0.w; return o.y + oh - (S0.h * (S0.bounds ? 1.12 : 1) + (S0.fly || 0)) * sc * 0.95;
    }
    Object.assign(root.Art, { pstate: (k) => _pst[k] || null, creatureTop, hash, hex, shade, alpha, mix, ell, poly, rrect, limb, limb2, lg, rg, glow, tri, paint, OUT, PI, TAU, S, NPCLOOK, human, hat, prop, speciesOf, stepState, drawCreature, drawPlayer, drawLook, defaultLook, cleanLook, dimsOf, PAL, SKIN, HAIR_NAMES });
})(typeof window !== 'undefined' ? window : globalThis);

