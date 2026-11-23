"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Brand } from "@/components/brand";
import { EmptyState } from "@/components/page-header";

export default function WorkspaceError({ reset }: { reset: () => void }) {
  return <>
    <header className="site-masthead"><div className="site-width site-masthead-inner"><Brand href="/painel" /></div></header>
    <main id="conteudo" className="error-screen">
      <h1>O painel não carregou</h1>
      <EmptyState icon={<TriangleAlert size={24} aria-hidden="true" />} title="Tente novamente"
        actions={<><button type="button" className="btn btn--primary" onClick={reset}>Recarregar</button><Link href="/painel" className="btn btn--secondary">Ir para o painel</Link></>}>
        Houve uma falha ao carregar os dados desta página.
      </EmptyState>
    </main>
  </>;
}
