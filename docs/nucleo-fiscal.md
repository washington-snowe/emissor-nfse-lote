# Configuração fiscal e XML

Atualização de 16/11/2026: a emissão ativa em homologação usa o pacote oficial de produção restrita **20/10/2026**, preservado separadamente e sem adaptação da série. Ele exige `finNFSe=0` para as notas regulares suportadas e posiciona NBS antes da descrição. O pacote de produção de fevereiro e sua adaptação histórica permanecem somente como revisão explícita para análise/reconciliação do original. Fontes em `integrations/nfse/homologation-20261020.provenance.json`; detalhes e limites em [diagnóstico](diagnostico-homologacao.md). Nenhum documento antigo é refeito/retransmitido por essa mudança; produção continua bloqueada.


## Entrega e limites

`/painel/empresas/{id}/fiscal` permite ao dono autenticado salvar configurações da própria empresa. A migração 8 cria histórico imutável: uma alteração acrescenta versão; uma gravação com versão antiga falha, inclusive quando duas sessões salvam simultaneamente. A referência da orientação fiscal e sua data de início acompanham cada versão. Dados são protegidos por RLS e a gravação só pode ser feita pelo servidor após validar o usuário.

O formulário completo aproveita o código IBGE cadastral, sem inferir serviço do CNAE, imunidade ou exportação. O enquadramento vem do cadastro da empresa e só admite MEI e ME/EPP do Simples. O [modelo automático para afiliados](configuracao-mei.md) configura o MEI sem preenchimento técnico; ME/EPP sem fonte dos dados da apuração fica com serviço pré-configurado e tributação pendente, sem percentual inventado. Perfis existentes não são substituídos. Ao mudar o enquadramento, a versão anterior precisa ser revista. Dados de comércio exterior são parâmetros; o valor na moeda estrangeira deve ser confirmado por operação e não é um valor comum repetido em todas as notas.

Salvar verifica formato local, não autorização tributária. A prova estrutural interna usa o próprio CNPJ como pessoa de teste, número 1, valor 0,01 e data fixa, exclusivamente em memória. Nunca é transmitida, persistida como DPS ou apresentada como nota. A emissão não está habilitada nesta entrega.

## Fontes oficiais

URLs, hashes e discrepância entre nome/versão interna do manual estão em `integrations/nfse/provenance.json`. Os dez XSDs 1.01 são preservados byte a byte. Anexo I de 09/02/2026: identificação da DPS, série de aplicativo próprio (RN144), classificação Simples, comércio exterior, códigos de resultado e IBS/CBS são usados na implementação.

O validador libxml2/WASM interpreta como literais as âncoras `^`/`$` do padrão TSSerieDPS publicado. O teste demonstra que o XSD original recusa uma série numérica válida. Somente em memória, após verificar SHA-256, esse único padrão perde as duas âncoras. A verificação de domínio independente exige cinco algarismos e faixa 00001–49999, conforme Anexo I. Nenhum outro padrão é alterado; série reservada e caracteres `^`/`$` continuam recusados. A adaptação precisa ser reavaliada quando a fonte oficial mudar.

## Núcleo implementado

- Construtor DPS com namespace/versão oficiais, identificador composto, data de competência explícita, valores decimais em strings e escape XML. Não arredonda nem converte dinheiro para float.
- Campos específicos de MEI/Simples, retenção, imunidade, exportação e comércio exterior são verificados sem transformar país do tomador em regra tributária.
- O perfil atual bloqueia competências de 2027 em diante até implementar IBS/CBS aplicável; não omite o grupo silenciosamente.
- Assinatura RSA-SHA256, digest SHA256 e C14N; verificação vinculada ao certificado conhecido do titular, ao único `infDPS` e à referência local. Rejeita mudanças de conteúdo e tentativas de duplicação de identidade. A aceitação dessa política ainda depende de homologação real; a documentação obtida exige XMLDSIG, mas não demonstrou aprovação do algoritmo pelo serviço.
- A verificação da NFS-e recebida usa RSA-SHA256/SHA256 com C14N1.0 ou exclusiva, com/sem comentários, implementadas pela biblioteca fixa. A única referência deve autenticar todo o `infNFSe` da chave conhecida; transformações XPath/XSLT, algoritmos desconhecidos e referências adicionais continuam recusados. A forma implícita de C14N1.0 segue XMLDSIG. XSD, assinatura criptográfica, certificado, emitente/status e conteúdo integral da DPS original permanecem obrigatórios. Essa compatibilidade não altera a assinatura da DPS enviada nem reescreve documentos antigos. Fonte em `integrations/nfse/receipt-signature.provenance.json`.
- Parser recusa DTD, entidades declaradas, recuperação de XML malformado, profundidade e quantidade de nós excessivas. XML até 256 KiB. XSD roda em thread descartável, WASM com até 64 MiB e prazo de oito segundos; erros brutos nunca são devolvidos nem registrados.
- Empacotamento Next/Vercel inclui somente diretório fiscal fixo, worker e dependências necessários, preservando os dados fora do Git.

## Verificação

Unitários cobrem decimais grandes, identidades, datas inválidas, séries reservadas, adulteração de assinatura, referência externa, identidades duplicadas, documento com DTD, XSD oficial/adaptação e cenários sintéticos MEI/Simples/exterior. Certificados de teste são autoassinados e não provam confiança ICP-Brasil ou homologação.

PostgreSQL real: 17 asserções de perfis, histórico e privilégio; testes de acesso também conferem isolamento e leitura dos perfis com sessão de senha, inclusive para contas com fator antigo. O teste concorrente disputa oito gravações da versão zero: uma cria versão 1, sete recebem conflito. Não há sobrescrita silenciosa.

UI testa o componente real com ação de fronteira explicitamente sintética: campos fiscais sem valor presumido, preenchimento IBGE, dados preservados após erro/sucesso, versão avançando, campos condicionais e ausência de overflow em 1440/820/390/320 px. Isso não é teste do Supabase/Vault real.

## Próximas dependências

Revisão e confirmação estão em [revisão fiscal](revisao-fiscal.md), com migração 9. Fila, integração condicionada ao contrato oficial, verificação de documento e reconciliação estão em [fila fiscal e nota avulsa](fila-emissao-avulsa.md), com migrações 10/11. Acesso mTLS real, compatibilidade do contrato/algoritmos e homologação ainda precisam ser demonstrados com o A1. Produção permanece bloqueada. Nenhuma nota ou cobrança real foi gerada pelos testes.
