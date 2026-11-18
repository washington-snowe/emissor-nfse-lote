import assert from 'node:assert/strict';
import {test,mock} from 'node:test';
import {EventEmitter} from 'node:events';
import https from 'node:https';
import type {ClientRequest,IncomingMessage} from 'node:http';
import {fetchPortalDanfse,portalDanfseGet,DANFSE_PORTALS,type PortalDanfseStep} from '../src/lib/nfse/portal-danfse.ts';
import {PortalSessionCookies} from '../src/lib/nfse/portal-session.ts';

const key='2'.repeat(50),credentials={pfx:Buffer.from('SYNTHETIC ONLY'),password:'synthetic-only'};
const pdf=Buffer.from('%PDF-1.7\nSYNTHETIC ONLY\n'+' '.repeat(120)+'\n%%EOF\n');
const cookie=(environment:'production'|'homologation',value='synthetic-secret')=>'Session='+value+'; Domain=.'+(environment==='production'?'nfse.gov.br':'producaorestrita.nfse.gov.br')+'; Path=/EmissorNacional; Secure; HttpOnly; SameSite=Lax';
const login=(environment:'production'|'homologation')=>({status:302,body:Buffer.alloc(0),contentType:'text/html',location:DANFSE_PORTALS[environment].origin+'/EmissorNacional/Dashboard',cookies:[cookie(environment)]});
const dashboard={status:200,body:Buffer.from('<html>synthetic dashboard</html>'),contentType:'text/html'};

test('sessão preserva escopo RFC6265, inclusive cookies host-only do www e cookies sem Secure somente em HTTPS',()=>{
 for(const environment of ['production','homologation'] as const){
  const jar=new PortalSessionCookies(environment,key);
  jar.receive('login',[cookie(environment),'CertificateOnly=secret; Path=/; Secure']);
  assert.equal(jar.header('dashboard'),'Session=synthetic-secret','host-only certificate cookie never crosses to www');
  jar.receive('dashboard',['WebSession=web-secret; Path=/; HttpOnly','Affinity=affinity-secret; Path=/; Secure','Other=other-secret; Path=/EmissorNacional/Other',cookie(environment,'refreshed-secret')]);
  assert.equal(jar.header('pdf'),'Session=refreshed-secret; WebSession=web-secret; Affinity=affinity-secret');
  jar.clear();assert.equal(jar.header('pdf'),'');
  jar.receive('login',[cookie(environment).replace('; Secure','')]);assert.equal(jar.header('pdf'),'Session=synthetic-secret','transport remains HTTPS even if an upstream cookie omits Secure');
  jar.receive('dashboard',[' Spaced = value ; Domain = '+new URL(DANFSE_PORTALS[environment].origin).hostname+' ; Path = / ; Secure ']);assert.ok(jar.header('pdf').includes('Spaced=value'));
 }
});

test('cookie de domínio alheio, público, ambiente incompatível, prefixo inválido e caminhos não relacionados não seguem ao PDF',()=>{
 const jar=new PortalSessionCookies('production',key);
 jar.receive('login',[cookie('homologation'),cookie('production').replace(/Domain=[^;]+/,'Domain=.gov.br'),cookie('production').replace(/Domain=[^;]+/,'Domain=example.invalid'),'Session=bad; Domain=www.nfse.gov.br; Path=/; Secure']);
 assert.equal(jar.header('pdf'),'');
 jar.receive('dashboard',['Private=other; Path=/EmissorNacional/Notas/Download/DANFSeOther','__Host-Invalid=secret; Domain=nfse.gov.br; Path=/; Secure','__Secure-Invalid=secret; Path=/']);
 assert.equal(jar.header('pdf'),'');
 jar.receive('dashboard',['__Host-Valid=host-secret; Path=/; Secure; HttpOnly']);assert.equal(jar.header('pdf'),'__Host-Valid=host-secret');
 assert.throws(()=>jar.receive('dashboard',['Injected=secret\r\nX-Injected: yes']));
 assert.throws(()=>jar.receive('dashboard',[cookie('production')+'; Domain=.nfse.gov.br']));
 assert.throws(()=>jar.receive('dashboard',Array(33).fill(cookie('production'))));
 const ambiguous=new PortalSessionCookies('production',key);ambiguous.receive('login',[cookie('production')]);ambiguous.receive('dashboard',['Session=host-secret; Path=/EmissorNacional; Secure']);assert.throws(()=>ambiguous.header('pdf'),'ambiguous same-name scopes must not choose a credential');
});

test('troca e expiração de cookies são locais à requisição; exclusão e precedência Max-Age não deixam sessão antiga',()=>{
 const a=new PortalSessionCookies('production',key),b=new PortalSessionCookies('production',key);
 a.receive('login',[cookie('production')]);assert.equal(b.header('pdf'),'');
 a.receive('dashboard',[cookie('production','replacement')]);assert.equal(a.header('pdf'),'Session=replacement');
 a.receive('dashboard',[cookie('production','')+'; Max-Age=0']);assert.equal(a.header('pdf'),'');
 a.receive('dashboard',[cookie('production')+'; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=60']);assert.equal(a.header('pdf'),'Session=synthetic-secret');
 a.receive('dashboard',[cookie('production')+'; Expires=Thu, 01 Jan 1970 00:00:00 GMT']);assert.equal(a.header('pdf'),'');
 b.receive('login',[cookie('production')]);a.clear();assert.equal(b.header('pdf'),'Session=synthetic-secret');b.clear();
});

test('reprodução da sessão: login302 precisa do Dashboard e dos cookies renovados antes do PDF',async()=>{
 for(const environment of ['production','homologation'] as const){
  const steps:PortalDanfseStep[]=[],calls:string[]=[];
  const result=await fetchPortalDanfse(environment,key,credentials,Date.now()+30_000,s=>steps.push(s),async(env,stage,passedKey,passed,cookies,timeout)=>{
   assert.equal(env,environment);assert.equal(passedKey,key);assert.equal(passed,credentials);assert.ok(timeout<=7000);calls.push(stage);
   if(stage==='login'){assert.equal(cookies,'');return login(env);}
   if(stage==='dashboard'){assert.equal(cookies,'Session=synthetic-secret');return {...dashboard,body:Buffer.from('<html><a href="/EmissorNacional/Notas/Download/DANFSe/'+key+'">PDF sintético</a></html>'),cookies:['WebSession=web-secret; Path=/; HttpOnly','Affinity=affinity-secret; Path=/; Secure',cookie(env,'new-auth-secret')]};}
   if(cookies!=='Session=new-auth-secret; WebSession=web-secret; Affinity=affinity-secret')return {status:403,body:Buffer.from('synthetic missing session'),contentType:'text/html'};
   assert.deepEqual(calls,['login','dashboard','pdf']);return {status:200,body:pdf,contentType:'application/pdf'};
  });
  assert.equal(result.bytes.compare(pdf),0);assert.match(result.sha256,/^[a-f0-9]{64}$/);
  for(const secret of [key,'synthetic-secret','web-secret','new-auth-secret','affinity-secret','Set-Cookie'])assert.ok(!JSON.stringify(steps).includes(secret));
  assert.ok(steps.some(s=>s.stage==='portal_dashboard'&&s.cookies?.accepted===3));
  assert.ok(steps.some(s=>s.stage==='portal_dashboard'&&s.documentLink==='matched'));
 }
});

test('login inesperado, redirect alheio, ambiente incompatível e sessão ausente impedem Dashboard e PDF',async()=>{
 const good=login('production');
 for(const changed of [{status:200},{status:401},{status:403},{status:429},{status:503},{location:'https://example.invalid/EmissorNacional/Dashboard'},{location:DANFSE_PORTALS.homologation.origin+'/EmissorNacional/Dashboard'},{location:good.location+'?url=foreign'},{location:'/EmissorNacional/Login'},{cookies:[]},{cookies:['Session=synthetic-secret; Path=/; Secure']}]){
  let calls=0;await assert.rejects(fetchPortalDanfse('production',key,credentials,Date.now()+30_000,undefined,async(_env,stage)=>{calls++;assert.equal(stage,'login');return {...good,...changed};}));assert.equal(calls,1);
 }
 for(const invalidKey of ['../foreign','1'.repeat(49),'1'.repeat(51)])await assert.rejects(fetchPortalDanfse('production',invalidKey,credentials,Date.now()+30_000,undefined,async()=>{throw new Error('Must not request');}));
 await assert.rejects(fetchPortalDanfse('production',key,credentials,Date.now(),undefined,async()=>{throw new Error('Must not request');}));
});

test('links da página não mudam destino ou chave; lista recente incompleta não invalida a nota autorizada',async()=>{
 const steps:PortalDanfseStep[]=[],calls:string[]=[];
 const result=await fetchPortalDanfse('production',key,credentials,Date.now()+30_000,s=>steps.push(s),async(env,stage,passedKey)=>{
  assert.equal(env,'production');assert.equal(passedKey,key);calls.push(stage);
  if(stage==='login')return login(env);
  if(stage==='dashboard')return {...dashboard,body:Buffer.from('<html><a href="https://example.invalid/EmissorNacional/Notas/Download/DANFSe/'+key+'">externo</a><a href="/EmissorNacional/Notas/Download/DANFSe/'+'3'.repeat(50)+'">outra nota</a></html>')};
  return {status:200,body:pdf,contentType:'application/pdf'};
 });
 assert.equal(result.bytes.compare(pdf),0);assert.deepEqual(calls,['login','dashboard','pdf']);assert.ok(steps.some(s=>s.stage==='portal_dashboard'&&s.documentLink==='not_listed'));
 assert.ok(!JSON.stringify(steps).includes(key));assert.ok(!JSON.stringify(steps).includes('example.invalid'));
});

test('Dashboard recusado, redirect ou formato alheio encerra a sessão sem tentar o PDF',async()=>{
 for(const response of [{...dashboard,status:403},{...dashboard,status:302,location:'/EmissorNacional/Login'},{...dashboard,contentType:'application/json'},{...dashboard,status:503}]){
  const calls:string[]=[];await assert.rejects(fetchPortalDanfse('production',key,credentials,Date.now()+30_000,undefined,async(_env,stage)=>{calls.push(stage);return stage==='login'?login('production'):response;}));assert.deepEqual(calls,['login','dashboard']);
 }
 const calls:string[]=[];await assert.rejects(fetchPortalDanfse('production',key,credentials,Date.now()+30_000,undefined,async(_env,stage)=>{calls.push(stage);return stage==='login'?login('production'):{...dashboard,cookies:[cookie('production','')+'; Max-Age=0']};}));assert.deepEqual(calls,['login','dashboard']);
});

test('resposta PDF exige HTTP200, MIME binário, limite e arquivo íntegro; IIS403 só exporta categoria',async()=>{
 const responses=[{status:302,body:pdf,contentType:'application/pdf'},{status:404,body:pdf,contentType:'application/pdf'},{status:200,body:pdf,contentType:'text/html'},{status:200,body:Buffer.from('<html>Login</html>'),contentType:'application/pdf'},{status:200,body:pdf.subarray(0,-8),contentType:'application/pdf'},{status:200,body:Buffer.alloc(2_000_001),contentType:'application/pdf'},{status:403,body:Buffer.from('<title>HTTP Error 403.7</title>PRIVATE '+key),contentType:'text/html'},{status:403,body:Buffer.alloc(0),contentType:''}];
 for(const response of responses){
  const steps:PortalDanfseStep[]=[];
  await assert.rejects(fetchPortalDanfse('production',key,credentials,Date.now()+30_000,s=>steps.push(s),async(_env,stage)=>stage==='login'?login('production'):stage==='dashboard'?dashboard:response));
  if(response.status===403){assert.equal(steps.at(-1)?.iis403,response.body.length?7:undefined);assert.equal(steps.at(-1)?.format,response.body.length?'html':'absent');assert.equal(steps.at(-1)?.body,response.body.length?'present':'empty');assert.ok(!JSON.stringify(steps).includes('PRIVATE'));assert.ok(!JSON.stringify(steps).includes(key));}
 }
});

test('transporte fixa certificado/Dashboard/PDF, referência ao Dashboard, TLS e limites sem URL ou redirect arbitrário',async()=>{
 const observed:{url:string;options:https.RequestOptions}[]=[];let oversized=false;
 const mocked=mock.method(https,'request',((url:URL,options:https.RequestOptions,callback:(response:IncomingMessage)=>void)=>{
  observed.push({url:url.href,options});const request=Object.assign(new EventEmitter(),{end(){queueMicrotask(()=>{const response=Object.assign(new EventEmitter(),{statusCode:200,headers:{'content-type':'application/pdf'}});callback(response as IncomingMessage);response.emit('data',oversized?Buffer.alloc(2_000_001):pdf);response.emit('end');});},destroy(error:Error){request.emit('error',error);}});return request as unknown as ClientRequest;
 }) as typeof https.request);
 try{
  await portalDanfseGet('production','login',key,credentials,'',1000);
  await portalDanfseGet('production','dashboard',key,credentials,'Session=synthetic-secret',1000);
  await portalDanfseGet('production','pdf',key,credentials,'Session=synthetic-secret; WebSession=web-secret',1000);
  assert.equal(observed[0].url,DANFSE_PORTALS.production.certificate+'/EmissorNacional/Certificado');
  assert.equal(observed[1].url,DANFSE_PORTALS.production.origin+'/EmissorNacional/Dashboard');
  assert.equal(observed[2].url,DANFSE_PORTALS.production.origin+'/EmissorNacional/Notas/Download/DANFSe/'+key);
  for(const {options} of observed){assert.equal(options.method,'GET');assert.equal(options.rejectUnauthorized,true);assert.equal(options.minVersion,'TLSv1.2');assert.equal(options.agent,false);}
  assert.equal(observed[0].options.pfx,credentials.pfx);assert.equal(observed[0].options.passphrase,credentials.password);
  for(const {options} of observed.slice(1))for(const field of ['pfx','passphrase','key','cert'])assert.equal(Object.hasOwn(options,field),false,'www session requests must not present protected A1 credentials');
  assert.equal((observed[0].options.headers as Record<string,string>).Cookie,undefined);assert.equal((observed[2].options.headers as Record<string,string>).Cookie,'Session=synthetic-secret; WebSession=web-secret');
  assert.equal((observed[2].options.headers as Record<string,string>).Referer,DANFSE_PORTALS.production.origin+'/EmissorNacional/Dashboard');
  assert.equal((observed[2].options.headers as Record<string,string>).Accept,'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8');
  for(const [stage,passedKey,header] of [['pdf','../foreign',''],['login',key,'secret'],['pdf',key,'secret\r\nInjected: yes']] as const)await assert.rejects(portalDanfseGet('production',stage,passedKey,credentials,header,1000));
  assert.equal(observed.length,3);oversized=true;await assert.rejects(portalDanfseGet('production','pdf',key,credentials,'',1000),error=>Boolean(error&&typeof error==='object'&&'reason' in error&&error.reason==='response_limit'));
 }finally{mocked.mock.restore();}
});
