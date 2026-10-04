/* MiniScape 2D — arte procedural de pets e montarias (sem imagens). Tudo desenhado em canvas, 3 vistas (front/back/side) + dormir.
   PetArt.pet(g, id, x, y, o)   x,y = pés (chão). o = { view:'front'|'back'|'side', flip:1|-1, t, ph, mv, sleep, scale }
   PetArt.mount(g, id, x, y, o, riderFn)  desenha a montaria e chama riderFn(seat) no momento certo (seat = {x, y}: onde fica o quadril do cavaleiro).
   PetArt.portrait(id, kind, size) -> canvas pequeno (ícone/retrato). Os desenhos não mudam a hitbox: é tudo visual. */
(function (root) {
    'use strict';
    const PI = Math.PI, TAU = PI * 2, sin = Math.sin, cos = Math.cos, abs = Math.abs, OUT = '#1b1109';
    let g = null;
    function rgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    function hex(a) { return '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
    function sh(c, k) { const a = rgb(c); return hex(a.map((v) => k >= 0 ? v + (255 - v) * k : v * (1 + k))); }
    function ell(x, y, rx, ry, f, rot, lw) { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU); g.fillStyle = f; g.fill(); if (lw !== 0) { g.lineWidth = lw || 1; g.strokeStyle = OUT; g.stroke(); } }
    function poly(p, f, lw) { g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.closePath(); g.fillStyle = f; g.fill(); if (lw !== 0) { g.lineWidth = lw || 1; g.lineJoin = 'round'; g.strokeStyle = OUT; g.stroke(); } }
    function ln(x0, y0, x1, y1, w, c) { g.lineCap = 'round'; g.strokeStyle = OUT; g.lineWidth = w + 1.5; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.strokeStyle = c; g.lineWidth = w; g.stroke(); }
    function qc(x0, y0, cx, cy, x1, y1, w, c) { g.lineCap = 'round'; g.strokeStyle = OUT; g.lineWidth = w + 1.5; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); g.stroke(); g.strokeStyle = c; g.lineWidth = w; g.stroke(); }
    function rr(x, y, w, h, r, f, lw) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fillStyle = f; g.fill(); if (lw !== 0) { g.lineWidth = lw || 1; g.strokeStyle = OUT; g.stroke(); } }
    function shadow(rx, a) { g.fillStyle = 'rgba(0,0,0,' + (a == null ? 0.28 : a) + ')'; g.beginPath(); g.ellipse(0, 0.5, rx, Math.max(1.5, rx * 0.34), 0, 0, TAU); g.fill(); }
    function eye(x, y, r, closed, c) { if (closed) { g.strokeStyle = OUT; g.lineWidth = 1; g.beginPath(); g.moveTo(x - r, y); g.quadraticCurveTo(x, y + r * 0.9, x + r, y); g.stroke(); return; } ell(x, y, r, r * 1.1, c || '#15110d', 0, 0); g.fillStyle = '#fff'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.4, Math.max(0.5, r * 0.38), 0, TAU); g.fill(); }
    function glow(x, y, r, col, a) { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col.replace('A', a)); gr.addColorStop(1, col.replace('A', 0)); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    function flame(x, y, s, t, c1, c2, up) { // chama simples (gota) com tremor
        const k = up === false ? -1 : 1, w = s * (0.9 + sin(t * 14 + x) * 0.12), h = s * (1.5 + sin(t * 11 + y) * 0.25);
        g.fillStyle = c1; g.beginPath(); g.moveTo(x - w, y); g.quadraticCurveTo(x - w * 0.9, y - k * h * 0.5, x + sin(t * 9 + x) * s * 0.3, y - k * h); g.quadraticCurveTo(x + w * 0.9, y - k * h * 0.5, x + w, y); g.closePath(); g.fill();
        g.fillStyle = c2; g.beginPath(); g.moveTo(x - w * 0.5, y); g.quadraticCurveTo(x - w * 0.4, y - k * h * 0.35, x, y - k * h * 0.62); g.quadraticCurveTo(x + w * 0.4, y - k * h * 0.35, x + w * 0.5, y); g.closePath(); g.fill();
    }
    function embers(x, y, r, t, n, col) { g.fillStyle = col || '#ffb347'; for (let i = 0; i < n; i++) { const p = ((t * 0.9 + i / n) % 1), a = i * 2.4; g.globalAlpha = 1 - p; g.fillRect(x + sin(a + t * 2) * r * (0.4 + p * 0.6), y - p * r * 1.4, 1.5, 1.5); } g.globalAlpha = 1; }

    /* =================== QUADRÚPEDES (pets pequenos, lobo gigante, pantera, dragõezinhos) =================== */
    function legQ(x, top, len, ang, w, col, paw, pawC) { const x1 = x + sin(ang) * len, y1 = top + cos(ang) * len; ln(x, top, x1, y1, w, col); if (paw) ell(x1 + (paw > 0 ? 0.6 : 0), y1, w * 0.62 + 0.4, w * 0.4, pawC || col, 0, 1); }
    /* marcha de galope: f = fração do ciclo; devolve [balanço -1..1 (+ = pé à frente), flexão 0..1 (pé no ar)] */
    function gaitPose(f, st) { const p = f - Math.floor(f); if (p < st) return [1 - 2 * p / st, 0]; const q = (p - st) / (1 - st); return [-1 + 2 * q * q * (3 - 2 * q), sin(PI * q)]; }
    function legJ(x, top, len, u, mv, w, col, hind, pawC) {   // pata de 2 segmentos com joelho/curvilhão
        const s = sin(u) * 0.6 * mv, l = Math.max(0, cos(u)) * mv, l1 = len * 0.53, l2 = len * 0.57; let a1, a2;
        if (hind) { a1 = 0.38 + s; a2 = -0.5 + s * 0.8 - l * 0.7; } else { a1 = s; a2 = s * 0.5 - l * 1.1; }
        const kx = x + sin(a1) * l1, ky = top + cos(a1) * l1, fx = kx + sin(a2) * l2, fy = ky + cos(a2) * l2;
        ln(x, top, kx, ky, w * 1.15, col); ln(kx, ky, fx, fy, w * 0.9, col); ell(fx + 0.7, fy + 0.2, w * 0.7 + 0.5, w * 0.42, pawC || col, 0, 1);
    }
    function blob(list, col) { g.lineJoin = 'round'; g.strokeStyle = OUT; g.lineWidth = 2.2; for (const e of list) { g.beginPath(); g.ellipse(e[0], e[1], Math.max(0.1, e[2]), Math.max(0.1, e[3]), e[4] || 0, 0, TAU); g.stroke(); } g.fillStyle = col; for (const e of list) { g.beginPath(); g.ellipse(e[0], e[1], Math.max(0.1, e[2]), Math.max(0.1, e[3]), e[4] || 0, 0, TAU); g.fill(); } }
    function earSide(q, hx, hy, hr, o) {
        const e = q.ears, c = q.c1, c3 = q.c3, wig = sin(o.t * 2.3) * 0.15;
        if (e === 'cat' || e === 'wolf' || e === 'fox') { const h = e === 'fox' ? 8 : e === 'wolf' ? 6.5 : 5.5, w = e === 'fox' ? 3.2 : 2.8; poly([hx - hr * 0.55, hy - hr * 0.55, hx - hr * 0.55 - w * 0.2, hy - hr * 0.55 - h, hx - hr * 0.05 + w, hy - hr * 0.8], c); poly([hx - hr * 0.1, hy - hr * 0.85, hx + hr * 0.3, hy - hr * 0.85 - h, hx + hr * 0.62, hy - hr * 0.5], c); if (e === 'fox') { poly([hx + hr * 0.3 - 1.2, hy - hr * 0.85 - h + 3, hx + hr * 0.3, hy - hr * 0.85 - h, hx + hr * 0.5, hy - hr * 0.85 - h + 3.5], c3, 0); } else poly([hx + hr * 0.18, hy - hr * 0.9 - 0.5, hx + hr * 0.3, hy - hr * 0.85 - h + 2.5, hx + hr * 0.5, hy - hr * 0.62], q.inner || '#f2a6a6', 0); }
        else if (e === 'dog') { g.save(); g.translate(hx - hr * 0.1, hy - hr * 0.7); g.rotate(0.35 + wig); ell(0, 3.2, 2.6, 4.4, c3); g.restore(); }
        else if (e === 'rabbit') { g.save(); g.translate(hx - hr * 0.5, hy - hr * 0.7); g.rotate(-0.5 + wig); ell(0, -5, 2.4, 6.4, c); ell(0, -5, 1.2, 4.6, q.inner || '#ffb6c1', 0, 0); g.restore(); g.save(); g.translate(hx - hr * 0.05, hy - hr * 0.9); g.rotate(-0.05 + wig); ell(0, -5.5, 2.4, 6.6, sh(c, -0.08)); ell(0, -5.5, 1.2, 4.8, q.inner || '#ffb6c1', 0, 0); g.restore(); }
    }
    function tailSide(q, x, y, o, mv) {
        const w = sin(o.t * (q.tail === 'dog' ? 9 : 3.2) + 1) * (q.tail === 'dog' ? 0.5 : 0.25) + mv * 0.15, c = q.c1;
        if (q.tail === 'cat') { qc(x, y, x - 7, y - 2 + w * 4, x - 5 + w * 3, y - 11, 2.4, c); ell(x - 5 + w * 3, y - 11, 1.5, 1.5, q.c3, 0, 0); }
        else if (q.tail === 'dog') { qc(x, y, x - 5, y - 3 + w * 3, x - 6 + w * 2, y - 8, 2.6, c); }
        else if (q.tail === 'fox' || q.tail === 'wolf') { g.save(); g.translate(x, y); g.rotate(w * 0.5 + (q.tail === 'wolf' ? 0.55 : -0.25)); const L = q.tail === 'wolf' ? 9 : 11; ell(-L * 0.55, 0, L * 0.6, 3.4, c); if (q.tail === 'fox') ell(-L * 1.0, 0, 3, 2.7, '#fff6e6', 0, 0.8); else ell(-L * 0.95, 0, 2.2, 2.2, q.c3, 0, 0.8); g.restore(); }
        else if (q.tail === 'rabbit') { ell(x - 1.5, y + 0.5, 2.6, 2.6, '#fff', 0, 1); }
        else if (q.tail === 'drag') { const fl = o.t; qc(x, y, x - 9, y + 1 + w * 4, x - 15, y - 3 + w * 3, 3, c); qc(x - 15, y - 3 + w * 3, x - 17, y - 6, x - 19, y - 4 + w * 3, 2, c); if (q.flameTail) flame(x - 19, y - 4 + w * 3, 3, fl, '#ff7a1a', '#ffe27a'); else poly([x - 19, y - 4 + w * 3, x - 23, y - 8 + w * 3, x - 21, y - 2 + w * 3, x - 24, y - 1 + w * 3], q.c3); }
    }
    function quadSide(q, o) {
        const mv = o.mv, ph = o.ph, sl = o.sleep, c = q.c1, c2 = q.c2, c3 = q.c3;
        const hop = q.hop, bob = hop ? abs(sin(ph * 0.9)) * mv * 3.2 : abs(sin(ph)) * mv * 1.2, br = sin(o.t * 2.1) * 0.35;
        const hover = q.hover ? (sl ? 0 : 4 + sin(o.t * 3) * 1.2) : 0;
        shadow(q.bl * (1.1 - hover * 0.04), 0.3 - hover * 0.012);
        const bcy = sl ? -q.bh * 0.78 : -(q.lg + q.bh * 0.78) - bob + br - hover;
        const hx = sl ? q.bl * 0.72 : q.bl * 0.82, hy = sl ? bcy + q.bh * 0.15 : bcy - q.bh * 0.62 - (q.hup || 0);
        if (q.wings && !sl) wing(q, -q.bl * 0.15, bcy - q.bh * 0.7, o, 'side', 1);
        tailSide(q, -q.bl * 0.9, bcy - q.bh * 0.15, o, mv);
        if (!sl) {
            const a = (k) => sin(ph + k) * 0.7 * mv, hl = q.lg + 0.5;
            if (hop) { const t = abs(sin(ph * 0.9)) * mv; legQ(-q.bl * 0.55, bcy + q.bh * 0.5, hl * (1 - t * 0.2), -0.25 - t * 0.5, q.lw + 0.8, sh(c3, -0.1), 1, c3); legQ(q.bl * 0.55, bcy + q.bh * 0.5, hl, 0.4 * t, q.lw, sh(c3, -0.1), 1, c3); }
            else { legJ(-q.bl * 0.55, bcy + q.bh * 0.5, hl, ph + PI, mv, q.lw, sh(c3, -0.25), 1, sh(c3, -0.25)); legJ(q.bl * 0.58, bcy + q.bh * 0.5, hl, ph, mv, q.lw, sh(c3, -0.25), 0, sh(c3, -0.25)); }
        }
        // corpo
        blob([[-q.bl * 0.45, bcy + q.bh * 0.04, q.bl * 0.58, q.bh * 1.0], [q.bl * 0.42, bcy, q.bl * 0.6, q.bh * 1.04], [0, bcy + q.bh * 0.12, q.bl * 0.8, q.bh * 0.86]], c);
        if (!sl) { const ax = q.bl * 0.5, ay = bcy - q.bh * 0.1, dx = hx - ax, dy = hy + q.hr * 0.2 - ay; blob([[(ax + hx) / 2, (ay + hy + q.hr * 0.2) / 2, Math.hypot(dx, dy) / 2 + q.hr * 0.35, q.hr * 0.72, Math.atan2(dy, dx)]], c); }
        ell(0, bcy + q.bh * 0.35, q.bl * 0.8, q.bh * 0.55, c2, 0, 0); ell(-q.bl * 0.3, bcy - q.bh * 0.45, q.bl * 0.4, q.bh * 0.28, sh(c, 0.25), 0, 0);
        if (q.stripes) { g.strokeStyle = sh(c, -0.35); g.lineWidth = 1.2; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * 3.4, bcy - q.bh * 0.95); g.lineTo(i * 3.4 + 0.5, bcy - q.bh * 0.35); g.stroke(); } }
        if (q.patch) ell(-q.bl * 0.25, bcy - q.bh * 0.15, 3, 2.4, q.patch, 0, 0);
        if (q.belly) ell(0, bcy + q.bh * 0.3, q.bl * 0.55, q.bh * 0.5, q.belly, 0, 0);
        if (q.spikes) for (let i = 0; i < 4; i++) poly([-q.bl * 0.6 + i * 3.2, bcy - q.bh * 0.92 + i * 0.3, -q.bl * 0.6 + i * 3.2 + 1.6, bcy - q.bh * 0.92 - 3.2 + i * 0.3, -q.bl * 0.6 + i * 3.2 + 3.2, bcy - q.bh * 0.85 + i * 0.3], q.c3);
        if (!sl) {
            const a = (k) => sin(ph + k) * 0.7 * mv, hl = q.lg + 0.5;
            if (!hop) { legJ(-q.bl * 0.5, bcy + q.bh * 0.55, hl, ph, mv, q.lw, c, 1, c3); legJ(q.bl * 0.62, bcy + q.bh * 0.55, hl, ph + PI, mv, q.lw, c, 0, c3); }
            else { legQ(q.bl * 0.62, bcy + q.bh * 0.5, hl * 0.9, 0.2, q.lw, c, 1, c3); }
        } else { ell(q.bl * 0.4, bcy + q.bh * 0.65, 3, 1.6, c3); }
        // cabeça
        g.save(); if (sl) { g.translate(hx, hy); g.rotate(0.2); g.translate(-hx, -hy); }
        if (q.ears === 'dog' || q.ears === 'rabbit') { earSide(q, hx, hy, q.hr, o); }
        if (q.sn) ell(hx + q.hr * 0.9 + q.sn * 0.25, hy + q.hr * 0.28, q.sn, q.hr * 0.46, q.snc || c2);
        ell(hx, hy, q.hr, q.hr * 0.92, c);
        if (q.sn) ell(hx + q.hr * 0.9 + q.sn * 0.25, hy + q.hr * 0.28, q.sn * 0.95, q.hr * 0.4, q.snc || c2, 0, 0);
        else ell(hx + q.hr * 0.45, hy + q.hr * 0.3, q.hr * 0.5, q.hr * 0.38, c2, 0, 0);
        if (q.ears === 'cat' || q.ears === 'wolf' || q.ears === 'fox') earSide(q, hx, hy, q.hr, o);
        if (q.horn) { poly([hx - 1, hy - q.hr * 0.8, hx - 3.5, hy - q.hr - 4, hx + 1, hy - q.hr * 0.75], q.horn); poly([hx + 2, hy - q.hr * 0.75, hx + 1.5, hy - q.hr - 3.4, hx + 4, hy - q.hr * 0.6], q.horn); }
        const nx = hx + q.hr * 0.9 + (q.sn || q.hr * 0.3), ny = hy + q.hr * 0.12;
        ell(nx, ny, 1.1, 0.9, '#2a1a14', 0, 0);
        if (q.whisk) { g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 0.6; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(nx - 1, ny + 1 + i * 0.6); g.lineTo(nx + 2.4, ny + 1.4 + i * 1.2); g.stroke(); } }
        eye(hx + q.hr * 0.38, hy - q.hr * 0.12, q.hr * 0.2, sl, q.eye);
        if (q.cheek) ell(hx + q.hr * 0.15, hy + q.hr * 0.38, 1.6, 1, q.cheek, 0, 0);
        g.restore();
        if (q.flameHead && !sl) flame(hx - 1, hy - q.hr * 0.9, 2.2, o.t, '#ff7a1a', '#ffe27a');
        return hover;
    }
    function wing(q, x, y, o, view, sgn) {
        const f = sin(o.t * (o.mv > 0.1 ? 11 : 4.5) + (sgn > 0 ? 0 : 1)) * (o.mv > 0.1 ? 0.6 : 0.35), s = q.ws || 1, c = q.wc || q.c1, c2 = q.wc2 || sh(c, 0.3);
        g.save(); g.translate(x, y);
        if (view === 'side') { g.rotate(-0.9 + f); poly([0, 0, -2 * s, -12 * s, 5 * s, -17 * s, 9 * s, -10 * s, 12 * s, -13 * s, 12 * s, -3 * s, 6 * s, 2], c); poly([0, 0, 5 * s, -17 * s, 9 * s, -10 * s, 12 * s, -3 * s, 6 * s, 2], c2, 0.6); }
        else { g.scale(sgn, 1); g.rotate(0.2 - f * sgn * 0.3); poly([0, 0, 5 * s, -10 * s, 14 * s, -14 * s, 17 * s, -7 * s, 12 * s, -4 * s, 15 * s, 3 * s, 6 * s, 3], c); poly([0, 0, 5 * s, -10 * s, 14 * s, -14 * s, 12 * s, -4 * s, 6 * s, 3], c2, 0.6); }
        g.restore();
    }
    function quadFB(q, o, back) {
        const mv = o.mv, ph = o.ph, c = q.c1, c2 = q.c2, c3 = q.c3, hop = q.hop;
        const bob = hop ? abs(sin(ph * 0.9)) * mv * 3.2 : abs(sin(ph)) * mv * 1.2, br = sin(o.t * 2.1) * 0.35, sw = hop ? 0 : sin(ph) * mv * 0.9;
        const hover = q.hover ? 4 + sin(o.t * 3) * 1.2 : 0;
        shadow(q.bh * 1.25 * (1 - hover * 0.03), 0.3 - hover * 0.012);
        const bw = q.bh * 1.05, bcy = -(q.lg + q.bh * 0.78) - bob + br - hover, hr = q.hr, hy = bcy - q.bh * 0.45 - (q.hup || 0) * 0.6;
        if (q.wings) { wing(q, -bw * 0.7, bcy - q.bh * 0.3, o, 'fb', -1); wing(q, bw * 0.7, bcy - q.bh * 0.3, o, 'fb', 1); }
        if (back) { tailBack(q, bcy, o); }
        // pernas
        const lh = q.lg + 0.5, lx = bw * 0.55;
        if (hop) { const t = abs(sin(ph * 0.9)) * mv; ell(-lx, -hover - 1.2 - t, q.lw + 1, 1.8, c3); ell(lx, -hover - 1.2 - t, q.lw + 1, 1.8, c3); }
        else { legQ(-lx, bcy + q.bh * 0.55, lh * (1 - 0.2 * Math.max(0, sin(ph)) * mv), 0, q.lw, sh(c3, -0.1), 1, c3); legQ(lx, bcy + q.bh * 0.55, lh * (1 - 0.2 * Math.max(0, -sin(ph)) * mv), 0, q.lw, sh(c3, -0.1), 1, c3); }
        g.save(); g.translate(sw * 0.4, 0);
        ell(0, bcy, bw, q.bh * 1.02, c);
        if (!back) { ell(0, bcy + q.bh * 0.3, bw * 0.62, q.bh * 0.7, q.belly || c2, 0, 0); if (q.stripes) { g.strokeStyle = sh(c, -0.35); g.lineWidth = 1.2; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * 2.6, bcy - q.bh * 0.9); g.lineTo(i * 2.6, bcy - q.bh * 0.45); g.stroke(); } } }
        else { ell(0, bcy - q.bh * 0.4, bw * 0.6, q.bh * 0.3, sh(c, 0.18), 0, 0); if (q.spikes) for (let i = 0; i < 3; i++) poly([-2 + i * 2, bcy - q.bh * 0.5 + i * 2.2, -1 + i * 2, bcy - q.bh * 0.5 + i * 2.2 - 3, i * 2, bcy - q.bh * 0.5 + i * 2.2], q.c3); }
        // cabeça
        g.save(); g.translate(sw * 0.7, 0);
        if (q.ears === 'rabbit') { for (const s of [-1, 1]) { g.save(); g.translate(s * hr * 0.45, hy - hr * 0.7); g.rotate(s * 0.14 + sin(o.t * 2.3) * 0.05); ell(0, -5.5, 2.3, 6.6, c); if (!back) ell(0, -5.5, 1.1, 4.8, q.inner || '#ffb6c1', 0, 0); g.restore(); } }
        else if (q.ears === 'cat' || q.ears === 'wolf' || q.ears === 'fox') { const h = q.ears === 'fox' ? 8 : q.ears === 'wolf' ? 6.5 : 5.5; for (const s of [-1, 1]) { poly([s * hr * 0.9, hy - hr * 0.2, s * hr * 0.75, hy - hr * 0.9 - h, s * hr * 0.12, hy - hr * 0.88], c); if (!back) poly([s * hr * 0.7, hy - hr * 0.35, s * hr * 0.68, hy - hr * 0.8 - h + 3.2, s * hr * 0.28, hy - hr * 0.8], q.inner || '#f2a6a6', 0); else if (q.ears === 'fox') poly([s * hr * 0.82, hy - hr * 0.85 - h + 3.5, s * hr * 0.75, hy - hr * 0.9 - h, s * hr * 0.55, hy - hr * 0.88 - h + 3.8], c3, 0); } }
        if (q.horn) { poly([-hr * 0.55, hy - hr * 0.6, -hr * 0.9, hy - hr - 4.5, -hr * 0.2, hy - hr * 0.8], q.horn); poly([hr * 0.55, hy - hr * 0.6, hr * 0.9, hy - hr - 4.5, hr * 0.2, hy - hr * 0.8], q.horn); }
        ell(0, hy, hr * 1.04, hr * 0.92, c);
        if (q.ears === 'dog') { for (const s of [-1, 1]) { g.save(); g.translate(s * hr * 0.88, hy - hr * 0.5); g.rotate(s * -0.3); ell(0, 3.4, 2.7, 4.6, c3); g.restore(); } }
        if (!back) {
            ell(0, hy + hr * 0.38, hr * (q.sn ? 0.5 : 0.62), hr * 0.42, q.snc || c2, 0, 0);
            eye(-hr * 0.42, hy - hr * 0.08, hr * 0.2, false, q.eye); eye(hr * 0.42, hy - hr * 0.08, hr * 0.2, false, q.eye);
            ell(0, hy + hr * 0.22, 1.2, 0.9, '#2a1a14', 0, 0);
            if (q.whisk) { g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 0.6; for (const sg of [-1, 1]) for (let i = -1; i <= 1; i += 2) { g.beginPath(); g.moveTo(sg * 2, hy + hr * 0.3); g.lineTo(sg * (hr + 3.2), hy + hr * 0.3 + i * 1.8); g.stroke(); } }
            if (q.cheek) { ell(-hr * 0.7, hy + hr * 0.3, 1.6, 1, q.cheek, 0, 0); ell(hr * 0.7, hy + hr * 0.3, 1.6, 1, q.cheek, 0, 0); }
        } else ell(0, hy - hr * 0.45, hr * 0.6, hr * 0.28, sh(c, 0.18), 0, 0);
        g.restore(); g.restore();
        if (q.flameHead) flame(0, hy - hr * 0.9, 2.2, o.t, '#ff7a1a', '#ffe27a');
        return hover;
    }
    function tailBack(q, bcy, o) {
        const w = sin(o.t * (q.tail === 'dog' ? 9 : 3.2)) * 3, c = q.c1;
        if (q.tail === 'cat') { qc(0, bcy + q.bh * 0.3, w * 0.8, bcy - q.bh - 4, w, bcy - q.bh - 10, 2.4, c); }
        else if (q.tail === 'dog') { qc(0, bcy + q.bh * 0.2, w, bcy - q.bh, w * 1.5, bcy - q.bh - 6, 2.6, c); }
        else if (q.tail === 'fox' || q.tail === 'wolf') { ell(w * 0.5, bcy + q.bh * 0.2, 3.4, 8, c, w * 0.06); ell(w * 0.7, bcy + q.bh * 0.2 + 6, 2.6, 2.6, q.tail === 'fox' ? '#fff6e6' : q.c3, 0, 0.8); }
        else if (q.tail === 'rabbit') ell(0, bcy + q.bh * 0.35, 2.7, 2.7, '#fff', 0, 1);
        else if (q.tail === 'drag') { qc(0, bcy + q.bh * 0.5, w, bcy + q.bh * 0.9, w * 1.3, bcy + q.bh * 1.6, 3, c); if (q.flameTail) flame(w * 1.3, bcy + q.bh * 1.6, 3, o.t, '#ff7a1a', '#ffe27a', false); }
    }

    const PET = {};
    const Q = (def) => (g2, v, o) => { return v === 'side' || o.sleep ? quadSide(def, o) : quadFB(def, o, v === 'back'); };
    PET.gato = Q({ whisk: 1, c1: '#a9b0bb', c2: '#f4f1ea', c3: '#6d7480', bl: 8, bh: 5.4, lg: 5, lw: 2.2, hr: 6.4, ears: 'cat', tail: 'cat', stripes: 1, eye: '#2a7a3a', cheek: '#f4a6a0' });
    PET.cachorro = Q({ c1: '#c58d52', c2: '#f3e0bd', c3: '#6e4524', bl: 9, bh: 5.8, lg: 5.4, lw: 2.5, hr: 6.4, ears: 'dog', tail: 'dog', sn: 2.6, patch: '#7a4c26', eye: '#2a1a14', snc: '#f3e0bd' });
    PET.coelho = Q({ c1: '#f3efe7', c2: '#ffffff', c3: '#d9d2c4', bl: 6.6, bh: 5.8, lg: 3.8, lw: 2.3, hr: 5.8, ears: 'rabbit', tail: 'rabbit', hop: 1, eye: '#c03a52', cheek: '#ffb6c1' });
    PET.raposa = Q({ c1: '#ea7a2c', c2: '#fff4e2', c3: '#3a2a22', bl: 9.4, bh: 5, lg: 6, lw: 2.2, hr: 5.9, ears: 'fox', tail: 'fox', sn: 3.4, snc: '#fff4e2', eye: '#2a1a14', hup: 0.5 });
    PET.lobinho = Q({ c1: '#8f97a3', c2: '#dfe5ec', c3: '#4f5660', bl: 10, bh: 6, lg: 6.6, lw: 2.6, hr: 6.4, ears: 'wolf', tail: 'wolf', sn: 3.6, snc: '#dfe5ec', eye: '#e8b43a', hup: 0.4 });
    PET.dragao_fogo = Q({ c1: '#d9482a', c2: '#ffd9a0', c3: '#8e2a18', bl: 8.2, bh: 5.4, lg: 4.6, lw: 2.4, hr: 6, ears: 'none', tail: 'drag', flameTail: 1, sn: 2.2, snc: '#e8603a', horn: '#f3e2b0', wings: 1, ws: 0.55, wc: '#a8321f', wc2: '#f08a3c', spikes: 1, belly: '#ffd9a0', eye: '#ffe27a', hover: 0 });
    PET.dragao_gelo = Q({ c1: '#7fc8f0', c2: '#eefaff', c3: '#4a86b8', bl: 8.2, bh: 5.4, lg: 4.6, lw: 2.4, hr: 6, ears: 'none', tail: 'drag', sn: 2.2, snc: '#a8dcf8', horn: '#e8f6ff', wings: 1, ws: 0.55, wc: '#4e9fd6', wc2: '#cfeeff', spikes: 1, belly: '#eefaff', eye: '#1a5aa8' });

    /* ---- slime ---- */
    PET.slime = (g2, v, o) => {
        const sq = sin(o.t * 3) * 0.06 + abs(sin(o.ph * 0.9)) * o.mv * 0.22, w = 8.5 * (1 + sq), h = 8 * (1 - sq) * (o.sleep ? 0.7 : 1), hop = abs(sin(o.ph * 0.9)) * o.mv * 3;
        shadow(w * 1.05, 0.28);
        g.save(); g.translate(0, -hop);
        g.beginPath(); g.moveTo(-w, 0); g.bezierCurveTo(-w * 1.05, -h * 1.15, -w * 0.4, -h * 1.9, 0, -h * 1.9); g.bezierCurveTo(w * 0.4, -h * 1.9, w * 1.05, -h * 1.15, w, 0); g.closePath();
        const gr = g.createLinearGradient(0, -h * 1.9, 0, 0); gr.addColorStop(0, '#9cf0a6'); gr.addColorStop(1, '#3fb457'); g.fillStyle = gr; g.fill(); g.lineWidth = 1; g.strokeStyle = OUT; g.stroke();
        ell(-w * 0.4, -h * 1.45, 2.4, 1.5, 'rgba(255,255,255,.65)', -0.5, 0); ell(w * 0.35, -h * 0.4, 1.4, 1, 'rgba(255,255,255,.25)', 0, 0);
        if (v !== 'back') { const ex = v === 'side' ? 2.5 : 0; eye(-3 + ex * 0.6, -h * 0.95, 1.5, o.sleep, '#1c2a1e'); eye(3 + ex, -h * 0.95, 1.5, o.sleep, '#1c2a1e'); if (!o.sleep) { g.strokeStyle = '#1c2a1e'; g.lineWidth = 0.8; g.beginPath(); g.arc(ex * 0.8, -h * 0.65, 1.7, 0.2, PI - 0.2); g.stroke(); } }
        g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(-w * 0.2, -h * 0.6, 0.9, 0, TAU); g.arc(w * 0.45, -h * 1.15, 0.7, 0, TAU); g.fill();
        g.restore(); return 0;
    };

    /* ---- golem mini ---- */
    PET.golem = (g2, v, o) => {
        const st = abs(sin(o.ph)) * o.mv * 1.3, sw = sin(o.ph) * o.mv, sl = o.sleep, c = '#8d9199', cd = '#5f636b', cl = '#b9bdc5', moss = '#5b9a4a', rune = '#4fd6ff';
        const side = v === 'side', pulse = 0.5 + 0.5 * sin(o.t * 2.4);
        shadow(10, 0.32);
        const rock = (x, y, w, h, col, k) => { const j = k || 0; poly([x - w * 0.5, y + h * 0.15, x - w * 0.35 + j, y - h * 0.5, x + w * 0.1, y - h * 0.55, x + w * 0.5, y - h * 0.2, x + w * 0.46 - j, y + h * 0.45, x + w * 0.05, y + h * 0.55, x - w * 0.42, y + h * 0.5], col, 0.9); };
        if (sl) { rock(0, -5.4, 18, 10, c, 1); rock(-3, -11.4, 10, 6, cl, 0); ell(5, -6, 3, 2, moss, 0, 0); g.strokeStyle = OUT; g.lineWidth = 1; g.beginPath(); g.moveTo(-5.5, -11.4); g.lineTo(-3, -11.4); g.moveTo(-1.4, -11.4); g.lineTo(1, -11.4); g.stroke(); return 0; }
        const by = -5.5 - st + sin(o.t * 2) * 0.3, bw = side ? 11 : 13;
        // pernas (pilares de pedra que pisam)
        const lift = (k) => Math.max(0, sin(o.ph + k)) * o.mv * 2.4;
        rock(-bw * 0.32, by + 1 - lift(0) * 0.5, 7, 9 - lift(0) * 0.3, cd, 0.5); rock(bw * 0.32, by + 1 - lift(PI) * 0.5, 7, 9 - lift(PI) * 0.3, cd, 0.5);
        rr(-bw * 0.32 - 3.6, by + 3.6 - lift(0) * 0.6, 7.4, 2.4, 1.2, '#4b4e55', 0.8); rr(bw * 0.32 - 3.8, by + 3.6 - lift(PI) * 0.6, 7.4, 2.4, 1.2, '#4b4e55', 0.8);
        const ay = by - 13 + sw * 0.7;
        // braço do lado de lá (lado) ou ambos (frente/costas)
        const arm = (x, k, far) => { const sg = sin(o.ph + k) * o.mv; rock(x, ay + 5, 6.4, 11, far ? cd : c, 0.6); ell(x + (side ? sg * 1.2 : 0), ay + 11.4 - Math.abs(sg) * 0.5, 4, 3.5, far ? sh(cd, 0.1) : cl); ell(x, ay + 0.6, 3.6, 3, far ? cd : cl); };
        if (!side) { arm(-bw - 1.6, 0); arm(bw + 1.6, PI); } else arm(-3.4 + sw * 1.2, PI, true);
        // torso
        rock(0, by - 8.4, bw + 5, 17, c, 1.2); rock(0, by - 12.6, bw + 7, 8, cl, 0.8);
        g.strokeStyle = 'rgba(0,0,0,.32)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-bw * 0.4, by - 6); g.lineTo(-bw * 0.1, by - 3); g.lineTo(bw * 0.2, by - 6.5); g.moveTo(bw * 0.3, by - 15); g.lineTo(bw * 0.15, by - 10.5); g.stroke();
        ell(-bw * 0.35, by - 4.2, 2.2, 1.6, moss, 0, 0); ell(bw * 0.4, by - 14, 1.8, 1.4, moss, 0, 0);
        if (v !== 'back') { glow(side ? 2.4 : 0, by - 8.4, 7, 'rgba(79,214,255,A)', 0.3 + pulse * 0.2); poly([(side ? 2.4 : 0) - 2, by - 9.6, (side ? 2.4 : 0), by - 12.2, (side ? 2.4 : 0) + 2, by - 9.6, (side ? 2.4 : 0), by - 6], rune, 0.7); }
        else { g.strokeStyle = rune; g.globalAlpha = 0.5 + pulse * 0.4; g.lineWidth = 1; g.beginPath(); g.moveTo(-3, by - 12); g.lineTo(0, by - 6); g.lineTo(3, by - 12); g.moveTo(-2, by - 9); g.lineTo(2, by - 9); g.stroke(); g.globalAlpha = 1; ell(-bw * 0.3, by - 5, 3, 2, moss, 0, 0); }
        if (side) arm(2.6 - sw * 1.2, 0, false);
        // cabeça
        const hx = side ? 1.8 : 0; rock(hx, by - 21.4, 11.6, 9, c, 1); rock(hx, by - 25.6, 10.6, 3.4, cl, 0.5); g.fillStyle = moss; g.beginPath(); g.arc(hx - 3.4, by - 26.4, 1.5, 0, TAU); g.arc(hx - 1.2, by - 26.8, 1, 0, TAU); g.arc(hx + 3, by - 26.2, 1.1, 0, TAU); g.fill();
        if (v !== 'back') { const e = hx + (side ? 1.8 : 0); poly([e - 4, by - 22.4, e - 0.6, by - 22.4, e - 1.2, by - 20.4, e - 4, by - 20.4], '#2a2d33', 0.5); poly([e + 0.6 * (side ? 0 : 1) + (side ? 1.6 : 0.6), by - 22.4, e + 4, by - 22.4, e + 4, by - 20.4, e + 1.2, by - 20.4], '#2a2d33', 0.5); glow(e - 2, by - 21.4, 4, 'rgba(79,214,255,A)', 0.6); glow(e + 2.4, by - 21.4, 4, 'rgba(79,214,255,A)', 0.6); ell(e - 2.2, by - 21.4, 1.1, 0.9, rune, 0, 0); ell(e + 2.4, by - 21.4, 1.1, 0.9, rune, 0, 0); g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(e - 2.6, by - 17.8); g.lineTo(e + 2.8, by - 17.8); g.stroke(); }
        return 0;
    };

    /* ---- aves e voadores: coruja, fênix, fada ---- */
    function birdWing(x, y, o, big, c, c2, side) { const f = sin(o.t * (o.mv > 0.1 ? 12 : 4)) * (o.mv > 0.1 ? 0.7 : 0.22); g.save(); g.translate(x, y); g.rotate(f * (side ? 1 : 1) + (side ? 0.2 : 0)); ell(0, big * 0.5, big * 0.38, big * 0.8, c); ell(0, big * 0.7, big * 0.2, big * 0.5, c2, 0, 0); g.restore(); }
    PET.coruja = (g2, v, o) => {
        const hv = o.sleep ? 0 : 4.5 + sin(o.t * 3.2) * 1.2, c = '#a67b4b', cl = '#e8d3a8', cd = '#6e4c2a, #6e4c2a'.split(',')[0];
        shadow(6.6 - hv * 0.2, 0.3 - hv * 0.015); g.save(); g.translate(0, -hv - (o.sleep ? 0 : 0));
        const by = -8, side = v === 'side';
        if (!o.sleep) { ln(-1.5, by + 7, -1.5, by + 10.5, 1.4, '#e8b43a'); ln(2, by + 7, 2, by + 10.5, 1.4, '#e8b43a'); }
        if (v === 'back' || side) { // cauda
            poly([-3, by + 4, -4.4, by + 11, 0, by + 12.5, 4.4, by + 11, 3, by + 4], cd);
        }
        if (!o.sleep) { if (side) birdWing(-1.5, by - 4, o, 8, sh(c, -0.12), cd, 1); else { birdWing(-7.5, by - 3, o, 8, sh(c, -0.12), cd, 0); g.save(); g.scale(-1, 1); birdWing(-7.5, by - 3, o, 8, sh(c, -0.12), cd, 0); g.restore(); } }
        ell(0, by, side ? 5.8 : 7.2, 7.8, c); if (v !== 'back') ell(side ? 1.2 : 0, by + 1.4, side ? 3.4 : 4.6, 5.2, cl, 0, 0);
        if (v !== 'back') { g.fillStyle = sh(c, -0.25); for (let i = 0; i < 3; i++) { g.beginPath(); g.arc((side ? 1.2 : 0) + (i - 1) * 1.8, by + 1 + (i % 2) * 2.2, 0.7, 0, TAU); g.fill(); } }
        if (side && !o.sleep) birdWing(-1.5, by - 4, o, 8, sh(c, -0.12), cd, 1);
        const hy = by - 8.6;
        poly([-6.4, hy - 3.4, -7.6, hy - 8.4, -3, hy - 5], c); poly([6.4, hy - 3.4, 7.6, hy - 8.4, 3, hy - 5], c);
        ell(0, hy, side ? 5.8 : 7.4, 5.4, c);
        if (v !== 'back') {
            const ex = side ? 1.4 : 0; ell(-3 + ex, hy - 0.3, 2.9, 2.9, cl); ell(3 + ex * 0.5, hy - 0.3, 2.9, 2.9, cl);
            if (o.sleep) { eye(-3 + ex, hy, 1.6, true); eye(3 + ex * 0.5, hy, 1.6, true); } else { ell(-3 + ex, hy - 0.2, 1.7, 1.7, '#f2b53a', 0, 0.6); ell(3 + ex * 0.5, hy - 0.2, 1.7, 1.7, '#f2b53a', 0, 0.6); ell(-3 + ex, hy - 0.2, 0.9, 0.9, '#15110d', 0, 0); ell(3 + ex * 0.5, hy - 0.2, 0.9, 0.9, '#15110d', 0, 0); }
            poly([ex - 1.1, hy + 1.2, ex + 1.1, hy + 1.2, ex + (side ? 2.4 : 0), hy + 4], '#e8943a');
        } else ell(0, hy - 2.4, 3, 1.6, sh(c, 0.2), 0, 0);
        g.restore(); return hv;
    };
    PET.fenix = (g2, v, o) => {
        const hv = o.sleep ? 1.2 : 5.5 + sin(o.t * 3.4) * 1.4, c = '#f0642a', cl = '#ffc84a', cd = '#b8321a', side = v === 'side', t = o.t;
        shadow(7 - hv * 0.2, 0.28 - hv * 0.014); glow(0, -hv - 10, 17, 'rgba(255,150,40,A)', 0.28 + sin(t * 6) * 0.05);
        g.save(); g.translate(0, -hv); const by = -8;
        // cauda de chamas
        const tx = side ? -6 : 0;
        for (let i = -1; i <= 1; i++) { g.save(); g.translate(tx + (side ? 0 : i * 3.4), by + 5); g.rotate((side ? 1.2 : 0) + i * 0.18 + sin(t * 5 + i) * 0.12); poly([-1.8, 0, -2.6, 7, 0, 13, 2.6, 7, 1.8, 0], i === 0 ? cl : c, 0.8); g.restore(); }
        { const f = sin(t * (o.mv > 0.1 ? 12 : 5)) * (o.mv > 0.1 ? 0.7 : 0.28);
          const wingD = (sg) => { g.save(); g.translate(sg * (side ? 0 : 5.5), by - 2); g.rotate(sg * (0.5 + f)); poly([0, 0, sg * 9, -3, sg * 13, 1, sg * 10, 4, sg * 12, 7, sg * 6, 6, 0, 5], c, 1); poly([0, 0, sg * 9, -3, sg * 11, 0, sg * 5, 4], cl, 0.6); g.restore(); };
          if (!side) { wingD(-1); wingD(1); } else wingD(-1); }
        ell(0, by, side ? 5.6 : 6.6, 7.2, c); if (v !== 'back') ell(side ? 1.2 : 0, by + 1.6, side ? 3.2 : 4.2, 4.8, cl, 0, 0);
        const hy = by - 8.2;
        for (let i = -1; i <= 1; i++) { g.save(); g.translate(i * 2.4 + (side ? -1.5 : 0), hy - 4); g.rotate(i * 0.3 + (side ? -0.5 : 0)); poly([-1.4, 1, -1.8, -4 - sin(t * 8 + i) , 0, -7 - sin(t * 9 + i) * 1.5, 1.8, -4, 1.4, 1], i === 0 ? cl : '#ff8a3a', 0.7); g.restore(); }
        ell(0, hy, side ? 5 : 6, 5, c);
        if (v !== 'back') { const ex = side ? 1.5 : 0; eye(-2.4 + ex, hy - 0.3, 1.1, o.sleep); eye(2.4 + ex * 0.5, hy - 0.3, 1.1, o.sleep); poly([ex - 1.2, hy + 1, ex + 1.2, hy + 1, ex + (side ? 3 : 0), hy + 3.4], '#ffd24a'); }
        g.restore(); embers(0, -hv - 4, 12, t, 4, '#ffcf6a'); return hv;
    };
    PET.fada = (g2, v, o) => {
        const hv = o.sleep ? 2 : 8 + sin(o.t * 4) * 1.6, t = o.t, side = v === 'side', dc = '#f08ad0', wc = 'rgba(190,240,255,.75)';
        shadow(4.6 - hv * 0.12, 0.22 - hv * 0.01); glow(0, -hv - 8, 15, 'rgba(255,170,230,A)', 0.2 + sin(t * 5) * 0.04);
        g.save(); g.translate(0, -hv); const f = sin(t * 26) * 0.35, by = -7;
        const wingF = (sg, a) => { g.save(); g.translate(sg * (side ? -0.5 : 1.5), by - 3.5); g.rotate(sg * (a + f * 0.6)); g.scale(1, 1 + f * 0.2); ell(sg * 4.6, -2.4, 5.4, 2.6, wc, sg * -0.5, 0.7); ell(sg * 3.4, 1.6, 3.6, 1.8, 'rgba(255,230,250,.7)', sg * 0.5, 0.7); g.restore(); };
        if (v !== 'back') { wingF(-1, 0.4); if (!side) wingF(1, 0.4); }
        poly([-3, by, 3, by, 4.6, by + 6, -4.6, by + 6], dc); ell(0, by - 0.4, 3.2, 3.6, '#ffd8e8'); // vestido e tronco
        ln(-1.4, by + 6, -1.4, by + 9.4, 1.3, '#ffe0c8'); ln(1.4, by + 6, 1.4 + sin(t * 4) * 0.4, by + 9.4, 1.3, '#ffe0c8');
        if (v === 'back') { wingF(-1, 0.4); if (!side) wingF(1, 0.4); }
        ell(0, by - 5.6, 3.6, 3.6, '#ffe0c8'); // cabeça
        ell(0, by - 7.4, 4, 2.4, '#f6c84a', 0, 0.8); if (v !== 'front') ell(0, by - 5, 3.6, 3.2, '#f6c84a', 0, 0.8); else { poly([-3.6, by - 6, -4, by - 3.4, -2, by - 5.5], '#f6c84a', 0.8); poly([3.6, by - 6, 4, by - 3.4, 2, by - 5.5], '#f6c84a', 0.8); }
        if (v !== 'back') { const ex = side ? 1 : 0; eye(-1.3 + ex, by - 5.3, 0.9, o.sleep, '#3a2a60'); eye(1.3 + ex * 0.6, by - 5.3, 0.9, o.sleep, '#3a2a60'); }
        g.restore();
        g.fillStyle = 'rgba(255,240,170,.95)'; for (let i = 0; i < 4; i++) { const p = (t * 0.8 + i / 4) % 1; g.globalAlpha = 1 - p; g.fillRect(sin(i * 2.1 + t) * 5 - 0.7, -hv - 4 + p * (hv + 4), 1.5, 1.5); } g.globalAlpha = 1;
        return hv;
    };

    /* =================== MONTARIAS =================== */
    // cavalo (e variantes) de lado: x>0 = frente. Retorna seat.
    function leg2(x, y, l1, l2, a1, a2, w, c, hoof, hc) { const kx = x + sin(a1) * l1, ky = y + cos(a1) * l1, fx = kx + sin(a1 + a2) * l2, fy = ky + cos(a1 + a2) * l2; ln(x, y, kx, ky, w, c); ln(kx, ky, fx, fy, w * 0.82, c); if (hoof) rr(fx - w * 0.5, fy - 1, w + 0.6, 2.4, 1, hc || '#3a2a20', 0.8); }
    const HORSES = {
        cav_marrom: { c: '#8a5a32', c2: '#8a5a32', mane: '#2e1c10', tail: '#2e1c10', sock: 0, blaze: '#f1e6d2', sp: 1.0 },
        cav_branco: { c: '#f2efe9', c2: '#f2efe9', mane: '#d8d3c8', tail: '#d8d3c8', blaze: 0, sp: 1.0, shine: 1 },
        cav_guerra: { c: '#4a3a30', c2: '#4a3a30', mane: '#14100c', tail: '#14100c', armor: 1, blaze: '#cfc7bc', sp: 1.04 },
        cav_esqueleto: { c: '#d8d2bb', c2: '#d8d2bb', mane: '#4fd6ff', tail: '#4fd6ff', skel: 1, sp: 1.0 },
        cav_fogo: { c: '#7a1d12', c2: '#c8461e', mane: '#ff8a1c', tail: '#ff8a1c', fire: 1, sp: 1.04 },
        unicornio: { c: '#fbf8ff', c2: '#fbf8ff', mane: '#d79cff', tail: '#7ad7ff', horn: '#ffe27a', shine: 1, sp: 1.0 }
    };
    /* ===== cavalo detalhado: anatomia, trote articulado, armadura, esqueleto, fogo, unicórnio ===== */
    function horse(P, v, o, rider) {
        const t = o.t, mv = o.mv, ph = o.ph, S = P.sp || 1, c = P.c;
        const gal = mv > 0.1, bob = gal ? (0.5 + 0.5 * sin(ph - 0.9)) * 3.4 * mv : 0, br = sin(t * 1.8) * 0.5, by = -24 - bob + br;
        const cd = sh(c, -0.3), cl = sh(c, 0.22), belly = P.fire ? '#d8561e' : sh(c, 0.14);
        const bone = '#e6dfc6', boneD = '#b9b196', hc = P.fire ? '#ffb347' : P.skel ? '#cfc8b0' : '#2a1d14';
        const tc = P.armor ? '#8c1f1f' : '#5a2f14', gold = '#e6c25a', steel = '#aab1ba', steelD = '#7b8591', cloth = '#a82828';
        const seat = { x: v === 'side' ? -2 : 0, y: v === 'side' ? -32.5 - bob * 0.6 + br : -33 - bob * 0.6 + br };
        g.save(); g.scale(S, S);
        shadow(17.5, 0.32);
        const body = (k) => k ? cd : c;
        // perna lateral articulada (trote diagonal)
        const legS = (kind, hx, hy, u, col, w, far, go) => {
            const A = mv, s = sin(u), l = Math.max(0, cos(u)) * A, W = P.skel ? 0.62 : 1, gq = gal ? gaitPose(ph / TAU - go, 0.3) : null; let jx, jy, fx, fy, a3;
            const bone2 = P.skel ? (far ? boneD : bone) : col;
            if (kind === 'f') {
                const a1 = gq ? gq[0] * 0.8 : s * 0.55 * A; jx = hx + sin(a1) * 9.5; jy = hy + cos(a1) * 9.5; a3 = a1 - (gq ? gq[1] * 2 : l * 1.5) + 0.04;
                fx = jx + sin(a3) * 9.5; fy = jy + cos(a3) * 9.5;
                ln(hx, hy, jx, jy, 4.6 * W * w, bone2); ln(jx, jy, fx, fy, 2.7 * W * w, bone2); ell(jx, jy, 2 * W * w, 2 * W * w, bone2, 0, 0.7);
                if (P.armor && !far) { rr(jx - 2.6, jy - 5.5, 5.2, 5.4, 1.5, steel, 0.8); }
            } else {
                const a1 = gq ? 0.42 + gq[0] * 0.75 : 0.42 + s * 0.45 * A, a2 = gq ? -0.6 + gq[0] * 0.6 - gq[1] * 0.5 : -0.6 + s * 0.45 * A - l * 0.5; a3 = gq ? 0.12 + gq[0] * 0.3 - gq[1] * 1.5 : 0.12 + s * 0.2 * A - l * 1.1;
                const sx = hx + sin(a1) * 6.5, sy = hy + cos(a1) * 6.5, kx = sx + sin(a2) * 7.5, ky = sy + cos(a2) * 7.5;
                fx = kx + sin(a3) * 7; fy = ky + cos(a3) * 7;
                ln(hx, hy, sx, sy, 6.2 * W * w, bone2); ln(sx, sy, kx, ky, 3.8 * W * w, bone2); ln(kx, ky, fx, fy, 2.6 * W * w, bone2); ell(kx, ky, 1.8 * W * w, 1.8 * W * w, bone2, 0, 0.7);
            }
            if (P.sock) ln(fx, fy, fx - sin(a3) * 3.4, fy - cos(a3) * 3.4, 2.9 * w, P.sock);
            g.save(); g.translate(fx, fy); g.rotate(a3); rr(-1.9 * w, -0.4, 3.8 * w, 2.7, 1.1, P.skel ? boneD : hc, 0.8); g.restore();
            if (P.fire && mv > 0.1 && l > 0.3) flame(fx, fy + 1, 1.8, t + kind.length, '#ff5a14', '#ffd24a');
        };
        if (v === 'side') {
            const hipH = -by - 0, hy0 = by + 5, u0 = ph, TH = by - 19;
            // cauda
            const tw = sin(t * 3 + ph * 0.5) * 0.3 + mv * (gal ? 0.9 : 0.45);
            g.save(); g.translate(-16.5, by - 4.5); g.rotate(0.55 + tw);
            if (P.fire) { for (let i = 0; i < 4; i++) { g.rotate(0.12); flame(0, 0, 3.8 - i * 0.4, t + i * 0.6, '#ff5a14', '#ffd24a', false); } }
            else if (P.skel) { for (let i = 0; i < 3; i++) { g.rotate(0.15); flame(0, 2, 3.4, t + i, '#4fd6ff', '#d8fbff', false); } }
            else { qc(0, 0, -3.5, 8, -2.5, 20 + mv * 2, 5.4, P.tail); qc(0, 1, 1, 9, 1.5, 19 + mv * 2, 3.4, sh(P.tail, 0.22)); qc(0, 0, -5, 7, -5.5, 15, 2.4, sh(P.tail, -0.15)); }
            g.restore();
            // pernas do lado de lá
            legS('h', -10.5, by + 5, u0 + PI, body(1), 0.95, 1, 0.14); legS('f', 10.5, by + 5, u0, body(1), 0.95, 1, 0.38);
            // corpo
            g.beginPath(); g.moveTo(-17, by - 2); g.quadraticCurveTo(-17.5, by - 9.5, -9, by - 9.4); g.quadraticCurveTo(0, by - 7.6, 8, by - 9.8); g.quadraticCurveTo(16.8, by - 9.5, 17.4, by + 0.5); g.quadraticCurveTo(16, by + 9.2, 8, by + 9.4); g.quadraticCurveTo(0, by + 7.2, -8, by + 9.2); g.quadraticCurveTo(-17.5, by + 8.5, -17, by - 2); g.closePath();
            g.fillStyle = P.skel ? '#2a2a30' : c; g.fill(); g.lineWidth = 1; g.lineJoin = 'round'; g.strokeStyle = OUT; g.stroke();
            if (P.skel) {
                g.strokeStyle = bone; g.lineWidth = 1.8; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * 3.9 + 2, by - 8); g.quadraticCurveTo(i * 3.9 + 5.5, by, i * 3.9 + 2, by + 7.2); g.stroke(); }
                ln(-12, by - 8.8, 10, by - 9, 2, bone); ell(-12, by - 1, 4.4, 6.6, 'rgba(0,0,0,0)', 0, 1.4); ell(-12, by - 1, 4.4, 6.6, 'rgba(0,0,0,0)', 0, 0); g.strokeStyle = bone; g.lineWidth = 1.6; g.beginPath(); g.ellipse(-12, by - 1, 3.6, 6.2, 0, 0, TAU); g.stroke();
                glow(2, by, 12, 'rgba(79,214,255,A)', 0.25);
            } else {
                ell(1, by + 5.2, 13.5, 3.6, belly, 0, 0); ell(-3, by - 6.2, 11, 2.6, cl, 0, 0);
                g.strokeStyle = sh(c, -0.22); g.lineWidth = 0.9; g.beginPath(); g.moveTo(-14, by - 4); g.quadraticCurveTo(-6, by - 3, -6, by + 6); g.stroke(); g.beginPath(); g.moveTo(5, by - 6); g.quadraticCurveTo(11, by - 1, 8, by + 7); g.stroke();
                if (P.shine) { g.globalAlpha = 0.5; ell(-2, by - 6, 8, 1.5, '#fff', 0, 0); g.globalAlpha = 1; }
                if (P.fire) { glow(0, by + 1, 16, 'rgba(255,120,30,A)', 0.35); }
            }
            // armadura de barda (manta + peitoral)
            if (P.armor) {
                poly([-9.5, by - 8.5, 7.5, by - 8.5, 8.5, by + 6, 1, by + 9, -11, by + 6.5], cloth, 0.9);
                g.strokeStyle = gold; g.lineWidth = 0.9; g.beginPath(); g.moveTo(-11, by + 6.3); g.lineTo(1, by + 8.8); g.lineTo(8.4, by + 5.8); g.stroke();
                ell(-1.5, by, 2.8, 2.8, gold, 0, 0.7); ell(-1.5, by, 1.1, 1.1, cloth, 0, 0);
                g.beginPath(); g.moveTo(8, by - 7); g.quadraticCurveTo(18.4, by - 6, 17.6, by + 3); g.quadraticCurveTo(15, by + 9, 9.5, by + 8); g.closePath(); g.fillStyle = steel; g.fill(); g.lineWidth = 1; g.strokeStyle = OUT; g.stroke();
                ln(10, by - 5, 14.6, by + 5.5, 1, steelD); ell(15, by - 1, 1.2, 1.2, gold, 0, 0.5);
            }
            // pescoço
            const nod = sin(t * 1.5) * 0.4 - (gal ? sin(ph - 0.3) * 1.8 : 0), pkx = 18.5, pky = by - 20 + nod;
            g.beginPath(); g.moveTo(4, by - 9.6); g.quadraticCurveTo(11, by - 13, pkx - 1, pky); g.lineTo(pkx + 5, pky + 4.4); g.quadraticCurveTo(19, by - 6, 14.5, by + 3); g.lineTo(5, by + 2); g.closePath();
            g.fillStyle = P.skel ? '#2a2a30' : c; g.fill(); g.lineWidth = 1; g.strokeStyle = OUT; g.stroke();
            if (P.skel) { for (let i = 0; i < 4; i++) ell(7 + i * 2.7, by - 9 - i * 3.1, 1.9, 1.5, bone, 0, 0.8); }
            else { g.beginPath(); g.moveTo(6, by + 1); g.quadraticCurveTo(15, by - 3, pkx + 3, pky + 4.4); g.lineTo(pkx + 5, pky + 4.4); g.quadraticCurveTo(19, by - 6, 14.5, by + 3); g.closePath(); g.fillStyle = cl; g.globalAlpha = 0.3; g.fill(); g.globalAlpha = 1; }
            // crina
            if (P.fire) { for (let i = 0; i < 6; i++) flame(4 + i * 2.4, by - 9 - i * 2.1 + sin(t * 7 + i) * 0.4, 3.2 - i * 0.2, t + i * 0.7, '#ff5a14', '#ffd24a'); }
            else if (P.skel) { for (let i = 0; i < 5; i++) flame(3.4 + i * 2.7, by - 8.4 - i * 2.4, 2.8, t + i * 0.8, '#4fd6ff', '#d8fbff', false); }
            else {
                const sw2 = sin(t * 3 + 1) * 0.8 + mv * (gal ? 2.6 : 1.2);
                g.beginPath(); g.moveTo(3, by - 10); g.quadraticCurveTo(10, by - 16 - sw2 * 0.3, pkx - 1, pky - 1.4); g.lineTo(pkx + 1.6, pky + 0.6); g.quadraticCurveTo(10 - sw2, by - 10, 6.6 - sw2 * 1.5, by - 1.4); g.quadraticCurveTo(2 - sw2 * 1.2, by - 6, 3, by - 10); g.closePath();
                g.fillStyle = P.mane; g.fill(); g.lineWidth = 1; g.strokeStyle = OUT; g.stroke();
                g.strokeStyle = sh(P.mane, 0.25); g.lineWidth = 0.7; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(5 + i * 3.6, by - 11.4 - i * 1.6); g.quadraticCurveTo(5 + i * 3.4 - sw2, by - 7 - i * 1.2, 4 + i * 2.8 - sw2 * 1.4, by - 3 - i * 1.8); g.stroke(); }
            }
            if (P.armor) { for (let i = 0; i < 4; i++) { const px = 6.4 + i * 3, py = by - 9.6 - i * 2.8; g.save(); g.translate(px, py); g.rotate(0.9); rr(-2.4, -1.5, 4.8, 3, 1, steel, 0.8); g.restore(); } }
            // cabeça
            g.save(); g.translate(pkx, pky); const hr = 0.95 + sin(t * 1.5) * 0.03 + (mv > 0.1 ? sin(ph * 2 + 1) * 0.06 : 0); g.rotate(hr);
            if (P.skel) {
                ell(0, 0, 5.8, 4.4, bone); ell(8, 0.8, 5.4, 3, boneD); ell(11.8, 1, 2.2, 2.2, bone, 0, 0.8); ell(1.6, -1, 2.1, 2.2, '#15110d', 0, 0); glow(1.6, -1, 5, 'rgba(79,214,255,A)', 0.7); ell(1.6, -1, 1, 1, '#bff3ff', 0, 0);
                g.strokeStyle = OUT; g.lineWidth = 0.8; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(8 + i * 1.3, 2.3); g.lineTo(8.2 + i * 1.3, 3.8); g.stroke(); } ell(12.4, 0.2, 0.8, 0.8, '#15110d', 0, 0);
            } else {
                ell(0, 0, 5.8, 4.6, c); ell(8, 1, 5.3, 3.5, c); ell(11.8, 1.6, 2.7, 2.9, belly); ell(4.6, 3, 4.6, 2.4, cd, 0, 0); ell(0.2, 0.4, 5, 3.6, c, 0, 0);
                ell(12.6, 0.8, 0.9, 0.7, '#2a1a14', 0, 0); g.strokeStyle = '#2a1a14'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(12.4, 3.4); g.quadraticCurveTo(10, 3.7, 8.4, 3.2); g.stroke();
                eye(1.6, -1.2, 1.35, false, P.fire ? '#ffe27a' : null); if (P.blaze) ell(5, -1.6, 6, 0.9, P.blaze, 0, 0);
                if (P.fire) glow(2, 0, 9, 'rgba(255,170,60,A)', 0.4);
            }
            // orelhas (compensando a rotação)
            const ear = (dx, k) => { g.save(); g.rotate(-hr); poly([-1.8 + dx, -2.6, -2.6 + dx + k, -9.4 + (P.skel ? 0.6 : 0), 1.2 + dx, -3.2], P.skel ? bone : c, 0.9); if (!P.skel) poly([-1.8 + dx, -3.4, -2.2 + dx + k, -7.6, 0.2 + dx, -3.7], P.fire ? '#ff9a3a' : '#e9a3a3', 0); if (P.fire) flame(-2 + dx, -9, 1.6, t + dx, '#ff5a14', '#ffd24a'); g.restore(); };
            ear(1.6, 0.4); ear(-0.2, -0.6);
            if (P.horn) { g.save(); g.rotate(-hr + 1.0); const bx = 2.2 * cos(hr) - 3.2 * sin(hr); g.restore(); g.save(); g.rotate(-hr * 0 - 0.1); poly([0.4, -3.2, 3.6, -2.8, 1.2, -16], P.horn, 0.9); g.strokeStyle = 'rgba(150,100,0,.75)'; g.lineWidth = 0.7; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(0.8 + i * 0.3, -5 - i * 2.8); g.lineTo(3.4 - i * 0.55, -4.6 - i * 2.8); g.stroke(); } glow(1.2, -16, 6, 'rgba(255,240,150,A)', 0.55); g.restore(); }
            if (!P.skel && !P.fire) { g.save(); g.rotate(-hr); const fl = sin(t * 3) * 0.6 + mv; g.beginPath(); g.moveTo(1, -3.4); g.quadraticCurveTo(5 + fl, -3, 5.4 + fl, 2.6); g.quadraticCurveTo(2.6, -0.4, -0.6, -1.6); g.closePath(); g.fillStyle = P.mane; g.fill(); g.lineWidth = 0.9; g.strokeStyle = OUT; g.stroke(); g.restore(); }
            if (P.armor) { poly([-2.2, -3.5, 9.5, -1.5, 12.6, 1.6, 10.4, 3.4, 3, 3.6, -1.4, 1], steel, 0.9); ln(-1.4, -3, 10.5, 0.2, 0.9, steelD); ell(1, -1.6, 1.4, 1.4, gold, 0, 0.5); poly([0.2, -3.2, 1.4, -3.6, 1.8, -7.6], steelD, 0.7); eye(1.6, -1.2, 1.2, false, '#ffd24a'); }
            if (P.tack) { ln(4, -3.6, 4.6, 3.2, 1.1, tc); ln(-1, -3.6, 4.4, 2.2, 0.9, tc); ell(4.7, 1, 0.9, 0.9, gold, 0, 0.4); ln(9, 2.6, 9.4, 1, 0.8, tc);
                if (P.plume) { g.save(); g.rotate(-hr); for (let i = 0; i < 3; i++) poly([-0.4 + i * 0.7, -3.4, -3.6 + i * 2.4, -12.6 - i * 1.3 - sin(t * 5 + i) * 0.8, 1.6 + i * 0.8, -3.8], i === 1 ? '#ffd24a' : '#d83a3a', 0.6); g.restore(); } }
            g.restore();
            // pernas perto
            legS('h', -9.5, by + 5, u0, body(0), 1, 0, 0); legS('f', 11.5, by + 5, u0 + PI, body(0), 1, 0, 0.22);
            if (P.tack) { ln(9, by - 7, 10.5, by + 7.8, 1.7, tc); ln(-1, by - 8.5, -1.5, by + 8.8, 1.5, tc); }
            if (P.tack) { const hx2 = pkx + 12 * cos(hr + 0.0), hy2 = pky + 12 * sin(hr); g.strokeStyle = tc; g.lineWidth = 0.8; g.beginPath(); g.moveTo(pkx + 9, pky + 4.6); g.quadraticCurveTo(10, by - 6, -1, by - 10.4); g.stroke(); }
            rider(seat);
            // sela
            rr(-8, by - 10.6, 12, 3.4, 1.6, P.armor ? '#7a1e1e' : '#6b3a1c'); if (!P.skel) { g.strokeStyle = gold; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-7.4, by - 8.8); g.lineTo(3.4, by - 8.8); g.stroke(); }
            rr(-8.6, by - 11.8, 2.4, 2.8, 1, P.armor ? '#7a1e1e' : '#6b3a1c', 0.8);
            if (P.fire) embers(0, by - 4, 22, t, 6);
            if (P.skel) { for (let i = 0; i < 3; i++) { g.globalAlpha = 0.5; g.fillStyle = '#9be8ff'; g.fillRect(-14 + i * 11 + sin(t * 3 + i) * 2, by + 4 - ((t * 8 + i * 5) % 10), 1.4, 1.4); } g.globalAlpha = 1; }
        } else {
            const back = v === 'back', w = back ? 10 : 8.4, lf = (u, kk) => (gal ? gaitPose(u / TAU, 0.3)[1] : Math.max(0, cos(u)) * mv) * kk;
            const legF = (x, y0, u, col, wd, kk, far) => { const l = lf(u, kk), yy = y0, fy = -0.2 - l, A = P.skel ? 0.6 : 1; ln(x, yy, x, fy - 0.6, wd * A, P.skel ? (far ? boneD : bone) : col); ell(x, (yy + fy) * 0.5 + 1, wd * 0.62 * A, 1.4 * A, P.skel ? bone : col, 0, 0.7); rr(x - wd * 0.62, fy - 0.8, wd * 1.24, 2.5, 1, P.skel ? boneD : hc, 0.8); if (P.armor && !back) rr(x - wd * 0.5, fy - 7, wd, 5, 1.4, steel, 0.8); if (P.fire && l > 0.3) flame(x, fy + 1, 1.8, t, '#ff5a14', '#ffd24a'); };
            const sx = back ? sin(ph * 2) * mv * 0.3 : 0;
            if (back) {
                // cauda atrás do corpo, pende pelo meio
                const tsw = sin(t * 3 + ph) * (1.4 + mv * 1.6);
                if (P.fire) { for (let i = 0; i < 4; i++) flame(tsw * 0.3 + (i - 1.5) * 1.6, by + 14 - i * 0.5, 3.6, t + i * 0.5, '#ff5a14', '#ffd24a', false); }
                else if (P.skel) { for (let i = 0; i < 3; i++) flame((i - 1) * 2, by + 14, 3.4, t + i, '#4fd6ff', '#d8fbff', false); }
                else { qc(0, by - 3, tsw * 0.5, by + 8, tsw, by + 24, 6, P.tail); qc(-1.5, by - 2, tsw * 0.3 - 2, by + 8, tsw - 1, by + 21, 3, sh(P.tail, 0.2)); }
            }
            // pernas de trás (e dianteiras atrás na vista de costas)
            if (back) { legF(-3.8, by + 7, ph, cd, 3, 2.8, 1); legF(3.8, by + 7, ph + PI, cd, 3, 2.8, 1); }
            else { legF(-5.2, by + 6, ph + PI, cd, 3.2, 2.6, 1); legF(5.2, by + 6, ph, cd, 3.2, 2.6, 1); }
            // corpo
            g.save(); g.translate(sx * 0.4, 0);
            if (P.skel) { ell(0, by, w, 9.5, '#2a2a30'); g.strokeStyle = bone; g.lineWidth = 1.7; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * 3.4, by - 8.6); g.quadraticCurveTo(i * 3.4 + (i ? i * 2.4 : 0), by, i * 3.4, by + 8); g.stroke(); } ln(0, by - 9, 0, by + 9, 1.8, bone); if (back) { ell(-5, by + 3, 3.4, 5.6, 'rgba(0,0,0,0)', 0, 0); g.strokeStyle = bone; g.lineWidth = 1.4; g.beginPath(); g.ellipse(-5, by + 3, 3, 5.4, 0, 0, TAU); g.stroke(); g.beginPath(); g.ellipse(5, by + 3, 3, 5.4, 0, 0, TAU); g.stroke(); } glow(0, by, 11, 'rgba(79,214,255,A)', 0.25); }
            else {
                ell(0, by, w, 9.6, c);
                if (back) { ell(-w * 0.46, by + 2.4, 5.2, 7.4, sh(c, 0.07), 0, 0.8); ell(w * 0.46, by + 2.4, 5.2, 7.4, sh(c, 0.07), 0, 0.8); ln(0, by - 4, 0, by + 8, 0.9, sh(c, -0.25)); ell(0, by - 6.6, w * 0.8, 2.6, cl, 0, 0); }
                else { ell(0, by + 3, w * 0.8, 6.4, belly, 0, 0); ell(-4.6, by + 1.4, 3.8, 7.2, sh(c, 0.07), 0, 0.8); ell(4.6, by + 1.4, 3.8, 7.2, sh(c, 0.07), 0, 0.8); }
                if (P.shine) { g.globalAlpha = 0.45; ell(0, by - 6.6, w * 0.7, 1.4, '#fff', 0, 0); g.globalAlpha = 1; }
                if (P.fire) glow(0, by + 1, 14, 'rgba(255,120,30,A)', 0.35);
            }
            g.restore();
            if (P.armor) { poly([-w + 0.6, by - 7, w - 0.6, by - 7, w - 0.4, by + 6, 0, by + 8.6, -w + 0.4, by + 6], cloth, 0.9); g.strokeStyle = gold; g.lineWidth = 0.9; g.beginPath(); g.moveTo(-w + 0.4, by + 6); g.lineTo(0, by + 8.4); g.lineTo(w - 0.4, by + 6); g.stroke(); if (!back) { g.beginPath(); g.ellipse(0, by + 2, w - 1.6, 6.8, 0, 0, TAU); g.fillStyle = steel; g.fill(); g.lineWidth = 1; g.strokeStyle = OUT; g.stroke(); ln(0, by - 4, 0, by + 8.4, 0.9, steelD); ell(0, by + 2, 1.7, 1.7, gold, 0, 0.6); } }
            if (!back) {
                legF(-4.4, by + 5.5, ph, body(0), 3.6, 3.2, 0); legF(4.4, by + 5.5, ph + PI, body(0), 3.6, 3.2, 0);
            } else { legF(-5.2, by + 6.4, ph + PI, body(0), 3.8, 3.2, 0); legF(5.2, by + 6.4, ph, body(0), 3.8, 3.2, 0); }
            if (back) {
                // pescoço atrás do cavaleiro (crina visível acima da sela)
                g.save(); g.translate(sx * 0.7, 0); ell(0, by - 12, 5, 8, P.skel ? bone : c); if (P.fire) { for (let i = -1; i <= 1; i++) flame(i * 2.4, by - 17, 3.2, t + i, '#ff5a14', '#ffd24a'); } else if (!P.skel) { ell(0, by - 12, 3.4, 8, P.mane); } g.restore();
            }
            rider(seat);
            rr(-6.6, by - 10.6, 13.2, 3.4, 1.6, P.armor ? '#7a1e1e' : '#6b3a1c'); if (!P.skel) { g.strokeStyle = gold; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-6, by - 8.8); g.lineTo(6, by - 8.8); g.stroke(); }
            if (!back) { // pescoço + cabeça à frente do cavaleiro
                const hy = by - 12 + sin(t * 1.5) * 0.4, hx = sin(ph * 2) * mv * 0.5;
                g.save(); g.translate(hx, 0);
                // crina
                if (P.fire) { for (let i = -2; i <= 2; i++) flame(i * 2.4, hy - 7 - Math.abs(i) * 0.6, 3.2, t + i, '#ff5a14', '#ffd24a'); }
                else if (P.skel) { for (let i = -2; i <= 2; i++) flame(i * 2.4, hy - 6, 2.8, t + i, '#4fd6ff', '#d8fbff'); }
                else { ell(0, hy - 3, 6.6, 9, P.mane); }
                // pescoço
                if (P.skel) { ell(0, hy + 2, 4.2, 8.4, '#2a2a30'); for (let i = 0; i < 3; i++) ell(0, hy - 2 + i * 3.4, 3.4, 1.4, bone, 0, 0.8); }
                else { ell(0, hy + 1.6, 5, 9, c); ell(0, hy + 4, 3.6, 7, cl, 0, 0); }
                if (P.armor) { for (let i = 0; i < 3; i++) rr(-3.4, hy - 4.6 + i * 3, 6.8, 2.6, 1, steel, 0.8); }
                // cabeça (focinho para o espectador)
                if (P.skel) { ell(0, hy + 3, 4.5, 7, bone); ell(0, hy + 9.4, 3.2, 2.4, boneD); ell(-2.3, hy + 0.6, 1.8, 2, '#15110d', 0, 0); ell(2.3, hy + 0.6, 1.8, 2, '#15110d', 0, 0); glow(0, hy + 0.6, 7, 'rgba(79,214,255,A)', 0.55); ell(-2.3, hy + 0.6, 0.8, 0.8, '#bff3ff', 0, 0); ell(2.3, hy + 0.6, 0.8, 0.8, '#bff3ff', 0, 0); ln(0, hy + 3.4, 0, hy + 6, 0.8, '#15110d'); }
                else {
                    ell(0, hy + 2.6, 4.6, 6.8, c); ell(0, hy + 9.2, 3.5, 2.7, belly); ell(-1.5, hy + 9.6, 0.8, 0.7, '#2a1a14', 0, 0); ell(1.5, hy + 9.6, 0.8, 0.7, '#2a1a14', 0, 0);
                    if (P.blaze) ell(0, hy + 2.8, 1.3, 6, P.blaze, 0, 0);
                    eye(-3.5, hy + 0.2, 1.2, false, P.fire ? '#ffe27a' : null); eye(3.5, hy + 0.2, 1.2, false, P.fire ? '#ffe27a' : null);
                    g.beginPath(); g.moveTo(-1.8, hy - 4); g.quadraticCurveTo(0, hy - 2.4, 1.8, hy - 4); g.quadraticCurveTo(2.4, hy - 0.4, 0, hy + 0.6); g.quadraticCurveTo(-2.4, hy - 0.4, -1.8, hy - 4); g.fillStyle = P.fire ? '#ff8a1c' : P.mane; g.fill();
                }
                if (P.armor) { poly([-3.2, hy - 3.4, 3.2, hy - 3.4, 2.8, hy + 8.6, 0, hy + 10.4, -2.8, hy + 8.6], steel, 0.9); ln(0, hy - 3, 0, hy + 9.6, 0.9, steelD); ell(0, hy - 1, 1.3, 1.3, gold, 0, 0.5); poly([-0.9, hy - 3.6, 0.9, hy - 3.6, 0, hy - 8.4], steelD, 0.7); eye(-3.5, hy + 0.2, 1.1, false, '#ffd24a'); eye(3.5, hy + 0.2, 1.1, false, '#ffd24a'); }
                for (const s of [-1, 1]) { poly([s * 2.8, hy - 3, s * 5.6, hy - 11, s * 0.9, hy - 4.4], P.skel ? bone : c, 0.9); if (!P.skel) poly([s * 2.9, hy - 4, s * 4.6, hy - 9, s * 1.6, hy - 4.8], P.fire ? '#ff9a3a' : '#e9a3a3', 0); if (P.fire) flame(s * 5.2, hy - 10.5, 1.6, t + s, '#ff5a14', '#ffd24a'); }
                if (P.horn) { poly([-1.3, hy - 3.2, 1.3, hy - 3.2, 0, hy - 15], P.horn, 0.8); g.strokeStyle = 'rgba(150,100,0,.75)'; g.lineWidth = 0.7; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-1 + i * 0.12, hy - 5.4 - i * 2.5); g.lineTo(1 - i * 0.12, hy - 4.6 - i * 2.5); g.stroke(); } glow(0, hy - 15, 6, 'rgba(255,240,150,A)', 0.55); }
                if (P.tack) { ln(-4.2, hy - 1, 4.2, hy - 1, 1, tc); ln(-3.2, hy + 7, 3.2, hy + 7, 1, tc); ell(0, hy + 7, 0.9, 0.9, gold, 0, 0.4); if (P.plume) { for (let i = 0; i < 3; i++) poly([-1.2 + i * 1.2, hy - 4, -3.6 + i * 2.6, hy - 13 - i * 1.2 - sin(t * 5 + i) * 0.8, 0.4 + i * 1.2, hy - 4.4], i === 1 ? '#ffd24a' : '#d83a3a', 0.6); } }
                g.restore();
                if (P.tack) { ln(-4, by - 2, 4, by - 2, 1.4, tc); ell(0, by - 2, 1.4, 1.4, gold, 0, 0.5); }
            }
            if (P.fire) embers(0, by - 4, 18, t, 5);
            if (P.skel) { for (let i = 0; i < 3; i++) { g.globalAlpha = 0.5; g.fillStyle = '#9be8ff'; g.fillRect(-8 + i * 8 + sin(t * 3 + i) * 2, by + 4 - ((t * 8 + i * 5) % 10), 1.4, 1.4); } g.globalAlpha = 1; }
        }
        g.restore(); return seat;
    }

    /* lobo gigante, pantera: quadrúpedes grandes de lado/frente/costas */
    const BIG = {
        lobo_gigante: { c1: '#767d88', c2: '#d6dbe2', c3: '#454b54', bl: 17, bh: 9.4, lg: 11, lw: 4.4, hr: 8.6, ears: 'wolf', tail: 'wolf', sn: 5.6, snc: '#d6dbe2', eye: '#e8b43a', hup: 0.6, big: 1, seatY: -34 },
        pantera: { c1: '#2d2442', c2: '#51407a', c3: '#150f24', bl: 17, bh: 8.4, lg: 10.4, lw: 4.2, hr: 8, ears: 'cat', tail: 'cat', inner: '#7a5ac4', eye: '#ffe05a', big: 1, seatY: -31, aura: 1 },
        dragao: { c1: '#3f9a58', c2: '#e8d28a', c3: '#245e36', bl: 19, bh: 9.6, lg: 9, lw: 4.4, hr: 8.6, ears: 'none', tail: 'drag', sn: 5, snc: '#4fae68', horn: '#e8dcb0', wings: 1, ws: 1.5, wc: '#2f7a46', wc2: '#8fd09a', spikes: 1, belly: '#e8d28a', eye: '#ffd24a', hover: 1, big: 1, hup: 2 }
    };
    /* ===== lobo gigante e pantera: predadores detalhados (pata digitígrada, trote, cauda, cabeça própria) ===== */
    const PRED = {
        lobo_gigante: { wolf: 1, c1: '#7b828d', c2: '#d9dde3', c3: '#474d57', len: 16.5, h: 8.6, by: -21.5, seatY: -31.5, eye: '#f0be3a', nose: '#1d1d22' },
        pantera: { wolf: 0, c1: '#2d2450', c2: '#7a64c8', c3: '#130f2a', len: 20, h: 5.8, by: -19.4, seatY: -28, eye: '#ffb81e', nose: '#5c3f78' }
    };
    function predator(id, v, o, rider) {
        const P = PRED[id], W = P.wolf, t = o.t, mv = o.mv, ph = o.ph, c1 = P.c1, c2 = P.c2, c3 = P.c3, cd = sh(c1, -0.25);
        const gal = mv > 0.1, bob = gal ? (0.5 + 0.5 * sin(ph - 0.9)) * (W ? 2.6 : 3.6) * mv : 0, br = sin(t * 2) * 0.4, by = P.by - bob + br, side = v === 'side';
        const seat = { x: side ? -1 : 0, y: P.seatY - bob * 0.5 + br };
        const hipY = by + 4, lk = (-hipY) / 15.5;
        shadow(P.len + 1, 0.32);
        const leg = (kind, hx, u, col, w, far, go) => {
            const A = mv * (W ? 1 : 1.2), s = sin(u), l = Math.max(0, cos(u)) * A, gq = gal ? gaitPose(ph / TAU - go, 0.28) : null; let fx, fy, a3;
            if (kind === 'f') {
                const a1 = (gq ? gq[0] * 0.95 : s * 0.7 * A) + 0.06, a2 = a1 * 0.5 - (gq ? gq[1] * 1.9 : l * 1.4) - 0.02, jx = hx + sin(a1) * 7.5 * lk, jy = hipY + cos(a1) * 7.5 * lk;
                fx = jx + sin(a2) * 8 * lk; fy = jy + cos(a2) * 8 * lk; a3 = a2;
                ln(hx, hipY, jx, jy, 5.2 * w, col); ln(jx, jy, fx, fy, 3.4 * w, col);
            } else {
                const a1 = gq ? 0.55 + gq[0] * 0.8 : 0.55 + s * 0.5 * A, a2 = gq ? -0.85 + gq[0] * 0.55 - gq[1] * 0.5 : -0.85 + s * 0.45 * A - l * 0.4, a3b = gq ? 0.35 + gq[0] * 0.3 - gq[1] * 1.3 : 0.35 + s * 0.2 * A - l * 1.0;
                const kx = hx + sin(a1) * 7.2 * lk, ky = hipY + cos(a1) * 7.2 * lk, hx2 = kx + sin(a2) * 7.2 * lk, hy2 = ky + cos(a2) * 7.2 * lk;
                fx = hx2 + sin(a3b) * 5 * lk; fy = hy2 + cos(a3b) * 5 * lk; a3 = a3b;
                ln(hx, hipY, kx, ky, 6.6 * w, col); ln(kx, ky, hx2, hy2, 3.8 * w, col); ln(hx2, hy2, fx, fy, 2.8 * w, col);
            }
            ell(fx + 0.8, fy, 3.1 * w, 1.9 * w, far ? cd : (W ? c2 : c1)); g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 0.6; for (let i = 0; i < 2; i++) { g.beginPath(); g.moveTo(fx + 1.6 + i * 1.1, fy - 0.8); g.lineTo(fx + 2 + i * 1.1, fy + 1.2); g.stroke(); }
        };
        if (side) {
            // cauda
            const tw = sin(t * 2.6 + ph * 0.4) * (0.2 + mv * 0.2) - (gal ? 0.35 : 0);
            if (W) { g.save(); g.translate(-16, by - 3); g.rotate(0.9 + tw + mv * 0.25); g.beginPath(); g.moveTo(0, -2.6); g.quadraticCurveTo(-8, -1, -15, 6); g.quadraticCurveTo(-8, 5.4, 0, 2.6); g.closePath(); g.fillStyle = c1; g.fill(); g.lineWidth = 1; g.strokeStyle = OUT; g.stroke(); g.beginPath(); g.moveTo(-9, 0.6); g.quadraticCurveTo(-12, 2.6, -15, 6); g.quadraticCurveTo(-11.4, 5.2, -9.6, 3.6); g.closePath(); g.fillStyle = c3; g.fill(); ell(-3.4, 0.8, 4.4, 1.2, c2, 0, 0); g.restore(); }
            else { const N = 14, pts = []; for (let i = 0; i <= N; i++) { const k = i / N; pts.push([-P.len + 1 - Math.sin(k * 2.3) * 14 - k * 4 + sin(t * 3 + k * 4 - ph * 0.5) * 1.8 * k, by - 1 + Math.sin(k * 3.1) * 9 - (k > 0.75 ? (k - 0.75) * 40 : 0) + (gal ? -k * 4 : 0)]); } g.lineCap = 'round'; g.lineJoin = 'round'; for (let pass = 0; pass < 2; pass++) { for (let i = 0; i < N; i++) { g.strokeStyle = pass ? c1 : OUT; g.lineWidth = (pass ? 3.4 : 5) * (1 - i / N * 0.45); g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[i + 1][0], pts[i + 1][1]); g.stroke(); } } glow(pts[N][0], pts[N][1], 5, 'rgba(170,130,255,A)', 0.55); }
            // pernas do lado de lá
            leg('h', -10.5, ph + PI, cd, 0.95, 1, 0.1); leg('f', 9.5, ph, cd, 0.95, 1, 0.5);
            // corpo
            const L = P.len, H = P.h;
            if (W) { g.beginPath(); g.moveTo(-L, by - 1); g.quadraticCurveTo(-L - 0.8, by - H, -L + 6, by - H - 0.2); g.quadraticCurveTo(0, by - H + (W ? 0.6 : 1.6), L - 6, by - H - 0.8); g.quadraticCurveTo(L + 1.2, by - H, L, by + 1.5); g.quadraticCurveTo(L - 2, by + H + 1, L - 8, by + H - 0.6); g.quadraticCurveTo(0, by + H - 3.2, -L + 8, by + H - 0.4); g.quadraticCurveTo(-L - 0.8, by + H, -L, by - 1); g.closePath();
            g.fillStyle = c1; g.fill(); g.lineWidth = 1; g.lineJoin = 'round'; g.strokeStyle = OUT; g.stroke(); } else {
                const fxx = sin(ph - 0.3) * 2.6 * mv; blob([[-L * 0.5, by + 0.6 + fxx, L * 0.56, H * 1.02], [L * 0.5, by - 0.4 - fxx, L * 0.52, H * 1.14], [0, by + 1.2, L * 0.72, H * 0.8]], c1);
                ell(L * 0.34, by - H + 1.6 - fxx, 4.8, 3, sh(c1, 0.1), -0.35, 0.8); ell(-L * 0.55, by - 0.5 + fxx, 6, H * 0.8, sh(c1, 0.06), 0, 0.8);
                ell(0, by + H * 0.78, L * 0.7, 2, c3, 0, 0); g.strokeStyle = 'rgba(215,195,255,.7)'; g.lineWidth = 0.9; g.lineCap = 'round'; g.beginPath(); g.moveTo(-L * 0.9, by - H * 0.55 + fxx); g.quadraticCurveTo(0, by - H - 0.4, L * 0.8, by - H * 0.9 - fxx); g.stroke();
            }
            if (W) { // dorso escuro, barriga clara, pelo em tufos
                g.save(); g.clip(); ell(-1, by - H + 1, L - 1, 4.2, c3, 0, 0); ell(0, by + H - 1.2, L - 3, 3.6, c2, 0, 0); g.restore();
                g.fillStyle = c3; g.beginPath(); g.moveTo(-L + 5, by - H - 0.2); for (let i = 0; i < 8; i++) { g.lineTo(-L + 8 + i * 4, by - H - 2.4 + (i % 2) * 0.8); g.lineTo(-L + 10 + i * 4, by - H - 0.4); } g.closePath(); g.fill();
                g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-14, by - 4); g.quadraticCurveTo(-7, by - 3, -6, by + 5); g.stroke(); g.beginPath(); g.moveTo(5, by - 6); g.quadraticCurveTo(11, by - 1, 8, by + 6); g.stroke();
            } else {
                g.lineCap = 'round'; g.lineJoin = 'round'; for (let i = 0; i < 5; i++) { g.globalAlpha = 0.65 + sin(t * 2.2 + i) * 0.3; const x0 = -13 + i * 6.2; g.strokeStyle = 'rgba(160,120,255,.5)'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(x0, by - 4.4); g.lineTo(x0 + 1.4, by - 1.4); g.lineTo(x0 - 0.2, by + 0.4); g.lineTo(x0 + 1.2, by + 3.8); g.stroke(); g.strokeStyle = '#eadfff'; g.lineWidth = 0.9; g.stroke(); } g.globalAlpha = 1;   // veios de luz rúnica
                glow(0, by + 1, 24, 'rgba(150,100,255,A)', 0.22);
                g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-14, by - 3); g.quadraticCurveTo(-7, by - 2, -7, by + 5); g.stroke();
            }
            // pescoço + cabeça
            const nod = sin(t * 1.6) * 0.4 - (mv > 0.1 ? sin(ph * 2) * 0.5 : 0), hx = L - 0.5 + (W ? 4 : 6.5), hy = by - (W ? 7.5 : -0.8) + nod;
            g.beginPath(); g.moveTo(L - 9, by - H - 0.8); g.quadraticCurveTo(L - 2, by - H - (W ? 1.6 : 0), hx, hy - (W ? 3.4 : 4.6)); g.lineTo(hx + 1, hy + 5); g.quadraticCurveTo(L, by + 5, L - 8, by + H - 1); g.closePath(); g.fillStyle = c1; g.fill(); g.lineWidth = 1; g.strokeStyle = OUT; g.stroke();
            if (W) { ell(L - 2.4, by + 0.5, 6.6, 7.8, c2); poly([L - 8, by + 6, L - 6.2, by + 11, L - 3.6, by + 6.6], c2, 0.9); poly([L - 4, by + 6.8, L - 1.4, by + 11.6, L + 1.6, by + 5.4], c2, 0.9); poly([L - 1, by - 5, L + 3, by - 1, L + 1, by + 3], sh(c2, 0.1), 0); }
            if (!W) {   // equipamento da Pantera Sombra por nível da montaria: colar com espinhos (1+), placa rúnica no ombro (2+)
                const stg = o.stage | 0, brown = '#6b4a3a', brownL = '#9a6e4e';
                if (stg >= 2) { g.save(); g.translate(L * 0.3, by - H - 0.4); g.rotate(-0.1); rr(-5.4, -4, 10.8, 9.4, 3, brown, 0.9); rr(-4, -2.8, 8, 7, 2, brownL, 0.6); g.strokeStyle = '#eadfff'; g.lineWidth = 0.9; g.beginPath(); g.rect(-1.8, -1, 3.6, 3.6); g.stroke(); glow(0, 1, 6, 'rgba(170,130,255,A)', 0.5); g.restore(); }
                if (stg >= 1) { g.save(); g.translate(hx - 7.4, hy + 0.4); g.rotate(0.2); rr(-1.8, -6.4, 3.6, 12.8, 1.6, brown, 0.9); ln(0, -5.4, 0, 5.4, 0.8, brownL); for (let i = 0; i < 4; i++) poly([-1.8, -5 + i * 3.2, -4.6, -5.6 + i * 3.2, -1.8, -3.6 + i * 3.2], '#d8d4e8', 0.6); g.restore(); }
            }
            g.save(); g.translate(hx, hy); g.rotate(W ? 0.12 : 0.26); if (!W) g.scale(1.0, 1.0);
            if (W) {
                ell(0, 0, 6.2, 5.2, c1); ell(8.2, 1.9, 6.6, 3, c1); ell(8.6, 3.4, 5.8, 1.6, c2, 0, 0); ell(13.6, 1.2, 1.7, 1.4, P.nose, 0, 0.6);
                g.strokeStyle = '#1d1d22'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(13, 3.6); g.quadraticCurveTo(8.6, 4.8, 5, 3.4); g.stroke(); poly([10.6, 3.8, 11.6, 3.8, 11.1, 5.6], '#f2f2f2', 0.6);
                poly([-2.4, -3.8, -3.6, -10.6, 2, -4.6], c1, 0.9); poly([-2, -4.2, -2.8, -8.4, 0.8, -4.8], '#caa0a0', 0); poly([-4.6, -3, -7, -8.4, -1, -4.4], cd, 0.9);
                ell(2.6, -1, 1.9, 1.3, P.eye, -0.3, 0.7); ell(2.9, -1, 0.5, 0.9, '#1d1d22', 0, 0); ell(3, 4.4, 4, 1.6, c2, 0, 0); g.strokeStyle = c3; g.lineWidth = 1; g.beginPath(); g.moveTo(5.4, -3.6); g.lineTo(9.6, -1.2); g.stroke();
            } else {
                // PANTERA SOMBRA (referência do jogo): rosnando, presas, olho laranja brilhante com marca, bigodes finos, orelhas pontudas
                const hp = () => { g.beginPath(); g.moveTo(-5, -1); g.quadraticCurveTo(-4.4, -5.8, 0.4, -5.9); g.quadraticCurveTo(4.6, -5.9, 7, -3.6); g.quadraticCurveTo(8.6, -2.6, 10.6, -2.2); g.lineTo(11.8, -0.8); g.quadraticCurveTo(12.2, 0.8, 11.4, 1.8); g.lineTo(10.6, 2.8); g.quadraticCurveTo(7, 3.6, 3, 3.2); g.lineTo(2.4, 3.6); g.quadraticCurveTo(-1, 5.8, -3, 5.6); g.quadraticCurveTo(-6.4, 3.6, -5, -1); g.closePath(); };
                const ear = (x, y, k, col) => { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x - 0.6 * k, y - 3.8, x - 1.6 * k, y - 5.6); g.quadraticCurveTo(x + 1.4 * k, y - 5, x + 3.4 * k, y - 0.6); g.closePath(); g.fillStyle = col; g.fill(); g.lineWidth = 0.9; g.strokeStyle = OUT; g.stroke(); };
                ear(-7.2, -2.4, 1.2, cd); ear(-4.2, -5, 1.25, c1); g.beginPath(); g.moveTo(-3.8, -5.6); g.quadraticCurveTo(-4.6, -8.2, -5.2, -9.4); g.quadraticCurveTo(-2.8, -9, -1.4, -6.2); g.closePath(); g.fillStyle = P.nose; g.globalAlpha = 0.8; g.fill(); g.globalAlpha = 1;
                // mandíbula aberta + boca
                poly([2, 3.2, 6, 4.8, 10.2, 6.8, 9.8, 9.2, 5.8, 9.8, 1.2, 7.4], c1, 0.9);
                poly([3, 3, 10.8, 2.8, 10.2, 6.6, 3.6, 5.2], '#b8324a', 0.6); ell(7, 5.2, 2.8, 1, '#e0607a', 0, 0);
                poly([8.4, 6.9, 9.7, 6.7, 9.3, 4.2], '#fff3d0', 0.5); poly([3.6, 5.4, 4.4, 5.8, 4.2, 7], '#fff3d0', 0.4);
                hp(); g.fillStyle = c1; g.fill(); g.save(); hp(); g.clip(); ell(9.6, 1.4, 3.6, 2.6, sh(c1, 0.22), 0, 0); g.restore();
                hp(); g.lineWidth = 1; g.lineJoin = 'round'; g.strokeStyle = OUT; g.stroke();
                poly([9.4, 2.8, 10.8, 2.8, 10.2, 6.2], '#fff3d0', 0.6); poly([6.2, 3.2, 7.2, 3.3, 6.7, 4.6], '#fff3d0', 0.4);   // presas
                g.strokeStyle = 'rgba(225,210,255,.75)'; g.lineWidth = 0.8; g.lineCap = 'round'; g.beginPath(); g.moveTo(-2.6, -5.9); g.quadraticCurveTo(3.4, -6.3, 7.4, -3.9); g.stroke();      // brilho da testa
                g.beginPath(); g.moveTo(-3.4, 0.4); g.quadraticCurveTo(-1.4, 1.8, -0.2, 0.2); g.moveTo(-3, 3); g.lineTo(-1.6, 4); g.stroke();                                          // marcas rúnicas na bochecha
                ell(11.6, 0.1, 1, 1.1, '#2a1a38', 0, 0.6); g.strokeStyle = '#0a0612'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(8.4, -2.2); g.lineTo(9.8, -1.2); g.moveTo(9, -3); g.lineTo(10.4, -2); g.stroke();   // focinho franzido
                glow(4, -2.8, 6.5, 'rgba(255,170,30,A)', 0.8); g.beginPath(); g.moveTo(1.4, -3.6); g.quadraticCurveTo(4, -5.2, 6.6, -2.6); g.quadraticCurveTo(4, -1.8, 1.4, -3.6); g.closePath(); g.fillStyle = P.eye; g.fill(); g.lineWidth = 0.7; g.strokeStyle = OUT; g.stroke();
                g.strokeStyle = '#ffb81e'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(0.8, -5.2); g.lineTo(2, -4.2); g.lineTo(3.2, -5.4); g.lineTo(4.6, -4.4); g.stroke();   // marca de chama sobre o olho
                g.strokeStyle = 'rgba(240,235,255,.75)'; g.lineWidth = 0.4; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(9.4, 1.4 + i * 0.5); g.lineTo(15 + i * 0.4, 0.2 + i * 2); g.stroke(); }   // bigodes finos
            }
            g.restore();
            // pernas perto
            leg('h', -9.5, ph, c1, 1, 0, 0); leg('f', 10.5, ph + PI, c1, 1, 0, 0.4);
            if (W) { g.strokeStyle = c3; g.lineWidth = 0.7; g.beginPath(); g.moveTo(10.5 - 2, hipY + 4); g.lineTo(10.5 - 3, hipY + 7); g.stroke(); }
            rider(seat);
            if (id === 'pantera') { for (let i = 0; i < 5; i++) { const p = (t * 0.6 + i / 5) % 1; g.fillStyle = 'rgba(170,130,255,' + (0.5 * (1 - p)) + ')'; g.beginPath(); g.arc(-12 + i * 6 + sin(i * 2.7 + t) * 2, by - H - p * 18, 1.8 * (1 - p) + 0.4, 0, TAU); g.fill(); } }
        } else {
            const back = v === 'back', w = W ? 8.4 : 7.6, L = P.len;
            const sx = back ? sin(ph) * mv * 0.5 : 0;
            const legF = (x, u, col, wd, far, hind) => { const l = (gal ? gaitPose(u / TAU, 0.28)[1] : Math.max(0, cos(u)) * mv) * (W ? 3 : 3.6), y0 = hipY + (hind ? 0.5 : 0), fy = -0.6 - l; ln(x, y0, x, fy - 0.6, wd, col); ell(x + (hind ? 0 : 0), fy + 0.4, wd * 0.82, 1.7, far ? cd : (W ? c2 : c1)); };
            if (back) {
                const tw = sin(t * 2.6) * (2 + mv * 2);
                if (W) { g.beginPath(); g.moveTo(-2.4, by - 2); g.quadraticCurveTo(-3 + tw * 0.5, by + 8, tw, by + 19); g.quadraticCurveTo(3.6 + tw * 0.5, by + 8, 2.6, by - 2); g.closePath(); g.fillStyle = c1; g.fill(); g.lineWidth = 1; g.strokeStyle = OUT; g.stroke(); poly([tw - 2.6, by + 14, tw + 2.6, by + 14, tw, by + 20], c3, 0.7); }
                else { qc(0, by - 2, tw, by - 12, tw * 1.4, by - 26, 3.2, c1); ell(tw * 1.4, by - 26, 2.2, 2.2, c2, 0, 0.6); glow(tw * 1.4, by - 26, 5, 'rgba(170,130,255,A)', 0.5); }
            }
            if (back) { legF(-4.4, ph, cd, 3.6, 1, 0); legF(4.4, ph + PI, cd, 3.6, 1, 0); } else { legF(-5, ph + PI, cd, 3.6, 1, 0); legF(5, ph, cd, 3.6, 1, 0); }
            g.save(); g.translate(sx * 0.4, 0);
            ell(0, by, w, W ? 9.6 : 8.6, c1);
            if (back) { ell(-w * 0.46, by + 2, 4.8, 7, sh(c1, 0.07), 0, 0.8); ell(w * 0.46, by + 2, 4.8, 7, sh(c1, 0.07), 0, 0.8); g.save(); ell(0, by - 6, w * 0.8, 3, c3, 0, 0); g.restore(); if (!W) { g.strokeStyle = c2; g.lineWidth = 1; for (let i = -1; i <= 1; i += 2) { g.beginPath(); g.moveTo(i * 3, by - 3); g.lineTo(i * 3.4, by + 4); g.stroke(); } } }
            else { ell(0, by + 3, w * 0.7, 6, W ? c2 : sh(c1, -0.2), 0, 0); ell(-4.4, by + 1, 3.6, 7, sh(c1, 0.08), 0, 0.8); ell(4.4, by + 1, 3.6, 7, sh(c1, 0.08), 0, 0.8); ell(0, by - 7.4, w * 0.8, 2.6, c3, 0, 0); }
            g.restore();
            if (!back) { legF(-4.6, ph, c1, 4.2, 0, 0); legF(4.6, ph + PI, c1, 4.2, 0, 0); } else { legF(-5.2, ph + PI, c1, 4.4, 0, 1); legF(5.2, ph, c1, 4.4, 0, 1); }
            if (back && W) { g.fillStyle = c2; g.beginPath(); for (let i = 0; i < 6; i++) { g.lineTo(-w + i * (w / 3), by - 7 - (i % 2) * 1.5); } g.fill(); }
            if (!back) rider(seat); else { }
            if (back) rider(seat);
            if (!back) {
                const hy = by - 11 + sin(t * 1.5) * 0.4, hx = sin(ph * 2) * mv * 0.4;
                g.save(); g.translate(hx, 0);
                if (W) { g.beginPath(); for (let i = 0; i < 9; i++) { const a = PI + i / 8 * PI; g.lineTo(cos(a) * (i % 2 ? 9.4 : 7.6), hy + 4.4 + sin(a) * (i % 2 ? 10 : 8)); } g.closePath(); g.fillStyle = c2; g.fill(); g.lineWidth = 0.9; g.strokeStyle = OUT; g.stroke(); }
                else ell(0, hy + 3, 6.4, 7.6, c1);
                // orelhas
                for (const s of [-1, 1]) { if (W) { poly([s * 2.6, hy - 2.4, s * 6.8, hy - 11.4, s * 0.8, hy - 4.2], c1, 0.9); poly([s * 2.8, hy - 3.6, s * 5.6, hy - 9, s * 1.4, hy - 4.8], '#caa0a0', 0); } else { poly([s * 2, hy - 2, s * 5.6, hy - 9, s * 0.4, hy - 3.8], c1, 0.9); poly([s * 2.4, hy - 3, s * 4.6, hy - 7, s * 1, hy - 3.8], P.nose, 0); } }
                ell(0, hy + 2, W ? 5 : 5.6, W ? 5.4 : 5, c1);
                if (W) { ell(0, hy + 7.4, 3, 3.8, c2); ell(0, hy + 9.8, 1.6, 1.1, P.nose, 0, 0.6); g.strokeStyle = c3; g.lineWidth = 1; g.beginPath(); g.moveTo(0, hy - 1); g.lineTo(0, hy + 4); g.stroke(); eye(-3, hy + 1, 1.2, false, P.eye); eye(3, hy + 1, 1.2, false, P.eye); poly([-1.8, hy + 10.6, -0.6, hy + 10.6, -1.2, hy + 12.2], '#f2f2f2', 0.5); poly([1.8, hy + 10.6, 0.6, hy + 10.6, 1.2, hy + 12.2], '#f2f2f2', 0.5); }
                else { ell(0, hy + 6, 3.4, 2.7, c3, 0, 0); ell(0, hy + 5, 1.5, 1.1, P.nose, 0, 0.5); glow(-2.8, hy + 1.4, 5, 'rgba(255,230,90,A)', 0.55); glow(2.8, hy + 1.4, 5, 'rgba(255,230,90,A)', 0.55); ell(-2.8, hy + 1.4, 1.5, 1.1, P.eye, 0.3, 0.6); ell(2.8, hy + 1.4, 1.5, 1.1, P.eye, -0.3, 0.6); poly([-1.4, hy + 7, -0.4, hy + 7, -0.9, hy + 8.8], '#f6f2ff', 0.5); poly([1.4, hy + 7, 0.4, hy + 7, 0.9, hy + 8.8], '#f6f2ff', 0.5); }
                g.restore();
            }
            if (id === 'pantera') { for (let i = 0; i < 5; i++) { const p = (t * 0.6 + i / 5) % 1; g.fillStyle = 'rgba(170,130,255,' + (0.5 * (1 - p)) + ')'; g.beginPath(); g.arc(-8 + i * 4 + sin(i * 2.7 + t) * 2, by - 8 - p * 18, 1.8 * (1 - p) + 0.4, 0, TAU); g.fill(); } }
        }
        return seat;
    }

    function bigQuad(id, v, o, rider) {
        if (PRED[id]) { g.save(); const sd = predator(id, v, o, rider); g.restore(); return sd; }
        const q = BIG[id], t = o.t, drag = id === 'dragao';
        const hov = drag ? 8 + sin(t * 3) * 1.8 + (o.mv > 0.1 ? 1.5 : 0) : 0;
        g.save();
        shadow(q.bl * (1.05 - hov * 0.015), 0.32 - hov * 0.008);
        const bob = abs(sin(o.ph)) * o.mv * 1.4, side = v === 'side';
        const seat = { x: side ? -1 : 0, y: -(q.lg + q.bh * 1.78) + 3 - (drag ? hov : 0) - bob * 0.3 };
        const oo = Object.assign({}, o, { t: t, sleep: false });
        // desenha o quadrúpede usando o construtor, mas com a sela/cavaleiro no meio
        const q2 = Object.assign({}, q, { hover: 0 });
        g.save(); if (drag) g.translate(0, -hov);
        if (drag) { /* asas grandes atrás */ }
        if (side) quadSide2(q2, oo, rider, seat, drag); else quadFB2(q2, oo, v === 'back', rider, seat, drag);
        g.restore();
        if (q.aura) { for (let i = 0; i < 5; i++) { const p = (t * 0.6 + i / 5) % 1; g.fillStyle = 'rgba(150,100,255,' + (0.45 * (1 - p)) + ')'; g.beginPath(); g.arc(sin(i * 2.7 + t) * 12, -8 - p * 26, 2.2 * (1 - p) + 0.5, 0, TAU); g.fill(); } }
        g.restore(); return seat;
    }
    // reaproveita quadSide/quadFB mas intercala o cavaleiro entre corpo e cabeça
    function quadSide2(q, o, rider, seat, drag) {
        const ctxRef = g; let called = false;
        const orig = rider; // rider é chamado depois de desenhar tudo, antes da cabeça? simplificado: após corpo completo
        quadSide(q, o); rider(seat);
        // sela
        const bcy = seat.y + 8; rr(-6, seat.y + 2, 11, 3, 1.5, '#6b3a1c', 0.8);
    }
    function quadFB2(q, o, back, rider, seat) { if (back) { quadFB(q, o, true); rider(seat); rr(-5, seat.y + 2, 10, 3, 1.5, '#6b3a1c', 0.8); } else { rider(seat); quadFB(q, o, false); } }

    /* fases (nível 10/20/30): 1 arreios, 2 armadura (cavalos comuns) + aura, 3 penacho/cristas + aura forte e faíscas */
    const AURA = { cav_marrom: '255,215,120', cav_branco: '255,235,170', cav_guerra: '255,120,80', lobo_gigante: '150,210,255', pantera: '170,110,255', cav_esqueleto: '79,214,255', cav_fogo: '255,140,40', unicornio: '255,170,255', dragao: '255,150,50' };
    function stg(base, st, id) {
        if (!st) return base; const P = Object.assign({}, base); P.tack = 1;
        if (st >= 2 && (id === 'cav_marrom' || id === 'cav_branco')) P.armor = 1;
        if (st >= 3 && !P.skel) P.plume = 1;
        return P;
    }
    function aura(id, st, t, big) {
        if (st < 2) return; const col = AURA[id] || '255,230,150', r = (big ? 34 : 28) * (st >= 3 ? 1.25 : 1);
        glow(0, -(big ? 22 : 20), r, 'rgba(' + col + ',A)', (st >= 3 ? 0.42 : 0.24) + sin(t * 3) * 0.04);
        if (st >= 3) { for (let i = 0; i < 7; i++) { const p = (t * 0.5 + i / 7) % 1, a = i * 2.4 + t; g.fillStyle = 'rgba(' + col + ',' + (0.85 * (1 - p)) + ')'; g.fillRect(sin(a) * (14 + p * 8) - 0.8, -6 - p * 36, 1.8, 1.8); } }
    }
    /* =================== DRAGÃO (montaria): cresce por estágio — filhote (0), jovem (1), crescido (2), adulto (3) =================== */
    const DPAL = [
        { c: '#5fbf76', d: '#337a4a', bel: '#f2e4a8', wm: '#8fd9a0', wb: '#3d8a55', horn: '#f3e8c4', eye: '#ffe27a', sp: '#e8d28a' },
        { c: '#45a45f', d: '#27663c', bel: '#ecd890', wm: '#6fc486', wb: '#2f7048', horn: '#eadcaa', eye: '#ffd24a', sp: '#e0c474' },
        { c: '#2f8d4f', d: '#1c5a34', bel: '#e2c878', wm: '#3f9c66', wb: '#d9b45a', horn: '#e6d089', eye: '#ffc23a', sp: '#e6bf5a' },
        { c: '#1f7048', d: '#10412a', bel: '#dcb85c', wm: '#1f6a5c', wb: '#e6c25a', horn: '#efd68a', eye: '#ffb02a', sp: '#f0c64a' }
    ];
    const DK = [0.8, 0.93, 1.07, 1.22], DHORN = [4, 7.5, 12, 17], DSPK = [1.8, 3, 4.4, 6], DHS = [1.22, 1.1, 1.02, 1.0], DWS = [0.72, 0.86, 1.0, 1.22];
    function dWing(S, E, W, tips, back, P, near) {   // asa de dragão: membrana + braço e dedos ósseos
        const pts = [S[0], S[1], E[0], E[1], W[0], W[1]]; tips.forEach((t) => { pts.push(t[0], t[1]); }); pts.push(back[0], back[1]);
        poly(pts, near ? P.wm : sh(P.wm, -0.28), 1);
        g.globalAlpha = 0.5; tips.forEach((t) => ln(W[0], W[1], t[0], t[1], 0.9, P.wb)); g.globalAlpha = 1;
        ln(S[0], S[1], E[0], E[1], 2.6, P.wb); ln(E[0], E[1], W[0], W[1], 2, P.wb);
        poly([W[0] - 1.5, W[1] + 1, W[0] + 0.6, W[1] - 5, W[0] + 1.6, W[1] + 0.5], P.horn, 0.7);
    }
    function dHeadSide(P, st, t) {   // origem no centro do crânio, olhando para +x
        const hl = DHORN[st], jaw = 0.7 + sin(t * 2) * 0.3;
        poly([-3, -4.6, -hl, -5 - hl * 0.55, -hl * 0.72, -3.6, -5.5, -1.5], P.horn, 0.9);   // chifre grande, curvado para trás
        if (st >= 2) poly([-3.5, -2.4, -hl * 0.65, -2.2 - hl * 0.25, -5.5, 0.4], sh(P.horn, -0.12), 0.8);
        ell(0, 0, 7.4, 6, P.c);
        poly([3, -3.4, 13.5, -1.6, 14.5, 2.4, 12.5, 5.2, 3, 5.6], P.c, 1);   // focinho
        ell(7, -3.4, 4.5, 1.6, sh(P.c, 0.12), -0.12, 0);
        poly([2, 4.4, 12, 5.2, 11, 8 + jaw, 3.2, 8.6], sh(P.c, -0.22), 1);   // mandíbula
        g.fillStyle = '#fbf6e6'; for (let i = 0; i < 4; i++) poly([5 + i * 2, 5.2, 6 + i * 2, 7.4 + jaw * 0.5, 7 + i * 2, 5.2], '#fbf6e6', 0.4);
        ell(12.4, -0.5, 1, 0.8, '#1a0f0a', 0, 0);   // narina
        poly([-4, 3, -10.5, 7.5, -3, 7], P.horn, 0.8);   // espinho da bochecha
        ell(2.2, -2.6, 2.1, 1.7, P.eye, 0, 0.9); g.fillStyle = '#16100a'; g.fillRect(2, -4.2, 0.9, 3.3);   // olho de fenda
        poly([-1.4, -5.6, 5.6, -3.4, 5.6, -2.2, -1.4, -3.8], sh(P.c, -0.45), 0.9);   // sobrancelha feroz
        if (st >= 3) for (let i = 0; i < 3; i++) poly([-5 - i * 2.4, -4 + i * 1.5, -9 - i * 2.4, -7 + i * 2.2, -7 - i * 2.4, -2 + i * 1.2], sh(P.sp, -0.1 * i), 0.7);   // crista
    }
    function dragonMount(v, o, rider) {
        const st = Math.max(0, Math.min(3, o.stage | 0)), P = DPAL[st], K = DK[st], t = o.t, mv = o.mv, ph = o.ph, WS = DWS[st];
        const fsp = mv > 0.1 ? 8.5 : 5, flap = sin(t * fsp) * 1.45, hov = 8 + sin(t * fsp - 1.3) * 2.6 + (mv > 0.1 ? 2.2 : 0), cy = -25 - hov;   // voo: o corpo sobe e desce no ritmo das asas
        const seat = { x: (v === 'side' ? -1 : 0) * K, y: (cy - 7.5) * K };
        g.save(); shadow(20 * K * (1 - hov * 0.012), 0.3 - hov * 0.006); g.scale(K, K);
        const pitch = v === 'side' ? (mv > 0.1 ? -0.09 : -0.02) + flap * 0.012 : 0; if (pitch) { g.translate(0, cy); g.rotate(pitch); g.translate(0, -cy); }
        const sp = DSPK[st], legSw = sin(t * fsp - 0.6) * 1.1;   // pernas recolhidas: só balançam de leve com o bater de asas
        const claw = (x, y, s) => { for (let i = -1; i <= 1; i++) poly([x + i * 1.6 * s - 0.7, y, x + i * 1.9 * s, y + 3.2, x + i * 1.6 * s + 0.7, y], P.horn, 0.5); };
        const saddle = (x, y, w) => { rr(x - w / 2, y, w, 3.4, 1.6, '#6b3a1c', 0.8); rr(x - w / 2 + 1, y + 0.6, w - 2, 1.2, 0.6, '#b8863f', 0); };
        if (v === 'side') {
            const bx = 0;
            dWing([-2, cy - 7], [-12 * WS - 2, cy - 21 * WS - flap * 4], [-27 * WS, cy - 30 * WS - flap * 9], [[-44 * WS, cy - 20 * WS - flap * 6], [-40 * WS, cy - 8 * WS - flap * 3], [-32 * WS, cy]], [-12, cy - 1], P, false);   // asa de trás
            const tw = sin(t * fsp * 0.5 - 0.8) * 4.5; qc(-14, cy + 1, -30, cy + 9 + tw, -43, cy + 3 + tw * 1.4, 6, P.c); qc(-43, cy + 3 + tw * 1.4, -50, cy + 0 + tw * 1.4, -55, cy + 4 + tw * 1.6, 3, P.c);
            poly([-52, cy + 4 + tw * 1.6, -62, cy - 1 + tw * 1.6, -58, cy + 6 + tw * 1.6, -62, cy + 9 + tw * 1.6], P.d, 1);   // ponta da cauda
            if (st >= 2) for (let i = 0; i < 4; i++) poly([-18 - i * 8, cy - 1 + (i > 1 ? tw * 0.4 : 0), -20 - i * 8, cy - 4.4 - i * 0.4, -23 - i * 8, cy + 0.4], P.sp, 0.6);
            // pernas de trás e de frente (distantes)
            const leg = (hx, hy, fx, fy, w, c) => { const kx = (hx + fx) / 2 + 2.2, ky = (hy + fy) / 2 - 1; ln(hx, hy, kx, ky, w, c); ln(kx, ky, fx, fy, w * 0.78, c); claw(fx + 0.5, fy - 0.4, 0.8); };
            leg(-9, cy + 6, -13 + legSw, cy + 13.5, 4.6, sh(P.d, -0.15)); leg(10, cy + 5, 8 - legSw, cy + 13, 3.8, sh(P.d, -0.15));
            // corpo
            ell(0, cy, 17.5, 9.2, P.c, 0, 1.1); ell(1, cy + 4.2, 14.5, 5.2, P.bel, 0, 0); g.globalAlpha = 0.35; for (let i = -3; i <= 3; i++) ln(i * 4 + 1, cy + 1.6, i * 4 + 1, cy + 8, 0.7, sh(P.bel, -0.4)); g.globalAlpha = 1;
            for (let i = 0; i < 7; i++) poly([-13 + i * 3.8, cy - 8 - (i % 2) * 0.4, -12 + i * 3.8, cy - 9.2 - sp, -10.4 + i * 3.8, cy - 7.4], P.sp, 0.6);   // espinhos do dorso
            ell(-9, cy + 3.5, 7.4, 7.6, P.c, 0, 1);   // coxa
            // pescoço e cabeça
            const nk = sin(t * 1.6) * 1, hx = 25, hy = cy - 20 + nk;
            g.lineCap = 'round'; g.strokeStyle = OUT; g.lineWidth = 9.6; g.beginPath(); g.moveTo(9, cy - 3); g.quadraticCurveTo(19, cy - 6, hx - 3, hy + 3); g.stroke(); g.strokeStyle = P.c; g.lineWidth = 8; g.stroke();
            g.strokeStyle = P.bel; g.lineWidth = 3.4; g.beginPath(); g.moveTo(10.5, cy - 0.6); g.quadraticCurveTo(19.5, cy - 3, hx - 2, hy + 6); g.stroke();
            for (let i = 0; i < 4; i++) poly([6 + i * 4.4, cy - 7.6 - i * 2.4, 7.6 + i * 4.4, cy - 9.6 - sp * 0.8 - i * 2.4, 9 + i * 4.4, cy - 7.4 - i * 2.4], P.sp, 0.6);
            g.save(); g.translate(hx, hy); const hs = DHS[st]; g.scale(hs, hs); dHeadSide(P, st, t); g.restore();
            // sela e cavaleiro
            saddle(seat.x / K, cy - 8.8, 14);
            dWing([0, cy - 8], [-9 * WS, cy - 23 * WS - flap * 5], [-23 * WS, cy - 33 * WS - flap * 10], [[-40 * WS, cy - 24 * WS - flap * 7], [-36 * WS, cy - 11 * WS - flap * 3], [-28 * WS, cy - 1]], [-11, cy - 2], P, true);   // asa da frente (atrás do cavaleiro)
            g.restore(); if (rider) rider(seat); g.save(); g.scale(K, K);
            // asa da frente e pernas próximas

            leg(-8, cy + 7, -11 - legSw, cy + 14.5, 5.2, P.c); leg(9, cy + 6, 9 + legSw, cy + 14, 4.2, P.c);
        } else {
            const fb = v === 'back';
            const wing = (sg) => dWing([sg * 8, cy - 6], [sg * (20 * WS + 4), cy - 17 * WS - flap * 5], [sg * (34 * WS + 4), cy - 25 * WS - flap * 11], [[sg * (47 * WS + 4), cy - 9 * WS - flap * 7], [sg * (42 * WS + 4), cy + 4 * WS - flap * 3], [sg * (30 * WS + 4), cy + 7 * WS]], [sg * 10, cy + 4], P, sg > 0);
            wing(-1); wing(1);
            if (!fb) { g.restore(); if (rider) rider(seat); g.save(); g.scale(K, K); }
            // cauda atrás (de costas vai pelo centro)
            if (fb) { const tw = sin(t * fsp * 0.5 - 0.8) * 4.5; qc(0, cy + 6, tw, cy + 18, tw * 1.4, cy + 24, 6, P.c); poly([tw * 1.4 - 4, cy + 23, tw * 1.4, cy + 33, tw * 1.4 + 4, cy + 23], P.d, 1); }
            const leg = (x, fx, w, c) => { ln(x, cy + 8, x * 1.1 + (x > 0 ? 1 : -1) * 1.5, cy + 12, w, c); ln(x * 1.1 + (x > 0 ? 1 : -1) * 1.5, cy + 12, fx * 0.8, cy + 15.5, w * 0.8, c); claw(fx * 0.8, cy + 15, 0.9); };
            leg(-9, -10 + legSw, 4.6, sh(P.d, -0.1)); leg(9, 10 - legSw, 4.6, sh(P.d, -0.1));
            ell(0, cy, fb ? 13 : 11.5, fb ? 9 : 11, P.c, 0, 1.1);
            if (fb) { ell(-10.5, cy + 4.5, 6, 6.6, P.c, 0, 1); ell(10.5, cy + 4.5, 6, 6.6, P.c, 0, 1); for (let i = 0; i < 6; i++) poly([-2.2, cy - 8 + i * 3.2, 0, cy - 10 - sp + i * 3.2, 2.2, cy - 8 + i * 3.2], P.sp, 0.6); }
            else { ell(0, cy + 2.4, 7.6, 8.6, P.bel, 0, 0); g.globalAlpha = 0.35; for (let i = 0; i < 5; i++) ln(-6, cy - 3 + i * 3, 6, cy - 3 + i * 3, 0.7, sh(P.bel, -0.4)); g.globalAlpha = 1;
                const fl = (x) => { ln(x, cy + 5, x * 1.15, cy + 11, 4.6, P.c); ln(x * 1.15, cy + 11, x * 0.9, cy + 15, 3.6, P.c); claw(x * 0.9, cy + 14.5, 0.9); }; fl(-8.4); fl(8.4);
                // pescoço e cabeça de frente
                const hy = cy - 21 + sin(t * 1.6) * 0.8;
                ell(0, cy - 11, 6.4, 8.6, P.c, 0, 1); ell(0, cy - 11, 3.6, 7.8, P.bel, 0, 0);
                g.save(); g.translate(0, hy); const hs = DHS[st]; g.scale(hs, hs);
                for (const s2 of [-1, 1]) { const hl = DHORN[st]; poly([s2 * 3.6, -5, s2 * (5 + hl * 0.55), -6 - hl * 0.75, s2 * (hl * 0.36 + 7), -4 - hl * 0.5, s2 * 6.4, -2], P.horn, 0.9); poly([s2 * 6.4, 2, s2 * 12.5, 5.6, s2 * 5.8, 5.8], P.horn, 0.8); }
                ell(0, 0, 8.4, 6.8, P.c, 0, 1.1); ell(0, 3.4, 5.4, 4.6, sh(P.c, 0.1), 0, 1); ell(-1.8, 2.8, 0.9, 0.7, '#1a0f0a', 0, 0); ell(1.8, 2.8, 0.9, 0.7, '#1a0f0a', 0, 0);
                poly([-4, 6.4, 0, 8.8 + sin(t * 2) * 0.4, 4, 6.4, 2.5, 5.2, -2.5, 5.2], sh(P.c, -0.2), 0.9); poly([-2.6, 6.2, -1.9, 8, -1.2, 6.2], '#fbf6e6', 0.4); poly([2.6, 6.2, 1.9, 8, 1.2, 6.2], '#fbf6e6', 0.4);
                for (const s2 of [-1, 1]) { ell(s2 * 4.4, -2.4, 1.9, 1.5, P.eye, s2 * -0.3, 0.9); g.fillStyle = '#16100a'; g.fillRect(s2 * 4.4 - 0.4, -4, 0.9, 3.2); poly([s2 * 1, -2.4, s2 * 7.4, -5.6, s2 * 7.4, -4, s2 * 1, -0.8], sh(P.c, -0.45), 0.9); }
                if (st >= 3) for (let i = -2; i <= 2; i++) poly([i * 2.4 - 1, -6, i * 2.8, -10.5 - (2 - Math.abs(i)) * 1.6, i * 2.4 + 1, -6], P.sp, 0.6);
                g.restore();
                saddle(0, cy - 12, 15);
            }
        }
        g.restore();
        if (v === 'back') { if (rider) rider(seat); }
        return seat;
    }
    const MOUNT_FN = {};
    Object.keys(HORSES).forEach((k) => { MOUNT_FN[k] = (v, o, r) => { aura(k, o.stage | 0, o.t, false); return horse(stg(HORSES[k], o.stage | 0, k), v, o, r); }; });
    Object.keys(BIG).forEach((k) => { MOUNT_FN[k] = (v, o, r) => { const st = o.stage | 0; aura(k, st, o.t, true); const seat = bigQuad(k, v, o, r); if (st >= 1) tackBig(v, seat, k, st, o.t); return seat; }; });
    MOUNT_FN.dragao = (v, o, r) => { aura('dragao', o.stage | 0, o.t, true); return dragonMount(v, o, r); };
    function tackBig(v, seat, id, st, t) {   // arreios dos quadrúpedes grandes (por cima do corpo; o cavaleiro já foi desenhado)
        const tc = '#5a2f14', y0 = seat.y + 3;
        if (v === 'side') { ln(seat.x - 6, y0 + 1, seat.x - 7, y0 + 13, 1.8, tc); ln(seat.x + 5, y0 + 1, seat.x + 7, y0 + 13, 1.8, tc); ell(seat.x + 6.4, y0 + 7, 1.3, 1.3, '#e6c25a', 0, 0.4); if (st >= 3 && id !== 'dragao') { for (let i = 0; i < 4; i++) poly([seat.x - 10 + i * 3, y0 + 2, seat.x - 9 + i * 3, y0 - 3 - (id === 'dragao' ? 2 : 0), seat.x - 8 + i * 3, y0 + 2], '#ffd24a', 0.6); } }
        else if (v === 'front') { ln(seat.x - 8, y0 + 6, seat.x + 8, y0 + 6, 1.8, tc); ell(seat.x, y0 + 6, 1.4, 1.4, '#e6c25a', 0, 0.4); }
    }

    function pet(ctx, id, x, y, o) {
        const f = PET[id]; if (!f) return 0; g = ctx; o = o || {};
        const oo = { t: o.t || 0, ph: o.ph || 0, mv: o.mv || 0, sleep: !!o.sleep };
        g.save(); g.translate(x, y); const sc = o.scale || 1; if (sc !== 1) g.scale(sc, sc); const v = o.view || 'side'; if (v === 'side' && o.flip < 0) g.scale(-1, 1);
        let r = 0; try { r = f(g, v, oo) || 0; } catch (e) { }
        g.restore(); return r;
    }
    function mount(ctx, id, x, y, o, rider) {
        const f = MOUNT_FN[id]; g = ctx; o = o || {};
        const stage = Math.max(0, Math.min(3, o.stage | 0)), oo = { t: o.t || 0, ph: o.ph || 0, mv: o.mv || 0, stage };
        const v = o.view || 'side', fl = v === 'side' && o.flip < 0 ? -1 : 1, sc = o.scale || 1;   // o dragão cresce por estágio dentro do próprio desenho (dragonMount); a hitbox não muda
        let seat = { x: 0, y: -30 };
        const M = g.getTransform();
        g.save(); g.translate(x, y); if (sc !== 1) g.scale(sc, sc); if (fl < 0) g.scale(-1, 1);
        // o cavaleiro é desenhado no espaço normal (sem espelho/escala): recebe a posição do quadril em coordenadas do mundo
        const riderW = (s) => { if (!rider) return; g.save(); g.setTransform(M); try { rider({ x: x + s.x * fl * sc, y: y + s.y * sc }); } catch (e) { console.error(e); } g.restore(); };
        try { if (f) seat = f(v, oo, riderW) || seat; } catch (e) { console.error(e); }
        g.restore(); return seat;
    }


    /* ---- PET MONTADO (nível 10+): o pet cresce (>= 1,5x) e o jogador senta nele; a hitbox do jogo não muda (só visual) ---- */
    // altura (em px do desenho do pet, sem escala) do dorso onde o cavaleiro senta
    const SEATH = { gato: 11.2, cachorro: 12.1, coelho: 10.5, raposa: 11.8, lobinho: 13.5, dragao_fogo: 10.8, dragao_gelo: 10.8, slime: 11, golem: 16, coruja: 12, fada: 10, fenix: 13 };
    function petScale(id) { const h = SEATH[id] || 11; return Math.max(1.5, Math.min(2.6, 21 / h)); }
    function petMount(ctx, id, x, y, o, rider) {
        const f = PET[id]; if (!f) return { x: 0, y: -24 }; g = ctx; o = o || {};
        const v = o.view || 'side', fl = v === 'side' && o.flip < 0 ? -1 : 1, sc = petScale(id) * (o.scale || 1), h = (SEATH[id] || 11) * sc;
        const seat = { x: x + (v === 'side' ? -0.6 * fl * sc : 0), y: y - h };
        const body = () => pet(ctx, id, x, y, { view: v, flip: o.flip, t: o.t, ph: o.ph, mv: o.mv, scale: sc });
        const cloth = () => { g = ctx; ctx.save(); ctx.translate(seat.x, seat.y + 1.5); ell(0, 0, v === 'side' ? 5.6 : 7.4, 2.2, '#7a2f26', 0, 0.8); ctx.restore(); };
        if (v === 'front') { if (rider) rider(seat); body(); } else { body(); cloth(); if (rider) rider(seat); }
        return { x: seat.x - x, y: seat.y - y };
    }
    const NAMES = { pet: Object.keys(PET), mount: Object.keys(MOUNT_FN) };
    const _pc = Object.create(null);
    function portrait(id, kind, size, stage) {
        stage = stage | 0; const key = kind + id + '|' + size + '|' + stage; if (_pc[key]) return _pc[key];
        const S = size || 48, cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d');
        c.clearRect(0, 0, S, S); const sc = kind === 'mount' ? S / 62 : S / 30;
        try {
            if (kind === 'mount') mount(c, id, S * 0.5, S * 0.8, { view: 'side', flip: 1, t: 0.3, ph: 0, mv: 0, scale: sc, stage }, null);
            else pet(c, id, S * 0.5, S * 0.86, { view: 'front', flip: 1, t: 0.3, ph: 0, mv: 0, scale: sc });
        } catch (e) { }
        return (_pc[key] = cv);
    }
    root.PetArt = { pet, mount, petMount, petScale, portrait, NAMES, shade: sh };
})(window);
