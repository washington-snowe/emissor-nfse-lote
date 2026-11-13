# Configuração simplificada do MEI

Empresas com `tax_regime=mei` lido no servidor passam a abrir uma configuração resumida em Serviço e Avançado. No primeiro cadastro, o usuário confirma uma vez que sua atividade é **promoção de vendas como afiliado**, prestada **no município de seu estabelecimento, no Brasil**. Não precisa digitar código nacional, série, inscrição municipal, alíquota, regime especial, estimativa de tributos nem referência fiscal. A escolha não é inferida de CNAE nem aplicada a toda atividade exercida por MEI.

O modelo `mei-promocao-vendas-br-v1` usa o município da própria empresa, código nacional 170601 (inclui promoção de vendas), regime especial 0, ISS tributável sem retenção, sem informar alíquota e estimativa `not_informed`. IM, código municipal e NBS permanecem ausentes, sem valores inventados. A série inicial do aplicativo é 1, dentro da faixa oficial 00001–49999; isso não reserva número nem reinicia contadores. Outros serviços, prestação em outro município, comércio exterior e configurações particulares continuam disponíveis em **Personalizar serviço e configurações**.

A data inicial é o dia atual de São Paulo. Para comissões anteriores, o usuário pode abrir **Vou emitir comissões de um período anterior** e escolher uma data que cubra a competência. Essa data não comprova opção pelo SIMEI no passado: a SEFIN continua responsável por verificar o enquadramento em cada competência. Os limites existentes para competências de 2027 permanecem.

Perfis existentes são exibidos com a descrição e vigência já salvas e nunca são substituídos automaticamente. O modelo só cria a versão inicial, com versão esperada zero. Uma configuração anterior incompatível com o regime atual continua exigindo revisão no formulário completo. Falha de leitura do histórico não é tratada como ausência de configuração. Município ausente encaminha ao cadastro da empresa, sem adivinhá-lo nem exigir código no formulário fiscal.

## Fontes

O Anexo I oficial 1.01 de 09/02/2026 foi obtido novamente do portal da NFS-e e teve SHA-256 conferido: `de5bc492959eadc8bfa7540e16939995924f2188f743648eaf84d3b31e9eeb7c`. URL, linhas, textos das regras e escolhas próprias do aplicativo estão em [mei-affiliate.provenance.json](../integrations/nfse/mei-affiliate.provenance.json). A planilha diferencia regras obrigatórias de escolhas da aplicação: série 1 e descrição padrão são escolhas do modelo, não uma determinação de que todo MEI use esses valores.

- `MUN.INCID_INFO.SERV.`, linha 278: descrição do código 170601.
- RN144: faixa de série para aplicativo próprio.
- RN163: município emissor do MEI corresponde ao endereço no CNPJ.
- RN198: exceção MEI à exigência de IM do cadastro complementar.
- RN229: nenhum regime especial para MEI.
- RN491: ISS não retido para MEI.
- RN502: não informar alíquota de ISS para MEI, inclusive sem inventar alíquota zero.
- RN541: não informar percentual de tributos do Simples ME/EPP para MEI.

## Persistência e verificação

A ação autentica o dono e busca a empresa e seu histórico com tenant derivado da sessão. O navegador envia apenas confirmação, versão esperada e data inicial; campos fiscais ou identidades injetados são ignorados. Perfil e referência da escolha são reconstruídos no servidor e passam pela mesma validação do XML oficial, limites de operação e RPC transacional `save_fiscal_profile` do formulário completo. Uma disputa pela versão zero não sobrescreve outro perfil. Não há nova migração.

O feedback de certificado MEI informa o próximo passo sem exibir o 404 auxiliar como erro principal; o status real continua disponível no diagnóstico. Nada nesta configuração habilita transmissão, muda evidências de transporte, agenda jobs, reserva numeração, emite notas ou substitui a homologação.

Testes locais verificam campos injetados, empresa não MEI, versões existentes, município ausente, datas inválidas, competência anterior, XSD e bloqueio de 2027. A interface real com fronteira de ação sintética é conferida em 1440, 820, 390 e 320 px, incluindo confirmação sem digitação técnica, preservação após erro, personalização, histórico e ausência de overflow. Esses testes não usam A1 real nem comprovam aceitação pela SEFIN.
