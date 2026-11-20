# Produção por relatório e DANFS-e

Novas emissões partem somente do CSV mensal Shopee, sem receber PDF de afiliado ou criar nota avulsa. O usuário autorizou implementar produção fiscal, XML/DANFS-e e a entrega por e-mail; Stripe e reformulação da interface ficam para depois da conferência fiscal real. Dados pessoais, valores e hash do relatório real não entram em Git, testes ou logs.

## Mudança da fonte do PDF

A NT008/2026 v1.02, de14/07/2026, página6, especifica geração do DANFSe pelos softwares emissores e informa a suspensão da API ADN em03/08/2026. O manual anterior ainda listava a API. A implementação anterior insistia na descoberta do contrato e depois no portal; os diagnósticos reais v1/v2/v3 continuaram com PDF403, embora o download manual funcionasse. A causa particular do403 não foi demonstrada. Esses caminhos foram retirados do fluxo normal, sem novo teste de sessão ou emissão.

Fonte oficial: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/nt-008-se-cgnfse-danfse-20260714-v1-02.pdf. A tentativa direta retornou403; foi lida uma cópia pública do PDF normativo, com hash, bytes, versão, URL do espelho e páginas em [nt008.provenance.json](../integrations/nfse/danfse/nt008.provenance.json). Isso não constitui captura autenticada de contrato API, aprovação do governo ou autorização fiscal.

`loadDanfse` gera o PDF no servidor a partir da NFS-e própria **já autorizada**. A fonte privada da migração22 vincula dono/tenant/empresa/operação/chave/ambiente, XML autorizado íntegro e snapshot original da DPS com certificado público. O servidor repete a política existente de recibo: assinatura da DPS original, XSD selecionado pelo original, emitente, chave, ambiente, status100/107, conteúdo preservado da DPS, política XMLDSIG e assinatura criptográfica da NFS-e. Falha impede geração e entrega. Não recebe XML, chave ou URL do navegador.

A geração não utiliza A1 privado, rede, portal, API do PDF ou serviço de QR. A4 em uma página, marca nacional, blocos ordenados, valores monetários com inteiros, ausências explícitas, complementos e QR de consulta nacional. O QR vetorial contém a URL exata da NT, quatro módulos de margem e símbolo mínimo1,52cm; também é clicável. Homologação traz “NFS-e SEM VALIDADE JURÍDICA” em vermelho e nome do arquivo com homologação. O XML oficial acompanha o auxiliar sem qualquer alteração.

A tipografia tem dois perfis: `nt008` usa os arquivos originais Arial Bold nos rótulos/cabeçalho e Microsoft Sans Serif regular nos conteúdos, incluindo município8pt normal e legenda QR6pt normal. Os tamanhos6/7/9pt são preservados. Os arquivos fornecidos pelo operador têm identidade, hash e flags de incorporação conferidos e permanecem fora do Git público. São obtidos de armazenamento privado no build, não durante a geração dos PDFs. A configuração completa está em [fontes-danfse.md](fontes-danfse.md). Não se afirma licença ampliada por inspecionar metadados.

Enquanto o build privado não for configurado, `portable` mantém Liberation Sans com a diferença explícita de família. No perfil `nt008`, arquivo ausente, adulterado, família incorreta ou restrição de incorporação interrompe o build; não há troca silenciosa por fonte equivalente. Não declarar tipografia exata no ambiente publicado antes da ativação do perfil e da confirmação no diagnóstico. Caracteres sem glifo bloqueiam o PDF. Textos longos podem usar reticências conforme a NT; originais completos permanecem no XML. O canhoto opcional é suprimido, ampliando complementos. Nenhum benefício, tributo ou alíquota é inferido para preencher ausência.

PDF oficial anteriormente baixado e íntegro continua disponível no cache privado imutável, com hash conferido. O PDF local é gerado em memória e não é rotulado como download governamental, nem associado a um contrato ADN fictício. O botão passa a ser **Baixar DANFS-e**. **Conferir DANFS-e** gera diagnóstico v4 com categorias fixas, sem cookies, chave, XML, certificado ou segredo; não altera estado fiscal, fila, cache ou preparação de produção.

## Produção e entrega

`NFSE_PRODUCTION_ENABLED=true` seleciona produção para novas revisões; não converte homologação nem autoriza envio sozinho. Ambiente faz parte do snapshot, digest, validação, numeração e consentimento. Homologação usa XSD20/10/2026; produção mantém09/02/2026. Não reescrever arquivos upstream, DPS antigas ou estados incertos. O mês do relatório sugere competência; a data efetiva, tomador e destinatários precisam ser revisados. Vendedor estrangeiro não implica exportação.

`nfse-production-v4` confere automaticamente A1/titular ativo, perfil, contrato SEFIN de produção capturado e HEAD da DPS própria documentado. HEAD200/404 vazio, formato e destino oficiais continuam sujeitos ao contrato; GET com ambiente0 nunca é convertido em produção. Em seguida confere os recursos/gerador local e grava readiness vinculada ao hash da NT na migração22. Falta da migração ou falha do gerador bloqueia a preparação. A antiga API suspensa deixa de ser requisito. A1/perfil/contrato alterado invalida a preparação; nenhum autoteste prova autorização de uma nota.

O worker renova transporte mTLS antes da reserva e consulta a identidade exata antes da intenção única de POST. Resposta incerta só permite reconciliação. Revisão final autoriza atomicamente o lote real e a entrega aos vendedores exibidos. PDF não é autorização fiscal e não altera numeração. Desligar a flag suspende novas preparações/e-mails reais; reconciliação e documentos anteriores continuam disponíveis.

O POST201 de produção da SEFIN1.6.0 pode apresentar uma identidade de envelope que não reproduz a DPS original. Esse retorno não autoriza a nota. Com ambiente numérico1 e essa versão exata, o worker consulta imediatamente a DPS original assinada e depois a NFS-e pela chave retornada nessa consulta, reaproveitando a mesma validação completa da reconciliação. Não normaliza a identidade, não usa a chave/XML daquele POST nem repete o envio. Falta de orçamento ou prova mantém o resultado incerto. Evidência sanitizada e limites em [production-created-reconciliation.provenance.json](../integrations/nfse/production-created-reconciliation.provenance.json).

Cada entrega inclui XML autorizado e DANFS-e da mesma nota. Tomador fiscal e endereço de entrega são vínculos distintos. Homologação vai somente ao endereço de teste configurado. O texto conserva a saudação, emojis, link e assinatura solicitados pelo usuário. Brevo300/dia, SendPulse400/dia com75s persistidos e Mailjet200/dia continuam em fila sequencial, com cotas compartilhadas e troca após402/429 explícitos. Documento indisponível adia a entrega antes da intenção/cota; resultado incerto de envio não é repetido automaticamente. Nada nesta mudança envia e-mail ou nota pelo executor.

## Ativação e conferência

As migrações21 e22 foram confirmadas pelo usuário sem erros e não devem ser repetidas. A22 corresponde a `supabase/migrations/202611180022_local_danfse_nt008.sql`. A22 é aditiva e não altera A1, originais, contadores ou estados fiscais; não envia documentos. A conexão administrativa Supabase não está disponível ao executor. Nunca executar `tests/database` no banco hospedado.

A conferência seguinte, ainda pendente, é baixar o DANFS-e da **mesma nota de homologação já autorizada**, sem criar teste novo. Conferir dados, aviso de homologação e QR. Somente se falhar usar diagnóstico v4. Com o PDF conferido, abrir o relatório existente e aguardar a checagem automática de produção. Revisar competência, valores, tomador e e-mails; somente a confirmação no aplicativo autoriza emissão real daquele lote.

Antes de Stripe/UIUX/acesso comercial, conferir o resultado no portal de produção e a entrega correta de XML/PDF, além de restauração de backup e revisão de segurança/operação. A autorização em homologação e os testes de e-mail anteriores não comprovam essa etapa. Nenhuma emissão real foi realizada pelo executor nesta mudança.

## Verificação da implementação

Os testes usam identidades/assinaturas sintéticas e fronteiras explícitas de Auth/DB/A1/HTTP. Cobrem renderização A4 de uma página, leitura do QR a partir do PDF rasterizado, valores exatos, ausência de tributos, regras PIS/COFINS da NT, textos longos, aviso de homologação, adulteração de XML/DPS/certificado e diagnóstico sanitizado. Integração executa verificador XSD/assinaturas e gerador reais, sem HTTP ou A1 no download. Banco PostgreSQL17 descartável verifica isolamento, falta de provas, especificação desconhecida, geração após troca de A1, cache anterior e concorrência de lote/numeração/POST. Testes Chromium cobrem revisão/consentimento e links privados; lint, tipos e build são conferidos antes da publicação. Resultados finais ficam registrados nas instruções de engenharia após execução.


Decisão posterior sobre fontes: sem licença de servidor/PDF para as fontes proprietárias, o usuário dispensou essa preocupação se ela não for necessária à validade fiscal. Manter a fonte livre e não contratar licença ou afirmar identidade tipográfica. A fonte do auxiliar não altera a assinatura/autorização SEFIN do XML; a exigência expressa de tipografia na NT permanece registrada e impede declarar conformidade integral do PDF. Nenhuma mudança de código, flag ou estado fiscal foi feita por essa decisão.


Atualização posterior à decisão de manter fonte equivalente: o usuário voltou a solicitar as famílias exatas e enviou Arial e Microsoft Sans Serif. O perfil privado foi implementado e testado com esses arquivos. Não há nova migração;22 já foi confirmada. A instalação privada no Supabase/Vercel é etapa de configuração do operador, separada da emissão fiscal e de qualquer nova licença.


Ativação das fontes concluída com os acessos disponibilizados pelo usuário: bucketdanfse-fonts privado, dois hashes conferidos e acesso público recusado; Production da Vercel configurada emperfilnt008/origemsupabase e nova implantaçãoREADY da revisão8c8a366. O log confirmou a preparação das fontes exatas. Não pedir para repetir a instalação manual ou22. A verificação do PDF real na sessão do usuário e a validação de emissão fiscal real continuam etapas separadas; nenhuma nota/e-mail foi enviada por essa configuração.
