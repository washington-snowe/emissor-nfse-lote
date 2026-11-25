import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/config";
import { isSessionCookie, sessionCookieOptions, sessionCookiePolicyMarker } from "@/lib/supabase/session-cookies";

export async function proxy(request: NextRequest) {
  const config = getSupabaseConfig(process.env);
  let response = NextResponse.next({ request });
  if (!config || ["/entrar", "/criar-conta", "/verificar-acesso"].includes(request.nextUrl.pathname)) {
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  let sessionWritten = false;
  const supabase = createServerClient(config.url, config.key, {
    cookieOptions: sessionCookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        sessionWritten ||= values.some(({ name }) => isSessionCookie(name, config.url));
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  try {
    // Refresh expiring tokens here. Protected routes verify identity with getUser before reading data.
    const { data: { session } } = await supabase.auth.getSession();
    if (session && !request.cookies.has(sessionCookiePolicyMarker)) {
      // Reapply secure cookie attributes without using the cookie as authorization.
      const maxAge = 400 * 24 * 60 * 60;
      if (!sessionWritten) {
        for (const { name, value } of request.cookies.getAll()) {
          if (isSessionCookie(name, config.url)) {
            response.cookies.set(name, value, { ...sessionCookieOptions, maxAge });
          }
        }
      }
      response.cookies.set(sessionCookiePolicyMarker, "1", { ...sessionCookieOptions, maxAge });
    }
  } catch {
    // Protected pages revalidate the user and fail closed if Auth is unavailable.
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/painel/:path*", "/prototipo", "/entrar", "/criar-conta", "/verificar-acesso"],
};
