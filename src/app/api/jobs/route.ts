import { NextResponse } from "next/server";
import { after } from "next/server";
import { validWorkerAuthorization } from "@/lib/worker-auth";
import { processQueuedWork } from "@/lib/queue-runner";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!validWorkerAuthorization(request.headers.get("authorization"), process.env.CRON_SECRET))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const result = await processQueuedWork();
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Processing unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  if (!validWorkerAuthorization(request.headers.get("authorization"), process.env.CRON_SECRET))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (Number(request.headers.get("content-length") ?? 0) > 1024) return new NextResponse(null, { status: 413 });
  let data: { tenantId?: string | null; remaining?: number };
  try { const text = await request.text(); if (text.length > 1024) throw new Error(); data = JSON.parse(text); } catch { return new NextResponse(null, { status: 400 }); }
  if (!data || typeof data !== "object" || data.tenantId !== null && data.tenantId !== undefined && !/^[0-9a-f-]{36}$/i.test(data.tenantId) ||
    !Number.isSafeInteger(data.remaining) || data.remaining! < 1 || data.remaining! > 500) return new NextResponse(null, { status: 400 });
  after(async () => { try { await processQueuedWork(data.tenantId ?? undefined, data.remaining); } catch { /* Leases and Cron recover interruptions. */ } });
  return NextResponse.json({ accepted: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
