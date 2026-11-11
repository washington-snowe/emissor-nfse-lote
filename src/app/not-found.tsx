import Link from "next/link";
import { Brand } from "@/components/brand";

export default function NotFound() {
  return (
    <main id="conteudo" className="error-page">
      <Brand />
      <span className="mono">404</span>
      <h1>Esta página não existe.</h1>
      <p>Volte ao início para continuar.</p>
      <Link className="btn btn--primary" href="/">
        Voltar ao início
      </Link>
    </main>
  );
}
