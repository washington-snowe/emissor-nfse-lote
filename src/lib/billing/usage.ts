import { objectId, stripeId } from "./stripe-contract.ts";
export type UsageBatch={id:string;tenant_id:string;subscription_id:string;amount_cents:number;notes:number;month_start:string;month_end:string;token:string;first_attempt_at:string|null;customer_id:string};
type Json=Record<string,unknown>;
export async function transmitUsage(batch:UsageBatch,deps:{get:(path:string,params?:Record<string,string>)=>Promise<Json>;post:(path:string,params:Record<string,string>,key:string)=>Promise<Json>;mark:()=>Promise<boolean>;now:()=>number}) {
 if(!Number.isSafeInteger(batch.amount_cents)||batch.amount_cents<=0||!Number.isSafeInteger(batch.notes)||batch.notes<1||batch.notes>500) throw new Error("Invalid usage batch");
 const receipt=(item:Json)=>stripeId(item.id,"ii")&&objectId(item.customer)===batch.customer_id&&objectId(item.subscription)===batch.subscription_id&&item.currency==="brl"&&item.amount===batch.amount_cents&&(item.metadata as Json)?.nfse_batch===batch.id ? item.id as string:null;
 if(batch.first_attempt_at) {
  let cursor:string|undefined;
  for(let page=0;page<5;page++) {
   const list=await deps.get("/invoiceitems",{customer:batch.customer_id,limit:"100",...(cursor?{starting_after:cursor}:{})});
   if(!Array.isArray(list.data)||typeof list.has_more!=="boolean") throw new Error("Invalid usage listing");
   for(const item of list.data as Json[]) if((item.metadata as Json)?.nfse_batch===batch.id) {const id=receipt(item);if(!id) throw new Error("Usage receipt mismatch");return id;}
   if(!list.has_more) break;
   const id=(list.data.at(-1) as Json)?.id; if(!stripeId(id,"ii")||page===4) throw new Error("Usage pagination incomplete");cursor=id;
  }
  if(deps.now()-Date.parse(batch.first_attempt_at)>23*3600_000) return null;
 }
 if(await deps.mark()!==true) return null;
 const item=await deps.post("/invoiceitems",{customer:batch.customer_id,subscription:batch.subscription_id,currency:"brl",amount:String(batch.amount_cents),description:`Emissor · ${batch.notes} NFS-e excedentes · ${batch.month_start.slice(0,10)} a ${batch.month_end.slice(0,10)}`,"metadata[application]":"emissor-nfse","metadata[nfse_batch]":batch.id,"period[start]":String(Math.floor(Date.parse(batch.month_start)/1000)),"period[end]":String(Math.floor(Date.parse(batch.month_end)/1000)-1)},"nfse:usage:"+batch.id);
 const id=receipt(item);if(!id) throw new Error("Usage receipt mismatch");return id;
}
