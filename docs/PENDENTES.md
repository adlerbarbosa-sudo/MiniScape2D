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
- Terreno orgânico em grade (`public/terrain.js`), objetos com altura/base (estante encosta na parede, construções com pés mais rasos), celeiro e placa da taverna corrigidos. Se não gostar do terreno novo, basta remover a linha do script `terrain.js` no `index.html`: o desenho antigo volta sozinho.
- Casa: poses por rotação, setas de frente na edição, visitante atualiza móveis (poll de 7 s). Magias/flechas visíveis para outros (`remotefx.js`, relé `fx` em `doSync`), música RPG por bioma (`music.js`), SFX novos, limite de pixels em telas grandes.

## Falta
- Móveis na casa de outro jogador: causa real não confirmada, testar em produção.
- Falta o evento Invasão no cliente (spawn dos invasores; precisa de teste multiplayer no servidor real).
- Teste em produção das Fendas/Reforja/Casa (o ambiente de desenvolvimento não tem `express`; a lógica de servidor foi testada em módulo e o cliente com o servidor simulado).
- Prestígio: não implementado (a Maestria após o nível 99 já cumpre o papel). Guildas: implementadas (04/10) em `social.js` (criar/convidar/expulsar/sair, chat `/gd`, XP da guilda e bônus de até +10% de XP de combate; UI no botão Social).

## Multiplayer / Eventos / Visuais (lote 15:43–15:49)
- `drops.js`: drops, árvores/rochas esgotadas e fogueiras compartilhados via sync; coleta arbitrada em `POST /api/drop` (precisa de teste online em produção).
- Equipamento/auras: payload enxuto + reenvio periódico; servidor usa equipamento salvo como fallback.
- Eventos: Dev > "Eventos" liga/desliga Fenda (padrão DESLIGADA) e Missões Especiais (`/api/admin/events`).
- Mímicos: formas (capacete draconiano, asas, capa...) e luz própria no escuro; asas animadas.
- Árvores por espécie no editor (níveis em econ.js); 4 novas casas (stone_house, longhouse, manor, cabin).
- Terreno de cor livre orgânico (`c:#hex` em terrain.js).
- Monstros humanoides: braços/armas reproporcionados, armas de perfil mais naturais.

## Lote 04/10 tarde
- Grupo: XP compartilhado (50% aos próximos), bônus +10% por companheiro próximo (até 3), HUD novo à esquerda do mapa.
- Fx remotos: números de dano, impacto, cone, raio, auras de buff/barreira (`au` no sync).
- Feito depois: Invasão no cliente (`public/invasao.js`), armadura draconiana (Mímico `b_dracarm`), pernas dos monstros de frente (`legF`), fx remotos de explosão/chuva de flechas. Validação de XP no servidor já existia (`security.js`, orçamentos de XP).
- Falta: Prestígio (só proposta, sem implementação); testar Invasão com servidor real.
