# Entrega de NFS-e por e-mail

A ordem configurada é **Brevo → SendPulse → Mailjet**. É possível começar só com o Brevo e adicionar os demais depois. Não há contratação automática nem credenciais neste repositório.

## O que já funciona no código

- O popup mostra o e-mail do vendedor associado a cada nota, lido do CSV original validado. O tomador fiscal continua sendo a pessoa escolhida na revisão: destino de cópia e tomador não são a mesma coisa.
- Uma nota só entra na entrega depois de estar autorizada, com XML armazenado. A confirmação do lote inclui autorização de entrega quando a integração está ativa. Lotes anteriores exigem **Preparar entrega de e-mails em homologação** na página do próprio lote.
- Há uma entrega por documento. O XML é anexado ao e-mail com emissor, tomador, número, competência e valor. PDF oficial ainda não está disponível no sistema e não é simulado.
- Endereço ausente/inválido fica pendente, sem adivinhar e-mail. A tela da nota permite corrigir o e-mail ausente e solicitar nova tentativa, sem mudar ou reemitir a nota. Consolidações que misturam vendedores/destinos ficam bloqueadas para evitar compartilhar valores de terceiros.
- Cada mensagem tem apenas um destinatário. Não usamos listas em To/Cc/Bcc nem anexamos o lote inteiro.
- Os estados de e-mail são independentes dos fiscais: fila, processando, aceito pelo provedor, falha, pendência ou aceitação incerta. **Aceito não significa entregue à caixa de entrada.** A confirmação final/bounces ainda devem ser consultados no painel do provedor; webhooks de entrega não estão implementados nesta etapa.

**Limite atual:** a emissão fiscal continua em homologação. A migração 17 recusa despachar mensagens como produção e o worker exige `NFSE_EMAIL_TEST_TO`: documentos de homologação vão somente ao endereço de teste, com assunto/texto “sem valor fiscal”. Não há envio de notas de teste aos vendedores. Envio comercial real depende da autorização fiscal em produção e de uma evolução explícita dessa trava; configurar DNS/provedores não libera produção.

## 1. Domínio e remetente

1. Compre seu domínio. Escolha um remetente como `notas@seu-dominio.com.br` (exemplo; substitua pelo domínio real).
2. Crie as contas de e-mail transacional em [Brevo](https://www.brevo.com/), [SendPulse](https://sendpulse.com/) e [Mailjet](https://www.mailjet.com/).
3. Em cada painel, cadastre/verifique o domínio e o mesmo remetente. Publique os registros DNS pedidos por cada serviço. Use os valores fornecidos pelos painéis: não invente DKIM/SPF, e mantenha apenas um registro SPF por nome, combinando-o conforme a orientação dos provedores. Configure DMARC conforme o domínio e verifique o status em cada painel.
4. Gere as credenciais **transacionais/API/SMTP API**, não senhas pessoais. O SendPulse usa Client ID e Client Secret para OAuth; o código não usa login/senha de caixa postal.

Os limites 300/400/200 foram definidos pelo usuário como tetos locais, não verificados com contas reais. Verifique se cada plano aprovado permite esse volume, anexos XML e o remetente. Limites mensais, aprovação de conta ou restrições menores do provedor continuam valendo.

## 2. Banco

**Neste projeto, o usuário já confirmou a migração 17 sem erros. Não repita esta etapa.** Para instalações novas, no SQL Editor do projeto Supabase execute **somente** `supabase/migrations/202611130017_invoice_email_queue.sql`. Ela depende das estruturas fiscais anteriores já confirmadas, não exige repetir migrações e não altera A1, série ou documentos. As migrações 13/14 de conta/cobrança não são dependências desta fila. Nunca execute `tests/database` no projeto hospedado.

## 3. Variáveis privadas na Vercel

Em Project → Settings → Environment Variables, configure os ambientes pretendidos:

| Variável | Conteúdo |
| --- | --- |
| `NFSE_EMAIL_FROM` | E-mail do remetente verificado nos provedores ativos |
| `NFSE_EMAIL_TEST_TO` | Seu e-mail para receber documentos de homologação |
| `EMAIL_WORKER_SECRET` | Segredo aleatório com pelo menos 32 caracteres |
| `BREVO_API_KEY` | Chave de envio transacional do Brevo |
| `SENDPULSE_CLIENT_ID` | Client ID do SendPulse, se ativado |
| `SENDPULSE_CLIENT_SECRET` | Client Secret do SendPulse, se ativado |
| `MAILJET_API_KEY` | API Key do Mailjet, se ativado |
| `MAILJET_SECRET_KEY` | Secret Key do Mailjet, se ativado |
| `NFSE_EMAIL_ENABLED` | `true`, somente após a migração e os passos anteriores |

Não use `NEXT_PUBLIC_*`, não envie valores pelo chat e não coloque segredos em SQL versionado. `SUPABASE_SERVICE_ROLE_KEY` já usado pelo processamento continua privado no servidor. Faça um redeploy depois de configurar variáveis. A aplicação ignora provedores cujas credenciais estão incompletas; a prioridade dos configurados permanece fixa. Trocar a chave/conta não zera as cotas locais nem libera mensagens incertas.

## 4. Agendamento sem VPS ou plano Pro da Vercel

A função Vercel dura no máximo 60 segundos; ela **não espera 75 segundos**. PostgreSQL guarda a próxima hora permitida. O Cron do Supabase verifica a fila a cada 30 segundos e chama apenas o worker de e-mail. Um intervalo mínimo de 75 segundos resulta, com esse relógio, normalmente em cerca de 90 segundos entre mensagens SendPulse; atrasos podem ser maiores.

1. No Supabase, habilite `pg_cron` e `pg_net` pela interface de Extensions/Cron.
2. No Vault do Supabase, crie dois segredos pela interface:
   - `nfse_email_worker_url`: `https://emissor-nfse-lote-kjou.vercel.app/api/jobs/email` (ou a origem pública atual, com o mesmo caminho).
   - `nfse_email_worker_secret`: exatamente o mesmo valor privado de `EMAIL_WORKER_SECRET` da Vercel.
3. Execute **somente** `supabase/cron/invoice-email-worker.sql` no SQL Editor, depois da migração 17. A função lê o Vault no servidor, não retorna segredos e não altera funções criptográficas gerenciadas. O job nomeado é atualizado em vez de duplicado ao repetir esta configuração.
4. No painel Cron, confira o job `rex-invoice-email-worker` e suas execuções. A criação/execução real de `pg_cron`/`pg_net` depende da configuração do projeto; os testes locais usam fronteiras sintéticas desses serviços.

O cron não depende de navegador aberto. A recuperação diária da Vercel permanece disponível, mas sozinha não atende a fila de intervalos curtos. Desative o job no painel Cron caso queira parar as chamadas, além de `NFSE_EMAIL_ENABLED=false` para impedir novos envios.

## Cotas, ordem e recuperação

- Tetos compartilhados por todos os tenants usando essas credenciais: Brevo **300**, SendPulse **400**, Mailjet **200**, contados em janela móvel de 24 horas. É mais conservador que uma virada de dia e evita depender do fuso de cada conta.
- Toda permissão de envio reserva uma unidade antes do HTTP. Intenções incertas consomem a reserva; ela não é devolvida para permitir novos envios acima do teto.
- Um lock/lease global impede duas permissões de envio simultâneas. Não há `Promise.all` no fluxo de e-mail. Brevo/Mailjet têm espaçamento local de 1 segundo; SendPulse tem mínimo persistido de **75 segundos**, mesmo com vários workers.
- Cota local cheia: usa o próximo provedor configurado. HTTP **429/402** explícito: pausa aquele provedor por 24 horas e encaminha a mensagem/restante ao próximo. Se todos estiverem indisponíveis, mantém o trabalho na fila até a próxima liberação conhecida. Não troca de provedor só para contornar o intervalo ativo.
- Timeout, queda após intenção, HTTP 408/5xx ou resposta de aceitação sem identificador: estado **incerto**, sem tentativa automática em outro provedor. Consulte o histórico daquele provedor antes de qualquer decisão manual. Uma aceitação incerta não permite reenvio pela interface.
- Falha explícita diferente de cota exige conferir conta/remetente e pedir nova tentativa. Limite total de seis intenções por entrega. Nenhum erro de e-mail altera `transmit_count`, reserva número ou gera DPS/NFS-e nova.
- RLS e RPCs validam propriedade. XML, tokens OAuth e segredos não aparecem em logs nem na tabela pública de acompanhamento.

## Validação

Unitários verificam roteamento por linha, e-mail inválido/injeção, contas/configuração, anexos/contratos dos três provedores e respostas incertas. PostgreSQL real descartável verifica cotas 300/400/200, intervalo 75s, exclusão global, isolamento, leases, transições, histórico fiscal preservado e concorrência de oito workers. UI verifica destinos e confirmação em computador/celular. Esses testes não validam DNS, credenciais, aprovação das contas, chegada à caixa de entrada, PDF ou emissão fiscal de produção. Fontes oficiais e hashes em `integrations/email/provenance.json`.

Resultado local desta alteração: 114 unitários aprovados e 6 opt-in ignorados; 40 verificações PostgreSQL específicas de e-mail, 7 do agendador com adaptadores sintéticos e corrida de oito workers com uma única intenção/cota/aceitação. UI de destinos e acompanhamento aprovada em 1440/390/320 px, com regressão dos demais fluxos. Integrações sintéticas das ações e do worker, lint, TypeScript e build aprovados. Nenhum e-mail real foi enviado.
