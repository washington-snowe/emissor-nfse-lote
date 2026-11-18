# Fontes do DANFS-e

O perfil `nt008` usa **Arial Bold** nos títulos/rótulos e **Microsoft Sans Serif regular** nos conteúdos. A NT008/2026 v1.02 exige essas famílias no item2.4. O município usa8pt normal e a legenda sob o QR6pt normal, também em Microsoft Sans Serif. O gerador incorpora as fontes no PDF; não depende das fontes instaladas no computador de quem recebe o documento.

Os arquivos foram enviados pelo operador e conferidos com fontkit, SHA256 e flags OS/2: Arial-BoldMT/Bold e MicrosoftSansSerif/Regular, ambos com incorporação editável e subsetting permitidos. Identidade e flags não comprovam por si uma licença para uso no servidor. O usuário autorizou o uso; nenhuma licença foi comprada pelo executor. Dados e hashes em `integrations/nfse/danfse/nt008.provenance.json`.

O GitHub é público. Os TTF/ZIP proprietários ficam em `.private/`, ignorado pelo Git, e **não** em `public/` ou no repositório. O build baixa apenas os dois arquivos fixos de um bucket privado e os inclui na função da Vercel. Não há fonte ou URL indicada pelo cliente, instalação de fonte no sistema, envio de certificado, novo SQL ou contato com a SEFIN. Cache e arquivos são recursos globais de tipografia, não documentos de clientes.

## Ativação pelo operador

O executor não possui conexão administrativa Supabase nem token Vercel. Depois da publicação testada:

1. No **Supabase → Storage**, criar o bucket **`danfse-fonts`**, com **Public bucket desativado**. Não criar políticas de leitura/escrita para usuários da aplicação. Pode usar limite de arquivo2MB; cada arquivo fornecido tem menos de1MB.
2. Extrair o pacote preparado no workspace `.private/rex-danfse-fonts.zip` e enviar os dois arquivos diretamente na raiz do bucket, com os nomes exatos **`arialbd.ttf`** e **`micross.ttf`**. Não enviar o ZIP ao bucket. O pacote contém apenas os arquivos originais necessários; não inclui dados fiscais ou A1.
3. Na **Vercel → projeto → Settings → Environment Variables**, definir **`DANFSE_FONT_PROFILE=nt008`** para **Production**. A origem padrão das fontes é Supabase; não definir `DANFSE_FONT_SOURCE=local` na Vercel. As variáveis Supabase de servidor já utilizadas pela aplicação são reaproveitadas; não colar chaves no chat.
4. Fazer **Redeploy** da última versão. O comando `npm run build` prepara as fontes antes de compilar o Next. Bucket público, arquivo ausente/adulterado ou restrição de incorporação faz o build falhar com categoria fixa, sem expor credenciais. O deploy anterior continua sendo a versão vigente se o novo build falhar.
5. Na mesma NFS-e de homologação já autorizada, baixar novamente o DANFS-e. O diagnóstico v4 informa: **“Tipografia: Arial Bold nos títulos; Microsoft Sans Serif nos conteúdos.”** Não emitir outra nota para testar fonte.

A configuração não altera XML, assinatura fiscal, operação, certificado, destinatário, numeração ou filas. A migração22 já foi confirmada e não deve ser repetida. Os arquivos são lidos localmente pelo runtime: não há dependência da disponibilidade do Storage durante a geração do PDF.

## Verificação local

A pasta privada é montada a partir dos arquivos fornecidos, sem versionar seus bytes. Com ela disponível:

```sh
DANFSE_FONT_PROFILE=nt008 DANFSE_FONT_SOURCE=local npm run build
DANFSE_FONT_PROFILE=nt008 DANFSE_FONT_TESTS=true node --experimental-strip-types --test tests/local-danfse.test.ts tests/danfse-fonts.test.ts
DANFSE_FONT_PROFILE=nt008 UI_TOOLS_DIR=/tmp/emissor-company-ui/node_modules node --experimental-strip-types tests/integration/production-documents.mjs
```

`pdffonts` confere Arial-BoldMT e MicrosoftSansSerif incorporadas; o QR é decodificado do PDF rasterizado. Textos longos e blocos completos permanecem em uma página A4. A prova completa com XML/assinaturas usa somente identidades sintéticas. Testes de preparação usam adaptador Storage privado sintético; não acessam o projeto remoto. Sem os TTF privados, os testes específicos dos arquivos do operador ficam opt-in; a lógica de perfil, integridade, restrições, ausência de fallback e recusa de bucket público continua coberta em qualquer checkout.

`portable` permanece o padrão até a configuração acima, com diferença tipográfica explicitada no diagnóstico. Mudar para `nt008` não afirma conformidade integral do restante do DANFS-e nem comprova uma emissão real; isso depende dos demais controles e da conferência do documento autorizado.
