import { PageHeader } from "@/components/page-header";
import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/workspace";
import { AccountProfileForm } from "@/components/account-forms";
import { getWorkspaceData } from "@/lib/workspace-data";
import { accountPhoneMetadata, validateSignupPhone } from "@/lib/auth-validation";
export const metadata: Metadata = { title: "Perfil" };
export const dynamic = "force-dynamic";

export default async function Profile() {
  const data = await getWorkspaceData();
  const signupPhone = validateSignupPhone(data.context.user.user_metadata?.[accountPhoneMetadata]);
  return <WorkspaceShell active="profile"><div className="dashboard-content company-page"><PageHeader title="Perfil" description="Gerencie seu nome de exibição e seu telefone." />
    {data.profileAvailable ? <AccountProfileForm name={data.profile?.display_name} phone={data.profile?.phone ?? signupPhone ?? undefined} version={data.profile?.version} /> : <p className="save-notice">O perfil está aguardando a configuração do banco.</p>}
  </div></WorkspaceShell>;
}
