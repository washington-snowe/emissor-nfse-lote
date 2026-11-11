# Execução do sistema completo

Autorização atual: o usuário solicitou implementar o sistema completo, incluindo emissão, mantendo Vercel e Supabase; VPS só será considerada futuramente. A autorização cobre desenvolvimento, testes e evolução do código. Credenciais reais, ativação de cobranças e emissão de documentos reais continuam exigindo configuração e confirmação da operação correspondente, sem valores ou parâmetros fiscais presumidos.

## Ordem e critérios

1. Importações duráveis: original privado, SHA-256 calculado no banco, vínculo com empresa própria, limite por conta, prevenção de reenvio concorrente e histórico. A prévia existente continuará funcionando.
2. Revisão: tomadores declarados e configuração fiscal versionados, competência confirmada, tratamento de valores e prévia rastreável. Nada é liberado para emissão por apenas haver dados cadastrais.
3. Certificados: envelope AES-GCM com chave por certificado protegida pelo Supabase Vault; chave raiz gerenciada fora do banco conforme documentação oficial. Senhas e A1 somente em memória durante uso, sem arquivos temporários. Upload bloqueado até configurar a capacidade protegida do servidor.
4. Processamento na Vercel: fila transacional no PostgreSQL, leases com token, execuções curtas e recuperação. Nenhum serviço residente ou VPS nesta etapa. Limites e precisão do Cron dependem do plano; não prometer processamento contínuo no Hobby.
5. Fiscal Nacional: documentação, XSD e contrato oficial versionados; assinatura, mTLS, consulta e reconciliação por DPS. Produção restrita primeiro. Envio incerto nunca volta diretamente para transmissão.
6. Documentos e operação: XML/PDF reais, histórico, downloads autorizados, auditoria e envio de e-mail somente após autorização fiscal comprovada e configuração de remetente/provedor.
7. Conta e comercial: recuperação/MFA, planos e pagamentos conforme provedores e condições comerciais efetivamente configurados; sem preços, assinaturas ou webhooks fictícios.

## Dependências externas atuais

- A1: usuário possui, não deve enviar pelo chat. Credenciamento/homologação ainda desconhecidos.
- Acesso SQL administrativo não disponível ao executor; migrações remotas terão de ser aplicadas pelo SQL Editor após os testes locais.
- Apenas URL, chave pública Supabase e origem do site estão configuradas. Chave de serviço, segredo de processamento e capacidades do Vault não estão configurados/verificados.
- Não existem amostras de TikTok Shop/Mercado Livre ou de outros layouts Shopee. Esses adaptadores dependem de evidência real.
- Provedor de e-mail, remetente, provedor de pagamentos e planos comerciais ainda não definidos.

## Evidência técnica consultada em 11/11/2026

- Portal NFS-e e biblioteca atual obtidos por HTTPS. Manual de contribuintes e pacote XSD 1.01 de 09/02/2026 localizados em links oficiais. As versões e hashes devem acompanhar o código fiscal.
- Supabase Vault: <https://supabase.com/docs/guides/database/vault>; documenta chave por projeto em sistemas seguros separados dos dados, criptografia autenticada e acesso SQL restrito.
- Duração Vercel: <https://vercel.com/docs/functions/configuring-functions/duration>; limites variam por plano/runtime/configuração. Processamento deve permanecer limitado, recuperável e independente do navegador.

Este arquivo registra execução em andamento; não é declaração de sistema completo ou homologação fiscal.
