import "server-only";
import { createHmac } from "node:crypto";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/tenancy-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const hasAdminAccess = cache(async () => {
  const { client, context } = await requireWorkspace();
  if (!context.user.email_confirmed_at || context.user.email?.toLowerCase() !== "whashingtonexpedito@gmail.com") return false;
  const { data, error } = await client.rpc("rex_admin_access");
  return !error && data === true;
});

export async function requireRexAdmin() {
  if (!(await hasAdminAccess())) notFound();
  const { context } = await requireWorkspace();
  const admin = createAdminClient();
  if (!admin) throw new Error("Admin service unavailable");
  return { admin, actor: context.user.id };
}

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function creditVerifier(actor: string, challenge: string, code: string) {
  const secret = process.env.ADMIN_NOTE_CODE_SECRET;
  if (!secret || !/^[0-9a-f]{64}$/i.test(secret)) return null;
  return createHmac("sha256", Buffer.from(secret, "hex"))
    .update(`rex-notes:v1:${actor}:${challenge}:${code}`)
    .digest("hex");
}
