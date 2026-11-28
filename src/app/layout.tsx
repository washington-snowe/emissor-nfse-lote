import type { Metadata, Viewport } from "next";
import "@fontsource-variable/outfit";
import "@fontsource/dm-mono/400.css";
import "./globals.css";
import "./experience.css";
import { siteOrigin, siteName } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  applicationName: siteName,
  title: {
    default: "RexNotas — NFS-e em lote para afiliados Shopee",
    template: "%s | RexNotas",
  },
  description:
    "Importe seu relatório da Shopee, revise os dados e emita NFS-e em lote pelo Rex.",
  icons: { icon: [
    { url: "/favicon.ico", type: "image/x-icon", sizes: "16x16 32x32 48x48" },
    { url: "/brand/rex-favicon.png", type: "image/png", sizes: "96x96" },
  ] },
  robots: { index: false, follow: false },
  other: { "page-type": "software", "site-kind": "software" },
};
export const viewport: Viewport = { themeColor: "#f7f7f7" };

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <a className="skip-link" href="#conteudo">
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
