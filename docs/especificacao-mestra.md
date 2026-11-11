# ESPECIFICAÇÃO MESTRA — SaaS DE EMISSÃO AUTOMÁTICA DE NFS-e PARA AFILIADOS

## Instruções de execução para OpenAI Codex

Você será o principal agente de engenharia responsável por planejar, desenvolver, testar, corrigir, documentar e preparar para produção este sistema.

O projeto deverá ser desenvolvido diretamente no ambiente de trabalho disponibilizado pelo Codex, trabalhando sobre os arquivos reais do repositório. Não se limite a fornecer exemplos de código ou instruções teóricas: implemente as funcionalidades, execute os testes, corrija os problemas encontrados e mantenha o projeto em estado funcional.

**Não comece criando o sistema inteiro de uma só vez.** Primeiro compreenda o ambiente, investigue os requisitos técnicos e fiscais, proponha a arquitetura e organize a implementação em etapas verificáveis.

---

# 1. VISÃO GERAL DO PRODUTO

Desenvolver um SaaS brasileiro especializado na automação da emissão de Notas Fiscais de Serviço Eletrônicas (NFS-e) para afiliados PJ que recebem comissões de plataformas de marketplace.

O sistema deverá importar relatórios de comissões, identificar os tomadores de serviço, consolidar os valores conforme as regras fiscais aplicáveis, permitir a revisão dos dados e realizar a emissão das NFS-e em lote.

Após a autorização de cada nota, o sistema deverá enviar automaticamente o documento ao respectivo tomador por e-mail.

O produto será comercializado por assinatura mensal, com diferentes limites de emissão e cobrança adicional por excedente.

## Público inicial

- Afiliados PJ da Shopee.
- Afiliados PJ do TikTok Shop.
- Afiliados PJ do Mercado Livre.

O sistema será inicialmente voltado ao mercado brasileiro, mas deverá considerar operações com tomadores estrangeiros.

## Objetivo comercial

Criar uma solução acessível, especializada e simples de utilizar, capaz de reduzir o trabalho manual dos afiliados que precisam emitir dezenas, centenas ou milhares de NFS-e mensalmente.

---

# 2. PRINCÍPIOS OBRIGATÓRIOS DE DESENVOLVIMENTO

Estas regras devem ser respeitadas durante todo o projeto.

1. Priorize código funcional, seguro, organizado e de fácil manutenção.
2. Não implemente funcionalidades fiscais com base em suposições.
3. Não invente endpoints, parâmetros, códigos de serviço ou regras tributárias.
4. Consulte a documentação oficial antes de implementar integrações fiscais.
5. Não considere uma operação bem-sucedida apenas porque a requisição HTTP retornou sucesso. Verifique o resultado fiscal efetivo.
6. Não repita emissões automaticamente quando houver possibilidade de uma nota já ter sido autorizada.
7. Não armazene certificados A1 em texto puro.
8. Não exponha dados de um cliente a outro.
9. Não coloque credenciais, senhas, certificados ou informações sensíveis em logs.
10. Não remova funcionalidades existentes para contornar erros sem antes entender suas consequências.
11. Não substitua uma integração real por dados simulados sem identificar claramente que se trata de um ambiente de desenvolvimento.
12. Não declare uma etapa concluída sem executar os testes correspondentes.
13. Não faça deploy, contrate serviços, altere ambientes de produção ou realize operações irreversíveis sem autorização explícita.
14. Não invente informações comerciais, fiscais ou cadastrais para preencher campos obrigatórios.
15. Quando faltar uma informação indispensável, explique o bloqueio e solicite somente o dado necessário.

## Regra de trabalho no Codex

Antes de alterar qualquer arquivo:

- Inspecione a estrutura do repositório.
- Leia os arquivos de instruções existentes, especialmente `AGENTS.md`.
- Identifique tecnologias, dependências, scripts, testes e funcionalidades já implementadas.
- Verifique o estado do Git e preserve alterações existentes.
- Identifique riscos de compatibilidade antes de modificar estruturas importantes.

Se o repositório estiver vazio, estabeleça a estrutura inicial somente depois de apresentar e justificar a arquitetura proposta.

## Organização das instruções

Crie e mantenha um `AGENTS.md` na raiz do projeto com:

- Visão geral da arquitetura.
- Estrutura dos módulos.
- Convenções de código.
- Comandos para desenvolvimento e testes.
- Regras de segurança.
- Regras para alterações no banco de dados.
- Regras para integrações fiscais.
- Critérios de conclusão das tarefas.

Se necessário, crie arquivos `AGENTS.md` adicionais em módulos específicos.

---

# 3. FUNCIONAMENTO PRINCIPAL

O fluxo principal do sistema deverá ser:

1. O cliente cria sua conta.
2. Cadastra um ou mais CNPJs.
3. Configura os dados fiscais de cada empresa.
4. Registra seu certificado digital A1.
5. Importa o relatório de comissões de uma plataforma.
6. O sistema interpreta os dados.
7. Identifica os tomadores de serviço.
8. Consolida as comissões conforme as regras de cada operação.
9. Consulta ou valida os dados fiscais necessários.
10. Executa as validações antes da emissão.
11. Apresenta uma prévia das notas que serão emitidas.
12. O cliente revisa e confirma a operação.
13. O sistema coloca as emissões em uma fila de processamento.
14. Cada NFS-e é transmitida individualmente conforme a integração disponível.
15. O sistema acompanha o resultado de cada emissão.
16. Quando autorizada, a nota é armazenada.
17. O sistema envia automaticamente a NFS-e ao tomador por e-mail.
18. O cliente acompanha os resultados no painel.

O processamento deve ser assíncrono. O usuário não deve precisar manter o navegador aberto enquanto as emissões acontecem.

## Conceito de emissão em lote

Não presuma que a API Nacional de NFS-e oferece uma operação única para transmitir centenas de notas em uma requisição.

O conceito de lote deste produto significa:

- Importar um relatório de uma só vez.
- Preparar todas as emissões.
- Validar os documentos.
- Solicitar uma confirmação.
- Enfileirar as emissões individuais.
- Processar cada documento de forma controlada.
- Acompanhar os resultados em conjunto.

A implementação deverá respeitar os recursos efetivamente oferecidos pela API utilizada.

---

# 4. PLATAFORMAS E REGRAS DE COMISSÃO

O sistema deverá oferecer suporte a:

- Shopee.
- TikTok Shop.
- Mercado Livre.

A arquitetura deverá permitir adicionar novas plataformas sem reescrever o núcleo fiscal.

## Importação

Formatos necessários:

- CSV.
- XLSX.
- PDF.

O processamento deverá identificar:

- Plataforma de origem.
- Período de referência.
- Identificação do afiliado.
- CNPJ emissor.
- Identificação do vendedor ou tomador.
- Nome ou razão social.
- CPF/CNPJ ou identificação fiscal estrangeira, quando disponível.
- Endereço.
- Valor da comissão.
- Tipo de comissão.
- Dados complementares necessários à emissão.

Os formatos reais dos relatórios devem ser estudados antes da implementação dos importadores.

Não presuma que todas as plataformas possuem o mesmo layout.

## Arquitetura de importadores

Implemente adaptadores independentes, por exemplo:

- `ShopeeReportAdapter`
- `TikTokReportAdapter`
- `MercadoLivreReportAdapter`

Cada adaptador deverá transformar o arquivo original em uma estrutura normalizada de comissões.

O núcleo fiscal não deverá depender diretamente das colunas ou particularidades de um relatório específico.

## PDF e OCR

A importação de PDF deverá distinguir:

- PDF com texto selecionável.
- PDF digitalizado como imagem.
- PDF protegido ou inválido.
- PDF com layout não reconhecido.

Utilize extração de texto quando possível. OCR deverá ser utilizado quando realmente necessário.

Quando os dados não puderem ser extraídos com confiança, solicite correção ou importação de outro formato. Não invente valores.

---

# 5. IDENTIFICAÇÃO DOS TOMADORES E AGRUPAMENTO

O sistema deverá consolidar as comissões de acordo com o tomador de serviço e as regras fiscais aplicáveis.

A regra geral pretendida é gerar uma NFS-e por tomador, somando as comissões correspondentes ao período mensal.

Entretanto, essa regra não pode ser aplicada indiscriminadamente a todas as plataformas e modalidades de comissão.

## Pontos que precisam ser investigados

- Comissões pagas pela própria plataforma.
- Comissões relacionadas a vendedores específicos.
- Comissões adicionais ou campanhas.
- Comissões com tomadores diferentes.
- Operações com tomadores estrangeiros.
- Diferenças entre Shopee, TikTok Shop e Mercado Livre.

Exemplo importante para investigação: determinadas comissões da Shopee podem ter a própria plataforma SHPS como tomadora, enquanto outras operações podem exigir a emissão para vendedores específicos.

O sistema deverá identificar corretamente o tomador de cada operação, evitando misturar valores pertencentes a pessoas jurídicas diferentes.

**Nunca agrupe serviços de tomadores distintos em uma mesma NFS-e.**

## Estrutura recomendada

Criar um mecanismo de resolução de tomadores que considere:

- Plataforma.
- Tipo de comissão.
- Identificador do vendedor.
- Identificação fiscal.
- País.
- Regras de agrupamento.
- Dados históricos validados.

Quando houver ambiguidade, encaminhe o registro para revisão manual.

---

# 6. INTEGRAÇÃO FISCAL E EMISSÃO DE NFS-e

## Integração principal

A integração prioritária será a API oficial do Sistema Nacional da NFS-e.

Documentação oficial:

- Portal: https://www.gov.br/nfse
- Documentação técnica: consultar os manuais, esquemas XML, endpoints e atualizações oficiais disponíveis no portal.

Antes de desenvolver a integração:

1. Consulte a documentação técnica atual.
2. Identifique os endpoints efetivamente disponíveis.
3. Identifique os métodos de autenticação.
4. Verifique os requisitos de credenciamento.
5. Verifique as condições de participação do município.
6. Verifique as regras aplicáveis ao contribuinte.
7. Analise os leiautes e esquemas exigidos.
8. Identifique os mecanismos de consulta, autorização, cancelamento e substituição.
9. Verifique limites, códigos de retorno e regras de contingência.

Não utilize documentação antiga sem verificar se ainda está vigente.

## Certificado digital

Cada cliente deverá cadastrar seu próprio certificado digital A1.

Requisitos:

- Upload seguro do arquivo.
- Validação do formato.
- Validação da senha.
- Identificação do titular.
- Verificação do prazo de validade.
- Associação ao CNPJ correto.
- Armazenamento criptografado.
- Alertas de vencimento.
- Possibilidade de substituição e exclusão.

A integração deverá utilizar o certificado de forma segura durante o processamento.

O certificado não poderá aparecer em logs, respostas de API, arquivos temporários desprotegidos ou armazenamento em texto puro.

A existência de certificado A1 não garante, por si só, autorização para emissão pela API Nacional. O sistema deverá verificar os requisitos efetivos de credenciamento e elegibilidade.

## Configuração fiscal automática

O sistema deverá tentar identificar automaticamente os dados fiscais necessários, considerando:

- CNAE.
- Código de tributação nacional.
- Código de serviço municipal, quando aplicável.
- Município de incidência.
- Natureza da operação.
- Regime tributário.
- Optante pelo Simples Nacional.
- Tratamento do ISS.
- Exigibilidade.
- Alíquota.
- Dados do tomador.
- Regras específicas da atividade.

Entretanto, **não invente nem deduza automaticamente informações fiscais que não possam ser comprovadas**.

Quando uma informação depender de validação contábil, legislação municipal ou configuração específica do contribuinte, o sistema deverá:

1. Apresentar a informação pendente.
2. Explicar por que ela é necessária.
3. Solicitar confirmação ou configuração.
4. Impedir a emissão quando a ausência gerar risco fiscal relevante.

## Cobertura municipal

A integração Nacional deverá ser priorizada, mas o projeto deverá investigar alternativas para ampliar a cobertura.

Avalie:

- Municípios integrados ao Sistema Nacional.
- Municípios com particularidades de emissão.
- Provedores municipais.
- APIs de terceiros, quando necessário.
- Possibilidade de integração futura com outros provedores.

Não prometa cobertura nacional integral antes de comprovar a viabilidade técnica e fiscal.

---

# 7. TOMADORES ESTRANGEIROS

O sistema deverá permitir a emissão de NFS-e para tomadores localizados fora do Brasil.

Os dados podem incluir:

- Nome ou razão social estrangeira.
- País.
- Endereço internacional.
- Código postal.
- Identificação fiscal estrangeira.
- Outros campos exigidos pelo leiaute aplicável.

Não presuma que um tomador estrangeiro transforma automaticamente a operação em exportação de serviços.

A caracterização da exportação e o tratamento tributário devem considerar a natureza do serviço, o resultado da prestação, a legislação aplicável e as regras municipais.

É necessário distinguir:

1. Afiliado brasileiro que presta serviço a tomador estrangeiro.
2. Afiliado estabelecido no exterior que precisa emitir documentos fiscais em outro país.

O MVP atenderá prioritariamente o primeiro cenário. A emissão fiscal local em outros países deverá ser tratada como expansão futura, com análise individual por país.

---

# 8. VALIDAÇÃO, DUPLICIDADE E REPROCESSAMENTO

Este é um dos módulos mais importantes do produto.

## Prevenção de duplicidade

O sistema deverá impedir que o mesmo documento fiscal seja emitido duas vezes por causa de:

- Reimportação de relatório.
- Reenvio de requisição.
- Atualização da página.
- Falha de rede.
- Timeout da API.
- Reinicialização do worker.
- Reprocessamento manual.
- Execução concorrente de tarefas.

Implemente mecanismos de idempotência no banco e no processamento.

A identificação de uma operação deverá considerar os dados necessários para diferenciar corretamente o documento, como:

- Cliente.
- CNPJ emissor.
- Plataforma.
- Período.
- Tomador.
- Tipo de comissão.
- Identificador da origem.
- Valor e demais dados relevantes.

A estratégia deverá evitar falsos positivos, nos quais duas operações legítimas sejam consideradas duplicadas.

## Timeout e resultado incerto

Se uma requisição for enviada e a conexão cair antes da confirmação, o sistema não deverá simplesmente enviar novamente.

Primeiro deverá consultar a situação da emissão por meio dos mecanismos oficiais disponíveis.

Estados mínimos:

- Pendente.
- Em processamento.
- Aguardando confirmação.
- Autorizada.
- Rejeitada.
- Resultado incerto.
- Cancelada.

## Rejeições

O sistema deverá:

- Interpretar os códigos de rejeição.
- Apresentar mensagens compreensíveis.
- Identificar erros corrigíveis.
- Permitir correção dos dados.
- Reprocessar somente documentos elegíveis.
- Preservar o histórico de tentativas.

Não altere automaticamente informações fiscais de forma arbitrária para tentar contornar rejeições.

---

# 9. CANCELAMENTO E SUBSTITUIÇÃO

O sistema deverá permitir solicitar cancelamento de NFS-e.

A funcionalidade deverá respeitar:

- Prazo permitido.
- Motivos aceitos.
- Regras municipais.
- Regras da API utilizada.
- Situação atual da nota.

Não considere uma nota cancelada apenas porque o pedido de cancelamento foi enviado.

Armazene e acompanhe a confirmação efetiva.

Investigue também as regras de substituição de NFS-e e implemente quando houver suporte e necessidade comprovada.

---

# 10. ENVIO AUTOMÁTICO DE E-MAIL

Depois da autorização de cada NFS-e, o sistema deverá enviar automaticamente o documento ao tomador correspondente.

O e-mail deverá conter:

- Identificação do emissor.
- Identificação do tomador.
- Número da NFS-e.
- Competência.
- Valor.
- PDF da nota.
- XML ou link seguro para acesso, conforme aplicável.
- Mensagem profissional em português.

O sistema deverá manter estados separados para:

- Situação fiscal da NFS-e.
- Situação de envio do e-mail.

Exemplo:

Uma nota pode estar autorizada, mas o e-mail pode estar pendente ou ter falhado.

O erro de e-mail não poderá provocar uma nova emissão fiscal.

Implemente:

- Tentativas controladas de reenvio.
- Registro de falhas.
- Histórico de envio.
- Proteção contra disparos duplicados.
- Configuração de remetente.
- Monitoramento da entrega, quando o provedor disponibilizar essa informação.

---

# 11. FUNCIONALIDADES DO SISTEMA

## Cadastro e conta

- Cadastro.
- Login.
- Recuperação de senha.
- Autenticação segura.
- Verificação de e-mail.
- Autenticação em dois fatores.
- Gestão de sessões.

Inicialmente, cada conta terá apenas um usuário principal.

## Gestão de empresas

Uma conta poderá cadastrar vários CNPJs.

Cada CNPJ deverá possuir configurações independentes:

- Dados cadastrais.
- Município.
- Regime tributário.
- Inscrição municipal, quando aplicável.
- Certificado A1.
- Configurações fiscais.
- Histórico de emissões.
- Limites de utilização.

As emissões deverão sempre estar associadas ao CNPJ correto.

## Dashboard

Exibir:

- Quantidade de notas emitidas.
- Quantidade de notas rejeitadas.
- Quantidade de notas pendentes.
- Total de comissões importadas.
- Valor total das notas.
- Histórico de emissões.
- Número de vendedores/tomadores.
- Tempo estimado economizado.
- Certificados próximos do vencimento.
- Consumo do plano.
- Limite disponível.

Os números deverão ser calculados a partir dos dados reais do sistema.

## Histórico

Permitir pesquisar e filtrar por:

- Período.
- CNPJ emissor.
- Plataforma.
- Tomador.
- Número da NFS-e.
- Valor.
- Status.
- Situação do e-mail.

## Documentos

Permitir baixar:

- PDF individual.
- XML individual.
- ZIP com documentos selecionados.
- Relatórios de emissão.

O acesso aos documentos deverá respeitar o isolamento entre clientes.

## Painel administrativo

Criar um painel exclusivo para o administrador do SaaS, separado da área do cliente.

Funcionalidades previstas:

- Clientes cadastrados.
- Assinaturas.
- Planos.
- Consumo.
- Emissões.
- Erros e rejeições.
- Processamentos pendentes.
- Status dos serviços.
- Logs operacionais seguros.
- Gestão de suporte.
- Indicadores financeiros básicos.

O administrador não deverá ter acesso irrestrito a certificados e senhas dos clientes.

---

# 12. PLANOS, PAGAMENTOS E COBRANÇA

Modelo comercial híbrido:

- Assinatura mensal.
- Limite de emissões incluídas.
- Cobrança adicional por excedente.
- Planos com diferentes volumes.

Faixa inicial de preço pretendida: R$ 19,90 a R$ 79,90.

Essa faixa é uma referência comercial, não uma decisão definitiva.

A estrutura de planos deverá ser validada considerando:

- Custo de infraestrutura.
- Processamento das notas.
- Armazenamento.
- Envio de e-mails.
- Provedor de pagamentos.
- Suporte.
- Integrações.
- Aquisição de clientes.
- Margem operacional.

## Regras de consumo

A unidade de consumo deverá ser uma NFS-e efetivamente autorizada, e não uma linha importada.

Defina de forma explícita o tratamento de:

- Notas rejeitadas.
- Notas canceladas.
- Notas substituídas.
- Reprocessamentos.
- Emissões duplicadas evitadas.
- Tentativas sem autorização.

A cobrança não poderá ser ambígua.

## Pagamentos

Métodos pretendidos:

- Cartão de crédito.
- PIX.

O sistema deverá permitir:

- Assinatura.
- Renovação.
- Alteração de plano.
- Controle de inadimplência.
- Cancelamento.
- Histórico de pagamentos.
- Webhooks de confirmação.

Não armazene dados completos de cartão de crédito.

A integração com o provedor de pagamento deverá utilizar mecanismos oficiais e seguros.

---

# 13. SEGURANÇA E LGPD

A segurança é requisito central, principalmente por causa dos certificados digitais e dados fiscais.

Implementar:

- Criptografia de certificados A1.
- Isolamento dos dados por cliente.
- Controle de acesso.
- Autenticação em dois fatores.
- Proteção contra acesso indevido.
- Logs de auditoria.
- Backups automáticos.
- Política de retenção.
- Exclusão de dados conforme regras aplicáveis.
- Monitoramento de acessos suspeitos.
- Proteção contra ataques comuns a aplicações web.
- Limitação de requisições.
- Validação de arquivos enviados.
- Proteção de segredos e variáveis de ambiente.

## Certificados

Preferencialmente utilizar criptografia por envelope, com chave gerenciada por serviço apropriado de KMS ou mecanismo equivalente.

Se a infraestrutura inicial não oferecer KMS, propor uma alternativa segura, documentada e com plano de evolução.

O certificado deverá ser descriptografado somente quando necessário para o processamento, evitando persistência desnecessária em disco.

## Multi-tenancy

Toda consulta e operação deverá considerar o identificador do cliente.

Não confie apenas em filtros enviados pelo frontend.

A autorização deverá ser validada no backend.

Crie testes que comprovem que um cliente não consegue acessar:

- CNPJs de outro cliente.
- Certificados de outro cliente.
- Notas de outro cliente.
- Relatórios de outro cliente.
- Arquivos de outro cliente.
- Dados de cobrança de outro cliente.

---

# 14. ARQUITETURA E TECNOLOGIA

As tecnologias ainda não foram definidas.

Você deverá recomendar a stack mais adequada, considerando:

- Facilidade de desenvolvimento com Codex.
- Manutenção.
- Segurança.
- Custo inicial.
- Escalabilidade.
- Ecossistema.
- Integrações fiscais.
- Processamento assíncrono.
- Disponibilidade de bibliotecas confiáveis.

Não considere tecnologias escolhidas previamente sem apresentar a justificativa.

## Diretriz arquitetural confirmada

A arquitetura deverá ser um **monólito modular, com processamento de filas separado**.

Isso significa:

- Uma aplicação principal organizada em módulos.
- Um processo separado para workers.
- Comunicação por filas.
- Banco de dados central.
- Serviços externos integrados por adaptadores.

Não adote microserviços prematuramente.

## Módulos sugeridos

1. Autenticação.
2. Clientes e multi-tenancy.
3. Empresas e CNPJs.
4. Certificados digitais.
5. Importação de relatórios.
6. Adaptadores de marketplaces.
7. Normalização de comissões.
8. Resolução de tomadores.
9. Configuração fiscal.
10. Motor de NFS-e.
11. Integrações fiscais.
12. Filas e processamento.
13. Documentos.
14. E-mails.
15. Assinaturas e cobrança.
16. Dashboard.
17. Administração.
18. Auditoria.

## Requisitos técnicos

- Tipagem e validação consistentes.
- Separação entre regras de negócio e infraestrutura.
- Migrações versionadas.
- Testes automatizados.
- Tratamento centralizado de erros.
- Observabilidade.
- Logs estruturados sem dados sensíveis.
- Documentação de APIs.
- Configuração por ambiente.
- Processamento seguro de tarefas.
- Estratégia de backup e restauração.

---

# 15. INTERFACE E EXPERIÊNCIA

O sistema deverá ser uma aplicação web responsiva, utilizável em computadores e celulares.

Idioma: português brasileiro.

Estilo visual:

- Moderno.
- Profissional.
- Minimalista.
- Premium.
- Fácil de entender.
- Sem excesso de elementos visuais.

A interface deverá priorizar clareza e produtividade.

O fluxo de importação e emissão deverá ser simples, com etapas visíveis e feedback claro.

O usuário deverá conseguir identificar rapidamente:

- O que foi importado.
- O que será emitido.
- Quais dados precisam de correção.
- Quais notas foram autorizadas.
- Quais foram rejeitadas.
- Quais e-mails foram enviados.

Não apresente como concluída uma operação que ainda esteja em processamento.

---

# 16. CONCORRÊNCIA E POSICIONAMENTO

Investigue e compare, usando informações atuais e verificáveis:

- MandaNotas.
- Conta Azul.
- MaisControl.
- Outros concorrentes relevantes.

A análise deverá considerar:

- Preços e limites.
- Plataformas atendidas.
- Formatos de importação.
- Agrupamento de comissões.
- Emissão em lote.
- Suporte a tomadores estrangeiros.
- Múltiplos CNPJs.
- Envio automático de e-mail.
- Certificados digitais.
- Relatórios e dashboard.
- Facilidade de uso.

Não confunda funcionalidades gerais de um ERP com um fluxo especializado de importação de relatórios de comissões e emissão de NFS-e.

## Diferenciais pretendidos

- Preço competitivo.
- Suporte a múltiplas plataformas.
- Automação completa.
- Facilidade de utilização.
- Emissão em lote.
- Suporte a tomadores estrangeiros.
- Múltiplos CNPJs.
- Envio automático das notas.
- Prevenção de erros e duplicidades.
- Dashboard completo.
- Especialização no público afiliado.

O posicionamento será de uma solução acessível, completa e especializada em afiliados.

Não entre em uma guerra de preços sem antes avaliar custos, margem e aquisição de clientes.

---

# 17. MVP E ORDEM DE IMPLEMENTAÇÃO

O MVP deverá contemplar:

- Cadastro e autenticação.
- Gestão de múltiplos CNPJs.
- Cadastro seguro de certificados A1.
- Importação CSV.
- Importação XLSX.
- Importação PDF.
- Identificação de tomadores.
- Consolidação de comissões.
- Prévia e validação.
- Emissão pela API Nacional, quando elegível.
- Envio automático de e-mail.
- Histórico.
- Download de PDF e XML.
- Gestão de planos e pagamentos.
- Tratamento de rejeições.
- Prevenção de duplicidade.
- Tomadores estrangeiros.
- Integração com TikTok Shop.
- Integração com Mercado Livre.
- Painel administrativo.

A integração Shopee também deverá ser desenvolvida como parte central do produto.

## Fases recomendadas

### Fase 0 — Descoberta e viabilidade

Antes de programar:

- Inspecionar o repositório.
- Pesquisar documentação fiscal oficial.
- Analisar os relatórios reais das plataformas.
- Identificar regras de agrupamento.
- Identificar requisitos de credenciamento.
- Avaliar riscos técnicos e fiscais.
- Definir arquitetura.
- Estimar custos.
- Definir critérios de aceitação.

Entregável: plano técnico e funcional aprovado.

### Fase 1 — Fundação

- Configuração do projeto.
- Estrutura modular.
- Banco de dados.
- Autenticação.
- Multi-tenancy.
- Cadastro de CNPJs.
- Interface inicial.
- Testes de isolamento.

### Fase 2 — Importação e normalização

- Importadores CSV e XLSX.
- Importador PDF.
- Adaptadores das plataformas.
- Normalização dos dados.
- Identificação de tomadores.
- Agrupamento.
- Prévia.
- Validação.
- Testes com relatórios reais anonimizados.

### Fase 3 — Motor fiscal

- Cadastro e proteção de certificados.
- Configuração fiscal.
- Integração com API Nacional.
- Emissão individual.
- Consulta de situação.
- Idempotência.
- Tratamento de rejeições.
- Cancelamento, quando suportado.
- Testes em ambiente apropriado.

### Fase 4 — Processamento e e-mail

- Filas.
- Workers.
- Controle de concorrência.
- Retentativas seguras.
- Recuperação de falhas.
- Armazenamento de documentos.
- Envio automático de e-mail.
- Histórico de entrega.

### Fase 5 — Monetização

- Planos.
- Limites.
- Consumo.
- Excedentes.
- PIX.
- Cartão.
- Webhooks.
- Cancelamento de assinatura.

### Fase 6 — Administração e acabamento

- Dashboard completo.
- Painel administrativo.
- Relatórios.
- Responsividade.
- Melhorias de UX.
- Monitoramento.
- Documentação.

### Fase 7 — Preparação para produção

- Testes de segurança.
- Testes de carga.
- Testes de isolamento.
- Backup e restauração.
- Revisão de LGPD.
- Monitoramento.
- Revisão de custos.
- Checklist de produção.
- Homologação com usuários reais.

Não avance automaticamente para produção enquanto existirem riscos fiscais, de segurança ou de integridade de dados não resolvidos.

---

# 18. TESTES E CRITÉRIOS DE QUALIDADE

O projeto deverá ter testes proporcionais ao risco de cada módulo.

## Testes unitários

Cobrir:

- Importação.
- Normalização.
- Agrupamento.
- Identificação de tomadores.
- Cálculo de valores.
- Regras de consumo.
- Validações fiscais.
- Idempotência.
- Estados de emissão.

## Testes de integração

Cobrir:

- Banco de dados.
- Filas.
- Workers.
- Certificados.
- Integração fiscal.
- E-mail.
- Pagamentos.
- Armazenamento de documentos.

## Testes ponta a ponta

Simular o fluxo:

1. Criar conta.
2. Cadastrar CNPJ.
3. Configurar certificado de teste.
4. Importar relatório.
5. Revisar notas.
6. Confirmar emissão.
7. Processar documentos.
8. Consultar resultados.
9. Enviar e-mail.
10. Consultar histórico.

Utilize mocks e ambientes de homologação quando apropriado. Nunca realize emissões reais sem autorização explícita.

## Critérios para concluir uma tarefa

Uma tarefa só poderá ser considerada concluída quando:

- A implementação estiver realizada.
- Os testes relevantes forem executados.
- Os erros encontrados forem corrigidos ou documentados.
- A documentação necessária estiver atualizada.
- Não houver regressões conhecidas.
- As limitações restantes estiverem explicitadas.

---

# 19. MARKETING E AQUISIÇÃO DE CLIENTES

Canais pretendidos:

- Instagram.
- TikTok.
- Google Ads.
- SEO e conteúdo.
- Parcerias com contadores.
- Comunidades de afiliados.
- YouTube.
- Programa de indicação.

O primeiro objetivo comercial será conquistar os primeiros clientes pagantes e validar o produto.

O orçamento inicial ainda não foi definido. Priorize uma infraestrutura enxuta, sem comprometer segurança e confiabilidade.

---

# 20. RISCOS QUE DEVEM SER INVESTIGADOS

Antes de assumir que o produto é tecnicamente e comercialmente viável, investigue:

1. Requisitos reais para emissão pela API Nacional.
2. Cobertura e elegibilidade dos municípios.
3. Compatibilidade dos certificados A1.
4. Regras fiscais para cada tipo de comissão.
5. Diferenças entre tomadores de cada plataforma.
6. Regras para tomadores estrangeiros.
7. Disponibilidade e qualidade dos relatórios.
8. Alterações frequentes nos layouts das plataformas.
9. Custos de processamento e envio.
10. Concorrência e aquisição de clientes.
11. Margem dos planos propostos.
12. Obrigações de segurança e LGPD.
13. Limites e condições das APIs utilizadas.

Classifique cada risco por:

- Gravidade.
- Probabilidade.
- Impacto.
- Estratégia de mitigação.
- Dependência externa.
- Necessidade de validação humana.

---

# 21. COMO O CODEX DEVE CONDUZIR O PROJETO

Esta seção define o método de trabalho esperado.

## Regra 1 — Trabalhar em etapas pequenas

Divida o desenvolvimento em tarefas pequenas, independentes e verificáveis.

Evite alterações gigantes que misturem banco de dados, frontend, integrações e regras fiscais sem necessidade.

## Regra 2 — Planejar antes de implementar

Para cada etapa:

1. Explique o objetivo.
2. Identifique os arquivos e módulos afetados.
3. Identifique dependências.
4. Identifique riscos.
5. Defina critérios de aceitação.
6. Implemente.
7. Execute testes.
8. Corrija falhas.
9. Atualize documentação.

## Regra 3 — Preservar o projeto

- Não sobrescreva arquivos sem entender sua função.
- Não remova funcionalidades existentes sem justificativa.
- Não altere configurações sensíveis sem necessidade.
- Não faça mudanças destrutivas no banco sem migração.
- Não descarte alterações do usuário.
- Não faça commits automaticamente sem autorização, salvo se o usuário solicitar esse fluxo.

## Regra 4 — Utilizar Git

Mantenha as alterações organizadas.

Quando apropriado:

- Crie commits pequenos e descritivos, somente quando autorizado.
- Evite misturar refatoração e funcionalidades não relacionadas.
- Preserve um histórico compreensível.
- Não faça push ou publicação sem autorização.

## Regra 5 — Não esconder limitações

Se uma integração não puder ser concluída por falta de:

- Credenciais.
- Certificado de teste.
- Acesso a ambiente de homologação.
- Documentação.
- Dados reais.
- Autorização externa.

Implemente o que for possível com segurança, documente a limitação e indique exatamente o que falta.

Não simule uma integração real como se estivesse funcionando.

## Regra 6 — Não avançar com erros críticos

Se os testes revelarem falhas de segurança, duplicidade fiscal, isolamento de dados ou integridade financeira, corrija antes de avançar para funcionalidades dependentes.

## Regra 7 — Manter documentação atualizada

Mantenha, conforme a necessidade:

- `README.md`
- `AGENTS.md`
- Documentação da arquitetura.
- Documentação das APIs.
- Modelo de dados.
- Guia de instalação.
- Guia de configuração.
- Guia de testes.
- Registro de decisões técnicas.
- Registro de riscos e limitações.

---

# 22. PRIMEIRA TAREFA DO CODEX

**Não comece implementando o sistema inteiro.**

Sua primeira tarefa será realizar uma análise de descoberta e planejamento.

Execute as seguintes atividades:

1. Inspecione o repositório e o ambiente de desenvolvimento.
2. Leia as instruções existentes.
3. Identifique se já existe código ou estrutura aproveitável.
4. Pesquise a documentação oficial atual da NFS-e Nacional.
5. Identifique os requisitos de credenciamento e emissão.
6. Analise as integrações necessárias para Shopee, TikTok Shop e Mercado Livre.
7. Identifique quais relatórios e formatos precisam ser suportados.
8. Investigue as regras de agrupamento e os diferentes tomadores.
9. Proponha uma arquitetura adequada ao monólito modular com workers separados.
10. Recomende as tecnologias e justifique cada escolha.
11. Proponha o modelo inicial de banco de dados.
12. Defina a estrutura de pastas e módulos.
13. Proponha o fluxo de filas e processamento.
14. Defina a estratégia de segurança dos certificados A1.
15. Identifique riscos fiscais, técnicos e comerciais.
16. Estime custos iniciais de infraestrutura e serviços, deixando explícitas as hipóteses.
17. Organize um roadmap de desenvolvimento com tarefas e critérios de aceitação.

## Entregáveis obrigatórios da primeira tarefa

Apresente:

- Diagnóstico do repositório.
- Relatório de viabilidade técnica.
- Arquitetura recomendada.
- Comparação das tecnologias consideradas.
- Modelo de dados inicial.
- Estrutura de diretórios proposta.
- Fluxo completo de emissão.
- Estratégia de processamento assíncrono.
- Estratégia de segurança.
- Mapa das integrações externas.
- Matriz de riscos.
- Estimativa inicial de custos.
- Roadmap priorizado.
- Lista de informações que ainda dependem de validação.

**Ao terminar, aguarde minha aprovação antes de iniciar a implementação.**

---

# 23. ORIENTAÇÃO FINAL

O objetivo não é simplesmente criar um emissor de notas fiscais.

O objetivo é desenvolver um SaaS comercial, confiável e especializado em automatizar o processo fiscal dos afiliados brasileiros que recebem comissões de marketplaces.

A prioridade é construir uma solução que funcione corretamente em situações reais, que não emita notas duplicadas, que proteja os certificados digitais e que trate corretamente os diferentes tomadores e cenários fiscais.

Trabalhe como um engenheiro de software sênior responsável pelo produto, com atenção especial à segurança, integridade fiscal, qualidade do código e sustentabilidade da operação.

**Comece pela primeira tarefa: descoberta, análise de viabilidade e planejamento. Não programe antes de apresentar os entregáveis e receber aprovação.**