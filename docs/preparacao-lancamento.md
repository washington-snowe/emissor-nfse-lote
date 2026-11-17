# Preparação para lançamento — roteiro proposto

O usuário confirmou que os testes simples de Brevo, SendPulse e Mailjet funcionaram. A operação de R$5 já havia aparecido autorizada em homologação, com XML disponível. O funcionamento da tela de testes confirma a capacidade da migração20; não repetir esse SQL nem pedir novos testes individuais para comprovar o mesmo resultado. A confirmação veio do usuário, sem acesso deste executor às credenciais/sessão ou aos relatórios privados dos provedores.

Este roteiro organiza as próximas etapas solicitadas antes da revisão de UI/UX e abertura do SaaS. Não autoriza disparar novo lote, emitir nota real, cobrar clientes ou liberar produção automaticamente.

## 1. Fluxo completo de lote em homologação

Validar um lote novo e independente com três a cinco notas de teste: CSV suportado → importação → revisão e confirmação únicas → fila → autorização → XML → e-mail com o documento correspondente. Todos os e-mails continuam para o endereço de teste, sem enviar documentos de homologação aos vendedores.

Conferir totais por linha, valor total, competência, tomador e vínculo vendedor/destino. Reabrir a página e repetir a mesma solicitação deve conservar o lote existente. Interrupção/fechamento do navegador e recuperação do worker não podem gerar nova transmissão. As operações antigas de R$1/R$2/R$3/R$4 permanecem preservadas; esta validação não as reclassifica nem retransmite.

Critério: quantidade e valores conferem, uma autorização por operação, arquivos íntegros e mensagens vinculadas corretamente, com recuperação demonstrada na aplicação hospedada.

## 2. Documentos e entrega

Implementar a obtenção do PDF/DANFS-e oficial a partir de documentação vigente, com autorização e vínculo à mesma nota; hoje há somente XML. Validar anexos reais pelo endereço de teste. Integrar os retornos de entrega, rejeição e bounce dos provedores: o histórico atual comprova aceitação pela API, sem acompanhar a chegada de cada mensagem.

O fallback 429/402/cota e a proteção contra reenvio incerto já têm testes sintéticos/SQL. Validar a operação integrada em cenário controlado, sem esgotar cotas deliberadamente nem repetir uma mensagem possivelmente aceita.

Critério: cada destinatário recebe somente os documentos correspondentes e falha de e-mail não gera outra nota.

## 3. Produção fiscal e cobertura inicial

O worker fiscal recusa ambiente diferente de homologação, e o worker de e-mail de documentos também exige homologação/endereço de teste. A passagem para produção exige implementação e validação próprias, não somente uma variável. Conferir contrato/XSD vigentes de produção, configuração fiscal, numeração, isolamento entre ambientes e recuperação. Qualquer emissão real posterior exige operação revisada e confirmação específica do responsável.

Recomendação de escopo inicial: MEIs afiliados Shopee, usando o layout CSV e o modelo fiscal já trabalhados. ME/EPP ainda depende de dados reais de apuração; sem integração ou fonte confirmada não há configuração tributária automática completa. Outros marketplaces/layouts permanecem fora do que foi validado.

Definir também o procedimento de correção/cancelamento de uma nota autorizada, usando recursos oficiais ou atendimento assistido, com rastreabilidade.

Critério: produção validada para o escopo anunciado, sem confundir seus documentos/consumo com homologação.

## 4. Assinatura, pagamentos e limites

Conferir o estado das migrações13/14 já encaminhadas, sem reaplicar por presunção. Validar Checkout, pagamento, webhook, plano ativo, franquia, excedente, inadimplência e cancelamento em ambiente de teste Stripe. O código existe, mas esses fluxos com a conta real do provedor ainda não foram confirmados nesta conversa. Homologação não deve gerar consumo cobrado.

Critério: eventos repetidos/fora de ordem não duplicam assinatura ou cobrança, e o acesso corresponde ao plano e ao estado de pagamento.

## 5. Cadastro e operação do SaaS

Exercitar cadastro de novas contas, confirmação de e-mail, recuperação de senha e encerramento de sessões no domínio definitivo. Testar duas contas independentes no ambiente hospedado, sem compartilhamento de empresas, A1, notas, documentos ou destinatários.

Demonstrar backup e restauração, incluindo recuperação do acesso aos certificados protegidos. Configurar alertas para fila parada, falhas fiscais, certificados próximos do vencimento e falhas/cotas de e-mail. Confirmar capacidade/custos de Vercel, Supabase e provedores para o volume inicial. Fechar termos, privacidade, retenção e canal de suporte conforme o funcionamento efetivo do produto.

Critério: recuperação e resposta a falhas demonstradas, além dos testes locais já existentes.

## 6. UI/UX, piloto e abertura

Com os fluxos e o escopo estabilizados, revisar UI/UX sobre o comportamento final. Fazer piloto com três a cinco usuários convidados, acompanhar seus primeiros cadastros/importações/revisões e corrigir os obstáculos encontrados. Abrir o acesso público depois dessa validação.

Próxima etapa recomendada: executar e conferir o lote pequeno completo em homologação, antes de redesenhar as telas.
