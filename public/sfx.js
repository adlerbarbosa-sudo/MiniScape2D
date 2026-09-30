/* MiniScape 2D — som: efeitos e música gerados por código (WebAudio), sem arquivos de áudio.
   Só inicia depois do primeiro clique/tecla (regra dos navegadores). Volume e mudo ficam salvos neste aparelho. */
(function () {
    'use strict';
    let ctx = null, master = null, sfxBus = null, musBus = null, ambBus = null, noiseBuf = null, reverbIn = null, A = null;
    const S = { master: 0.8, music: 0.45, sfx: 0.8, muted: false };
    try { const v = JSON.parse(localStorage.getItem('ms_audio') || 'null'); if (v && typeof v === 'object') { ['master', 'music', 'sfx'].forEach(k => { if (typeof v[k] === 'number') S[k] = Math.max(0, Math.min(1, v[k])); }); S.muted = !!v.muted; } } catch (e) {}
    function save() { try { localStorage.setItem('ms_audio', JSON.stringify(S)); } catch (e) {} }
    function applyVol() { if (!ctx) return; const t = ctx.currentTime; master.gain.setTargetAtTime(S.muted ? 0 : S.master, t, 0.03); sfxBus.gain.setTargetAtTime(S.sfx, t, 0.03); musBus.gain.setTargetAtTime(S.music * 0.55, t, 0.05); ambBus.gain.setTargetAtTime(S.sfx, t, 0.05); }

    function init() {
        if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return ctx; }
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
        try {
            ctx = new AC(); master = ctx.createGain(); sfxBus = ctx.createGain(); musBus = ctx.createGain(); ambBus = ctx.createGain();
            const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
            sfxBus.connect(comp); musBus.connect(comp); ambBus.connect(comp); comp.connect(master); master.connect(ctx.destination);
            // ruído branco (1s) reaproveitado por vários efeitos
            noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
            // "reverb" simples: eco curto com realimentação
            reverbIn = ctx.createGain(); const dl = ctx.createDelay(1); dl.delayTime.value = 0.23; const fb = ctx.createGain(); fb.gain.value = 0.42; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
            reverbIn.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(musBus);
            buildAmbience();
            applyVol();
        } catch (e) { ctx = null; return null; }
        return ctx;
    }
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, init, { passive: true }));


    /* ---------- ambiente: chuva de verdade (camadas + gotas), vento, pássaros, grilos, água, pingos de caverna ---------- */
    function makeBuf(kind, sec) {   // ruído rosa/marrom estéreo com canais diferentes (evita o "chiado de rádio" do ruído branco)
        const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
        for (let c = 0; c < 2; c++) {
            const d = b.getChannelData(c); let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
            for (let i = 0; i < n; i++) {
                const w = Math.random() * 2 - 1;
                if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
                else { b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; }
            }
            // costura suave no fim do loop (some o "tec" de repetição)
            const f = Math.floor(ctx.sampleRate * 0.15); for (let i = 0; i < f; i++) { const t = i / f; d[i] = d[i] * t + d[n - f + i] * (1 - t); }
        }
        return b;
    }
    function loopSrc(buf) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = 0.15; s.loopEnd = buf.duration - 0.01; return s; }
    function lfo(freq, depth, target, offsetVal) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = freq; g.gain.value = depth; o.connect(g); g.connect(target); o.start(); return o; }
    function buildAmbience() {
        const pink = makeBuf('pink', 7), brown = makeBuf('brown', 9);
        A = { rain: 0, wind: 0, water: 0 };
        // chuva: (1) "lençol" de água caindo (rosa, sem graves nem agudos extremos)
        let src = loopSrc(pink), hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), pk = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500; lp.type = 'lowpass'; lp.frequency.value = 6500; pk.type = 'peaking'; pk.frequency.value = 2600; pk.gain.value = 3; pk.Q.value = 0.6;
        A.bed = ctx.createGain(); A.bed.gain.value = 0; src.connect(hp); hp.connect(pk); pk.connect(lp); lp.connect(A.bed); A.bed.connect(ambBus); src.start(0, 0.2);
        lfo(0.11, 0.05, A.bed.gain); lfo(0.29, 0.03, A.bed.gain);       // rajadas leves de intensidade
        // (2) chuva no chão/telhados: grave abafado
        src = loopSrc(brown); lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; A.roof = ctx.createGain(); A.roof.gain.value = 0; src.connect(lp); lp.connect(A.roof); A.roof.connect(ambBus); src.start(0, 1.3);
        // (3) chiado das folhas (bem baixo e só nos agudos altos)
        src = loopSrc(pink); hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6500; A.hiss = ctx.createGain(); A.hiss.gain.value = 0; src.connect(hp); hp.connect(A.hiss); A.hiss.connect(ambBus); src.start(0, 3.1);
        // vento: rosa passa-faixa com frequência e volume oscilando devagar
        src = loopSrc(pink); const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 380; wf.Q.value = 0.9; A.windG = ctx.createGain(); A.windG.gain.value = 0; src.connect(wf); wf.connect(A.windG); A.windG.connect(ambBus); src.start(0, 4.4);
        lfo(0.06, 160, wf.frequency); lfo(0.09, 0.02, A.windG.gain);
        // água corrente (rios)
        src = loopSrc(pink); const wl = ctx.createBiquadFilter(); wl.type = 'bandpass'; wl.frequency.value = 1100; wl.Q.value = 0.5; A.waterG = ctx.createGain(); A.waterG.gain.value = 0; src.connect(wl); wl.connect(A.waterG); A.waterG.connect(ambBus); src.start(0, 5.2);
        lfo(0.7, 250, wl.frequency);
        // zumbido grave de caverna
        A.drone = ctx.createGain(); A.drone.gain.value = 0; [55, 82.4].forEach((f, i) => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.detune.value = i * 7; o.connect(A.drone); o.start(); }); A.drone.connect(ambBus);
    }
    function drop(vol) {   // uma gota batendo: estalinho curto de ruído filtrado, posição aleatória no estéreo
        const t = ctx.currentTime + Math.random() * 0.06, s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(), g = ctx.createGain(), p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        f.type = 'bandpass'; f.frequency.value = R(1800, 7500); f.Q.value = R(2, 9); const dur = R(0.008, 0.03);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        s.connect(f); f.connect(g); if (p) { p.pan.value = R(-0.9, 0.9); g.connect(p); p.connect(ambBus); } else g.connect(ambBus); s.start(t, Math.random() * 0.8); s.stop(t + dur + 0.02);
        if (Math.random() < 0.18) { const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; const b = R(900, 2200); o.frequency.setValueAtTime(b, t); o.frequency.exponentialRampToValueAtTime(b * 1.7, t + 0.03); og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(vol * 0.5, t + 0.004); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); o.connect(og); og.connect(p || ambBus); if (p) p.connect(ambBus); o.start(t); o.stop(t + 0.07); }
    }
    let dropAcc = 0, lastAmb = 0;
    function ambTick(nowMs) {   // roda a cada ~60 ms
        if (!A) return; const dt = Math.min(0.2, (nowMs - lastAmb) / 1000); lastAmb = nowMs; const t = ctx.currentTime;
        const r = mood.rain, open = mood.key !== 'lair' && mood.key !== 'mine';
        A.bed.gain.setTargetAtTime(r * 0.20 * (mood.key === 'home' ? 0.5 : 1), t, 0.9); A.roof.gain.setTargetAtTime(r * 0.55, t, 0.9); A.hiss.gain.setTargetAtTime(r * 0.012, t, 0.9);
        dropAcc += dt * r * 34; while (dropAcc >= 1) { dropAcc--; drop(R(0.03, 0.09)); }
        A.windG.gain.setTargetAtTime(open ? (mood.key === 'forest' ? 0.08 : 0.05) * (mood.night ? 1.3 : 1) * (1 + r * 0.6) : 0, t, 1.2);
        A.waterG.gain.setTargetAtTime(mood.key === 'river' ? 0.1 : 0, t, 1.5);
        A.drone.gain.setTargetAtTime(mood.key === 'lair' ? 0.05 : mood.key === 'mine' ? 0.025 : 0, t, 2);
    }
    function bird() {   // três "espécies": trinado, assobio de duas notas e chamada descendente
        const k = Math.floor(Math.random() * 3), b = R(2400, 3600), v = 0.035;
        if (k === 0) for (let i = 0; i < R(4, 8) | 0; i++) tone(b + (i % 2) * 300, 0.045, 'sine', v, { to: b * 1.25, delay: i * 0.06, bus: ambBus });
        else if (k === 1) { tone(b, 0.16, 'sine', v, { to: b * 1.35, bus: ambBus }); tone(b * 1.35, 0.2, 'sine', v, { to: b * 0.95, delay: 0.19, bus: ambBus }); }
        else for (let i = 0; i < 3; i++) tone(b * 1.4 - i * 260, 0.11, 'triangle', v * 0.8, { to: b * 1.2 - i * 260, delay: i * 0.13, bus: ambBus });
    }
    function cricket() { const f = R(4100, 4700), n = 3 + (Math.random() * 4 | 0); for (let i = 0; i < n; i++) tone(f, 0.035, 'sine', 0.014, { delay: i * 0.055, bus: ambBus }); }
    function owl() { tone(420, 0.35, 'sine', 0.05, { to: 350, bus: ambBus }); tone(420, 0.45, 'sine', 0.05, { to: 330, delay: 0.5, bus: ambBus }); }
    function frog() { for (let i = 0; i < 3; i++) tone(R(180, 230), 0.07, 'square', 0.02, { to: 130, delay: i * 0.11, bus: ambBus, filter: (() => { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; return f; })() }); }
    function dripCave() { const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), b = R(900, 1600); o.type = 'sine'; o.frequency.setValueAtTime(b * 1.5, t); o.frequency.exponentialRampToValueAtTime(b, t + 0.05); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); o.connect(g); g.connect(ambBus); g.connect(reverbIn); o.start(t); o.stop(t + 0.2); }

    /* ---------- blocos de síntese ---------- */
    function env(g, t, a, d, peak, end) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(end || 0.0001, 0.0001), t + a + d); }
    function tone(freq, dur, type, vol, opt) {
        opt = opt || {}; const t = ctx.currentTime + (opt.delay || 0); const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
        if (opt.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opt.to), t + dur);
        env(g, t, opt.a || 0.004, dur, vol); o.connect(opt.filter || g); if (opt.filter) opt.filter.connect(g); g.connect(opt.bus || sfxBus); o.start(t); o.stop(t + dur + (opt.a || 0.004) + 0.05);
    }
    function noise(dur, ftype, freq, q, vol, opt) {
        opt = opt || {}; const t = ctx.currentTime + (opt.delay || 0); const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.setValueAtTime(freq, t); f.Q.value = q || 1;
        if (opt.sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, opt.sweepTo), t + dur);
        const g = ctx.createGain(); env(g, t, opt.a || 0.003, dur, vol); s.connect(f); f.connect(g); g.connect(opt.bus || sfxBus); s.start(t, Math.random() * 0.5); s.stop(t + dur + (opt.a || 0.003) + 0.05);
    }
    const R = (a, b) => a + Math.random() * (b - a);

    const DEF = {
        click: () => tone(1500, 0.03, 'square', 0.05),
        step: () => noise(0.07, 'lowpass', R(300, 520), 1, 0.13),
        hit: () => { tone(R(150, 190), 0.12, 'triangle', 0.4, { to: 60 }); noise(0.08, 'bandpass', 1400, 1, 0.22); },
        miss: () => noise(0.12, 'bandpass', 900, 1.5, 0.12, { sweepTo: 2200 }),
        kill: () => { tone(220, 0.35, 'sawtooth', 0.18, { to: 55 }); noise(0.25, 'lowpass', 900, 1, 0.25, { sweepTo: 200 }); },
        hurt: () => { tone(200, 0.22, 'sawtooth', 0.28, { to: 90 }); noise(0.1, 'lowpass', 700, 1, 0.2); },
        death: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.5, 'triangle', 0.22, { delay: i * 0.22 })); },
        chop: () => { tone(R(170, 210), 0.09, 'square', 0.18, { to: 90 }); noise(0.09, 'bandpass', 700, 1, 0.3); },
        mine: () => { tone(R(1000, 1200), 0.16, 'square', 0.1, { to: 650 }); tone(2400, 0.08, 'sine', 0.08); noise(0.06, 'highpass', 3000, 1, 0.16); },
        fish: () => { noise(0.35, 'lowpass', 2200, 1, 0.22, { sweepTo: 300 }); tone(500, 0.12, 'sine', 0.08, { to: 900, delay: 0.05 }); },
        smelt: () => { noise(0.4, 'bandpass', 500, 2, 0.16, { sweepTo: 250 }); tone(110, 0.4, 'sawtooth', 0.08, { to: 80 }); },
        cook: () => noise(0.5, 'highpass', 4200, 0.7, 0.13),
        fire: () => { noise(0.25, 'bandpass', 600, 1, 0.2, { sweepTo: 1600 }); },
        pickup: () => { tone(660, 0.09, 'sine', 0.18); tone(990, 0.12, 'sine', 0.18, { delay: 0.07 }); },
        coin: () => { tone(1320, 0.1, 'square', 0.08); tone(1760, 0.18, 'square', 0.08, { delay: 0.06 }); },
        craft: () => { tone(1250, 0.35, 'sine', 0.18); tone(1870, 0.28, 'sine', 0.1); noise(0.05, 'highpass', 2500, 1, 0.3); tone(1250, 0.3, 'sine', 0.12, { delay: 0.18 }); },
        levelup: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, 'triangle', 0.22, { delay: i * 0.09 })); tone(1568, 0.5, 'sine', 0.12, { delay: 0.4 }); },
        quest: () => { [392, 523, 659, 784].forEach((f, i) => { tone(f, 0.4, 'triangle', 0.2, { delay: i * 0.13 }); tone(f * 2, 0.4, 'sine', 0.06, { delay: i * 0.13 }); }); },
        accept: () => { tone(440, 0.12, 'triangle', 0.18); tone(660, 0.2, 'triangle', 0.18, { delay: 0.1 }); },
        error: () => { tone(160, 0.18, 'square', 0.12); tone(130, 0.2, 'square', 0.12, { delay: 0.12 }); },
        portal: () => { noise(0.7, 'bandpass', 300, 3, 0.2, { sweepTo: 2600 }); tone(220, 0.7, 'sine', 0.15, { to: 880 }); },
        depleted: () => { tone(140, 0.2, 'triangle', 0.22, { to: 70 }); },
        thunder: () => { noise(2.6, 'lowpass', 500, 1, 0.55, { sweepTo: 70, a: 0.08 }); tone(55, 1.8, 'sawtooth', 0.14, { to: 35 }); },
        plant: () => { noise(0.14, 'lowpass', 500, 1, 0.22); },
        harvest: () => { noise(0.1, 'bandpass', 2000, 1, 0.2); tone(700, 0.1, 'sine', 0.12, { delay: 0.05 }); },
        brew: () => { for (let i = 0; i < 4; i++) tone(R(300, 700), 0.09, 'sine', 0.12, { delay: i * 0.07, to: R(700, 1200) }); },
        enchant: () => { [880, 1175, 1568, 2093].forEach((f, i) => tone(f, 0.5, 'sine', 0.1, { delay: i * 0.06 })); noise(0.5, 'highpass', 5000, 1, 0.06); },
        build: () => { tone(180, 0.08, 'square', 0.16, { to: 120 }); noise(0.06, 'bandpass', 900, 1, 0.16); }
    };
    const last = {}; let poly = 0;
    function play(name, vol) {
        if (!ctx || S.muted || ctx.state !== 'running') return; const f = DEF[name]; if (!f) return;
        const now = performance.now(); const gap = name === 'step' ? 120 : 45; if (last[name] && now - last[name] < gap) return; last[name] = now;
        if (poly > 14) return; poly++; setTimeout(() => { poly--; }, 260);
        try { f(vol || 1); } catch (e) {}
    }

    /* ---------- música procedural por mapa, hora e clima ---------- */
    const SCALES = { village: [0, 2, 4, 7, 9], forest: [0, 2, 3, 7, 9], mine: [0, 3, 5, 7, 10], lair: [0, 1, 4, 5, 7], river: [0, 2, 5, 7, 9], home: [0, 4, 7, 9, 11] };
    const ROOT = { village: 261.63, forest: 220, mine: 146.83, lair: 110, river: 246.94, home: 293.66 };
    let mood = { key: 'village', night: false, rain: 0 }, chordT = 0, nextNote = 0, padNodes = null, curChord = 0, walk = 2;
    function kindOf(mapId, name) {
        const n = ((name || '') + ' ' + (mapId || '')).toLowerCase();
        if (/covil|catacumba|dragon|dragão|masmorra|dungeon/.test(n)) return 'lair'; if (/mina|mine|cave|caverna/.test(n)) return 'mine';
        if (/floresta|forest|bosque/.test(n)) return 'forest'; if (/rio|river|lago|pantano/.test(n)) return 'river'; if (/casa|home|lar/.test(n)) return 'home'; return 'village';
    }
    function freqOf(root, semis) { return root * Math.pow(2, semis / 12); }
    function pluck(f, vol) {
        const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter(); o.type = 'triangle'; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.setValueAtTime(3200, t); fl.frequency.exponentialRampToValueAtTime(500, t + 1.4);
        env(g, t, 0.008, 2.2, vol); o.connect(fl); fl.connect(g); g.connect(musBus); g.connect(reverbIn); o.start(t); o.stop(t + 2.4);
    }
    function setPad(rootF, scale) {
        const t = ctx.currentTime; const notes = [scale[0], scale[2 % scale.length], scale[4 % scale.length]].map((s, i) => freqOf(rootF / 2, s + (i === 2 ? 0 : 0)));
        if (padNodes) padNodes.forEach(n => { n.g.gain.cancelScheduledValues(t); n.g.gain.setTargetAtTime(0.0001, t, 1.2); n.o.stop(t + 5); });
        padNodes = notes.map(f => { const o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter(); o.type = 'sine'; o.frequency.value = f; o.detune.value = R(-6, 6); fl.type = 'lowpass'; fl.frequency.value = 900; g.gain.value = 0.0001; g.gain.setTargetAtTime(0.05, t, 2.5); o.connect(fl); fl.connect(g); g.connect(musBus); o.start(t); return { o, g }; });
    }
    let nextChirp = 0;
    setInterval(() => {
        if (!ctx || ctx.state !== 'running' || S.muted) return; const now = ctx.currentTime;
        const sc = SCALES[mood.key] || SCALES.village, root = ROOT[mood.key] || 261.63;
        if (now >= chordT) { chordT = now + 14 + R(0, 6); curChord = (curChord + 1) % sc.length; setPad(freqOf(root, sc[curChord]), sc); }
        const slow = mood.night ? 1.6 : 1;
        if (now >= nextNote) {
            nextNote = now + (mood.key === 'lair' ? R(3.5, 6) : R(1.6, 3.4)) * slow;
            walk = Math.max(0, Math.min(sc.length * 2 - 1, walk + Math.round(R(-2, 2)))); const deg = sc[walk % sc.length] + 12 * Math.floor(walk / sc.length);
            pluck(freqOf(root, deg), (mood.night ? 0.11 : 0.15) * (1 - mood.rain * 0.3));
            if (Math.random() < 0.25) pluck(freqOf(root, deg + 7), 0.06);
        }
        if (now >= nextChirp) {
            const open = mood.key !== 'lair' && mood.key !== 'mine' && mood.key !== 'home';
            if (open && mood.rain < 0.3) { nextChirp = now + R(3, 9); if (mood.night) { const q = Math.random(); if (q < 0.7) cricket(); else if (mood.key === 'river') frog(); else if (mood.key === 'forest' || mood.key === 'village') owl(); } else bird(); }
            else if (!open && mood.key !== 'home') { nextChirp = now + R(2.5, 8); dripCave(); } else nextChirp = now + 6;
        }
    }, 250);
    setInterval(() => { if (ctx && ctx.state === 'running' && !S.muted) ambTick(performance.now()); }, 60);
    function setMood(m) {
        const key = kindOf(m.mapId, m.name); const changed = key !== mood.key;
        mood = { key, night: !!m.night, rain: m.rain || 0 };
        if (changed && ctx) { chordT = 0; nextNote = 0; walk = 2; }
    }

    /* ---------- painel de volume (aba Menu) ---------- */
    function buildPanel() {
        const host = document.getElementById('tab-cfg'); if (!host || document.getElementById('audio-panel')) return;
        const d = document.createElement('div'); d.id = 'audio-panel'; d.className = 'book-page'; d.style.marginBottom = '10px';
        d.innerHTML = `<h3 style="margin:0 0 6px">Som</h3>
            <label class="aud-row"><input type="checkbox" id="aud-mute"> Sem som</label>
            <label class="aud-row"><span>Geral</span><input type="range" id="aud-master" min="0" max="100"></label>
            <label class="aud-row"><span>Música</span><input type="range" id="aud-music" min="0" max="100"></label>
            <label class="aud-row"><span>Efeitos</span><input type="range" id="aud-sfx" min="0" max="100"></label>`;
        host.insertBefore(d, host.firstChild);
        const set = () => { S.muted = document.getElementById('aud-mute').checked; S.master = document.getElementById('aud-master').value / 100; S.music = document.getElementById('aud-music').value / 100; S.sfx = document.getElementById('aud-sfx').value / 100; save(); applyVol(); };
        document.getElementById('aud-mute').checked = S.muted; document.getElementById('aud-master').value = S.master * 100; document.getElementById('aud-music').value = S.music * 100; document.getElementById('aud-sfx').value = S.sfx * 100;
        ['aud-mute', 'aud-master', 'aud-music', 'aud-sfx'].forEach(id => document.getElementById(id).addEventListener('input', () => { init(); set(); play('click'); }));
    }

    /* ---------- ligações com o jogo (executa depois que todos os scripts carregaram) ---------- */
    function wrap(name, fn) { const orig = window[name]; if (typeof orig !== 'function') return; window[name] = function () { const r = orig.apply(this, arguments); try { fn(arguments, r); } catch (e) {} return r; }; }
    function wire() {
        buildPanel();
        wrap('applyDamage', (a) => { if (a[1] > 0) play('hit'); else play('miss'); if (a[0] && a[0].hp <= 0) play('kill'); });
        wrap('addFloatingText', (a) => { const t = String(a[2]); if (t === 'Pegou') play('pickup'); else if (t === 'Pescado') play('fish'); else if (t === 'Cozinhou!') play('cook'); else if (t === 'Level Up!') play('levelup'); else if (t === 'Vazio') play('depleted'); });
        wrap('setActionText', (a) => { const t = String(a[0]); if (/^Criou /.test(t)) play('craft'); else if (/Faltam|cheio|inválida|Requer|Sem minér|não pode/i.test(t)) play('error'); else if (/^Acendeu/.test(t)) play('fire'); else if (/^Viajou/.test(t)) play('portal'); });
        wrap('respawnAtVillage', () => play('death'));
        document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('.tab-btn,.item-slot,.osrs-menu-item,button,.rc-item,.book-tab,.equip-slot-box')) play('click'); }, true);
        // passos, golpes de coleta, dano recebido, clima e humor da música
        let lx = null, ly = null, dist = 0, lastHp = null, lastAnim = 0;
        setInterval(() => {
            try {
                if (typeof player === 'undefined' || !window.currentUser && typeof currentUser === 'undefined') return;
                if (document.getElementById('login-overlay').style.display !== 'none') return;
                if (lx != null) { const mv = Math.hypot(player.x - lx, player.y - ly); if (mv < 40) dist += mv; } lx = player.x; ly = player.y;
                if (dist > 26) { dist = 0; play('step'); }
                if (player.stats) { if (lastHp != null && player.stats.hp < lastHp) play('hurt'); lastHp = player.stats.hp; }
                if (player.isPerformingAction && player.actionAnim === 10 && lastAnim !== 10) { const t = player.actionType; if (t === 'chop') play('chop'); else if (t === 'mine') play('mine'); else if (t === 'smelt_brz' || t === 'smelt_iron') play('smelt'); }
                lastAnim = player.actionAnim;
                const m = gameMaps[currentMap]; if (m && window.Env) setMood({ mapId: currentMap, name: m.name, night: Env.isNight(), rain: Env.rainLevel ? Env.rainLevel() : (/Chuva/.test(Env.weatherLabel()) ? 1 : 0) });
            } catch (e) {}
        }, 60);
    }
    window.addEventListener('load', wire);
    window.Sfx = { _master: () => master, _ctx: () => ctx, _amb: () => A, _mood: () => mood, play, init, setMood, settings: S, ready: () => !!ctx, state: () => ctx && ctx.state };
})();
