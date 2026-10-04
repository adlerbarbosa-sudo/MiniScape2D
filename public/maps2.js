/* MiniScape 2D — Mapas 2: o Reino Isolado.
   26 mapas novos (cidades, estradas, regiões selvagens e masmorras) ligados por portais.
   Só o admin cria os mapas (no login, dentro de World2.placeInWorld); o mundo é salvo no servidor e os outros jogadores o recebem.
   Tudo idempotente: um mapa só é criado se ainda não existir, e cada portal novo em mapa antigo tem uma marca em m.c6.
   Este arquivo também define alguns objetos de cenário novos (boulder, cactus, palm, boat...) e criaturas novas (mesmas espécies já desenhadas). */
(function () {
    'use strict';

    /* ============================ CENÁRIO NOVO (catálogo + desenho) ============================ */
    const OUT = 'rgba(18,10,8,0.85)';
    const NEWDECOR = {
        boulder:     { name: 'Rochedo', w: 48, h: 38, solid: true, foot: [0.06, 0.5, 0.94, 1] },
        cactus:      { name: 'Cacto', w: 26, h: 50, solid: true, foot: [0.2, 0.72, 0.8, 1] },
        palm:        { name: 'Palmeira', w: 56, h: 78, solid: true, foot: [0.38, 0.82, 0.62, 1] },
        boat:        { name: 'Barco', w: 110, h: 54, solid: true, foot: [0.04, 0.45, 0.96, 0.95] },
        deadtree:    { name: 'Árvore Seca', w: 44, h: 64, solid: true, foot: [0.34, 0.82, 0.66, 1] },
        pillar:      { name: 'Coluna Antiga', w: 30, h: 62, solid: true, foot: [0.1, 0.68, 0.9, 1] },
        sarcophagus: { name: 'Sarcófago', w: 56, h: 34, solid: true, foot: [0.04, 0.35, 0.96, 1] },
        lava:        { name: 'Poça de Lava', w: 70, h: 44, solid: true, foot: [0.06, 0.15, 0.94, 0.95] },
        reeds:       { name: 'Juncos', w: 30, h: 34, solid: false },
        icespire:    { name: 'Espinho de Gelo', w: 30, h: 56, solid: true, foot: [0.14, 0.72, 0.86, 1] },
        netrack:     { name: 'Rede Secando', w: 60, h: 46, solid: true, foot: [0.04, 0.55, 0.96, 1] }
    };
    const hs = (o, k) => { const n = (o && typeof o.id === 'number' ? o.id : 1); const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
    function shadow(g, w, h, k) { g.fillStyle = 'rgba(0,0,0,0.26)'; g.beginPath(); g.ellipse(w / 2, h - 1.5, w * (k || 0.42), Math.max(2.5, h * 0.06), 0, 0, 6.3); g.fill(); }
    function poly(g, pts, fill, stroke, lw) {
        g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath();
        if (fill) { g.fillStyle = fill; g.fill(); } if (stroke !== null) { g.strokeStyle = stroke || OUT; g.lineWidth = lw || 1.5; g.lineJoin = 'round'; g.stroke(); }
    }
    function lin(g, x0, y0, x1, y1, a, b) { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, a); gr.addColorStop(1, b); return gr; }
    const TONES = {
        grey: ['#c4c7cc', '#8d9199', '#5d6068'], sand: ['#e3cc96', '#b89a5e', '#7e6838'], snow: ['#eef4fa', '#b4c6d6', '#7a8ea2'], dark: ['#8a8a98', '#575662', '#34333d'], ash: ['#7a6a66', '#4a3c3a', '#2a2020'], moss: ['#b7c9a5', '#7f9470', '#4c5e44']
    };
    const DRAW = {
        boulder(g, t, o) {
            const W = 48, H = 38, r = hs(o, 1), c = TONES[o.tone] || TONES.grey; shadow(g, W, H, 0.48);
            const j = (k) => (hs(o, k) - 0.5) * 4;
            poly(g, [[3, H - 3], [1, H - 14 + j(2)], [7, H - 25 + j(3)], [17, H - 33 + j(4)], [30, H - 34 + j(5)], [41, H - 27 + j(6)], [47, H - 15 + j(7)], [44, H - 3]], lin(g, 6, 4, 42, H, c[0], c[2]), OUT, 1.7);
            poly(g, [[7, H - 24], [17, H - 32], [30, H - 33], [25, H - 20], [11, H - 14]], 'rgba(255,255,255,0.22)', null);
            poly(g, [[30, H - 33], [41, H - 26], [46, H - 15], [43, H - 4], [32, H - 6], [34, H - 20]], 'rgba(0,0,0,0.2)', null);
            g.strokeStyle = 'rgba(20,14,10,0.45)'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(22, H - 30); g.lineTo(19, H - 20); g.lineTo(23, H - 12); g.moveTo(34, H - 22); g.lineTo(31, H - 14); g.stroke();
            if (o.tone === 'snow' || o.tone === 'moss' || r > 0.6) { g.fillStyle = o.tone === 'snow' ? 'rgba(250,253,255,0.95)' : 'rgba(86,140,70,0.85)'; g.beginPath(); g.ellipse(18, H - 31, 11, 4.4, -0.15, 0, 6.3); g.ellipse(32, H - 30, 7, 3.2, 0.2, 0, 6.3); g.fill(); }
        },
        cactus(g, t, o) {
            const W = 26, H = 50; shadow(g, W, H, 0.45);
            const arm = (x, y, dir) => { g.lineCap = 'round'; g.strokeStyle = OUT; g.lineWidth = 9; g.beginPath(); g.moveTo(13 + dir * 2, y + 6); g.lineTo(x, y + 6); g.lineTo(x, y - 7); g.stroke(); g.strokeStyle = '#3f9a4a'; g.lineWidth = 6.2; g.stroke(); };
            arm(4, 22, -1); if (hs(o, 3) > 0.35) arm(22, 16, 1);
            g.lineCap = 'round'; g.strokeStyle = OUT; g.lineWidth = 12; g.beginPath(); g.moveTo(13, H - 3); g.lineTo(13, 8); g.stroke(); g.strokeStyle = lin(g, 6, 0, 20, 0, '#58b860', '#2f7a3a'); g.lineWidth = 9; g.stroke();
            g.strokeStyle = 'rgba(0,50,10,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(11, 10); g.lineTo(11, H - 6); g.moveTo(15.5, 10); g.lineTo(15.5, H - 6); g.stroke();
            g.fillStyle = '#f2a0b8'; g.beginPath(); g.arc(13, 6, 2.6, 0, 6.3); g.fill();
        },
        palm(g, t, o) {
            const W = 56, H = 78; shadow(g, W, H, 0.3); const sw = Math.sin(t * 1.3 + (o.x || 0) * 0.03) * 1.6;
            g.lineCap = 'round'; g.strokeStyle = OUT; g.lineWidth = 9; g.beginPath(); g.moveTo(26, H - 3); g.quadraticCurveTo(32, H - 34, 29 + sw * 0.4, 22); g.stroke();
            g.strokeStyle = '#9a6a3a'; g.lineWidth = 6; g.stroke(); g.strokeStyle = 'rgba(60,30,10,0.4)'; g.lineWidth = 1; for (let i = 0; i < 6; i++) { const y = H - 8 - i * 9; g.beginPath(); g.moveTo(25 + i * 0.6, y); g.lineTo(32 + i * 0.4, y - 1); g.stroke(); }
            const fr = [[-24, -6, '#2f8a3a'], [-16, -18, '#45a84a'], [0, -22, '#3a9a44'], [18, -17, '#45a84a'], [25, -5, '#2f8a3a'], [-20, 6, '#2a7a34'], [21, 7, '#2a7a34']];
            fr.forEach((f, i) => { const ex = 29 + f[0] + sw * (0.5 + i * 0.1), ey = 22 + f[1] + Math.abs(f[0]) * 0.35; g.strokeStyle = OUT; g.lineWidth = 7.5; g.beginPath(); g.moveTo(29, 22); g.quadraticCurveTo((29 + ex) / 2, 10 + f[1] * 0.4, ex, ey); g.stroke(); g.strokeStyle = f[2]; g.lineWidth = 4.6; g.stroke(); });
            g.fillStyle = '#6a4220'; g.beginPath(); g.arc(26, 26, 3.2, 0, 6.3); g.arc(32, 27, 3.2, 0, 6.3); g.fill();
        },
        boat(g, t, o) {
            const W = 110, H = 54, bob = Math.sin(t * 1.7 + (o.x || 0) * 0.02) * 1.3; g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(W / 2, H - 6, W * 0.46, 5, 0, 0, 6.3); g.fill();
            g.save(); g.translate(0, bob);
            const big = hs(o, 5) > 0.45;
            if (big) { g.strokeStyle = OUT; g.lineWidth = 5; g.beginPath(); g.moveTo(54, H - 14); g.lineTo(54, 4); g.stroke(); g.strokeStyle = '#7a5230'; g.lineWidth = 3; g.stroke(); poly(g, [[56, 6], [56, 30], [84, 30]], '#f2ead2', OUT, 1.4); poly(g, [[52, 10], [52, 30], [36, 30]], '#e9dfc2', OUT, 1.4); poly(g, [[54, 4], [66, 7], [54, 10]], '#c0392b', OUT, 1); }
            poly(g, [[4, H - 26], [104, H - 26], [96, H - 12], [82, H - 6], [26, H - 6], [12, H - 12]], lin(g, 0, H - 26, 0, H - 6, '#9a6a3a', '#5a3a1c'), OUT, 2);
            g.fillStyle = '#e8d8b0'; g.fillRect(6, H - 28, 96, 4); g.strokeStyle = OUT; g.lineWidth = 1.2; g.strokeRect(6, H - 28, 96, 4);
            g.fillStyle = '#b0302a'; g.fillRect(14, H - 18, 80, 3); g.strokeStyle = 'rgba(40,20,8,0.5)'; g.lineWidth = 1; for (let x = 20; x < 96; x += 14) { g.beginPath(); g.moveTo(x, H - 24); g.lineTo(x - 1, H - 8); g.stroke(); }
            g.fillStyle = '#6a4424'; g.fillRect(30, H - 24, 14, 3); g.fillRect(64, H - 24, 14, 3);
            g.restore();
        },
        deadtree(g, t, o) {
            const W = 44, H = 64; shadow(g, W, H, 0.3); const c = '#5a4a3c', c2 = '#7a6654';
            const br = (x0, y0, x1, y1, w) => { g.lineCap = 'round'; g.strokeStyle = OUT; g.lineWidth = w + 2.6; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.strokeStyle = c2; g.lineWidth = w; g.stroke(); };
            g.strokeStyle = OUT; g.lineWidth = 11; g.lineCap = 'round'; g.beginPath(); g.moveTo(22, H - 3); g.quadraticCurveTo(20, H - 26, 22, 26); g.stroke(); g.strokeStyle = lin(g, 15, 0, 29, 0, c2, c); g.lineWidth = 8; g.stroke();
            br(22, 34, 6, 16, 4); br(6, 16, 2, 6, 2.4); br(22, 28, 38, 12, 4); br(38, 12, 41, 2, 2.4); br(21, 26, 14, 6, 3); br(30, 20, 36, 26, 2.4);
            g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(22, H - 6, 6, 2, 0, 0, 6.3); g.fill();
        },
        pillar(g, t, o) {
            const W = 30, H = 62, broken = hs(o, 2) > 0.45, top = broken ? 20 : 8, c = TONES[o.tone] || TONES.sand; shadow(g, W, H, 0.42);
            poly(g, [[3, H - 2], [3, H - 9], [27, H - 9], [27, H - 2]], lin(g, 0, 0, W, 0, c[0], c[2]), OUT, 1.3);
            poly(g, [[7, H - 9], [7, top + (broken ? 6 : 6)], broken ? [12, top - 2] : [7, top + 6], broken ? [18, top + 4] : [23, top + 6], [23, H - 9]].filter(Boolean), lin(g, 7, 0, 23, 0, c[0], c[2]), OUT, 1.4);
            g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1; for (let x = 11; x < 23; x += 4) { g.beginPath(); g.moveTo(x, H - 10); g.lineTo(x, top + 8); g.stroke(); }
            if (!broken) poly(g, [[3, 10], [3, 4], [27, 4], [27, 10]], lin(g, 0, 0, W, 0, c[0], c[2]), OUT, 1.3);
        },
        sarcophagus(g, t, o) {
            const W = 56, H = 34; shadow(g, W, H, 0.48);
            poly(g, [[3, H - 3], [3, 14], [9, 7], [47, 7], [53, 14], [53, H - 3]], lin(g, 0, 0, W, H, '#b9b7ae', '#6a6862'), OUT, 1.6);
            poly(g, [[9, 12], [47, 12], [47, 20], [9, 20]], 'rgba(255,255,255,0.14)', null);
            g.strokeStyle = 'rgba(30,25,20,0.6)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(28, 10); g.lineTo(28, 26); g.moveTo(21, 15); g.lineTo(35, 15); g.stroke();
            g.fillStyle = '#d8b84a'; g.fillRect(6, 24, 44, 2);
        },
        lava(g, t, o) {
            const W = 70, H = 44, p = 0.6 + 0.4 * Math.sin(t * 2.2 + (o.x || 0) * 0.05);
            poly(g, [[2, 26], [8, 10], [24, 3], [46, 3], [62, 9], [68, 24], [58, 38], [36, 42], [14, 38]], '#2a1a16', OUT, 2);
            const rg = g.createRadialGradient(35, 22, 2, 35, 22, 32); rg.addColorStop(0, '#fff2a0'); rg.addColorStop(0.35, '#ffae2a'); rg.addColorStop(0.75, '#e0401a'); rg.addColorStop(1, '#8a1e0e');
            g.save(); g.beginPath(); g.moveTo(8, 25); g.lineTo(13, 13); g.lineTo(27, 8); g.lineTo(45, 8); g.lineTo(58, 13); g.lineTo(63, 25); g.lineTo(54, 34); g.lineTo(36, 37); g.lineTo(17, 34); g.closePath(); g.fillStyle = rg; g.fill(); g.clip();
            for (let i = 0; i < 5; i++) { const q = (t * 0.5 + i / 5) % 1; g.fillStyle = 'rgba(255,240,150,' + (0.7 * (1 - q)).toFixed(2) + ')'; g.beginPath(); g.arc(14 + i * 11 + Math.sin(t + i) * 3, 34 - q * 24, 2.4 + (1 - q) * 2, 0, 6.3); g.fill(); }
            g.fillStyle = 'rgba(60,10,0,' + (0.35 * (1 - p)).toFixed(2) + ')'; g.fillRect(0, 0, W, H); g.restore();
            const gl = g.createRadialGradient(35, 22, 10, 35, 22, 56); gl.addColorStop(0, 'rgba(255,120,30,' + (0.3 * p).toFixed(2) + ')'); gl.addColorStop(1, 'rgba(255,80,20,0)'); g.fillStyle = gl; g.fillRect(-20, -14, W + 40, H + 28);
        },
        reeds(g, t, o) {
            const sw = Math.sin(t * 1.4 + (o.x || 0) * 0.05) * 1.6; g.lineCap = 'round';
            for (let i = 0; i < 7; i++) { const x = 4 + i * 3.8, h = 16 + hs(o, 10 + i) * 14; g.strokeStyle = i % 2 ? '#5f9a3a' : '#3f7a2a'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x, 33); g.quadraticCurveTo(x + sw * 0.4, 33 - h * 0.6, x + sw + (i - 3) * 0.8, 33 - h); g.stroke(); }
            [[9, 11], [19, 7], [25, 13]].forEach((c, i) => { g.strokeStyle = '#5a3a1c'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(c[0] + sw * 0.6, c[1] + 2); g.lineTo(c[0] + sw * 0.6, c[1] + 9); g.stroke(); });
        },
        icespire(g, t, o) {
            const W = 30, H = 56; shadow(g, W, H, 0.4);
            g.save(); g.globalAlpha = 0.95;
            poly(g, [[4, H - 3], [8, 26], [14, 3], [19, 22], [26, H - 3]], lin(g, 0, 0, W, H, '#e8f6ff', '#6aaee0'), OUT, 1.5);
            poly(g, [[14, 3], [19, 22], [26, H - 3], [15, H - 3]], 'rgba(40,110,190,0.28)', null); poly(g, [[8, 26], [14, 3], [12, H - 3], [4, H - 3]], 'rgba(255,255,255,0.3)', null);
            poly(g, [[0, H - 3], [3, 34], [6, H - 3]], lin(g, 0, 0, 8, H, '#e8f6ff', '#88c0ea'), OUT, 1.2);
            g.restore(); const s = (Math.sin(t * 2.5 + (o.x || 0)) + 1) / 2; g.fillStyle = 'rgba(255,255,255,' + (0.5 * s).toFixed(2) + ')'; g.fillRect(13, 12, 2, 6);
        },
        netrack(g, t, o) {
            const W = 60, H = 46; shadow(g, W, H, 0.45);
            [[6, 8], [W - 10, 8]].forEach((p) => { g.strokeStyle = OUT; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(p[0] + 2, H - 3); g.lineTo(p[0] + 2, p[1]); g.stroke(); g.strokeStyle = '#8a6238'; g.lineWidth = 3.6; g.stroke(); });
            g.strokeStyle = OUT; g.lineWidth = 4.6; g.beginPath(); g.moveTo(8, 10); g.lineTo(W - 8, 10); g.stroke(); g.strokeStyle = '#8a6238'; g.lineWidth = 2.6; g.stroke();
            g.fillStyle = 'rgba(200,190,160,0.22)'; g.fillRect(10, 11, W - 20, 26); g.strokeStyle = 'rgba(225,215,185,0.85)'; g.lineWidth = 1;
            for (let x = 12; x < W - 10; x += 6) { g.beginPath(); g.moveTo(x, 11); g.quadraticCurveTo(x + 1.5, 24, x + 0.5, 37); g.stroke(); } for (let y = 15; y < 37; y += 6) { g.beginPath(); g.moveTo(10, y); g.lineTo(W - 10, y + 1); g.stroke(); }
            [[14, 38], [28, 40], [44, 38]].forEach((f) => { g.fillStyle = '#d0402a'; g.beginPath(); g.arc(f[0], f[1], 3, 0, 6.3); g.fill(); g.strokeStyle = OUT; g.lineWidth = 0.9; g.stroke(); });
        }
    };
    function installArt() {
        const C = window.CATALOG; if (!C || !C.DECOR) return;
        Object.keys(NEWDECOR).forEach((k) => { if (!C.DECOR[k]) C.DECOR[k] = Object.assign({}, NEWDECOR[k]); });
        const A = window.Art; if (!A || !A.drawDecor || A.drawDecor._m2) return;
        const od = A.drawDecor;
        A.drawDecor = function (ctx, o, t) {
            const fn = o && DRAW[o.kind], d = fn && window.CATALOG.DECOR[o.kind];
            if (!fn || !d) return od.apply(this, arguments);
            const ow = o.w || d.w, oh = o.h || d.h; ctx.save(); ctx.translate(o.x, o.y); ctx.scale(ow / d.w, oh / d.h);
            try { fn(ctx, t, o); } catch (e) { console.error('[maps2] decor', o.kind, e); } ctx.restore();
        };
        A.drawDecor._m2 = true;
    }
    installArt();   // catálogo já existe aqui; o Art (artworld.js) carrega depois, então o gancho do desenho é refeito no 'load'
    window.addEventListener('load', installArt);

    /* ============================ CRIATURAS NOVAS (espécies que já têm desenho; só muda cor, tamanho e força) ============================ */
    const BASE = { goblin: [30, 34], orc: [40, 46], wolf: [44, 30], skeleton: [30, 44], slime: [32, 26], bat: [36, 28], spider: [46, 30], rat: [28, 18], snake: [42, 20], boar: [42, 30], ghost: [30, 46], troll: [58, 70], golem: [60, 66], darkmage: [32, 48], whelp: [64, 52], dragon: [150, 120] };
    // [chave, nome, espécie, comportamento, escala, alcance, velocidade, vida, golpe, xp, cor1, cor2, loot, descrição, bioma, grupo]
    const CR = [
        ['swamp_snake', 'Víbora do Brejo', 'snake', 'aggressive', 1.15, 85, 1.15, 26, 6, 38, '#6d7d2a', '#d8c64a', 'Raw Meat,0.4,1|Coins,0.4,20', 'Escondida na lama, só aparece quando já é tarde.', 'Pântano', 'fera'],
        ['bog_slime', 'Gosma do Brejo', 'slime', 'neutral', 1.25, 60, 0.6, 40, 6, 44, '#8a9a2a', '#e0f08a', 'Slime Ball,0.9,2|Coins,0.5,25|Health Potion,0.08,1', 'Gosma espessa que cresceu em água parada.', 'Pântano', 'monstro'],
        ['marsh_wisp', 'Fogo-Fátuo', 'ghost', 'aggressive', 0.95, 120, 0.85, 48, 8, 70, '#9ff0b8', '#e8fff0', 'Ectoplasm,0.8,1|Air Rune,0.5,6|Mana Potion,0.1,1', 'Luzinha verde que leva viajantes para o fundo do brejo.', 'Pântano', 'monstro'],
        ['drowned', 'Afogado', 'skeleton', 'aggressive', 1.0, 95, 0.95, 40, 7, 60, '#7fb0a0', '#2a4a5a', 'Bones,1,1|Coins,0.8,40|Raw Fish,0.3,2', 'Marinheiro que nunca voltou à superfície.', 'Litoral', 'monstro'],
        ['salt_slime', 'Gosma Salgada', 'slime', 'neutral', 1.0, 60, 0.7, 28, 4, 30, '#6fc0d8', '#e0f8ff', 'Slime Ball,0.7,2|Coins,0.4,15', 'Trazida pela maré, encrusta o sal por onde passa.', 'Litoral', 'monstro'],
        ['goblin_brute', 'Goblin Brutamontes', 'goblin', 'aggressive', 1.3, 100, 0.95, 42, 7, 60, '#4f8a3a', '#6a4a2a', 'Bones,1,1|Coins,1,45|Iron Ore,0.3,2', 'Come por três e bate por dois.', 'Covil dos Goblins', 'monstro'],
        ['goblin_chief', 'Grakk, Chefe Goblin', 'goblin', 'aggressive', 2.0, 150, 0.95, 170, 11, 520, '#7a4a9a', '#d8b84a', 'Bones,1,1|Coins,1,300|Steel Bar,0.6,2|Iron Bar,1,3|Health Potion,0.6,2|Steel Sword,0.12,1', 'Usa uma coroa feita de colheres. Ninguém ri.', 'Covil dos Goblins', 'chefe'],
        ['dire_wolf', 'Lobo Atroz', 'wolf', 'aggressive', 1.25, 140, 1.35, 70, 10, 110, '#3d3d46', '#9a9aa8', 'Bones,1,1|Wolf Pelt,0.8,2|Raw Meat,0.8,2', 'Do tamanho de um pônei e com o dobro da fome.', 'Bosque Élfico', 'fera'],
        ['venom_spider', 'Aranha Venenosa', 'spider', 'aggressive', 1.2, 110, 1.15, 62, 9, 95, '#2a4a2f', '#b6ff3a', 'Spider Silk,1,3|Raw Meat,0.3,1|Health Potion,0.1,1', 'Suas presas pingam algo verde e nada saudável.', 'Bosque Élfico', 'fera'],
        ['forest_wisp', 'Espírito do Bosque', 'ghost', 'aggressive', 1.0, 120, 0.85, 55, 9, 90, '#c8ffd0', '#ffffff', 'Ectoplasm,0.8,2|Mind Rune,0.6,8|Mana Potion,0.12,1', 'Guardião antigo que já não reconhece os vivos.', 'Bosque Élfico', 'monstro'],
        ['ent_elder', 'Ent Ancião', 'golem', 'neutral', 1.4, 100, 0.55, 260, 16, 800, '#5b8a4a', '#d8f07a', 'Stone Core,0.8,1|Logs,1,10|Greater Health Potion,0.6,2|Mana Potion,0.6,2|Steel Shield,0.15,1|Coins,1,260', 'Árvore que aprendeu a andar e a odiar machados.', 'Bosque Élfico', 'chefe'],
        ['sand_skeleton', 'Esqueleto das Areias', 'skeleton', 'aggressive', 1.05, 100, 1.0, 60, 10, 100, '#e6cf9a', '#a0783a', 'Bones,1,1|Coins,0.9,70|Iron Ore,0.3,2|Coal,0.3,2', 'Seca no sol há mil anos e mesmo assim não descansa.', 'Deserto', 'monstro'],
        ['dune_snake', 'Naja das Dunas', 'snake', 'aggressive', 1.3, 90, 1.25, 44, 11, 85, '#d9b84a', '#8a4a1a', 'Raw Meat,0.5,1|Coins,0.5,30', 'Um bote e acabou-se o passeio.', 'Deserto', 'fera'],
        ['sand_wraith', 'Espectro da Areia', 'ghost', 'aggressive', 1.05, 130, 0.9, 70, 12, 120, '#e8d29a', '#fff6d8', 'Ectoplasm,0.8,2|Coins,0.8,80|Dark Tome,0.15,1', 'Nasce do vento quente das ruínas.', 'Ruínas', 'monstro'],
        ['sand_golem', 'Golem de Arenito', 'golem', 'neutral', 1.15, 100, 0.55, 200, 15, 330, '#c9a25a', '#fff2b0', 'Stone Core,0.6,1|Iron Ore,1,3|Coal,0.6,3|Coins,0.8,150', 'Guardião das ruínas esculpido em arenito.', 'Ruínas', 'chefe'],
        ['mummy_king', 'Faraó Sahr-Kal', 'skeleton', 'aggressive', 1.8, 170, 0.85, 380, 20, 1500, '#d9c27a', '#2a8a9a', 'Bones,1,1|Coins,1,500|Soul Gem,0.7,1|Mithril Ore,0.7,2|Steel Body,0.12,1|Greater Health Potion,0.7,2|Strength Potion,0.5,1', 'Senhor das Ruínas de Sahr-Kal. Acordou com fome de ouro.', 'Ruínas', 'chefe'],
        ['frost_wolf', 'Lobo de Gelo', 'wolf', 'aggressive', 1.2, 140, 1.4, 90, 12, 150, '#cfe8ff', '#ffffff', 'Bones,1,1|Wolf Pelt,0.8,2|Raw Meat,0.8,2', 'Sua pelagem branca some na neve. O uivo, não.', 'Vale Gelado', 'fera'],
        ['ice_bat', 'Morcego Gélido', 'bat', 'aggressive', 1.2, 140, 1.6, 40, 8, 65, '#7fb8e0', '#d8f0ff', 'Bat Wing,0.7,1|Coins,0.4,20', 'Suas asas deixam pontinhos de gelo no ar.', 'Vale Gelado', 'fera'],
        ['frost_ghost', 'Espectro Gélido', 'ghost', 'aggressive', 1.05, 130, 0.85, 80, 13, 130, '#9fd0ff', '#ffffff', 'Ectoplasm,0.9,2|Water Rune,0.6,8|Mana Potion,0.12,1', 'Viajante que congelou e continuou andando.', 'Vale Gelado', 'monstro'],
        ['ice_golem', 'Golem de Gelo', 'golem', 'neutral', 1.25, 100, 0.55, 260, 17, 420, '#a8d8f0', '#ffffff', 'Stone Core,0.7,1|Coal,0.8,3|Mithril Ore,0.3,1|Coins,0.8,200', 'Montanha de gelo que decidiu se mexer.', 'Vale Gelado', 'chefe'],
        ['frost_giant', 'Hrimgar, Gigante de Gelo', 'troll', 'aggressive', 1.5, 160, 0.75, 520, 24, 1800, '#9fc8e8', '#e8f4ff', 'Troll Tooth,1,2|Coins,1,600|Mithril Ore,0.9,3|Mithril Sword,0.15,1|Mithril Shield,0.12,1|Greater Health Potion,0.8,3|Guard Potion,0.5,1', 'O vale inteiro treme quando ele ri.', 'Vale Gelado', 'chefe'],
        ['troll_elder', 'Grumbak, Troll Ancião', 'troll', 'aggressive', 1.45, 130, 0.8, 330, 19, 950, '#6a7a52', '#c8a060', 'Troll Tooth,1,2|Coins,1,450|Iron Bar,1,4|Steel Bar,0.6,2|Mithril Ore,0.5,1|Greater Health Potion,0.6,2', 'Acordou quando os mineiros foram embora, e nunca mais dormiu.', 'Mina Abandonada', 'chefe'],
        ['apprentice', 'Aprendiz Corrompido', 'darkmage', 'aggressive', 1.05, 150, 0.9, 70, 12, 110, '#2a4a8a', '#88c8ff', 'Air Rune,0.8,8|Mind Rune,0.8,8|Water Rune,0.5,6|Coins,0.8,70|Dark Tome,0.2,1', 'Abriu o livro errado na hora errada.', 'Torre do Mago', 'monstro'],
        ['arcane_golem', 'Golem Arcano', 'golem', 'neutral', 1.15, 110, 0.6, 240, 18, 380, '#6a4ab8', '#e0a8ff', 'Stone Core,0.8,1|Mana Potion,0.5,2|Coins,0.8,170', 'Construído para guardar a biblioteca. Guarda até hoje.', 'Torre do Mago', 'chefe'],
        ['mad_mage', 'Zarthul, o Mago Louco', 'darkmage', 'aggressive', 1.6, 260, 0.85, 420, 26, 2200, '#3a1f6a', '#ff5ad0', 'Dark Tome,1,2|Soul Gem,0.8,1|Coins,1,700|Mana Potion,1,3|Greater Health Potion,0.7,2|Mithril Body,0.12,1|Mithril Sword,0.1,1', 'Tentou engarrafar o tempo. O tempo devolveu o favor.', 'Torre do Mago', 'chefe'],
        ['zombie', 'Morto-Vivo', 'orc', 'aggressive', 1.0, 90, 0.75, 95, 13, 140, '#6a8a6a', '#4a4a3a', 'Bones,1,1|Coins,0.9,80|Iron Bar,0.2,1', 'Lento, teimoso e sem nenhum senso de humor.', 'Cemitério', 'monstro'],
        ['grave_ghost', 'Alma Penada', 'ghost', 'aggressive', 1.0, 130, 0.85, 75, 12, 120, '#c8c8f0', '#ffffff', 'Ectoplasm,0.9,2|Coins,0.8,90|Health Potion,0.1,1', 'Pede uma oração. Ou o seu pescoço.', 'Cemitério', 'monstro'],
        ['crypt_knight', 'Guardião da Cripta', 'skeleton', 'aggressive', 1.15, 115, 1.0, 130, 16, 260, '#bfb79a', '#5a2a6a', 'Bones,1,1|Coins,1,140|Steel Bar,0.5,2|Coal,0.6,3|Greater Health Potion,0.12,1', 'Jurou proteger os reis para sempre. Cumpriu.', 'Cripta', 'monstro'],
        ['forgotten_king', 'Rei Esquecido Aldric', 'skeleton', 'aggressive', 1.85, 190, 0.85, 560, 26, 2600, '#d8c890', '#6a2a8a', 'Bones,1,1|Coins,1,800|Soul Gem,1,2|Bone Blade,0.35,1|Mithril Body,0.2,1|Mithril Shield,0.2,1|Greater Health Potion,1,3|Strength Potion,0.6,1', 'Reinou sobre tudo e todos, e ninguém lembra o nome.', 'Cripta', 'chefe'],
        ['dark_knight', 'Cavaleiro Negro', 'skeleton', 'aggressive', 1.2, 120, 1.0, 170, 20, 330, '#26262e', '#9a2a2a', 'Bones,1,1|Coins,1,180|Steel Bar,0.6,2|Steel Sword,0.08,1|Greater Health Potion,0.2,1', 'Serve a Ossian por juramento e por falta de opção.', 'Fortaleza Sombria', 'monstro'],
        ['necromancer', 'Necromante', 'darkmage', 'aggressive', 1.15, 200, 0.9, 120, 18, 300, '#161616', '#5dffb0', 'Dark Tome,0.6,1|Soul Gem,0.1,1|Air Rune,0.8,10|Mind Rune,0.8,10|Coins,1,140|Mana Potion,0.25,1', 'Ergue mortos como quem arruma a casa.', 'Fortaleza Sombria', 'monstro'],
        ['warlord', 'Morthak, Senhor da Guerra', 'orc', 'aggressive', 2.0, 170, 0.8, 620, 28, 3000, '#4a4a52', '#8a1a1a', 'Bones,1,1|Coins,1,1000|Soul Gem,1,2|Mithril Bar,0.6,2|Mithril Sword,0.2,1|Mithril Body,0.15,1|Greater Health Potion,1,3|Guard Potion,0.6,1', 'General dos mortos. Nunca perdeu uma batalha, só aliados.', 'Fortaleza Sombria', 'chefe'],
        ['ember_skeleton', 'Esqueleto de Brasa', 'skeleton', 'aggressive', 1.1, 110, 1.05, 140, 19, 280, '#3a2a26', '#ff7a30', 'Bones,1,1|Coal,1,4|Coins,0.9,110|Iron Bar,0.3,2', 'Queimou uma vez. Continua queimando.', 'Vulcão', 'monstro'],
        ['fire_whelp', 'Dragonete Vulcânico', 'whelp', 'aggressive', 1.1, 150, 1.05, 130, 16, 250, '#a83a1a', '#ffd27a', 'Dragon Scale,0.6,1|Coal,0.6,3|Coins,1,120', 'Nasceu dentro da cratera e não conhece outro lar.', 'Vulcão', 'chefe'],
        ['lava_golem', 'Golem de Lava', 'golem', 'neutral', 1.3, 110, 0.55, 340, 22, 600, '#5a2a20', '#ff6a20', 'Stone Core,1,1|Coal,1,5|Mithril Ore,0.6,2|Coins,1,260', 'Rocha derretida com mau humor.', 'Vulcão', 'chefe'],
        ['ash_bat', 'Morcego de Cinzas', 'bat', 'aggressive', 1.25, 140, 1.6, 55, 12, 95, '#4a3a3a', '#ff9a50', 'Bat Wing,0.7,1|Coins,0.5,40', 'Voa entre as fagulhas e some nas cinzas.', 'Vulcão', 'fera'],
        ['drake', 'Dragão Jovem', 'dragon', 'aggressive', 0.85, 200, 0.9, 360, 22, 900, '#7a2a1a', '#e8a04a', 'Dragon Scale,1,3|Dragon Bones,1,1|Coins,1,400|Greater Health Potion,0.5,2', 'Ainda aprendendo a cuspir fogo. Aprende rápido.', 'Ninho do Dragão', 'chefe'],
        ['black_dragon', 'Kharzul, o Dragão Negro', 'dragon', 'aggressive', 1.25, 240, 0.8, 850, 32, 5000, '#1a1a2a', '#b04bff', 'Dragon Scale,1,6|Dragon Bones,1,2|Coins,1,1500|Soul Gem,1,2|Mithril Body,0.3,1|Mithril Shield,0.3,1|Mithril Sword,0.3,1|Greater Health Potion,1,4|Strength Potion,1,2|Guard Potion,1,2', 'Mais velho que o reino. Guarda o tesouro de todos os dragões.', 'Ninho do Dragão', 'chefe']
    ];
    const CREATURES = {};
    CR.forEach((c) => { const b = BASE[c[2]] || [30, 40], s = c[4];
        CREATURES[c[0]] = { name: c[1], group: c[15] || 'monstro', species: c[2], behavior: c[3], range: c[5], speed: c[6], w: Math.round(b[0] * s), h: Math.round(b[1] * s), hp: c[7], maxHit: c[8], xp: c[9], c1: c[10], c2: c[11], lootStr: c[12], dialog: '', shopStr: '', desc: c[13], biome: c[14] };
    });
    try { if (window.Balance) Balance.applyNpcDB(CREATURES); } catch (e) { }   // balanceamento v2
    function mergeCreatures() {
        if (typeof npcDB === 'undefined') return;
        Object.keys(CREATURES).forEach((k) => { const cur = npcDB[k]; if (!cur || !cur.species) npcDB[k] = Object.assign({}, CREATURES[k]); });
    }
    try { mergeCreatures(); } catch (e) {}

    /* ============================ CONSTRUTOR DE MAPAS ============================ */
    const PCOL = { dirt: '#5c4033', stone: '#7f8c8d', grass: '#27ae60', water: '#3498db' };
    const PATH = 1, WATER = 2;
    const CB = () => (window.CATALOG && CATALOG.BUILDINGS) || {}, CD = () => (window.CATALOG && CATALOG.DECOR) || {};
    const SB = () => (typeof SCALE_BUILD === 'number' ? SCALE_BUILD : 1.75), SD = () => (typeof SCALE_DECOR === 'number' ? SCALE_DECOR : 1.3);
    const bsz = (st) => { const d = CB()[st] || CB().cottage || { w: 104, h: 96 }; return [Math.round(d.w * SB()), Math.round(d.h * SB())]; };
    const dsz = (k) => { const d = CD()[k] || { w: 30, h: 30 }; return [Math.round(d.w * SD()), Math.round(d.h * SD())]; };
    const ahash = (n) => { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };   // mesma conta de Art.hash (variante da árvore sai do id)
    const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const R5 = (v) => Math.round(v);
    const LANDING = { down: [0, 100], up: [0, -100], left: [-100, 0], right: [100, 0] };

    const hbox = (o) => { try { if (typeof getHitbox === 'function') { const h = getHitbox(o); if (h) return h; if (o.type === 'decor' || o.type === 'house') return null; } } catch (e) { } return { x: o.x, y: o.y, w: o.w || 30, h: o.h || 30 }; };   // mesma caixa de colisão do jogo (árvore = só o tronco)
    function Builder(idx, id, name, W, H, color, seed) {
        const b = { id, name, W, H, color, E: [], ports: {}, safe: [], spawn: null };
        const rnd = mulberry(seed * 7919 + idx * 131 + 17); b.rnd = rnd;
        b.ri = (a, z) => a + Math.floor(rnd() * (z - a + 1)); b.pick = (arr) => arr[Math.floor(rnd() * arr.length)];
        let n = 0; const base = 600000 + idx * 5000; const nid = () => base + (n++);
        const occ = [], buckets = new Map(); const BK = 128;
        const CW = 20, cols = Math.ceil(W / CW), rows = Math.ceil(H / CW), mask = new Uint8Array(cols * rows);
        const cr = (x, y, w, h) => [Math.max(0, Math.floor(x / CW)), Math.max(0, Math.floor(y / CW)), Math.min(cols - 1, Math.floor((x + w - 1) / CW)), Math.min(rows - 1, Math.floor((y + h - 1) / CW))];
        const markM = (f, x, y, w, h) => { const r = cr(x, y, w, h); for (let j = r[1]; j <= r[3]; j++) for (let i = r[0]; i <= r[2]; i++) mask[j * cols + i] |= f; };
        const hitM = (f, x, y, w, h) => { const r = cr(x, y, w, h); for (let j = r[1]; j <= r[3]; j++) for (let i = r[0]; i <= r[2]; i++) if (mask[j * cols + i] & f) return true; return false; };
        const occAdd = (r) => { occ.push(r); for (let i = Math.floor(r.x / BK); i <= Math.floor((r.x + r.w) / BK); i++) for (let j = Math.floor(r.y / BK); j <= Math.floor((r.y + r.h) / BK); j++) { const k = i * 1000 + j; let a = buckets.get(k); if (!a) buckets.set(k, a = []); a.push(r); } };
        const hits = (x, y, w, h, pad, padT, isTree) => {
            const seen = new Set();
            for (let i = Math.floor((x - 40) / BK); i <= Math.floor((x + w + 40) / BK); i++) for (let j = Math.floor((y - 40) / BK); j <= Math.floor((y + h + 40) / BK); j++) { const a = buckets.get(i * 1000 + j); if (!a) continue;
                for (const r of a) { if (seen.has(r)) continue; seen.add(r); const p = (isTree && r.t === 'tree') ? padT : pad; if (x - p < r.x + r.w && x + w + p > r.x && y - p < r.y + r.h && y + h + p > r.y) return true; } }
            return false;
        };
        b.nid = nid; b.mask = { mark: markM, hit: hitM }; b.occAdd = occAdd; b.occHit = hits;
        const free = (x, y, w, h, o) => {
            const m = o.margin === undefined ? 24 : o.margin;
            if (x < m || y < m || x + w > W - m || y + h > H - m) return false;
            const pad = o.pad === undefined ? 12 : o.pad, padT = o.padT === undefined ? -28 : o.padT; const vr = o.vis || [0, 0, w, h];
            if (hits(x + vr[0], y + vr[1], vr[2], vr[3], pad, padT, o.isTree)) return false;
            const fy = o.fp === 'full' ? y : y + h * 0.5, fh = o.fp === 'full' ? h : h * 0.5;
            if (!o.onPath && hitM(PATH, x, fy, w, fh)) return false;
            if (!o.onWater && hitM(WATER, x, fy, w, fh)) return false;
            return true;
        };
        b.free = (x, y, w, h, o) => free(x, y, w, h, o || {});
        const add = (o, opt) => {
            opt = opt || {}; o.x = R5(o.x); o.y = R5(o.y);
            if (!opt.force && !free(o.x, o.y, o.w, o.h, opt)) return null;
            b.E.push(o); if (!opt.noocc) { const v = opt.vis || [0, 0, o.w, o.h]; occAdd({ x: o.x + v[0], y: o.y + v[1], w: v[2], h: v[3], t: o.type }); } return o;
        };
        b.add = add;
        /* --- chão --- */
        b.paint = (kind, x, y, w, h, mark) => {
            x = Math.max(0, R5(x)); y = Math.max(0, R5(y)); w = R5(Math.min(w, W - x)); h = R5(Math.min(h, H - y)); if (w <= 0 || h <= 0) return;
            b.E.push({ id: nid(), type: 'paint', name: 'Chão', color: PCOL[kind] || kind, x, y, w, h, active: true });
            if (kind === 'water') markM(WATER, x, y, w, h); else if (mark) markM(PATH, x, y, w, h);
        };
        b.road = (pts, w, o) => {
            o = o || {}; const kind = o.kind || 'dirt', amp = o.amp || 0, step = 40;
            for (let i = 0; i < pts.length - 1; i++) {
                const a = pts[i], z = pts[i + 1], hz = a[1] === z[1]; const len = Math.abs(hz ? z[0] - a[0] : z[1] - a[1]), dir = hz ? Math.sign(z[0] - a[0]) : Math.sign(z[1] - a[1]); const waves = Math.max(1, Math.round(len / 520));
                for (let s = 0; s < len; s += step) {
                    const t = s / len, off = amp ? R5(amp * Math.sin(t * Math.PI * 2 * waves) / 10) * 10 : 0, l = Math.min(step, len - s) + 2;
                    if (hz) b.paint(kind, dir > 0 ? a[0] + s : a[0] - s - l + 2, a[1] - w / 2 + off, l, w, true);
                    else b.paint(kind, a[0] - w / 2 + off, dir > 0 ? a[1] + s : a[1] - s - l + 2, w, l, true);
                }
            }
            pts.forEach((p, i) => { if (i > 0 && i < pts.length - 1) b.paint(kind, p[0] - w / 2, p[1] - w / 2, w, w, true); });
        };
        b.lake = (cx, cy, rx, ry, o) => {
            o = o || {}; const band = o.band || 40, irr = o.irr === undefined ? 0.22 : o.irr;
            for (let y = cy - ry; y < cy + ry; y += band) { const dy = Math.min(1, Math.abs((y + band / 2 - cy) / ry)); let half = rx * Math.sqrt(Math.max(0.05, 1 - dy * dy)) * (1 + (rnd() - 0.5) * irr); half = Math.max(band, R5(half / 10) * 10); b.paint('water', cx - half + (o.shift ? R5((rnd() - 0.5) * o.shift / 10) * 10 : 0), y, 2 * half, band); }
        };
        b.clear = (x, y, w, h) => { markM(PATH, x, y, w, h); };
        b.reserve = (x, y, w, h) => { occAdd({ x, y, w, h, t: 'res' }); };
        /* --- objetos --- */
        b.treeId = (v) => { if (v === undefined || v === null) return nid(); for (let k = 0; k < 40; k++) { const i = nid(); if (Math.floor(ahash(i * 1.37) * 3) === v) return i; } return nid(); };
        const TV = [-12, -30, 100, 126];   // retângulo visual da árvore (a copa passa da caixa)
        b.tree = (x, y, v, opt) => add({ id: b.treeId(v), type: 'tree', name: 'Oak Tree', x, y, w: 76, h: 96, hp: 3, maxHp: 3, active: true }, Object.assign({ pad: 10, vis: TV, isTree: true, fp: 'full' }, opt));
        b.house = (style, x, y, opt) => { const s = bsz(style); return add({ id: nid(), type: 'house', style, name: (CB()[style] || {}).name || 'Casa', x, y, w: s[0], h: s[1], active: true }, Object.assign({ pad: 14, fp: 'full' }, opt)); };
        b.decor = (kind, x, y, opt) => { const s = (opt && opt.size) || dsz(kind), solid = !!(CD()[kind] || {}).solid; const o = { id: nid(), type: 'decor', kind, name: (CD()[kind] || {}).name || kind, x, y, w: s[0], h: s[1], active: true }; if (opt && opt.tone) o.tone = opt.tone; return add(o, Object.assign({ pad: solid ? 10 : 4, fp: solid ? 'half' : 'full' }, opt)); };
        b.rock = (k, x, y, opt) => { const rk = (window.Content && Content.ROCKS && Content.ROCKS[k]) || { hp: 3, color: '#7f8c8d' }; return add({ id: nid(), type: k, name: k, x, y, w: 38, h: 38, hp: rk.hp, maxHp: rk.hp, color: rk.color, active: true }, Object.assign({ pad: 14, fp: 'full' }, opt)); };
        b.npc = (key, x, y, name, opt) => { const d = npcDB[key] || {}; return add({ id: nid(), type: 'npc', dbKey: key, name: name || d.name || key, x, y, w: d.w || 30, h: d.h || 44, hp: 0, maxHp: 0, active: true }, Object.assign({ pad: 14, onPath: true, fp: 'full' }, opt)); };
        b.mob = (key, x, y, opt) => {
            const d = npcDB[key]; if (!d) return null; const w = d.w || 30, h = d.h || 30;
            for (const s of b.safe) if (Math.hypot(x + w / 2 - s[0], y + h / 2 - s[1]) < s[2]) return null;
            return add({ id: nid(), type: 'enemy', dbKey: key, name: d.name, x, y, w, h, hp: d.hp, maxHp: d.hp, attackCooldown: 0, active: true }, Object.assign({ pad: 16, onPath: true, fp: 'full', margin: 60 }, opt));
        };
        b.bank = (x, y, opt) => add({ id: nid(), type: 'bank', name: 'Banco', x, y, w: 80, h: 48, active: true }, Object.assign({ pad: 16, onPath: true, fp: 'full' }, opt));
        b.furnace = (x, y, opt) => add({ id: nid(), type: 'furnace', name: 'Fornalha', x, y, w: 48, h: 72, active: true }, Object.assign({ pad: 14, onPath: true, fp: 'full' }, opt));
        b.anvil = (x, y, opt) => add({ id: nid(), type: 'anvil', name: 'Bigorna', x, y, w: 46, h: 39, active: true }, Object.assign({ pad: 14, onPath: true, fp: 'full' }, opt));
        b.fish = (x, y, opt) => add({ id: nid(), type: 'fishing_spot', name: 'Ponto de Pesca', x, y, w: 46, h: 46, active: true }, Object.assign({ pad: 24, onWater: true, onPath: true, fp: 'full' }, opt));
        b.fire = (x, y, opt) => add({ id: nid(), type: 'fire', name: 'Fire', x, y, w: 34, h: 34, life: 2000000000, active: true }, Object.assign({ pad: 14, onPath: true, fp: 'full' }, opt));
        b.plot = (x, y, opt) => add({ id: nid(), type: 'farm_plot', name: 'Canteiro', x, y, w: 56, h: 46, active: true }, Object.assign({ pad: 6, onPath: true, fp: 'full' }, opt));
        b.cauldron = (x, y, opt) => add({ id: nid(), type: 'cauldron', name: 'Caldeirão', x, y, w: 44, h: 44, active: true }, Object.assign({ pad: 14, onPath: true, fp: 'full' }, opt));
        b.enchant = (x, y, opt) => add({ id: nid(), type: 'enchant_table', name: 'Mesa de Encantamento', x, y, w: 54, h: 46, active: true }, Object.assign({ pad: 14, onPath: true, fp: 'full' }, opt));
        b.item = (item, x, y, qty, opt) => add({ id: nid(), type: 'ground_item', item, qty: qty || 1, x, y, w: 20, h: 20, life: 99999999, active: true }, Object.assign({ pad: 4, onPath: true, fp: 'full', noocc: false }, opt));
        /* --- portas de ligação (criadas na fase de ligação; aqui só se reserva o espaço) --- */
        b.port = (key, cx, cy, face, o) => {
            const d = LANDING[face] || LANDING.down; o = o || {};
            const p = { key, px: R5(cx - 32), py: R5(cy - 32), lx: R5(cx + d[0]), ly: R5(cy + d[1]), face };
            b.ports[key] = p; occAdd({ x: p.px - 22, y: p.py - 22, w: 108, h: 108, t: 'res' }); occAdd({ x: p.lx - 36, y: p.ly - 36, w: 72, h: 72, t: 'res' }); markM(PATH, p.px - 30, p.py - 30, 124, 124); markM(PATH, p.lx - 40, p.ly - 40, 80, 80);
            b.safe.push([cx, cy, o.safe || 330]); if (!b.spawn) b.spawn = { x: p.lx, y: p.ly };
            if (o.lamps !== false) { const hz = face === 'up' || face === 'down'; if (hz) { b.decor('lamp', p.px - 34, p.py + 8, { force: true }); b.decor('lamp', p.px + 64 + 14, p.py + 8, { force: true }); } else { b.decor('lamp', p.px + 22, p.py - 88, { force: true }); b.decor('lamp', p.px + 22, p.py + 74, { force: true }); } }
            return p;
        };
        /* --- bordas fechadas e populações --- */
        b.treeBorder = (o) => {
            o = o || {}; const vf = o.v || (() => undefined), st = o.step || 30, dp = o.depth === undefined ? 0 : o.depth, sd = o.sides || 'tblr';
            const row = (fx, fy, n2, dx, dy, jit) => { for (let i = 0; i < n2; i++) { const x = fx + dx * i * st + (rnd() - 0.5) * jit, y = fy + dy * i * 26 + (rnd() - 0.5) * jit; const tx = Math.max(0, Math.min(W - 76, x)), ty = Math.max(46, Math.min(H - 98, y)); if (Object.values(b.ports).some((p) => tx + 76 > p.px - 70 && tx < p.px + 134 && ty + 96 > p.py - 30 && ty < p.py + 110)) continue; if ((o.ymax !== undefined && ty > o.ymax && dx === 0) || (o.ymin !== undefined && ty < o.ymin && dx === 0)) continue; b.tree(tx, ty, vf(), { force: true }); } };
            for (let d = 0; d < 1 + dp; d++) { const o2 = d * 40, jit = d ? 26 : 6, sp = d ? 1.7 : 1;
                if (sd.includes('t')) row(2, 46 + o2, Math.ceil(W / (st * sp)), sp, 0, jit); if (sd.includes('b')) row(2, H - 104 - o2, Math.ceil(W / (st * sp)), sp, 0, jit);
                if (sd.includes('l')) row(0 + o2, 46, Math.ceil(H / (26 * sp)), 0, sp, jit); if (sd.includes('r')) row(W - 76 - o2, 46, Math.ceil(H / (26 * sp)), 0, sp, jit); }
        };
        b.wallBorder = (o) => {   // muro de pedra fechando o mapa todo
            o = o || {}; const ww = dsz('wall_h'), wv = dsz('wall_v'); const top = 0, bot = H - ww[1];
            const hline = (y) => { const n2 = Math.ceil(W / ww[0]), s2 = (W - ww[0]) / Math.max(1, n2 - 1); for (let i = 0; i < n2; i++) b.decor('wall_h', R5(i * s2), y, { force: true, tone: o.tone }); };
            const vline = (x) => { const n2 = Math.ceil((H - 2 * ww[1]) / wv[1]), s2 = n2 > 1 ? ((H - 2 * ww[1]) - wv[1]) / (n2 - 1) : 0; for (let i = 0; i < n2; i++) b.decor('wall_v', x, R5(ww[1] + i * s2), { force: true }); };
            hline(top); hline(bot); vline(0); vline(W - wv[0]);
        };
        b.wallLine = (x0, y0, x1, y1, gaps) => {   // parede interna com vãos: gaps = [[a,b],...] em coordenadas do eixo
            const hz = y0 === y1, ww = dsz('wall_h'), wv = dsz('wall_v'); const L0 = hz ? x0 : y0, L1 = hz ? x1 : y1; const gl = (gaps || []).slice().sort((p, q) => p[0] - q[0]);
            const segs = []; let cur = L0; gl.forEach((g) => { if (g[0] > cur) segs.push([cur, g[0]]); cur = Math.max(cur, g[1]); }); if (cur < L1) segs.push([cur, L1]);
            const pw = hz ? ww[0] : wv[1];
            segs.forEach((s) => { const len = s[1] - s[0]; if (len <= 4) return; const n2 = Math.max(1, Math.ceil(len / pw)), st = n2 > 1 ? (len - pw) / (n2 - 1) : 0;
                for (let i = 0; i < n2; i++) { const p = R5(s[0] + (n2 > 1 ? i * st : (len - pw) / 2)); if (hz) b.decor('wall_h', p, y0 - R5(ww[1] * 0.4), { force: true }); else b.decor('wall_v', x0 - R5(wv[0] / 2), p, { force: true }); } });
        };
        b.fenceRect = (x, y, w, h, gap) => {   // cerca fechada com um portão; gap = {side:'b', at:xOuY, len}
            const fh = dsz('fence_h'), fv = dsz('fence_v'); gap = gap || { side: 'b', at: x + w / 2, len: 100 };
            const hrow = (yy, side) => { const n2 = Math.ceil(w / fh[0]); for (let i = 0; i < n2; i++) { const xx = x + i * fh[0]; if (gap.side === side && xx + fh[0] > gap.at - gap.len / 2 && xx < gap.at + gap.len / 2) continue; b.decor('fence_h', xx, yy, { force: true }); } };
            const vcol = (xx, side) => { const n2 = Math.ceil(h / fv[1]); for (let i = 0; i < n2; i++) { const yy = y + i * fv[1]; if (gap.side === side && yy + fv[1] > gap.at - gap.len / 2 && yy < gap.at + gap.len / 2) continue; b.decor('fence_v', xx, yy, { force: true }); } };
            hrow(y, 't'); hrow(y + h - fh[1], 'b'); vcol(x, 'l'); vcol(x + w - fv[0], 'r');
        };
        b.scatter = (n2, fn, reg, tries) => { reg = reg || [40, 40, W - 40, H - 40]; let ok = 0; const out = []; for (let t = 0; t < (tries || n2 * 40) && ok < n2; t++) { const o = fn(R5(reg[0] + rnd() * (reg[2] - reg[0])), R5(reg[1] + rnd() * (reg[3] - reg[1]))); if (o) { ok++; out.push(o); } } return out; };
        b.forest = (n2, reg, o) => { o = o || {}; return b.scatter(n2, (x, y) => b.tree(x, y, o.v ? o.v() : undefined, { pad: o.pad === undefined ? 12 : o.pad, padT: o.padT === undefined ? -34 : o.padT }), reg, n2 * 50); };
        b.mreq = []; b.extra = [];   // pedidos de criaturas (para completar as que não couberam: floresta/salas lotadas de cenário)
        b.mobs = (key, n2, reg, opt) => { const r = b.scatter(n2, (x, y) => b.mob(key, x, y, opt), reg, n2 * 80); b.mreq.push({ key, n: n2, got: r.length, reg: reg || [40, 40, W - 40, H - 40], opt }); return r; };
        // completa as criaturas que não acharam lugar: pode pisar em cenário NÃO sólido (ossos, flores, itens), nunca em sólido, água, zona segura ou fora do mapa
        b.topUp = () => {
            const solidAt = (x, y, w, h) => b.E.some((o) => { if (!o || o.active === false) return false; const t = o.type; if (t === 'paint' || t === 'ground_item' || t === 'fishing_spot' || t === 'farm_plot' || t === 'fire' || t === 'portal' || t === 'house_door') return false; if (t === 'decor' && !(CD()[o.kind] || {}).solid) return false; const hb = hbox(o); if (!hb) return false; const p = t === 'enemy' || t === 'npc' ? 14 : 8; return x - p < hb.x + hb.w && x + w + p > hb.x && y - p < hb.y + hb.h && y + h + p > hb.y; });
            for (const q of b.mreq) {
                const d = npcDB[q.key]; if (!d) continue; const w = d.w || 30, h = d.h || 30;
                for (let need = q.n - q.got, tries = 0; need > 0 && tries < 1500; tries++) {
                    const grow = Math.floor(tries / 300) * 150, r0 = q.reg, x0 = Math.max(40, r0[0] - grow), y0 = Math.max(40, r0[1] - grow), x1 = Math.min(W - 40 - w, r0[2] + grow), y1 = Math.min(H - 40 - h, r0[3] + grow);
                    if (x1 <= x0 || y1 <= y0) continue;
                    const x = R5(x0 + rnd() * (x1 - x0)), y = R5(y0 + rnd() * (y1 - y0));
                    if (b.safe.some((s) => Math.hypot(x + w / 2 - s[0], y + h / 2 - s[1]) < s[2])) continue;
                    if (hitM(WATER, x, y + h * 0.5, w, h * 0.5) || solidAt(x, y, w, h)) continue;
                    const o = { id: nid(), type: 'enemy', dbKey: q.key, name: d.name, x, y, w, h, hp: d.hp, maxHp: d.hp, attackCooldown: 0, active: true };
                    b.E.push(o); b.extra.push(o); occAdd({ x, y, w, h, t: 'enemy' }); need--; q.got++;
                }
            }
        };
        b.decors = (kind, n2, reg, opt) => b.scatter(n2, (x, y) => b.decor(kind, x, y, opt), reg, n2 * 50);
        b.finish = (gx, gy) => { try { b.topUp(); } catch (e) { console.error('[maps2] topUp ' + id, e); } return { id, name, catalogV: 2, width: W, height: H, color, gridX: gx, gridY: gy, spawn: b.spawn || { x: R5(W / 2), y: R5(H / 2) }, entities: b.E }; };
        return b;
    }

    /* ---------- auxiliares de composição (aros de rochas, masmorras em salas) ---------- */
    const ring = (b, kind, stepX, stepY, o) => {   // fileira fechada de objetos sólidos junto às bordas (rochas...)
        o = o || {}; const s = dsz(kind), W = b.W, H = b.H, m = o.m || 0, sides = o.sides || 'tblr'; const J = (v) => (b.rnd() - 0.5) * v; const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        const pos = (len, sz, step) => { const n = Math.ceil((len - sz) / step) + 1, st = n > 1 ? (len - sz) / (n - 1) : 0; return Array.from({ length: n }, (_, i) => i * st); };
        const T = o.tone;
        if (sides.includes('t')) pos(W - 2 * m, s[0], stepX).forEach((x) => b.decor(kind, cl(m + x + J(6), 0, W - s[0]), cl(m + (o.top || 0) + J(4), 0, H - s[1]), { force: true, tone: T }));
        if (sides.includes('b')) pos(W - 2 * m, s[0], stepX).forEach((x) => b.decor(kind, cl(m + x + J(6), 0, W - s[0]), cl(H - s[1] - m - (o.bot || 0) + J(4), 0, H - s[1]), { force: true, tone: T }));
        if (sides.includes('l')) pos(H - 2 * m - (o.from || 0), s[1], stepY).forEach((y) => b.decor(kind, cl(m + (o.left || 0) + J(4), 0, W - s[0]), cl(m + (o.from || 0) + y + J(6), 0, H - s[1]), { force: true, tone: T }));
        if (sides.includes('r')) pos(H - 2 * m - (o.from || 0), s[1], stepY).forEach((y) => b.decor(kind, cl(W - s[0] - m - (o.right || 0) + J(4), 0, W - s[0]), cl(m + (o.from || 0) + y + J(6), 0, H - s[1]), { force: true, tone: T }));
    };
    const DGAP = 130;
    // masmorra em grade de salas: xs/ys são as linhas divisórias (inclui as bordas); doors = [[coluna,linha,'r'|'d'],...] (passagem entre a sala e a da direita/de baixo)
    const gridWalls = (b, xs, ys, doors, o) => {
        o = o || {}; const open = new Set(doors.map((d) => d[0] + ',' + d[1] + ',' + d[2])); const off = o.off || {};
        for (let i = 1; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) { const mid = (ys[j] + ys[j + 1]) / 2 + (off[i + ',' + j + ',v'] || 0), g = open.has((i - 1) + ',' + j + ',r') ? [[mid - DGAP / 2, mid + DGAP / 2]] : []; b.wallLine(xs[i], ys[j], xs[i], ys[j + 1], g); g.forEach((q) => b.reserve(xs[i] - 70, q[0] - 10, 140, DGAP + 20)); }
        for (let j = 1; j < ys.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) { const mid = (xs[i] + xs[i + 1]) / 2 + (off[i + ',' + j + ',h'] || 0), g = open.has(i + ',' + (j - 1) + ',d') ? [[mid - DGAP / 2, mid + DGAP / 2]] : []; b.wallLine(xs[i], ys[j], xs[i + 1], ys[j], g); g.forEach((q) => b.reserve(q[0] - 10, ys[j] - 70, DGAP + 20, 140)); }
    };
    const roomRect = (xs, ys, i, j, inset) => [xs[i] + inset, ys[j] + inset, xs[i + 1] - inset, ys[j + 1] - inset];
    const floors = (b, xs, ys, kinds) => { for (let j = 0; j < ys.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) { const k = (kinds && kinds[j * (xs.length - 1) + i]) || 'stone'; b.paint(k, xs[i], ys[j], xs[i + 1] - xs[i], ys[j + 1] - ys[j]); } };

    /* ============================ DEFINIÇÃO DOS MAPAS ============================ */
    const MAPS = {};
    const LINKS = [];   // [id, mapaA, portaA, mapaB, portaB, rótuloEmA, rótuloEmB]  (porta: chave de porta do mapa novo, ou {hint:[x,y],face} para mapa antigo)
    const def = (id, o) => { MAPS[id] = Object.assign({ id }, o); };
    const link = (id, a, pa, b2, pb, la, lb) => LINKS.push([id, a, pa, b2, pb, la, lb]);
    // variantes de árvore: 0 carvalho, 1 pinheiro, 2 bétula
    const VOAK = (b) => () => (b.rnd() < 0.7 ? 0 : 2), VPINE = (b) => () => (b.rnd() < 0.88 ? 1 : 2), VMIX = (b) => () => Math.floor(b.rnd() * 3), VBIRCH = (b) => () => (b.rnd() < 0.6 ? 2 : 0);
    const HB = (b) => (st, x, bottom, o) => { const s = bsz(st); return b.house(st, x, bottom - s[1], o); };   // prédio pela base (a porta fica virada para baixo)
    const flora = (b, n1, n2, n3, reg) => { b.decors('flowers', n1, reg); b.decors('bush', n2, reg); b.decors('mushrooms', n3, reg); };
    const lampRow = (b, x0, x1, y, step) => { for (let x = x0; x <= x1; x += step) b.decor('lamp', x, y, { onPath: true, force: true }); };

    /* ---------- 1. Campos de Aldeburgo (fazendas, Nv 1-5) ---------- */
    def('campos', { idx: 1, name: 'Campos de Aldeburgo', lvl: '1-5', w: 2000, h: 1400, color: '#5f8c3a', gx: 1, gy: 1, build(b) {
        const H2 = HB(b);
        b.port('w', 190, 700, 'right'); b.port('e', 1810, 700, 'left');
        b.road([[190, 700], [1810, 700]], 110, { amp: 36 }); b.road([[1000, 700], [1000, 1000]], 90);
        // sede da fazenda, ao norte da estrada
        H2('windmill', 520, 585); H2('cottage', 820, 585); H2('barn', 1080, 585);
        b.npc('farmer_npc', 1010, 620, 'Fazendeiro Tobias'); b.decor('well', 760, 450); b.decor('haystack', 1360, 450); b.decor('haystack', 1420, 480); b.decor('cart', 1380, 535); b.decor('sign', 1120, 610, { onPath: true }); b.decor('barrel', 790, 540);
        // lavoura ao sul, com terra revirada embaixo
        b.paint('dirt', 846, 850, 236, 190); b.paint('dirt', 846, 1056, 236, 150);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) b.plot(860 + c * 70, 864 + r * 60, { force: true });
        for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) b.plot(860 + c * 70, 1070 + r * 60, { force: true });
        b.fenceRect(820, 830, 288, 380, { side: 't', at: 1000, len: 110 });
        // currais
        b.fenceRect(240, 880, 440, 290, { side: 't', at: 520, len: 110 }); b.fenceRect(1260, 860, 420, 290, { side: 't', at: 1440, len: 110 });
        b.mobs('cow_base', 3, [270, 920, 650, 1130]); b.mobs('sheep_base', 3, [270, 920, 650, 1130]); b.mobs('chicken_base', 4, [1290, 900, 1650, 1110]); b.mobs('pig_base', 2, [1290, 900, 1650, 1110]);
        // lagoa com pesca
        b.lake(1580, 330, 210, 110, { irr: 0.2 }); b.fish(1500, 318); b.fish(1640, 350); b.npc('fisher_npc', 1390, 340, 'Pescador Ludo');
        b.decors('lily', 5, [1400, 240, 1760, 420], { onWater: true }); b.decors('reeds', 6, [1360, 220, 1800, 460], { onWater: true });
        b.fire(300, 600); b.decor('campfire', 240, 560);
        // natureza
        b.treeBorder({ v: VOAK(b) }); b.forest(46, [60, 60, 1940, 560], { v: VOAK(b) }); b.forest(30, [60, 1250, 1940, 1340], { v: VOAK(b) }); b.forest(10, [60, 700, 240, 1300], { v: VMIX(b) });
        flora(b, 26, 14, 6, [60, 60, 1940, 1340]); b.decors('stump', 4, [60, 60, 1940, 1340]);
        // bichos selvagens
        b.mobs('rabbit_base', 6, [60, 60, 1940, 1340]); b.mobs('slime_base', 3, [1250, 440, 1800, 600]); b.mobs('goblin_base', 3, [1560, 80, 1900, 260]); b.mobs('boar_base', 2, [100, 1240, 600, 1340]); b.mobs('wolf_base', 2, [100, 80, 600, 300]); b.mobs('rat_base', 3, [700, 1260, 1300, 1340]);
    } });

    /* ---------- 2. Estrada do Rei (Nv 3-6) ---------- */
    def('estrada_rei', { idx: 2, name: 'Estrada do Rei', lvl: '3-6', w: 1600, h: 700, color: '#587f36', gx: 2, gy: 1, build(b) {
        b.port('w', 190, 350, 'right'); b.port('e', 1410, 350, 'left');
        b.road([[190, 350], [1410, 350]], 100, { amp: 44 });
        // riacho com ponte de pedra
        b.lake(800, 140, 70, 110, { irr: 0.1 }); b.lake(800, 560, 70, 110, { irr: 0.1 }); b.paint('water', 730, 250, 140, 200); b.paint('stone', 730, 300, 140, 100);
        b.decor('lamp', 715, 250, { onPath: true, force: true }); b.decor('lamp', 715, 400, { onPath: true, force: true }); b.decor('lamp', 875, 250, { onPath: true, force: true }); b.decor('lamp', 875, 400, { onPath: true, force: true });
        b.decor('sign', 1180, 270, { onPath: true }); b.decor('sign', 420, 410, { onPath: true }); b.decor('cart', 300, 430); b.decor('barrel', 360, 450); b.decor('crates', 260, 470);
        // pouso de viajantes
        b.house('tent', 1000, 196); b.decor('campfire', 1110, 250); b.fire(1050, 300); b.decor('barrel', 1170, 210); b.npc('guard_npc', 1250, 300, 'Patrulheiro Real');
        b.treeBorder({ v: VOAK(b) }); b.forest(10, [60, 120, 720, 600], { v: VOAK(b) }); b.forest(10, [900, 120, 1540, 600], { v: VOAK(b) });
        flora(b, 14, 8, 3, [60, 100, 1540, 600]);
        b.mobs('goblin_base', 3, [420, 160, 700, 280]); b.mobs('boar_base', 2, [900, 440, 1300, 580]); b.mobs('wolf_base', 2, [900, 120, 1200, 200]); b.mobs('goblin_base', 2, [1200, 480, 1400, 590]); b.mobs('rabbit_base', 4, [60, 100, 1540, 600]);
    } });

    /* ---------- 3. Vila Real (cidade comercial e sede da Coroa) ---------- */
    const doorPath = (b, x, bottom, toY, w) => b.paint('dirt', x - (w || 70) / 2, bottom, w || 70, toY - bottom, true);
    def('vila_real', { idx: 3, name: 'Vila Real', lvl: 'cidade', w: 1800, h: 1300, color: '#5b8b3d', gx: 3, gy: 1, build(b) {
        const H2 = HB(b); b.wallBorder();
        b.port('w', 150, 700, 'right', { safe: 100 }); b.port('e', 1650, 700, 'left', { safe: 100 }); b.port('s', 900, 1150, 'up', { safe: 100 });
        b.road([[150, 700], [1650, 700]], 120, { kind: 'stone' }); b.paint('stone', 700, 550, 400, 300, true); b.paint('stone', 840, 500, 120, 60, true); b.road([[900, 850], [900, 1170]], 110, { kind: 'stone' });
        // fileira norte
        H2('church', 130, 520); doorPath(b, 261, 520, 640); H2('cottage', 430, 520); doorPath(b, 521, 520, 640);
        H2('castle', 672, 520, { onPath: true }); H2('townhouse', 1170, 520); doorPath(b, 1271, 520, 640); H2('tavern', 1390, 520); doorPath(b, 1530, 520, 640);
        // fileira sul
        H2('cottage', 140, 968); H2('cottage', 330, 1000);
        H2('wizard_tower', 530, 1170);
        H2('smithy', 1160, 1010); H2('cottage', 1490, 1010);
        // praça
        b.decor('fountain', 846, 652, { onPath: true, force: true }); b.decor('statue', 742, 680, { onPath: true, force: true }); b.decor('statue', 1006, 680, { onPath: true, force: true });
        [[706, 556], [1070, 556], [706, 772], [1070, 772]].forEach((p) => b.decor('lamp', p[0], p[1], { onPath: true, force: true }));
        b.bank(730, 572, { force: true }); b.bank(990, 572, { force: true });
        // rua do mercado
        [[680, 872], [680, 1022], [966, 872], [966, 1022]].forEach((p) => b.house('market', p[0], p[1], { onPath: true, force: true }));
        b.decor('crates', 640, 1000, { onPath: true }); b.decor('barrel', 1124, 1000, { onPath: true }); b.decor('barrel', 1124, 1040, { onPath: true }); b.decor('cart', 1120, 900, { onPath: true }); b.decor('sign', 800, 1100, { onPath: true });
        // estações
        b.furnace(1430, 850); b.anvil(1426, 940); b.cauldron(470, 580); b.enchant(440, 1190); b.fire(1560, 580); b.decor('well', 560, 880); b.decor('well', 1300, 1150);
        // gente
        b.npc('guard_npc', 200, 640, 'Guarda do Portão Oeste'); b.npc('guard_npc', 1580, 640, 'Guarda do Portão Leste'); b.npc('guard_npc', 850, 524, 'Capitão Reinaldo'); b.npc('guard_npc', 960, 524, 'Sentinela Real');
        b.npc('merchant_base', 858, 920, 'Mercadora Elda'); b.npc('merchant_base', 920, 1070, 'Mercador Zahir'); b.npc('guide_npc', 810, 780, 'Guia de Vila Real');
        b.npc('priest_npc', 330, 560, 'Padre Anselmo'); b.npc('barkeep_npc', 1480, 560, 'Taverneira Berta'); b.npc('smith_npc', 1380, 900, 'Mestre Ferreiro Gorm'); b.npc('wizard_npc', 560, 1195, 'Maga Isolda');
        // verde
        lampRow(b, 240, 640, 560, 200); lampRow(b, 1140, 1620, 560, 240);
        b.forest(24, [60, 60, 1740, 1240], { v: VOAK(b) }); flora(b, 34, 18, 4, [60, 60, 1740, 1240]); b.decors('barrel', 6, [60, 60, 1740, 1240]); b.decors('crates', 4, [60, 60, 1740, 1240]);
    } });
    link('l_lum_campos', 'lumbridge', { hint: [1780, 840], face: 'left' }, 'campos', 'w', 'Campos de Aldeburgo →', '← Vila de Aldeburgo');
    link('l_campos_estrada', 'campos', 'e', 'estrada_rei', 'w', 'Estrada do Rei →', '← Campos de Aldeburgo');
    link('l_estrada_vila', 'estrada_rei', 'e', 'vila_real', 'w', 'Vila Real →', '← Estrada do Rei');

    /* ============================ OESTE: trilha élfica, Silvaluz, torre do mago ============================ */
    def('trilha_elfica', { idx: 4, name: 'Trilha Élfica', lvl: '6-10', w: 700, h: 1600, color: '#44814a', gx: -2, gy: 0, build(b) {
        b.port('s', 350, 1380, 'up'); b.port('n', 350, 220, 'down');
        b.road([[350, 1380], [350, 220]], 100, { amp: 50 });
        // cristais élficos iluminam o caminho
        for (let y = 1300; y > 250; y -= 230) { b.decor('crystal', 250 + (y % 2 ? 0 : 20), y, { onPath: true }); b.decor('crystal', 420, y - 90, { onPath: true }); }
        b.decor('statue', 232, 760, { onPath: true }); b.decor('flowers', 420, 770, { onPath: true }); b.decor('sign', 420, 1330, { onPath: true }); b.decor('sign', 250, 360, { onPath: true });
        b.house('watchtower', 130, 900); b.fire(240, 1120); b.decor('campfire', 140, 1130);
        b.treeBorder({ v: VBIRCH(b) }); b.forest(26, [60, 120, 640, 1500], { v: VBIRCH(b) }); b.forest(10, [60, 120, 640, 1500], { v: VPINE(b) });
        flora(b, 16, 8, 8, [60, 100, 640, 1500]);
        b.mobs('wolf_base', 3, [60, 300, 640, 900]); b.mobs('spider_base', 3, [60, 900, 640, 1250]); b.mobs('boar_base', 2, [60, 600, 640, 900]); b.mobs('goblin_base', 2, [400, 250, 640, 600]); b.mobs('orc_base', 1, [60, 1000, 300, 1250]); b.mobs('deer_base', 2, [60, 400, 640, 1200]);
    } });

    def('silvaluz', { idx: 5, name: 'Bosque Élfico de Silvaluz', lvl: '12-20', w: 2000, h: 1400, color: '#3d7a4a', gx: -3, gy: 0, build(b) {
        const H2 = HB(b);
        b.port('e', 1810, 1160, 'left'); b.port('w', 190, 560, 'right');
        // clareira central: círculo de pedras, torres e fonte
        b.paint('stone', 830, 520, 340, 300, true); b.road([[1000, 820], [1000, 960], [1700, 960], [1700, 1160], [1810, 1160]], 80, { amp: 0 }); b.road([[1000, 520], [1000, 400], [300, 400], [300, 560], [190, 560]], 80);
        H2('wizard_tower', 700, 560); H2('wizard_tower', 1180, 560);
        b.decor('fountain', 946, 612, { onPath: true, force: true }); b.decor('statue', 860, 560, { onPath: true, force: true }); b.decor('statue', 1090, 560, { onPath: true, force: true }); b.decor('crystal', 880, 720, { onPath: true, force: true }); b.decor('crystal', 1080, 720, { onPath: true, force: true });
        b.npc('wizard_npc', 960, 760, 'Anciã Lorelei'); b.npc('guide_npc', 1040, 740, 'Sentinela Aelin'); b.npc('merchant_base', 790, 800, 'Mercadora de Ervas'); b.cauldron(1120, 760); b.enchant(840, 820);
        b.lake(400, 1050, 190, 120, { irr: 0.15 }); b.fish(330, 1040); b.fish(450, 1080); b.decors('lily', 6, [230, 930, 590, 1170], { onWater: true }); b.decors('reeds', 6, [200, 900, 620, 1200], { onWater: true });
        // cristais espalhados
        b.decors('crystal', 14, [60, 60, 1940, 1340]); b.decors('statue', 3, [60, 60, 1940, 1340]);
        b.treeBorder({ v: VPINE(b) }); b.forest(70, [60, 60, 1940, 1340], { v: VBIRCH(b) }); b.forest(30, [60, 60, 1940, 1340], { v: VPINE(b) });
        flora(b, 34, 18, 14, [60, 60, 1940, 1340]); b.decors('stump', 5, [60, 60, 1940, 1340]);
        b.mobs('deer_base', 5, [60, 60, 1940, 1340]); b.mobs('rabbit_base', 4, [60, 60, 1940, 1340]);
        b.mobs('dire_wolf', 4, [1200, 100, 1900, 900]); b.mobs('venom_spider', 4, [100, 900, 900, 1340]); b.mobs('forest_wisp', 4, [1100, 1000, 1700, 1340]); b.mobs('boar_base', 2, [1300, 100, 1900, 500]); b.mobs('spider_base', 2, [100, 100, 700, 400]);
        b.decor('crystal', 300, 240, { force: false }); b.mobs('ent_elder', 1, [240, 160, 560, 330]);
    } });
    link('l_floresta_trilha', 'floresta', { hint: [120, 720], face: 'right' }, 'trilha_elfica', 's', 'Trilha Élfica →', '← Floresta Sombria');
    link('l_trilha_silva', 'trilha_elfica', 'n', 'silvaluz', 'e', 'Bosque de Silvaluz →', '← Trilha Élfica');

    def('torre_mago', { idx: 6, name: 'Masmorra da Torre do Mago', lvl: '34-65', w: 1600, h: 1400, color: '#15121f', gx: -4, gy: 0, build(b) {
        const xs = [0, 540, 1060, 1600], ys = [0, 470, 930, 1400];
        b.wallBorder(); floors(b, xs, ys, ['stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone']);
        // salas: (0,0) biblioteca, (1,0) sala do mago, (2,0) laboratório; (0,1) corredor W, (1,1) salão, (2,1) corredor E; (0,2) oficina, (1,2) entrada, (2,2) câmara de cristais
        gridWalls(b, xs, ys, [[1, 1, 'd'], [0, 2, 'r'], [1, 2, 'r'], [0, 1, 'r'], [1, 1, 'r'], [1, 0, 'd'], [0, 0, 'd'], [2, 0, 'd']], { off: {} });
        b.port('s', 800, 1260, 'up');
        const R = (i, j, m) => roomRect(xs, ys, i, j, m || 80);
        // entrada
        b.decor('lamp', 600, 1160); b.decor('lamp', 950, 1160); b.decors('banner', 2, R(1, 2)); b.decors('crystal', 3, R(1, 2));
        // câmara de cristais (SE) e oficina (SW)
        b.decors('crystal', 7, R(2, 2)); b.decors('statue', 2, R(2, 2)); b.cauldron(260, 1180); b.cauldron(340, 1180, { force: false }); b.enchant(160, 1060); b.decors('barrel', 4, R(0, 2)); b.decors('crates', 3, R(0, 2)); b.decors('mushrooms', 6, R(0, 2));
        // salão central: colunas e chama azul
        [[700, 640], [880, 640], [700, 760], [880, 760]].forEach((p) => b.decor('pillar', p[0], p[1], { onPath: true, tone: 'grey' })); b.decors('crystal', 4, R(1, 1)); b.decors('lamp', 3, R(1, 1));
        b.decors('bones', 4, R(0, 1)); b.decors('crystal', 3, R(0, 1)); b.decors('crystal', 3, R(2, 1)); b.decors('bones', 4, R(2, 1));
        // biblioteca (NW) e laboratório (NE)
        b.decors('crates', 6, R(0, 0)); b.decors('barrel', 3, R(0, 0)); b.decors('lamp', 3, R(0, 0)); b.decors('crystal', 3, R(2, 0)); b.cauldron(1340, 200); b.decors('statue', 2, R(2, 0));
        // sala do mago
        b.decor('statue', 600, 100, { force: true }); b.decor('statue', 940, 100, { force: true }); b.decor('banner', 660, 70, { force: true }); b.decor('banner', 880, 70, { force: true }); b.decors('crystal', 4, R(1, 0)); b.enchant(760, 340);
        b.item('Mana Potion', 1300, 330, 2); b.item('Soul Gem', 740, 300, 1); b.item('Greater Health Potion', 120, 330, 2); b.item('Coins', 180, 1290, 400);
        // criaturas
        b.mobs('apprentice', 3, R(0, 1)); b.mobs('apprentice', 3, R(2, 1)); b.mobs('arcane_golem', 2, R(1, 1)); b.mobs('darkmage_base', 3, R(0, 2)); b.mobs('ghost_base', 2, R(2, 2)); b.mobs('darkmage_base', 2, R(0, 0)); b.mobs('apprentice', 2, R(2, 0)); b.mobs('arcane_golem', 1, R(2, 2)); b.mobs('mad_mage', 1, [680, 180, 880, 340]);
    } });
    link('l_silva_torre', 'silvaluz', 'w', 'torre_mago', 's', 'Torre do Mago Louco →', '← Bosque de Silvaluz');

    /* ============================ SUL: costa, Porto de Marés, praia, pântano, covil goblin ============================ */
    def('estrada_costa', { idx: 7, name: 'Estrada da Costa', lvl: '4-8', w: 700, h: 1600, color: '#bdb27c', gx: -1, gy: 2, build(b) {
        b.port('n', 480, 220, 'down'); b.port('s', 480, 1380, 'up');
        // mar a oeste, cercado de rochas
        b.paint('water', 40, 40, 170, 1520); ring(b, 'boulder', 50, 38, { sides: 'l', left: 228, tone: 'grey' }); ring(b, 'boulder', 50, 38, { sides: 'tb', m: 0 });
        b.paint('grass', 300, 260, 340, 420); b.paint('grass', 280, 1000, 360, 300);
        b.road([[480, 220], [480, 1380]], 100, { amp: 44 });
        b.decors('boat', 2, [50, 200, 120, 1300], { onWater: true }); b.decor('boat', 60, 260, { onWater: true }); b.decor('boat', 70, 880, { onWater: true }); b.decor('netrack', 250, 640); b.decor('netrack', 252, 1240);
        b.decor('sign', 560, 290, { onPath: true }); b.decor('lamp', 560, 700, { onPath: true }); b.decor('lamp', 560, 1120, { onPath: true }); b.decor('cart', 330, 420); b.decor('barrel', 400, 470); b.house('tent', 360, 900); b.decor('campfire', 470, 940); b.npc('fisher_npc', 420, 1010, 'Velho Marujo Tião');
        ring(b, 'boulder', 50, 38, { sides: 'r', tone: 'sand' }); b.forest(8, [540, 100, 600, 1500], { v: VOAK(b) }); b.decors('palm', 10, [260, 120, 660, 1500]); b.forest(6, [280, 120, 660, 1500], { v: VOAK(b) }); b.decors('boulder', 8, [260, 120, 660, 1500], { tone: 'sand' }); b.decors('bush', 8, [260, 120, 660, 1500]); b.decors('flowers', 10, [260, 120, 660, 1500]); b.decors('bones', 3, [260, 120, 660, 1500]);
        b.mobs('salt_slime', 3, [260, 360, 640, 900]); b.mobs('snake_base', 3, [260, 500, 640, 1300]); b.mobs('boar_base', 2, [260, 300, 640, 700]); b.mobs('goblin_base', 2, [260, 900, 640, 1300]); b.mobs('drowned', 2, [260, 900, 640, 1350]); b.mobs('rabbit_base', 2, [260, 200, 640, 1400]);
    } });
    // borda leste: árvores (o lado oeste é o mar, com rochas)

    def('porto_mares', { idx: 8, name: 'Porto de Marés', lvl: 'cidade portuária', w: 1800, h: 1300, color: '#b4ad7d', gx: -1, gy: 3, build(b) {
        const H2 = HB(b);
        b.port('n', 900, 220, 'down', { safe: 100 }); b.port('w', 190, 620, 'right', { safe: 100 });
        // enseada ao sul (rasa, cercada de rochas) com cais de madeira
        b.paint('water', 40, 900, 1720, 360); ring(b, 'boulder', 52, 40, { sides: 'b', m: 6, bot: 6, tone: 'grey' });
        b.road([[900, 220], [900, 560]], 110, { kind: 'stone' }); b.road([[190, 620], [1650, 620]], 120, { kind: 'stone' }); b.paint('stone', 720, 520, 360, 240, true);
        b.paint('stone', 120, 780, 1560, 110, true);   // calçadão
        // cais: dois píeres de tábuas (terra) para dentro da água
        [[300, 890, 90, 300], [880, 890, 90, 300], [1420, 890, 90, 300]].forEach((p) => b.paint('dirt', p[0], p[1], p[2], p[3], true));
        // prédios
        H2('tavern', 1180, 520); H2('cottage', 1490, 520); H2('townhouse', 440, 520); H2('cottage', 230, 520);
        H2('market', 600, 780, { onPath: true }); H2('market', 1140, 780, { onPath: true }); H2('smithy', 1300, 1000 - 240, { onPath: true });
        b.paint('dirt', 1350, 600, 70, 40, true);
        b.bank(740, 540, { force: true }); b.decor('fountain', 878, 560, { onPath: true, force: true }); b.decor('lamp', 690, 584, { onPath: true, force: true }); b.decor('lamp', 1050, 620, { onPath: true, force: true });
        // redes, barris e barcos
        [[180, 780], [520, 800], [1060, 800], [1420, 800], [1600, 790]].forEach((p, i) => b.decor(i % 2 ? 'crates' : 'barrel', p[0], p[1], { onPath: true }));
        b.decor('netrack', 360, 790, { onPath: true }); b.decor('netrack', 1240, 790, { onPath: true }); b.decor('sign', 820, 790, { onPath: true });
        [[150, 1030], [420, 1100], [650, 1000], [1110, 1060], [1260, 1150], [1560, 1030], [1650, 1130]].forEach((p) => b.decor('boat', p[0], p[1], { onWater: true }));
        b.fish(480, 1000); b.fish(760, 1100); b.fish(1100, 980); b.fish(1350, 1100); b.fish(1580, 1140); b.fish(230, 1150);
        b.decors('lily', 4, [100, 930, 1700, 1200], { onWater: true }); b.decors('reeds', 4, [100, 910, 1700, 1000], { onWater: true });
        b.fire(1000, 880, { onPath: true }); b.fire(500, 850, { onPath: true });
        // gente
        b.npc('guard_npc', 960, 580, 'Capitão do Porto'); b.npc('fisher_npc', 420, 880, 'Pescadora Nalu'); b.npc('fisher_npc', 1130, 870, 'Mestre Pescador Osvaldo'); b.npc('merchant_base', 680, 740, 'Mercador de Redes'); b.npc('guide_npc', 860, 720, 'Guia do Porto');
        b.npc('barkeep_npc', 1290, 560, 'Taverneiro Zeca'); b.npc('smith_npc', 1420, 730, 'Ferreiro Naval Bruno'); b.npc('priest_npc', 330, 580, 'Irmã Maris');
        b.furnace(1500, 900, { onPath: false }); b.anvil(1560, 950);
        // verde e rochas
        b.treeBorder({ sides: 'tlr', ymax: 950, v: VOAK(b) }); ring(b, 'boulder', 50, 38, { sides: 'lr', from: 1050, tone: 'grey' }); b.forest(14, [60, 60, 1740, 460], { v: VOAK(b) }); b.decors('palm', 8, [60, 60, 1740, 480]); b.decors('boulder', 8, [60, 60, 1740, 480], { tone: 'sand' });
        flora(b, 18, 10, 2, [60, 60, 1740, 480]);
    } });
    // o porto usa bordas em árvores só nos três lados de terra; o sul é o mar
    link('l_rio_costa', 'rio', { hint: [340, 1240], face: 'up' }, 'estrada_costa', 'n', 'Estrada da Costa →', '← Vale do Rio');
    link('l_costa_porto', 'estrada_costa', 's', 'porto_mares', 'n', 'Porto de Marés →', '← Estrada da Costa');

    def('praia_naufragios', { idx: 9, name: 'Praia dos Naufrágios', lvl: '9-14', w: 2000, h: 1400, color: '#d1bd86', gx: -2, gy: 3, build(b) {
        b.port('e', 1810, 480, 'left');
        b.paint('water', 40, 900, 1920, 460); b.paint('water', 40, 640, 420, 260); ring(b, 'boulder', 52, 40, { sides: 'b', m: 6, bot: 6, tone: 'grey' }); ring(b, 'boulder', 50, 38, { sides: 'tlr', tone: 'sand' });
        b.road([[1810, 480], [1300, 480], [1300, 700], [760, 700]], 90, { amp: 0 });
        // restos de naufrágios na água rasa e na areia
        [[600, 1000], [1000, 1110], [1400, 1010], [260, 1150], [1720, 1160], [140, 700]].forEach((p) => b.decor('boat', p[0], p[1], { onWater: true }));
        b.decor('boat', 880, 620, { size: dsz('boat') }); b.decor('boat', 1480, 640); b.decors('bones', 10, [100, 100, 1900, 880]); b.decors('palm', 14, [60, 60, 1940, 880]); b.decors('boulder', 14, [60, 60, 1940, 880], { tone: 'sand' }); b.decors('bush', 8, [60, 60, 1940, 880]); b.decors('reeds', 6, [100, 620, 1900, 900], { onWater: true });
        // acampamento do náufrago
        b.house('tent', 640, 500); b.fire(780, 620); b.decor('campfire', 560, 600); b.decor('barrel', 740, 500); b.npc('fisher_npc', 820, 560, 'Náufrago Bento'); b.decor('crates', 530, 500);
        b.fish(400, 780); b.fish(300, 1000); b.fish(1100, 980);
        b.item('Coins', 1700, 800, 150); b.item('Health Potion', 1210, 220, 2); b.item('Raw Salmon', 300, 420, 3); b.item('Coins', 240, 300, 120);
        b.decors('flowers', 10, [100, 100, 1900, 880]); b.forest(6, [100, 100, 1900, 560], { v: VOAK(b) });
        b.mobs('drowned', 5, [200, 200, 1900, 880]); b.mobs('salt_slime', 4, [200, 200, 1900, 880]); b.mobs('snake_base', 3, [200, 200, 1900, 880]); b.mobs('skeleton_base', 3, [200, 100, 1200, 600]); b.mobs('slime_base', 2, [1200, 600, 1900, 880]); b.mobs('ghost_base', 2, [900, 100, 1700, 400]);
    } });
    link('l_porto_praia', 'porto_mares', 'w', 'praia_naufragios', 'e', 'Praia dos Naufrágios →', '← Porto de Marés');

    def('pantano', { idx: 10, name: 'Pântano de Brejo Negro', lvl: '10-16', w: 2000, h: 1400, color: '#43502c', gx: 0, gy: 2, build(b) {
        b.port('n', 1000, 220, 'down'); b.port('se', 1810, 1160, 'left');
        // lama (terra) e poças
        b.road([[1000, 220], [1000, 500], [1450, 500], [1450, 1160], [1810, 1160]], 90, { amp: 0 });
        b.lake(420, 420, 240, 150, { irr: 0.3 }); b.lake(1560, 280, 200, 110, { irr: 0.3 }); b.lake(560, 1020, 280, 150, { irr: 0.3 }); b.lake(1300, 900, 150, 90, { irr: 0.2 }); b.lake(250, 850, 130, 90);
        b.paint('dirt', 300, 600, 420, 120); b.paint('dirt', 1100, 1100, 300, 130); b.paint('dirt', 1650, 560, 260, 110);
        b.fish(380, 400); b.fish(520, 470); b.fish(1560, 270); b.fish(520, 1010); b.fish(660, 1060);
        b.decors('lily', 12, [200, 240, 1800, 1200], { onWater: true }); b.decors('reeds', 26, [120, 220, 1900, 1260], { onWater: true }); b.decors('reeds', 16, [120, 220, 1900, 1260]);
        // cabana da bruxa sobre palafitas
        b.house('cottage', 1080, 640); b.npc('wizard_npc', 1170, 850, 'Bruxa do Brejo'); b.cauldron(1260, 840); b.fire(1050, 880); b.decor('barrel', 1000, 780); b.decor('crates', 1290, 780);
        b.treeBorder({ v: VPINE(b) }); b.decors('deadtree', 28, [60, 60, 1940, 1340]); b.forest(30, [60, 60, 1940, 1340], { v: VBIRCH(b) }); b.decors('mushrooms', 18, [60, 60, 1940, 1340]); b.decors('bones', 8, [60, 60, 1940, 1340]); b.decors('stump', 8, [60, 60, 1940, 1340]); b.decors('bush', 10, [60, 60, 1940, 1340]);
        b.mobs('swamp_snake', 5, [100, 700, 1000, 1340]); b.mobs('bog_slime', 4, [100, 100, 1900, 1340]); b.mobs('marsh_wisp', 4, [100, 100, 900, 1340]); b.mobs('slime_base', 2, [1500, 600, 1900, 1100]); b.mobs('spider_base', 3, [1100, 100, 1900, 500]); b.mobs('rat_base', 3, [100, 100, 1900, 1340]); b.mobs('snake_base', 2, [1500, 850, 1900, 1100]);
    } });
    link('l_rio_pantano', 'rio', { hint: [1560, 1250], face: 'up' }, 'pantano', 'n', 'Pântano de Brejo Negro →', '← Vale do Rio');

    def('covil_goblins', { idx: 11, name: 'Covil dos Goblins', lvl: '8-28', w: 1600, h: 1200, color: '#241e14', gx: 0, gy: 3, build(b) {
        const xs = [0, 560, 1040, 1600], ys = [0, 400, 800, 1200];
        b.wallBorder(); floors(b, xs, ys, ['dirt', 'stone', 'dirt', 'dirt', 'dirt', 'dirt', 'dirt', 'dirt', 'dirt']);
        gridWalls(b, xs, ys, [[1, 1, 'd'], [0, 2, 'r'], [1, 2, 'r'], [0, 1, 'r'], [1, 1, 'r'], [1, 0, 'd'], [0, 0, 'd'], [2, 0, 'd']]);
        b.port('s', 800, 1070, 'up');
        const R = (i, j, m) => roomRect(xs, ys, i, j, m || 80);
        b.decor('lamp', 640, 960); b.decor('lamp', 930, 960); b.decors('barrel', 3, R(1, 2)); b.decors('crates', 2, R(1, 2)); b.decors('bones', 4, R(1, 2)); b.decors('mushrooms', 4, R(1, 2));
        // sudoeste: cercado de lobos e javalis; sudeste: forja improvisada
        b.decors('haystack', 3, R(0, 2)); b.decors('bones', 5, R(0, 2)); b.fire(200, 1040); b.decors('barrel', 3, R(2, 2)); b.anvil(1350, 1010); b.furnace(1430, 1000); b.decors('crates', 3, R(2, 2));
        // barracas (oeste) e covil do xamã (leste)
        b.house('tent', 100, 500); b.house('tent', 280, 440); b.house('tent', 120, 640); b.fire(360, 600); b.decors('bones', 4, R(0, 1)); b.decors('barrel', 2, R(0, 1));
        b.house('tent', 1300, 470); b.house('tent', 1150, 600); b.decors('crates', 3, R(2, 1)); b.decors('bones', 3, R(2, 1)); b.decors('mushrooms', 6, R(2, 1)); b.fire(1330, 660);
        // salão central
        b.fire(800, 600); b.decors('bones', 8, R(1, 1)); b.decors('barrel', 4, R(1, 1)); b.decors('crates', 3, R(1, 1)); b.decors('haystack', 2, R(1, 1)); b.decor('lamp', 600, 450); b.decor('lamp', 950, 450);
        // tesouros e trono
        b.decors('crates', 4, R(0, 0)); b.decors('barrel', 3, R(0, 0)); b.decors('crates', 4, R(2, 0)); b.decors('haystack', 2, R(2, 0)); b.item('Coins', 200, 200, 200); b.item('Iron Bar', 240, 150, 3); b.item('Health Potion', 1380, 260, 2); b.item('Steel Bar', 1340, 160, 2);
        b.decor('banner', 640, 70, { force: true }); b.decor('banner', 920, 70, { force: true }); b.decor('lamp', 590, 280); b.decor('lamp', 990, 280); b.decors('bones', 3, R(1, 0)); b.item('Coins', 760, 300, 300); b.item('Steel Bar', 830, 290, 2);
        b.mobs('goblin_base', 4, R(0, 1)); b.mobs('goblin_brute', 2, R(0, 1)); b.mobs('goblin_base', 3, R(2, 1)); b.mobs('goblin_brute', 2, R(2, 1)); b.mobs('orc_base', 2, R(1, 1)); b.mobs('goblin_brute', 2, R(1, 1)); b.mobs('goblin_base', 2, R(0, 0)); b.mobs('goblin_base', 2, R(2, 0)); b.mobs('wolf_base', 2, R(0, 2)); b.mobs('boar_base', 1, R(0, 2)); b.mobs('goblin_brute', 1, R(2, 2)); b.mobs('goblin_chief', 1, [700, 130, 880, 250]); b.mobs('goblin_brute', 2, [620, 120, 960, 330]);
    } });
    link('l_pantano_goblins', 'pantano', 'se', 'covil_goblins', 's', 'Covil dos Goblins →', '← Pântano de Brejo Negro');

    /* ============================ LESTE: estrada das areias, deserto, oásis, ruínas ============================ */
    const SAND = '#cdb57a', SANDD = '#b99d63';
    const sandRoad = (b, pts, w, o) => b.road(pts, w, Object.assign({ kind: SAND }, o || {}));
    def('estrada_areias', { idx: 12, name: 'Estrada das Areias', lvl: '10-14', w: 1600, h: 700, color: '#d3bf88', gx: 4, gy: 1, build(b) {
        b.port('w', 190, 350, 'right'); b.port('e', 1410, 350, 'left');
        ring(b, 'boulder', 52, 40, { sides: 'tblr', tone: 'sand' });
        b.paint(SANDD, 380, 120, 420, 120); b.paint(SANDD, 900, 470, 380, 110);
        sandRoad(b, [[190, 350], [1410, 350]], 100, { amp: 40 });
        // a estrada do rei termina aqui: posto de guarda e um acampamento de mercadores
        b.decor('sign', 300, 280, { onPath: true }); b.house('watchtower', 560, 160); b.decor('banner', 500, 250); b.decor('lamp', 330, 410, { onPath: true }); b.decor('lamp', 1250, 290, { onPath: true });
        b.house('tent', 880, 130); b.decor('campfire', 1020, 210); b.decor('cart', 740, 470); b.decor('barrel', 830, 440); b.decor('crates', 690, 440); b.npc('merchant_base', 960, 250, 'Caravaneiro Yusuf');
        b.decors('palm', 6, [240, 110, 1380, 620]); b.decors('cactus', 12, [240, 110, 1380, 620]); b.decors('boulder', 8, [240, 110, 1380, 620], { tone: 'sand' }); b.decors('bones', 5, [240, 110, 1380, 620]); b.decors('deadtree', 4, [240, 110, 1380, 620]); b.decors('bush', 6, [240, 110, 1380, 620]);
        b.item('Coins', 1200, 540, 80); b.item('Health Potion', 420, 560, 1);
        b.mobs('snake_base', 3, [420, 110, 1380, 620]); b.mobs('dune_snake', 4, [560, 110, 1380, 620]); b.mobs('goblin_base', 2, [420, 110, 1380, 620]); b.mobs('sand_skeleton', 2, [900, 110, 1380, 620]); b.mobs('rat_base', 2, [420, 110, 1380, 620]);
    } });
    link('l_vila_areias', 'vila_real', 'e', 'estrada_areias', 'w', 'Estrada das Areias →', '← Vila Real');

    def('deserto', { idx: 13, name: 'Deserto de Sahr', lvl: '14-22', w: 2000, h: 1400, color: '#dbc58c', gx: 5, gy: 1, build(b) {
        b.port('w', 190, 700, 'right'); b.port('e', 1810, 700, 'left');
        ring(b, 'boulder', 52, 40, { sides: 'tblr', tone: 'sand' });
        // dunas (manchas de areia mais escura) e uma trilha tortuosa marcada por ossos e cactos
        [[300, 180, 500, 200], [1100, 160, 560, 220], [200, 980, 560, 220], [1000, 1000, 640, 240], [760, 520, 420, 220], [1500, 820, 360, 200]].forEach((p) => b.paint(SANDD, p[0], p[1], p[2], p[3]));
        sandRoad(b, [[190, 700], [700, 700], [900, 480], [1300, 480], [1400, 700], [1810, 700]], 90, { amp: 30 });
        // caravana abandonada
        b.decor('cart', 560, 780, { onPath: true }); b.decor('crates', 640, 790, { onPath: true }); b.decor('barrel', 500, 820); b.house('tent', 430, 860); b.decor('campfire', 600, 880); b.decor('bones', 700, 860);
        // obelisco antigo
        b.decor('pillar', 1000, 300, { tone: 'sand', onPath: true }); b.decor('pillar', 1080, 300, { tone: 'sand', onPath: true }); b.decor('statue', 1040, 340, { onPath: true }); b.decor('sarcophagus', 1020, 420);
        b.decors('cactus', 22, [240, 100, 1760, 1300]); b.decors('palm', 6, [240, 100, 1760, 1300]); b.decors('boulder', 18, [240, 100, 1760, 1300], { tone: 'sand' }); b.decors('deadtree', 10, [240, 100, 1760, 1300]); b.decors('bones', 14, [240, 100, 1760, 1300]); b.decors('bush', 8, [240, 100, 1760, 1300]);
        b.item('Coins', 620, 950, 200); b.item('Health Potion', 1050, 380, 2); b.item('Iron Bar', 1480, 1120, 2); b.item('Coins', 280, 240, 150);
        b.mobs('dune_snake', 7, [300, 100, 1760, 1300]); b.mobs('sand_skeleton', 6, [300, 100, 1760, 1300]); b.mobs('sand_wraith', 3, [500, 100, 1760, 1300]); b.mobs('sand_golem', 2, [900, 700, 1760, 1300]); b.mobs('dune_snake', 3, [300, 100, 1000, 1300]); b.mobs('sand_skeleton', 2, [1100, 800, 1760, 1300]);
    } });
    link('l_areias_deserto', 'estrada_areias', 'e', 'deserto', 'w', 'Deserto de Sahr →', '← Estrada das Areias');

    def('oasis', { idx: 14, name: 'Oásis de Lahur', lvl: 'cidade do deserto', w: 1600, h: 1100, color: '#d6c184', gx: 6, gy: 1, build(b) {
        const H2 = HB(b);
        b.port('w', 190, 550, 'right', { safe: 100 }); b.port('e', 1410, 550, 'left', { safe: 100 });
        ring(b, 'boulder', 52, 40, { sides: 'tblr', tone: 'sand' });
        b.road([[190, 550], [1410, 550]], 110, { kind: 'stone' }); b.paint('stone', 640, 450, 320, 200, true);
        b.lake(800, 310, 250, 120, { irr: 0.15 });   // lago do oásis
        b.fish(700, 280); b.fish(840, 330); b.fish(930, 290); b.decors('lily', 3, [600, 230, 1000, 380], { onWater: true }); b.decors('reeds', 4, [560, 220, 1040, 400], { onWater: true });
        // casas de arenito e tendas
        H2('cottage', 260, 420); H2('townhouse', 1130, 430); H2('tavern', 1270, 420, { force: false }); H2('market', 440, 440, { onPath: false }); H2('market', 1040, 720);
        b.house('tent', 280, 700); b.house('tent', 420, 780); b.house('tent', 1180, 760); b.decor('campfire', 350, 880); b.decor('campfire', 1140, 880);
        b.bank(740, 480, { force: true }); b.decor('well', 880, 560, { onPath: true }); b.decor('lamp', 640, 500, { onPath: true }); b.decor('lamp', 950, 500, { onPath: true });
        b.furnace(1350, 700); b.anvil(1410, 750); b.cauldron(560, 760);
        b.npc('merchant_base', 700, 720, 'Mercadora Samira'); b.npc('guard_npc', 900, 470, 'Guarda do Oásis'); b.npc('fisher_npc', 640, 330, 'Pescador Hamid'); b.npc('guide_npc', 820, 650, 'Guia Nômade'); b.npc('barkeep_npc', 1340, 600, 'Taverneiro Khalil'); b.npc('priest_npc', 360, 640, 'Sacerdotisa Amara'); b.npc('smith_npc', 1400, 830, 'Ferreiro Tariq');
        b.decors('palm', 16, [230, 130, 1380, 1000]); b.decors('bush', 8, [230, 130, 1380, 1000]); b.decors('flowers', 14, [230, 130, 1380, 1000]); b.decors('barrel', 4, [230, 620, 1380, 1000]); b.decors('crates', 3, [230, 620, 1380, 1000]); b.decors('haystack', 2, [230, 620, 1380, 1000]);
    } });
    link('l_deserto_oasis', 'deserto', 'e', 'oasis', 'w', 'Oásis de Lahur →', '← Deserto de Sahr');

    def('ruinas', { idx: 15, name: 'Ruínas de Sahr-Kal', lvl: '28-45', w: 2000, h: 1400, color: '#cdb27a', gx: 7, gy: 1, build(b) {
        b.port('w', 190, 700, 'right', { safe: 160 });
        ring(b, 'boulder', 52, 40, { sides: 'tblr', tone: 'sand' });
        b.paint(SANDD, 240, 100, 420, 260); b.paint(SANDD, 1300, 1000, 520, 260);
        sandRoad(b, [[190, 700], [600, 700]], 90, { amp: 20 });
        // avenida de pilares até o templo do Faraó
        b.paint('stone', 600, 600, 900, 200, true);
        for (let x = 640; x <= 1400; x += 120) { b.decor('pillar', x, 580, { tone: 'sand', onPath: true, force: true }); b.decor('pillar', x, 780, { tone: 'sand', onPath: true, force: true }); }
        // templo: paredes com porta larga
        b.paint('stone', 1500, 380, 380, 640, true);
        b.wallLine(1500, 380, 1880, 380, []); b.wallLine(1500, 1000, 1880, 1000, []); b.wallLine(1880, 380, 1880, 1000, []); b.wallLine(1500, 380, 1500, 1000, [[590, 800]]);
        b.decor('sarcophagus', 1640, 620, { onPath: true }); b.decor('sarcophagus', 1760, 620, { onPath: true }); b.decor('statue', 1560, 440, { onPath: true }); b.decor('statue', 1800, 440, { onPath: true }); b.decor('lamp', 1580, 940, { onPath: true }); b.decor('lamp', 1800, 940, { onPath: true }); b.decor('crystal', 1700, 420, { onPath: true });
        b.item('Coins', 1680, 900, 500); b.item('Greater Health Potion', 1600, 940, 2); b.item('Soul Gem', 1780, 900, 1);
        b.decors('pillar', 10, [240, 100, 1460, 560], { tone: 'sand' }); b.decors('pillar', 8, [240, 840, 1460, 1300], { tone: 'sand' }); b.decors('sarcophagus', 5, [240, 100, 1460, 1300]); b.decors('statue', 4, [240, 100, 1460, 1300]); b.decors('boulder', 14, [240, 100, 1460, 1300], { tone: 'sand' }); b.decors('bones', 10, [240, 100, 1460, 1300]); b.decors('deadtree', 6, [240, 100, 1460, 1300]); b.decors('cactus', 8, [240, 100, 1460, 1300]);
        b.mobs('sand_skeleton', 7, [330, 100, 1460, 1300]); b.mobs('sand_wraith', 5, [330, 100, 1460, 1300]); b.mobs('sand_golem', 4, [330, 100, 1460, 1300]); b.mobs('dune_snake', 3, [330, 100, 1460, 1300]);
        b.mobs('mummy_king', 1, [1640, 760, 1760, 860]); b.mobs('sand_skeleton', 3, [1540, 500, 1840, 960]); b.mobs('sand_wraith', 2, [1540, 500, 1840, 960]);
    } });
    link('l_oasis_ruinas', 'oasis', 'e', 'ruinas', 'w', 'Ruínas de Sahr-Kal →', '← Oásis de Lahur');

    /* ============================ NORTE: serra, Pedralta, mina abandonada, passo e vale gelados ============================ */
    const SNOW = '#e3ecf3', SNOWD = '#c9d8e5', ICE = '#b7dcef';
    def('trilha_serra', { idx: 16, name: 'Trilha da Serra', lvl: '12-18', w: 700, h: 1600, color: '#8d9484', gx: 1, gy: -1, build(b) {
        b.port('s', 350, 1380, 'up'); b.port('n', 350, 220, 'down');
        ring(b, 'boulder', 50, 38, { sides: 'tblr', tone: 'grey' });
        b.paint('#7e8576', 90, 300, 200, 420); b.paint('#7e8576', 420, 880, 190, 420);
        b.road([[350, 1380], [350, 220]], 100, { amp: 60 });
        // trilha de cabras montesas: placas, carroça de mineiros e um acampamento
        b.decor('sign', 420, 1290, { onPath: true }); b.decor('cart', 230, 1100); b.decor('crates', 160, 1130); b.house('tent', 440, 700); b.decor('campfire', 330, 760); b.npc('guide_npc', 280, 800, 'Guia da Serra Ivo'); b.decor('barrel', 520, 790);
        b.decor('sign', 250, 360, { onPath: true }); b.decor('lamp', 450, 1000, { onPath: true }); b.decor('lamp', 260, 560, { onPath: true });
        b.forest(12, [90, 130, 620, 1480], { v: VPINE(b) }); b.decors('boulder', 14, [90, 130, 620, 1480], { tone: 'grey' }); b.decors('bush', 6, [90, 130, 620, 1480]); b.decors('flowers', 8, [90, 130, 620, 1480]); b.decors('stump', 4, [90, 130, 620, 1480]); b.decors('bones', 3, [90, 130, 620, 1480]);
        b.item('Coins', 160, 560, 90); b.item('Iron Ore', 520, 1100, 3);
        b.rock('rock_iron', 130, 420); b.rock('rock_iron', 560, 560); b.rock('rock_coal', 120, 1250);
        b.mobs('wolf_base', 3, [90, 300, 620, 1300]); b.mobs('orc_base', 3, [90, 300, 620, 1300]); b.mobs('goblin_brute', 2, [90, 300, 620, 1000]); b.mobs('troll_base', 1, [90, 300, 620, 800]); b.mobs('boar_base', 2, [90, 300, 620, 1300]); b.mobs('spider_base', 2, [90, 500, 620, 1300]);
    } });
    link('l_mina_serra', 'mina', { hint: [1660, 700], face: 'left' }, 'trilha_serra', 's', 'Trilha da Serra →', '← Mina de Pedralta');

    def('pedralta', { idx: 17, name: 'Pedralta', lvl: 'cidade mineira', w: 1800, h: 1300, color: '#85897a', gx: 1, gy: -2, build(b) {
        const H2 = HB(b); b.wallBorder();
        b.port('s', 900, 1150, 'up', { safe: 100 }); b.port('e', 1650, 650, 'left', { safe: 100 }); b.port('n', 900, 200, 'down', { safe: 100 });
        b.road([[900, 1150], [900, 200]], 110, { kind: 'stone' }); b.road([[250, 650], [1650, 650]], 110, { kind: 'stone' }); b.paint('stone', 740, 530, 320, 240, true);
        // oficinas de fundição a oeste, taverna e casas a leste
        H2('smithy', 240, 500); H2('smithy', 240, 1000); H2('market', 560, 500, { onPath: false }); H2('market', 1130, 500); H2('tavern', 1300, 500); H2('townhouse', 1500, 500, { force: false });
        H2('cottage', 560, 1000); H2('church', 1120, 1050); H2('cottage', 1350, 1040); H2('watchtower', 1560, 1050);
        b.furnace(420, 560, { force: false }); b.furnace(340, 930, { force: false }); b.anvil(440, 960); b.anvil(430, 600, { force: false }); b.cauldron(700, 960);
        b.bank(830, 560, { force: true }); b.bank(920, 560, { force: true }); b.decor('fountain', 846, 690, { onPath: true, force: true }); b.decor('lamp', 740, 560, { onPath: true }); b.decor('lamp', 1000, 560, { onPath: true }); b.decor('lamp', 740, 740, { onPath: true }); b.decor('lamp', 1000, 740, { onPath: true });
        b.decor('cart', 700, 340, { onPath: true }); b.decor('crates', 770, 350); b.decor('barrel', 1010, 330); b.decor('crates', 1080, 360); b.decor('well', 640, 740); b.decor('sign', 820, 1100, { onPath: true });
        b.npc('guard_npc', 780, 1090, 'Guarda do Portão Sul'); b.npc('guard_npc', 1580, 590, 'Guarda do Portão Leste'); b.npc('guard_npc', 960, 260, 'Guarda da Mina'); b.npc('smith_npc', 340, 760, 'Mestre Fundidor Borin'); b.npc('merchant_base', 720, 620, 'Mercadora Hilda'); b.npc('merchant_base', 1180, 720, 'Mercador Dorn');
        b.npc('guide_npc', 1040, 640, 'Guia de Pedralta'); b.npc('barkeep_npc', 1330, 590, 'Taverneiro Olaf'); b.npc('priest_npc', 1120, 1000, 'Irmão Matias'); b.npc('farmer_npc', 600, 1130, 'Velho Minério');
        b.forest(8, [130, 120, 1690, 1200], { v: VPINE(b) }); b.decors('boulder', 10, [130, 120, 1690, 1200], { tone: 'grey' }); b.decors('barrel', 5, [130, 120, 1690, 1200]); b.decors('crates', 4, [130, 120, 1690, 1200]); b.decors('bush', 8, [130, 120, 1690, 1200]); b.decors('flowers', 8, [130, 120, 1690, 1200]);
        b.rock('rock_iron', 120, 720, { force: false }); b.rock('rock_coal', 160, 780, { force: false });
    } });
    link('l_serra_pedralta', 'trilha_serra', 'n', 'pedralta', 's', 'Pedralta →', '← Trilha da Serra');

    def('mina_abandonada', { idx: 18, name: 'Mina Abandonada de Pedralta', lvl: '20-45', w: 1600, h: 1200, color: '#1d1a17', gx: 1, gy: -3, build(b) {
        const xs = [0, 560, 1040, 1600], ys = [0, 400, 800, 1200];
        b.wallBorder(); floors(b, xs, ys, ['stone', 'dirt', 'stone', 'dirt', 'dirt', 'dirt', 'dirt', 'stone', 'dirt']);
        gridWalls(b, xs, ys, [[1, 1, 'd'], [0, 2, 'r'], [1, 2, 'r'], [0, 1, 'r'], [1, 1, 'r'], [1, 0, 'd'], [0, 0, 'd'], [2, 0, 'd']]);
        b.port('s', 800, 1070, 'up');
        const R = (i, j, m) => roomRect(xs, ys, i, j, m || 80);
        b.lake(800, 610, 120, 70, { irr: 0.1 }); b.fish(750, 600); b.fish(850, 630);   // lago subterrâneo: pesca de caverna
        b.decor('lamp', 640, 960); b.decor('lamp', 930, 960); b.decors('cart', 2, R(1, 2)); b.decors('crates', 3, R(1, 2)); b.decors('barrel', 2, R(1, 2));
        b.decors('crates', 4, R(0, 2)); b.decors('bones', 4, R(0, 2)); b.fire(200, 1040); b.decors('barrel', 3, R(2, 2)); b.decors('cart', 1, R(2, 2)); b.decors('bones', 3, R(2, 2));
        b.rock('rock_iron', 120, 880); b.rock('rock_iron', 220, 920); b.rock('rock_coal', 1300, 880); b.rock('rock_coal', 1400, 930); b.rock('rock_mithril', 1480, 1040, { force: false });
        b.decors('boulder', 4, R(0, 1), { tone: 'dark' }); b.decors('bones', 4, R(0, 1)); b.decors('crates', 3, R(0, 1)); b.decors('lamp', 2, R(0, 1)); b.rock('rock_iron', 140, 520); b.rock('rock_coal', 210, 600);
        b.decors('boulder', 4, R(2, 1), { tone: 'dark' }); b.decors('bones', 4, R(2, 1)); b.decors('mushrooms', 6, R(2, 1)); b.rock('rock_coal', 1380, 500); b.rock('rock_iron', 1450, 600);
        b.decors('cart', 2, R(1, 1)); b.decors('bones', 6, R(1, 1)); b.decors('barrel', 3, R(1, 1)); b.decor('lamp', 600, 450); b.decor('lamp', 950, 450); b.decors('crates', 3, R(1, 1));
        b.decors('crates', 4, R(0, 0)); b.decors('bones', 3, R(0, 0)); b.item('Coins', 200, 200, 200); b.item('Iron Bar', 260, 160, 4); b.decors('crates', 4, R(2, 0)); b.decors('mushrooms', 5, R(2, 0)); b.item('Steel Bar', 1340, 160, 3); b.item('Greater Health Potion', 1400, 280, 2);
        b.decor('lamp', 590, 280); b.decor('lamp', 990, 280); b.decors('bones', 5, R(1, 0)); b.item('Coins', 760, 300, 400); b.item('Mithril Ore', 830, 290, 2);
        b.mobs('rat_base', 4, R(1, 2)); b.mobs('bat_base', 4, R(0, 2)); b.mobs('spider_base', 3, R(2, 2)); b.mobs('skeleton_base', 3, R(0, 1)); b.mobs('golem_base', 2, R(0, 1)); b.mobs('troll_base', 2, R(2, 1)); b.mobs('golem_base', 2, R(1, 1)); b.mobs('spider_base', 3, R(1, 1));
        b.mobs('troll_base', 2, R(0, 0)); b.mobs('golem_base', 2, R(2, 0)); b.mobs('bat_base', 3, R(2, 0)); b.mobs('troll_elder', 1, [700, 130, 880, 300]);
    } });
    link('l_pedralta_mina', 'pedralta', 'n', 'mina_abandonada', 's', 'Mina Abandonada →', '← Pedralta');

    def('passo_gelado', { idx: 19, name: 'Passo Gelado', lvl: '22-32', w: 1800, h: 800, color: SNOW, gx: 2, gy: -2, build(b) {
        b.port('w', 190, 400, 'right'); b.port('e', 1610, 400, 'left');
        ring(b, 'boulder', 50, 38, { sides: 'tblr', tone: 'snow' });
        [[300, 140, 420, 160], [900, 130, 500, 170], [400, 540, 560, 150], [1150, 520, 400, 170]].forEach((p) => b.paint(SNOWD, p[0], p[1], p[2], p[3]));
        b.paint(ICE, 680, 300, 360, 200); b.paint(ICE, 1250, 300, 200, 130);
        b.road([[190, 400], [1610, 400]], 100, { kind: '#b8a78a', amp: 30 });
        // posto de fronteira
        b.house('watchtower', 440, 180); b.decor('banner', 380, 250); b.house('tent', 520, 480); b.decor('campfire', 640, 560); b.fire(610, 500); b.npc('guard_npc', 420, 330, 'Sentinela do Passo'); b.npc('merchant_base', 700, 560, 'Mercador de Peles Ragnar'); b.decor('lamp', 330, 330, { onPath: true }); b.decor('sign', 300, 440, { onPath: true });
        b.decors('icespire', 10, [240, 110, 1560, 690]); b.forest(10, [240, 110, 1560, 690], { v: VPINE(b) }); b.decors('boulder', 10, [240, 110, 1560, 690], { tone: 'snow' }); b.decors('bones', 5, [240, 110, 1560, 690]); b.decors('stump', 4, [240, 110, 1560, 690]);
        b.item('Coins', 1260, 560, 150); b.item('Mana Potion', 900, 160, 2);
        b.mobs('wolf_base', 3, [420, 110, 1560, 690]); b.mobs('frost_wolf', 4, [560, 110, 1560, 690]); b.mobs('ice_bat', 4, [560, 110, 1560, 690]); b.mobs('goblin_brute', 2, [420, 110, 1560, 690]); b.mobs('troll_base', 2, [900, 110, 1560, 690]); b.mobs('frost_ghost', 2, [1000, 110, 1560, 690]);
    } });
    link('l_pedralta_passo', 'pedralta', 'e', 'passo_gelado', 'w', 'Passo Gelado →', '← Pedralta');

    def('vale_gelado', { idx: 20, name: 'Vale Gelado de Hrimgar', lvl: '32-55', w: 2000, h: 1400, color: '#dde8f1', gx: 3, gy: -2, build(b) {
        b.port('w', 190, 700, 'right', { safe: 160 });
        ring(b, 'boulder', 50, 38, { sides: 'tblr', tone: 'snow' });
        [[280, 140, 500, 240], [1000, 160, 520, 220], [240, 980, 560, 240], [1100, 1000, 640, 240]].forEach((p) => b.paint(SNOWD, p[0], p[1], p[2], p[3]));
        b.paint(ICE, 700, 480, 620, 380); b.paint(ICE, 1300, 600, 240, 160);
        b.lake(1000, 670, 150, 90, { irr: 0.12 }); b.fish(930, 650); b.fish(1060, 690);   // buraco no gelo: pesca de águas geladas
        b.road([[190, 700], [620, 700]], 90, { kind: '#b8a78a', amp: 20 });
        // trono do gigante: círculo de espinhos de gelo no leste
        b.paint('#9ec7e0', 1400, 240, 500, 420, false);
        [[1400, 240], [1500, 220], [1600, 220], [1700, 220], [1800, 240], [1400, 520], [1400, 440], [1830, 330], [1840, 430], [1840, 530], [1520, 600], [1620, 610]].forEach((p) => b.decor('icespire', p[0], p[1], { force: true }));
        b.decor('crystal', 1620, 330, { force: true }); b.decor('crystal', 1710, 380, { force: true }); b.decor('banner', 1560, 260, { force: true }); b.item('Coins', 1700, 560, 600); b.item('Greater Health Potion', 1580, 560, 3);
        b.decors('icespire', 14, [240, 100, 1360, 1300]); b.forest(18, [240, 100, 1760, 1300], { v: VPINE(b) }); b.decors('boulder', 14, [240, 100, 1760, 1300], { tone: 'snow' }); b.decors('bones', 8, [240, 100, 1760, 1300]); b.decors('stump', 6, [240, 100, 1760, 1300]); b.decors('crystal', 5, [240, 100, 1760, 1300]);
        b.mobs('frost_wolf', 6, [330, 100, 1760, 1300]); b.mobs('ice_bat', 6, [330, 100, 1760, 1300]); b.mobs('frost_ghost', 5, [330, 100, 1760, 1300]); b.mobs('ice_golem', 4, [560, 100, 1760, 1300]); b.mobs('troll_base', 2, [330, 100, 1000, 1300]);
        b.mobs('frost_giant', 1, [1600, 380, 1760, 520]); b.mobs('frost_wolf', 2, [1420, 260, 1800, 620]);
    } });
    link('l_passo_vale', 'passo_gelado', 'e', 'vale_gelado', 'w', 'Vale Gelado →', '← Passo Gelado');

    /* ============================ SUL-LESTE SOMBRIO: estrada, cemitério, cripta, fortaleza, vulcão, ninho ============================ */
    def('estrada_sombria', { idx: 21, name: 'Estrada Sombria', lvl: '14-20', w: 700, h: 1600, color: '#4c5844', gx: 3, gy: 2, build(b) {
        b.port('n', 350, 220, 'down'); b.port('s', 350, 1380, 'up');
        b.paint('#3f4a39', 80, 380, 240, 300); b.paint('#3f4a39', 400, 900, 230, 330);
        b.road([[350, 220], [350, 1380]], 100, { amp: 56 });
        b.treeBorder({ v: VPINE(b) }); b.decors('deadtree', 14, [80, 130, 620, 1480]); b.forest(14, [80, 130, 620, 1480], { v: VPINE(b) }); b.decors('gravestone', 10, [80, 130, 620, 1480]); b.decors('mushrooms', 10, [80, 130, 620, 1480]); b.decors('bones', 8, [80, 130, 620, 1480]); b.decors('stump', 5, [80, 130, 620, 1480]); b.decors('boulder', 6, [80, 130, 620, 1480], { tone: 'moss' });
        b.decor('sign', 430, 330, { onPath: true }); b.decor('lamp', 270, 480, { onPath: true }); b.decor('lamp', 450, 760, { onPath: true }); b.decor('lamp', 260, 1040, { onPath: true }); b.decor('cart', 140, 900); b.decor('bones', 210, 940); b.decor('campfire', 450, 1180);
        b.item('Coins', 500, 640, 120); b.item('Health Potion', 130, 500, 2);
        b.mobs('skeleton_base', 4, [80, 300, 620, 1300]); b.mobs('zombie', 3, [80, 500, 620, 1300]); b.mobs('wolf_base', 2, [80, 300, 620, 1300]); b.mobs('ghost_base', 3, [80, 500, 620, 1300]); b.mobs('bat_base', 2, [80, 300, 620, 1300]); b.mobs('grave_ghost', 2, [80, 700, 620, 1300]);
    } });
    link('l_vila_sombria', 'vila_real', 's', 'estrada_sombria', 'n', 'Estrada Sombria →', '← Vila Real');

    def('cemiterio', { idx: 22, name: 'Cemitério das Brumas', lvl: '18-28', w: 2000, h: 1400, color: '#414c3e', gx: 3, gy: 3, build(b) {
        const H2 = HB(b);
        b.port('n', 1000, 220, 'down'); b.port('e', 1810, 700, 'left'); b.port('w', 190, 700, 'right');
        b.treeBorder({ v: VPINE(b) });
        b.road([[1000, 220], [1000, 700], [190, 700]], 90, { kind: 'stone', amp: 0 }); b.road([[1000, 700], [1810, 700]], 90, { kind: 'stone', amp: 0 });
        b.paint('#37413a', 280, 160, 500, 300); b.paint('#37413a', 1200, 900, 520, 260); b.paint('#37413a', 300, 940, 500, 240);
        // capela arruinada e mausoléu (a entrada da cripta fica a leste)
        H2('church', 1400, 520); b.decor('statue', 1560, 560); b.decor('statue', 1290, 560); b.decors('banner', 1, [1330, 440, 1420, 460]);
        b.decor('lamp', 1130, 640, { onPath: true }); b.decor('lamp', 1220, 760, { onPath: true }); b.decor('lamp', 910, 640, { onPath: true }); b.decor('lamp', 860, 760, { onPath: true }); b.decor('lamp', 500, 640, { onPath: true }); b.decor('lamp', 300, 760, { onPath: true });
        // cerca do campo santo
        b.fenceRect(300, 880, 720, 300, { side: 't', at: 1000, len: 120 });
        b.decors('gravestone', 26, [330, 910, 990, 1150]); b.decors('statue', 2, [330, 910, 990, 1150]); b.decors('flowers', 6, [330, 910, 990, 1150]);
        b.decors('gravestone', 18, [1200, 900, 1720, 1160]); b.decors('gravestone', 14, [280, 160, 780, 460]); b.decors('deadtree', 18, [100, 100, 1900, 1300]); b.forest(14, [100, 100, 1900, 1300], { v: VPINE(b) });
        b.decors('mushrooms', 16, [100, 100, 1900, 1300]); b.decors('bones', 10, [100, 100, 1900, 1300]); b.decors('stump', 6, [100, 100, 1900, 1300]); b.decors('boulder', 8, [100, 100, 1900, 1300], { tone: 'moss' }); b.decors('bush', 6, [100, 100, 1900, 1300]); b.decors('campfire', 1, [1100, 950, 1200, 1050]);
        b.npc('priest_npc', 1040, 600, 'Padre Ambrósio'); b.item('Coins', 820, 1000, 250); b.item('Greater Health Potion', 1600, 1050, 2); b.item('Soul Gem', 500, 300, 1);
        b.mobs('zombie', 7, [330, 100, 1900, 1300]); b.mobs('grave_ghost', 6, [330, 100, 1900, 1300]); b.mobs('skeleton_base', 4, [330, 100, 1900, 1300]); b.mobs('necromancer', 3, [1100, 820, 1760, 1300]); b.mobs('crypt_knight', 2, [1300, 160, 1900, 480]); b.mobs('bat_base', 3, [330, 100, 1900, 1300]);
    } });
    link('l_sombria_cemiterio', 'estrada_sombria', 's', 'cemiterio', 'n', 'Cemitério das Brumas →', '← Estrada Sombria');

    def('cripta_real', { idx: 23, name: 'Catacumba do Rei Esquecido', lvl: '30-70', w: 1600, h: 1400, color: '#14121a', gx: 4, gy: 3, build(b) {
        const xs = [0, 540, 1060, 1600], ys = [0, 470, 930, 1400];
        b.wallBorder(); floors(b, xs, ys, ['stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone']);
        gridWalls(b, xs, ys, [[1, 1, 'd'], [0, 2, 'r'], [1, 2, 'r'], [0, 1, 'r'], [1, 1, 'r'], [1, 0, 'd'], [0, 0, 'd'], [2, 0, 'd']], { off: {} });
        b.port('s', 800, 1260, 'up');
        const R = (i, j, m) => roomRect(xs, ys, i, j, m || 80);
        b.decor('lamp', 600, 1160); b.decor('lamp', 950, 1160); b.decors('gravestone', 4, R(1, 2)); b.decors('bones', 4, R(1, 2)); b.decors('banner', 2, R(1, 2));
        b.decors('sarcophagus', 4, R(0, 2)); b.decors('bones', 5, R(0, 2)); b.decors('sarcophagus', 4, R(2, 2)); b.decors('crystal', 3, R(2, 2)); b.decors('bones', 4, R(2, 2));
        [[700, 640], [880, 640], [700, 760], [880, 760]].forEach((p) => b.decor('pillar', p[0], p[1], { onPath: true, tone: 'dark' })); b.decors('lamp', 3, R(1, 1)); b.decors('bones', 6, R(1, 1)); b.decors('crystal', 3, R(1, 1));
        b.decors('sarcophagus', 4, R(0, 1)); b.decors('bones', 5, R(0, 1)); b.decors('mushrooms', 4, R(0, 1)); b.decors('sarcophagus', 4, R(2, 1)); b.decors('bones', 5, R(2, 1)); b.decors('statue', 2, R(2, 1));
        b.decors('statue', 3, R(0, 0)); b.decors('sarcophagus', 3, R(0, 0)); b.decors('lamp', 3, R(0, 0)); b.decors('sarcophagus', 3, R(2, 0)); b.decors('crystal', 4, R(2, 0)); b.decors('statue', 2, R(2, 0));
        b.decor('statue', 600, 100, { force: true }); b.decor('statue', 940, 100, { force: true }); b.decor('banner', 660, 70, { force: true }); b.decor('banner', 880, 70, { force: true }); b.decors('sarcophagus', 2, [600, 360, 940, 400]); b.decors('crystal', 3, R(1, 0));
        b.item('Coins', 180, 320, 400); b.item('Greater Health Potion', 1340, 330, 3); b.item('Soul Gem', 740, 300, 2); b.item('Coins', 1300, 1290, 350);
        b.mobs('skeleton_base', 4, R(0, 2)); b.mobs('crypt_knight', 2, R(0, 2)); b.mobs('grave_ghost', 3, R(2, 2)); b.mobs('crypt_knight', 3, R(0, 1)); b.mobs('necromancer', 2, R(2, 1)); b.mobs('zombie', 3, R(1, 1)); b.mobs('dark_knight', 2, R(1, 1)); b.mobs('crypt_knight', 3, R(0, 0)); b.mobs('necromancer', 2, R(2, 0)); b.mobs('dark_knight', 2, R(2, 0)); b.mobs('forgotten_king', 1, [680, 180, 880, 340]);
    } });
    link('l_cemiterio_cripta', 'cemiterio', 'e', 'cripta_real', 's', 'Catacumba do Rei →', '← Cemitério das Brumas');

    def('fortaleza', { idx: 24, name: 'Fortaleza de Morthak', lvl: '38-60', w: 2000, h: 1400, color: '#5c5c60', gx: 2, gy: 3, build(b) {
        const H2 = HB(b); b.wallBorder({ tone: 'dark' });
        b.port('e', 1810, 700, 'left', { safe: 120 }); b.port('w', 190, 700, 'right', { safe: 120 });
        b.paint('stone', 100, 100, 1800, 1200, true); b.paint('#4a4a50', 700, 300, 700, 800);
        b.road([[190, 700], [1810, 700]], 110, { kind: 'stone' });
        // pátio, castelo ao norte-centro, torres e quartéis
        H2('castle', 820, 560, { onPath: true }); b.decor('banner', 780, 560, { onPath: true }); b.decor('banner', 1160, 560, { onPath: true });
        H2('watchtower', 240, 360); H2('watchtower', 1600, 360); H2('watchtower', 240, 1240, { force: false }); H2('watchtower', 1600, 1240, { force: false });
        b.house('tent', 400, 420); b.house('tent', 560, 420); b.house('tent', 1340, 420); b.house('tent', 1480, 420); b.fire(480, 520); b.fire(1420, 520);
        b.decors('crates', 6, [120, 820, 680, 1240]); b.decors('barrel', 6, [120, 820, 680, 1240]); b.decors('crates', 6, [1320, 820, 1880, 1240]); b.decors('barrel', 6, [1320, 820, 1880, 1240]); b.anvil(300, 900); b.furnace(380, 890); b.anvil(1600, 900); b.furnace(1680, 890);
        b.decors('banner', 6, [150, 120, 1850, 200]); b.decors('statue', 4, [720, 740, 1280, 1080]); b.decors('lamp', 8, [150, 600, 1850, 640], { onPath: true }); b.decors('bones', 8, [150, 150, 1850, 1250]); b.decors('boulder', 6, [150, 150, 1850, 1250], { tone: 'dark' });
        [[700, 740], [1290, 740], [700, 900], [1290, 900]].forEach((p) => b.decor('pillar', p[0], p[1], { tone: 'dark', onPath: true }));
        b.item('Coins', 960, 1000, 700); b.item('Greater Health Potion', 980, 1040, 3); b.item('Steel Bar', 1040, 1010, 4);
        b.mobs('dark_knight', 9, [150, 150, 1850, 1250]); b.mobs('goblin_brute', 3, [150, 150, 1850, 1250]); b.mobs('necromancer', 3, [150, 150, 1850, 1250]); b.mobs('troll_base', 3, [150, 150, 1850, 1250]);
        b.mobs('warlord', 1, [900, 590, 1080, 700]);
    } });
    link('l_cemiterio_fortaleza', 'cemiterio', 'w', 'fortaleza', 'e', 'Fortaleza de Morthak →', '← Cemitério das Brumas');

    def('vulcao', { idx: 25, name: 'Vulcão Brasa-Viva', lvl: '45-65', w: 2000, h: 1400, color: '#3c302d', gx: 1, gy: 3, build(b) {
        b.port('e', 1810, 700, 'left', { safe: 140 }); b.port('s', 1000, 1180, 'up', { safe: 140 });
        ring(b, 'boulder', 50, 38, { sides: 'tblr', tone: 'ash' });
        [[260, 140, 560, 260], [1100, 150, 600, 240], [200, 980, 540, 260], [1260, 980, 560, 240]].forEach((p) => b.paint('#2f2523', p[0], p[1], p[2], p[3]));
        b.lake(820, 680, 100, 62, { irr: 0.12 }); b.fish(770, 670); b.fish(860, 700);   // lago termal da cratera: pesca de lava
        b.road([[1810, 700], [1400, 700], [1400, 1000], [1000, 1000], [1000, 1180]], 90, { kind: '#6b5b52', amp: 0 });
        // campos de lava: poças sólidas agrupadas (a pedra escura é o caminho seguro)
        [[300, 300], [620, 220], [420, 600], [860, 420], [1150, 260], [1500, 330], [620, 880], [1120, 800], [1560, 860], [360, 1100], [1560, 1130], [700, 1150], [1560, 530]].forEach((p) => { b.decor('lava', p[0], p[1], { force: true }); b.decor('lava', p[0] + 80, p[1], { force: true }); b.decor('lava', p[0] + 40, p[1] + 52, { force: true }); });
        b.decors('boulder', 12, [200, 120, 1800, 1280], { tone: 'ash' }); b.decors('deadtree', 8, [200, 120, 1800, 1280]); b.decors('bones', 10, [200, 120, 1800, 1280]); b.decors('crystal', 6, [200, 120, 1800, 1280]);
        b.decor('campfire', 1500, 760); b.decor('lamp', 1320, 620, { onPath: true }); b.decor('lamp', 930, 1090, { onPath: true }); b.decor('lamp', 1070, 1090, { onPath: true });
        b.item('Coins', 900, 330, 400); b.item('Dragon Scale', 1760, 320, 1); b.item('Greater Health Potion', 280, 1000, 2);
        b.rock('rock_coal', 240, 560); b.rock('rock_coal', 300, 620); b.rock('rock_mithril', 1720, 1000, { force: false });
        b.mobs('ember_skeleton', 6, [300, 120, 1800, 1280]); b.mobs('ash_bat', 6, [300, 120, 1800, 1280]); b.mobs('fire_whelp', 5, [300, 120, 1800, 1280]); b.mobs('lava_golem', 3, [500, 120, 1800, 1280]); b.mobs('drake', 2, [500, 200, 1700, 600]);
    } });
    link('l_fortaleza_vulcao', 'fortaleza', 'w', 'vulcao', 'e', 'Vulcão Brasa-Viva →', '← Fortaleza de Morthak');

    def('ninho_dragao', { idx: 26, name: 'Ninho do Dragão Negro', lvl: '50-80', w: 1600, h: 1200, color: '#160d0d', gx: 1, gy: 4, build(b) {
        const xs = [0, 560, 1040, 1600], ys = [0, 400, 800, 1200];
        b.wallBorder({ tone: 'ash' }); floors(b, xs, ys, ['stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone', 'stone']);
        gridWalls(b, xs, ys, [[1, 1, 'd'], [0, 2, 'r'], [1, 2, 'r'], [0, 1, 'r'], [1, 1, 'r'], [1, 0, 'd'], [0, 0, 'd'], [2, 0, 'd']]);
        b.port('s', 800, 1070, 'up');
        const R = (i, j, m) => roomRect(xs, ys, i, j, m || 80);
        b.decor('lamp', 640, 960); b.decor('lamp', 930, 960); b.decors('bones', 6, R(1, 2)); b.decors('lava', 2, R(0, 2)); b.decors('bones', 5, R(0, 2)); b.decors('lava', 2, R(2, 2)); b.decors('boulder', 3, R(2, 2), { tone: 'ash' }); b.decors('bones', 4, R(2, 2));
        b.decors('lava', 3, R(0, 1)); b.decors('bones', 6, R(0, 1)); b.decors('boulder', 3, R(0, 1), { tone: 'ash' }); b.decors('lava', 3, R(2, 1)); b.decors('bones', 6, R(2, 1)); b.decors('boulder', 3, R(2, 1), { tone: 'ash' });
        b.decors('bones', 8, R(1, 1)); b.decors('crystal', 3, R(1, 1)); b.decor('lamp', 600, 450); b.decor('lamp', 950, 450); b.fire(800, 600);
        b.decors('lava', 2, R(0, 0)); b.decors('bones', 5, R(0, 0)); b.decors('lava', 2, R(2, 0)); b.decors('bones', 5, R(2, 0)); b.decors('crystal', 4, R(2, 0));
        b.decor('lamp', 590, 280); b.decor('lamp', 990, 280); b.decors('bones', 6, R(1, 0)); b.decors('crystal', 3, R(1, 0));
        b.item('Coins', 200, 200, 800); b.item('Dragon Bones', 240, 150, 2); b.item('Greater Health Potion', 1380, 260, 3); b.item('Soul Gem', 1340, 160, 2); b.item('Coins', 760, 300, 1200); b.item('Dragon Scale', 830, 290, 3);
        b.mobs('fire_whelp', 4, R(1, 2)); b.mobs('ember_skeleton', 3, R(0, 2)); b.mobs('ash_bat', 4, R(2, 2)); b.mobs('lava_golem', 2, R(0, 1)); b.mobs('fire_whelp', 3, R(2, 1)); b.mobs('drake', 2, R(1, 1)); b.mobs('drake', 2, R(0, 0)); b.mobs('lava_golem', 2, R(2, 0)); b.mobs('ash_bat', 3, R(2, 0)); b.mobs('black_dragon', 1, [640, 90, 920, 300]);
    } });
    link('l_vulcao_ninho', 'vulcao', 's', 'ninho_dragao', 's', 'Ninho do Dragão →', '← Vulcão Brasa-Viva');

    /* ============================ LIGAÇÕES E COLOCAÇÃO NO MUNDO ============================ */
    const mark = () => { try { if (window.Content && Content.mark) Content.mark(); } catch (e) {} };
    const flag = (m, k) => { if (!m.c6 || typeof m.c6 !== 'object') m.c6 = {}; if (m.c6[k]) return false; m.c6[k] = true; mark(); return true; };
    const hasFlag = (m, k) => !!(m && m.c6 && m.c6[k]);
    const visRect = (o) => { if (o.type === 'tree') return [o.x - 12, o.y - 30, 100, 126]; return [o.x, o.y, o.w || 30, o.h || 30]; };
    // acha um lugar livre em mapa ANTIGO para a porta (64x64) com o ponto de chegada ao lado (sem pisar em nada)
    function slotFor(m, hx, hy, face) {
        const ents = (m.entities || []).filter((o) => o && o.active !== false && o.type !== 'paint' && o.type !== 'ground_item' && o.type !== 'fishing_spot');
        const W = m.width || 800, H = m.height || 600; const d = LANDING[face] || LANDING.down;
        const fr = (x, y, w, h, pad) => { if (x < 70 || y < 70 || x + w > W - 70 || y + h > H - 70) return false; return !ents.some((o) => { const v = visRect(o); return x - pad < v[0] + v[2] && x + w + pad > v[0] && y - pad < v[1] + v[3] && y + h + pad > v[1]; }); };
        const ok = (cx, cy) => fr(cx - 32, cy - 32, 64, 64, 34) && fr(cx + d[0] - 30, cy + d[1] - 30, 60, 60, 26) && ((face === 'up' || face === 'down') ? fr(cx - 70, cy - 28, 30, 80, 2) && fr(cx + 42, cy - 28, 30, 80, 2) : fr(cx - 10 - 4, cy - 120 - 4, 30, 80, 2) && fr(cx - 10 - 4, cy + 42 - 4, 30, 80, 2)) && (face === 'down' || face === 'up' ? fr(cx - 70, cy - 40, 140, 100, 4) : true);
        for (let r = 0; r < 900; r += 16) for (let a = 0; a < (r ? 24 : 1); a++) { const cx = R5(hx + Math.cos(a / 24 * 6.2832) * r), cy = R5(hy + Math.sin(a / 24 * 6.2832) * r); if (ok(cx, cy)) return { px: cx - 32, py: cy - 32, lx: cx + d[0], ly: cy + d[1], face }; }
        return null;
    }
    const portalEnt = (id, p, label, dest, dx, dy) => ({ id, type: 'portal', name: label, x: p.px, y: p.py, w: 64, h: 64, active: true, destMap: dest, destX: dx, destY: dy });
    function lampsFor(ents, p, nextId) {
        const hz = p.face === 'up' || p.face === 'down', mk2 = (x, y) => { const s = dsz('lamp'); return { id: nextId(), type: 'decor', kind: 'lamp', name: 'Poste de Luz', x, y, w: s[0], h: s[1], active: true }; };
        if (hz) { ents.push(mk2(p.px - 34, p.py + 8), mk2(p.px + 78, p.py + 8)); } else { ents.push(mk2(p.px + 22, p.py - 88), mk2(p.px + 22, p.py + 74)); }
    }
    /* Mundo já salvo: mapas feitos antes do b.topUp ficaram sem parte das criaturas (cenário lotado, ex.: o Dragão Negro, trolls e aranhas venenosas).
       A reconstrução é determinística (mesma semente), então dá para saber quais faltaram e colocá-las (uma vez por mapa, c6.mtu) em lugar livre do mapa salvo. */
    function refill(maps) {
        let n = 0;
        Object.keys(MAPS).forEach((id) => {
            const m = maps[id], sp = MAPS[id]; if (!m || !Array.isArray(m.entities) || (m.c6 && m.c6.mtu)) return;
            try {
                const b = Builder(sp.idx, id, sp.name, sp.w, sp.h, sp.color, sp.idx * 97 + 5); sp.build(b, sp); b.topUp();
                const W = m.width || sp.w, H = m.height || sp.h, ids = new Set(m.entities.map((o) => o && o.id));
                const isSolid = (o) => { if (!o || o.active === false) return false; const t = o.type; if (t === 'paint' || t === 'ground_item' || t === 'fishing_spot' || t === 'farm_plot' || t === 'fire' || t === 'portal' || t === 'house_door') return false; if (t === 'decor' && !(CD()[o.kind] || {}).solid) return false; return true; };
                const blocked = (x, y, w, h) => m.entities.some((o) => { if (!isSolid(o)) return false; const hb = hbox(o); if (!hb) return false; const p2 = o.type === 'enemy' || o.type === 'npc' ? 14 : 8; return x - p2 < hb.x + hb.w && x + w + p2 > hb.x && y - p2 < hb.y + hb.h && y + h + p2 > hb.y; });
                b.extra.forEach((o) => {
                    if (ids.has(o.id)) return;
                    for (let k = 0; k < 40; k++) {
                        const ang = k * 2.4, r = k * 14, x = R5(o.x + Math.cos(ang) * r), y = R5(o.y + Math.sin(ang) * r);
                        if (x < 40 || y < 40 || x + o.w > W - 40 || y + o.h > H - 40 || blocked(x, y, o.w, o.h)) continue;
                        m.entities.push(Object.assign({}, o, { x, y })); ids.add(o.id); n++; break;
                    }
                });
                flag(m, 'mtu');
            } catch (e) { console.error('[maps2] refill ' + id, e); }
        });
        return n;
    }
    function place(maps) {
        if (!maps || typeof maps !== 'object' || !maps.lumbridge) return { built: 0, links: 0 };
        try { mergeCreatures(); } catch (e) {}
        installArt();
        const out = { built: 0, links: 0, errors: [] }; const builders = {};
        Object.keys(MAPS).forEach((id) => {
            const sp = MAPS[id]; if (maps[id]) return;
            try {
                const b = Builder(sp.idx, id, sp.name, sp.w, sp.h, sp.color, sp.idx * 97 + 5); sp.build(b, sp);
                const used = Object.keys(maps).some((k) => maps[k] && maps[k].gridX === sp.gx && maps[k].gridY === sp.gy);
                maps[id] = b.finish(used ? null : sp.gx, used ? null : sp.gy); flag(maps[id], 'mtu'); builders[id] = b; out.built++; mark();
            } catch (e) { out.errors.push(id + ': ' + (e && e.message)); console.error('[maps2] ' + id, e); }
        });
        const portEnd = (mapId, key) => {
            if (builders[mapId] && typeof key === 'string') return builders[mapId].ports[key] || null;
            const m = maps[mapId]; if (!m || typeof key === 'string') return null; return slotFor(m, key.hint[0], key.hint[1], key.face);
        };
        LINKS.forEach((L) => {
            const id = L[0], A = maps[L[1]], B = maps[L[3]]; if (!A || !B) return;
            if (window.Edges && Edges.EDGE_IDS && Edges.EDGE_IDS.has(id)) return;   // ligações de exterior viram bordas (edges.js), não portais
            const aNew = !!builders[L[1]] && typeof L[2] === 'string', bNew = !!builders[L[3]] && typeof L[4] === 'string';
            const aOld = typeof L[2] !== 'string', bOld = typeof L[4] !== 'string';
            if ((aOld && hasFlag(A, 'lk_' + id)) || (bOld && hasFlag(B, 'lk_' + id))) return;
            if (!((aNew || aOld) && (bNew || bOld))) return;   // um dos lados é mapa novo de uma rodada anterior: nada a fazer
            if (!aNew && !bNew) return;
            const pa = portEnd(L[1], L[2]), pb = portEnd(L[3], L[4]); if (!pa || !pb) { console.warn('[maps2] sem espaço para o portal ' + id); return; }
            let seq = 0; const nid = (m) => 'c6_' + id + '_' + (seq++);
            const ea = portalEnt('c6_' + id + '_a', pa, L[5], L[3], pb.lx, pb.ly), eb = portalEnt('c6_' + id + '_b', pb, L[6], L[1], pa.lx, pa.ly);
            (A.entities = A.entities || []).push(ea); (B.entities = B.entities || []).push(eb);
            if (aOld) { lampsFor(A.entities, pa, () => 'c6_' + id + '_la' + (seq++)); flag(A, 'lk_' + id); }
            if (bOld) { lampsFor(B.entities, pb, () => 'c6_' + id + '_lb' + (seq++)); flag(B, 'lk_' + id); }
            out.links++; mark();
        });
        try { out.refilled = refill(maps); } catch (e) { console.error(e); }
        return out;
    }

    /* ============================ LIGAÇÃO COM O JOGO ============================ */
    function wrapMerge() { const W2 = window.World2; if (!W2 || W2.merge._m2) return; const om = W2.merge; W2.merge = function () { const r = om.apply(this, arguments); try { mergeCreatures(); } catch (e) {} return r; }; W2.merge._m2 = true; }
    wrapMerge();
    window.Maps2 = { place, refill, MAPS, LINKS, CREATURES, NEWDECOR, Builder, mergeCreatures, installArt, slotFor, bsz, dsz, version: 1 };
})();
