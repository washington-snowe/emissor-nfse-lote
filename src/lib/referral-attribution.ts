import "server-only";
import { cookies } from "next/headers";
import { REFERRAL_COOKIE, validReferralCode } from "@/lib/account";
import { createSupabaseClient } from "@/lib/supabase/server";
export async function completeReferral() {
  try {
  const store = await cookies(), code = store.get(REFERRAL_COOKIE)?.value;
  if (!validReferralCode(code)) return;
  const client = await createSupabaseClient();
  if (!client) return;
  const user = await client.auth.getUser();
  if (user.error || !user.data.user) return;
  const tenant = await client.rpc("ensure_tenant");
  if (tenant.error) return;
  const result = await client.rpc("claim_referral", { p_code: code });
  if (!result.error) store.delete(REFERRAL_COOKIE);
  } catch { /* Attribution must never block confirmation or login. Keep the cookie for retry. */ }
}
