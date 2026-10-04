/* MiniScape 2D — itens das Fendas (UMD: o navegador junta ao catálogo; o servidor cadastra no boot para o correio poder entregar). */
(function (root) {
    const ITEMS = {
        'Fragmento de Fenda': { name: 'Fragmento de Fenda', icon: '🔮', type: 'resource', stackable: true, weight: 0.1, value: 40, desc: 'Cacos de energia instável das Fendas. Usados para reforjar equipamentos (e como moeda de coletor).' }
    };
    if (typeof module === 'object' && module.exports) module.exports = ITEMS; else root.RIFT_ITEMS = ITEMS;
})(typeof self !== 'undefined' ? self : this);
