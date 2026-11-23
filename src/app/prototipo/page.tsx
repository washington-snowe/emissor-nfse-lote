import type { Metadata } from "next";
import { Prototype } from "./prototype";
import { screens, type Screen } from "./screens";

export const metadata: Metadata = { title: "Protótipo interativo", robots: { index: false, follow: false } };

export default async function PrototypePage({ searchParams }: { searchParams: Promise<{ tela?: string }> }) {
  const { tela } = await searchParams;
  const screen = tela && Object.hasOwn(screens, tela) ? tela as Screen : "inicio";
  return <Prototype initial={screen} />;
}
