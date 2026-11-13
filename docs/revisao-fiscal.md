# Revisão fiscal do relatório

## Uso

O fluxo principal agora é **escolher CSV → revisar na própria página de importação → confirmar e emitir em homologação**. A escolha do CSV aciona a validação local e o salvamento privado do original, informado antes do upload. A página `/painel/importacoes?relatorio={id}` acompanha o processamento automaticamente e exibe o resumo e a tabela das notas previstas. O histórico abre o mesmo componente de revisão, sem a sequência antiga de preparar, salvar, abrir e confirmar em páginas distintas.

O modelo inicial de afiliados preenche tipo de comissão, referência do modelo, tomador Shopee cadastrado e uma nota por linha. Vendedores citados no arquivo não se tornam tomadores automaticamente. A data sugerida é o último dia do mês de conclusão, somente quando há um mês único e válido; meses misturados exigem ajuste. A sugestão é visível e editável: **não comprova a competência fiscal** e não muda `rows[].competence=null` no contrato da importação. Revisão anterior compatível tem suas escolhas preservadas. O titular confirma competência, tomador, valores e agrupamento no resumo antes de qualquer enfileiramento.

**Alterar dados** mantém os campos preenchidos e recolhidos, inclusive dados de exterior quando aplicáveis. Uma alteração desmarca a confirmação e exige atualizar a prévia. Não se solicita digitar uma referência de contador para usar o modelo; a referência automática identifica o modelo e a revisão pelo titular, sem afirmar orientação profissional inexistente.

Os dados disponíveis são preenchidos como candidatos. Documentos, nomes e e-mails podem ser corrigidos. Endereço estrangeiro é estruturado e obrigatório; o texto livre do CSV não é dividido por suposição. Ausência de NIF exige escolher o motivo publicado no XSD. Valores de comércio exterior são informados por linha, sem converter moedas nem repetir um valor padrão do perfil. Intermediário identificado é informado separadamente; retenção por intermediário exige seus dados.

O usuário escolhe uma nota prevista por linha ou consolidação de pessoas cujos dados completos são idênticos, dentro da mesma competência, comissão, moeda e perfil. País estrangeiro não transforma a tributação em exportação. Toda linha precisa ser preservada e válida; zeros, negativos, moeda diferente ou precisão não atendida bloqueiam preparação, sem descarte ou arredondamento automático.

A prévia automática é efêmera e tem `recipientRoleConfirmed=false`; não cria confirmação nem lote. **Confirmar e emitir em homologação** é a única ação final da interface, após marcar que revisou e autoriza o envio. O servidor relê relatório/perfil da sessão, reconstrói a prévia e compara seu digest com o exibido; só então gera snapshot confirmado, valida todos os XMLs, salva/confirma a versão e chama a RPC de enfileiramento existente. Os estados de banco permanecem distintos e auditados. Alterações posteriores invalidam preparações ainda não enviadas; operações cuja transmissão começou mantêm seu conteúdo para consulta.

A solicitação mantém UUID em retries após perda de resposta. Se o salvamento da revisão já ocorreu, a repetição reconhece o conteúdo canônico idêntico e reutiliza a revisão. Enfileirar é idempotente por revisão/solicitação, além das reservas de origem existentes. Falha entre confirmação e fila não transmite notas; a mesma solicitação pode continuar sem criar outra revisão/lote. Outra sessão com conteúdo diferente exige atualizar a prévia. A UI informa se o envio de homologação está desativado no servidor, sem apresentá-lo como nota já emitida.

## Integridade e dados

Migração `202611110009_report_reviews.sql`, posterior à migração 8. Tabelas e RPCs verificam propriedade derivada do usuário validado, perfil atual, arquivo/hash, soma exata e cobertura de cada linha uma única vez. As alocações por linha preservam também valores de comércio exterior, mesmo após consolidação. O snapshot é imutável e seu SHA-256 é calculado pelo PostgreSQL a partir da representação JSONB armazenada. A função de confirmação compara esse digest, versão atual e perfil atual sob bloqueio transacional.

Salvar dados diferentes cria nova versão. Uma versão anterior não pode ser confirmada depois disso; mudar o perfil fiscal também exige nova revisão. Repetir confirmação da mesma versão é idempotente. RLS permite somente leitura pelo dono autenticado; navegador não escreve snapshots nem confirmações diretamente. A referência fiscal é dado privado e não é copiada aos logs de auditoria, que guardam identificador do recurso/evento.

Ao reabrir uma revisão com o mesmo perfil, o formulário reaproveita os dados salvos e as alocações individuais. A caixa de conferência precisa ser marcada novamente. Mudança de perfil não reaplica valores de moeda de uma configuração antiga.

O CSV observado é um agregado mensal por loja. As chaves de origem preparadas combinam CNPJ emissor, plataforma, tipo do agregado, loja, mês de conclusão e moeda, sem usar valor ou hash do arquivo. Assim, reexportações com valores diferentes preservam o mesmo escopo. A migração 10 implementa reserva transacional desses escopos ao enfileirar e após conferir A1/acesso oficial. ID da loja continua não sendo ID de operação individual.

## Limites e verificação

- Revisão de até 500 linhas e snapshot normalizado de até 3 MB nesta etapa. Importações maiores continuam preservadas; o sistema informa o limite.
- Estrutura de até 500 XMLs verificada numa execução isolada de libxml2/WASM, com limite total de 4 MB, memória e prazo. O lote inteiro falha se qualquer XML não validar. Provas locais usam número 1 por arquivo, sem reserva de sequência, assinatura ou transmissão: nunca são documentos fiscais persistidos.
- Unitários verificam escolha explícita, identidades/endereço, ausência de arredondamento, consolidação, alocações, reexportação, dados desconhecidos e reabertura.
- Banco real: 27 asserções adicionais de isolamento, vínculo, cobertura, preservação monetária, versão, confirmação e auditoria. Oito preparações simultâneas geram uma versão; oito confirmações da mesma versão geram um registro. JWT dos testes é simulado somente no banco descartável.
- Novos unitários verificam preenchimento, prévia não confirmada, calendário da competência sugerida, digest, mudanças de perfil/dados, revisão anterior e rejeição de negativos, moedas incompatíveis e origens repetidas.
- UI usa componentes reais e ações de fronteira sintéticas: importação automática, formulário preenchido/recolhido, confirmação e envio numa ação, nonce preservado após falha, invalidação da confirmação após edição e valores visíveis no celular em 1440/820/390/320 px. Os controles completos/exterior anteriores permanecem testados. Não é prova de Auth, Vault ou homologação real.
- `UI_TOOLS_DIR=/tmp/emissor-company-ui/node_modules node --experimental-strip-types tests/integration/quick-review-actions.mjs` executa as ações/helper reais com fronteiras Auth/DB/Next/worker explicitamente sintéticas. Exercita ausência de confirmação, digest adulterado, perfil obsoleto, sessão/tenant estrangeiros, XSD inválido, falha na confirmação e perda de resposta após enfileirar: uma revisão e um lote são reutilizados. Cada leitura privada contém o tenant da sessão. O banco real separado continua cobrindo os guards e transações das RPCs.

Esta alteração reutiliza as migrações 3/8/9/10 já aplicadas; **não há nova migração**. Fila, sequência, assinatura, reconciliação, recibo e download mantêm seus guards. O contrato oficial já foi capturado; a verificação A1 automática está descrita em `verificacao-automatica-a1.md`. A homologação de uma nota e a liberação de produção continuam dependências reais; nenhum teste desta alteração enviou notas ou cobranças.
