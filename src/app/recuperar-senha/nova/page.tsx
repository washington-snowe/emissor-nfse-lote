import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth-page";
import { createSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Redefinir senha" };
export const dynamic = "force-dynamic";

export default async function ResetPage() {
  const client = await createSupabaseClient("recovery");
  const user = await client?.auth.getUser().catch(() => null);
  if (user?.error || !user?.data.user) redirect("/recuperar-senha?status=link-invalido");
  return <AuthPage mode="reset" ready />;
}
