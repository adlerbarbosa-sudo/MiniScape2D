/* ============================================================
   MiniScape 2D - ARTE DO MUNDO
   Construções, decoração, terreno, árvores, pedras, efeitos, ambiente.
   ============================================================ */
(function (root) {
    'use strict';
    const A = root.Art; if (!A) { console.error('art.js precisa carregar antes de artworld.js'); return; }
    const { hash, shade, alpha, ell, poly, rrect, limb, lg, rg, glow, tri, paint, OUT, PI, TAU } = A;
    const sin = Math.sin, cos = Math.cos, abs = Math.abs, max = Math.max, min = Math.min;
    const CAT = () => root.CATALOG || { BUILDINGS: {}, DECOR: {} };

    /* ---------- pedaços reutilizáveis ---------- */
    function bricks(g, x, y, w, h, base, bw, bh) {
        bw = bw || 13; bh = bh || 7; g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
        g.fillStyle = lg(g, x, y, x + w, y + h, [[0, shade(base, 0.14)], [1, shade(base, -0.24)]]); g.fillRect(x, y, w, h);
        const rows = Math.ceil(h / bh);
        for (let r = 0; r < rows; r++) { const off = (r % 2) * bw / 2; for (let c = -1; c < Math.ceil(w / bw) + 1; c++) { const v = hash(r * 31 + c * 7 + x * 0.3) * 0.2 - 0.1; g.fillStyle = v > 0 ? 'rgba(255,255,255,' + v + ')' : 'rgba(0,0,0,' + (-v) + ')'; g.fillRect(x + c * bw + off + 0.6, y + r * bh + 0.6, bw - 1.2, bh - 1.2); } }
        g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 0.8; g.beginPath();
        for (let r = 0; r <= rows; r++) { g.moveTo(x, y + r * bh); g.lineTo(x + w, y + r * bh); const off = (r % 2) * bw / 2; for (let c = -1; c < Math.ceil(w / bw) + 1; c++) { g.moveTo(x + c * bw + off, y + r * bh); g.lineTo(x + c * bw + off, y + (r + 1) * bh); } }
        g.stroke(); g.restore();
    }
    function plaster(g, x, y, w, h, col) {
        g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.fillStyle = lg(g, x, y, x + w, y + h, [[0, shade(col, 0.1)], [1, shade(col, -0.18)]]); g.fillRect(x, y, w, h);
        for (let i = 0; i < w * h / 90; i++) { g.fillStyle = 'rgba(0,0,0,' + (hash(i * 3.7 + x) * 0.06) + ')'; g.fillRect(x + hash(i + 1.3) * w, y + hash(i + 5.1) * h, 2, 1.4); } g.restore();
    }
    function beam(g, x, y, w, h) { g.fillStyle = lg(g, x, y, x + w, y + h, [[0, '#6a4326'], [1, '#3e2716']]); g.fillRect(x, y, w, h); g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 0.7; g.strokeRect(x, y, w, h); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, y, w > h ? w : 1, w > h ? 1 : h); }
    function tilesRoof(g, path, bb, base, rowH, tw) {   // path: função que traça o polígono; bb: [x,y,w,h]
        g.save(); g.beginPath(); path(g); g.clip();
        g.fillStyle = lg(g, bb[0], bb[1], bb[0], bb[1] + bb[3], [[0, shade(base, 0.18)], [1, shade(base, -0.28)]]); g.fillRect(bb[0], bb[1], bb[2], bb[3]);
        const rows = Math.ceil(bb[3] / rowH) + 1;
        for (let r = 0; r < rows; r++) { const off = (r % 2) * tw / 2; for (let c = -1; c < Math.ceil(bb[2] / tw) + 1; c++) { const cx = bb[0] + c * tw + off, cy = bb[1] + r * rowH; const v = hash(r * 17 + c * 5 + bb[0]) * 0.2 - 0.1; g.fillStyle = v > 0 ? 'rgba(255,255,255,' + v + ')' : 'rgba(0,0,0,' + (-v) + ')'; g.beginPath(); g.arc(cx + tw / 2, cy, tw / 2, 0, PI); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.32)'; g.lineWidth = 0.8; g.stroke(); } }
        g.restore(); g.beginPath(); path(g); g.strokeStyle = OUT; g.lineWidth = 1.6; g.lineJoin = 'round'; g.stroke();
    }
    function thatch(g, path, bb, base) {
        g.save(); g.beginPath(); path(g); g.clip(); g.fillStyle = lg(g, bb[0], bb[1], bb[0], bb[1] + bb[3], [[0, shade(base, 0.22)], [1, shade(base, -0.3)]]); g.fillRect(bb[0], bb[1], bb[2], bb[3]);
        g.lineWidth = 0.9; for (let i = 0; i < bb[2] * 1.4; i++) { const x = bb[0] + hash(i * 1.9) * bb[2], y = bb[1] + hash(i * 3.1) * bb[3]; g.strokeStyle = hash(i) > 0.5 ? 'rgba(255,240,180,0.35)' : 'rgba(60,30,0,0.35)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 2 + hash(i * 7) * 4, y + 7 + hash(i * 5) * 6); g.stroke(); }
        g.restore(); g.beginPath(); path(g); g.strokeStyle = OUT; g.lineWidth = 1.6; g.lineJoin = 'round'; g.stroke();
    }
    function win(g, x, y, w, h, o) {
        o = o || {};
        if (o.shut) { rrect(g, x - w * 0.55, y, w * 0.5, h, 1, o.shut, OUT, 0.8); rrect(g, x + w * 1.05, y, w * 0.5, h, 1, o.shut, OUT, 0.8); g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 0.6; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(x - w * 0.55, y + h * i / 4); g.lineTo(x - w * 0.05, y + h * i / 4); g.moveTo(x + w * 1.05, y + h * i / 4); g.lineTo(x + w * 1.55, y + h * i / 4); g.stroke(); } }
        rrect(g, x - 2, y - 2, w + 4, h + 4, o.arch ? w / 2 : 2, '#4a2f18', OUT, 1);
        g.save(); g.beginPath(); if (o.arch) { g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, PI, 0); g.lineTo(x + w, y + h); g.closePath(); } else g.rect(x, y, w, h); g.clip();
        g.fillStyle = o.lit ? lg(g, x, y, x, y + h, [[0, '#ffe9a6'], [1, '#ff9a3c']]) : lg(g, x, y, x + w, y + h, [[0, '#a9d6f0'], [0.5, '#6aa6cc'], [1, '#3f6f96']]); g.fillRect(x, y, w, h);
        if (!o.lit) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.moveTo(x, y + h * 0.5); g.lineTo(x + w * 0.5, y); g.lineTo(x + w * 0.75, y); g.lineTo(x, y + h * 0.9); g.fill(); }
        if (o.color) { g.fillStyle = o.color; g.fillRect(x, y, w, h); }
        g.restore(); g.strokeStyle = '#4a2f18'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + h); g.moveTo(x, y + h / 2); g.lineTo(x + w, y + h / 2); g.stroke();
        g.fillStyle = '#5a3a20'; g.fillRect(x - 3, y + h + 1, w + 6, 2.4);
        if (o.box) { rrect(g, x - 2, y + h + 2, w + 4, 5, 1, '#6a4326', OUT, 0.8); for (let i = 0; i < 5; i++) ell(g, x + i * (w / 4), y + h + 2, 2.2, 2.2, ['#ff6b8a', '#ffd54a', '#ff8a3a', '#f4f4f4', '#c66bff'][i], null); }
        if (o.lit) glow(g, x + w / 2, y + h / 2, w * 1.3, '#ffb84a', 0.28);
    }
    function door(g, x, y, w, h, col, o) {
        o = o || {}; g.save(); g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, PI, 0); g.lineTo(x + w, y + h); g.closePath();
        g.fillStyle = '#3a2412'; g.fill(); g.strokeStyle = OUT; g.lineWidth = 3; g.stroke(); g.clip();
        g.fillStyle = lg(g, x, y, x + w, y, [[0, shade(col, 0.15)], [1, shade(col, -0.3)]]); g.fillRect(x, y, w, h);
        g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 0.8; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(x + w * i / 4, y); g.lineTo(x + w * i / 4, y + h); g.stroke(); }
        if (o.double) { g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + h); g.stroke(); }
        g.fillStyle = '#2a2a2e'; g.fillRect(x, y + h * 0.28, w, 1.8); g.fillRect(x, y + h * 0.7, w, 1.8);
        g.restore(); ell(g, x + w * (o.double ? 0.42 : 0.78), y + h * 0.58, 1.6, 1.6, '#e8c04a', OUT, 0.6); if (o.double) ell(g, x + w * 0.58, y + h * 0.58, 1.6, 1.6, '#e8c04a', OUT, 0.6);
        rrect(g, x - 3, y + h - 2, w + 6, 4, 1, '#8a8f96', OUT, 0.9);
    }
    function smoke(g, x, y, t, seed) { for (let i = 0; i < 6; i++) { const p = ((t * 0.28 + i / 6 + seed) % 1), r = 2.4 + p * 8; g.fillStyle = 'rgba(210,210,215,' + (0.42 * (1 - p)) + ')'; g.beginPath(); g.arc(x + sin(t * 1.2 + i) * 3 * p + p * 10, y - p * 34, r, 0, TAU); g.fill(); } }
    function flag(g, x, y, len, h, col, t, seed) {
        limb(g, x, y, x, y - len, 2, '#5a3a20'); ell(g, x, y - len - 1, 2.2, 2.2, '#e8c04a', OUT, 0.6);
        g.beginPath(); g.moveTo(x + 1, y - len + 1); for (let i = 0; i <= 8; i++) g.lineTo(x + 1 + i * 2.6, y - len + 1 + sin(t * 4 + i * 0.7 + (seed || 0)) * (1 + i * 0.25)); for (let i = 8; i >= 0; i--) g.lineTo(x + 1 + i * 2.6, y - len + 1 + h + sin(t * 4 + i * 0.7 + (seed || 0)) * (1 + i * 0.25)); g.closePath(); paint(g, col, OUT, 0.9);
    }
    function shadowBase(g, x, y, w, h) { g.fillStyle = 'rgba(0,0,0,0.26)'; g.beginPath(); g.ellipse(x + w / 2 + 6, y, w * 0.56, h, 0, 0, TAU); g.fill(); }
    function crenels(g, x, y, w, n, h, base) { const cw = w / (n * 2 - 1); for (let i = 0; i < n; i++) { bricks(g, x + i * cw * 2, y - h, cw, h, base, 6, 5); g.strokeStyle = OUT; g.lineWidth = 1; g.strokeRect(x + i * cw * 2, y - h, cw, h); } }

    /* ============================================================
       CONSTRUÇÕES
       ============================================================ */
    const B = {};
    B.cottage = (g, t, o) => {
        shadowBase(g, 4, 95, 96, 5);
        bricks(g, 10, 76, 84, 18, '#8d8f94', 11, 6); plaster(g, 10, 46, 84, 32, '#ecdcb6');
        beam(g, 9, 44, 86, 4); beam(g, 9, 76, 86, 4); beam(g, 9, 46, 4, 32); beam(g, 91, 46, 4, 32); beam(g, 48, 46, 4, 32); g.strokeStyle = '#4a2f18'; g.lineWidth = 3; g.beginPath(); g.moveTo(13, 78); g.lineTo(28, 50); g.moveTo(91, 78); g.lineTo(76, 50); g.stroke();
        win(g, 20, 56, 15, 16, { shut: '#3f7f5a', box: true }); win(g, 69, 56, 15, 16, { shut: '#3f7f5a', box: true, lit: true });
        door(g, 43, 58, 18, 36, '#8a5a30');
        bricks(g, 74, 8, 14, 36, '#9a6a52', 7, 5); rrect(g, 72, 6, 18, 5, 1, '#6a4a3a', OUT, 1); smoke(g, 81, 6, t, hash(o.id || 1));
        const path = (g) => { g.moveTo(-2, 56); g.lineTo(52, 8); g.lineTo(106, 56); g.lineTo(98, 56); g.lineTo(52, 17); g.lineTo(6, 56); g.closePath(); g.moveTo(-3, 57); g.lineTo(52, 6); g.lineTo(107, 57); g.quadraticCurveTo(52, 46, -3, 57); g.closePath(); };
        thatch(g, (g) => { g.moveTo(-3, 57); g.lineTo(52, 5); g.lineTo(107, 57); g.quadraticCurveTo(52, 47, -3, 57); g.closePath(); }, [-3, 5, 110, 54], '#d1a94e');
        g.strokeStyle = 'rgba(90,50,10,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-3, 57); g.quadraticCurveTo(52, 47, 107, 57); g.stroke();
    };
    B.townhouse = (g, t, o) => {
        shadowBase(g, 4, 131, 108, 5);
        bricks(g, 8, 108, 100, 22, '#8d8f94', 11, 6); plaster(g, 8, 80, 100, 30, '#efe3c4');
        beam(g, 6, 106, 104, 4); beam(g, 8, 80, 4, 28); beam(g, 104, 80, 4, 28); beam(g, 56, 80, 4, 28);
        // andar de cima (avançado)
        g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(2, 80, 112, 6);
        plaster(g, 3, 46, 110, 36, '#e6d3a8'); beam(g, 2, 44, 112, 4); beam(g, 2, 80, 112, 4); [2, 30, 56, 84, 110].forEach(x => beam(g, x, 46, 4, 36));
        g.strokeStyle = '#4a2f18'; g.lineWidth = 3; g.beginPath(); g.moveTo(6, 80); g.lineTo(28, 48); g.moveTo(110, 80); g.lineTo(88, 48); g.stroke();
        win(g, 12, 52, 14, 22, { shut: '#8a3b2a', lit: true }); win(g, 40, 52, 14, 22, { shut: '#8a3b2a' }); win(g, 66, 52, 14, 22, { shut: '#8a3b2a', lit: true }); win(g, 94, 52, 14, 22, { shut: '#8a3b2a' });
        win(g, 16, 88, 14, 16, { box: true }); win(g, 82, 88, 14, 16, { box: true, lit: true }); door(g, 46, 94, 20, 36, '#7a4a28');
        rrect(g, 42, 88, 28, 6, 2, '#8a3b2a', OUT, 1);
        bricks(g, 88, 4, 14, 38, '#a05a4a', 7, 5); rrect(g, 86, 2, 18, 5, 1, '#6a4a3a', OUT, 1); smoke(g, 95, 2, t, hash(o.id || 2));
        tilesRoof(g, (g) => { g.moveTo(-3, 48); g.lineTo(58, 4); g.lineTo(119, 48); g.closePath(); }, [-3, 4, 122, 46], '#b5453a', 6, 9);
        rrect(g, 50, 22, 16, 18, 8, '#e6d3a8', OUT, 1); win(g, 53, 26, 10, 12, { lit: true });
    };
    B.tavern = (g, t, o) => {
        shadowBase(g, 4, 127, 152, 6);
        bricks(g, 12, 102, 136, 24, '#8a8d92', 12, 6); plaster(g, 12, 56, 136, 48, '#e8d5a6');
        beam(g, 10, 54, 140, 5); beam(g, 10, 100, 140, 5); [10, 44, 80, 116, 146].forEach(x => beam(g, x, 56, 4, 46));
        g.strokeStyle = '#4a2f18'; g.lineWidth = 3; g.beginPath(); g.moveTo(14, 100); g.lineTo(42, 60); g.moveTo(146, 100); g.lineTo(118, 60); g.stroke();
        win(g, 22, 68, 16, 20, { lit: true, shut: '#5a2f1e' }); win(g, 52, 68, 16, 20, { lit: true }); win(g, 92, 68, 16, 20, { lit: true }); win(g, 122, 68, 16, 20, { lit: true, shut: '#5a2f1e' });
        // porta e alpendre
        door(g, 68, 88, 24, 38, '#6a3f20', { double: true });
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(60, 84, 40, 4);
        tilesRoof(g, (g) => { g.moveTo(56, 88); g.lineTo(80, 74); g.lineTo(104, 88); g.closePath(); }, [56, 74, 48, 14], '#7a3a26', 5, 8);
        // barris
        [[22, 112], [136, 114]].forEach(([x, y]) => { rrect(g, x - 7, y - 12, 14, 18, 3, lg(g, x - 7, 0, x + 7, 0, [[0, '#a4713a'], [1, '#5a3a1a']]), OUT, 1); g.strokeStyle = '#2a2a2e'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x - 7, y - 6); g.lineTo(x + 7, y - 6); g.moveTo(x - 7, y + 2); g.lineTo(x + 7, y + 2); g.stroke(); });
        // placa
        limb(g, 30, 60, 30, 36, 3, '#4a2f18'); limb(g, 30, 38, 6, 38, 2.4, '#4a2f18');
        g.save(); g.translate(8, 38); g.rotate(sin(t * 1.6) * 0.09); limb(g, 0, 0, 0, 4, 1, '#333'); rrect(g, -9, 4, 18, 15, 3, '#d9b46a', OUT, 1); ell(g, 0, 11, 4.5, 4.5, '#f6d24a', OUT, 0.8); rrect(g, -3.5, 9, 7, 6, 1.2, '#f4f4f4', OUT, 0.6); g.restore();
        bricks(g, 116, 6, 18, 48, '#9a6a52', 8, 5); rrect(g, 114, 4, 22, 5, 1, '#6a4a3a', OUT, 1); smoke(g, 125, 4, t, hash(o.id || 3));
        tilesRoof(g, (g) => { g.moveTo(-4, 58); g.lineTo(80, 8); g.lineTo(164, 58); g.closePath(); }, [-4, 8, 168, 50], '#6a4030', 6, 9);
        tilesRoof(g, (g) => { g.moveTo(18, 58); g.lineTo(42, 32); g.lineTo(66, 58); g.closePath(); }, [18, 32, 48, 26], '#7a4a36', 5, 8); win(g, 36, 40, 9, 11, { lit: true, arch: true });
        flag(g, 80, 12, 16, 8, '#e8c04a', t, 1);
        glow(g, 80, 108, 70, '#ffb84a', 0.12);
    };
    B.smithy = (g, t, o) => {
        shadowBase(g, 4, 107, 130, 5);
        bricks(g, 8, 44, 122, 62, '#7b7e85', 13, 7);
        // baia aberta
        g.fillStyle = '#14100e'; g.fillRect(18, 58, 62, 48); g.strokeStyle = OUT; g.lineWidth = 2; g.strokeRect(18, 58, 62, 48);
        glow(g, 34, 92, 46, '#ff7a2a', 0.65 + sin(t * 9) * 0.1);
        bricks(g, 22, 76, 26, 30, '#5a3d30', 8, 6); g.fillStyle = '#0a0706'; g.beginPath(); g.moveTo(28, 106); g.lineTo(28, 88); g.quadraticCurveTo(35, 80, 42, 88); g.lineTo(42, 106); g.fill();
        for (let i = 0; i < 12; i++) { const p = (i / 12 + t * 0.9) % 1; ell(g, 35 + sin(i * 2 + t * 3) * 5, 104 - p * 18, 2.2 * (1 - p) + 0.5, 3 * (1 - p) + 0.5, i % 2 ? '#ffd24a' : '#ff5a1a', null); }
        // bigorna e ferramentas
        rrect(g, 56, 88, 16, 8, 2, '#3a3a40', OUT, 1); tri(g, 52, 88, 58, 84, 58, 88, '#3a3a40', OUT, 0.8); rrect(g, 60, 96, 8, 10, 1, '#5a3a20', OUT, 1);
        for (let i = 0; i < 4; i++) { limb(g, 22 + i * 12, 60, 22 + i * 12, 68, 1.2, '#888'); rrect(g, 20 + i * 12, 66, 5, 9, 1, i % 2 ? '#6a4a2a' : '#8a8f96', OUT, 0.6); }
        // porta lateral e janela
        door(g, 96, 68, 18, 38, '#6a4a2a'); win(g, 108, 52, 10, 10, { lit: true });
        // chaminé
        bricks(g, 100, 4, 22, 46, '#8a5a48', 8, 5); rrect(g, 98, 2, 26, 6, 1, '#5a3a2a', OUT, 1); smoke(g, 111, 2, t, hash(o.id || 4)); glow(g, 111, 2, 18, '#ff8a3a', 0.35);
        // telhado madeira
        g.beginPath(); g.moveTo(-4, 50); g.lineTo(26, 20); g.lineTo(136, 20); g.lineTo(142, 50); g.closePath(); paint(g, lg(g, 0, 20, 0, 50, [[0, '#7a5230'], [1, '#4a3018']]), OUT, 1.6);
        g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1; for (let i = 1; i < 9; i++) { g.beginPath(); g.moveTo(24 + i * 12, 20); g.lineTo(20 + i * 12.6, 50); g.stroke(); }
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(18, 50, 66, 6);
        // placa bigorna
        g.save(); g.translate(92, 56); g.rotate(sin(t * 1.4) * 0.05); rrect(g, -12, 0, 24, 12, 2, '#3a2a1a', OUT, 1); rrect(g, -6, 3, 12, 4, 1, '#c9d1d8', null); g.restore();
    };
    B.church = (g, t, o) => {
        shadowBase(g, 8, 177, 138, 6);
        bricks(g, 20, 96, 110, 78, '#cfc6b0', 14, 8); [[20, 96], [124, 96]].forEach(([x, y]) => { bricks(g, x - 2, y, 12, 78, '#b9b09a', 8, 8); });
        tilesRoof(g, (g) => { g.moveTo(10, 100); g.lineTo(38, 74); g.lineTo(112, 74); g.lineTo(140, 100); g.closePath(); }, [10, 74, 130, 28], '#4a5f8a', 6, 10);
        [[30, 110], [92, 110]].forEach(([x, y]) => win(g, x, y, 14, 30, { arch: true, color: 'rgba(90,60,180,0.55)' }));
        // torre
        bricks(g, 52, 24, 46, 74, '#d8cfb8', 12, 7); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(52, 24, 8, 74);
        g.fillStyle = '#12100e'; g.beginPath(); g.moveTo(64, 62); g.lineTo(64, 46); g.arc(75, 46, 11, PI, 0); g.lineTo(86, 62); g.closePath(); g.fill(); g.strokeStyle = OUT; g.lineWidth = 2; g.stroke();
        g.save(); g.translate(75, 40); g.rotate(sin(t * 1.4) * 0.14); rrect(g, -1, -6, 2, 6, 1, '#4a3018', null); g.beginPath(); g.moveTo(-6, 10); g.quadraticCurveTo(-7, -2, 0, -3); g.quadraticCurveTo(7, -2, 6, 10); g.closePath(); paint(g, lg(g, -6, 0, 6, 0, [[0, '#f0d060'], [1, '#a8842a']]), OUT, 1); ell(g, 0, 11, 2, 2, '#a8842a', OUT, 0.6); g.restore();
        g.beginPath(); g.moveTo(46, 30); g.lineTo(75, -14 + 14); g.lineTo(104, 30); g.closePath(); tilesRoof(g, (g) => { g.moveTo(46, 30); g.lineTo(75, 2); g.lineTo(104, 30); g.closePath(); }, [46, 2, 58, 28], '#3f5580', 5, 9);
        limb(g, 75, 2, 75, -8, 2, '#e8c04a'); limb(g, 70, -4, 80, -4, 2, '#e8c04a');
        // rosácea + porta
        ell(g, 75, 80, 10, 10, 'rgba(0,0,0,0)', '#4a3a2a', 3); for (let i = 0; i < 8; i++) { const a = i * PI / 4; g.fillStyle = ['#e04a4a', '#4a7be0', '#e0c04a', '#4ac07a'][i % 4]; g.beginPath(); g.moveTo(75, 80); g.arc(75, 80, 9, a, a + PI / 4); g.closePath(); g.fill(); }
        ell(g, 75, 80, 10, 10, null, OUT, 1.2);
        door(g, 60, 128, 30, 46, '#6a3f20', { double: true }); g.strokeStyle = '#4a3a2a'; g.lineWidth = 3; g.beginPath(); g.arc(75, 130, 17, PI, 0); g.stroke();
        rrect(g, 56, 172, 38, 5, 1, '#9a948a', OUT, 1);
    };
    B.wizard_tower = (g, t, o) => {
        shadowBase(g, 12, 189, 64, 5);
        g.save(); g.translate(43, 189); g.rotate(sin(t * 0.5) * 0.004); g.translate(-43, -189);
        g.beginPath(); g.moveTo(14, 186); g.quadraticCurveTo(20, 130, 24, 74); g.lineTo(62, 74); g.quadraticCurveTo(66, 130, 72, 186); g.closePath(); paint(g, lg(g, 14, 0, 72, 0, [[0, '#6a7fb0'], [0.5, '#8a9fd0'], [1, '#4a5f90']]), OUT, 1.6);
        g.save(); g.clip(); for (let r = 0; r < 20; r++) for (let c = 0; c < 7; c++) { g.fillStyle = 'rgba(' + (hash(r * 7 + c) > 0.5 ? '255,255,255,0.07' : '0,0,0,0.09') + ')'; g.fillRect(16 + c * 8 + (r % 2) * 4, 74 + r * 6, 7, 5); } g.restore();
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(28, 74, 6, 112);
        win(g, 34, 100, 9, 16, { arch: true, lit: true, color: 'rgba(170,80,255,0.4)' }); win(g, 42, 140, 8, 14, { arch: true, lit: true, color: 'rgba(170,80,255,0.4)' });
        door(g, 34, 154, 18, 32, '#5a3a6a');
        // varanda
        ell(g, 43, 76, 26, 6, '#5a6a94', OUT, 1.3); g.strokeStyle = '#3a466a'; g.lineWidth = 1.4; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(21 + i * 5.5, 76); g.lineTo(21 + i * 5.5, 68); g.stroke(); }
        // telhado cônico torto
        g.beginPath(); g.moveTo(14, 74); g.quadraticCurveTo(30, 60, 36, 34); g.quadraticCurveTo(44, 14, 66, 8); g.quadraticCurveTo(52, 22, 56, 40); g.quadraticCurveTo(66, 58, 74, 74); g.quadraticCurveTo(44, 66, 14, 74); g.closePath();
        paint(g, lg(g, 14, 8, 74, 74, [[0, '#4a4ab8'], [1, '#22225a']]), OUT, 1.6);
        [[38, 56], [50, 62], [44, 44], [54, 50], [34, 66]].forEach((p, i) => { g.fillStyle = '#ffe36a'; g.beginPath(); for (let k = 0; k < 5; k++) { const a = k * TAU / 5 - PI / 2; g.lineTo(p[0] + cos(a) * 2.6, p[1] + sin(a) * 2.6); const b = a + PI / 5; g.lineTo(p[0] + cos(b) * 1.1, p[1] + sin(b) * 1.1); } g.closePath(); g.fill(); });
        g.restore();
        // orbes flutuantes
        for (let i = 0; i < 3; i++) { const a = t * 0.9 + i * 2.1; const x = 43 + cos(a) * 34, y = 92 + sin(a * 1.3) * 10 + i * 6; glow(g, x, y, 12, '#b76bff', 0.7); ell(g, x, y, 2.6, 2.6, '#fff', null); }
    };
    B.watchtower = (g, t, o) => {
        shadowBase(g, 8, 149, 60, 4);
        bricks(g, 14, 40, 48, 108, '#a8a49a', 12, 7); g.fillStyle = 'rgba(0,0,0,0.13)'; g.fillRect(14, 40, 8, 108); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(52, 40, 10, 108);
        [[34, 60], [34, 88]].forEach(([x, y]) => { g.fillStyle = '#0e0c0a'; g.fillRect(x, y, 4, 15); g.strokeStyle = OUT; g.lineWidth = 1; g.strokeRect(x, y, 4, 15); });
        door(g, 28, 114, 20, 34, '#6a4a2a'); win(g, 30, 74, 0.1, 0.1, {});
        bricks(g, 8, 28, 60, 16, '#b8b4aa', 12, 6); rrect(g, 8, 42, 60, 4, 1, '#6a6660', OUT, 1); crenels(g, 8, 28, 60, 5, 12, '#b8b4aa');
        g.fillStyle = '#2a1a10'; g.fillRect(14, 24, 48, 5);
        flag(g, 38, 26, 22, 11, '#c0392b', t, 2);
    };
    B.castle = (g, t, o) => {
        shadowBase(g, 8, 189, 246, 6);
        // muralha
        bricks(g, 60, 100, 140, 88, '#b5b0a4', 14, 8); crenels(g, 60, 100, 140, 11, 12, '#c2bdb0');
        // torre central (keep)
        bricks(g, 88, 48, 84, 140, '#c4bfb2', 14, 8); crenels(g, 88, 48, 84, 7, 14, '#d0cbbe');
        [[104, 68], [146, 68], [104, 110], [146, 110]].forEach(([x, y]) => win(g, x, y, 10, 20, { arch: true, lit: true }));
        // torres laterais
        [[8, '#3a5fa8'], [192, '#a83a3a']].forEach(([x, col], k) => {
            g.beginPath(); g.moveTo(x, 186); g.lineTo(x, 60); g.lineTo(x + 60, 60); g.lineTo(x + 60, 186); g.closePath(); paint(g, lg(g, x, 0, x + 60, 0, [[0, '#b8b3a6'], [0.5, '#d4cfc2'], [1, '#98938a']]), OUT, 1.6);
            g.save(); g.clip(); for (let r = 0; r < 20; r++) for (let c = 0; c < 6; c++) { g.fillStyle = hash(r * 9 + c + k) > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'; g.fillRect(x + c * 10 + (r % 2) * 5, 60 + r * 6.4, 9, 5.4); } g.restore();
            win(g, x + 24, 90, 10, 22, { arch: true, lit: true }); win(g, x + 24, 130, 10, 22, { arch: true });
            rrect(g, x - 4, 56, 68, 8, 2, '#98938a', OUT, 1.2);
            tilesRoof(g, (g) => { g.moveTo(x - 6, 58); g.lineTo(x + 30, 6); g.lineTo(x + 66, 58); g.closePath(); }, [x - 6, 6, 72, 52], col, 6, 9);
            flag(g, x + 30, 8, 22, 12, k ? '#e8c04a' : '#f4f4f4', t, k);
        });
        // portão
        g.fillStyle = '#0c0a08'; g.beginPath(); g.moveTo(105, 188); g.lineTo(105, 150); g.arc(130, 150, 25, PI, 0); g.lineTo(155, 188); g.closePath(); g.fill(); g.strokeStyle = OUT; g.lineWidth = 3; g.stroke();
        g.save(); g.beginPath(); g.moveTo(108, 188); g.lineTo(108, 150); g.arc(130, 150, 22, PI, 0); g.lineTo(152, 188); g.closePath(); g.clip(); g.fillStyle = lg(g, 108, 0, 152, 0, [[0, '#7a4a28'], [1, '#4a2c16']]); g.fillRect(108, 126, 44, 62);
        g.strokeStyle = '#2a2a2e'; g.lineWidth = 2.4; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(112 + i * 7.4, 126); g.lineTo(112 + i * 7.4, 188); g.stroke(); } for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(108, 138 + i * 9); g.lineTo(152, 138 + i * 9); g.stroke(); } g.restore();
        g.strokeStyle = '#8a8f96'; g.lineWidth = 3; g.beginPath(); g.arc(130, 150, 24, PI, 0); g.stroke();
        // estandartes
        [[92, '#3a5fa8'], [158, '#a83a3a']].forEach(([x, col], i) => { g.beginPath(); g.moveTo(x, 118); for (let k = 0; k <= 6; k++) g.lineTo(x + k * 3, 118 + sin(t * 2 + k * 0.6 + i) * 1.2); g.lineTo(x + 18, 152); g.lineTo(x + 9, 146 + sin(t * 2 + i) * 1); g.lineTo(x, 152); g.closePath(); paint(g, col, OUT, 1); ell(g, x + 9, 130, 3.4, 3.4, '#e8c04a', OUT, 0.6); });
        flag(g, 130, 34, 24, 13, '#c0392b', t, 3);
    };
    B.windmill = (g, t, o) => {
        shadowBase(g, 20, 157, 70, 5);
        g.beginPath(); g.moveTo(24, 156); g.lineTo(38, 74); g.lineTo(72, 74); g.lineTo(86, 156); g.closePath(); paint(g, lg(g, 24, 0, 86, 0, [[0, '#d8ccb0'], [0.5, '#f2e8d0'], [1, '#b8ac90']]), OUT, 1.6);
        g.save(); g.clip(); g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1; for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(20, 80 + i * 7); g.lineTo(90, 80 + i * 7); g.stroke(); } g.restore();
        door(g, 46, 124, 18, 32, '#6a3f20'); win(g, 50, 92, 10, 14, { arch: true, lit: true, shut: '#a83a3a' });
        rrect(g, 34, 70, 42, 6, 2, '#5a3a20', OUT, 1.2);
        g.beginPath(); g.moveTo(34, 72); g.quadraticCurveTo(36, 36, 55, 32); g.quadraticCurveTo(74, 36, 76, 72); g.closePath(); paint(g, lg(g, 34, 32, 76, 72, [[0, '#a05a30'], [1, '#5a3018']]), OUT, 1.6);
        // pás
        g.save(); g.translate(55, 56); const rot = t * 0.7 + hash(o.id || 1) * 6;
        for (let i = 0; i < 4; i++) { g.save(); g.rotate(rot + i * PI / 2); g.fillStyle = '#4a2f18'; g.fillRect(-1.6, 0, 3.2, 60); g.strokeStyle = OUT; g.lineWidth = 0.8; g.strokeRect(-1.6, 0, 3.2, 60);
            g.beginPath(); g.rect(1.6, 8, 15, 50); paint(g, 'rgba(244,236,214,0.95)', OUT, 1); g.strokeStyle = '#8a6a44'; g.lineWidth = 1; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(1.6, 8 + k * 8.4); g.lineTo(16.6, 8 + k * 8.4); g.stroke(); } g.beginPath(); g.moveTo(9, 8); g.lineTo(9, 58); g.stroke(); g.restore(); }
        ell(g, 0, 0, 5, 5, '#6a4a2a', OUT, 1.2); ell(g, 0, 0, 2, 2, '#c9a234', null); g.restore();
    };
    B.barn = (g, t, o) => {
        shadowBase(g, 4, 115, 140, 5);
        g.beginPath(); g.moveTo(10, 114); g.lineTo(10, 56); g.lineTo(138, 56); g.lineTo(138, 114); g.closePath(); paint(g, lg(g, 0, 56, 0, 114, [[0, '#b5382e'], [1, '#7a2018']]), OUT, 1.6);
        g.save(); g.clip(); g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1; for (let i = 0; i < 26; i++) { g.beginPath(); g.moveTo(10 + i * 5, 56); g.lineTo(10 + i * 5, 114); g.stroke(); } g.restore();
        g.strokeStyle = '#f3ecd8'; g.lineWidth = 3; g.strokeRect(12, 58, 124, 54);
        // porta grande
        g.fillStyle = '#5a1a12'; g.fillRect(48, 70, 52, 44); g.strokeStyle = '#f3ecd8'; g.lineWidth = 3; g.strokeRect(48, 70, 52, 44); g.beginPath(); g.moveTo(48, 70); g.lineTo(100, 114); g.moveTo(100, 70); g.lineTo(48, 114); g.moveTo(74, 70); g.lineTo(74, 114); g.stroke();
        // sótão de feno
        g.fillStyle = '#2a1a10'; g.fillRect(64, 36, 20, 20); g.strokeStyle = '#f3ecd8'; g.lineWidth = 2.4; g.strokeRect(64, 36, 20, 20); g.fillStyle = '#e6c46a'; g.fillRect(66, 46, 16, 10); for (let i = 0; i < 6; i++) { g.strokeStyle = '#b8902a'; g.beginPath(); g.moveTo(68 + i * 2.6, 56); g.lineTo(66 + i * 3, 48); g.stroke(); }
        win(g, 20, 76, 12, 14, { shut: '#f3ecd8' }); win(g, 116, 76, 12, 14, { shut: '#f3ecd8' });
        tilesRoof(g, (g) => { g.moveTo(-4, 60); g.lineTo(22, 22); g.lineTo(74, 6); g.lineTo(126, 22); g.lineTo(152, 60); g.lineTo(138, 60); g.lineTo(112, 34); g.lineTo(74, 22); g.lineTo(36, 34); g.lineTo(10, 60); g.closePath(); }, [-4, 6, 156, 54], '#5a5560', 6, 9);
        g.save(); g.translate(74, 6); g.rotate(sin(t * 0.8) * 0.4); limb(g, -8, 0, 8, 0, 1.6, '#333'); tri(g, 8, -2, 13, 0, 8, 2, '#333', null); g.restore(); limb(g, 74, 6, 74, -6, 2, '#333');
    };
    B.market = (g, t, o) => {
        shadowBase(g, 8, 68, 76, 3);
        limb(g, 12, 66, 12, 20, 3, '#5a3a20'); limb(g, 76, 66, 76, 20, 3, '#5a3a20');
        rrect(g, 8, 46, 72, 18, 2, lg(g, 0, 46, 0, 64, [[0, '#8a5a30'], [1, '#5a3a1a']]), OUT, 1.2);
        for (let i = 0; i < 8; i++) ell(g, 16 + i * 8, 44, 3.6, 3.4, ['#e04a3a', '#ffd54a', '#4ac07a', '#ff8a3a'][i % 4], OUT, 0.6);
        rrect(g, 18, 48, 20, 3, 1, '#f4ecd0', null); ell(g, 52, 50, 4, 3.4, '#c66bff', OUT, 0.6); ell(g, 60, 50, 3.4, 3, '#ff6b8a', OUT, 0.6);
        g.beginPath(); g.moveTo(2, 22); g.lineTo(44, 4); g.lineTo(86, 22); g.lineTo(86, 26); for (let i = 0; i <= 8; i++) g.lineTo(86 - i * 10.5, 26 + (i % 2 ? 6 : 0) + sin(t * 2 + i) * 0.6); g.lineTo(2, 22); g.closePath(); paint(g, '#d0d0d0', OUT, 1.4);
        g.save(); g.clip(); for (let i = 0; i < 9; i++) { if (i % 2 === 0) { g.fillStyle = '#c0392b'; g.beginPath(); g.moveTo(44, 4); g.lineTo(2 + i * 10.5, 40); g.lineTo(2 + (i + 1) * 10.5, 40); g.closePath(); g.fill(); } } g.restore();
        g.beginPath(); g.moveTo(2, 22); g.lineTo(44, 4); g.lineTo(86, 22); g.strokeStyle = OUT; g.lineWidth = 1.4; g.stroke();
        rrect(g, 26, 26, 36, 8, 2, '#f4ecd0', OUT, 0.9); g.fillStyle = '#5a3a1a'; g.font = 'bold 6px Arial'; g.textAlign = 'center'; g.fillText('FEIRA', 44, 32); g.textAlign = 'start';
    };
    B.tent = (g, t, o) => {
        shadowBase(g, 6, 65, 72, 3);
        g.beginPath(); g.moveTo(4, 64); g.lineTo(42, 4); g.lineTo(80, 64); g.closePath(); paint(g, lg(g, 4, 0, 80, 0, [[0, '#c9b487'], [0.5, '#e8d8ac'], [1, '#a8946a']]), OUT, 1.6);
        g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 1; for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(42, 4); g.lineTo(4 + i * 15, 64); g.stroke(); }
        g.beginPath(); g.moveTo(30, 64); g.lineTo(42, 24); g.lineTo(54, 64); g.closePath(); paint(g, '#1c1410', OUT, 1.2); g.beginPath(); g.moveTo(42, 24); g.lineTo(28, 66); g.lineTo(20, 64); g.closePath(); paint(g, '#b39c70', OUT, 1); g.beginPath(); g.moveTo(42, 24); g.lineTo(56, 66); g.lineTo(64, 64); g.closePath(); paint(g, '#a58e62', OUT, 1);
        g.strokeStyle = '#5a3a20'; g.lineWidth = 1; [[2, 66, -8], [82, 66, 8]].forEach(p => { g.beginPath(); g.moveTo(p[0] < 42 ? 8 : 76, 44); g.lineTo(p[0] + p[2], 66); g.stroke(); });
        flag(g, 42, 6, 12, 8, '#c0392b', t, 4);
    };

    function drawBuilding(ctx, o, t) {
        const cat = CAT().BUILDINGS; const style = (o.style && B[o.style]) ? o.style : 'cottage'; const d = cat[style] || { w: 104, h: 96 };
        const ow = o.w || d.w, oh = o.h || d.h; ctx.save(); ctx.translate(o.x, o.y); ctx.scale(ow / d.w, oh / d.h);
        try { B[style](ctx, t, o); } catch (e) { console.error('[art] prédio', style, e); }
        ctx.restore();
    }

    /* ============================================================
       DECORAÇÃO
       ============================================================ */
    const D = {};
    D.well = (g, t) => { ell(g, 22, 48, 20, 6, 'rgba(0,0,0,0.25)'); bricks(g, 6, 28, 32, 20, '#9a9a9f', 8, 6); ell(g, 22, 28, 16, 6, '#22384a', OUT, 1.2); ell(g, 22, 29, 12, 4, '#2f6ea8', null); limb(g, 8, 28, 8, 8, 3, '#5a3a20'); limb(g, 36, 28, 36, 8, 3, '#5a3a20'); tilesRoof(g, (g) => { g.moveTo(2, 12); g.lineTo(22, 0); g.lineTo(42, 12); g.closePath(); }, [2, 0, 40, 12], '#8a4a2a', 4, 6); limb(g, 22, 10, 22, 26 + sin(t * 2) * 1, 1, '#c9a25a'); rrect(g, 19, 24 + sin(t * 2), 6, 6, 1, '#8a5a30', OUT, 0.7); };
    D.fountain = (g, t) => {
        ell(g, 42, 68, 38, 8, 'rgba(0,0,0,0.25)'); ell(g, 42, 58, 38, 14, '#8f939a', OUT, 1.4); ell(g, 42, 56, 33, 11, '#3f86c0', null); ell(g, 42, 56, 33, 11, lg(g, 20, 45, 64, 67, [[0, 'rgba(255,255,255,0.35)'], [1, 'rgba(0,0,40,0.25)']]), null);
        rrect(g, 36, 30, 12, 26, 2, '#a8acb2', OUT, 1.2); ell(g, 42, 30, 14, 5, '#8f939a', OUT, 1.2); ell(g, 42, 29, 11, 3.4, '#5aa0d8', null);
        for (let i = 0; i < 9; i++) { const p = (t * 0.9 + i / 9) % 1, a = (i / 9) * TAU; const x = 42 + cos(a) * 20 * p, y = 28 - sin(p * PI) * 20 + 22 * p * p; ell(g, x, y, 1.6, 1.6, 'rgba(210,235,255,' + (0.9 * (1 - p * 0.5)) + ')'); }
        for (let i = 0; i < 3; i++) { const p = (t * 0.5 + i / 3) % 1; g.strokeStyle = 'rgba(255,255,255,' + (0.5 * (1 - p)) + ')'; g.lineWidth = 1; g.beginPath(); g.ellipse(42, 56, 8 + p * 24, 3 + p * 7, 0, 0, TAU); g.stroke(); }
    };
    D.barrel = (g) => { ell(g, 13, 30, 12, 3, 'rgba(0,0,0,0.25)'); g.beginPath(); g.moveTo(3, 6); g.quadraticCurveTo(-1, 18, 3, 30); g.lineTo(23, 30); g.quadraticCurveTo(27, 18, 23, 6); g.closePath(); paint(g, lg(g, 0, 0, 26, 0, [[0, '#b07a42'], [0.5, '#c9944e'], [1, '#6a4420']]), OUT, 1.3); ell(g, 13, 6, 10, 3.2, '#d0a066', OUT, 1); g.strokeStyle = '#2a2a2e'; g.lineWidth = 1.6; [10, 20].forEach(y => { g.beginPath(); g.moveTo(1, y); g.lineTo(25, y); g.stroke(); }); };
    D.crates = (g) => { ell(g, 22, 36, 21, 4, 'rgba(0,0,0,0.25)'); const bx = (x, y, s) => { rrect(g, x, y, s, s, 1.4, lg(g, x, y, x + s, y + s, [[0, '#c9944e'], [1, '#7a5228']]), OUT, 1.2); g.strokeStyle = '#5a3a1a'; g.lineWidth = 1.4; g.strokeRect(x + 2, y + 2, s - 4, s - 4); g.beginPath(); g.moveTo(x + 2, y + 2); g.lineTo(x + s - 2, y + s - 2); g.stroke(); }; bx(3, 18, 20); bx(23, 20, 18); bx(12, 4, 18); };
    D.haystack = (g) => { ell(g, 26, 44, 24, 4, 'rgba(0,0,0,0.25)'); g.beginPath(); g.moveTo(2, 44); g.quadraticCurveTo(0, 14, 26, 4); g.quadraticCurveTo(52, 14, 50, 44); g.closePath(); paint(g, lg(g, 0, 4, 0, 44, [[0, '#f0d270'], [1, '#b8902a']]), OUT, 1.3); g.strokeStyle = 'rgba(120,80,10,0.55)'; g.lineWidth = 1; for (let i = 0; i < 26; i++) { const x = 6 + hash(i) * 40, y = 10 + hash(i + 9) * 32; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 3, y + 5); g.stroke(); } g.strokeStyle = '#6a4a1a'; g.lineWidth = 2; g.beginPath(); g.moveTo(4, 30); g.quadraticCurveTo(26, 34, 48, 30); g.stroke(); };
    D.lamp = (g, t) => { ell(g, 8, 58, 6, 2, 'rgba(0,0,0,0.25)'); limb(g, 8, 58, 8, 14, 3, '#2a2a30'); rrect(g, 3, 4, 10, 12, 2, '#2a2a30', OUT, 1); rrect(g, 4.6, 6, 6.8, 8, 1, '#ffd98a', null); tri(g, 2, 5, 8, -1, 14, 5, '#2a2a30', OUT, 1); glow(g, 8, 10, 30, '#ffb84a', 0.4 + sin(t * 7 + 1) * 0.05); ell(g, 8, 10, 3, 3.6, '#fff6c8', null); };
    D.sign = (g) => { ell(g, 15, 38, 9, 2.4, 'rgba(0,0,0,0.25)'); limb(g, 15, 38, 15, 8, 3.4, '#5a3a20'); poly(g, [3, 6, 22, 6, 28, 12, 22, 18, 3, 18], lg(g, 0, 6, 0, 18, [[0, '#c9994e'], [1, '#8a6a34']]), OUT, 1.2); g.strokeStyle = '#4a2f18'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(6, 10); g.lineTo(18, 10); g.moveTo(6, 14); g.lineTo(15, 14); g.stroke(); poly(g, [8, 22, 24, 22, 28, 26, 24, 30, 8, 30], '#b48a46', OUT, 1); };
    D.fence_h = (g) => { for (let i = 0; i < 8; i++) { const x = 3 + i * 10; g.beginPath(); g.moveTo(x, 24); g.lineTo(x, 8); g.lineTo(x + 3.5, 4); g.lineTo(x + 7, 8); g.lineTo(x + 7, 24); g.closePath(); paint(g, lg(g, x, 0, x + 7, 0, [[0, '#c9a066'], [1, '#8a6034']]), OUT, 1); } beam(g, 0, 11, 80, 4); beam(g, 0, 19, 80, 3.4); };
    D.fence_v = (g) => { for (let i = 0; i < 8; i++) { const y = 2 + i * 10; g.beginPath(); rrect(g, 1, y, 12, 8, 1.4, lg(g, 0, y, 0, y + 8, [[0, '#c9a066'], [1, '#8a6034']]), OUT, 1); } beam(g, 5, 0, 4, 80); };
    D.wall_h = (g) => { ell(g, 48, 33, 46, 3, 'rgba(0,0,0,0.25)'); bricks(g, 0, 8, 96, 26, '#a5a29a', 12, 7); rrect(g, -1, 4, 98, 7, 2, '#b9b6ad', OUT, 1.2); g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(0, 5, 96, 2); };
    D.wall_v = (g) => { bricks(g, 2, 8, 18, 88, '#a5a29a', 9, 7); rrect(g, 0, 4, 22, 8, 2, '#b9b6ad', OUT, 1.2); ell(g, 11, 96, 10, 2.4, 'rgba(0,0,0,0.25)'); };
    D.flowers = (g, t, o) => { const cols = [['#ff6b8a', '#ffd54a'], ['#c66bff', '#fff'], ['#ffd54a', '#ff8a3a'], ['#f4f4f4', '#ffd54a']]; const c = cols[Math.floor(hash((o.id || 1) * 2.1) * cols.length)]; for (let i = 0; i < 7; i++) { const x = 3 + hash(i * 2 + (o.id || 1)) * 24, y = 8 + hash(i * 3 + 1) * 12, sw = sin(t * 1.6 + i) * 1; g.strokeStyle = '#2f8a3a'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y + 8); g.lineTo(x + sw, y); g.stroke(); for (let k = 0; k < 5; k++) { const a = k * TAU / 5; ell(g, x + sw + cos(a) * 2, y + sin(a) * 2, 1.7, 1.7, c[0], null); } ell(g, x + sw, y, 1.2, 1.2, c[1], null); } };
    D.bush = (g, t) => { ell(g, 18, 26, 17, 3, 'rgba(0,0,0,0.25)'); [[10, 16, 10], [24, 15, 11], [17, 10, 10], [17, 19, 11]].forEach((b, i) => ell(g, b[0], b[1], b[2], b[2] * 0.85, rg(g, b[0] - 3, b[1] - 3, 1, b[2], [[0, '#4fbf5a'], [1, '#1f6a2c']]), OUT, 1)); [[9, 15], [22, 12], [16, 20], [26, 19]].forEach((p, i) => ell(g, p[0], p[1], 1.8, 1.8, '#e0384a', null)); };
    D.stump = (g) => { ell(g, 13, 20, 12, 3, 'rgba(0,0,0,0.25)'); g.beginPath(); g.moveTo(3, 20); g.quadraticCurveTo(2, 10, 4, 8); g.lineTo(22, 8); g.quadraticCurveTo(24, 10, 23, 20); g.closePath(); paint(g, lg(g, 0, 0, 26, 0, [[0, '#8a5a30'], [1, '#4a2f18']]), OUT, 1.2); ell(g, 13, 8, 10, 4, '#c9a066', OUT, 1); ell(g, 13, 8, 6, 2.4, null, '#a07a44', 0.8); ell(g, 13, 8, 3, 1.2, null, '#a07a44', 0.8); };
    D.statue = (g) => { ell(g, 20, 72, 18, 3, 'rgba(0,0,0,0.25)'); rrect(g, 4, 58, 32, 14, 2, '#8a8d92', OUT, 1.3); rrect(g, 8, 52, 24, 8, 2, '#a5a8ad', OUT, 1.1); g.beginPath(); g.moveTo(14, 52); g.lineTo(12, 30); g.lineTo(16, 22); g.lineTo(24, 22); g.lineTo(28, 30); g.lineTo(26, 52); g.closePath(); paint(g, lg(g, 10, 0, 30, 0, [[0, '#c9ccd2'], [1, '#7c8088']]), OUT, 1.2); ell(g, 20, 16, 6, 6.4, '#b9bcc2', OUT, 1.1); rrect(g, 14, 8, 12, 8, 3, '#9a9da4', OUT, 1); g.fillStyle = '#5a5d64'; g.fillRect(16, 14, 8, 1.6); limb(g, 30, 28, 34, 50, 2.6, '#c0c3c9'); limb(g, 34, 6, 34, 50, 2, '#8a8d92'); tri(g, 31.6, 8, 34, 0, 36.4, 8, '#dfe2e6', OUT, 0.7); g.beginPath(); g.arc(10, 38, 8, -1.2, 1.4); g.strokeStyle = OUT; g.lineWidth = 3.4; g.stroke(); g.strokeStyle = '#b0b3b9'; g.lineWidth = 2; g.stroke(); };
    D.gravestone = (g) => { ell(g, 13, 32, 11, 2.4, 'rgba(0,0,0,0.25)'); g.beginPath(); g.moveTo(3, 32); g.lineTo(3, 12); g.quadraticCurveTo(13, -2, 23, 12); g.lineTo(23, 32); g.closePath(); paint(g, lg(g, 3, 0, 23, 0, [[0, '#b0b3b8'], [1, '#6a6d74']]), OUT, 1.2); g.strokeStyle = '#4a4d54'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(13, 8); g.lineTo(13, 20); g.moveTo(9, 12); g.lineTo(17, 12); g.stroke(); ell(g, 6, 30, 5, 2, '#3f7a3a', null); };
    D.banner = (g, t, o) => { ell(g, 12, 62, 8, 2, 'rgba(0,0,0,0.25)'); limb(g, 12, 62, 12, 4, 3, '#4a2f18'); limb(g, 2, 6, 22, 6, 2.4, '#4a2f18'); g.beginPath(); g.moveTo(4, 7); for (let i = 0; i <= 5; i++) g.lineTo(4 + i * 3.2, 7 + sin(t * 2 + i * 0.6) * 0.8); g.lineTo(20, 46); g.lineTo(12, 40 + sin(t * 2) * 1); g.lineTo(4, 46); g.closePath(); paint(g, lg(g, 0, 7, 0, 46, [[0, '#c0392b'], [1, '#7a1f16']]), OUT, 1); ell(g, 12, 22, 4, 4, '#e8c04a', OUT, 0.7); tri(g, 12, 14, 14, 20, 10, 20, '#e8c04a', null); };
    D.cart = (g) => { ell(g, 33, 44, 32, 4, 'rgba(0,0,0,0.25)'); g.beginPath(); g.moveTo(8, 14); g.lineTo(58, 14); g.lineTo(54, 34); g.lineTo(12, 34); g.closePath(); paint(g, lg(g, 0, 14, 0, 34, [[0, '#b58a4a'], [1, '#6a4a22']]), OUT, 1.3); g.strokeStyle = '#4a2f18'; g.lineWidth = 1; for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(8 + i * 10, 14); g.lineTo(12 + i * 9.4, 34); g.stroke(); } [[4, 2], [8, 3]].forEach(() => { }); [[16, 8], [30, 6], [44, 8]].forEach(p => ell(g, p[0], p[1], 6, 5, '#e6c46a', OUT, 0.8)); ell(g, 22, 40, 11, 11, '#5a3a1a', OUT, 1.4); ell(g, 22, 40, 4, 4, '#c9a066', OUT, 0.8); for (let i = 0; i < 6; i++) { const a = i * PI / 3; limb(g, 22, 40, 22 + cos(a) * 10, 40 + sin(a) * 10, 1.2, '#3a2412', false); } limb(g, 4, 30, 14, 26, 3, '#5a3a20'); limb(g, 4, 36, 14, 30, 3, '#5a3a20'); };
    D.campfire = (g, t) => { [[6, 20, -0.4], [22, 20, 0.4], [14, 22, 0]].forEach(l => { g.save(); g.translate(l[0], l[1]); g.rotate(l[2]); rrect(g, -8, -2.4, 16, 5, 2, '#6a4326', OUT, 0.9); g.restore(); }); for (let i = 0; i < 6; i++) { const p = ((t * 1.4 + i / 6) % 1); ell(g, 14 + sin(t * 3 + i * 2) * 3 * p, 18 - p * 14, 2.6 * (1 - p) + 1, 3.6 * (1 - p) + 1, p < 0.4 ? '#ffd24a' : '#ff6a1a', null); } glow(g, 14, 16, 30, '#ff8a3a', 0.4 + sin(t * 8) * 0.05); };
    D.bones = (g) => { limb(g, 6, 14, 22, 8, 3, '#e8e2cf'); limb(g, 8, 8, 20, 16, 3, '#d6cfb8'); ell(g, 6, 14, 2.2, 2.2, '#e8e2cf', OUT, 0.6); ell(g, 22, 8, 2.2, 2.2, '#e8e2cf', OUT, 0.6); ell(g, 30, 12, 7, 6, '#efe9d6', OUT, 1); g.fillStyle = '#2a2018'; g.fillRect(27, 10, 2.6, 3); g.fillRect(31.4, 10, 2.6, 3); g.fillRect(29.6, 14, 1.6, 2); };
    D.crystal = (g, t) => { glow(g, 15, 30, 40 + sin(t * 2) * 4, '#6ec8ff', 0.4); ell(g, 15, 44, 12, 3, 'rgba(0,0,0,0.25)'); [[15, 42, 8, 34, '#6ec8ff'], [6, 42, 5, 20, '#9ad8ff'], [24, 42, 5, 24, '#3aa0e8']].forEach(c => { g.beginPath(); g.moveTo(c[0] - c[2], c[1]); g.lineTo(c[0] - c[2] * 0.6, c[1] - c[3] * 0.8); g.lineTo(c[0], c[1] - c[3]); g.lineTo(c[0] + c[2] * 0.6, c[1] - c[3] * 0.8); g.lineTo(c[0] + c[2], c[1]); g.closePath(); paint(g, lg(g, c[0] - c[2], 0, c[0] + c[2], 0, [[0, '#ffffff'], [0.4, c[4]], [1, shade(c[4], -0.4)]]), OUT, 1.1); }); ell(g, 13, 14, 1.6, 4, 'rgba(255,255,255,0.8)', null, 0, 0.3); };
    D.mushrooms = (g) => { [[8, 16, 6], [18, 14, 4.4], [13, 18, 3.4]].forEach((m, i) => { g.fillStyle = '#f0e6c8'; g.fillRect(m[0] - 1.2, m[1] - 2, 2.4, 5); g.beginPath(); g.ellipse(m[0], m[1] - 2, m[2], m[2] * 0.7, 0, PI, 0); g.closePath(); paint(g, i === 1 ? '#c66bff' : '#d8483a', OUT, 0.9); g.fillStyle = '#fff'; g.fillRect(m[0] - 2, m[1] - 4, 1.4, 1.4); g.fillRect(m[0] + 1, m[1] - 3, 1.2, 1.2); }); };
    D.lily = (g, t) => { for (let i = 0; i < 2; i++) { const x = 10 + i * 14, y = 12 + sin(t * 1.4 + i) * 0.8; g.beginPath(); g.ellipse(x, y, 9, 4.6, 0, 0.3, TAU - 0.3); g.lineTo(x, y); g.closePath(); paint(g, '#3f9a4a', OUT, 0.9); } for (let k = 0; k < 6; k++) { const a = k * TAU / 6; ell(g, 17 + cos(a) * 3, 9 + sin(a) * 1.6, 2, 1.4, '#ff9ac0', null); } ell(g, 17, 9, 1.4, 1, '#ffe36a', null); };

    function drawDecor(ctx, o, t) {
        const cat = CAT().DECOR; const d = cat[o.kind]; const fn = D[o.kind]; if (!d || !fn) { ctx.fillStyle = '#888'; ctx.fillRect(o.x, o.y, o.w || 20, o.h || 20); return; }
        const ow = o.w || d.w, oh = o.h || d.h; ctx.save(); ctx.translate(o.x, o.y); ctx.scale(ow / d.w, oh / d.h);
        try { fn(ctx, t, o); } catch (e) { console.error('[art] decor', o.kind, e); } ctx.restore();
    }
    /* hitbox por estilo/decoração (frações do tamanho) */
    function hitboxFor(o) {
        const c = CAT();
        if (o.type === 'house') { const d = c.BUILDINGS[o.style || 'cottage'] || c.BUILDINGS.cottage; const f = (d && d.foot) || [0, 0.65, 1, 1]; const w = o.w || d.w, h = o.h || d.h; return { x: o.x + w * f[0], y: o.y + h * f[1], w: w * (f[2] - f[0]), h: h * (f[3] - f[1]) }; }
        if (o.type === 'decor') { const d = c.DECOR[o.kind]; if (!d || !d.solid) return null; const f = d.foot || [0, 0, 1, 1]; const w = o.w || d.w, h = o.h || d.h; return { x: o.x + w * f[0], y: o.y + h * f[1], w: w * (f[2] - f[0]), h: h * (f[3] - f[1]) }; }
        return null;
    }

    /* ============================================================
       TERRENO (chão, caminhos, água)
       ============================================================ */
    const _pat = {}, _bg = {};
    function tileCanvas(size) { const c = document.createElement('canvas'); c.width = c.height = size; return c; }
    function patternOf(ctx, name, base) {
        const key = name + base; if (_pat[key]) return _pat[key];
        const S = 64, c = tileCanvas(S), g = c.getContext('2d');
        g.fillStyle = base; g.fillRect(0, 0, S, S);
        const rnd = (i) => hash(i * 12.9898 + name.length * 7.3 + base.length);
        if (name === 'dirt') { for (let i = 0; i < 90; i++) { g.fillStyle = rnd(i) > 0.5 ? 'rgba(255,220,170,0.10)' : 'rgba(0,0,0,0.12)'; g.beginPath(); g.ellipse(rnd(i + 200) * S, rnd(i + 400) * S, 1 + rnd(i + 9) * 3, 0.8 + rnd(i + 7) * 1.6, rnd(i) * 3, 0, TAU); g.fill(); } for (let i = 0; i < 9; i++) { g.fillStyle = 'rgba(150,120,90,0.65)'; g.beginPath(); g.ellipse(rnd(i + 900) * S, rnd(i + 950) * S, 1.6, 1.1, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(rnd(i + 900) * S - 1, rnd(i + 950) * S + 0.6, 3, 1); } }
        else if (name === 'stone') { const cw = 16; for (let r = 0; r < 4; r++) for (let cc = 0; cc < 4; cc++) { const x = cc * cw + (r % 2) * 8, y = r * cw; const v = rnd(r * 9 + cc) * 0.2 - 0.1; g.fillStyle = v > 0 ? 'rgba(255,255,255,' + v + ')' : 'rgba(0,0,0,' + (-v) + ')'; g.beginPath(); g.roundRect ? g.roundRect(x + 1, y + 1, cw - 2, cw - 2, 4) : g.rect(x + 1, y + 1, cw - 2, cw - 2); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.32)'; g.lineWidth = 1; g.stroke(); g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x + 2.5, y + 2.5, cw - 7, 1.4); } for (let i = 0; i < 4; i++) { g.strokeStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.moveTo(rnd(i) * S, rnd(i + 5) * S); g.lineTo(rnd(i) * S + 5, rnd(i + 5) * S + 3); g.stroke(); } }
        else if (name === 'water') { const gr = g.createLinearGradient(0, 0, S, S); gr.addColorStop(0, '#3b8fd0'); gr.addColorStop(1, '#2a72b0'); g.fillStyle = gr; g.fillRect(0, 0, S, S); for (let i = 0; i < 26; i++) { g.strokeStyle = rnd(i) > 0.5 ? 'rgba(255,255,255,0.13)' : 'rgba(0,30,80,0.14)'; g.lineWidth = 1.4; g.beginPath(); const x = rnd(i + 3) * S, y = rnd(i + 11) * S; g.moveTo(x, y); g.quadraticCurveTo(x + 5, y - 2, x + 10, y); g.stroke(); } }
        else if (name === 'grass') { for (let i = 0; i < 160; i++) { const x = rnd(i) * S, y = rnd(i + 3) * S, l = 3 + rnd(i + 5) * 5; g.strokeStyle = rnd(i + 8) > 0.5 ? 'rgba(160,255,140,0.22)' : 'rgba(0,50,10,0.24)'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd(i + 2) - 0.5) * 3, y - l); g.stroke(); } for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.beginPath(); g.arc(rnd(i + 70) * S, rnd(i + 80) * S, 3 + rnd(i) * 4, 0, TAU); g.fill(); } }
        return (_pat[key] = ctx.createPattern(c, 'repeat'));
    }
    const PAINT_KIND = { '#5c4033': 'dirt', '#7f8c8d': 'stone', '#27ae60': 'grass', '#3498db': 'water' };
    const PAINT_BASE = { dirt: '#7a5a3e', stone: '#8d9296', grass: '#2f8a3a', water: '#3489c8' };
    let _adj = { key: '', map: null };
    function paintAdjacency(cur) {   // marca lados expostos de cada tile de pintura (para bordas/costa)
        let sum = 0, n = 0; for (const o of cur) if (o && o.type === 'paint') { sum += o.x * 3 + o.y * 7 + (o.w || 0) + (o.h || 0); n++; }
        const key = n + ':' + sum; if (_adj.key === key && _adj.cur === cur) return; _adj = { key, cur };
        const cells = {}; const G = 20;
        for (const o of cur) { if (!o || o.type !== 'paint') continue; const k = PAINT_KIND[o.color] || 'x'; for (let x = Math.floor(o.x / G); x <= Math.floor((o.x + (o.w || 40) - 1) / G); x++) for (let y = Math.floor(o.y / G); y <= Math.floor((o.y + (o.h || 40) - 1) / G); y++) { (cells[x + ',' + y] = cells[x + ',' + y] || {})[k] = 1; } }
        const has = (px, py, k) => { const c = cells[Math.floor(px / G) + ',' + Math.floor(py / G)]; return !!(c && c[k]); };
        for (const o of cur) { if (!o || o.type !== 'paint') continue; const k = PAINT_KIND[o.color] || 'x', w = o.w || 40, h = o.h || 40; let m = 0; const step = 20;
            let top = 0, bot = 0, lef = 0, rig = 0;
            for (let x = o.x + 2; x < o.x + w; x += step) { if (!has(x, o.y - 3, k)) top++; if (!has(x, o.y + h + 3, k)) bot++; }
            for (let y = o.y + 2; y < o.y + h; y += step) { if (!has(o.x - 3, y, k)) lef++; if (!has(o.x + w + 3, y, k)) rig++; }
            o._edge = { t: top > 0, b: bot > 0, l: lef > 0, r: rig > 0 }; }
    }
    function drawPaint(ctx, o, t) {
        const ow = o.w || 40, oh = o.h || 40; const kind = PAINT_KIND[o.color]; const e = o._edge || {};
        if (!kind) { ctx.fillStyle = o.color || '#888'; ctx.fillRect(o.x, o.y, ow, oh); return; }
        ctx.fillStyle = patternOf(ctx, kind, PAINT_BASE[kind]); ctx.fillRect(o.x, o.y, ow, oh);
        const x = o.x, y = o.y;
        if (kind === 'water') {
            ctx.save(); ctx.beginPath(); ctx.rect(x, y, ow, oh); ctx.clip();
            for (let i = 0; i < Math.max(2, ow * oh / 700); i++) { const px = x + hash(i * 3 + x) * ow, py = y + hash(i * 5 + y) * oh, ph = t * 1.2 + i * 1.7; ctx.strokeStyle = 'rgba(255,255,255,' + (0.22 + 0.16 * sin(ph)) + ')'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(px - 6 + sin(ph) * 3, py); ctx.quadraticCurveTo(px, py - 2.4, px + 6 + sin(ph) * 3, py); ctx.stroke(); }
            const shore = (x0, y0, x1, y1, nx, ny) => { const g2 = ctx.createLinearGradient(x0, y0, x0 + nx * 12, y0 + ny * 12); g2.addColorStop(0, 'rgba(205,240,255,0.75)'); g2.addColorStop(1, 'rgba(205,240,255,0)'); ctx.fillStyle = g2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x1 + nx * (8 + sin(t * 2 + x0 * 0.1) * 3), y1 + ny * (8 + sin(t * 2 + x0 * 0.1) * 3)); ctx.lineTo(x0 + nx * (8 + sin(t * 2 + x1 * 0.1) * 3), y0 + ny * (8 + sin(t * 2 + x1 * 0.1) * 3)); ctx.closePath(); ctx.fill(); };
            if (e.t) shore(x, y, x + ow, y, 0, 1); if (e.b) shore(x, y + oh, x + ow, y + oh, 0, -1); if (e.l) shore(x, y, x, y + oh, 1, 0); if (e.r) shore(x + ow, y, x + ow, y + oh, -1, 0);
            ctx.restore();
            ctx.strokeStyle = 'rgba(30,60,30,0.45)'; ctx.lineWidth = 3; ctx.beginPath(); if (e.t) { ctx.moveTo(x, y); ctx.lineTo(x + ow, y); } if (e.b) { ctx.moveTo(x, y + oh); ctx.lineTo(x + ow, y + oh); } if (e.l) { ctx.moveTo(x, y); ctx.lineTo(x, y + oh); } if (e.r) { ctx.moveTo(x + ow, y); ctx.lineTo(x + ow, y + oh); } ctx.stroke();
        } else {
            const dark = kind === 'stone' ? 'rgba(0,0,0,0.35)' : 'rgba(30,15,5,0.30)';
            const edge = (x0, y0, x1, y1, nx, ny) => { const g2 = ctx.createLinearGradient(x0, y0, x0 + nx * 7, y0 + ny * 7); g2.addColorStop(0, dark); g2.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x1 + nx * 7, y1 + ny * 7); ctx.lineTo(x0 + nx * 7, y0 + ny * 7); ctx.closePath(); ctx.fill(); };
            ctx.save(); ctx.beginPath(); ctx.rect(x, y, ow, oh); ctx.clip();
            if (e.t) edge(x, y, x + ow, y, 0, 1); if (e.b) edge(x, y + oh, x + ow, y + oh, 0, -1); if (e.l) edge(x, y, x, y + oh, 1, 0); if (e.r) edge(x + ow, y, x + ow, y + oh, -1, 0);
            ctx.restore();
            // tufos de grama nas bordas expostas
            ctx.strokeStyle = 'rgba(70,150,60,0.9)'; ctx.lineWidth = 1.3;
            const tuft = (px, py) => { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 1.6, py - 4); ctx.moveTo(px, py); ctx.lineTo(px + 0.4, py - 5); ctx.moveTo(px, py); ctx.lineTo(px + 2, py - 3.4); ctx.stroke(); };
            if (kind !== 'grass') { if (e.t) for (let px = x + 3; px < x + ow; px += 9) if (hash(px * 1.3 + y) > 0.45) tuft(px + hash(px) * 3, y + 1); if (e.b) for (let px = x + 3; px < x + ow; px += 9) if (hash(px * 1.7 + y) > 0.55) tuft(px + hash(px) * 3, y + oh + 3); }
        }
    }
    /* fundo do mapa em cache */
    function drawGround(ctx, m, t, vw) {
        const W = m.width || 800, H = m.height || 600, key = (m.id || '') + '|' + m.color + '|' + W + '|' + H; let c = _bg[key];
        if (!c) {
            Object.keys(_bg).forEach(k => { if (k.split('|')[0] !== (m.id || '')) delete _bg[k]; });   // guarda só o mapa atual (mapas grandes gastam memória)
            c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); const base = m.color || '#4a6b2d';
            const dark = /^#([0-4])/.test(base) && false;
            g.fillStyle = base; g.fillRect(0, 0, W, H); g.fillStyle = patternOf(g, 'grass', base); g.fillRect(0, 0, W, H);
            // manchas suaves de luz/sombra
            for (let i = 0; i < Math.ceil(W * H / 26000); i++) { const x = hash(i * 1.7 + W) * W, y = hash(i * 2.9 + H) * H, r = 60 + hash(i * 5.3) * 110; g.fillStyle = rg(g, x, y, 0, r, [[0, hash(i) > 0.5 ? 'rgba(255,255,200,0.07)' : 'rgba(0,20,0,0.09)'], [1, 'rgba(0,0,0,0)']]); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
            // detalhes: flores, pedrinhas, folhas
            const isRocky = /^#[5-9a-f][0-9a-f][3-7]/i.test(base) && false;
            for (let i = 0; i < Math.ceil(W * H / 2600); i++) { const x = hash(i * 3.1) * W, y = hash(i * 4.7 + 1) * H, k = hash(i * 9.9); if (k < 0.4) { g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 1, y - 5); g.moveTo(x, y); g.lineTo(x - 2, y - 4); g.moveTo(x, y); g.lineTo(x + 3, y - 3.4); g.stroke(); } else if (k < 0.62) { const cols = ['#fff4c2', '#ffb0c8', '#d8b0ff', '#ffe27a']; g.fillStyle = cols[Math.floor(hash(i) * 4)]; g.beginPath(); g.arc(x, y, 1.5, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,200,0,0.9)'; g.fillRect(x - 0.4, y - 0.4, 0.8, 0.8); } else if (k < 0.8) { g.fillStyle = 'rgba(0,0,0,0.16)'; g.beginPath(); g.ellipse(x, y + 1, 3.4, 1.7, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(180,180,180,0.7)'; g.beginPath(); g.ellipse(x, y, 3, 1.8, 0, 0, TAU); g.fill(); } }
            // borda escura suave
            const b = 26; [[0, 0, W, b, 0, 1], [0, H - b, W, b, 0, -1], [0, 0, b, H, 1, 0], [W - b, 0, b, H, -1, 0]].forEach(s => { const gr = g.createLinearGradient(s[0] + (s[4] < 0 ? s[2] : 0), s[1] + (s[5] < 0 ? s[3] : 0), s[0] + (s[4] < 0 ? s[2] : 0) + s[4] * b, s[1] + (s[5] < 0 ? s[3] : 0) + s[5] * b); gr.addColorStop(0, 'rgba(0,0,0,0.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(s[0], s[1], s[2], s[3]); });
            _bg[key] = c; const keys = Object.keys(_bg); if (keys.length > 8) delete _bg[keys[0]];
        }
        if (vw) { const sx = Math.max(0, Math.floor(vw.x)), sy = Math.max(0, Math.floor(vw.y)), sw = Math.min(W - sx, Math.ceil(vw.w) + 2), sh = Math.min(H - sy, Math.ceil(vw.h) + 2); if (sw > 0 && sh > 0) ctx.drawImage(c, sx, sy, sw, sh, sx, sy, sw, sh); }
        else ctx.drawImage(c, 0, 0);
    }

    /* ============================================================
       ÁRVORES, PEDRAS, ITENS E ESTAÇÕES
       ============================================================ */
    /* copa orgânica: contorno irregular (sem "bolas"); vários lóbulos são unidos e recebem UM único contorno */
    function lump(ctx, cx, cy, rx, ry, seed, n) {
        const pts = []; for (let i = 0; i < n; i++) { const a = i / n * TAU, r = 0.84 + 0.26 * hash(seed + i * 7.31); pts.push([cx + cos(a) * rx * r, cy + sin(a) * ry * r]); }
        const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; const s0 = mid(pts[n - 1], pts[0]); ctx.moveTo(s0[0], s0[1]);
        for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n], m = mid(p, q); ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]); }
        ctx.closePath();
    }
    function foliage(ctx, o, lobes, sw, pal, seed, tx) {
        ctx.save(); ctx.translate(sw, 0);
        const union = () => { ctx.beginPath(); lobes.forEach((b, i) => lump(ctx, b[0], b[1], b[2], b[3], seed + i * 13.7, 13)); };
        union(); ctx.strokeStyle = OUT; ctx.lineWidth = 3.4; ctx.lineJoin = 'round'; ctx.stroke();
        union(); ctx.fillStyle = lg(ctx, 0, -72, 0, -22, [[0, pal[0]], [0.5, pal[1]], [1, pal[2]]]); ctx.fill();
        ctx.save(); union(); ctx.clip();
        // luz (cima-esquerda) e sombra (baixo-direita) em manchas irregulares
        lobes.forEach((b, i) => { ctx.fillStyle = pal[3]; ctx.beginPath(); lump(ctx, b[0] - b[2] * 0.28, b[1] - b[3] * 0.34, b[2] * 0.55, b[3] * 0.42, seed + 40 + i * 5.1, 9); ctx.fill();
            ctx.fillStyle = pal[4]; ctx.beginPath(); lump(ctx, b[0] + b[2] * 0.3, b[1] + b[3] * 0.5, b[2] * 0.62, b[3] * 0.4, seed + 70 + i * 3.7, 9); ctx.fill(); });
        // folhas: pequenos "v" claros e escuros
        for (let k = 0; k < 40; k++) { const b = lobes[k % lobes.length], a = hash(seed + k * 2.9) * TAU, r = Math.sqrt(hash(seed + k * 5.3)) * 0.92, x = b[0] + cos(a) * b[2] * r, y = b[1] + sin(a) * b[3] * r; ctx.strokeStyle = (k % 3 ? pal[5] : pal[4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 2.2, y - 1.4); ctx.lineTo(x, y + 1); ctx.lineTo(x + 2.2, y - 1.6); ctx.stroke(); }
        ctx.restore();
        ctx.restore();
    }
    function drawTree(ctx, o, t) {
        const ow = o.w || 40, oh = o.h || 50, cx = o.x + ow / 2, by = o.y + oh, v = Math.floor(hash((o.id || 1) * 1.37) * 3), sw = sin(t * 1.1 + cx * 0.04) * 1.6, s = ow / 40;
        ctx.fillStyle = 'rgba(0,0,0,0.26)'; ctx.beginPath(); ctx.ellipse(cx + 6 * s, by - 1, 18 * s, 5 * s, 0, 0, TAU); ctx.fill();
        ctx.save(); ctx.translate(cx, by); ctx.scale(s, oh / 50);
        const trunk = (w, col) => { ctx.beginPath(); ctx.moveTo(-w, 0); ctx.quadraticCurveTo(-w + 1, -12, -w * 0.7, -26); ctx.lineTo(w * 0.7, -26); ctx.quadraticCurveTo(w - 1, -12, w, 0); ctx.quadraticCurveTo(0, 3, -w, 0); ctx.closePath(); paint(ctx, lg(ctx, -w, 0, w, 0, [[0, shade(col, 0.15)], [1, shade(col, -0.35)]]), OUT, 1.2); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.8; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-w * 0.5 + i * w * 0.35, -2); ctx.lineTo(-w * 0.4 + i * w * 0.3, -20); ctx.stroke(); } };
        if (v === 1) {   // pinheiro
            trunk(4.6, '#6a4326');
            const tiers = [[-10, 22, 24], [-22, 19, 22], [-34, 16, 20], [-46, 12, 18], [-57, 8, 16]];   // [base y, meia largura, altura]: do maior (embaixo) ao menor (topo)
            tiers.forEach((r, i) => {
                const sx = sin(t * 1.2 + i) * 0.5 + sw * (0.15 + i * 0.12), by0 = r[0], hw = r[1], hh = r[2];
                ctx.beginPath(); ctx.moveTo(-hw, by0); ctx.lineTo(sx, by0 - hh); ctx.lineTo(hw, by0);
                for (let k = 4; k >= 0; k--) { const x = -hw + (2 * hw) * (k / 4) * 1; const px = hw - (2 * hw) * ((4 - k) / 4); ctx.quadraticCurveTo(px + hw / 8, by0 + 4, px - hw / 4, by0 + (k % 2 ? 1 : 3.4)); }
                ctx.closePath(); paint(ctx, lg(ctx, -hw, by0 - hh, hw, by0, [[0, '#4fb56a'], [0.5, '#2a8a4a'], [1, '#155f33']]), OUT, 1.3);
                ctx.fillStyle = 'rgba(210,255,200,0.16)'; ctx.beginPath(); ctx.moveTo(sx, by0 - hh + 1); ctx.lineTo(-hw * 0.5, by0 - 3); ctx.lineTo(-hw * 0.1, by0 - 2); ctx.closePath(); ctx.fill();
                ctx.fillStyle = 'rgba(0,30,10,0.22)'; ctx.beginPath(); ctx.moveTo(sx, by0 - hh + 1); ctx.lineTo(hw * 0.95, by0 - 1); ctx.lineTo(hw * 0.35, by0 - 2); ctx.closePath(); ctx.fill();
            });
        } else if (v === 2) {   // bétula
            ctx.beginPath(); ctx.moveTo(-3.6, 0); ctx.lineTo(-2.8, -30); ctx.lineTo(2.8, -30); ctx.lineTo(3.6, 0); ctx.closePath(); paint(ctx, lg(ctx, -3.6, 0, 3.6, 0, [[0, '#f4f1e8'], [1, '#bfb8a6']]), OUT, 1.1); ctx.fillStyle = '#2a2a2a'; [[-1, -8], [0.6, -16], [-1.4, -23]].forEach(p => ctx.fillRect(p[0], p[1], 2.6, 1.2));
            foliage(ctx, o, [[-11, -38, 15, 12], [11, -40, 14, 12], [0, -50, 17, 13], [0, -34, 16, 10]], sw * (0.5), ['#d5f07a', '#9ccc3c', '#5f9a26', 'rgba(240,255,150,0.42)', 'rgba(20,70,10,0.32)', 'rgba(240,255,170,0.7)'], (o.id || 1) * 1.7, 0);
        } else {   // carvalho
            trunk(6, '#6f4526'); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-11, 2); ctx.lineTo(-4, -3); ctx.fill(); ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(11, 2); ctx.lineTo(4, -3); ctx.fill();
            ctx.strokeStyle = OUT; ctx.lineWidth = 6.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(-9, -34); ctx.moveTo(0, -22); ctx.lineTo(10, -36); ctx.stroke();
            ctx.strokeStyle = '#6f4526'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(-9, -34); ctx.moveTo(0, -22); ctx.lineTo(10, -36); ctx.stroke();
            foliage(ctx, o, [[0, -45, 26, 19], [-17, -37, 17, 13], [17, -38, 17, 13], [-6, -57, 17, 12], [9, -56, 15, 11]], sw * 0.6, ['#7ddb6a', '#3fa544', '#1c6a2d', 'rgba(200,255,150,0.34)', 'rgba(0,45,15,0.36)', 'rgba(210,255,160,0.55)'], (o.id || 1) * 2.3, 0);
            if (hash((o.id || 1) * 9.1) > 0.7) { [[-8, -38], [6, -46], [14, -34]].forEach(p => ell(ctx, p[0] + sw, p[1], 2.2, 2.2, '#e0384a', OUT, 0.6)); }
        }
        ctx.restore();
    }
    function drawStump(ctx, o) { const ow = o.w || 40, oh = o.h || 50, cx = o.x + ow / 2, by = o.y + oh; ctx.save(); ctx.translate(cx, by); ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(0, 0, 11, 3.4, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(-8, 0); ctx.quadraticCurveTo(-8, -7, -6, -9); ctx.lineTo(6, -9); ctx.quadraticCurveTo(8, -7, 8, 0); ctx.closePath(); paint(ctx, lg(ctx, -8, 0, 8, 0, [[0, '#8a5a30'], [1, '#4a2f18']]), OUT, 1); ell(ctx, 0, -9, 6, 2.6, '#c9a066', OUT, 0.9); ell(ctx, 0, -9, 3, 1.2, null, '#a07a44', 0.7); ctx.restore(); }
    const ORE = { rock_copper: ['#d9822b', '#ffb460'], rock_tin: ['#b8c8d8', '#f0f8ff'], rock_iron: ['#a0522d', '#d98a5a'], rock_coal: ['#26262e', '#5a5a68'], rock_mithril: ['#3f78d0', '#a9d0ff'] };
    function drawRock(ctx, o, t) {
        const ow = o.w || 30, oh = o.h || 30, cx = o.x + ow / 2, by = o.y + oh, s = ow / 30, ore = ORE[o.type] || ['#c8c8c8', '#fff'];
        ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(cx + 3, by - 1, 15 * s, 4.4 * s, 0, 0, TAU); ctx.fill();
        ctx.save(); ctx.translate(cx, by); ctx.scale(s, oh / 30);
        const depleted = o.active === false;
        ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-15, -9); ctx.lineTo(-9, -21); ctx.lineTo(0, -26); ctx.lineTo(10, -22); ctx.lineTo(15, -11); ctx.lineTo(14, 0); ctx.closePath();
        paint(ctx, lg(ctx, -15, -26, 15, 0, [[0, depleted ? '#7a7a7e' : '#a0a3a8'], [1, depleted ? '#3e3e42' : '#4a4d54']]), OUT, 1.5);
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.moveTo(-9, -21); ctx.lineTo(0, -26); ctx.lineTo(-2, -14); ctx.lineTo(-12, -10); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(10, -22); ctx.lineTo(15, -11); ctx.lineTo(4, -12); ctx.closePath(); ctx.fill();
        if (!depleted) { [[-6, -14, 4.6], [5, -9, 5.4], [1, -20, 3.6], [-9, -5, 3.4]].forEach((p, i) => { ell(ctx, p[0], p[1], p[2], p[2] * 0.8, rg(ctx, p[0] - 1, p[1] - 1, 0.5, p[2], [[0, ore[1]], [1, ore[0]]]), OUT, 0.8); const tw = (sin(t * 3 + i * 2 + o.x) + 1) / 2; if (tw > 0.85) { ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(p[0] - 0.6, p[1] - 3, 1.2, 6); ctx.fillRect(p[0] - 3, p[1] - 0.6, 6, 1.2); } }); }
        ctx.restore();
    }
    function drawGroundItem(ctx, o, t, icon) {
        const ow = o.w || 20, oh = o.h || 20, cx = o.x + ow / 2, cy = o.y + oh / 2 + sin(t * 3 + o.x) * 1.6;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(cx, o.y + oh / 2 + 8, 7, 2.4, 0, 0, TAU); ctx.fill();
        glow(ctx, cx, cy, 15, '#ffe27a', 0.35 + 0.15 * sin(t * 4 + o.y));
        if (window.Icons && o.item) { try { ctx.drawImage(Icons.canvas(o.item), cx - 13, cy - 14, 26, 26); } catch (e) { } } else { ctx.font = '16px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(icon, cx, cy); ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic'; }
    }
    function drawStation(ctx, o, t) {   // fornalha, bigorna, banco, fogueira, pesca, portal
        const ow = o.w || 30, oh = o.h || 30, x = o.x, y = o.y;
        if (o.type === 'furnace') {
            const bw = max(ow, 34), bx = x + ow / 2 - bw / 2; ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(x + ow / 2, y + oh, bw * 0.55, 5, 0, 0, TAU); ctx.fill();
            bricks(ctx, bx, y + oh * 0.2, bw, oh * 0.8, '#7b7e85', 9, 6); ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.strokeRect(bx, y + oh * 0.2, bw, oh * 0.8);
            const mx = x + ow / 2, my = y + oh * 0.68; ctx.fillStyle = '#0a0706'; ctx.beginPath(); ctx.moveTo(mx - 9, y + oh); ctx.lineTo(mx - 9, my - 2); ctx.arc(mx, my - 2, 9, PI, 0); ctx.lineTo(mx + 9, y + oh); ctx.closePath(); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; ctx.stroke();
            glow(ctx, mx, my + 4, 26, '#ff7a2a', 0.7 + sin(t * 9) * 0.1);
            for (let i = 0; i < 4; i++) { const p = (t * 1.6 + i / 4) % 1; ell(ctx, mx + sin(t * 5 + i * 2) * 4, y + oh - 2 - p * 14, 3.4 * (1 - p) + 0.6, 5 * (1 - p) + 1, p < 0.5 ? '#ffd24a' : '#ff5a1a', null); }
            bricks(ctx, x + ow / 2 - 5, y - 8, 10, 14, '#6a4a3a', 6, 5); smoke(ctx, x + ow / 2, y - 8, t, hash(o.x));
        } else if (o.type === 'anvil') {
            ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(x + ow / 2, y + oh, 15, 4, 0, 0, TAU); ctx.fill();
            rrect(ctx, x + ow / 2 - 7, y + oh * 0.55, 14, oh * 0.45, 2, lg(ctx, 0, y, 0, y + oh, [[0, '#6a6d74'], [1, '#2e3036']]), OUT, 1.2);
            ctx.beginPath(); ctx.moveTo(x + 2, y + oh * 0.2); ctx.lineTo(x + ow - 2, y + oh * 0.2); ctx.lineTo(x + ow + 3, y + oh * 0.35); ctx.lineTo(x + ow - 4, y + oh * 0.55); ctx.lineTo(x + 6, y + oh * 0.55); ctx.lineTo(x - 4, y + oh * 0.36); ctx.closePath(); paint(ctx, lg(ctx, 0, y + oh * 0.2, 0, y + oh * 0.55, [[0, '#dfe3e8'], [0.4, '#8a9098'], [1, '#3a3d44']]), OUT, 1.3);
            const sp = sin(t * 4 + o.x); if (sp > 0.6) { ctx.fillStyle = '#ffd24a'; ctx.fillRect(x + ow * 0.4, y + 2 - (sp - 0.6) * 8, 1.6, 1.6); ctx.fillRect(x + ow * 0.6, y + 4 - (sp - 0.6) * 6, 1.4, 1.4); }
        } else if (o.type === 'bank') {
            ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(x + ow / 2, y + oh, ow * 0.55, 5, 0, 0, TAU); ctx.fill();
            rrect(ctx, x, y + 4, ow, oh - 4, 3, lg(ctx, 0, y, 0, y + oh, [[0, '#8a5a30'], [1, '#4a2f18']]), OUT, 1.4); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x + i * ow / 6, y + 6); ctx.lineTo(x + i * ow / 6, y + oh - 2); ctx.stroke(); }
            rrect(ctx, x - 3, y, ow + 6, 8, 2, lg(ctx, 0, y, 0, y + 8, [[0, '#e8c04a'], [1, '#a8842a']]), OUT, 1.2);
            [[0.25, 0], [0.5, -3], [0.72, 0]].forEach((c, i) => { ell(ctx, x + ow * c[0], y + 1 + c[1], 4, 2.2, '#f6d24a', OUT, 0.7); ell(ctx, x + ow * c[0], y - 1 + c[1], 4, 2.2, '#ffe27a', OUT, 0.7); });
            ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center'; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3; ctx.strokeText('BANCO', x + ow / 2, y - 6); ctx.fillStyle = '#f6d24a'; ctx.fillText('BANCO', x + ow / 2, y - 6); ctx.textAlign = 'start';
        } else if (o.type === 'fire') {
            glow(ctx, x + ow / 2, y + oh * 0.6, 40, '#ff8a3a', 0.5 + sin(t * 9) * 0.08);
            [[-0.35, 0], [0.35, 0], [0, 0.04]].forEach(l => { ctx.save(); ctx.translate(x + ow / 2, y + oh - 4); ctx.rotate(l[0]); rrect(ctx, -10, -2, 20, 5, 2, '#6a4326', OUT, 0.9); ctx.restore(); });
            for (let i = 0; i < 9; i++) { const p = (t * 1.5 + i / 9) % 1, fx = x + ow / 2 + sin(t * 6 + i * 1.9) * 5 * (1 - p), fy = y + oh - 6 - p * (oh - 4); ell(ctx, fx, fy, (5 - p * 3.6) * (ow / 30), (7 - p * 5) * (oh / 30), p < 0.3 ? 'rgba(255,240,150,0.95)' : p < 0.65 ? 'rgba(255,150,40,0.85)' : 'rgba(220,60,20,0.55)', null); }
            for (let i = 0; i < 4; i++) { const p = (t * 0.8 + i / 4) % 1; ctx.fillStyle = 'rgba(255,200,80,' + (1 - p) + ')'; ctx.fillRect(x + ow / 2 + sin(t * 3 + i * 4) * 10, y + oh - p * 40, 1.5, 1.5); }
        } else if (o.type === 'fishing_spot') {
            const cx = x + ow / 2, cy = y + oh / 2;
            for (let i = 0; i < 3; i++) { const p = (t * 0.55 + i / 3) % 1; ctx.strokeStyle = 'rgba(255,255,255,' + (0.7 * (1 - p)) + ')'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(cx, cy, ow * 0.15 + p * ow * 0.42, oh * 0.08 + p * oh * 0.2, 0, 0, TAU); ctx.stroke(); }
            ctx.fillStyle = 'rgba(30,90,160,0.28)'; ctx.beginPath(); ctx.ellipse(cx, cy, ow * 0.5, oh * 0.32, 0, 0, TAU); ctx.fill();
            const jp = (t * 0.4 + hash(o.x) * 3) % 1; if (jp < 0.22) { const q = jp / 0.22; ctx.save(); ctx.translate(cx + sin(o.x) * 6, cy - sin(q * PI) * 14); ctx.rotate(-1 + q * 2); ell(ctx, 0, 0, 5, 2.4, '#dfe8f0', OUT, 0.7); tri(ctx, -4, 0, -8, -2.4, -8, 2.4, '#9ab', null); ell(ctx, 1.6, -0.6, 0.7, 0.7, '#111'); ctx.restore(); }
            for (let b = 0; b < 4; b++) { const p = (t * 0.7 + b * 0.27) % 1; ctx.strokeStyle = 'rgba(255,255,255,' + (0.8 * (1 - p)) + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx + sin(b * 2.3) * ow * 0.25, cy - p * 10, 1.4 + p, 0, TAU); ctx.stroke(); }
        } else if (o.type === 'portal') {
            const cx = x + ow / 2, cy = y + oh / 2; glow(ctx, cx, cy, ow * 0.9, '#a35cff', 0.55);
            ctx.save(); ctx.translate(cx, cy); for (let r = 0; r < 3; r++) { ctx.save(); ctx.rotate(t * (r % 2 ? -1 : 1) * (0.9 + r * 0.4)); ctx.strokeStyle = ['#e8c8ff', '#b86bff', '#6a2fd0'][r]; ctx.lineWidth = 3 - r * 0.6; ctx.setLineDash([9 - r * 2, 5]); ctx.beginPath(); ctx.ellipse(0, 0, ow * (0.46 - r * 0.09), oh * (0.46 - r * 0.09), 0, 0, TAU); ctx.stroke(); ctx.restore(); } ctx.setLineDash([]);
            const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, ow * 0.34); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.5, 'rgba(190,120,255,0.75)'); gr.addColorStop(1, 'rgba(60,20,120,0.2)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(0, 0, ow * 0.34, oh * 0.34, 0, 0, TAU); ctx.fill();
            for (let i = 0; i < 8; i++) { const a = t * 1.5 + i * PI / 4, rr = ow * 0.5 * ((t * 0.5 + i / 8) % 1); ctx.fillStyle = 'rgba(230,200,255,0.9)'; ctx.fillRect(cos(a) * rr - 1, sin(a) * rr - 1, 2, 2); } ctx.restore();
            ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center'; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3; ctx.strokeText('Portal', cx, y - 6); ctx.fillStyle = '#efdcff'; ctx.fillText('Portal', cx, y - 6); ctx.textAlign = 'start';
        }
    }

    /* ============================================================
       EFEITOS E AMBIENTE
       ============================================================ */
    const FX = [];
    function burst(x, y, col, n, spd) { for (let i = 0; i < (n || 10); i++) { const a = Math.random() * TAU, s = (0.6 + Math.random() * 1.6) * (spd || 1); FX.push({ x, y, vx: cos(a) * s, vy: sin(a) * s - 0.8, life: 30 + Math.random() * 20, max: 50, col: col || '#fff', r: 1.5 + Math.random() * 2.2, g: 0.05 }); } if (FX.length > 400) FX.splice(0, FX.length - 400); }
    function poof(x, y) { for (let i = 0; i < 12; i++) { const a = Math.random() * TAU; FX.push({ x, y, vx: cos(a) * 1.2, vy: sin(a) * 0.7 - 0.3, life: 30, max: 30, col: 'rgba(230,230,235,', r: 4 + Math.random() * 5, g: -0.01, soft: true }); } burst(x, y, '#ffd24a', 8, 1.2); }
    function fxStep() { for (let i = FX.length - 1; i >= 0; i--) { const p = FX[i]; p.x += p.vx; p.y += p.vy; p.vy += p.g; p.life--; if (p.life <= 0) FX.splice(i, 1); } }
    function fxDraw(ctx) { for (const p of FX) { const a = max(0, p.life / p.max); if (p.soft) { ctx.fillStyle = p.col + (0.5 * a) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (2 - a), 0, TAU); ctx.fill(); } else { ctx.globalAlpha = a; ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * a + 0.5, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; } } }

    let _vig = null, _vigKey = '', _motes = [];
    function drawAmbient(ctx, W, H, m, t) {
        const key = W + 'x' + H; if (!_vig || _vigKey !== key) { _vig = ctx.createRadialGradient(W / 2, H / 2, min(W, H) * 0.35, W / 2, H / 2, max(W, H) * 0.75); _vig.addColorStop(0, 'rgba(0,0,0,0)'); _vig.addColorStop(1, 'rgba(0,0,10,0.42)'); _vigKey = key; }
        ctx.fillStyle = _vig; ctx.fillRect(0, 0, W, H);
        const name = ((m && (m.name || m.id)) || '').toLowerCase(); const dark = /covil|caverna|cave|dragon|dragão/.test(name), forest = /floresta|forest|bosque/.test(name);
        if (_motes.length < 26) for (let i = _motes.length; i < 26; i++) _motes.push({ x: Math.random(), y: Math.random(), s: 0.3 + Math.random(), p: Math.random() * 6 });
        for (const q of _motes) { q.y -= (dark ? 0.0016 : forest ? 0.0004 : -0.0004) * q.s; q.x += sin(t * 0.6 + q.p) * 0.0006; if (q.y < -0.02) q.y = 1.02; if (q.y > 1.02) q.y = -0.02; const x = q.x * W, y = q.y * H;
            if (dark) { ctx.fillStyle = 'rgba(255,' + (90 + q.s * 60) + ',40,' + (0.5 * (0.5 + 0.5 * sin(t * 3 + q.p))) + ')'; ctx.fillRect(x, y, 2, 2); }
            else if (forest) { const a = 0.3 + 0.7 * max(0, sin(t * 1.6 + q.p * 3)); glow(ctx, x, y, 7, '#d8ff7a', 0.6 * a); ctx.fillStyle = 'rgba(255,255,200,' + a + ')'; ctx.fillRect(x - 1, y - 1, 2, 2); }
            else { ctx.fillStyle = 'rgba(255,255,230,0.35)'; ctx.fillRect(x, y, 1.6, 1.6); } }
        if (dark) { ctx.fillStyle = 'rgba(40,0,60,0.14)'; ctx.fillRect(0, 0, W, H); }
    }
    function tickAll() { fxStep(); }

    Object.assign(A, { drawBuilding, drawDecor, hitboxFor, drawGround, drawPaint, paintAdjacency, drawTree, drawStump, drawRock, drawGroundItem, drawStation, burst, poof, fxDraw, tickAll, drawAmbient, B, D });
})(typeof window !== 'undefined' ? window : globalThis);
