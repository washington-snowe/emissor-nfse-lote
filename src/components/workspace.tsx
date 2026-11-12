import { WorkspaceShell as Shell } from "@/components/workspace-shell";
import { getWorkspaceData } from "@/lib/workspace-data";
import { chooseCompany, type WorkspaceArea } from "@/lib/workspace-navigation";
export async function WorkspaceShell({ children, active = "overview", companyId }: {
  children: React.ReactNode; active?: WorkspaceArea; email?: string; companyId?: string;
}) {
  const data = await getWorkspaceData();
  const selected = companyId ? chooseCompany(data.companies, companyId) : data.selected;
  return <Shell email={data.context.user.email} name={data.profile?.display_name} active={active}
    companies={data.companies} companyId={selected?.id}>{children}</Shell>;
}
