import type { Metadata } from "next";
import { AuthPage } from "@/components/auth-page";
import { getSupabaseConfig } from "@/lib/config";
import { readPlanSelection } from "@/lib/billing/plan-selection";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; plano?: string; ciclo?: string }>;
}) {
  const { status, plano, ciclo } = await searchParams;
  return (
    <AuthPage
      mode="login"
      ready={!!getSupabaseConfig(process.env)}
      status={status}
      selection={readPlanSelection(plano, ciclo)}
    />
  );
}
