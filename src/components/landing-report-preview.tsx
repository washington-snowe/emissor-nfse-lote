import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { panelPreviewViewport } from "@/lib/panel-preview";
import panelPreview from "../../public/brand/rex-panel-desktop.webp";

export function LandingReportPreview() {
  return <figure className="landing-report-preview" aria-labelledby="preview-report-title" data-landing-reveal="panel">
    <Image className="landing-panel-screenshot" src={panelPreview}
      width={panelPreviewViewport.width} height={panelPreviewViewport.height} unoptimized
      alt="Painel do RexNotas em desktop, na aba Início, com resumo das emissões, gráficos e notas recentes." />
    <figcaption className="landing-report-actions">
      <span id="preview-report-title">Painel do RexNotas com dados de demonstração.</span>
      <Link href="/criar-conta" className="btn btn--secondary">Criar conta para emitir <ArrowRight size={16} aria-hidden="true" /></Link>
    </figcaption>
  </figure>;
}
