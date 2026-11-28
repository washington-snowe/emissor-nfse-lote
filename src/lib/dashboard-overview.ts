export type OverviewNote = {
  id: string;
  recipient: { legalName: string };
  status: string;
  environment?: "production" | "homologation";
  amount: string;
  competence_date: string;
};

export const overviewSampleSize = 100;

export function overviewMonth(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(date);
}

export function overviewSummary(totals: Record<string, number>, notes: OverviewNote[], month: string) {
  const count = (statuses: string[]) => statuses.reduce((sum, status) => sum + (totals[status] ?? 0), 0);
  const groups = [
    { label: "Autorizadas", value: count(["authorized"]), tone: "success" },
    { label: "Em andamento", value: count(["queued", "preparing", "sending", "reconciling"]), tone: "info" },
    { label: "Precisam de atenção", value: count(["blocked", "uncertain", "rejected", "intervention"]), tone: "warning" },
    { label: "Canceladas", value: count(["cancelled"]), tone: "neutral" },
  ];
  const [year, number] = month.split("-").map(Number);
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, number - 6 + index, 1));
    return {
      key: date.toISOString().slice(0, 7),
      label: new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(date).replace(".", ""),
      cents: 0n,
      count: 0,
    };
  });
  for (const note of notes) {
    if (note.status !== "authorized" || note.environment !== "production") continue;
    const bucket = months.find(item => item.key === note.competence_date.slice(0, 7));
    if (!bucket) continue;
    const [whole, fraction = ""] = note.amount.split(".");
    bucket.cents += BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
    bucket.count++;
  }
  return {
    groups,
    total: groups.reduce((sum, group) => sum + group.value, 0),
    months,
    recentCents: months.reduce((sum, item) => sum + item.cents, 0n),
  };
}
