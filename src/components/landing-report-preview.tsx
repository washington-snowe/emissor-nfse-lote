import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function LandingReportPreview() {
  return <figure className="landing-report-preview" aria-labelledby="preview-report-title" data-landing-reveal="panel">
    <Image className="landing-panel-screenshot" src="/brand/rex-panel-desktop.webp"
      width={1440} height={840} unoptimized
      alt="Painel do RexNotas em desktop, com o histórico de notas e os status de cada emissão." />
    <figcaption className="landing-report-actions">
      <span id="preview-report-title">Painel do RexNotas com dados de demonstração.</span>
      <Link href="/criar-conta" className="btn btn--secondary">Criar conta para emitir <ArrowRight size={16} aria-hidden="true" /></Link>
    </figcaption>
  </figure>;
}
