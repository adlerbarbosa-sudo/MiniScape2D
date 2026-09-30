/* MiniScape 2D — ambiente: ciclo de dia e noite, luzes, clima (chuva, neblina, trovão).
   Tudo é calculado pelo relógio real, então todos os jogadores veem o mesmo horário e o mesmo clima no mesmo mapa. */
(function () {
    'use strict';
    const TAU = Math.PI * 2, CYCLE_MS = 20 * 60 * 1000;   // um dia inteiro dura 20 minutos reais
    const WEATHER_MS = 8 * 60 * 1000;                       // o clima muda a cada 8 minutos
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

    /* ---------- hora do dia ---------- */
    let debugFrac = null;
    function dayFrac() { return debugFrac != null ? debugFrac : ((Date.now() % CYCLE_MS) / CYCLE_MS + 0.35) % 1; }   // deslocado para o jogo começar de manhã/tarde
    function sunS() { return Math.sin(TAU * (dayFrac() - 0.25)); }                // -1 meia-noite, +1 meio-dia
    function daylight() { return clamp(sunS() * 1.6 + 0.5, 0, 1); }                // 1 = dia pleno, 0 = noite fechada
    function isNight() { return daylight() < 0.3; }
    function clockText() { const f = dayFrac(), m = Math.floor(f * 1440); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }

    /* ---------- mapas fechados (cavernas) ---------- */
    function mapKind(m) {
        const n = ((m && (m.name || m.id)) || '').toLowerCase();
        if (/covil|caverna|cave|catacumba|dungeon|masmorra|dragon|dragão/.test(n)) return 'dark';
        if (/mina|mine/.test(n)) return 'dim';
        if (/casa|home|lar/.test(n) && m && m.isHome) return 'home';
        return 'open';
    }

    /* ---------- clima ---------- */
    const W = { cur: 'clear', k: 0, target: 0, flash: 0, nextFlash: 0, mapKey: '', forced: false };
    function weatherFor(mapId, kind) {
        if (kind !== 'open') return 'clear';
        const r = hash(mapId + ':' + Math.floor(Date.now() / WEATHER_MS));
        return r < 0.62 ? 'clear' : r < 0.86 ? 'rain' : 'fog';
    }
    let drops = [];
    function initDrops(w, h) { drops = []; for (let i = 0; i < (window.Quality ? Quality.drops() : 260); i++) drops.push({ x: Math.random() * (w + 200), y: Math.random() * h, l: 10 + Math.random() * 14, s: 9 + Math.random() * 7 }); }
    let fogBands = [];

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
    function draw(ctx, canvas, offset, mapObj, view, player, T) {
        const cw = canvas.width, ch = canvas.height, kind = mapKind(mapObj);
        let d = 1 - daylight();                                           // escuridão externa
        if (kind === 'dark') d = Math.max(d, 0.62); else if (kind === 'dim') d = Math.max(d, 0.38); else if (kind === 'home') d = 0.14;
        const mapKey = (mapObj && mapObj.id) || ''; curKind = kind;
        const wanted = W.forced ? W.cur : weatherFor(mapKey, kind);
        if (W.mapKey !== mapKey && !W.forced) { W.mapKey = mapKey; W.cur = wanted; W.k = wanted === 'clear' ? 0 : 1; }
        if (wanted !== W.cur) { W.target = 0; if (W.k <= 0.02) { W.cur = wanted; } } else W.target = wanted === 'clear' ? 0 : 1;
        W.k += (W.target - W.k) * 0.012; if (Math.abs(W.target - W.k) < 0.002) W.k = W.target;
        const wk = W.k;

        /* 1) escurecimento por multiplicação (azul à noite, laranja no crepúsculo) */
        const s = sunS(); const dusk = kind === 'open' ? clamp(1 - Math.abs(s) * 4, 0, 1) : 0;   // perto do nascer/pôr do sol
        let r = 255, g = 255, b = 255;
        if (d > 0.001) { const nd = clamp(d / 1, 0, 1); r = lerp(255, kind === 'dark' ? 105 : 88, nd); g = lerp(255, kind === 'dark' ? 98 : 104, nd); b = lerp(255, kind === 'dark' ? 128 : 165, nd); }
        if (dusk > 0) { r = lerp(r, 255, dusk * 0.5); g = lerp(g, 178, dusk * 0.5); b = lerp(b, 132, dusk * 0.5); }
        if (wk > 0 && W.cur === 'rain') { r *= 1 - 0.16 * wk; g *= 1 - 0.13 * wk; b *= 1 - 0.08 * wk; }
        if (wk > 0 && W.cur === 'fog') { r *= 1 - 0.06 * wk; g *= 1 - 0.05 * wk; }
        if (r < 254 || g < 254 || b < 254) { ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`; ctx.fillRect(0, 0, cw, ch); ctx.restore(); }

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
            glowAt(ctx, px, py - 14, 105, TORCH, 0.55 * lightK);    // o herói carrega uma tocha
            ctx.restore();
        }
        ctx.globalAlpha = 1;

        /* 3) chuva / neblina / trovão */
        if (wk > 0.02 && W.cur === 'rain') {
            if (!drops.length || drops.length && drops.w !== cw + ':' + ch + ':' + (window.Quality ? Quality.level : 2)) { initDrops(cw, ch); drops.w = cw + ':' + ch + ':' + (window.Quality ? Quality.level : 2); }
            ctx.save(); ctx.strokeStyle = 'rgba(190,210,235,' + (0.42 * wk).toFixed(3) + ')'; ctx.lineWidth = 1.2; ctx.beginPath();
            if (!W.splash) W.splash = []; if ((!window.Quality || Quality.level > 0) && Math.random() < 0.9 * wk) W.splash.push({ x: Math.random() * cw, y: ch * (0.35 + Math.random() * 0.65), a: 0 }); if (W.splash.length > 60) W.splash.shift();
            for (const p of drops) { p.y += p.s; p.x -= p.s * 0.35; if (p.y > ch) { p.y = -20; p.x = Math.random() * (cw + 200); } if (p.x < -20) p.x += cw + 200; ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.l * 0.35, p.y + p.l); }
            ctx.stroke();
            ctx.lineWidth = 1; for (let i = W.splash.length - 1; i >= 0; i--) { const sp = W.splash[i]; sp.a++; if (sp.a > 14) { W.splash.splice(i, 1); continue; } ctx.strokeStyle = 'rgba(200,220,245,' + ((1 - sp.a / 14) * 0.5 * wk).toFixed(3) + ')'; ctx.beginPath(); ctx.ellipse(sp.x, sp.y, 1.5 + sp.a * 0.55, 0.6 + sp.a * 0.2, 0, 0, TAU); ctx.stroke(); }
            ctx.fillStyle = 'rgba(40,55,80,' + (0.12 * wk).toFixed(3) + ')'; ctx.fillRect(0, 0, cw, ch);
            if (W.flash > 0.01) { ctx.fillStyle = 'rgba(235,240,255,' + (W.flash * 0.55).toFixed(3) + ')'; ctx.fillRect(0, 0, cw, ch); W.flash *= 0.9; }
            ctx.restore();
            if (T > W.nextFlash) { if (W.nextFlash > 0 && Math.random() < 0.7) { W.flash = 1; if (window.Sfx) setTimeout(() => window.Sfx.play('thunder'), 350 + Math.random() * 500); } W.nextFlash = T + 9 + Math.random() * 16; }
        } else W.flash = 0;
        if (wk > 0.02 && W.cur === 'fog') {
            if (!fogBands.length) for (let i = 0; i < 5; i++) fogBands.push({ y: Math.random(), s: 0.02 + Math.random() * 0.03, p: Math.random() * 6, h: 0.35 + Math.random() * 0.3 });
            ctx.save();
            for (const f of fogBands) { const y = (f.y + Math.sin(T * 0.12 + f.p) * 0.08) * ch, x = ((T * f.s * 80 + f.p * 300) % (cw + 600)) - 300; const gr = ctx.createRadialGradient(x + 300, y, 20, x + 300, y, 380); gr.addColorStop(0, 'rgba(220,228,236,' + (0.34 * wk).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(220,228,236,0)'); ctx.fillStyle = gr; ctx.fillRect(x - 100, y - 380, 800, 760); }
            ctx.fillStyle = 'rgba(205,215,225,' + (0.16 * wk).toFixed(3) + ')'; ctx.fillRect(0, 0, cw, ch);
            ctx.restore();
        }
    }

    /* ---------- lógica por passo de simulação ---------- */
    function tick(mapObj) {
        if (W.cur === 'rain' && W.k > 0.4 && mapObj && mapObj.entities) for (const o of mapObj.entities) if (o && o.type === 'fire' && o.active) o.life -= 2;   // chuva apaga fogueiras mais rápido
    }
    function rainLevel() { return W.cur === 'rain' ? W.k : 0; }
    function rangeMul() { return isNight() ? 1.35 : 1; }   // monstros enxergam mais longe à noite
    function weatherLabel() { return W.cur === 'rain' && W.k > 0.3 ? 'Chuva' : W.cur === 'fog' && W.k > 0.3 ? 'Neblina' : 'Céu limpo'; }

    /* ---------- selo de hora/clima + previsão no canto da tela ---------- */
    let curKind = 'open', open = false;
    const WNAME = { clear: 'Céu limpo', rain: 'Chuva', fog: 'Neblina' };
    const SUN = '<circle cx="16" cy="16" r="6" fill="#ffd45a" stroke="#a8721c" stroke-width="1.4"/><g stroke="#ffd45a" stroke-width="2" stroke-linecap="round"><path d="M16 3v4M16 25v4M3 16h4M25 16h4M7 7l2.800 2.800M22.200 22.200 25 25M25 7l-2.800 2.800M9.800 22.200 7 25"/></g>';
    const MOON = '<path d="M25 19.500A10 10 0 0 1 12.500 7a10 10 0 1 0 12.500 12.500z" fill="#e9e3c3" stroke="#8b855f" stroke-width="1.4"/><circle cx="16" cy="18" r="1.300" fill="#c8c19a"/><circle cx="20" cy="22" r="1" fill="#c8c19a"/>';
    const CLOUD = (f) => '<path d="M9 23a5 5 0 0 1-.6-9.960A7 7 0 0 1 22 12a5.500 5.500 0 0 1 1 11z" fill="' + f + '" stroke="#5b6675" stroke-width="1.400" stroke-linejoin="round"/>';
    const RAIN = CLOUD('#9aa7b8') + '<g stroke="#5aa8ff" stroke-width="2" stroke-linecap="round"><path d="M11 26l-1.400 3M17 26l-1.400 3M23 26l-1.400 3"/></g>';
    const FOG = CLOUD('#c9cfd6') + '<g stroke="#aeb6bf" stroke-width="2" stroke-linecap="round"><path d="M6 26h20M9 29.500h14"/></g>';
    const PARTLY = '<circle cx="12" cy="12" r="5" fill="#ffd45a"/><g stroke="#ffd45a" stroke-width="1.800" stroke-linecap="round"><path d="M12 2v2.500M2 12h2.500M5 5l1.800 1.800M19 5l-1.800 1.800"/></g>' + CLOUD('#f2f4f7').replace('M9 23', 'M11 27').replace('a5 5 0 0 1-.6-9.960A7 7 0 0 1 22 12a5.500 5.500 0 0 1 1 11z', 'a4 4 0 0 1-.5-7.960A6 6 0 0 1 23 16a4.500 4.500 0 0 1 .5 9z');
    function wIcon(w, night, px) {
        const body = w === 'rain' ? RAIN : w === 'fog' ? FOG : (night ? MOON : SUN);
        return '<svg class="wic" width="' + (px || 22) + '" height="' + (px || 22) + '" viewBox="0 0 32 32">' + body + '</svg>';
    }
    function forecast(mapKey, n) {   // o clima é sorteado por janela de 8 min, então dá para prever
        const out = [], base = Math.floor(Date.now() / WEATHER_MS);
        for (let i = 0; i < n; i++) { const r = hash(mapKey + ':' + (base + i)); out.push(r < 0.62 ? 'clear' : r < 0.86 ? 'rain' : 'fog'); }
        return out;
    }
    function fcHtml() {
        if (curKind !== 'open') return '<div class="fc-t">Previsão</div><div class="fc-none">Aqui dentro o tempo não muda.</div>';
        const list = forecast(W.mapKey, 6), msLeft = WEATHER_MS - (Date.now() % WEATHER_MS);
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
        const night = isNight(), w = W.k > 0.3 ? W.cur : 'clear';
        const main = `${wIcon(w, night, 22)}<b>${clockText()}</b><span>${weatherLabel()}</span><i class="eb-car">${open ? '▴' : '▾'}</i>`;
        const m = el.querySelector('.eb-main'); if (m.dataset.h !== main) { m.dataset.h = main; m.innerHTML = main; }
        const f = el.querySelector('.eb-fc'); f.style.display = open ? 'block' : 'none';
        if (open) { const h = fcHtml(); if (f.dataset.h !== h) { f.dataset.h = h; f.innerHTML = h; } }
    }
    setInterval(updateBadge, 1000);

    window.Env = { rainLevel, draw, tick, rangeMul, isNight, daylight, dayFrac, clockText, weatherLabel, setDebugFrac(f) { debugFrac = f; }, forceWeather(w, k) { W.forced = w !== 'auto'; if (w === 'auto') return; W.cur = w; W.k = k == null ? 1 : k; W.target = W.k; } };
})();
