# Instruções de engenharia

## Estado e autorização

O usuário aprovou iniciar a fundação com Next.js, React, TypeScript, Vercel e Supabase. A primeira fatia implementa apresentação, acesso Supabase preparado e painel protegido sem dados de negócio. Leia `docs/especificacao-mestra.md`, `docs/decisoes/0001-vercel-supabase.md` e `docs/fundacao.md`. Não confundir fundação parcial com Fase 1 completa. Não faça commits, push, deploy, contratação de serviços ou emissão real sem autorização.

## Arquitetura proposta

Next.js App Router com React e TypeScript na Vercel; Supabase Auth, PostgreSQL e Storage privado. Worker fiscal, fila e gerenciador de chaves serão definidos separadamente, sem processamento longo em requisições Vercel. A proposta Django/Celery em `docs/arquitetura.md` é histórica, substituída pela decisão `docs/decisoes/0001-vercel-supabase.md`. Não usar export estático: autenticação exige cookies e código de servidor.

Módulos propostos: identity, tenancy, companies, certificates, imports, marketplaces, commissions, recipients, tax_configuration, invoicing, integrations, jobs, documents, notifications, billing, dashboard, administration e audit. Criar apenas o necessário em cada etapa aprovada.

## Convenções e comandos

TypeScript estrito, validação nas fronteiras e componentes de servidor por padrão. Client Components só para interação. Valores monetários futuros precisam de representação decimal explícita, nunca cálculos financeiros com float. Datas com fuso explícito; competência fiscal separada do instante UTC. Validação no backend. Mensagens do produto em pt-BR; nomes técnicos consistentes. Erros de domínio distintos dos de transporte. Dependências e ferramentas com versões fixadas e lockfile após aprovação.

Comandos na raiz: `npm ci`, `npm run dev`, `npm run build`, `npm start`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:db`. Smoke contra servidor sem variáveis Supabase: `SMOKE_BASE_URL=http://localhost:3000 node --experimental-strip-types --test tests/smoke.test.ts`. A primeira migração de tenants e seus testes PostgreSQL estão em `supabase/migrations/` e `tests/database/`; consultar `docs/isolamento-clientes.md`. Não há worker nesta fatia. Usar lockfile e dependências exatas. Consultar `docs/fundacao.md` para limites dos testes. Nunca colocar chave secret/service_role em NEXT_PUBLIC_*.

As tarefas cloud já são isoladas: utilizar o checkout existente; não criar worktree sem pedido explícito do usuário. Não sobrescrever alterações existentes. Inspecionar Git e instruções antes de editar.

## Segurança

- Derivar tenant da sessão autenticada e validar vínculo no servidor. Nunca confiar em tenant vindo do formulário, URL ou payload da fila.
- Provar isolamento com duas contas em testes de API, banco, jobs e documentos; acesso de suporte exige concessão temporária e auditada.
- Certificados, senhas e tokens não entram em logs, fixtures, Git, payloads de fila ou arquivos temporários em claro.
- Certificados por criptografia de envelope; chave mestra fora do banco e do repositório. Sem gerenciador de chaves aprovado, upload A1 fica indisponível.
- Usar CSRF, cookies seguros, sessões revogáveis, limites de requisições e uploads, validação de tipo real e processamento de arquivos isolado e limitado.
- Preservar TLS, checksums e assinaturas durante instalação e integração.

## Banco de dados

Migrações versionadas e revisadas; nenhuma alteração destrutiva sem plano de preservação e autorização. Constraints únicas e chaves compostas devem impedir vínculos entre tenants. Mudanças monetárias, de consumo e estados fiscais precisam de transações e testes de concorrência. Testar em PostgreSQL real, sem substituir por SQLite nas garantias de isolamento. Política de RLS deve falhar fechada e usar conexão de aplicação sem privilégios de bypass.

O painel resolve o tenant pela RPC `ensure_tenant()` somente após validar o usuário. A migração deve ser aplicada antes do deploy deste guard. Falha de bootstrap não libera dados nem gera tenant fictício. A conta inicial possui um dono; nenhum ID de tenant ou dono vindo do cliente pode escolher o contexto. Fixtures de `tests/database` são exclusivos do container descartável, nunca do projeto remoto.

Empresas em `public.companies` exigem a segunda migração antes do deploy. Ler `docs/cadastro-empresas.md`. A consulta BrasilAPI é autenticada, limitada no banco e não verifica parâmetros fiscais. Não armazenar QSA/CPF de sócios ou tratar dados preenchidos como homologação fiscal. CNPJ, tenant e identidade da empresa salva são imutáveis. Manter fallback manual e proteção contra respostas de consulta atrasadas. Os testes de UI em `tests/ui` usam adaptadores explícitos e não criam empresas reais.

## Integrações fiscais

Consultar documentação oficial vigente e registrar URL, versão e evidência antes de implementar. Não inventar endpoint, XML, código tributário, regra de tomador, alíquota ou credenciamento. A1 não prova elegibilidade. HTTP 2xx não prova autorização. Timeout após envio bloqueia retransmissão e exige reconciliação oficial. Nunca misturar tomadores distintos, nem converter tomador estrangeiro em exportação automaticamente. Mocks devem estar claramente identificados e não provar homologação real.

## Conclusão

Cada tarefa aprovada deve ter critérios de aceitação, implementação, testes relevantes executados com resultado e documentação atualizada. Distinguir testes passados, falhos, ignorados e não executados. Falhas de isolamento, duplicidade ou integridade financeira impedem etapas dependentes. Não declarar produção pronta sem homologação fiscal, restauração de backup, revisão de segurança e autorização.
