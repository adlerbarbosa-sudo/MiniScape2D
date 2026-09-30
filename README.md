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

## Criação de personagem e aparência
- **Criar novo aventureiro** (tela de login) abre o painel de criação (`public/chargen.js`): nick (mesmas regras do servidor: 2 a 20 letras/números/espaço/`_ . -`), sexo, raça, classe, cabelo (8 estilos + cores), cor da pele (paleta por raça) e cor da roupa, com prévia animada (frente/lado/costas). Só ao confirmar a conta é criada (`POST /api/register`) e o login é automático; erros do servidor (nome em uso etc.) voltam ao painel sem perder as escolhas. Também funciona offline (localStorage).
- **Classes** (todas recebem Picareta e Machado de Bronze, Isqueiro, Rede e 100 moedas): Guerreiro = Espada + Escudo de Bronze equipados, +3 vida máx; Arqueiro = Arco curto equipado + 50 flechas de bronze como munição; Mago = Cajado equipado + 50 runas de Ar e 50 de Mente, +8 mana máx.
- **Raças** (bônus pequenos, sem mexer em fórmulas de combate): Humano +5% de XP (em `addXP`), Elfo +4 mana máx, Anão +4 vida máx, Orc +2 vida máx e −2 mana máx (mana nunca abaixo de 6). Escala visual entre −10% e +10% (anão mais baixo e largo, elfo mais esguio, orc mais largo); hitbox e jogabilidade não mudam.
- `player.look` (`{sex, race, hairStyle, hair, skin, shirt, pants, beard}`), `player.cls` e `player.race` ficam no `playerData`. Contas antigas ganham uma aparência padrão estável (masculino, humano, cabelo curto, cores de antes) e o botão **Mudar aparência** (aba Menu) reabre o painel só com a parte visual (grátis; não troca classe, raça de bônus nem itens).
- Multiplayer: o cliente manda `look` no `/sync` quando muda (e a cada ~10 s por segurança); o servidor (`cleanLook` em `server.js`) só aceita sexo `m|f`, raça `human|elf|dwarf|orc`, `hairStyle` inteiro 0–7 e cores `#rrggbb`; qualquer outra coisa é descartada e o valor anterior (ou o salvo em `playerData.look`) é mantido. Só os campos conhecidos são guardados e reenviados aos outros jogadores.
- Arte (`public/art.js`): `Art.human(g, o)` aceita `sex, race, hairStyle, hair, skin, shirt, pants`; `Art.drawPlayer(..., extra)` usa `extra.look`; `Art.drawLook(ctx, x, y, look, view, {t, scale, weapon, shield, body, head, flip, anim, mv, ph})` desenha a prévia (pés em x,y) sem nome. De costas, a arma é desenhada atrás do tronco e o escudo fica preso nas costas; a capa do jogador foi removida (NPCs com capa usam a capa nova, que funciona nas 3 vistas).

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

## Mundo expandido: 26 mapas novos (`public/maps2.js`)

**História.** Aldeburgo prospera, mas o **Rei Esquecido Aldric** despertou na cripta sob o Cemitério das Brumas e o general **Morthak** reergueu a Fortaleza para servi-lo; ao sul, o **Dragão Negro Kharzul** acordou no vulcão. A Coroa abriu a **Vila Real** e chama aventureiros: a oeste o bosque élfico de Silvaluz guarda a torre do **Mago Louco Zarthul**; ao sul o Vale do Rio leva ao Porto de Marés e ao Pântano (covil do chefe goblin **Grakk**); a leste o deserto esconde as ruínas do **Faraó Sahr-Kal**; ao norte a serra leva à mina abandonada (**Grumbak**) e ao Vale Gelado do gigante **Hrimgar**.

**Como funciona.** O admin, ao entrar, cria os mapas que faltam (`World2.placeInWorld` → `Maps2.place`); tudo é idempotente (mapa só nasce se `!maps[id]`; portas em mapas antigos levam a marca `c6` + `Content.mark()`). Os outros jogadores recebem os mapas pelo `worldData` salvo no servidor. Mapas antigos só ganham portais (pilares de luz ao lado, pouso livre ao lado do portal de volta). Dentro das cidades há banco e guardas/mercadores numa zona sem monstros. O nome do portal agora aparece em cima dele e na dica.

| id | Nome | Tamanho | Nível sugerido | Liga com |
|---|---|---|---|---|
| campos | Campos de Aldeburgo | 2000x1400 | 1-5 | Vila de Aldeburgo, Estrada do Rei |
| estrada_rei | Estrada do Rei | 1600x700 | 3-6 | Campos, Vila Real |
| vila_real | Vila Real | 1800x1300 | cidade | Estrada do Rei, Estrada das Areias, Estrada Sombria |
| trilha_elfica | Trilha Élfica | 700x1600 | 6-10 | Floresta Sombria, Silvaluz |
| silvaluz | Bosque Élfico de Silvaluz | 2000x1400 | 12-20 | Trilha Élfica, Torre do Mago |
| torre_mago | Masmorra da Torre do Mago | 1600x1400 | 34-65 | Silvaluz |
| estrada_costa | Estrada da Costa | 700x1600 | 4-8 | Vale do Rio, Porto de Marés |
| porto_mares | Porto de Marés | 1800x1300 | cidade | Estrada da Costa, Praia dos Naufrágios |
| praia_naufragios | Praia dos Naufrágios | 2000x1400 | 9-14 | Porto de Marés |
| pantano | Pântano de Brejo Negro | 2000x1400 | 10-16 | Vale do Rio, Covil dos Goblins |
| covil_goblins | Covil dos Goblins | 1600x1200 | 8-28 | Pântano |
| estrada_areias | Estrada das Areias | 1600x700 | 10-14 | Vila Real, Deserto |
| deserto | Deserto de Sahr | 2000x1400 | 14-22 | Estrada das Areias, Oásis |
| oasis | Oásis de Lahur | 1600x1100 | cidade | Deserto, Ruínas |
| ruinas | Ruínas de Sahr-Kal | 2000x1400 | 28-45 | Oásis |
| trilha_serra | Trilha da Serra | 700x1600 | 12-18 | Mina de Pedra, Pedralta |
| pedralta | Pedralta | 1800x1300 | cidade | Trilha da Serra, Mina Abandonada, Passo Gelado |
| mina_abandonada | Mina Abandonada de Pedralta | 1600x1200 | 20-45 | Pedralta |
| passo_gelado | Passo Gelado | 1800x800 | 22-32 | Pedralta, Vale Gelado |
| vale_gelado | Vale Gelado de Hrimgar | 2000x1400 | 32-55 | Passo Gelado |
| estrada_sombria | Estrada Sombria | 700x1600 | 14-20 | Vila Real, Cemitério |
| cemiterio | Cemitério das Brumas | 2000x1400 | 18-28 | Estrada Sombria, Catacumba, Fortaleza |
| cripta_real | Catacumba do Rei Esquecido | 1600x1400 | 30-70 | Cemitério |
| fortaleza | Fortaleza de Morthak | 2000x1400 | 38-60 | Cemitério, Vulcão |
| vulcao | Vulcão Brasa-Viva | 2000x1400 | 45-65 | Fortaleza, Ninho do Dragão |
| ninho_dragao | Ninho do Dragão Negro | 1600x1200 | 50-80 | Vulcão |

Também adiciona 38 criaturas novas (mescladas em `npcDB` só se ainda não existirem) e 11 decorações novas (rochedo, cacto, palmeira, barco, árvore seca, coluna, sarcófago, lava, juncos, espinho de gelo, rede). O mapa-múndi (`hub.js`) está descrito na seção abaixo.

## Proteção contra clique acidental e Ofícios
- `public/itemsel.js`: na mochila (e nos slots equipados) um clique só **seleciona** o item e mostra a barra Usar/Comer/Equipar · Jogar fora · Cancelar; clique/toque duplo usa direto; Esc, clicar fora ou trocar de aba cancela; arrastar (`inv2.js`) não seleciona. Menu > **Confirmar uso de itens** (padrão ligado, `localStorage ms_confirm_use`) volta ao clique direto. Barra rápida 1–5 continua direta. Compras caras (NPC ≥ 100 moedas) e do mercado pedem um segundo toque.
- Ofícios (`ui.js`): clicar numa receita só a seleciona (detalhe no topo: ingredientes possuídos/necessários, resultado, quantidade −/+/Máx); apenas o botão **Criar** (ou Enter no campo/receita focada) fabrica (`craftItem(nome, vezes)` em `index.html`, com `craftInfo` para máximo possível). O painel só é reconstruído quando algo muda (antes, cliques se perdiam quando a lista era redesenhada entre o botão pressionado e solto).

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
- `public/inv2.js`: arrastar e soltar (mouse e toque) na mochila: trocar de lugar, pôr na barra rápida ou jogar no chão (pilhas perguntam a quantidade; itens encantados não podem ser jogados).
- `public/qol.js`: barra rápida (teclas 1–5): o jogador arrasta qualquer item da mochila para um slot (guardado por nome em `player.qb`); botão direito limpa, arrastar troca de lugar e qualidade gráfica (Menu; ajusta sozinha se o jogo ficar lento).
- `public/fx.js`: números de dano (com golpes fortes), morte animada e partículas (poeira, lascas, faíscas, respingos).
- `public/sfx.js`: chuva em camadas (lençol de água + gotas individuais), vento, pássaros, grilos, coruja, sapos, água e pingos de caverna, tudo gerado por código.

## Pesca, ataque à distância, água e desempenho
- `public/fishing.js`: **Rede de Pesca** (rápida, 1 a 3 peixes comuns por ciclo, sem isca, XP menor; às vezes acha Isca de Camarão) e **Vara de Pesca** (mais lenta, gasta 1 isca por tentativa; sem isca pega pouco e só peixe comum). Iscas: **Minhoca** (comum, pacote de 10 no Pescador/Mercador; menos fuga), **Isca Brilhante** (+raridade, +XP), **Isca de Camarão** (Robalo e peixes grandes, Pesca 12), **Isca Dourada** (tudo isso + 12% de baú do tesouro). Especiais vêm de baús, de peixes raros e da rede. Clique numa isca da mochila (ou na barra rápida) para escolhê-la; clicar de novo volta ao automático (melhor isca primeiro). Botão direito no ponto de pesca escolhe Rede ou Vara; a linha de texto mostra a isca em uso. A vara se fabrica (2 Logs + 1 Wool) ou se compra. Peixes novos: Truta (Pesca 5) e Robalo (Pesca 12), com versões assadas. Peixes do clima (salmão, enguia, peixe-lua, carpa dourada) agora saem da vara com isca.
- Bug da rede: o item se chamava `Net` mas o nome guardado era `Fishing Net`, e o código procurava o nome `Net` (nunca achava). Agora é `Rede de Pesca` (chave = nome); contas antigas (mochila, banco, equipamento, barra rápida) e lojas são migradas sozinhas no login (`Fishing.migrate/merge`).
- Ataque no clique: com arco ou cajado, clicar no inimigo (mouse ou toque) faz o personagem parar no alcance (arco 220, cajado 200, com linha de visão), virar e atacar sozinho no ciclo normal (gasta flechas/runas; sem munição mostra "Sem flechas equipadas!"/"Sem runas!" e para). Fora do alcance ele persegue só até entrar; clicar no chão, em outra coisa ou andar cancela. Corpo a corpo não mudou. Um anel vermelho marca o alvo.
- Água: bichos terrestres não entram na água (e, se já estão dentro, saem para a margem); voadores ignoram; cobras nadam. Quem está na água é desenhado com só a parte de cima aparecendo (linha d'água, ondinhas e parte de baixo esmaecida), inclusive o jogador. A colisão do jogador não mudou. `Art.isWater(mapa, x, y)` usa uma grade refeita quando a pintura muda.
- Desempenho (`artworld.js`): o chão e toda a pintura (caminhos, água base, costa) ficam num cache por mapa, refeito só quando o mapa muda (enquanto o admin edita, a pintura é desenhada ao vivo e depois reassada); só as ondinhas da água são animadas. Árvores, prédios e decoração viram sprites em canvas (cache LRU); fumaça e bandeiras dos prédios continuam animadas ao vivo e desenhos que se mexem de verdade (fonte, cristal, moinho...) continuam vetoriais. O contexto 2D é `alpha:false, desynchronized:true`; sem `ctx.filter` nem `shadowBlur`. **Menu > Gráficos** (Alto/Médio/Baixo, `localStorage ms_quality`): Baixo corta partículas ambientes, luzes, sombras de criaturas e ondinhas; se o fps medido ao entrar ficar abaixo de 40 o jogo passa sozinho para Médio (e abaixo de 26 para Baixo), a menos que o jogador já tenha escolhido.

## Deploy automático (Oracle/VPS)
`deploy/oracle-setup.sh` instala tudo; `deploy/hook.js` é um webhook que o GitHub chama a cada push na `main`. A VM faz `git fetch`, `npm install`, reinicia o jogo e confere `/healthz`; se o jogo não subir, volta sozinha para a versão anterior. O webhook só aceita chamadas com assinatura HMAC (segredo em `/etc/miniscape.hook`). As contas ficam em `/var/lib/miniscape`, fora do código, e nunca são tocadas pelo deploy. Logs: `journalctl -u miniscape-hook -f`.

Servidor de produção: https://miniscape2d.duckdns.org (Oracle Cloud, São Paulo).

## Mapa-múndi, moedas e celular

**Mapa-múndi (`hub.js`, tecla M).** Lista *todos* os mapas (menos `casa`/`casa_*`), cada um em uma célula própria: `WM_POS` fixa a geografia dos mapas conhecidos (Aldeburgo no centro; oeste = floresta/Silvaluz/torre; leste = Campos, Vila Real, deserto; norte = serra, Pedralta, gelo; sul = Vale do Rio, costa, pântano; sudeste = Estrada Sombria, cemitério, fortaleza, vulcão, ninho do dragão). Mapas fora da tabela usam `gridX/gridY` se a célula estiver livre; senão ficam na célula livre mais próxima de um mapa ligado por portal (determinístico). A grade se ajusta ao modal, tem botões − / + / Ajustar, arrasto com o mouse, rolagem nativa no toque e linhas tracejadas entre mapas ligados. Tocar num mapa mostra criaturas, NPCs, recursos e portais (não viaja, como antes). `gx/gy` de `maps2.js` foram alinhados a essa geografia.

**Moedas e pilhas.** O limite antigo (254 por pilha, em `addInvItem`/`invSpaceFor`/banco/fabricação/troca) virou `STACK_MAX = 2.147.483.647` para todo empilhável: Coins ocupa 1 slot só. Exibição: `fmtNum` (1.234.567) na dica/mercado/troca e `fmtQty` na célula (99.999, 100K, 1,2M, 2,1B). Banco junta pilhas e retira o que couber; `mergeStacks` roda no login e junta pilhas repetidas de Coins/empilháveis (mochila e banco) e corrige quantidades inválidas. Servidor: troca (`social.js`) e mercado (`extras.js`) aceitam quantidade/preço até 2.147.483.647; a troca ganhou o campo "Quantidade por clique". `playerData` segue opaco no servidor (só limite de tamanho).

**Celular (`mobile.js`, `html.touch` em `ui.css`).** Liga em aparelhos de toque (`pointer:coarse`) ou com `?touch=1`. Só paisagem: em retrato aparece "Gire o celular para jogar" (+ botão Tela cheia, que também tenta `screen.orientation.lock('landscape')`). Canvas ocupa a tela (100dvh, safe-area, sem rolagem da página, `touch-action`/`overscroll-behavior` bloqueiam pinça, toque duplo e puxar para atualizar). O painel vira gaveta (botão da mochila; abre sozinha em loja/banco; tocar no mundo fecha). Metade esquerda: joystick flutuante discreto (8 direções, zona morta; toque curto = interagir como clique); metade direita: tap-para-interagir, segurar = menu. Botões AÇÃO (Espaço) e Atacar de 78/58 px, HUD de vida/mana compacto, chat como sobreposição (botão de chat), barra rápida compacta. Desktop não muda.

**Piscadas no celular.** Suspeitas principais: `desynchronized:true` (removido), canvas redimensionado dentro do quadro quando a barra de endereço/teclado/rotação mudava o tamanho (agora só em eventos, com debounce de 140 ms, via `resizeCanvas`), cache de chão em 2 canvases do tamanho do mapa (agora blocos de 512 px sob demanda, LRU de 48, no máximo 513x513 cada), `will-change`/`translateZ` no canvas e `backdrop-filter` sobre o canvas (removidos no toque). Menu > Gráficos: Baixo no celular desenha em 75% da resolução (`Quality.renderScale`); celular começa em Médio.
