# Save na nuvem (Supabase)

O jogo continua funcionando offline e sem conta. Quem quiser cria uma conta
(e-mail e senha) pelo botão **Salvar na nuvem** da tela inicial e os
personagens passam a ter uma cópia na nuvem, que pode ser aberta em outro
navegador ou celular.

## Como funciona

- O save do navegador continua sendo o principal: o jogo salva nele a cada 15 s.
- Com conta, o save sobe para a nuvem a cada minuto de partida, ao voltar à tela
  inicial e ao fechar ou minimizar a página. Sem internet, sobe quando voltar.
- **Vincular um save existente:** ao entrar ou criar a conta, os personagens que
  já estão no navegador vão para a conta. Nada é apagado.
- **Aparelho novo** (sem personagens): ao entrar, recebe os personagens da conta.
- **Os dois lados têm personagens diferentes** (ex.: celular e PC jogados sem
  conta): o jogo pergunta qual save manter. O que não for escolhido vira uma
  **cópia de segurança** neste aparelho (as 3 últimas ficam guardadas) e pode ser
  restaurado na janela da conta.
- Cada save na nuvem tem um número de revisão; um aparelho só grava por cima da
  revisão que conhece. Se outro aparelho gravou antes, o jogo pergunta em vez de
  sobrescrever.
- "Apagar todos os dados locais" (Opções) esquece a conta neste aparelho, mas
  não apaga o save da nuvem.

## Segurança

- No código do jogo vai só a chave **pública** (`anon` / `publishable`), em
  `CONFIG.cloud.anonKey` (`src/core/config.js`). Ela é feita para ficar exposta.
- **Nunca** coloque a chave `service_role` / `secret` no jogo: ela ignora todas
  as regras de acesso.
- A tabela `saves` tem **Row Level Security** ligado: cada conta só lê, cria,
  altera e apaga a própria linha (`user_id = auth.uid()`). Visitantes sem login
  não têm acesso nenhum. Tudo está em
  `supabase/migrations/20260930000000_saves.sql`.

## Configurar o projeto Supabase (uma vez)

1. **Criar a tabela:** no painel do Supabase, abra **SQL Editor → New query**,
   cole todo o conteúdo de `supabase/migrations/20260930000000_saves.sql` e
   clique em **Run**. Pode rodar de novo sem problema.
2. **Conferir o RLS:** em **Table Editor → saves** deve aparecer que o Row Level
   Security está ativo (sem o aviso "RLS disabled").
3. **Endereço do jogo:** em **Authentication → URL Configuration**:
   - *Site URL*: `https://ltravezani.github.io/Forja-deira/`
   - *Redirect URLs*: adicione `https://ltravezani.github.io/Forja-deira/**`
   Assim os links de confirmação de conta e de troca de senha abrem o jogo.
4. **E-mail e senha:** em **Authentication → Sign In / Providers**, o provedor
   *Email* já vem ligado. Com *Confirm email* ligado, a conta só entra depois de
   clicar no link do e-mail. O envio de e-mails embutido do Supabase tem limite
   baixo por hora; para muitos jogadores, configure um SMTP próprio
   (**Authentication → Emails → SMTP Settings**) ou desligue *Confirm email*.
5. **Chave pública:** em **Project Settings → API Keys**, copie a chave
   `anon` `public` (ou a `publishable`) e coloque em `CONFIG.cloud.anonKey`,
   depois rode `python3 tools/build.py`. Enquanto a chave estiver vazia, o botão
   da nuvem só avisa que ela não foi configurada e o jogo segue só local.

## Testes

- `npm test`: regras de decisão da sincronização (`tests/cloud.test.mjs`).
- `python3 tests/cloud_smoke.py`: ponta a ponta com um Supabase falso (três
  aparelhos, conflito, cópia de segurança, RLS). `SHOTS=pasta` salva capturas.
