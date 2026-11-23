import Link from "next/link";
import { FileSearch } from "lucide-react";
import { Brand } from "@/components/brand";
import { EmptyState } from "@/components/page-header";

export default function NotFound() {
  return <>
    <header className="site-masthead">
      <div className="site-width site-masthead-inner"><Brand /><Link href="/entrar" className="btn btn--secondary">Entrar</Link></div>
    </header>
    <main id="conteudo" className="error-screen">
      <h1>Página não encontrada</h1>
      <EmptyState icon={<FileSearch size={24} aria-hidden="true" />} title="Confira o endereço"
        actions={<Link href="/" className="btn btn--primary">Ir para o início</Link>}>
        Esta página pode ter mudado de endereço ou estar indisponível para sua conta.
      </EmptyState>
    </main>
  </>;
}
