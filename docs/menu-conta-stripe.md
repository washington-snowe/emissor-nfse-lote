# Menu, conta, assinatura e indicações

## Organização

A imagem enviada pelo usuário define a organização do painel. API não aparece no menu; endpoints internos de processamento e webhook continuam privados ou autenticados por assinatura.

- Início: visão geral existente.
- Notas: histórico e processamento da empresa selecionada.
- Emitir: Notas em lote (CSV, revisão e fila existentes) e Nota avulsa Shopee.
- Empresa: Cadastro, Serviço, Avançado e Certificado. Gerenciar empresas conserva o cadastro de vários CNPJs.
- Conta: Perfil, Login, Assinatura e Indicações.

O topo seleciona somente empresas da própria conta. A preferência é um cookie HttpOnly, validado contra as empresas do usuário; não escolhe tenant nem autoriza acesso. Atalhos, histórico, formulário de lote, nota individual e certificados usam essa empresa. Links diretos para empresa/revisão próprias mantêm o contexto correto. Conta e assinatura abrangem todos os CNPJs do usuário. Durante a atualização, se a RPC da migração 13 ainda não existir, Notas conserva a consulta anterior de todas as empresas da própria conta com aviso explícito; não arredonda valores nem contorna erros de permissão.

Serviço e Avançado reaproveitam o perfil versionado. A primeira configuração continua completa; nas edições seguintes, o servidor combina somente os campos permitidos da seção com os dados atuais da outra. Alteração concorrente ainda causa conflito de versão. Não existem códigos tributários presumidos.

Perfil salva nome e telefone opcional com versão esperada. Login permite alterar e-mail, senha e encerrar outras sessões, exigindo a senha atual e quota por conta. E-mail depende das confirmações do Supabase; a mudança não pula essa verificação. Senhas não são armazenadas em tabelas, logs ou estados de resposta e os campos são limpos ao terminar a solicitação. Revogação de outras sessões afeta a renovação; JWTs já emitidos seguem a validade do provedor. MFA permanece removido conforme solicitação anterior.

## Preços aprovados pelo usuário

| Plano | Mensal | Trimestral, total | Notas por mês | Cada excedente |
| --- | ---: | ---: | ---: | ---: |
| Start | R$ 19,90 | R$ 40,00 | 150 | R$ 0,30 |
| Afiliado | R$ 39,90 | R$ 80,20 | 500 | R$ 0,18 |
| Afiliado 5x | R$ 99,90 | R$ 200,80 | 2.500 | R$ 0,06 |
| Afiliado 10x | R$ 149,90 | R$ 301,30 | 5.000 | R$ 0,05 |
| Afiliado 20x | R$ 199,90 | R$ 401,80 | 10.000 | R$ 0,03 |

Todos incluem CNPJs sem limite. O trimestre corresponde a três mensalidades multiplicadas por 67%, arredondando apenas o total para centavos, com inteiros/BigInt. O desconto não altera o preço unitário dos excedentes. A franquia é mensal também no trimestre, ancorada na data original da assinatura, com ajuste de meses curtos. Não há acúmulo da franquia de um mês para outro.

## Ativar a Stripe em teste

1. Aplicar somente `202611120013_account_and_referrals.sql` e depois `202611120014_stripe_billing.sql`. Não repetir migrações 1–12. Não executar `tests/database` no Supabase remoto.
2. Após o deploy, no ambiente de teste da Stripe, criar destino de eventos para:
   `https://emissor-nfse-lote-kjou.vercel.app/api/stripe/webhook`.
3. Selecionar eventos: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `invoice.voided`, `invoice.marked_uncollectible`, `charge.refunded`.
4. Na Vercel do projeto **emissor-nfse-lote-kjou**, configurar as variáveis privadas abaixo, além das já existentes `SUPABASE_SERVICE_ROLE_KEY` e `CRON_SECRET`:

| Variável | Valor/origem |
| --- | --- |
| `STRIPE_SECRET_KEY` | Chave secreta de teste `sk_test_…` da sua conta Stripe. |
| `STRIPE_WEBHOOK_SECRET` | Segredo `whsec_…` do destino de eventos criado no passo 2. |
| `STRIPE_BILLING_ENABLED` | `true` para habilitar a integração depois de configurar os dois segredos. Padrão no repositório: `false`. |

5. Fazer novo deploy para carregar as variáveis. Não enviar os valores no chat nem usar `NEXT_PUBLIC`. Não é necessária chave publishable da Stripe: Checkout e Portal são hospedados pelo provedor.
6. Entrar em Conta → Assinatura e selecionar um plano. Produtos, preços e configuração do Portal são provisionados pela aplicação na própria Stripe conforme a contratação. Não há dados completos de cartão no aplicativo.
7. Usar somente dados de cartão de teste documentados pela Stripe no Checkout. Após concluir, conferir assinatura e pagamento no painel, além da entrega 2xx dos eventos no Dashboard Stripe.
8. Confirmar alteração de plano/cadência, atualização do meio de pagamento e cancelamento agendado no Portal. A Stripe mostra ajustes proporcionais antes da confirmação. Retorno `?retorno=sucesso` não ativa plano por si só: o estado vem do webhook e da consulta autenticada ao provedor.

A publicação do código não configura a conta Stripe nem os segredos. O executor não possui essas credenciais. Ativação real exige a configuração comercial da conta e validação do fluxo no ambiente de teste. Chaves test/live e seus dados ficam separados; não trocar chaves como forma de transformar testes em pagamentos reais.

## Consumo e excedentes

Somente uma NFS-e autorizada em produção gera uma unidade de consumo. Documento e registro de uso são gravados na mesma transação; a operação é única. Rejeição, arquivo importado, preparação e homologação não geram consumo pago. O núcleo fiscal atual continua bloqueando produção: nenhum teste com A1 real ou autorização de produção foi declarado.

Ao ultrapassar a franquia, o registro preserva preço, mês e assinatura daquele uso. O worker reúne até 500 unidades compatíveis e cria item pendente na Stripe para a próxima fatura, inclusive quando a cobrança fixa é trimestral. O valor é exato; não estima consumo a partir de linhas de CSV. Documento fiscal nunca deixa de ser registrado por ausência de configuração comercial: nesse caso o consumo fica sem precificação e exige revisão operacional.

Lotes de cobrança têm reserva, token, intenção persistida e chave de idempotência. Resposta perdida exige consulta dos itens Stripe por metadado do lote. A janela de reuso é limitada a 23 horas; fora dela, sem comprovante localizado, vai para intervenção, sem outro POST. O Cron diário/manual recupera interrupções; não há promessa de processamento contínuo no Hobby. Itens pendentes após término de uma assinatura e situações sem preço exigem conferência operacional antes de eventual fatura final; o aplicativo não cria cobrança final inesperada automaticamente.

## Indicações

Cada conta possui código aleatório e link próprio. Um novo usuário pode vincular uma indicação nas primeiras 24 horas, antes de pagar; o cadastro conserva o código em cookie HttpOnly até a confirmação. O servidor não aceita tenant vindo do link. Autorindicação, troca após vínculo e ciclos são recusados. Dados pessoais do indicado não são mostrados ao indicador; o painel exibe agregados.

A regra aprovada é **20% somente no primeiro pagamento confirmado**, sem comissão de renovação. O cálculo considera o cartão efetivamente capturado, após desconto/estorno e antes das tarifas Stripe, com arredondamento para centavos. Pagamento zero não gera comissão. A lista oficial de faturas pagas identifica o primeiro pagamento mesmo quando eventos chegam fora de ordem. Estorno parcial ou total recalcula esse mesmo crédito; uma renovação não passa a valer como primeiro pagamento depois de um estorno.

Comissões são registros para repasse, não transferências de dinheiro. Método, identificação do recebedor, calendário e liberação de repasses ainda precisam ser configurados; nenhum saldo é apresentado como dinheiro já transferido ou imediatamente sacável. O código não movimenta fundos para indicados sem essa configuração.

## Evidência e limites

Fontes oficiais e versão REST estão em `integrations/stripe/provenance.json`. Requisições só usam `api.stripe.com`, TLS, limite de corpo/prazo e nenhuma redireção. Checkout/Portal/faturas só aceitam URLs HTTPS dos hosts próprios do provedor. Webhook verifica o corpo original por HMAC v1 e tolerância de cinco minutos; campos de depuração não autenticam nada. Eventos são idempotentes e serializados por cliente; dados atuais são consultados antes de persistir estado.

Os testes de banco usam Auth/Stripe sintéticos em PostgreSQL descartável. O teste de consumo relaxa a restrição de produção **somente numa transação local com rollback**, sem API externa; não libera a produção real. Testes de UI usam ações de fronteira sintéticas. Chaves reais, Checkout real em sandbox, entrega de e-mail e repasses não foram verificados neste ambiente.
