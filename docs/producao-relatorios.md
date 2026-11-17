# Produção por relatório e DANFS-e

O usuário autorizou implementar e validar produção fiscal por relatório, ativar o DANFS-e oficial e usar o texto de e-mail fornecido. Quer trabalhar com o relatório de outubro e, depois de conferir o resultado, seguir para Stripe e reformulação integral da UI/UX. Stripe/design são etapas posteriores, condicionadas ao resultado fiscal, e não foram ativados por esta implementação.

Entrada interpretada: CSV Shopee como único fluxo de nova emissão; sem receber/importar PDFs dos afiliados e sem emissão avulsa nova. Preservar o histórico e os documentos das operações anteriores. DANFS-e deve vir do serviço oficial a partir da NFS-e autorizada, sem PDF demonstrativo ou upload de terceiros.

O relatório de outubro anexado ao workspace foi analisado somente localmente, sem transmissão. Os dados pessoais, valores financeiros e hash do original não entram neste documento público nem nas fixtures. O país do vendedor não transforma automaticamente o tomador Shopee em exportação. Mês de referência não comprova competência; a revisão final precisa apresentar a data efetiva explicitamente.

Fontes reconferidas: portal de APIs `https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao` (SHA256 `5ea78b6eb67a8f2b874bb451e4b4ebc43f3c446a30f0d22309b7a3851e73de89`) publica DANFS-e em `/danfse/docs/index.html` nos hosts ADN de cada ambiente e SEFIN produção em `/SefinNacional/docs/index`. O portal de documentação vigente continua publicando XSD produção09/02/2026; homologação usa20/10/2026. Não trocar arquivos antigos, reescrever DPS ou estender a exceção homologação404/ambiente0 para produção.

As consultas sem A1 aos três índices oficiais retornaram HTTP503. Isso não comprova indisponibilidade do serviço nem a causa do retorno. A captura efetiva dos contratos precisa ocorrer no servidor da aplicação por mTLS; espelhos GitHub são somente referência de pesquisa. Nenhum A1, senha ou chave foi disponibilizado ao executor. As chaves Vercel e a conexão administrativa Supabase continuam indisponíveis aqui. Não afirmar validação real em produção só pelos testes sintéticos.

Requisitos: ambiente explícito ligado ao digest/consentimento; prova de acesso e contrato próprios de produção; série/numeração e deduplicação separadas por ambiente; um POST no máximo por operação; reconciliação sem reenvio; originais imutáveis; DANFS-e somente por chave de documento autorizado próprio e canal oficial; XML e PDF corretos por destinatário; homologação somente para endereço de teste. Relatório real permanece sem transmissão até revisão/confirmar no aplicativo.

## Comportamento implementado

- Nova emissão somente pelo CSV mensal Shopee. O endereço antigo de nota avulsa redireciona para importação; a ação de servidor recusa novas avulsas. Documentos e operações antigos permanecem disponíveis.
- `NFSE_PRODUCTION_ENABLED=true` seleciona produção para novas revisões. Ambiente integra snapshot/digest, revisão explícita e validação XML; um formulário de homologação não autoriza produção. Homologação usa XSD20/10/2026; produção usa09/02/2026, sem editar os arquivos upstream ou originais assinados.
- Ao abrir uma revisão de produção ainda não habilitada para aquela empresa, o aplicativo consulta automaticamente o A1 e captura/confere os contratos SEFIN/DANFS-e oficiais. O diagnóstico só contém categorias e status. Essa etapa não reserva números nem transmite documentos.
- A prova de acesso fica vinculada a empresa, titular ativo, versão/hash do perfil e contrato de produção. Uma nova versão, revogação do A1 ou troca de contrato invalida a preparação. O worker renova o acesso mTLS antes de reservar identidade e consulta a DPS exata antes do único POST. HTTP200 bloqueia identidade ocupada; só404/ambiente1/E2404 compatível permite continuar; outro retorno exige conferência. Não se afirma aqui uma descrição oficial do códigoE2404 nem se estende a exceção ambiente0 da homologação.
- Confirmação real e inscrição de entrega dos documentos são atômicas. As notas autorizadas recebem links privados de XML e DANFS-e oficial. PDF é obtido por GET do ADN do ambiente, com MIME, tamanho, cabeçalho/EOF e hash conferidos; o cache é privado e imutável.
- O e-mail usa a saudação, emojis, link e assinatura solicitados. Cada vendedor recebe o XML autorizado e o DANFS-e da sua linha. O tomador fiscal e o destinatário do e-mail são vínculos distintos. Homologação segue somente para o endereço de teste.
- PDF indisponível adia a entrega antes de reservar cota/intenção de e-mail, com no máximo12 falhas consecutivas por preparação. Falha de transporte após intenção de envio nunca é repetida automaticamente. Brevo/SendPulse/Mailjet continuam sequenciais, com cotas compartilhadas300/400/200 em24h e75s persistidos no SendPulse.

## Validação local

`npm test`:165 testes passados,6 ignorados por dependerem de serviços/configuração externos. Produção sintética cobre XML e recibo assinados, isolamento de ambiente, identidade livre/ocupada/inconclusiva, reconciliação GET e envelopes divergentes. DANFS-e cobre descoberta oficial referenciada, origem, MIME, limites, PDF truncado e anexos nos três provedores.

`npm run test:db`: PostgreSQL17 real e descartável,48 verificações novas de produção/relatório/DANFS-e, além de todas as regressões anteriores. Concorrência com8 chamadas comprova1 lote,1 lease,1 número e1 intenção de POST; interrupção migra para reconciliação. Inclui confirmação/inscrição atômicas, isolamento entre donos, prova de produção independente, hash/cache imutáveis, PDF indisponível sem consumo de cota, invalidação de configuração e preservação do histórico/contadores de homologação. Todos os estados fiscais e certificados desses testes são sintéticos.

Integrações locais executam as ações, workers, preparação de documentos e adaptadores reais com fronteiras explícitas de Auth/banco/A1/HTTP sintéticas. Cobrem origem da sessão, consentimento, digest, mudança de ambiente, destinos reais versus teste, PDF antes da intenção e ausência de envio em falhas. Chromium cobre revisão de produção em3 larguras, consulta automática sem emissão e links XML/DANFS-e; regressões de revisão/conta cobrem6 larguras. O build de produção e o lint passaram.

## Ativação e conferência real

1. No Supabase SQL Editor, executar **somente** `supabase/migrations/202611170021_report_production_danfse.sql`. Não repetir migrações anteriores e nunca executar `tests/database` no banco hospedado. A21 acrescenta estado e funções, sem transmitir documentos, alterar A1 ou zerar contadores.
2. Na Vercel, ambiente **Production**, definir `NFSE_PRODUCTION_ENABLED=true`, mantendo `NFSE_EMAIL_ENABLED=true`, remetente e provedores já configurados. Publicar novamente para aplicar a variável. A flag não converte lotes/revisões antigos nem autoriza uma operação por si.
3. No Rex, abrir/importar o CSV da empresa correta. A checagem de produção roda automaticamente e continua sem emissão. Se falhar, copiar o diagnóstico de produção e conferir a etapa indicada; não criar uma nota de teste nova para contornar a falha.
4. Com acesso conferido, revisar valores exatos, competência efetiva, tomador e endereço de cada vendedor. Só a confirmação do resumo autoriza aquele lote em produção e os e-mails correspondentes. Ausência de PDF não deve gerar nova emissão; acompanhar a entrega existente.
5. Antes de Stripe/UIUX/abertura comercial, conferir a autorização no portal de produção, baixar o XML e o DANFS-e oficiais e confirmar a entrega correta dos documentos. Testes simples de e-mail anteriores e autorização em homologação não substituem esta etapa. Restauração de backup e revisão de segurança/operação continuam no roteiro de lançamento.

Desligar `NFSE_PRODUCTION_ENABLED` suspende novas preparações e e-mails de produção. Consultas de reconciliação de operações já transmitidas continuam permitidas, assim como o acesso aos documentos autorizados. Não apagar filas, provas ou originais para desfazer uma configuração.
