import type {NfseEnvironment} from './http.ts';

export const DANFSE_PORTALS={
 homologation:{origin:'https://www.producaorestrita.nfse.gov.br',certificate:'https://certificado.producaorestrita.nfse.gov.br'},
 production:{origin:'https://www.nfse.gov.br',certificate:'https://certificado.nfse.gov.br'},
} as const;
export type PortalStage='login'|'dashboard'|'pdf';
const prefix='/EmissorNacional';
export function portalStageUrl(environment:NfseEnvironment,stage:PortalStage,key:string):URL{
 if(!Object.hasOwn(DANFSE_PORTALS,environment)||!['login','dashboard','pdf'].includes(stage)||!/^\d{50}$/.test(key))throw new Error('Portal destination unavailable');
 const portal=DANFSE_PORTALS[environment];
 return new URL(stage==='login'?portal.certificate+prefix+'/Certificado':portal.origin+prefix+(stage==='dashboard'?'/Dashboard':'/Notas/Download/DANFSe/'+key));
}

type Cookie={name:string;value:string;domain:string;path:string;hostOnly:boolean;expires:number|null};
const domainMatches=(host:string,domain:string)=>host===domain||host.endsWith('.'+domain);
const pathMatches=(target:string,path:string)=>target===path||target.startsWith(path)&&(path.endsWith('/')||target[path.length]==='/');

/** RFC6265 scope/replacement, local to one protected read. No arbitrary origins,
 * files, global jar, browser cookies or HTTP requests. Every target is HTTPS.
 * An upstream cookie without Secure is still sent only over verified HTTPS;
 * discarding it would lose legitimate session/affinity state from the portal.
 */
export class PortalSessionCookies{
 #cookies=new Map<string,Cookie>();
 #environment:NfseEnvironment;#key:string;
 constructor(environment:NfseEnvironment,key:string){portalStageUrl(environment,'login',key);this.#environment=environment;this.#key=key;}
 receive(stage:'login'|'dashboard',headers:readonly string[]){
  if(!['login','dashboard'].includes(stage)||headers.length>32||headers.reduce((n,s)=>n+s.length,0)>16_384)throw new Error('Portal session unavailable');
  const source=portalStageUrl(this.#environment,stage,this.#key),next=new Map(this.#cookies);let accepted=0;
  for(const header of headers){
   if(header.length>8192||/[\r\n\x00]/.test(header))throw new Error('Portal session unavailable');
   const [pair,...attributes]=header.split(';').map(x=>x.trim()),index=pair.indexOf('=');
   if(index<1)throw new Error('Portal session unavailable');
   const name=pair.slice(0,index).trim(),value=pair.slice(index+1).trim(),inner=value.startsWith('"')&&value.endsWith('"')?value.slice(1,-1):value;
   if(!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)||!/^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*$/.test(inner))throw new Error('Portal session unavailable');
   let domain=source.hostname,path=source.pathname.slice(0,source.pathname.lastIndexOf('/'))||'/',hostOnly=true,secure=false,expires:number|null=null,maxAge:number|undefined;
   const seen=new Set<string>();
   for(const attribute of attributes){
    const equal=attribute.indexOf('='),key=(equal<0?attribute:attribute.slice(0,equal)).trim().toLowerCase(),val=equal<0?'':attribute.slice(equal+1).trim();
    if(['domain','path','secure','max-age','expires'].includes(key)&&seen.has(key))throw new Error('Portal session unavailable');seen.add(key);
    if(key==='domain'){domain=val.toLowerCase().replace(/^\./,'');hostOnly=false;}
    if(key==='path'&&val.startsWith('/'))path=val;
    if(key==='secure')secure=true;
    if(key==='max-age'&&/^-?\d{1,15}$/.test(val))maxAge=Number(val);
    if(key==='expires'&&Number.isFinite(Date.parse(val)))expires=Date.parse(val);
   }
   const allowed=domain===source.hostname||domain==='nfse.gov.br'||this.#environment==='homologation'&&domain==='producaorestrita.nfse.gov.br';
   if(!allowed||!domainMatches(source.hostname,domain)||name.startsWith('__Secure-')&&!secure||name.startsWith('__Host-')&&(!secure||!hostOnly||path!=='/'))continue;
   if(maxAge!==undefined)expires=Date.now()+maxAge*1000;
   const identity=JSON.stringify([name,domain,path]);
   if(expires!==null&&expires<=Date.now()){next.delete(identity);continue;}
   next.set(identity,{name,value,domain,path,hostOnly,expires});accepted++;
  }
  if(next.size>32||[...next.values()].reduce((n,c)=>n+c.name.length+c.value.length,0)>8192)throw new Error('Portal session unavailable');
  this.#cookies=next;
  return {received:headers.length,accepted};
 }
 header(stage:'dashboard'|'pdf'){
  if(!['dashboard','pdf'].includes(stage))throw new Error('Portal session unavailable');
  const target=portalStageUrl(this.#environment,stage,this.#key),selected:Cookie[]=[];
  for(const [identity,cookie] of this.#cookies){
   if(cookie.expires!==null&&cookie.expires<=Date.now()){this.#cookies.delete(identity);continue;}
   if((cookie.hostOnly?target.hostname===cookie.domain:domainMatches(target.hostname,cookie.domain))&&pathMatches(target.pathname,cookie.path))selected.push(cookie);
  }
  selected.sort((a,b)=>b.path.length-a.path.length);
  if(new Set(selected.map(c=>c.name)).size!==selected.length)throw new Error('Portal session unavailable');
  const value=selected.map(c=>c.name+'='+c.value).join('; ');
  if(value.length>8192)throw new Error('Portal session unavailable');
  return value;
 }
 clear(){this.#cookies.clear();}
}
