# Conectar Supabase e Vercel

O código Next.js está preparado no checkout. O usuário autorizou commit e push desta fundação para a branch `main`. O deploy depende da integração GitHub/Vercel e das configurações de ambiente.

## Projetos informados pelo usuário

- Supabase: `https://lcueompcxefjszkrtyyp.supabase.co`.
- Aplicação Vercel: `https://emissor-nfse-lote-nuxi.vercel.app`.
- Callback esperado na Vercel: `https://emissor-nfse-lote-nuxi.vercel.app/auth/callback`.

Em Production na Vercel, `NEXT_PUBLIC_SITE_URL` deve ser a origem HTTPS acima. No desenvolvimento local com `npm run dev`, manter `http://localhost:3000` e seu callback permitido. A publishable key continua fora do repositório. O usuário informou ter feito a configuração; confirmação operacional depende de conexão e testes reais, não apenas destas URLs.

## 1. Criar o projeto Supabase

1. Acesse https://supabase.com/dashboard e entre na sua conta.
2. Crie um projeto na sua organização. Escolha um nome e região próxima ao público; Brasil, se disponível, é uma escolha inicial razoável.
3. Gere uma senha forte para o banco e guarde-a em gerenciador de senhas. Não é necessário enviá-la nesta conversa.
4. Aguarde o projeto terminar de provisionar.
5. Nas configurações de API do projeto, obtenha a **Project URL** (origem HTTPS do projeto) e a **publishable key**, iniciada por `sb_publishable_`. A chave `anon` legada também é aceita pelo código, mas prefira a publishable em um projeto novo. Não usar secret ou service_role.

Nesta etapa não é necessário criar tabelas ou buckets manualmente. As estruturas de negócio serão introduzidas por migrações e políticas de acesso testadas.

## 2. Preparar a Vercel

1. Após o envio do código ao GitHub, abra o projeto Vercel já conectado a `washington-snowe/emissor-nfse-lote`, branch `main`. Se ainda não existir, importe esse repositório como novo projeto.
2. Selecione **Next.js** como framework e mantenha a raiz do repositório como Root Directory.
3. Use `npm ci` para instalação, `npm run build` para build e a saída padrão do Next.js. Não preencher Output Directory com `out`.
4. A aplicação pode fazer o primeiro build sem Supabase; nesse caso mostra acesso em preparação. Copie o domínio HTTPS atribuído pela Vercel.
5. Em Settings → Environment Variables, cadastre:

| Nome | Valor |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL do Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key do Supabase |
| `NEXT_PUBLIC_SITE_URL` | Origem HTTPS da aplicação na Vercel, sem caminho ou barra final |

Comece configurando o domínio principal em Production. Previews exigem origem e callback próprios, além de valores de variáveis correspondentes; um callback de outro domínio não compartilha os cookies PKCE. Faça novo deploy após salvar variáveis públicas para que o build as incorpore.

## 3. Configurar a autenticação no Supabase

1. Em Authentication, habilite o provedor de e-mail/senha e mantenha a confirmação de e-mail habilitada.
2. Em URL Configuration, coloque em **Site URL** a mesma origem usada em `NEXT_PUBLIC_SITE_URL`.
3. Adicione a origem da aplicação seguida de `/auth/callback` à lista de **Redirect URLs** permitidas.
4. Para desenvolvimento local, permita também `http://localhost:3000/auth/callback`. O `.env.local` de desenvolvimento usa `http://localhost:3000` em `NEXT_PUBLIC_SITE_URL`.
5. Configure a política de senhas e limites de Auth. O formulário de cadastro exige 12 a 128 caracteres; a política do Supabase pode ser mais rigorosa, mas deve ser coerente com a interface antes de abrir acesso público.
6. O envio padrão do Supabase tem restrições de desenvolvimento. Para cadastro e confirmação com usuários externos, configurar SMTP apropriado e remetente verificado; não considerar envio de e-mail homologado só por criar o projeto.

## 4. Conectar também este ambiente de desenvolvimento

Nas configurações do ambiente Codex, preencher as mesmas três variáveis. Para o servidor local, a origem é `http://localhost:3000`; não copiar a origem local para a configuração Production da Vercel. Valores são por ambiente. A URL real do projeto também permitirá identificar o hostname exato necessário à política de rede cloud; a política atual ainda não inclui um projeto Supabase.

As exigências de variáveis, instalação e startup já foram salvas no rascunho. Salvar as configurações pode atualizar a instância; publicar torna a configuração reutilizável em novas tarefas. Publicação do ambiente cloud e deploy da Vercel são operações diferentes.

## 5. Validação acompanhada

Informar nesta conversa a Project URL e o domínio Vercel, que são públicos. Configurar a publishable key nas variáveis dos ambientes. Depois verificaremos conexão, cadastro de teste, confirmação no mesmo navegador, sessão, rota privada e logout. Não enviar senha do banco, secret key, service_role ou certificados A1 na conversa.

Nenhuma emissão fiscal será feita por esses passos. Cadastro de CNPJs, multi-tenancy de negócio, importação, proteção A1 e worker continuam como próximas etapas.
