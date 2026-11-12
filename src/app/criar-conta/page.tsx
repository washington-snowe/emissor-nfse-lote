import { validReferralCode } from "@/lib/account";
import type { Metadata } from "next";
import { AuthPage } from "@/components/auth-page";
import { getSiteOrigin, getSupabaseConfig } from "@/lib/config";

export const metadata: Metadata = { title: "Criar conta" };
export const dynamic = "force-dynamic";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref }=await searchParams;
  return (
    <AuthPage
      signup
      referral={validReferralCode(ref) ? ref : undefined}
      ready={!!getSupabaseConfig(process.env) && !!getSiteOrigin(process.env)}
    />
  );
}
