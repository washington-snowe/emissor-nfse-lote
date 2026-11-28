export type SeoGuide = {
  slug: string;
  title: string;
  description: string;
  published: string;
  sections: { id: string; title: string; paragraphs: string[]; steps?: string[] }[];
  sources: { title: string; href: string }[];
};

export const seoGuides: SeoGuide[] = [
  {
    slug: "como-emitir-nota-fiscal-afiliado-shopee",
    title: "Como emitir NFS-e em lote como afiliado Shopee",
    description: "Veja o que preparar para emitir NFS-e de comissões da Shopee: CNPJ, certificado A1, relatório mensal, revisão do lote e entrega dos documentos.",
    published: "2026-11-28",
    sections: [
      { id: "antes-de-comecar", title: "O que você precisa antes de emitir", paragraphs: [
        "O RexNotas atende afiliados da Shopee que emitem notas de serviço com CNPJ. Para usar a emissão em lote, prepare o cadastro da empresa, um certificado digital A1 válido e o relatório mensal de comissões por vendedor no formato CSV.",
        "Confira com sua contabilidade o enquadramento da empresa, o serviço prestado e os dados tributários. A consulta de CNPJ ajuda a conferir o perfil cadastral; a emissão também depende da configuração fiscal e da autorização do serviço público de NFS-e.",
        "Se você atua como pessoa física, pode conhecer os planos e experimentar o simulador de relatório. A emissão pelo Rex exige uma empresa com CNPJ e o certificado correspondente.",
      ] },
      { id: "tomador-e-competencia", title: "Confira o tomador e a competência", paragraphs: [
        "O relatório informa comissões e dados dos vendedores. Ele não decide sozinho quem deve constar como tomador de cada serviço. A identificação do tomador precisa seguir a operação efetiva e a orientação fiscal aplicável à sua empresa.",
        "A data de competência representa a prestação do serviço. O mês de conclusão do relatório pode ajudar na conferência, mas não determina automaticamente essa data. Revise a competência antes de autorizar o lote.",
        "A comissão paga pela própria Shopee pode corresponder a uma operação diferente das comissões por vendedor. Confira as instruções da plataforma e a orientação da sua contabilidade antes de escolher o tomador ou reunir valores na mesma nota.",
      ] },
      { id: "passo-a-passo", title: "Como preparar o lote no RexNotas", paragraphs: [
        "O arquivo gera uma prévia para revisão. Importar ou atualizar essa prévia não equivale a emitir uma nota fiscal.",
      ], steps: [
        "Crie sua conta, cadastre a empresa e conclua a configuração fiscal e do certificado A1.",
        "Baixe o relatório mensal de comissões por vendedor na Central do Afiliado da Shopee.",
        "Importe o CSV e confira os valores, o tomador, a competência, o agrupamento e os e-mails de destino.",
        "Leia o resumo e confirme a emissão em produção somente depois de revisar os dados.",
        "Acompanhe o processamento em Notas. O documento fica disponível após a autorização fiscal.",
      ] },
      { id: "documentos-e-envio", title: "XML, DANFS-e e envio por e-mail", paragraphs: [
        "Quando a nota é autorizada, o painel disponibiliza o XML e o DANFS-e. O XML contém o documento fiscal eletrônico; o DANFS-e é sua representação auxiliar em PDF. Guarde as cópias conforme as orientações da sua contabilidade.",
        "Com os destinatários confirmados e a entrega autorizada na revisão, os documentos entram na fila de envio por e-mail. A autorização fiscal e a entrega do e-mail são etapas distintas. Acompanhe o status da emissão e o status de envio no painel.",
        "Se uma tentativa ficar com resultado incerto, acompanhe a consulta da operação existente. Criar outra emissão para os mesmos dados pode provocar duplicidade. Procure o suporte se precisar de ajuda para interpretar o estado da operação.",
      ] },
    ],
    sources: [
      { title: "Portal oficial da NFS-e", href: "https://www.gov.br/nfse/pt-br" },
      { title: "Relatório mensal da Central do Afiliado Shopee", href: "https://affiliate.shopee.com.br/report/monthly_report" },
    ],
  },
  {
    slug: "relatorio-mensal-shopee-notas-fiscais",
    title: "Relatório mensal da Shopee: como estimar suas notas fiscais",
    description: "Saiba qual CSV da Shopee usar, como estimar a quantidade de NFS-e e comparar planos, e o que conferir antes de emitir notas em lote.",
    published: "2026-11-28",
    sections: [
      { id: "qual-relatorio", title: "Qual relatório usar", paragraphs: [
        "Use o relatório mensal de comissões por vendedor da Central do Afiliado da Shopee, exportado no formato CSV. Um extrato de pedidos, um print ou um PDF pode trazer informações diferentes e não substitui o arquivo esperado pelo importador.",
        "Baixe o arquivo pela sua conta da Shopee e preserve as colunas originais. Evite renomear cabeçalhos, trocar separadores ou converter os valores antes da leitura. Se editar uma cópia, mantenha o arquivo original para conferência.",
        "O simulador público do RexNotas aceita CSV de até 512 KB e até 10.000 linhas. Caso a leitura falhe, confira o tipo de relatório e o tamanho do arquivo antes de tentar novamente.",
      ] },
      { id: "como-estimar", title: "Como descobrir quantas notas você precisa emitir", paragraphs: [
        "Na página inicial do RexNotas, vá a “Quantas notas você precisa emitir?” e selecione ou solte o CSV. A leitura acontece no navegador, sem salvar o relatório no servidor para essa simulação.",
        "O resultado mostra a quantidade estimada de notas, o total do relatório e o plano com menor custo estimado para aquele volume. A estimativa considera uma nota por linha com comissão positiva. Ela serve para planejamento; a revisão fiscal e o agrupamento podem mudar a quantidade final.",
        "O total de comissões representa os valores lidos do relatório. Ele não é o preço da assinatura nem o custo de emissão pelo RexNotas.",
      ] },
      { id: "comparar-planos", title: "Compare a assinatura e os excedentes", paragraphs: [
        "Na comparação de planos, o Rex considera o preço da assinatura e as notas acima da franquia. O plano de menor custo estimado pode continuar sendo vantajoso mesmo quando inclui algumas notas excedentes.",
        "Você pode alternar entre mensal e anual. No anual, o valor destacado é o equivalente mensal; a assinatura é cobrada por ano e a franquia de notas continua mensal. Os excedentes são cobrados à parte conforme a tarifa contratada.",
        "A simulação não contrata uma assinatura e não transmite documentos. Confira o resumo da contratação para confirmar o plano, a frequência e o valor cobrado.",
      ] },
      { id: "conferencia-fiscal", title: "O que revisar antes de usar o CSV para emitir", paragraphs: [
        "Depois de configurar a empresa no painel, importe o relatório para preparar o lote. Confira os tomadores, os dados de identificação, a data de competência, os valores e os endereços de e-mail. O mês do relatório não determina sozinho a data da prestação do serviço.",
        "Revise também o agrupamento. Ter vários valores no mesmo arquivo não significa que todos podem entrar na mesma nota. Operações de tomadores distintos precisam preservar a identificação correspondente.",
        "Somente a confirmação explícita do lote inicia a emissão em produção. Após essa etapa, acompanhe as notas e os envios pelo painel. O simulador público e a prévia do arquivo não são documentos fiscais.",
      ] },
    ],
    sources: [{ title: "Baixar o relatório mensal na Shopee", href: "https://affiliate.shopee.com.br/report/monthly_report" }],
  },
  {
    slug: "certificado-a1-nfse-afiliados",
    title: "Certificado digital A1 para emitir NFS-e de afiliados",
    description: "Entenda o uso do certificado A1 no RexNotas: titularidade do CNPJ, validade, configuração e cuidados para emitir NFS-e em lote.",
    published: "2026-11-28",
    sections: [
      { id: "para-que-serve", title: "Para que o Rex usa o certificado A1", paragraphs: [
        "O certificado A1 é usado pelo RexNotas para assinar as declarações de prestação de serviço e se conectar aos serviços fiscais em nome da empresa. O arquivo e a senha precisam corresponder ao CNPJ que vai emitir as notas.",
        "Ter o certificado não comprova sozinho que uma empresa está pronta para emitir qualquer serviço. O cadastro, o enquadramento e os parâmetros fiscais também precisam estar corretos. A autorização de cada nota depende do processamento pelo serviço público.",
        "O fluxo do RexNotas utiliza o arquivo do A1. Um certificado em token ou cartão, como o A3, não substitui esse arquivo no processo de configuração da plataforma.",
      ] },
      { id: "o-que-conferir", title: "O que conferir antes de configurar", paragraphs: [
        "Confira a validade, o CNPJ do titular e a senha de acesso. O arquivo costuma ser fornecido com extensão .pfx ou .p12. Se você não tem o arquivo ou perdeu a senha, consulte a autoridade certificadora que emitiu o certificado.",
        "Use somente certificados de empresas que você tem autorização para representar. Nunca envie o certificado ou a senha por uma conversa pública, um formulário de contato ou uma mensagem de suporte.",
        "O Rex mantém o certificado e sua senha criptografados, com acesso restrito para as operações autorizadas. Ainda assim, proteja o arquivo original e os dados de acesso à sua conta.",
      ] },
      { id: "configuracao", title: "Como configurar no RexNotas", paragraphs: [
        "Entre na sua conta, selecione a empresa correta e abra a área de certificado. Informe o arquivo A1 e a senha pelo formulário protegido da aplicação. Aguarde a validação e confira os status apresentados.",
        "Uma verificação de acesso aos serviços fiscais não emite notas. Conclua os dados da empresa e do serviço e revise o lote antes de confirmar qualquer transmissão em produção.",
        "Se o status indicar uma pendência, confira a validade e o titular do certificado e a configuração da empresa. Uma falha temporária do serviço fiscal pode impedir uma verificação mesmo com o arquivo correto. Consulte o suporte pelo canal oficial se a pendência persistir, sem enviar o A1 ou sua senha pela conversa.",
      ] },
      { id: "renovacao", title: "Validade, renovação e acesso", paragraphs: [
        "Acompanhe a data de validade e planeje a renovação com sua certificadora. Depois de renovar, atualize o certificado da empresa na plataforma antes de solicitar novas emissões.",
        "Enviar o A1 ao Rex não instala o certificado no Windows ou no navegador. O acesso com certificado ao portal público de NFS-e é uma configuração separada no seu dispositivo.",
        "Para dúvidas sobre obrigações fiscais ou enquadramento, procure a contabilidade da empresa. Para dúvidas sobre emissão ou renovação do certificado, procure uma autoridade certificadora credenciada à ICP-Brasil.",
      ] },
    ],
    sources: [
      { title: "Instituto Nacional de Tecnologia da Informação — ICP-Brasil", href: "https://www.gov.br/iti/pt-br/assuntos/icp-brasil" },
      { title: "Portal oficial da NFS-e", href: "https://www.gov.br/nfse/pt-br" },
    ],
  },
];
