import type { Metadata } from "next";
import { AuthPage } from "@/components/auth-page";
import { getSiteOrigin, getSupabaseConfig } from "@/lib/config";

export const metadata: Metadata = { title: "Criar conta" };
export const dynamic = "force-dynamic";

export default function SignUpPage() {
  return (
    <AuthPage
      signup
      ready={!!getSupabaseConfig(process.env) && !!getSiteOrigin(process.env)}
    />
  );
}
