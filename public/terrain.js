/* ============================================================
   MiniScape 2D - TERRENO ORGÂNICO
   Estrada de terra, piso de pedra, grama escura e água são desenhados como MANCHAS:
   todas as peças da mesma espécie que se tocam viram uma mancha só, com contorno arredondado e irregular.
   Uma peça isolada vira um "toquinho" redondo; várias lado a lado formam um caminho/lago/praça maior.
   Cada espécie tem bordas próprias (pedrinhas, tufos de grama, torrões de terra, juncos...).
   Tudo é calculado em coordenadas do MUNDO (campo + ruído determinísticos), então os blocos de cache se emendam sem costura.
   Não muda dados: as peças continuam sendo retângulos 'paint' (agora presas a uma grade de 40 px no editor).
   ============================================================ */
(function (root) {
    'use strict';
    const A = root.Art; if (!A) { console.error('art.js/artworld.js precisam carregar antes de terrain.js'); return; }
    const hash = A.hash, TAU = Math.PI * 2;
    const S = 2;              // pixels do mundo por amostra do campo
    const PAD = 40;           // sobra (px do mundo) em volta do bloco: maior que o raio do borrão, para as costuras baterem
    const T0 = 0.45;          // limiar do contorno
    const ORDER = ['grass', 'water', 'dirt', 'stone'];   // de baixo para cima: ponte de pedra sobre a água, estrada sobre a grama...
    const STYLE = {
        grass: { R: 6, amp: 0.30, soft: 0.16 },
        water: { R: 7, amp: 0.32 },
        dirt: { R: 5, amp: 0.30 },
        stone: { R: 4, amp: 0.22 }
    };
    const PAINT_KIND = { '#5c4033': 'dirt', '#7f8c8d': 'stone', '#27ae60': 'grass', '#3498db': 'water' };

    const h2 = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
    const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return (h2(xi, yi) * (1 - u) + h2(xi + 1, yi) * u) * (1 - v) + (h2(xi, yi + 1) * (1 - u) + h2(xi + 1, yi + 1) * u) * v; };
    const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

    function boxBlur(src, dst, nx, ny, r) {   // média móvel separável (fora da área = 0); src é destruído como rascunho
        const k = 1 / (2 * r + 1);
        for (let y = 0; y < ny; y++) {   // horizontal: src -> dst
            let s = 0; const o = y * nx; for (let x = 0; x <= r && x < nx; x++) s += src[o + x];
            for (let x = 0; x < nx; x++) { dst[o + x] = s * k; const a = x + r + 1, b = x - r; if (a < nx) s += src[o + a]; if (b >= 0) s -= src[o + b]; }
        }
        for (let x = 0; x < nx; x++) {   // vertical: dst -> src
            let s = 0; for (let y = 0; y <= r && y < ny; y++) s += dst[y * nx + x];
            for (let y = 0; y < ny; y++) { src[y * nx + x] = s * k; const a = y + r + 1, b = y - r; if (a < ny) s += dst[a * nx + x]; if (b >= 0) s -= dst[b * nx + x]; }
        }
    }

    let _scr = null;   // tela de rascunho reaproveitada
    function scratch(w, h) { if (!_scr) _scr = document.createElement('canvas'); if (_scr.width !== w || _scr.height !== h) { _scr.width = w; _scr.height = h; } return _scr; }
    function maskCanvas(nx, ny, fill) {   // canvas nx*ny; fill(i) -> [r,g,b,a]
        const c = document.createElement('canvas'); c.width = nx; c.height = ny; const g = c.getContext('2d'), id = g.createImageData(nx, ny), d = id.data;
        for (let i = 0, n = nx * ny; i < n; i++) { const p = fill(i), o = i * 4; d[o] = p[0]; d[o + 1] = p[1]; d[o + 2] = p[2]; d[o + 3] = p[3]; }
        g.putImageData(id, 0, 0); return c;
    }

    /* ---------- enfeites da borda ---------- */
    const pebble = (g, x, y, r, tone) => { g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x + 0.7, y + 1.1, r, r * 0.72, 0, 0, TAU); g.fill(); const c = 120 + tone * 70 | 0; g.fillStyle = 'rgb(' + c + ',' + (c - 2) + ',' + (c - 6) + ')'; g.beginPath(); g.ellipse(x, y, r, r * 0.72, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,0.28)'; g.beginPath(); g.ellipse(x - r * 0.25, y - r * 0.28, r * 0.5, r * 0.28, 0, 0, TAU); g.fill(); };
    const tuft = (g, x, y, s, col) => { g.strokeStyle = col || 'rgba(86,170,70,0.95)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 2.2 * s, y - 5 * s); g.moveTo(x, y); g.lineTo(x + 0.4 * s, y - 6.4 * s); g.moveTo(x, y); g.lineTo(x + 2.6 * s, y - 4.4 * s); g.stroke(); };
    const clump = (g, x, y, r, tone) => { g.fillStyle = 'rgba(40,22,8,0.34)'; g.beginPath(); g.ellipse(x + 0.6, y + 1, r, r * 0.66, 0, 0, TAU); g.fill(); g.fillStyle = tone > 0.5 ? '#8a6544' : '#6c4c30'; g.beginPath(); g.ellipse(x, y, r, r * 0.66, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,225,180,0.22)'; g.beginPath(); g.ellipse(x - r * 0.25, y - r * 0.2, r * 0.5, r * 0.26, 0, 0, TAU); g.fill(); };
    const reed = (g, x, y, hgt, t) => { g.strokeStyle = '#4d7a35'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + t, y - hgt * 0.6, x + t * 1.6, y - hgt); g.moveTo(x + 2, y); g.quadraticCurveTo(x + 2 - t, y - hgt * 0.5, x + 1 - t, y - hgt * 0.8); g.stroke(); g.fillStyle = '#6a4326'; g.beginPath(); g.ellipse(x + t * 1.6, y - hgt - 1.5, 1.3, 3, 0, 0, TAU); g.fill(); };
    const flower = (g, x, y, k) => { const cols = ['#fff4c2', '#ffb0c8', '#d8b0ff', '#ffe27a']; g.strokeStyle = 'rgba(40,120,50,0.9)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 3.4); g.stroke(); g.fillStyle = cols[k % 4]; g.beginPath(); g.arc(x, y - 4, 1.7, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,190,0,0.9)'; g.fillRect(x - 0.4, y - 4.4, 0.8, 0.8); };
    function decorate(g, kind, x, y, k, r1, r2) {
        if (kind === 'dirt') { if (k < 0.5) clump(g, x, y, 1.6 + r1 * 2.4, r2); else if (k < 0.74) pebble(g, x, y, 1.3 + r1 * 1.6, r2); else tuft(g, x, y, 0.8 + r1 * 0.5); }
        else if (kind === 'stone') { if (k < 0.55) pebble(g, x, y, 1.4 + r1 * 2.6, r2); else if (k < 0.8) tuft(g, x, y, 0.8 + r1 * 0.5, 'rgba(70,140,60,0.95)'); else { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 2, y, 5, 1.4); pebble(g, x, y, 2 + r1, r2); } }
        else if (kind === 'water') { if (k < 0.34) pebble(g, x, y, 1.2 + r1 * 1.6, 0.75 + r2 * 0.25); else if (k < 0.6) tuft(g, x, y, 0.9 + r1 * 0.5); else if (k < 0.78) reed(g, x, y, 9 + r1 * 8, (r2 - 0.5) * 3); else clump(g, x, y, 1.4 + r1 * 1.4, r2); }
        else if (kind === 'grass') { if (k < 0.5) tuft(g, x, y, 0.9 + r1 * 0.7); else if (k < 0.62) flower(g, x, y, (r2 * 4) | 0); else tuft(g, x, y, 0.7 + r1 * 0.4, 'rgba(120,200,90,0.9)'); }
    }
    const DENS = { dirt: 0.2, stone: 0.17, water: 0.15, grass: 0.1 };

    /* ---------- a mancha de uma espécie dentro de um bloco ---------- */
    function layer(g, kind, rects, x0, y0, W, H, patFn) {
        const st = STYLE[kind], nx = Math.ceil(W / S), ny = Math.ceil(H / S), n = nx * ny, R = st.R;
        const a = new Float32Array(n), b = new Float32Array(n);
        for (const r of rects) {   // cobertura (com fração nas bordas)
            const i0 = Math.max(0, Math.floor((r.x - x0) / S) - 1), i1 = Math.min(nx - 1, Math.ceil((r.x + r.w - x0) / S) + 1), j0 = Math.max(0, Math.floor((r.y - y0) / S) - 1), j1 = Math.min(ny - 1, Math.ceil((r.y + r.h - y0) / S) + 1);
            for (let j = j0; j <= j1; j++) { const sy = y0 + j * S, cy = Math.max(0, Math.min(sy + S, r.y + r.h) - Math.max(sy, r.y)) / S; if (cy <= 0) continue; for (let i = i0; i <= i1; i++) { const sx = x0 + i * S, cx = Math.max(0, Math.min(sx + S, r.x + r.w) - Math.max(sx, r.x)) / S; const v = cx * cy; if (v > a[j * nx + i]) a[j * nx + i] = v; } }
        }
        boxBlur(a, b, nx, ny, R); boxBlur(a, b, nx, ny, R);   // dois passes ≈ borrão suave
        const soft = st.soft || 0, amp = st.amp, seed = kind.length * 17.3;
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {   // ruído só onde há borda
            const k = j * nx + i, v = a[k]; if (v < 0.04 || v > 0.97) continue;
            const wx = x0 + i * S, wy = y0 + j * S;
            const nz = (vn(wx / 34 + seed, wy / 34) * 0.62 + vn(wx / 13 + 7.1, wy / 13 + seed) * 0.38) * 2 - 1;
            a[k] = v + nz * amp;
        }
        // máscaras (do tamanho do campo; ampliadas com suavização)
        const bodyA = new Uint8Array(n), rimA = new Uint8Array(n), haloA = new Uint8Array(n), deepA = new Uint8Array(n), hiA = new Uint8Array(n);
        const e0 = soft ? T0 - soft : T0 - 0.04, e1 = soft ? T0 + soft : T0 + 0.04; let any = false;
        for (let k = 0; k < n; k++) {
            const v = a[k], bd = smooth(e0, e1, v); if (v > T0 - 0.4) any = true;
            bodyA[k] = bd * 255 | 0;
            if (kind === 'grass') continue;
            rimA[k] = (bd * (1 - smooth(T0 + 0.02, T0 + (kind === 'stone' ? 0.12 : kind === 'water' ? 0.16 : 0.24), v))) * 255 | 0;
            haloA[k] = ((1 - bd) * smooth(T0 - (kind === 'stone' ? 0.2 : 0.3), T0 - 0.02, v)) * 255 | 0;
            if (kind === 'water') deepA[k] = (bd * smooth(T0 + 0.22, T0 + 0.7, v)) * 255 | 0;
            if (kind === 'stone') hiA[k] = (bd * smooth(T0 + 0.1, T0 + 0.14, v) * (1 - smooth(T0 + 0.18, T0 + 0.24, v))) * 255 | 0;
        }
        if (!any) return;
        const up = (c, dx, dy) => { g.drawImage(c, 0, 0, nx, ny, x0 + (dx || 0), y0 + (dy || 0), nx * S, ny * S); };
        const sm = g.imageSmoothingEnabled; g.imageSmoothingEnabled = true;
        if (kind !== 'grass') {   // halo (sombra / terra gasta / lama úmida) por baixo do corpo
            const col = kind === 'dirt' ? [96, 72, 40, 0.5] : kind === 'stone' ? [0, 0, 0, 0.5] : [58, 44, 26, 0.7];
            up(maskCanvas(nx, ny, (i) => [col[0], col[1], col[2], haloA[i] * col[3] | 0]), kind === 'stone' ? 1.5 : 0, kind === 'stone' ? 2 : 0);
        }
        // corpo: textura do mundo recortada pela máscara
        const sc = scratch(nx * S, ny * S), sg = sc.getContext('2d'); sg.setTransform(1, 0, 0, 1, 0, 0); sg.globalCompositeOperation = 'source-over'; sg.clearRect(0, 0, sc.width, sc.height);
        sg.translate(-x0, -y0); sg.fillStyle = patFn(sg, kind); sg.fillRect(x0, y0, nx * S, ny * S); sg.setTransform(1, 0, 0, 1, 0, 0);
        sg.globalCompositeOperation = 'destination-in'; sg.imageSmoothingEnabled = true; sg.drawImage(maskCanvas(nx, ny, (i) => [255, 255, 255, bodyA[i]]), 0, 0, nx, ny, 0, 0, nx * S, ny * S); sg.globalCompositeOperation = 'source-over';
        g.drawImage(sc, 0, 0, sc.width, sc.height, x0, y0, sc.width, sc.height);
        if (kind === 'water') up(maskCanvas(nx, ny, (i) => [8, 44, 104, deepA[i] * 0.34 | 0]));
        if (kind === 'dirt') up(maskCanvas(nx, ny, (i) => [48, 26, 10, rimA[i] * 0.42 | 0]));
        else if (kind === 'stone') { up(maskCanvas(nx, ny, (i) => [0, 0, 0, rimA[i] * 0.62 | 0])); up(maskCanvas(nx, ny, (i) => [255, 255, 255, hiA[i] * 0.18 | 0])); }
        else if (kind === 'water') up(maskCanvas(nx, ny, (i) => [220, 244, 255, rimA[i] * 0.7 | 0]));
        g.imageSmoothingEnabled = sm;
        // enfeites ao longo do contorno (posição pelo mundo → iguais em blocos vizinhos)
        const dens = DENS[kind] || 0.12;
        for (let j = 2; j < ny - 2; j++) for (let i = 2; i < nx - 2; i++) {
            const k = j * nx + i, v = a[k]; if (Math.abs(v - T0) > 0.035) continue;
            const wi = Math.round((x0 + i * S) / S), wj = Math.round((y0 + j * S) / S), p = hash(wi * 12.9898 + wj * 78.233); if (p > dens) continue;
            let gx = a[k + 1] - a[k - 1], gy = a[k + nx] - a[k - nx]; const gl = Math.hypot(gx, gy) || 1; gx = -gx / gl; gy = -gy / gl;   // para fora
            const q = hash(wi * 3.1 + wj * 5.7), r1 = hash(wi * 7.3 + wj * 1.9), r2 = hash(wi * 2.2 + wj * 9.1), off = kind === 'water' ? (q * 7 - 1) : (q * 9 - 2);
            decorate(g, kind, x0 + i * S + gx * off, y0 + j * S + gy * off, p / dens, r1, r2);
        }
    }

    /* desenha todas as manchas que tocam o bloco [ox,oy,w,h] (g já está com translate(-ox,-oy)) */
    function terrainTile(g, cur, ox, oy, w, h, patFn) {
        const x0 = ox - PAD, y0 = oy - PAD, W = w + PAD * 2, H = h + PAD * 2, by = {};
        const m = 2 * Math.max(STYLE.water.R, STYLE.dirt.R) * S + 6;
        for (const o of cur) {
            if (!o || o.type !== 'paint') continue; const kind = PAINT_KIND[o.color]; if (!kind) continue;
            const rw = o.w || 40, rh = o.h || 40; if (o.x > x0 + W + m || o.x + rw < x0 - m || o.y > y0 + H + m || o.y + rh < y0 - m) continue;
            (by[kind] = by[kind] || []).push({ x: o.x, y: o.y, w: rw, h: rh });
        }
        for (const kind of ORDER) if (by[kind]) layer(g, kind, by[kind], x0, y0, W, H, patFn);
    }
    A.terrainTile = terrainTile; A.terrainKind = PAINT_KIND;
})(typeof window !== 'undefined' ? window : globalThis);
