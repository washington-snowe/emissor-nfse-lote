# Descoberta e viabilidade — Fase 0

> Registro original da descoberta. A stack foi posteriormente substituída por Next.js/React/TypeScript + Vercel/Supabase. Consulte [a decisão atual](decisoes/0001-vercel-supabase.md) e [o estado da fundação](fundacao.md); estimativas e tarefas específicas de Django/Celery precisam de revisão.

Data de referência: 10/11/2026 (America/Sao_Paulo). Estado: **proposta para revisão; viabilidade fiscal e comercial não confirmada**.

## Diagnóstico observado

Inspeção em `/workspace/emissor-nfse-lote`: diretório continha apenas `.git`, branch simbólica `work` sem commits, sem código, instruções, manifests, lockfiles, testes ou CI. `git ls-remote --symref origin` terminou com sucesso e sem referências; a branch remota `main` solicitada ainda não existe. Nenhuma alteração de usuário foi descartada.

O ambiente cloud está conectado, com política restrita aplicada. Node 24.22.1, Python 3.12.14 e executável Docker estão presentes. A presença de Docker não comprova daemon funcional. PostgreSQL, Redis, toolchain completa, builds e execução não foram validados, pois não há implementação aprovada. As variáveis DATABASE_URL e REDIS_URL não estão presentes; a configuração do ambiente não declara segredos de aplicação. O acesso Git existente funciona, sem necessidade de solicitar token.

Uma consulta HTTPS a `https://www.gov.br/nfse/pt-br` falhou no CONNECT do proxy com HTTP 403, antes de receber o conteúdo oficial. Não foi possível validar documentação fiscal atual, preços ou recursos comerciais. O rascunho do ambiente recebeu permissões propostas para pesquisa; salvar o rascunho não aplica nem publica a configuração.

## Parecer técnico

### Recorte confirmado pelo usuário

- MEI: atendimento pretendido em qualquer município do país.
- ME e EPP do Simples Nacional: qualquer município para competências a partir de novembro de 2026, conforme referência do usuário à Resolução CGSN nº 191/2026.
- ME/EPP até outubro de 2026: somente municípios que já emitiam pelo Emissor Nacional ou prefeituras integradas, nos termos a confirmar.
- Empresas do regime normal não são atendidas.

Este é o escopo comercial informado, não uma conclusão de pesquisa jurídica. Número, texto, vigência, exceções e efeitos da resolução precisam ser conferidos na fonte oficial. Não foi confirmado que adesão, integração de dados e emissão direta via API sejam equivalentes. A aplicação futura distinguirá enquadramento por competência, evidência normativa e prontidão operacional. O alcance pretendido para MEI não equivale a uma integração já homologada em todo município.

**Viabilidade de engenharia: plausível, condicionada.** Importação, revisão, filas, documentos, isolamento e assinaturas são compatíveis com um monólito modular. Não é possível confirmar que o produto pode emitir para todo o público pretendido sem comprovar elegibilidade do contribuinte, município, integração e tomadores reais.

O maior risco não é processar muitas linhas: é atribuir corretamente cada comissão, emitir com dados comprovados e resolver resultados incertos sem duplicação. O produto precisa bloquear ambiguidades e preservar a trilha da origem até o documento autorizado.

### Portões de viabilidade

| Portão | Evidência necessária | Estado |
| --- | --- | --- |
| Documentação Nacional vigente | Manuais, XSD, autenticação, operações, consultas e retornos com versão | Bloqueado por rede |
| Elegibilidade do piloto | Município/UF, regime, credenciamento, ambiente apropriado e certificado de teste | Pendente |
| Atribuição dos tomadores | Relatórios e demonstrativos de cada modalidade, contratos e validação contábil | Pendente |
| Prevenção de duplicidade externa | Identificador aceito oficialmente e consulta que resolva envio incerto | Pendente da documentação e homologação |
| Economia unitária | Cotação real de infraestrutura, canais, suporte e pagamentos | Estimativa por hipóteses |
| Segurança A1 | Provedor de chaves, autorização mínima, rotação e recuperação testadas | Proposta |

Não há parecer jurídico ou contábil neste documento. Cobertura nacional, exportação de serviços e regras particulares de comissões não estão comprovadas.

## Escopo da entrega

Documentar arquitetura, alternativas, dados, processamento, segurança, integrações, riscos, custos e critérios de execução. Nenhum cadastro, importador, endpoint fiscal, certificado, cobrança ou simulação de emissão foi implementado. Não houve emissão, contratação, commit, push ou deploy.

## Informações ainda necessárias

Para finalizar a descoberta, não para redigir a arquitetura:

1. O recorte de regimes foi respondido pelo usuário acima. Para executar homologação futura, selecionar um CNPJ piloto MEI ou ME/EPP elegível e seus parâmetros fiscais com responsável contábil; não restringir a arquitetura a um município. Não solicitar CNPJ ou senha em chat se desnecessários à análise.
2. Relatórios reais anonimizados de Shopee, TikTok Shop e Mercado Livre, incluindo arquivos CSV, XLSX e PDFs que realmente existam. Preservar estrutura, cabeçalhos, identificadores estáveis fictícios e casos de estorno/campanha, retirando dados pessoais.
3. Documentos ou instruções das plataformas que comprovem quem contrata cada modalidade de comissão e quando emitir. “Quem paga” ou o nome do vendedor na planilha, isoladamente, não provam o tomador.
4. Documentação oficial acessível; requisitos de credenciamento e certificado de teste entram antes da homologação, não precisam ser enviados agora. Senhas e certificados nunca devem ser colados no chat.
5. Volume mensal, pico por lote, tamanho de arquivos, orçamento e necessidades de suporte para refinar infraestrutura e custos.
6. Definição comercial de canceladas, substituídas, excedentes, carência e inadimplência; proposta em arquitetura, não aplicada.

A falta de relatório de uma plataforma bloqueia o seu adaptador; não impede planejar o núcleo ou, após aprovação, desenvolver fundação e contrato de normalização. A falta de credenciais fiscais bloqueia homologação real, sem justificar inventar respostas.

## Aprovação solicitada ao final

Aprovar ou ajustar a stack e o roadmap propostos antes da Fase 1. A aprovação da arquitetura não comprova os portões fiscais, não autoriza produção e não transforma regras pendentes em requisitos validados.
