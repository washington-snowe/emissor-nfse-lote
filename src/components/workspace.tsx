import { hasAdminAccess } from "@/lib/admin-credits";
import { WorkspaceRouteShell } from "@/components/workspace-route-shell";
import { getWorkspaceData, getWorkspaceProfile } from "@/lib/workspace-data";
import type { WorkspaceArea } from "@/lib/workspace-navigation";
import { getPublicContact } from "@/lib/public-contact";
import { WorkspacePage } from "@/components/workspace-page";

export function WorkspaceShell({ children, active, companyId }: {
  children: React.ReactNode; active?: WorkspaceArea; email?: string; companyId?: string;
}) {
  return <WorkspacePage active={active} companyId={companyId}>{children}</WorkspacePage>;
}

export async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const [data, { profile }, canAdmin] = await Promise.all([getWorkspaceData(), getWorkspaceProfile(), hasAdminAccess()]);
  return <WorkspaceRouteShell email={data.context.user.email} name={profile?.display_name}
    canAdmin={canAdmin} support={getPublicContact()} companies={data.companies} companyId={data.selected?.id}>{children}</WorkspaceRouteShell>;
}
