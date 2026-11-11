import { NextResponse } from "next/server";
import { validWorkerAuthorization } from "@/lib/worker-auth";
import { processReportJobs } from "@/lib/report-jobs";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!validWorkerAuthorization(request.headers.get("authorization"), process.env.CRON_SECRET))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const result = await processReportJobs();
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Processing unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
