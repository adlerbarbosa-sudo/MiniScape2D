'use strict';
/* MiniScape 2D — Missões Especiais (criadas pelo admin).
   O admin cria no Dev: nome, descrição, objetivo simples e recompensa (qualquer item do catálogo, inclusive Itens Mímicos, ou moedas).
   Objetivos (todos validados no SERVIDOR):
   - code:    o admin define um código secreto; o jogador digita e resgata (o código nunca é enviado a jogadores). Forma mais segura.
   - kill:    matar N monstros de uma espécie (dbKey do npcDB). Contado pelo servidor a partir das mortes que ele mesmo decide (db.specialProg), só com a missão ativa.
   - map:     chegar a um mapa. O servidor marca o progresso quando o jogador sincroniza com a posição nesse mapa.
   - deliver: entregar N de um item. O servidor confere o inventário/banco salvo da conta; o cliente retira os itens ao resgatar (modelo de confiança do jogo: se o cliente
              não retirar, a conta só mantém os itens; para recompensas valiosas prefira "code").
   Resgate: 1 por jogador, limite total opcional, ativar/desativar. A recompensa vai pelo correio do mercado (inbox) com id único: nunca duplica ao relogar. Tudo registrado em admin-gifts.log. */
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const TYPES = ['code', 'kill', 'deliver', 'map'];
const ID_RE = /^q[a-z0-9]{4,14}$/;
const KEY_RE = /^[A-Za-z0-9_\-]{1,40}$/;
const ITEM_RE = /^[\p{L}\p{N}_.'’()+%!:\- ]{1,40}$/u;
const MAXQ = 2147483647;
const txt = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');
const posInt = (v, a, b, d) => { v = Math.floor(Number(v)); return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };

/* normaliza uma missão (vinda do admin ou do disco); devolve null se inválida */
function cleanSQ(q, id) {
    if (!q || typeof q !== 'object' || Array.isArray(q)) return null;
    id = typeof id === 'string' ? id : q.id; if (typeof id !== 'string' || !ID_RE.test(id)) return null;
    const type = TYPES.includes(q.type) ? q.type : null; if (!type) return null;
    const name = txt(q.name, 40); if (name.length < 2) return null;
    const o = { id, name, desc: txt(q.desc, 200), type, active: q.active === true, max: posInt(q.max, 0, 100000, 0), t: Number.isFinite(q.t) ? q.t : Date.now() };
    const r = q.reward; if (!r || typeof r !== 'object' || typeof r.item !== 'string' || !ITEM_RE.test(r.item)) return null;
    const rq = Number(r.qty); if (!Number.isInteger(rq) || rq < 1 || rq > MAXQ) return null; o.reward = { item: r.item, qty: rq };
    if (type === 'code') { const c = txt(q.code, 30); if (c.length < 3) return null; o.code = c; }
    else if (type === 'kill') { if (typeof q.species !== 'string' || !KEY_RE.test(q.species)) return null; o.species = q.species; o.n = posInt(q.n, 1, 100000, 0); if (!o.n) return null; }
    else if (type === 'map') { if (typeof q.map !== 'string' || !KEY_RE.test(q.map) || /^casa_/.test(q.map)) return null; o.map = q.map; }
    else if (type === 'deliver') { if (typeof q.item !== 'string' || !ITEM_RE.test(q.item)) return null; o.item = q.item; o.n = posInt(q.n, 1, 100000, 0); if (!o.n) return null; }
    return o;
}

module.exports = function createSQ(ctx) {
    const { getDB, extras, sec, markDirty, giftLog } = ctx;
    const norm = (c) => String(c || '').trim().toLowerCase();
    const claimsOf = (id) => { const db = getDB(); return hasOwn(db.specialClaims, id) ? db.specialClaims[id] : null; };
    const claimedBy = (id, user) => { const c = claimsOf(id); return !!(c && hasOwn(c, user)); };
    const claimCount = (id) => { const c = claimsOf(id); return c ? Object.keys(c).length : 0; };
    const progOf = (id, user) => { const db = getDB(); const p = hasOwn(db.specialProg, id) ? db.specialProg[id] : null; return p && hasOwn(p, user) ? p[user] : 0; };
    function addProg(id, user, add, cap) { const db = getDB(); const p = db.specialProg[id] || (db.specialProg[id] = Object.create(null)); const v = Math.min(cap, (p[user] || 0) + add); if (v !== p[user]) { p[user] = v; markDirty(); } }
    function have(user, item) {   // quantidade do item na conta (mochila + banco + equipado) do último save
        const db = getDB(), u = hasOwn(db.users, user) ? db.users[user] : null; const pd = u && u.playerData; if (!pd || typeof pd !== 'object') return 0;
        let n = 0; const each = (it) => { if (it && it.name === item) n += typeof it.qty === 'number' ? it.qty : 1; };
        (Array.isArray(pd.inventory) ? pd.inventory : []).forEach(each); (Array.isArray(pd.bank) ? pd.bank : []).forEach(each);
        return n;
    }
    function view(q, user, admin) {   // o que cada um vê (o código só o admin)
        const prog = q.type === 'kill' ? progOf(q.id, user) : q.type === 'map' ? progOf(q.id, user) : q.type === 'deliver' ? Math.min(q.n, have(user, q.item)) : 0;
        const need = q.type === 'kill' || q.type === 'deliver' ? q.n : 1;
        const v = { id: q.id, name: q.name, desc: q.desc, type: q.type, active: q.active, reward: q.reward, claimed: claimedBy(q.id, user), prog: Math.min(prog, need), need, left: q.max > 0 ? Math.max(0, q.max - claimCount(q.id)) : -1 };
        if (q.type === 'kill') v.species = q.species; if (q.type === 'map') v.map = q.map; if (q.type === 'deliver') v.item = q.item;
        if (admin) { v.code = q.code; v.max = q.max; v.claims = claimCount(q.id); v.t = q.t; }
        return v;
    }
    function list(user) {   // jogador: ativas + as que ele já resgatou
        const db = getDB(); const out = [];
        for (const id of Object.keys(db.specialQuests)) { const q = db.specialQuests[id]; if (q.active || claimedBy(id, user)) out.push(view(q, user, false)); }
        return out.sort((a, b) => (a.claimed - b.claimed) || a.name.localeCompare(b.name));
    }
    function adminList(user) { const db = getDB(); return Object.keys(db.specialQuests).map((id) => view(db.specialQuests[id], user, true)).sort((a, b) => b.t - a.t); }

    /* --- progresso decidido pelo servidor --- */
    function onKill(user, species, map, mobId) {
        if (!species) return; const db = getDB();
        for (const id of Object.keys(db.specialQuests)) { const q = db.specialQuests[id]; if (q.active && q.type === 'kill' && q.species === species && !claimedBy(id, user)) addProg(id, user, 1, q.n); }
    }
    function onVisit(user, map) {
        const db = getDB(); const ids = Object.keys(db.specialQuests); if (!ids.length) return;
        for (const id of ids) { const q = db.specialQuests[id]; if (q.active && q.type === 'map' && q.map === map && !claimedBy(id, user) && !progOf(id, user)) addProg(id, user, 1, 1); }
    }

    const fail = (error, code) => ({ ok: false, error, code });
    const badCodes = new Map();   // usuário -> instantes de códigos errados (no máximo 8 em 10 min: ninguém "adivinha" um código por força bruta)
    setInterval(() => { const n = Date.now(); for (const [u, a] of badCodes) { const b = a.filter((t) => n - t < 600000); if (b.length) badCodes.set(u, b); else badCodes.delete(u); } }, 300000).unref();
    function claim(user, b, ip) {
        const db = getDB(); b = b || {}; const id = typeof b.id === 'string' ? b.id : '';
        const q = ID_RE.test(id) && hasOwn(db.specialQuests, id) ? db.specialQuests[id] : null;
        if (!q || !q.active) return fail('Essa missão não está disponível.', 'INACTIVE');
        if (claimedBy(id, user)) return fail('Você já resgatou essa missão.', 'DONE');
        if (q.max > 0 && claimCount(id) >= q.max) return fail('Essa recompensa já acabou.', 'SOLD');
        let take = null;
        if (q.type === 'code') {
            const now = Date.now(), bad = (badCodes.get(user) || []).filter((t) => now - t < 600000);
            if (bad.length >= 8) return fail('Muitas tentativas erradas. Aguarde alguns minutos.', 'RATE');
            if (norm(b.code) !== norm(q.code)) { bad.push(now); badCodes.set(user, bad); sec.slog('SQ-BADCODE', user, ip, 'código errado em ' + id); return fail('Código incorreto.', 'CODE'); }
        }
        else if (q.type === 'kill' || q.type === 'map') { if (progOf(id, user) < (q.type === 'map' ? 1 : q.n)) return fail('Objetivo ainda não cumprido (' + progOf(id, user) + '/' + (q.type === 'map' ? 1 : q.n) + ').', 'PROG'); }
        else if (q.type === 'deliver') { if (have(user, q.item) < q.n) return fail('Você precisa de ' + q.n + '× ' + q.item + ' (salvos na conta).', 'PROG'); take = { item: q.item, qty: q.n }; }
        if (!hasOwn(db.specialClaims, id)) db.specialClaims[id] = Object.create(null);
        db.specialClaims[id][user] = Date.now();   // marca ANTES de entregar: o resgate nunca duplica
        const mid = extras.giveMail(user, q.reward.item, q.reward.qty, 'Missão especial: ' + q.name);
        if (!mid) { delete db.specialClaims[id][user]; return fail('O correio está cheio. Esvazie-o e tente de novo.', 'MAIL'); }
        markDirty(); giftLog({ t: new Date().toISOString(), kind: 'specialquest', quest: id, name: q.name, to: user, item: q.reward.item, qty: q.reward.qty, id: mid, ip });
        sec.slog('SQ-CLAIM', user, ip, id + ' (' + q.name + ') -> ' + q.reward.qty + 'x ' + q.reward.item, true);
        return { ok: true, item: q.reward.item, qty: q.reward.qty, take, name: q.name };
    }

    /* --- administração --- */
    function adminAct(admin, b, ip) {
        const db = getDB(); b = b || {};
        if (b.a === 'save') {
            const raw = b.quest || {}; let id = typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : null; const isNew = !id || !hasOwn(db.specialQuests, id);
            if (isNew) { if (Object.keys(db.specialQuests).length >= 60) return fail('Limite de 60 missões.'); id = 'q' + Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 5); }
            const q = cleanSQ(Object.assign({}, raw, { id, t: isNew ? Date.now() : db.specialQuests[id].t }), id);
            if (!q) return fail('Dados inválidos (nome, objetivo, recompensa).');
            if (!sec.knownItem(q.reward.item)) return fail('Item de recompensa desconhecido.');
            if (q.type === 'deliver' && !sec.knownItem(q.item)) return fail('Item de entrega desconhecido.');
            if (q.type === 'kill' && !(db.npcDB && hasOwn(db.npcDB, q.species))) return fail('Espécie desconhecida (use o id do NPC/monstro).');
            if (q.type === 'map' && !(db.worldData && hasOwn(db.worldData, q.map))) return fail('Mapa desconhecido.');
            db.specialQuests[id] = q; markDirty(); giftLog({ t: new Date().toISOString(), kind: 'specialquest-save', admin, quest: id, name: q.name, active: q.active, reward: q.reward, ip });
            sec.slog('ADMIN-SQ', admin, ip, (isNew ? 'criou ' : 'editou ') + id + ' ' + q.name, true); return { ok: true, id };
        }
        const id = typeof b.id === 'string' ? b.id : ''; if (!hasOwn(db.specialQuests, id)) return fail('Missão não encontrada.');
        if (b.a === 'toggle') { const q = db.specialQuests[id]; q.active = b.active === undefined ? !q.active : b.active === true; markDirty(); giftLog({ t: new Date().toISOString(), kind: 'specialquest-toggle', admin, quest: id, active: q.active, ip }); return { ok: true, active: q.active }; }
        if (b.a === 'delete') { delete db.specialQuests[id]; delete db.specialClaims[id]; delete db.specialProg[id]; markDirty(); giftLog({ t: new Date().toISOString(), kind: 'specialquest-delete', admin, quest: id, ip }); return { ok: true }; }
        if (b.a === 'reset') { delete db.specialClaims[id]; delete db.specialProg[id]; markDirty(); giftLog({ t: new Date().toISOString(), kind: 'specialquest-reset', admin, quest: id, ip }); return { ok: true }; }
        return fail('Ação desconhecida.');
    }
    return { list, adminList, claim, adminAct, onKill, onVisit };
};
module.exports.cleanSQ = cleanSQ;
