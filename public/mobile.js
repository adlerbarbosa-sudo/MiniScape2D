/* MiniScape 2D — modo celular/tablet (toque): só paisagem, canvas em tela cheia, painel como gaveta, joystick flutuante e botões de ação.
   Só liga quando o aparelho é de toque (pointer:coarse) ou com ?touch=1 na URL (teste). No desktop nada muda. O CSS fica em ui.css (body.touch). */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const q = new URLSearchParams(location.search);
    let forced = q.get('touch'); try { if (forced === null) forced = localStorage.getItem('ms_touch'); } catch (e) { }
    const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    const isTouch = forced === '1' ? true : forced === '0' ? false : (coarse || (navigator.maxTouchPoints > 0 && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)));
    const JOY = window.JOY = { x: 0, y: 0, active: false };   // eixos do joystick (-1, 0, 1) lidos pelo laço de movimento do jogo
    const Mobile = window.Mobile = { on: () => isTouch, joy: JOY };
    if (!isTouch) return;
    document.documentElement.classList.add('touch');

    const DEAD = 14, RADIUS = 52, TAP_MS = 320, TAP_PX = 12, LONG_MS = 550;
    let ready = false, drawerOpen = false, autoOpened = false, joyT = null, rightT = null, canvas = null, gc = null;

    const inGame = () => { const w = $('game-wrapper'); return !!w && w.style.display !== 'none'; };
    const portrait = () => window.innerHeight > window.innerWidth;
    const fsOk = () => !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
    const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

    function lockLandscape() { try { if (screen.orientation && screen.orientation.lock) { const p = screen.orientation.lock('landscape'); if (p && p.catch) p.catch(() => { }); } } catch (e) { } }
    function goFullscreen() {
        const el = document.documentElement; let p;
        try { p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el); } catch (e) { }
        const after = () => lockLandscape();
        if (p && p.then) p.then(after).catch(() => { }); else after();
    }
    function setDrawer(v, auto) {
        drawerOpen = !!v; autoOpened = !!(v && auto); document.body.classList.toggle('m-drawer', drawerOpen);
        const b = $('m-menu'); if (b) b.setAttribute('aria-expanded', drawerOpen ? 'true' : 'false');
        try { if (typeof updateUI === 'function') updateUI(); } catch (e) { }
    }

    function build() {
        gc = $('game-container'); canvas = $('gameCanvas'); if (!gc || !canvas) return false;
        document.body.classList.add('touch');
        // aviso de retrato
        const rot = document.createElement('div'); rot.id = 'm-rotate';
        rot.innerHTML = '<div class="m-rot-ic" aria-hidden="true"><svg viewBox="0 0 64 64" width="84" height="84" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="20" y="6" width="24" height="44" rx="4"/><path d="M29 44h6"/><path d="M8 40c0 10 7 17 17 17M57 26c0-10-7-17-17-17"/><path d="M21 52l4 5-5 3M43 12l-4-5 5-3"/></svg></div><h2>Gire o celular para jogar</h2><p>O MiniScape 2D é jogado na horizontal.<br>Vire o aparelho e o jogo continua de onde parou.</p><button type="button" id="m-rot-fs" class="m-fs" style="display:none">Tela cheia</button>';
        document.body.appendChild(rot);
        // HUD compacto
        const hud = document.createElement('div'); hud.id = 'm-hud';
        hud.innerHTML = '<div class="mh-b hp"><i id="mh-hp"></i><span id="mh-hpt"></span></div><div class="mh-b mp"><i id="mh-mp"></i><span id="mh-mpt"></span></div>';
        gc.appendChild(hud);
        // canto superior direito: chat, menu (gaveta), tela cheia
        const top = document.createElement('div'); top.id = 'm-top';
        top.innerHTML = '<button type="button" id="m-chat" class="m-ib" aria-label="Chat"><svg class="ic"><use href="#i-chat"/></svg></button><button type="button" id="m-fs" class="m-ib" aria-label="Tela cheia" style="display:none"><svg class="ic"><use href="#i-grid"/></svg></button><button type="button" id="m-menu" class="m-ib big" aria-label="Mochila e menu" aria-expanded="false"><svg class="ic"><use href="#i-bag"/></svg></button>';
        gc.appendChild(top);
        // botões de ação, à direita
        const ctl = document.createElement('div'); ctl.id = 'm-ctl'; gc.appendChild(ctl);
        const act = $('mobile-action-btn'), atk = $('mobile-atk-btn');
        if (act) { act.innerHTML = '<svg class="ic"><use href="#i-hand"/></svg><b>AÇÃO</b>'; ctl.appendChild(act); }
        if (atk) { atk.innerHTML = '<svg class="ic"><use href="#i-sword"/></svg>'; atk.setAttribute('aria-label', 'Atacar'); ctl.insertBefore(atk, act); }
        const at = $('action-text'); if (at) gc.appendChild(at);
        // joystick (só aparece enquanto o dedo está na tela)
        const joy = document.createElement('div'); joy.id = 'm-joy'; joy.innerHTML = '<i></i>'; gc.appendChild(joy);

        const fsBtns = [$('m-fs'), $('m-rot-fs')];
        fsBtns.forEach((b) => { if (b) { b.addEventListener('click', goFullscreen); if (fsOk()) b.style.display = ''; } });
        $('m-menu').addEventListener('click', () => setDrawer(!drawerOpen, false));
        $('m-chat').addEventListener('click', () => { try { const cc = $('chat-container'); if (cc) cc.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); } catch (e) { } });
        // tocar fora da gaveta fecha; NPC/banco abrem a gaveta sozinhos (a loja e o banco moram no painel)
        const op = window.openTab;
        if (typeof op === 'function') window.openTab = function (t) { const r = op.apply(this, arguments); try { if ((t === 'npc' || t === 'bank') && !drawerOpen) setDrawer(true, true); else if (t === 'inv' && autoOpened) setDrawer(false); } catch (e) { } return r; };
        document.addEventListener('fullscreenchange', syncFs); document.addEventListener('webkitfullscreenchange', syncFs);
        // gestos da página: sem zoom por pinça, sem zoom por toque duplo, sem puxar para atualizar
        ['gesturestart', 'gesturechange', 'gestureend'].forEach((n) => document.addEventListener(n, (e) => e.preventDefault(), { passive: false }));
        document.addEventListener('touchmove', (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
        document.addEventListener('dblclick', (e) => { if (!/^(INPUT|TEXTAREA)$/.test((e.target || {}).tagName || '')) e.preventDefault(); }, { passive: false });
        bindCanvas();
        ready = true; return true;
    }
    function syncFs() { const f = isFs(); [$('m-fs'), $('m-rot-fs')].forEach((b) => { if (b) b.style.display = (!f && fsOk()) ? '' : 'none'; }); if (f) lockLandscape(); try { if (window.resizeCanvasSoon) resizeCanvasSoon(); } catch (e) { } }

    /* ---------- toque no mundo: joystick na metade esquerda, tap-para-interagir nas duas ---------- */
    const fake = (t, button) => ({ type: 'touchstart', button: button || 0, which: (button || 0) === 2 ? 3 : 1, target: canvas, touches: [{ clientX: t.clientX, clientY: t.clientY, pageX: t.pageX, pageY: t.pageY }], preventDefault() { } });
    function worldTap(t) { try { onCanvasMouseDown(fake(t, 0)); } catch (e) { console.error(e); } }
    function joyEl() { return $('m-joy'); }
    function joyShow(on) { const j = joyEl(); if (j) j.classList.toggle('on', !!on); }
    function joyDraw() {
        const j = joyEl(); if (!j || !joyT) return; const r = gc.getBoundingClientRect();
        j.style.left = (joyT.ox - r.left) + 'px'; j.style.top = (joyT.oy - r.top) + 'px';
        const k = j.firstChild, d = Math.min(RADIUS, Math.hypot(joyT.dx, joyT.dy)), a = Math.atan2(joyT.dy, joyT.dx);
        k.style.transform = 'translate(' + (Math.cos(a) * d).toFixed(1) + 'px,' + (Math.sin(a) * d).toFixed(1) + 'px)';
    }
    function joyStop() { JOY.x = 0; JOY.y = 0; JOY.active = false; joyShow(false); if (joyT && joyT.timer) clearTimeout(joyT.timer); joyT = null; }
    function joyUpdate() {
        const d = Math.hypot(joyT.dx, joyT.dy);
        if (d < DEAD) { JOY.x = 0; JOY.y = 0; return; }
        const k = Math.round(Math.atan2(joyT.dy, joyT.dx) / (Math.PI / 4));   // 8 direções
        JOY.x = Math.round(Math.cos(k * Math.PI / 4)); JOY.y = Math.round(Math.sin(k * Math.PI / 4));
    }
    function bindCanvas() {
        const opt = { passive: false };
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault(); if (drawerOpen) setDrawer(false);
            const r = canvas.getBoundingClientRect();
            for (const t of e.changedTouches) {
                const left = (t.clientX - r.left) < r.width / 2;
                if (left && !joyT) {
                    joyT = { id: t.identifier, sx: t.clientX, sy: t.clientY, ox: t.clientX, oy: t.clientY, dx: 0, dy: 0, t0: performance.now(), moved: false, shown: false, tap: { clientX: t.clientX, clientY: t.clientY, pageX: t.pageX, pageY: t.pageY } };
                    joyT.timer = setTimeout(() => { if (joyT) { joyT.shown = true; joyShow(true); joyDraw(); } }, 140);
                } else if (!rightT && !left) {
                    rightT = { id: t.identifier, sx: t.clientX, sy: t.clientY, t };
                    worldTap(t);
                    rightT.timer = setTimeout(() => { if (rightT) { try { player.destX = player.x; player.destY = player.y; onCanvasMouseDown(fake(rightT.t, 2)); } catch (er) { } rightT.timer = 0; } }, LONG_MS);   // segurar = menu (botão direito)
                }
            }
        }, opt);
        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            for (const t of e.changedTouches) {
                if (joyT && t.identifier === joyT.id) {
                    joyT.dx = t.clientX - joyT.ox; joyT.dy = t.clientY - joyT.oy; const d = Math.hypot(joyT.dx, joyT.dy);
                    if (!joyT.moved && Math.hypot(t.clientX - joyT.sx, t.clientY - joyT.sy) > TAP_PX) { joyT.moved = true; JOY.active = true; if (!joyT.shown) { joyT.shown = true; joyShow(true); } }
                    if (d > RADIUS * 1.6) { const a = Math.atan2(joyT.dy, joyT.dx), over = d - RADIUS * 1.6; joyT.ox += Math.cos(a) * over; joyT.oy += Math.sin(a) * over; joyT.dx = t.clientX - joyT.ox; joyT.dy = t.clientY - joyT.oy; }   // a base acompanha o dedo
                    if (joyT.moved) { joyUpdate(); joyDraw(); }
                } else if (rightT && t.identifier === rightT.id && rightT.timer && Math.hypot(t.clientX - rightT.sx, t.clientY - rightT.sy) > TAP_PX) { clearTimeout(rightT.timer); rightT.timer = 0; }
            }
        }, opt);
        const end = (e) => {
            e.preventDefault();
            for (const t of e.changedTouches) {
                if (joyT && t.identifier === joyT.id) { const tap = !joyT.moved && performance.now() - joyT.t0 < TAP_MS && e.type === 'touchend', p = joyT.tap; joyStop(); if (tap) worldTap(p); }
                else if (rightT && t.identifier === rightT.id) { if (rightT.timer) clearTimeout(rightT.timer); rightT = null; }
            }
        };
        canvas.addEventListener('touchend', end, opt); canvas.addEventListener('touchcancel', end, opt);
        window.addEventListener('blur', () => { joyStop(); });
        document.addEventListener('visibilitychange', () => { if (document.hidden) joyStop(); });
    }

    /* ---------- estado da tela: retrato, HUD, tela cheia ---------- */
    function tick() {
        if (!ready) return; const g = inGame(), p = portrait();
        document.body.classList.toggle('m-ingame', g); document.body.classList.toggle('m-portrait', p);
        if (g && p) joyStop();
        if (!g || typeof player === 'undefined' || !player || !player.stats) return;
        const s = player.stats, set = (id, v) => { const e = $(id); if (e && e._v !== v) { e._v = v; if (id.endsWith('t')) e.textContent = v; else e.style.width = v; } };
        set('mh-hp', Math.max(0, Math.min(100, s.hp / s.maxHp * 100)).toFixed(0) + '%'); set('mh-hpt', s.hp + '/' + s.maxHp);
        set('mh-mp', Math.max(0, Math.min(100, s.mp / s.maxMp * 100)).toFixed(0) + '%'); set('mh-mpt', s.mp + '/' + s.maxMp);
        const top = $('m-top'); ['.soc-btn', '.hub-btn'].forEach((sel) => { const hb = document.querySelector(sel); if (hb && top && hb.parentNode !== top) top.insertBefore(hb, $('m-menu')); });
    }
    function init() { if (build()) { setInterval(tick, 250); tick(); window.addEventListener('orientationchange', () => setTimeout(tick, 120)); window.addEventListener('resize', tick); if (window.matchMedia) { try { matchMedia('(orientation: portrait)').addEventListener('change', tick); } catch (e) { } } } }
    Mobile.setDrawer = setDrawer; Mobile.drawer = () => drawerOpen; Mobile.fullscreen = goFullscreen;
    if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => window.addEventListener('load', init)); else window.addEventListener('load', init);
})();
