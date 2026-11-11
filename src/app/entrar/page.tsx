import type { Metadata } from "next";
import { AuthPage } from "@/components/auth-page";
import { getSupabaseConfig } from "@/lib/config";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  return (
    <AuthPage
      signup={false}
      ready={!!getSupabaseConfig(process.env)}
      confirmationError={status === "confirmation-error"}
    />
  );
}
