# Importação de comissões — contrato interno e revisão

Este documento registra a fundação do contrato interno. O fluxo atual de upload privado, revisão preenchida na página de importação e confirmação/enfileiramento numa ação está em [revisão fiscal](revisao-fiscal.md). As funções puras deste contrato continuam sem conceder autorização fiscal nem inferir competência ou tomador.

## Escopo desta etapa

Início da Fase 2: contrato interno versionado, validação de saída dos adaptadores e resumo financeiro para conferência. Implementação em `src/lib/imports.ts`; testes em `tests/imports.test.ts`. A evolução seguinte adicionou um adaptador e prévia local para um CSV real mensal por vendedor da Shopee; detalhes em [Shopee CSV mensal](shopee-csv-mensal.md). Não há upload, persistência, job ou OCR.

A especificação mestre exige estudar os formatos reais antes de implementar os importadores. O CSV Shopee fornecido pelo usuário foi analisado fora do checkout; uma fixture reduzida com seus cabeçalhos e dados inteiramente substituídos está no repositório. TikTok Shop e Mercado Livre permanecem origens previstas sem adaptador. As fixtures de `tests/imports.test.ts` continuam sendo apenas objetos sintéticos do contrato interno.

## Contrato versão 1

`reviewCommissionReport(input)` recebe um objeto desconhecido e devolve dados normalizados com resumo e pendências, ou erros com caminho do campo. Uma linha inválida rejeita o relatório inteiro e impede resumo parcial. A lista de erros é limitada aos primeiros 100; isso não libera as demais linhas. Campos fora do contrato são descartados.

| Campo | Significado e validação |
| --- | --- |
| `contractVersion` | Exatamente `1`; versão desconhecida é recusada. |
| `source.platform` | `shopee`, `tiktok_shop` ou `mercado_livre`; origem declarada pelo adaptador. |
| `source.format` | `csv`, `xlsx` ou `pdf`; nenhum desses arquivos é lido por esta função. |
| `source.fileSha256` | Digest hexadecimal de 64 caracteres minúsculos. A função valida o formato; o futuro serviço responsável pelo arquivo deverá calcular e conferir o hash dos bytes, sem confiar em hash enviado pelo navegador. |
| `source.adapterId`, `adapterVersion` | Identificação e versão do adaptador produtor para rastrear como o arquivo foi interpretado. Não comprovam que esse adaptador esteja homologado. |
| `rows[].location` | Registro/linha de origem, começando em 1; XLSX exige também planilha e PDF exige página. PDF usa `row` como ordinal do registro na página. Localização repetida é recusada; mesmo número em planilhas ou páginas diferentes é aceito. |
| `rows[].externalId` | Identificador da operação conforme a origem, ou `null` quando ausente. IDs repetidos são preservados: não existe evidência suficiente para presumir duplicidade de negócio. |
| `rows[].competence` | `AAAA-MM` ou `null`. Não é inferida de data de pagamento, upload ou relógio atual. A semântica fiscal do período ainda exige regra validada. |
| `rows[].currency` | Três letras maiúsculas ou `null`. Validação sintática, sem conversão cambial, sem moeda padrão e sem prova de que o código é uma moeda ISO vigente. |
| `rows[].amount` | String decimal com ponto, sinal negativo opcional e precisão preservada; nunca `number`. Não aceita separadores de milhar, símbolo monetário ou notação científica. |
| `rows[].commissionType` | Tipo informado pela origem, ou `null`. Não define regra fiscal por si só. |
| `rows[].reportedRecipient` | Referência informada no relatório, ou `null`. Não confirma o tomador fiscal; um vendedor citado no relatório não se torna tomador automaticamente. |

Campos anuláveis precisam usar `null` explicitamente. Campo omitido ou string vazia é erro de contrato. Isso distingue ausência conhecida de erro na implementação do adaptador. Valores válidos não são truncados nem corrigidos silenciosamente.

Limites de recurso desta versão: 10.000 registros; linha até 1.000.000; página até 100.000; nome de planilha até 120 caracteres; ID e referência até 200; tipo de comissão até 120; valor individual até 18 algarismos inteiros e 12 decimais. Esses limites são do produto, não regras das plataformas. Layouts que os excedam precisam de revisão, sem descarte ou arredondamento automático.

## Valores, totais e pendências

`canonicalAmount` valida strings e remove apenas zeros decimais finais e o sinal de zero. A soma usa inteiros `BigInt` com escala fixa de 12 casas internamente. A saída volta a ser string decimal, inclusive quando a soma ultrapassa o limite inteiro de uma linha. Nenhum `BigInt` sai no objeto JSON, e nenhum valor financeiro passa por `Number`, `parseFloat` ou arredondamento.

`totals` contém total e quantidade de linhas por moeda informada, incluindo valores negativos e zero. Linhas sem moeda permanecem no relatório, recebem pendência e não entram em nenhum total monetário. Ausências de ID, competência, moeda, tipo e referência do destinatário geram pendências localizadas por índice de linha; valores não positivos também exigem revisão. Negativo não é convertido automaticamente em estorno, nem zero é descartado.

Esses totais conciliam os valores do arquivo para conferência. Não são bases de NFS-e: podem conter competências, tipos e referências de destinatários distintos. As linhas continuam separadas. Não há agrupamento fiscal, confirmação, alocação, reserva ou emissão. `fiscalStatus` é sempre `not_evaluated`, mesmo quando todos os campos estão presentes e nenhuma pendência estrutural existe.

## Segurança e próximas integrações

A função é pura, sem acesso a rede, banco ou arquivos. Não recebe tenant como campo do contrato e não concede autorização. Quando houver persistência e processamento, o serviço deverá validar sessão/tenant/empresa no servidor, selecionar um adaptador registrado e validar sua saída antes de qualquer gravação. Campos extras como `tenant_id` ou `readyToIssue` não passam para o resultado.

Não existe ainda proteção persistente contra reimportação, reexportação ou concorrência: localização única só evita repetir a extração de uma posição dentro deste objeto. A idempotência real dependerá de constraints/transações, identidade de negócio demonstrada por amostras e testes com duas contas. Também faltam Storage privado, políticas de objetos, retenção e processamento limitado em worker separado. Não habilitar upload ou processamento longo em Server Actions como atalho.

## Fluxo de interface previsto

A prévia local da Shopee em `/painel/importacoes` segue a identidade existente: componentes React no Next.js, Outfit e DM Mono locais, verde e off-white, foco visível, estados com texto claro e adaptação para celular. Implementa seleção de empresa, leitura local e conferência. O fluxo persistente e a confirmação fiscal abaixo continuam como critérios para etapas posteriores.

1. Selecionar uma empresa própria, reaproveitando dados cadastrados; escolher automaticamente apenas quando houver uma única opção válida.
2. Enviar o relatório de um layout suportado. Informar formatos e limites reais. Arquivo desconhecido deve produzir erro útil, sem afirmar importação concluída.
3. Mostrar empresa, origem, período informado, quantidade de registros e totais por moeda, todos derivados do processamento real. Apresentar linhas e pendências com acesso à localização de origem. Não atribuir moeda ou tomador ausentes.
4. Permitir revisão e correção rastreável. Confirmação fiscal só será implementada com regras, resolução de tomador e controle de versões; alteração posterior deverá invalidá-la.

Feedback de processamento exige estado real do job; sem barra de progresso simulada, totais de demonstração ou animações decorativas nas tabelas. O gate visual será tratado conforme os limites já registrados em `docs/validacao-fundacao.md`; esta entrega não altera interface e não anuncia novo resultado visual.

## Validação da base inicial, anterior ao adaptador Shopee

- Sete testes novos passaram: decimais exatos, moedas separadas, soma acima do limite individual, cancelamento matemático sem resíduo, ausências sem inferência, rejeição integral de relatório inválido, proveniência por formato, localizações repetidas, metadados/limites e descarte de campos forjados.
- Suíte completa: 21 passaram, 6 opt-in ignorados, zero falhas. Os ignorados não são contados como validação de rede/produção.
- TypeScript, lint, build de produção e `git diff --check` passaram. Não há alteração SQL; os testes de banco não foram repetidos nesta etapa. Não houve teste de parser, arquivo malicioso, Storage, worker ou integração real de marketplace, pois esses componentes ainda não existem.

Dependência de amostra resolvida parcialmente: o usuário forneceu o CSV real mensal da Shopee. A interpretação observada, seus limites e as verificações posteriores estão no guia específico. Outros layouts, formatos e plataformas continuam exigindo amostras; tipos de comissão e regra de tomador não foram estabelecidos pelo CSV recebido.
