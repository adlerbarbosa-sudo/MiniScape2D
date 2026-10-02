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
            else { legQ(-q.bl * 0.55, bcy + q.bh * 0.5, hl, a(PI), q.lw, sh(c3, -0.25), 1, sh(c3, -0.25)); legQ(q.bl * 0.58, bcy + q.bh * 0.5, hl, a(0), q.lw, sh(c3, -0.25), 1, sh(c3, -0.25)); }
        }
        // corpo
        ell(0, bcy, q.bl, q.bh, c); ell(0, bcy + q.bh * 0.35, q.bl * 0.8, q.bh * 0.55, c2, 0, 0); ell(-q.bl * 0.3, bcy - q.bh * 0.45, q.bl * 0.4, q.bh * 0.28, sh(c, 0.25), 0, 0);
        if (q.stripes) { g.strokeStyle = sh(c, -0.35); g.lineWidth = 1.2; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * 3.4, bcy - q.bh * 0.95); g.lineTo(i * 3.4 + 0.5, bcy - q.bh * 0.35); g.stroke(); } }
        if (q.patch) ell(-q.bl * 0.25, bcy - q.bh * 0.15, 3, 2.4, q.patch, 0, 0);
        if (q.belly) ell(0, bcy + q.bh * 0.3, q.bl * 0.55, q.bh * 0.5, q.belly, 0, 0);
        if (q.spikes) for (let i = 0; i < 4; i++) poly([-q.bl * 0.6 + i * 3.2, bcy - q.bh * 0.92 + i * 0.3, -q.bl * 0.6 + i * 3.2 + 1.6, bcy - q.bh * 0.92 - 3.2 + i * 0.3, -q.bl * 0.6 + i * 3.2 + 3.2, bcy - q.bh * 0.85 + i * 0.3], q.c3);
        if (!sl) {
            const a = (k) => sin(ph + k) * 0.7 * mv, hl = q.lg + 0.5;
            if (!hop) { legQ(-q.bl * 0.5, bcy + q.bh * 0.55, hl, a(0), q.lw, c, 1, c3); legQ(q.bl * 0.62, bcy + q.bh * 0.55, hl, a(PI), q.lw, c, 1, c3); }
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
        const st = abs(sin(o.ph)) * o.mv * 1.3, sw = sin(o.ph) * o.mv, sl = o.sleep, c = '#8d9199', cd = '#62666e', cl = '#b4b8c0';
        shadow(8.5, 0.3); const by = -(sl ? 0 : 5) - st + sin(o.t * 2) * 0.3;
        if (sl) { rr(-8, -9, 16, 9, 3, c); ell(0, -9.5, 7, 3, cl, 0, 0); rr(-5, -14, 10, 6, 2, cl); g.strokeStyle = OUT; g.lineWidth = 1; g.beginPath(); g.moveTo(-3, -10.5); g.lineTo(-1, -10.5); g.moveTo(1, -10.5); g.lineTo(3, -10.5); g.stroke(); return 0; }
        const side = v === 'side', bw = side ? 8 : 11;
        // pernas
        rr(-bw * 0.6, by - 1 + Math.max(0, sw) * -1.2, 4, 6 - Math.max(0, sw) * -0, 1.5, cd); rr(bw * 0.6 - 4, by - 1 + Math.max(0, -sw) * -1.2, 4, 6, 1.5, cd);
        // braços
        const ay = by - 11 + sw * 0.8;
        if (!side) { rr(-bw - 3.2, ay, 4.4, 8, 2, cd); rr(bw - 1.2, ay - sw * 1.6, 4.4, 8, 2, cd); ell(-bw - 1, ay + 8.4, 2.6, 2.4, c); ell(bw + 1, ay + 8.4 - sw * 1.6, 2.6, 2.4, c); }
        rr(-bw / 2 - 1, by - 14, bw + 2, 12, 3, c); ell(0, by - 12.5, bw * 0.42, 1.8, cl, 0, 0);
        g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-2, by - 8); g.lineTo(0, by - 5.5); g.lineTo(2.2, by - 8); g.stroke();
        if (v !== 'back') { glow(0, by - 8.5, 5, 'rgba(79,214,255,A)', 0.35); ell(0, by - 8.5, 1.6, 1.6, '#4fd6ff', 0, 0); }
        else { g.fillStyle = '#5b9a4a'; g.beginPath(); g.arc(-2.4, by - 6, 1.6, 0, TAU); g.arc(2, by - 11, 1.2, 0, TAU); g.fill(); }
        if (side) { rr(-1.5, ay, 4.4, 8, 2, cd); ell(0.7, ay + 8.4, 2.6, 2.4, c); }
        // cabeça
        rr(-5.2, by - 22.5, 10.4, 9, 2.5, c); rr(-4.2, by - 23.6, 8.4, 2.6, 1.5, cl, 0.8); g.fillStyle = '#5b9a4a'; g.beginPath(); g.arc(-3.4, by - 23.6, 1.3, 0, TAU); g.arc(-1.4, by - 24, 0.9, 0, TAU); g.fill();
        if (v !== 'back') { const ex = side ? 1.8 : 0; ell(-2.2 + ex, by - 18.4, 1.2, 1.2, '#4fd6ff', 0, 0); ell(2.2 + ex, by - 18.4, 1.2, 1.2, '#4fd6ff', 0, 0); }
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
    function horse(P, v, o, rider) {
        const t = o.t, mv = o.mv, ph = o.ph, sw = (k) => sin(ph + k) * mv, gal = mv > 0.1, S = P.sp || 1;
        const bob = abs(sin(ph * 0.5)) * mv * 1.6, br = sin(t * 1.8) * 0.5, c = P.c, cd = sh(c, -0.28), cl = sh(c, 0.2), hc = P.fire ? '#ffb347' : P.skel ? '#cfc8b0' : '#2a1d14';
        g.save(); g.scale(S, S);
        shadow(P.skel || P.fire ? 17 : 17.5, 0.32);
        const seat = { x: v === 'side' ? -2 : 0, y: v === 'side' ? -32 - bob * 0.3 : -33 - bob * 0.3 };
        const bodyCol = P.skel ? '#bdb59a' : c;
        if (v === 'side') {
            const by = -23 - bob + br;
            // cauda
            const tw = sin(t * 3.2 + ph * 0.5) * 0.25 + mv * 0.35;
            g.save(); g.translate(-15.5, by - 3); g.rotate(0.5 + tw);
            if (P.fire) { flame(0, 0, 3.6, t, '#ff5a14', '#ffd24a', false); g.rotate(0.1); flame(-1, 4, 3, t + 1, '#ff7a1c', '#ffe27a', false); }
            else { qc(0, 0, -3, 8, -1.5, 17, 5.2, P.tail); qc(0, 1, 1, 9, 2.5, 16, 3, sh(P.tail, 0.2)); }
            g.restore();
            // pernas de trás e da frente (lado de lá)
            const lc = P.skel ? '#a49c83' : cd;
            leg2(-10, by + 5, 8, 8, sw(PI) * 0.7, -0.15 + Math.max(0, sin(ph + PI)) * mv * 0.9, 3.3, lc, 1, hc); leg2(11, by + 5, 8, 8, sw(0) * 0.7, 0.1 - Math.max(0, sin(ph)) * mv * 0.6, 3, lc, 1, hc);
            // corpo
            if (P.skel) { ell(0, by, 17, 8.6, '#2a2a30'); for (let i = -3; i <= 3; i++) { g.strokeStyle = '#e9e3cb'; g.lineWidth = 1.7; g.beginPath(); g.moveTo(i * 4.2, by - 7); g.quadraticCurveTo(i * 4.2 + 2, by, i * 4.2 + 0.5, by + 6.5); g.stroke(); } g.strokeStyle = '#e9e3cb'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(-15, by - 7.6); g.quadraticCurveTo(0, by - 10, 14, by - 8); g.stroke(); ell(-13.5, by - 1, 4, 6.5, '#d8d2bb', 0.2); ell(14, by - 3, 3.6, 5.5, '#d8d2bb', -0.2); }
            else { ell(0, by, 17, 8.8, c); ell(1, by + 4.6, 14, 4.4, P.fire ? '#c8461e' : sh(c, 0.12), 0, 0); ell(-5, by - 4.4, 9, 3.2, cl, 0, 0); if (P.armor) { rr(-8, by - 9, 16, 6, 2, '#aab1ba'); rr(-8, by - 4, 16, 3.4, 1.5, '#b82a2a'); ell(11, by - 2, 5, 7, '#aab1ba', 0.2); g.strokeStyle = '#5b626b'; g.lineWidth = 0.8; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-6 + i * 5, by - 9); g.lineTo(-6 + i * 5, by - 3); g.stroke(); } } }
            // pescoço + cabeça
            const nx = 12, ny = by - 5, hx = 22, hy = by - 17 + sin(t * 1.5) * 0.4 - (gal ? sin(ph) * 0.8 : 0);
            poly([nx - 7, ny + 3, nx + 3, ny + 7, hx + 1, hy + 3, hx - 7, hy - 2], bodyCol);
            if (P.skel) { for (let i = 0; i < 3; i++) ln(nx - 3 + i * 2.6, ny + 1 - i * 3.4, nx - 2 + i * 2.6, ny - 2 - i * 3.4, 1.6, '#e9e3cb'); }
            // crina
            if (P.fire) { for (let i = 0; i < 4; i++) flame(nx - 6 + i * 2.2, ny - 1 - i * 3.6 + sin(t * 7 + i) * 0.4, 3, t + i * 0.7, '#ff5a14', '#ffd24a'); }
            else { g.beginPath(); g.moveTo(nx - 8, ny + 1); g.quadraticCurveTo(nx - 7, ny - 9, hx - 7, hy - 4); g.lineTo(hx - 3, hy - 3); g.quadraticCurveTo(nx - 2, ny - 7, nx - 3, ny + 5); g.closePath(); g.fillStyle = P.mane; g.fill(); g.lineWidth = 1; g.strokeStyle = OUT; g.stroke(); }
            // cabeça
            g.save(); g.translate(hx, hy); g.rotate(0.45);
            if (P.skel) { ell(0, 0, 6.6, 4.4, '#e9e3cb'); ell(7, 1, 4.6, 3.1, '#d8d2bb'); ell(-2.4, -0.6, 1.9, 2, '#15110d', 0, 0); glow(-2.4, -0.6, 4, 'rgba(79,214,255,A)', 0.6); ell(-2.4, -0.6, 1, 1, '#9be8ff', 0, 0); g.strokeStyle = '#15110d'; g.lineWidth = 0.9; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(5 + i * 1.6, 2.2); g.lineTo(5 + i * 1.6, 3.8); g.stroke(); } }
            else { ell(0, 0, 6.6, 4.6, c); ell(7.2, 1.2, 4.8, 3.5, P.fire ? '#c8461e' : sh(c, 0.12)); ell(10.2, 1.8, 1.2, 0.9, '#2a1a14', 0, 0); eye(-0.5, -1.2, 1.3, false, P.fire ? '#ffe27a' : null); if (P.blaze) ell(3, -1, 4, 1.2, P.blaze, 0, 0); if (P.armor) { poly([-2, -4.4, 8, -2, 8, 0, -2, 0], '#aab1ba', 0.8); } }
            poly([-3.6, -3.6, -4.4, -8.6, -0.6, -4.2], P.skel ? '#d8d2bb' : c); if (P.fire) flame(-3, -4.6, 2, t, '#ff5a14', '#ffd24a');
            if (P.horn) { poly([1.4, -4, 3.2, -4.4, 8.6, -12.6], P.horn, 0.8); g.strokeStyle = 'rgba(160,110,0,.7)'; g.lineWidth = 0.7; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(3.2 + i * 1.7, -4.4 - i * 2.5); g.lineTo(4.6 + i * 1.7, -4.2 - i * 2.5); g.stroke(); } glow(8.6, -12.6, 5, 'rgba(255,240,150,A)', 0.4 + sin(t * 4) * 0.1); }
            g.restore();
            // pernas perto
            leg2(-9, by + 6, 8, 8, sw(0) * 0.7, -0.15 + Math.max(0, sin(ph)) * mv * 0.9, 3.6, P.skel ? '#cfc8b0' : c, 1, hc); leg2(12, by + 6, 8, 8, sw(PI) * 0.7, 0.1 - Math.max(0, sin(ph + PI)) * mv * 0.6, 3.3, P.skel ? '#cfc8b0' : c, 1, hc);
            if (P.sock) { }
            if (P.tack) {   // arreios: peitoral, cilha e rédea (nível 10+); penacho no nível 30
                const tc = P.armor ? '#8c1f1f' : '#5a2f14';
                ln(9, by - 7, 10.5, by + 7.5, 1.8, tc); ell(10.2, by + 1, 1.4, 1.4, '#e6c25a', 0, 0.5); ln(-1, by - 8.5, -1.5, by + 8.8, 1.7, tc);
                g.save(); g.translate(hx, hy); g.rotate(0.45); ln(4.2, -3.8, 4.8, 3.2, 1.2, tc); ln(-1.2, -3.6, 4.2, 1.2, 1, tc); ell(4.6, 0, 0.9, 0.9, '#e6c25a', 0, 0.4);
                if (P.plume) { for (let i = 0; i < 3; i++) poly([-3 + i * 0.5, -4.4, -6.6 + i * 2.4, -12.5 - i * 1.2 - sin(t * 5 + i) * 0.8, -1.4 + i * 1.4, -5], i === 1 ? '#ffd24a' : '#d83a3a', 0.6); }
                g.restore();
            }
            rider(seat);
            // sela
            rr(-7.5, by - 10, 11, 3.2, 1.5, P.armor ? '#7a1e1e' : '#6b3a1c'); if (!P.skel) { g.strokeStyle = '#d6a83a'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-7, by - 8.2); g.lineTo(3, by - 8.2); g.stroke(); }
            if (P.fire) embers(0, by - 4, 22, t, 6);
        } else {
            const back = v === 'back', by = -23 - bob + br, w = back ? 10.5 : 8.6, sx = sin(ph) * mv * 0.7;
            const lc = P.skel ? '#cfc8b0' : c;
            if (back) { // rabo
                if (P.fire) { flame(0, by + 6, 4.6, t, '#ff5a14', '#ffd24a', false); }
                else { qc(sx * 0.5, by + 3, sx, by + 11, sx * 0.6, by + 22, 5.6, P.tail); }
            }
            // pernas
            const hindY = by + 6, up = (k) => Math.max(0, sin(ph + k)) * mv * 2.6;
            for (const s of [-1, 1]) { const k = s > 0 ? 0 : PI; leg2(s * (w - 2.6), hindY, 8, 8, 0, 0, 3.4, lc, 1, hc); ell(s * (w - 2.6), by + 15.6 - up(k), 2.3, 1, 'rgba(0,0,0,0)', 0, 0); }
            g.save(); g.translate(sx * 0.4, 0);
            if (P.skel) { ell(0, by, w, 9.5, '#2a2a30'); for (let i = -1; i <= 1; i++) { g.strokeStyle = '#e9e3cb'; g.lineWidth = 1.7; g.beginPath(); g.moveTo(i * 3.4, by - 8.6); g.quadraticCurveTo(i * 3.4, by, i * 3.4, by + 8); g.stroke(); } ell(0, by - 8.4, w * 0.8, 2.2, '#d8d2bb'); }
            else { ell(0, by, w, 9.6, c); ell(0, by + 3, w * 0.7, 6, P.fire ? '#c8461e' : sh(c, 0.12), 0, 0); if (back) { ell(0, by - 5, w * 0.8, 3, cl, 0, 0); ell(-w * 0.45, by + 2, 3.8, 6, sh(c, 0.1), 0, 0); ell(w * 0.45, by + 2, 3.8, 6, sh(c, 0.1), 0, 0); } if (P.armor) { rr(-w + 1, by - 9, w * 2 - 2, 6, 2, '#aab1ba'); rr(-w + 1, by - 3.6, w * 2 - 2, 3.4, 1.5, '#b82a2a'); } }
            g.restore();
            if (!back) {
                // pernas dianteiras
                for (const s of [-1, 1]) { const k = s > 0 ? PI : 0; leg2(s * 4.2, by + 6, 8, 8, 0, 0, 3.6, lc, 1, hc); }
            }
            rider(seat);
            rr(-6.2, by - 10, 12.4, 3.2, 1.5, P.armor ? '#7a1e1e' : '#6b3a1c');
            if (!back) { // pescoço + cabeça à frente do cavaleiro
                const hy = by - 11 + sin(t * 1.5) * 0.4;
                g.save(); g.translate(sx * 0.7, 0);
                if (P.fire) { for (let i = -2; i <= 2; i++) flame(i * 2.2, hy - 8 - Math.abs(i), 3, t + i, '#ff5a14', '#ffd24a'); }
                else { ell(0, hy - 5, 6.2, 9, P.mane); }
                ell(0, hy - 1, 4.8, 8.6, bodyCol); // pescoço
                if (P.skel) { ell(0, hy - 1, 4.2, 8, '#e9e3cb'); }
                ell(0, hy + 3, 4.8, 5.8, bodyCol);
                if (P.skel) { ell(0, hy + 3, 4.4, 6, '#e9e3cb'); ell(-2.1, hy + 1, 1.5, 1.7, '#15110d', 0, 0); ell(2.1, hy + 1, 1.5, 1.7, '#15110d', 0, 0); glow(0, hy + 1, 6, 'rgba(79,214,255,A)', 0.5); ell(0, hy + 7, 2.8, 1.8, '#d8d2bb', 0, 0.8); }
                else { if (P.blaze) ell(0, hy + 2, 1.3, 5, P.blaze, 0, 0); ell(0, hy + 7.6, 3.4, 2.6, P.fire ? '#c8461e' : sh(c, 0.14)); ell(-1.4, hy + 8, 0.7, 0.6, '#2a1a14', 0, 0); ell(1.4, hy + 8, 0.7, 0.6, '#2a1a14', 0, 0); eye(-2.6, hy + 1.2, 1.2, false, P.fire ? '#ffe27a' : null); eye(2.6, hy + 1.2, 1.2, false, P.fire ? '#ffe27a' : null); }
                for (const s of [-1, 1]) poly([s * 3.2, hy - 2.8, s * 4.8, hy - 8.4, s * 1.2, hy - 3.8], P.skel ? '#d8d2bb' : c, 0.9);
                if (P.horn) { poly([-1, hy - 3, 0, hy - 14, 1.2, hy - 3], P.horn, 0.8); glow(0, hy - 14, 5, 'rgba(255,240,150,A)', 0.4); }
                g.restore();
            }
            if (back && P.mane && !P.fire) { }
            if (P.fire) embers(0, by - 4, 18, t, 5);
            if (P.tack && !back) { const tc = P.armor ? '#8c1f1f' : '#5a2f14', hy2 = by - 11 + sin(t * 1.5) * 0.4; ln(-4.2, hy2 + 5, 4.2, hy2 + 5, 1.2, tc); ln(-4, by - 2, 4, by - 2, 1.6, tc); ell(0, by - 2, 1.4, 1.4, '#e6c25a', 0, 0.5); if (P.plume) for (let i = -1; i <= 1; i++) poly([i * 1.6, hy2 - 3, i * 3.4, hy2 - 10 - Math.abs(i), i * 1.2 + 1, hy2 - 3], i === 0 ? '#ffd24a' : '#d83a3a', 0.6); }
        }
        g.restore(); return seat;
    }

    /* lobo gigante, pantera: quadrúpedes grandes de lado/frente/costas */
    const BIG = {
        lobo_gigante: { c1: '#767d88', c2: '#d6dbe2', c3: '#454b54', bl: 17, bh: 9.4, lg: 11, lw: 4.4, hr: 8.6, ears: 'wolf', tail: 'wolf', sn: 5.6, snc: '#d6dbe2', eye: '#e8b43a', hup: 0.6, big: 1, seatY: -34 },
        pantera: { c1: '#2d2442', c2: '#51407a', c3: '#150f24', bl: 17, bh: 8.4, lg: 10.4, lw: 4.2, hr: 8, ears: 'cat', tail: 'cat', inner: '#7a5ac4', eye: '#ffe05a', big: 1, seatY: -31, aura: 1 },
        dragao: { c1: '#3f9a58', c2: '#e8d28a', c3: '#245e36', bl: 19, bh: 9.6, lg: 9, lw: 4.4, hr: 8.6, ears: 'none', tail: 'drag', sn: 5, snc: '#4fae68', horn: '#e8dcb0', wings: 1, ws: 1.5, wc: '#2f7a46', wc2: '#8fd09a', spikes: 1, belly: '#e8d28a', eye: '#ffd24a', hover: 1, big: 1, hup: 2 }
    };
    function bigQuad(id, v, o, rider) {
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
    const MOUNT_FN = {};
    Object.keys(HORSES).forEach((k) => { MOUNT_FN[k] = (v, o, r) => { aura(k, o.stage | 0, o.t, false); return horse(stg(HORSES[k], o.stage | 0, k), v, o, r); }; });
    Object.keys(BIG).forEach((k) => { MOUNT_FN[k] = (v, o, r) => { const st = o.stage | 0; aura(k, st, o.t, true); const seat = bigQuad(k, v, o, r); if (st >= 1) tackBig(v, seat, k, st, o.t); return seat; }; });
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
        const v = o.view || 'side', fl = v === 'side' && o.flip < 0 ? -1 : 1, sc = (o.scale || 1) * (id === 'dragao' ? 1 + stage * 0.05 : 1);   // o dragão cresce até +15% (só visual: a hitbox não muda)
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
