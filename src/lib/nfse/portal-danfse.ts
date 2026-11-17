import https from 'node:https';
import {createHash} from 'node:crypto';
import {nfseTlsCredentials,type NfseCredentials,type NfseEnvironment} from './http.ts';
import {MAX_DANFSE_BYTES,validDanfsePdf} from './danfse.ts';
import {fiscalTransportError,NfseTransportError} from './transport-error.ts';

// Certificate links were read from the official Login pages. This is the web
// portal, not an OpenAPI contract or a replacement for fiscal authorization.
export const DANFSE_PORTALS={
 homologation:{origin:'https://www.producaorestrita.nfse.gov.br',certificate:'https://certificado.producaorestrita.nfse.gov.br'},
 production:{origin:'https://www.nfse.gov.br',certificate:'https://certificado.nfse.gov.br'},
} as const;
const prefix='/EmissorNacional';
type PortalResponse={status:number;body:Buffer;contentType:string;location?:string;cookies?:string[]};
export type PortalDanfseStep={stage:'portal_login'|'portal_pdf';status:number;outcome:'received'|'accepted'|'refused';reason?:'login_status'|'login_redirect'|'session_scope'|'pdf_status'|'pdf_type'|'pdf_format'};
type PortalRequest=(environment:NfseEnvironment,stage:'login'|'pdf',key:string,credentials:NfseCredentials,cookie:string,timeout:number)=>Promise<PortalResponse>;

/** No caller-supplied URL, redirects, general cookie jar or write methods. */
export const portalDanfseGet:PortalRequest=async(environment,stage,key,credentials,cookie,timeout)=>{
 if(!Object.hasOwn(DANFSE_PORTALS,environment)||!['login','pdf'].includes(stage)||!/^[0-9]{50}$/.test(key)||
  cookie.length>8192||/[\r\n\x00]/.test(cookie)||stage==='login'&&cookie!=='')throw new NfseTransportError('invalid_destination');
 const portal=DANFSE_PORTALS[environment];
 const url=new URL(stage==='login'?portal.certificate+prefix+'/Certificado':portal.origin+prefix+'/Notas/Download/DANFSe/'+key);
 return new Promise((resolve,reject)=>{
  let request:ReturnType<typeof https.request>|undefined;
  const fail=(error:unknown)=>{clearTimeout(timer);reject(fiscalTransportError(error));};
  const timer=setTimeout(()=>request?.destroy(new NfseTransportError('timeout')),Math.max(1,Math.min(Number.isFinite(timeout)?timeout:7000,7000)));
  try{
   request=https.request(url,{method:'GET',...nfseTlsCredentials(credentials),rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,
    headers:{Accept:stage==='pdf'?'application/pdf':'text/html','User-Agent':'EmissorNfse/0.1',...(cookie?{Cookie:cookie}:{})}},response=>{
    const chunks:Buffer[]=[];let size=0;
    response.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>(stage==='pdf'?MAX_DANFSE_BYTES:128_000)){request?.destroy(new NfseTransportError('response_limit'));return;}chunks.push(chunk);});
    response.on('end',()=>{clearTimeout(timer);resolve({status:response.statusCode??0,body:Buffer.concat(chunks),contentType:response.headers['content-type']??'',location:response.headers.location,cookies:response.headers['set-cookie']});});
    response.on('error',()=>fail(new NfseTransportError('response')));response.on('aborted',()=>fail(new NfseTransportError('response')));
   });
  }catch(error){fail(error);return;}
  request.on('error',fail);request.end();
 });
};

// Accept only Secure cookies explicitly scoped to the destination of the PDF.
// Host-only cookies from certificado.* cannot be sent to www.*. Attribute text
// never becomes a Cookie header. Session values remain local to this invocation.
export function portalDownloadCookies(environment:NfseEnvironment,headers:readonly string[]):string|null{
 if(!Object.hasOwn(DANFSE_PORTALS,environment)||headers.length>16)return null;const portal=DANFSE_PORTALS[environment];
 const destination=new URL(portal.origin),issuer=new URL(portal.certificate),cookies=new Map<string,string>();
 for(const header of headers){
  if(header.length>8192||/[\r\n\x00]/.test(header))return null;
  const [pair,...attributes]=header.split(';').map(x=>x.trim()),equal=pair.indexOf('=');
  if(equal<1)return null;
  const name=pair.slice(0,equal),value=pair.slice(equal+1);
  if(!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)||!value||!/^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]+$/.test(value))return null;
  let domain=issuer.hostname,path=prefix,secure=false,expired=false;
  const seen=new Set<string>();
  for(const attribute of attributes){
   const index=attribute.indexOf('='),key=(index<0?attribute:attribute.slice(0,index)).toLowerCase(),val=index<0?'':attribute.slice(index+1);
   if(['domain','path','secure','max-age','expires'].includes(key)&&seen.has(key))return null;seen.add(key);
   if(key==='domain')domain=val.toLowerCase().replace(/^\./,'');
   if(key==='path')path=val;
   if(key==='secure')secure=true;
   if(key==='max-age'&&(!/^\d+$/.test(val)||Number(val)<=0))expired=true;
   if(key==='expires'&&(!Number.isFinite(Date.parse(val))||Date.parse(val)<=Date.now()))expired=true;
  }
  const belongs=(host:string)=>host===domain||host.endsWith('.'+domain);
  const allowedParent=domain==='nfse.gov.br'||environment==='homologation'&&domain==='producaorestrita.nfse.gov.br';
  if(!secure||expired||!belongs(issuer.hostname)||!belongs(destination.hostname)||!allowedParent||!['/',prefix,prefix+'/'].includes(path))continue;
  if(cookies.has(name))return null;cookies.set(name,value);
 }
 const result=[...cookies].map(([name,value])=>name+'='+value).join('; ');
 return result&&result.length<=8192?result:null;
}

/** Only an owner-bound, already authorized key may reach this read-only helper. */
export async function fetchPortalDanfse(environment:NfseEnvironment,key:string,credentials:NfseCredentials,deadline:number,report?:(step:PortalDanfseStep)=>void,request:PortalRequest=portalDanfseGet){
 if(!Object.hasOwn(DANFSE_PORTALS,environment)||!/^\d{50}$/.test(key)||deadline-Date.now()<1000)throw new Error('DANFSe portal unavailable');
 let cookie:string|null=null;
 try{
  const login=await request(environment,'login',key,credentials,'',Math.min(7000,deadline-Date.now()));
  let destination:URL|undefined;try{destination=new URL(login.location??'',DANFSE_PORTALS[environment].certificate);}catch{/* Refuse unknown redirects. */}
  if(![302,303].includes(login.status)||destination?.href!==DANFSE_PORTALS[environment].origin+prefix+'/Dashboard'){
   report?.({stage:'portal_login',status:login.status,outcome:'refused',reason:![302,303].includes(login.status)?'login_status':'login_redirect'});
   throw new Error('DANFSe portal session unavailable');
  }
  cookie=portalDownloadCookies(environment,login.cookies??[]);
  if(!cookie){report?.({stage:'portal_login',status:login.status,outcome:'refused',reason:'session_scope'});throw new Error('DANFSe portal session unavailable');}
  report?.({stage:'portal_login',status:login.status,outcome:'accepted'});
  if(deadline-Date.now()<1000)throw new Error('DANFSe portal deadline');
  const result=await request(environment,'pdf',key,credentials,cookie,Math.min(7000,deadline-Date.now()));
  const typeValid=['application/pdf','application/octet-stream'].includes(result.contentType.split(';',1)[0].trim().toLowerCase());
  const valid=result.status===200&&typeValid&&validDanfsePdf(result.body);
  report?.({stage:'portal_pdf',status:result.status,outcome:valid?'accepted':'refused',...(!valid?{reason:result.status!==200?'pdf_status':!typeValid?'pdf_type':'pdf_format'} as const:{})});
  if(!valid)throw new Error('DANFSe portal PDF unavailable');
  return {bytes:result.body,sha256:createHash('sha256').update(result.body).digest('hex')};
 }finally{cookie=null;}
}
