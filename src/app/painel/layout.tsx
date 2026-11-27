import type { ReactNode } from "react";
import { WorkspaceLayout } from "@/components/workspace";

import "./panel.css";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: ReactNode }) {
  return <WorkspaceLayout>{children}</WorkspaceLayout>;
}
