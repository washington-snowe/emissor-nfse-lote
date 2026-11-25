import { validReferralCode } from "@/lib/account";
import type { Metadata } from "next";
import { AuthPage } from "@/components/auth-page";
import { getSiteOrigin, getSupabaseConfig } from "@/lib/config";
import { readPlanSelection } from "@/lib/billing/plan-selection";

export const metadata: Metadata = { title: "Criar conta" };
export const dynamic = "force-dynamic";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ ref?: string; plano?: string; ciclo?: string }> }) {
  const { ref, plano, ciclo } = await searchParams;
  return (
    <AuthPage
      mode="signup"
      referral={validReferralCode(ref) ? ref : undefined}
      selection={readPlanSelection(plano, ciclo)}
      ready={!!getSupabaseConfig(process.env) && !!getSiteOrigin(process.env)}
    />
  );
}
