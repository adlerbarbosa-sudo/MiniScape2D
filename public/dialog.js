/* Janelas do próprio jogo no lugar dos avisos do navegador (alert/confirm). window.gameConfirm(msg, {ok,cancel,danger}) -> Promise<boolean>; window.gameAlert(msg) -> Promise. */
(function () {
    let box = null, queue = [], cur = null;
    function build() {
        if (box) return;
        const st = document.createElement('style'); st.textContent = '#gdlg{position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;background:rgba(6,3,2,.62)}#gdlg .gb{width:min(380px,92vw);background:linear-gradient(#3a2a1e,#241810);border:2px solid #c9a24a;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.7);color:#f0e2bd;font-family:Georgia,serif;overflow:hidden}#gdlg .gt{padding:8px 14px;background:linear-gradient(#5a3f26,#3a2a1a);border-bottom:1px solid #8a6a34;font-weight:700;letter-spacing:.5px;font-size:14px}#gdlg .gm{padding:16px 16px 6px;font-size:14px;line-height:1.45;white-space:pre-wrap}#gdlg .gr{display:flex;gap:10px;justify-content:flex-end;padding:12px 14px 14px}#gdlg button{font:700 13px Georgia,serif;padding:7px 18px;border-radius:8px;cursor:pointer;border:1px solid #8a6a34;background:#2a1c12;color:#f0e2bd}#gdlg button.ok{background:linear-gradient(#d9a93a,#a8741a);color:#2a1a08;border-color:#f0d27a}#gdlg button.danger{background:linear-gradient(#c0453a,#8a2218);color:#fff;border-color:#ff9a8a}#gdlg button:focus{outline:2px solid #fff3b0}';
        document.head.appendChild(st);
        box = document.createElement('div'); box.id = 'gdlg'; box.innerHTML = '<div class="gb" role="dialog" aria-modal="true"><div class="gt" id="gdlg-t"></div><div class="gm" id="gdlg-m"></div><div class="gr" id="gdlg-r"></div></div>'; document.body.appendChild(box);
        document.addEventListener('keydown', (e) => { if (!cur) return; if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); } }, true);
    }
    function done(v) { if (!cur) return; const c = cur; cur = null; box.style.display = 'none'; c.res(v); next(); }
    function next() {
        if (cur || !queue.length) return; build(); cur = queue.shift();
        document.getElementById('gdlg-t').textContent = cur.title; document.getElementById('gdlg-m').textContent = cur.msg;
        const r = document.getElementById('gdlg-r'); r.innerHTML = '';
        if (cur.cancel) { const c = document.createElement('button'); c.textContent = cur.cancel; c.onclick = () => done(false); r.appendChild(c); }
        const o = document.createElement('button'); o.textContent = cur.ok; o.className = cur.danger ? 'danger' : 'ok'; o.onclick = () => done(true); r.appendChild(o);
        box.style.display = 'flex'; setTimeout(() => { try { o.focus(); } catch (e) { } }, 30);
    }
    window.gameConfirm = (msg, o) => { o = o || {}; return new Promise((res) => { queue.push({ msg: String(msg), title: o.title || 'Confirmar', ok: o.ok || 'OK', cancel: o.cancel || 'Cancelar', danger: !!o.danger, res }); next(); }); };
    window.gameAlert = (msg, o) => { o = o || {}; return new Promise((res) => { queue.push({ msg: String(msg), title: o.title || 'Aviso', ok: o.ok || 'OK', cancel: null, res }); next(); }); };
    window.alert = (m) => { window.gameAlert(m); };   // alert() do navegador nunca mais aparece
})();
