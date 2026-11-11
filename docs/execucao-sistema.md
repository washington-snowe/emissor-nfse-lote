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

## Checkpoint 6bf61d8

Publicado na Vercel em 11/11/2026: importação privada/fila/histórico, MFA com política de dados, A1 com envelope/Vault e consulta GET de homologação. O usuário confirmou migrações 3–7; a quarta exigiu retirar REVOKE de funções criptográficas gerenciadas. Testes de banco: 112 asserções (27+22+27+17+9+10), mais concorrência; 37 aprovações unitárias no conjunto e 6 opt-in ignorados; UI e build passaram. MFA, Vault real e A1 ainda aguardam teste no navegador do usuário. A nova consulta não emite notas.

Questão pendente ao usuário: confirmar variáveis privadas da Vercel e concluir MFA, cadastro de A1 e “Verificar acesso à homologação”. Não solicitar certificado, senha, chave de serviço ou link de confirmação pelo chat. O registro público `nfse_contract_status()` retornou `[]` na primeira consulta; aguarda documentação obtida do endpoint oficial pelo acesso mTLS do aplicativo.

Avanço seguinte: XML/DPS, assinatura/verificação, XSD isolado e perfis fiscais versionados implementados. Dependências fixadas: `xml-crypto@6.4.0`, `@xmldom/xmldom@0.9.12` e `xmllint-wasm@5.3.0`. A migração 8 foi encaminhada ao usuário após testes; não editar seu conteúdo. Tomadores, revisão versionada, envio e reconciliação continuam pendentes de integração.

Validação: 43 testes unitários aprovados, 6 opt-in ignorados; PostgreSQL: 131 asserções, além das disputas concorrentes (oito edições de perfil resultam em uma versão e sete conflitos). Interface real com fronteiras sintéticas, incluindo configuração em 1440/820/390/320 px, aprovada. Build e lint aprovados. Rastreamento da função Vercel inclui worker/WASM/XSD e não inclui attachments, Git ou screenshots. Varredura do repositório não encontrou dados reais dos vendedores do CSV.

A incompatibilidade da série tem reprodução e adaptação pontual em memória testadas, mantendo hashes dos arquivos originais. O valor em moeda estrangeira é por DPS, nunca repetido do perfil. A aceitação da política de assinatura pelo serviço oficial ainda não foi demonstrada. Ver `docs/nucleo-fiscal.md`.

Evidência do Anexo I oficial de 09/02/2026: campo 105/RN144 define série 00001–49999 para aplicativo próprio; campo 17 lista cStat 100 (gerada), 102 (judicial/administrativa), 103 (avulsa), 107 (MEI). IBSCBS: campos 46/335 indicam obrigatoriedade para Simples a partir de 2027. `dCompet` é data explícita; mês de conclusão do CSV não a determina. O XSD 1.01 contém um padrão não compatível com libxml2 em TSSerieDPS (`^0{0,4}\\d{1,5}$`): teste isolado aceita `^90000$` e recusa série numérica. Preservar upstream byte a byte; qualquer adaptação precisa ser pontual, documentada e coberta por validação de domínio conforme Anexo I. Só esse padrão usa âncoras no arquivo tiposSimples. Não esconder a incompatibilidade ou anunciar XSD/homologação completa sem teste.
