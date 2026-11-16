import {SCHEMA_FIELDS} from './schema-evidence.ts';
import {supportedNfseContract} from './api-contract.ts';
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
   if(codes.includes('E1235')){
    lines.push('E1235: falha no esquema XML do DF-e (definição oficial).');
    const fields=Array.isArray(data.xsdFields)?data.xsdFields.filter(field=>SCHEMA_FIELDS.some(name=>name===field)).slice(0,10):[];
    lines.push(`Campos informados pela SEFIN: ${fields.length?fields.join(', '):'não preservados ou não identificados'}.`);
   }
   if(codes.includes('E0008'))lines.push('E0008: a SEFIN considerou dhEmi posterior à data/hora do processamento (definição oficial).');
   const identities:Record<string,string>={missing:'ausente',null:'nula',matching:'corresponde à operação',mismatch:'não corresponde integralmente ao identificador esperado',invalid:'formato não reconhecido'};
   if(typeof data.dpsIdentity==='string'&&Object.hasOwn(identities,data.dpsIdentity))lines.push(`Identidade na resposta: ${identities[data.dpsIdentity]}.`);
   if(typeof data.serverVersion==='string'&&/^SefinNacional_[0-9]{1,2}(\.[0-9]{1,6}){1,5}$/.test(data.serverVersion))lines.push(`Versão informada pelo serviço: ${data.serverVersion}.`);
  }
 }
 if(!original)lines.push('Detalhe HTTP do primeiro envio: não armazenado no histórico do banco.');
 lines.push('Metadados HTTP não substituem a validação fiscal do documento.');
 return lines;
}
export function hasStoredSchemaRejection(traces:unknown):boolean{
 return Array.isArray(traces)&&traces.slice(0,21).some(value=>{const row=object(value),data=object(row.data);return row.stage==='submit'&&data.phase==='response'&&Array.isArray(data.codes)&&data.codes.includes('E1235');});
}
export function hasStoredCreatedResponse(traces:unknown):boolean{
 return Array.isArray(traces)&&traces.slice(0,21).some(value=>{const row=object(value),data=object(row.data);return row.stage==='submit'&&data.phase==='response'&&data.http===201;});
}
export function needsStoredDpsInspection(traces:unknown):boolean{
 return hasStoredSchemaRejection(traces)||Array.isArray(traces)&&traces.slice(0,21).some(value=>{const row=object(value),data=object(row.data);return row.stage==='submit'&&data.phase==='response'&&Array.isArray(data.codes)&&data.codes.includes('E0008');});
}
export function storedContractReport(raw:unknown):string[]{
 const contract=supportedNfseContract(raw);
 if(!contract)return ['Contrato SEFIN atual: adaptador não reconhecido.'];
 const statuses=['400','403','422'].filter(status=>Object.hasOwn(contract.rejections,status));
 return ['Contrato SEFIN atual: adaptador reconhecido.',`Status com rejeição fiscal reconhecida no contrato atual: ${statuses.map(status=>'HTTP '+status).join(', ')||'nenhum'}.`,
  'O contrato atual não recupera o envelope original nem reclassifica esta operação.'];
}
