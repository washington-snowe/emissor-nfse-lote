# Cadastro de empresas com preenchimento pelo CNPJ

## Fluxo

Em `/painel/empresas`, cada cliente vê apenas as próprias empresas. Ao cadastrar, informar um CNPJ válido inicia uma consulta após 500 ms; não há consulta por dígito ou coleta em massa. O botão Consultar permite tentar novamente. Os dados retornados ficam disponíveis para revisão e edição antes de salvar. Se a consulta falhar, o preenchimento manual continua disponível.

Campos preenchidos quando presentes: razão social, nome fantasia, endereço, CEP, município/UF e código IBGE, e-mail e telefones corporativos, CNAE principal e secundários, natureza jurídica, porte, situação cadastral, data de abertura e indicadores públicos de opção MEI/Simples. Apenas CNPJ, razão social e enquadramento declarado são obrigatórios nesta etapa. A lista e o editor permitem gerenciar vários CNPJs da mesma conta. O CNPJ de uma empresa já salva não pode ser trocado.

O enquadramento é sugerido somente quando a fonte retorna explicitamente opção por MEI ou Simples; dado ausente ou negativo não vira um regime inventado. O usuário confirma o enquadramento atual, e os dados são **cadastrais declarados**, não uma configuração tributária homologada. O histórico de regime por competência será uma etapa própria; o campo atual não deve fundamentar emissões retroativas. Regime normal não é uma opção do produto.

Não são inferidos inscrição municipal, código de serviço, alíquota, ISS ou elegibilidade de emissão a partir do CNAE/porte. Salvar uma empresa não libera emissão. Dados da consulta podem precisar de atualização; revisão cadastral e posterior validação fiscal têm propósitos distintos.

## Fonte externa e limites

BrasilAPI, operação documentada `GET https://brasilapi.com.br/api/cnpj/v1/{cnpj}`. Referências consultadas: `https://brasilapi.com.br/docs`, handler e serviço no repositório oficial `https://github.com/BrasilAPI/BrasilAPI`. O serviço utiliza Minha Receita; não é uma integração oficial autenticada da Receita Federal. O README do projeto pede consultas com natureza de uso humano, sem crawling; não usar este adaptador para varrer bases ou importar milhares de CNPJs.

A consulta passa por Server Action autenticada, com quota atômica de **10 consultas por tenant a cada 10 minutos** no PostgreSQL. Não usa contador em memória da Vercel. Não existe endpoint público aberto para consultas sem sessão. Falha de quota/banco não autoriza contornar o controle. Cadastro manual não depende da disponibilidade do provedor nem dessa quota.

Timeout de 8 segundos, sem retries automáticos; mensagens de indisponibilidade, limite e CNPJ não encontrado. O corpo retornado precisa corresponder ao CNPJ solicitado e conter razão social. Flags ausentes permanecem desconhecidas. A normalização não coleta QSA, CPF de sócios ou o payload bruto. Não há cache persistente de dados pessoais do provedor. Os dados que o cliente confirma são salvos em sua empresa; não recebem selo de verificação fiscal.

Na verificação real, a API recusou o User-Agent genérico do Node com 403 e aceitou identificação explícita `EmissorNfse/0.1 (company registration lookup)`, também usada no adaptador. TLS e validação de integridade foram mantidos. A consulta pública de referência foi somente leitura; nenhuma empresa foi salva no banco hospedado pelo agente.

Validação local e SQL suportam CNPJ numérico e alfanumérico sem descartar letras, com dígitos verificadores. Cobertura do cadastro alfanumérico pela base do fornecedor depende da disponibilidade real do registro; formato válido sem dados na fonte segue para preenchimento manual, sem dados fabricados.

## Banco e isolamento

Migração: [202611110002_companies.sql](../supabase/migrations/202611110002_companies.sql), posterior à migração de tenants.

- `companies` possui `tenant_id`, unicidade `(tenant_id, cnpj)` e `(tenant_id, id)` para futuras FKs compostas. Um mesmo CNPJ em outra conta não impede o cadastro nem revela sua existência.
- RLS forçada em SELECT, INSERT e UPDATE. Identidade, dono do contexto e tenant vêm da sessão validada; IDs de cliente no payload não definem autorização.
- Trigger impede trocar ID, CNPJ, tenant ou data original; atualiza `updated_at`. Exclusão física não é concedida ao cliente.
- Quotas ficam em tabela sem leitura/escrita direta para clientes; somente a função de consumo autenticada pode alterá-las, dentro do tenant atual.
- Os campos cadastrais são declarações revisadas pelo cliente; o banco valida CNPJ, regime suportado, tipos e limites. A migração não altera `auth.users`, dados anteriores ou as políticas de tenants.

## Aplicação e testes

Aplicar **somente** o arquivo de migração no SQL Editor do projeto Supabase, antes de publicar o código que consulta `companies`. Não executar fixtures de `tests/database` no projeto hospedado. Não há acesso SQL administrativo no executor; a execução remota precisa do SQL Editor ou de uma conexão administrativa fornecida de forma segura.

`npm run test:db` aplica todas as migrações em PostgreSQL descartável e testa empresas entre duas identidades, tentativa de inserção em tenant estrangeiro, leitura/edição cruzada, duplicidade, imutabilidade do CNPJ, regimes inválidos e quotas concorrentes. O harness simula somente o contrato de identidade do gateway; não substitui duas sessões reais do Supabase Auth.

`tests/companies.test.ts` cobre dígitos, normalização, ausência de dados, descarte de QSA, payload forjado, validação de gravação e falhas do provedor. A UI foi verificada isoladamente com adaptadores de teste identificados; nenhuma fixture vira dado de produção. Homologação completa inclui, após deploy, cadastro de uma empresa real pelo próprio usuário e conferência do preenchimento e da persistência.

## Evidências desta entrega

- PostgreSQL real: 27 verificações do contexto e 22 de empresas/quota passaram. O teste de 8 bootstraps simultâneos manteve um tenant por conta; 16 consultas concorrentes aceitaram exatamente 10 e recusaram 6. O banco de teste foi removido ao finalizar.
- Backend: 14 testes passaram; 6 testes de rede opt-in foram ignorados nessa execução unitária, sem serem contados como validação de produção. TypeScript e lint passaram.
- Provedor real: o adaptador retornou razão social, endereço, código IBGE e CNAE na consulta pública de referência; dados de sócios foram descartados. O teste não criou empresa no Supabase.
- UI Chromium: autofill, revisão e salvamento de fixture passaram em 1440, 1024, 820, 768, 390 e 320 px, sem transbordamento horizontal ou exceções JavaScript. Passaram também fallback manual com fonte indisponível, troca de CNPJ durante consulta e preservação da edição manual quando uma resposta chega depois. Foram usados o formulário e o shell reais, com mocks apenas nas fronteiras de ações/navegação, num servidor local separado identificado como teste.
- Banco remoto: o usuário informou execução da migração sem erros; depois a leitura anônima de `companies` e o consumo anônimo da quota retornaram HTTP 401 / `42501`. Não houve reaplicação da migração pelo agente nem uso de chave privilegiada.

Para reproduzir o teste isolado de UI (Node, Chromium e ferramentas opcionais de teste, sem dependências novas no aplicativo):

```sh
npm install --prefix /tmp/emissor-company-ui --no-save esbuild@0.25.12 playwright-core@1.56.1
UI_TOOLS_DIR=/tmp/emissor-company-ui/node_modules node tests/ui/run-company-ui.mjs
```

As capturas em `shots/companies/` são ignoradas pelo Git. A suíte não acessa a sessão do usuário, não chama o provedor real e não grava no banco hospedado; seus resultados não devem ser anunciados como um cadastro real em produção. O teste real da BrasilAPI e os testes SQL são verificações separadas. O gate de composição de landing pages não foi tratado como critério de aprovação deste formulário operacional.
