# Emissor — NFS-e para afiliados

Fundação em **Next.js + React + TypeScript**, preparada para Vercel e Supabase. Primeira fatia: apresentação, cadastro/login preparados e painel protegido. **Importação, emissão fiscal e dados de negócio ainda não estão implementados.**

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

## Documentação

- [Decisão atual: Vercel e Supabase](docs/decisoes/0001-vercel-supabase.md).
- [Fundação e configuração](docs/fundacao.md).
- [Passo a passo Supabase e Vercel](docs/conectar-servicos.md).
- [Isolamento de clientes e testes RLS](docs/isolamento-clientes.md).
- [Especificação do usuário](docs/especificacao-mestra.md).
- [Diagnóstico e pendências](docs/descoberta.md).
- [Modelo de dados e arquitetura da descoberta](docs/arquitetura.md), cuja recomendação Django foi substituída pela decisão atual.
- [Pesquisa fiscal e integrações](docs/pesquisa.md).
- [Hipóteses de custos e riscos](docs/custos-e-riscos.md).
- [Roadmap](docs/roadmap.md).
- [Regras de engenharia](AGENTS.md).
