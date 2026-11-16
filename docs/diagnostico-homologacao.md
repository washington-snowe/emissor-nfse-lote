# Diagnóstico de acesso com A1

## HTTP201 com documento ainda não confirmado

O teste independente de R$5 (`b8333bad15826614`, versão `7b2384b`) registrou HTTP201 JSON em homologação, sem código fiscal de erro, software `SefinNacional_1.6.0`. A identidade agregada do envelope não corresponde integralmente à esperada e o recibo não passou nos guards. **HTTP201 pode indicar nota já emitida. Não criar outro teste, reenviar ou zerar a operação.** A categoria não revela os valores/aliases do envelope perdido; não concluir que seja outra nota nem normalizar uma identidade divergente para autorizar.

**Copiar diagnóstico da emissão** continua lendo somente registros já armazenados, sem abrir A1 ou consultar a SEFIN. Quando encontra o 201 registrado em uma operação incerta/intervenção com uma transmissão, oferece separadamente **Conferir documento na SEFIN**. Esse botão faz até dois GETs sequenciais pelos destinos oficiais já capturados, sem POST, reserva, alteração de lease/status/contador ou inscrição de e-mail.

A ação relê operação própria pela sessão/tenant, exige homologação/uma transmissão/201 e usa a RPC de snapshot19 existente, com dono e quota de dez conferências por dez minutos. Confere hash, identidade, assinatura e CNPJ do XML original; só então abre o A1 protegido com propósito reconcile e exige titular correspondente. Primeiro busca a DPS original; a chave50dígitos da resposta200 só é usada se ambiente2 e identidade exata forem confirmados. Identidade alheia/ausente, chave inválida ou ambiente diferente interrompem a busca. Depois recebe o XML comprimido da NFS-e pela chave vinculada. O material não vai a disco/log e o pfx é zerado em finally, inclusive nas falhas; o acesso ao A1 é auditado pela função protegida já existente.

O relatório `nfse-receipt-v1` retorna apenas categorias de identidade separadas por campo, nomes de componentes divergentes, status HTTP, XSD/campos conhecidos, vínculo de chave/emitente/DPS, código cStat limitado, métodos de assinatura de uma lista fixa, validade e verificação criptográfica. Não retorna IDs, chave, certificado, XML, valores da nota, senha, erro livre ou conteúdo de exceção. Não recupera o envelope do POST original e não altera o estado fiscal, mesmo se o documento passar pela política atual. Nenhum SQL novo.

Os guards de autorização permanecem os mesmos. A instrumentação permite conferir a assinatura da NFS-e mesmo se o conteúdo canônico da DPS divergir, mas a divergência continua impedindo retorno de documento autorizado. Uma projeção estrutural interna identifica diferenças restritas a declarações/prefixos de namespace, preservando namespace URI, atributos e textos; isso serve só ao diagnóstico, sem normalização para aceitar documento. Status inválido, empresa/DPS/chave alheias, XSD incompatível, assinatura alterada ou política desconhecida continuam recusados. Fontes e limites em `integrations/nfse/receipt-diagnostic.provenance.json`.

Após publicação: na mesma R$5, copiar o histórico e depois usar **Conferir documento na SEFIN**, enviando esse novo relatório. A conferência pelo portal oficial foi solicitada como informação complementar e ainda não há resposta; não presumir emissão/ausência. Nenhuma nova emissão deve ser solicitada nesta etapa.


Validação da conferência de recibo: 146 testes aprovados e seis opt-in ignorados; ação real com fronteiras sintéticas de sessão/admin/A1/GET prova isolamento, gate de201 e bloqueio antes do A1 quando indisponível; testes criptográficos sintéticos conferem as duas consultas próprias, rejeição de documento alheio, pfx zerado, ausência de XML/identidades na saída e divergência de namespace sem autorização; interface/cópia em seis larguras, lint, TypeScript e build aprovados. Nenhum SQL foi alterado, o banco não foi retestado nesta etapa e o executor não acessou A1 real ou serviço fiscal autenticado.

## E0008 após a correção de layout

O usuário confirmou no XML original de R$3 a ausência de `finNFSe`, recusa pelo XSD restrito e aceitação pelo legado. O teste independente seguinte de R$4, na versão `8493d89`, retornou POST400 JSON/homologação/E0008, com identidade correspondente e `SefinNacional_1.6.0`. A operação ficou incerta; uma consulta posterior retornou 404/ambiente0/E2404. Isso não autoriza retransmissão ou mudança dos registros antigos.

A regra150 da aba RN DPS_NFS-e 1.01 do Anexo I restrito de 20/10/2026 (linha153 do XLSX) define E0008: **dhEmi deve ser anterior ou igual ao processamento dhProc**. Fonte e hash em `integrations/nfse/emission-time.provenance.json`. Não foram preservados dhProc nem o envelope completo do primeiro retorno. Não é possível concluir, só com o código, se houve diferença de relógio ou tratamento de fuso pela SEFIN.

O worker usava `toISOString()` com `+00:00`. Agora formata o mesmo instante corrente em `America/Sao_Paulo`, com deslocamento explícito, inclusive na virada de dia. Não subtrai segundos/minutos, não usa competência como emissão e não muda arquivos assinados antigos. UTC e São Paulo equivalentes devem representar o mesmo instante; essa normalização ainda depende de confirmação real do serviço e não resolve por si só um eventual relógio adiantado. Testes conferem a igualdade dos instantes e o único POST.

O classificador tinha outro caso de incerteza: `chaveAcesso:null` ou `nfseXmlGZipB64:null` eram tratados como marcadores de sucesso. Null não contém documento/chave e agora não veta uma rejeição documentada, desde que lista/códigos/identidade permaneçam válidos. Strings vazias e outros valores não nulos, E0014, status não declarado, identidade alheia e corpo genérico continuam incertos. **Não sabemos se essa foi a causa da classificação real.** Nenhum histórico é reclassificado.

O diagnóstico da operação existente de R$4 passa a analisar o snapshot original pela RPC19 já aplicada. Retorna apenas categoria de fuso e delta limitado entre dhEmi e o primeiro início de envio registrado, sem exportar datas/valores do XML. Essa comparação é com o banco da aplicação, não com o dhProc perdido. Também informa o reconhecimento do contrato atualmente armazenado, sem tratá-lo como envelope histórico. Todas as leituras derivam da sessão/dono da operação; não há abertura de A1, GET à SEFIN, lease novo ou transmissão. **Não há SQL novo.** Atualizar e copiar o diagnóstico da mesma R$4; não criar outro teste nessa etapa.


Validação desta etapa: 141 testes aprovados e seis opt-in ignorados; conversão de fuso/virada de dia preservando o instante e a competência, rejeições com campos null e cenários contraditórios/duplicidade, diagnóstico isolado entre contas com timestamp auditado e leitura do contrato atual, interface/copiar relatório em seis larguras; lint, TypeScript e build aprovados. Sem alteração SQL ou nova validação do banco nesta etapa. Sem A1 real ou transmissão fiscal pelo executor.

## Correção do pacote de homologação (20/10/2026)

O relatório do usuário após a migração19 confirmou hash, identidade e assinatura da DPS original, aceita pelo XSD local de produção de 09/02/2026. A revisão da página oficial separada de **produção restrita** identificou outro pacote publicado, de **20/10/2026**. Os arquivos de produção usados anteriormente não eram a referência adequada para validar a homologação corrente.

A diferença foi reproduzida com XML assinado sintético: o `TCInfDPS` de homologação exige `finNFSe`, na sequência entre `tpEmit`/`cMotivoEmisTI` e `chNFSeRej`/`cLocEmi`. Esse campo não era emitido. `TSRTCFinNFSe` permite `0` (NFS-e regular), finalidade das operações suportadas. A NT009 v1.01 confirma o deslocamento para `DPS/infDPS`; a planilha vinculada ainda contém o caminho antigo `IBSCBS`, divergência registrada na proveniência. O XSD restrito também move `cNBS`, quando informado, para antes de `xDescServ`.

O gerador de homologação agora inclui `finNFSe=0` e respeita a sequência do NBS; não acrescenta imposto, finalidade de ajuste ou dado contábil presumido. O XSD corrente usa os dez arquivos restritos, preservados byte a byte, **sem adaptação da expressão da série**. A série continua limitada pela aplicação a 1..49999. Os arquivos de fevereiro permanecem intactos e disponíveis explicitamente para análise histórica. A validação corrente recusa XML legado sem finalidade antes da intenção de envio. A recepção/reconciliação escolhe o layout pela DPS original assinada e preservada, nunca pela resposta recebida, e continua conferindo referência, titular e assinatura integral.

Fontes, hashes do ZIP, XSDs, Anexo I, NT e página oficial estão em `integrations/nfse/homologation-20261020.provenance.json`. Este ajuste não exige SQL, troca de A1 ou configuração técnica do usuário. **A migração19 está confirmada pelo diagnóstico recebido e não deve ser repetida.** O diagnóstico na mesma operação de R$3 agora compara `XSD homologação 20/10/2026` com `XSD de produção 09/02/2026 (legado)` e informa a presença de `finNFSe`. Não altera o XML já assinado, série, contador, perfil ou estado das operações de R$1/R$2/R$3. Nenhuma delas pode receber novo POST.

A incompatibilidade do gerador foi comprovada localmente; a confirmação no snapshot real depende da cópia do relatório atualizado. Aprovação no XSD/assinatura locais não comprova autorização pela SEFIN. Não pedir nova nota antes dessa confirmação; nenhum envio ou consulta com A1 real foi feito pelo executor.


Validação da correção de layout: 137 testes aprovados e seis opt-in ignorados; reprodução com os XSDs oficiais sem adaptação, assinatura e recibos sintéticos atuais/legados; ações de importação/diagnóstico/worker com fronteiras sintéticas; cópia do relatório em seis larguras; lint, TypeScript e build aprovados. Não houve alteração de banco, consulta fiscal ou emissão pelo executor.

## POST400/E1235 observado em 16/11/2026

O teste independente de R$3 enviado pelo usuário registrou HTTP400 JSON, ambiente de homologação e E1235 em 0,8s; a consulta posterior retornou HTTP404 JSON/ambiente0/E2404. E1235 significa **“Falha no esquema XML do DF-e.”**, conforme regra16 da aba RN_RECEPCAO_DPS do Anexo I oficial (linha17 do XLSX). URL, hash e limites dessa evidência estão em `integrations/nfse/schema-rejection.provenance.json`. Esse código não identifica o campo recusado nem comprova falta de credenciamento. A descrição original não foi preservada; não pode ser recuperada por uma nova consulta da DPS.

Uma identidade opcional `idDPS:null` deixa de ser tratada como identidade estrangeira pelo classificador de rejeições. Não sabemos se esse campo veio nulo no corpo real do teste. Identidade não nula divergente, E0014, envelope contraditório ou status não documentado continuam incertos; nenhum resultado antigo é reclassificado e nenhum POST é repetido.

A migração **19**, `202611160019_fiscal_schema_diagnostics.sql`, foi confirmada pelo diagnóstico com análise do snapshot original. Não repetir a 18 ou anteriores. Ela mantém o ledger18 e acrescenta apenas evidências limitadas: nomes de campos de E1235 em lista fixa (máximo10), categoria da identidade e versão de software com formato restrito. Mensagens, complementos, XML e valores originais nunca são gravados nesse ledger. Sem a verificação de disponibilidade da 19, o worker continua persistindo somente o formato18.

Em **Copiar diagnóstico da emissão**, um E1235 já persistido permite analisar a DPS original no servidor. Primeiro a sessão e o tenant conferem a operação; uma RPC somente service_role exige o dono correspondente, homologação, uma transmissão registrada e quota de dez análises por dez minutos/tenant. A RPC retorna ao servidor apenas XML original, hash, identidade original e certificado público original. Não abre A1 nem lê senha/chave privada. O relatório devolve exclusivamente resultados de integridade, identidade, assinatura, versão conhecida e validação XSD limitada/isolada; nunca devolve os valores do snapshot. XSD conserva os arquivos oficiais e a única adaptação da expressão de série já documentada. Timeout/indisponibilidade do validador são distintos de uma estrutura recusada.

Critérios: dois tenants isolados, clientes sem acesso direto à RPC, quota, rejeição de metadados livres e snapshot sem alteração de estado/lease/contador/XML. Testes usam somente identidades e certificados sintéticos. Hash/assinatura/XSD locais não provam aceitação governamental. **Não alterar versão do XML, algoritmos ou campos fiscais por hipótese. Não solicitar nova nota de teste nesta etapa.** Após a atualização da aplicação, copiar o diagnóstico na operação existente de R$3, sem “Consultar novamente”.

Validação desta etapa: 133 testes aprovados e seis opt-in ignorados; PostgreSQL 17 com 20 novas asserções de diagnóstico de schema, regressão e concorrência existentes; ações/worker com fronteiras sintéticas; interface/copiar relatório em seis larguras; lint, TypeScript e build aprovados. Não houve acesso ao A1 real, execução no banco hospedado ou transmissão fiscal pelo executor.

## Classificação de rejeições por status documentado

O contrato oficial capturado declara erro de POST `/nfse` em **400, 403 e 500**, com `NFSePostResponseErro`. O adaptador reconhecia rejeições somente em 400/422, sem vincular cada status ao seu próprio esquema. Agora constrói o mapa de rejeições por status a partir da captura efetivamente carregada: 403 só é definitivo quando seu próprio esquema declara a lista de erros e todos os códigos retornados são fiscais reconhecidos. 400/422 também exigem sua declaração específica. A origem continua sendo a captura oficial existente, sem alteração de URL, artefato ou schema persistido.

HTML/JSON genérico, lista vazia/malformada, E0014 (inclusive junto de outros códigos), HTTP 5xx e status não declarado continuam incertos. Marcadores de sucesso junto de erros impedem inferir rejeição; se o envelope informa `idDps`/`idDPS` não nulo, precisa corresponder à DPS enviada. A mudança atua apenas sobre o retorno da tentativa corrente, sem alterar operações antigas, reservar novos números ou permitir novo POST. Não há nova migração. **Não sabemos se os testes antigos receberam 403**, pois seus retornos de POST não foram guardados; o 403 de login no portal web não comprova um 403 na API.

Validação desta classificação: 130 testes aprovados e seis opt-in ignorados, incluindo respostas sintéticas de 403 documentado, erro genérico, identidade diferente, duplicidade e envelope contraditório; um único POST por execução. Integrações de worker/diagnóstico, lint, TypeScript e build aprovados. Sem alteração SQL ou transmissão fiscal pelo executor.

## Registro persistente: migração 18 aplicada

O usuário retornou `nfse-operation-v2 (613d3e5)` com **Armazenamento do diagnóstico: disponível** e duas consultas de DPS persistidas: **HTTP 404 JSON, ambiente 0, E2404**. Isso confirma a aplicação/persistência da migração 18; não repetir nem editar esse SQL. O diagnóstico das duas respostas originais de POST continua indisponível. As operações de R$1/R$2 permanecem incertas, sem retransmissão.

O primeiro teste ficou incerto em **0,8 s**; o teste independente de R$ 2,00 também ficou incerto em **0,9 s**. O usuário não encontrou os registros na Vercel. Esses intervalos não comprovam timeout do limite antigo de cinco segundos. A resposta original dos dois testes não está armazenada e não pode ser recuperada retroativamente. O usuário conseguiu acessar o portal web em janela anônima; o painel de homologação não listava emissões recentes. Isso não permite classificar os POSTs antigos como rejeitados nem liberar retransmissão.

A migração **202611160018_fiscal_transport_diagnostics.sql** acrescenta um ledger privado de metadados limitados. `begin_fiscal_send_traced` chama o guard original e grava a intenção diagnóstica na mesma transação que permite o único POST. `finish_fiscal_attempt_traced` grava a observação HTTP/falha e a conclusão fiscal na mesma transação, antes de liberar o lease. Privilégios diretos dos helpers antigos são retirados do `service_role`, para impedir workers antigos de passar por fora do registro. As funções originais e as migrações aplicadas não são editadas; o limite de um POST permanece.

O ledger aceita somente etapa, fase, status HTTP, formato, categoria de ambiente, até dez códigos `Edddd` e duração. Não guarda corpo, mensagens livres, URL fiscal, XML, A1, senha ou chave. O token de lease fica exclusivamente na tabela privada; a RPC de leitura o omite e verifica a operação pelo tenant da sessão. O registro é cercado por status/token/prazo; finais são imutáveis e replay idêntico é idempotente. Consultas de rodadas diferentes não colidem mesmo após retomada manual.

Sem a migração, o worker atualizado só pode reclamar reconciliações e a interface informa que novas transmissões aguardam atualização. Após a aplicação, **Copiar diagnóstico da emissão** fornece `nfse-operation-v2` com metadados persistidos diretamente no banco; os logs da Vercel deixam de ser necessários para essa leitura. O botão continua sem HTTP fiscal ou mutação. Os novos metadados não substituem a validação do documento nem transformam status HTTP em autorização.

A migração criou registros/funções/permissões, sem emitir, reenviar, apagar dados ou alterar A1s, contadores ou estados existentes. As respostas anteriores continuam indisponíveis. A aplicação e a persistência já foram confirmadas; não executar a 18 novamente. O executor não dispõe de conexão administrativa ao projeto. Migrações anteriores e fixtures de banco não devem ser repetidas no projeto hospedado.

Validação: **128 testes aprovados e seis opt-in ignorados**; suíte PostgreSQL 17 completa, com 20 asserções específicas de privilégios, isolamento, fencing, replay, imutabilidade, metadados inválidos e rollback da conclusão. Oito conclusões simultâneas preservam um único registro; o guard original continua permitindo um único início de envio. Integrações de ação/worker, interface/cópia em até seis larguras, lint, TypeScript e build aprovados. Testes usam fronteiras e dados sintéticos, sem A1 real ou chamada fiscal externa.

## Histórico anterior à migração 18: operação sem confirmação

Após a compatibilidade do GET de acesso, o usuário retomou a mesma nota de teste e passou a ver **A consulta ainda não localizou a DPS**. O aviso persistiu depois de aguardar e consultar. `transmit_count=1` registra a intenção persistida; não comprova recebimento ou autorização pela SEFIN. Essa operação permanece somente em reconciliação: não cancelar, reiniciar contador, preparar outra nota equivalente ou repetir POST para contornar o estado.

O banco dessa versão guarda a transição de estado e eventos auditados, mas não o HTTP/corpo do primeiro envio. A resposta original não pode ser reconstruída retroativamente pelo novo código. O botão **Copiar diagnóstico da emissão**, na operação transmitida ainda não autorizada, lê exclusivamente operação e auditoria da sessão/tenant atuais. O relatório `nfse-operation-v1` mostra estado, contadores, horários, intervalo entre início e primeiro resultado e uma correlação SHA-256 abreviada. Não inclui UUID original, DPS, CNPJ, tomador, valor, XML, A1 ou credenciais. Essa coleta não faz GET fiscal, não agenda trabalho nem altera estado.

O transporte antes limitava qualquer POST a cinco segundos. O worker permite até **20 segundos**, reduzidos conforme o prazo restante e reservando agora **dez segundos** para concluir a gravação atômica. Isso é uma mitigação para próximas transmissões, não prova de que o caso atual foi timeout nem autorização para reenviar. GET mantém cinco segundos no worker; a consulta inicial não muda.

Novas requisições do worker registram `nfse_transport` nos logs da Vercel: correlação, etapa fixa, início/prazo, HTTP, formato, categoria de ambiente, códigos `Edddd` limitados, duração ou categoria de transporte. Nenhum corpo, URL com identificadores, XML, certificado, senha, token ou erro original vai ao log. Falha no logger não muda o resultado fiscal nem repete requisição. A retenção desses logs depende da Vercel; não são um histórico permanente de respostas no banco. Procurar a correlação do relatório para ler os registros novos; não prometer que o POST antigo estará disponível.

A versão b66d9be não exigiu migração. A mudança não soluciona automaticamente a operação já incerta nem altera a exigência de documento íntegro para autorizar. Produção continua bloqueada.

Validação: 127 testes aprovados e seis opt-in ignorados; timeout de 20s testado com relógio simulado e uma única requisição; observação sem conteúdo privado e falha do logger sem repetição; isolamento da ação de histórico entre sessões/tenants; worker real com limites e uma resposta sintética de rejeição. Interface/cópia testadas até seis larguras, sem retomar a operação ao copiar. Lint, TypeScript e build aprovados. Sem SQL ou emissão real pelo executor.

## Retorno SEFIN identificado: 404/E2404 com ambiente 0

O diagnóstico real do usuário em `15c4450` mostrou A1 aberto/validado localmente, GET DPS **404 JSON**, `tipoAmbiente` **número 0**, erro objeto **E2404**, sem mensagem genérica e sem identidade DPS na resposta. O contrato oficial capturado declara ambiente inteiro `1/2`; a validação recusava esse valor 0. O motivo legado `certificate_unavailable` da fila também englobava essa recusa de acesso, sem comprovar perda do A1. Sua apresentação já foi corrigida para explicar ambas as possibilidades.

O adaptador passa a reconhecer uma exceção de compatibilidade **somente no GET DPS de acesso em homologação**: HTTP 404, ambiente numérico 0, erro singular objeto com código exato E2404, ausência de `idDps` e estrutura de erro declarada no contrato oficial efetivamente capturado. O destino continua fixado na SEFIN de homologação, por TLS verificado, depois de validar o titular do A1 e construir a identidade de consulta do próprio CNPJ/município/série. A observação sanitizada, origem e limites estão em `integrations/nfse/sefin-dps-lookup-compatibility.json`; o executor não recebeu o A1 nem o corpo privado. Não se atribui uma descrição oficial ao E2404 sem sua definição.

**0 não é convertido em 2.** A consulta pode fornecer evidência de transporte pelo tratamento restrito desse erro do serviço; isso não aprova enquadramento, DPS, XML ou nota. HTTP 200 continua exigindo ambiente 2, identidade e chave válidas. Ambiente de produção, texto `"0"`, nulo, ambiente ausente, outros erros com zero, listas, HTML e 404 genérico continuam bloqueados. Não houve mudança de rota, envio, validação de documento, numeração, isolamento, leases ou reconciliação. E2404 recebido como resposta de POST não vira autorização ou permissão para retransmitir.

A operação já confirmada e parada antes da reserva pode usar **Retomar preparação**, que refaz o GET com o A1 e perfil efetivos antes de registrar a prova e reservar a DPS. Não criar outra nota de teste para contornar esse bloqueio. Nenhuma migração nova, reenvio do A1 ou troca de flag é necessária. A atualização não reescreve resultados históricos da fila automática; as próximas verificações e a preparação usam o mesmo adaptador corrigido.

## Diagnóstico SEFIN sem dados privados

Na mesma empresa em **Empresa → Certificado**, **Gerar diagnóstico da SEFIN** executa somente o GET de identidade própria pelo mesmo pipeline da verificação automática. **Copiar diagnóstico SEFIN** fornece `nfse-sefin-v3`: carregamento local, resultado, HTTP, formato, ambiente, representação por valores fixos, estrutura de erro, até dez códigos `Edddd` e correspondência da identidade sem exportar seu valor. Outros valores de ambiente são omitidos. Mensagens originais, corpo, URL completa, CNPJ, A1, senha e chaves nunca são copiados. Sessão/propriedade/quota são verificadas antes da abertura e consulta.

O relatório distingue resposta documentada da exceção: com 0/E2404, **Resposta compatível com o contrato: não** e **Critério de acesso: compatibilidade restrita GET DPS · 404/E2404 · ambiente 0**. Não falsifica conformidade com o enum documentado. O diagnóstico não registra prova fiscal, não reserva número, não atualiza a fila nem transmite notas. A verificação automática continua sendo o fluxo principal.

O v2 agrupava texto, zero e nulo como “não reconhecido”; o v3 permitiu identificar o zero sem exportar conteúdo arbitrário. Swagger oficial sem A1 retornou 503 neste executor; a cópia secundária já identificada mantém `integer enum [1,2]`. A exceção se baseia no retorno real sanitizado da aplicação, não em troca do contrato capturado por uma cópia de terceiros. Produção segue bloqueada.

Validação da compatibilidade: **122 testes aprovados e seis opt-in ignorados**; integrações com ação/worker reais e fronteiras sintéticas verificam identidade própria, GET fixo, registro da prova antes da reserva, recusa de titular diferente, prova negada, outros erros com zero e intenção de envio negada. A resposta 404/E2404 em POST permanece incerta, sem autorização ou repetição. Interface/cópia em 1440/390/320 e regressão dos demais fluxos; lint, TypeScript e build aprovados. Nenhuma execução SQL, consulta com A1 real ou transmissão fiscal pelo executor.

## Estado atual: documentação capturada e MEI

O diagnóstico seguro enviado pelo usuário mostrou ADN **404 JSON**, índice do portal **200 HTML** e contrato SEFIN **200 JSON capturado**. A empresa foi informada como MEI. A RPC pública confirmou a captura oficial de `https://sefin.producaorestrita.nfse.gov.br/SefinNacional/swagger/docs/v1`, hash original `68980daaac06929bc1b0dd8806b4214dd6d2d1da480fd7278a2c58c8a10ca4d5`, em `2026-11-13T01:35:16.429806+00:00` (noite de 12/11 em São Paulo).

A estrutura pública, sem exemplos/descrições ou registros de contribuintes, foi preservada em `integrations/nfse/contracts/sefin-homologation-v1.structural.json`, com proveniência separada. O adaptador reconhece POST NFS-e **201**, consulta de DPS e consulta NFS-e. Não houve captura do A1 pelo executor, transmissão, autorização fiscal ou confirmação real dos algoritmos de assinatura.

O feedback distingue a consulta auxiliar: **MEI cadastrado no servidor + ADN 404 JSON + contrato armazenado e reconhecido** orienta a conferir os dados fiscais, sem apresentar veto municipal. O 404 e `connected=false` continuam registrados como observados; não são convertidos em sucesso de transporte. Contrato ausente/incompatível, falha de armazenamento, HTTP 401/403, TLS e HTML 404 continuam mostrando pendência/erro. Simples não herda essa regra de apresentação do MEI. Nenhum guard fiscal ou limite de acesso foi removido.

Não é necessário repetir cadastro A1, migração ou consulta só para eliminar esse aviso auxiliar. A próxima etapa é confirmar o perfil em **Empresa → Serviço/Avançado** e preparar a operação de homologação explicitamente. Produção continua bloqueada; a fila ainda valida a identidade e a resposta da SEFIN antes de reservar/enviar.

O usuário confirmou o armazenamento protegido de seu A1 pela aplicação e informou falha na consulta de homologação. Depois do ajuste de TLS, a nova tentativa retornou `NFSE_HTTP_404`. A migração 15 foi confirmada sem erros; o teste seguinte continuou com 404 e `NFSE_CONTRACT_PENDING`. Isso mostra uma resposta HTTP, sem provar que o certificado foi aceito pelo serviço fiscal. O executor não recebeu certificado ou senha, não consultou o material privado e não transmitiu DPS.

## Separação entre parâmetros ADN e emissão SEFIN

A pesquisa posterior identificou que a API de parâmetros municipais foi movida para o **ADN**. O portal oficial lista sua documentação separadamente; a cópia Swagger v1 consultada da SEFIN marca `/ParametrosMunicipais` como movido, e a cópia OpenAPI do ADN declara `GET /{codigoMunicipio}/convenio` sob `/parametrizacao`. As cópias são referências secundárias identificadas, não contratos oficiais capturados pela aplicação. Fontes, hashes e limitações estão em `integrations/nfse/access-provenance.json`.

A consulta do botão passa a usar `https://adn.producaorestrita.nfse.gov.br/parametrizacao/{codigoMunicipio}/convenio`. Só esse GET é acrescentado à lista de destinos; escrita no ADN, outro ambiente, parâmetros arbitrários e terceiros permanecem bloqueados. O sucesso exige objeto `parametrosConvenio`, sem deduzir elegibilidade de MEI/Simples dos valores de teste. Um acesso ao ADN não é prova de acesso à SEFIN e não libera numeração ou emissão.

A fila deixa de consultar a rota legada de parâmetros na SEFIN. Antes de reservar identidade compartilhada, faz somente uma consulta GET por identidade de DPS do próprio titular e série efetivamente configurada, número 1, **sem reservar/consumir esse número ou enviar DPS**. A resposta deve corresponder à estrutura 200/404 declarada no contrato SEFIN capturado, no ambiente de homologação; 200 precisa vincular a identidade e chave, e 404 precisa conter o erro estruturado declarado. HTML 404, JSON genérico, parâmetros do ADN, identidade de outro titular e contrato sem o esquema necessário não liberam a reserva. A ausência de dados municipais não é usada como veto universal a MEI. O perfil e a autorização fiscal continuam sendo avaliados pelo fluxo próprio.

## Redoc e diagnóstico copiável

A descoberta lê também `openApi`, `spec-url`, `specUrl`, `Redoc.init(...)` e o `index.js` explicitamente referenciado. Índices documentais do portal e da base SEFIN são distintos; ambos têm destinos restritos e limite de prazo. Se a interface não disponibilizar referência, a descoberta pode consultar o JSON SEFIN conhecido em `/swagger/docs/v1`, sempre obtido ao vivo por TLS e submetido às mesmas verificações. Nunca é importada a cópia de terceiros como evidência oficial. Nenhum JavaScript da página é executado.

O botão **Copiar diagnóstico** fornece `nfse-adn-v1`, versão curta do deploy quando disponível, status da consulta ADN e etapas fixas da descoberta (índice, configuração do leitor e contrato). Não contém URL, CNPJ, arquivo, senha, chave ou corpo de resposta. Isso permite distinguir falha de transporte, índice ausente, referência não reconhecida e contrato incompatível sem solicitar dados privados.

Esta atualização não requer nova migração nem reenvio do A1. A 15 já está confirmada. Depois do deploy, repetir uma única consulta e enviar a mensagem e, caso falhe, o diagnóstico copiável. O acesso real ainda depende da sessão do usuário; o executor não possui o A1 nem credenciais administrativas.

## Histórico do ajuste inicial de prefixo

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

O Portal Nacional mantém os links de produção restrita. O manual legado descreve a antiga consulta SEFIN de parâmetros, posteriormente separada no ADN. Fontes e hashes estão em `integrations/nfse/access-provenance.json`. As páginas Swagger consultadas sem A1 neste executor retornaram 503/reset; isso não prova indisponibilidade da consulta autenticada na Vercel. A RPC antes retornava lista vazia; após a correção Redoc, a aplicação obteve e registrou o contrato oficial descrito no início deste documento.

## Validação

Testes sintéticos reproduzem o PFX legado, preparam o contexto TLS com PEM, conferem cadeia intermediária e exclusão de raiz/certificados alheios, sanitização de erros, distinção de HTTP/JSON/TLS e preservação de destinos, verificação TLS, ausência de redirecionamento e repetição após timeout. Esses testes não comprovam ICP-Brasil nem acesso do A1 real ao serviço oficial.

Resultado inicial do TLS: 80 testes aprovados e seis opt-in ignorados, sem alteração SQL. Após o ajuste de prefixo/descoberta: 84 testes aprovados e seis opt-in ignorados; 315 asserções PostgreSQL e testes concorrentes; interface real do aviso com fronteira sintética em 1440/390/320 e regressão dos fluxos existentes; TypeScript, lint e build aprovados. O usuário confirmou a aplicação da migração 15; ela não deve ser repetida ou editada.

Atualização ADN/Redoc: 90 testes aprovados e seis opt-in ignorados. Cobertura adicional de destinos GET do ADN, leitura Redoc/index.js, descoberta direta, relatório sem dados privados, vínculo da identidade SEFIN e recusa de HTML/JSON genérico/ambiente errado antes da reserva. Interface em 1440/390/320 verifica abertura dos detalhes e cópia do relatório, com regressão dos fluxos existentes em até seis larguras. TypeScript/lint aprovados. Não há nova alteração SQL; não foram repetidos testes do banco hospedado nem realizada consulta com o A1 real pelo executor.

Checkpoint MEI/contrato capturado: 93 testes aprovados e seis opt-in ignorados, incluindo integridade do artefato oficial estrutural, reconhecimento do HTTP 201 com verificação obrigatória do documento e regra de apresentação MEI sem mutação do resultado de transporte. Link para perfil e interface de certificado testados em 1440/390/320; regressão dos fluxos existentes até seis larguras. TypeScript, lint e build aprovados. Nenhuma alteração SQL, transmissão real ou mudança de habilitação fiscal.
