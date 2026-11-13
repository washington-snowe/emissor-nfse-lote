# Execução do sistema completo

Autorização atual: o usuário solicitou implementar o sistema completo, incluindo emissão, mantendo Vercel e Supabase; VPS só será considerada futuramente. A autorização cobre desenvolvimento, testes e evolução do código. Credenciais reais, ativação de cobranças e emissão de documentos reais continuam exigindo configuração e confirmação da operação correspondente, sem valores ou parâmetros fiscais presumidos.

## Consulta de homologação com o A1 cadastrado

O usuário confirmou armazenamento protegido do A1 pela aplicação e informou erro genérico ao consultar a homologação. Corrigido o transporte para usar chave/certificado PEM já validados pelo parser isolado, com cadeia intermediária em memória. Uma fixture RC2 reproduziu a incompatibilidade entre leitura do PKCS#12 e uso direto no OpenSSL do Node; não foi possível determinar a causa do A1 real a partir da mensagem antiga.

A consulta agora distingue TLS, DNS, timeout, HTTP e formato de resposta, com referências fixas sem conteúdo privado. Mantidos TLS verificado, destinos oficiais, ausência de redirecionamento e repetição automática, bloqueio de produção e consulta sem DPS. Nenhuma migração ou novo upload é necessário. Manual oficial reconferido; contrato remoto público continua vazio. Testes: 80 aprovados e seis opt-in ignorados; TypeScript, lint e build aprovados. O teste com o A1 real depende de repetir a consulta na sessão do usuário após a publicação. Ver [diagnóstico de homologação](diagnostico-homologacao.md).

## Menu da imagem, conta e Stripe

O usuário solicitou organizar funções existentes e acrescentar todas as áreas da imagem, sem API no menu. Implementados seletor de empresas próprias, navegação hierárquica/móvel, filtros por empresa e separação de Serviço/Avançado sem duplicar o perfil. Perfil, alteração autenticada de e-mail/senha e encerramento de outras sessões; autenticação em duas etapas continua removida.

O usuário definiu cinco planos, franquias 150/500/2500/5000/10000, CNPJs sem limite, preços mensais R$19,90/39,90/99,90/149,90/199,90, excedentes R$0,30/0,18/0,06/0,05/0,03, desconto trimestral exato de 33% e comissão de 20% somente no primeiro pagamento. Valores e comportamento estão em `docs/menu-conta-stripe.md` e no catálogo validado.

Stripe: Checkout, Portal, alteração de plano/cadência com confirmação, cancelamento ao fim do período, histórico por webhooks HMAC e consulta atual; isolamento test/live, leases por conta, eventos idempotentes e comissão ajustada por estorno. Consumo autorizado em produção gera registro atômico; homologação não é faturável. Excedentes usam lote com idempotência e reconciliação antes de repetir. Indicações possuem link/código próprio, vínculo único, bloqueio de autorindicação/ciclos e agregados privados. Não houve Stripe real, movimentação de fundos ou repasse de comissões pelo executor. Método de repasse e credenciais de teste dependem de configuração externa.

Migrações 13/14 encaminhadas após 307 asserções PostgreSQL e concorrência: oito ações → uma reserva de cobrança; oito claims de webhook → uma reserva; oito conclusões → um commit; oito perfis → uma versão. Testes de consumo sintético restauram a restrição fiscal de produção por rollback. 73 testes unitários aprovados e seis opt-in ignorados; build/TypeScript/lint aprovados. UI de empresas, relatórios e conta em seis larguras; planos móveis corrigidos após detectar overflow. Fronteiras Auth/Stripe/Vault/fiscal são sintéticas nos testes. Smoke local do build final aprovado: páginas públicas 200, todas as áreas da conta e emissão exigem login, worker sem segredo 401, webhook Stripe sem configuração 503/GET 405, código de indicação válido no cadastro e rastreamento sem anexos privados. Migrações remotas 13/14 e credenciais Stripe permanecem pendentes; as consultas públicas de metadados retornaram PGRST202 antes da publicação. Deploy será conferido após o push.

## Remoção da verificação em duas etapas

O usuário solicitou remover o segundo fator. Implementada remoção dos guards AAL2, telas/ações TOTP, bloqueios de certificado/perfil/revisão/avulsa/documento e item de navegação. URLs antigas redirecionam usuários autenticados ao painel. Login, verificação de usuário no servidor, propriedade, RLS, quotas, Vault e limites fiscais permanecem.

O usuário confirmou oito `true` no diagnóstico da migração 11 e aplicação sem erros de `202611120012_remove_mfa_requirement.sql`. Migrações 1–11 preservadas. Fatores antigos do Auth não são apagados; não condicionam mais o acesso. O helper agora é `SECURITY INVOKER` e deriva o tenant somente de `auth.uid()`. Capacidades não anunciam exigência de MFA.

Verificação: 61 unitários aprovados, 6 opt-in ignorados; 246 asserções PostgreSQL com 47 de acesso de senha/isolamento, incluindo conta com fator previamente verificado, dados de outra conta, RPCs, ausência de identidade e material privado. Testes concorrentes, UI em seis larguras, TypeScript/build/lint aprovados. Nenhuma nota real emitida. Publicação deste ajuste será conferida após o push; evidências anteriores abaixo registram o estado na data de cada checkpoint.

## Ordem e critérios

1. Importações duráveis: original privado, SHA-256 calculado no banco, vínculo com empresa própria, limite por conta, prevenção de reenvio concorrente e histórico. A prévia existente continuará funcionando.
2. Revisão: tomadores declarados e configuração fiscal versionados, competência confirmada, tratamento de valores e prévia rastreável. Nada é liberado para emissão por apenas haver dados cadastrais.
3. Certificados: envelope AES-GCM com chave por certificado protegida pelo Supabase Vault; chave raiz gerenciada fora do banco conforme documentação oficial. Senhas e A1 somente em memória durante uso, sem arquivos temporários. Upload bloqueado até configurar a capacidade protegida do servidor.
4. Processamento na Vercel: fila transacional no PostgreSQL, leases com token, execuções curtas e recuperação. Nenhum serviço residente ou VPS nesta etapa. Limites e precisão do Cron dependem do plano; não prometer processamento contínuo no Hobby.
5. Fiscal Nacional: documentação, XSD e contrato oficial versionados; assinatura, mTLS, consulta e reconciliação por DPS. Produção restrita primeiro. Envio incerto nunca volta diretamente para transmissão.
6. Documentos e operação: XML/PDF reais, histórico, downloads autorizados, auditoria e envio de e-mail somente após autorização fiscal comprovada e configuração de remetente/provedor.
7. Conta e comercial: recuperação/MFA, planos e pagamentos conforme provedores e condições comerciais efetivamente configurados; sem preços, assinaturas ou webhooks fictícios.

## Dependências externas atuais

- A1: usuário confirmou armazenamento protegido na aplicação. A consulta de homologação falhou com mensagem genérica; aguarda novo diagnóstico. Não enviar certificado/senha pelo chat.
- Acesso SQL administrativo não disponível ao executor; migrações remotas terão de ser aplicadas pelo SQL Editor após os testes locais.
- Neste executor há somente URL, chave pública Supabase e origem do site, sem acesso administrativo. O usuário confirmou armazenamento protegido na Vercel/Supabase; o executor não recebeu o A1 nem verificou seu material privado. Configuração do Cron e operação real continuam dependendo de evidência própria.
- Não existem amostras de TikTok Shop/Mercado Livre ou de outros layouts Shopee. Esses adaptadores dependem de evidência real.
- Provedor de e-mail, remetente, provedor de pagamentos e planos comerciais ainda não definidos.

## Evidência técnica consultada em 11/11/2026

- Portal NFS-e e biblioteca atual obtidos por HTTPS. Manual de contribuintes e pacote XSD 1.01 de 09/02/2026 localizados em links oficiais. As versões e hashes devem acompanhar o código fiscal.
- Supabase Vault: <https://supabase.com/docs/guides/database/vault>; documenta chave por projeto em sistemas seguros separados dos dados, criptografia autenticada e acesso SQL restrito.
- Duração Vercel: <https://vercel.com/docs/functions/configuring-functions/duration>; limites variam por plano/runtime/configuração. Processamento deve permanecer limitado, recuperável e independente do navegador.

Este arquivo registra execução em andamento; não é declaração de sistema completo ou homologação fiscal.

## Fila e nota avulsa Shopee

Pedido adicional: implementar fila, prevenção de duplicidade, recuperação, painel e nota individual com tomador Shopee/dados de afiliado preenchidos. O usuário confirmou a aplicação das migrações 8/9, forneceu o CNPJ tomador 35.635.824/0001-12 e informou que só terá o A1 no próximo dia. Não solicitar certificado/senha pelo chat. Identidade/endereço públicos da SHPS foram obtidos na BrasilAPI, sem QSA, com proveniência em `integrations/marketplaces/shopee-recipient.json`.

Implementados: modelos versionados, formulário que exige só valor após configuração inicial, detalhes editáveis e resumo atualizado; fila com escopos locais e reserva compartilhada após A1/acesso mTLS; contador transacional, fencing, no máximo uma intenção de POST; recuperação somente GET após incerteza; painel com dados reais, retomada/cancelamento de preparação, XML autorizado por sessão/hash; integração condicional ao contrato OpenAPI e recibo válido. Worker limitado na Vercel, relay autenticado e Cron diário. Sem VPS. Ver `docs/fila-emissao-avulsa.md`.

Migrações 10/11 encaminhadas após testes; não editar seu conteúdo nem repetir 1–9. O usuário informou falha 42P07 na 11 porque `standalone_templates` já existe. Foi encaminhada uma consulta somente de metadados, validada contra o banco descartável (oito verificações aprovadas), para distinguir aplicação anterior de estrutura incompleta. Resultado remoto ainda pendente; nenhuma tabela apagada e nenhuma migração corretiva presumida. `NFSE_HOMOLOGATION_ENABLED=false` por padrão. A ativação requer A1 real, contrato oficial capturado/compatível e teste explícito. As páginas de documentação Sefin continuaram retornando 503 sem A1; isso não prova indisponibilidade do serviço. Nenhuma nota real foi emitida e nenhum teste atestou ICP-Brasil/Vault real ou homologação.

Verificação desta etapa: 61 unitários aprovados, 6 opt-in ignorados; PostgreSQL 17 com 215 asserções e concorrência (sequência compartilhada entre dois tenants após checagem de certificado/acesso, oito cliques → um job, oito workers → uma permissão de envio, sobreposição/reexportação bloqueada). As fixtures de estado/contrato/certificado são sintéticas, somente no container. UI de avulsa/histórico aprovada em 1440/1024/820/768/390/320 px com fronteiras sintéticas, mantendo prévia/importação/MFA existentes. Build, typecheck e lint aprovados. Smoke local da versão compilada: páginas públicas 200, painel/notas/documentos redirecionam visitante para login, GET/POST do worker sem segredo retornam 401. Rastreamento inclui workers/WASM/XSD e exclui anexos privados/screenshots. Deploy deste checkpoint ainda pendente.

## Entrega de revisão fiscal

Os checkpoints de perfis/XML `ec9959e` e revisão `3e11aa6` foram publicados com sucesso na Vercel. A migração 9 não deve ser editada. O usuário confirmou a aplicação de 8/9; variáveis privadas e cadastro/consulta A1 ainda não foram verificados neste ambiente. A nova escolha de tomador Shopee é específica do modelo de nota avulsa; não substitui automaticamente a revisão dos vendedores do CSV.

Verificação desta etapa: 49 unitários aprovados e 6 opt-in ignorados; 159 asserções PostgreSQL, com concorrência de preparação e confirmação (oito concorrentes, uma versão/prova); UI em 1440/820/390/320 px, build e lint aprovados. As fronteiras de Auth/Vault/ações nos testes de UI são sintéticas. Dados reais do CSV continuam fora dos arquivos versionáveis. A consulta pública de documentação oficial retornou HTTP 200 com lista vazia novamente; não há contrato HTTP capturado para implementar o envio sem presumir campos.

Ler `docs/revisao-fiscal.md` para limites (até 500 linhas por revisão), escolhas explícitas, conservação dos valores e dependências ainda necessárias: fila fiscal, sequenciamento, reserva de escopos para reexportações, envio/reconciliação, prova de autorização e documentos. Preparar/confirmar não enfileira emissão. Produção e comercial não estão prontos.

## Checkpoint 6bf61d8

Publicado na Vercel em 11/11/2026: importação privada/fila/histórico, MFA com política de dados, A1 com envelope/Vault e consulta GET de homologação. O usuário confirmou migrações 3–7; a quarta exigiu retirar REVOKE de funções criptográficas gerenciadas. Testes de banco: 112 asserções (27+22+27+17+9+10), mais concorrência; 37 aprovações unitárias no conjunto e 6 opt-in ignorados; UI e build passaram. MFA, Vault real e A1 ainda aguardam teste no navegador do usuário. A nova consulta não emite notas.

Questão pendente ao usuário: confirmar variáveis privadas da Vercel e concluir MFA, cadastro de A1 e “Verificar acesso à homologação”. Não solicitar certificado, senha, chave de serviço ou link de confirmação pelo chat. O registro público `nfse_contract_status()` retornou `[]` na primeira consulta; aguarda documentação obtida do endpoint oficial pelo acesso mTLS do aplicativo.

Avanço seguinte: XML/DPS, assinatura/verificação, XSD isolado e perfis fiscais versionados implementados. Dependências fixadas: `xml-crypto@6.4.0`, `@xmldom/xmldom@0.9.12` e `xmllint-wasm@5.3.0`. A migração 8 foi encaminhada ao usuário após testes; não editar seu conteúdo. Tomadores, revisão versionada, envio e reconciliação continuam pendentes de integração.

Validação: 43 testes unitários aprovados, 6 opt-in ignorados; PostgreSQL: 131 asserções, além das disputas concorrentes (oito edições de perfil resultam em uma versão e sete conflitos). Interface real com fronteiras sintéticas, incluindo configuração em 1440/820/390/320 px, aprovada. Build e lint aprovados. Rastreamento da função Vercel inclui worker/WASM/XSD e não inclui attachments, Git ou screenshots. Varredura do repositório não encontrou dados reais dos vendedores do CSV.

A incompatibilidade da série tem reprodução e adaptação pontual em memória testadas, mantendo hashes dos arquivos originais. O valor em moeda estrangeira é por DPS, nunca repetido do perfil. A aceitação da política de assinatura pelo serviço oficial ainda não foi demonstrada. Ver `docs/nucleo-fiscal.md`.

Evidência do Anexo I oficial de 09/02/2026: campo 105/RN144 define série 00001–49999 para aplicativo próprio; campo 17 lista cStat 100 (gerada), 102 (judicial/administrativa), 103 (avulsa), 107 (MEI). IBSCBS: campos 46/335 indicam obrigatoriedade para Simples a partir de 2027. `dCompet` é data explícita; mês de conclusão do CSV não a determina. O XSD 1.01 contém um padrão não compatível com libxml2 em TSSerieDPS (`^0{0,4}\\d{1,5}$`): teste isolado aceita `^90000$` e recusa série numérica. Preservar upstream byte a byte; qualquer adaptação precisa ser pontual, documentada e coberta por validação de domínio conforme Anexo I. Só esse padrão usa âncoras no arquivo tiposSimples. Não esconder a incompatibilidade ou anunciar XSD/homologação completa sem teste.
