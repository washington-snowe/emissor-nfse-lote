# Fundação — primeira fatia

## O que existe

Next.js/React/TypeScript, App Router e build compatível com Vercel; tipografia local; apresentação em português sem estatísticas ou notas fictícias; páginas de login/cadastro; Server Actions Supabase; callback PKCE com origem fixa configurada; refresh de sessão; logout; painel que valida o usuário no servidor e não expõe dados de negócio; páginas de erro; headers básicos de proteção.

Sem configuração, a aplicação inicia e mostra acesso indisponível. Não há conta falsa, sessão simulada ou rota de bypass. Chaves secret/service_role são recusadas na configuração pública; a validação de JWT legado apenas identifica o papel declarado, não verifica assinatura, que cabe ao Supabase durante autenticação.

## Configuração local

Na raiz do checkout, Node 22 ou 24; a versão efetivamente validada nesta entrega foi Node 24.22.1. Instalar com `npm ci` (o ambiente cloud usa `npm ci --cache /workspace/.cache/npm` por ter HOME somente leitura). Copiar `.env.example` para `.env.local` sem sobrescrever arquivo existente. Nunca versionar `.env.local`.

Preencher em configurações seguras do ambiente:

- `NEXT_PUBLIC_SUPABASE_URL`: origem HTTPS real do projeto.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: publishable key; legacy anon também aceita. Nunca secret ou service_role.
- `NEXT_PUBLIC_SITE_URL`: origem exata da aplicação. Localmente `http://localhost:3000`; na Vercel, domínio HTTPS real. Sem caminho, credenciais, query ou fragmento.

No Supabase, configurar Site URL e Redirect URLs para o domínio real e o callback `/auth/callback`. Desenvolvimento local requer também o callback local permitido. Manter confirmação de e-mail habilitada, configurar provedor/remetente apropriado, limites de Auth e política de senha compatível com o mínimo de 12 caracteres. Fluxo PKCE atual requer abrir confirmação no navegador que iniciou o cadastro; cross-device e recuperação de senha são próximos itens, não suporte já implementado. Não usar usuários ou certificados reais para testes sem autorização.

Comandos disponíveis:

```sh
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

`npm start` precisa do build concluído. A porta padrão é 3000; evitar dois servidores na mesma porta. As instruções de startup não criam worktree: a tarefa cloud já é isolada e usa este checkout.

## Vercel

Selecionar framework Next.js, raiz do repositório, instalação `npm ci` e build `npm run build`. Usar o diretório de saída padrão do Next.js; não configurar `out` nem export estático. Configurar as três variáveis nos ambientes escolhidos e fazer novo build após alterações, principalmente nas NEXT_PUBLIC_*. Cada preview autorizado precisa de origem/callback correspondentes; não aceitar retorno arbitrário pelo Host ou parâmetro `next`.

O usuário autorizou commit e push desta fundação para `main` após informar os projetos Supabase e Vercel. Nenhum deploy foi disparado manualmente pelo agente; o push pode acionar a integração automática da Vercel. As URLs e o callback esperado estão em `conectar-servicos.md`.

## Validação

`npm test` verifica ausência/configuração malformada, bloqueio de chaves privilegiadas, origem de callback e fronteiras de e-mail/senha. O smoke é ignorado sem `SMOKE_BASE_URL` para não anunciar um servidor inexistente como testado. Para executá-lo em um servidor sem as variáveis de Auth:

```sh
SMOKE_BASE_URL=http://localhost:3000 node --experimental-strip-types --test tests/smoke.test.ts
```

Ele verifica resposta real de páginas, headers, ausência de formulário habilitado sem configuração, bloqueio do painel, callback indisponível e 404. Não usar esse smoke de configuração ausente para validar um ambiente já conectado ao Supabase.

Integração remota Auth, cadastro, e-mail de confirmação, sessão, logout e isolamento de usuários exigem um projeto Supabase de desenvolvimento configurado. Ausência de configuração impede afirmar que esses fluxos foram homologados. Não há migrations, testes de RLS de negócio, nem dados fiscais nesta fatia. Antes de expor cadastros públicos, validar limites de Auth/SMTP, recuperação, MFA e revisão de segurança. Os headers atuais não equivalem a uma revisão completa de CSP e produção.

O lint usa ESLint 9 por compatibilidade declarada dos plugins da configuração oficial Next; o pacote recebeu aviso de fim de suporte no registro. Atualizar a cadeia de lint para uma combinação suportada antes de produção; ESLint não participa do runtime da aplicação.

## Design

Software financeiro, português brasileiro; voz direta e explicativa, sem preços, cobertura fiscal ou provas comerciais inventadas. Base off-white com verde da paleta `mint-pink-accounts`, Outfit e DM Mono servidos localmente, cantos discretos, foco visível e redução de movimento.

A skill sorteou hero `triptych`; foi adaptado para apresentação do espaço de trabalho em split, pois não há três produtos/documentos reais para alternar sem fabricar conteúdo. A interface é inicial e funcional; loops decorativos, shaders e seções adicionais sem conteúdo foram omitidos. Não há nome comercial inventado, fotografias de terceiros, depoimentos, logos de clientes ou números de operação simulados. Nomes de plataformas indicam o escopo planejado, não integrações já entregues. As restrições de “sem avisos de demonstração” da skill não se sobrepõem à especificação que exige identificar funcionalidades ainda indisponíveis.

`public/assets/motion/` é copiado sem alterações da skill taste-skill 2.5.1 instalada no ambiente, para hover/press e entrada pontual do hero. Evitar mutações desses arquivos para satisfazer checker. Não animar ações de teclado e preservar foco; sem animações de scroll nos componentes operacionais.

Os resultados executados, falha do gate e limitações estão em [Evidências da fundação](validacao-fundacao.md). O [passo a passo dos serviços](conectar-servicos.md) orienta a criação de Supabase e Vercel.
