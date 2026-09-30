/* MiniScape 2D — som: efeitos e música gerados por código (WebAudio), sem arquivos de áudio.
   Só inicia depois do primeiro clique/tecla (regra dos navegadores). Volume e mudo ficam salvos neste aparelho. */
(function () {
    'use strict';
    let ctx = null, master = null, sfxBus = null, musBus = null, rainGain = null, noiseBuf = null, reverbIn = null;
    const S = { master: 0.8, music: 0.45, sfx: 0.8, muted: false };
    try { const v = JSON.parse(localStorage.getItem('ms_audio') || 'null'); if (v && typeof v === 'object') { ['master', 'music', 'sfx'].forEach(k => { if (typeof v[k] === 'number') S[k] = Math.max(0, Math.min(1, v[k])); }); S.muted = !!v.muted; } } catch (e) {}
    function save() { try { localStorage.setItem('ms_audio', JSON.stringify(S)); } catch (e) {} }
    function applyVol() { if (!ctx) return; const t = ctx.currentTime; master.gain.setTargetAtTime(S.muted ? 0 : S.master, t, 0.03); sfxBus.gain.setTargetAtTime(S.sfx, t, 0.03); musBus.gain.setTargetAtTime(S.music * 0.55, t, 0.05); }

    function init() {
        if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return ctx; }
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
        try {
            ctx = new AC(); master = ctx.createGain(); sfxBus = ctx.createGain(); musBus = ctx.createGain();
            const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
            sfxBus.connect(comp); musBus.connect(comp); comp.connect(master); master.connect(ctx.destination);
            // ruído branco (1s) reaproveitado por vários efeitos
            noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
            // "reverb" simples: eco curto com realimentação
            reverbIn = ctx.createGain(); const dl = ctx.createDelay(1); dl.delayTime.value = 0.23; const fb = ctx.createGain(); fb.gain.value = 0.42; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
            reverbIn.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(musBus);
            // chuva ambiente (sempre ligada, volume controlado pelo clima)
            const rs = ctx.createBufferSource(); rs.buffer = noiseBuf; rs.loop = true; const rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 1800; rf.Q.value = 0.5; rainGain = ctx.createGain(); rainGain.gain.value = 0;
            rs.connect(rf); rf.connect(rainGain); rainGain.connect(musBus); rs.start();
            applyVol();
        } catch (e) { ctx = null; return null; }
        return ctx;
    }
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, init, { passive: true }));

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
    function chirp() {   // pássaro de dia, grilo à noite
        if (!ctx || S.muted || ctx.state !== 'running') return;
        if (mood.night) { for (let i = 0; i < 4; i++) tone(4300, 0.04, 'sine', 0.018, { delay: i * 0.07, bus: musBus }); }
        else { const b = R(2200, 3400); tone(b, 0.09, 'sine', 0.03, { to: b * 1.5, bus: musBus }); tone(b * 1.2, 0.08, 'sine', 0.03, { to: b * 0.9, delay: 0.1, bus: musBus }); }
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
        if (mood.key !== 'lair' && mood.key !== 'mine' && mood.rain < 0.3 && now >= nextChirp) { nextChirp = now + R(4, 11); chirp(); }
        rainGain.gain.setTargetAtTime(mood.rain * 0.16, now, 0.6);
    }, 250);
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
                const m = gameMaps[currentMap]; if (m && window.Env) setMood({ mapId: currentMap, name: m.name, night: Env.isNight(), rain: /Chuva/.test(Env.weatherLabel()) ? 1 : 0 });
            } catch (e) {}
        }, 60);
    }
    window.addEventListener('load', wire);
    window.Sfx = { play, init, setMood, settings: S, ready: () => !!ctx, state: () => ctx && ctx.state };
})();
