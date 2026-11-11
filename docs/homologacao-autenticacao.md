# Homologação de autenticação — andamento

## Situação atual

Após o usuário informar a correção das configurações e o redeploy, a suíte de leitura em produção completou inicialmente **4/4 testes passados** e, após inclusão da verificação do retorno do Supabase, **5/5 testes passados, sem falhas ou ignorados**. O callback passou a retornar à origem `https://emissor-nfse-lote-kjou.vercel.app`. O bloqueio de configuração de domínio descrito abaixo é histórico e foi resolvido; um link recebido anteriormente ainda levou o usuário ao domínio antigo.

O usuário realizou o ciclo manual acompanhado no próprio navegador, preservando sua senha. Informou recebimento do e-mail, login e acesso ao painel; depois confirmou logout, bloqueio do painel após sair, novo login e acesso após atualização da página. Não houve criação automática de conta ou envio de e-mail pelo agente, nem acesso do agente à sessão privada do usuário.

O usuário posteriormente relatou recebimento do e-mail, mas chegada ao domínio antigo `emissor-nfse-lote-nuxi.vercel.app` após abrir a confirmação. As configurações atuais foram conferidas sem utilizar seu link: GET de verificação com token deliberadamente inválido retornou `otp_expired`, direcionando ao domínio `…-kjou` tanto no retorno padrão quanto ao solicitar o callback correto. Assim, Site URL e a permissão do callback atual estão funcionais; não é necessário reaplicar a alteração anterior. As hipóteses restantes incluem link gerado antes da correção, cadastro iniciado em deployment antigo ou template personalizado; ainda não foi comprovada qual delas produziu o link recebido.

Foi solicitado testar login diretamente na origem pública correta, pois a confirmação pode ter sido aplicada antes do redirecionamento ao domínio inoperante. O link real, os códigos, a senha e os tokens não foram solicitados nem usados pelo agente.

**Resultado manual informado pelo usuário:** recebeu a mensagem de confirmação e conseguiu fazer login e entrar no painel pela origem correta. O retorno do link antigo foi uma falha de navegação; a liberação de login foi confirmada pelo acesso informado. Em seguida confirmou que sair bloqueou o painel e que conseguiu entrar novamente e atualizar a página. Isso não equivale a um teste automatizado com a sessão do usuário ou à verificação de expiração/renovação de tokens.

## Evidências observadas

- O projeto Supabase informado respondeu HTTP 200 ao GET autenticado de `/auth/v1/settings`, documentado no OpenAPI oficial `https://raw.githubusercontent.com/supabase/auth/master/openapi.yaml`.
- Cadastro habilitado (`disable_signup=false`), provedor de e-mail ativo e confirmação obrigatória (`mailer_autoconfirm=false`). Esses campos não comprovam configuração de SMTP ou entrega de mensagens.
- A SDK real recusou `getUser` com token inválido: HTTP 403, código `bad_jwt`, sem usuário retornado. Nenhuma conta foi criada por esse teste.
- O Node deste ambiente precisa de `--use-env-proxy` para alcançar o Supabase pelo proxy herdado; a requisição passou com TLS verificado. Isso é uma opção do processo de teste, não uma alteração salva no ambiente ou no aplicativo.
- No servidor local, os formulários configurados responderam 200; POST vazio em cadastro/login exibiu os erros de validação do servidor; `/painel` sem sessão redirecionou a `/entrar`, com cache privado e `no-store`. Sem envio de e-mail nesses testes.
- O domínio antigo `emissor-nfse-lote-nuxi.vercel.app` respondeu 404. A URL de preview fornecida requer autenticação da Vercel. O alias público `https://emissor-nfse-lote-kjou.vercel.app` entregou a aplicação e o cadastro habilitado com HTTP 200.

## Bloqueio anterior — corrigido

No alias público funcional, GET `/auth/callback` sem código respondeu 307 para `https://emissor-nfse-lote-nuxi.vercel.app/entrar?status=confirmation-error`. Isso comprova que a origem de retorno configurada nesse deployment ainda é a do projeto antigo. A confirmação de uma conta por PKCE precisa retornar ao domínio que iniciou o cadastro.

Correção externa solicitada e posteriormente validada, no projeto Vercel **emissor-nfse-lote-kjou**:

1. `NEXT_PUBLIC_SITE_URL=https://emissor-nfse-lote-kjou.vercel.app`, no ambiente Production.
2. Redeploy desse projeto após salvar a variável.
3. No Supabase, Site URL igual à origem pública funcional; Redirect URLs incluindo `https://emissor-nfse-lote-kjou.vercel.app/auth/callback`.

Não houve alteração de configurações externas, reaplicação do rascunho publicado, commit, push ou publicação nesta etapa. Não substituir a origem explícita por dados de Host não confiáveis para contornar configuração incorreta.

## Teste reutilizável, somente leitura

Na raiz, com as variáveis públicas já configuradas no ambiente de teste:

```sh
AUTH_LIVE_BASE_URL=https://emissor-nfse-lote-kjou.vercel.app node --use-env-proxy --experimental-strip-types --test tests/auth-live.test.ts
```

O teste é opt-in e fica ignorado quando `AUTH_LIVE_BASE_URL` está ausente. Só faz GET; não cria usuários, não envia e-mails e não registra a chave. A opção de proxy é para este ambiente cloud; fora dele, manter a configuração de rede adequada ao executor. Não usar a URL de preview protegida para esse teste público.

A suíte foi ampliada para conferir também o retorno padrão e a permissão de callback do Supabase com um token sintético inválido. Nenhum token ou link verdadeiro é consumido por essa verificação; o resultado esperado é rejeição por `otp_expired` com destino correto.

Primeira execução contra o alias público: **3 testes passaram e 1 falhou**, sem ignorados. Passaram configurações reais do Auth, formulários publicados e bloqueio/cache do painel. Falhou a origem de callback: retornou `emissor-nfse-lote-nuxi.vercel.app` em vez de `emissor-nfse-lote-kjou.vercel.app`. Após a correção externa, a mesma suíte completou **4 testes passados, zero falhas, zero ignorados**, sem desabilitar asserções.

## Pendências para homologação completa

O usuário autorizou uma conta de teste e o envio de confirmação ao e-mail informado na conversa; o endereço não é persistido neste documento. Login, acesso ao painel, persistência após atualização, logout e bloqueio após sair foram confirmados manualmente. Permanecem sem execução: expiração/renovação da sessão, revogação de tokens fora do navegador e conclusão de uma nova troca de código de confirmação com link gerado após a correção. Os cinco testes automatizados validam configuração e comportamentos sem sessão; não substituem essas verificações. A senha de teste não deve ser gravada em logs, Git ou chat.

O desktop do executor `ccarenv_b64_Y2NhcmVudl9jY2Q0ZGQ1MzgwZDg4MTkxYTM5MGZjOWY4MTAwZDg3YQ` foi reportado como `enabled: true`, `state: unknown`. Não há ferramenta de controle `cua_repl.js`/`js` nem `open_in_codex` disponível nesta sessão; não foi possível conduzir uma confirmação de e-mail no mesmo navegador compartilhado. Isso não demonstra indisponibilidade do navegador do usuário nem do Supabase. Resultados manuais devem ser registrados separadamente dos testes automatizados.

Sem essas verificações, não declarar o fluxo de autenticação completo ou MFA/recuperação implementados. Os testes de leitura e validação de entrada não substituem o ciclo autenticado com um usuário real de teste.
