import { hasAdminAccess } from "@/lib/admin-credits";
import { WorkspaceShell as Shell } from "@/components/workspace-shell";
import { getWorkspaceData, getWorkspaceProfile } from "@/lib/workspace-data";
import { chooseCompany, type WorkspaceArea } from "@/lib/workspace-navigation";
import { getPublicContact } from "@/lib/public-contact";
export async function WorkspaceShell({ children, active = "overview", companyId }: {
  children: React.ReactNode; active?: WorkspaceArea; email?: string; companyId?: string;
}) {
  const [data, { profile }, canAdmin] = await Promise.all([getWorkspaceData(), getWorkspaceProfile(), hasAdminAccess()]);
  const selected = companyId ? chooseCompany(data.companies, companyId) : data.selected;
  return <Shell email={data.context.user.email} name={profile?.display_name} active={active}
    canAdmin={canAdmin} compactSidebar={data.compactSidebar} support={getPublicContact()} companies={data.companies} companyId={selected?.id}>{children}</Shell>;
}
