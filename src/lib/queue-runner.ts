import "server-only";
import { processReportJobs } from "@/lib/report-jobs";
import { processFiscalJobs } from "@/lib/fiscal-jobs";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteOrigin } from "@/lib/config";

// One report OR fiscal operation per invocation. A relay starts a fresh bounded Vercel invocation.
export async function processQueuedWork(tenantId?: string, remaining = 500) {
  const deadline = Date.now() + 45_000;
  const report = await processReportJobs(tenantId, 1);
  const result = report.processed > 0 ? report : await processFiscalJobs(tenantId, deadline);
  const admin = createAdminClient(), origin = getSiteOrigin(process.env), secret = process.env.CRON_SECRET;
  if (result.processed > 0 && remaining > 1 && Date.now() < deadline && admin && origin && secret && secret.length >= 32) {
    const ready = await admin.rpc("fiscal_queue_ready", { p_tenant: tenantId ?? null });
    if (!ready.error && ready.data === true) {
      try {
        await fetch(origin + "/api/jobs", { method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(3000),
          headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId: tenantId ?? null, remaining: remaining - 1 }) });
      } catch { /* Cron/manual recovery owns remaining durable work. No credentials or request body logged. */ }
    }
  }
  return result;
}
