import { limitedText } from "@/lib/limited-body";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { stripeConfig, stripeGet } from "@/lib/billing/stripe-http";
import { verifyStripeSignature } from "@/lib/billing/stripe-contract";
import { readStripeEvent, stripeSnapshot, supportedEvents } from "@/lib/billing/webhook";
import { billingRpc } from "@/lib/billing/checkout";
export const runtime="nodejs";
export const maxDuration=60;
export const dynamic="force-dynamic";
export async function POST(request: Request) {
  const config=stripeConfig();
  if(!config?.webhook) return new NextResponse(null,{status:503});
  if(Number(request.headers.get("content-length")??0)>256*1024) return new NextResponse(null,{status:413});
  let body:string; try { body=await limitedText(request.body,256*1024); } catch { return new NextResponse(null,{status:400}); }
  if(!verifyStripeSignature(body,request.headers.get("stripe-signature"),config.webhook)) return new NextResponse(null,{status:400});
  let event; try { event=readStripeEvent(JSON.parse(body)); } catch { return new NextResponse(null,{status:400}); }
  if(!event || event.livemode!==config.live) return new NextResponse(null,{status:400});
  if(!supportedEvents.has(event.type)) return NextResponse.json({received:true});
  const deadline=Date.now()+45_000;
  let claim: { tenant_id:string;customer_id:string;token:string;prices:{price_id:string}[];duplicate?:boolean;ignored?:boolean } | undefined;
  try {
    claim=await billingRpc("claim_stripe_event",{ p_id:event.id,p_type:event.type,p_customer:event.data.object.customer,p_live:config.live,p_sha:createHash("sha256").update(body).digest("hex") });
    if(!claim) throw new Error("Billing claim unavailable");
    if(claim.duplicate || claim.ignored) return NextResponse.json({received:true});
    const snapshot=await stripeSnapshot(event,claim,async (path,params)=>{if(Date.now()>deadline-8000) throw new Error("Billing budget exceeded"); return stripeGet(path,params);});
    const saved=await billingRpc("apply_stripe_event",{p_id:event.id,p_live:config.live,p_token:claim.token,p_subscription:snapshot.subscriptions,p_invoices:snapshot.invoices,p_first_invoice:snapshot.firstInvoice});
    if(saved!==true) throw new Error("Billing lease expired");
    return NextResponse.json({received:true},{headers:{"Cache-Control":"no-store"}});
  } catch {
    if(claim?.token) try { await billingRpc("release_billing_account",{p_tenant:claim.tenant_id,p_live:config.live,p_token:claim.token}); } catch { /* Leases expire; Stripe retries non-2xx. No provider payload or secret logged. */ }
    return new NextResponse(null,{status:503});
  }
}
