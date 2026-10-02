/* MiniScape 2D — vida no mundo: conquistas e títulos, missões diárias, chefe de mundo, pesca por clima/hora e emotes.
   Tudo fica no personagem (player.ach, player.daily, player.cnt, player.title). O chefe tem horário fixo definido pelo servidor. */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const NOW = () => Date.now();
    const sfx = (n) => { try { window.Sfx && Sfx.play(n); } catch (e) { } };
    const ok = () => typeof player !== 'undefined' && player && player.stats && typeof currentUser !== 'undefined' && currentUser;

    /* ---------- itens e criatura novos (entram pelo catálogo, que o jogo já mescla) ---------- */
    const NEW_ITEMS = {
        'Raw Salmon': { name: 'Raw Salmon', icon: '🐟', type: 'resource', stackable: true, weight: 0.6, desc: 'Salmão pescado na chuva.', cooksInto: 'Cooked Salmon', cookXp: 34, value: 30 },
        'Cooked Salmon': { name: 'Cooked Salmon', icon: '🍣', type: 'consumable', heal: 14, stackable: true, weight: 0.5, desc: 'Recupera bastante vida.', value: 40 },
        'Raw Eel': { name: 'Raw Eel', icon: '🐍', type: 'resource', stackable: true, weight: 0.6, desc: 'Enguia escorregadia. Só aparece na neblina.', cooksInto: 'Cooked Eel', cookXp: 44, value: 45 },
        'Cooked Eel': { name: 'Cooked Eel', icon: '🍣', type: 'consumable', heal: 17, stackable: true, weight: 0.5, desc: 'Enguia grelhada.', value: 60 },
        'Raw Moonfish': { name: 'Raw Moonfish', icon: '🐟', type: 'resource', stackable: true, weight: 0.5, desc: 'Peixe raro que brilha. Só morde à noite.', cooksInto: 'Cooked Moonfish', cookXp: 60, value: 90 },
        'Cooked Moonfish': { name: 'Cooked Moonfish', icon: '🍣', type: 'consumable', heal: 24, stackable: true, weight: 0.5, desc: 'Cura muitíssimo.', value: 130 },
        'Raw Golden Koi': { name: 'Raw Golden Koi', icon: '🐠', type: 'resource', stackable: true, weight: 0.5, desc: 'Carpa dourada, rara. Aparece em dias claros.', cooksInto: 'Cooked Golden Koi', cookXp: 80, value: 160 },
        'Cooked Golden Koi': { name: 'Cooked Golden Koi', icon: '🍣', type: 'consumable', heal: 32, stackable: true, weight: 0.5, desc: 'Um banquete dourado.', value: 220 },
        'Colossus Core': { name: 'Colossus Core', icon: '💎', type: 'resource', stackable: true, weight: 1.5, desc: 'Coração do Colosso de Pedra. Vale uma fortuna.', value: 700 }
    };
    const BOSS = { name: 'Colosso de Pedra', group: 'chefe', species: 'golem', behavior: 'neutral', range: 220, speed: 0.6, w: 100, h: 110, hp: 1800, maxHit: 18, xp: 0, c1: '#7b8794', c2: '#ff9d3a', lootStr: '', dialog: '', shopStr: '', desc: 'Um colosso ancestral que desperta a cada hora. Chame os amigos!' };
    try { if (window.CATALOG) { Object.assign(CATALOG.ITEMS, NEW_ITEMS); CATALOG.CREATURES.wboss_golem = BOSS; } } catch (e) { }

    /* ---------- contadores ---------- */
    const P = () => { if (!player.cnt || typeof player.cnt !== 'object') player.cnt = {}; return player.cnt; };
    function cnt(k, n) { const c = P(); c[k] = (c[k] || 0) + (n || 1); }
    const lvl = (s) => (player.stats.skills[s] || {}).level | 0;
    const kills = (k) => (player.bestiary && player.bestiary[k]) | 0;
    const totalKills = () => { let n = 0; if (player.bestiary) for (const k in player.bestiary) n += player.bestiary[k] | 0; return n; };
    const species = () => { let n = 0; if (player.bestiary) for (const k in player.bestiary) if (player.bestiary[k] > 0) n++; return n; };
    const questsDone = () => { try { return Quests.QUESTS.filter((q) => Quests.done(q.id)).length; } catch (e) { return 0; } };
    const coinsNow = () => { const f = (a) => (a || []).reduce((s, i) => s + (i.name === 'Coins' ? (i.qty || 1) : 0), 0); return f(player.inventory) + f(player.bank); };

    /* ---------- conquistas ---------- */
    const A = [];
    const ach = (id, name, title, desc, cur, need, reward) => A.push({ id, name, title, desc, cur, need, reward: reward || 100 });
    [['woodcutting', 'Lenhador', 10, 'Lenhador Mestre', 30], ['mining', 'Minerador', 10, 'Mestre das Minas', 30], ['fishing', 'Pescador', 10, 'Pescador Mestre', 30]].forEach(([s, t1, n1, t2, n2]) => {
        const nm = (player0) => s;
        ach('a_' + s + '1', t1, t1, `Chegue ao nível ${n1} de ${s === 'woodcutting' ? 'Corte de Lenha' : s === 'mining' ? 'Mineração' : 'Pesca'}.`, () => lvl(s), n1, 120);
        ach('a_' + s + '2', t2, t2, `Chegue ao nível ${n2} de ${s === 'woodcutting' ? 'Corte de Lenha' : s === 'mining' ? 'Mineração' : 'Pesca'}.`, () => lvl(s), n2, 500);
    });
    ach('a_cook', 'Cozinheiro', 'Cozinheiro', 'Chegue ao nível 15 de Culinária.', () => lvl('cooking'), 15, 150);
    ach('a_smith', 'Ferreiro', 'Ferreiro', 'Chegue ao nível 20 de Ferraria.', () => lvl('smithing'), 20, 200);
    ach('a_farm', 'Fazendeiro', 'Fazendeiro', 'Chegue ao nível 15 de Agricultura.', () => lvl('farming'), 15, 150);
    ach('a_alch', 'Alquimista', 'Alquimista', 'Chegue ao nível 15 de Alquimia.', () => lvl('alchemy'), 15, 200);
    ach('a_ench', 'Encantador', 'Encantador', 'Chegue ao nível 15 de Encantamento.', () => lvl('enchanting'), 15, 250);
    ach('a_cmb1', 'Guerreiro', 'Guerreiro', 'Chegue ao nível 20 de Combate.', () => lvl('combat'), 20, 200);
    ach('a_cmb2', 'Campeão', 'Campeão', 'Chegue ao nível 40 de Combate.', () => lvl('combat'), 40, 800);
    ach('a_k100', 'Caçador', 'Caçador', 'Derrote 100 criaturas.', totalKills, 100, 200);
    ach('a_k1000', 'Matador', 'Matador', 'Derrote 1000 criaturas.', totalKills, 1000, 1000);
    ach('a_nat', 'Naturalista', 'Naturalista', 'Derrote 12 espécies diferentes (Bestiário).', species, 12, 300);
    ach('a_drag', 'Matador de Dragões', 'Matador de Dragões', 'Derrote o Dragão Ancestral.', () => kills('dragon_boss'), 1, 600);
    ach('a_lich', 'Coveiro Real', 'Coveiro Real', 'Destrua o Lich Rei Ossian.', () => kills('lich_boss'), 1, 1000);
    ach('a_wb1', 'Quebra-Golem', 'Quebra-Golem', 'Ajude a derrotar o Colosso de Pedra.', () => P().wboss | 0, 1, 500);
    ach('a_wb2', 'Terror dos Colossos', 'Terror dos Colossos', 'Ajude a derrotar o Colosso 10 vezes.', () => P().wboss | 0, 10, 2000);
    ach('a_q5', 'Herói da Vila', 'Herói da Vila', 'Conclua 5 missões de NPC.', questsDone, 5, 250);
    ach('a_q15', 'Lenda Local', 'Lenda Local', 'Conclua 15 missões de NPC.', questsDone, 15, 1000);
    ach('a_rich', 'Abastado', 'Abastado', 'Tenha 10.000 moedas de uma vez.', coinsNow, 10000, 300);
    ach('a_house', 'Dono de Casa', 'Dono de Casa', 'Coloque 5 móveis na sua casa.', () => (player.house && player.house.items ? player.house.items.length : 0), 5, 200);
    ach('a_daily', 'Dedicado', 'Dedicado', 'Conclua 10 missões diárias.', () => P().daily | 0, 10, 300);
    ach('a_streak', 'Constante', 'Constante', 'Complete todas as diárias por 7 dias seguidos.', () => (player.daily && player.daily.best) | 0, 7, 800);
    ach('a_sell', 'Comerciante', 'Comerciante', 'Venda 5 itens no mercado.', () => P().sold | 0, 5, 300);
    ach('a_rare', 'Sortudo', 'Sortudo', 'Pesque um peixe raro.', () => P().rarefish | 0, 1, 250);
    ach('a_dead', 'Teimoso', 'Teimoso', 'Seja derrotado 10 vezes. Ninguém disse que era fácil.', () => P().deaths | 0, 10, 100);

    function checkAch() {
        if (!ok()) return; if (!player.ach || typeof player.ach !== 'object') player.ach = {};
        for (const a of A) {
            if (player.ach[a.id]) continue; let c = 0; try { c = a.cur(); } catch (e) { }
            if (c >= a.need) {
                player.ach[a.id] = NOW(); sfx('quest');
                try { setActionText('Conquista: ' + a.name + '!', '#e8c469'); addFloatingText(player.x, player.y - 46, 'Conquista!', '#e8c469'); Art.burst(player.x, player.y - 12, '#e8c469', 18, 1.6); } catch (e) { }
                if (a.reward) { if (!addInvItem('Coins', a.reward)) { try { const m = gameMaps[currentMap]; m.entities.push({ id: newEntId(), type: 'ground_item', item: 'Coins', qty: a.reward, x: player.x, y: player.y, w: 20, h: 20, active: true, life: 6000 }); } catch (e) { } } }
                if (!player.title) player.title = a.title;
                try { saveDataLogic(); updateUI(); } catch (e) { }
                if (window.Hub) Hub.refresh();
            }
        }
    }

    /* ---------- missões diárias ---------- */
    const dayKey = (d) => { d = d || new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
    const yesterdayKey = () => dayKey(new Date(Date.now() - 86400000));
    function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
    function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    const SK = { woodcutting: ['Corte ', 'ações de corte de lenha'], mining: ['Minere ', 'vezes'], fishing: ['Pesque ', 'vezes'], cooking: ['Cozinhe ', 'itens'], smithing: ['Funda ', 'barras'], farming: ['Colha ', 'plantações'], crafting: ['Fabrique ', 'itens'], alchemy: ['Prepare ', 'poções'] };
    const MOBS = ['goblin_base', 'slime_base', 'wolf_base', 'orc_base', 'spider_base', 'cow_base', 'boar_base', 'skeleton_knight'];
    function tier() { const t = lvl('combat') + lvl('woodcutting') + lvl('mining') + lvl('fishing'); return t < 40 ? 0 : t < 100 ? 1 : 2; }
    function genDaily() {
        const r = rng(hash(currentUser + '|' + dayKey())), t = tier(), out = [];
        const mobs = MOBS.filter((k) => npcDB[k] && npcDB[k].hp > 0); const skills = Object.keys(SK).filter((s) => player.stats.skills[s]);
        const pick = (arr) => arr[Math.floor(r() * arr.length)];
        if (r() < 0.5 || !mobs.length) out.push({ k: 'kill', need: [6, 12, 20][t], p: 0 }); else out.push({ k: 'mob', mob: pick(mobs), need: [4, 8, 14][t], p: 0 });
        const used = new Set(); while (out.length < 3 && used.size < skills.length) { const s = pick(skills); if (used.has(s)) continue; used.add(s); out.push({ k: 'skill', skill: s, need: [6, 12, 20][t] + (s === 'smithing' || s === 'alchemy' ? -2 : 0), p: 0 }); }
        out.forEach((q) => { q.coins = 40 + t * 45 + Math.floor(r() * 25); q.xp = 60 + t * 90; q.done = false; q.claimed = false; });
        return out;
    }
    function daily() {
        if (!ok()) return null; const key = dayKey();
        if (!player.daily || player.daily.d !== key || !Array.isArray(player.daily.q)) {
            const old = player.daily || {}; player.daily = { d: key, q: genDaily(), streak: old.streak | 0, last: old.last || '', best: old.best | 0, bonus: false };
            if (player.daily.last && player.daily.last !== yesterdayKey() && player.daily.last !== key) player.daily.streak = 0;
        }
        return player.daily;
    }
    const dText = (q) => q.k === 'kill' ? `Derrote ${q.need} criaturas` : q.k === 'mob' ? `Derrote ${q.need}× ${(npcDB[q.mob] || {}).name || q.mob}` : `${SK[q.skill][0]}${q.need} ${SK[q.skill][1]}`;
    function dProg(kind, arg) {
        const d = daily(); if (!d) return; let ch = false;
        d.q.forEach((q) => { if (q.done) return; if ((kind === 'kill' && (q.k === 'kill' || (q.k === 'mob' && q.mob === arg))) || (kind === 'skill' && q.k === 'skill' && q.skill === arg)) { q.p++; ch = true; if (q.p >= q.need) { q.done = true; sfx('accept'); try { setActionText('Diária concluída! Abra o Diário (J) para pegar a recompensa.', '#7bd67b'); } catch (e) { } } } });
        if (ch && window.Hub) Hub.refresh();
    }
    function claim(i) {
        const d = daily(); const q = d && d.q[i]; if (!q || !q.done || q.claimed) return false;
        const inv = JSON.stringify(player.inventory); if (!addInvItem('Coins', q.coins)) { setActionText('Mochila cheia!', '#e74c3c'); return false; }
        addXP(bestSkill(q), q.xp); q.claimed = true; cnt('daily'); sfx('coin'); setActionText(`+${q.coins} moedas`, '#f1c40f');
        if (d.q.every((x) => x.claimed) && !d.bonus) {
            d.bonus = true; d.streak = (d.last === yesterdayKey() ? d.streak : 0) + 1; d.last = dayKey(); d.best = Math.max(d.best | 0, d.streak);
            const b = 120 + 40 * Math.min(d.streak, 7); if (!addInvItem('Coins', b)) { try { gameMaps[currentMap].entities.push({ id: newEntId(), type: 'ground_item', item: 'Coins', qty: b, x: player.x, y: player.y, w: 20, h: 20, active: true, life: 6000 }); } catch (e) { } }
            if (itemDB['Greater Health Potion']) addInvItem('Greater Health Potion', 1); else if (itemDB['Health Potion']) addInvItem('Health Potion', 2);
            sfx('quest'); setActionText(`Todas as diárias! Bônus de ${b} moedas (sequência: ${d.streak} dia${d.streak > 1 ? 's' : ''}).`, '#e8c469');
        }
        try { saveDataLogic(); updateUI(); } catch (e) { } checkAch(); if (window.Hub) Hub.refresh(); return true;
    }
    const bestSkill = (q) => q.k === 'skill' ? q.skill : 'combat';

    /* ---------- pesca por clima e hora ---------- */
    function rollFish() {
        const fl = lvl('fishing'), rain = window.Env && Env.rainLevel && Env.rainLevel() > 0.4, fog = window.Env && /Neblina/.test(Env.weatherLabel()), night = window.Env && Env.isNight(), day = window.Env && Env.daylight() > 0.8 && !rain && !fog;
        const T = [['Raw Fish', 100]]; if (rain && fl >= 8) T.push(['Raw Salmon', 30]); if (fog && fl >= 12) T.push(['Raw Eel', 26]); if (night && !rain && fl >= 18) T.push(['Raw Moonfish', 16]); if (day && fl >= 22) T.push(['Raw Golden Koi', 8]);
        let tot = T.reduce((s, x) => s + x[1], 0), r = Math.random() * tot, pick = 'Raw Fish'; for (const x of T) { if ((r -= x[1]) <= 0) { pick = x[0]; break; } }
        if (pick !== 'Raw Fish') { cnt('rarefish'); sfx('quest'); try { setActionText('Peixe raro: ' + pick.replace('Raw ', '') + '!', '#e8c469'); Art.burst(player.x, player.y - 8, '#8fd8ff', 14, 1.4); } catch (e) { } }
        return itemDB[pick] ? pick : 'Raw Fish';
    }

    /* ---------- emotes ---------- */
    const EM = ['smile', 'laugh', 'heart', 'angry', 'ask', 'alert', 'sleep', 'music']; const EM_NAME = { smile: 'Sorrir', laugh: 'Rir', heart: 'Coração', angry: 'Bravo', ask: 'Dúvida', alert: 'Alerta', sleep: 'Sono', music: 'Cantar' };
    let lastEm = 0, emSend = null;
    function emote(k) { if (!EM.includes(k) || NOW() - lastEm < 1500 || !ok()) return false; lastEm = NOW(); player._em = { k, until: NOW() + 3200 }; emSend = k; sfx('click'); return true; }
    function drawEmote(ctx, x, y, em) {
        if (!em || !EM.includes(em.k)) return; const left = em.until - NOW(); if (left <= 0) return; const age = 3200 - left;
        const pop = age < 220 ? 0.4 + 0.6 * Math.sin(age / 220 * Math.PI / 2) * 1.05 : 1, a = left < 500 ? left / 500 : 1, bob = Math.sin(age / 260) * 1.5;
        ctx.save(); ctx.translate(x, y - 14 + bob); ctx.scale(pop, pop); ctx.globalAlpha = a;
        ctx.fillStyle = '#fffdf5'; ctx.strokeStyle = '#3a2a14'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 13, 0, 6.283); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-4, 11); ctx.lineTo(0, 18); ctx.lineTo(4, 11); ctx.closePath(); ctx.fillStyle = '#fffdf5'; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-3, 11.5); ctx.lineTo(3, 11.5); ctx.strokeStyle = '#fffdf5'; ctx.lineWidth = 3; ctx.stroke();
        ctx.lineWidth = 1.6; ctx.strokeStyle = '#3a2a14'; ctx.lineCap = 'round';
        const face = (col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 6.283); ctx.fill(); ctx.stroke(); };
        if (em.k === 'smile') { face('#ffd447'); ctx.fillStyle = '#3a2a14'; ctx.beginPath(); ctx.arc(-3.2, -2, 1.3, 0, 6.283); ctx.arc(3.2, -2, 1.3, 0, 6.283); ctx.fill(); ctx.beginPath(); ctx.arc(0, 1, 4.4, 0.2, 2.94); ctx.stroke(); }
        else if (em.k === 'laugh') { face('#ffd447'); ctx.beginPath(); ctx.arc(-3.2, -2.5, 2, 3.5, 5.9); ctx.arc(3.2, -2.5, 2, 3.5, 5.9); ctx.stroke(); ctx.fillStyle = '#7a1f12'; ctx.beginPath(); ctx.moveTo(-5, 1); ctx.quadraticCurveTo(0, 9.5, 5, 1); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        else if (em.k === 'heart') { ctx.fillStyle = '#e0334a'; ctx.beginPath(); ctx.moveTo(0, 7.5); ctx.bezierCurveTo(-11, -1, -6, -9, 0, -3.5); ctx.bezierCurveTo(6, -9, 11, -1, 0, 7.5); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(-4, -3, 1.6, 0, 6.283); ctx.fill(); }
        else if (em.k === 'angry') { face('#ee5a3c'); ctx.beginPath(); ctx.moveTo(-6, -5.5); ctx.lineTo(-1.5, -2.5); ctx.moveTo(6, -5.5); ctx.lineTo(1.5, -2.5); ctx.stroke(); ctx.fillStyle = '#3a2a14'; ctx.beginPath(); ctx.arc(-3.2, -1, 1.3, 0, 6.283); ctx.arc(3.2, -1, 1.3, 0, 6.283); ctx.fill(); ctx.beginPath(); ctx.arc(0, 6.5, 3.6, 3.6, 5.8); ctx.stroke(); }
        else if (em.k === 'ask') { ctx.font = 'bold 19px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#2a6fd0'; ctx.fillText('?', 0, 1.5); }
        else if (em.k === 'alert') { ctx.font = 'bold 20px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#d6301f'; ctx.fillText('!', 0, 1.5); }
        else if (em.k === 'sleep') { ctx.font = 'bold 11px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#5a6bb0'; ctx.fillText('Z', -4, 3); ctx.font = 'bold 8px Georgia'; ctx.fillText('z', 3, -4); ctx.font = 'bold 6px Georgia'; ctx.fillText('z', 7, -8); }
        else if (em.k === 'music') { ctx.fillStyle = '#3a2a14'; ctx.beginPath(); ctx.ellipse(-2.5, 5, 3.4, 2.6, -0.4, 0, 6.283); ctx.fill(); ctx.beginPath(); ctx.moveTo(0.2, 4); ctx.lineTo(0.2, -7); ctx.quadraticCurveTo(6, -5, 6, 0); ctx.stroke(); }
        ctx.restore();
    }
    window.Emotes = { draw: drawEmote, list: EM, names: EM_NAME };

    /* ---------- chefe de mundo ---------- */
    const WB_ID = 424242;
    const B = { info: null, skew: 0, ent: null, lastH: -1, warned: -1, announced: -1 };
    const bossMapId = () => (gameMaps.lumbridge ? 'lumbridge' : Object.keys(gameMaps)[0]);
    function findSpot(m, w, h) {
        const W = m.width || 1600, H = m.height || 1200, ents = (m.entities || []).filter((o) => o && o.active !== false && (o.type === 'house' || o.type === 'decor' || o.type === 'tree' || (typeof o.type === 'string' && o.type.startsWith('rock')) || o.type === 'furnace' || o.type === 'bank'));
        const hit = (x, y) => ents.some((o) => x < o.x + (o.w || 30) + 30 && x + w > o.x - 30 && y < o.y + (o.h || 30) + 30 && y + h > o.y - 30);
        const cx = W * 0.5, cy = H * 0.42;
        for (let r = 0; r < 700; r += 40) for (let a = 0; a < 6.28; a += 0.5) { const x = Math.max(40, Math.min(W - w - 40, cx + Math.cos(a) * r - w / 2)), y = Math.max(40, Math.min(H - h - 40, cy + Math.sin(a) * r * 0.7 - h / 2)); if (!hit(x, y)) return { x, y }; }
        return { x: cx, y: cy };
    }
    function bossEntity() { const m = gameMaps[bossMapId()]; return m && m.entities ? m.entities.find((o) => o && o.id === WB_ID) : null; }
    function spawnBoss() {
        const m = gameMaps[bossMapId()]; if (!m || !npcDB.wboss_golem) return; if (!m.entities) m.entities = [];
        let e = m.entities.find((o) => o && o.id === WB_ID); if (e) return e; const d = npcDB.wboss_golem, s = findSpot(m, d.w, d.h);
        e = { id: WB_ID, type: 'enemy', dbKey: 'wboss_golem', name: d.name, x: s.x, y: s.y, w: d.w, h: d.h, hp: d.hp, maxHp: d.hp, attackCooldown: 0, active: true, wb: true, homeX: s.x, homeY: s.y };
        m.entities.push(e); return e;
    }
    function removeBoss() { const m = gameMaps[bossMapId()]; if (m && m.entities) { const i = m.entities.findIndex((o) => o && o.id === WB_ID); if (i >= 0) m.entities.splice(i, 1); } }
    function bossHud() {
        let el = $('wb-hud'); if (!el) { el = document.createElement('div'); el.id = 'wb-hud'; const gc = $('game-container'); if (!gc) return; gc.appendChild(el); }
        const i = B.info; if (!i || !ok()) { el.style.display = 'none'; return; }
        const left = i.open ? Math.max(0, i.left - (NOW() - B.recv)) : Math.max(0, i.next - (NOW() - B.recv)); const mm = Math.floor(left / 60000), ss = Math.floor(left / 1000) % 60, tt = mm + ':' + String(ss).padStart(2, '0');
        const e = bossEntity(), here = e && currentMap === bossMapId();
        if (!i.open && i.next > 300000) { el.style.display = 'none'; return; }
        el.style.display = 'block';
        if (!i.open) { el.innerHTML = `<b>Colosso de Pedra</b> desperta em ${tt}`; el.className = 'soon'; return; }
        const hp = e ? Math.max(0, e.hp) : 0, mx = e ? e.maxHp : 1800;
        el.className = 'open'; el.innerHTML = `<b>Colosso de Pedra</b> na Vila · ${tt}` + (here && e.active !== false ? `<span class="wb-bar"><i style="width:${Math.round(hp / mx * 100)}%"></i><span>${hp} / ${mx}</span></span>` : e && e.active === false ? '<span class="wb-dead">Derrotado!</span>' : '');
    }
    function ann(txt) {   // aviso discreto: uma linha fina no topo, some em ~5 s; clique dispensa
        const gc = $('game-container'); if (!gc) return; let el = $('wb-ann'); if (!el) { el = document.createElement('div'); el.id = 'wb-ann'; el.title = 'Clique para dispensar'; el.addEventListener('click', () => { el.classList.remove('show'); }); gc.appendChild(el); }
        el.textContent = txt; el.classList.add('show'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 5000);
    }
    let wbAlive = false;
    function bossTick() {
        if (!ok() || !B.info) return; const i = B.info, h = i.h;
        if (i.open) {
            if (B.announced !== h) { B.announced = h; sfx('thunder'); try { ann('O Colosso de Pedra despertou na Vila! Chame seus amigos.'); } catch (e) { } }
            if (npcDB.wboss_golem) spawnBoss();
            const e = bossEntity(); if (e) {
                if (e.active !== false && e.hp > 0) { wbAlive = true; e._wbSeen = true; }
                else if (e._wbSeen && wbAlive) { wbAlive = false; e.active = false; bossReward(h); }
                if (e.active === false) e.active = false;   // o servidor só o "renasce" na próxima hora
            }
        } else {
            if (bossEntity()) { removeBoss(); wbAlive = false; }
            if (i.next < 125000 && B.warned !== h + 1) { B.warned = h + 1; try { ann('O Colosso de Pedra desperta em 2 minutos, na Vila.'); } catch (e) { } sfx('click'); }
        }
        bossHud();
    }
    function bossReward(h) {
        const e = bossEntity(); if (!e || !(e._dealt > 0) || player.wbDone === h) return; player.wbDone = h; cnt('wboss');
        const mult = Math.min(2, 1 + e._dealt / 1800), coins = Math.round(600 * mult); const give = (n, q) => { if (itemDB[n] && !addInvItem(n, q)) { try { gameMaps[currentMap].entities.push({ id: newEntId(), type: 'ground_item', item: n, qty: q, x: player.x + Math.random() * 30 - 15, y: player.y + 10, w: 20, h: 20, active: true, life: 6000 }); } catch (er) { } } };
        give('Coins', coins); give('Colossus Core', 1); give('Mithril Bar', 2); give('Greater Health Potion', 2); if (Math.random() < 0.5) give('Soul Gem', 1);
        addXP('combat', 400); addXP('hp', 400); sfx('levelup'); try { setActionText(`Colosso derrotado! Recompensa: ${coins} moedas e tesouros (você causou ${e._dealt} de dano).`, '#e8c469'); Art.burst(player.x, player.y - 12, '#ffd24a', 26, 2); } catch (er) { }
        try { saveDataLogic(); updateUI(); } catch (er) { } checkAch();
    }

    /* ---------- ligação com o servidor ---------- */
    let lastPlayers = null;
    function onSync(data) {
        if (!data) return; if (data.boss) { B.info = data.boss; B.recv = NOW(); }
        if (data.players) lastPlayers = { p: data.players, t: data.t || NOW(), rec: NOW() };
    }
    function applyPlayers() {
        if (!lastPlayers || typeof otherPlayers === 'undefined') return; const { p, t, rec } = lastPlayers;
        for (const u of Object.keys(p)) {
            const o = otherPlayers[u]; if (!o) continue; o.title = p[u].title || '';
            const em = p[u].emote; if (em && em.t !== o._emT) { o._emT = em.t; const age = Math.max(0, t - em.t); if (age < 3000) o._em = { k: em.k, until: rec + 3200 - age }; }
        }
    }

    /* ---------- ganchos no jogo ---------- */
    function wire() {
        const oa = window.addXP; if (typeof oa === 'function') window.addXP = function (s) { const r = oa.apply(this, arguments); try { if (SK[s]) dProg('skill', s); } catch (e) { } return r; };
        const od = window.applyDamage; if (typeof od === 'function') window.applyDamage = function (t, dmg) {
            const was = t && t.type === 'enemy' && t.active !== false && t.hp > 0; const r = od.apply(this, arguments);
            try { if (t && t.wb && dmg > 0) t._dealt = (t._dealt || 0) + dmg; if (was && t.hp <= 0 && !t.wb) { cnt('kills'); dProg('kill', t.dbKey); } } catch (e) { } return r;
        };
        const orr = window.respawnAtVillage; if (typeof orr === 'function') window.respawnAtVillage = function () { const r = orr.apply(this, arguments); try { cnt('deaths'); } catch (e) { } return r; };
        // kill por dbKey: o "kill" genérico já conta; para a missão "mob" usamos a mesma chamada acima (arg = dbKey)
        setInterval(() => { try { if (!ok()) return; applyPlayers(); if (window.Hub && Hub.tick) Hub.tick(); bossTick(); } catch (e) { } }, 400);
        setInterval(() => { try { checkAch(); daily(); } catch (e) { } }, 3000);
        // /e nome  (ex.: /e heart)
        const inp = $('chat-input'); if (inp) inp.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return; const m = /^\/e(?:mote)?\s*(\w*)/i.exec(inp.value.trim()); if (!m) return;
            e.preventDefault(); e.stopImmediatePropagation(); inp.value = ''; const k = m[1].toLowerCase();
            if (!emote(k)) { try { setActionText('Emotes: ' + EM.join(', '), '#f1c40f'); } catch (er) { } }
        }, true);
    }
    window.addEventListener('load', wire);
    window.Life = { ann, _reward: bossReward, _tick: bossTick, _B: B,
        A, cnt, checkAch, daily, dText, claim, rollFish, emote, EM, EM_NAME, onSync, dProg, bossInfo: () => { if (!B.info) return null; const el = NOW() - (B.recv || NOW()); return Object.assign({}, B.info, { left: Math.max(0, B.info.left - el), next: Math.max(0, B.info.next - el) }); }, bossEntity, pendingEmote: () => { const k = emSend; emSend = null; return k; },
        titles: () => A.filter((a) => player.ach && player.ach[a.id]).map((a) => a.title), tier
    };
})();
