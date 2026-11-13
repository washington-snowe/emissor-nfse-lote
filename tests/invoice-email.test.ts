import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mailbox,sellerEmailRoute} from '../src/lib/email/routing.ts';
import {emailConfig} from '../src/lib/email/config.ts';
import {sendInvoiceEmail,sendPulseSerialize,type InvoiceMessage} from '../src/lib/email/providers.ts';
import {parseShopeeSellerCsv} from '../src/lib/shopee-seller-csv.ts';
const message:InvoiceMessage={from:'nfse@example.com',to:'teste@example.com',subject:'NFS-e 1',text:'Teste sintético, sem entrega real.',xml:'<synthetic/>',filename:'NFSe-test.xml'};
test('email route keeps each seller separate, rejects injected/missing addresses and mixed consolidation',async()=>{
 const parsed=await parseShopeeSellerCsv(await readFile(new URL('./fixtures/shopee-seller-monthly-v1.csv',import.meta.url)));assert.ok(parsed.data);
 assert.equal(sellerEmailRoute(parsed.data,{sourceRows:[2]}).email,'loja-a@empresa.example');
 assert.equal(sellerEmailRoute(parsed.data,{sourceRows:[2,3]}).reason,'ambiguous_recipient');
 assert.equal(sellerEmailRoute(parsed.data,{sourceRows:[999]}).reason,'ambiguous_recipient');
 const changed=structuredClone(parsed.data);changed.reportedSellers[0].email='a@example.com\r\nBcc:x@evil.com';
 assert.equal(sellerEmailRoute(changed,{sourceRows:[2]}).reason,'invalid_email');
 for(const value of ['','two@example.com,other@example.com','A <a@example.com>','a@localhost','a..b@example.com','a@-bad.com','a@example.com\n'])assert.equal(mailbox(value),null,value);
 assert.equal(mailbox('box+fiscal@EXAMPLE.COM'),'box+fiscal@example.com');
});
test('provider activation requires private keys and sender, fixed priority, no implicit test destination',()=>{
 assert.equal(emailConfig({NFSE_EMAIL_ENABLED:'true'}).enabled,false);
 const config=emailConfig({NFSE_EMAIL_ENABLED:'true',NFSE_EMAIL_FROM:'nfse@example.com',BREVO_API_KEY:'synthetic',SENDPULSE_CLIENT_ID:'synthetic',SENDPULSE_CLIENT_SECRET:'synthetic',MAILJET_API_KEY:'synthetic',MAILJET_SECRET_KEY:'synthetic'});
 assert.deepEqual(config.providers,['brevo','sendpulse','mailjet']);assert.equal(config.enabled,true);assert.equal(config.testTo,null);
});
test('provider wire contracts: one recipient, XML attached, safe OAuth and exact accepted IDs; boundaries synthetic',async()=>{
 for(const provider of ['brevo','sendpulse','mailjet'] as const){
  const requests:{url:string;init:RequestInit}[]=[];
  const result=await sendInvoiceEmail(provider,message,{BREVO_API_KEY:'synthetic',SENDPULSE_CLIENT_ID:'synthetic',SENDPULSE_CLIENT_SECRET:'synthetic',MAILJET_API_KEY:'synthetic',MAILJET_SECRET_KEY:'synthetic'},async(url,init)=>{
   requests.push({url,init});
   if(url.endsWith('/oauth/access_token'))return Response.json({access_token:'synthetic'});
   return Response.json(provider==='brevo'?{messageId:'synthetic-id'}:provider==='sendpulse'?{result:true,id:'synthetic-id'}:{Messages:[{Status:'success',To:[{MessageUUID:'synthetic-id'}]}]},{status:provider==='brevo'?201:200});
  });
  assert.deepEqual(result,{outcome:'accepted',id:'synthetic-id'});
  assert.equal(requests.length,provider==='sendpulse'?2:1);
  const sent=requests.at(-1)!;assert.equal(sent.init.redirect,'error');
  const payload=JSON.parse(String(sent.init.body));
  if(provider==='brevo'){assert.equal(payload.to.length,1);assert.equal(Buffer.from(payload.attachment[0].content,'base64').toString(),message.xml);}
  if(provider==='mailjet'){assert.equal(payload.Messages.length,1);assert.equal(payload.Messages[0].To.length,1);assert.equal(Buffer.from(payload.Messages[0].Attachments[0].Base64Content,'base64').toString(),message.xml);}
  if(provider==='sendpulse'){assert.equal(typeof payload.email,'string');assert.ok(payload.email.includes(Buffer.from(message.xml).toString('base64')));assert.ok(payload.email.includes('s:2:"to";a:1:'));}
 }
 assert.equal(sendPulseSerialize('ação'),'s:6:"ação";');
});
test('only explicit 429/402 allow failover; timeout/5xx/malformed acknowledgement never retries the external send',async()=>{
 for(const status of [402,429,400,401,403,408,500,503]){
  let calls=0;const result=await sendInvoiceEmail('brevo',message,{},async()=>{calls++;return new Response('',{status});});
  assert.equal(calls,1);assert.equal(result.outcome,[402,429].includes(status)?'quota_rejected':[408,500,503].includes(status)?'network_uncertain':'failed');
 }
 let calls=0;assert.equal((await sendInvoiceEmail('brevo',message,{},async()=>{calls++;throw new Error('synthetic timeout');})).outcome,'network_uncertain');assert.equal(calls,1);
 assert.equal((await sendInvoiceEmail('brevo',message,{},async()=>Response.json({wrong:'format'}))).outcome,'network_uncertain');
 assert.equal((await sendInvoiceEmail('brevo',message,{},async()=>new Response('x'.repeat(70000)))).outcome,'network_uncertain');
});
