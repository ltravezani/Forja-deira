# Forja-deira — Relatório da refatoração (v0.6)

## 1. Resumo executivo

O jogo saiu de um arquivo monolítico de 2.779 linhas (mais dois arquivos de arte injetados por marcadores de texto) para **56 módulos ES** com responsabilidades separadas, empacotados por um build próprio sem dependências. O formato de entrega não mudou: continua um único `dist/forja-deira.html` que roda offline. Além da organização:

- a simulação ficou **~40% mais barata por monstro** (grade espacial no lugar de comparações todos-contra-todos);
- o overlay de rótulos deixou de forçar **~42 reflows por quadro** (um por item no chão) e passou a zero;
- o jogo não congela mais se um sistema lançar exceção;
- vazamentos de materiais/geometrias em trocas de zona foram fechados (verificado: nada acumula após trocas repetidas);
- entraram pausa, micro-pausa de impacto, retorno visual de dano, buffer de habilidade e opções de acessibilidade;
- há **12 testes de lógica** (Node) e um **teste de ponta a ponta** (Playwright) com 30 verificações.

Balanceamento, visual procedural, save (`forjadeira.save.v1`; o save antigo `mutrz.save.v1` é migrado na primeira carga) e controles foram preservados.

## 2. Problemas encontrados e como foram resolvidos

| Problema | Solução |
|---|---|
| Arquivo único com motor, regras, efeitos e DOM misturados; estado global acessado de todo lugar | Módulos por domínio (`core`, `engine`, `art`, `world`, `game`, `input`, `scenes`, `ui`); estado em objetos mutados no lugar (`G`, `S`, `UI`), nunca reatribuídos |
| Montagem por substituição de texto (`//@@ART_MODELS@@`) | `tools/build.py`: resolve `import/export`, ordena por dependência, dá escopo próprio a cada módulo e falha em import quebrado, export duplicado, `export let` ou erro de sintaxe |
| Números mágicos espalhados (câmera, tempos, raios, limites) | `src/core/config.js` (câmera, qualidade, cadências, jogador, loot, IA, entrada, sensação, áudio, mochila) |
| Uma exceção no quadro parava o jogo para sempre | `core/loop.js`: próximo quadro agendado antes de atualizar; `guard()` isola cada sistema e cada evento atrasado; erro registrado uma vez |
| Lógica de sessão presa ao recarregamento da página | `game/session.js`: `startGame` e `returnToTitle` limpam mundo, aliados, recargas, canalização, seleção e HUD |
| Save sem validação | `sanitizeCharacter` corrige NaN/Infinity/texto e campos ausentes; `loadSave` tolera JSON corrompido |
| Nenhuma verificação de ambiente | Tela de erro amigável se faltar WebGL ou se a inicialização falhar |

## 3. Nova arquitetura

```
src/
  main.js               entrada: save → preferências → entrada → cidade de fundo → laço
  debug.js              window.__FORJA_DEBUG (testes)
  core/  config.js      valores ajustáveis · loop.js laço único protegido
         state.js       G / S / UI, save, migração e saneamento · util.js
  engine/ renderer.js   renderer, luzes, câmera, tremor, qualidade
          effects.js    partículas (pool em arrays tipados) e anéis
          overlay.js    projeção 3D→tela, números flutuantes (pool + WAAPI)
          audio.js      sons sintetizados (buffers em cache, limite de vozes)
  art/   textures · materials (compartilhados vs. próprios) · geometry · models
  world/ biomes (dados) · biomeTextures · levelgen (dados puros) · grid (A*)
         spatial (grade espacial) · kit (adereços) · level (montagem visual)
  game/  player · monsters (IA + grade) · combat · skills (tabela EFFECTS)
         projectiles (pool) · loot · inventory (CP, auto-equipar) · allies
         npcs (NPCs e portais) · zones · session · movement · world (quadro) · feel · data
  input/ input (mouse/teclado, mapa de teclas) · picking (seleção no mundo) · inputState
  scenes/ titleScene · playScene (cadências, pausa, micro-pausa)
  ui/    hud · labels · drawer · panes · inventoryPane · paneActions · dragdrop
         npcDialogs · title · pause · feedback · cursor · icons · log · minimap
```

Dependências seguem de baixo para cima: `core` → `engine`/`art` → `world` → `game` → `input`/`ui` → `scenes` → `main`. Registro de eventos acontece só em funções `init*` chamadas uma vez pelo `main`.

## 4. Desempenho

Medições no Chromium headless com renderização por software (os valores absolutos são altos por isso; o que importa é a proporção):

| Cenário | Antes | Depois |
|---|---|---|
| Simulação com 120–190 monstros em combate | ~0,021 ms por monstro por atualização | ~0,013 ms (−40%) |
| ~50 rótulos de loot na tela: reflows forçados | ~42 por quadro | ~0 |
| Mesmo cenário: tempo de script por quadro | ~199 ms | ~8,6 ms |
| Mesmo cenário: quadros em 15 s | 11 | 20 |

O que mudou:
- **Grade espacial** (`world/spatial.js`) para separação entre monstros, golpes em área, colisão de projéteis e investida, montada uma vez por quadro com baldes reaproveitados.
- **Rótulos** posicionados por `transform`, com largura lida numa fase de leitura, e escrita no DOM só quando a posição ou a visibilidade muda.
- **Seleção sob o cursor** calculada 1× por quadro, não a cada `pointermove`.
- **HUD** com referências em cache e escrita só quando o valor muda.
- **Pools**: números de dano (70 elementos fixos, animação via Web Animations, sem timers), malhas de projéteis com materiais compartilhados.
- **Áudio**: buffers de ruído em cache, até 6 sons iniciados por quadro, sequências agendadas no relógio do áudio (sem `setTimeout`).
- **Memória**: materiais compartilhados marcados (`userData.shared`); nível anterior, portais, aliados, anéis e feixes de loot liberados ao trocar de zona.
- **Minimapa**: revela área só quando o herói muda de tile. Partículas não reenviam buffers à GPU quando não há nenhuma viva.
- **Registro de mensagens**: esmaecimento por CSS em vez de um timer por linha.

## 5. Jogabilidade e polimento

Tudo discreto e configurável em **Opções → Jogabilidade**:

- **Pausa** com Esc (se nenhum painel ou diálogo estiver aberto) e ao sair da janela/aba. O menu de pausa tem Continuar e Voltar à tela inicial, sem recarregar a página.
- **Micro-pausa de impacto**: ~45 ms no abate de elite/chefe e metade disso em crítico/excelente.
- **Tremor de tela** com intensidade ajustável: normal, suave ou desligado.
- **Retorno de dano**: pulso vermelho nas bordas, proporcional ao golpe, e pulsação contínua abaixo de 30% de HP.
- **Buffer de habilidade** de 150 ms: a tecla apertada durante a animação anterior não se perde.
- **Acessibilidade**: com "reduzir movimento" no sistema, o tremor fica limitado e a micro-pausa desligada. A pausa usa diálogo com `aria-modal`.
- **Efeitos em pausa**: partículas e círculos de aviso congelam junto com a simulação, para o aviso de um golpe de chefe não sumir durante a pausa.

## 6. Bugs corrigidos

1. **Números flutuantes**: o contador ficava negativo depois de trocar de zona, e o limite de 70 deixava de valer.
2. **Laço principal**: uma exceção congelava o jogo sem aviso.
3. **Vazamentos**: materiais dos anéis, feixes de loot, portais (geometria nova a cada portal), invocações, NPCs e materiais do nível anterior não eram liberados.
4. **Troca de personagem**: as recargas das habilidades não eram zeradas.
5. **Redistribuir a árvore**: descontava Zen sem checar o saldo.
6. **Portal (T) e volta ao título**: a canalização sobrevivia à volta ao título e disparava na sessão seguinte.
7. **Seleção e histórico de drops**: passavam de um personagem para o outro.
8. **Pet após portal**: continuava atacando um monstro da zona anterior, gerando EXP e loot na cidade. Esse bug é anterior à refatoração.
9. **`disposeModel`**: percorria o cache inteiro de materiais para cada material (O(n·m)) e podia liberar materiais compartilhados de outros caches.
10. **Código morto**: tela de carregamento nunca usada, `swapPlayerModel`, `texPlaster`, `rot`, variável de mercado no laço.

## 7. Arquivos

- **Criados:** os 56 módulos de `src/` (lista na seção 3), `src/shell.html`, `tests/` (5 arquivos `*.test.mjs`, `helpers.mjs` e `smoke.py`), `package.json` (só scripts), `README.md`, este relatório.
- **Alterados:** `tools/build.py` (virou empacotador), `src/rules.js` (cabeçalho e detecção do escopo global para rodar no Node), `docs/GDD.md` (v0.6: arquitetura e sensação de jogo).
- **Removidos:**
  - `src/game.js`, `src/art_models.js`, `src/art_world.js`, `src/head.html` e `src/tail.html`: substituídos pelos módulos e pelo `shell.html`.
  - `tools/shot.py`: apontava para a pasta `Data` do cliente MU, que já foi removida.
  - `orig.html`, `antes-depois.png` e `out/`: artefatos antigos.

## 8. Como executar

```bash
python3 tools/build.py          # gera dist/forja-deira.html e dist/dev.html
npm test                        # 12 testes de lógica
python3 tests/smoke.py          # ponta a ponta (Playwright)
python3 -m http.server 8000     # desenvolvimento: http://localhost:8000/dist/dev.html
```

Para jogar, basta abrir `dist/forja-deira.html`.

## 9. Riscos e limitações

- **Build sem minificação:** os módulos vão legíveis no HTML. O arquivo tem ~1,1 MB, a maior parte do Three.js.
- **Arte procedural sem reorganização profunda:** `art/models.js` (528 linhas) e `world/kit.js` (340 linhas) continuam grandes. É código de geração declarativa, e dividir mais não traria ganho real agora.
- **Medições em GPU por software:** em hardware real o gargalo tende a ser a GPU (sombras, draw calls), não o JavaScript.
- **Save só no `localStorage`:** limpar os dados do site apaga o progresso.
- **Toque:** funciona, mas não foi validado em aparelho real.

## 10. Próximos passos sugeridos

1. **Exportar e importar o save** em arquivo JSON: protege contra perda de dados.
2. **Culling por grade para NPCs, loot e adereços animados**, e instancing para monstros iguais, para reduzir draw calls em andares cheios.
3. **Controle por gamepad**: a camada `input/` já separa as ações das teclas.
4. **Arena contra campeões** (NPC Kora), usando a IA de chefe existente.
5. **Minificação opcional no build** e *source maps* para depuração do arquivo único.
