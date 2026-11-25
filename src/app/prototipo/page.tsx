import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/tenancy-server";
import { Prototype } from "./prototype";
import { screens, type Screen } from "./screens";

export const metadata: Metadata = { title: "Protótipo interativo", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PrototypePage({ searchParams }: { searchParams: Promise<{ tela?: string }> }) {
  await requireWorkspace();
  const { tela } = await searchParams;
  const screen = tela && Object.hasOwn(screens, tela) ? tela as Screen : "inicio";
  return <Prototype initial={screen} />;
}
