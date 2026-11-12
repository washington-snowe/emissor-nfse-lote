import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/tenancy-server";

// Keep old bookmarks working after removal of the two-step verification flow.
export default async function LegacySecurity() {
  await requireWorkspace();
  redirect("/painel");
}
