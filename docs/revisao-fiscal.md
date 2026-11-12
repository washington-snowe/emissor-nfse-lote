# Revisão fiscal do relatório

## Uso

Após a importação salva ser processada, abra seu histórico. Com MFA ativo e configuração fiscal salva, o formulário de revisão permite informar data de competência, tipo de comissão, referência da orientação fiscal e quem efetivamente é o tomador: vendedores revisados ou uma pessoa/empresa comum informada pelo usuário. Nenhuma dessas decisões é inferida do mês ou do nome da plataforma.

Os dados disponíveis são preenchidos como candidatos. Documentos, nomes e e-mails podem ser corrigidos. Endereço estrangeiro é estruturado e obrigatório; o texto livre do CSV não é dividido por suposição. Ausência de NIF exige escolher o motivo publicado no XSD. Valores de comércio exterior são informados por linha, sem converter moedas nem repetir um valor padrão do perfil. Intermediário identificado é informado separadamente; retenção por intermediário exige seus dados.

O usuário escolhe uma nota prevista por linha ou consolidação de pessoas cujos dados completos são idênticos, dentro da mesma competência, comissão, moeda e perfil. País estrangeiro não transforma a tributação em exportação. Toda linha precisa ser preservada e válida; zeros, negativos, moeda diferente ou precisão não atendida bloqueiam preparação, sem descarte ou arredondamento automático.

A prévia salva apresenta tomadores, origem, valores, competência, versão do perfil e referência da revisão. A confirmação exige marcar uma nova conferência dessa versão e é exclusiva de homologação. **Preparar ou confirmar não enfileira automaticamente.** Após a confirmação, a entrada na fila é uma ação própria, descrita em [fila fiscal](fila-emissao-avulsa.md). Alterações posteriores invalidam preparações ainda não enviadas; operações cuja transmissão já começou mantêm o conteúdo original para consulta.

## Integridade e dados

Migração `202611110009_report_reviews.sql`, posterior à migração 8. Tabelas e RPCs verificam propriedade derivada do usuário validado, perfil atual, arquivo/hash, soma exata e cobertura de cada linha uma única vez. As alocações por linha preservam também valores de comércio exterior, mesmo após consolidação. O snapshot é imutável e seu SHA-256 é calculado pelo PostgreSQL a partir da representação JSONB armazenada. A função de confirmação compara esse digest, versão atual e perfil atual sob bloqueio transacional.

Salvar dados diferentes cria nova versão. Uma versão anterior não pode ser confirmada depois disso; mudar o perfil fiscal também exige nova revisão. Repetir confirmação da mesma versão é idempotente. RLS permite somente leitura pelo dono com a política MFA aplicável; navegador não escreve snapshots nem confirmações diretamente. A referência fiscal é dado privado e não é copiada aos logs de auditoria, que guardam identificador do recurso/evento.

Ao reabrir uma revisão com o mesmo perfil, o formulário reaproveita os dados salvos e as alocações individuais. A caixa de conferência precisa ser marcada novamente. Mudança de perfil não reaplica valores de moeda de uma configuração antiga.

O CSV observado é um agregado mensal por loja. As chaves de origem preparadas combinam CNPJ emissor, plataforma, tipo do agregado, loja, mês de conclusão e moeda, sem usar valor ou hash do arquivo. Assim, reexportações com valores diferentes preservam o mesmo escopo. A migração 10 implementa reserva transacional desses escopos ao enfileirar e após conferir A1/acesso oficial. ID da loja continua não sendo ID de operação individual.

## Limites e verificação

- Revisão de até 500 linhas e snapshot normalizado de até 3 MB nesta etapa. Importações maiores continuam preservadas; o sistema informa o limite.
- Estrutura de até 500 XMLs verificada numa execução isolada de libxml2/WASM, com limite total de 4 MB, memória e prazo. O lote inteiro falha se qualquer XML não validar. Provas locais usam número 1 por arquivo, sem reserva de sequência, assinatura ou transmissão: nunca são documentos fiscais persistidos.
- Unitários verificam escolha explícita, identidades/endereço, ausência de arredondamento, consolidação, alocações, reexportação, dados desconhecidos e reabertura.
- Banco real: 27 asserções adicionais de isolamento, vínculo, cobertura, preservação monetária, versão, confirmação e auditoria. Oito preparações simultâneas geram uma versão; oito confirmações da mesma versão geram um registro. JWT/MFA dos testes é simulado somente no banco descartável.
- UI usa componentes reais e ações de fronteira sintéticas: competência e tomador vazios no início, endereço/valor estrangeiro, motivo sem NIF, dados preservados após falha, confirmação explícita e ausência de overflow em 1440/820/390/320 px. Não é prova de Auth, Vault ou homologação real.

Fila, sequência DPS, assinatura no envio, reconciliação, validação de documento e download foram implementados na etapa 10/11. Continuam pendentes a captura/compatibilidade real do contrato por mTLS, homologação com A1 e liberação comercial/produção. Não houve emissão ou cobrança real nestes testes.
