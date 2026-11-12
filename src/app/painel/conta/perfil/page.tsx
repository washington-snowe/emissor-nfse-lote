import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/workspace";
import { AccountProfileForm } from "@/components/account-forms";
import { getWorkspaceData } from "@/lib/workspace-data";
export const metadata: Metadata = { title: "Perfil" };
export default async function Profile() {
  const data = await getWorkspaceData();
  return <WorkspaceShell active="profile"><div className="dashboard-content company-page"><span className="eyebrow">Conta</span><h1>Seu perfil.</h1><p>Como você aparece no seu espaço de trabalho.</p>
    {data.profileAvailable ? <AccountProfileForm name={data.profile?.display_name} phone={data.profile?.phone} version={data.profile?.version} /> : <p className="save-notice">O perfil está aguardando a configuração do banco.</p>}
  </div></WorkspaceShell>;
}
