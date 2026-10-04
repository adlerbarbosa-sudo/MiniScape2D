'use strict';
/* MiniScape 2D — grupo (party) e troca entre jogadores.
   O servidor não conhece inventários (eles vivem no cliente), então a troca é um protocolo em fases:
   convite → aberta (ofertas) → ambos confirmam → "commit" (cada cliente confere e tira suas peças da mochila para o "depósito")
   → se os dois disseram que estão prontos, "done" (cada cliente recebe as peças do outro e confirma) ; qualquer falha = "cancel" (o depósito volta).
   Trocas terminadas ficam gravadas até os DOIS confirmarem, para nada se perder se alguém cair no meio. */

const MIMIC = require('./mimicnames');
const MAX_PARTY = 5, INVITE_MS = 60000, OPEN_IDLE_MS = 10 * 60000, COMMIT_MS = 20000, OFFLINE_MS = 120000, STALE_MS = 30 * 86400000;
const ITEM_RE = /^[\p{L}\p{N}_.'’()+%!:\- ]{1,40}$/u;
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

module.exports = function createSocial(ctx) {
    let db = ctx.db; const { activePlayers, markDirty } = ctx;
    if (!db.trades || typeof db.trades !== 'object') db.trades = Object.create(null);
    if (!db.guilds || typeof db.guilds !== 'object') db.guilds = Object.create(null);
    const guildOf = Object.create(null), ginv = Object.create(null); let gSave = 0;
    const G_MAX = 20, gLvl = (g) => Math.min(11, Math.floor(Math.sqrt((g.xp || 0) / 3000)) + 1);
    function rebuildGuilds() { for (const k of Object.keys(guildOf)) delete guildOf[k]; for (const id of Object.keys(db.guilds)) { const g = db.guilds[id]; if (!g || !Array.isArray(g.members) || !g.members.length) { delete db.guilds[id]; continue; } g.members.forEach((m) => { guildOf[m] = id; }); } }
    rebuildGuilds();
    function guildLeave(u) { const id = guildOf[u], g = id && db.guilds[id]; if (!g) return; delete guildOf[u]; g.members = g.members.filter((m) => m !== u); if (!g.members.length) delete db.guilds[id]; else if (g.leader === u) g.leader = g.members[0]; markDirty(); }
    function guildView(u) { const id = guildOf[u], g = id && db.guilds[id]; if (!g) return null; const l = gLvl(g); return { name: g.name, leader: g.leader, lvl: l, xp: g.xp | 0, next: l >= 11 ? 0 : 3000 * l * l, base: 3000 * (l - 1) * (l - 1), bonus: l - 1, members: g.members.map((m) => ({ u: m, on: online(m) })) }; }
    const parties = Object.create(null), partyOf = Object.create(null), invites = Object.create(null), tradeOf = Object.create(null);
    let seq = 1;
    const now = () => Date.now();
    const online = (u) => !!activePlayers[u] && now() - activePlayers[u].lastSeen < 6000;

    function rebuildTrades() {
        for (const k of Object.keys(tradeOf)) delete tradeOf[k];
        for (const id of Object.keys(db.trades)) { const t = db.trades[id]; if (!t) { delete db.trades[id]; continue; } tradeOf[t.a] = id; tradeOf[t.b] = id; }
    }
    rebuildTrades();

    /* ---------- grupo ---------- */
    function dropFromParty(u) {
        const pid = partyOf[u]; if (!pid) return; const p = parties[pid]; delete partyOf[u]; if (!p) return;
        p.members = p.members.filter((m) => m !== u);
        if (p.members.length < 2) { p.members.forEach((m) => delete partyOf[m]); delete parties[pid]; return; }
        if (p.leader === u) p.leader = p.members[0];
    }
    function partyView(u) {
        const pid = partyOf[u]; const p = pid && parties[pid]; if (!p) return null;
        return { id: p.id, leader: p.leader, members: p.members.map((m) => { const a = activePlayers[m]; return { u: m, on: online(m), hp: a ? a.hp | 0 : 0, maxHp: a ? a.maxHp | 0 : 0, map: a ? a.map : '' }; }) };
    }

    /* ---------- troca ---------- */
    const side = (t, u) => (t.a === u ? 'a' : t.b === u ? 'b' : null);
    function endTrade(t, why) {   // vira "cancel" (fica guardada até os dois confirmarem, para devolverem o depósito)
        if (t.st === 'done' || t.st === 'cancel') return;
        t.st = 'cancel'; t.why = why || ''; t.t = now();
        t.applied.a = !t.esc.a; t.applied.b = !t.esc.b;   // quem não tinha depósito não tem nada a devolver
        settle(t); markDirty();
    }
    function settle(t) { if (t.applied.a && t.applied.b && (t.st === 'done' || t.st === 'cancel')) { delete db.trades[t.id]; if (tradeOf[t.a] === t.id) delete tradeOf[t.a]; if (tradeOf[t.b] === t.id) delete tradeOf[t.b]; markDirty(); } }
    function cleanItems(arr) {
        if (!Array.isArray(arr)) return null; const out = [], seen = new Set();
        for (const it of arr.slice(0, 8)) {
            if (!Array.isArray(it) || typeof it[0] !== 'string' || !ITEM_RE.test(it[0]) || seen.has(it[0])) continue;
            const q = Math.floor(Number(it[1])); if (!(q >= 1 && q <= 2147483647)) continue; seen.add(it[0]); out.push([it[0], q]);
        }
        return out;
    }
    function tradeView(u) {
        const id = tradeOf[u]; const t = id && db.trades[id]; if (!t) return null; const s = side(t, u), o = s === 'a' ? 'b' : 'a';
        return { id: t.id, st: t.st, why: t.why || '', other: t[o], mine: t.offer[s], theirs: t.offer[o], okMine: t.ok[s], okTheirs: t.ok[o], readyMine: t.ready[s], readyTheirs: t.ready[o], applied: t.applied[s], starter: t.a === u };
    }

    function tick() {
        const n = now();
        for (const u of Object.keys(invites)) if (invites[u].exp < n || !parties[invites[u].pid]) delete invites[u];
        for (const pid of Object.keys(parties)) { const p = parties[pid]; for (const m of p.members.slice()) { const a = activePlayers[m]; if (!a || n - a.lastSeen > OFFLINE_MS) dropFromParty(m); } }
        for (const id of Object.keys(db.trades)) {
            const t = db.trades[id]; if (!t) continue;
            if (t.st === 'invite' && n - t.t > INVITE_MS) endTrade(t, 'sem resposta');
            else if (t.st === 'open' && (n - t.t > OPEN_IDLE_MS || !online(t.a) || !online(t.b))) endTrade(t, 'jogador saiu');
            else if (t.st === 'commit' && n - t.t > COMMIT_MS) endTrade(t, 'tempo esgotado');
            else if ((t.st === 'done' || t.st === 'cancel') && n - t.t > STALE_MS) { delete db.trades[id]; if (tradeOf[t.a] === id) delete tradeOf[t.a]; if (tradeOf[t.b] === id) delete tradeOf[t.b]; markDirty(); }
        }
    }
    setInterval(() => { try { tick(); } catch (e) { console.error('[social.tick]', e); } }, 2000).unref();

    const pend = Object.create(null), xpRate = Object.create(null);   // XP compartilhado do grupo, entregue uma vez a cada membro
    function view(u) {
        const inv = invites[u];
        const gi = ginv[u]; const out = { guild: guildView(u), ginvite: gi && gi.exp > now() && db.guilds[gi.gid] ? { from: gi.from, name: db.guilds[gi.gid].name } : null, party: partyView(u), invite: inv && parties[inv.pid] ? { from: inv.from } : null, trade: tradeView(u) };
        if (pend[u] && pend[u].length) { out.xp = pend[u]; pend[u] = []; }
        return out;
    }
    const err = (m) => ({ error: m });
    const savedPD = (u) => { const x = hasOwn(db.users, u) ? db.users[u] : null; return x && x.playerData && typeof x.playerData === 'object' ? x.playerData : null; };
    /* o depósito só vale se o save do jogador (já aceito pelo servidor) o traz: id da troca + todas as peças oferecidas */
    function escrowSaved(u, t, s) {
        const pd = savedPD(u); const e = pd && pd.escrow; if (!e || typeof e !== 'object' || e.id !== t.id || !Array.isArray(e.items)) return false;
        const have = new Map(); for (const x of e.items) if (Array.isArray(x) && typeof x[0] === 'string' && Number.isFinite(x[1])) have.set(x[0], (have.get(x[0]) || 0) + x[1]);
        for (const x of t.offer[s]) if ((have.get(x[0]) || 0) < x[1]) return false;
        return true;
    }

    function act(u, b) {
        if (!b || typeof b.a !== 'string') return err('Pedido inválido.');
        const me = activePlayers[u]; if (!me) return err('Você não está online.');
        const to = typeof b.to === 'string' && hasOwn(db.users, b.to) ? b.to : null;
        switch (b.a) {
            case 'party_invite': {
                if (!to || to === u || !online(to)) return err('Jogador indisponível.');
                let pid = partyOf[u];
                if (!pid) { pid = 'p' + (seq++) + '_' + now().toString(36); parties[pid] = { id: pid, leader: u, members: [u] }; partyOf[u] = pid; }
                const p = parties[pid]; if (p.leader !== u) return err('Só o líder convida.');
                if (partyOf[to]) return err(to + ' já está em um grupo.');
                if (p.members.length >= MAX_PARTY) return err('Grupo cheio.');
                invites[to] = { from: u, pid, exp: now() + INVITE_MS }; return { ok: true };
            }
            case 'party_accept': { const inv = invites[u]; if (!inv || !parties[inv.pid]) return err('Convite expirado.'); if (partyOf[u]) return err('Você já está em um grupo.'); const p = parties[inv.pid]; if (p.members.length >= MAX_PARTY) return err('Grupo cheio.'); p.members.push(u); partyOf[u] = p.id; delete invites[u]; return { ok: true }; }
            case 'party_decline': delete invites[u]; return { ok: true };
            case 'party_leave': dropFromParty(u); return { ok: true };
            case 'party_kick': { const p = parties[partyOf[u]]; if (!p || p.leader !== u) return err('Só o líder expulsa.'); if (!to || to === u || partyOf[to] !== p.id) return err('Jogador não encontrado no grupo.'); dropFromParty(to); return { ok: true }; }

            case 'party_xp': {   // o XP de combate de quem lutou rende 50% (no cliente) aos companheiros próximos, no mesmo mapa
                const gid = guildOf[u], gg = gid && db.guilds[gid];
                if (gg) { const gx = Math.min(5000, Math.max(0, (Math.floor(Number(b.x)) || 0) / 100)); if (gx > 0) { gg.xp = Math.round(((gg.xp || 0) + gx) * 100) / 100; if (now() - gSave > 20000) { gSave = now(); markDirty(); } } }
                const pid = partyOf[u], p = pid && parties[pid]; if (!p) return { ok: true };
                const sk = String(b.s || ''); if (!/^(combat|ranged|magic)$/.test(sk)) return { ok: true };
                let x = Math.floor(Number(b.x)); if (!(x > 0)) return { ok: true }; x = Math.min(x, 500000);   // x em centésimos de XP base (as pancadas de monstros fracos valem frações)
                const n = now(), r = xpRate[u] || (xpRate[u] = { t: n, a: 0 }); if (n - r.t > 10000) { r.t = n; r.a = 0; } r.a += x; if (r.a > 2000000) return { ok: true };
                for (const m of p.members) { if (m === u || !online(m)) continue; const a = activePlayers[m]; if (a.map !== me.map || Math.hypot(a.x - me.x, a.y - me.y) > 1100) continue; const q = pend[m] || (pend[m] = []); if (q.length < 40) q.push({ f: u, s: sk, x }); }
                return { ok: true };
            }
            case 'guild_create': {
                if (guildOf[u]) return err('Você já está em uma guilda.'); const nm = String(b.name || '').trim().replace(/\s+/g, ' ');
                if (!/^[\p{L}\p{N} ]{3,16}$/u.test(nm)) return err('Nome da guilda: 3 a 16 letras ou números.');
                const id = nm.toLowerCase(); if (db.guilds[id]) return err('Já existe uma guilda com esse nome.');
                db.guilds[id] = { name: nm, leader: u, members: [u], xp: 0, t: now() }; guildOf[u] = id; markDirty(); return { ok: true };
            }
            case 'guild_invite': {
                const g = db.guilds[guildOf[u]]; if (!g) return err('Você não está em uma guilda.'); if (g.leader !== u) return err('Só o líder convida.');
                if (!to || to === u || !online(to)) return err('Jogador indisponível.'); if (guildOf[to]) return err(to + ' já está em uma guilda.'); if (g.members.length >= G_MAX) return err('Guilda cheia.');
                ginv[to] = { from: u, gid: guildOf[u], exp: now() + 60000 }; return { ok: true };
            }
            case 'guild_accept': { const iv = ginv[u]; const g = iv && iv.exp > now() && db.guilds[iv.gid]; if (!g) return err('Convite expirado.'); if (guildOf[u]) return err('Você já está em uma guilda.'); if (g.members.length >= G_MAX) return err('Guilda cheia.'); g.members.push(u); guildOf[u] = iv.gid; delete ginv[u]; markDirty(); return { ok: true }; }
            case 'guild_decline': delete ginv[u]; return { ok: true };
            case 'guild_leave': guildLeave(u); return { ok: true };
            case 'guild_kick': { const g = db.guilds[guildOf[u]]; if (!g || g.leader !== u) return err('Só o líder expulsa.'); if (!to || to === u || guildOf[to] !== guildOf[u]) return err('Jogador não encontrado na guilda.'); guildLeave(to); return { ok: true }; }
            case 'trade_request': {
                if (!to || to === u || !online(to)) return err('Jogador indisponível.');
                if (tradeOf[u] || tradeOf[to]) return err('Um dos dois já está em uma troca.');
                const a = activePlayers[to]; if (a.map !== me.map || Math.hypot(a.x - me.x, a.y - me.y) > 320) return err('Chegue perto de ' + to + ' para trocar.');
                const id = 't' + (seq++) + '_' + now().toString(36) + Math.random().toString(36).slice(2, 6);
                db.trades[id] = { id, a: u, b: to, st: 'invite', t: now(), offer: { a: [], b: [] }, ok: { a: false, b: false }, ready: { a: null, b: null }, applied: { a: false, b: false }, esc: { a: false, b: false } };
                tradeOf[u] = id; tradeOf[to] = id; markDirty(); return { ok: true };
            }
            default: break;
        }
        // ações sobre a troca atual
        const id = tradeOf[u]; const t = id && db.trades[id]; if (!t) return err('Nenhuma troca em andamento.'); const s = side(t, u), o = s === 'a' ? 'b' : 'a';
        switch (b.a) {
            case 'trade_accept': if (t.st !== 'invite' || t.b !== u) return err('Nada para aceitar.'); t.st = 'open'; t.t = now(); markDirty(); return { ok: true };
            case 'trade_cancel': case 'trade_decline': endTrade(t, u + ' cancelou'); return { ok: true };
            case 'trade_offer': {
                if (t.st !== 'open') return err('A troca não está aberta.'); if (Array.isArray(b.items) && b.items.some((it) => Array.isArray(it) && MIMIC.NAMES.has(it[0]))) return err('Itens Mímicos são pessoais e não podem ser trocados.'); const items = cleanItems(b.items); if (!items) return err('Oferta inválida. Confira os itens.');
                t.offer[s] = items; t.ok.a = t.ok.b = false; t.t = now(); markDirty(); return { ok: true };
            }
            case 'trade_ok': {
                if (t.st !== 'open') return err('A troca não está aberta.'); if (!t.offer.a.length && !t.offer.b.length) return err('Coloque algo na troca.');
                t.ok[s] = !!b.v; t.t = now();
                if (t.ok.a && t.ok.b) { t.st = 'commit'; t.ready = { a: null, b: null }; t.t = now(); }
                markDirty(); return { ok: true };
            }
            case 'trade_ready': {   // o cliente conferiu itens/espaço e (se passou) já tirou as peças da mochila
                if (t.st !== 'commit') return err('Não foi possível concluir. Tente de novo.'); if (t.ready[s] !== null) return { ok: true };
                t.ready[s] = !!b.pass; t.esc[s] = !!b.pass;
                if (t.ready[s] === true && !escrowSaved(u, t, s)) { t.ready[s] = false; t.esc[s] = true; endTrade(t, 'depósito de ' + u + ' não foi salvo (a troca foi desfeita e nada se perdeu)'); markDirty(); return { ok: true }; }   // esc=true: o cliente devolve o depósito local
                if (t.ready[s] === false) endTrade(t, u + ' não pôde concluir');
                else if (t.ready[o] === true) { t.st = 'done'; t.t = now(); }
                markDirty(); return { ok: true };
            }
            case 'trade_ack': {   // o cliente já aplicou (recebeu / devolveu o depósito)
                if (t.st !== 'done' && t.st !== 'cancel') return err('Não foi possível concluir. Tente de novo.');
                if (t.st === 'done' && !t.applied[s]) { const pd = savedPD(u); if (!(pd && Array.isArray(pd.tradeDone) && pd.tradeDone.includes(t.id))) return Object.assign(err('Guardando o seu progresso. Tente de novo em instantes.'), { code: 'PENDING' }); }   // só confirma o recebimento depois que o save com o item chegou ao servidor
                t.applied[s] = true; settle(t); markDirty(); return { ok: true };
            }
            default: return err('Ação desconhecida.');
        }
    }
    /* sessão única: outro login derrubou a sessão de u. Convites/trocas abertas ou em andamento viram "cancel" (o depósito volta para quem já tinha tirado da mochila);
       trocas já concluídas (done) seguem o curso normal, cada lado recebe uma única vez. */
    function dropUser(u, why) {
        const id = tradeOf[u]; const t = id && db.trades[id];
        if (t && (t.st === 'invite' || t.st === 'open' || t.st === 'commit')) endTrade(t, why || 'jogador saiu');
        delete invites[u];
    }
    function chatVisible(u, c) { if (c.guild) return c.guild === guildOf[u]; return !c.party || c.party === partyOf[u]; }
    function rebind(nd) { db = nd; if (!db.trades || typeof db.trades !== 'object') db.trades = Object.create(null); if (!db.guilds || typeof db.guilds !== 'object') db.guilds = Object.create(null); rebuildTrades(); rebuildGuilds(); }
    return { act, view, dropUser, chatVisible, rebind, partyOf: (u) => partyOf[u] || null, guildOf: (u) => guildOf[u] || null, guildName: (u) => { const g = db.guilds[guildOf[u]]; return g ? g.name : null; }, tick, _t: { parties, invites, tradeOf } };
};
