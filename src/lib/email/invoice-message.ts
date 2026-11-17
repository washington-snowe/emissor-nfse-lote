export function invoiceEmailText(input:{environment:'homologation'|'production';issuer:string;number:string;competence:string;amount:string}){
 const body=[
  'Olá, vendedor! Espero que esteja tudo certo por aí! 🦖',
  'Este e-mail é automático e contém a NFS-e do afiliado anexada, gerada pelo nosso sistema de emissão de NFS-e em lote.',
  'Já conhece nosso produto? Confira em: https://rexnotas.com.br — Descomplique a vida de seus afiliados e receba por isso. 😎',
  `Emissor: ${input.issuer}\nNFS-e: ${input.number}\nCompetência: ${input.competence}\nValor: R$ ${input.amount.replace('.',',')}`,
  'Atenciosamente,\nRexNotas - By: Washington E. Delfes',
 ];
 if(input.environment==='homologation')body.unshift('TESTE DE HOMOLOGAÇÃO · SEM VALOR FISCAL. Esta mensagem foi direcionada somente ao endereço de teste; não foi enviada ao vendedor.');
 return body.join('\n\n');
}
