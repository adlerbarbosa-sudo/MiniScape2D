/* MiniScape 2D — ícones de item desenhados em código (sem emojis, sem imagens): contorno escuro, luz vinda de cima à esquerda e cor por material.
   Icons.url(name) devolve uma imagem (data URL, em cache); Icons.html(name) devolve a tag <img>; Icons.canvas(name) devolve o canvas para o mundo. */
(function () {
    'use strict';
    const PI = Math.PI, TAU = PI * 2, OUT = '#1b1109', SZ = 64;

    /* ---------- cores ---------- */
    function rgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    function hex(a) { return '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
    function shade(c, k) { const a = rgb(c); return hex(a.map((v) => k >= 0 ? v + (255 - v) * k : v * (1 + k))); }
    const MAT = { copper: '#d7803e', tin: '#c3cad2', bronze: '#c98443', iron: '#9ea7b1', steel: '#c9d1dc', mithril: '#5aa8ff', coal: '#34343d', dragon: '#b8352d', bone: '#e9e3cb', lich: '#78f0c0', leather: '#98612f', dragonscale: '#b8352d', wooden: '#8b5a2b', feather: '#e8edf0', stone: '#8d959c' };
    function matOf(n) { n = n.toLowerCase(); for (const k of Object.keys(MAT)) if (n.includes(k)) return MAT[k]; return null; }

    /* ---------- ferramentas de desenho ---------- */
    let g;
    function grad(x0, y0, x1, y1, c) { const r = g.createLinearGradient(x0, y0, x1, y1); r.addColorStop(0, shade(c, 0.45)); r.addColorStop(0.5, c); r.addColorStop(1, shade(c, -0.4)); return r; }
    function fillStroke(fill, lw) { g.fillStyle = fill; g.fill(); g.lineWidth = lw == null ? 3 : lw; g.strokeStyle = OUT; g.lineJoin = 'round'; g.lineCap = 'round'; if (g.lineWidth > 0) g.stroke(); }
    function poly(pts, fill, lw) { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); fillStroke(fill, lw); }
    function ell(x, y, rx, ry, fill, lw, rot) { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, TAU); fillStroke(fill, lw); }
    function rr(x, y, w, h, r, fill, lw) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); fillStroke(fill, lw); }
    function line(x0, y0, x1, y1, w, col) { g.lineCap = 'round'; g.strokeStyle = OUT; g.lineWidth = w + 3; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.strokeStyle = col; g.lineWidth = w; g.stroke(); }
    function shine(x, y, rx, ry, a) { g.fillStyle = 'rgba(255,255,255,' + (a == null ? 0.55 : a) + ')'; g.beginPath(); g.ellipse(x, y, rx, ry, -0.6, 0, TAU); g.fill(); }
    function shadowFloor() { g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(32, 57, 18, 4, 0, 0, TAU); g.fill(); }
    function diag(fn, a, s) { g.save(); g.translate(32, 32); g.rotate(a == null ? PI / 4 : a); g.scale(s || 1, s || 1); fn(); g.restore(); }

    /* ---------- desenhos ---------- */
    const D = {};
    D.sword = (c, it) => diag(() => {
        const hiltG = '#d6a83a';
        poly([-5, 6, 5, 6, 4.5, -24, 0, -32, -4.5, -24], grad(-5, 0, 5, 0, c), 3);
        g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-0.5, 3); g.lineTo(-0.5, -24); g.stroke();
        rr(-11, 5, 22, 6, 3, grad(-11, 5, 11, 11, hiltG), 3); rr(-3, 10, 6, 15, 2, grad(-3, 0, 3, 0, '#7a4a22'), 3); ell(0, 27, 4.6, 4.6, grad(-4, 23, 4, 31, hiltG), 3);
        if (/bone/i.test(it.name)) { ell(-5, -10, 2, 3, shade(c, -0.25), 0); ell(5, -2, 2, 3, shade(c, -0.25), 0); }
    }, PI / 4, 1.05);
    D.axe = (c) => diag(() => {
        line(0, 30, 0, -26, 6, '#8b5a2b'); g.strokeStyle = '#c28a4c'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-1.2, 26); g.lineTo(-1.2, -22); g.stroke();
        g.beginPath(); g.moveTo(2, -27); g.quadraticCurveTo(24, -34, 24, -12); g.quadraticCurveTo(22, 0, 2, -6); g.closePath(); fillStroke(grad(2, -30, 24, 0, c), 3);
        g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(9, -29); g.quadraticCurveTo(21, -28, 21.5, -14); g.stroke();
        rr(-4, -28, 8, 12, 2, '#59606a', 2.5);
    }, PI / 4.5, 1.0);
    D.pickaxe = (c) => diag(() => {
        line(0, 30, 0, -22, 6, '#8b5a2b'); g.strokeStyle = '#c28a4c'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-1.2, 26); g.lineTo(-1.2, -20); g.stroke();
        g.beginPath(); g.moveTo(-27, -8); g.quadraticCurveTo(-18, -30, 0, -28); g.quadraticCurveTo(18, -30, 27, -8); g.quadraticCurveTo(16, -20, 0, -19); g.quadraticCurveTo(-16, -20, -27, -8); g.closePath(); fillStroke(grad(-27, -30, 27, -8, c), 3);
        g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-18, -22); g.quadraticCurveTo(0, -30, 18, -22); g.stroke();
        rr(-5, -30, 10, 13, 2.5, '#59606a', 2.5);
    }, PI / 4.5, 1.0);
    D.bow = (c) => { g.save(); g.translate(30, 32); g.rotate(-0.15);
        g.beginPath(); g.arc(-14, 0, 30, -1.05, 1.05); g.lineCap = 'round'; g.strokeStyle = OUT; g.lineWidth = 8; g.stroke(); g.strokeStyle = '#a4642a'; g.lineWidth = 5; g.stroke(); g.strokeStyle = '#d29a58'; g.lineWidth = 1.5; g.stroke();
        const y = Math.sin(1.05) * 30, x = -14 + Math.cos(1.05) * 30; g.strokeStyle = 'rgba(245,245,245,.95)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, -y); g.lineTo(x - 5, 0); g.lineTo(x, y); g.stroke();
        g.restore(); };
    D.staff = () => diag(() => {
        line(0, 30, 0, -14, 6, '#8b5a2b'); g.strokeStyle = '#c28a4c'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-1.2, 26); g.lineTo(-1.2, -10); g.stroke();
        rr(-4, 4, 8, 5, 2, '#5a3a1a', 2);
        const r = g.createRadialGradient(-3, -24, 1, 0, -22, 12); r.addColorStop(0, '#ffffff'); r.addColorStop(0.35, '#7fd0ff'); r.addColorStop(1, '#2b56b8'); ell(0, -22, 10, 10, r, 3);
        g.fillStyle = 'rgba(120,200,255,.25)'; g.beginPath(); g.arc(0, -22, 16, 0, TAU); g.fill();
    }, PI / 4.5, 1.0);
    D.net = () => diag(() => {
        line(0, 30, 0, -6, 5, '#8b5a2b');
        g.lineWidth = 6; g.strokeStyle = OUT; g.beginPath(); g.arc(0, -19, 14, 0, TAU); g.stroke(); g.lineWidth = 3; g.strokeStyle = '#c28a4c'; g.stroke();
        g.strokeStyle = 'rgba(240,240,240,.95)'; g.lineWidth = 1.4; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(-12, -19 + i * 5); g.lineTo(12, -19 + i * 5); g.moveTo(i * 5, -31); g.lineTo(i * 5, -7); g.stroke(); }
    }, PI / 4.5, 1.0);
    D.arrows = (c, it) => { const head = /iron/i.test(it.name) ? '#aab3bd' : /feather/i.test(it.name) ? '#e4e8ea' : '#c98443';
        const one = (ox, oy, rot) => { g.save(); g.translate(32 + ox, 32 + oy); g.rotate(rot); line(0, 24, 0, -18, 3, '#b98850'); poly([0, -30, 5, -16, -5, -16], grad(-5, -30, 5, -16, head), 2.5); poly([0, 26, 8, 30, 6, 16, 0, 20, -6, 16, -8, 30], '#e3e3d8', 2); g.restore(); };
        one(-10, 3, 0.55); one(10, 3, 0.95); one(0, 0, 0.75); };
    D.tinderbox = () => { shadowFloor(); rr(10, 26, 44, 26, 4, grad(10, 26, 54, 52, '#8b5a2b'), 3); rr(8, 20, 48, 12, 4, grad(8, 20, 56, 32, '#a8703a'), 3); g.fillStyle = '#d2a437'; g.fillRect(29, 26, 6, 8); g.strokeStyle = OUT; g.lineWidth = 2; g.strokeRect(29, 26, 6, 8);
        g.fillStyle = '#ffb24a'; g.beginPath(); g.moveTo(48, 20); g.quadraticCurveTo(52, 10, 47, 4); g.quadraticCurveTo(45, 12, 42, 14); g.quadraticCurveTo(44, 18, 48, 20); g.fill(); g.strokeStyle = OUT; g.lineWidth = 1.5; g.stroke(); };
    D.shield = (c, it) => { const dragon = /dragon/i.test(it.name);
        g.beginPath(); g.moveTo(10, 8); g.quadraticCurveTo(32, 2, 54, 8); g.quadraticCurveTo(56, 38, 32, 60); g.quadraticCurveTo(8, 38, 10, 8); g.closePath(); fillStroke(grad(10, 6, 54, 56, c), 3.5);
        g.beginPath(); g.moveTo(15, 13); g.quadraticCurveTo(32, 8, 49, 13); g.quadraticCurveTo(50, 36, 32, 53); g.quadraticCurveTo(14, 36, 15, 13); g.closePath(); g.strokeStyle = shade(c, 0.55); g.lineWidth = 1.8; g.stroke();
        if (dragon) { g.fillStyle = shade(c, -0.25); for (let r = 0; r < 3; r++) for (let q = 0; q < 3 - (r === 2 ? 1 : 0); q++) { g.beginPath(); g.arc(22 + q * 10 + (r % 2) * 5, 20 + r * 11, 5, 0, PI); g.fill(); } }
        ell(32, 30, 7, 7, grad(25, 23, 39, 37, '#d6a83a'), 3); shine(30, 27, 2.4, 1.6, 0.8); };
    D.body = (c, it) => { const lea = /leather/i.test(it.name);
        g.beginPath(); g.moveTo(16, 8); g.lineTo(6, 16); g.lineTo(8, 30); g.lineTo(16, 28); g.lineTo(16, 56); g.lineTo(48, 56); g.lineTo(48, 28); g.lineTo(56, 30); g.lineTo(58, 16); g.lineTo(48, 8); g.quadraticCurveTo(32, 20, 16, 8); g.closePath(); fillStroke(grad(8, 8, 56, 56, c), 3.5);
        g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(32, 18); g.lineTo(32, 55); g.moveTo(18, 38); g.lineTo(46, 38); g.stroke();
        if (lea) { g.strokeStyle = '#f0dcae'; g.lineWidth = 1.5; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(28, 22 + i * 7); g.lineTo(36, 26 + i * 7); g.moveTo(36, 22 + i * 7); g.lineTo(28, 26 + i * 7); g.stroke(); } }
        rr(16, 46, 32, 5, 2, '#5a3a1a', 2); shine(24, 18, 5, 2.5, 0.35); };
    D.helmet = (c) => { g.beginPath(); g.moveTo(10, 40); g.quadraticCurveTo(8, 10, 32, 8); g.quadraticCurveTo(56, 10, 54, 40); g.lineTo(46, 40); g.lineTo(46, 30); g.lineTo(18, 30); g.lineTo(18, 40); g.closePath(); fillStroke(grad(10, 8, 54, 40, c), 3.5); rr(29, 30, 6, 14, 2, shade(c, -0.2), 2.5); shine(22, 16, 6, 3, 0.5); };
    D.crown = (c) => { const gold = c || '#e0b93c'; g.beginPath(); g.moveTo(8, 46); g.lineTo(6, 16); g.lineTo(21, 30); g.lineTo(32, 10); g.lineTo(43, 30); g.lineTo(58, 16); g.lineTo(56, 46); g.closePath(); fillStroke(grad(6, 10, 58, 46, gold), 3.5);
        rr(8, 42, 48, 8, 3, shade(gold, -0.15), 3); [[32, 26, '#7ff5c6'], [17, 34, '#ff6a8a'], [47, 34, '#6ab8ff']].forEach((s) => { ell(s[0], s[1], 4, 4, s[2], 2); shine(s[0] - 1, s[1] - 1, 1.4, 1, 0.9); }); };
    D.coins = () => { shadowFloor(); const coin = (x, y, r) => { ell(x, y + 3, r, r * 0.55, '#a8770f', 3); ell(x, y, r, r * 0.55, grad(x - r, y - r, x + r, y + r, '#f4c93d'), 3); ell(x, y, r * 0.62, r * 0.32, 'rgba(0,0,0,0)', 1.4); shine(x - r * 0.35, y - r * 0.15, r * 0.3, r * 0.14, 0.8); };
        coin(21, 46, 14); coin(43, 45, 14); coin(32, 34, 14); coin(32, 22, 14); g.fillStyle = '#7a5208'; g.font = 'bold 12px Arial'; g.textAlign = 'center'; g.fillText('$', 32, 26); };
    D.rune = (c, it) => { const el = /air/i.test(it.name) ? ['#e6f8ff', '#8fd3f5'] : /mind/i.test(it.name) ? ['#ffd0e0', '#ff7aa8'] : /water/i.test(it.name) ? ['#bfe4ff', '#3d9bf0'] : /fire/i.test(it.name) ? ['#ffe0a0', '#f0641e'] : /earth/i.test(it.name) ? ['#d8c090', '#7a5a2a'] : ['#e4d8ff', '#8a63e0'];
        g.beginPath(); g.moveTo(16, 10); g.lineTo(48, 10); g.quadraticCurveTo(56, 10, 56, 18); g.lineTo(56, 46); g.quadraticCurveTo(56, 54, 48, 54); g.lineTo(16, 54); g.quadraticCurveTo(8, 54, 8, 46); g.lineTo(8, 18); g.quadraticCurveTo(8, 10, 16, 10); g.closePath(); fillStroke(grad(8, 10, 56, 54, '#7a828c'), 3.5);
        const r = g.createRadialGradient(32, 32, 2, 32, 32, 20); r.addColorStop(0, el[0]); r.addColorStop(1, el[1]); g.fillStyle = r; g.beginPath(); g.arc(32, 32, 15, 0, TAU); g.fill(); g.strokeStyle = OUT; g.lineWidth = 2.4; g.stroke();
        g.strokeStyle = OUT; g.lineWidth = 2.6; g.lineCap = 'round';
        if (/air/i.test(it.name)) { g.beginPath(); g.moveTo(22, 28); g.quadraticCurveTo(30, 20, 38, 27); g.moveTo(22, 35); g.quadraticCurveTo(34, 29, 42, 35); g.moveTo(26, 42); g.quadraticCurveTo(34, 38, 40, 42); g.stroke(); }
        else if (/mind/i.test(it.name)) { g.beginPath(); g.ellipse(32, 32, 9, 6, 0, 0, TAU); g.stroke(); g.fillStyle = OUT; g.beginPath(); g.arc(32, 32, 3, 0, TAU); g.fill(); }
        else if (/water/i.test(it.name)) { g.beginPath(); g.moveTo(32, 21); g.quadraticCurveTo(43, 34, 32, 43); g.quadraticCurveTo(21, 34, 32, 21); g.stroke(); }
        else { g.beginPath(); g.moveTo(32, 21); g.lineTo(42, 40); g.lineTo(22, 40); g.closePath(); g.stroke(); }
        shine(19, 17, 5, 2, 0.3); };
    D.ore = (c, it) => { const base = /coal/i.test(it.name) ? '#3a3a44' : hex(rgb('#8d959c').map((v, k) => v * 0.62 + rgb(c)[k] * 0.38)), fleck = c; shadowFloor();
        g.beginPath(); g.moveTo(8, 46); g.lineTo(12, 26); g.lineTo(26, 12); g.lineTo(44, 14); g.lineTo(56, 30); g.lineTo(54, 48); g.lineTo(40, 54); g.lineTo(18, 54); g.closePath(); fillStroke(grad(8, 12, 56, 54, base), 3.5);
        g.fillStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.moveTo(14, 28); g.lineTo(26, 16); g.lineTo(40, 18); g.lineTo(26, 30); g.closePath(); g.fill();
        [[24, 36, 6], [40, 30, 5], [36, 46, 5], [18, 46, 4], [46, 44, 4]].forEach((s) => { poly([s[0], s[1] - s[2], s[0] + s[2], s[1], s[0], s[1] + s[2] * 0.8, s[0] - s[2], s[1]], grad(s[0] - s[2], s[1] - s[2], s[0] + s[2], s[1] + s[2], fleck), 1.6); });
        if (/coal/i.test(it.name)) shine(30, 24, 6, 2.6, 0.5); };
    D.bar = (c) => { shadowFloor(); poly([8, 46, 16, 26, 52, 26, 58, 46], grad(8, 26, 58, 46, c), 3.5); poly([8, 46, 58, 46, 58, 54, 8, 54], grad(8, 46, 58, 54, shade(c, -0.3)), 3.5); poly([18, 30, 50, 30, 53, 42, 14, 42], 'rgba(255,255,255,.14)', 0); shine(24, 32, 8, 2, 0.6); };
    D.logs = () => { shadowFloor(); const log = (x, y, rot) => { g.save(); g.translate(x, y); g.rotate(rot); rr(-24, -8, 48, 16, 6, grad(0, -8, 0, 8, '#8b5a2b'), 3); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1.2; [-12, 2, 14].forEach((l) => { g.beginPath(); g.moveTo(l, -6); g.lineTo(l + 4, 6); g.stroke(); }); ell(24, 0, 4.4, 8, '#d9b06a', 3); ell(24, 0, 1.8, 3.6, '#a8763a', 1.4); g.restore(); };
        log(30, 44, -0.08); log(28, 30, 0.1); log(32, 17, -0.05); };
    D.bones = (c, it) => { const big = /dragon/i.test(it.name); const b = big ? '#efe4c0' : c; const bone = (rot) => { g.save(); g.translate(32, 34); g.rotate(rot); g.beginPath(); g.moveTo(-20, 0); g.lineTo(20, 0); g.lineWidth = big ? 9 : 7; g.strokeStyle = OUT; g.lineCap = 'round'; g.stroke(); g.lineWidth = big ? 5 : 3.6; g.strokeStyle = b; g.stroke(); [[-22, -5], [-22, 5], [22, -5], [22, 5]].forEach((k) => ell(k[0], k[1], 5, 5, grad(k[0] - 5, k[1] - 5, k[0] + 5, k[1] + 5, b), 2.6)); g.restore(); };
        bone(0.7); bone(-0.7); if (big) { ell(32, 32, 8, 8, '#efe4c0', 3); } };
    D.steak = (raw, tone) => { shadowFloor(); const base = raw ? tone : '#9a5a2c', hi = raw ? shade(tone, 0.3) : '#c98a4c';
        g.beginPath(); g.moveTo(10, 34); g.quadraticCurveTo(10, 12, 32, 12); g.quadraticCurveTo(56, 12, 56, 32); g.quadraticCurveTo(56, 52, 30, 54); g.quadraticCurveTo(10, 54, 10, 34); g.closePath(); fillStroke(grad(10, 12, 56, 54, base), 3.5);
        g.beginPath(); g.moveTo(20, 34); g.quadraticCurveTo(22, 20, 34, 22); g.quadraticCurveTo(46, 24, 44, 36); g.quadraticCurveTo(40, 46, 28, 44); g.quadraticCurveTo(18, 42, 20, 34); g.closePath(); g.fillStyle = hi; g.fill();
        if (raw) { g.strokeStyle = 'rgba(255,245,235,.85)'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(24, 30); g.quadraticCurveTo(32, 26, 40, 34); g.stroke(); } else { g.strokeStyle = '#4a2810'; g.lineWidth = 2.6; [[20, 26, 30, 32], [28, 22, 38, 28], [34, 38, 44, 44]].forEach((l) => { g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(l[2], l[3]); g.stroke(); }); }
        shine(20, 20, 5, 2.2, 0.4); };
    D.leg = (raw, tone) => { shadowFloor(); const base = raw ? tone : '#b26a30';
        g.save(); g.translate(32, 32); g.rotate(-0.6); line(2, 6, 2, 28, 7, '#efe6d0'); ell(-1, 4, 5, 5, '#f4ecd8', 2.4, 0); ell(5, 4, 5, 5, '#f4ecd8', 2.4, 0);
        g.beginPath(); g.moveTo(-14, -2); g.quadraticCurveTo(-14, -26, 6, -26); g.quadraticCurveTo(24, -24, 22, -4); g.quadraticCurveTo(20, 10, 4, 10); g.quadraticCurveTo(-14, 10, -14, -2); g.closePath(); fillStroke(grad(-14, -26, 22, 10, base), 3.5); shine(-4, -16, 6, 3, 0.45); g.restore(); };
    D.fish = (raw, tint) => { shadowFloor(); const body = tint ? (raw ? tint[0] : shade(tint[0], -0.25)) : (raw ? '#8fb3c6' : '#c98a3c'), belly = tint ? tint[1] : (raw ? '#e3eef3' : '#efc37a');
        poly([48, 32, 62, 18, 60, 46], grad(48, 18, 62, 46, shade(body, -0.1)), 3); g.beginPath(); g.moveTo(6, 32); g.quadraticCurveTo(22, 12, 48, 32); g.quadraticCurveTo(22, 52, 6, 32); g.closePath(); fillStroke(grad(6, 12, 48, 52, body), 3.5);
        g.beginPath(); g.moveTo(10, 34); g.quadraticCurveTo(26, 46, 46, 34); g.quadraticCurveTo(26, 40, 10, 34); g.fillStyle = belly; g.fill(); ell(16, 30, 3.2, 3.2, '#fff', 2); ell(16.6, 30, 1.4, 1.4, OUT, 0);
        if (!raw) { g.strokeStyle = 'rgba(70,35,10,.6)'; g.lineWidth = 2; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(26 + i * 6, 24); g.lineTo(28 + i * 6, 40); g.stroke(); } } else shine(28, 22, 8, 2.2, 0.55); };
    D.egg = () => { shadowFloor(); g.beginPath(); g.moveTo(32, 8); g.bezierCurveTo(50, 10, 54, 46, 32, 56); g.bezierCurveTo(10, 46, 14, 10, 32, 8); g.closePath(); fillStroke(grad(14, 8, 52, 56, '#f2e6c8'), 3.5); shine(25, 22, 5, 8, 0.6); };
    D.hide = (c) => { g.beginPath(); g.moveTo(10, 14); g.lineTo(24, 10); g.lineTo(32, 16); g.lineTo(40, 10); g.lineTo(54, 14); g.lineTo(58, 28); g.lineTo(50, 34); g.lineTo(56, 48); g.lineTo(42, 56); g.lineTo(32, 50); g.lineTo(22, 56); g.lineTo(8, 48); g.lineTo(14, 34); g.lineTo(6, 28); g.closePath(); fillStroke(grad(6, 10, 58, 56, c), 3.5);
        g.fillStyle = 'rgba(0,0,0,.18)'; [[24, 28], [38, 24], [30, 40], [42, 40]].forEach((s) => { g.beginPath(); g.ellipse(s[0], s[1], 4, 3, 0.4, 0, TAU); g.fill(); }); };
    D.wool = () => { shadowFloor(); [[20, 38, 11], [44, 38, 11], [32, 26, 13], [24, 26, 9], [42, 26, 9], [32, 44, 10]].forEach((s) => ell(s[0], s[1], s[2], s[2], grad(s[0] - s[2], s[1] - s[2], s[0] + s[2], s[1] + s[2], '#f6f1e4'), 3)); shine(28, 20, 5, 2.4, 0.7); };
    D.feather = (c) => diag(() => { g.beginPath(); g.moveTo(0, -30); g.quadraticCurveTo(16, -12, 6, 20); g.quadraticCurveTo(0, 26, -6, 20); g.quadraticCurveTo(-16, -12, 0, -30); g.closePath(); fillStroke(grad(-14, -30, 14, 22, c || '#eef2f4'), 3); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, -26); g.lineTo(0, 30); g.stroke(); g.lineWidth = 1; for (let i = -18; i < 18; i += 6) { g.beginPath(); g.moveTo(0, i); g.lineTo(-7, i + 6); g.moveTo(0, i); g.lineTo(7, i + 6); g.stroke(); } }, 0.6, 1);
    D.tooth = (c) => diag(() => { g.beginPath(); g.moveTo(-10, -24); g.quadraticCurveTo(12, -24, 12, -6); g.quadraticCurveTo(10, 14, 2, 30); g.quadraticCurveTo(-4, 14, -8, 2); g.quadraticCurveTo(-14, -12, -10, -24); g.closePath(); fillStroke(grad(-12, -24, 12, 30, c || '#f0ead6'), 3.2); shine(-3, -12, 2.4, 6, 0.6); }, 0.5, 1);
    D.paw = () => { shadowFloor(); ell(32, 40, 14, 12, grad(18, 28, 46, 52, '#b58a5a'), 3.2); [[16, 24], [26, 16], [38, 16], [48, 24]].forEach((s) => ell(s[0], s[1], 5.6, 6.6, grad(s[0] - 5, s[1] - 6, s[0] + 5, s[1] + 6, '#b58a5a'), 3)); };
    D.wing = () => { g.beginPath(); g.moveTo(6, 44); g.quadraticCurveTo(4, 14, 30, 10); g.quadraticCurveTo(52, 8, 58, 26); g.quadraticCurveTo(48, 22, 46, 32); g.quadraticCurveTo(40, 26, 36, 38); g.quadraticCurveTo(28, 30, 20, 46); g.quadraticCurveTo(14, 38, 6, 44); g.closePath(); fillStroke(grad(6, 8, 58, 46, '#6a4a86'), 3.2); g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(10, 40); g.quadraticCurveTo(20, 16, 50, 24); g.stroke(); };
    D.web = () => { g.strokeStyle = OUT; g.lineWidth = 4.6; g.lineCap = 'round'; const rays = 8; for (let i = 0; i < rays; i++) { const a = i / rays * TAU; g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26); g.stroke(); }
        for (let r = 8; r <= 26; r += 9) { g.beginPath(); for (let i = 0; i <= rays; i++) { const a = i / rays * TAU, rr2 = r * (0.85 + (i % 2) * 0.15); g[i ? 'lineTo' : 'moveTo'](32 + Math.cos(a) * rr2, 32 + Math.sin(a) * rr2); } g.stroke(); }
        g.strokeStyle = '#f2f5f8'; g.lineWidth = 1.8; for (let i = 0; i < rays; i++) { const a = i / rays * TAU; g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26); g.stroke(); } for (let r = 8; r <= 26; r += 9) { g.beginPath(); for (let i = 0; i <= rays; i++) { const a = i / rays * TAU, rr2 = r * (0.85 + (i % 2) * 0.15); g[i ? 'lineTo' : 'moveTo'](32 + Math.cos(a) * rr2, 32 + Math.sin(a) * rr2); } g.stroke(); } };
    D.slime = () => { shadowFloor(); g.beginPath(); g.moveTo(8, 50); g.quadraticCurveTo(4, 30, 20, 22); g.quadraticCurveTo(26, 8, 34, 14); g.quadraticCurveTo(46, 12, 50, 26); g.quadraticCurveTo(62, 34, 56, 50); g.quadraticCurveTo(32, 58, 8, 50); g.closePath(); fillStroke(grad(8, 10, 58, 56, '#58d36e'), 3.5); shine(22, 26, 6, 3, 0.7); ell(38, 40, 2.6, 2.6, 'rgba(255,255,255,.45)', 0); };
    D.ecto = () => { g.beginPath(); g.moveTo(32, 6); g.quadraticCurveTo(58, 10, 54, 36); g.quadraticCurveTo(52, 54, 44, 52); g.quadraticCurveTo(40, 58, 36, 50); g.quadraticCurveTo(30, 58, 26, 50); g.quadraticCurveTo(20, 56, 16, 48); g.quadraticCurveTo(6, 30, 14, 20); g.quadraticCurveTo(20, 8, 32, 6); g.closePath(); g.fillStyle = 'rgba(190,235,255,.85)'; g.fill(); g.strokeStyle = OUT; g.lineWidth = 3.2; g.stroke(); ell(25, 26, 3.6, 4.6, OUT, 0); ell(40, 26, 3.6, 4.6, OUT, 0); ell(32, 38, 4, 3, OUT, 0); shine(22, 16, 5, 2.4, 0.7); };
    D.gem = (c) => { shadowFloor(); poly([12, 22, 22, 8, 42, 8, 52, 22, 32, 56], grad(12, 8, 52, 56, c), 3.5); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(12, 22); g.lineTo(52, 22); g.moveTo(22, 8); g.lineTo(28, 22); g.lineTo(32, 56); g.moveTo(42, 8); g.lineTo(36, 22); g.lineTo(32, 56); g.stroke(); shine(24, 15, 4, 2, 0.8);
        g.fillStyle = 'rgba(255,255,255,' + (0.5) + ')'; };
    D.tome = (c) => { shadowFloor(); rr(10, 8, 42, 48, 4, grad(10, 8, 52, 56, c || '#7a2a4a'), 3.5); rr(50, 10, 6, 44, 2, '#f0e6cc', 2.6); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(16, 14); g.lineTo(16, 50); g.stroke();
        ell(30, 30, 9, 9, 'rgba(0,0,0,0)', 2.4); g.strokeStyle = '#e6c26a'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(30, 19); g.lineTo(34, 30); g.lineTo(30, 41); g.lineTo(26, 30); g.closePath(); g.stroke(); rr(10, 44, 42, 4, 1, '#e6c26a', 1.6); };
    D.scale = () => { g.beginPath(); g.moveTo(32, 6); g.quadraticCurveTo(56, 22, 50, 40); g.quadraticCurveTo(44, 58, 32, 58); g.quadraticCurveTo(20, 58, 14, 40); g.quadraticCurveTo(8, 22, 32, 6); g.closePath(); fillStroke(grad(12, 6, 54, 58, '#d24a36'), 3.5); g.strokeStyle = 'rgba(255,220,160,.6)'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(32, 12); g.lineTo(32, 52); g.moveTo(32, 30); g.lineTo(20, 22); g.moveTo(32, 30); g.lineTo(44, 22); g.moveTo(32, 42); g.lineTo(22, 36); g.moveTo(32, 42); g.lineTo(42, 36); g.stroke(); shine(24, 18, 4, 2.4, 0.55); };
    D.potion = (c, it) => { const big = /greater/i.test(it.name); const liq = /mana/i.test(it.name) ? '#3f8dff' : /strength/i.test(it.name) ? '#f28a2e' : /guard/i.test(it.name) ? '#4cc36a' : '#e0384a'; shadowFloor();
        g.beginPath(); g.moveTo(26, 8); g.lineTo(38, 8); g.lineTo(38, 22); g.quadraticCurveTo(56, 30, 54, 44); g.quadraticCurveTo(52, 58, 32, 58); g.quadraticCurveTo(12, 58, 10, 44); g.quadraticCurveTo(8, 30, 26, 22); g.closePath(); g.fillStyle = 'rgba(215,240,255,.55)'; g.fill(); g.lineWidth = 3.4; g.strokeStyle = OUT; g.stroke();
        g.save(); g.clip(); g.fillStyle = grad(10, 28, 54, 58, liq); g.fillRect(6, big ? 26 : 32, 54, 34); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(6, big ? 26 : 32, 54, 3); g.restore(); g.beginPath(); g.moveTo(26, 8); g.lineTo(38, 8); g.lineTo(38, 22); g.quadraticCurveTo(56, 30, 54, 44); g.quadraticCurveTo(52, 58, 32, 58); g.quadraticCurveTo(12, 58, 10, 44); g.quadraticCurveTo(8, 30, 26, 22); g.closePath(); g.stroke();
        rr(25, 3, 14, 8, 2, '#a8763a', 2.6); shine(19, 40, 3, 8, 0.6); if (big) { g.fillStyle = '#ffd25a'; poly([32, 32, 34, 38, 40, 38, 35, 42, 37, 48, 32, 44, 27, 48, 29, 42, 24, 38, 30, 38], '#ffd25a', 1.2); } };
    D.vial = () => { shadowFloor(); g.beginPath(); g.moveTo(26, 8); g.lineTo(38, 8); g.lineTo(38, 22); g.quadraticCurveTo(52, 30, 50, 44); g.quadraticCurveTo(48, 58, 32, 58); g.quadraticCurveTo(16, 58, 14, 44); g.quadraticCurveTo(12, 30, 26, 22); g.closePath(); g.fillStyle = 'rgba(215,240,255,.5)'; g.fill(); g.lineWidth = 3.4; g.strokeStyle = OUT; g.stroke(); rr(25, 3, 14, 8, 2, '#a8763a', 2.6); shine(21, 42, 3, 8, 0.65); };
    D.seed = (c) => { shadowFloor(); const col = /wheat/i.test(c.n) ? '#e0b64a' : /carrot/i.test(c.n) ? '#f08a2c' : /potato/i.test(c.n) ? '#b98a5a' : /herb/i.test(c.n) ? '#4cb060' : '#8f6ae0';
        g.beginPath(); g.moveTo(14, 20); g.lineTo(50, 20); g.lineTo(52, 56); g.lineTo(12, 56); g.closePath(); fillStroke(grad(12, 20, 52, 56, '#e7d7ac'), 3.2); rr(12, 16, 40, 8, 2, '#c9b078', 2.6); ell(32, 40, 10, 10, col, 2.4); shine(29, 36, 2.6, 1.8, 0.7);
        g.strokeStyle = OUT; g.lineWidth = 5; g.beginPath(); g.moveTo(32, 16); g.lineTo(32, 6); g.stroke(); g.strokeStyle = '#4fbf5a'; g.lineWidth = 2.4; g.stroke(); ell(26, 7, 5, 3, '#4fbf5a', 2, -0.4); ell(38, 7, 5, 3, '#4fbf5a', 2, 0.4); };
    D.herb = (c, it) => { const bloom = /blossom/i.test(it.name); g.strokeStyle = OUT; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(32, 58); g.quadraticCurveTo(30, 40, 32, 22); g.stroke(); g.strokeStyle = '#3f9a4a'; g.lineWidth = 3; g.stroke();
        if (bloom) { for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ell(32 + Math.cos(a) * 10, 20 + Math.sin(a) * 10, 7, 5, '#ff8fc0', 2.4, a); } ell(32, 20, 5, 5, '#ffd25a', 2.4); [[22, 46, -0.6], [42, 42, 0.6]].forEach((l) => ell(l[0], l[1], 10, 5, grad(l[0] - 9, l[1] - 5, l[0] + 9, l[1] + 5, '#4fbf5a'), 2.6, l[2])); }
        else [[20, 40, -0.7], [44, 36, 0.7], [22, 24, -0.5], [42, 20, 0.5], [32, 12, 1.57]].forEach((l) => { ell(l[0], l[1], 12, 6, grad(l[0] - 10, l[1] - 6, l[0] + 10, l[1] + 6, '#56c862'), 3, l[2]); g.strokeStyle = 'rgba(0,60,0,.35)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(l[0] - Math.cos(l[2]) * 9, l[1] - Math.sin(l[2]) * 9); g.lineTo(l[0] + Math.cos(l[2]) * 9, l[1] + Math.sin(l[2]) * 9); g.stroke(); }); };
    D.wheat = () => { for (let i = -1; i <= 1; i++) { g.save(); g.translate(32 + i * 10, 58); g.rotate(i * 0.18); g.strokeStyle = OUT; g.lineWidth = 5; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -34); g.stroke(); g.strokeStyle = '#c9a23c'; g.lineWidth = 2.2; g.stroke();
        for (let k = 0; k < 5; k++) { ell(-4, -26 - k * 5, 4, 2.6, '#f0c850', 2, -0.6); ell(4, -28 - k * 5, 4, 2.6, '#f0c850', 2, 0.6); } ell(0, -54, 3, 4, '#f0c850', 2); g.restore(); } };
    D.bread = () => { shadowFloor(); g.beginPath(); g.moveTo(6, 44); g.quadraticCurveTo(4, 20, 32, 18); g.quadraticCurveTo(60, 20, 58, 44); g.quadraticCurveTo(58, 54, 32, 54); g.quadraticCurveTo(6, 54, 6, 44); g.closePath(); fillStroke(grad(6, 18, 58, 54, '#d8994a'), 3.5); g.strokeStyle = '#f2c98a'; g.lineWidth = 2.6; g.lineCap = 'round'; [[18, 34, 24, 26], [30, 32, 36, 24], [42, 34, 48, 28]].forEach((l) => { g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(l[2], l[3]); g.stroke(); }); shine(20, 26, 6, 2, 0.4); };
    D.carrot = () => diag(() => { g.beginPath(); g.moveTo(-10, -18); g.quadraticCurveTo(0, -24, 10, -18); g.quadraticCurveTo(8, 6, 0, 32); g.quadraticCurveTo(-8, 6, -10, -18); g.closePath(); fillStroke(grad(-10, -20, 10, 30, '#f38a2a'), 3.2); g.strokeStyle = 'rgba(120,50,0,.4)'; g.lineWidth = 1.4; [-8, 0, 8, 16].forEach((y) => { g.beginPath(); g.moveTo(-6, y); g.lineTo(-1, y + 2); g.stroke(); });
        [[-8, -26, -0.5], [0, -30, 0], [8, -26, 0.5]].forEach((l) => ell(l[0], l[1], 4, 9, '#4fbf5a', 2.4, l[2])); }, -0.6, 1);
    D.potato = (baked) => { shadowFloor(); g.beginPath(); g.moveTo(8, 34); g.quadraticCurveTo(8, 14, 30, 14); g.quadraticCurveTo(56, 14, 56, 36); g.quadraticCurveTo(54, 54, 30, 54); g.quadraticCurveTo(8, 54, 8, 34); g.closePath(); fillStroke(grad(8, 14, 56, 54, baked ? '#c9873f' : '#b48651'), 3.5); g.fillStyle = 'rgba(70,40,10,.4)'; [[22, 30], [38, 26], [32, 42], [46, 40]].forEach((s) => { g.beginPath(); g.arc(s[0], s[1], 1.8, 0, TAU); g.fill(); }); if (baked) { poly([24, 22, 38, 20, 40, 28, 26, 30], '#ffe27a', 2); } shine(20, 24, 5, 2, 0.4); };
    D.sack = (it) => { shadowFloor(); g.beginPath(); g.moveTo(22, 12); g.quadraticCurveTo(32, 6, 42, 12); g.quadraticCurveTo(58, 34, 54, 50); g.quadraticCurveTo(50, 58, 32, 58); g.quadraticCurveTo(14, 58, 10, 50); g.quadraticCurveTo(6, 34, 22, 12); g.closePath(); fillStroke(grad(8, 8, 56, 58, '#b88a52'), 3.5); rr(20, 8, 24, 8, 3, '#8a6236', 2.6);
        if (it && it.icon && !/[\u0000-\u007f]/.test(it.icon)) { g.font = '26px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(it.icon, 32, 38); g.textBaseline = 'alphabetic'; } };

    /* ---------- escolha do desenho pelo item ---------- */
    function pick(it) {
        const n = it.name || '', L = n.toLowerCase(), m = matOf(n);
        if (L === 'coins') return ['coins'];
        if (it.slot === 'ammo' || /arrow/.test(L)) return ['arrows', m];
        if (it.slot === 'head' || /helm/.test(L)) return /crown/.test(L) ? ['crown', /lich/.test(L) ? '#7fe8c8' : '#e0b93c'] : ['helmet', m || '#9ea7b1'];
        if (it.slot === 'shield' || /shield/.test(L)) return ['shield', m || '#9ea7b1'];
        if (it.slot === 'body' || /body|armor/.test(L)) return ['body', m || '#8b5a2b'];
        if (it.tool === 'pickaxe' || /pickaxe/.test(L)) return ['pickaxe', m || '#9ea7b1'];
        if (it.tool === 'axe' || /\baxe\b/.test(L)) return ['axe', m || '#9ea7b1'];
        if (it.tool === 'ranged' || /bow\b/.test(L)) return ['bow'];
        if (it.tool === 'magic' || /staff|wand/.test(L)) return ['staff'];
        if (it.tool === 'net' || /net\b/.test(L)) return ['net'];
        if (/sword|blade|dagger|scimitar/.test(L)) return ['sword', m || (/bone/.test(L) ? MAT.bone : '#9ea7b1')];
        if (/tinderbox/.test(L)) return ['tinderbox'];
        if (/rune\b/.test(L)) return ['rune'];
        if (/seed/.test(L)) return ['seed', { n: L }];
        if (/potion/.test(L)) return ['potion'];
        if (/vial/.test(L)) return ['vial'];
        if (/colossus/.test(L)) return ['gem', '#ff9d3a'];
        if (/core|soul gem/.test(L)) return ['gem', /soul/.test(L) ? '#b07aff' : '#54d6f0'];
        if (/bar\b/.test(L)) return ['bar', m || '#9ea7b1'];
        if (/ore\b|coal/.test(L)) return ['ore', /copper/.test(L) ? MAT.copper : /tin/.test(L) ? MAT.tin : /iron/.test(L) ? '#b0644a' : /mithril/.test(L) ? MAT.mithril : /coal/.test(L) ? '#55555f' : '#c0a060'];
        if (/logs?\b/.test(L)) return ['logs'];
        if (/bones?\b/.test(L)) return ['bones', /dragon/.test(L) ? '#efe4c0' : MAT.bone];
        if (/^raw (chicken|rabbit)/.test(L)) return ['leg', true, /chicken/.test(L) ? '#f0b8a0' : '#d99a8a'];
        if (/^cooked (chicken|rabbit)/.test(L)) return ['leg', false];
        if (/^(raw|cooked) /.test(L) && /salmon|eel|moonfish|koi/.test(L)) { const T = /salmon/.test(L) ? ['#f08a72', '#ffd8c8'] : /eel/.test(L) ? ['#5b7a6a', '#b9d6c6'] : /moon/.test(L) ? ['#9fc4ff', '#f0f6ff'] : ['#f2a93a', '#fff0b8']; return ['fish', /^raw/.test(L), T]; }
        if (/^raw /.test(L) && /fish/.test(L)) return ['fish', true];
        if (/^cooked /.test(L) && /fish/.test(L)) return ['fish', false];
        if (/^raw /.test(L)) return ['steak', true, /pork/.test(L) ? '#f0a0a0' : /mutton/.test(L) ? '#e08a8a' : /venison/.test(L) ? '#a84a4a' : '#d24a4a'];
        if (/^cooked /.test(L)) return ['steak', false];
        if (/^egg$/.test(L)) return ['egg'];
        if (/hide|cowhide|pelt/.test(L)) return ['hide', /wolf/.test(L) ? '#8a8f96' : /deer/.test(L) ? '#c99a62' : '#9b6a3a'];
        if (/wool/.test(L)) return ['wool']; if (/feather/.test(L)) return ['feather'];
        if (/foot|paw/.test(L)) return ['paw']; if (/tusk|tooth/.test(L)) return ['tooth', /troll/.test(L) ? '#d9d4b8' : '#f0ead6'];
        if (/wing/.test(L)) return ['wing']; if (/silk|web/.test(L)) return ['web']; if (/slime/.test(L)) return ['slime']; if (/ectoplasm/.test(L)) return ['ecto'];
        if (/soul gem/.test(L)) return ['gem', '#b07aff']; if (/core|gem|crystal/.test(L)) return ['gem', '#54d6f0'];
        if (/tome|book/.test(L)) return ['tome', '#7a2a4a']; if (/scale/.test(L)) return ['scale'];
        if (/wheat$/.test(L)) return ['wheat']; if (/bread/.test(L)) return ['bread']; if (/carrot$/.test(L)) return ['carrot']; if (/baked potato/.test(L)) return ['potato', true]; if (/potato$/.test(L)) return ['potato', false];
        if (/herb|blossom/.test(L)) return ['herb'];
        return ['sack'];
    }
    const cache = Object.create(null);
    function canvas(name) {
        const key = name + '|' + ((typeof itemDB !== 'undefined' && itemDB[name] && itemDB[name].icon) || '');
        if (cache[key]) return cache[key];
        const it = (typeof itemDB !== 'undefined' && itemDB[name]) || { name, icon: '' };
        const cv = document.createElement('canvas'); cv.width = cv.height = SZ; g = cv.getContext('2d');
        try {
            const p = pick(it), fn = p[0];
            if (fn === 'sack') D.sack(it);
            else if (fn === 'steak' || fn === 'leg') D[fn](p[1], p[2]);
            else if (fn === 'fish') D.fish(p[1], p[2]);
            else if (fn === 'potato') D.potato(p[1]);
            else if (fn === 'seed') D.seed(p[1]);
            else if (fn === 'coins' || fn === 'staff' || fn === 'net' || fn === 'tinderbox' || fn === 'egg' || fn === 'wool' || fn === 'paw' || fn === 'wing' || fn === 'web' || fn === 'slime' || fn === 'ecto' || fn === 'scale' || fn === 'vial' || fn === 'herb' || fn === 'wheat' || fn === 'bread' || fn === 'carrot' || fn === 'logs') D[fn](p[1], it);
            else D[fn](p[1], it);
        } catch (e) { g.clearRect(0, 0, SZ, SZ); D.sack(it); }
        cache[key] = cv; return cv;
    }
    const urls = Object.create(null);
    function url(name) { const key = name + '|' + ((typeof itemDB !== 'undefined' && itemDB[name] && itemDB[name].icon) || ''); return urls[key] || (urls[key] = canvas(name).toDataURL()); }
    function html(name, px) { return '<img class="ic-item" alt="" draggable="false" src="' + url(name) + '"' + (px ? ' style="width:' + px + 'px;height:' + px + 'px"' : '') + '>'; }
    window.Icons = { canvas, url, html, pick, SZ };
})();
