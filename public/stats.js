/* MiniScape 2D — atributos especiais, correr e energia.
   Atributos (somados de tudo que está equipado + conjuntos + outras fontes registradas):
     crit (% de chance), critDmg (% a mais sobre o 1,5x padrão), moveSpd (% velocidade de movimento, teto +50%), atkSpd (% velocidade de ataque, teto +50%),
     lifesteal (% do dano que cura), luck (% a mais de chance de drop), dr (% de redução de dano sofrido, teto 50%), spellDmg (dano mágico plano), save (% de poupar munição/runas), cdr (% de REDUÇÃO DE RECARGA das habilidades da árvore e de set; teto 40%, recarga mínima 1,5 s).
   Campo de item: `cdr: 5` (amuletos, anéis, chapéus/capuzes, sets via Gear.SETS[...].bonus.cdr, Mímicos...): é somado em Stats.get().cdr, aparece na dica do item e no painel Atributos.
   Outras fontes (pets, montarias, buffs, mímicos...): Stats.addSource('nome', () => ({ crit: 2, moveSpd: 5 })) — a função é chamada a cada leitura (resultado em cache de ~80 ms); Stats.removeSource('nome').
   Correr: Shift (segura) ou tecla R (liga/desliga) ou botão Correr (celular). +45% de velocidade; gasta Energia (0 a 100) enquanto anda correndo; regenera parado/andando.
   Velocidade total (itens + correr) nunca passa de +80%. O servidor não valida deslocamento por sync, então não há limite a ajustar lá. */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const KEYS = ['crit', 'critDmg', 'moveSpd', 'atkSpd', 'lifesteal', 'luck', 'dr', 'spellDmg', 'save', 'cdr'];
    const CAPS = { crit: 75, critDmg: 200, moveSpd: 50, atkSpd: 50, lifesteal: 25, luck: 100, dr: 50, spellDmg: 60, save: 60, cdr: 40 };
    const LABEL = { crit: 'Crítico', critDmg: 'Dano crítico', moveSpd: 'Vel. de movimento', atkSpd: 'Vel. de ataque', lifesteal: 'Roubo de vida', luck: 'Sorte (drops)', dr: 'Redução de dano', spellDmg: 'Dano mágico', save: 'Poupar munição/runas', cdr: 'Redução de recarga' };
    const FMT = { crit: (v) => v + '%', critDmg: (v) => '+' + v + '%', moveSpd: (v) => '+' + v + '%', atkSpd: (v) => '+' + v + '%', lifesteal: (v) => v + '%', luck: (v) => '+' + v + '%', dr: (v) => v + '%', spellDmg: (v) => '+' + v, save: (v) => v + '%', cdr: (v) => '-' + v + '%' };
    const CD_MIN = 1.5;   // recarga mínima (s) de qualquer habilidade
    const SKNAME = { combat: 'Combate', ranged: 'Arquearia', magic: 'Magia' };
    const SLOTS = ['head', 'body', 'weapon', 'shield', 'amulet', 'ring'];
    const RUN_BONUS = 45, TOTAL_CAP = 80, E_MAX = 100, E_DRAIN = 5, E_REGEN_WALK = 3, E_REGEN_IDLE = 7, E_MIN_RESTART = 12;
    const sources = Object.create(null);
    const gameReady = () => typeof player !== 'undefined' && player && player.equipment;
    const setOf = (it) => (window.Gear && Gear.setOf(it)) || (it && it.set) || null;
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    /* ---------- fontes ---------- */
    function equipSource() {
        const o = {}; if (!gameReady()) return o;
        const cnt = {};
        SLOTS.forEach((sl) => {
            const it = player.equipment[sl]; if (!it) return;
            KEYS.forEach((k) => { const v = Number(it[k]); if (v > 0 && isFinite(v)) o[k] = (o[k] || 0) + v; });
            if (['head', 'body', 'weapon', 'shield'].includes(sl)) { const s = setOf(it); if (s) cnt[s] = (cnt[s] || 0) + 1; }
        });
        Object.keys(cnt).forEach((s) => { const S = window.Gear && Gear.SETS[s]; if (S && cnt[s] >= 3) KEYS.forEach((k) => { if (S.bonus[k]) o[k] = (o[k] || 0) + S.bonus[k]; }); });
        return o;
    }
    sources.equip = equipSource;
    function addSource(name, fn) { if (typeof name === 'string' && typeof fn === 'function') { sources[name] = fn; invalidate(); } }
    function removeSource(name) { if (name !== 'equip') { delete sources[name]; invalidate(); } }

    let cache = null, cacheT = 0;
    function invalidate() { cache = null; }
    function get() {
        const n = performance.now(); if (cache && n - cacheT < 80) return cache;
        const t = {}; KEYS.forEach((k) => { t[k] = 0; });
        for (const name of Object.keys(sources)) { let s = null; try { s = sources[name](); } catch (e) { s = null; } if (s) KEYS.forEach((k) => { const v = Number(s[k]); if (v > 0 && isFinite(v)) t[k] += v; }); }
        KEYS.forEach((k) => { t[k] = Math.min(CAPS[k], Math.round(t[k] * 10) / 10); });
        cache = t; cacheT = n; return t;
    }

    /* ---------- combate ---------- */
    const critChance = () => get().crit / 100;
    const critMul = () => 1.5 + get().critDmg / 100;
    // sorteia o crítico: devolve { dmg, crit }. Dano 0 nunca vira crítico.
    let force = null;   // Stats.force('crit'|'none'): vale só para o PRÓXIMO rollAttack (habilidades da árvore: crítico garantido ou sem sorteio)
    function rollAttack(dmg) {
        dmg = Math.max(0, Math.floor(Number(dmg)) || 0); if (dmg <= 0) return { dmg: 0, crit: false };
        if (force) { const f = force; force = null; if (f === 'none') return { dmg, crit: false }; if (f === 'crit') return { dmg: Math.max(dmg + 1, Math.round(dmg * critMul())), crit: true }; }
        if (Math.random() < critChance()) return { dmg: Math.max(dmg + 1, Math.round(dmg * critMul())), crit: true };
        return { dmg, crit: false };
    }
    let lsAcc = 0;
    function lifestealHeal(dmg) {   // devolve quanto curar (acumula frações: 3% de 10 de dano ainda cura de vez em quando)
        const ls = get().lifesteal; if (!(ls > 0) || !(dmg > 0)) return 0;
        lsAcc += dmg * ls / 100; const h = Math.floor(lsAcc); lsAcc -= h; return h;
    }
    function reduce(dmg) {   // redução de dano sofrido, com arredondamento sorteado (dano pequeno também sente)
        const dr = get().dr; if (!(dmg > 0) || !(dr > 0)) return dmg;
        const v = dmg * (1 - dr / 100), f = Math.floor(v); return f + (Math.random() < v - f ? 1 : 0);
    }
    const cd = (base) => Math.max(14, Math.round(base / (1 + get().atkSpd / 100)));   // recarga do ataque (em quadros)
    const luckMul = () => 1 + get().luck / 100;
    const spellDmg = () => Math.floor(get().spellDmg);
    const cdrPct = () => Math.min(CAPS.cdr, get().cdr);   // redução de recarga atual (0..40)
    const cdTime = (base) => { base = Number(base) || 0; return Math.min(base, Math.max(CD_MIN, Math.round(base * (1 - cdrPct() / 100) * 10) / 10)); };   // recarga (s) já com a redução; nunca abaixo de 1,5 s
    const saves = () => Math.random() * 100 < get().save;   // true = não gasta a munição/runa desta vez

    /* ---------- nível mínimo para equipar ---------- */
    function reqOf(it) { const r = it && (it.req || ((typeof itemDB !== 'undefined' && itemDB[it.name]) || {}).req); return r && r.skill && r.lvl > 1 ? r : null; }
    function canEquip(it) {
        const r = reqOf(it); if (!r || !gameReady()) return { ok: true };
        const sk = player.stats && player.stats.skills && player.stats.skills[r.skill], lv = sk ? sk.level : 1;
        return lv >= r.lvl ? { ok: true } : { ok: false, msg: 'Requer ' + (SKNAME[r.skill] || r.skill) + ' nível ' + r.lvl + ' (você tem ' + lv + ').' };
    }

    /* ---------- tooltip ---------- */
    function tipHtml(it) {
        if (!it) return ''; let h = '';
        const col = '#7fd0ff';
        KEYS.forEach((k) => { const v = Number(it[k]); if (v > 0) h += `<div class="tt-stat" style="color:${col}">${esc(LABEL[k])}: ${FMT[k](v)}</div>`; });
        const r = reqOf(it); if (r) { const ok = canEquip(it).ok; h += `<div class="tt-stat" style="color:${ok ? '#9ad39a' : '#ff8a7a'}">Requer ${esc(SKNAME[r.skill] || r.skill)} ${r.lvl}</div>`; }
        const s = setOf(it), S = s && window.Gear && Gear.SETS[s];
        if (S) {
            let n = 0; if (gameReady()) ['head', 'body', 'weapon', 'shield'].forEach((sl) => { if (player.equipment[sl] && setOf(player.equipment[sl]) === s) n++; });
            const b = KEYS.filter((k) => S.bonus[k]).map((k) => LABEL[k] + ' ' + FMT[k](S.bonus[k])).join(', ');
            h += `<div class="tt-stat" style="color:#e8c469">Conjunto ${esc(S.name)} (${n} equipada${n === 1 ? '' : 's'}; bônus com 3+)${b ? ': ' + esc(b) : ''}</div>`;
        }
        return h;
    }

    /* ---------- correr e energia ---------- */
    const E = { running: false, want: false, shift: false, toggle: false, exhausted: false, moved: false, last: 0 };
    function energy() { return gameReady() && typeof player.energy === 'number' && isFinite(player.energy) ? Math.max(0, Math.min(E_MAX, player.energy)) : E_MAX; }
    function setRun(v) { E.toggle = !!v; try { const b = $('m-run'); if (b) b.classList.toggle('on', E.toggle); } catch (e) { } }
    // chamado uma vez por quadro pelo laço do jogo (antes de mover)
    function tick() {
        if (!gameReady()) return;
        const n = performance.now(), dt = Math.min(0.1, E.last ? (n - E.last) / 1000 : 1 / 60); E.last = n;
        if (typeof player.energy !== 'number' || !isFinite(player.energy)) player.energy = E_MAX;
        E.want = E.toggle || E.shift;
        let en = player.energy;
        if (E.moved && E.running) { en -= E_DRAIN * dt; if (en <= 0) { en = 0; E.exhausted = true; try { setActionText('Sem energia! Descanse um pouco para voltar a correr.', '#e67e22'); } catch (e) { } } }
        else en = Math.min(E_MAX, en + (E.moved ? E_REGEN_WALK : E_REGEN_IDLE) * dt);
        if (E.exhausted && en >= E_MIN_RESTART) E.exhausted = false;
        player.energy = en;
        E.running = E.want && !E.exhausted && en > 0;
        E.moved = false;
    }
    // velocidade (px/quadro) deste quadro; moving=true marca que o jogador está se movendo (para gastar/recuperar energia)
    function spd(moving) {
        const base = (gameReady() && player.speed > 0) ? player.speed : 2.5;
        if (moving) E.moved = true;
        const items = Math.min(CAPS.moveSpd, get().moveSpd), bonus = Math.min(TOTAL_CAP, items + (E.running ? RUN_BONUS : 0));
        return base * (1 + bonus / 100);
    }
    const moveBonus = () => Math.min(TOTAL_CAP, Math.min(CAPS.moveSpd, get().moveSpd) + (E.running ? RUN_BONUS : 0));

    /* ---------- barra de energia (só aparece quando importa) e painel ---------- */
    let bar = null, barFill = null, shown = false, lastSig = '';
    function buildBar() {
        if (bar) return; const host = $('game-container'); if (!host) return;
        const st = document.createElement('style');
        st.textContent = '#en-bar{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);width:120px;height:7px;border-radius:5px;background:rgba(0,0,0,.55);border:1px solid rgba(0,0,0,.8);box-shadow:0 0 0 1px rgba(232,196,105,.3);z-index:6;pointer-events:none;opacity:0;transition:opacity .35s}' +
            '#en-bar.on{opacity:.95}#en-bar i{display:block;height:100%;border-radius:5px;background:linear-gradient(#ffe27a,#d99a1e);transition:width .15s}#en-bar.low i{background:linear-gradient(#ff9a6a,#d0451e)}' +
            'html.touch #en-bar{bottom:auto;top:44px;left:8px;transform:none;width:96px}' +
            '#stats-panel{margin-top:10px;font-size:.72rem;color:#cdbf9b;border:1px solid rgba(232,196,105,.25);border-radius:10px;padding:6px 8px;background:rgba(0,0,0,.25)}' +
            '#stats-panel h4{margin:0 0 4px;font-size:.7rem;letter-spacing:1px;color:#e8c469;text-transform:uppercase;font-weight:700}' +
            '#stats-panel .sp-g{display:grid;grid-template-columns:1fr 1fr;gap:1px 10px}#stats-panel .sp-r{display:flex;justify-content:space-between;opacity:.5}#stats-panel .sp-r.on{opacity:1;color:#7fd0ff}#stats-panel .sp-r b{font-weight:700}' +
            '#stats-panel .sp-n{margin-top:5px;font-size:.66rem;opacity:.75}';
        document.head.appendChild(st);
        bar = document.createElement('div'); bar.id = 'en-bar'; bar.innerHTML = '<i></i>'; barFill = bar.firstChild; host.appendChild(bar);
    }
    function renderHud() {
        if (!gameReady()) return; buildBar(); if (!bar) return;
        const e = energy(), vis = e < E_MAX - 0.5 || E.running || E.exhausted;
        const w = Math.round(e) + '%'; if (barFill._w !== w) { barFill._w = w; barFill.style.width = w; }
        bar.classList.toggle('low', e < 25 || E.exhausted); if (vis !== shown) { shown = vis; bar.classList.toggle('on', vis); }
        bar.title = 'Energia ' + Math.round(e) + '/' + E_MAX;
        panel();
    }
    function panel() {
        const tab = $('tab-eq'); if (!tab || !tab.classList.contains('active-tab')) return;
        let p = $('stats-panel'); if (!p) { p = document.createElement('div'); p.id = 'stats-panel'; tab.appendChild(p); }
        const t = get(), mb = moveBonus(), sig = KEYS.map((k) => t[k]).join(',') + '|' + Math.round(mb) + '|' + Math.round(energy()) + '|' + (E.toggle ? 1 : 0);
        if (sig === lastSig && p.isConnected) return; lastSig = sig;
        const rows = KEYS.map((k) => {
            let v = t[k], on = v > 0, txt = FMT[k](v);
            if (k === 'moveSpd') { v = Math.min(CAPS.moveSpd, v); txt = '+' + v + '%'; }
            if (k === 'critDmg') txt = 'x' + (1.5 + v / 100).toFixed(2).replace('.', ',');
            return `<div class="sp-r ${on ? 'on' : ''}"><span>${esc(LABEL[k])}</span><b>${on || k === 'critDmg' ? txt : '-'}</b></div>`;
        }).join('');
        p.innerHTML = `<h4>Atributos</h4><div class="sp-g">${rows}</div><div class="sp-n">Energia ${Math.round(energy())}/${E_MAX} · Correr: segure Shift ou tecle R (${E.toggle ? 'ligado' : 'desligado'}) · +${RUN_BONUS}% de velocidade</div>`;
    }

    /* ---------- teclado ---------- */
    function inField(e) { const t = e.target && e.target.tagName; return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT'; }
    document.addEventListener('keydown', (e) => {
        if (inField(e)) return; if (e.key === 'Shift') E.shift = true;
        else if ((e.key === 'r' || e.key === 'R') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && gameReady() && $('game-wrapper') && $('game-wrapper').style.display !== 'none') {
            setRun(!E.toggle); try { setActionText(E.toggle ? 'Correr: ligado' : 'Correr: desligado', '#f1c40f'); } catch (er) { }
        }
    });
    document.addEventListener('keyup', (e) => { if (e.key === 'Shift') E.shift = false; });
    window.addEventListener('blur', () => { E.shift = false; });
    document.addEventListener('visibilitychange', () => { if (document.hidden) E.shift = false; });
    setInterval(renderHud, 250);

    window.Stats = { force: (m) => { force = m || null; }, KEYS, CAPS, LABEL, addSource, removeSource, hasSource: (n) => !!sources[n], invalidate, get, critChance, critMul, rollAttack, lifestealHeal, reduce, cd, luckMul, spellDmg, saves, cdrPct, cdTime, CD_MIN, reqOf, canEquip, tipHtml, tick, spd, moveBonus, energy, setRun, isRunToggled: () => E.toggle,
        get running() { return E.running; }, get exhausted() { return E.exhausted; }, E_MAX, RUN_BONUS, TOTAL_CAP, state: () => ({ running: E.running, want: E.want, exhausted: E.exhausted, toggle: E.toggle, shift: E.shift, energy: energy() }), _setShift: (v) => { E.shift = !!v; } };
})();
