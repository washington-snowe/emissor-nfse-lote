import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {fetchOfficialDanfse,supportedDanfseContract,validDanfsePdf} from '../src/lib/nfse/danfse.ts';
import {DANFSE_BASES,allowedDanfseUrl,nfseRequest} from '../src/lib/nfse/http.ts';
import {structuralContract,discoverOfficialContract} from '../src/lib/nfse/contract.ts';
import {invoiceEmailText} from '../src/lib/email/invoice-message.ts';
import {sendInvoiceEmail,type InvoiceMessage} from '../src/lib/email/providers.ts';
const document={openapi:'3.0.1',servers:[{url:'/danfse'}],paths:{'/{chaveAcesso}':{get:{parameters:[{name:'chaveAcesso',in:'path',required:true,schema:{type:'string'}}],responses:{'200':{description:'SYNTHETIC ONLY'}}}}}};
const contract=structuralContract(document,'danfse'),key='1'.repeat(50),credentials={pfx:Buffer.from('synthetic'),password:'synthetic'};
const pdf=Buffer.from('%PDF-1.7\n% SYNTHETIC DOCUMENT ONLY\n'+' '.repeat(100)+'\n%%EOF\n');
test('DANFS-e só lê chave fixa no host e ambiente oficiais; não aceita POST ou URL externa',async()=>{
 assert.ok(supportedDanfseContract(contract));assert.equal(supportedDanfseContract({...contract,paths:{}}),false);
 for(const env of ['homologation','production'] as const){assert.ok(allowedDanfseUrl(env,DANFSE_BASES[env]+'/'+key));for(const url of [DANFSE_BASES[env]+'/../outside',DANFSE_BASES[env]+'/'+key+'?url=evil',DANFSE_BASES[env]+'/'+key+'#x','http://adn.nfse.gov.br/danfse/'+key,'https://user@adn.nfse.gov.br/danfse/'+key,'https://example.invalid/danfse/'+key,DANFSE_BASES[env==='production'?'homologation':'production']+'/'+key])assert.equal(allowedDanfseUrl(env,url),null);}
 await assert.rejects(nfseRequest('production','POST',DANFSE_BASES.production+'/'+key,credentials,Buffer.from('{}')),/Invalid fiscal destination/);
});
test('captura DANFS-e segue apenas documentação referenciada, sem fallback ou JS executável',async()=>{
 const base=DANFSE_BASES.production,calls:string[]=[];
 const captured=await discoverOfficialContract('production',credentials,Date.now()+30_000,async(env,url)=>{calls.push(url);assert.equal(env,'production');if(url===base+'/docs/index.html')return {status:200,contentType:'text/html',body:Buffer.from('<script src="index.js"></script>')};if(url===base+'/docs/index.js')return {status:200,contentType:'text/javascript',body:Buffer.from('openApi: "../swagger/v1/swagger.json"; globalThis.doNotExecuteDanfse = true;')};assert.equal(url,base+'/swagger/v1/swagger.json');return {status:200,contentType:'application/json',body:Buffer.from(JSON.stringify(document))};},undefined,'danfse');
 assert.ok(captured&&supportedDanfseContract(captured.contract));assert.equal(calls.length,3);assert.equal('doNotExecuteDanfse' in globalThis,false);
 const missing:string[]=[];assert.equal(await discoverOfficialContract('production',credentials,Date.now()+30_000,async(_env,url)=>{missing.push(url);return {status:200,contentType:'text/html',body:Buffer.from('url: "https://example.invalid/swagger.json"')};},undefined,'danfse'),null);assert.deepEqual(missing,[base+'/docs/index.html']);
});
test('PDF oficial exige HTTP 200, conteúdo binário, assinatura PDF, limite e fim íntegro',async()=>{
 assert.ok(validDanfsePdf(pdf));
 const result=await fetchOfficialDanfse('production',key,contract,credentials,async(env,url,material)=>{assert.equal(env,'production');assert.equal(url,DANFSE_BASES.production+'/'+key);assert.equal(material,credentials);return {status:200,contentType:'application/pdf',body:pdf};});
 assert.equal(result.sha256,createHash('sha256').update(pdf).digest('hex'));
 for(const response of [{status:404,contentType:'application/pdf',body:pdf},{status:200,contentType:'text/html',body:pdf},{status:200,contentType:'application/pdf',body:Buffer.from('<html>error</html>')},{status:200,contentType:'application/pdf',body:pdf.subarray(0,-6)},{status:200,contentType:'application/pdf',body:Buffer.alloc(2_000_001)}])await assert.rejects(fetchOfficialDanfse('production',key,contract,credentials,async()=>response));
 let called=false;await assert.rejects(fetchOfficialDanfse('production','../foreign',contract,credentials,async()=>{called=true;throw new Error();}));assert.equal(called,false);
});
test('os três provedores recebem XML e PDF separados; texto segue a identidade RexNotas',async()=>{
 const text=invoiceEmailText({environment:'production',issuer:'Emitente sintético',number:'1',competence:'2026-10-31',amount:'11.01'});
 for(const phrase of ['Olá, vendedor!','🦖','https://rexnotas.com.br','receba por isso. 😎','Washington E. Delfes'])assert.ok(text.includes(phrase));assert.ok(!text.includes('HOMOLOGAÇÃO'));
 const message:InvoiceMessage={from:'notas@example.com',to:'seller@example.com',subject:'NFS-e',text,xml:'<synthetic/>',filename:'NFSe.xml',pdf,pdfFilename:'DANFSe.pdf'};
 for(const provider of ['brevo','sendpulse','mailjet'] as const){let sends=0;const result=await sendInvoiceEmail(provider,message,{BREVO_API_KEY:'synthetic',SENDPULSE_CLIENT_ID:'synthetic',SENDPULSE_CLIENT_SECRET:'synthetic',MAILJET_API_KEY:'synthetic',MAILJET_SECRET_KEY:'synthetic'},async(url,init)=>{if(url.endsWith('/oauth/access_token'))return Response.json({access_token:'synthetic'});sends++;const body=JSON.parse(String(init.body));if(provider==='brevo'){assert.equal(body.attachment.length,2);assert.equal(Buffer.from(body.attachment[1].content,'base64').compare(pdf),0);}else if(provider==='mailjet'){assert.equal(body.Messages[0].Attachments[1].ContentType,'application/pdf');assert.equal(Buffer.from(body.Messages[0].Attachments[1].Base64Content,'base64').compare(pdf),0);}else{assert.ok(body.email.includes('DANFSe.pdf'));assert.ok(body.email.includes(pdf.toString('base64')));}return Response.json(provider==='brevo'?{messageId:'synthetic'}:provider==='sendpulse'?{result:true,id:'synthetic'}:{Messages:[{Status:'success',To:[{MessageUUID:'synthetic'}]}]});});assert.equal(result.outcome,'accepted');assert.equal(sends,1);}
});
