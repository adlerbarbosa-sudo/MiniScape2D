'use strict';
/* MiniScape 2D — grupo (party) e troca entre jogadores.
   O servidor não conhece inventários (eles vivem no cliente), então a troca é um protocolo em fases:
   convite → aberta (ofertas) → ambos confirmam → "commit" (cada cliente confere e tira suas peças da mochila para o "depósito")
   → se os dois disseram que estão prontos, "done" (cada cliente recebe as peças do outro e confirma) ; qualquer falha = "cancel" (o depósito volta).
   Trocas terminadas ficam gravadas até os DOIS confirmarem, para nada se perder se alguém cair no meio. */

const MAX_PARTY = 5, INVITE_MS = 60000, OPEN_IDLE_MS = 10 * 60000, COMMIT_MS = 20000, OFFLINE_MS = 120000, STALE_MS = 30 * 86400000;
const ITEM_RE = /^[\p{L}\p{N}_.'\- ]{1,40}$/u;
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

module.exports = function createSocial(ctx) {
    let db = ctx.db; const { activePlayers, markDirty } = ctx;
    if (!db.trades || typeof db.trades !== 'object') db.trades = Object.create(null);
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
    setInterval(tick, 2000).unref();

    function view(u) {
        const inv = invites[u];
        return { party: partyView(u), invite: inv && parties[inv.pid] ? { from: inv.from } : null, trade: tradeView(u) };
    }
    const err = (m) => ({ error: m });

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
            case 'party_kick': { const p = parties[partyOf[u]]; if (!p || p.leader !== u) return err('Só o líder expulsa.'); if (!to || to === u || partyOf[to] !== p.id) return err('Membro inválido.'); dropFromParty(to); return { ok: true }; }

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
                if (t.st !== 'open') return err('A troca não está aberta.'); const items = cleanItems(b.items); if (!items) return err('Oferta inválida.');
                t.offer[s] = items; t.ok.a = t.ok.b = false; t.t = now(); markDirty(); return { ok: true };
            }
            case 'trade_ok': {
                if (t.st !== 'open') return err('A troca não está aberta.'); if (!t.offer.a.length && !t.offer.b.length) return err('Coloque algo na troca.');
                t.ok[s] = !!b.v; t.t = now();
                if (t.ok.a && t.ok.b) { t.st = 'commit'; t.ready = { a: null, b: null }; t.t = now(); }
                markDirty(); return { ok: true };
            }
            case 'trade_ready': {   // o cliente conferiu itens/espaço e (se passou) já tirou as peças da mochila
                if (t.st !== 'commit') return err('Fora de fase.'); if (t.ready[s] !== null) return { ok: true };
                t.ready[s] = !!b.pass; t.esc[s] = !!b.pass;
                if (t.ready[s] === false) endTrade(t, u + ' não pôde concluir');
                else if (t.ready[o] === true) { t.st = 'done'; t.t = now(); }
                markDirty(); return { ok: true };
            }
            case 'trade_ack': {   // o cliente já aplicou (recebeu / devolveu o depósito)
                if (t.st !== 'done' && t.st !== 'cancel') return err('Fora de fase.'); t.applied[s] = true; settle(t); markDirty(); return { ok: true };
            }
            default: return err('Ação desconhecida.');
        }
    }
    function chatVisible(u, c) { return !c.party || c.party === partyOf[u]; }
    function rebind(nd) { db = nd; if (!db.trades || typeof db.trades !== 'object') db.trades = Object.create(null); rebuildTrades(); }
    return { act, view, chatVisible, rebind, partyOf: (u) => partyOf[u] || null, tick, _t: { parties, invites, tradeOf } };
};
