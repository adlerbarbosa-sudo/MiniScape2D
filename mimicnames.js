'use strict';
/* Itens Mímicos (lista branca do servidor). Devem ser iguais aos de public/mimic.js.
   - Ligados à conta: não vão ao mercado nem à troca.
   - EXCLUSIVOS DO ADMIN: ninguém os obtém jogando (sem drops e sem receita). Chegam só por presente (DEV > Presentes) ou recompensa de Missão Especial,
     sempre pelo correio (db.market.mail). security.js reverte peça/aparência que apareça sem um item de correio correspondente. */
const SETS = {
    guerreiro: ['Elmo Mímico do Guerreiro', 'Peitoral Mímico do Guerreiro', 'Espada Mímica do Guerreiro', 'Escudo Mímico do Guerreiro', 'Anel Mímico do Guerreiro', 'Amuleto Mímico do Guerreiro'],
    arqueiro: ['Capuz Mímico do Arqueiro', 'Gibão Mímico do Arqueiro', 'Arco Mímico do Arqueiro', 'Anel Mímico do Arqueiro', 'Amuleto Mímico do Arqueiro'],
    mago: ['Chapéu Mímico do Mago', 'Manto Mímico do Mago', 'Cajado Mímico do Mago', 'Anel Mímico do Mago', 'Amuleto Mímico do Mago']
};
/* Aparências (skins): as 6 primeiras se desbloqueiam pelo nível da peça; as especiais só por presente do admin (item "Aparência Mímica X", que se consome ao usar). */
const SKINS = { violeta: 1, dourado: 10, carmesim: 20, gelo: 30, sombra: 40, esmeralda: 50, aurora: 0, eclipse: 0 };
const SPECIAL = { aurora: 'Aparência Mímica Aurora', eclipse: 'Aparência Mímica Eclipse' };   // id -> nome do item de presente
const SKIN_ITEMS = new Set(Object.values(SPECIAL));
const PIECES = new Set([].concat(...Object.values(SETS)));
const NAMES = new Set([...PIECES, ...SKIN_ITEMS]);
const MAXLVL = 50;
const stageOf = (lvl) => (lvl >= 50 ? 3 : lvl >= 25 ? 2 : lvl >= 10 ? 1 : 0);
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function pInt(v, a, b, d) { v = Math.floor(Number(v)); return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d; }
const FORMS = ['h_drac', 'h_horns', 'h_wing', 'h_ears', 'h_crown', 'b_wings', 'b_dragon', 'b_cape', 'b_spikes', 'b_dracarm', 'w_long', 'w_recurve', 'w_dragon', 'w_elven'];   // formas visuais (cosmético); h_ = peça de cabeça, b_ = peça de corpo
const skinOk = (id, lvl, owned) => typeof id === 'string' && hasOwn(SKINS, id) && (SKINS[id] > 0 ? lvl >= SKINS[id] : !!(owned && owned.includes(id)));
/* playerData.mimic = { nome: {lvl 1..50, xp >= 0, skin?} } (só peças conhecidas), playerData.mimicSkins = [ids especiais liberados] e playerData.mimicPct = 0..100 (inteiro) */
function cleanMimicData(pd) {
    if (!pd || typeof pd !== 'object') return;
    if (pd.mimicSkins !== undefined) { const out = []; if (Array.isArray(pd.mimicSkins)) for (const s of pd.mimicSkins.slice(0, 12)) if (typeof s === 'string' && hasOwn(SPECIAL, s) && !out.includes(s)) out.push(s); pd.mimicSkins = out; }
    if (pd.mimic !== undefined) {
        const out = {}; const owned = Array.isArray(pd.mimicSkins) ? pd.mimicSkins : [];
        if (pd.mimic && typeof pd.mimic === 'object' && !Array.isArray(pd.mimic)) for (const k of Object.keys(pd.mimic)) {
            if (!PIECES.has(k)) continue; const v = pd.mimic[k]; if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
            const lvl = pInt(v.lvl, 1, MAXLVL, 1); const o = { lvl, xp: lvl >= MAXLVL ? 0 : pInt(v.xp, 0, 1e7, 0) };
            if (v.skin !== undefined && v.skin !== 'violeta' && skinOk(v.skin, lvl, owned)) o.skin = v.skin;   // aparência inválida/não liberada volta ao padrão
            if (typeof v.form === 'string' && FORMS.includes(v.form)) o.form = v.form;
            out[k] = o;
        }
        pd.mimic = out;
    }
    if (pd.mimicPct !== undefined) pd.mimicPct = pInt(pd.mimicPct, 0, 100, 0);
    /* campos visuais dos itens (msk/mst) sempre vêm do estado já limpo */
    const fix = (it) => { if (!it || typeof it !== 'object' || typeof it.name !== 'string' || !PIECES.has(it.name)) return; const s = pd.mimic && hasOwn(pd.mimic, it.name) ? pd.mimic[it.name] : null; if (s) { it.mst = stageOf(s.lvl); if (s.skin) it.msk = s.skin; else delete it.msk; if (s.form) it.mfm = s.form; else delete it.mfm; } else { delete it.msk; delete it.mst; delete it.mfm; } };
    for (const l of [pd.inventory, pd.bank]) if (Array.isArray(l)) l.forEach(fix);
    if (pd.equipment && typeof pd.equipment === 'object') for (const s of Object.keys(pd.equipment)) fix(pd.equipment[s]);
}
/* equipamento enviado aos outros jogadores: estágio e aparência vêm do estado SALVO no servidor (o cliente não escolhe o que os outros veem) */
function syncVisual(eq, pd) {
    if (!eq || typeof eq !== 'object') return eq;
    for (const s of Object.keys(eq)) { const it = eq[s]; if (!it || typeof it.name !== 'string') continue; delete it.msk; delete it.mst; delete it.mfm;
        if (!PIECES.has(it.name)) { if (it.mimic) delete it.mimic; continue; }
        const st = pd && pd.mimic && hasOwn(pd.mimic, it.name) ? pd.mimic[it.name] : null; it.mimic = true; if (st) { it.mst = stageOf(st.lvl); if (st.skin) it.msk = st.skin; if (st.form) it.mfm = st.form; } }
    return eq;
}
module.exports = { SETS, SKINS, SPECIAL, SKIN_ITEMS, PIECES, NAMES, stageOf, cleanMimicData, syncVisual };
