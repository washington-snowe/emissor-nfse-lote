import { completeReferral } from "@/lib/referral-attribution";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/config";
import { planSelectionCookie, planSelectionHref, readPlanSelection } from "@/lib/billing/plan-selection";

export async function GET(request: Request) {
  const origin = getSiteOrigin(process.env);
  if (!origin)
    return new NextResponse("Acesso indisponível.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  const code = new URL(request.url).searchParams.get("code");
  const store = await cookies();
  const pending = new URLSearchParams(code ? store.get(planSelectionCookie)?.value : undefined);
  const selection = readPlanSelection(pending.get("plano"), pending.get("ciclo"));
  try {
    const supabase = await createSupabaseClient();
    if (code && supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        await completeReferral();
        const destination = selection ? planSelectionHref("/painel/conta/assinatura", selection) : "/painel";
        const response = NextResponse.redirect(origin + destination, {
          headers: { "Cache-Control": "no-store" },
        });
        if (selection) response.cookies.set(planSelectionCookie, "", { path: "/auth/callback", maxAge: 0 });
        return response;
      }
    }
  } catch {
    // Tokens and provider errors must never appear in logs or redirects.
  }
  return NextResponse.redirect(origin + planSelectionHref("/entrar?status=confirmation-error", selection), {
    headers: { "Cache-Control": "no-store" },
  });
}
