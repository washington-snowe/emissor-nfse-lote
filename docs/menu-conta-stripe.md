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

| Plano | Mensal | Anual, total | Notas por mês | Cada excedente |
| --- | ---: | ---: | ---: | ---: |
| Start | R$ 14,90 | R$ 143,04 | 150 | R$ 0,0993 |
| Afiliado Pro | R$ 34,90 | R$ 335,04 | 600 | R$ 0,0582 |
| Escala | R$ 69,90 | R$ 671,04 | 2.500 | R$ 0,0280 |
| Top Afiliado | R$ 139,90 | R$ 1.343,04 | 10.000 | R$ 0,0140 |

Anual vem selecionado e custa 80% de doze mensalidades, em uma única cobrança por ano. O Afiliado Pro recebe o único selo “Mais Escolhido”. Todos incluem CNPJs sem limite. A franquia é mensal, inclusive no plano anual, e segue a data original da assinatura. A migração 25 preserva os planos e as referências antigas para o histórico, protege as tabelas internas com RLS e adiciona o catálogo vigente.

O upgrade mantém a frequência e a data de renovação da assinatura. O Portal da Stripe apresenta a diferença proporcional ao tempo restante e cobra esse valor ao confirmar a alteração. Na próxima renovação, cobra o novo preço integral. A troca de frequência fica fora desse fluxo de upgrade.

## Ativar a Stripe em teste

1. Confira se a migração `202611230025_billing_catalog_and_rls.sql` está aplicada. As anteriores permanecem registradas. Os arquivos de `tests/database` são para o PostgreSQL descartável.
2. Após o deploy, no ambiente de teste da Stripe, criar destino de eventos para:
   `https://www.rexnotas.com.br/api/stripe/webhook`.
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
8. Confirmar upgrade mantendo a frequência da assinatura, atualização do meio de pagamento e cancelamento agendado no Portal. A Stripe mostra ajustes proporcionais antes da confirmação. Retorno `?retorno=sucesso` não ativa plano por si só: o estado vem do webhook e da consulta autenticada ao provedor.

A publicação do código não configura a conta Stripe nem os segredos. O executor não possui essas credenciais. Ativação real exige a configuração comercial da conta e validação do fluxo no ambiente de teste. Chaves test/live e seus dados ficam separados; não trocar chaves como forma de transformar testes em pagamentos reais.

## Consumo e excedentes

Somente uma NFS-e autorizada em produção gera uma unidade de consumo. Documento e uso são gravados na mesma transação. Homologação fica fora da franquia. Operações anteriores sem assinatura ficam no histórico sem cobrança retroativa.

Cada excedente é avaliado com a tarifa vigente na autorização e registrado em unidades inteiras de R$ 0,0001. Quando a soma chega a R$ 0,50, o mínimo documentado pela Stripe em BRL, o worker cria uma fatura separada e tenta cobrar automaticamente no cartão salvo. O valor é truncado para centavos na fatura e a fração restante passa para o próximo lote da assinatura. Saldos abaixo do mínimo continuam acumulados. O histórico distingue fatura em aberto de pagamento confirmado pelo webhook.

O worker registra a intenção, vincula a fatura ao lote e valida cliente, moeda, vínculo e total antes de cobrar. Cada etapa usa chave de idempotência própria. Resposta indefinida exige consulta da fatura original. Se não houver comprovante após a janela de 23 horas, o lote fica para intervenção. A migração mantém o fluxo dos excedentes antigos que já tinham sido prometidos para a renovação.

## Indicações

Cada conta possui código aleatório e link próprio. Um novo usuário pode vincular uma indicação nas primeiras 24 horas, antes de pagar; o cadastro conserva o código em cookie HttpOnly até a confirmação. O servidor não aceita tenant vindo do link. Autorindicação, troca após vínculo e ciclos são recusados. Dados pessoais do indicado não são mostrados ao indicador; o painel exibe agregados.

A regra aprovada é **20% somente no primeiro pagamento confirmado**, sem comissão de renovação. O cálculo considera o cartão efetivamente capturado, após desconto/estorno e antes das tarifas Stripe, com arredondamento para centavos. Pagamento zero não gera comissão. A lista oficial de faturas pagas identifica o primeiro pagamento mesmo quando eventos chegam fora de ordem. Estorno parcial ou total recalcula esse mesmo crédito; uma renovação não passa a valer como primeiro pagamento depois de um estorno.

Comissões são registros para repasse, não transferências de dinheiro. Método, identificação do recebedor, calendário e liberação de repasses ainda precisam ser configurados; nenhum saldo é apresentado como dinheiro já transferido ou imediatamente sacável. O código não movimenta fundos para indicados sem essa configuração.

## Evidência e limites

Fontes oficiais e versão REST estão em `integrations/stripe/provenance.json`. Requisições só usam `api.stripe.com`, TLS, limite de corpo/prazo e nenhuma redireção. Checkout/Portal/faturas só aceitam URLs HTTPS dos hosts próprios do provedor. Webhook verifica o corpo original por HMAC v1 e tolerância de cinco minutos; campos de depuração não autenticam nada. Eventos são idempotentes e serializados por cliente; dados atuais são consultados antes de persistir estado.

Os testes de banco usam Auth/Stripe sintéticos em PostgreSQL descartável. O teste de consumo relaxa a restrição de produção **somente numa transação local com rollback**, sem API externa; não libera a produção real. Testes de UI usam ações de fronteira sintéticas. Chaves reais, Checkout real em sandbox, entrega de e-mail e repasses não foram verificados neste ambiente.
