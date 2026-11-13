# Configurar notas@rexnotas.com.br

Escolha confirmada pelo usuário: domínio `rexnotas.com.br`, remetente `notas@rexnotas.com.br`, contas Brevo/SendPulse/Mailjet já criadas. Migração 17 aplicada sem erros; não repetir. A seleção do remetente está registrada em `.env.example`, mas isso não altera variáveis da Vercel ou configura contas externas.

## DNS observado

Consulta pública pelo Google DNS em **13/11/2026**, sujeita a cache/propagação. Não é validação de conta dos provedores.

| Nome | Tipo | Valor observado |
| --- | --- | --- |
| `rexnotas.com.br` | NS | `a.auto.dns.br.`, `b.auto.dns.br.` |
| `rexnotas.com.br` | TXT/SPF | `v=spf1 -all` |
| `_dmarc.rexnotas.com.br` | TXT | `v=DMARC1; p=reject;` |
| `rexnotas.com.br` | MX | `0 .` (MX nulo: domínio não recebe e-mail) |

A zona é atendida pelo DNS do Registro.br. O SPF atual não autoriza servidores para esse domínio e DMARC pede rejeição de mensagens que não autentiquem/alinem. Um envio ainda pode autenticar por DKIM alinhado; esses registros sozinhos não provam sucesso ou falha de um provedor. Os seletores DKIM não foram consultados, pois ainda precisam ser informados pelas contas.

## 1. Obter os registros das três contas

Em cada painel, abra a área de domínio/remetente e autenticação de envio:

1. Adicione `rexnotas.com.br` e siga a opção de autenticação por DNS.
2. Cadastre o remetente `notas@rexnotas.com.br`, nome de exibição `rex`.
3. Copie **tipo**, **nome/host** e **valor/destino** de cada registro que o painel solicitar. Isso inclui os registros de verificação e DKIM e, quando pedidos, SPF/DMARC/retorno.
4. Identifique quais registros pertencem a Brevo, SendPulse ou Mailjet. Estes são registros DNS destinados a publicação, não API keys. Não copie chaves de API, segredos, senha ou links privados de confirmação para o chat.

Os valores variam por conta: nenhum seletor DKIM, token de verificação, include SPF ou destino CNAME deve ser adivinhado.

## 2. Publicar no Registro.br

Abra seu domínio → DNS → editor de zona. Caso o painel esteja em modo simplificado, use o editor avançado conforme a própria interface orientar.

Publique os registros fornecidos pelos provedores, conferindo o formato do nome pedido pelo editor: evite duplicar `.rexnotas.com.br` quando ele já acrescenta o domínio. Mantenha um só SPF por nome. Se houver instrução para alterar SPF/DMARC, confronte com os registros existentes; não crie um segundo TXT `v=spf1` ou outro DMARC no mesmo nome. Os diferentes registros DKIM podem coexistir quando usam nomes/seletores distintos.

Depois da propagação, use **Verificar/autenticar domínio** em cada conta. Confirme também o status do remetente. DNS publicado não equivale a aprovação da conta de envio transacional.

## 3. Recebimento do endereço

O MX nulo atual declara que o domínio não recebe mensagens. Se um provedor exigir confirmação por e-mail para `notas@rexnotas.com.br`, ou se quiser receber respostas nesse endereço, configure uma caixa postal ou encaminhamento com um serviço de recebimento e publique os MX que ele fornecer. Verificação de domínio por DNS pode dispensar confirmação individual por e-mail, conforme o provedor. Não invente MX nem use os servidores de envio transacional como se fossem servidores de caixa postal.

## 4. Variáveis privadas no projeto Vercel

Projeto: `emissor-nfse-lote-kjou` → Settings → Environment Variables. Os segredos vão diretamente nesse painel; não no chat/repositório.

| Variável | Configuração |
| --- | --- |
| `NFSE_EMAIL_FROM` | `notas@rexnotas.com.br` |
| `NFSE_EMAIL_TEST_TO` | Seu endereço já existente para receber o teste |
| `BREVO_API_KEY` | Chave da API transacional Brevo, não a senha SMTP |
| `SENDPULSE_CLIENT_ID` | ID da aplicação/API SendPulse |
| `SENDPULSE_CLIENT_SECRET` | Secret da mesma aplicação/API |
| `MAILJET_API_KEY` | API Key de envio Mailjet |
| `MAILJET_SECRET_KEY` | Secret Key correspondente |
| `EMAIL_WORKER_SECRET` | Segredo aleatório com pelo menos 32 caracteres |
| `NFSE_EMAIL_ENABLED` | Manter `false` durante a configuração |

Após domínio/remetente aprovados e endereço de teste preenchido, mude `NFSE_EMAIL_ENABLED` para `true` e faça redeploy. O código continua bloqueando envio comercial e direciona documentos de homologação somente ao endereço de teste. Nenhum teste real foi enviado por este executor.

## 5. Agendamento e teste

Siga a seção 4 de [configurar-email.md](configurar-email.md) para `pg_cron`, `pg_net`, os dois segredos no Vault e o script separado de agendamento. Ainda não há confirmação de que essa etapa foi aplicada. O endereço do worker continua `https://emissor-nfse-lote-kjou.vercel.app/api/jobs/email`; o domínio de e-mail pode ser usado sem mover o site para outro endereço.

Com a configuração concluída, abra um lote próprio com XML de homologação autorizado e prepare sua entrega. Confira no seu endereço de teste o remetente, o assunto “sem valor fiscal” e o XML anexado. Depois confira os históricos do aplicativo/provedor. Brevo é o primeiro provedor; a validação real dos dois alternativos exige testar suas contas individualmente em uma janela controlada, sem consumir cotas deliberadamente e sem marcar um documento já aceito como novo envio.
