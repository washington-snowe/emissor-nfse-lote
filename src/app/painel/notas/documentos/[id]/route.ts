import { createHash } from "node:crypto";
import { requireWorkspace } from "@/lib/tenancy-server";
import { createAdminClient } from "@/lib/supabase/admin";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { client, context } = await requireWorkspace(); const { id } = await params;
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404, headers });
  const metadata = await client.from("fiscal_documents").select("id,access_key,xml_sha256").eq("id", id).eq("tenant_id", context.tenantId).maybeSingle();
  const admin = createAdminClient();
  if (metadata.error || !metadata.data || !admin) return new Response(null, { status: 404, headers });
  const result = await admin.rpc("fiscal_document_xml", { p_actor: context.user.id, p_document: metadata.data.id });
  if (result.error || typeof result.data !== "string" || createHash("sha256").update(result.data).digest("hex") !== metadata.data.xml_sha256) return new Response(null, { status: 503, headers });
  return new Response(result.data, { headers: { ...headers, "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="NFSe-homologacao-${metadata.data.access_key}.xml"` } });
}
