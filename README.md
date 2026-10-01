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

## Segurança
O jogo é **cliente-autoritativo** (inventário, XP, moedas e posição nascem no navegador), então o servidor faz validação de envelope e de plausibilidade, sem nunca atrapalhar quem joga limpo.

**Contas e sessão**
- Senhas com scrypt + comparação em tempo constante (contas antigas em texto puro migram no próximo login). Mínimo 6 caracteres; lista de senhas triviais e "senha igual ao nome" são recusadas.
- Token aleatório de 32 bytes, validade de 30 dias renovável (1 gravação/h), máx. 8 sessões por conta; sair invalida o token no servidor.
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
- **Montarias (9)**: cavalos marrom/branco/de guerra, lobo gigante, cavalo esqueleto, cavalo de fogo, unicórnio, pantera e dragão (+40% a +80% de velocidade). Total de velocidade (pet + montaria) limitado a +80% (`Pets.cfg.SPD_CAP`). Tecla `V` (botão ao lado de Ação no celular). Montado não luta ("Desmonte para lutar"); não monta em interiores/loja/banco; desmonta ao pescar ou interagir. A hitbox do jogador não muda.
- **Como obter**: drops por monstro/chefe (`Pets.cfg.dropMul`), baús, pesca, lojas (Mercador: Pet Gato, Sela Cavalo Branco; Fazendeiro: Pet Coelho, Sela Cavalo Marrom) e craft (Sela Cavalo Marrom).
- **Atributos**: crítico e sorte entram como fonte `'pets'` em `Stats.addSource`; demais bônus em `Pets.bonus()`; velocidade via `Pets.speedFactor()` aplicada só durante `update()`.
- **Rede**: `/api/sync` leva `pet {id,l}` e `mount`; o servidor sanitiza (`extras.cleanPetSync`, `cleanMountId`) e `/api/save` passa por `extras.cleanPetData` (whitelist de ids/modos, nome 14 chars, nível 1..10). Pets de outros jogadores são simulados localmente (máx. 40 por câmera).
- **Evolução das montarias**: cada sela tem nível 1..30 e XP própria, em `player.mounts[id] = {lvl, xp, name?}` (o formato antigo `1` é migrado para nível 1). Ganha ~1 XP a cada 40 px cavalgados + 1 XP a cada 10 s andando montado; o XP para subir é `250 * 1,2^(nível-1)` (nível 10 em ~20 min, 20 em ~2 h, 30 em ~14 h cavalgando). A velocidade é a base `x (1 + até 20% no nível 30)` e continua sob o teto global de +80% (o dragão já chega nele; o ganho dele vem do bônus secundário). Cada espécie ganha um bônus secundário a cada fase (só montado): Marrom moedas +2%, Branco regen +3%, de Guerra XP +2%, Lobo/Pantera sorte +2%, Esqueleto regen de mana +4%, de Fogo XP +2%, Unicórnio regen +4%, Dragão XP +3% (por fase, até 3 fases).
- **Fases visuais** (níveis 10/20/30): 1 arreios; 2 aura (e armadura de cavalo de guerra nos cavalos comuns); 3 penacho/crista e aura forte com faíscas; cavalo de fogo deixa rastro de brasas; o dragão cresce +5% por fase (até +15%, só visual, a hitbox não muda). Os outros jogadores veem a fase pelo campo `ms` (0..3) do `/api/sync` (sanitizado em `extras.cleanMountStage`).
- **Painel**: aba Montarias (tecla `P`) mostra nome (editável, 14 caracteres), nível, fase, barra de XP, bônus atuais e o que vem no próximo nível/fase.
- **Servidor**: `extras.cleanPetData` limita nível 1..30, XP >= 0 e abaixo do necessário, ids por whitelist e nome só com letras/números; `security.checkCollections` impõe orçamento de XP de montaria por minuto (montaria nova começa no nível 1) e reverte só a montaria suspeita.
- **Depuração**: `Pets.state()`, `Pets.isMounted()`, `Pets._P`.

## Itens Mímicos (`public/mimic.js`, `mimicnames.js`)

Equipamentos raros e "vivos" (aura roxa/dourada que pulsa, olhinhos e dentes sutis no ícone e no boneco, nas 3 vistas) que **evoluem com o personagem**. Três sets: **Mímico do Guerreiro** (6 peças: Elmo, Peitoral, Espada, Escudo, Anel, Amuleto), **Mímico do Arqueiro** (5: Capuz, Gibão, Arco, Anel, Amuleto) e **Mímico do Mago** (5: Chapéu, Manto, Cajado, Anel, Amuleto). Nome do item: `Elmo Mímico do Guerreiro`, `Arco Mímico do Arqueiro`, `Cajado Mímico do Mago`... (sem nível mínimo: dá para usar desde o início e elas crescem com você).

- **Evolução**: cada peça tem estado próprio `player.mimic[nome] = {lvl 1..50, xp}` (uma de cada por conta). XP para o próximo nível: `round(50 * 1.11^(lvl-1))`. Defesa/dano base (`defBonus`/`bonusDmg`) e os atributos (crítico, dano crítico, vel. de movimento/ataque, roubo de vida, sorte, redução de dano, dano mágico, poupar munição) crescem do nível 1 ao 50 numa curva suave; os atributos entram em `Stats.addSource('mimic', ...)` só enquanto a peça está equipada e aparecem no painel Atributos e na tooltip.
- **XP desviado** (tecla **N** ou botão "Mímicos" ao lado do pet): `player.mimicPct` (0..100, passos 0/10/20/25/.../100, padrão 0). De todo XP ganho em qualquer perícia, X% vai para os Mímicos equipados (dividido igualmente entre as peças abaixo do nível 50) e o jogador recebe (100-X)%: o painel mostra "Você recebe 70% / Mímicos 30%". Restos de arredondamento são acumulados (nada se perde nem duplica). Sem peça equipada (ou todas no nível 50) o XP fica todo com o jogador. Subir de nível mostra aviso, faíscas e salva.
- **Bônus de set**: peças do mesmo set equipadas. Parcial (2+ peças) = bônus base × peças/total; completo = bônus cheio + marcos pelo nível médio (10/25/50). O bônus base cresce até +50% com o nível médio. Guerreiro: +10% dano corpo a corpo, 5% redução (marcos: roubo de vida 2%; dano crítico +20% e +3% red.; +10% dano e +5% crítico). Arqueiro: +12% crítico, 15% poupar munição (marcos: +5% vel.; dano crítico +25% e +5% vel. de ataque; +8% dano à distância e +6% crítico). Mago: +12% dano mágico, +8% regen. de mana por 10 s (marcos: +2 dano mágico; 10% poupar runas e +4% crítico; +8% dano mágico e +3 dano mágico). O painel mostra "Set 4/6 · ✔ completo" e os marcos; a tooltip da peça mostra o set.
- **Ligados à conta**: não vão ao mercado nem à troca (cliente `Net.tradable` e servidor: `extras.market create` e `social trade_offer` recusam), não se desmancham (`Recycle` com aviso), não se encantam (a Mesa de Encantamento mostra aviso e recusa) nem se jogam fora (aviso para guardar no banco). O banco aceita.
- **Como obter** (raro): chefes (Dragão 10%, Lich Rei 14%; demais chefes 6%, 9,6% se `hp>=500`; "chefes" fracos de `hp<300` só 1%), chefe de mundo (30%), monstros das masmorras profundas (Catacumba do Rei, Torre do Mago, Ruínas de Sahr-Kal, Mina Abandonada, Ninho do Dragão, Catacumbas: 0,4% com `hp>=60`), baús do tesouro da pesca (1,2%) e peixes raros (0,4%) — todos multiplicados pela Sorte; `Mimic.cfg.drop`. A peça sorteada é, em 70%, da classe da perícia mais alta do jogador e prefere peças que ainda não tem. Também há a **Caixa Mímica** (Ofícios: 6 Gold Bar, 4 Dragon Scale, 2 Stone Core, 1 Soul Gem; ligada à conta): ao usar, entrega uma peça aleatória. Peça duplicada vira XP (60% do nível atual) ou 3.000 moedas se já estiver no nível 50.
- **Servidor**: `mimicnames.js` guarda a lista branca de nomes e `cleanMimicData` (chamado em `/api/save`): nomes inventados saem, `lvl` vira inteiro 1..50, `xp` 0..1e7 (0 no nível 50) e `mimicPct` inteiro 0..100.
- **Testes/depuração**: `Mimic.grant('Elmo Mímico do Guerreiro')`, `Mimic.addXp(nome, n)`, `Mimic.setPct(50)`, `Mimic.state()`, `Mimic.setInfo('guerreiro')`. Admin: no painel Mímicos há "Admin: dar peça" (também dá a Caixa Mímica). Integração: ganchos em `addXP`, `applyDamage`, `useItem`, `Life.cnt` (como pets.js), `Stats.tipHtml`, ícones (`icons.js`) e desenho do personagem (`art.js`).

## Dev: dar itens (`public/gift.js`) e itens colocados no mundo
- **Presentes**: DEV > *Presentes*. Busca jogador (online/offline) e item do catálogo inteiro, quantidade 1..2.147.483.647 e mensagem opcional. `POST /api/admin/give` (admin verificado no servidor, rate limit, whitelist de itens) grava no **correio do mercado** (`db.market.mail`): id único, entrega atômica com confirmação após salvar, não duplica ao relogar e fica na fila se a mochila estiver cheia (chega online em até ~20 s). Registrado em `DATA_DIR/admin-gifts.log` e `security.log`; histórico em `GET /api/admin/gifts`, busca em `GET /api/admin/search`. Presentes não entram nos tetos anti-trapaça.
- **Itens de mundo (`wi:1`)**: ao colocar um item no modo construção o admin vê a tag tracejada "Item • único" ou "Item • reaparece 5m" (só no modo construção e só para admin); clique abre o modal (quantidade, "reaparece", segundos) e o botão direito/Apagar remove e persiste. Padrão `respawn:false`: cada jogador pega **uma vez** e o item some para ele (`player.taken[mapa_id]`); `respawn:true` volta após `respawnSecs` para quem pegou. Itens largados por jogadores, drops de monstros e `np` nunca entram no mundo salvo (`buildWorldCopy` no cliente e `cleanWorld` no servidor).
