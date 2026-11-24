import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/brand";
import { getPublicContact } from "@/lib/public-contact";

export function LandingFooter() {
  const contact = getPublicContact();

  return <footer className="landing-footer">
    <div className="wrap landing-footer-grid">
      <div className="landing-footer-about">
        <Brand inverse />
        <p>Emissão de NFS-e em lote para afiliados da Shopee, a partir do relatório mensal de comissões.</p>
      </div>
      <nav className="landing-footer-navigation" aria-label="Navegação do rodapé">
        <h2>Navegação</h2>
        <Link href="/#como-funciona">Como funciona</Link>
        <Link href="/#consultar-cnpj">Consultar CNPJ</Link>
        <Link href="/#planos">Planos e preços</Link>
        <Link href="/#simulador">Simulador CSV</Link>
        <Link href="/#perguntas-frequentes">Dúvidas frequentes</Link>
      </nav>
      {contact && <div className="landing-footer-contact">
        <h2>Contato</h2>
        <a href={contact.href}>{contact.label}<ArrowUpRight size={15} aria-hidden="true" /></a>
      </div>}
      <nav className="landing-footer-legal" aria-label="Documentos legais">
        <h2>Legal</h2>
        <Link href="/termos-de-uso">Termos de uso</Link>
        <Link href="/politica-de-privacidade">Política de privacidade</Link>
      </nav>
    </div>
    <div className="wrap landing-footer-bottom">© Rex Notas</div>
  </footer>;
}
