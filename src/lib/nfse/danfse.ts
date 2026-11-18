import {createHash} from 'node:crypto';
import {DANFSE_BASES,nfseGet,type NfseCredentials,type NfseEnvironment} from './http.ts';

export const MAX_DANFSE_BYTES=2_000_000;
export function supportedDanfseContract(value:unknown):boolean{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const raw=value as {paths?:Record<string,{get?:{parameters?:{name?:unknown;in?:unknown;required?:unknown;type?:unknown;schema?:{type?:unknown}}[];responses?:Record<string,unknown>}}>};
 const operation=raw.paths?.['/{chaveAcesso}']?.get;
 return Boolean(operation?.responses&&Object.hasOwn(operation.responses,'200')&&Array.isArray(operation.parameters)&&
 operation.parameters.some(p=>p.name==='chaveAcesso'&&p.in==='path'&&p.required===true&&(p.type==='string'||p.schema?.type==='string'))&&
 operation.parameters.every(p=>p.in==='path'?p.name==='chaveAcesso':p.required!==true));
}
export function validDanfsePdf(bytes:Buffer):boolean{
 if(bytes.length<100||bytes.length>MAX_DANFSE_BYTES||!/^%PDF-(?:1\.[0-9]|2\.0)[\r\n]/.test(bytes.subarray(0,12).toString('ascii')))return false;
 return /%%EOF[\t\r\n ]*$/.test(bytes.subarray(-1024).toString('latin1'));
}
/** Historical ADN adapter, retained for compatibility tests only. NT008/2026
 * suspended generation; the application now uses the local authorized-XML renderer. */
export async function fetchOfficialDanfse(environment:NfseEnvironment,key:string,contract:unknown,credentials:NfseCredentials,request=nfseGet){
 if(!['homologation','production'].includes(environment)||!/^\d{50}$/.test(key)||!supportedDanfseContract(contract))throw new Error('DANFSe contract unavailable');
 const result=await request(environment,DANFSE_BASES[environment]+'/'+key,credentials,7000);
 if(result.status!==200||!['application/pdf','application/octet-stream'].includes(result.contentType.split(';',1)[0].trim().toLowerCase())||!validDanfsePdf(result.body))throw new Error('DANFSe unavailable');
 return {bytes:result.body,sha256:createHash('sha256').update(result.body).digest('hex')};
}
