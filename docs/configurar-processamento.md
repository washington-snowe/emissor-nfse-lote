# Configurar processamento privado na Vercel e no Supabase

Nenhuma VPS é necessária para esta etapa. A fila fica no PostgreSQL; a Vercel executa tarefas curtas. Chamadas interrompidas mantêm a tarefa recuperável. No plano Hobby, o Cron de recuperação é diário, com precisão por hora; o disparo após uma ação e a opção de retomar no painel atendem o fluxo imediato. Não é uma garantia de processamento contínuo em alto volume.

## 1. Banco

No SQL Editor do projeto Supabase existente, aplicar, nesta ordem, somente:

1. `supabase/migrations/202611110003_import_workflow.sql`.
2. `supabase/migrations/202611110004_certificates.sql`.
3. `supabase/migrations/202611110005_mfa_policies.sql`.
4. `supabase/migrations/202611110006_operation_limits.sql`.
5. `supabase/migrations/202611110007_fiscal_access.sql`.

As duas primeiras migrações já aplicadas não devem ser repetidas. Não executar `tests/database` no projeto remoto. As novas migrações adicionam estrutura; não apagam empresas nem contas. A quarta migração torna o schema Vault privado para usuários da API: somente funções do servidor podem usá-lo. Se a extensão não estiver disponível, a aplicação deverá bloquear armazenamento de A1.

O usuário confirmou a aplicação das migrações 1–7. A primeira tentativa da quarta falhou por tentar revogar funções criptográficas internas que pertencem ao Supabase; a migração foi corrigida para restringir schema/tabelas sem alterar essas funções, e a segunda tentativa foi confirmada sem erros. Não repetir as migrações já aplicadas.

A próxima estrutura é `supabase/migrations/202611110008_fiscal_profiles.sql`, para configurações fiscais versionadas. Aplicar somente essa nova migração, quando solicitada após os testes; não executar arquivos de `tests/database`. Ela adiciona tabela e função, sem apagar dados anteriores. O cadastro ficará indisponível até sua aplicação. Ver [núcleo fiscal e limites](nucleo-fiscal.md).

Depois da 8, aplicar `supabase/migrations/202611110009_report_reviews.sql`, para revisões e confirmações versionadas. Não repetir as migrações anteriores. Essa etapa também não cria transmissão ou documentos fiscais; ver [revisão fiscal](revisao-fiscal.md). Sem a migração, o histórico de importações permanece acessível e informa que a preparação está pendente.

O usuário confirmou que a 8 e a 9 foram aplicadas. Para a nova etapa, executar somente `202611110010_fiscal_queue.sql` e depois `202611110011_standalone_templates.sql`. Fila, modelos, limites e roteiro de homologação estão em [fila fiscal e nota avulsa](fila-emissao-avulsa.md). Não repetir 1–9.

O diagnóstico da migração 11 retornou os oito campos `true`, confirmado pelo usuário. Não repetir a 11. A remoção da verificação em duas etapas usa `supabase/migrations/202611120012_remove_mfa_requirement.sql`, também confirmada sem erros. Ela substitui o helper de tenant por resolução da identidade autenticada com RLS, sem apagar contas, certificados ou dados. Não repetir as migrações 1–12.

Os arquivos foram aplicados em PostgreSQL 17 descartável com testes de privilégio, duas identidades, chaves compostas, reenvio concorrente, exclusividade de reservas e isolamento de importações/certificados. O teste local **não inclui o Vault real**, indisponível na imagem PostgreSQL padrão; comprova o bloqueio quando ele falta. A criptografia AES-GCM e o parser A1 são testados separadamente com dados sintéticos.

## 2. Variáveis privadas da aplicação

No projeto Vercel **emissor-nfse-lote-kjou**, em Settings → Environment Variables, adicionar:

| Nome | Origem/uso |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave secret (`sb_secret_…`) ou service_role do projeto Supabase, disponível em Project Settings → API Keys. Somente servidor. Nunca anon/publishable e nunca `NEXT_PUBLIC_*`. |
| `CRON_SECRET` | Segredo aleatório de pelo menos 32 caracteres para o processador interno. Pode ser gerado localmente com o comando abaixo. Somente servidor. |
| `NFSE_HOMOLOGATION_ENABLED` | Inicia como `false`. Somente habilitar com `true` após conferir A1 e contrato oficial, seguindo o roteiro de homologação. Nunca habilita produção. |

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Salvar como variáveis sensíveis, nos ambientes de deploy desejados. Não enviar valores pelo chat, Git, URL ou screenshot. As variáveis públicas existentes permanecem como estão. Fazer novo deploy após adicionar as variáveis; o build anterior não recebe a configuração automaticamente.

Se for necessário executar testes privilegiados neste ambiente de desenvolvimento, configurar essas mesmas variáveis nas configurações seguras do ambiente cloud, nunca em mensagem. Isso é independente da configuração da Vercel.

## 3. Certificado e emissão

O A1 deve ser cadastrado pela aplicação somente após o mecanismo protegido estar disponível. O cadastro validará formato, senha, correspondência da chave, titular e validade, mas não comprova credenciamento, confiança ICP-Brasil ou homologação fiscal. A chave por certificado será protegida pelo Vault; o original e a senha ficarão dentro do envelope criptografado. Nenhuma senha ou certificado em claro deverá ir para logs ou arquivos temporários.

Homologação e produção são ambientes distintos. A ativação fiscal depende do contrato oficial, parâmetros e testes reais com o contribuinte. Não enviar o relatório original para emissão como forma de teste automático.
