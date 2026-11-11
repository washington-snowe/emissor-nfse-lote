# Pesquisa fiscal e mapa de integrações

Data de referência: 10/11/2026, America/Sao_Paulo. **Não há documentação externa atual consultada com sucesso nesta execução.** Este registro distingue o informado pelo usuário, hipóteses de engenharia e evidências ainda necessárias. Não é um manual de integração.

## Registro de evidências

| Item | Origem | Resultado e limite |
| --- | --- | --- |
| Escopo do produto e plataformas | `especificacao-mestra.md`, fornecida pelo usuário | Requisito confirmado; não prova layouts ou regras legais |
| Recorte de regimes/competências | Resposta do usuário durante descoberta | MEI nacional; ME/EPP do Simples nacional desde 11/2026, anteriores por cobertura; regime normal excluído |
| Resolução CGSN nº 191/2026 | Referência fornecida pelo usuário | Texto oficial, vigência e exceções ainda não conferidos; não tratado como norma verificada |
| Portal Nacional | `https://www.gov.br/nfse/pt-br` | Tentativa HTTPS bloqueada no CONNECT por proxy 403; conteúdo não obtido |
| Relatórios Shopee/TikTok/Mercado Livre | Nenhuma amostra recebida | Formatos efetivos, colunas, IDs e tomadores não verificados |
| Concorrência e preços | Nenhuma página consultada com sucesso | Não afirmar valores ou funcionalidades atuais |

O proxy impediu acesso antes do servidor de destino. Isso não indica indisponibilidade do portal, ausência de credenciamento ou certificado inválido. Não foram tentados caminhos alternativos para contornar a política.

Rascunho salvo com domínios de pesquisa: `www.gov.br`, `www.nfse.gov.br`, `help.shopee.com.br`, `seller-br.tiktok.com`, `developers.mercadolivre.com.br`, `www.mandanotas.com.br` e `contaazul.com`. São destinos para pesquisa, não URLs de integração fiscal, nem evidência de páginas acessíveis. Os presets de pacotes foram preservados. Outros hosts/redirects só devem ser adicionados quando identificados; o domínio oficial de “MaisControl” ainda precisa de identificação sem confundir empresas de nomes semelhantes.

Após o usuário salvar as permissões, consultar status, confirmar política aplicada e fazer conexão nova. Registrar URL final, título, versão, publicação/atualização, data da consulta, arquivo e checksum quando houver download. Revisar esses registros antes de cada mudança do adaptador fiscal. Não considerar pesquisa encerrada por haver links neste documento.

## Investigação Nacional obrigatória antes de código fiscal

Partir do [portal oficial indicado na especificação](https://www.gov.br/nfse), localizar as páginas técnicas vigentes e seguir apenas referências oficiais. Não foi confirmado nenhum endpoint operacional.

| Tema | O que extrair e validar | Saída exigida |
| --- | --- | --- |
| Norma e competência | Texto consolidado CGSN, vigência, MEI/ME/EPP, exceções e competências retroativas | Matriz normativa com referência exata e revisão fiscal |
| Elegibilidade | Critérios do contribuinte, regime, município, credenciamento e permissões de emissão | Checklist por emissor/ambiente/competência, não promessa genérica |
| Emissor versus compartilhamento | Distinguir adesão à plataforma, integração municipal de dados e uso direto de API de emissão | Evidência da modalidade disponível ao piloto |
| Autenticação | Certificado, mTLS, assinatura XML, titularidade/representação, cadeia e credenciamento efetivos | Teste de acesso autorizado em ambiente apropriado |
| Operações | Criação/transmissão do documento exigido, consulta, autorização, eventos, cancelamento e substituição | Contrato do adaptador com URLs e métodos reais |
| Leiaute | XSD vigente, namespaces, assinatura/canonicalização, compactação, limites e campos obrigatórios | Fixtures técnicas oficiais versionadas e validador |
| Identificação | Numeração e chave/ID de origem, escopo, consulta por identificador e erros de duplicação | Estratégia comprovada para recuperar envio incerto |
| Situação | Estados síncronos/assíncronos, recibos, prova fiscal, erros corrigíveis e definitivos | Máquina de estados com códigos documentados |
| Política operacional | Limites, disponibilidade, versões, janelas, propagação, retentativas e contingência | Limites configuráveis e critérios de reconciliação |
| Documentos | Obtenção e autenticidade de XML/PDF, permissões e condições de uso | Download real homologado e preservação de checksum |
| Exterior | NIF, país/endereço, campos exigidos e tratamento fiscal | Casos aprovados sem inferir exportação |

Não presumir que manuais de ADN, APIs de compartilhamento ou emissão por interface web se aplicam ao mesmo caso de API emissora do contribuinte. Também não presumir existência de consulta por chave de idempotência do SaaS. Se não houver mecanismo conclusivo de reconciliação, limitar automação e manter intervenção humana.

## Matriz de elegibilidade proposta

| Regime/competência | Escopo solicitado | Verificações para liberar emissão |
| --- | --- | --- |
| MEI | Qualquer município do país | Confirmar regra oficial vigente, identificação, dados fiscais, acesso e operação documentada |
| ME/EPP Simples, até 10/2026 | Municípios que já emitiam pelo Nacional ou prefeituras integradas | Confirmar cobertura histórica e modalidade que efetivamente permite emissão da competência |
| ME/EPP Simples, desde 11/2026 | Qualquer município, conforme referência à Resolução 191/2026 | Conferir norma, efeitos e exceções; validar requisitos operacionais, credenciamento e competência |
| Regime normal | Fora do produto | Bloquear antes de formar lote fiscal |
| Histórico sem evidência | Não assumir elegibilidade | Solicitar revisão e manter bloqueio |

Mudança atual de regime não reescreve histórico. Norma deve ser avaliada pela competência e vigência aplicável. A decisão fiscal deve indicar evidência, versão e motivo de bloqueio; o usuário não remove um bloqueio normativo simplesmente confirmando um formulário.

## Plataformas e relatórios

Não há compromisso de integração direta via API de marketplaces no primeiro fluxo: importação de relatórios é a entrada planejada. APIs oficiais podem enriquecer dados somente se documentação, escopos, autorização e termos permitirem; API de vendedor não é automaticamente API de comissões de afiliado.

| Plataforma | Adaptador previsto | Investigações específicas |
| --- | --- | --- |
| Shopee | ShopeeReportAdapter | Tipos de comissão, campanhas e pagador; confirmar quando SHPS é tomadora e quando o vendedor é, sem aplicar regra universal |
| TikTok Shop | TikTokReportAdapter | Afiliado versus vendedor, comissões liquidadas/estimadas, estornos, campanhas, entidade contratante e identificação de origem |
| Mercado Livre | MercadoLivreReportAdapter | Relatórios efetivos de afiliados, origem da comissão, ajustes, entidade contratante e IDs disponíveis; não reaproveitar automaticamente formato de vendas |

Para cada plataforma reunir: nome oficial do relatório, caminho de exportação, versão/data, idioma, moeda, competência, significado de cada linha, status de liquidação, modalidade, IDs, documentação do tomador e reconciliação com o total. Manter arquivos anonimizados como fixtures somente com autorização e sem dados reais sensíveis.

CSV: delimitação, encoding, aspas, decimais locais, cabeçalhos e células com fórmulas na exportação. XLSX: abas, linhas de resumo, células mescladas, valores calculados, fórmulas sem execução, limites de expansão do ZIP. PDF: testar separadamente texto, imagem/OCR, protegido, inválido e layout não reconhecido. PDF/OCR com baixa confiança exige revisão; números reconhecidos não provam quem é tomador.

Critério de adaptador válido: corpus de arquivos de layout conhecido, totais conciliados e erros determinísticos. Formato genérico opcional futuro deve ser explicitamente um modelo do produto e nunca anunciado como layout oficial de marketplace.

### Regras de tomador ainda não verificadas

Não aprovar agrupamento apenas por nome, ID do vendedor ou entidade que realizou o pagamento. Exigir evidência contratual/fiscal por modalidade. Período mensal é a intenção comercial, não regra fiscal universal já verificada. Operações de CNPJs, moedas, tratamentos tributários ou tomadores distintos permanecem separadas. Dados históricos só são reutilizados com vigência e aprovação rastreáveis.

## Mapa de integrações externas

| Integração | Responsabilidade e dependências | Estado |
| --- | --- | --- |
| Nacional | Emissão, consulta e eventos documentados; certificado/credenciamento apropriados | Pesquisa e homologação pendentes |
| Municipal/terceiros | Possível lacuna de cobertura histórica; avaliar necessidade e custo antes de contratar | Sem provedor escolhido; fora do primeiro adaptador |
| Marketplaces | Relatórios primeiro; API apenas com necessidade e permissão comprovadas | Sem amostras ou integração |
| Cadastro fiscal | Enriquecimento lícito com fonte autorizada e proveniência | Sem API escolhida; sem scraping de dados pessoais |
| KMS/Transit | Envelope, rotação e trilha de acesso | Seleção pendente |
| Storage privado | Relatórios, documentos e exportações com autorização | Seleção pendente |
| E-mail transacional | Remetente verificado, SPF/DKIM/DMARC, anexos/links e eventos de entrega | Seleção pendente; não usar e-mail para retransmitir nota |
| Pagamentos | Cartão tokenizado, PIX, recorrência suportada, webhooks e reconciliação | Seleção pendente; confirmar modalidade de PIX |
| Monitoramento/backup | Métricas sem dados sensíveis, alertas e restauração | Seleção e testes pendentes |

## Concorrência — roteiro, sem conclusões fabricadas

| Produto | Preço/limites atuais | Fluxo especializado de afiliados | CSV/XLSX/PDF e agrupamento | Exterior, multi-CNPJ, e-mail, certificados e dashboard |
| --- | --- | --- | --- | --- |
| MandaNotas | Não verificado | Não verificado | Não verificado | Não verificado |
| Conta Azul | Não verificado | Não verificado | Não verificado | Não verificado |
| MaisControl | Identidade/site oficial a confirmar | Não verificado | Não verificado | Não verificado |
| Outros relevantes | Identificar durante pesquisa de mercado | Exigir evidência do fluxo | Comparar com relatórios reais | Verificar no plano específico |

Preencher com URL oficial, data, plano, volume, excedente, prazo promocional, custo por CNPJ e limitações. Separar “não encontrado publicamente” de “não oferece”. Marketing de emissão em lote não comprova importação de comissões por plataforma, nem tratamento fiscal para estrangeiros. Solicitar demonstração quando a página não esclarecer. Faixa de R$ 19,90–79,90 é hipótese do usuário, não preço validado nem vantagem competitiva demonstrada.
