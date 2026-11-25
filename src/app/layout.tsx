import type { Metadata, Viewport } from "next";
import "@fontsource-variable/outfit";
import "@fontsource/dm-mono/400.css";
import "./globals.css";
import "./experience.css";

export const metadata: Metadata = {
  title: {
    default: "Rex Notas — NFS-e em lote para afiliados",
    template: "%s | Rex Notas",
  },
  description:
    "Importe seu relatório da Shopee, revise os dados e emita NFS-e em lote pelo Rex.",
  icons: { icon: "/brand/rex-favicon.png" },
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
