"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import type { ComponentProps } from "react";
import { useCallback, useState } from "react";
import type { WorkspaceArea } from "@/lib/workspace-navigation";
import { WorkspacePageContext, type PageContext } from "@/components/workspace-page";

function routeArea(path: string, section: string | null): WorkspaceArea {
  if (path.startsWith("/painel/empresas")) {
    if (path.endsWith("/fiscal")) return section === "avancado" ? "advanced" : "service";
    return "companies";
  }
  if (path.startsWith("/painel/notas")) return "invoices";
  if (path.startsWith("/painel/importacoes/historico")) return "history";
  if (path.startsWith("/painel/importacoes")) return "imports";
  if (path.startsWith("/painel/certificados")) return "certificates";
  if (path.startsWith("/painel/admin")) return "admin";
  const account: Record<string, WorkspaceArea> = {
    perfil: "profile", login: "login", assinatura: "subscription", indicacoes: "referrals",
  };
  return account[path.split("/")[3]] ?? "overview";
}

export function WorkspaceRouteShell(props: ComponentProps<typeof WorkspaceShell>) {
  const path = usePathname();
  const query = useSearchParams();
  const route = `${path}?${query.toString()}`;
  const [page, setPage] = useState<(PageContext & { route: string }) | null>(null);
  const update = useCallback((next: PageContext) => {
    setPage(previous => previous?.route === route && previous.active === next.active && previous.companyId === next.companyId
      ? previous : { ...next, route });
  }, [route]);
  const current = page?.route === route ? page : null;
  const companyPath = path.match(/^\/painel\/empresas\/([0-9a-f-]{36})(?:\/|$)/i)?.[1];
  return <WorkspacePageContext value={update}>
    <WorkspaceShell {...props} active={current?.active ?? routeArea(path, query.get("secao"))}
      companyId={current?.companyId ?? companyPath ?? query.get("empresa") ?? props.companyId} />
  </WorkspacePageContext>;
}
