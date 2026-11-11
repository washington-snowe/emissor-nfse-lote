import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/config";
import { serviceKey } from "@/lib/server-config";

export function createAdminClient() {
  const config = getSupabaseConfig(process.env);
  const key = serviceKey(process.env);
  if (!config || !key) return null;
  return createClient(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (url, options) => fetch(url, {
        ...options, cache: "no-store",
        signal: options?.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(8_000)]) : AbortSignal.timeout(8_000),
      }),
    },
  });
}
