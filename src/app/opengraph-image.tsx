import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const alt = "RexNotas — NFS-e em lote para afiliados Shopee";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

export default async function SocialImage() {
  const [logo, mascot] = await Promise.all(["rex-logo.png", "rex-mascote.png"].map(file => readFile(path.join(process.cwd(), "public/brand", file))));
  return new ImageResponse(<div style={{ display: "flex", width: "100%", height: "100%", background: "#f1f1f1", color: "#121212", padding: "54px 60px", position: "relative", overflow: "hidden" }}>
    <div style={{ display: "flex", width: 670, flexDirection: "column", justifyContent: "space-between" }}>
      {/* ImageResponse renders embedded image bytes, not browser images. */}
      <img src={`data:image/png;base64,${logo.toString("base64")}`} width={180} height={79} alt="RexNotas" />
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 68, lineHeight: 1.07, fontWeight: 700, letterSpacing: -3 }}>NFS-e em lote para afiliados Shopee.</div>
        <div style={{ fontSize: 27, color: "#525252", maxWidth: 600 }}>Importe o relatório. Revise o lote. Emita suas notas.</div>
      </div>
      <div style={{ fontSize: 23 }}>rexnotas.com.br</div>
    </div>
    <img src={`data:image/png;base64,${mascot.toString("base64")}`} width={545} height={545} alt="" style={{ position: "absolute", right: -45, bottom: -40 }} />
  </div>, size);
}
