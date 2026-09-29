# Forja-deira: Documento de Design (GDD) v0.9

> Progressão de personagem por atributos, classes e resets + combate isométrico e masmorras procedurais, num RPG de ação **single-player e 100% offline**.

Status: **protótipo jogável** em um único arquivo HTML (`dist/forja-deira.html`), gerado a partir dos módulos de `src/` por `tools/build.py`. Não precisa de internet nem de servidor: arte, fontes e bibliotecas vão embutidas, e o progresso fica salvo no navegador.

> **Mudança de escopo (27/09/2026):** o jogo passou a ser totalmente offline. Foram removidos carteira, token TRZ, mint de NFT, mercado, staking, servidor autoritativo, chat e PvP online. 
>
> **Novo nome (28/09/2026):** o jogo passou a se chamar **Forja-deira**. O arquivo jogável agora é `dist/forja-deira.html` e o save usa a chave `forjadeira.save.v1`.

---

## 1. Ajustes feitos em relação ao briefing

Cada ajuste abaixo muda algo concreto no código. Nenhum remove um pilar do briefing.

| # | Briefing | Ajuste | Por quê |
|---|---|---|---|
| 1 | Nomes de mapas e classes | Nomes de mapas, NPCs e chefes são **originais** (Aldrena, Floresta Sussurrante, Rainha Aracnídea…). Nomes de classe ficam como **provisórios** | Antes do lançamento público, revisar também os nomes de classe (ver §10). |
| 2 | Fórmulas de atributos | As classes seguem um modelo de *relações de atributo* (`alvo = multiplicador × fonte`) | Deixa o balanceamento de cada classe declarativo e fácil de testar. |
| 3 | 9–15 classes | Elenco de 15 definido, **3 jogáveis no MVP** (DK, DW, Elf), como a própria Fase 1 pede | Cada classe exige ~6 habilidades, árvore, modelo e balanceamento. |
| 4 | Nível 800–1100+ e resets | **Nível máximo 1000**, **reset a partir do 400**, pontos fixos por reset + bônus por nível acima de 400 | Resolve a tensão entre "cap alto" e "reset": quem gosta de grind vai até 1000; quem gosta de reset reinicia no 400. |
| 8 | Magic Find visível | Tabela de drop **visível no jogo** (painel Drops), MF com **teto suave** (retorno decrescente) e **seed por drop** | Transparência: a mesma seed sempre gera o mesmo item. |
| 9 | Aprimoramento de itens | Fusão Chaos que falha **volta o item a +0**, sem destruí-lo; custa 1.000.000 Gold | Perder um item de horas de farm por azar frustra mais do que desafia. |
| 11 | — | **Pet vendedor**: envia itens comuns para a cidade e volta com Gold | Mantém o ritmo contínuo de combate, sem voltar à cidade. |
| 14 | Mobile | Layout responsivo e toque **desde o protótipo** | Portar HUD tarde sai caro; o protótipo já funciona em 390 px. |
| 15 | Assets de terceiros | **Descontinuado (27/09/2026).** O jogo não lê arquivos de arte de terceiros: modelos, mapas e texturas são só os próprios do projeto | Evita dependência de terceiros e risco de PI. Ver §11. |
| 16 | Itens NFT, token, mercado e staking | **Descontinuado (27/09/2026).** Jogo 100% offline | Sem dependência de rede, carteira ou regulação de token; o foco fica no combate e no loot. |

---

## 2. Pilares

1. **Clique cinético**: combate que responde no mesmo quadro, sem nada esperando rede.
2. **Progressão profunda**: pontos de atributo, evolução de classe, resets, jewels, itens Excelentes.
3. **Loot honesto**: tabela de drops visível e cada rolagem reproduzível pela seed.
4. **Offline de verdade**: abre e joga sem internet; o save fica no navegador.

---

## 3. Classes

### 3.1 Elenco

| Fase | Classes |
|---|---|
| 1 (MVP) | Dark Knight → Blade Knight → Blade Master · Dark Wizard → Soul Master → Grand Master · Fairy Elf → Muse Elf → High Elf |
| 2 | Summoner, Magic Gladiator, Dark Lord, Rage Fighter, Grow Lancer, Rune Wizard, Slayer, Gun Crusher |
| 3 | Light Wizard, Lemuria Mage, Illusion Knight, Alchemist |

### 3.2 Atributos (relações de atributo)

Base: STR / AGI / VIT / ENE; 5 pontos por nível.

| | DK | DW | Elf |
|---|---|---|---|
| Inicial (S/A/V/E) | 28/20/25/10 | 18/18/15/30 | 22/25/20/15 |
| HP | 35 + 2·Nv + 3·VIT | 30 + Nv + 2·VIT | 39 + Nv + 2·VIT |
| MP | 10 + 0,5·Nv + ENE | 20 + 2·Nv + 2·ENE | 6 + 1,5·Nv + 1,5·ENE |
| AG | ENE + 0,3VIT + 0,2AGI + 0,15STR | 0,2ENE + 0,3VIT + 0,4AGI + 0,2STR | 0,2ENE + 0,3VIT + 0,2AGI + 0,3STR |
| Dano | STR/6 ~ STR/4 | mágico ENE/9 ~ ENE/4 × (1 + aumento do cajado) | STR/14+AGI/7 ~ STR/8+AGI/4 |
| Defesa | AGI/3 | AGI/4 | AGI/10 |

Todas as fórmulas estão em `shared/rules.js → CLASSES[*].rel`.

### 3.3 Evolução

| Para | Requisitos | Bônus |
|---|---|---|
| 2ª classe | Nível 150, 3 chefes | +10% dano, +5% HP, habilidade de área nova, ombreiras |
| 3ª classe | Nível 400, 10 chefes, 1 reset | +20% dano, +10% HP, habilidade suprema, asas |

### 3.4 Habilidades (MP + AG)

| Classe | 1 | 30/20/25 | 40–60 | 70–100 | 150 (2ª) | 400 (3ª) |
|---|---|---|---|---|---|---|
| DK | Golpe Giratório | Estocada Mortal | Vida Inabalável | — | Golpe Furioso | Lâmina Destruidora |
| DW | Bola de Energia | Chama | Teleporte | Meteoro · Barreira da Alma | Nova Gélida | Inferno Primordial |
| Elf | Flecha Tripla | Flecha Penetrante | Cura · Aura Élfica | — | Espírito da Floresta | Chuva de Flechas |

**Árvore de maestria**: 3 ramos × 4 nós × 5 ranks por classe. Pontos: 1 a cada 10 níveis, +10 por reset, +5 por evolução.

---

## 4. Progressão

### 4.1 EXP 1500x

- Próximo nível: `(L+9)·L²·10` e, acima de 255, `+ (x+9)·x²·100` com `x = L−255`.
- EXP por monstro: `(M+25)·M/3 × 1500`; se `M+10 < L`, multiplica por `(M+10)/L` (penalidade contra farm de monstro fraco).
- Elite ×2,5, chefe ×8.

Ritmo resultante (abates por nível):

| Nível do jogador | Nível do monstro | Abates/nível |
|---|---|---|
| 1 | 3 | < 1 (vários níveis por abate) |
| 100 | 45 | ~13 |
| 200 | 90 | ~32 |
| 399 | 200 | ~82 (~20 contra monstros nv 300) |
| 600 | 350 | ~160 |
| 900 | 500 | ~465 |

### 4.2 Reset

- Requisitos: nível ≥ 400 e `min(500 000 × (resets+1), 20 000 000)` Gold.
- Efeito: nível 1, atributos voltam à base, `2 200 × resets` pontos livres, +3 pontos por nível acima de 400, +2% MF permanente, +10 pontos de árvore.
- Itens ficam equipados, mas **inativos** até o personagem cumprir o requisito de novo.
- Limite: 100 resets (Grand Reset fica para a Fase 3).

---

## 5. Mundo e masmorras

**Cidade**: Refúgio de Aldrena, zona segura, com 5 NPCs: Ferreiro, Mercadora, Portais, Mestre de Classe e Arena (em construção).

| Masmorra | Nível base | Monstros | Chefe |
|---|---|---|---|
| Floresta Sussurrante | 3 | Goblin, Aranha, Lobo | Rainha Aracnídea |
| Cavernas de Cristal | 30 | Morcego, Golem, Kobold (à distância) | Colosso de Cristal |
| Ruínas de Kael | 70 | Esqueleto, Arqueiro, Espectro | Rei Esqueleto Aldric |
| Castelo Carmesim | 120 | Cavaleiro, Gárgula, Feiticeiro | Lorde Carmesim |
| Abismo de Obsidiana | 180 | Demônio de Magma, Cão Infernal, Arauto | Tirano do Abismo |

Cada andar soma **+8 níveis**, e os andares são infinitos. Derrotar o chefe libera o próximo andar e abre um portal de descida.

### 5.1 Geração procedural com regras de câmera

1. Grade de *chunks* 12×12 (3×3 nos primeiros andares, depois 4×4 ou 4×5), conectados por um labirinto DFS com 2 laços extras.
2. Cada chunk sorteia um template do bioma: `room`, `hall`, `cave` (autômato celular) ou `cross`. Corredores têm **3 tiles de largura**.
3. **Regras de câmera** (câmera fixa a 45°):
   - Paredes com chão até 2 tiles atrás delas (lado −x/−z) ficam **baixas** (0,6 m), porque estão entre a câmera e a ação.
   - **Objetos altos só encostam em paredes do fundo** (norte/oeste), nunca no meio de salas pequenas.
   - Depois de colocar os objetos, um flood fill garante que nada ficou isolado.
4. O chefe fica no chunk mais distante da entrada (BFS).
5. Encontros: 1–3 grupos por chunk, 14% de chance de elite com afixo (Veloz, Colosso, Vampírico, Explosivo).

### 5.2 Mecânicas de chefe

Golpe em área telegrafado a cada 6,5 s (círculo vermelho por 1,1 s), reforços a 50% de HP e fúria a 25% (+30% de cadência).

Marca do chefe (v0.7): selo rúnico plano no chão, do tamanho do alcance do chefe (raio de mundo fixo, não mais multiplicado pela escala do modelo), girando só no eixo vertical. Antes era um anel que girava no eixo errado, se inclinava e atravessava paredes. Chefes usam raio de colisão de 1,1 contra paredes (0,35 nos monstros comuns), com recuo para 0,5 em corredores estreitos, para não entrarem no terreno.

---

## 6. Itens e loot

### 6.1 Estrutura

Slots: arma, elmo, armadura, luvas, botas, anel, colar e asas (só de chefes). 10 tiers por nível de drop (0, 15, 35, 60, 95, 140, 200, 270, 350, 450).

Atributos dos itens: **+nível (0–15)**, **Sorte** (+5% crítico, +25% no Soul), **Habilidade** (+10% dano de habilidade), **Opção adicional** (+4 a +16), **opções Excelentes** (6 de arma, 6 de armadura), **Ancestral** (+atributo) e **Lendário** (afixo único, como Encontrar Magia +40%).

Requisito de atributo: `(15 + 38·tier + 4·plus) × (1 para armas, 0,7 para armaduras)`.

### 6.2 Raridade e Magic Find

Chance-base de raridade, dado que caiu um item: Mágico 20%, Excelente 4,5%, Ancestral 1,1%, Lendário 0,28%.

- O MF multiplica Mágico linearmente: `×(1 + MF/100)`.
- Para Excelente ou melhor vale o **MF efetivo** `MF·250/(MF+250)` (teto suave).
- Elite: ×2 nas raridades altas. Chefe: ×4 e nunca solta Comum.
- Chance de item por monstro comum: `30% × (1 + MF/400)`. Elite: 1–2 garantidos. Chefe: 3–5.
- **Smart loot**: 60% dos itens são da classe de quem matou.

### 6.3 Transparência

```
seed_do_drop = hash32(seed_do_andar, id_do_monstro, contador_de_abates)
```

- `rollDrop(seed, nível, fonte, MF, classe)` é determinístico: a mesma seed gera sempre o mesmo item.
- O painel **Drops** (tecla L) mostra a tabela de raridade (base, você, elite, chefe) com o seu MF e os últimos drops com seed e rolagem.
- Um teste automatizado compara a frequência observada com a tabela publicada (40 000 amostras, desvio < 1,2 p.p.).

### 6.4 Aprimoramento

| Jewel | Faixa | Chance | Falha |
|---|---|---|---|
| Bless | +0 → +6 | 100% | — |
| Soul | +6 → +9 | 50% (+25% com Sorte) | −1 (mínimo +6) |
| Chaos | +9 → +15 | 60% − 5% por nível (mínimo 30%) + 20% com Sorte; custa 1.000.000 Gold | volta a +0, **nunca destrói** |
| Life | opção adicional +4 | 50% (+10% com Sorte) | nada |

---

### 6.5 Combat Points, auto-equipar e inventário

- **CP do personagem** (`R.combatPower`): ofensa (dano médio × bônus de dano, crítico/excelente, habilidades ÷ intervalo de ataque) × 6 + HP efetivo (HP × defesa, dividido pela absorção) × 0,9 + utilitários (roubo de vida, reflexão, MF, Gold). Calculado sem buffs temporários, para ser estável. Aparece no HUD, no painel Personagem e no topo do Inventário.
- **CP do item** (`R.itemCP`): soma ponderada dos atributos da peça (`itemStats`), independe de quem usa. Marcado em cada célula da mochila e do equipamento.
- **Comparação real**: para peças da sua classe, o jogo simula o personagem com a peça no slot e mostra ▲ (aumenta o CP), ▼ (diminui) ou ! (requisito não atendido). O detalhe mostra a diferença exata em CP.
- **Auto-equipar** (ligado por padrão, alternável no Inventário e salvo nas opções): ao coletar uma peça da sua classe, subir de nível ou distribuir pontos, testa cada peça da mochila em cada slot e fica com a que mais aumenta o CP total; repete até 3 passagens porque bônus de atributo de uma peça podem liberar o requisito de outra. Botão "Equipar melhores agora" faz o mesmo sob demanda.
- **Segregação**: abas Todos / Minha classe / Outras / Materiais (com contagem); nas abas filtradas os itens aparecem ordenados por CP. "Organizar por CP" agrupa a mochila por categoria e ordena por CP.
- **Ícones**: cada tipo (espada, cajado, arco, elmo, armadura, luvas, botas, anel, colar, asas, jewel, poção) tem um ícone SVG procedural e um fundo de cor própria; a cor do metal/brilho indica a raridade. Slots vazios mostram a silhueta do tipo.
- **Cursor medieval**: desenhado pelo próprio jogo (seta dourada, mão com gema azul sobre elementos clicáveis, espada sobre monstros), sempre visível mesmo quando o sistema esconde o ponteiro durante o uso do teclado. Em toque, fica oculto.
- **Ícones de habilidade**: cada uma das 19 habilidades tem arte SVG própria (fundo temático da classe + emblema), usada na barra 1–6 e no painel Habilidades; poções na barra usam o ícone de frasco.
- **Coleta com Espaço**: coleta de uma vez tudo em até ~3,8 m (maior raridade primeiro); se nada estiver ao alcance, o personagem anda até o item mais próximo (até 16 m).
- **Equipar manualmente**: clique duplo ou botão direito equipa/desequipa; arrastar da mochila para o painel Equipado (ou de volta); botão Equipar no detalhe. O painel não é redesenhado enquanto o mouse está pressionado, para não perder cliques durante o combate.

## 7. Tela inicial

- O último personagem jogado aparece **no centro**, em 3D, na praça de Aldrena, com nome, classe, nível, Gold e CP. Um botão grande **Entrar no jogo** (ou Enter).
- Com mais de um personagem, setas ‹ › (ou ← →) trocam o personagem mostrado; pontos indicam a posição.
- **Criar novo personagem** é opção secundária (link abaixo do botão): abre um painel lateral com as 3 classes jogáveis, prévia 3D da classe escolhida e o campo de nome. Sem personagens salvos, esse painel abre direto.
- Até 5 personagens por navegador; excluir pede confirmação.

---

### 7.1 Sensação de jogo

- **Pausa**: Esc (sem painel ou diálogo aberto) e, por padrão, ao sair da janela/aba. A simulação para; o render continua.
- **Micro-pausa de impacto** (≈45 ms) em crítico/excelente (metade) e no abate de elite/chefe; desligável em Opções.
- **Tremor de tela** com intensidade em Opções (normal, suave, desligado); com "reduzir movimento" do sistema, fica limitado e a micro-pausa é desligada.
- **Buffer de habilidade**: tecla apertada durante a animação anterior é guardada por 150 ms e sai assim que a trava acaba.
- **Dano e vida baixa**: pulso vermelho nas bordas proporcional ao golpe; abaixo de 30% de HP, pulsação contínua.

## 8. Arquitetura técnica

- **Módulos ES** em `src/` (56 arquivos, cada um com uma responsabilidade): `core/` (config, estado/save, laço), `engine/` (renderer, efeitos, overlay, áudio), `art/` (texturas, materiais, modelos procedurais), `world/` (biomas, geração, A*, grade espacial, montagem do nível), `game/` (jogador, monstros, combate, habilidades, loot, inventário, sessão), `input/`, `scenes/` (título e jogo) e `ui/`. Detalhes em `README.md` e `docs/RELATORIO-REFATORACAO.md`.
- **Build sem dependências**: `tools/build.py` resolve os imports, ordena os módulos, dá a cada um seu escopo e gera `dist/forja-deira.html` (arquivo único offline) e `dist/dev.html` (módulos nativos, para desenvolvimento). Falha em import quebrado, export duplicado ou erro de sintaxe.
- **Laço único** (`core/loop.js`): um `requestAnimationFrame`, delta limitado a 50 ms, sistemas protegidos (uma exceção isolada é registrada e o jogo segue).
- **Configuração central** (`core/config.js`): câmera, qualidade, tempos de interface, raios de coleta, IA, entrada, sensação de jogo. Balanceamento continua em `src/rules.js`.
- **Sem rede**: nenhuma requisição externa. Testado com Playwright: zero requisições fora do próprio arquivo.
- **Save**: `localStorage` (`forjadeira.save.v1`), a cada 15 s e em eventos importantes. Na carga, saves antigos são migrados (Web3 removida) e personagens são saneados (números inválidos, campos ausentes).
- **Testes**: `npm test` (regras, A*, grade espacial, geração de masmorras, save) e `tests/smoke.py` (fluxo completo no navegador).

### 8.1 Orçamento de desempenho (medido no protótipo)

| Cena | Draw calls | Triângulos |
|---|---|---|
| Andar 6, 140–190 monstros | 41–271 | 30k–41k |

A redução vem de paredes, chão e objetos em `InstancedMesh`, orçamento fixo de 6 luzes de tocha, partículas em um único `Points`, três níveis de qualidade e monstros e NPCs fora da câmera sem animação nem desenho.

---

## 9. Roadmap

| Fase | Entregas |
|---|---|
| **0: Protótipo** (feito) | Jogável offline no navegador, 3 classes, 5 masmorras com andares infinitos, CP e auto-equipar, regras testadas |
| **1: Conteúdo** | Arena contra campeões controlados pelo jogo, mais habilidades e afixos, missões na cidade, baú compartilhado entre personagens |
| **2: Classes** | Summoner, Magic Gladiator, Dark Lord, Rage Fighter e demais do elenco |
| **3: Polimento** | Modelos da equipe de arte, trilha sonora, otimização mobile, Grand Reset |

---

## 10. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| **Propriedade intelectual** (nomes provisórios de classes e itens) | Remoção do jogo, processo | Revisar nomes de classes e itens antes de qualquer lançamento público. Toda a arte é própria: o jogo não usa nem lê modelos, mapas ou texturas de terceiros. |
| **Perda de save** (limpeza do navegador) | Frustração | Exportar/importar save em arquivo (planejado) |
| **Desempenho WebGL** em máquinas fracas | Abandono | Três níveis de qualidade, instancing, orçamento de luzes |

---

## 11. Arte e assets

Direção (v0.8): **cartoon de fantasia sombria**: proporções exageradas, formas grandes, cores saturadas e contorno escuro, com o clima sombrio dado pela luz e pela paleta de cada bioma. Terreno, cenário, NPCs, heróis e monstros usam o mesmo sombreamento, para não haver diferença de estilo entre eles. Todos os modelos, texturas e efeitos são gerados em código (`src/art/` e `src/world/`); o jogo não carrega nenhum arquivo externo de arte.

| Camada | Como é feito |
|---|---|
| Sombreamento | Um só pipeline para tudo (`src/art/stylize.js`): `MeshToonMaterial` com rampa de 5 faixas de luz, borda iluminada recortada e reflexo "pintado" nos metais (mancha de luz em vez de especular físico). Metais têm a cor base escurecida para não estourar no toon |
| Contorno | Passe de tela (`renderFrame` em `engine/renderer.js`): a cena vai para um alvo intermediário HDR com profundidade; o laplaciano relativo da profundidade vira traço escuro colorido (cor da cena × 0,16), que some com a distância/névoa. Depois vêm tone mapping e sRGB. Vale para tudo que grava profundidade; brilhos, partículas e decalques ficam sem traço. Pode ser desligado em Opções → Gráficos |
| Texturas | Procedurais, tileáveis e "pintadas": peças grandes com cor quase chapada, juntas escuras e grossas, bisel claro do lado da luz e sombra do lado oposto, pouco ruído fino. Calçamento (~24 pedras por 4 m), lajes, tijolos grandes, rocha facetada (com fendas incandescentes no Abismo), grama com tufos pintados, tábuas, telhas arredondadas e decalques |
| Chão | Uma malha por nível com UV em coordenadas de mundo (sem emendas), duas texturas misturadas por manchas e oclusão ambiente nos cantos junto às paredes |
| Paredes | Uma malha por nível; blocos com relevo (cavernas, floresta e abismo têm quinas irregulares) e base com oclusão. Nas masmorras, topo tingido pelo bioma (grama, musgo, pedra clara, vermelho do castelo) e aba saliente no alto voltada para o chão, que dá a silhueta "desenhada". Castelo com merlões quadrados, cidade com paliçada de estacas |
| Miudezas | Espalhadas por semente, com instancing e sem sombra (uma chamada de desenho por tipo): tufos de grama, samambaias, flores, pedrinhas, lascas de cristal, brasas; no pé das paredes, capim alto e pedras. Geometrias de poucos triângulos |
| Adereços | Kit de ~35 peças montadas de primitivas e desenhadas com instancing: barris, caixotes, pilares (inteiros e quebrados), escombros, ossos, crânios, tochas de parede, braseiros, velas, estandartes, armaduras, estátuas, lápides, cruzes, pinheiros, árvores secas, arbustos, rochas, troncos, cogumelos (comuns e luminosos), estalagmites, cristais, espinhos de obsidiana, poças de lava, casas enxaimel, barraca, bigorna/forja, carroça, lampião, fonte, poço, arco do portal |
| Proporções | Heróis e humanoides 20% maiores em relação ao cenário, cabeça 1,38×, pernas curtas e grossas, botas e punhos grandes, peito e ombros largos, armas 1,4× mais grossas; rosto com olhos ovais e brilho. Feras com cabeça 1,3×; demais monstros 8–15% maiores. Câmera um pouco mais próxima (distância 33) |
| Personagens | Humanoides com peitoral, cinto e fivela, tabardo, ombreiras em camadas, joelheiras, botas, capa com barra rasgada; elmo fechado com viseira e pluma ou chifres, capuz com rosto na sombra e olhos brilhantes, crânio com mandíbula; espada com guarda e pomo, maça cravejada, cajado com garras e orbe, arco com corda, escudo em forma de pipa |
| Texturas de monstros | Mapas de detalhe procedurais (cor + normal) por tipo de superfície: pele, pelo, escamas, metal, tecido, couro, osso, pedra e membrana; aplicados sobre a cor de cada material, com cache por textura |
| Monstros | Aranha com 8 patas articuladas, quelíceras, 6 olhos e ampulheta no abdômen; lobo/cão infernal com focinho, presas e crina; espectro com manto esfarrapado, correntes e aura; morcego/gárgula com asas de membrana e garras; golem de rocha com musgo e runas, ou de magma com fendas incandescentes. v0.7: patas da aranha corrigidas (abrem para fora e tocam o chão), cauda do lobo alinhada ao corpo |
| Atmosfera | Cidade à noite (luar azulado e lampiões quentes), névoa rasteira, vinheta, chamas com faíscas, 6 luzes de tocha mais próximas do herói |

Biomas: Aldrena (vila à noite com casas, mercado, forja, cemitério e paliçada), Floresta Sussurrante (pinheiros, troncos, cogumelos, penhascos com musgo), Cavernas de Cristal (estalagmites, cristais e cogumelos que brilham), Ruínas de Kael (lajes, tijolos com musgo, pilares quebrados, estátuas), Castelo Carmesim (lajes escuras, ameias, estandartes, armaduras, braseiros, sangue) e Abismo de Obsidiana (rocha com fendas de lava, poças de lava, espinhos, cinzas).

Desempenho medido (1280×800, v0.8): 170–580 chamadas de desenho e 100–320 mil triângulos por quadro, contando as sombras e as miudezas (antes da v0.8: 210–590 e 80–350 mil). O contorno custa um passe de tela cheia. Na qualidade "baixa" as sombras são desligadas.

A antiga opção de carregar arte de um cliente externo foi removida em 27/09/2026. Para o lançamento, a arte procedural pode ser substituída por modelos da equipe de arte (§9) mantendo a mesma interface (`buildModel`, `kit`).
