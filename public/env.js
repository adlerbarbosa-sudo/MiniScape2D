/* MiniScape 2D — ambiente: ciclo de dia e noite, luzes e clima (chuva, tempestade, neblina, neve, areia, cinzas, calor).
   Tudo é calculado pelo relógio real (determinístico, sem sincronização): todo jogador vê o mesmo horário e a mesma "frente de tempo".
   O clima é por REGIÃO (tabela REGIONS) e contínuo: o ruído global do tempo é o mesmo em todo o mundo, cada região só decide o quanto dele vira chuva/neblina/neve...
   Perto de uma borda ligada a outra região o clima é interpolado pela posição (metade do caminho na própria fronteira); mudanças de intensidade são
   limitadas a ~14%/s (≈ 4-7 s para trocar de clima), então nada pisca. Interiores (casa, masmorras) têm luz própria e nenhum clima. */
(function () {
    'use strict';
    const TAU = Math.PI * 2, CYCLE_MS = 20 * 60 * 1000;   // um dia inteiro dura 20 minutos reais
    const SLOT_MS = 6 * 60 * 1000;                          // a "frente de tempo" varia suavemente a cada ~6 min
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

    /* ---------- hora do dia ---------- */
    let debugFrac = null;
    function dayFrac() { return debugFrac != null ? debugFrac : ((Date.now() % CYCLE_MS) / CYCLE_MS + 0.35) % 1; }   // deslocado para o jogo começar de manhã/tarde
    function sunS() { return Math.sin(TAU * (dayFrac() - 0.25)); }                // -1 meia-noite, +1 meio-dia
    function daylight() { return clamp(sunS() * 1.6 + 0.5, 0, 1); }                // 1 = dia pleno, 0 = noite fechada
    function isNight() { return daylight() < 0.3; }
    function clockText() { const f = dayFrac(), m = Math.floor(f * 1440); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }

    /* ---------- mapas fechados (cavernas, masmorras) ---------- */
    const KIND_BY_ID = { torre_mago: 'dark', covil_goblins: 'dark', cripta_real: 'dark', ninho_dragao: 'dark', catacumbas: 'dark', fenda: 'dark', covil: 'dark', mina_abandonada: 'dim', ruinas: 'dim', mina: 'dim', casa: 'home' };
    function mapKind(m) {
        if (m && (m.env === 'dark' || m.env === 'dim' || m.env === 'home' || m.env === 'open')) return m.env;
        const id = (m && m.id) || '';
        if (KIND_BY_ID[id]) return KIND_BY_ID[id];
        if (/^casa_/.test(id)) return 'home';
        const n = ((m && (m.name || m.id)) || '').toLowerCase();
        if (/covil|caverna|cave|catacumba|dungeon|masmorra|dragon|dragão/.test(n)) return 'dark';
        if (/mina|mine/.test(n)) return 'dim';
        if (/casa|home|lar/.test(n) && m && m.isHome) return 'home';
        return 'open';
    }

    /* ---------- clima por região ----------
       cada canal = [base, extra, chance]: valor = base + extra * (a "frente" passa do limiar da chance). heat/gloom são fixos. */
    const REGIONS = {
        temperado: { rain: [0, 0.75, 0.28], fog: [0, 0.45, 0.12], storm: 0.25 },
        floresta:  { rain: [0, 0.8, 0.3], fog: [0.08, 0.5, 0.28], storm: 0.2 },
        rio:       { rain: [0, 0.8, 0.3], fog: [0.05, 0.45, 0.2], storm: 0.2 },
        serra:     { rain: [0, 0.6, 0.15], fog: [0.05, 0.5, 0.3], gloom: 0.03 },
        gelo:      { snow: [0.25, 0.7, 0.65], fog: [0, 0.3, 0.15] },
        litoral:   { rain: [0, 0.7, 0.25], fog: [0, 0.35, 0.12], storm: 0.7 },
        pantano:   { fog: [0.45, 0.35, 0.5], rain: [0, 0.6, 0.25], gloom: 0.03 },
        estrada_areias: { heat: 0.35, sand: [0, 0.25, 0.12] },
        deserto:   { heat: 0.8, sand: [0, 0.7, 0.25] },
        oasis:     { heat: 0.65, sand: [0, 0.15, 0.1] },
        sombria:   { fog: [0.2, 0.4, 0.3], rain: [0, 0.5, 0.3], gloom: 0.05 },
        cemiterio: { fog: [0.45, 0.4, 0.5], rain: [0, 0.5, 0.2], gloom: 0.12 },
        fortaleza: { fog: [0.2, 0.3, 0.3], rain: [0, 0.6, 0.3], ash: [0, 0.25, 0.2], storm: 0.5, gloom: 0.16 },
        vulcao:    { ash: [0.6, 0.4, 0.7], heat: 0.55, gloom: 0.12 },
        interior:  {}
    };
    const REGION_OF = {
        lumbridge: 'temperado', campos: 'temperado', estrada_rei: 'temperado', vila_real: 'temperado',
        floresta: 'floresta', trilha_elfica: 'floresta', silvaluz: 'floresta',
        rio: 'rio', estrada_costa: 'litoral', porto_mares: 'litoral', praia_naufragios: 'litoral', pantano: 'pantano',
        mina: 'serra', trilha_serra: 'serra', pedralta: 'serra', passo_gelado: 'gelo', vale_gelado: 'gelo',
        estrada_areias: 'estrada_areias', deserto: 'deserto', oasis: 'oasis',
        estrada_sombria: 'sombria', cemiterio: 'cemiterio', fortaleza: 'fortaleza', vulcao: 'vulcao'
    };
    const CHS = ['rain', 'storm', 'fog', 'snow', 'sand', 'ash', 'heat', 'gloom'];
    function regionOf(m) {
        const id = (m && m.id) || '';
        if (REGION_OF[id]) return REGION_OF[id];
        const n = ((m && (m.name || id)) || '').toLowerCase();
        if (/deserto|areia|sahr/.test(n)) return 'deserto'; if (/gelo|neve|gelad/.test(n)) return 'gelo'; if (/pântano|pantano|brejo/.test(n)) return 'pantano';
        if (/vulc/.test(n)) return 'vulcao'; if (/cemit|sombri/.test(n)) return 'cemiterio'; if (/floresta|bosque|trilha/.test(n)) return 'floresta';
        if (/costa|porto|praia/.test(n)) return 'litoral'; return 'temperado';
    }
    function noise(seed, t) {   // ruído suave global: valores sorteados por janela e interpolados com smoothstep
        const i = Math.floor(t / SLOT_MS), f = t / SLOT_MS - i, s = f * f * (3 - 2 * f), a = hash(seed + ':' + i), b = hash(seed + ':' + (i + 1)); return a + (b - a) * s;
    }
    function profile(reg, t, out) {   // canais-alvo (0..1) de uma região no instante t
        const P = REGIONS[reg] || REGIONS.temperado; out = out || {};
        const nr = noise('R', t), nf = noise('F', t), nw = noise('W', t);
        const ch = (c, n) => c ? c[0] + c[1] * sstep(1 - c[2] - 0.1, 1 - c[2] + 0.1, n) : 0;
        out.rain = ch(P.rain, nr); out.snow = ch(P.snow, nr); out.fog = ch(P.fog, nf); out.sand = ch(P.sand, nw); out.ash = ch(P.ash, nw);
        out.storm = P.storm ? P.storm * sstep(0.55, 0.9, out.rain) : 0; out.heat = P.heat || 0; out.gloom = P.gloom || 0; return out;
    }
    const S = {}, TG = {}; CHS.forEach((c) => { S[c] = 0; TG[c] = 0; }); let D = null, lastT = 0, curKind = 'open', curRegion = 'temperado', lastMapKey = '', forced = null;
    const RATE = 0.12;   // intensidade máxima por segundo (limite 15%/s com folga para jitter de quadro)
    function targets(mapObj, kind, pl, t) {
        if (kind !== 'open') { CHS.forEach((c) => TG[c] = 0); return; }
        const reg = regionOf(mapObj); curRegion = reg; const own = profile(reg, t, {}); const list = [];
        // vizinhos por borda: perto da fronteira o clima caminha para o da região do outro lado (metade na própria borda)
        const W = mapObj.width || 800, H = mapObj.height || 600;
        if (Array.isArray(mapObj.edges) && pl) mapObj.edges.forEach((e) => {
            const nb = typeof gameMaps !== 'undefined' ? gameMaps[e.to] : null; if (!nb || mapKind(nb) !== 'open') return; const lim = Math.min(e.d === 'e' || e.d === 'w' ? W : H, 1800) * 0.3;
            const dist = e.d === 'w' ? pl.x : e.d === 'e' ? W - pl.x : e.d === 'n' ? pl.y : H - pl.y; if (dist >= lim) return;
            const k = 0.5 * sstep(0, 1, 1 - dist / lim); if (k > 0) list.push([k, profile(regionOf(nb), t, {})]);
        });
        let tot = 0; list.forEach((q) => tot += q[0]); const sc = tot > 0.7 ? 0.7 / tot : 1; tot = Math.min(tot, 0.7);
        CHS.forEach((c) => { let v = own[c] * (1 - tot); list.forEach((q) => v += q[1][c] * q[0] * sc); TG[c] = v; });
    }
    function wnow() { return Date.now(); }
    let drops = [], flakes = [], streaks = [], ashes = [];
    function initDrops(w, h) { drops = []; for (let i = 0; i < (window.Quality ? Quality.drops() : 260); i++) drops.push({ x: Math.random() * (w + 200), y: Math.random() * h, l: 10 + Math.random() * 14, s: 9 + Math.random() * 7 }); }
    let fogBands = [];
    function step(dt, snap) {   // aproxima os canais do alvo com limite de taxa
        CHS.forEach((c) => { const diff = TG[c] - S[c]; if (snap) { S[c] = TG[c]; return; } const v = clamp(diff / 4, -RATE, RATE) * dt; S[c] = Math.abs(diff) < Math.abs(v) ? TG[c] : S[c] + v; });
    }
    const level = () => (window.Quality ? Quality.level : 2);

    /* ---------- sprites de luz (um por cor) ---------- */
    const lightCache = {};
    function lightSprite(color) {
        let c = lightCache[color]; if (c) return c;
        c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
        const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, color); gr.addColorStop(0.35, color.replace(/[\d.]+\)$/, '0.35)')); gr.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128); lightCache[color] = c; return c;
    }
    const WARM = 'rgba(255,190,100,0.9)', FIRE = 'rgba(255,140,60,0.95)', COOL = 'rgba(130,210,255,0.85)', TORCH = 'rgba(255,220,150,0.7)';
    function glowAt(ctx, x, y, r, color, a) { ctx.globalAlpha = a; ctx.drawImage(lightSprite(color), x - r, y - r, r * 2, r * 2); }

    /* ---------- desenho principal (espaço da tela, depois do mundo) ---------- */
    let Dk = null, Kd = 0, Op = 1, initDone = false, nextFlash = 0, flash = 0, splash = [], lastMapId = '';
    function draw(ctx, canvas, offset, mapObj, view, player, T) {
        const cw = canvas._lw || canvas.width, ch = canvas._lh || canvas.height, kind = mapKind(mapObj);
        const dt = clamp(T - lastT, 0, 0.1); lastT = T; const mapKey = (mapObj && mapObj.id) || ''; curKind = kind; lastMapKey = mapKey;
        // --- alvos: clima da região (mais o vizinho perto da borda), escuridão e "tipo de lugar" ---
        const px0 = player.renderX != null ? player.renderX : player.x, py0 = player.renderY != null ? player.renderY : player.y;
        if (forced) { CHS.forEach((c) => TG[c] = forced[c] || 0); } else targets(mapObj, kind, { x: px0, y: py0 }, wnow());
        let dT = 1 - daylight();                                           // escuridão externa
        if (kind === 'dark') dT = Math.max(dT, 0.62); else if (kind === 'dim') dT = Math.max(dT, 0.38); else if (kind === 'home') dT = 0.14;
        else dT = clamp(dT + S.gloom * 0.22 + S.ash * 0.08 + S.storm * 0.08, 0, 1);
        const kT = kind === 'dark' ? 1 : 0, oT = kind === 'open' ? 1 : 0;
        const snap = !initDone; initDone = true;
        step(dt, snap || (forced && forced._snap));
        if (Dk === null || snap) { Dk = dT; Kd = kT; Op = oT; }
        const mv = (v, t) => { const df = t - v, st = RATE * dt; return Math.abs(df) <= st ? t : v + Math.sign(df) * st; };
        Dk = mv(Dk, dT); Kd = mv(Kd, kT); Op = mv(Op, oT);
        const d = Dk, wk = S;

        /* 1) escurecimento por multiplicação (azul à noite, laranja no crepúsculo) */
        const s = sunS(); const dusk = Op * clamp(1 - Math.abs(s) * 4, 0, 1);   // perto do nascer/pôr do sol
        let r = 255, g = 255, b = 255;
        if (d > 0.001) { const nd = clamp(d / 1, 0, 1); r = lerp(255, lerp(88, 105, Kd), nd); g = lerp(255, lerp(104, 98, Kd), nd); b = lerp(255, lerp(165, 128, Kd), nd); }
        if (dusk > 0) { r = lerp(r, 255, dusk * 0.5); g = lerp(g, 178, dusk * 0.5); b = lerp(b, 132, dusk * 0.5); }
        const wet = Math.max(S.rain, S.storm); r *= 1 - 0.16 * wet; g *= 1 - 0.13 * wet; b *= 1 - 0.08 * wet;
        r *= 1 - 0.06 * S.fog; g *= 1 - 0.05 * S.fog;
        if (S.snow > 0) { r *= 1 - 0.08 * S.snow; g *= 1 - 0.04 * S.snow; }
        if (S.ash > 0) { r *= 1 - 0.14 * S.ash; g *= 1 - 0.26 * S.ash; b *= 1 - 0.3 * S.ash; }
        if (S.sand > 0) { b *= 1 - 0.22 * S.sand; g *= 1 - 0.08 * S.sand; }
        if (S.gloom > 0) { r *= 1 - 0.2 * S.gloom; g *= 1 - 0.14 * S.gloom; }
        if (r < 254 || g < 254 || b < 254) { ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`; ctx.fillRect(0, 0, cw, ch); ctx.restore(); }
        if (S.heat > 0.01) { ctx.save(); ctx.fillStyle = 'rgba(255,168,64,' + (0.13 * S.heat * Op).toFixed(3) + ')'; ctx.fillRect(0, 0, cw, ch); ctx.restore(); }   // calor: véu quente

        /* 2) luzes: só aparecem quando está escuro o bastante */
        const lightK = clamp((d - 0.18) / 0.5, 0, 1);
        if (lightK > 0.02 && mapObj && mapObj.entities && (!window.Quality || Quality.level > 0)) {
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            const flick = (x) => 0.85 + 0.15 * Math.sin(T * 9 + x * 0.13) * Math.sin(T * 5.3 + x);
            for (const o of mapObj.entities) {
                if (!o || o.active === false || !o.type) continue;
                const ow = o.w || 30, oh = o.h || 30;
                if (o.x + ow + 140 < view.x || o.x - 140 > view.x + view.w || o.y + oh + 140 < view.y || o.y - 140 > view.y + view.h) continue;
                const sx = o.x + offset.x, sy = o.y + offset.y;
                if (o.type === 'decor') {
                    if (o.kind === 'lamp') glowAt(ctx, sx + ow / 2, sy + oh * 0.22, 118, WARM, 0.75 * lightK * flick(o.x));
                    else if (o.kind === 'campfire') glowAt(ctx, sx + ow / 2, sy + oh * 0.5, 150, FIRE, 0.85 * lightK * flick(o.y));
                    else if (o.kind === 'torch') glowAt(ctx, sx + ow / 2, sy + oh * 0.22, 130, FIRE, 0.85 * lightK * flick(o.x));
                    else if (o.kind === 'crystal') glowAt(ctx, sx + ow / 2, sy + oh * 0.4, 110, COOL, (0.6 + 0.2 * Math.sin(T * 2 + o.x)) * lightK);
                    else if (o.kind === 'banner' || o.kind === 'sign') { /* sem luz */ }
                } else if (o.type === 'fire') glowAt(ctx, sx + ow / 2, sy + oh / 2, 140, FIRE, 0.9 * lightK * flick(o.x));
                else if (o.type === 'furnace') glowAt(ctx, sx + ow / 2, sy + oh * 0.7, 130, FIRE, 0.8 * lightK * flick(o.y));
                else if (o.type === 'portal') glowAt(ctx, sx + ow / 2, sy + oh / 2, 120, COOL, 0.8 * lightK);
                else if (o.type === 'house' && ow > 60) {   // janelas acesas
                    const a = 0.55 * lightK;
                    glowAt(ctx, sx + ow * 0.3, sy + oh * 0.72, ow * 0.34, WARM, a); glowAt(ctx, sx + ow * 0.7, sy + oh * 0.72, ow * 0.34, WARM, a);
                    glowAt(ctx, sx + ow * 0.5, sy + oh * 0.97, ow * 0.2, TORCH, a * 0.8);
                }
            }
            const px = (player.renderX != null ? player.renderX : player.x) + offset.x, py = (player.renderY != null ? player.renderY : player.y) + offset.y;
            glowAt(ctx, px, py - 14, 72, TORCH, 0.24 * lightK);    // o herói carrega uma tocha
            if (window.Mimic && Mimic.lights) Mimic.lights(ctx, offset, lightK);   // peças Mímicas brilham no escuro (também as de outros jogadores)
            ctx.restore();
        }
        ctx.globalAlpha = 1;

        /* 3) chuva / tempestade / neblina / neve / areia / cinzas (cada canal tem a própria intensidade 0..1, sempre suave) */
        const q = level();
        if (S.rain > 0.02) {
            const key = cw + ':' + ch + ':' + q; if (!drops.length || drops.w !== key) { initDrops(cw, ch); drops.w = key; }
            ctx.save(); ctx.strokeStyle = 'rgba(190,210,235,' + (0.42 * S.rain).toFixed(3) + ')'; ctx.lineWidth = 1.2; ctx.beginPath();
            if (q > 0 && Math.random() < 0.9 * S.rain) splash.push({ x: Math.random() * cw, y: ch * (0.35 + Math.random() * 0.65), a: 0 }); if (splash.length > 60) splash.shift();
            const nd = Math.ceil(drops.length * (0.25 + 0.75 * S.rain));
            for (let i = 0; i < nd; i++) { const p = drops[i]; p.y += p.s; p.x -= p.s * 0.35; if (p.y > ch) { p.y = -20; p.x = Math.random() * (cw + 200); } if (p.x < -20) p.x += cw + 200; ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.l * 0.35, p.y + p.l); }
            ctx.stroke();
            ctx.lineWidth = 1; for (let i = splash.length - 1; i >= 0; i--) { const sp = splash[i]; sp.a++; if (sp.a > 14) { splash.splice(i, 1); continue; } ctx.strokeStyle = 'rgba(200,220,245,' + ((1 - sp.a / 14) * 0.5 * S.rain).toFixed(3) + ')'; ctx.beginPath(); ctx.ellipse(sp.x, sp.y, 1.5 + sp.a * 0.55, 0.6 + sp.a * 0.2, 0, 0, TAU); ctx.stroke(); }
            ctx.fillStyle = 'rgba(40,55,80,' + (0.12 * S.rain).toFixed(3) + ')'; ctx.fillRect(0, 0, cw, ch);
            if (flash > 0.01) { ctx.fillStyle = 'rgba(235,240,255,' + (flash * 0.38 * S.storm).toFixed(3) + ')'; ctx.fillRect(0, 0, cw, ch); flash *= 0.9; }
            ctx.restore();
            if (S.storm > 0.5 && T > nextFlash) { if (nextFlash > 0 && Math.random() < 0.7) { flash = 1; if (window.Sfx) setTimeout(() => window.Sfx.play('thunder'), 350 + Math.random() * 500); } nextFlash = T + 8 + Math.random() * 14; }
        } else flash = 0;
        if (S.fog > 0.02) {
            if (!fogBands.length) for (let i = 0; i < 5; i++) fogBands.push({ y: Math.random(), s: 0.02 + Math.random() * 0.03, p: Math.random() * 6, h: 0.35 + Math.random() * 0.3 });
            ctx.save();
            for (const f of fogBands) { const y = (f.y + Math.sin(T * 0.12 + f.p) * 0.08) * ch, x = ((T * f.s * 80 + f.p * 300) % (cw + 600)) - 300; const gr = ctx.createRadialGradient(x + 300, y, 20, x + 300, y, 380); gr.addColorStop(0, 'rgba(220,228,236,' + (0.34 * S.fog).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(220,228,236,0)'); ctx.fillStyle = gr; ctx.fillRect(x - 100, y - 380, 800, 760); }
            ctx.fillStyle = 'rgba(205,215,225,' + (0.16 * S.fog).toFixed(3) + ')'; ctx.fillRect(0, 0, cw, ch);
            ctx.restore();
        }
        if (S.snow > 0.02) {
            const want = Math.round((q === 0 ? 60 : q === 1 ? 120 : 200) * (0.3 + 0.7 * S.snow)); while (flakes.length < want) flakes.push({ x: Math.random() * cw, y: Math.random() * ch, r: 0.9 + Math.random() * 1.8, s: 0.6 + Math.random() * 1.2, p: Math.random() * 6 }); if (flakes.length > want) flakes.length = want;
            ctx.save(); ctx.fillStyle = 'rgba(248,251,255,' + (0.85 * Math.min(1, S.snow + 0.15)).toFixed(3) + ')';
            for (const f of flakes) { f.y += f.s; f.x += Math.sin(T * 1.3 + f.p) * 0.5 - 0.3; if (f.y > ch + 4) { f.y = -4; f.x = Math.random() * cw; } if (f.x < -4) f.x = cw + 4; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill(); }
            ctx.fillStyle = 'rgba(232,240,250,' + (0.1 * S.snow).toFixed(3) + ')'; ctx.fillRect(0, 0, cw, ch); ctx.restore();
        }
        if (S.sand > 0.02) {
            const want = Math.round((q === 0 ? 20 : q === 1 ? 40 : 70) * (0.2 + 0.8 * S.sand)); while (streaks.length < want) streaks.push({ x: Math.random() * cw, y: Math.random() * ch, l: 14 + Math.random() * 30, s: 9 + Math.random() * 8 }); if (streaks.length > want) streaks.length = want;
            ctx.save(); ctx.strokeStyle = 'rgba(224,190,120,' + (0.4 * S.sand).toFixed(3) + ')'; ctx.lineWidth = 1.3; ctx.beginPath();
            for (const t2 of streaks) { t2.x += t2.s; t2.y += t2.s * 0.12; if (t2.x > cw + 40) { t2.x = -40; t2.y = Math.random() * ch; } ctx.moveTo(t2.x, t2.y); ctx.lineTo(t2.x - t2.l, t2.y - t2.l * 0.1); }
            ctx.stroke(); ctx.fillStyle = 'rgba(214,178,104,' + (0.2 * S.sand).toFixed(3) + ')'; ctx.fillRect(0, 0, cw, ch); ctx.restore();
        }
        if (S.ash > 0.02) {
            const want = Math.round((q === 0 ? 30 : q === 1 ? 60 : 110) * (0.3 + 0.7 * S.ash)); while (ashes.length < want) ashes.push({ x: Math.random() * cw, y: Math.random() * ch, r: 0.8 + Math.random() * 1.8, s: 0.4 + Math.random() * 0.9, p: Math.random() * 6, e: Math.random() < 0.18 }); if (ashes.length > want) ashes.length = want;
            ctx.save();
            for (const f of ashes) { f.y += f.s; f.x += Math.sin(T * 0.8 + f.p) * 0.6 + 0.2; if (f.y > ch + 4) { f.y = -4; f.x = Math.random() * cw; } if (f.x > cw + 4) f.x = -4; ctx.fillStyle = f.e ? 'rgba(255,150,70,' + (0.8 * S.ash).toFixed(3) + ')' : 'rgba(60,50,48,' + (0.7 * S.ash).toFixed(3) + ')'; ctx.fillRect(f.x, f.y, f.r * 1.6, f.r * 1.6); }
            ctx.fillStyle = 'rgba(70,40,34,' + (0.14 * S.ash).toFixed(3) + ')'; ctx.fillRect(0, 0, cw, ch); ctx.restore();
        }
    }

    /* ---------- lógica por passo de simulação ---------- */
    function tick(mapObj) {
        if (S.rain > 0.4 && mapObj && mapObj.entities) for (const o of mapObj.entities) if (o && o.type === 'fire' && o.active) o.life -= 2;   // chuva apaga fogueiras mais rápido
    }
    function rainLevel() { return Math.max(S.rain, S.storm); }
    function rangeMul() { return isNight() ? 1.35 : 1; }   // monstros enxergam mais longe à noite
    function dominant(c) { return c.storm > 0.4 && c.rain > 0.5 ? 'storm' : c.rain > 0.3 ? 'rain' : c.snow > 0.3 ? 'snow' : c.sand > 0.3 ? 'sand' : c.ash > 0.3 ? 'ash' : c.fog > 0.3 ? 'fog' : c.heat > 0.5 ? 'heat' : 'clear'; }
    const WNAME = { clear: 'Céu limpo', rain: 'Chuva', fog: 'Neblina', storm: 'Tempestade', snow: 'Neve', sand: 'Areia ao vento', ash: 'Cinzas', heat: 'Calor' };
    function weatherLabel() { return curKind !== 'open' ? 'Céu limpo' : WNAME[dominant(S)]; }

    /* ---------- selo de hora/clima + previsão no canto da tela ---------- */
    let open = false;
    const SUN = '<circle cx="16" cy="16" r="6" fill="#ffd45a" stroke="#a8721c" stroke-width="1.4"/><g stroke="#ffd45a" stroke-width="2" stroke-linecap="round"><path d="M16 3v4M16 25v4M3 16h4M25 16h4M7 7l2.800 2.800M22.200 22.200 25 25M25 7l-2.800 2.800M9.800 22.200 7 25"/></g>';
    const MOON = '<path d="M25 19.500A10 10 0 0 1 12.500 7a10 10 0 1 0 12.500 12.500z" fill="#e9e3c3" stroke="#8b855f" stroke-width="1.4"/><circle cx="16" cy="18" r="1.300" fill="#c8c19a"/><circle cx="20" cy="22" r="1" fill="#c8c19a"/>';
    const CLOUD = (f) => '<path d="M9 23a5 5 0 0 1-.6-9.960A7 7 0 0 1 22 12a5.500 5.500 0 0 1 1 11z" fill="' + f + '" stroke="#5b6675" stroke-width="1.400" stroke-linejoin="round"/>';
    const RAIN = CLOUD('#9aa7b8') + '<g stroke="#5aa8ff" stroke-width="2" stroke-linecap="round"><path d="M11 26l-1.400 3M17 26l-1.400 3M23 26l-1.400 3"/></g>';
    const FOG = CLOUD('#c9cfd6') + '<g stroke="#aeb6bf" stroke-width="2" stroke-linecap="round"><path d="M6 26h20M9 29.500h14"/></g>';
    const PARTLY = '<circle cx="12" cy="12" r="5" fill="#ffd45a"/><g stroke="#ffd45a" stroke-width="1.800" stroke-linecap="round"><path d="M12 2v2.500M2 12h2.500M5 5l1.800 1.800M19 5l-1.800 1.800"/></g>' + CLOUD('#f2f4f7').replace('M9 23', 'M11 27').replace('a5 5 0 0 1-.6-9.960A7 7 0 0 1 22 12a5.500 5.500 0 0 1 1 11z', 'a4 4 0 0 1-.5-7.960A6 6 0 0 1 23 16a4.500 4.500 0 0 1 .5 9z');
    const SNOW = CLOUD('#d8e2ee') + '<g fill="#fff" stroke="#8ea4bd" stroke-width=".8"><circle cx="11" cy="27" r="1.6"/><circle cx="17" cy="29" r="1.6"/><circle cx="23" cy="27" r="1.6"/></g>';
    const SAND = CLOUD('#d9c08a') + '<g stroke="#b8924a" stroke-width="2" stroke-linecap="round"><path d="M5 26h13M10 29.500h16"/></g>';
    const ASH = CLOUD('#6b5a56') + '<g fill="#ff8a3c"><circle cx="11" cy="27" r="1.4"/><circle cx="17" cy="29" r="1.4"/><circle cx="23" cy="27" r="1.4"/></g>';
    const STORM = CLOUD('#6d7788') + '<path d="M17 20l-4 6h4l-2 5 6-8h-4l2-3z" fill="#ffd45a" stroke="#a8721c" stroke-width=".8"/>';
    const HEAT = SUN.replace(/#ffd45a/g, '#ff9a3a');
    function wIcon(w, night, px) {
        const body = w === 'rain' ? RAIN : w === 'fog' ? FOG : w === 'snow' ? SNOW : w === 'sand' ? SAND : w === 'ash' ? ASH : w === 'storm' ? STORM : (w === 'heat' && !night) ? HEAT : (night ? MOON : SUN);
        return '<svg class="wic" width="' + (px || 22) + '" height="' + (px || 22) + '" viewBox="0 0 32 32">' + body + '</svg>';
    }
    function forecast(n) {   // o clima é uma função do relógio, então dá para prever (para a região em que você está)
        const out = [], base = Date.now(), reg = curRegion;
        for (let i = 0; i < n; i++) out.push(dominant(profile(reg, base + i * SLOT_MS, {})));
        return out;
    }
    function fcHtml() {
        if (curKind !== 'open') return '<div class="fc-t">Previsão</div><div class="fc-none">Aqui dentro o tempo não muda.</div>';
        const list = forecast(6), WEATHER_MS = SLOT_MS, msLeft = WEATHER_MS - (Date.now() % WEATHER_MS);
        let h = '<div class="fc-t">Previsão do tempo</div><div class="fc-row">';
        list.forEach((w, i) => {
            const t = Date.now() + msLeft + (i - 1) * WEATHER_MS, dfrac = debugFrac != null ? debugFrac : (((t % CYCLE_MS) / CYCLE_MS + 0.35) % 1);
            const night = Math.sin(TAU * (dfrac - 0.25)) * 1.6 + 0.5 < 0.3;
            const lab = i === 0 ? 'Agora' : 'em ' + Math.max(1, Math.round((msLeft + (i - 1) * WEATHER_MS) / 60000)) + ' min';
            h += '<div class="fc-c' + (i === 0 ? ' now' : '') + '">' + wIcon(w, night, 26) + '<b>' + WNAME[w] + '</b><small>' + lab + '</small></div>';
        });
        return h + '</div>';
    }
    function updateBadge() {
        const el = document.getElementById('env-badge'); if (!el) return;
        if (!el.dataset.init) {
            el.dataset.init = 1; el.innerHTML = '<div class="eb-main" role="button" title="Previsão do tempo"></div><div class="eb-fc"></div>';
            el.querySelector('.eb-main').addEventListener('click', () => { open = !open; updateBadge(); });
        }
        const night = isNight(), w = curKind === 'open' ? dominant(S) : 'clear';
        const main = `${wIcon(w, night, 22)}<b>${clockText()}</b><span>${weatherLabel()}</span><i class="eb-car">${open ? '▴' : '▾'}</i>`;
        const m = el.querySelector('.eb-main'); if (m.dataset.h !== main) { m.dataset.h = main; m.innerHTML = main; }
        const f = el.querySelector('.eb-fc'); f.style.display = open ? 'block' : 'none';
        if (open) { const h = fcHtml(); if (f.dataset.h !== h) { f.dataset.h = h; f.innerHTML = h; } }
    }
    setInterval(updateBadge, 1000);

    function forceWeather(w, k) {   // teste/depuração: 'auto' volta ao normal; 'clear'|'rain'|'fog'|'snow'|'sand'|'ash'|'storm'
        if (w === 'auto') { forced = null; return; }
        const v = k == null ? 1 : k; forced = { _snap: true }; if (w === 'storm') { forced.rain = v; forced.storm = v; } else if (w !== 'clear') forced[w] = v;
    }
    window.Env = { rainLevel, draw, tick, rangeMul, isNight, daylight, dayFrac, clockText, weatherLabel, setDebugFrac(f) { debugFrac = f; }, forceWeather, REGIONS, REGION_OF, regionOf, profile, mapKind,
        state: () => Object.assign({ dark: Dk, kd: Kd, open: Op, kind: curKind, region: curRegion }, S), targets: () => Object.assign({}, TG) };
})();
