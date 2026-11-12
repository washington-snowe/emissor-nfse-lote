import "server-only";
import { stripeConfig, stripeGet, stripeRequest } from "@/lib/billing/stripe-http";
import { billingRpc } from "@/lib/billing/checkout";
import { transmitUsage, type UsageBatch } from "@/lib/billing/usage";
export async function processBillingUsage(tenantId?:string,deadline=Date.now()+45_000) {
 if(!stripeConfig()?.live || Date.now()>deadline-20_000) return {processed:0,available:false};
 let batch:UsageBatch|null;
 try {batch=await billingRpc("claim_billing_usage",{p_tenant:tenantId??null});} catch {return {processed:0,available:false};}
 if(!batch) return {processed:0,available:true};
 const budget=()=>{if(Date.now()>deadline-8000) throw new Error("Billing budget exceeded");};
 try {
  const item=await transmitUsage(batch,{get:(path,params)=>{budget();return stripeGet(path,params);},post:(path,params,key)=>{budget();return stripeRequest(path,params,key);},mark:()=>billingRpc("mark_billing_usage_attempt",{p_batch:batch!.id,p_token:batch!.token}),now:()=>Date.now()});
  await billingRpc("finish_billing_usage",{p_batch:batch.id,p_token:batch.token,p_item:item});
 } catch {try {await billingRpc("finish_billing_usage",{p_batch:batch.id,p_token:batch.token,p_item:null});}catch{/* Durable lease/reconciliation owns interrupted charges. */}}
 return {processed:1,available:true};
}
