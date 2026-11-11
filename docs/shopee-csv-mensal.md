# Shopee — CSV mensal por vendedor, adaptador versão 1

## Evidência e alcance

O usuário forneceu um CSV real de outubro de 2026 e confirmou que a origem é Shopee. A análise local identificou UTF-8 com BOM, separador vírgula, 12 colunas e 38 registros: 34 com CNPJ e 4 com identificação fiscal estrangeira. O país informado nessas últimas linhas é `CN`. Não há linha de total geral no arquivo. Um cálculo independente com `csv`/`Decimal` do Python e o adaptador TypeScript produziram o mesmo total, sem arredondamento. Isso confere as linhas deste arquivo; não concilia com pagamentos ou notas externas.

O original permanece no diretório de anexos, fora do checkout, e não integra fixtures, logs ou screenshots de interface. A fixture reduzida `tests/fixtures/shopee-seller-monthly-v1.csv` preserva cabeçalhos e estrutura, com nomes, identificadores, endereços, contatos e valores substituídos por dados sintéticos. Não copiar o original para Git ou arquivos públicos.

Este adaptador reconhece **somente esse layout mensal por vendedor**. Não é suporte geral à Shopee, nem adaptador de pedidos, pagamentos, campanhas, XLSX ou PDF. A origem confirmada pelo usuário e o reconhecimento do cabeçalho não autenticam a procedência de qualquer arquivo futuro.

## Mapeamento observado

Cabeçalhos exigidos exatamente nesta ordem:

| Coluna | Tratamento |
| --- | --- |
| `Mês de conclusão` | Mês de referência de origem em `reportedSellers[].referencePeriod`. `Oct 2026` vira `2026-10`; não define competência fiscal. |
| `Nome da loja` | Nome da loja informado, como texto. |
| `ID da Loja` | Identificador da loja como string, preservando zeros e números maiores que o limite seguro de JavaScript. Não é ID de operação. |
| `Comissão Total do Vendedor` | Valor BRL explicitamente sinalizado por `R$`, com vírgula e duas casas. Convertido para string decimal exata com ponto, sem float. |
| `CNPJ do Vendedor` | Identificação declarada no arquivo; preservada como string. Não é CNPJ emissor nem prova de tomador fiscal. |
| `CPF do Vendedor` | Identificação declarada; preservada quando presente. A amostra não contém CPF; a preservação foi exercitada com dado sintético, não homologada em outro layout real. |
| `Identificação Fiscal Estrangeira` | Identificação declarada, sem converter em CNPJ/CPF ou classificar exportação de serviço. |
| `Razão social do vendedor` | Texto informado. |
| `Endereço do Vendedor` | Texto completo informado, incluindo endereço entre aspas e multilinha quando válido no CSV. Não tenta dividir endereço estrangeiro por regras brasileiras. |
| `País do Vendedor` | Código declarado de duas letras maiúsculas, ou ausência. Sem inferir nacionalidade por documento. |
| `Inscrição Estadual` | Texto informado, preservando zeros. |
| `E-mail` | Texto informado; não é endereço verificado nem autorização para enviar mensagem. |

`parseShopeeSellerCsv(bytes)` é assíncrona por usar Web Crypto para SHA-256 dos bytes originais, incluindo BOM. Usa `csv-parse@7.0.3` (MIT), fixado no lockfile com integridade; a distribuição para navegador é a mesma exercitada nos testes Node. Não há avaliação de fórmulas, HTML ou instruções contidas nas células.

Saída: `data.review` contém o contrato comum validado, totais e pendências; `data.reportedSellers` preserva os campos dos vendedores, ligados a cada linha por `location.row`. Esse número é o ordinal lógico do registro CSV, incluindo o cabeçalho como 1. Em campos multilinha, não equivale à linha física de texto. A associação permanece na mesma ordem e é testada.

`reportedRecipient` recebe uma referência prefixada por `cnpj:`, `cpf:` ou `foreign:` apenas quando uma única dessas identificações é informada. Ausência ou múltiplas identificações deixam a referência em `null`; todos os campos declarados continuam preservados em `reportedSellers`. Presença de documento, sintaxe ou dígito não comprovam tomador correto, registro cadastral válido ou elegibilidade fiscal. Nenhuma consulta a CNPJ de vendedores é feita nesta entrega.

`externalId`, `competence` e `commissionType` ficam em `null`: o arquivo não identifica operações individuais nem tipos de comissão e não estabelece competência tributária. As 38 linhas do original permanecem separadas e produzem 114 pendências estruturais nesses três campos. Identificação fiscal repetida em lojas diferentes não provoca união ou descarte. `fiscalStatus` permanece `not_evaluated`.

## Limites e erros

- Até 512 KiB de bytes e 10.000 registros de vendedores. O parser lê no máximo uma linha excedente para detectar o limite, recusando o relatório inteiro; não aceita truncamento como importação parcial.
- UTF-8 estrito, com BOM opcional; vírgula como separador; cabeçalhos e quantidade de colunas exatos. Aceita LF/CRLF e aspas escapadas. Linha vazia no meio, CSV incompleto, coluna extra ou layout desconhecido recusam o arquivo.
- Limite de 8.192 caracteres internos por registro no parser e limites próprios por campo. Endereço até 1.000 caracteres, identificação estrangeira até 128 e e-mail até 254, sem truncar dados.
- Meses em abreviação inglesa de três letras e ano de quatro dígitos. O teste real cobre `Oct 2026`; demais meses seguem o mesmo contrato de formato, sem alegação de amostras reais adicionais.
- Valores no padrão `R$14,28`, com suporte sintético testado para `R$-1,10` e `R$0,00`. Não aceita separador de milhar, outras casas decimais ou formatos presumidos. Esses casos precisam de amostra e revisão do adaptador, sem remover pontuação arbitrariamente.
- Erros retornam códigos fixos, ordinal e nome de campo conhecido quando aplicável. Mensagens internas do parser não saem para UI/logs, pois podem conter dados do arquivo. Uma linha inválida impede qualquer total parcial.

## Prévia no painel

Rota: `/painel/importacoes`, acessível por “Relatórios” na navegação e “Conferir relatório” na visão geral. O servidor exige sessão e tenant e consulta apenas empresas próprias, sob RLS. Sem empresa, o componente direciona ao cadastro; havendo uma única empresa, ela é selecionada. O CNPJ emissor vem da empresa cadastrada e não é inferido de um vendedor no CSV.

O usuário escolhe um arquivo local e pede conferência. A leitura e o processamento limitado deste CSV pequeno ocorrem no navegador, sem upload, rede, Storage, gravação no banco ou job. A tabela e os totais derivam do arquivo escolhido, com acesso aos dados declarados de cada vendedor. Trocar empresa/arquivo invalida a prévia; “Limpar arquivo” descarta resultado e seleção. Uma leitura atrasada não restaura dados já descartados. Não há persistência implementada pelo aplicativo, confirmação fiscal, cálculo tributário ou emissão.

Os dados permanecem na memória da página durante a conferência. Nomes e valores entram na UI como texto React, sem HTML bruto, links automáticos, fórmulas ou interpretação de instruções. Não há envio de e-mail nem chamadas externas para completar vendedores. O digest calculado no cliente não deverá ser confiado por uma futura API de persistência: o servidor/worker terá de recalcular hash e interpretação a partir de bytes autorizados.

Esta prévia local não substitui a arquitetura planejada de importação persistente: Storage privado, autorização de objetos, proteção contra reimportação, workers isolados para arquivos maiores/OCR e regras fiscais continuam pendentes. Não processar esses fluxos longos em uma requisição Vercel.

## Verificações

- Arquivo original: 38 registros preservados, mesmo total entre Python Decimal e TypeScript, 34 CNPJs e 4 identificações estrangeiras preservados, mês de referência `2026-10`, nenhuma competência/ID de operação/tipo inventados. Executado localmente, sem gravar o original no repositório.
- Sete testes novos do adaptador: fixture reduzida anonimizada, SHA-256, IDs textuais, identidades repetidas/ambíguas, UTF-8/BOM, CRLF/aspas/multilinha, negativos/zero, erros sem vazamento, formatos desconhecidos e limites de bytes/linhas/campos. Casos ausentes na amostra real estão identificados como testes sintéticos.
- Suíte unitária: 28 passaram, 6 opt-in ignorados, zero falhas. TypeScript, lint, build de produção e `git diff --check` passaram. Uma verificação dos arquivos versionáveis não encontrou nomes, IDs, documentos, endereços ou e-mails do relatório original.
- UI Chromium: fluxo real de seleção e interpretação da fixture em 1440, 1024, 820, 768, 390 e 320 px; total exato, foco no resultado, ausência de transbordamento da página, nenhum upload ou chamada a terceiros. A tabela tem rolagem horizontal própria no celular. Passaram também troca de empresa, detalhes estrangeiros, limpeza, leitura cancelada, erro de layout/tamanho, recarga e ausência de empresas. Os dados de empresa do harness são sintéticos; não comprova uma sessão real da rota.
- A primeira execução do teste de foco falhou porque o resultado ainda não havia montado no frame agendado. Foi corrigido com foco após o commit React e o teste completo passou. A revisão das screenshots encontrou também o token `--bg` ausente usado pelo hover da camada de movimento; o alias foi adicionado sem alterar os arquivos da skill e recebeu verificação de fundo visível no teste.
- O teste de UI de empresas também passou novamente em todas as seis larguras, incluindo preenchimento, revisão, salvamento simulado, fallback manual e respostas atrasadas, após a alteração da navegação e da cor compartilhada.
- O servidor Next de produção local redirecionou visitantes sem sessão de `/painel/importacoes` e `/painel/empresas` para `/entrar` com cache `private, no-store`. A primeira asserção do smoke precisou aceitar o cabeçalho de redirecionamento relativo, válido em HTTP; o teste corrigido passou, sem alteração de código de aplicação. A nova rota ainda não foi homologada com sessão real na Vercel.
- Nenhum novo gate visual é declarado PASS; mantém-se a limitação registrada na fundação. Não houve teste de persistência/Storage/worker, pois não existem nesta etapa. Os testes de banco não foram repetidos: nenhuma migração ou escrita foi adicionada.

Reproduzir UI com as versões e instalação isolada descritas em `docs/cadastro-empresas.md`:

```sh
UI_TOOLS_DIR=/tmp/emissor-company-ui/node_modules node tests/ui/run-report-ui.mjs
```

Antes de habilitar emissão, ainda são necessárias evidência normativa, competência fiscal, tipos de comissão, resolução de tomador por modalidade, revisão versionada e idempotência transacional. O arquivo fornecido destrava somente a leitura deste layout e sua conferência.
