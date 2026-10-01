'use strict';
/* Nomes dos Itens Mímicos (lista branca do servidor). Devem ser iguais aos de public/mimic.js. Itens Mímicos são ligados à conta: não vão ao mercado nem à troca. */
const SETS = {
    guerreiro: ['Elmo Mímico do Guerreiro', 'Peitoral Mímico do Guerreiro', 'Espada Mímica do Guerreiro', 'Escudo Mímico do Guerreiro', 'Anel Mímico do Guerreiro', 'Amuleto Mímico do Guerreiro'],
    arqueiro: ['Capuz Mímico do Arqueiro', 'Gibão Mímico do Arqueiro', 'Arco Mímico do Arqueiro', 'Anel Mímico do Arqueiro', 'Amuleto Mímico do Arqueiro'],
    mago: ['Chapéu Mímico do Mago', 'Manto Mímico do Mago', 'Cajado Mímico do Mago', 'Anel Mímico do Mago', 'Amuleto Mímico do Mago']
};
const NAMES = new Set([].concat(...Object.values(SETS)).concat(['Caixa Mímica']));
const MAXLVL = 50;
function pInt(v, a, b, d) { v = Math.floor(Number(v)); return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d; }
/* playerData.mimic = { nome: {lvl 1..50, xp >= 0} } (só nomes conhecidos) e playerData.mimicPct = 0..100 (inteiro) */
function cleanMimicData(pd) {
    if (!pd || typeof pd !== 'object') return;
    if (pd.mimic !== undefined) {
        const out = {};
        if (pd.mimic && typeof pd.mimic === 'object' && !Array.isArray(pd.mimic)) for (const k of Object.keys(pd.mimic)) {
            if (!NAMES.has(k) || k === 'Caixa Mímica') continue; const v = pd.mimic[k]; if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
            const lvl = pInt(v.lvl, 1, MAXLVL, 1); out[k] = { lvl, xp: lvl >= MAXLVL ? 0 : pInt(v.xp, 0, 1e7, 0) };
        }
        pd.mimic = out;
    }
    if (pd.mimicPct !== undefined) pd.mimicPct = pInt(pd.mimicPct, 0, 100, 0);
}
module.exports = { SETS, NAMES, cleanMimicData };
