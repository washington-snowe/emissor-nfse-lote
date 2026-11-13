# Diagnóstico de acesso com A1

O usuário confirmou o armazenamento protegido de seu A1 pela aplicação e informou falha na consulta de homologação. Depois do ajuste de TLS, a nova tentativa retornou `NFSE_HTTP_404`. Isso mostra uma resposta HTTP, sem provar que o certificado foi aceito pelo serviço fiscal. O executor não recebeu certificado ou senha, não consultou o material privado e não transmitiu DPS.

## Ajuste após o HTTP 404

O portal publica um link de documentação com `/API/SefinNacional`, mas os clientes de integração consultados usam `/SefinNacional`. O manual oficial confirma o caminho relativo de parâmetros, sem resolver essa divergência do prefixo. A base configurada de homologação passa a `https://sefin.producaorestrita.nfse.gov.br/SefinNacional`, mantendo o mesmo host oficial, TLS e o caminho de consulta. A confirmação exige repetir o GET com o A1 pela aplicação. Fontes oficiais e referências secundárias estão identificadas separadamente em `integrations/nfse/access-provenance.json`; não tratar exemplos de terceiros como homologação fiscal.

A descoberta de documentação agora lê `discoveryPaths: arrayFrom(...)` do Swashbuckle, além de `url`, configuração JSON serializada e inicializador referenciado. Não executa JavaScript, não consulta URLs externas nem troca de ambiente. Alterna somente os nomes fixos `docs/index` e `docs/index.html` quando há 404/redirecionamento, com prazo e número de consultas limitados. `basePath` declarado incompatível mantém o contrato indisponível.

O aviso do painel diferencia documentação pendente e falha ao armazenar a documentação capturada. A migração **15**, `202611130015_nfse_canonical_source.sql`, permite registrar a URL real no prefixo sem `/API`, preservando o reconhecimento das fontes históricas. Ela altera somente a validação da origem documental e os privilégios da função de servidor; não altera A1s, usuários, documentos ou dados fiscais e não habilita emissão. Depende da estrutura da migração 7, já confirmada, e não exige repetir 1–14.

## Correção

O parser isolado já entrega chave e certificado PEM após verificar senha, titular, validade e correspondência da chave. A conexão agora usa esse material em memória, sem reabrir o PKCS#12 no OpenSSL do Node. Isso evita uma incompatibilidade reproduzida com PFX sintético cujo certificado usa RC2: o parser aceita, mas `createSecureContext({pfx})` no Node 24/OpenSSL 3 recusa o contêiner. Não é evidência de que o A1 do usuário usa esse formato.

O worker retorna também a cadeia do cliente em ordem: folha e intermediárias ligadas por emissor e assinatura, excluindo raiz e certificados alheios. Nenhuma raiz do upload vira autoridade de confiança do servidor. O certificado folha continua separado para assinatura e verificação de DPS. Não há arquivos temporários, provedor criptográfico legado ou redução de segurança TLS no runtime. A conversão por OpenSSL no teste usa somente fixtures sintéticas em memória.

Erros síncronos e assíncronos são convertidos em categorias fixas. Mensagens originais, corpo de resposta, certificado, chave, CNPJ e senha não são incluídos no diagnóstico. A consulta permite até 15 segundos; requisições fiscais continuam sem repetição automática ou redirecionamento. TLS exige verificação do servidor e versão mínima 1.2. Produção permanece bloqueada.

| Referência | Interpretação |
| --- | --- |
| `NFSE_CERTIFICATE_FORMAT` | Falha ao preparar o material criptográfico para transporte. |
| `NFSE_CLIENT_CERTIFICATE` | Alerta TLS do serviço sobre o certificado apresentado; conferir cadeia/aceitação. |
| `NFSE_SERVER_CERTIFICATE` | Falha ao verificar o certificado do servidor; não desabilitar TLS. |
| `NFSE_TLS` | Outra falha de negociação TLS. |
| `NFSE_DNS` / `NFSE_CONNECTION` / `NFSE_TIMEOUT` | Falha de resolução, conexão ou prazo da consulta. |
| `NFSE_HTTP_401` / `NFSE_HTTP_403` | Consulta recusada; não comprova, sozinha, falta de credenciamento. |
| `NFSE_HTTP_404` | Consulta de parâmetros não localizada; conferir rota/disponibilidade antes de concluir sobre cadastro. |
| `NFSE_HTTP_429` | Limite do serviço; aguardar antes de repetir. |
| `NFSE_HTTP_5xx` | Falha temporária informada pelo serviço. |
| `NFSE_INVALID_RESPONSE` | Retorno não reconhecido, inclusive 2xx com HTML, array ou JSON nulo. |
| `NFSE_RESPONSE_RECEIVED` | Resposta JSON recebida; não comprova autorização para emitir. |

A correção inicial de TLS não exigiu migração. O ajuste posterior de origem documental exige somente a **15** para registrar uma captura com o prefixo novo. Não é necessário recadastrar o A1. Após aplicar/publicar, repetir uma vez **Verificar acesso à homologação** na própria conta e informar a mensagem/referência e o aviso de documentação. O sucesso do transporte não libera envio: contrato oficial compatível, perfil fiscal e homologação explícita continuam necessários. `NFSE_HOMOLOGATION_ENABLED` não precisa ser alterada para esta consulta GET.

## Evidência oficial

O Portal Nacional mantém o link Sefin de produção restrita e o manual dos contribuintes descreve `GET /parametros_municipais/{codigoMunicipio}/convenio` dentro do Emissor Público Nacional. O caminho relativo foi preservado; o ajuste de prefixo está explicado acima. Fontes e hashes estão em `integrations/nfse/access-provenance.json`. As páginas Swagger consultadas sem A1 neste executor retornaram 503/reset; isso não prova indisponibilidade da consulta autenticada na Vercel. A RPC pública de estrutura de contrato retornou lista vazia após o HTTP 404 informado pelo usuário; não houve captura oficial válida neste diagnóstico.

## Validação

Testes sintéticos reproduzem o PFX legado, preparam o contexto TLS com PEM, conferem cadeia intermediária e exclusão de raiz/certificados alheios, sanitização de erros, distinção de HTTP/JSON/TLS e preservação de destinos, verificação TLS, ausência de redirecionamento e repetição após timeout. Esses testes não comprovam ICP-Brasil nem acesso do A1 real ao serviço oficial.

Resultado inicial do TLS: 80 testes aprovados e seis opt-in ignorados, sem alteração SQL. Após o ajuste de prefixo/descoberta: 84 testes aprovados e seis opt-in ignorados; 315 asserções PostgreSQL e testes concorrentes; interface real do aviso com fronteira sintética em 1440/390/320 e regressão dos fluxos existentes; TypeScript, lint e build aprovados. A migração 15 foi encaminhada após esses testes; aplicação remota ainda aguarda confirmação do usuário.
