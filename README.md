# MiniScape 2D

MMO 2D estilo RuneScape: servidor Node/Express + cliente em canvas (`public/index.html`).
Editor de mapas, itens e NPCs integrado (aba **DEV**, só para admin).

## Rodar
```
npm install
ADMIN_PASSWORD=sua-senha-forte npm start
```
Abra http://localhost:3000 e entre com usuário `Admin` e a senha definida.

## Variáveis de ambiente
| Nome | Para quê |
|---|---|
| `ADMIN_PASSWORD` | senha do admin (**defina sempre**). Sem ela, o servidor gera uma senha aleatória e mostra nos logs. |
| `ADMIN_USER` | nome da conta admin (padrão `Admin`) |
| `DATA_DIR` | pasta do `database.json`. No Render, aponte para um **Disk** persistente (ex.: `/data`) para não perder contas. |
| `PORT` | porta (padrão 3000) |

## Segurança
- Senhas com scrypt; sessão por token (24h); rate limit em login/registro/chat.
- Só admin altera mundo, itens, NPCs, cargos, backup e restauração.
- Ninguém consegue se registrar como admin; `database.json` não vai mais para o Git.

## Multiplayer
- O servidor escolhe 1 "host" por mapa que simula os monstros e repassa as posições; os outros jogadores só interpolam.
- Vida/morte/respawn dos monstros é decidida pelo servidor; cada jogador recebe o próprio dano.

## Arte e catálogo
- `public/art.js` e `public/artworld.js`: toda a arte é desenhada em código (canvas), sem imagens: criaturas animadas, humanos/NPCs, prédios, decoração, árvores, minérios, terreno e efeitos.
- `public/catalog.js`: dados de criaturas (com `species`, `behavior`, `range`, `speed`), itens, construções e decoração. É mesclado com o banco salvo no login; o que o admin editou vale mais que o catálogo.
- `/catalogo.html`: catálogo visual com todos os monstros, animais, NPCs, prédios e itens.
- Comportamentos: `aggressive` (ataca ao ver), `neutral` (revida), `passive` (foge se atacado), `skittish` (foge ao ver), `npc`.
- Admin: DEV → Mapas → "Instalar mapas novos" troca os 5 mapas padrão pelo mundo medieval (baixa um backup antes).

## Conteúdo e sistemas (módulos em `public/`)
- `env.js`: ciclo de dia e noite (20 min reais por dia), clima por mapa (chuva, neblina, tempestade), luzes de lampiões e cristais. Cavernas e catacumbas ficam sempre escuras; a casa tem luz própria.
- `sfx.js`: sons e música sintetizados por WebAudio (sem arquivos). Volumes na aba Menu.
- `quests.js`: missões de NPC com marcador `!`/`?`, entrega segura e integração ao diário. Novas missões: `Quests.add({...})`.
- `content.js`: carvão e mithril, aço e mithril (fornalha), agricultura (canteiros, sementes do Fazendeiro, crescimento em tempo real), alquimia (caldeirão) e encantamento (mesa). Os itens/peças são colocados uma única vez por mapa (`m.c3`), sem sobrescrever o que o admin editou.
- `world2.js`: Bestiário (aba Ofícios), Casa do Aventureiro e Catacumbas com o Lich Rei Ossian.
  - A casa é o mapa `casa`: cada jogador decora a sua (guardada em `playerData.house`); os móveis são reconstruídos localmente e nunca vão para o mundo salvo.
  - **Porta de casa (Dev):** no painel Dev > Estações, "Porta de Casa (dono)" — coloque sobre a porta de qualquer construção e informe o nome do dono. A peça é invisível (só aparece tracejada no modo Dev e como plaquinha quando o jogador chega perto). O dono decora e convida jogadores por nome (Decorar > Visitantes autorizados); a lista fica em `playerData.house.guests` e o acesso é checado no servidor (`POST /api/house`). Cada casa é uma instância separada no multiplayer (`casa_<dono>`).
  - Os mapas `casa` e `catacumbas` (e a entrada no Covil) são criados pelo admin no login e salvos no servidor; jogadores comuns os recebem depois disso.
- `ui.js` e `ui.css`: tema, tela de login, livro de ofícios, guia (H), rastreador de missões.

## Notas de operação
- Nada disso exige reinstalar mapas: o conteúdo novo entra sozinho no mundo salvo quando o admin entra (o mundo é salvo logo em seguida). Quem já editou os mapas mantém tudo.
- Dados de jogador (fazenda, buffs, missões, bestiário, casa) ficam em `playerData`, salvo no servidor.

## Rede, grupo, troca e SQLite
- `wsserver.js`: WebSocket em `/ws` sem dependências. O cliente (`public/net.js`) usa WebSocket para o sync e cai para HTTP sozinho se o host não suportar (tenta 3 vezes e desiste). Nada muda no jogo se o WebSocket não funcionar.
- `social.js`: grupo (até 5, vida dos membros na tela, chat só do grupo com `/g texto`) e troca entre jogadores em fases: convite, oferta, os dois confirmam, cada lado tira as peças da mochila para um depósito salvo no personagem, só então cada um recebe. Se algo falhar, o depósito volta. Trocas pendentes ficam gravadas no banco até os dois confirmarem. Itens encantados não são trocáveis.
- `STORAGE=sqlite` (opcional, Node 22.5+): grava em `database.sqlite` (uma linha por conta, só o que mudou) em vez de `database.json`. Na primeira execução o `database.json` existente é importado e mantido. Sem a variável, tudo continua como antes. Backups por hora em `backups/` (`.sqlite` neste modo).

## Vida no mundo, mercado e ranking
- `public/life.js`: conquistas (com título ao lado do nick), 3 missões diárias por dia (mudam à meia-noite, com sequência e bônus), pesca por clima e hora (salmão na chuva, enguia na neblina, peixe-lua à noite, carpa dourada de dia), emotes (balões; `/e heart`) e o **Colosso de Pedra**, chefe de mundo que aparece na Vila por 25 minutos a cada hora cheia (horário definido pelo servidor). Todo mundo que causar dano ganha a recompensa. O chefe não é salvo no mundo.
- `public/hub.js`: Diário do Aventureiro (tecla **J**; **M** abre o mapa): diárias, conquistas, mercado, ranking, mapa-múndi e emotes.
- `extras.js` (servidor): `/api/market` e `/api/rank`. O mercado usa **correio com confirmação**: quem vende/compra grava a operação pendente no personagem antes de falar com o servidor (o mesmo `nonce` nunca duplica), e itens/moedas chegam pelo correio, que só é apagado depois que o cliente entrega e salva. Taxa de 5%, anúncios de 3 dias (depois voltam pelo correio), no máximo 8 por jogador. O ranking sai dos personagens salvos (cache de 30 s).
- `public/qol.js`: barra rápida de poções/comida (teclas 1–5, botão direito troca o item) e qualidade gráfica (Menu; ajusta sozinha se o jogo ficar lento).
- `public/fx.js`: números de dano (com golpes fortes), morte animada e partículas (poeira, lascas, faíscas, respingos).
- `public/sfx.js`: chuva em camadas (lençol de água + gotas individuais), vento, pássaros, grilos, coruja, sapos, água e pingos de caverna, tudo gerado por código.
