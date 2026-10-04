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
| `REG_PER_IP_HOUR` | contas novas por IP por hora (padrão 5; `0` = sem limite) |
| `SECURITY_STRICT` | `1` (padrão) aplica as correções da validação de save/sync; `0` só registra no `security.log` (modo observação) |
| `SEC_LOCK_STRIKES` | nº de infrações em 30 min que suspende os saves por 10 min (padrão 40) |
| `MOB_RESPAWN_MS` | tempo para monstros comuns voltarem depois de mortos (padrão 15000). O servidor decide, mesmo sem admin online e com o mapa vazio |
| `BOSS_RESPAWN_MS` | idem para chefes de área, `group:'chefe'` (padrão = `MOB_RESPAWN_MS`; o chefe de mundo volta a cada hora cheia) |

## Segurança
O jogo é **cliente-autoritativo** (inventário, XP, moedas e posição nascem no navegador), então o servidor faz validação de envelope e de plausibilidade, sem nunca atrapalhar quem joga limpo.

**Contas e sessão**
- Senhas com scrypt + comparação em tempo constante (contas antigas em texto puro migram no próximo login). Mínimo 6 caracteres; lista de senhas triviais e "senha igual ao nome" são recusadas.
- Token aleatório de 32 bytes, validade de 30 dias renovável (1 gravação/h); sair invalida o token no servidor.
- **Sessão única por conta** (vale para todos, inclusive admin): um novo login derruba o anterior na hora. O servidor guarda só um token válido por conta (`sid` cresce a cada login) e marca os antigos como "derrubados" (motivo `outro_login`); qualquer rota (sync, save, mercado, troca/social, casa, chat, ranking, admin, missões, WebSocket) responde **401 `code:'session_replaced'`** para o token antigo (`code:'AUTH'` continua sendo "expirou"). No login o servidor: grava o último save válido; remove o jogador antigo do mapa (sem fantasma); cancela convites/trocas abertas (o depósito volta a quem já tinha tirado da mochila); fecha o WebSocket antigo; e registra `[session_replaced]` no `security.log` (com limite de frequência). Logins simultâneos da mesma conta são atendidos em fila (mutex por usuário): só o último vence. Um save da sessão antiga que chegue depois da derrubada (inclusive um corpo grande ainda sendo lido) é descartado e nunca sobrescreve o da sessão nova, o que impede duplicar itens usando duas abas (banco, troca, drop, mercado). O cliente, ao receber `session_replaced`, para o loop e a sincronização, não salva de volta, não reconecta sozinho e mostra "Sua conta foi conectada em outro lugar. Você foi desconectado." com o botão **Entrar novamente** (volta ao login). A sessão nova recebe o aviso "Você desconectou outra sessão desta conta" quando a outra estava online. Os tokens derrubados ficam gravados (JSON/SQLite) para o aviso funcionar mesmo após reiniciar o servidor.
- Login: atraso progressivo por usuário (até 3 s, nunca bloqueia a conta) e bloqueio curto de 5 min por IP/usuário só depois de muitas falhas seguidas. Registro: `REG_PER_IP_HOUR` contas por IP por hora.
- Só admin altera mundo, itens, NPCs, cargos, backup/restauração e dá itens; toda rota admin confere a sessão e o cargo **no servidor**.

**Rede e cabeçalhos**
- Sem CORS aberto: só mesma origem (chamadas de outro site são recusadas; `file://` só em loopback). `x-powered-by` desligado.
- CSP (`default-src 'self'`, sem frames, `object-src 'none'`; `unsafe-inline` ainda é necessário porque o cliente tem script/estilo inline), `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS em HTTPS.
- Limite de corpo por rota (login/chat 4 KB, social/casa/mercado 16 KB, sync 64 KB, save 8 MB, restore 30 MB), JSON profundo/`__proto__`/NaN são recusados ou limpos.
- Arquivos sensíveis (`database.json`, `.env`, `security.log`, dumps) não são servidos; `%00`, `\` e `..` nas URLs dão 400/404.
- `deploy/hook.js`: HMAC `timingSafeEqual`, payload máx. 2 MB, só `refs/heads/main`, escuta em 127.0.0.1.
- XSS: texto de jogador (nome, chat, título, pet, casa, mapa-múndi, anúncios) é escapado ou entra via `textContent`; o servidor também normaliza nomes de habilidade, `house.items/guests` e equipamento visto por outros.

**Validação de save e sync (`security.js`)**
- Envelope: itens só com nomes conhecidos (catálogo do jogo + `itemnames.json` + `learned-items.json` aprendido do admin), quantidade inteira 1..2.147.483.647, campos numéricos com teto, listas (mochila 40, banco 130) e subobjetos limpos por whitelist.
- Plausibilidade com **orçamento por minuto** (balde) para moedas, itens empilháveis/não-empilháveis, itens novos distintos, XP por habilidade, níveis de Mímico, coleções (pets/montarias/Mímicos) e XP de montaria. Os tetos são generosos de propósito; só o campo suspeito volta ao valor do save anterior e conta uma infração. Ganhos legítimos entregues pelo servidor (correio do mercado, trocas, presentes) são descontados.
- Infrações: com `SEC_LOCK_STRIKES` em 30 min os saves ficam suspensos por 10 min (HTTP 423). Contas **nunca** são apagadas e o admin é isento. 1 caso isolado só gera log.
- Posição/velocidade: deslocamento acima de 3x o máximo possível (270 px/s) em 2 s ignora a posição enviada (e, se persistir por 3 syncs, é aceito como teleporte/respawn); nunca desconecta por uma ocorrência.
- Combate: dano por golpe tem teto pelo nível de combate, máx. 20 reports/s, vida máxima do mob vem do mundo (não do cliente) e um chefe não morre com 1 report.
- Limites de ritmo: chat ≤ 200 caracteres, 700 ms entre mensagens, 20/min e mensagem repetida; sync 25/s por usuário e 150/s por IP; save com rajada máx. 12 por 10 s; WebSocket ≤ 20 conexões por IP.
- `DATA_DIR/security.log` (rotativo, 1 MB + `.1`) registra infrações, saves recusados, locks, ações de admin (cargo, backup, restore, presentes).

**O que continua sendo do cliente (limitações conhecidas)**
- Itens, XP e moedas ganhos *dentro dos tetos* vêm do gameplay local e não são reconferidos; recompensas de chefe e posição salva também.
- Colisão com parede, alcance de ataque e linha de visão não são validados no servidor; um cliente adulterado pode atravessar paredes ou bater de longe (dentro do teto de dano e de velocidade).
- `unsafe-inline` na CSP; o token fica só em memória, mas o modo offline (servidor fora do ar) guarda a senha no `localStorage` do próprio navegador.
- Recomendações: HTTPS atrás de proxy, `ADMIN_PASSWORD` forte, backup do `DATA_DIR`, acompanhar o `security.log` na primeira semana de testes (`SECURITY_STRICT=0` para só observar), e, para o futuro, mover inventário/loot para o servidor.

### Protocolo cliente-servidor (save, mercado, troca, loot)
O cliente (`public/index.html`, `hub.js`, `net.js`) fala exatamente este protocolo; mudar um lado sem o outro quebra o jogo.
- **`POST /api/save`**: leva `seq` crescente (baseado no relógio, sobrevive a recarregar a página; o servidor ignora `seq` menor ou igual ao último da sessão). Os saves saem em fila (nunca dois ao mesmo tempo; chamadas simultâneas viram um save só com o estado mais novo) e `saveDataNow()` devolve `true` só se o servidor gravou. Respostas: **423 `LOCKED`** (`until`, `retryAfter`): o cliente para de salvar até acabar a pausa e avisa "Seu progresso está temporariamente em pausa por atividade suspeita (volta em N min)" (também avisado via `lock` do `/sync`); **429 `RATE`**: recuo de 3, 6, 12 s, sem laço; **400 `INVALID`**: aviso único; **200 com `adjusted`/`warn:'ADJUSTED'`**: aviso "Alguns valores foram ajustados pelo servidor" e `GET /api/me` aplica o estado do servidor só em mochila, banco, equipamento, perícias e Mímicos; `warnings` (save de mundo do admin) aparecem em Dev > Mapas e em `window.lastWorldWarnings`.
- **Mercado (duas fases)**: remove o item/moedas da mochila, grava `player.mkt` (nonce) e **salva com confirmação**; só então chama `create`/`buy`. Se vier "Salvamento pendente", salva de novo e repete **uma** vez (se o save não confirmar, a operação fica pendente e tenta depois; nada é devolvido nem duplicado). Recusa definitiva devolve o item/moedas. O correio entrega à mochila, **salva** (`pd.mailDone`) e só então manda `ack`.
- **Troca**: `trade_ready` só sai depois do save do depósito (`pd.escrow`) confirmar; se não salvar, o depósito volta e a troca é cancelada. Em `done` o cliente entrega, salva (`pd.tradeDone`) e só então manda `trade_ack`; "Salvamento pendente" salva de novo e repete uma vez, com espera entre tentativas.
- **Loot de monstro (online)**: o golpe final só gera loot quando o `/sync` devolve o id do monstro em `kills[]` (o servidor decide quem matou); mortes simultâneas não duplicam e o modo offline continua soltando na hora.
- Dev: os campos de texto de item (presentes, missões especiais, editor de itens) só aceitam os caracteres de `ITEM_RE` (`security.js`), até 40.

## Multiplayer
- O servidor escolhe 1 "host" por mapa que simula os monstros e repassa as posições; os outros jogadores só interpolam.
- Vida/morte/respawn dos monstros é decidida pelo servidor; cada jogador recebe o próprio dano.
- **Respawn autoritativo**: o servidor guarda a hora da morte de cada monstro em `db.mobDeaths` (persistida em `database.json`/SQLite) e um relógio de 1 s (`tickRespawns`) reativa chefes de área (`BOSS_RESPAWN_MS`), monstros comuns (`MOB_RESPAWN_MS`) e o chefe de mundo (regra própria, a cada hora cheia). Não depende de ninguém online (nem do admin), de o mapa estar vazio nem de quem salvou o mundo por último; reiniciar o servidor mantém os mortos até o prazo e quem passou do prazo volta ao subir. Mapas `casa_` não participam. Mundo salvo com monstro `active:false`/`hp:0` é curado (`healWorld`/`cleanWorld`) e o cliente também reativa o monstro quando o servidor não tem mais registro dele (`syncMultiplayer`). A sincronia segue validada pelo `security.js` como antes.

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
- `env.js`: ciclo de dia e noite (20 min reais por dia), clima e luz por região com transições suaves (chuva, tempestade, neblina, neve, areia, cinzas, calor, névoa sombria; tabela na seção *Clima por região*), luzes de lampiões, tochas e cristais. Interiores (casas, cavernas, catacumbas, torres) nunca têm chuva e ficam escuros, com tochas nas paredes.
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

**Como funciona.** O admin, ao entrar, cria os mapas que faltam (`World2.placeInWorld` → `Maps2.place`); tudo é idempotente (mapa só nasce se `!maps[id]`; portas em mapas antigos levam a marca `c6` + `Content.mark()`). Os outros jogadores recebem os mapas pelo `worldData` salvo no servidor. Os mapas externos se ligam **andando até uma abertura de estrada na borda** (seção *Passagens naturais*); só lugares fechados (masmorras, cavernas, torres, túmulos) usam portal, sempre numa entrada física desenhada no cenário. Dentro das cidades há banco e guardas/mercadores numa zona sem monstros. O nome do portal agora aparece em cima dele e na dica.

**Criaturas garantidas (`b.topUp` / `Maps2.refill`).** Em mapas de cenário lotado (floresta, salas de masmorra) o posicionamento aleatório antigo desistia e deixava ~87 criaturas sem nascer (inclusive Dragão Negro, Ent Ancião, Aranha Venenosa). Agora `Builder.finish` completa cada pedido de `b.mobs` (até 1500 tentativas, ampliando a região, fora de zona segura/água/sólidos) e `Maps2.refill(maps)` repara mundos já salvos (marca `c6.mtu`), sem duplicar nem mexer em mapas já completos.

| id | Nome | Tamanho | Nível sugerido | Liga com |
|---|---|---|---|---|
| campos | Campos de Aldeburgo | 2000x1400 | 1-5 | Vale do Rio (oeste), Estrada do Rei (leste) |
| estrada_rei | Estrada do Rei | 1600x700 | 3-6 | Campos (oeste), Vila Real (leste) |
| vila_real | Vila Real | 1800x1300 | cidade | Estrada do Rei (oeste), Estrada das Areias (leste), Estrada Sombria (sul) |
| trilha_elfica | Trilha Élfica | 700x1600 | 6-10 | Floresta Sombria (leste, ponta sul), Silvaluz (oeste, ponta norte) |
| silvaluz | Bosque Élfico de Silvaluz | 2000x1400 | 12-20 | Trilha Élfica (leste); porta da Torre do Mago |
| torre_mago | Masmorra da Torre do Mago | 1600x1400 | 34-65 | porta da torre em Silvaluz |
| estrada_costa | Estrada da Costa | 700x1600 | 4-8 | Vale do Rio (leste), Porto de Marés (sul) |
| porto_mares | Porto de Marés | 1800x1300 | cidade | Estrada da Costa (norte), Praia dos Naufrágios (oeste) |
| praia_naufragios | Praia dos Naufrágios | 2000x1400 | 9-14 | Porto de Marés (leste) |
| pantano | Pântano de Brejo Negro | 2000x1400 | 10-16 | Vale do Rio (norte); caverna do Covil dos Goblins |
| covil_goblins | Covil dos Goblins | 1600x1200 | 8-28 | caverna no Pântano |
| estrada_areias | Estrada das Areias | 1600x700 | 10-14 | Vila Real (oeste), Deserto (leste) |
| deserto | Deserto de Sahr | 2000x1400 | 14-22 | Estrada das Areias (oeste), Oásis (leste) |
| oasis | Oásis de Lahur | 1600x1100 | cidade | Deserto (oeste); escadaria das Ruínas |
| ruinas | Ruínas de Sahr-Kal | 2000x1400 | 28-45 | escadaria no Oásis |
| trilha_serra | Trilha da Serra | 700x1600 | 12-18 | Mina de Pedra (sul), Pedralta (norte) |
| pedralta | Pedralta | 1800x1300 | cidade | Trilha da Serra (sul), Passo Gelado (leste); entrada da Mina Abandonada |
| mina_abandonada | Mina Abandonada de Pedralta | 1600x1200 | 20-45 | entrada de mina em Pedralta |
| passo_gelado | Passo Gelado | 1800x800 | 22-32 | Pedralta (oeste), Vale Gelado (leste) |
| vale_gelado | Vale Gelado de Hrimgar | 2000x1400 | 32-55 | Passo Gelado |
| estrada_sombria | Estrada Sombria | 700x1600 | 14-20 | Vila Real (norte), Cemitério (sul) |
| cemiterio | Cemitério das Brumas | 2000x1400 | 18-28 | Estrada Sombria (norte), Fortaleza (oeste); túmulo da Catacumba |
| cripta_real | Catacumba do Rei Esquecido | 1600x1400 | 30-70 | túmulo no Cemitério |
| fortaleza | Fortaleza de Morthak | 2000x1400 | 38-60 | Cemitério (leste), Vulcão (oeste) |
| vulcao | Vulcão Brasa-Viva | 2000x1400 | 45-65 | Fortaleza (leste); cratera do Ninho do Dragão |
| ninho_dragao | Ninho do Dragão Negro | 1600x1200 | 50-80 | cratera no Vulcão |

### Passagens naturais entre mapas (`public/edges.js`)
Os mapas antigos e novos se ligam como um mundo contínuo: o jogador **anda até uma abertura de estrada na borda** e passa ao mapa vizinho (fade curto), chegando na abertura correspondente do outro lado. Nada de portal no meio do mato.
- **Dados:** cada mapa de borda tem `m.edges = [{id, d, a, b, to, td, ta, tb}]` (lado `n/s/e/w`, faixa `a..b` na borda, mapa destino, lado e faixa de chegada). `Edges.step` (chamado em `update()`) dispara a 22 px da borda, chega a 72 px do outro lado, com recarga de 40 quadros contra vai-e-volta. Mapa com `edges` ignora a lógica antiga de grade; mapa sem `edges` (casa, masmorras) segue como antes. O editor do admin continua funcionando: `edges` é só dado do mapa e o servidor guarda o `worldData` como veio.
- **Estrada nos dois lados:** a migração limpa um corredor de árvores, rochas e criaturas e pinta uma estrada (`paint` com id `c7_<ligação>_...`) em ambos os mapas; passagens com portão (Vila Real, Fortaleza, Pedralta) ganham duas torres de vigia.
- **Migração idempotente:** marca `m.c7[ligação:lado]`, `dg:<masmorra>` e `torches` em cada mapa e chama `Content.mark()`. Roda no admin (`World2.placeInWorld` → `Maps2.place` → `Edges.migrate`); jogadores novos e o segundo login do admin recebem o mundo salvo sem duplicar nada (verificado: mesma contagem de entidades, bordas, portais e tochas em 3 logins).
- **Geografia (`WM_POS` em hub.js):** Vale do Rio é o cruzamento (norte Aldeburgo, sul Pântano, oeste Estrada da Costa, leste Campos); Estrada da Costa -> Porto de Marés -> Praia dos Naufrágios; Floresta -> Trilha Élfica -> Silvaluz; Mina de Pedra -> Trilha da Serra -> Pedralta -> Passo Gelado -> Vale Gelado; Campos -> Estrada do Rei -> Vila Real -> Estrada das Areias -> Deserto -> Oásis; Vila Real -> Estrada Sombria -> Cemitério -> Fortaleza -> Vulcão. O mapa-múndi mostra as saídas de cada mapa (`m.edges` + portais).
- **Auditoria:** busca em largura sobre o grafo (bordas + portais) a partir de Aldeburgo alcança os 32 mapas jogáveis (a `casa` é só por porta); toda borda tem volta; os pontos de chegada e de saída de cada mapa estão livres e ligados entre si pelo `pfFind`.

### Masmorras com sentido
Cada masmorra tem **entrada física** desenhada no mundo (corpos sólidos em código, `Edges.installArt`) e a saída leva ao mesmo ponto. Interiores são escuros (`m.env`: `dark`/`dim`) com tochas a cada ~230 px de parede e ao lado da saída (`decor` `torch`, brilho no `env.js`).
| Masmorra | Entrada | Onde |
|---|---|---|
| Catacumba do Rei | túmulo com escada | ponta leste da estrada do Cemitério |
| Catacumba (Lich) | túmulo | Covil (Aldeburgo) |
| Torre do Mago | porta da torre (prédio) | Silvaluz |
| Covil dos Goblins | boca de caverna | Pântano |
| Ruínas de Sahr-Kal | arco com escadaria | Oásis (clima nublado) |
| Mina Abandonada | portão de mina | Pedralta |
| Ninho do Dragão | borda da cratera | Vulcão |

### Clima por região (`env.js`)
O clima vem de um relógio global (sem sincronizar com o servidor): um ruído suave em janelas de ~6 min, comparado com um limiar por região. As intensidades (0 a 1) **nunca mudam mais que 12%/s** (`RATE`; medido <= 14%/s) e a luz/escuridão e o fator interior/exterior usam o mesmo limite, então nada vira de repente. Perto da borda o alvo se mistura com a região vizinha (até 50% na própria borda, em 30% do mapa), então a transição acontece andando. Interiores têm alvo 0 de tudo (sem chuva).
| Região | Mapas | Clima possível |
|---|---|---|
| Temperado | Aldeburgo, Campos, Estrada do Rei, Vila Real | chuva, tempestade rara, neblina matinal |
| Floresta | Floresta, Trilha Élfica, Silvaluz | chuva frequente, neblina |
| Rio | Vale do Rio | chuva, neblina |
| Serra | Mina de Pedra (interior ralo), Trilha da Serra, Pedralta | chuva leve, neblina |
| Gelo | Passo Gelado, Vale Gelado | neve e neblina |
| Litoral | Estrada da Costa, Porto de Marés, Praia dos Naufrágios | chuva, tempestade (a mais forte do mundo), neblina |
| Pântano | Pântano de Brejo Negro | neblina densa, chuva |
| Estrada das Areias / Deserto | Estrada das Areias, Deserto | areia ao vento, calor |
| Oásis | Oásis de Lahur | calor leve, areia rara |
| Sombria | Estrada Sombria | neblina sombria |
| Cemitério | Cemitério das Brumas | neblina sombria, chuva |
| Fortaleza | Fortaleza de Morthak | chuva, tempestade, neblina, cinzas, névoa sombria |
| Vulcão | Vulcão Brasa-Viva | cinzas, calor |
| Interior | casas, cavernas, catacumbas, torre, ninho; Ruínas e Mina Abandonada ficam em penumbra (`dim`) | nenhum, escuro com tochas |
API compatível: `Env.rainLevel`, `weatherLabel` (pesca e Vida procuram "Neblina"/"Chuva"), `isNight`, `daylight`, `rangeMul`, `setDebugFrac`; novos: `forceWeather('auto'|'clear'|'rain'|'storm'|'fog'|'snow'|'sand'|'ash')`, `state()`, `targets()`, `regionOf(id)`.

### Linha de visão (`public/los.js`)
Não se ataca (nem se é atacado) através de paredes. `LOS.clear(ax,ay,bx,by)` testa o segmento contra as caixas de colisão (`getHitbox`) dos sólidos altos (casas, muros, rochedos, colunas, árvores, estátuas); objetos baixos (cercas, barris, arbustos, minérios, lápides, caixotes) não bloqueiam. Vale para: ataque corpo a corpo e à distância do jogador (sem linha de visão a mensagem "Sem linha de visão: contorne a parede." aparece e o personagem contorna), projéteis (somem na parede: "O tiro bateu na parede.") e criaturas (só enxergam e golpeiam com linha livre). O servidor não valida alcance nem parede: o dano vem do `combatLogs` do cliente, limitado só por orçamento de dano; a validação de linha de visão é do cliente.

### Aviso do Colosso de Pedra
Faixa fina de uma linha no topo (`#wb-hud`: "Colosso de Pedra na Vila · mm:ss" com barra de 90 px) e anúncios (`#wb-ann`, `Life.ann`) que somem em ~5 s ou ao clicar. No celular ficam centralizados no topo, em fonte menor, sem cobrir joystick nem botões.

Também adiciona 38 criaturas novas (mescladas em `npcDB` só se ainda não existirem) e 11 decorações novas (rochedo, cacto, palmeira, barco, árvore seca, coluna, sarcófago, lava, juncos, espinho de gelo, rede). O mapa-múndi (`hub.js`) está descrito na seção abaixo.

## Proteção contra clique acidental e Ofícios
- `public/itemsel.js`: na mochila (e nos slots equipados) um clique só **seleciona** o item e mostra a barra Usar/Comer/Equipar · Jogar fora · Cancelar; clique/toque duplo usa direto; Esc, clicar fora ou trocar de aba cancela; arrastar (`inv2.js`) não seleciona. Menu > **Confirmar uso de itens** (padrão ligado, `localStorage ms_confirm_use`) volta ao clique direto. Barra rápida 1–5 continua direta. Compras caras (NPC ≥ 100 moedas) e do mercado pedem um segundo toque.
- Ofícios (`ui.js`): clicar numa receita só a seleciona (detalhe no topo: ingredientes possuídos/necessários, resultado, quantidade −/+/Máx); apenas o botão **Criar** (ou Enter no campo/receita focada) fabrica (`craftItem(nome, vezes)` em `index.html`, com `craftInfo` para máximo possível). O painel só é reconstruído quando algo muda (antes, cliques se perdiam quando a lista era redesenhada entre o botão pressionado e solto).

**Auditoria de servidor: persistência, economia e operação (acrescentado)**
- Variáveis extras: `HOST` (endereço de escuta; o `oracle-setup.sh` usa `127.0.0.1` atrás do Caddy), `SYNC_IP_MAX` (sync por IP/s, padrão 600). Com `STORAGE` vazio e já existindo `database.sqlite`, o servidor **recusa iniciar** (evita subir um banco vazio por engano).
- Gravação: `database.json` é escrito de forma atômica (tmp + fsync + rename + fsync da pasta), com `.bak` e snapshots por hora. Na partida o servidor tenta `.json`, `.tmp`, `.bak` e `backups/`; se tudo estiver ilegível ele **sai com erro sem apagar nada** (cópias `.corrompido`, máx. 3). SIGTERM/SIGINT salvam e fecham o banco; erro não tratado repetido ou falta de memória encerram o processo para o systemd reiniciar. Operações de dinheiro/itens (mercado, troca, missão especial, presentes, save com pendência) gravam em disco na hora (`persistNow`).
- Economia: mercado, troca e missões especiais só liberam o que estiver **salvo antes** no personagem (nonce/escrow); cada oferta, compra, cancelamento, ack de correio e troca só vale uma vez, mesmo com requisições paralelas. Correio limitado (1000; compra recusada acima de 900). Créditos de correio/troca só são descontados do orçamento de `security.js` uma vez. Infrações iguais seguidas contam no máximo 1 a cada 20 s; erro de envelope só gera log e é corrigido sem punir.
- `/api/save`: aceita `seq` crescente opcional (saves antigos são ignorados) e responde `adjusted`/`warn:'ADJUSTED'`/`warnings` quando o servidor corrige algo; suspensão devolve **423 `code:'LOCKED'`** com `until`/`retryAfter`; também `400 INVALID` e `429 RATE`. Novas rotas: `GET /api/me` (estado salvo) e `POST /api/admin/unlock` (admin libera uma conta). O sync devolve `kills[]` (mortes confirmadas) e `lock`. Acertos a mais de 1400 px do mob são ignorados. Respawn e chefes são decididos no servidor (chefe de mundo pela hora cheia em **UTC**).
- Mundo (admin): o servidor valida o mapa enviado (nomes, `casa_*`, ids únicos, tipos, dimensões; recusa mundo vazio, `itemDB`/`npcDB` vazios), mantém backup do mundo anterior (≤ 1 a cada 5 min, 20 arquivos) e devolve avisos. Nomes de conta reservados (`admin`, `sistema`, propriedades de objeto etc.) são recusados no registro; admin tem limite de ritmo e as ações ficam no log.
- Logs rotativos numerados (`security.log` e `gifts.log`, com `LOG_KEEP`). `deploy/hook.js`: corpo máx. **1 MB**, assinatura comparada em bytes, `HOOK_REPO` opcional, `node --check` antes de reiniciar e rollback automático se o jogo não subir. `deploy/oracle-setup.sh` é idempotente: usuário `miniscape` sem root, env com permissão 600, unit systemd com limites, `DATA` em 750, backup diário (14 dias) e logrotate.

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
- `public/fishing.js` (pesca, reescrita): **Rede** e **Vara** com escolha de modo, lançamento animado, minigame e 21 espécies.
  - **Escolher o modo:** ao interagir com um ponto de pesca (clique, Espaço ou toque) tendo rede e vara, abre um seletor compacto (Rede / Vara com trocador de isca ◀ ▶: automática, as iscas que você tem, ou sem isca). Se só tem uma ferramenta, vai direto; sem nenhuma: "Você precisa de uma rede ou vara de pesca". A escolha fica em `localStorage` (`ms_fishmode`) e, durante a pesca, a barrinha embaixo mostra **◀ isca ▶ · Trocar modo · Parar**. Botão direito no ponto continua oferecendo Rede ou Vara direto.
  - **Lançamento:** o personagem arremessa; a linha (curva leve, ponta da vara calculada a partir da mão do desenho, nas 4 direções) voa até 120-200 px, sempre sobre água (escolhe a direção com mais água), a boia cai com respingo e ondas, balança, e quando o peixe belisca ela afunda com bolhas e aparece o **!** sobre o personagem. Há ~1,3 s para fisgar (**Espaço**, clique, toque, botão **AÇÃO**); perdeu a janela, o peixe escapa e a isca é consumida (a isca só é gasta quando o peixe morde). A rede é um lançamento curto: a rede boia, e é puxada de volta com os peixes.
  - **Minigame (vara):** barra vertical ao lado do personagem. Zona **verde** = onde o peixe está (ele puxa e dá arrancadas conforme a espécie); o cursor branco é a tensão da linha: **segure** (Espaço, botão do mouse, toque na tela ou botão AÇÃO) para subir e **solte** para descer. Medidor da esquerda = captura (enche no verde, esvazia fora; zerou, o peixe escapa); medidor da direita = linha (enche no topo vermelho; cheio: "A linha estourou! O peixe escapou", perde peixe e isca, nunca a boia). Dificuldade = raridade + tamanho do peixe − nível de Pesca − tier da isca (zona menor, mais rápida, mais arrancadas). Esc, andar ou levar dano cancela. Tudo roda no desenho do mundo (sem DOM por quadro).
  - **Espécies** (`SPECIES` em fishing.js; raridade comum, incomum, raro, épico, lendário; cm e kg sorteados na faixa de cada espécie, peixe grande dá mais XP e, os gigantes, 2 unidades): rios/lagos (Tilápia, Carpa, Truta, Salmão, Carpa Dourada, Peixe-lua), mar (Sardinha, Robalo, Atum, Peixe-espada), pântano (Bagre-do-Brejo, Piranha, Enguia Elétrica), gelo (Peixe-do-Gelo, Esturjão Glacial), oásis (Lambari-do-Oásis), caverna (Peixe-Cego, Peixe-Lanterna, Coelacanto) e lava (Peixe-Brasa, Peixe-dragão de Lava), mais Bota Velha e Baú do Tesouro. O tipo de água vem do mapa (`zoneOf`: pantano, praia/porto/costa, vale/passo gelado, oásis/deserto, vulcão/ninho, minas/cavernas/criptas, senão rio). Clima ainda pesa (salmão na chuva, enguia na neblina, peixe-lua à noite, carpa dourada de dia). Sem isca: só peixes comuns; iscas melhores aumentam raros e grandes (e baú, na Dourada). Foram adicionados lagos com ponto de pesca em `vale_gelado`, `vulcao` e `mina_abandonada` (`maps2.js`; só valem para mundos novos ou após "Instalar mapas novos").
  - **Diário de pesca** (Menu): espécies pescadas, recorde de cm/kg, quantidade, raridade e o bônus do prato. Fica em `playerData.fish = {espécie:{max,kg,count}}`; o servidor (`cleanFishData` em `server.js`) descarta qualquer outra estrutura, e valida também `playerData.buffs`.
  - **Cozidos e bônus:** cada peixe tem versão crua e cozida (`<Peixe> Cru/Cozido`; Truta e Robalo continuam "Assado"). O prato cura por raridade (8 a 48) e dá bônus temporário: Pesca rápida, XP de pesca, Sorte de pesca, Regeneração (vida), Mana, Força e Defesa (os dois últimos usam os efeitos que já existiam, `Content.buff`). Bônus do mesmo tipo não acumulam, só renovam a duração (mantém o maior valor). Aparecem como ícones pequenos com tempo no canto direito do jogo. Cozinhar peixe pode queimar (`Peixe Queimado`; 26% no nível 1, cai 1,2% por nível de Culinária, mínimo 2%).
  - **Compatibilidade:** iscas (Minhoca, Brilhante, Camarão, Dourada), escolha de isca pela mochila (`itemsel.js`), barra rápida, `Rede de Pesca` (migração de `Net`), conquistas (`rarefish`, `chests`) e missões diárias seguem iguais. API de teste: `Fishing.roll({zone, L, bait, weather})`, `Fishing.state()`, `Fishing.cfg.wait`, `Fishing.cfg.force = {id, t}`, `Fishing.setHold('test', bool)`.
- Bug da rede: o item se chamava `Net` mas o nome guardado era `Fishing Net`, e o código procurava o nome `Net` (nunca achava). Agora é `Rede de Pesca` (chave = nome); contas antigas (mochila, banco, equipamento, barra rápida) e lojas são migradas sozinhas no login (`Fishing.migrate/merge`).
- Ataque no clique: com arco ou cajado, clicar no inimigo (mouse ou toque) faz o personagem parar no alcance (arco 220, cajado 200, com linha de visão), virar e atacar sozinho no ciclo normal (gasta flechas/runas; sem munição mostra "Sem flechas equipadas!"/"Sem runas!" e para). Fora do alcance ele persegue só até entrar; clicar no chão, em outra coisa ou andar cancela. Corpo a corpo não mudou. Um anel vermelho marca o alvo.
- Água: bichos terrestres não entram na água (e, se já estão dentro, saem para a margem); voadores ignoram; cobras nadam. Quem está na água é desenhado com só a parte de cima aparecendo (linha d'água, ondinhas e parte de baixo esmaecida), inclusive o jogador. A colisão do jogador não mudou. `Art.isWater(mapa, x, y)` usa uma grade refeita quando a pintura muda.
- Desempenho (`artworld.js`): o chão e toda a pintura (caminhos, água base, costa) ficam num cache por mapa, refeito só quando o mapa muda (enquanto o admin edita, a pintura é desenhada ao vivo e depois reassada); só as ondinhas da água são animadas. Árvores, prédios e decoração viram sprites em canvas (cache LRU); fumaça e bandeiras dos prédios continuam animadas ao vivo e desenhos que se mexem de verdade (fonte, cristal, moinho...) continuam vetoriais. O contexto 2D é `alpha:false, desynchronized:true`; sem `ctx.filter` nem `shadowBlur`. **Menu > Gráficos** (Alto/Médio/Baixo, `localStorage ms_quality`): Baixo corta partículas ambientes, luzes, sombras de criaturas e ondinhas; se o fps medido ao entrar ficar abaixo de 40 o jogo passa sozinho para Médio (e abaixo de 26 para Baixo), a menos que o jogador já tenha escolhido.

## Deploy automático (Oracle/VPS)
`deploy/oracle-setup.sh` instala tudo; `deploy/hook.js` é um webhook que o GitHub chama a cada push na `main`. A VM faz `git fetch`, `npm install`, reinicia o jogo e confere `/healthz`; se o jogo não subir, volta sozinha para a versão anterior. O webhook só aceita chamadas com assinatura HMAC (segredo em `/etc/miniscape.hook`). As contas ficam em `/var/lib/miniscape`, fora do código, e nunca são tocadas pelo deploy. Logs: `journalctl -u miniscape-hook -f`.

Servidor de produção: https://miniscape2d.duckdns.org (Oracle Cloud, São Paulo).

## Mapa-múndi, moedas e celular

**Mapa-múndi (`hub.js`, tecla M).** Lista *todos* os mapas (menos `casa`/`casa_*`), cada um em uma célula própria: `WM_POS` fixa a geografia dos mapas conhecidos (Aldeburgo no centro; oeste = floresta/Silvaluz/torre; leste = Campos, Vila Real, deserto; norte = serra, Pedralta, gelo; sul = Vale do Rio (cruzamento), costa, porto, praia, pântano; sudeste = Estrada Sombria, cemitério, fortaleza, vulcão; masmorras ficam ao lado do mapa da entrada). Mapas fora da tabela usam `gridX/gridY` se a célula estiver livre; senão ficam na célula livre mais próxima de um mapa ligado por portal (determinístico). A grade se ajusta ao modal, tem botões − / + / Ajustar, arrasto com o mouse, rolagem nativa no toque e linhas tracejadas entre mapas ligados (por bordas ou portais; o painel do mapa lista as *Saídas*). Tocar num mapa mostra criaturas, NPCs, recursos e portais (não viaja, como antes). `gx/gy` de `maps2.js` foram alinhados a essa geografia.

**Moedas e pilhas.** O limite antigo (254 por pilha, em `addInvItem`/`invSpaceFor`/banco/fabricação/troca) virou `STACK_MAX = 2.147.483.647` para todo empilhável: Coins ocupa 1 slot só. Exibição: `fmtNum` (1.234.567) na dica/mercado/troca e `fmtQty` na célula (99.999, 100K, 1,2M, 2,1B). Banco junta pilhas e retira o que couber; `mergeStacks` roda no login e junta pilhas repetidas de Coins/empilháveis (mochila e banco) e corrige quantidades inválidas. Servidor: troca (`social.js`) e mercado (`extras.js`) aceitam quantidade/preço até 2.147.483.647; a troca ganhou o campo "Quantidade por clique". `playerData` segue opaco no servidor (só limite de tamanho).

**Ajustes de layout (revisão de bugs).** No celular (844x390) o texto de ação (`#action-text`) tem largura máxima `min(46vw, max(120px, 100vw-600px))` para não cobrir os botões Social/Diário; entre 851 e 1300 px de largura a dica de teclas (`#key-hints`) fica oculta (era cortada); com a barra rápida visível (`QuickBar.place`, `qol.js`) o chat fechado é limitado (`max-width`) para não passar por baixo dela. `Mimic.grant` (admin) não registra a peça se a mochila estiver cheia.

**Celular (`mobile.js`, `html.touch` em `ui.css`).** Liga em aparelhos de toque (`pointer:coarse`) ou com `?touch=1`. Só paisagem: em retrato aparece "Gire o celular para jogar" (+ botão Tela cheia, que também tenta `screen.orientation.lock('landscape')`). Canvas ocupa a tela (100dvh, safe-area, sem rolagem da página, `touch-action`/`overscroll-behavior` bloqueiam pinça, toque duplo e puxar para atualizar). O painel vira gaveta (botão da mochila; abre sozinha em loja/banco; tocar no mundo fecha). Metade esquerda: joystick flutuante discreto (8 direções, zona morta; toque curto = interagir como clique); metade direita: tap-para-interagir, segurar = menu. Botões AÇÃO (Espaço) e Atacar de 78/58 px, HUD de vida/mana compacto, chat como sobreposição (botão de chat), barra rápida compacta. Desktop não muda.

**Piscadas no celular.** Suspeitas principais: `desynchronized:true` (removido), canvas redimensionado dentro do quadro quando a barra de endereço/teclado/rotação mudava o tamanho (agora só em eventos, com debounce de 140 ms, via `resizeCanvas`), cache de chão em 2 canvases do tamanho do mapa (agora blocos de 512 px sob demanda, LRU de 48, no máximo 513x513 cada), `will-change`/`translateZ` no canvas e `backdrop-filter` sobre o canvas (removidos no toque). Menu > Gráficos: Baixo no celular desenha em 75% da resolução (`Quality.renderScale`); celular começa em Médio.

## Vistas de personagens e criaturas (frente / costas / perfil)
Jogador, NPCs e criaturas escolhem a vista pelo movimento (com histerese de ~8 quadros, sem piscar): andando para baixo/cima aparece de frente/costas, para os lados o perfil (espelhado). Parado, o jogador volta a olhar para a frente após ~2,8 s; NPCs olham para o jogador (cabeça/olhos acompanham, piscam) e nunca dão as costas parados. Em `public/art.js` cada espécie pode ter `S.especie.v = { front, back, side }` (+ `home`); sem `v` usa o desenho de perfil de sempre. Bípedes (goblin, orc, esqueleto, troll, golem, mago sombrio, fantasma, gosma, morcego), quadrúpedes/aves (lobo, javali, rato, vaca, ovelha, porco, cervo, galinha, coelho), aranha, cobra e dragões têm as três vistas; o ataque ganhou antecipação (recuo de ~5 quadros) e giro suave ao trocar de vista. Hitboxes e jogabilidade não mudam. O catálogo (`catalogo.html`) ganhou o botão "Direção" para ver as 4 direções.

## Banco
- O banco é uma **janela à parte** (`public/bank.js`, `#bank-win`) sobre o mapa; a Mochila continua visível e ativa no painel (no celular a gaveta abre ao lado). Depositar: arraste da mochila para a janela, ou selecione o item e use **Depositar** (clique duplo deposita); retirar: clique no item do banco (1 / 10 / Tudo / Qtd) ou arraste para a mochila. Pilhas pedem quantidade (padrão Tudo); 120 slots, busca, **Depositar tudo**; Esc/X/afastar/abrir outra janela fecha; itens encantados e dados extras são preservados e o banco fica bloqueado durante trocas.

## Desmanche, compra em quantidade, conjuntos e atributos (`gear.js`, `stats.js`, `qty.js`, `recycle.js`)

**Desmanchar** (`Recycle`): botão "Desmanchar" no menu do item do inventário (só inventário; não vale para equipado, em troca/escrow ou com o banco aberto). Mostra "Você receberá:" antes de confirmar. Item normal devolve 50% (piso) de cada material da receita; se der 0 e a receita tiver 2+ unidades, devolve 1 do material principal; receita de 1 unidade não pode ser desmanchada (evita loop de XP de ofício). Item **encantado** devolve 35% dos materiais + **Pó Arcano** (1 + 25% do material do encanto por nível). Itens sem receita usam uma tabela de sucata. Pilhas são desmanchadas em lotes de `craftQty`, um lote por vez. Operação atômica com rollback (inventário cheio = nada acontece). Item encantado continua sem poder ser jogado fora: o aviso manda usar Desmanchar. API: `Recycle.can(item)`, `preview(item,lotes)`, `run(item,lotes)`, `ask(item)`, `blockReason`.

**Quantidade** (`Qty`): `Qty.pick({title,name,per,unit,cost,max,limits,onOk,...})` — campo, −/+, 1/10/Máx, total, máximo limitado por moedas/estoque/espaço, confirmação em 2 toques se total ≥ 100. Usado nas lojas de NPC (`Qty.shop`, compra atômica) e no mercado entre jogadores. No mercado, `extras.js` aceita `{a:'buy', id, nonce, qty, cost}`: `cost` precisa bater com `lotCost(price, qty, n)` (BigInt, mesma fórmula do cliente `Qty.mktCost`), senão "O preço mudou". Compra parcial mantém o resto do anúncio; anúncio de preço 1 só é comprado inteiro.

**Conjuntos** (`Gear.SETS`): capacete/corpo/arma/escudo evolutivos para guerreiro (Bronze, Ferro, Aço, Ouro, Mithril, Dragonscale), arqueiro (Couro, Cravejado, Lobo, Patrulheiro, Dragonhide + arcos e flechas Aço/Mithril/Dragão) e mago (Aprendiz, Adepto, Místico, Arcano + cajados Ar/Água/Terra/Fogo/Místico/Arquimago, runas Terra/Fogo). Tiers baixos na loja (ferreiro/mago), altos por forja (Barra de Ouro: 2 Minério de Ouro, ferraria 12) ou drop de chefe. Bônus de conjunto com 3+ peças. Novos slots: amuleto e anel (joias). Campos de item: `crit, critDmg, moveSpd, atkSpd, lifesteal, luck, dr, spellDmg, save, req{skill,lvl}, set, col, hat, robe, gem`.

**Atributos** (`Stats`): teto crit 75%, dano crítico +200%, velocidade +50%, vel. de ataque +50%, roubo de vida 25%, sorte 100%, redução de dano 50%, dano mágico 60%, poupar munição/runa 60%. API: `Stats.addSource(nome, () => ({crit, moveSpd, ...}))`, `removeSource`, `hasSource`, `get()`, `rollAttack(dmg)→{dmg,crit}`, `reduce(dmg)`, `lifestealHeal`, `cd(base)`, `luckMul()`, `canEquip(item)`. Painel compacto na aba de equipamento e linhas no tooltip.

**Correr**: Shift (segurar) ou R (alternar); no celular, botão "CORRER". +45% de velocidade, teto total +80%, gasta energia (barra `#en-bar`, 5/s; recupera 3/s andando e 7/s parado; ao zerar só volta a correr com 12). Passada mais rápida e poeira. `player.energy` (0..100) é salvo; o servidor limita em `cleanStatsData`. O servidor não valida deslocamento no /sync (como antes).

**Classes novas**: arqueiro começa com 250 Flechas de Bronze equipadas; mago com 250 Runas do Ar e 250 Runas da Mente. Contas existentes não mudam.

## Pets e Montarias (`petart.js`, `pets.js`)

- **Itens**: "Pet X" (`type:'pet'`, `petId`) e "Sela X" (`type:'mount'`, `mountId`). Usar o item consome e adiciona a espécie à coleção (`player.pets`, `player.mounts`); duplicata fica no inventário. Estado de montado é só em runtime (`P.mounted`), nunca persistido.
- **Pets (12)**: gato, cachorro, coelho, raposa, coruja, slime, lobinho, fada, golem, dragãozinho de gelo/fogo e fênix, de comum a lendário, com atributos em % (moedas, XP, dano, crítico, sorte, regen de HP/mana, velocidade). Nível máx. 10 (+6% dos bônus por nível); o pet recebe 35% do XP ganho.
- **Seguir**: direção por steering com colisão (sólidos estáticos, água para não voadores), teleporte com poeira se preso/longe/troca de mapa; animações idle/andar/dormir, 4 direções, sombra, ordenação por y e culling.
- **Painel**: ícone abaixo do nível (tecla `P`). Modos: seguir, atacar (nunca mata, só ajuda no alvo do jogador), coletar itens, só moedas, coletar tudo. A coleta usa o mesmo caminho do jogador (`invSpaceFor` + `addInvItem`), raio 160, recarga de 1,2 s; itens soltos pelo jogador (`np`), encantados ou de outro dono são ignorados; inventário cheio deixa o item no chão.
- **Montarias (9)**: cavalos marrom/branco/de guerra, lobo gigante, cavalo esqueleto, cavalo de fogo, unicórnio, pantera e dragão (+40% a +80% de velocidade). Total de velocidade (pet + montaria) limitado a +80% (`Pets.cfg.SPD_CAP`). Tecla `V` (botão ao lado de Ação no celular). **Montado na montaria comum o jogador luta normalmente** (corpo a corpo, arco e magia, com gasto de flechas/runas; ser atingido não desmonta). Pets nível 10+ também são montáveis e **também se luta montado neles** (ver abaixo). Monta e anda montado em QUALQUER lugar (interiores, casa, masmorras, loja, banco, NPCs, pesca, portais, bordas, mapa-múndi): não há desmontar automático por local ou ação; só desmonta ao morrer, por comando (V/botão) ou ao reconectar (o estado montado nunca é persistido). A hitbox do jogador não muda.
- **Como obter**: drops raríssimos (tabela abaixo), baús, pesca, lojas (Mercador: Pet Gato, Sela Cavalo Branco; Fazendeiro: Pet Coelho, Sela Cavalo Marrom) e craft (Sela Cavalo Marrom).
- **Chances de drop (dev)** — `Pets.cfg.DROP_CH` em `public/pets.js`. Nada é garantido. Por morte/evento há **uma única rolagem** de "pet OU montaria"; se acertar, sorteia um candidato da lista da criatura (`DROP`/`SRC`). Pet/montaria **lendário** (raridade 4) só sai em metade das rolagens que acertam. A sorte (`Stats.luckMul`/pet de sorte) multiplica a rolagem em **no máximo 1,5x** (`Pets.cfg.LUCK_CAP`).

  | Origem | Chance-base por morte/evento |
  |---|---|
  | Chefe (`group:'chefe'`, ex.: Troll, Golem, Filhote/Dragão Ancestral, Lich Rei, chefes das regiões novas) | **0,1%** (1 em 1000) |
  | Chefe de mundo (Colosso de Pedra, `wboss_golem`) | **0,3%** |
  | Baú do tesouro (pesca) e peixe raro | **0,1%** cada |
  | Monstro comum (só os que já tinham entrada, ex.: rato→Gato, lobo→Lobinho/Lobo Gigante) | **0,01%** (1 em 10.000) |
  | Animais de recurso sem entrada (vaca, ovelha, porco) | 0% |

  Chefes sem entrada em `DROP` usam um pet aleatório incomum a épico (nunca lendário); monstros com XP ≥ 20 ou vida ≥ 80 sem entrada usam um pet comum a 0,01%. Tabelas de loot editadas pelo admin (`lootStr`) que contenham um item de pet/montaria também ficam limitadas a 0,1% (e sorte ≤ 1,5x) em `index.html` (`dropLootNow`) e `Pets.postKill`. Contas existentes mantêm o que já têm. O servidor não sorteia loot (só confirma a morte), então não há tabela no servidor. Simulação de 100.000 mortes (função real `Pets.onKill`): chefes ≈ 0,08–0,12%, Colosso ≈ 0,22%, baú ≈ 0,09%, pesca ≈ 0,07%, mobs comuns ≈ 0,006–0,02%.
- **Atributos**: crítico e sorte entram como fonte `'pets'` em `Stats.addSource`; demais bônus em `Pets.bonus()`; velocidade via `Pets.speedFactor()` aplicada só durante `update()`.
- **Rede**: `/api/sync` leva `pet {id,l}` e `mount`; o servidor sanitiza (`extras.cleanPetSync`, `cleanMountId`) e `/api/save` passa por `extras.cleanPetData` (whitelist de ids/modos, nome 14 chars, nível 1..10). Pets de outros jogadores são simulados localmente (máx. 40 por câmera).
- **Evolução das montarias**: cada sela tem nível 1..30 e XP própria, em `player.mounts[id] = {lvl, xp, name?}` (o formato antigo `1` é migrado para nível 1). Ganha ~1 XP a cada 40 px cavalgados + 1 XP a cada 10 s andando montado; o XP para subir é `250 * 1,2^(nível-1)` (nível 10 em ~20 min, 20 em ~2 h, 30 em ~14 h cavalgando). A velocidade é a base `x (1 + até 20% no nível 30)` e continua sob o teto global de +80% (o dragão já chega nele; o ganho dele vem do bônus secundário). Cada espécie ganha um bônus secundário a cada fase (só montado): Marrom moedas +2%, Branco regen +3%, de Guerra XP +2%, Lobo/Pantera sorte +2%, Esqueleto regen de mana +4%, de Fogo XP +2%, Unicórnio regen +4%, Dragão XP +3% (por fase, até 3 fases).
- **Fases visuais** (níveis 10/20/30): 1 arreios; 2 aura (e armadura de cavalo de guerra nos cavalos comuns); 3 penacho/crista e aura forte com faíscas; cavalo de fogo deixa rastro de brasas; o dragão cresce +5% por fase (até +15%, só visual, a hitbox não muda). Os outros jogadores veem a fase pelo campo `ms` (0..3) do `/api/sync` (sanitizado em `extras.cleanMountStage`).
- **Painel**: aba Montarias (tecla `P`) mostra nome (editável, 14 caracteres), nível, fase, barra de XP, bônus atuais e o que vem no próximo nível/fase.
- **XP da montaria vindo do seu XP** (`playerData.mountPct`, 0..40, passos de 5, padrão 0%): controle "XP do jogador para a montaria" no painel de Montarias (como o dos Mímicos). A montaria **equipada** (montado ou não) recebe essa % de todo XP que o jogador ganha em qualquer perícia, além do XP de cavalgar (que continua igual). O jogador recebe o resto: a soma é exata (restos acumulados, nada se perde) e a montaria nível 30 não recebe mais (o excedente volta ao jogador). **Ordem com os Mímicos**: primeiro os Mímicos (`player.mimicPct`), depois a montaria, e **juntos desviam no máximo 70%**: a montaria recebe `min(%, 70 - %Mímicos)`, então com a montaria ligada o jogador sempre fica com **30% ou mais** (Mímicos sozinhos continuam podendo ir a 100%). O painel mostra "Você recebe X% / Mímicos Y% / Montaria Z%" e avisa quando o limite reduz a fatia. Implementação: `addXP` (index.html) chama `Pets.xpShare(xp final)`; o servidor clampa `mountPct` (`extras.cleanPetData`: 41 vira 40, valores ruins viram 0, passos de 5) e o orçamento de XP de montaria (`security.js`) subiu para cap 150.000 / 30.000 por minuto, pois agora ela também cresce com o XP do jogador (que já tem orçamento próprio). Curva de níveis inalterada (`250 x 1,2^(nível-1)`): estimativa para um jogador de ~70 mil XP/h, a 40% leva ~11 min para o nível 10 e ~9 h para o 30 só pelo XP compartilhado (somando cavalgar, ~7 h); a 10% leva o dobro ou mais, então não dá para "rushar" sem jogar de verdade.
- **Servidor**: `extras.cleanPetData` limita nível 1..30, XP >= 0 e abaixo do necessário, ids por whitelist e nome só com letras/números; `security.checkCollections` impõe orçamento de XP de montaria por minuto (montaria nova começa no nível 1) e reverte só a montaria suspeita.
- **Pet nível 10+ vira montaria**: no nível 10 (máximo) o pet fica grande o bastante para o jogador montar nele. Botão **Montar no pet** no painel (tecla `P`) e tecla `V` (se houver montaria comum equipada, `V` monta nela; o painel do pet tem botão próprio). Montado: o pet cresce (1,5x ou mais, só visual), o jogador senta (4 direções; ajuste fino por espécie), o seguidor some e **o jogador PODE lutar montado no pet**, igual às montarias comuns (corpo a corpo, arco e magia com gasto de flechas/runas, habilidades da árvore e de set); a mensagem "Desmonte do pet para lutar" e os bloqueios foram removidos. Os **atributos do pet valem SEMPRE, montado ou não**: equipado, o pet dá o valor **base** (`Pets.petBase`: 40% do valor no nível 1 subindo linear até 100% no nível 10); **montado** (nível 10+) os atributos sobem (`PM_MUL` = 1,5x) e entra a velocidade extra de 8% mais 2% por raridade (só montado; teto `SPD_CAP` +80% somado a atributos). Desmontado o pet segue, coleta e ajuda a atacar nos modos de sempre. Montado, o seguidor some; ao desmontar reaparece ao lado e os pets seguem o jogador em qualquer mapa (teleportam junto nos portais). Ser atingido NÃO desmonta (nem no pet nem na montaria); só desmonta ao morrer, por comando ou ao reconectar. Visual conferido em frente/costas/perfil com espada, arco e cajado (sem sobreposição estranha). A hitbox do jogador não muda. Montar no pet e montar na montaria comum são exclusivos. Ao subir o pet para o nível 10 aparece o aviso. Os outros jogadores veem o pet crescido pelo campo `m` em `pet {id,l,m}` do `/api/sync` (`extras.cleanPetSync` só aceita `m` com nível 10). Painel do pet mostra por atributo "base X% / montado Y%" com o lado ativo destacado.
- **Depuração**: `Pets.state()`, `Pets.isMounted()`, `Pets.isPetMounted()`, `Pets.mountPet()`, `Pets._P`.

## Itens Mímicos (`public/mimic.js`, `mimicnames.js`, `specialquests.js`)

Equipamentos raros e "vivos" que **evoluem com o personagem** e que **só o administrador entrega**. Três sets: **Mímico do Guerreiro** (6 peças: Elmo, Peitoral, Espada, Escudo, Anel, Amuleto), **Mímico do Arqueiro** (5: Capuz, Gibão, Arco, Anel, Amuleto) e **Mímico do Mago** (5: Chapéu, Manto, Cajado, Anel, Amuleto). Nome do item: `Elmo Mímico do Guerreiro`, `Arco Mímico do Arqueiro`, `Cajado Mímico do Mago`... (sem nível mínimo: dá para usar desde o início e elas crescem com você).

- **Exclusivos (não dá para obter jogando)**: nenhum chefe, chefe de mundo, masmorra, baú ou peixe raro dropa Mímicos; **não existe Caixa Mímica nem receita de craft**; não estão em loja nem no mercado. Só chegam por **(1) presente do admin** (DEV > Presentes, catálogo inteiro, inclui peças e aparências) ou **(2) recompensa de Missão Especial** (abaixo), sempre pelo correio (`db.market.mail`, entrega idempotente). Quem já tinha peças antes mantém as que tem (contas existentes não perdem nada; a Caixa Mímica que sobrou vira 5.000 moedas). O servidor reverte qualquer peça que apareça sem estar no save anterior nem no correio (`security.js`: `mimic-sem-presente`) e peça repetida vira XP da que o jogador já tem.
- **Evolução**: cada peça tem estado próprio `player.mimic[nome] = {lvl 1..50, xp, skin?}` (uma de cada por conta). XP para o próximo nível: `round(50 * 1.11^(lvl-1))`. Defesa/dano base e os atributos (crítico, dano crítico, vel. de movimento/ataque, roubo de vida, sorte, redução de dano, dano mágico, poupar munição) crescem do nível 1 ao 50; os atributos entram em `Stats.addSource('mimic', ...)` só enquanto a peça está equipada.
- **Aparência evolui com o nível** (estágios visuais, nas 3 vistas, no ícone, no painel e para os outros jogadores): **1 Despertar** (nível 1), **2 Desperto** (10: olhos extras e runas), **3 Ancestral** (25: runas orbitando e brilho forte), **4 Lendário** (50: halo e asas de energia). O servidor calcula o estágio a partir do nível salvo (`mimicnames.syncVisual`), o cliente não escolhe o que os outros veem.
- **Aparências (skins) e escolha**: cada classe tem 6 aparências por nível da peça: **Violeta** (padrão, nv 1), **Dourado** (10), **Carmesim** (20), **Gelo** (30), **Sombra** (40), **Esmeralda** (50) e as **especiais dadas pelo admin**: **Aurora** e **Eclipse** (itens `Aparência Mímica Aurora/Eclipse`; usar o item consome e libera a aparência na conta, `player.mimicSkins`). No painel dos Mímicos (tecla **N**) cada peça tem seu seletor de aparência (bolinhas de cor) e o botão **Aplicar a todo o set**; a **prévia** mostra frente, perfil e costas e deixa ver cada estágio. A escolha fica em `player.mimic[nome].skin` e o servidor saneia (só aparências liberadas pelo nível ou presente; senão volta ao Violeta).
- **XP desviado** (tecla **N**): `player.mimicPct` (0..100, passos 0/10/20/25/.../100, padrão 0). De todo XP ganho em qualquer perícia, X% vai para os Mímicos equipados (dividido igualmente entre as peças abaixo do nível 50) e o jogador recebe (100-X)%. Restos de arredondamento são acumulados.
- **Bônus de set**: peças do mesmo set equipadas. Parcial (2+ peças) = bônus base × peças/total; completo = bônus cheio + marcos pelo nível médio (10/25/50). Guerreiro: +10% dano corpo a corpo, 5% redução; Arqueiro: +12% crítico, 15% poupar munição; Mago: +12% dano mágico, +8% regen. de mana por 10 s (marcos extras por nível médio). O painel mostra "Set 4/6" e os marcos.
- **Ligados à conta**: não vão ao mercado nem à troca, não se desmancham, não se encantam nem se jogam fora (podem ir ao banco).
- **Missões Especiais** (`specialquests.js`, DEV > *Missões Especiais* em `public/sqadmin.js`; jogadores veem na aba **Especiais** do Diário): o admin cria missão com nome, descrição, **objetivo** (**código secreto**, **matar N de uma espécie**, **entregar N de um item** ou **chegar a um mapa**) e **recompensa** (qualquer item do catálogo, inclusive Mímicos e aparências, ou moedas), **ativa/desativa**, edita, zera resgates e apaga. Cada jogador resgata **1 vez** (limite total de resgates opcional). Progresso (matar/mapa) é contado **no servidor** (`sq.onKill`, `sq.onVisit`); o código nunca vai para o cliente; entrega confere o item salvo na conta. O resgate marca a conta antes de gravar o prêmio no correio (não duplica ao relogar) e é registrado em `admin-gifts.log`. Rotas: `GET /api/specialquest/list`, `POST /api/specialquest/claim {id, code?}`, `GET/POST /api/admin/specialquest` (admin).
- **Servidor**: `mimicnames.js` guarda a lista branca de nomes e `cleanMimicData` (chamado em `/api/save`): nomes inventados saem, `lvl` 1..50, `xp` 0..1e7, `skin` só liberada, `mst/msk` dos itens recalculados e `mimicPct` 0..100.
- **Testes/depuração** (admin): `Mimic.grant(nome)` (só funciona com conta admin), `Mimic.addXp(nome, n)`, `Mimic.setPct(50)`, `Mimic.state()`, `Mimic.setSkin(nome, id)`, `Mimic.setSkinAll(classe, id)`. Integração: ganchos em `addXP`, `applyDamage`, `useItem`, `Stats.tipHtml`, ícones (`icons.js`, a chave de cache inclui a aparência) e desenho do personagem (`art.js`).

## Balanceamento (v2): XP do RuneScape, vida 100+10/nível, dano em faixa fixa (`public/balance.js`)

Toda a matemática do jogo mora em **um único arquivo**, `public/balance.js` (UMD: `window.Balance` no navegador e `require('./public/balance.js')` no servidor). O cliente (`index.html`, `skilltree.js`, `pets.js`...), o servidor (`security.js`, `server.js`) e o simulador usam as mesmas funções. As chaves internas de itens/perícias não mudaram (a Defesa é a única perícia nova: `defence`).

**Constantes que você pode mexer** (todas no topo de `balance.js`):

| Constante | Padrão | Efeito |
|---|---|---|
| `XP_RATE` | 0,65 | multiplicador global de TODO ganho de XP (1 = ritmo puro do RuneScape). Também por ambiente: `XP_RATE=2 node server.js` (o servidor entrega o valor ao navegador em `/balance.js`) |
| `XP_PER_DMG` | 0,09 | XP base **padrão por ponto de vida** de uma criatura sem XP definido: `xpBase padrão = vida x 0,09` (criaturas do jogo). Criaturas do Dev usam o `XP base` que o admin digitar |
| `TAKEN_XP` | 0,80 | XP base por ponto de dano **sofrido**, para Vitalidade e para Defesa (cada uma), para uma criatura de XP padrão; criaturas com mais XP por vida rendem mais (veja abaixo) |
| `TIER_K` | 0,018 | escala de XP dos ofícios por nível (recursos melhores): 1x no nível 1, ~2,8x no 99 |
| `LEVEL_POWER(L)` | 8,5 + 0,5 L + 0,011 L² | "ESCALA" do dano: dano-base do nível L sem arma |
| `RATING_W` | 0,05 | cada ponto de poder de arma (`bonusDmg`) soma 5% ao dano-base |
| `HP_BASE`/`HP_PER_LEVEL` | 100 / 10 | vida = 100 + 10 x (nível de Vitalidade - 1) |
| `MP_BASE`/`MP_PER_LEVEL` | 50 / 5 | mana = 50 + 5 x (nível de Magia - 1) |
| `HEAL_MULT`/`MP_MULT` | 10 / 5 | itens guardam valores "brutos" (Peixe 8 = antigo); na hora de usar viram x10 de vida e x5 de mana |
| `ARMOR_W`, `DEF_K`, `DEF_K_LVL` | 4, 60, 2 | armadura/defesa (veja abaixo) |
| `MOBS` | tabela | nível e camada de cada criatura (`[nível, 'common'|'elite'|'boss'...]`) |
| `TIERS` | tabela | por camada: golpes do jogador para matar (`hits`) e golpes do monstro para matar o jogador (`ttd`) |

### Fórmulas

- **XP por nível** (RuneScape): `xp(L) = floor(1/4 * soma_{l=1}^{L-1} floor(l + 300 * 2^(l/7)))`. Vale para TODAS as perícias (combate e ofícios). O save guarda o **XP total** (`{level, xp, next}`, `next` = XP total do próximo nível); o nível é sempre derivado do XP (`levelForXp`). Conferência: nível 2 = 83, 10 = 1.154, 50 = 101.333, 99 = 13.034.431.

| Nível | XP total | Nível | XP total |
|---|---|---|---|
| 2 | 83 | 5 | 388 |
| 10 | 1.154 | 15 | 2.411 |
| 20 | 4.470 | 25 | 7.842 |
| 30 | 13.363 | 40 | 37.224 |
| 50 | 101.333 | 60 | 273.742 |
| 70 | 737.627 | 80 | 1.986.068 |
| 90 | 5.346.332 | 99 | 13.034.431 |


- **Pontos de habilidade** continuam `floor((nível - 1) / 2)`. Humano continua +5% de XP e o desvio de XP para os Mímicos continua funcionando (acontece antes, em `addXP`).
- **Vida máxima** = `100 + 10 x (Vitalidade - 1)` + classe (Guerreiro +30) + raça (Anão +40, Orc +20) + bônus da árvore (já x10: Vigor +40/rank...). **Mana máx.** = `50 + 5 x (Magia - 1)` + classe (Mago +40) + raça (Elfo +20, Orc -10), mínimo 30. Subir de nível de Vitalidade/Magia soma +10 de vida / +5 de mana na hora.
- **Regeneração**: 2% da vida máxima a cada 5 s; mana `1,25/s + 0,6% da máxima`; passivas da árvore e fonte de pets/pescados já na escala nova (x10 vida, x5 mana).
- **Dano do jogador** (corpo a corpo, à distância e mágico usam a mesma função, `Balance.playerDmgRange(nível, poder, estilo)`):
  - `base = LEVEL_POWER(nível da perícia) x (1 + 0,05 x poder)`, em que poder = `bonusDmg` da arma (+ munição, + dano da magia ativa e dano mágico, + poção de força).
  - Cada golpe é um inteiro uniforme em **[floor(0,9 x base), ceil(1,5 x base)]**. Nunca 0/1 por sorte e **não existe erro** de ataque do jogador. O crítico (x1,5, de `Stats`) multiplica depois. A dica da arma mostra `Dano: 9-17` (faixa para o seu nível atual).
  - Habilidades ativas: `base x multiplicador do rank (2 a 4,2) x (1 + dano%) x 0,92..1,08` (por isso 400 a 1.500 em nível alto). Pets em modo ataque: ~5 x (1 + nível/3) + bônus.
- **Defesa**: perícia nova. `R = Defesa + 4 x (armadura equipada + poção)`; redução = `R / (R + 60 + 2 x nível do monstro)` (teto 80%). A chance de o monstro acertar é `0,80 + 0,02 x (nível do monstro - Defesa)` (entre 50% e 97%); quando erra aparece "Esquivou". Dano de monstros acima do seu nível de combate sobe 4% por nível de diferença (mob +20 níveis = x1,8; teto x3,5); abaixo, cai (piso x0,5).
- **XP de combate (proporcional ao dano, regra do admin)**: cada golpe que acerta uma criatura rende à perícia ofensiva usada (Combate/Arquearia/Magia; habilidades ativas contam pela perícia do estilo) `XP = xpBase x (dano efetivo / vida máxima FINAL da criatura)`, com dano efetivo limitado à vida que ela ainda tinha (sem overkill). Ex.: XP base 1000 e vida 1000 = **1 XP por 1 HP tirado**; XP base 1000 e vida 2000 = 0,5 por HP. `XP_RATE`, humano (+5%), VIP, Mímicos e montaria entram por cima em `addXP` (frações são sorteadas, sem perder XP em golpes pequenos); a soma de uma criatura inteira é `xpBase x XP_RATE x bônus`. Pets não dão XP. **Defesa e Vitalidade** ganham por dano **sofrido** (depois da redução e da barreira, sem XP para esquiva, bloqueio total, cura ou morte): `dano x 0,80 x XP_RATE x relevância x (xpBase/vida da criatura ÷ 0,09)` (fator até x100), então criatura forte com XP base alto rende mais XP defensivo. Relevância por nível do monstro: nível < metade do seu nível de combate = x0,25; entre metade e igual sobe linear; igual ou maior = x1. O nível de combate é `0,5 x max(Combate, Arquearia, Magia) + 0,25 x (Defesa + Vitalidade)`.

| Nível | Vida máx. (base) | Mana máx. (base) | Poder de arma típico | Dano normal (arma típica) | Média | Redução de armadura típica |
|---|---|---|---|---|---|---|
| 1 | 100 | 50 | 4.2 | 9-17 | 13 | 30% |
| 5 | 140 | 70 | 5.1 | 12-22 | 17 | 34% |
| 10 | 190 | 95 | 6.2 | 17-29 | 23 | 37% |
| 20 | 290 | 145 | 8.4 | 29-49 | 39 | 42% |
| 30 | 390 | 195 | 10.6 | 45-77 | 61 | 44% |
| 40 | 490 | 245 | 12.8 | 68-114 | 91 | 46% |
| 50 | 590 | 295 | 15.0 | 96-161 | 129 | 47% |
| 60 | 690 | 345 | 17.2 | 130-218 | 174 | 48% |
| 70 | 790 | 395 | 19.4 | 172-288 | 230 | 49% |
| 80 | 890 | 445 | 21.6 | 222-371 | 297 | 49% |
| 90 | 990 | 495 | 23.8 | 281-469 | 375 | 50% |
| 99 | 1080 | 540 | 25.8 | 341-570 | 456 | 50% |


Armas e ativas nos níveis altos (melhor arma do nível):

| Nível | Melhor arma do nível | Golpe normal | Ativa x3 (média) | Ativa x4,2 com +30% de bônus |
|---|---|---|---|---|
| 30 | poder 18 | 57-96 | 190 | 346 |
| 60 | poder 30 | 175-293 | 586 | 1066 |
| 99 | poder 34 | 402-672 | 1343 | 2444 |


- **Tempo para subir** (simulado, 50% de aproveitamento do tempo em combate, `XP_RATE` = 1,5; lenhador sem tempo de deslocamento leva ~49 h para o 99):

| Nível | Combate/Arquearia/Magia (h) | Vitalidade e Defesa (h) |
|---|---|---|
| 10 | 0.1 | 0.0 |
| 20 | 0.3 | 0.1 |
| 30 | 0.7 | 0.2 |
| 40 | 1.3 | 0.5 |
| 50 | 2.4 | 1.1 |
| 60 | 4.6 | 2.4 |
| 70 | 9.1 | 5.4 |
| 80 | 18.2 | 12.7 |
| 90 | 37.5 | 30.0 |
| 99 | 73.3 | 66.2 |


- **Monstros**: tabela por nível (`Balance.mobTable(nível, camada)`): vida = golpes para matar x dano médio de um jogador típico do nível; dano = vida do jogador do nível / (golpes para morrer x (1 - redução típica) x 0,8). Comuns ~7 golpes para matar e ~15 para morrer, chefes ~30 / ~7, elites 14 / 10, Colosso de Pedra 250 / 6, Kharzul 60 / 6. Criaturas de recurso (vaca, galinha...) não atacam. Nível, vida e dano ficam na definição (`level`, `hp`, `dmin`, `dmax`, `maxHit = dmax`, `balV = 2`); o ataque do monstro sorteia em `[dmin, dmax]`. Só as criaturas **padrão do jogo** (sem `adm`) usam essa tabela; o XP base padrão delas é `vida x 0,09`. **O que o admin digita no editor DEV manda** (veja a seção a seguir).

- **Criaturas do Dev (DEV > NPCs/Monstros)**: os campos agora são respeitados, nunca sobrescritos pela tabela. Tudo mora em `Balance.applyMob` / `Balance.mobHp` (a mesma função no cliente, em `server.js` e em `security.js`), então o HP do mapa, o `maxHp` dos monstros vivos do servidor e a validação de dano usam o **mesmo HP final**.
  - **HP final = HP base (`dn-hp`) + HP por nível (`dn-hplvl`) x nível (`dn-level`)**. HP por nível padrão: **10** (comum) ou **100** (Grupo *Chefe*, `dn-group`); pode ser qualquer valor, inclusive **0**. Nível 0/vazio = só o HP base. Ex.: base 1000, nível 100, 10/nível = **2.000**; Chefe base 500, nível 50, 100/nível = **5.500**. HP base 0 = personagem sem vida (NPC).
  - **Dano**: `dn-hit` (Dano base) + `dn-hitlvl` (Dano por nível, vazio = 0) x nível = dano base **B**; cada golpe sorteia em `[0,9 x B, 1,5 x B]`. Se o Dano ficar **vazio** e houver nível, usa a tabela v2 daquele nível (e do tipo comum/chefe). O dano do Dev não recebe o fator por diferença de nível (o número digitado é o que bate).
  - **XP base (`dn-xp`)** vale a regra de XP acima (vazio = vida x 0,09). Velocidade, alcance, tamanho, comportamento, loot, nome, cores etc. voltam a ser salvos e valem. O editor mostra uma **prévia** (HP final, faixa de dano, XP por HP) e dicas.
  - **Migração sem destruir**: criaturas salvas antes (sem `hpBase`): as que já passaram pelo v2 mantêm a vida final como base (HP/nível 0); as do admin ainda sem v2 viram "definidas pelo admin" (o HP vira o base e, se tiverem nível, soma o HP por nível). Ao salvar o catálogo, o servidor recalcula o HP das criaturas do mundo e dos monstros vivos. Campos novos na definição: `hpBase`, `hpLvl`, `hit`, `hitLvl`, `adm`.
  - **Servidor/segurança**: o orçamento de XP aceito nos saves sobe junto com o maior XP base do catálogo (monstros do Dev com XP alto não geram strikes em jogo honesto).

| Criatura | Nv | Camada | Vida | Dano | Golpes para matar | Golpes para morrer |
|---|---|---|---|---|---|---|
| `rabbit_base` | 1 | critter | 35 | - | 2.7 | - |
| `chicken_base` | 1 | critter | 35 | - | 2.7 | - |
| `sheep_base` | 2 | critter | 35 | - | 2.5 | - |
| `cow_base` | 2 | critter | 35 | - | 2.5 | - |
| `pig_base` | 2 | critter | 35 | - | 2.5 | - |
| `rat_base` | 2 | trash | 40 | 6-11 | 2.9 | 23.4 |
| `bat_base` | 3 | trash | 45 | 6-12 | 3.0 | 24.5 |
| `slime_base` | 3 | light | 75 | 9-16 | 5.0 | 17.7 |
| `goblin_base` | 4 | light | 80 | 10-17 | 5.2 | 18.0 |
| `deer_base` | 5 | critter | 45 | - | 2.6 | - |
| `snake_base` | 5 | light | 85 | 11-19 | 5.0 | 17.6 |
| `wolf_base` | 7 | common | 135 | 15-26 | 6.9 | 15.1 |
| `boar_base` | 7 | common | 135 | 15-26 | 6.9 | 15.1 |
| `salt_slime` | 9 | light | 110 | 14-25 | 5.0 | 18.2 |
| `spider_base` | 9 | common | 155 | 17-30 | 7.0 | 15.1 |
| `orc_base` | 10 | common | 160 | 18-32 | 7.0 | 15.2 |
| `ghost_base` | 10 | common | 160 | 18-32 | 7.0 | 15.2 |
| `swamp_snake` | 11 | common | 170 | 20-34 | 6.9 | 14.9 |
| `bog_slime` | 12 | light | 130 | 17-30 | 5.0 | 18.1 |
| `skeleton_base` | 12 | common | 180 | 21-36 | 6.9 | 14.9 |
| `marsh_wisp` | 13 | common | 190 | 22-38 | 7.0 | 15.0 |
| `drowned` | 14 | common | 200 | 23-40 | 7.0 | 15.0 |
| `goblin_brute` | 14 | common | 200 | 23-40 | 7.0 | 15.0 |
| `forest_wisp` | 15 | common | 210 | 24-42 | 7.0 | 15.1 |
| `darkmage_base` | 16 | common | 220 | 26-44 | 7.0 | 14.9 |
| `dune_snake` | 16 | common | 220 | 26-44 | 7.0 | 14.9 |
| `whelp_base` | 16 | elite | 440 | 39-66 | 14.0 | 9.9 |
| `venom_spider` | 17 | common | 230 | 27-46 | 6.9 | 15.0 |
| `dire_wolf` | 18 | common | 250 | 28-48 | 7.0 | 15.0 |
| `sand_skeleton` | 20 | common | 270 | 31-52 | 6.9 | 15.0 |
| `troll_base` | 20 | boss | 1.150 | 66-111 | 29.5 | 7.0 |
| `grave_ghost` | 22 | common | 300 | 33-56 | 7.0 | 15.1 |
| `goblin_chief` | 22 | boss | 1.300 | 71-120 | 30.2 | 7.0 |
| `zombie` | 24 | common | 330 | 36-61 | 7.0 | 14.9 |
| `ice_bat` | 24 | common | 330 | 36-61 | 7.0 | 14.9 |
| `golem_base` | 24 | boss | 1.400 | 77-129 | 29.8 | 7.0 |
| `ent_elder` | 26 | boss | 1.550 | 82-138 | 30.1 | 7.0 |
| `sand_wraith` | 28 | common | 400 | 41-69 | 7.1 | 14.9 |
| `frost_wolf` | 30 | common | 430 | 43-73 | 7.0 | 15.0 |
| `sand_golem` | 30 | boss | 1.850 | 93-156 | 30.3 | 7.0 |
| `skeleton_knight` | 32 | common | 470 | 46-77 | 7.1 | 15.0 |
| `frost_ghost` | 33 | common | 490 | 47-80 | 7.1 | 15.0 |
| `apprentice` | 36 | common | 550 | 51-86 | 7.1 | 15.0 |
| `crypt_knight` | 36 | elite | 1.100 | 77-129 | 14.1 | 10.0 |
| `troll_elder` | 38 | boss | 2.550 | 115-193 | 30.2 | 7.0 |
| `necromancer` | 40 | elite | 1.250 | 84-142 | 13.7 | 10.0 |
| `dragon_boss` | 40 | boss | 2.750 | 121-202 | 30.2 | 7.0 |
| `ice_golem` | 42 | boss | 2.950 | 126-212 | 30.3 | 7.0 |
| `mummy_king` | 43 | boss | 3.050 | 129-216 | 30.2 | 7.0 |
| `dark_knight` | 44 | elite | 1.450 | 92-155 | 13.9 | 10.0 |
| `arcane_golem` | 45 | boss | 3.250 | 135-226 | 30.0 | 7.0 |
| `fire_whelp` | 46 | elite | 1.600 | 96-161 | 14.2 | 10.0 |
| `ash_bat` | 47 | common | 810 | 65-110 | 7.0 | 15.0 |
| `lich_boss` | 48 | boss | 3.600 | 143-240 | 30.1 | 7.0 |
| `ember_skeleton` | 49 | elite | 1.750 | 102-171 | 14.2 | 10.0 |
| `wboss_golem` | 50 | world | 32.000 | 174-291 | 249.0 | 6.0 |
| `frost_giant` | 52 | boss | 4.100 | 154-258 | 30.0 | 7.0 |
| `lava_golem` | 54 | boss | 4.350 | 160-268 | 29.9 | 7.0 |
| `forgotten_king` | 55 | boss | 4.500 | 163-273 | 30.0 | 7.0 |
| `mad_mage` | 58 | boss | 4.950 | 171-287 | 30.1 | 7.0 |
| `warlord` | 58 | boss | 4.950 | 171-287 | 30.1 | 7.0 |
| `drake` | 62 | boss | 5.500 | 183-306 | 29.8 | 7.0 |
| `black_dragon` | 78 | raid | 17.000 | 266-445 | 60.2 | 6.0 |


  Contra monstros 20 níveis acima do jogador típico (dano x1,8 pelo nível, mais acerto e menos redução):

| Jogador | Monstro +20 níveis | Dano médio por golpe | Golpes para morrer | Golpes para matar |
|---|---|---|---|---|
| 10 | 30 | 75 | 2.6 | 19 |
| 30 | 50 | 105 | 3.8 | 15 |
| 50 | 70 | 135 | 4.5 | 12 |
| 70 | 90 | 165 | 4.9 | 12 |


- **Cura**: `Balance.healOf(bruto) = bruto x 10` (Pão 60, Peixe 80, Salmão 140, Poção de Vida 200, Poção Maior 400, Peixe-dragão 480); mana `x 5` (Poção de Mana 75). Descrições antigas ("Cura 20 HP") são reescritas na tela por `Balance.fixDesc`. Dica de armadura mostra `Defesa +4 x defBonus`; dica de munição/amuleto mostra `Dano +5% x bônus`.
- **Requisitos de nível** de armas, armaduras, minérios, receitas e magias foram **dobrados** (`Balance.reqLevel`: Aço 20, Mithril 30, Dragão 60...). Conquistas por nível e recompensas de XP de missões/diárias foram reescaladas (x2 nos níveis, x6 e x4 no XP).

### Segurança e migração

- `security.js` usa `Balance`: o nível é derivado do XP (nível sem XP = revertido), orçamento de XP por perícia de ~4.600 XP/s sustentados ou 1.000.000 de uma vez (jogo limpo nunca chega perto; VIP x4 e humano x1,05 inclusos), `maxHp <= 100 + 10 x (Vit-1) + 70 (classe/raça) + árvore + 40` (mana análoga), golpe máximo `Balance.hitCap(nível)` (melhor arma do nível x habilidade até x4,2 x dano% da árvore x crítico x conjunto/marca, com folga; habilidades ativas só existem a partir do nível 5) e dano por segundo `hitCap x 3,3` (L1: 54 / 179 por s; L30: 2.229 / 7.356; L99: 42.137 / 139.053). A vida dos monstros vem do catálogo/mundo do servidor (`expectedMaxHp`, até 2.000.000). Admin continua isento.
- **Migração das contas** (`playerData.balV = 2`, idempotente): o nível de cada perícia é preservado; o XP antigo vira o XP mínimo daquele nível na tabela nova **mais a mesma fração de progresso** dentro do nível (save com só o nível = XP mínimo do nível). A Defesa nasce igual ao nível de Combate antigo. Vida e mana máximas são recalculadas pela fórmula nova (com classe, raça e árvore) e curadas por inteiro; inventário e o resto não mudam. Roda **no servidor ao iniciar** (`balanceMigrate` em `server.js`: contas, `npcDB` salvo e criaturas do mundo salvo; também depois de `/api/restore`) e **no cliente no login** (caso o servidor entregue um save antigo). Um cliente desatualizado que tente salvar sem `balV` recebe `409 {code:'OUTDATED'}` ("recarregue a página").
- Monstros do `npcDB`/mundo salvos antes do balanceamento (sem `balV`) são convertidos uma vez; os que o admin editar depois no DEV já saem com `balV` e valem como digitados.

### Como ajustar

1. Edite as constantes de `public/balance.js` (ou a tabela `MOBS`/`TIERS`) e rode `node tools/sim_balance.js` (ver abaixo) para ver XP/vida/dano/tempo por nível e golpes para matar/morrer por criatura, até ficar saudável e monotônico.
2. Mais rápido/lento para todos: `XP_RATE`. Combate mais letal ou mais fácil: `TIERS[...].ttd`. Monstros mais duros: `TIERS[...].hits`. Armas mais fortes: `RATING_W`.
3. Mexeu no dano ou na vida? Os tetos do servidor acompanham sozinhos (`hitCap`, `dmgPerSecCap`, `maxHpAllowed` são derivados das mesmas fórmulas).

### Simulador e testes

`tools/sim_balance.js` reproduz as fórmulas e imprime as tabelas deste capítulo (`node tools/sim_balance.js [xp|hp|time|mobs]`). O teste de navegador do balanceamento cobre: faixa de dano fixa e XP por dano (guerreiro, arqueiro, mago), Defesa/Vitalidade só ao apanhar (fraco x forte), comida e poções, morte e renascimento, chefes, auditoria de todos os monstros (sem `undefined`/NaN/0), migração de conta antiga, relogin, conta nível 99 jogando limpo (ativa acima de 400 de dano e zero strikes no `security.log`) e celular 844x390.

## Árvore de Habilidades (`public/skillnodes.js`, `skilltree.js`)
- **Abrir**: tecla **K**, botão de estrela ao lado de Social/Diário (no celular, na fileira do topo) ou cartão na aba Perícias. Modal grande com abas Guerreiro / Arqueiro / Mago (★ marca a árvore da sua classe, mas qualquer um pode investir em qualquer árvore). Arraste para mover, roda/pinça para zoom, botões +, − e ajustar. Toque/clique num nó para ver descrição, rank atual e próximo, pré-requisitos e o botão Aprender.
- **Pontos**: `floor((nível - 1) / 2)` por perícia (Combate -> Guerreiro, Arquearia -> Arqueiro, Magia -> Mago), não transferíveis entre árvores (nível 3 = 1 ponto, nível 99 = 49). A UI mostra "Pontos: X disponíveis / Y totais".
- **Nós** (`skillnodes.js` é compartilhado cliente/servidor): ~19 passivas por árvore (rank 1-5, 1 ponto por rank) somam atributos em `Stats.addSource('skilltree')` e bônus próprios (dano %, dano de habilidade %, vida/mana máx., regenerações, redução de recarga); 6 ativas por árvore (rank 1-3, 2 pontos por rank) vão para a barra de habilidades.
- **Barra**: 4 slots, teclas **Q E F G** em um **selo dourado bem visível** no canto de cada slot (no celular o selo mostra a ordem 1-4), mais a **recarga base** (embaixo à esquerda), o **custo** de mana/flechas (embaixo à direita) e a recarga circular com contagem. O slot da habilidade de set é roxo, com selo **Z** (celular: SET). Teclas não disparam com chat aberto, modal aberto ou campo de texto focado. Funcionam montado (montaria ou pet).
- **Editar a barra** (qualquer ativa aprendida em qualquer slot): **botão direito** num slot remove; passar o mouse mostra um **×** vermelho e a dica "Clique direito: remover · Arraste: reordenar"; **arraste** um slot para outro para trocar de lugar ou **para fora da barra** para remover; **clique num slot vazio** (ou no lápis ✎ + clique num ocupado) abre o seletor com todas as ativas aprendidas (nome, rank, custo, recarga e o slot atual), inclusive "Esvaziar o slot"; escolher uma que já está na barra troca as duas de lugar. No celular: **toque longo** num slot (ou o botão ✎) liga o modo editar (× em todos os slots, toque para trocar, arraste para reordenar). Dentro da árvore (K) há a faixa **"Sua barra"** no rodapé (mesmas teclas, × e arrastar; com um nó ativo selecionado, tocar num slot vazio o equipa) e o painel do nó tem "Equipar na barra: Q/E/F/G" mostrando o que cada slot substitui e "Remover da barra". Tudo salva em `skillTree.bar` e o servidor saneia (ids inexistentes, repetidos ou não aprendidos viram vazio).
- **Barra recolhível e móvel** (`skilltree.js` + `ui.css`): a alça **⠿** (à esquerda da barra) arrasta a barra com mouse ou toque; a posição fica salva neste aparelho (`localStorage` `ms_sk_barui`, em fração da tela, então se ajusta ao girar/redimensionar e nunca sai da tela). O botão **▾ / ▴ Hab.** recolhe a barra para uma abinha pequena e expande de novo (estado salvo; **padrão: recolhida no celular, aberta no computador**). No modo editar (✎) aparece **Resetar posição**. A barra fica **abaixo** do HUD, do chat, da barra rápida e dos botões (z-index 88), e **some sozinha** com modal, banco, janelas (Mímicos, Mascotes, Estatísticas), árvore de habilidades ou gaveta do celular abertos. Posição padrão: acima da barra rápida (computador) / acima dos botões Ação e Atacar (celular).
- **Requisitos de arma** (mensagens claras): Guerreiro = arma corpo a corpo; Arqueiro = arco + flechas (gasta flechas, respeita "poupar munição"); Mago = cajado + mana (a mana agora regenera sozinha: 0,25 + 0,6% da máxima por segundo, mais passivas).
- **Ativas**: Guerreiro Golpe Poderoso, Grito de Guerra, Investida, Furor, Muralha, Terremoto. Arqueiro Tiro Preciso (crítico garantido), Disparo Múltiplo, Passo Sombrio, Marca da Presa, Flecha Perfurante, Chuva de Flechas. Mago Bola de Fogo, Raio de Gelo, Cura (Menor/Maior), Nova Arcana, Escudo Arcano, Tempestade.
- **Dano**: dano-base da perícia x multiplicador do rank x (1 + dano% + dano de habilidades%), sempre via `applyDamage` (crítico, roubo de vida, XP, loot, relatório ao servidor, Mímicos e pets). Linha de visão (`LOS`) para mirar e para projéteis (batem na parede). Área: até 8 alvos, lista de inimigos em cache de 200 ms. Pets em modo ataque ajudam como de costume.
- **Tetos do servidor (`security.js`/`server.js`)**: o golpe máximo subiu de 500 para **900** (`HIT_ABS`) e o orçamento de dano por segundo de 1500 para **3000**; o limite de 20 relatórios/s continua. O cliente limita o dano-base das habilidades (conforme o mesmo teto de `hitCap`) e usa uma fila de golpes (~9 golpes/s, ~1100 de dano/s), então jogar honestamente, mesmo em nível 99, não gera strikes (testado com spam de todas as ativas em 8 monstros).
- **Redistribuir**: botão por árvore, com confirmação na própria janela. Primeira vez grátis; depois 250 moedas por ponto gasto naquela árvore. Tira as ativas daquela árvore da barra.
- **Salvamento** (`playerData.skillTree`): `{pts:{warrior,archer,mage}, bar, hint, rs, cd, ap}`. O servidor saneia por lista branca de ids (`SkillNodes.clean`): nó inexistente, árvore errada ou rank acima do máximo = strike `skilltree` e remoção; pré-requisito quebrado ou pontos acima do que as perícias do save permitem = ajuste silencioso (log `SKILLTREE`). Vida/mana máx. vindas da árvore ficam embutidas em `maxHp/maxMp` e o servidor soma o mesmo bônus ao limite de validação.
- **Efeitos**: partículas, projéteis, anéis, raios, barreiras e marcas são desenhados só no cliente de quem usa (outros jogadores só veem a animação de ataque). Lentidão e atordoamento valem para quem simula os monstros do mapa (o host) e para o ataque do monstro. Morte cancela buffs e barreira; trocar de mapa cancela projéteis e zonas; a recarga continua (guardada em `cd`, não reinicia ao relogar).
- **API/depuração**: `SkillTree.open/close/learn(id)/reset(tree)/cast(slot)/castId(id)/points(tree)/state()`; pontos de teste: com conta admin dá para ajustar `player.stats.skills.combat.level` e salvar.

## Habilidades de Set (`public/setskills.js`)
- Um conjunto **completo** equipado libera uma habilidade especial num slot dedicado (tecla **Z**, botão com brilho ao lado da barra; some quando o set é desfeito). Recarga guardada em `skillTree.cd`.
- **Mímico** (todas as peças da classe, recarga 60-120 s, poder cresce com o nível médio das peças): Guerreiro **Fúria Imortal** (barreira + dano + roubo de vida), Arqueiro **Tempestade Fantasma** (chuva espectral), Mago **Eclipse Arcano** (explosão que atordoa e devolve mana).
- **Evolutivos** (3+ peças, recarga 90-150 s): Bronze Pele de Bronze, Ferro Pele de Ferro, Aço Giro de Aço, Ouro Toque Dourado, Mithril Passo Mítrico, Escama de Dragão Sopro de Dragão, Patrulheiro Olho de Falcão, Couro de Dragão Flecha Dragão, Místico Surto Místico, Arcano Nova Congelante. Conjuntos de 2 peças não têm habilidade.
- Mostrado em "Habilidade do Set: nome - descrição" nas dicas dos itens, no painel Mímico, na aba Equip. e na barra. Não exige tipo de arma; funciona montado (montaria ou pet).

## Dev: dar itens (`public/gift.js`) e itens colocados no mundo
- **Presentes**: DEV > *Presentes*. Busca jogador (online/offline) e item do catálogo inteiro, quantidade 1..2.147.483.647 e mensagem opcional. `POST /api/admin/give` (admin verificado no servidor, rate limit, whitelist de itens) grava no **correio do mercado** (`db.market.mail`): id único, entrega atômica com confirmação após salvar, não duplica ao relogar e fica na fila se a mochila estiver cheia (chega online em até ~20 s). Registrado em `DATA_DIR/admin-gifts.log` e `security.log`; histórico em `GET /api/admin/gifts`, busca em `GET /api/admin/search`. Presentes não entram nos tetos anti-trapaça.
- **Itens de mundo (`wi:1`)**: ao colocar um item no modo construção o admin vê a tag tracejada "Item • único" ou "Item • reaparece 5m" (só no modo construção e só para admin); clique abre o modal (quantidade, "reaparece", segundos) e o botão direito/Apagar remove e persiste. Padrão `respawn:false`: cada jogador pega **uma vez** e o item some para ele (`player.taken[mapa_id]`); `respawn:true` volta após `respawnSecs` para quem pegou. Itens largados por jogadores, drops de monstros e `np` nunca entram no mundo salvo (`buildWorldCopy` no cliente e `cleanWorld` no servidor).

## Progressão por nível, venda a NPC e recarga em itens (`public/econ.js`, `public/progress.js`)
- **Fonte única**: `econ.js` (cliente e servidor) tem a tabela de níveis dos equipamentos, as árvores (comum, carvalho 15, salgueiro 30, bordo 45, teixo 60, mágica 75), rochas (cobre/estanho 1, ferro 15, carvão 30, mithril 55), ferramentas (nível e velocidade), fundição, culinária, Artesanato (60% do nível de equipar) e os preços de venda. `progress.js` liga isso ao jogo.
- **Níveis**: `Stats.reqOf/canEquip` usam `Econ.reqOf` em TODO equipamento (Mímicos continuam sem requisito). O que o jogador não alcança fica bloqueado ao equipar e, se já estiver equipado (item dropado, conta antiga), é guardado na mochila em até ~6 s (admin isento). Árvore e rocha exigem o nível e a ferramenta (machado/picareta tem nível mínimo); Culinária e Artesanato mostram "Requer ... nível N" nas receitas.
- **Mais rápido com o nível**: tempo por golpe/fundição/cozinha = base × `(1 − min(0,45; nível/220))` × velocidade da ferramenta (antes parava de melhorar no nível 30). Chance de falhar o golpe cai com o nível e, nos altos, dá o dobro (`Econ.successChance/doubleChance`).
- **Venda a NPC**: mercadores ganham a seção **Vender** (preço por unidade, 1/10/Tudo; confirmação em vendas ≥ 500). Preço automático: ~15% do preço de loja (equipamento) e ~30% (recursos/comida/poções), sempre menor que o de compra e limitado pelos materiais (sem loop de lucro). **No Dev** (Itens): `Preço de venda (NPC)`: número = preço escolhido, `0` = não vende, vazio = automático; `Nível mínimo (equipar)`. Nunca vendem: Mímicos, pets, montarias, encantados, iscas, caixas, itens de missão.
- **Recarga (`cdr`)**: Mímicos ganham `cdr` (anel/amuleto/elmo/capuz/chapéu; ~15% com o set no nível 50) e há as joias craftáveis **Anel do Foco** (4%) e **Amuleto do Tempo** (6%). Soma com a árvore, teto 40%, mínimo 1,5 s.
- O editor de itens do Dev agora **preserva** os campos que ele não mostra (crítico, set, requisitos...) ao salvar um item existente.

## Pacotes de Conteúdo (adicionar itens, monstros e mapas sem deploy)

Dev > **Injetor de Expansão** (só admin). Cole um pacote JSON (ou o mesmo JSON em Base64), clique em **Pré-visualizar** (valida e lista erros/avisos sem mudar nada) e depois em **Injetar pacote**: o jogo aplica, salva no servidor (que valida de novo e guarda backup do mundo) e todos os jogadores recebem na próxima sincronização. **Desfazer último** restaura os itens, monstros e mapas que o pacote tocou. Reaplicar o mesmo pacote não duplica entidades (elas levam a marca `pk` com o nome do pacote). O botão **Modelo** insere um exemplo.

Formato (arquivo `public/packs.js` tem o cabeçalho completo; `edges: {mapaExistente: [{id,d,a,b,to,td,ta,tb}]}` abre uma saída pela borda num mapa que já existe, com corredor limpo e estrada; reaplicar o pacote remove o que ele deixou antes): `name` (obrigatório), `items` (chave = nome do item; equipamentos com `slot` e `req: {skill, lvl}`; `sell` = preço de venda ao NPC), `npcs` (chave = id sem espaços; `hp`, `maxHit`, `xp`, `lootStr`...), `maps` (mapa novo com `width`, `height`, `entities`; mapa que já existe só recebe as entidades, a menos que `"replace": true`) e `entities` (lista de entidades acrescentadas a mapas existentes, por id do mapa). Dá para pedir ao Claude "gere um pacote com ..." e colar aqui.

### Pacote pronto: Reinos de Solaris (`docs/packs/reinos-de-solaris.json`)

Região nova com 7 mapas ligados por bordas (andar até a beirada); entra-se pela borda leste da **Mina de Pedra** (estrada nova até as Colinas Ventosas); sem portal na Vila. Mapas: **Colinas Ventosas** (nv 7-15, chefe Capitão Dente-de-Ferro), **Floresta dos Cogumelos** (14-24, Rainha dos Esporos), **Lago Cristalino** (13-24, Leviatã do Lago, pesca), **Ruínas Solares** (27-36, Guardião Solar), **Montanha do Trovão** (35-46, Rei Troll Grumak, minério) com a **Caverna dos Cristais** (masmorra, 40-54, Coração de Cristal) e **Cidadela da Tempestade** (48-58, Lorde da Tempestade). Traz 29 monstros/NPCs (vida e dano da tabela do jogo, por nível), 20 itens novos (nível mínimo e preço de venda) e um portal na Vila de Aldeburgo (perto da estrada leste) para as Colinas. Instale em Dev > Injetor de Expansão > **Abrir arquivo .json** > Pré-visualizar > Injetar; **Desfazer último** remove tudo. O arquivo é gerado por `node tools/gen-expansion.js` (determinístico).

### Pacote pronto: Terras Sombrias (`docs/packs/terras-sombrias.json`)

Continente para jogadores fortes (pensado para vitalidade/defesa ~30-40 e muito dano; monstros nv 52-78 pela `Balance.mobTable` com dano reduzido: ×0,8 comuns/elites, ×0,7 chefes). Chega-se andando do **Porto dos Mares** para o sul (borda sul → **Estaleiro de Porto dos Mares**), embarcando no cais para o **Navio** e desembarcando na **Costa de Ossos**; no mapa-múndi (M) o continente fica a sudoeste. Se o mundo não tiver `porto_mares`, a ligação é ignorada com aviso: use Auditar conexões. Mapas: Costa de Ossos, Pântano Negro, Floresta Murcha, Cemitério dos Reis, Fortaleza de Obsidiana, Cratera de Cinzas (bordas ligadas) e Cripta Abissal (portal no Cemitério; chefe final Rei Lich Vaelor). Itens de nv 58-75 (obsidiana, abissal, cinzas). Gerado por `tools/gen-sombrio.js`. Mar e lagoas usam a água do jogo, então dá para pescar na margem.

### Auditoria de conexões (Dev > Importar)

**Auditar conexões** lista mapas soltos (sem caminho a partir da Vila por portais ou bordas) e becos sem saída. **Ligar mapas soltos** cria portais de ida e volta em pontos livres (vizinho mais próximo na grade, senão a Vila) e é desfazível por "Desfazer último". Código: `Packs.audit` / `Packs.autoLink`.

### Pesca da margem
Vara: o jogador para na beira da água (alcance até ~270px) e lança longe. Rede: entra cerca de 30px na água, mais perto do ponto. Lógica em `Fishing.arrived` (usada no movimento de `index.html`).

## Jornada (tecla N)

Botão **Jornada** (ou tecla `N`): recompensa diária com sequência de 7 dias, missões diárias e semanais (+ bônus por concluir todas), Códice (mapas, espécies, chefes, abates), Maestria após o nível 99 (bônus pequenos e com teto em Stats) e placar semanal do Colosso. Tudo que dá recompensa é decidido no servidor (`engagesrv.js`, `/api/engage`) e chega pelo correio; o cliente (`public/engage_ui.js`) só mostra e informa progresso de coleta, pesca, cozinha e fabricação (`Engage.prog`, em lote, com teto por minuto no servidor). `addXP(skill, n, true)` entrega XP bruto (sem multiplicadores) para recompensas de missão.

## Textos para o jogador e nomes em português (`public/labels.js`)
- As **chaves internas** dos itens (`'Bronze Sword'`, `'Iron Bar'`...) não mudam (saves, receitas, servidor, `itemnames.json`). O que o jogador lê vem de `itemLabel(nome)` / `Labels.tr(texto)` em `labels.js`: nome em português para todo item do catálogo, perícias (Combat→Combate...), magias e estações. Uma observação da tela (MutationObserver) troca nomes em inglês em painéis, dicas e menus (não mexe em campos de texto, chat nem no painel Dev) e `setActionText`/`addFloatingText` também passam por `Labels.tr`. Item novo em inglês: acrescente em `Labels.ITEM`; `Labels.missing()` lista o que ficou sem rótulo.
- Regras de texto ao jogador: nunca citar admin/Dev, servidor/cliente, limites técnicos, códigos HTTP ou como a segurança funciona; mensagens curtas, em português, tom de fantasia medieval. Itens exclusivos (Mímicos) só têm lore/efeito na descrição, nunca como se obtêm (presentes e missões especiais continuam existindo, só não são citados ao jogador).
