# Início e captura da landing

A página autenticada e a captura usam os componentes de apresentação de
`src/components/dashboard-home.tsx`, além da barra lateral e do cabeçalho reais.
O CSS do painel e as fontes locais são carregados pelo mesmo gerador.

`npm run build` executa `npm run prepare:panel-preview` antes do Next.js.
Cada build captura novamente o Início no Chromium e substitui
`public/brand/rex-panel-desktop.webp`. Uma falha na captura interrompe o build.
Para mudanças na interface do Início, edite os componentes compartilhados.
A captura acompanha essas alterações automaticamente.
O Next.js publica a imagem com um endereço que inclui o hash do conteúdo,
atualizando o cache do navegador quando a captura muda.

A captura usa dados fictícios de `scripts/panel-preview/entry.tsx`.
O servidor temporário aceita somente conexões locais e arquivos fixos.
As ações de autenticação e seleção de empresa recebem adaptadores inertes.
O navegador recebe uma lista limitada de variáveis de processo e bloqueia
requisições fora desse servidor. O gerador não acessa o Supabase.

Chromium, Playwright, esbuild e sharp são dependências de desenvolvimento.
O navegador é usado no build. A landing entrega uma imagem WebP estática.
`PANEL_PREVIEW_CHROME_PATH` permite escolher um Chromium local em desenvolvimento.
A resolução compartilhada fica em `src/lib/panel-preview.ts`.

No painel real, a autorização e o isolamento por empresa continuam no servidor.
Os totais consultam o histórico completo da empresa. O gráfico financeiro usa
somente autorizações em produção entre as últimas 100 emissões, nos seis meses
exibidos. O recorte aparece junto ao gráfico. Os valores são somados em centavos
inteiros. A tabela mostra as cinco emissões mais recentes.
