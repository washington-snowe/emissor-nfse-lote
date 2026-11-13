# Configuração automática para afiliados

Decisão posterior do usuário: eliminar também o clique de confirmação inicial e verificar automaticamente o A1. O padrão da aplicação é **promoção de vendas como afiliado**, prestada **no estabelecimento no Brasil**. Não é uma classificação automática de qualquer atividade econômica exercida por um MEI. Operações diferentes precisam ser personalizadas antes da revisão fiscal. A nova referência de auditoria identifica o modelo automático e não afirma que o titular marcou uma confirmação individual.

O modelo `affiliate-br-auto-v1` cria o perfil inicial do MEI após salvar a empresa ou abrir Serviço, Certificados, nota avulsa ou revisão de importação. Usa o município da empresa, código nacional 170601, regime especial 0, ISS tributável sem retenção, sem alíquota e estimativa `not_informed`. Não há digitação de parâmetros técnicos nem botão para ativar o modelo. IM, código municipal e NBS permanecem ausentes. A série inicial do aplicativo é 1, dentro da faixa oficial 00001–49999; isso não reserva número nem reinicia contadores. O modelo anterior com confirmação individual permanece compatível, sem ser o fluxo principal.

A data inicial automática é a data de abertura já cadastrada; na ausência de uma data válida, utiliza o dia atual de São Paulo. É um limite inicial de uso do modelo, não prova de opção pelo SIMEI desde a abertura. A competência continua sendo escolhida por operação e será validada na SEFIN. Perfis existentes, inclusive sua vigência, são preservados. Os limites existentes para competências de 2027 permanecem.

ME/EPP do Simples também abre Serviço e Avançado sem formulário técnico. Perfis completos existentes são reaproveitados. Para novos cadastros, o serviço vem pré-configurado, mas a tributação fica explicitamente pendente de uma fonte real dos dados da apuração. O usuário informou que ainda não tem integração contábil/tributária. Não gravar percentual zero ou uma alíquota presumida para esconder essa dependência: RN538 proíbe `indTotTrib` para ME/EPP, e o percentual de apuração não pode ser obtido somente do CNPJ. Isso impede afirmar que toda ME/EPP já pode emitir. Regime normal permanece fora do escopo.

Perfis existentes nunca são substituídos automaticamente. O modelo só cria a versão inicial, com versão esperada zero, quota e validação XSD. Uma configuração incompatível com o regime atual fica pendente de revisão. Falha de leitura do histórico não é ausência de configuração. Município ausente encaminha ao cadastro da empresa, sem adivinhá-lo. **Personalizar serviço e configurações** mantém a edição completa opcional.

## Fontes

O Anexo I oficial 1.01 de 09/02/2026 teve SHA-256 conferido: `de5bc492959eadc8bfa7540e16939995924f2188f743648eaf84d3b31e9eeb7c`. URL, linhas e textos das regras estão em [mei-affiliate.provenance.json](../integrations/nfse/mei-affiliate.provenance.json) e [automatic-affiliate.provenance.json](../integrations/nfse/automatic-affiliate.provenance.json). Série 1 e descrição padrão são escolhas da aplicação, não uma determinação de que todo MEI use esses valores.

- `MUN.INCID_INFO.SERV.`, linha 278: descrição do código 170601.
- RN144: faixa de série para aplicativo próprio.
- RN163: município emissor do MEI corresponde ao endereço no CNPJ.
- RN198: exceção MEI à exigência de IM do cadastro complementar.
- RN229: nenhum regime especial para MEI.
- RN491: ISS não retido para MEI.
- RN502: não informar alíquota de ISS para MEI, inclusive sem inventar alíquota zero.
- RN541: não informar percentual de tributos do Simples ME/EPP para MEI.

## Persistência e verificação

A aplicação autentica o dono e busca empresa/histórico no tenant da sessão. Perfil e referência são construídos no servidor, com validação do XML oficial, limites de operação e RPC transacional `save_fiscal_profile`. Uma disputa pela versão zero não sobrescreve outro perfil. A configuração automática de perfil usa a migração 8 já aplicada; a nova migração 16 é somente para o acompanhamento durável do A1.

O A1 inicia uma verificação automaticamente, descrita em [verificação automática](verificacao-automatica-a1.md). A configuração não habilita transmissão, reserva numeração, envia notas ou substitui homologação. A confirmação de revisão e o enfileiramento do lote continuam ações explícitas.

Testes locais verificam campos injetados, empresa não MEI, versões existentes, município ausente, datas inválidas, competência anterior, XSD e bloqueio de 2027. A interface real com fronteira de ação sintética é conferida em 1440, 820, 390 e 320 px, incluindo confirmação sem digitação técnica, preservação após erro, personalização, histórico e ausência de overflow. Esses testes não usam A1 real nem comprovam aceitação pela SEFIN.
