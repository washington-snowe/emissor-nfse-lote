import { checkoutRecovery } from "../src/lib/billing/checkout-state.ts";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { plans, planPrice, money, firstPaymentCommission } from "../src/lib/billing/catalog.ts";
import { verifyStripeSignature, stripeUrl } from "../src/lib/billing/stripe-contract.ts";
import { readStripeEvent, stripeSnapshot, type StripeEvent } from "../src/lib/billing/webhook.ts";
import { transmitUsage, type UsageBatch } from "../src/lib/billing/usage.ts";
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
test("preços, franquias e excedentes correspondem à decisão comercial; trimestre usa 33% exatos",()=>{
 assert.deepEqual(plans.map(plan=>plan.includedNotes),[150,500,2500,5000,10000]);assert.deepEqual(plans.map(plan=>plan.overageCents),[30,18,6,5,3]);assert.deepEqual(plans.map(plan=>planPrice(plan,"quarterly")),[4000,8020,20080,30130,40180]);assert.equal(money("20080"),"R$ 200,80");assert.equal(firstPaymentCommission(3990,1990),400);assert.equal(firstPaymentCommission(3990,3990),0);assert.throws(()=>firstPaymentCommission(3990,3991));
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

test("checkout concluído não cria assinatura duplicada; recontratação depende de cancelamento confirmado na Stripe",()=>{
 assert.equal(checkoutRecovery("complete",false,"active"),"wait");assert.equal(checkoutRecovery("complete",false),"wait");assert.equal(checkoutRecovery("complete",false,"past_due"),"wait");
 assert.equal(checkoutRecovery("complete",false,"canceled"),"reset");assert.equal(checkoutRecovery("complete",false,"incomplete_expired"),"reset");assert.equal(checkoutRecovery("open",true),"reuse");assert.equal(checkoutRecovery("open",false),"expire");assert.equal(checkoutRecovery("expired",true),"reset");
});
