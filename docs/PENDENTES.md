# Pendências (atualizado em 04/10/2026)

Leia o README.md antes de começar. Regras de trabalho: testar com Playwright em porta própria; commit com os trailers do projeto; push na `main` dispara o deploy.

## Feito
- Frente 1 (habilidades): MP e recarga, `cdr`, Aljava Mágica e capstones, bug de direção (verificado: personagem fica virado para onde andou).
- Frente 2 (itens/ofícios): venda a NPC (`sell`), nível mínimo em todos os equipamentos, árvores/rochas/Culinária/Artesanato por nível, ações mais rápidas com o nível, Mímicos com `cdr`, bug de rolagem da cor do Mímico (verificado).

- Frente 3 (engajamento): interface Jornada (`public/engage_ui.js`, tecla N): diária, missões, Códice, Maestria, Colosso; progresso enviado por `Engage.prog`.
- Pacotes de Conteúdo: Injetor de Expansão do Dev com pré-visualização, validação, desfazer e anti-duplicação (`public/packs.js`).
- Pacote "Terras Sombrias" (porto, navio, 7 mapas de alto nível) em `docs/packs/`, gerado por `tools/gen-sombrio.js`; auditoria/auto-ligação de mapas no Dev.
- Pacote de exemplo "Reinos de Solaris" (7 mapas, chefes, itens) em `docs/packs/`, gerado por `tools/gen-expansion.js`.

- Casa: novo editor com inventário/estoque, preview que segue o mouse, girar (R) e móveis de treino automáticos com XP fixa editável no Dev (`public/world2.js`).
- Fendas (`public/fendas.js`, `engagesrv.js`): masmorra de 6 andares, níveis 1-30, modificador semanal, placar semanal, pódio e meta comunitária. Reforja com afixos (`public/reforja.js`).

## Falta
- Falta o evento Invasão no cliente (spawn dos invasores; precisa de teste multiplayer no servidor real).
- Teste em produção das Fendas/Reforja/Casa (o ambiente de desenvolvimento não tem `express`; a lógica de servidor foi testada em módulo e o cliente com o servidor simulado).
- Prestígio: não implementado (a Maestria após o nível 99 já cumpre o papel). Guildas não existem; a meta coletiva vive nas Fendas.
