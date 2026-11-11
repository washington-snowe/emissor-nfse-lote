# Isolamento de clientes — primeira migração

## Estado da entrega

Migração testada no PostgreSQL local e execução no SQL Editor confirmada pelo usuário. Depois dessa execução, a REST API do Supabase respondeu **401 / 42501** para consulta anônima a `tenants`, para a função `current_tenant_id` e para POST anônimo de `ensure_tenant`, demonstrando proteção de leitura e bootstrap contra o papel anônimo.

O commit de implementação `b8a6302` foi enviado a `main`; a integração Vercel do projeto `emissor-nfse-lote-kjou` confirmou deployment concluído. Os cinco testes de leitura em produção passaram após esse deploy. O usuário informou que entrou no painel e atualizou a página normalmente com o novo guard; isso confirma manualmente a inicialização/reutilização do contexto autenticado. A sessão privada do usuário não foi acessada pelo agente. A comparação entre duas sessões no projeto hospedado ainda não foi realizada.

## Escopo

Uma conta tem um usuário principal e um tenant próprio. A migração cria somente `public.tenants` e duas funções de contexto; não cria empresas, certificados, notas ou cobranças. Membros e permissões de equipe serão acrescentados apenas quando necessários. As garantias desta entrega cobrem o contexto do cliente; os módulos futuros precisam de suas próprias políticas e testes de isolamento.

O dono é a identidade autenticada por Supabase/PostgREST (`auth.uid()`), nunca um ID vindo de URL, formulário, header ou `user_metadata`. As tabelas futuras deverão ter `tenant_id` e FKs compostas `(tenant_id, entidade_id)` para impedir vínculos cruzados. Não usar apenas IDs globais ou um filtro de frontend como autorização.

## O que foi implementado

- `tenants`: UUID, dono único e instante de criação; FK para `auth.users`, com exclusão restrita para evitar cascata de dados fiscais. Exclusão de conta precisa de fluxo explícito de retenção antes de remover o usuário.
- RLS ativada e forçada. `authenticated` pode consultar apenas seu próprio tenant. `anon` não tem leitura ou execução das funções. Inserir, transferir dono e excluir diretamente são proibidos ao cliente.
- `ensure_tenant()` é a única escrita: função `SECURITY DEFINER` sem parâmetros, com `search_path` vazio e referências qualificadas; exige identidade, deriva o dono, cria uma única linha e reutiliza a existente. O índice único resolve concorrência. Deve pertencer ao papel administrativo que aplica a migração; esse papel precisa de permissão de bootstrap além da RLS (o papel administrativo `postgres` do Supabase).
- `current_tenant_id()` é `SECURITY INVOKER` e respeita RLS; servirá às políticas de módulos posteriores.
- `getTenantContext()` valida o usuário no servidor antes de chamar a RPC; erro de identidade, resposta inválida ou função indisponível não produz contexto fictício. O painel exige esse contexto antes de renderizar a área de trabalho.

Não há chave `service_role` no código. Papéis administrativos e service roles que podem ignorar RLS continuam fora do alcance de usuários da aplicação e não devem ser usados como clientes normais.

## Testes executados

`npm run test:db` inicia um PostgreSQL 17 descartável no Docker local, sem portas publicadas e sem rede do container, aplica a migração real e remove somente o container/volume criados por esse teste. A imagem oficial está fixada por digest; a execução observada usou PostgreSQL 17.11. O runner requer Python 3 e Docker local com socket Unix.

Resultado: **27 assertions de RLS, identidade e privilégios passaram**; **8 inicializações concorrentes da terceira identidade retornaram o mesmo tenant e deixaram uma única linha**; a tentativa de excluir um dono vinculado foi bloqueada pela FK. A conexão de teste de RLS é `tenant_test_client`, sem superuser, sem bypass e sem permissão de assumir o papel administrativo; os casos são executados como `authenticated`/`anon`.

Verificações incluem duas contas com tenants diferentes; leitura cruzada pelos dois lados; ID estrangeiro conhecido; header e metadados forjados; dono escolhido por parâmetro; escrita e transferência diretas; usuário sem identidade; contexto limpo em conexão reutilizada; tentativa de escalação de papel e tabela temporária tentando sombrear a tabela real.

O fixture local simula apenas o contrato de `auth.uid()` e a FK de `auth.users`. Não é o servidor Supabase Auth, nem um teste de assinatura JWT ou de PostgREST. Os tokens reais são validados pela plataforma no projeto hospedado. **Não executar `tests/database/bootstrap.sql` ou `tenancy.sql` no Supabase remoto.** O único arquivo para o projeto remoto é a migração.

`tests/tenancy.test.ts` testa a fronteira do backend: usuário ausente/inválido não dispara RPC; bootstrap sem dono fornecido; erro de migração/transportes e IDs inválidos falham fechados. Esses testes unitários complementam a execução SQL real, sem substituí-la.

Também passaram build, TypeScript, lint e 10 testes unitários; os 6 testes de rede opt-in foram ignorados nessa execução unitária, conforme configuração. No servidor compilado, `/entrar` retornou 200 e `/painel` sem sessão retornou 307 para login mesmo com tenant forjado em URL/header, sem cache compartilhado. O container e seu volume de teste foram removidos pelo runner.

## Aplicação no Supabase remoto

Acesso SQL administrativo não está disponível no executor: não há `DATABASE_URL`, `SUPABASE_DB_URL`, senha de banco ou token de gerenciamento. A chave pública existente serve ao Auth e à API com RLS; ela não permite DDL. Uma consulta sem linhas à tabela `tenants` pela REST API retornou HTTP 404 / `PGRST205`; a tabela não está disponível nesse schema cache para o acesso atual. A migração desta entrega não foi aplicada remotamente pelo agente.

No projeto Supabase informado:

1. Abrir **SQL Editor → New query**, usando o papel administrativo do projeto.
2. Copiar somente o conteúdo completo de [202611110001_tenants.sql](../supabase/migrations/202611110001_tenants.sql) e executar.
3. Confirmar o resultado. A migração é transacional e não remove tabelas nem altera registros de `auth.users`. Se já existirem objetos de mesmo nome, ela deve falhar; não contornar com DROP, `IF NOT EXISTS` ou alterações de RLS sem investigar o conflito.
4. Aplicar antes de publicar o código que exige tenant. Sem a RPC, o backend fica indisponível de propósito em vez de criar um tenant em memória ou permitir acesso sem isolamento.
5. Depois de aplicar, validar com sessões de duas contas no projeto real, sem compartilhar senhas ou tokens. Cada primeira visita ao painel inicializa apenas o tenant daquela conta; não há backfill ou trigger de cadastro que possa bloquear o Auth.

Em ambientes com Supabase CLI e credenciais administrativas já configuradas, usar o fluxo de migrações versionadas do projeto. O SQL Editor não atualiza automaticamente o histórico de migrações do CLI; registrar a execução e reconciliar o histórico antes de alternar ferramentas. A migração deve ser aplicada uma única vez.

Permissão para os testes e mudanças necessárias foi fornecida pelo usuário. A aplicação SQL pelo usuário e a verificação negativa anônima via PostgREST foram concluídas, sem compartilhar credenciais administrativas. A verificação autenticada entre duas sessões no projeto remoto permanece distinta dos testes de isolamento no PostgreSQL local. Não houve reaplicação de configuração anterior nem publicação do ambiente cloud.
