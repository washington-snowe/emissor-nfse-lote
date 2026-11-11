# Custos, sustentabilidade e riscos

Estimativas de planejamento, não cotações atuais. A pesquisa externa está bloqueada; não há contrato, provedor escolhido ou serviço contratado. Os números não incluem promessas de SLA.

## Hipóteses de piloto

- Uma região, um web, um worker e um processo recorrente, com 2–4 vCPU/4–8 GB no conjunto; capacidade exata deve ser medida.
- Até 50 contas, 5.000 documentos autorizados/mês e 5.000 e-mails/mês; picos controlados, sem OCR massivo.
- Hipótese de 0,5 MB por conjunto de documentos: cerca de 2,5 GB/mês antes de relatórios, versões e backups. Em 12 meses seriam cerca de 30 GB brutos, sem presumir prazo legal de retenção.
- PostgreSQL com backup, storage privado, chave gerenciada e monitoramento básico; sem alta disponibilidade completa. Coabitar componentes pode reduzir custo e elevar risco de contenção/falha.

| Item | Reserva mensal em USD | Observação |
| --- | ---: | --- |
| Aplicação e workers | 15–35 | Hipótese de capacidade; OCR em pico pode exigir mais |
| PostgreSQL/backup do serviço | 20–50 | Conferir retenção, recuperação e limites reais |
| Broker/cache | 0–15 | Zero só se coabitado no compute já pago, sem HA |
| Objetos e tráfego | 2–10 | Depende de volume, retenção e downloads |
| E-mail | 0–15 | Gratuidade eventual não é garantia de operação futura |
| Chaves/KMS | 3–10 | Confirmar cobrança por chave e operação |
| Logs/monitoramento | 0–20 | Retenção limitada e sem payloads sensíveis |
| Cópia de backup independente | 5–15 | Evitar contar a mesma proteção duas vezes |
| **Total de reserva** | **45–170** | Sem impostos, câmbio, suporte, desenvolvimento e pagamentos |

Conversão **hipotética** de R$ 5,50/USD: R$ 247,50–935,00/mês, antes de impostos/spread. Não é câmbio consultado. Domínio, assessoria contábil/jurídica/LGPD, aquisição de clientes e incidentes são itens adicionais. Um intermediador fiscal, se necessário, adiciona custo ainda não cotado; não assumir emissão gratuita porque a integração principal é pública. OCR por página e tráfego devem entrar no custo variável após benchmark.

### Economia unitária

Margem de contribuição por conta = preço − tarifa percentual − tarifa fixa − custo variável de emissão/armazenamento/e-mail/OCR − suporte variável − tributos aplicáveis. CAC e custo fixo ainda precisam ser recuperados por essa margem. Excedente deve cobrir custo e risco sem incentivar emissões incorretas.

Exemplo ilustrativo, **não cotação**: tarifa de pagamento de 4% + R$ 0,50, operação variável de R$ 2 e suporte de R$ 5 por conta/mês. Plano de R$ 19,90 deixa R$ 11,604 antes de tributos/CAC; plano de R$ 79,90 deixa R$ 69,204. Para cobrir R$ 600 fixos seriam, respectivamente, pelo menos 52 ou 9 contas sob essas hipóteses homogêneas. Mais volume pode elevar custo variável, logo não usar o exemplo para fixar limites de planos.

Preço/limite/custo de excedente e tratamento de canceladas/substituídas só serão definidos após cotação, medição, validação comercial e termos. R$ 19,90 não deve ser prometido para volume ilimitado. Medir minutos de suporte, páginas OCR, MB retidos, operações de chave e tempo de worker por documento desde o piloto.

## Matriz de riscos

Probabilidades qualitativas são estimativas pré-evidência, não estatística. Gravidade: crítica compromete integridade/segurança; alta compromete operação/comércio; média é administrável. Impacto é a consequência concreta.

| Risco | Gravidade | Probabilidade inicial | Impacto | Mitigação/critério | Dependência externa | Validação humana |
| --- | --- | --- | --- | --- | --- | --- |
| Regra de 11/2026 ou abrangência interpretada incorretamente | Crítica | Não determinada | Emissão inelegível ou promessa incorreta | Conferir resolução, vigência/exceções e separar norma de API | Fonte oficial/CGSN | Contábil/jurídica |
| Município ou competência histórica sem emissão direta | Alta | Média | Parte do público sem cobertura | Matriz histórica comprovada e bloqueio; alternativa só se necessária | Nacional/município | Fiscal |
| A1 válido, porém sem acesso/representação adequada | Alta | Média | Falha de homologação ou uso indevido | Conferir titularidade, credenciamento e teste autorizado | Credenciamento/ICP | Responsável do CNPJ |
| Tomador incorreto por modalidade de comissão | Crítica | Alta até obter amostras | Documento fiscal incorreto | Evidência contratual, regra versionada e revisão obrigatória | Marketplaces/contratos | Contador/cliente |
| Duplicação após timeout ou queda | Crítica | Média | Dupla emissão/consumo | Identidade estável, outbox, consulta oficial e bloqueio de incertos | Recursos da API | Operação em casos inconclusivos |
| Reimportação ou correção sem IDs confiáveis | Alta | Alta até obter amostras | Duplicação ou perda de receita legítima | Identidades separadas, colisões em revisão e reconciliação | Layout da plataforma | Cliente |
| Vazamento ou abuso de A1 | Crítica | Média | Uso fiscal indevido de clientes | Envelope, IAM mínimo, rotação e processamento em memória | KMS/infra | Segurança |
| Acesso entre tenants via job/arquivo/API | Crítica | Média | Vazamento fiscal/LGPD | Autorização backend, FKs compostas, RLS e testes negativos | Infra/banco | Revisão de segurança |
| PDF/OCR incorreto ou malicioso | Alta | Alta | Valores errados/indisponibilidade | Limites, sandbox, confiança e conciliação; bloquear desconhecidos | Qualidade da origem | Revisão de importação |
| Serviço exterior tratado automaticamente como exportação | Crítica | Média | Tributação indevida | Configuração comprovada, sem inferência por país | Legislação aplicável | Contador |
| Leiaute/retorno fiscal muda | Alta | Média | Rejeições ou parsing incorreto | Contratos versionados, validação estrita e monitoramento de mudanças | Nacional | Engenharia/fiscal |
| Notificação falha ou duplica após aceite incerto | Média | Média | Documento não recebido/reclamações | Estado separado, idempotência e consulta de entrega | E-mail | Suporte quando inconclusivo |
| Webhook falso/duplicado/fora de ordem | Alta | Média | Acesso/consumo/cobrança incorretos | Assinatura, replay protection, ledger e reconciliação | Pagamentos | Financeiro para exceções |
| Perda de chave, backup ou restauração que reemite | Crítica | Média | Irrecuperabilidade/duplicação | Backup separado, teste de restore e reconciliação pré-worker | Infra/KMS | Operação |
| Retenção inadequada e exclusão prematura | Alta | Média | Descumprimento fiscal/LGPD | Política por categoria e base legal; minimização | Jurídico/contábil | Obrigatória |
| Preço baixo, suporte/CAC altos | Alta | Alta até medir | Margem negativa | Piloto, custos por conta e contribuição por plano | Provedores/mercado | Comercial |
| Sem amostras e pesquisa bloqueada | Alta | Certa nesta execução | Descoberta incompleta | Permissão de rede e relatórios anonimizados | Usuário/configuração | Revisão da descoberta |

## Decisões comerciais ainda abertas

Plano e excedente por conta versus por CNPJ; limites e reserva de consumo; cancelamento/substituição e erros do produto; período de cobrança; inadimplência; armazenamento e retenção; política de suporte; orçamento e metas de CAC. Não ativar cobrança antes de termos claros e testes de integridade.
