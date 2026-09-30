/* MiniScape 2D — criação e edição de aparência do personagem.
   Chargen.open({ mode: 'create' | 'edit', name, look, cls, onConfirm(res) -> (Promise de) mensagem de erro | null, onBack() })
   res = { name, look: {sex, race, hairStyle, hair, skin, shirt, pants, beard}, cls }
   A prévia usa Art.drawLook. Nada aqui mexe em regras do jogo: quem chama aplica o resultado. */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const NAME_RE = /^[\p{L}\p{N}_.\- ]{2,20}$/u;
    const NAME_ERR = 'Nome inválido (2 a 20 letras, números, espaço, _ . -).';
    const RACES = [
        { id: 'human', name: 'Humano', desc: '+5% de XP em todas as habilidades.' },
        { id: 'elf', name: 'Elfo', desc: '+4 de mana máxima. Alto e esguio.' },
        { id: 'dwarf', name: 'Anão', desc: '+4 de vida máxima. Baixo e robusto.' },
        { id: 'orc', name: 'Orc', desc: '+2 de vida máxima, −2 de mana máxima.' }
    ];
    const CLASSES = [
        { id: 'warrior', name: 'Guerreiro', desc: 'Espada e escudo. +3 de vida máxima.', wpn: 'sword', shield: true },
        { id: 'archer', name: 'Arqueiro', desc: 'Arco curto e 50 flechas. Ataca de longe.', wpn: 'bow' },
        { id: 'mage', name: 'Mago', desc: 'Cajado e runas de Ar e Mente. +8 de mana máxima.', wpn: 'staff' }
    ];
    const VIEWS = [['front', 'Frente'], ['side', 'Lado'], ['back', 'Costas']];
    const CSS = `
#cg-overlay{position:fixed;inset:0;z-index:20500;display:none;align-items:center;justify-content:center;padding:10px;background:rgba(4,6,14,.84);backdrop-filter:blur(3px);font-family:var(--sans,'Trebuchet MS',sans-serif)}
#cg-overlay.on{display:flex}
#cg-overlay *{box-sizing:border-box}
.cg-box{position:relative;width:min(780px,100%);max-height:100%;overflow-y:auto;overflow-x:hidden;padding:16px 18px 14px;border-radius:16px;color:var(--text,#eadfc4);background:linear-gradient(rgba(46,31,18,.97),rgba(24,15,8,.98));border:3px solid var(--gold-0,#8a6420);box-shadow:0 0 0 2px #000,0 0 0 4px var(--wood-4,#54391f),0 20px 60px rgba(0,0,0,.8),inset 0 0 0 1px rgba(255,224,140,.25)}
.cg-title{margin:0 0 10px;text-align:center;font-family:var(--serif,Georgia,serif);font-size:1.35rem;letter-spacing:2px;font-weight:700;background:linear-gradient(#fff3c4,#f0c14a 55%,#a8741a);-webkit-background-clip:text;background-clip:text;color:transparent}
.cg-grid{display:grid;grid-template-columns:230px minmax(0,1fr);gap:16px;align-items:start}
.cg-prev{display:flex;flex-direction:column;align-items:center;gap:8px}
.cg-prev canvas{width:100%;max-width:230px;aspect-ratio:240/260;border-radius:12px;border:2px solid var(--gold-0,#8a6420);background:#20301f;box-shadow:inset 0 0 18px rgba(0,0,0,.6)}
.cg-views{display:flex;gap:6px;width:100%;max-width:230px}
.cg-row{margin-bottom:9px}
.cg-lab{display:block;margin:0 0 4px;font-family:var(--serif,Georgia,serif);font-size:.66rem;letter-spacing:1.4px;text-transform:uppercase;color:var(--gold-1,#c79a3a)}
.cg-seg{display:flex;gap:6px;flex-wrap:wrap}
.cg-btn{flex:1 1 0;min-width:0;padding:7px 8px;border-radius:9px;border:1px solid #000;cursor:pointer;font:700 .8rem var(--sans,sans-serif);color:var(--text,#eadfc4);background:linear-gradient(#4a3420,#2c1d10);box-shadow:inset 0 1px 0 rgba(255,235,170,.2),inset 0 -2px 0 rgba(0,0,0,.4)}
.cg-btn:hover{filter:brightness(1.12)}
.cg-btn.on{color:#24170c;background:linear-gradient(#f0cf7c,#c99a3c);text-shadow:none}
.cg-desc{margin:4px 0 0;font-size:.74rem;line-height:1.3;color:var(--muted,#a89a7c);min-height:1.3em}
.cg-input{width:100%;padding:9px 11px;background:rgba(0,0,0,.55);border:1px solid rgba(232,196,105,.35);color:#fff;border-radius:9px;font-size:.92rem;font-family:inherit;outline:none}
.cg-input:focus{border-color:var(--gold-2,#e8c469);box-shadow:0 0 0 3px rgba(232,196,105,.2)}
.cg-hair{display:flex;align-items:center;gap:6px}
.cg-hair .cg-btn{flex:0 0 38px;padding:6px 0}
.cg-hname{flex:1;text-align:center;font-weight:700;font-size:.84rem}
.cg-sw{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.cg-sw i{display:block;width:26px;height:26px;border-radius:50%;cursor:pointer;border:2px solid rgba(0,0,0,.7);box-shadow:inset 0 0 0 1px rgba(255,255,255,.22);position:relative}
.cg-sw i.on{border-color:#fbe6a6;box-shadow:0 0 0 2px #c79a3a,inset 0 0 0 1px rgba(255,255,255,.3)}
.cg-sw i.cl{border-radius:8px;overflow:hidden}
.cg-sw i.cl b{position:absolute;left:0;right:0;bottom:0;height:40%}
.cg-foot{position:sticky;bottom:-14px;margin:0 -18px -14px;padding:6px 18px 14px;background:linear-gradient(rgba(24,15,8,0),rgba(24,15,8,.97) 16px)}
.cg-err{min-height:18px;margin:2px 0 6px;color:#ff9a8c;font-size:.82rem;font-weight:700;text-align:center}
.cg-act{display:flex;gap:10px;margin-top:4px}
.cg-act .cg-btn{padding:11px 8px;font-size:.95rem;border-radius:999px;font-family:var(--serif,Georgia,serif);letter-spacing:.6px}
.cg-act .cg-ok{flex:2;color:#24170c;background:linear-gradient(#f0cf7c,#c99a3c)}
.cg-act .cg-ok[disabled]{opacity:.6;cursor:wait}
@media (max-width:640px){
 .cg-box{padding:12px 12px 10px}
 .cg-grid{grid-template-columns:minmax(0,1fr);gap:8px}
 .cg-prev canvas{max-width:150px}
 .cg-foot{margin:0 -12px -10px;padding:6px 12px 10px;bottom:-10px}
 .cg-row{margin-bottom:6px}
 .cg-sw i{width:24px;height:24px}
 #cg-beard{flex:0 0 auto;padding:5px 14px}
 .cg-btn{padding:6px 6px}
 .cg-views{max-width:260px}
 .cg-title{font-size:1.15rem;margin-bottom:6px}
}`;
    let built = false, st = null, opts = null, raf = 0, view = 'front', busy = false;

    function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
    function build() {
        if (built) return; built = true;
        const css = document.createElement('style'); css.textContent = CSS; document.head.appendChild(css);
        const ov = el('div'); ov.id = 'cg-overlay';
        ov.innerHTML = `<div class="cg-box" role="dialog" aria-modal="true" aria-label="Criação de personagem">
  <h2 class="cg-title" id="cg-title">Crie seu aventureiro</h2>
  <div class="cg-grid">
    <div class="cg-prev"><canvas id="cg-canvas" width="240" height="260"></canvas><div class="cg-views" id="cg-views"></div></div>
    <div class="cg-form">
      <div class="cg-row" id="cg-r-name"><label class="cg-lab" for="cg-name">Nick</label><input class="cg-input" id="cg-name" maxlength="20" autocomplete="off" spellcheck="false"></div>
      <div class="cg-row"><span class="cg-lab">Sexo</span><div class="cg-seg" id="cg-sex"></div></div>
      <div class="cg-row"><span class="cg-lab">Raça</span><div class="cg-seg" id="cg-race"></div><p class="cg-desc" id="cg-race-d"></p></div>
      <div class="cg-row" id="cg-r-cls"><span class="cg-lab">Classe</span><div class="cg-seg" id="cg-cls"></div><p class="cg-desc" id="cg-cls-d"></p></div>
      <div class="cg-row"><span class="cg-lab">Cabelo</span><div class="cg-hair"><button type="button" class="cg-btn" id="cg-hp" aria-label="Cabelo anterior">◀</button><div class="cg-hname" id="cg-hn"></div><button type="button" class="cg-btn" id="cg-hnx" aria-label="Próximo cabelo">▶</button></div><div class="cg-sw" id="cg-hair"></div></div>
      <div class="cg-row" id="cg-r-beard"><div class="cg-seg"><button type="button" class="cg-btn" id="cg-beard"></button></div></div>
      <div class="cg-row"><span class="cg-lab">Cor da pele</span><div class="cg-sw" id="cg-skin"></div></div>
      <div class="cg-row"><span class="cg-lab">Cor da roupa</span><div class="cg-sw" id="cg-cloth"></div></div>
    </div>
  </div>
  <div class="cg-foot"><div class="cg-err" id="cg-err" role="alert"></div>
  <div class="cg-act"><button type="button" class="cg-btn" id="cg-back">Voltar</button><button type="button" class="cg-btn cg-ok" id="cg-ok">Criar aventureiro</button></div></div>
</div>`;
        document.body.appendChild(ov);
        // botões de vista
        VIEWS.forEach(v => { const b = el('button', 'cg-btn', v[1]); b.type = 'button'; b.dataset.v = v[0]; b.onclick = () => { view = v[0]; refresh(); }; $('cg-views').appendChild(b); });
        $('cg-sex').append(...[['m', 'Masculino'], ['f', 'Feminino']].map(s => { const b = el('button', 'cg-btn', s[1]); b.type = 'button'; b.dataset.k = s[0]; b.onclick = () => { st.sex = s[0]; if (s[0] === 'f') st.beard = 0; else if (st.race === 'dwarf') st.beard = 1; refresh(); }; return b; }));
        $('cg-race').append(...RACES.map(r => { const b = el('button', 'cg-btn', r.name); b.type = 'button'; b.dataset.k = r.id; b.onclick = () => setRace(r.id); return b; }));
        $('cg-cls').append(...CLASSES.map(c => { const b = el('button', 'cg-btn', c.name); b.type = 'button'; b.dataset.k = c.id; b.onclick = () => { st.cls = c.id; refresh(); }; return b; }));
        $('cg-hp').onclick = () => { st.hairStyle = (st.hairStyle + 7) % 8; refresh(); };
        $('cg-hnx').onclick = () => { st.hairStyle = (st.hairStyle + 1) % 8; refresh(); };
        $('cg-beard').onclick = () => { st.beard = st.beard ? 0 : 1; refresh(); };
        swatches('cg-hair', Art.PAL.hair.map(c => ({ c })), (i) => { st.hair = Art.PAL.hair[i]; refresh(); });
        $('cg-back').onclick = () => { if (busy) return; const cb = opts && opts.onBack; close(); if (cb) cb(); };
        $('cg-ok').onclick = confirm;
        $('cg-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } });
        ov.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') $('cg-back').click(); });
        ov.addEventListener('mousedown', (e) => { e.stopPropagation(); }); ov.addEventListener('keyup', (e) => e.stopPropagation());
    }
    function swatches(id, list, onPick, cloth) {
        const box = $(id); box.innerHTML = '';
        list.forEach((it, i) => { const s = el('i', cloth ? 'cl' : ''); s.style.background = it.c; if (cloth) { const b = document.createElement('b'); b.style.background = it.p; s.appendChild(b); } s.setAttribute('role', 'button'); s.tabIndex = 0; s.dataset.c = it.c; s.dataset.i = i; s.onclick = () => onPick(i); s.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(i); } }; box.appendChild(s); });
    }
    function setRace(r) {
        st.race = r; const sk = Art.PAL.skin[r]; if (sk.indexOf(st.skin) < 0) st.skin = sk[Math.min(1, sk.length - 1)];
        st.beard = (r === 'dwarf' && st.sex === 'm') ? 1 : 0; refresh();
    }
    function mark(box, key, val) { box.querySelectorAll('[data-' + key + ']').forEach(b => b.classList.toggle('on', b.dataset[key] === val)); }
    function refresh() {
        if (!built || !st) return;
        mark($('cg-sex'), 'k', st.sex); mark($('cg-race'), 'k', st.race); mark($('cg-cls'), 'k', st.cls); mark($('cg-views'), 'v', view);
        const r = RACES.find(x => x.id === st.race), c = CLASSES.find(x => x.id === st.cls);
        $('cg-race-d').textContent = r ? r.desc : ''; $('cg-cls-d').textContent = c ? c.desc : '';
        $('cg-hn').textContent = Art.HAIR_NAMES[st.hairStyle] + '  (' + (st.hairStyle + 1) + '/8)';
        swatches('cg-skin', Art.PAL.skin[st.race].map(c => ({ c })), (i) => { st.skin = Art.PAL.skin[st.race][i]; refresh(); });
        swatches('cg-cloth', Art.PAL.cloth.map(p => ({ c: p[0], p: p[1] })), (i) => { st.shirt = Art.PAL.cloth[i][0]; st.pants = Art.PAL.cloth[i][1]; refresh(); }, true);
        $('cg-hair').querySelectorAll('i').forEach(s => s.classList.toggle('on', s.dataset.c === st.hair));
        $('cg-skin').querySelectorAll('i').forEach(s => s.classList.toggle('on', s.dataset.c === st.skin));
        $('cg-cloth').querySelectorAll('i').forEach(s => s.classList.toggle('on', s.dataset.c === st.shirt));
        $('cg-r-beard').style.display = st.sex === 'm' ? '' : 'none'; $('cg-beard').textContent = 'Barba: ' + (st.beard ? 'sim' : 'não'); $('cg-beard').classList.toggle('on', !!st.beard);
    }
    function lookOf() { return { sex: st.sex, race: st.race, hairStyle: st.hairStyle, hair: st.hair, skin: st.skin, shirt: st.shirt, pants: st.pants, beard: st.sex === 'm' && st.beard ? 1 : 0 }; }
    function setErr(t) { $('cg-err').textContent = t || ''; }
    async function confirm() {
        if (busy || !st) return; setErr('');
        let name = opts.mode === 'create' ? $('cg-name').value.trim() : '';
        if (opts.mode === 'create' && !NAME_RE.test(name)) { setErr(NAME_ERR); $('cg-name').focus(); return; }
        busy = true; const ok = $('cg-ok'), old = ok.textContent; ok.disabled = true; ok.textContent = 'Aguarde...';
        let err = null;
        try { err = opts.onConfirm ? await opts.onConfirm({ name, look: lookOf(), cls: st.cls }) : null; } catch (e) { err = 'Algo deu errado. Tente de novo.'; console.error(e); }
        busy = false; ok.disabled = false; ok.textContent = old;
        if (err) { setErr(String(err)); return; }
        close();
    }
    function draw() {
        raf = 0; const ov = $('cg-overlay'); if (!ov || !ov.classList.contains('on')) return;
        const cv = $('cg-canvas'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
        g.clearRect(0, 0, W, H);
        const bg = g.createRadialGradient(W / 2, H * 0.62, 10, W / 2, H * 0.62, W * 0.75); bg.addColorStop(0, '#3f5a33'); bg.addColorStop(1, '#16220f'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(W / 2, H - 26, W * 0.34, 13, 0, 0, Math.PI * 2); g.fill();
        const cls = CLASSES.find(x => x.id === st.cls) || {};
        try { Art.drawLook(g, W / 2, H - 28, lookOf(), view, { scale: 4.2, t: performance.now() / 1000, weapon: cls.wpn, shield: !!cls.shield }); } catch (e) { console.error(e); }
        raf = requestAnimationFrame(draw);
    }
    function close() {
        const ov = $('cg-overlay'); if (ov) ov.classList.remove('on'); if (raf) { cancelAnimationFrame(raf); raf = 0; } st = null; opts = null;
    }
    function open(o) {
        build(); opts = o || {}; busy = false; view = 'front';
        const src = Art.cleanLook(o.look) || Art.defaultLook();
        const isEdit = opts.mode === 'edit';
        st = { sex: src.sex, race: src.race, hairStyle: src.hairStyle, hair: src.hair, skin: src.skin, shirt: src.shirt, pants: src.pants, beard: src.beard ? 1 : 0, cls: o.cls || 'warrior' };
        if (!isEdit && !o.look) { st.skin = Art.PAL.skin.human[1]; }
        $('cg-title').textContent = isEdit ? 'Mudar aparência' : 'Crie seu aventureiro';
        $('cg-r-name').style.display = isEdit ? 'none' : ''; $('cg-r-cls').style.display = isEdit ? 'none' : '';
        $('cg-name').value = o.name || ''; $('cg-ok').textContent = isEdit ? 'Salvar aparência' : 'Criar aventureiro'; $('cg-back').textContent = isEdit ? 'Cancelar' : 'Voltar';
        setErr(o.error || '');
        refresh(); $('cg-overlay').classList.add('on');
        if (!raf) raf = requestAnimationFrame(draw);
        setTimeout(() => { try { if (!isEdit) $('cg-name').focus(); else $('cg-ok').focus(); } catch (e) { } }, 30);
    }
    function isOpen() { const ov = $('cg-overlay'); return !!ov && ov.classList.contains('on'); }

    /* botão "Mudar aparência" no Menu (gratuito; não troca classe nem itens) */
    function openAppearance() {
        if (typeof player === 'undefined' || !player) return;
        open({ mode: 'edit', look: player.look, cls: player.cls, onConfirm: async (res) => {
            const lk = Art.cleanLook(res.look); if (!lk) return 'Aparência inválida.';
            player.look = lk; try { saveDataLogic(true); } catch (e) { }
            try { setActionText('Aparência atualizada!', '#2ecc71'); } catch (e) { }
            return null;
        } });
    }
    function injectMenuButton() {
        const cfg = $('tab-cfg'); if (!cfg || $('btn-look')) return;
        const b = document.createElement('button'); b.id = 'btn-look'; b.type = 'button'; b.className = 'dev-save-btn'; b.style.cssText = 'background:linear-gradient(#5a3f22,#33220f);margin-top:8px'; b.textContent = 'Mudar aparência'; b.onclick = openAppearance;
        const first = cfg.querySelector('button'); if (first && first.nextSibling) cfg.insertBefore(b, first.nextSibling); else cfg.appendChild(b);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectMenuButton); else injectMenuButton();
    window.Chargen = { open, close, isOpen, openAppearance, NAME_RE, NAME_ERR, RACES, CLASSES };
})();
