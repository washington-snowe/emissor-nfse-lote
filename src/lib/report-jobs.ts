import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseShopeeSellerCsv } from "@/lib/shopee-seller-csv";

export async function processReportJobs(tenantId?: string) {
  const client = createAdminClient();
  if (!client) return { processed: 0, available: false };
  const deadline = Date.now() + 20_000;
  let processed = 0;
  while (processed < 3 && Date.now() < deadline) {
    const claimed = await client.rpc("claim_report_jobs", { p_tenant: tenantId ?? null, p_limit: 1 });
    if (claimed.error) throw new Error("Report queue unavailable.");
    const job = claimed.data?.[0];
    if (!job) break;
    const result = await parseShopeeSellerCsv(Buffer.from(job.source_base64, "base64"));
    const integrityError = result.data && result.data.review.source.fileSha256 !== job.file_sha256;
    const sizeError = result.data && Buffer.byteLength(JSON.stringify(result.data, null, 1), "utf8") > 4_000_000;
    const finished = await client.rpc("finish_report_job", {
      p_job: job.job_id,
      p_token: job.lease_token,
      p_payload: result.data && !integrityError && !sizeError ? result.data : null,
      p_error: integrityError ? "source_integrity" : sizeError ? "invalid_contract" : result.error?.code ?? null,
    });
    if (finished.error) throw new Error("Report completion unavailable.");
    if (finished.data === true) processed++;
    else break;
  }
  return { processed, available: true };
}
