import { NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/supabase/server";
import { getSiteOrigin } from "@/lib/config";

export async function GET(request: Request) {
  const origin = getSiteOrigin(process.env);
  if (!origin)
    return new NextResponse("Acesso indisponível.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  const code = new URL(request.url).searchParams.get("code");
  try {
    const supabase = await createSupabaseClient();
    if (code && supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error)
        return NextResponse.redirect(`${origin}/painel`, {
          headers: { "Cache-Control": "no-store" },
        });
    }
  } catch {
    // Tokens and provider errors must never appear in logs or redirects.
  }
  return NextResponse.redirect(`${origin}/entrar?status=confirmation-error`, {
    headers: { "Cache-Control": "no-store" },
  });
}
