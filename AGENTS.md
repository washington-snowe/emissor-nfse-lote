# Instruções de engenharia

## Estado e autorização

O usuário aprovou iniciar a fundação com Next.js, React, TypeScript, Vercel e Supabase. A primeira fatia implementa apresentação, acesso Supabase preparado e painel protegido sem dados de negócio. Leia `docs/especificacao-mestra.md`, `docs/decisoes/0001-vercel-supabase.md` e `docs/fundacao.md`. Não confundir fundação parcial com Fase 1 completa. Não faça commits, push, deploy, contratação de serviços ou emissão real sem autorização.

Autorização posterior: o usuário solicitou implementar o sistema completo, incluindo emissão, com Vercel/Supabase por enquanto e sem VPS. O histórico autoriza mudanças, testes e publicação das versões testadas no GitHub/Vercel. Não contratar serviços nem emitir documentos reais sem a configuração e a confirmação da operação correspondente. Consultar `docs/execucao-sistema.md`; não declarar sistema completo por entregar somente os módulos intermediários.

## Arquitetura proposta

Next.js App Router com React e TypeScript na Vercel; Supabase Auth, PostgreSQL e Storage privado. Worker fiscal, fila e gerenciador de chaves serão definidos separadamente, sem processamento longo em requisições Vercel. A proposta Django/Celery em `docs/arquitetura.md` é histórica, substituída pela decisão `docs/decisoes/0001-vercel-supabase.md`. Não usar export estático: autenticação exige cookies e código de servidor.

Decisão posterior do usuário: manter Vercel e Supabase, sem servidor residente. Jobs atuais são curtos, com fila transacional, token de reserva, `after()` e Cron de recuperação diário compatível com Hobby. CSVs até 512 KiB ficam privados no banco para atomicidade; arquivos grandes/OCR ainda não estão liberados. O Vault gerenciado protege chaves por certificado; não substituí-lo por chave mestra gravada em tabela ou em NEXT_PUBLIC. Limites e verificação real em `docs/importacoes-certificados-seguranca.md`.

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

O contrato interno de importação está em `src/lib/imports.ts`; ler `docs/importacao-comissoes.md` e `docs/shopee-csv-mensal.md`. Um CSV real Shopee foi validado fora do Git; a fixture reduzida preserva o layout com dados substituídos. A prévia em `/painel/importacoes` lê somente no navegador, sem upload ou persistência. Preservar valores como strings decimais, ausência explícita como `null`, proveniência e separação de moedas. ID da loja não é ID de operação; mês de conclusão não define competência. Resumo financeiro não define agrupamento fiscal ou tomador. Não confiar em hash/payload do cliente para futura persistência; revalidar bytes e autorização no servidor/worker. Outros layouts e plataformas exigem amostras e validação real.

## Integrações fiscais

Migrações 3–7 estão em `supabase/migrations`. O usuário confirmou sua aplicação, inclusive a correção do erro 42501 da quarta: não tentar alterar funções criptográficas nativas gerenciadas do Vault. Dados privados só por funções de servidor; chave service_role/secret nunca vai ao navegador. Decisão posterior explícita do usuário: remover a verificação em duas etapas. A migração 12, confirmada sem erros, retira a exigência de AAL2 do helper de tenant. Cadastro/uso de A1 e operações fiscais continuam exigindo usuário validado e propriedade conferida no servidor; não reintroduzir MFA sem novo pedido. Certificados sintéticos não provam ICP-Brasil ou homologação. `nfse_contract_status()` expõe somente estrutura de documentação oficial, sem registros de empresa/certificado. Uma consulta de acesso 2xx não é autorização fiscal.

Consultar documentação oficial vigente e registrar URL, versão e evidência antes de implementar. Não inventar endpoint, XML, código tributário, regra de tomador, alíquota ou credenciamento. A1 não prova elegibilidade. HTTP 2xx não prova autorização. Timeout após envio bloqueia retransmissão e exige reconciliação oficial. Nunca misturar tomadores distintos, nem converter tomador estrangeiro em exportação automaticamente. Mocks devem estar claramente identificados e não provar homologação real.

Perfis fiscais (migração 8) mantêm histórico e controle de versão esperada; não editar migrações já aplicadas ou encaminhadas ao usuário. Ler `docs/nucleo-fiscal.md`: XSD oficial preservado, adaptação única da expressão TSSerieDPS apenas em memória e validação independente da série conforme RN144. Assinatura e XSD locais não provam homologação. O formulário não presume códigos fiscais. Valor em moeda estrangeira é por operação e não um valor padrão compartilhado do perfil.

Revisões (migração 9): ler `docs/revisao-fiscal.md`. Confirmação exige digest e versão/perfil atuais; enfileirar é uma ação separada. Snapshot preserva todas as linhas, valores e alocações; negativos/zero não são descartados. Dados reaproveitados de revisão anterior não eliminam a confirmação do usuário.

Fila e avulsa (migrações 10/11): ler `docs/fila-emissao-avulsa.md`. O usuário confirmou 8/9 e o CNPJ Shopee 35635824000112; A1 só estará disponível no próximo dia. Modelos reaproveitam o perfil fiscal, sem inferir códigos de serviço ou gravar valor/competência antigos. Antes de A1/acesso oficial, reservar somente escopos locais, sem tocar o namespace de outro tenant. Numeração compartilhada exige certificado próprio e acesso mTLS oficial; acesso não é autorização fiscal. Uma operação pode iniciar no máximo um POST: lease expirado após intenção vira consulta, nunca nova preparação. Homologação fica desativada por padrão, produção bloqueada. Contratos/certificados/XMLs de testes são sintéticos e não provam homologação. Não aceitar HTTP 2xx sem documento válido e vinculado à DPS. Não editar migrações encaminhadas ao usuário; 10/11 foram solicitadas após testes locais.

## Conclusão

Cada tarefa aprovada deve ter critérios de aceitação, implementação, testes relevantes executados com resultado e documentação atualizada. Distinguir testes passados, falhos, ignorados e não executados. Falhas de isolamento, duplicidade ou integridade financeira impedem etapas dependentes. Não declarar produção pronta sem homologação fiscal, restauração de backup, revisão de segurança e autorização.
