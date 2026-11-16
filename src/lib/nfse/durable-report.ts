const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const formats:Record<string,string>={empty:'vazio',json_object:'JSON',html:'HTML',other:'outro formato'};
const environments:Record<string,string>={number_0:'ambiente 0',number_1:'produção',number_2:'homologação',missing:'ambiente ausente',other:'ambiente não reconhecido'};
const transports=new Set(['invalid_destination','certificate_format','client_certificate','server_certificate','tls','dns','timeout','connection','response_limit','response']);
export function durableFiscalReport(traces:unknown[]|null|undefined){
 const lines=[`Armazenamento do diagnóstico: ${Array.isArray(traces)?'disponível':'aguardando atualização'}`];
 let original=false;
 for(const value of (traces??[]).slice(0,21)){
  const row=object(value),data=object(row.data),stage=row.stage==='submit'?'Primeiro envio':row.stage==='dps_lookup'?'Consulta da DPS':row.stage==='nfse_lookup'?'Consulta da NFS-e':null;
  if(!stage)continue;
  if(row.stage==='submit')original=true;
  if(data.phase==='intent'){lines.push(`${stage}: intenção registrada, retorno técnico ainda não persistido.`);continue;}
  const duration=typeof data.elapsedMs==='number'&&Number.isInteger(data.elapsedMs)&&data.elapsedMs>=0&&data.elapsedMs<=60000?`${Math.round(data.elapsedMs/100)/10} s`:'duração indisponível';
  if(data.phase==='failure'){
   lines.push(`${stage}: falha de transporte · ${typeof data.transport==='string'&&transports.has(data.transport)?data.transport:'categoria não reconhecida'} · ${duration}`);
  }else if(data.phase==='response'){
   const http=typeof data.http==='number'&&Number.isInteger(data.http)&&data.http>=100&&data.http<=599?data.http:0;
   const format=typeof data.format==='string'&&Object.hasOwn(formats,data.format)?formats[data.format]:'formato não reconhecido';
   const environment=typeof data.environment==='string'&&Object.hasOwn(environments,data.environment)?environments[data.environment]:'ambiente não reconhecido';
   const codes=Array.isArray(data.codes)?data.codes.filter(code=>typeof code==='string'&&/^E\d{4}$/.test(code)).slice(0,10):[];
   lines.push(`${stage}: HTTP ${http} · ${format} · ${environment} · códigos ${codes.join(', ')||'não identificados'} · ${duration}`);
  }
 }
 if(!original)lines.push('Detalhe HTTP do primeiro envio: não armazenado no histórico do banco.');
 lines.push('Metadados HTTP não substituem a validação fiscal do documento.');
 return lines;
}
