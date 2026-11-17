import type {EmailProvider} from './config.ts';
export type InvoiceMessage={from:string;to:string;subject:string;text:string;xml:string;filename:string;pdf?:Buffer;pdfFilename?:string};
export type ProviderTestMessage=Omit<InvoiceMessage,'xml'|'filename'|'pdf'|'pdfFilename'>;
export type EmailOutcome={outcome:'accepted';id:string}|{outcome:'quota_rejected'|'failed'|'network_uncertain'};
type Requester=(url:string,init:RequestInit)=>Promise<Response>;
// SendPulse's official Node/Java SDKs serialize the email object using PHP's wire format.
// Only generated arrays/objects/UTF-8 strings are accepted; no deserialization or arbitrary objects.
export function sendPulseSerialize(value:string|unknown[]|Record<string,unknown>):string{
 if(typeof value==='string')return 's:'+Buffer.byteLength(value)+':"'+value+'";';
 const entries=Array.isArray(value)?value.map((item,i)=>[i,item] as const):Object.entries(value);
 return 'a:'+entries.length+':{'+entries.map(([key,item])=>{
  if(typeof item!=='string'&&(!item||typeof item!=='object'))throw new Error('Invalid SendPulse payload');
  return (typeof key==='number'?'i:'+key+';':sendPulseSerialize(key))+sendPulseSerialize(item as string|unknown[]|Record<string,unknown>);
 }).join('')+'}';
}
async function jsonResponse(response:Response){
 const reader=response.body?.getReader();if(!reader)throw new Error('Email response unavailable');
 let length=0;const chunks:Uint8Array[]=[];
 while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>65536){await reader.cancel();throw new Error('Email response oversized');}chunks.push(part.value);}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
/** One external send, never parallel sends/retries. Ambiguous acceptance must be reconciled by an operator. */
export async function sendInvoiceEmail(provider:EmailProvider,message:InvoiceMessage|ProviderTestMessage,env:Record<string,string|undefined>,request:Requester=fetch):Promise<EmailOutcome>{
 let sendStarted=false;
 try{
  const files='xml' in message?[{content:Buffer.from(message.xml).toString('base64'),name:message.filename,type:'application/xml'},...(message.pdf&&message.pdfFilename?[{content:message.pdf.toString('base64'),name:message.pdfFilename,type:'application/pdf'}]:[])]:[];
  let url:string,headers:Record<string,string>,payload:unknown;
  if(provider==='brevo'){
   url='https://api.brevo.com/v3/smtp/email';headers={'api-key':env.BREVO_API_KEY!};
   payload={sender:{email:message.from,name:'RexNotas'},to:[{email:message.to}],subject:message.subject,textContent:message.text,...(files.length?{attachment:files.map(({content,name})=>({content,name}))}:{})};
  }else if(provider==='sendpulse'){
   // OAuth is not an email send. Token is memory-only, never logged or written to a temporary file.
   const auth=await request('https://api.sendpulse.com/oauth/access_token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json'},body:JSON.stringify({grant_type:'client_credentials',client_id:env.SENDPULSE_CLIENT_ID,client_secret:env.SENDPULSE_CLIENT_SECRET})});
   if(!auth.ok)return {outcome:auth.status===402||auth.status===429?'quota_rejected':'failed'};
   const token=await jsonResponse(auth);if(typeof token.access_token!=='string'||!token.access_token.length)return {outcome:'failed'};
   url='https://api.sendpulse.com/smtp/emails';headers={Authorization:'Bearer '+token.access_token};
   const html='<pre>'+message.text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')+'</pre>';
   payload={email:sendPulseSerialize({from:{email:message.from,name:'RexNotas'},to:[{email:message.to}],subject:message.subject,text:message.text,html:Buffer.from(html).toString('base64'),...(files.length?{attachments_binary:Object.fromEntries(files.map(file=>[file.name,file.content]))}:{})})};
  }else{
   url='https://api.mailjet.com/v3.1/send';headers={Authorization:'Basic '+Buffer.from(env.MAILJET_API_KEY+':'+env.MAILJET_SECRET_KEY).toString('base64')};
   payload={Messages:[{From:{Email:message.from,Name:'RexNotas'},To:[{Email:message.to}],Subject:message.subject,TextPart:message.text,...(files.length?{Attachments:files.map(file=>({ContentType:file.type,Filename:file.name,Base64Content:file.content}))}:{})}]};
  }
  sendStarted=true;
  const response=await request(url,{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(response.status===402||response.status===429)return {outcome:'quota_rejected'};
  if(response.status>=500||response.status===408)return {outcome:'network_uncertain'};
  if(!response.ok)return {outcome:'failed'};
  const data=await jsonResponse(response);
  const id=provider==='brevo'?data.messageId:provider==='sendpulse'?(data.result===true?data.id:null):(data.Messages?.length===1&&data.Messages[0].Status==='success'?data.Messages[0].To?.[0]?.MessageUUID:null);
  if(typeof id!=='string'||!id.length||id.length>250||/[\x00-\x1f\x7f]/.test(id))return {outcome:'network_uncertain'};
  return {outcome:'accepted',id};
 }catch{return {outcome:sendStarted?'network_uncertain':'failed'};}
}
