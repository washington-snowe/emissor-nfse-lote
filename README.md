# Emissor — NFS-e para afiliados

Aplicação em **Next.js + React + TypeScript**, com Vercel e Supabase. Contas, MFA, cadastro com consulta de CNPJ, prévia Shopee, importação privada com histórico/fila e cadastro A1 protegido por Vault, condicionado à configuração. **Emissão fiscal e operação comercial completa ainda não estão implementadas/homologadas.**

## Desenvolvimento

Node 22 ou 24. Na raiz:

```sh
npm ci
npm run dev
```

Para habilitar acesso real, criar `.env.local` a partir de `.env.example`, configurar as três variáveis e os callbacks no Supabase conforme [guia da fundação](docs/fundacao.md). Sem configuração, o site inicia e informa que o acesso está em preparação. Não inserir chaves secret/service_role em variáveis públicas.

```sh
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
npm start
```

Na Vercel: preset Next.js, raiz do repositório e saída padrão; não usar export estático. Nenhum serviço fiscal ou worker está ativo. As instruções detalhadas, limites e verificações estão no [guia](docs/fundacao.md).

O painel agora exige contexto de cliente no banco. Antes de publicar essa alteração, aplicar a [migração de tenants](supabase/migrations/202611110001_tenants.sql) no projeto Supabase, conforme [guia de isolamento](docs/isolamento-clientes.md). `npm run test:db` usa um PostgreSQL descartável no Docker local e não altera o banco remoto.

O cadastro de empresas requer também a [migração de empresas](supabase/migrations/202611110002_companies.sql). Em `/painel/empresas`, o CNPJ inicia o preenchimento automático para revisão. Há edição e preenchimento manual quando a fonte não possui dados. Fonte, limites, testes e ordem de aplicação estão no [guia de cadastro](docs/cadastro-empresas.md).

A base interna de importação possui contrato versionado, rastreabilidade de linhas e resumo com decimais exatos separados por moeda. Em `/painel/importacoes`, a prévia lê localmente o [CSV mensal por vendedor da Shopee](docs/shopee-csv-mensal.md), com base na amostra real fornecida. Durante a conferência local o arquivo não é enviado nem salvo; não há agrupamento ou emissão fiscal. Outros layouts dependem de amostras; veja [contrato e limites da importação](docs/importacao-comissoes.md).

Quando configurado o serviço privado, o usuário pode escolher **Salvar importação**, enviando o original para sua conta e acompanhando o processamento em `/painel/importacoes/historico`. MFA está em `/painel/seguranca` e A1 em `/painel/certificados`. As migrações 3–7 e as variáveis privadas estão no [guia de configuração](docs/configurar-processamento.md). Fluxo, testes, modelo de segurança e limites estão em [importações/certificados/MFA](docs/importacoes-certificados-seguranca.md). Não usar chave privilegiada em variável pública.

## Documentação

- [Decisão atual: Vercel e Supabase](docs/decisoes/0001-vercel-supabase.md).
- [Fundação e configuração](docs/fundacao.md).
- [Passo a passo Supabase e Vercel](docs/conectar-servicos.md).
- [Isolamento de clientes e testes RLS](docs/isolamento-clientes.md).
- [Cadastro de empresas e preenchimento automático](docs/cadastro-empresas.md).
- [Contrato interno de importação e revisão](docs/importacao-comissoes.md).
- [Layout Shopee CSV mensal e prévia local](docs/shopee-csv-mensal.md).
- [Persistência, fila, MFA e certificados](docs/importacoes-certificados-seguranca.md).
- [Configurar processamento Vercel/Supabase](docs/configurar-processamento.md).
- [Execução do sistema completo e dependências](docs/execucao-sistema.md).
- [Especificação do usuário](docs/especificacao-mestra.md).
- [Diagnóstico e pendências](docs/descoberta.md).
- [Modelo de dados e arquitetura da descoberta](docs/arquitetura.md), cuja recomendação Django foi substituída pela decisão atual.
- [Pesquisa fiscal e integrações](docs/pesquisa.md).
- [Hipóteses de custos e riscos](docs/custos-e-riscos.md).
- [Roadmap](docs/roadmap.md).
- [Regras de engenharia](AGENTS.md).
