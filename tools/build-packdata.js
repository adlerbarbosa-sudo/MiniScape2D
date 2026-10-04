#!/usr/bin/env node
/* Copia os pacotes gerados (docs/packs) para public/packdata e escreve manifest.json com a versão = hash do conteúdo.
   Rode depois de gen-expansion.js e gen-sombrio.js. O jogo (packauto.js) aplica sozinho quando o admin entra, se a versão mudou. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const src = path.join(__dirname, '..', 'docs', 'packs'), dst = path.join(__dirname, '..', 'public', 'packdata');
fs.mkdirSync(dst, { recursive: true });
const LIST = [{ id: 'solaris', file: 'reinos-de-solaris.json', stampMap: 'colinas_ventosas' }, { id: 'sombrias', file: 'terras-sombrias.json', stampMap: 'costa_ossos' }];   // ordem de aplicação
const man = LIST.map((e) => { const buf = fs.readFileSync(path.join(src, e.file)); fs.writeFileSync(path.join(dst, e.file), buf); return Object.assign({}, e, { ver: crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8) }); });
fs.writeFileSync(path.join(dst, 'manifest.json'), JSON.stringify(man, null, 1));
console.log('packdata:', man.map((m) => m.id + '@' + m.ver).join(', '));
