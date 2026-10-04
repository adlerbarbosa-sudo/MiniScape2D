/* MiniScape 2D — trilha sonora estilo RPG, composta em código (sem arquivos).
   Cada bioma tem UMA música própria (melodia fixa de 8 compassos, em loop: alaúde/harpa, flauta, cordas, baixo e percussão).
   A música só muda quando o bioma muda ou quando um combate começa/termina — hora do dia e clima não mexem nela.
   Opcional: coloque arquivos em audio/music/<bioma>.mp3 e um audio/music/index.json ({"village":"village.mp3"}) para usar suas próprias faixas. */
(function () {
    'use strict';
    const MODES = {
        major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11],
        mixo: [0, 2, 4, 5, 7, 9, 10], phryg: [0, 1, 3, 5, 7, 8, 10], phdom: [0, 1, 4, 5, 7, 8, 10], harm: [0, 2, 3, 5, 7, 8, 11]
    };
    /* root = nota MIDI; prog = 4 acordes (grau 0-6), 2 compassos cada = 8 compassos; arp = padrão do acompanhamento; lead = instrumento da melodia; drums = estilo; mel = semente */
    const SONGS = {
        village:  { root: 62, mode: 'major',  bpm: 98,  prog: [0, 4, 5, 3], arp: 'folk',  lead: 'flute', drums: 'folk',   mel: 11, pad: 0.05, dens: 0.8 },
        forest:   { root: 57, mode: 'dorian', bpm: 78,  prog: [0, 3, 0, 4], arp: 'harp',  lead: 'flute', drums: 'none',   mel: 23, pad: 0.07, dens: 0.6 },
        river:    { root: 67, mode: 'lydian', bpm: 72,  prog: [0, 1, 4, 0], arp: 'harp',  lead: 'bell',  drums: 'none',   mel: 37, pad: 0.06, dens: 0.6 },
        sea:      { root: 60, mode: 'mixo',   bpm: 92,  prog: [0, 6, 3, 0], arp: 'folk',  lead: 'flute', drums: 'sea',    mel: 41, pad: 0.05, dens: 0.75 },
        swamp:    { root: 52, mode: 'phryg',  bpm: 64,  prog: [0, 1, 0, 6], arp: 'slow',  lead: 'flute', drums: 'none',   mel: 53, pad: 0.08, dens: 0.4 },
        mountain: { root: 55, mode: 'minor',  bpm: 82,  prog: [0, 5, 2, 6], arp: 'slow',  lead: 'horn',  drums: 'march',  mel: 67, pad: 0.07, dens: 0.55 },
        snow:     { root: 64, mode: 'minor',  bpm: 66,  prog: [0, 5, 3, 4], arp: 'bell',  lead: 'bell',  drums: 'none',   mel: 71, pad: 0.08, dens: 0.5 },
        desert:   { root: 62, mode: 'phdom',  bpm: 90,  prog: [0, 1, 0, 3], arp: 'oud',   lead: 'flute', drums: 'tribal', mel: 83, pad: 0.04, dens: 0.8 },
        oasis:    { root: 60, mode: 'harm',   bpm: 72,  prog: [0, 3, 4, 0], arp: 'harp',  lead: 'flute', drums: 'none',   mel: 89, pad: 0.06, dens: 0.6 },
        mine:     { root: 45, mode: 'minor',  bpm: 58,  prog: [0, 5, 3, 4], arp: 'bell',  lead: 'bell',  drums: 'none',   mel: 97, pad: 0.09, dens: 0.35 },
        lair:     { root: 38, mode: 'phryg',  bpm: 66,  prog: [0, 1, 5, 0], arp: 'slow',  lead: 'strings', drums: 'timp', mel: 101, pad: 0.1,  dens: 0.35 },
        grave:    { root: 43, mode: 'harm',   bpm: 60,  prog: [0, 5, 3, 4], arp: 'slow',  lead: 'strings', drums: 'timp', mel: 113, pad: 0.1,  dens: 0.4 },
        volcano:  { root: 48, mode: 'phryg',  bpm: 104, prog: [0, 1, 0, 6], arp: 'drive', lead: 'brass', drums: 'heavy',  mel: 127, pad: 0.08, dens: 0.7 },
        home:     { root: 65, mode: 'major',  bpm: 76,  prog: [0, 5, 3, 4], arp: 'harp',  lead: 'bell',  drums: 'none',   mel: 131, pad: 0.05, dens: 0.55 },
        combat:   { root: 57, mode: 'minor',  bpm: 144, prog: [0, 5, 2, 6], arp: 'drive', lead: 'brass', drums: 'battle', mel: 149, pad: 0.07, dens: 0.9 },
        combat_dark: { root: 50, mode: 'phryg', bpm: 152, prog: [0, 1, 5, 0], arp: 'drive', lead: 'brass', drums: 'battle', mel: 157, pad: 0.08, dens: 0.9 }
    };
    const DARK = { lair: 1, grave: 1, volcano: 1, mine: 1, swamp: 1 };
    const REG2SONG = { temperado: 'village', floresta: 'forest', rio: 'river', litoral: 'sea', pantano: 'swamp', serra: 'mountain', gelo: 'snow', estrada_areias: 'desert', deserto: 'desert', oasis: 'oasis', sombria: 'grave', cemiterio: 'grave', fortaleza: 'grave', vulcao: 'volcano' };

    let X = null, ctx, musBus, reverbIn, noiseBuf, S;
    let cur = null, want = 'village', combatUntil = 0, song = null, nextT = 0, step = 0, files = null, fileBuf = {}, filesTried = false;
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

    /* ---------- composição: transforma a ficha numa lista de eventos em semicolcheias (128 passos = 8 compassos) ---------- */
    const RHY = [[4], [2, 2], [1, 1, 2], [2, 1, 1], [1, 2, 1], [1, 1, 1, 1], [3, 1], [2, 1, 0.5, 0.5]];   // em tempos (colcheia = 0.5)
    function compose(spec) {
        const sc = MODES[spec.mode], R = rng(spec.mel);
        const deg = (d) => sc[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);        // grau (pode passar de 7) -> semitons
        const pitch = (d) => { let m = spec.root + deg(d); while (m < 38) m += 12; return m; };
        const chordAt = (bar) => spec.prog[bar >> 1];                               // grau da fundamental do acorde
        const tones = (bar) => { const r = chordAt(bar); return [r, r + 2, r + 4]; };
        const ev = { lead: [], arp: [], bass: [], pad: [], drum: [] };
        // melodia: frase A (2 compassos) -> A' -> B (nova) -> A'' que fecha na tônica
        const phrase = (bar0, seedBias, endTonic) => {
            const out = []; let d = chordAt(bar0) + 7 + (R() < 0.5 ? 0 : 2);
            for (let b = 0; b < 2; b++) {
                const bar = bar0 + b, ct = tones(bar); const rh = RHY[(R() * RHY.length) | 0]; let t = 0;
                rh.forEach((len, i) => {
                    if (R() > spec.dens + (i === 0 ? 0.5 : 0)) { t += len; return; }                       // pausa
                    if (i === 0) { const base = ct[(R() * 3) | 0] + 7; d = base + (R() < 0.3 ? 7 * (R() < 0.5 ? -1 : 0) : 0); }
                    else d += [-2, -1, -1, 1, 1, 2][(R() * 6) | 0];
                    d = Math.max(chordAt(bar) + 3, Math.min(chordAt(bar) + 9, d));
                    out.push({ bar, beat: t, len, d }); t += len;
                });
            }
            const last = out[out.length - 1]; if (last) { last.d = endTonic ? 7 : tones(bar0 + 1)[(R() * 3) | 0] + 7; last.len = Math.max(last.len, 2); }
            return out;
        };
        const A = phrase(0, 0), A2 = A.map((n) => ({ bar: n.bar + 2, beat: n.beat, len: n.len, d: n.d })); const lastA2 = A2[A2.length - 1]; if (lastA2) lastA2.d = chordAt(2) + 9;
        const B = phrase(4, 1, false), Af = A.map((n) => ({ bar: n.bar + 6, beat: n.beat, len: n.len, d: n.d })); const lf = Af[Af.length - 1]; if (lf) { lf.d = 7; lf.len = 4; }
        [].concat(A, A2, B, Af).forEach((n) => ev.lead.push({ s: (n.bar * 4 + n.beat) * 4, len: n.len * 4, m: pitch(n.d) }));
        for (let bar = 0; bar < 8; bar++) {
            const r = chordAt(bar), ct = [r, r + 2, r + 4, r + 7]; const s0 = bar * 16;
            // pad: acorde sustentado, um por compasso par
            if (!(bar & 1)) ev.pad.push({ s: s0, len: 32, ms: [pitch(r - 7), pitch(r - 5 + 0), pitch(r - 3)] });
            ev.bass.push({ s: s0, len: 6, m: pitch(r - 14) });
            if (['folk', 'drive', 'oud'].includes(spec.arp)) ev.bass.push({ s: s0 + 8, len: 6, m: pitch(r - 14 + (spec.arp === 'drive' ? 0 : 4)) });
            // arpejo
            const P = { folk: [0, 2, 1, 2, 3, 2, 1, 2], harp: [0, 1, 2, 3, 2, 1, 2, 1], slow: [0, -1, 2, -1, 1, -1, 2, -1], bell: [0, -1, -1, 2, -1, 1, -1, -1], oud: [0, 1, 0, 2, 0, 1, 3, 2], drive: [0, 0, 1, 0, 2, 0, 1, 0] }[spec.arp];
            P.forEach((k, i) => { if (k < 0) return; ev.arp.push({ s: s0 + i * 2, len: 3, m: pitch(ct[k] - 7 + (spec.arp === 'drive' ? 0 : 7)) + (k === 3 ? 0 : 0), v: i % 4 === 0 ? 1 : 0.7 }); });
        }
        // percussão: padrão de 16 passos, por estilo
        const D = {
            folk:   { k: [0, 8], t: [4, 12], h: [2, 6, 10, 14] },
            sea:    { t: [0, 6, 8, 14], h: [4, 12] },
            march:  { k: [0, 8], t: [4, 12], s: [] },
            tribal: { t: [0, 3, 6, 8, 11, 14], h: [2, 10], k: [0] },
            timp:   { T: [0] },
            heavy:  { k: [0, 6, 8, 14], s: [4, 12], T: [0, 8] },
            battle: { k: [0, 3, 8, 10], s: [4, 12], h: [2, 6, 10, 14], T: [0] }
        }[spec.drums];
        if (D) for (let bar = 0; bar < 8; bar++) Object.keys(D).forEach((k) => D[k].forEach((p) => { if (spec.drums === 'timp' && bar % 2) return; ev.drum.push({ s: bar * 16 + p, k, bar }); }));
        return ev;
    }

    /* ---------- instrumentos ---------- */
    function out(song, vol, send) { const g = ctx.createGain(); g.gain.value = vol; g.connect(song.g); if (send) { const r = ctx.createGain(); r.gain.value = send; g.connect(r); r.connect(reverbIn); } return g; }
    function adsr(g, t, a, d, sus, rel, peak) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sus), t + a + d); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d + rel); }
    const INST = {
        pluck(song, m, t, dur, v) { const f = mtof(m), d = out(song, 0.9 * v, 0.35); [['triangle', 0], ['sawtooth', 6]].forEach(([ty, dt], i) => { const o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = ty; o.frequency.value = f; o.detune.value = dt; fl.type = 'lowpass'; fl.frequency.setValueAtTime(3400, t); fl.frequency.exponentialRampToValueAtTime(600, t + 0.7); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(i ? 0.035 : 0.13, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5); o.connect(fl); fl.connect(g); g.connect(d); o.start(t); o.stop(t + 1.6); }); },
        harp(song, m, t, dur, v) { const f = mtof(m), d = out(song, 0.9 * v, 0.5); [1, 2].forEach((h, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f * h; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(i ? 0.03 : 0.12, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + (i ? 0.9 : 1.8)); o.connect(g); g.connect(d); o.start(t); o.stop(t + 2); }); },
        bell(song, m, t, dur, v) { const f = mtof(m), d = out(song, 0.8 * v, 0.7); [[1, 0.12, 2.4], [2.76, 0.05, 1.2], [5.4, 0.02, 0.6]].forEach(([h, a, dc]) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f * h; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(a, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dc); o.connect(g); g.connect(d); o.start(t); o.stop(t + dc + 0.1); }); },
        oud(song, m, t, dur, v) { const f = mtof(m), d = out(song, 0.9 * v, 0.3), o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = f; fl.type = 'bandpass'; fl.frequency.setValueAtTime(f * 3, t); fl.frequency.exponentialRampToValueAtTime(f * 1.2, t + 0.5); fl.Q.value = 1.4; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.18, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9); o.connect(fl); fl.connect(g); g.connect(d); o.start(t); o.stop(t + 1); },
        flute(song, m, t, dur, v) {
            const f = mtof(m), d = out(song, 0.9 * v, 0.55), o = ctx.createOscillator(), g = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain();
            const len = Math.max(0.2, dur) , hold = len * 0.95; o.type = 'sine'; o.frequency.value = f; l.frequency.value = 5.2; lg.gain.value = f * 0.006; l.connect(lg); lg.connect(o.frequency);
            g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.2, t + 0.07); g.gain.setValueAtTime(0.17, t + hold - 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + hold + 0.12);
            o.connect(g); g.connect(d); o.start(t); l.start(t); o.stop(t + hold + 0.2); l.stop(t + hold + 0.2);
            const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; const nf = ctx.createBiquadFilter(), ng = ctx.createGain(); nf.type = 'bandpass'; nf.frequency.value = f * 2; nf.Q.value = 3; ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(0.05, t + 0.04); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); n.connect(nf); nf.connect(ng); ng.connect(d); n.start(t, Math.random()); n.stop(t + 0.3);
        },
        strings(song, m, t, dur, v) { const d = out(song, 0.9 * v, 0.6), f = mtof(m), g = ctx.createGain(), fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1500; const hold = Math.max(0.5, dur); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.1, t + 0.25); g.gain.setValueAtTime(0.09, t + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + hold + 0.7); fl.connect(g); g.connect(d); [-7, 7].forEach((dt) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt; o.connect(fl); o.start(t); o.stop(t + hold + 0.8); }); },
        horn(song, m, t, dur, v) { const d = out(song, 0.9 * v, 0.5), f = mtof(m), hold = Math.max(0.4, dur), g = ctx.createGain(), fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(500, t); fl.frequency.linearRampToValueAtTime(1800, t + 0.18); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.14, t + 0.12); g.gain.setValueAtTime(0.12, t + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + hold + 0.3); fl.connect(g); g.connect(d); const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(fl); o.start(t); o.stop(t + hold + 0.4); },
        brass(song, m, t, dur, v) { const d = out(song, 0.9 * v, 0.35), f = mtof(m), hold = Math.max(0.15, dur * 0.9), g = ctx.createGain(), fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(600, t); fl.frequency.exponentialRampToValueAtTime(2800, t + 0.08); fl.frequency.exponentialRampToValueAtTime(900, t + hold); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.03); g.gain.setValueAtTime(0.12, t + hold * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + hold + 0.12); fl.connect(g); g.connect(d); [-5, 5].forEach((dt) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt; o.connect(fl); o.start(t); o.stop(t + hold + 0.2); }); },
        bass(song, m, t, dur, v) { const d = out(song, 1 * v, 0.1), f = mtof(m), o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = f; o2.frequency.value = f * 2; const g2 = ctx.createGain(); g2.gain.value = 0.25; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.32, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.5, dur)); o.connect(g); o2.connect(g2); g2.connect(g); g.connect(d); o.start(t); o2.start(t); o.stop(t + dur + 0.6); o2.stop(t + dur + 0.6); },
        padc(song, ms, t, dur) { const d = out(song, 1, 0.5); ms.forEach((m, i) => { const f = mtof(m), g = ctx.createGain(), fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 800; const a = Math.min(2, dur * 0.35); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(song.spec.pad, t + a); g.gain.setValueAtTime(song.spec.pad, t + dur - a); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.3); fl.connect(g); g.connect(d); [-6, 6].forEach((dt) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt + i; o.connect(fl); o.start(t); o.stop(t + dur + 0.4); }); }); },
        drum(song, k, t, v) {
            const d = out(song, 1, 0.12);
            const body = (f0, f1, dec, pk) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dec); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(pk * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dec + 0.05); o.connect(g); g.connect(d); o.start(t); o.stop(t + dec + 0.1); };
            const nz = (ft, fr, dec, pk, q) => { const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; const fl = ctx.createBiquadFilter(), g = ctx.createGain(); fl.type = ft; fl.frequency.value = fr; fl.Q.value = q || 1; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(pk * v, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dec); n.connect(fl); fl.connect(g); g.connect(d); n.start(t, Math.random()); n.stop(t + dec + 0.05); };
            if (k === 'k') body(130, 42, 0.16, 0.5); else if (k === 't') { body(190, 95, 0.2, 0.3); nz('bandpass', 1200, 0.05, 0.08, 1); } else if (k === 's') { body(220, 150, 0.1, 0.18); nz('bandpass', 2400, 0.16, 0.2, 0.8); } else if (k === 'h') nz('highpass', 7000, 0.05, 0.07, 1); else if (k === 'T') body(95, 52, 0.9, 0.55);
        }
    };

    /* ---------- reprodução ---------- */
    function startSong(key) {
        const spec = SONGS[key]; if (!spec || !ctx) return; const t = ctx.currentTime;
        if (song) { const old = song; old.g.gain.cancelScheduledValues(t); old.g.gain.setValueAtTime(old.g.gain.value, t); old.g.gain.linearRampToValueAtTime(0.0001, t + 2.4); setTimeout(() => { try { old.g.disconnect(); if (old.src) old.src.stop(); } catch (e) { } }, 3200); }
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.8, t + (key.indexOf('combat') === 0 ? 0.8 : 2.4)); g.connect(musBus);
        song = { key, spec, ev: compose(spec), g, src: null };
        cur = key; nextT = t + 0.15; step = 0;
        if (fileBuf[key]) playFile(key);
        else if (files && files[key]) loadFile(key);
    }
    function playFile(key) { if (!song || song.key !== key || !fileBuf[key]) return; song.file = true; const s = ctx.createBufferSource(); s.buffer = fileBuf[key]; s.loop = true; s.connect(song.g); s.start(); song.src = s; }
    function loadFile(key) { fetch('audio/music/' + files[key]).then((r) => r.ok ? r.arrayBuffer() : null).then((ab) => ab && ctx.decodeAudioData(ab)).then((buf) => { if (buf) { fileBuf[key] = buf; if (song && song.key === key) playFile(key); } }).catch(() => { }); }
    function tick(lead) {
        if (!ctx || (!lead && (ctx.state !== 'running' || S.muted)) || !song) return;
        const spec = song.spec, sps = 60 / spec.bpm / 4, ahead = ctx.currentTime + (lead || 0.5);
        if (song.file) return;   // faixa do jogador toca sozinha
        while (nextT < ahead) {
            const s = step % 128, t = nextT, ev = song.ev;
            for (const n of ev.lead) if (n.s === s) INST[spec.lead](song, n.m, t, n.len * sps, 1);
            for (const n of ev.arp) if (n.s === s) INST[({ folk: 'pluck', harp: 'harp', slow: 'harp', bell: 'bell', oud: 'oud', drive: 'pluck' })[spec.arp]](song, n.m, t, n.len * sps, n.v * (spec.lead === 'brass' ? 0.55 : 0.8));
            for (const n of ev.bass) if (n.s === s) INST.bass(song, n.m, t, n.len * sps, 1);
            for (const n of ev.pad) if (n.s === s) INST.padc(song, n.ms, t, n.len * sps);
            for (const n of ev.drum) if (n.s === s) INST.drum(song, n.k, t, n.k === 'h' ? 0.8 : 1);
            nextT += sps; step++;
        }
    }

    /* ---------- qual música? (só muda por bioma ou combate) ---------- */
    function biomeSong() {
        try {
            const m = gameMaps[currentMap]; if (!m) return 'village';
            const mk = Env.mapKind(m), rg = Env.regionOf(m);
            if (mk === 'home') return 'home';
            if (mk === 'dark') return rg === 'cemiterio' || rg === 'sombria' ? 'grave' : (rg === 'vulcao' ? 'volcano' : 'lair');
            if (mk === 'dim') return 'mine';
            return REG2SONG[rg] || 'village';
        } catch (e) { return 'village'; }
    }
    function inCombat(now) {
        if (now < combatUntil) return true;
        try {
            const es = gameMaps[currentMap] && gameMaps[currentMap].entities; if (!es || !player || !(player.stats.hp > 0)) return false;
            for (let i = 0; i < es.length; i++) { const o = es[i]; if (o.type === 'enemy' && o.active && o.aggroTarget === currentUser && Math.hypot(o.x - player.x, o.y - player.y) < 520) { combatUntil = now + 6000; return true; } }
        } catch (e) { }
        return false;
    }
    function decide() {
        const now = performance.now(); const b = biomeSong(); let k = b;
        if (inCombat(now)) k = (DARK[b] || b === 'lair' || b === 'grave') ? 'combat_dark' : 'combat';
        if (!forced && k !== cur) startSong(k);
    }
    function boot() {
        if (X) return true; if (!window.Sfx || !Sfx.ready || !Sfx.ready()) return false; X = Sfx._bus(); ({ ctx, musBus, reverbIn, noiseBuf, S } = X); if (!ctx || !noiseBuf) { X = null; return false; }
        if (!filesTried) { filesTried = true; fetch('audio/music/index.json').then((r) => r.ok ? r.json() : null).then((j) => { if (j && typeof j === 'object') files = j; }).catch(() => { }); }
        return true;
    }
    setInterval(() => { try { if (!boot()) return; if (ctx.state !== 'running') return; decide(); tick(); } catch (e) { } }, 90);
    function hit() { combatUntil = performance.now() + 7000; }
    window.addEventListener('load', () => {
        const w = (n) => { const o = window[n]; if (typeof o === 'function') window[n] = function (t, d) { const r = o.apply(this, arguments); try { if (n === 'applyDamage') { if (t && t.type === 'enemy' && d > 0) hit(); } else hit(); } catch (e) { } return r; }; };
        w('applyDamage');
        let hp0 = null; setInterval(() => { try { if (player && player.stats) { if (hp0 != null && player.stats.hp < hp0 && gameMaps[currentMap] && Env.mapKind(gameMaps[currentMap]) !== 'home') hit(); hp0 = player.stats.hp; } } catch (e) { } }, 200);
    });
    let forced = false;
    window.Music = { _boot(c, bus, rev, nb) { ctx = c; musBus = bus; reverbIn = rev; noiseBuf = nb; S = { muted: false }; X = 1; }, _start: startSong, _tick: tick, current: () => cur, songs: Object.keys(SONGS), force(k) { if (SONGS[k]) { forced = true; startSong(k); } }, compose, SONGS };
})();
