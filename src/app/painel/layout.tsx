import type { ReactNode } from "react";
import { WorkspaceLayout } from "@/components/workspace";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: ReactNode }) {
  return <WorkspaceLayout>{children}</WorkspaceLayout>;
}
