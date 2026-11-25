import type { ReactNode } from "react";
import { requireWorkspace } from "@/lib/tenancy-server";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: ReactNode }) {
  await requireWorkspace();
  return children;
}
