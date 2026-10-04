# Pendências (atualizado em 04/10/2026)

Leia o README.md antes de começar. Regras de trabalho: testar com Playwright em porta própria; commit com os trailers do projeto; push na `main` dispara o deploy.

## Feito
- Frente 1 (habilidades): MP e recarga, `cdr`, Aljava Mágica e capstones, bug de direção (verificado: personagem fica virado para onde andou).
- Frente 2 (itens/ofícios): venda a NPC (`sell`), nível mínimo em todos os equipamentos, árvores/rochas/Culinária/Artesanato por nível, ações mais rápidas com o nível, Mímicos com `cdr`, bug de rolagem da cor do Mímico (verificado).

## Falta
- Frente 3 (engajamento): o servidor (`engagesrv.js`, rotas `/api/engage` e `/api/daily`) e o núcleo (`public/engage.js`) estão prontos; falta a INTERFACE do cliente (recompensa diária, missões diárias/semanais, Códice, Maestria, eventos, placar do Colosso) e enviar o progresso (`prog`).
- Sistema de Pacotes de Conteúdo (JSON declarativo, sem deploy, validado, em DATA_DIR/packs, com desfazer) para itens, monstros, receitas, lojas, mapas.
