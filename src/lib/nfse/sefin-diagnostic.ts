import {automaticCertificateCheck,type CertificateCheckIdentity} from './automatic-certificate-check.ts';
import {ownSefinLookupId} from './transport-proof.ts';
import {readFiscalJson} from './api-contract.ts';
import {fiscalTransportError,type NfseTransportFailure} from './transport-error.ts';

type Dependencies=Parameters<typeof automaticCertificateCheck>[1];
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};

// Fixed protocol labels only. Unknown text never leaves the response boundary.
export function sefinEnvironmentDiagnostic(value:unknown):string {
 if(value===undefined)return 'ausente';
 if(value===null)return 'nulo';
 if(value===0)return 'número 0';
 if(value===1)return 'número 1 (produção)';
 if(value===2)return 'número 2 (homologação)';
 const labels=['0','1','2','PRODUCAO','PRODUCAO_RESTRITA','PRODUCAORESTRITA','HOMOLOGACAO','Producao','ProducaoRestrita','Homologacao'];
 if(typeof value==='string')return labels.includes(value)?`texto: ${value}`:'outro texto (valor omitido)';
 return typeof value==='number'?'outro número (valor omitido)':typeof value==='boolean'?'booleano':Array.isArray(value)?'lista':'objeto';
}

/** Only fixed categories, booleans and whitelisted Edddd codes leave this boundary. */
export async function diagnoseSefinAccess(identity:CertificateCheckIdentity,deps:Dependencies,revision?:string){
 let loaded=false,response:Awaited<ReturnType<Dependencies['get']>>|undefined,transport:NfseTransportFailure|undefined;
 const result=await automaticCertificateCheck(identity,{
  load:async()=>{const material=await deps.load();loaded=true;return material;},
  contract:deps.contract,
  get:async(url,credentials)=>{
   try{response=await deps.get(url,credentials);return response;}
   catch(error){transport=fiscalTransportError(error).reason;throw error;}
  },
 });
 const stamp=revision&&/^[a-f0-9]{7,40}$/i.test(revision)?revision.slice(0,7):'local';
 const lines=[`Diagnóstico: nfse-sefin-v3 (${stamp})`,`A1 protegido: ${loaded?'aberto e validado localmente':'carregamento não concluído'}`,`Resultado: ${result.code}`];
 if(response){
  const body=response.body,data=readFiscalJson(body);
  let json=false;
  if(body.length&&body.length<=1_000_000){try{JSON.parse(body.toString('utf8'));json=true;}catch{/* Never return parser text or input. */}}
  const format=!body.length?'vazio':json?'JSON':/^\s*(?:<!doctype\s+html|<html\b)/i.test(body.subarray(0,512).toString('utf8'))?'HTML':'outro';
  const code=result.http,environment=data?.tipoAmbiente;
  lines.push(`Consulta: GET /dps/{id} · HTTP ${Number.isInteger(code)&&code>=100&&code<=599?code:0} · ${format}`);
  lines.push(`Ambiente declarado: ${environment===2?'homologação':environment===1?'produção':environment===undefined?'ausente':'não reconhecido'}`);
  lines.push(`Representação do ambiente: ${sefinEnvironmentDiagnostic(environment)}`);
  const field=['erro','erros','error','errors','Erro','Erros'].find(key=>data&&Object.hasOwn(data,key));
  const errors=field&&data?data[field]:undefined;
  lines.push(`Estrutura de erro: ${!field?'ausente':Array.isArray(errors)?'lista':errors&&typeof errors==='object'?'objeto':'não reconhecida'}`);
  const entries=Array.isArray(errors)?errors.slice(0,100):[errors];
  const codes=[...new Set(entries.flatMap(entry=>{
   const item=object(entry);return ['codigo','Codigo','code','Code'].flatMap(key=>typeof item[key]==='string'&&/^E\d{4}$/.test(item[key])?[item[key] as string]:[]);
  }))].slice(0,10);
  lines.push(`Códigos fiscais: ${codes.join(', ')||'nenhum código Edddd reconhecido'}`);
  lines.push(`Mensagem genérica da API: ${data&&['message','Message','mensagem','Mensagem'].some(key=>Object.hasOwn(data,key))?'presente':'ausente'}`);
  let ownId='';try{ownId=ownSefinLookupId(identity.municipality,identity.cnpj,identity.series);}catch{/* Identity already validated by the shared pipeline. */}
  lines.push(`Identidade DPS: ${data?.idDps===undefined?'ausente':data.idDps===ownId?'corresponde à consulta':'não corresponde à consulta'}`);
  lines.push(`Resposta compatível com o contrato: ${result.code==='sefin_verified'?'sim':'não'}`);
 }
 if(transport)lines.push(`Transporte: ${transport}`);
 lines.push('Nenhuma nota foi enviada por este diagnóstico.');
 return {result,details:lines.join('\n')};
}
