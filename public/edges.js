/* MiniScape 2D — bordas naturais entre mapas, entradas de masmorra com sentido e tochas.
   1) EDGES: mapas de exterior se ligam andando até a borda (m.edges = [{id,d,a,b,to,td,ta,tb}]). A "zona de saída" é uma abertura com estrada
      nos dois lados; ao encostar nela o jogador aparece no mapa vizinho, na borda oposta, 72 px para dentro (sem ping-pong), com fade curto.
   2) migrate(maps): idempotente. Converte os portais "mágicos" antigos de exterior em bordas (abre a estrada, tira árvores/muros do corredor, pinta
      o caminho de terra até a borda dos DOIS lados) e transforma os portais de masmorra em entradas físicas (mausoléu, mina, caverna, escadaria, cratera).
   3) torches: tochas nas paredes das masmorras (e luz no env.js).
   Marcas de migração em m.c7 (por mapa); nenhum portal/borda duplicado. */
(function () {
    'use strict';
    const R = (v) => Math.round(v);
    const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
    const TRIG = 22, ARRIVE = 72, COOL = 40, FADE_FR = 14;

    /* ============================ TABELA DE LIGAÇÕES POR BORDA ============================
       cada ponta: m = mapa, d = lado da borda, c = centro lateral da abertura, w = largura, via = pontos interiores da estrada (a partir da borda),
       col = cor da estrada (padrão terra), road:false = estrada já existe (só limpa o corredor). */
    const DIRT = '#5c4033', STONE = '#7f8c8d', SAND = '#cdb57a', PASS = '#b8a78a', ASH = '#6b5b52';
    const E = (id, A, B) => ({ id, A, B });
    const EDGE_LINKS = [
        E('l_lum_mina', { m: 'lumbridge', d: 'e', c: 700, w: 120, road: false }, { m: 'mina', d: 'w', c: 700, w: 120, road: false }),
        E('l_lum_floresta', { m: 'lumbridge', d: 'w', c: 700, w: 120, road: false }, { m: 'floresta', d: 'e', c: 700, w: 120, road: false }),
        E('l_lum_covil', { m: 'lumbridge', d: 'n', c: 1000, w: 120, road: false }, { m: 'covil', d: 's', c: 900, w: 120, road: false }),
        E('l_lum_rio', { m: 'lumbridge', d: 's', c: 1000, w: 120, road: false }, { m: 'rio', d: 'n', c: 1000, w: 120, road: false }),
        E('l_rio_campos', { m: 'rio', d: 'e', c: 925, w: 100, via: [[1000, 925]] }, { m: 'campos', d: 'w', c: 700, w: 110, via: [[200, 700]] }),
        E('l_rio_costa', { m: 'rio', d: 'w', c: 925, w: 100, via: [[1000, 925]] }, { m: 'estrada_costa', d: 'e', c: 700, w: 100, via: [[480, 700]] }),
        E('l_rio_pantano', { m: 'rio', d: 's', c: 1000, w: 100, via: [[1000, 820]] }, { m: 'pantano', d: 'n', c: 1000, w: 100, via: [[1000, 230]] }),
        E('l_costa_porto', { m: 'estrada_costa', d: 's', c: 480, w: 100, via: [[480, 1380]] }, { m: 'porto_mares', d: 'n', c: 900, w: 110, col: STONE, via: [[900, 230]] }),
        E('l_porto_praia', { m: 'porto_mares', d: 'w', c: 620, w: 120, col: STONE, via: [[200, 620]] }, { m: 'praia_naufragios', d: 'e', c: 480, w: 100, via: [[1800, 480]] }),
        E('l_campos_estrada', { m: 'campos', d: 'e', c: 700, w: 110, via: [[1800, 700]] }, { m: 'estrada_rei', d: 'w', c: 350, w: 100, via: [[200, 350]] }),
        E('l_estrada_vila', { m: 'estrada_rei', d: 'e', c: 350, w: 100, via: [[1400, 350]] }, { m: 'vila_real', d: 'w', c: 700, w: 120, col: STONE, via: [[160, 700]], gate: true }),
        E('l_vila_areias', { m: 'vila_real', d: 'e', c: 700, w: 120, col: STONE, via: [[1640, 700]], gate: true }, { m: 'estrada_areias', d: 'w', c: 350, w: 100, col: SAND, via: [[200, 350]] }),
        E('l_areias_deserto', { m: 'estrada_areias', d: 'e', c: 350, w: 100, col: SAND, via: [[1400, 350]] }, { m: 'deserto', d: 'w', c: 700, w: 100, col: SAND, via: [[200, 700]] }),
        E('l_deserto_oasis', { m: 'deserto', d: 'e', c: 700, w: 100, col: SAND, via: [[1800, 700]] }, { m: 'oasis', d: 'w', c: 550, w: 110, col: STONE, via: [[200, 550]] }),
        E('l_vila_sombria', { m: 'vila_real', d: 's', c: 900, w: 110, col: STONE, via: [[900, 1160]], gate: true }, { m: 'estrada_sombria', d: 'n', c: 350, w: 100, via: [[350, 230]] }),
        E('l_sombria_cemiterio', { m: 'estrada_sombria', d: 's', c: 350, w: 100, via: [[350, 1380]] }, { m: 'cemiterio', d: 'n', c: 1000, w: 100, col: STONE, via: [[1000, 230]] }),
        E('l_cemiterio_fortaleza', { m: 'cemiterio', d: 'w', c: 700, w: 100, col: STONE, via: [[200, 700]] }, { m: 'fortaleza', d: 'e', c: 700, w: 110, col: STONE, via: [[1800, 700]], gate: true }),
        E('l_fortaleza_vulcao', { m: 'fortaleza', d: 'w', c: 700, w: 110, col: STONE, via: [[200, 700]], gate: true }, { m: 'vulcao', d: 'e', c: 700, w: 100, col: ASH, via: [[1800, 700]] }),
        E('l_floresta_trilha', { m: 'floresta', d: 'w', c: 480, w: 100, via: [[1040, 480], [1040, 700]] }, { m: 'trilha_elfica', d: 'e', c: 1380, w: 100, via: [[350, 1380]] }),
        E('l_trilha_silva', { m: 'trilha_elfica', d: 'w', c: 220, w: 100, via: [[350, 220]] }, { m: 'silvaluz', d: 'e', c: 1160, w: 100, via: [[1800, 1160]] }),
        E('l_mina_serra', { m: 'mina', d: 'n', c: 1160, w: 110, via: [[1160, 500]] }, { m: 'trilha_serra', d: 's', c: 350, w: 100, via: [[350, 1380]] }),
        E('l_serra_pedralta', { m: 'trilha_serra', d: 'n', c: 350, w: 100, via: [[350, 220]] }, { m: 'pedralta', d: 's', c: 900, w: 110, col: STONE, via: [[900, 1160]], gate: true }),
        E('l_pedralta_passo', { m: 'pedralta', d: 'e', c: 650, w: 110, col: STONE, via: [[1640, 650]], gate: true }, { m: 'passo_gelado', d: 'w', c: 400, w: 100, col: PASS, via: [[200, 400]] }),
        E('l_passo_vale', { m: 'passo_gelado', d: 'e', c: 400, w: 100, col: PASS, via: [[1600, 400]] }, { m: 'vale_gelado', d: 'w', c: 700, w: 100, col: PASS, via: [[200, 700]] })
    ];
    const EDGE_IDS = new Set(EDGE_LINKS.map((l) => l.id));
    // masmorras: entrada física no exterior (portal na porta) e saída na masmorra
    const DUNGEONS = [
        { id: 'l_cemiterio_cripta', out: ['cemiterio', 'c6_l_cemiterio_cripta_a'], inn: ['cripta_real', 'c6_l_cemiterio_cripta_b'], look: 'tomb', outName: 'Descer à Catacumba do Rei', inName: 'Subir ao Cemitério', env: 'dark' },
        { id: 'l_silva_torre', out: ['silvaluz', 'c6_l_silva_torre_a'], inn: ['torre_mago', 'c6_l_silva_torre_b'], look: 'tower', outName: 'Entrar na Torre do Mago', inName: 'Descer da Torre ao Bosque', env: 'dark' },
        { id: 'l_pantano_goblins', out: ['pantano', 'c6_l_pantano_goblins_a'], inn: ['covil_goblins', 'c6_l_pantano_goblins_b'], look: 'cave', outName: 'Entrar no Covil dos Goblins', inName: 'Sair do Covil', env: 'dark' },
        { id: 'l_oasis_ruinas', out: ['oasis', 'c6_l_oasis_ruinas_a'], inn: ['ruinas', 'c6_l_oasis_ruinas_b'], look: 'ruins', outName: 'Descer às Ruínas de Sahr-Kal', inName: 'Subir ao Oásis', env: 'dim' },
        { id: 'l_pedralta_mina', out: ['pedralta', 'c6_l_pedralta_mina_a'], inn: ['mina_abandonada', 'c6_l_pedralta_mina_b'], look: 'mine', outName: 'Entrada da Mina Abandonada', inName: 'Sair da Mina', env: 'dim' },
        { id: 'l_vulcao_ninho', out: ['vulcao', 'c6_l_vulcao_ninho_a'], inn: ['ninho_dragao', 'c6_l_vulcao_ninho_b'], look: 'crater', outName: 'Entrar no Ninho do Dragão', inName: 'Subir à Cratera', env: 'dark' },
        { id: 'l_covil_cata', out: ['covil', 'c5_cata_in'], inn: ['catacumbas', 'c5_exit'], look: 'tomb', outName: 'Descer à Catacumba', inName: 'Subir ao Covil', env: 'dark' }
    ];
    const DUNGEON_MAPS = ['cripta_real', 'torre_mago', 'covil_goblins', 'ruinas', 'mina_abandonada', 'ninho_dragao', 'catacumbas'];

    /* ============================ CENÁRIO NOVO: entradas e tocha ============================ */
    const OUT = 'rgba(18,10,8,0.85)';
    const BODY = {   // corpo sólido da entrada (portal fica à frente, na base); foot = parte sólida
        tomb: { name: 'Mausoléu Rachado', w: 132, h: 112, foot: [0.04, 0.12, 0.96, 0.96] },
        minegate: { name: 'Boca de Mina', w: 164, h: 122, foot: [0.04, 0.5, 0.96, 0.96] },
        cavemouth: { name: 'Boca de Caverna', w: 152, h: 114, foot: [0.04, 0.5, 0.96, 0.96] },
        ruinarch: { name: 'Arco em Ruínas', w: 164, h: 122, foot: [0.04, 0.5, 0.96, 0.96] },
        craterrim: { name: 'Cratera do Dragão', w: 184, h: 126, foot: [0.04, 0.5, 0.96, 0.96] }
    };
    const NEWDECOR = { torch: { name: 'Tocha de Parede', w: 22, h: 50, solid: false } };
    Object.keys(BODY).forEach((k) => { NEWDECOR[k] = { name: BODY[k].name, w: BODY[k].w, h: BODY[k].h, solid: true, foot: BODY[k].foot }; });
    const poly = (g, pts, fill, stroke, lw) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke !== null) { g.strokeStyle = stroke || OUT; g.lineWidth = lw || 1.5; g.lineJoin = 'round'; g.stroke(); } };
    const lin = (g, x0, y0, x1, y1, a, b) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, a); gr.addColorStop(1, b); return gr; };
    const hh = (o, k) => { const n = (o && typeof o.id === 'number' ? o.id : 1); const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
    const shadow = (g, w, h, k) => { g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.ellipse(w / 2, h - 2, w * (k || 0.5), 6, 0, 0, 6.3); g.fill(); };
    function bricks(g, x, y, w, h, c1, c2) {
        g.fillStyle = lin(g, x, y, x + w, y + h, c1, c2); g.fillRect(x, y, w, h); g.strokeStyle = 'rgba(20,16,12,0.35)'; g.lineWidth = 1;
        for (let r = 0, yy = y + 9; yy < y + h; yy += 9, r++) { g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke(); for (let xx = x + (r % 2 ? 7 : 0); xx < x + w; xx += 15) { g.beginPath(); g.moveTo(xx, yy - 9); g.lineTo(xx, yy); g.stroke(); } }
    }
    const DRAW = {
        tomb(g, t, o) {
            const W = 132, H = 112; shadow(g, W, H, 0.5); const p = 0.6 + 0.4 * Math.sin(t * 1.8 + (o.x || 0) * 0.02);
            bricks(g, 12, 44, 108, H - 52, '#9a9ca3', '#5d5f68'); g.strokeStyle = OUT; g.lineWidth = 1.8; g.strokeRect(12, 44, 108, H - 52);
            poly(g, [[6, 46], [66, 6], [66, 46]], lin(g, 6, 6, 66, 46, '#b9bbc2', '#7d7f88'), OUT, 1.8);   // frontão esquerdo
            poly(g, [[66, 6], [92, 20], [84, 30], [100, 38], [96, 46], [66, 46]], lin(g, 66, 6, 100, 46, '#a9abb2', '#6a6c75'), OUT, 1.8);   // direito quebrado
            g.strokeStyle = 'rgba(15,12,10,0.7)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(40, 24); g.lineTo(34, 36); g.lineTo(42, 44); g.moveTo(94, 52); g.lineTo(90, 66); g.lineTo(97, 80); g.stroke();
            [[6, 40], [112, 40]].forEach((c) => { bricks(g, c[0], c[1], 14, H - 48, '#b3b5bc', '#6d6f78'); g.strokeStyle = OUT; g.strokeRect(c[0], c[1], 14, H - 48); g.fillStyle = '#c4c6cc'; g.fillRect(c[0] - 3, c[1] - 4, 20, 6); g.strokeRect(c[0] - 3, c[1] - 4, 20, 6); });
            g.fillStyle = '#05060a'; g.beginPath(); g.moveTo(48, H - 8); g.lineTo(48, 70); g.arc(66, 70, 18, Math.PI, 0); g.lineTo(84, H - 8); g.closePath(); g.fill(); g.strokeStyle = OUT; g.lineWidth = 2; g.stroke();
            const gl = g.createRadialGradient(66, 84, 2, 66, 84, 26); gl.addColorStop(0, 'rgba(110,255,170,' + (0.34 * p).toFixed(2) + ')'); gl.addColorStop(1, 'rgba(110,255,170,0)'); g.fillStyle = gl; g.fillRect(40, 60, 52, 50);
            g.fillStyle = 'rgba(70,120,60,0.8)'; g.beginPath(); g.ellipse(22, 46, 11, 4, 0, 0, 6.3); g.ellipse(100, 48, 9, 3.4, 0, 0, 6.3); g.ellipse(58, 44, 8, 3, 0, 0, 6.3); g.fill();
            g.strokeStyle = 'rgba(60,110,50,0.8)'; g.lineWidth = 1.6; [[24, 48, 20, 66], [100, 50, 104, 72], [30, 48, 34, 60]].forEach((v) => { g.beginPath(); g.moveTo(v[0], v[1]); g.quadraticCurveTo(v[0] + 4, (v[1] + v[3]) / 2, v[2], v[3]); g.stroke(); });
            g.fillStyle = '#bfc1c8'; g.fillRect(38, H - 12, 56, 6); g.strokeStyle = OUT; g.lineWidth = 1.2; g.strokeRect(38, H - 12, 56, 6);
        },
        minegate(g, t, o) {
            const W = 164, H = 122; shadow(g, W, H, 0.52);
            poly(g, [[4, H - 6], [2, 62], [16, 30], [46, 10], [82, 4], [120, 12], [150, 34], [162, 66], [160, H - 6]], lin(g, 0, 4, W, H, '#8d8f94', '#46484e'), OUT, 2);
            poly(g, [[16, 30], [46, 10], [82, 4], [60, 40], [26, 58]], 'rgba(255,255,255,0.18)', null); poly(g, [[120, 12], [150, 34], [162, 66], [158, 100], [132, 70]], 'rgba(0,0,0,0.25)', null);
            g.strokeStyle = 'rgba(20,14,10,0.5)'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(40, 30); g.lineTo(34, 60); g.lineTo(42, 84); g.moveTo(124, 28); g.lineTo(118, 52); g.stroke();
            g.fillStyle = '#06070a'; g.fillRect(52, 54, 60, H - 60); g.strokeStyle = OUT; g.lineWidth = 1.5; g.strokeRect(52, 54, 60, H - 60);
            [[46, 100], [112, 100]].forEach((q) => { g.fillStyle = lin(g, q[0], 0, q[0] + 8, 0, '#8a5a30', '#5a3a1c'); g.fillRect(q[0], 48, 8, H - 54); g.strokeStyle = OUT; g.lineWidth = 1.2; g.strokeRect(q[0], 48, 8, H - 54); });
            g.fillStyle = lin(g, 0, 44, 0, 56, '#a06a38', '#6a4524'); g.fillRect(40, 44, 84, 12); g.strokeStyle = OUT; g.strokeRect(40, 44, 84, 12);
            g.strokeStyle = 'rgba(40,24,10,0.55)'; g.lineWidth = 1; [60, 80, 100].forEach((x) => { g.beginPath(); g.moveTo(x, 45); g.lineTo(x + 3, 55); g.stroke(); });
            g.strokeStyle = '#6a5a4a'; g.lineWidth = 2; g.beginPath(); g.moveTo(66, H - 8); g.lineTo(62, 76); g.moveTo(98, H - 8); g.lineTo(102, 76); g.stroke(); g.lineWidth = 1.6; for (let y = H - 14; y > 80; y -= 11) { g.beginPath(); g.moveTo(66 - (H - y) * 0.03 + 2, y); g.lineTo(98 + (H - y) * 0.03 - 2, y); g.stroke(); }
            const f = 0.8 + 0.2 * Math.sin(t * 8 + (o.x || 0)); g.fillStyle = '#2a2a2a'; g.fillRect(36, 60, 3, 6); g.fillStyle = '#f2b24a'; g.beginPath(); g.ellipse(37.5, 70, 5, 6, 0, 0, 6.3); g.fill(); g.fillStyle = 'rgba(255,200,100,' + (0.3 * f).toFixed(2) + ')'; g.beginPath(); g.arc(37.5, 70, 15, 0, 6.3); g.fill();
            g.fillStyle = '#7d7f85'; [[18, H - 12, 9], [148, H - 14, 8], [30, H - 8, 6]].forEach((r) => { g.beginPath(); g.ellipse(r[0], r[1], r[2], r[2] * 0.7, 0, 0, 6.3); g.fill(); g.strokeStyle = OUT; g.lineWidth = 1; g.stroke(); });
        },
        cavemouth(g, t, o) {
            const W = 152, H = 114; shadow(g, W, H, 0.5);
            poly(g, [[4, H - 6], [6, 56], [24, 26], [58, 8], [98, 10], [130, 28], [148, 60], [148, H - 6]], lin(g, 0, 6, W, H, '#6f7d5a', '#3c4630'), OUT, 2);
            poly(g, [[24, 26], [58, 8], [98, 10], [70, 38], [34, 54]], 'rgba(200,230,160,0.18)', null);
            g.fillStyle = 'rgba(80,130,50,0.7)'; g.beginPath(); g.ellipse(46, 22, 18, 6, -0.3, 0, 6.3); g.ellipse(112, 24, 14, 5, 0.3, 0, 6.3); g.fill();
            g.fillStyle = '#050805'; g.beginPath(); g.moveTo(40, H - 6); g.quadraticCurveTo(34, 62, 76, 52); g.quadraticCurveTo(118, 62, 112, H - 6); g.closePath(); g.fill(); g.strokeStyle = OUT; g.lineWidth = 2; g.stroke();
            g.fillStyle = lin(g, 0, 44, 0, 74, '#7a5a34', '#4a3420'); poly(g, [[30, 54], [76, 40], [122, 54], [112, 64], [76, 54], [40, 66]], g.fillStyle, OUT, 1.6);   // lona esfarrapada
            g.fillStyle = '#6a4a2a'; poly(g, [[44, 64], [50, 84], [57, 66]], '#6a4a2a', OUT, 1); poly(g, [[96, 64], [102, 82], [108, 66]], '#6a4a2a', OUT, 1);
            [[10, 6], [140, 6]].forEach((s, i) => { const x = s[0]; g.strokeStyle = OUT; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(x + 4, H - 4); g.lineTo(x + 4, 52); g.stroke(); g.strokeStyle = '#8a6a44'; g.lineWidth = 3.6; g.stroke(); poly(g, [[x, 52], [x + 4, 40], [x + 8, 52]], '#cdb78a', OUT, 1.2); });
            g.fillStyle = '#e8e2cc'; g.beginPath(); g.arc(14, 38, 7, 0, 6.3); g.fill(); g.strokeStyle = OUT; g.lineWidth = 1.2; g.stroke(); g.fillStyle = '#1c1612'; g.fillRect(10, 36, 3, 4); g.fillRect(15, 36, 3, 4);
            const f = 0.8 + 0.2 * Math.sin(t * 9 + (o.x || 0)); [[26, H - 22], [126, H - 22]].forEach((q) => { g.fillStyle = '#4a3420'; g.fillRect(q[0] - 1.5, q[1], 3, 14); g.fillStyle = '#ff9a3a'; g.beginPath(); g.ellipse(q[0], q[1] - 2, 4.2 * f, 6.2, 0, 0, 6.3); g.fill(); g.fillStyle = 'rgba(255,170,70,' + (0.26 * f).toFixed(2) + ')'; g.beginPath(); g.arc(q[0], q[1] - 2, 17, 0, 6.3); g.fill(); });
            g.fillStyle = '#dcd6bc'; g.fillRect(70, H - 12, 12, 4); g.fillRect(84, H - 10, 10, 3);
        },
        ruinarch(g, t, o) {
            const W = 164, H = 122; shadow(g, W, H, 0.5); const c = ['#e7d3a2', '#bda070', '#85703f'];
            poly(g, [[10, H - 8], [10, 36], [26, 20], [44, 28], [44, H - 8]], lin(g, 10, 20, 44, H, c[0], c[2]), OUT, 1.8);
            poly(g, [[120, H - 8], [120, 50], [136, 34], [156, 46], [156, H - 8]], lin(g, 120, 34, 156, H, c[0], c[2]), OUT, 1.8);
            poly(g, [[8, 36], [8, 24], [48, 24], [48, 36]], lin(g, 8, 24, 48, 36, c[0], c[1]), OUT, 1.4);
            poly(g, [[44, 30], [60, 12], [82, 4], [100, 10], [104, 22], [90, 24], [86, 34], [60, 34]], lin(g, 44, 4, 104, 34, c[0], c[1]), OUT, 1.8);
            g.strokeStyle = 'rgba(70,50,20,0.5)'; g.lineWidth = 1.2; for (let y = 44; y < H - 12; y += 12) { g.beginPath(); g.moveTo(14, y); g.lineTo(40, y); g.moveTo(124, y + 4); g.lineTo(152, y + 4); g.stroke(); }
            g.fillStyle = '#0a0806'; g.beginPath(); g.moveTo(52, H - 8); g.lineTo(52, 56); g.arc(82, 56, 30, Math.PI, 0); g.lineTo(112, H - 8); g.closePath(); g.fill(); g.strokeStyle = OUT; g.lineWidth = 2; g.stroke();
            for (let i = 0; i < 4; i++) { const y = H - 14 - i * 12; g.fillStyle = lin(g, 0, y, 0, y + 10, '#8a7448', '#5a4a2a'); g.fillRect(58 + i * 3, y, 48 - i * 6, 10); }
            g.fillStyle = 'rgba(224,190,120,0.9)'; g.beginPath(); g.ellipse(24, H - 6, 22, 7, 0, 0, 6.3); g.ellipse(142, H - 6, 20, 6, 0, 0, 6.3); g.ellipse(70, H - 5, 14, 4, 0, 0, 6.3); g.fill();
            g.fillStyle = c[1]; [[130, H - 14, 9], [18, H - 12, 7]].forEach((r) => { g.beginPath(); g.ellipse(r[0], r[1], r[2], r[2] * 0.7, 0, 0, 6.3); g.fill(); g.strokeStyle = OUT; g.lineWidth = 1; g.stroke(); });
        },
        craterrim(g, t, o) {
            const W = 184, H = 126, p = 0.7 + 0.3 * Math.sin(t * 2.4 + (o.x || 0) * 0.03); shadow(g, W, H, 0.5);
            poly(g, [[4, H - 6], [4, 70], [22, 36], [56, 14], [92, 6], [128, 14], [162, 36], [180, 70], [180, H - 6]], lin(g, 0, 6, W, H, '#4d4543', '#201a19'), OUT, 2);
            poly(g, [[22, 36], [56, 14], [92, 6], [66, 44], [34, 62]], 'rgba(255,255,255,0.1)', null);
            g.fillStyle = '#0c0504'; g.beginPath(); g.moveTo(44, H - 6); g.quadraticCurveTo(40, 56, 92, 46); g.quadraticCurveTo(144, 56, 140, H - 6); g.closePath(); g.fill(); g.strokeStyle = OUT; g.lineWidth = 2; g.stroke();
            const rg = g.createRadialGradient(92, H - 10, 4, 92, H - 10, 56); rg.addColorStop(0, 'rgba(255,190,70,' + (0.8 * p).toFixed(2) + ')'); rg.addColorStop(0.5, 'rgba(230,70,20,' + (0.45 * p).toFixed(2) + ')'); rg.addColorStop(1, 'rgba(120,20,0,0)'); g.fillStyle = rg; g.fillRect(36, 48, 112, H - 50);
            g.strokeStyle = 'rgba(255,120,30,' + (0.8 * p).toFixed(2) + ')'; g.lineWidth = 2.2; g.lineCap = 'round'; [[40, 70, 28, 94], [142, 74, 156, 100], [60, 30, 52, 52], [124, 28, 134, 50]].forEach((v) => { g.beginPath(); g.moveTo(v[0], v[1]); g.lineTo((v[0] + v[2]) / 2 + 3, (v[1] + v[3]) / 2); g.lineTo(v[2], v[3]); g.stroke(); });
            g.fillStyle = '#e9e1c8'; g.beginPath(); g.ellipse(92, 28, 13, 10, 0, 0, 6.3); g.fill(); g.strokeStyle = OUT; g.lineWidth = 1.4; g.stroke(); poly(g, [[82, 22], [74, 8], [86, 18]], '#e9e1c8', OUT, 1.2); poly(g, [[102, 22], [110, 8], [98, 18]], '#e9e1c8', OUT, 1.2); g.fillStyle = '#1a0e0a'; g.beginPath(); g.ellipse(87, 28, 3, 4, 0, 0, 6.3); g.ellipse(97, 28, 3, 4, 0, 0, 6.3); g.fill();
            for (let i = 0; i < 4; i++) { const q = (t * 0.4 + i / 4 + hh(o, i)) % 1; g.fillStyle = 'rgba(90,76,72,' + (0.4 * (1 - q)).toFixed(2) + ')'; g.beginPath(); g.arc(70 + i * 16 + Math.sin(t + i) * 4, 38 - q * 34, 4 + q * 7, 0, 6.3); g.fill(); }
        },
        torch(g, t, o) {
            const f = 0.8 + 0.2 * Math.sin(t * 9 + (o.x || 0) * 0.2) * Math.sin(t * 5.3 + (o.y || 0));
            g.strokeStyle = OUT; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(11, 46); g.lineTo(11, 22); g.stroke(); g.strokeStyle = '#7a5230'; g.lineWidth = 3.6; g.stroke();
            g.fillStyle = '#3a3a40'; g.fillRect(5, 20, 12, 5); g.strokeStyle = OUT; g.lineWidth = 1; g.strokeRect(5, 20, 12, 5);
            const gr = g.createRadialGradient(11, 12, 1, 11, 12, 18); gr.addColorStop(0, 'rgba(255,200,100,' + (0.55 * f).toFixed(2) + ')'); gr.addColorStop(1, 'rgba(255,140,40,0)'); g.fillStyle = gr; g.fillRect(-8, -6, 38, 38);
            g.fillStyle = '#ff9a3a'; g.beginPath(); g.moveTo(5, 20); g.quadraticCurveTo(4, 8, 11 + Math.sin(t * 7 + o.x) * 1.4, 0 - 3 * f); g.quadraticCurveTo(18, 8, 17, 20); g.closePath(); g.fill(); g.fillStyle = '#ffe27a'; g.beginPath(); g.ellipse(11, 16, 3.2, 5.4 * f, 0, 0, 6.3); g.fill();
        }
    };
    function installArt() {
        const C = window.CATALOG; if (!C || !C.DECOR) return;
        Object.keys(NEWDECOR).forEach((k) => { if (!C.DECOR[k]) C.DECOR[k] = Object.assign({}, NEWDECOR[k]); });
        const A = window.Art; if (!A || !A.drawDecor || window.__edWrapped) return; window.__edWrapped = true;
        const od = A.drawDecor;
        A.drawDecor = function (ctx, o, t) {
            const fn = o && DRAW[o.kind], d = fn && window.CATALOG.DECOR[o.kind]; if (!fn || !d) return od.apply(this, arguments);
            const ow = o.w || d.w, oh = o.h || d.h; ctx.save(); ctx.translate(o.x, o.y); ctx.scale(ow / d.w, oh / d.h);
            try { fn(ctx, t, o); } catch (e) { console.error('[edges] decor', o.kind, e); } ctx.restore();
        };
        A.drawDecor._ed = true;
        const os = A.drawStation;
        A.drawStation = function (ctx, o, t) { if (o && o.type === 'portal' && o.look && LOOK[o.look]) { try { LOOK[o.look](ctx, o, t); } catch (e) { console.error('[edges] look', e); } return; } return os.apply(this, arguments); };
        A.drawStation._ed = true;
    }
    function label(ctx, o, cx, y, col) {
        ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center'; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3; const pl = (o.name && o.name !== 'Chão') ? o.name : 'Entrada'; ctx.strokeText(pl, cx, y); ctx.fillStyle = col || '#efe3c0'; ctx.fillText(pl, cx, y); ctx.textAlign = 'start';
    }
    const LOOK = {   // aparência do portal (a "porta" ou escada em si; o prédio/rocha fica no corpo sólido atrás)
        down(ctx, o, t) {   // escada que desce
            const x = o.x, y = o.y, w = o.w || 64, h = o.h || 64, cx = x + w / 2, tone = o.tone || ['#9a9ca3', '#5a5c64', '#15161c'];
            for (let i = 0; i < 5; i++) { const yy = y + 6 + i * 11, ww = w - 6 - i * 6; ctx.fillStyle = lin(ctx, 0, yy, 0, yy + 11, tone[0], tone[1]); ctx.fillRect(cx - ww / 2, yy, ww, 11); ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.strokeRect(cx - ww / 2, yy, ww, 11); ctx.fillStyle = 'rgba(0,0,0,' + (0.1 + i * 0.13) + ')'; ctx.fillRect(cx - ww / 2, yy, ww, 11); }
            const p = 0.5 + 0.5 * Math.sin(t * 2 + x); ctx.fillStyle = 'rgba(' + (o.glow || '150,255,190') + ',' + (0.1 + 0.08 * p).toFixed(2) + ')'; ctx.beginPath(); ctx.ellipse(cx, y + 40, 24, 22, 0, 0, 6.3); ctx.fill();
            label(ctx, o, cx, y + h + 12, '#efe3c0');
        },
        up(ctx, o, t) {   // escada que sobe (saída da masmorra): luz do alto
            const x = o.x, y = o.y, w = o.w || 64, h = o.h || 64, cx = x + w / 2, p = 0.5 + 0.5 * Math.sin(t * 2 + x);
            const gl = ctx.createRadialGradient(cx, y + 20, 2, cx, y + 20, 56); gl.addColorStop(0, 'rgba(255,240,190,' + (0.5 + 0.2 * p).toFixed(2) + ')'); gl.addColorStop(1, 'rgba(255,220,150,0)'); ctx.fillStyle = gl; ctx.fillRect(cx - 60, y - 40, 120, 110);
            for (let i = 0; i < 5; i++) { const yy = y + 6 + i * 11, ww = 30 + i * 6; ctx.fillStyle = lin(ctx, 0, yy, 0, yy + 11, '#d8d4c4', '#8d8a7c'); ctx.fillRect(cx - ww / 2, yy, ww, 11); ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.strokeRect(cx - ww / 2, yy, ww, 11); }
            label(ctx, o, cx, y + h + 12, '#fff3c8');
        },
        door(ctx, o, t) {   // porta arcana da torre
            const x = o.x, y = o.y, w = o.w || 64, h = o.h || 64, cx = x + w / 2, p = 0.5 + 0.5 * Math.sin(t * 2.2 + x);
            ctx.fillStyle = 'rgba(180,120,255,' + (0.18 + 0.12 * p).toFixed(2) + ')'; ctx.beginPath(); ctx.ellipse(cx, y + 34, 22, 30, 0, 0, 6.3); ctx.fill();
            ctx.strokeStyle = 'rgba(230,200,255,' + (0.6 + 0.3 * p).toFixed(2) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, y + 30, 18, Math.PI, 0); ctx.lineTo(cx + 18, y + 54); ctx.moveTo(cx - 18, y + 30); ctx.lineTo(cx - 18, y + 54); ctx.stroke();
            for (let i = 0; i < 5; i++) { const q = (t * 0.5 + i / 5) % 1; ctx.fillStyle = 'rgba(235,210,255,' + (0.8 * (1 - q)).toFixed(2) + ')'; ctx.fillRect(cx - 12 + i * 6 + Math.sin(t * 2 + i) * 3, y + 54 - q * 40, 2, 2); }
            label(ctx, o, cx, y + h + 12, '#efdcff');
        }
    };

    /* ============================ RUNTIME: andar até a borda ============================ */
    let cd = 0, fade = 0, lastArrive = 0;
    function mapOf(id) { return typeof gameMaps !== 'undefined' ? gameMaps[id] : null; }
    function go(m, e) {
        const dst = mapOf(e.to); if (!dst) return false;
        const Wd = dst.width || 800, Hd = dst.height || 600, hz = e.d === 'e' || e.d === 'w', lat = hz ? player.y : player.x;
        const t = Math.max(0, Math.min(1, (lat - e.a) / Math.max(1, e.b - e.a))), tl = e.ta + t * (e.tb - e.ta);
        let nx, ny; if (e.td === 'w') { nx = ARRIVE; ny = tl; } else if (e.td === 'e') { nx = Wd - ARRIVE; ny = tl; } else if (e.td === 'n') { nx = tl; ny = ARRIVE; } else { nx = tl; ny = Hd - ARRIVE; }
        const keepFace = { x: player.facing.x, y: player.facing.y };
        switchMap(e.to, nx, ny); player.facing.x = keepFace.x; player.facing.y = keepFace.y;
        cd = COOL; fade = FADE_FR; lastArrive = performance.now();
        try { setActionText(dst.name || e.to, '#e8c469'); } catch (er) { }
        return true;
    }
    // chamado por quadro a partir do update(); true = o mapa usa bordas (a lógica antiga de grade é ignorada)
    function step(m, W, H) {
        if (!m || !Array.isArray(m.edges)) return false;
        if (cd > 0) cd--;
        const x = player.x, y = player.y;
        if (cd <= 0) for (const e of m.edges) {
            let hit = false;
            if (e.d === 'w') hit = x <= TRIG && y >= e.a - 6 && y <= e.b + 6; else if (e.d === 'e') hit = x >= W - TRIG && y >= e.a - 6 && y <= e.b + 6;
            else if (e.d === 'n') hit = y <= TRIG && x >= e.a - 6 && x <= e.b + 6; else if (e.d === 's') hit = y >= H - TRIG && x >= e.a - 6 && x <= e.b + 6;
            if (hit && go(m, e)) return true;
        }
        if (player.x <= 15) { player.x = 15; player.destX = Math.max(15, player.destX); } else if (player.x >= W - 15) { player.x = W - 15; player.destX = Math.min(W - 15, player.destX); }
        if (player.y <= 15) { player.y = 15; player.destY = Math.max(15, player.destY); } else if (player.y >= H - 15) { player.y = H - 15; player.destY = Math.min(H - 15, player.destY); }
        return true;
    }
    function drawFade(ctx, cw, ch) { if (fade <= 0) return; ctx.save(); ctx.fillStyle = 'rgba(8,6,4,' + (0.9 * fade / FADE_FR).toFixed(3) + ')'; ctx.fillRect(0, 0, cw, ch); ctx.restore(); fade--; }

    /* ============================ MIGRAÇÃO ============================ */
    const mark = () => { try { if (window.Content && Content.mark) Content.mark(); } catch (e) { } };
    const flag = (m, k) => { if (!m.c7 || typeof m.c7 !== 'object') m.c7 = {}; if (m.c7[k]) return false; m.c7[k] = true; mark(); return true; };
    const hasFlag = (m, k) => !!(m && m.c7 && m.c7[k]);
    const dsz = (k) => { const d = (window.CATALOG && CATALOG.DECOR && CATALOG.DECOR[k]) || { w: 30, h: 30 }; const s = typeof SCALE_DECOR === 'number' ? SCALE_DECOR : 1.3; return [R(d.w * s), R(d.h * s)]; };
    let idn = 0; const nid = (p) => 'c7_' + p + '_' + (idn++) + '_' + Math.floor(Math.random() * 1e6);
    const visRect = (o) => { if (o.type === 'tree') return [o.x - 12, o.y - 30, 100, 126]; return [o.x, o.y, o.w || 30, o.h || 30]; };
    const ovl = (a, b, pad) => a[0] - pad < b[0] + b[2] && a[0] + a[2] + pad > b[0] && a[1] - pad < b[1] + b[3] && a[1] + a[3] + pad > b[1];
    const REMOVABLE = (o) => o.type === 'tree' || o.type === 'decor' || (typeof o.type === 'string' && o.type.startsWith('rock')) || o.type === 'ground_item' || o.type === 'fire' || o.type === 'enemy';
    function clearRect(m, rect, pad, keep) {
        const before = (m.entities || []).length; m.entities = (m.entities || []).filter((o) => { if (!o || o.active === false && o.type !== 'tree') return true; if (!REMOVABLE(o)) return true; if (keep && keep(o)) return true; return !ovl(rect, visRect(o), pad); });
        return before - m.entities.length;
    }
    const blockedBy = (m, rect, pad) => (m.entities || []).some((o) => o && o.active !== false && (o.type === 'house' || o.type === 'npc' || o.type === 'bank' || o.type === 'furnace' || o.type === 'anvil' || o.type === 'portal' || o.type === 'fishing_spot') && ovl(rect, visRect(o), pad));
    const onWater = (m, rect) => (m.entities || []).some((o) => o && o.type === 'paint' && o.color === '#3498db' && ovl(rect, [o.x, o.y, o.w, o.h], 0));
    function paintRoad(m, linkId, side, pts, w, col) {
        let n = 0; const add = (x, y, ww, hh) => { m.entities.push({ id: 'c7_' + linkId + '_' + side + '_' + (n++), type: 'paint', name: 'Chão', color: col, x: R(x), y: R(y), w: R(ww), h: R(hh), active: true }); };
        for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], z = pts[i + 1]; if (a[1] === z[1]) add(Math.min(a[0], z[0]) - w / 2, a[1] - w / 2, Math.abs(z[0] - a[0]) + w, w); else add(a[0] - w / 2, Math.min(a[1], z[1]) - w / 2, w, Math.abs(z[1] - a[1]) + w); }
    }
    function addDecor(m, kind, x, y, extra) { const s = dsz(kind); const o = Object.assign({ id: nid('dc'), type: 'decor', kind, name: ((window.CATALOG && CATALOG.DECOR[kind]) || {}).name || kind, x: R(x), y: R(y), w: s[0], h: s[1], active: true }, extra || {}); m.entities.push(o); return o; }
    function edgePoint(m, d, c) { const W = m.width || 800, H = m.height || 600; return d === 'w' ? [0, c] : d === 'e' ? [W, c] : d === 'n' ? [c, 0] : [c, H]; }
    function gateDress(m, d, c, w) {   // portão de fortaleza/cidade: duas torres de vigia ladeando a abertura
        const W = m.width || 800, H = m.height || 600, bs = (k) => { const b = (window.CATALOG && CATALOG.BUILDINGS && CATALOG.BUILDINGS[k]) || { w: 76, h: 150 }; const s = typeof SCALE_BUILD === 'number' ? SCALE_BUILD : 1.75; return [R(b.w * s), R(b.h * s)]; };
        const t = bs('watchtower'), g = w / 2 + 26; const spots = d === 'w' ? [[6, c - g - t[1] + 40], [6, c + g - 10]] : d === 'e' ? [[W - t[0] - 6, c - g - t[1] + 40], [W - t[0] - 6, c + g - 10]] : d === 'n' ? [[c - g - t[0], 4], [c + g, 4]] : [[c - g - t[0], H - t[1] - 4], [c + g, H - t[1] - 4]];
        spots.forEach((p) => { const r = [p[0], p[1], t[0], t[1]]; clearRect(m, r, 10); if (!blockedBy(m, r, 6) && !(m.entities || []).some((o) => o && o.type === 'house' && o.style === 'watchtower' && ovl(r, visRect(o), 0))) m.entities.push({ id: nid('gt'), type: 'house', style: 'watchtower', name: 'Torre do Portão', x: R(p[0]), y: R(p[1]), w: t[0], h: t[1], active: true }); });
    }
    function applySide(maps, L, S, O) {   // S = ponta desta mapa; O = a outra
        const m = maps[S.m], other = maps[O.m]; if (!m || !other) return false;
        const key = L.id + ':' + S.d; if (hasFlag(m, key)) return true;
        if (!Array.isArray(m.entities)) m.entities = [];
        const W = m.width || 800, H = m.height || 600, hz = S.d === 'e' || S.d === 'w', w = S.w || 100, e0 = edgePoint(m, S.d, S.c);
        // 1) tira os portais antigos (e os postes deles) desta ligação
        m.entities = m.entities.filter((o) => !(o && typeof o.id === 'string' && (o.id === 'c6_' + L.id + '_a' || o.id === 'c6_' + L.id + '_b' || o.id.indexOf('c6_' + L.id + '_l') === 0)));
        // 2) caminho: da borda até os pontos interiores
        const pts = [e0].concat(S.via || []);
        const rects = []; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], z = pts[i + 1]; rects.push(a[1] === z[1] ? [Math.min(a[0], z[0]) - w / 2, a[1] - w / 2, Math.abs(z[0] - a[0]) + w, w] : [a[0] - w / 2, Math.min(a[1], z[1]) - w / 2, w, Math.abs(z[1] - a[1]) + w]); }
        if (!S.via || !S.via.length) rects.push(hz ? [S.d === 'w' ? 0 : W - 260, S.c - w / 2, 260, w] : [S.c - w / 2, S.d === 'n' ? 0 : H - 260, w, 260]);   // só limpa o corredor junto à borda
        rects.forEach((r) => clearRect(m, r, 14));
        // 3) estrada
        if (S.road !== false && S.via && S.via.length) { const sp = pts.slice(); paintRoad(m, L.id, S.d, sp, w, S.col || DIRT); }
        // 4) a borda
        if (!m.edges) m.edges = [];
        if (!m.edges.some((q) => q.id === L.id)) m.edges.push({ id: L.id, d: S.d, a: R(S.c - w / 2 + 12), b: R(S.c + w / 2 - 12), to: O.m, td: O.d, ta: R(O.c - (O.w || 100) / 2 + 12), tb: R(O.c + (O.w || 100) / 2 - 12) });
        if (S.gate) gateDress(m, S.d, S.c, w);
        flag(m, key); mark(); return true;
    }
    function mergeBorderFlag(maps) { Object.keys(maps).forEach((k) => { const m = maps[k]; if (m && m.edges && !Array.isArray(m.edges)) m.edges = []; }); }
    function landingFor(m, cx, cy) {   // ponto livre em frente à entrada (para a saída da masmorra)
        const ents = (m.entities || []).filter((o) => o && o.active !== false && o.type !== 'paint' && o.type !== 'ground_item' && o.type !== 'fishing_spot' && o.type !== 'portal' && o.type !== 'enemy' && o.type !== 'npc');
        const ok = (x, y) => !ents.some((o) => { const v = visRect(o); if (o.type === 'decor' && window.CATALOG && CATALOG.DECOR[o.kind] && !CATALOG.DECOR[o.kind].solid) return false; return ovl([x - 22, y - 22, 44, 44], v, 0); });
        for (let r = 0; r < 300; r += 16) for (let a = 0; a < 16; a++) { const x = R(cx + Math.cos(a / 16 * 6.283 + 1.57) * r), y = R(cy + Math.sin(a / 16 * 6.283 + 1.57) * r); if (x > 40 && y > 40 && x < (m.width || 800) - 40 && y < (m.height || 600) - 40 && ok(x, y)) return { x, y }; }
        return { x: cx, y: cy };
    }
    const BODY_OF = { tomb: 'tomb', mine: 'minegate', cave: 'cavemouth', ruins: 'ruinarch', crater: 'craterrim' };
    const STAIR = { tomb: { tone: ['#a4a6ad', '#62646c', '#15161c'], glow: '120,255,180' }, mine: { tone: ['#8a6a44', '#4e3a22', '#120e0a'], glow: '255,190,100' }, cave: { tone: ['#7a8a62', '#3e4a32', '#0a0e08'], glow: '150,220,110' }, ruins: { tone: ['#d8c28e', '#8f7a48', '#18120a'], glow: '255,220,140' }, crater: { tone: ['#5a504c', '#2a2220', '#0c0504'], glow: '255,140,50' } };
    function dressDungeon(maps, D) {
        const mo = maps[D.out[0]], mi = maps[D.inn[0]]; if (!mo || !mi) return;
        const po = (mo.entities || []).find((o) => o && o.id === D.out[1] && o.type === 'portal'), pi = (mi.entities || []).find((o) => o && o.id === D.inn[1] && o.type === 'portal');
        if (!po || !pi) return; if (hasFlag(mo, 'dg:' + D.id)) return;
        const W = mo.width || 800, H = mo.height || 600; let site = null;
        if (D.look === 'tower') {
            const bd = (window.CATALOG && CATALOG.BUILDINGS && CATALOG.BUILDINGS.wizard_tower) || { w: 86, h: 190 }, sb = typeof SCALE_BUILD === 'number' ? SCALE_BUILD : 1.75, bw = R(bd.w * sb), bh = R(bd.h * sb);
            const hx = po.x + 32, hy = po.y + 32;
            for (let r = 0; r < 700 && !site; r += 20) for (let a = 0; a < (r ? 24 : 1) && !site; a++) {
                const cx = R(hx + Math.cos(a / 24 * 6.283) * r), by = R(hy + Math.sin(a / 24 * 6.283) * r + bh * 0.4); const rect = [cx - bw / 2, by - bh, bw, bh + 150];
                if (rect[0] < 60 || rect[1] < 60 || rect[0] + rect[2] > W - 60 || by + 120 > H - 60) continue; if (onWater(mo, rect)) continue;
                if ((mo.entities || []).some((o) => o && o !== po && ['house', 'npc', 'bank', 'furnace', 'anvil', 'portal', 'fishing_spot'].includes(o.type) && ovl(rect, visRect(o), 20))) continue; site = { cx, by, bw, bh, rect };
            }
            if (!site) return;
            clearRect(mo, site.rect, 16); mo.entities.push({ id: nid('tw'), type: 'house', style: 'wizard_tower', name: 'Torre do Mago Louco', x: site.cx - bw / 2, y: site.by - bh, w: bw, h: bh, active: true });
            po.x = site.cx - 32; po.y = site.by - 56; po.look = 'door'; po.w = 64; po.h = 64; po.name = D.outName;
            const ld = landingFor(mo, site.cx, site.by + 54); pi.destX = ld.x; pi.destY = ld.y;
        } else {
            const bk = BODY_OF[D.look], bd = BODY[bk], hx = po.x + 32, hy = po.y + 32;
            for (let r = 0; r < 700 && !site; r += 20) for (let a = 0; a < (r ? 24 : 1) && !site; a++) {
                const cx = R(hx + Math.cos(a / 24 * 6.283) * r), pyy = R(hy + Math.sin(a / 24 * 6.283) * r - 32); const rect = [cx - bd.w / 2, pyy + 8 - bd.h, bd.w, bd.h + 64 + 90 - 8];
                if (rect[0] < 60 || rect[1] < 60 || rect[0] + rect[2] > W - 60 || rect[1] + rect[3] > H - 60) continue; if (onWater(mo, rect)) continue;
                if ((mo.entities || []).some((o) => o && o !== po && ['house', 'npc', 'bank', 'furnace', 'anvil', 'portal', 'fishing_spot'].includes(o.type) && ovl(rect, visRect(o), 14))) continue; site = { cx, py: pyy, rect };
            }
            if (!site) return;
            clearRect(mo, site.rect, 12);
            mo.entities.push({ id: nid('bd'), type: 'decor', kind: bk, name: bd.name, x: site.cx - bd.w / 2, y: site.py + 8 - bd.h, w: bd.w, h: bd.h, active: true });
            const sx = STAIR[D.look]; po.x = site.cx - 32; po.y = site.py; po.look = 'down'; po.tone = sx.tone; po.glow = sx.glow; po.name = D.outName; po.w = 64; po.h = 64;
            const ld = landingFor(mo, site.cx, site.py + 64 + 44); pi.destX = ld.x; pi.destY = ld.y;
            // dê vida ao redor: lápides, postes, caixotes...
            const bx = site.cx - bd.w / 2, by0 = site.py + 8 - bd.h, side = (k, dx, dy, ex) => addDecor(mo, k, bx + dx, by0 + dy, ex);
            if (D.look === 'tomb') { side('gravestone', -34, bd.h - 40); side('gravestone', bd.w + 10, bd.h - 34); side('bones', bd.w + 24, bd.h - 8); }
            else if (D.look === 'mine') { side('crates', -50, bd.h - 40); side('barrel', -14, bd.h - 8); side('cart', bd.w + 6, bd.h - 44); side('sign', bd.w - 6, bd.h + 6); }
            else if (D.look === 'cave') { side('bones', -30, bd.h - 8); side('bones', bd.w + 6, bd.h - 4); side('reeds', -20, bd.h - 24); side('mushrooms', bd.w + 10, bd.h - 24); }
            else if (D.look === 'ruins') { side('pillar', -40, bd.h - 66, { tone: 'sand' }); side('cactus', bd.w + 10, bd.h - 52); side('bones', bd.w - 6, bd.h - 6); side('boulder', -52, bd.h - 30, { tone: 'sand' }); }
            else if (D.look === 'crater') { side('boulder', -50, bd.h - 40, { tone: 'ash' }); side('boulder', bd.w + 8, bd.h - 40, { tone: 'ash' }); side('lava', -40, bd.h + 6); side('bones', bd.w + 6, bd.h + 4); }
            // postes de luz antigos que sobraram no lugar antigo
            if (Math.hypot(po.x - (hx - 32), po.y - (hy - 32)) > 60) mo.entities = mo.entities.filter((o) => !(o && o.type === 'decor' && o.kind === 'lamp' && Math.abs(o.x - hx) < 120 && Math.abs(o.y - hy) < 120));
        }
        // saída da masmorra
        pi.look = 'up'; pi.name = D.inName; pi.w = 64; pi.h = 64;
                mi.env = mi.env || D.env;
        flag(mo, 'dg:' + D.id);
    }
    function addTorches(m) {
        if (!m || !Array.isArray(m.entities) || hasFlag(m, 'torches')) return;
        const walls = m.entities.filter((o) => o && o.type === 'decor' && (o.kind === 'wall_h' || o.kind === 'wall_v')).sort((a, b) => (a.y - b.y) || (a.x - b.x));
        let n = 0; const used = []; const nearTorch = (x, y) => used.some((u) => Math.hypot(u[0] - x, u[1] - y) < 230);
        walls.forEach((w) => { const x = w.kind === 'wall_h' ? w.x + (w.w || 125) / 2 - 11 : w.x + (w.w || 28) + 2, y = w.kind === 'wall_h' ? w.y + (w.h || 44) * 0.55 : w.y + (w.h || 120) / 2 - 20; if (nearTorch(x, y)) return; if (w.kind === 'wall_v' && w.x < 20) { /* parede da borda esquerda: tocha para dentro */ } used.push([x, y]); m.entities.push({ id: nid('tc'), type: 'decor', kind: 'torch', name: 'Tocha de Parede', x: R(x), y: R(y), w: 22, h: 50, active: true }); n++; });
        const ex = m.entities.filter((o) => o && o.type === 'portal'); ex.forEach((p) => { [[-44, -6], [p.w + 22, -6]].forEach((d) => { m.entities.push({ id: nid('tc'), type: 'decor', kind: 'torch', name: 'Tocha', x: R(p.x + d[0]), y: R(p.y + d[1]), w: 22, h: 50, active: true }); }); });
        flag(m, 'torches');
    }
    function migrate(maps) {
        if (!maps || typeof maps !== 'object') return { edges: 0 };
        installArt(); let n = 0;
        try {
            // ligações antigas que mudaram de lugar (Lumbridge→Campos agora é Vale do Rio→Campos pela borda leste do rio)
            ['l_lum_campos'].forEach((id) => Object.keys(maps).forEach((k) => { const m = maps[k]; if (!m || !Array.isArray(m.entities)) return; const before = m.entities.length; m.entities = m.entities.filter((o) => !(o && typeof o.id === 'string' && (o.id === 'c6_' + id + '_a' || o.id === 'c6_' + id + '_b' || o.id.indexOf('c6_' + id + '_l') === 0))); if (m.entities.length !== before) mark(); }));
            EDGE_LINKS.forEach((L) => { if (!maps[L.A.m] || !maps[L.B.m]) return; const a = applySide(maps, L, L.A, L.B), b = applySide(maps, L, L.B, L.A); if (a && b) n++; });
            DUNGEONS.forEach((D) => { try { dressDungeon(maps, D); } catch (e) { console.error('[edges] dungeon', D.id, e); } });
            DUNGEON_MAPS.forEach((id) => { if (maps[id]) { if (!maps[id].env) { maps[id].env = id === 'ruinas' || id === 'mina_abandonada' ? 'dim' : 'dark'; mark(); } addTorches(maps[id]); } });
        } catch (e) { console.error('[edges] migrate', e); }
        return { edges: n };
    }
    function neighbors(id) { const m = mapOf(id); const r = []; if (m && Array.isArray(m.edges)) m.edges.forEach((e) => { if (mapOf(e.to) && r.indexOf(e.to) < 0) r.push(e.to); }); return r; }
    installArt(); window.addEventListener('load', installArt);
    window.Edges = { step, drawFade, migrate, neighbors, EDGE_LINKS, EDGE_IDS, DUNGEONS, DUNGEON_MAPS, installArt, TRIG, ARRIVE, go, addTorches, _state: () => ({ cd, fade }) };
})();
