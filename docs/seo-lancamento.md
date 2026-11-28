# SEO do RexNotas

## Implementação

O domínio canônico é `https://www.rexnotas.com.br`. O domínio sem www já
redireciona para ele com HTTP 308 na Vercel. A landing, os documentos legais,
o índice de guias e os três guias possuem título, descrição, canonical,
metadados Open Graph/Twitter e indexação pública em produção.

O layout raiz mantém `noindex` como padrão seguro. As páginas públicas liberam
a indexação explicitamente. Login, cadastro, recuperação de senha, painel,
protótipo, callbacks e APIs também recebem `X-Robots-Tag: noindex`.
Pré-visualizações da Vercel recebem bloqueio global e `robots.txt` restritivo.
Isso complementa a autenticação; não é um mecanismo de controle de acesso.

`/robots.txt` anuncia `/sitemap.xml`, que lista somente sete URLs públicas,
sem parâmetros, contas ou documentos de clientes. As datas dos guias são
editoriais, sem atualizar `lastmod` artificialmente a cada deploy.

A landing descreve Organization, WebSite e SoftwareApplication em JSON-LD,
com os preços derivados do catálogo real e os ciclos mensal/anual separados.
Os guias têm Article e BreadcrumbList e referências públicas. Não foram
criadas avaliações, estrelas, depoimentos, números de usuários ou garantias
de elegibilidade fiscal. O Google decide quais formatos exibir nos resultados.

A imagem social em `/opengraph-image` é gerada no build, com 1200 × 630 pixels.
O favicon usa a marca real. O mascote principal tem prioridade alta de carga,
e a captura desktop do painel usa imagens responsivas para reduzir a
transferência em telas pequenas. O conteúdo dos guias é estático; a landing
e seus textos/planos/FAQ são entregues no HTML inicial, acessíveis sem JavaScript.

## O que o proprietário precisa fazer

1. Abra <https://search.google.com/search-console>, entre com a conta Google
   que administrará o projeto e adicione uma propriedade do tipo **Domínio**:
   `rexnotas.com.br`, sem https, www ou caminhos.
2. Copie o registro TXT fornecido pelo Google. No provedor que administra o
   DNS do domínio, crie um TXT na raiz (`@` ou campo vazio, conforme o painel)
   com o valor exato `google-site-verification=...`. Preserve os registros
   de hospedagem e e-mail existentes. O token não é uma senha; não é necessário
   fornecer credenciais do Google ou do registrador a terceiros.
3. Volte ao Search Console e clique em **Verificar**. A propagação pode levar
   algum tempo. Mantenha o TXT depois da confirmação para preservar o acesso.
4. Na propriedade, abra **Sitemaps**, envie
   `https://www.rexnotas.com.br/sitemap.xml` e confira o status de processamento.
5. Use **Inspeção de URL** para `https://www.rexnotas.com.br/`, clique em
   **Testar URL publicada** e depois em **Solicitar indexação**, se disponível.
   Repita para `/guias` e os três guias do sitemap. Não solicite indexação de
   login, painel ou documentos fiscais. Não é necessário repetir diariamente.
6. Confira a página inicial no teste oficial de resultados avançados:
   <https://search.google.com/test/rich-results>. Use também
   <https://validator.schema.org/> para conferir todo o vocabulário Schema.org.
   Uma aplicação sem avaliações reais pode não se qualificar para um resultado
   enriquecido de software; não invente avaliações para eliminar esse aviso.
7. Abra <https://www.bing.com/webmasters/> e importe a propriedade verificada
   do Search Console, ou verifique o domínio pelo método oferecido. Envie o
   mesmo sitemap. Isso não exige alteração adicional no código do site.
8. Confira a experiência real em <https://pagespeed.web.dev/>. Os dados de
   usuários reais podem demorar a aparecer e exigem tráfego suficiente.
   Os resultados de laboratório variam conforme rede, dispositivo e execução.
9. Nas próximas semanas, acompanhe **Indexação → Páginas**, **Desempenho** e
   **Core Web Vitals**. Compare cliques, impressões, consultas e países. Foque
   inicialmente em buscas sobre NFS-e para afiliados Shopee, emissão em lote,
   relatório mensal e certificado A1. Publicação não garante uma posição ou
   um prazo de indexação.
10. Divulgue o domínio canônico nos seus canais e materiais e busque menções
    legítimas de parceiros e conteúdos de afiliados. Atualize os guias quando
    houver mudanças reais no produto ou no fluxo da Shopee. Revise orientações
    tributárias com a contabilidade antes de ampliá-las. Evite páginas quase
    iguais por município, repetição de palavras-chave e compra de links.

Não é necessário instalar Google Analytics para o Search Console funcionar.
A implementação não adiciona pixels, rastreamento ou cookies de marketing.

## Verificação técnica

`node --experimental-strip-types --test tests/seo.test.ts` cobre produção e
preview, canonical, preços anuais/mensais e serialização segura de JSON-LD.
Após `npm run build` e `npm start -- --port 3500`, execute:

```sh
SEO_AUDIT_URL=http://127.0.0.1:3500 node tests/integration/seo.mjs
```

O teste verifica sitemap, indexação efetiva de todas as URLs, canonical sem
UTMs, HTML sem depender de JavaScript, JSON-LD, headers das rotas privadas,
404 verdadeiro e dimensões da imagem social. Rode a auditoria de privacidade
do frontend para garantir que a mudança não exponha configurações.

Auditorias móveis locais com Lighthouse 12.8.2, build de produção:
SEO 100, acessibilidade 100 e boas práticas 100 nas duas execuções. Desempenho
95–96, LCP de 2,7–2,8 s, CLS de 0,007 e TBT de 50–70 ms. A imagem responsiva
reduziu a transferência total observada de 346 para 301 KiB. Esses valores
são de laboratório local, não dados de campo nem uma promessa de pontuação
na hospedagem pública.
