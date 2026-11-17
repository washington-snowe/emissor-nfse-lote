import https from 'node:https';
import {createHash} from 'node:crypto';
import {nfseTlsCredentials,type NfseCredentials,type NfseEnvironment} from './http.ts';
import {MAX_DANFSE_BYTES,validDanfsePdf} from './danfse.ts';
import {fiscalTransportError,NfseTransportError} from './transport-error.ts';
import {DANFSE_PORTALS,portalStageUrl,PortalSessionCookies,type PortalStage} from './portal-session.ts';
export {DANFSE_PORTALS} from './portal-session.ts';

// Certificate links were read from the official Login pages. This is the web
// portal, not an OpenAPI contract or a replacement for fiscal authorization.
const prefix='/EmissorNacional';
type PortalResponse={status:number;body:Buffer;contentType:string;location?:string;cookies?:string[]};
export type PortalDanfseStep={stage:'portal_login'|'portal_dashboard'|'portal_pdf';status:number;outcome:'received'|'accepted'|'refused';format?:'html'|'json'|'pdf'|'other';cookies?:{received:number;accepted:number};iis403?:number;reason?:'login_status'|'login_redirect'|'session_scope'|'dashboard_status'|'dashboard_type'|'pdf_status'|'pdf_type'|'pdf_format'};
type PortalRequest=(environment:NfseEnvironment,stage:PortalStage,key:string,credentials:NfseCredentials,cookie:string,timeout:number)=>Promise<PortalResponse>;

/** No caller-supplied URL, redirects, general cookie jar or write methods. */
export const portalDanfseGet:PortalRequest=async(environment,stage,key,credentials,cookie,timeout)=>{
 if(!Object.hasOwn(DANFSE_PORTALS,environment)||!['login','dashboard','pdf'].includes(stage)||!/^[0-9]{50}$/.test(key)||
  cookie.length>8192||/[\r\n\x00]/.test(cookie)||stage==='login'&&cookie!=='')throw new NfseTransportError('invalid_destination');
 const portal=DANFSE_PORTALS[environment],url=portalStageUrl(environment,stage,key);
 return new Promise((resolve,reject)=>{
  let request:ReturnType<typeof https.request>|undefined;
  const fail=(error:unknown)=>{clearTimeout(timer);reject(fiscalTransportError(error));};
  const timer=setTimeout(()=>request?.destroy(new NfseTransportError('timeout')),Math.max(1,Math.min(Number.isFinite(timeout)?timeout:7000,7000)));
  try{
   request=https.request(url,{method:'GET',...nfseTlsCredentials(credentials),rejectUnauthorized:true,minVersion:'TLSv1.2',agent:false,
    headers:{Accept:stage==='pdf'?'application/pdf':'text/html','User-Agent':'EmissorNfse/0.1',...(stage==='pdf'?{Referer:portal.origin+prefix+'/Dashboard'}:{}),...(cookie?{Cookie:cookie}:{})}},response=>{
    const chunks:Buffer[]=[];let size=0;
    response.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>(stage==='pdf'?MAX_DANFSE_BYTES:stage==='dashboard'?512_000:128_000)){request?.destroy(new NfseTransportError('response_limit'));return;}chunks.push(chunk);});
    response.on('end',()=>{clearTimeout(timer);resolve({status:response.statusCode??0,body:Buffer.concat(chunks),contentType:response.headers['content-type']??'',location:response.headers.location,cookies:response.headers['set-cookie']});});
    response.on('error',()=>fail(new NfseTransportError('response')));response.on('aborted',()=>fail(new NfseTransportError('response')));
   });
  }catch(error){fail(error);return;}
  request.on('error',fail);request.end();
 });
};

function responseDetails(response:PortalResponse){
 const mime=response.contentType.split(';',1)[0].trim().toLowerCase();
 const format:NonNullable<PortalDanfseStep['format']>=mime==='text/html'?'html':mime==='application/json'||mime==='application/problem+json'?'json':mime==='application/pdf'?'pdf':'other';
 // Export only a fixed numeric IIS substatus, never an error page/body or URL.
 const sub=response.status===403&&format==='html'?/\bHTTP\s+Error\s+403\.(\d{1,2})\b/i.exec(response.body.subarray(0,12_000).toString('utf8')):null;
 const iis403=sub?Number(sub[1]):undefined;
 return {format,...(iis403!==undefined&&iis403<=24?{iis403}:{})};
}

/** Only an owner-bound, already authorized key may reach this read-only helper. */
export async function fetchPortalDanfse(environment:NfseEnvironment,key:string,credentials:NfseCredentials,deadline:number,report?:(step:PortalDanfseStep)=>void,request:PortalRequest=portalDanfseGet){
 if(!Object.hasOwn(DANFSE_PORTALS,environment)||!/^\d{50}$/.test(key)||deadline-Date.now()<1000)throw new Error('DANFSe portal unavailable');
 const session=new PortalSessionCookies(environment,key);
 try{
  const login=await request(environment,'login',key,credentials,'',Math.min(7000,deadline-Date.now()));
  let destination:URL|undefined;try{destination=new URL(login.location??'',DANFSE_PORTALS[environment].certificate);}catch{/* Refuse unknown redirects. */}
  if(![302,303].includes(login.status)||destination?.href!==DANFSE_PORTALS[environment].origin+prefix+'/Dashboard'){
   report?.({stage:'portal_login',status:login.status,outcome:'refused',...responseDetails(login),reason:![302,303].includes(login.status)?'login_status':'login_redirect'});
   throw new Error('DANFSe portal session unavailable');
  }
  let received:{received:number;accepted:number},dashboardCookie:string;
  try{received=session.receive('login',login.cookies??[]);dashboardCookie=session.header('dashboard');}
  catch{report?.({stage:'portal_login',status:login.status,outcome:'refused',reason:'session_scope'});throw new Error('DANFSe portal session unavailable');}
  if(!dashboardCookie){report?.({stage:'portal_login',status:login.status,outcome:'refused',...responseDetails(login),cookies:received,reason:'session_scope'});throw new Error('DANFSe portal session unavailable');}
  report?.({stage:'portal_login',status:login.status,outcome:'accepted',...responseDetails(login),cookies:received});
  // Complete the exact validated same-environment redirect, as the browser does.
  // Dashboard may establish/refresh host-only www session and affinity cookies.
  if(deadline-Date.now()<1000)throw new Error('DANFSe portal deadline');
  const dashboard=await request(environment,'dashboard',key,credentials,dashboardCookie,Math.min(7000,deadline-Date.now()));
  const details=responseDetails(dashboard),dashboardValid=dashboard.status===200&&details.format==='html';
  report?.({stage:'portal_dashboard',status:dashboard.status,outcome:dashboardValid?'accepted':'refused',...details,...(!dashboardValid?{reason:dashboard.status!==200?'dashboard_status':'dashboard_type'} as const:{})});
  if(!dashboardValid)throw new Error('DANFSe portal dashboard unavailable');
  let refreshed:{received:number;accepted:number},cookie:string;
  try{refreshed=session.receive('dashboard',dashboard.cookies??[]);cookie=session.header('pdf');}
  catch{report?.({stage:'portal_dashboard',status:dashboard.status,outcome:'refused',reason:'session_scope'});throw new Error('DANFSe portal session unavailable');}
  report?.({stage:'portal_dashboard',status:dashboard.status,outcome:'received',cookies:refreshed});
  if(deadline-Date.now()<1000)throw new Error('DANFSe portal deadline');
  if(!cookie){report?.({stage:'portal_dashboard',status:dashboard.status,outcome:'refused',reason:'session_scope'});throw new Error('DANFSe portal session unavailable');}
  const result=await request(environment,'pdf',key,credentials,cookie,Math.min(7000,deadline-Date.now()));
  const typeValid=['application/pdf','application/octet-stream'].includes(result.contentType.split(';',1)[0].trim().toLowerCase());
  const valid=result.status===200&&typeValid&&validDanfsePdf(result.body);
  report?.({stage:'portal_pdf',status:result.status,outcome:valid?'accepted':'refused',...responseDetails(result),...(!valid?{reason:result.status!==200?'pdf_status':!typeValid?'pdf_type':'pdf_format'} as const:{})});
  if(!valid)throw new Error('DANFSe portal PDF unavailable');
  return {bytes:result.body,sha256:createHash('sha256').update(result.body).digest('hex')};
 }finally{session.clear();}
}
