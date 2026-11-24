export const demoReport = {
  recipient: "Marketplace de exemplo",
  competence: "31/10/2026",
  amountsInCents: [1842, 2133, 981, 4725],
};

export const demoReportTotal = demoReport.amountsInCents.reduce((total, amount) => total + amount, 0);
