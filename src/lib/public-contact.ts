import "server-only";

export function getPublicContact() {
  const raw = process.env.REX_SUPPORT_URL?.trim();
  if (!raw) return;
  try {
    const url = new URL(raw);
    if (["https:", "mailto:"].includes(url.protocol) && !url.username && !url.password) {
      const isWhatsApp = url.protocol === "https:" && url.hostname === "wa.me";
      return {
        href: url.href,
        label: isWhatsApp ? "Fale pelo WhatsApp" : "Fale com nossa equipe",
        isWhatsApp,
      };
    }
  } catch {
    // Only render a contact link for a valid public destination.
  }
}
