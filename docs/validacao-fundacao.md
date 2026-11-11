# Evidências da primeira fatia

## Verificação técnica

- `npm ci --cache /workspace/.cache/npm`: instalação reproduzida pelo lockfile, com verificações de integridade preservadas. Aviso de fim de suporte do ESLint 9 registrado em `fundacao.md`; sem dependências de lint no runtime.
- `npm run build`: compilação de produção Next.js passou sem configuração Supabase.
- `npm run lint`: passou, sem erros ou avisos no código próprio. Arquivos de motion copiados da skill são dependência vendorizada e não são reescritos pelo lint.
- `npm run typecheck`: passou.
- Unidade: 7 testes passaram, incluindo config ausente/malformada, recusa de chaves privilegiadas e fronteiras de senha/e-mail. Smoke separado contra servidor de produção local: 1 teste passou. Execução conjunta com `SMOKE_BASE_URL` também completou 8/8, sem ignorados.
- `git diff --check`: passou. Nenhum arquivo de ambiente real foi criado/versionado. Na validação original, não havia commit ou push desta fatia; o usuário posteriormente autorizou o envio a `main` e informou as URLs dos projetos. Nenhum deploy foi disparado manualmente pelo agente.

## Verificação visual

GATE: ERROR (the copy (the page showed no `<main>`, `<section>` or `<h1>` to lint); consistency.mjs could not walk 1440, 390; check.mjs could not run (exit 2: check: Runtime.evaluate: Inspected target navigated or closed))

O gate final foi iniciado antes de o servidor reconstruído ficar pronto; não obteve DOM válido. Não é aprovação do layout. Conforme instrução da skill, esse gate não foi repetido após ERROR. Não houve waiver nem edição dos arquivos do kit para ocultar falhas.

Antes das correções, o checker completo percorreu 1440, 1024, 820, 768, 390 e 320 px: registrou 96 FAIL e 30 WARN. Os resultados incluíam problemas reais e regras específicas de composição de landing pages que a primeira fatia não satisfaz. Não transformar esse resultado em aprovação após ajustes pontuais.

### Revisão de código visual

| Before | After | Why |
| --- | --- | --- |
| Cabeçalho transbordando 29 px em 320 px | Espaço reduzido, marca menor e seta omitida nesse breakpoint | Preservar acesso e conteúdo na largura estreita |
| Texto da nota com contraste 6,35:1 | Cor escurecida | Atender a meta de 7:1 do checker para texto de corpo |
| Numeração das etapas com contraste 4,4:1 | Cor escurecida | Superar 4,5:1 para rótulos |
| h2 dentro da representação do produto no hero | Texto de interface com classe própria | Preservar hierarquia da página e separar UI de seção editorial |
| Cabeçalho sem espaço ao ocultar a quebra de linha no tablet | Espaço explícito antes de br | Impedir junção de palavras na visualização responsiva |
| CSS de motion empacotado, sem URL reconhecível pelo checker | Arquivo original servido por link próprio | Carregar a camada vendorizada sem modificá-la e permitir sua identificação |

Capturas reais após as principais correções foram geradas em 1440, 1024, 820, 768 e 390 px, além do acesso em 390 px, em `shots/`, ignorado pelo Git. Revisão visual não observou sobreposição nas capturas inspecionadas. Uma verificação posterior focada em 320 px, incluindo a passagem estreita a 320x640, concluiu sem erros de execução e sem FAIL de off-viewport, spill ou collide. O cabeçalho estreito foi assim revalidado; isso não é aprovação completa do checker.

### Pendências do checklist visual

Não houve segunda aprovação completa do checker. Continuam pendentes de reavaliação: hero restrito à primeira tela no celular; altura integral de seções/rodapé; separadores; reconhecimento de visuais próprios; heurísticas de títulos em português; CTA final; alinhamentos; hover e skip-link; momento decorativo da skill e metadados sociais completos. O footer compacto e o crescimento pelo conteúdo em celular são decisões registradas, não falsos PASS. Não executar waivers amplos para mascarar essas diferenças. Performance e layout-check final não foram aprovados por esse gate.

## O que não foi homologado

Na validação original, Supabase remoto ainda não havia sido criado/configurado pelo usuário. Ele posteriormente informou as URLs e a conclusão da configuração externa; isso não substitui testes reais de cadastro, e-mail de confirmação, sessão e logout, ainda não executados. Sem banco de negócio, RLS multi-tenant, recuperação, MFA, importação, A1, emissão ou cobrança. Não há prontidão para produção fiscal. As informações dos projetos e configuração estão em `conectar-servicos.md`.

## Configuração reutilizável

Salvos no rascunho: `install_script`, `start_skill` e requisitos `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`. A ferramenta confirmou persistência; isso não executa, aplica ou publica os campos. As operações equivalentes de instalar, compilar e iniciar foram executadas nesta instância. Publicação e restauração em nova tarefa não foram validadas.

A verificação focada em 320 px manteve apontamentos de composição do checker (resultado global não passou), sem transbordamento ou colisão FAIL nos alvos conferidos. Não foi uma repetição do gate e não substitui sua aprovação pendente.
