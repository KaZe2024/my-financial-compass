/**
 * Rapports périodiques (hebdomadaire / mensuel) — fonctions pures.
 * Les indicateurs sont calculés côté application puis passés ici pour
 * produire les sections, le commentaire et l'export Markdown.
 */

export type ReportKind = "weekly" | "monthly";

export type ReportInput = {
  kind: ReportKind;
  start: string;
  end: string;
  currency: string;
  income: number;
  expense: number;
  incomePrev: number;
  expensePrev: number;
  cash: number;
  netWorth: number;
  totalDebt: number;
  totalReceivable: number;
  savingsRate: number;
  healthScore: number;
  execution: { completionRate: number; overdue: number; habitAdherence: number | null; streak: number };
  alignmentScore: number | null;
  domains: Array<{ label: string; targetPct: number; actualPct: number }>;
  budget: { planned: number; actual: number } | null;
  topExpenses: Array<{ label: string; amount: number }>;
  deadlinesNext: Array<{ label: string; amount: number; date: string }>;
  planProgressPct: number | null;
};

export type ReportSection = { title: string; lines: string[] };

export type Report = {
  label: string;
  metrics: Record<string, number | string | null>;
  commentary: string;
  sections: ReportSection[];
};

const fr = (n: number) => Math.round(n).toLocaleString("fr-FR");
const pct = (n: number) => `${n.toFixed(0)} %`;

function variation(cur: number, prev: number): string {
  if (prev <= 0) return cur > 0 ? "nouveau" : "stable";
  const d = ((cur - prev) / prev) * 100;
  const sign = d >= 0 ? "+" : "−";
  return `${sign}${Math.abs(d).toFixed(0)} % vs période précédente`;
}

export function periodBounds(kind: ReportKind, ref: Date): { start: string; end: string } {
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (kind === "monthly") {
    const s = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const e = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    return { start: ymd(s), end: ymd(e) };
  }
  const day = ref.getDay();
  const diff = day === 0 ? -6 : 1 - day; // semaine commençant lundi
  const s = new Date(ref);
  s.setDate(ref.getDate() + diff);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  return { start: ymd(s), end: ymd(e) };
}

export function periodLabel(kind: ReportKind, start: string, end: string): string {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  if (kind === "monthly") return s.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return `Semaine du ${s.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} au ${e.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}`;
}

export function buildReport(i: ReportInput): Report {
  const net = i.income - i.expense;
  const netPrev = i.incomePrev - i.expensePrev;
  const label = periodLabel(i.kind, i.start, i.end);

  const finance: string[] = [
    `Revenus : ${fr(i.income)} ${i.currency} (${variation(i.income, i.incomePrev)}).`,
    `Dépenses : ${fr(i.expense)} ${i.currency} (${variation(i.expense, i.expensePrev)}).`,
    `Résultat net : ${net >= 0 ? "+" : "−"}${fr(Math.abs(net))} ${i.currency}${netPrev !== 0 ? ` (précédent ${netPrev >= 0 ? "+" : "−"}${fr(Math.abs(netPrev))})` : ""}.`,
    `Taux d'épargne : ${pct(i.savingsRate)} · score de santé ${i.healthScore.toFixed(0)}/100.`,
  ];
  if (i.budget) {
    const gap = i.budget.actual - i.budget.planned;
    finance.push(
      `Budget : réel ${fr(i.budget.actual)} contre ${fr(i.budget.planned)} planifié, écart net ${gap >= 0 ? "+" : "−"}${fr(Math.abs(gap))} ${i.currency}.`,
    );
  } else {
    finance.push("Budget : aucun montant planifié sur la période, l'écart réel / planifié n'est pas mesurable.");
  }

  const patrimoine: string[] = [
    `Trésorerie disponible : ${fr(i.cash)} ${i.currency}.`,
    `Patrimoine net : ${fr(i.netWorth)} ${i.currency} (dettes ${fr(i.totalDebt)}, créances ${fr(i.totalReceivable)}).`,
  ];

  const execution: string[] = [
    `Réalisation du planifié : ${pct(i.execution.completionRate)} · ${i.execution.overdue} occurrence(s) en retard.`,
    i.execution.habitAdherence == null
      ? "Habitudes : aucune habitude active mesurée."
      : `Habitudes tenues : ${pct(i.execution.habitAdherence)} · série de ${i.execution.streak} jour(s) sans retard.`,
  ];
  if (i.planProgressPct != null) execution.push(`Plan d'action du mois : ${pct(i.planProgressPct)} réalisé.`);

  const alignment: string[] = [];
  if (i.alignmentScore != null) alignment.push(`Score d'alignement : ${i.alignmentScore.toFixed(0)}/100.`);
  for (const d of i.domains.slice(0, 6)) {
    const gap = d.actualPct - d.targetPct;
    alignment.push(
      `${d.label} : ${pct(d.actualPct)} du temps pour une cible de ${pct(d.targetPct)} (${gap >= 0 ? "+" : "−"}${Math.abs(gap).toFixed(0)} pt).`,
    );
  }
  if (!alignment.length) alignment.push("Aucun domaine de vie déclaré : l'alignement n'est pas mesuré.");

  const focus: string[] = [];
  if (i.topExpenses.length) {
    focus.push(`Postes les plus lourds : ${i.topExpenses.slice(0, 3).map((x) => `${x.label} (${fr(x.amount)})`).join(", ")}.`);
  }
  if (i.deadlinesNext.length) {
    focus.push(
      `À venir : ${i.deadlinesNext.slice(0, 4).map((x) => `${x.label} ${fr(x.amount)} le ${new Date(`${x.date}T00:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}`).join(" · ")}.`,
    );
  }
  if (!focus.length) focus.push("Aucune échéance ni concentration de dépense notable sur la période.");

  // Commentaire de synthèse type analyste.
  const bullets: string[] = [];
  if (net > 0 && i.savingsRate >= 20) bullets.push(`la période dégage ${fr(net)} ${i.currency} d'excédent avec un taux d'épargne de ${pct(i.savingsRate)}, ce qui autorise une affectation vers un objectif ou un actif`);
  else if (net > 0) bullets.push(`l'excédent de ${fr(net)} ${i.currency} reste modeste : le taux d'épargne de ${pct(i.savingsRate)} laisse peu de marge d'absorption`);
  else bullets.push(`la période est déficitaire de ${fr(Math.abs(net))} ${i.currency} : le train de vie dépasse les entrées encaissées`);

  if (i.execution.completionRate >= 80) bullets.push("l'exécution du plan suit, le système tient");
  else if (i.execution.overdue > 5) bullets.push(`l'arriéré de ${i.execution.overdue} occurrence(s) indique un plan plus ambitieux que la capacité réelle`);
  else bullets.push(`la réalisation à ${pct(i.execution.completionRate)} demande un resserrement des priorités`);

  if (i.totalDebt > 0 && i.cash < i.totalDebt) bullets.push(`les encours de dette (${fr(i.totalDebt)}) dépassent le disponible : garder une priorité de désendettement`);
  if (i.totalReceivable > 0) bullets.push(`${fr(i.totalReceivable)} ${i.currency} sont encore chez des tiers, c'est de la trésorerie mobilisable sans effort d'épargne`);

  const commentary = `${label} — ${bullets.join(" ; ")}.`;

  const sections: ReportSection[] = [
    { title: "Finances de la période", lines: finance },
    { title: "Patrimoine & position", lines: patrimoine },
    { title: "Exécution", lines: execution },
    { title: "Alignement de vie", lines: alignment },
    { title: "Points d'attention", lines: focus },
  ];

  return {
    label,
    metrics: {
      income: Math.round(i.income),
      expense: Math.round(i.expense),
      net: Math.round(net),
      cash: Math.round(i.cash),
      netWorth: Math.round(i.netWorth),
      totalDebt: Math.round(i.totalDebt),
      totalReceivable: Math.round(i.totalReceivable),
      savingsRate: Number(i.savingsRate.toFixed(1)),
      healthScore: Math.round(i.healthScore),
      completionRate: Number(i.execution.completionRate.toFixed(1)),
      overdue: i.execution.overdue,
      habitAdherence: i.execution.habitAdherence == null ? null : Number(i.execution.habitAdherence.toFixed(1)),
      alignmentScore: i.alignmentScore == null ? null : Math.round(i.alignmentScore),
      planProgressPct: i.planProgressPct == null ? null : Number(i.planProgressPct.toFixed(1)),
    },
    commentary,
    sections,
  };
}

export function reportToMarkdown(r: Report, kind: ReportKind): string {
  const head = `# Rapport ${kind === "weekly" ? "hebdomadaire" : "mensuel"} — ${r.label}\n\n${r.commentary}\n`;
  const body = r.sections
    .map((s) => `\n## ${s.title}\n${s.lines.map((l) => `- ${l}`).join("\n")}`)
    .join("\n");
  return `${head}${body}\n`;
}
