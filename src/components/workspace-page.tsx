"use client";

import { createContext, useContext, useLayoutEffect, type ReactNode } from "react";
import type { WorkspaceArea } from "@/lib/workspace-navigation";

export type PageContext = { companyId?: string; active: WorkspaceArea };
export const WorkspacePageContext = createContext<((page: PageContext) => void) | null>(null);

export function WorkspacePage({ children, active = "overview", companyId }: {
  children: ReactNode; active?: WorkspaceArea; companyId?: string;
}) {
  const update = useContext(WorkspacePageContext);
  useLayoutEffect(() => { update?.({ active, companyId }); }, [update, active, companyId]);
  return children;
}
