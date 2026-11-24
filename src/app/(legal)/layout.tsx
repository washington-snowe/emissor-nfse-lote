import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { LandingFooter } from "@/components/landing-footer";
import "../landing.css";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return <div className="landing">
    <header className="site-masthead legal-masthead">
      <div className="wrap site-masthead-inner">
        <Brand />
        <Link href="/" className="text-link"><ArrowLeft size={16} aria-hidden="true" /> Voltar ao site</Link>
      </div>
    </header>
    <main id="conteudo" className="wrap legal-content">{children}</main>
    <LandingFooter />
  </div>;
}
