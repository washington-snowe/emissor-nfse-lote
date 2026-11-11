# Importações persistentes, fila, MFA e A1

Entrega intermediária da execução completa, autorizada pelo usuário. O sistema completo e a emissão fiscal ainda não estão homologados. O usuário confirmou no Supabase as migrações 3 e 4 (esta após correção de permissões do Vault), e depois 5–7. As credenciais privadas da Vercel precisam estar configuradas conforme `configurar-processamento.md` para as funções protegidas aparecerem.

## Importação privada e processamento

Após a conferência local, “Salvar importação” envia **os bytes originais**, não o JSON do navegador. A Server Action valida o usuário com `auth.getUser()`, resolve o tenant, confere a empresa própria e chama uma função privilegiada exclusiva do servidor. O banco confere novamente a associação entre ator/empresa, calcula SHA-256, aplica quota de 10 novos relatórios por 10 minutos e grava original, metadados, auditoria e job em uma transação. Arquivos idênticos na mesma empresa retornam a importação existente, inclusive sob concorrência. Arquivo igual em outra conta não revela sua existência.

Os CSVs pequenos ficam em `private.report_sources` como `bytea` (até 512 KiB), sob acesso exclusivo das funções do servidor. Essa escolha conserva original e metadados atomicamente para esta etapa limitada; não cria um bucket público nem introduz inconsistência entre transação e upload externo. Não é a solução de arquivos grandes, PDF/OCR ou entrega em alto volume.

O job lê o original no servidor, usa o mesmo adaptador validado e compara seu digest com o banco. O resultado persistido tem orçamento de 4 MB, medido conservadoramente antes do envio. A confirmação usa token de reserva e prazo; um worker antigo não sobrescreve uma tarefa recuperada. Nenhum JSON ou flag de aprovação enviados diretamente pelo cliente tornam uma importação validada.

`after()` dispara processamento curto após salvar; o banco mantém a fila mesmo que o navegador feche. Cada execução processa no máximo três tarefas e tem orçamento de tempo. A rota `/api/jobs` exige Bearer `CRON_SECRET` forte, não recebe tenant do público e não expõe conteúdo de tarefas. O Cron de recuperação é diário às 06h UTC; no Hobby há janela de execução por hora. Há retomada manual auditada. Não é promessa de fila contínua ou processamento ilimitado no plano gratuito.

O histórico em `/painel/importacoes/historico` lê somente dados do tenant pela sessão normal e RLS. A abertura valida novamente o envelope normalizado, hash e associação de linhas/vendedores antes de mostrar o resultado. Ainda não há confirmação fiscal, consolidação, alocação ou prevenção completa de reexportações semanticamente equivalentes: o digest impede somente reenvio dos mesmos bytes. Não confundir uma importação salva com nota emitida.

## MFA

`/painel/seguranca` cadastra TOTP pelo Supabase Auth. QR e chave manual são entregues apenas à sessão autenticada que iniciou o cadastro, em memória; a aplicação não os registra em logs, Git ou armazenamento próprio. A imagem é uma URI de dados SVG codificada, não HTML executado. Fatores pendentes abandonados são removidos antes de uma nova matrícula; fatores verificados nunca são removidos por esse caminho.

Após verificar TOTP, o SDK atualiza a sessão. Contas com fator verificado e sessão AAL1 são encaminhadas a `/verificar-acesso`; as políticas de dados também exigem AAL2, bloqueando acesso direto pela API. A função de tenant não aceita dono ou tenant do cliente. A migração 5 consulta fatores gerenciados pelo Auth sem conceder acesso às tabelas `auth` ao usuário. Fator não verificado não bloqueia a conta. Cadastro/uso de A1 exige sessão AAL2 e fator verificado no servidor; também há conferência do usuário antes de cada ação privilegiada.

Desativar o autenticador requer código atual. Códigos próprios de recuperação e procedimento administrativo de recuperação ainda não existem; a UI orienta guardar a chave manual no gerenciador de senhas. Não há bypass ou código universal. A homologação real do fluxo TOTP ainda precisa ser feita pelo usuário em seu navegador.

## Certificados

`/painel/certificados` aceita PKCS#12 RSA `.pfx`/`.p12` até 256 KiB somente quando Vault e serviço privado estiverem disponíveis e a sessão for AAL2. O servidor reserva quota **antes** da inspeção cara. O parser usa `node-forge@1.4.3`, versão fixada; roda em Worker Thread com V8 separado, limite de memória e prazo de quatro segundos. Nenhum subprocesso de shell ou arquivo temporário com material do A1 é usado. Arquivo inválido, senha incorreta, ambiguidade, datas inválidas, chave incompatível ou CNPJ divergente são recusados.

O CNPJ é lido do `otherName` OID `2.16.76.1.3.3`, não de um texto do commonName. O Anexo I oficial, RN DPS 644/E0716, identifica esse campo. A chave privada é conferida contra o certificado com assinatura/verificação de desafio. Isso não valida cadeia ICP-Brasil, revogação/LCR ou credenciamento; a aplicação não transforma essas verificações locais em autorização fiscal.

Cada A1+senha recebe chave aleatória de 32 bytes e nonce aleatório AES-256-GCM. O AAD inclui versão, tenant, empresa e ID do certificado em forma canônica. O payload criptografado fica no schema privado; a chave por certificado é guardada no Vault, cuja chave raiz é gerenciada pelo Supabase separadamente dos dados. Usuários e anon não possuem uso do schema Vault, nem leitura dos envelopes ou execução das funções de material privado. Descriptografar exige função exclusiva do servidor, propósito conhecido, vínculo correto, estado/validade e auditoria. Buffers temporários controlados pelo aplicativo são limpos quando possível; strings e cópias internas dependem do runtime/GC, sem promessa de apagar toda memória física.

Substituição serializa pela empresa e impede dois certificados ativos. O anterior deixa de servir para novas operações. “Desativar nesta conta” não revoga o certificado na certificadora. Destruição definitiva das chaves, gestão de retenção e recuperação completa de backups ainda precisam do fluxo operacional final.

## Consulta de homologação e contrato oficial

“Verificar acesso à homologação” exige AAL2, empresa própria, município IBGE e certificado ativo. Só realiza GETs em destinos oficiais fixados na página de APIs do Portal Nacional. Não segue redirects, não reutiliza agente TLS entre certificados, não desativa validação TLS e limita prazo/tamanho da resposta. A consulta usa o caminho documentado `/parametros_municipais/{codigoMunicipio}/convenio`.

Uma resposta JSON 2xx é registrada como `response_received`, nunca “emissor autorizado”. Não há POST fiscal nesta entrega. O acesso, a confiança ICP-Brasil, as regras de assinatura, a emissão de homologação e a recuperação por DPS ainda exigem verificação real.

O mesmo acesso tenta ler a documentação Swagger do host oficial, sem executar JavaScript. Se houver contrato reconhecido, somente sua estrutura é conservada: sem exemplos, defaults, descrições livres ou dados do certificado. O CNPJ do titular não pode aparecer no conteúdo publicado. `nfse_contract_status()` disponibiliza essa documentação estrutural e o hash/origem como metadados públicos de integração; não dá acesso aos registros de conexão de empresas. A descoberta não aprova automaticamente um novo contrato para transmissão.

Manuais/XSDs foram obtidos do portal oficial em 11/11/2026. O histórico embutido do PDF diverge da versão anunciada no nome do arquivo; o manifesto de proveniência registra essa diferença. Os endereços Swagger retornaram 503 sem mTLS neste executor; não se conclui que o serviço esteja indisponível. O teste com A1 na aplicação é necessário para verificar acesso real.

## Evidências e limites

- PostgreSQL 17.11: 27 verificações de tenancy, 22 de empresas, 27 de importações/fila, 17 de privilégios/metadata de certificados, 9 de metadados fiscais e 10 de MFA passaram.
- Concorrência real no banco: oito registros simultâneos do mesmo original produziram uma importação, um job e uma unidade de quota; oito workers disputaram uma única reserva. Os testes anteriores de bootstrap e quota CNPJ continuam passando.
- Testes de criptografia/parser usam certificados **autoassinados sintéticos**. Não provam ICP-Brasil, Vault hospedado ou homologação fiscal. O teste com custo PKCS#12 malicioso foi encerrado pelo prazo de quatro segundos.
- O PostgreSQL local padrão não tem Vault. O teste comprova bloqueio sem esse gerenciador e privilégios de metadata, sem inventar uma implementação de Vault para contar como integração passada. A primeira tentativa remota da migração 4 falhou com 42501 por alterar uma função criptográfica gerenciada; a correção preserva as funções internas e restringe schema/tabelas. O usuário confirmou a segunda aplicação sem erros.
- Chromium: prévia em seis larguras (1440 a 320); envio explícito de File e empresa ao adaptador de teste; TOTP com QR sintético, erro e confirmação; formulário A1 com arquivo fictício e limpeza da senha; controles de verificação com resposta sintética, em 1440/390/320. Os adaptadores de UI não acessam Auth, banco, Vault ou API fiscal. Não equivalem a cadastro real de A1.
- Build de produção incluiu o Worker CJS e `node-forge/lib/pkcs12.js` no trace do módulo de certificados. O gate visual antigo não foi anunciado PASS nem repetido após seu erro histórico.
- Suíte desta etapa: 36 testes passaram e 6 opt-in foram ignorados; o novo teste de integridade dos dez XSDs passou separadamente (37 aprovações no conjunto). Lint, TypeScript e build passaram. O teste de UI de empresas foi repetido após mudar a navegação e passou nas seis larguras, inclusive fallback e respostas atrasadas.
- Envio fiscal, documentos autorizados, cancelamento, notificações e cobrança ainda não foram implementados/homologados nesta entrega intermediária. A execução completa continua em `execucao-sistema.md`.
