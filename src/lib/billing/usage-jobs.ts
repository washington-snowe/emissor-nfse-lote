import "server-only";
import { StripeRequestError, stripeConfig, stripeGet, stripeRequest } from "@/lib/billing/stripe-http";
import { billingRpc } from "@/lib/billing/checkout";
import { transmitUsage, type UsageBatch } from "@/lib/billing/usage";
import { collectImmediateUsage } from "@/lib/billing/immediate-usage";
export async function processBillingUsage(tenantId?:string,deadline=Date.now()+45_000) {
 if(!stripeConfig()?.live || Date.now()>deadline-20_000) return {processed:0,available:false};
 let batch:UsageBatch|null;
 try {batch=await billingRpc("claim_billing_usage",{p_tenant:tenantId??null});} catch {return {processed:0,available:false};}
 if(!batch) return {processed:0,available:true};
 const budget=()=>{if(Date.now()>deadline-8000) throw new Error("Billing budget exceeded");};
 try {
  const claimed = batch;
  const gateway = {
   get:(path:string,params?:Record<string,string>)=>{budget();return stripeGet(path,params);},
   post:(path:string,params:Record<string,string>,key:string)=>{budget();return stripeRequest(path,params,key);},
   mark:()=>billingRpc("mark_billing_usage_attempt",{p_batch:claimed.id,p_token:claimed.token}),
   now:()=>Date.now(),
  };
  const item=claimed.method==="immediate" ? await collectImmediateUsage(claimed,{
   ...gateway,live:true,
   bind:id=>billingRpc("bind_billing_usage_invoice",{p_batch:claimed.id,p_token:claimed.token,p_invoice:id}),
   paymentDeclined:error=>error instanceof StripeRequestError && error.status===402,
  }) : await transmitUsage(claimed,gateway);
  await billingRpc("finish_billing_usage",{p_batch:batch.id,p_token:batch.token,p_item:item});
 } catch {try {await billingRpc("finish_billing_usage",{p_batch:batch.id,p_token:batch.token,p_item:null});}catch{/* Durable lease/reconciliation owns interrupted charges. */}}
 return {processed:1,available:true};
}
