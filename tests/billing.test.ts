import { checkoutRecovery } from "../src/lib/billing/checkout-state.ts";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { plans, planPrice, money, firstPaymentCommission, overagePrice, upgradeEligible } from "../src/lib/billing/catalog.ts";
import { verifyStripeSignature, stripeUrl } from "../src/lib/billing/stripe-contract.ts";
import { readStripeEvent, stripeSnapshot, type StripeEvent } from "../src/lib/billing/webhook.ts";
import { transmitUsage, type UsageBatch } from "../src/lib/billing/usage.ts";
import { collectImmediateUsage } from "../src/lib/billing/immediate-usage.ts";
const now=Date.UTC(2026,10,12),seconds=now/1000,tenant="00000000-0000-4000-8000-000000000001";
const subscription={id:"sub_synthetic",customer:"cus_synthetic",livemode:false,metadata:{application:"emissor-nfse",tenant_id:tenant},items:{data:[{quantity:1,price:{id:"price_synthetic",currency:"brl"}}]},status:"active",current_period_start:seconds,current_period_end:seconds+30*86400,created:seconds,cancel_at_period_end:false};
const first={id:"in_first",customer:"cus_synthetic",livemode:false,currency:"brl",subscription:"sub_synthetic",amount_paid:3990,charge:"ch_first",status:"paid",status_transitions:{paid_at:seconds+10},created:seconds,hosted_invoice_url:"https://invoice.stripe.com/synthetic"};
const renewed={...first,id:"in_renewed",charge:"ch_renewed",status_transitions:{paid_at:seconds+30*86400}};
const context={tenant_id:tenant,customer_id:"cus_synthetic",prices:[{price_id:"price_synthetic"}]};
const event:StripeEvent={id:"evt_synthetic",type:"invoice.paid",livemode:false,data:{object:{id:"in_renewed",customer:"cus_synthetic"}}};
function gateway(refund=0,overrides:Record<string,unknown>={}) {
 return async(path:string)=>{
  const fixtures:Record<string,Record<string,unknown>>={"/subscriptions/sub_synthetic":{...subscription,...overrides},"/invoices/in_renewed":renewed,"/invoices/in_first":first,"/invoices":{data:[renewed,first],has_more:false},"/charges/ch_first":{customer:"cus_synthetic",invoice:"in_first",currency:"brl",livemode:false,paid:true,captured:true,amount_captured:3990,amount_refunded:refund},"/charges/ch_renewed":{customer:"cus_synthetic",invoice:"in_renewed",currency:"brl",livemode:false,paid:true,captured:true,amount_captured:3990,amount_refunded:0}};
  assert(path in fixtures,`Unexpected provider request ${path}`);return fixtures[path];
 };
}
test("preços e franquias exatos, tarifa em quatro casas e 20% de desconto anual",()=>{
 assert.deepEqual(plans.map(plan=>plan.includedNotes),[150,600,2500,10000]);
 assert.deepEqual(plans.map(plan=>planPrice(plan,"monthly")),[1490,3490,6990,13990]);
 assert.deepEqual(plans.map(plan=>planPrice(plan,"annual")),[14304,33504,67104,134304]);
 assert.deepEqual(plans.map(plan=>overagePrice(plan.overageUnits)),["R$ 0,0993","R$ 0,0582","R$ 0,0280","R$ 0,0140"]);
 assert.equal(money("134304"),"R$ 1.343,04");
 assert.equal(firstPaymentCommission(3990,1990),400);assert.equal(firstPaymentCommission(3990,3990),0);assert.throws(()=>firstPaymentCommission(3990,3991));
});
test("upgrade exige preço maior no mesmo ciclo de cobrança",()=>{
 assert(upgradeEligible({cadence:"monthly",unitCents:1490},plans[1],"monthly"));
 assert(upgradeEligible({cadence:"annual",unitCents:14304},plans[1],"annual"));
 assert(!upgradeEligible({cadence:"monthly",unitCents:1490},plans[1],"annual"));
 assert(!upgradeEligible({cadence:"monthly",unitCents:3490},plans[0],"monthly"));
});
test("webhook exige HMAC v1 do corpo exato, timestamp recente e não aceita metadata de depuração como assinatura",()=>{
 const secret="whsec_synthetic_test_only",body=JSON.stringify(event),signature=createHmac("sha256",secret).update(seconds+"."+body).digest("hex"),header=`t=${seconds},v1=${signature}`;
 assert(verifyStripeSignature(body,header,secret,now));assert(!verifyStripeSignature(body+" ",header,secret,now));assert(!verifyStripeSignature(body,header,secret,now+301000));assert(!verifyStripeSignature(body,`t=${seconds},payload=${signature},secret=${secret}`,secret,now));assert(!verifyStripeSignature(body,header+`,t=${seconds}`,secret,now));assert.equal(stripeUrl("https://checkout.stripe.com.evil.example/pay","checkout"),null);assert.equal(stripeUrl("https://evil.example","portal"),null);
});
test("eventos fora de ordem consultam o estado atual e identificam apenas o primeiro pagamento",async()=>{
 assert(readStripeEvent(event));const snapshot=await stripeSnapshot(event,context,gateway());assert.equal(snapshot.firstInvoice,"in_first");assert.equal(snapshot.invoices.length,2);assert.equal(snapshot.subscriptions.length,1);assert.equal(snapshot.subscriptions[0].status,"active");
});
test("estorno consulta o primeiro pagamento atualizado e não troca a comissão para uma renovação",async()=>{
 const snapshot=await stripeSnapshot({...event,type:"charge.refunded",data:{object:{id:"ch_first",customer:"cus_synthetic"}}},context,gateway(1990));assert.equal(snapshot.firstInvoice,"in_first");assert.equal(snapshot.invoices.find(item=>item.id==="in_first")?.refunded_cents,"1990");
});
test("assinatura não aceita preço, cliente ou tenant fora do vínculo verificado",async()=>{
 for(const overrides of [{customer:"cus_foreign"},{metadata:{application:"emissor-nfse",tenant_id:"foreign"}},{items:{data:[{quantity:1,price:{id:"price_foreign",currency:"brl"}}]}}])await assert.rejects(()=>stripeSnapshot(event,context,gateway(0,overrides)));
});
const batch:UsageBatch={id:"00000000-0000-4000-8000-000000000099",tenant_id:tenant,subscription_id:"sub_synthetic",customer_id:"cus_synthetic",amount_cents:300,notes:10,month_start:"2026-11-01T00:00:00Z",month_end:"2026-12-01T00:00:00Z",token:"synthetic",first_attempt_at:null};
const usageReceipt={id:"ii_synthetic",customer:batch.customer_id,subscription:batch.subscription_id,currency:"brl",amount:300,metadata:{nfse_batch:batch.id}};
test("excedente persiste intenção e envia chave idempotente com valor exato",async()=>{
 let marked=false;const result=await transmitUsage(batch,{get:async()=>{throw new Error("No lookup before first attempt");},mark:async()=>{marked=true;return true;},post:async(path,params,key)=>{assert(marked);assert.equal(path,"/invoiceitems");assert.equal(params.amount,"300");assert.equal(key,"nfse:usage:"+batch.id);return usageReceipt;},now:()=>now});assert.equal(result,"ii_synthetic");
});
test("resposta de cobrança perdida reconcilia por GET; incerteza antiga nunca cria outra cobrança",async()=>{
 let posts=0;const retried={...batch,first_attempt_at:new Date(now-86400_000).toISOString()};
 const deps={get:async()=>({data:[usageReceipt],has_more:false}),mark:async()=>true,post:async()=>{posts++;return usageReceipt;},now:()=>now};assert.equal(await transmitUsage(retried,deps),"ii_synthetic");assert.equal(posts,0);
 assert.equal(await transmitUsage(retried,{...deps,get:async()=>({data:[],has_more:false})}),null);assert.equal(posts,0);
});

test("excedente vincula a fatura antes de cobrar o cartão, cobra o total exato e recupera resposta perdida", async () => {
 const fee = {...batch, amount_cents:59, notes:6, method:"immediate" as const};
 const metadata={application:"emissor-nfse",nfse_batch:fee.id,nfse_subscription:fee.subscription_id};
 const invoiceId="in_overage";
 const invoice={id:invoiceId,customer:fee.customer_id,currency:"brl",livemode:false,collection_method:"charge_automatically",metadata};
 const draft={...invoice,status:"draft",total:59,lines:{has_more:false,data:[{amount:59,currency:"brl",metadata}]}};
 const open={...draft,status:"open",attempted:false,amount_due:59};
 const paid={...open,status:"paid",attempted:true,amount_due:0};
 let state:Record<string,unknown>={...invoice,status:"draft",lines:{has_more:false,data:[]}};
 const calls:string[]=[];
 const gateway:Parameters<typeof collectImmediateUsage>[1]={
  live:false,now:()=>now,mark:async()=>{calls.push("mark");return true;},
  bind:async(id)=>{assert.equal(id,invoiceId);calls.push("bind");return true;},
  paymentDeclined:()=>false,
  get:async path=>{
   if(path==="/subscriptions/"+fee.subscription_id) return {...subscription,default_payment_method:"pm_synthetic"};
   assert.equal(path,"/invoices/"+invoiceId);return state;
  },
  post:async(path,params,key)=>{
   assert(key.startsWith("nfse:overage:"+fee.id+":"));
   calls.push(path);
   if(path==="/invoices"){assert.equal(params.pending_invoice_items_behavior,"exclude");assert.equal(params.default_payment_method,"pm_synthetic");return state;}
   if(path==="/invoiceitems"){assert.equal(params.amount,"59");assert.equal(params.invoice,invoiceId);state=draft;return {id:"ii_synthetic",invoice:invoiceId,amount:59,currency:"brl"};}
   if(path.endsWith("/finalize")){state=open;return state;}
   assert(path.endsWith("/pay"));assert.equal(params.off_session,"true");state=paid;throw new Error("Synthetic lost response");
  }
 };
 await assert.rejects(()=>collectImmediateUsage(fee,gateway),/lost response/);
 assert.deepEqual(calls,["mark","/invoices","bind","/invoiceitems","/invoices/in_overage/finalize","/invoices/in_overage/pay"]);
 calls.length=0;
 assert.equal(await collectImmediateUsage({...fee,first_attempt_at:new Date(now-86400_000).toISOString(),stripe_invoice:invoiceId},gateway),invoiceId);
 assert.deepEqual(calls,["bind"]);
 state={...open,total:60};
 await assert.rejects(()=>collectImmediateUsage({...fee,stripe_invoice:invoiceId},gateway),/Unexpected overage invoice total/);
 assert.equal(calls.filter(path=>path.endsWith("/pay")).length,0);
 await assert.rejects(()=>collectImmediateUsage({...fee,amount_cents:49},gateway),/Invalid overage/);
});

test("fatura de excedentes aparece no histórico após verificar lote e não gera comissão de indicação", async () => {
 const overage={...renewed,id:"in_overage",charge:null,subscription:null,amount_paid:59,total:59,metadata:{application:"emissor-nfse",nfse_batch:batch.id,nfse_subscription:batch.subscription_id}};
 const request=gateway(), get=async(path:string)=>path==="/invoices/in_overage"?overage:path==="/invoices"?{data:[overage,first],has_more:false}:request(path);
 const overageEvent:StripeEvent={...event,data:{object:{id:overage.id,customer:context.customer_id}}};
 const result=await stripeSnapshot(overageEvent,context,get,async(id,invoice)=>{assert.equal(id,batch.id);assert.equal(invoice,overage.id);return {subscriptionId:batch.subscription_id,amountCents:59};});
 assert.equal(result.firstInvoice,null);
 assert.equal(result.invoices.find(row=>row.id===overage.id)?.paid_cents,"59");
 await assert.rejects(()=>stripeSnapshot(overageEvent,context,get,async()=>null),/Overage invoice mismatch/);
});

test("checkout concluído não cria assinatura duplicada; recontratação depende de cancelamento confirmado na Stripe",()=>{
 assert.equal(checkoutRecovery("complete",false,"active"),"wait");assert.equal(checkoutRecovery("complete",false),"wait");assert.equal(checkoutRecovery("complete",false,"past_due"),"wait");
 assert.equal(checkoutRecovery("complete",false,"canceled"),"reset");assert.equal(checkoutRecovery("complete",false,"incomplete_expired"),"reset");assert.equal(checkoutRecovery("open",true),"reuse");assert.equal(checkoutRecovery("open",false),"expire");assert.equal(checkoutRecovery("expired",true),"reset");
});
