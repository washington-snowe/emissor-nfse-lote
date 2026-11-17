import assert from 'node:assert/strict';
import {test,mock} from 'node:test';
import {EventEmitter} from 'node:events';
import https from 'node:https';
import type {ClientRequest,IncomingMessage} from 'node:http';
import {fetchPortalDanfse,portalDownloadCookies,portalDanfseGet,DANFSE_PORTALS} from '../src/lib/nfse/portal-danfse.ts';

const key='2'.repeat(50),credentials={pfx:Buffer.from('SYNTHETIC ONLY'),password:'synthetic-only'};
const pdf=Buffer.from('%PDF-1.7\nSYNTHETIC ONLY\n'+' '.repeat(120)+'\n%%EOF\n');
const cookie=(environment:'production'|'homologation')=>'Session=synthetic-secret; Domain=.'+(environment==='production'?'nfse.gov.br':'producaorestrita.nfse.gov.br')+'; Path=/EmissorNacional; Secure; HttpOnly; SameSite=Lax';

test('sessão do portal envia apenas pares de cookies Secure do domínio e caminho do PDF',()=>{
 for(const environment of ['production','homologation'] as const){
  assert.equal(portalDownloadCookies(environment,[cookie(environment)]),'Session=synthetic-secret');
  for(const value of [cookie(environment).replace('; Secure',''),cookie(environment).replace('Path=/EmissorNacional','Path=/unrelated'),cookie(environment).replace(/Domain=[^;]+/,'Domain=.gov.br'),cookie(environment).replace(/Domain=[^;]+/,'Domain=example.invalid'),cookie(environment)+'; Domain=.nfse.gov.br',cookie(environment)+'\r\nX-Injected: secret',cookie(environment)+'; Max-Age=0',cookie(environment)+'; Expires=Thu, 01 Jan 1970 00:00:00 GMT'])assert.equal(portalDownloadCookies(environment,[value]),null);
  assert.equal(portalDownloadCookies(environment,['Session=secret; Path=/; Secure']),null,'host-only certificate cookie cannot cross to www');
  assert.equal(portalDownloadCookies(environment,[cookie(environment),cookie(environment)]),null,'ambiguous session rejected');
  assert.equal(portalDownloadCookies(environment,Array(17).fill(cookie(environment))),null);
 }
 assert.equal(portalDownloadCookies('production',[cookie('homologation')]),null);
 assert.equal(portalDownloadCookies('homologation',[cookie('production')]),'Session=synthetic-secret','a parent-domain cookie issued by the fixed restricted certificate host remains scoped to that invocation');
});

test('DANFS-e do portal faz somente login A1 e GET da chave própria no mesmo ambiente',async()=>{
 for(const environment of ['production','homologation'] as const){
  const steps:unknown[]=[],calls:string[]=[];
  const result=await fetchPortalDanfse(environment,key,credentials,Date.now()+30_000,s=>steps.push(s),async(env,stage,passedKey,passed,cookies,timeout)=>{
   assert.equal(env,environment);assert.equal(passedKey,key);assert.equal(passed,credentials);assert.ok(timeout<=7000);calls.push(stage);
   if(stage==='login'){assert.equal(cookies,'');return {status:302,body:Buffer.alloc(0),contentType:'text/html',location:DANFSE_PORTALS[env].origin+'/EmissorNacional/Dashboard',cookies:[cookie(env)]};}
   assert.equal(cookies,'Session=synthetic-secret');return {status:200,body:pdf,contentType:'application/pdf'};
  });
  assert.equal(result.bytes.compare(pdf),0);assert.match(result.sha256,/^[a-f0-9]{64}$/);assert.deepEqual(calls,['login','pdf']);
  assert.ok(!JSON.stringify(steps).includes(key));assert.ok(!JSON.stringify(steps).includes('synthetic-secret'));
 }
});

test('login inesperado, redirecionamento, ambiente alheio e cookies inválidos impedem GET do PDF',async()=>{
 const good={status:302,body:Buffer.alloc(0),contentType:'text/html',location:DANFSE_PORTALS.production.origin+'/EmissorNacional/Dashboard',cookies:[cookie('production')]};
 for(const changed of [{status:200},{status:401},{status:403},{status:429},{status:503},{location:'https://example.invalid/EmissorNacional/Dashboard'},{location:DANFSE_PORTALS.homologation.origin+'/EmissorNacional/Dashboard'},{location:good.location+'?url=foreign'},{location:'/EmissorNacional/Login'},{cookies:[]},{cookies:['Session=synthetic-secret; Path=/; Secure']}]){
  let calls=0;await assert.rejects(fetchPortalDanfse('production',key,credentials,Date.now()+30_000,undefined,async(_env,stage)=>{calls++;assert.equal(stage,'login');return {...good,...changed};}));assert.equal(calls,1);
 }
 for(const invalidKey of ['../foreign','1'.repeat(49),'1'.repeat(51)])await assert.rejects(fetchPortalDanfse('production',invalidKey,credentials,Date.now()+30_000,undefined,async()=>{throw new Error('Must not request');}));
 await assert.rejects(fetchPortalDanfse('production',key,credentials,Date.now(),undefined,async()=>{throw new Error('Must not request');}));
});

test('resposta do portal exige PDF íntegro, tipo binário e HTTP200 sem seguir login/redirect',async()=>{
 for(const response of [{status:302,body:pdf,contentType:'application/pdf'},{status:404,body:pdf,contentType:'application/pdf'},{status:200,body:pdf,contentType:'text/html'},{status:200,body:Buffer.from('<html>Login</html>'),contentType:'application/pdf'},{status:200,body:pdf.subarray(0,-8),contentType:'application/pdf'},{status:200,body:Buffer.alloc(2_000_001),contentType:'application/pdf'}]){
  await assert.rejects(fetchPortalDanfse('production',key,credentials,Date.now()+30_000,undefined,async(_env,stage)=>stage==='login'?{status:303,body:Buffer.alloc(0),contentType:'text/html',location:DANFSE_PORTALS.production.origin+'/EmissorNacional/Dashboard',cookies:[cookie('production')]}:response));
 }
});

test('transporte do portal fixa os dois destinos, preserva TLS e limita corpo, cookies e método',async()=>{
 const observed:{url:string;options:https.RequestOptions}[]=[];let oversized=false;
 const mocked=mock.method(https,'request',((url:URL,options:https.RequestOptions,callback:(response:IncomingMessage)=>void)=>{
  observed.push({url:url.href,options});const request=Object.assign(new EventEmitter(),{end(){queueMicrotask(()=>{const response=Object.assign(new EventEmitter(),{statusCode:200,headers:{'content-type':'application/pdf'}});callback(response as IncomingMessage);response.emit('data',oversized?Buffer.alloc(2_000_001):pdf);response.emit('end');});},destroy(error:Error){request.emit('error',error);}});return request as unknown as ClientRequest;
 }) as typeof https.request);
 try{
  await portalDanfseGet('production','login',key,credentials,'',1000);
  await portalDanfseGet('production','pdf',key,credentials,'Session=synthetic-secret',1000);
  assert.equal(observed[0].url,DANFSE_PORTALS.production.certificate+'/EmissorNacional/Certificado');
  assert.equal(observed[1].url,DANFSE_PORTALS.production.origin+'/EmissorNacional/Notas/Download/DANFSe/'+key);
  for(const {options} of observed){assert.equal(options.method,'GET');assert.equal(options.rejectUnauthorized,true);assert.equal(options.minVersion,'TLSv1.2');assert.equal(options.agent,false);assert.equal(options.pfx,credentials.pfx);}
  assert.equal((observed[0].options.headers as Record<string,string>).Cookie,undefined);assert.equal((observed[1].options.headers as Record<string,string>).Cookie,'Session=synthetic-secret');
  for(const [stage,passedKey,header] of [['pdf','../foreign',''],['login',key,'secret'],['pdf',key,'secret\r\nInjected: yes']] as const)await assert.rejects(portalDanfseGet('production',stage,passedKey,credentials,header,1000));
  assert.equal(observed.length,2);oversized=true;await assert.rejects(portalDanfseGet('production','pdf',key,credentials,'',1000),error=>Boolean(error&&typeof error==='object'&&'reason' in error&&error.reason==='response_limit'));
 }finally{mocked.mock.restore();}
});
