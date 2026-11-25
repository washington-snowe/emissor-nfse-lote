import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "@/lib/config";
import { sessionCookieOptions } from "./session-cookies";

const recoveryCookieOptions = { ...sessionCookieOptions, name: "rex-password-recovery", path: "/recuperar-senha" };

export async function createSupabaseClient(purpose: "workspace" | "recovery" = "workspace") {
  const config = getSupabaseConfig(process.env);
  if (!config) return null;
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: purpose === "recovery" ? recoveryCookieOptions : sessionCookieOptions,
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) =>
            store.set(name, value, purpose === "recovery" && options.maxAge !== 0 ? { ...options, maxAge: 1800 } : options),
          );
        } catch {
          // Server Components cannot set cookies; proxy.ts refreshes the session.
        }
      },
    },
  });
}

export async function clearRecoverySession() {
  const store = await cookies();
  for (const { name } of store.getAll()) {
    if (/^rex-password-recovery(?:\.\d+)?$/.test(name)) {
      store.set(name, "", { ...recoveryCookieOptions, maxAge: 0 });
    }
  }
}
