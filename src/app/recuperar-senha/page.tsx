import type { Metadata } from "next";
import { AuthPage } from "@/components/auth-page";
import { getSiteOrigin, getSupabaseConfig } from "@/lib/config";

export const metadata: Metadata = { title: "Recuperar senha" };
export const dynamic = "force-dynamic";

export default async function RecoveryPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  return <AuthPage mode="recover" ready={!!getSupabaseConfig(process.env) && !!getSiteOrigin(process.env)} status={status} />;
}
