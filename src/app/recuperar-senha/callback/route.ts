import { NextResponse } from "next/server";
import { getSiteOrigin } from "@/lib/config";
import { clearRecoverySession, createSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
  const origin = getSiteOrigin(process.env);
  if (!origin) return new NextResponse("Acesso indisponível.", { status: 503, headers });

  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const flowId = params.get("sb_flow_id");
  try {
    const supabase = await createSupabaseClient("recovery");
    if (supabase && code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code, flowId === null ? undefined : { flowId });
      if (!error && data.session) {
        if ("redirectType" in data && data.redirectType === "recovery") {
          return NextResponse.redirect(`${origin}/recuperar-senha/nova`, { headers });
        }
        await clearRecoverySession();
      }
    }
  } catch {
    // The callback must not expose codes or errors from Auth.
  }
  return NextResponse.redirect(`${origin}/recuperar-senha?status=link-invalido`, { headers });
}
