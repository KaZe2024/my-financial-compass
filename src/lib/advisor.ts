/**
 * Moteur de recommandations unifié — fonction pure.
 *
 * Prend un instantané des données déjà chargées par l'application et renvoie
 * une liste d'actions typées (impact estimé, effort, échéance, module concerné).
 * Aucun accès réseau, aucune écriture : uniquement du calcul.
 */

export type AdvisorCategory =
  | "tresorerie"
  | "dette"
  | "creance"
  | "epargne"
  | "budget"
  | "patrimoine"
  | "abonnement"
  | "objectif"
  | "execution";

export type AdvisorSeverity = "critical" | "warning" | "info" | "opportunity";
export type AdvisorEffort = "faible" | "moyen" | "eleve";

export type Recommendation = {
  /** Clé stable — sert à mémoriser l'acceptation / le refus d'un conseil. */
  key: string;
  title: string;
  rationale: string;
  category: AdvisorCategory;
  severity: AdvisorSeverity;
  /** Impact financier estimé en devise de base (0 si non chiffrable). */
  impact: number;
  effort: AdvisorEffort;
  /** Échéance conseillée (YYYY-MM-DD) ou null. */
  dueDate: string | null;
  /** Libellé du module concerné + route pour y aller. */
  module: string;
  moduleTo: string;
};

export const CATEGORY_LABELS: Record<AdvisorCategory, string> = {
  tresorerie: "Trésorerie",
  dette: "Dettes",
  creance: "Créances",
  epargne: "Épargne",
  budget: "Budget",
  patrimoine: "Patrimoine",
  abonnement: "Abonnements",
  objectif: "Objectifs",
  execution: "Exécution",
};

export const SEVERITY_LABELS: Record<AdvisorSeverity, string> = {
  critical: "Critique",
  warning: "Vigilance",
  info: "À traiter",
  opportunity: "Opportunité",
};

export const EFFORT_LABELS: Record<AdvisorEffort, string> = {
  faible: "Effort faible",
  moyen: "Effort moyen",
  eleve: "Effort élevé",
};

const SEVERITY_WEIGHT: Record<AdvisorSeverity, number> = {
  critical: 4,
  warning: 3,
  info: 2,
  opportunity: 1,
};

export type AdvisorInput = {
  today: string;
  cash: number;
  monthlyIncome: number;
  monthlyExpense: number;
  emergencyMonths: number;
  savingsRate: number; // en %
  netWorth: number;
  totalDebt: number;
  totalAssets: number;
  /** Solde projeté le plus bas sur l'horizon, et date du premier franchissement négatif. */
  forecastLow?: { balance: number; date: string } | null;
  forecastBreach?: { balance: number; date: string } | null;
  debts: Array<{ id: string; creditor: string; outstanding: number; due_date: string | null; status: string | null }>;
  receivables: Array<{ id: string; debtor: string; outstanding: number; due_date: string | null; status: string | null }>;
  provisions: Array<{ id: string; name: string; amount: number; due_date: string | null; status: string | null }>;
  subscriptions: Array<{ id: string; name: string; amount: number; billing_cycle: string; active: boolean }>;
  goals: Array<{ id: string; name: string; pct: number; target_date: string | null; inverse: boolean; status: string | null }>;
  assets: Array<{ id: string; name: string; bookValue: number; cost: number; sold: boolean }>;
  /** Nombre de tâches ouvertes dont la date est passée. */
  overdueTasks: number;
  /** Taux de réalisation des éléments planifiés sur les 30 derniers jours (0..100). */
  completionRate: number;
  /** Taux de tenue des habitudes sur les 30 derniers jours (0..100), null si aucune habitude. */
  habitAdherence: number | null;
  /** true si le mois courant a au moins un montant budgété. */
  hasCurrentBudget: boolean;
};

function monthlyFromCycle(amount: number, cycle: string) {
  const c = (cycle || "monthly").toLowerCase();
  if (c === "daily") return amount * 30;
  if (c === "weekly") return amount * 4.345;
  if (c === "biweekly" || c === "bi-weekly") return amount * 2.17;
  if (c === "monthly") return amount;
  if (c === "bimonthly") return amount / 2;
  if (c === "quarterly") return amount / 3;
  if (c === "semiannual" || c === "semiannually") return amount / 6;
  if (c === "yearly" || c === "annual" || c === "annually") return amount / 12;
  return amount;
}

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

const OPEN_OBLIGATION = (s: string | null | undefined) => s !== "settled" && s !== "cancelled";

/** Construit la liste des recommandations, triée par priorité puis impact. */
export function buildRecommendations(i: AdvisorInput): Recommendation[] {
  const out: Recommendation[] = [];
  const push = (r: Recommendation) => out.push(r);

  // ---------- Trésorerie ----------
  if (i.forecastBreach) {
    push({
      key: "cash_breach",
      title: `Rupture de trésorerie projetée le ${i.forecastBreach.date}`,
      rationale:
        "En prolongeant le rythme actuel de recettes et de dépenses et en intégrant les échéances datées, le solde disponible passe sous zéro. Il faut arbitrer maintenant : décaler une sortie, accélérer un encaissement ou débloquer une réserve.",
      category: "tresorerie",
      severity: "critical",
      impact: Math.abs(i.forecastBreach.balance),
      effort: "moyen",
      dueDate: i.forecastBreach.date,
      module: "Dashboard",
      moduleTo: "/dashboard",
    });
  } else if (i.forecastLow && i.monthlyExpense > 0 && i.forecastLow.balance < i.monthlyExpense) {
    push({
      key: "cash_thin",
      title: "Point bas de trésorerie inférieur à un mois de dépenses",
      rationale: `Le solde projeté descend à ${Math.round(i.forecastLow.balance).toLocaleString("fr-FR")} autour du ${i.forecastLow.date}, soit moins d'un mois de train de vie. La marge de manœuvre est trop faible pour absorber un imprévu.`,
      category: "tresorerie",
      severity: "warning",
      impact: Math.max(0, i.monthlyExpense - i.forecastLow.balance),
      effort: "moyen",
      dueDate: i.forecastLow.date,
      module: "Dashboard",
      moduleTo: "/dashboard",
    });
  }

  if (i.emergencyMonths < 3 && i.monthlyExpense > 0) {
    const gap = i.monthlyExpense * 3 - i.cash;
    push({
      key: "emergency_fund",
      title: `Fonds d'urgence à ${i.emergencyMonths.toFixed(1)} mois — cible 3 mois`,
      rationale: `Il manque environ ${Math.round(Math.max(0, gap)).toLocaleString("fr-FR")} pour couvrir trois mois de dépenses. C'est le premier amortisseur à constituer avant tout investissement.`,
      category: "epargne",
      severity: i.emergencyMonths < 1 ? "critical" : "warning",
      impact: Math.max(0, gap),
      effort: "moyen",
      dueDate: null,
      module: "Objectifs",
      moduleTo: "/goals",
    });
  }

  // ---------- Capacité d'épargne ----------
  if (i.monthlyIncome > 0 && i.savingsRate < 20) {
    const target = i.monthlyIncome * 0.2;
    const current = i.monthlyIncome - i.monthlyExpense;
    push({
      key: "savings_rate",
      title: `Taux d'épargne à ${i.savingsRate.toFixed(0)} % — viser 20 %`,
      rationale: `Sur le rythme mensuel observé, l'excédent est de ${Math.round(current).toLocaleString("fr-FR")} alors qu'un objectif de 20 % représenterait ${Math.round(target).toLocaleString("fr-FR")}. Un plafond de dépense sur les deux postes les plus lourds suffit généralement à combler l'écart.`,
      category: "epargne",
      severity: i.savingsRate < 0 ? "critical" : i.savingsRate < 10 ? "warning" : "info",
      impact: Math.max(0, target - current),
      effort: "moyen",
      dueDate: null,
      module: "Budgets",
      moduleTo: "/budgets",
    });
  }

  // ---------- Dettes ----------
  const lateDebts = i.debts.filter((d) => OPEN_OBLIGATION(d.status) && d.due_date && d.due_date < i.today);
  if (lateDebts.length) {
    const amount = lateDebts.reduce((s, d) => s + Number(d.outstanding ?? 0), 0);
    push({
      key: "debts_late",
      title: `${lateDebts.length} dette(s) échue(s) non réglée(s)`,
      rationale: `Encours en retard : ${Math.round(amount).toLocaleString("fr-FR")} (${lateDebts.slice(0, 3).map((d) => d.creditor).join(", ")}${lateDebts.length > 3 ? "…" : ""}). Un retard dégrade la relation avec le créancier et masque le vrai niveau d'endettement.`,
      category: "dette",
      severity: "critical",
      impact: amount,
      effort: "faible",
      dueDate: lateDebts.map((d) => d.due_date!).sort()[0],
      module: "Dettes",
      moduleTo: "/debts",
    });
  }

  const soonDebts = i.debts.filter(
    (d) => OPEN_OBLIGATION(d.status) && d.due_date && d.due_date >= i.today && daysBetween(i.today, d.due_date) <= 15,
  );
  if (soonDebts.length) {
    const amount = soonDebts.reduce((s, d) => s + Number(d.outstanding ?? 0), 0);
    push({
      key: "debts_soon",
      title: `${soonDebts.length} échéance(s) de dette sous 15 jours`,
      rationale: `${Math.round(amount).toLocaleString("fr-FR")} à sortir prochainement. Vérifier que le portefeuille payeur est bien approvisionné, sinon provisionner dès maintenant.`,
      category: "dette",
      severity: amount > i.cash ? "critical" : "warning",
      impact: amount,
      effort: "faible",
      dueDate: soonDebts.map((d) => d.due_date!).sort()[0],
      module: "Dettes",
      moduleTo: "/debts",
    });
  }

  const gross = i.totalAssets + i.cash;
  const leverage = gross > 0 ? i.totalDebt / gross : i.totalDebt > 0 ? 1 : 0;
  if (leverage > 0.5) {
    push({
      key: "leverage",
      title: `Endettement à ${(leverage * 100).toFixed(0)} % du patrimoine brut`,
      rationale:
        "Au-delà de 50 %, le patrimoine travaille surtout pour les créanciers. Prioriser le remboursement des encours au coût le plus élevé avant tout nouvel engagement.",
      category: "dette",
      severity: leverage > 0.8 ? "critical" : "warning",
      impact: Math.max(0, i.totalDebt - gross * 0.5),
      effort: "eleve",
      dueDate: null,
      module: "Dettes",
      moduleTo: "/debts",
    });
  }

  // ---------- Créances ----------
  const lateRec = i.receivables.filter((r) => OPEN_OBLIGATION(r.status) && r.due_date && r.due_date < i.today);
  if (lateRec.length) {
    const amount = lateRec.reduce((s, r) => s + Number(r.outstanding ?? 0), 0);
    push({
      key: "receivables_late",
      title: `${lateRec.length} créance(s) en retard à relancer`,
      rationale: `${Math.round(amount).toLocaleString("fr-FR")} dorment chez des tiers (${lateRec.slice(0, 3).map((r) => r.debtor).join(", ")}${lateRec.length > 3 ? "…" : ""}). C'est de la trésorerie immédiatement mobilisable sans effort d'épargne.`,
      category: "creance",
      severity: "warning",
      impact: amount,
      effort: "faible",
      dueDate: null,
      module: "Créances",
      moduleTo: "/receivables",
    });
  }

  // ---------- Provisions ----------
  const openProvisions = i.provisions.filter(
    (p) => p.status !== "settled" && p.status !== "cancelled" && p.due_date && daysBetween(i.today, p.due_date) <= 30,
  );
  if (openProvisions.length) {
    const amount = openProvisions.reduce((s, p) => s + Number(p.amount ?? 0), 0);
    if (amount > i.cash) {
      push({
        key: "provisions_uncovered",
        title: "Provisions à 30 jours supérieures à la trésorerie disponible",
        rationale: `${Math.round(amount).toLocaleString("fr-FR")} de charges provisionnées arrivent alors que le disponible est de ${Math.round(i.cash).toLocaleString("fr-FR")}. Étaler, renégocier ou accélérer une entrée.`,
        category: "tresorerie",
        severity: "critical",
        impact: amount - i.cash,
        effort: "moyen",
        dueDate: openProvisions.map((p) => p.due_date!).sort()[0],
        module: "Provisions",
        moduleTo: "/provisions",
      });
    }
  }

  // ---------- Abonnements ----------
  const activeSubs = i.subscriptions.filter((s) => s.active);
  const monthlySubs = activeSubs.reduce((s, x) => s + monthlyFromCycle(Number(x.amount ?? 0), x.billing_cycle), 0);
  if (monthlySubs > 0 && i.monthlyExpense > 0 && monthlySubs / i.monthlyExpense > 0.12) {
    push({
      key: "subs_weight",
      title: `Abonnements = ${((monthlySubs / i.monthlyExpense) * 100).toFixed(0)} % des dépenses mensuelles`,
      rationale: `${Math.round(monthlySubs).toLocaleString("fr-FR")} par mois d'engagements récurrents sur ${activeSubs.length} abonnement(s). Une revue annuelle permet en général de supprimer 15 à 25 % de ce poste sans perte d'usage.`,
      category: "abonnement",
      severity: "info",
      impact: monthlySubs * 0.2 * 12,
      effort: "faible",
      dueDate: null,
      module: "Abonnements",
      moduleTo: "/subscriptions",
    });
  }

  // ---------- Budget ----------
  if (!i.hasCurrentBudget) {
    push({
      key: "budget_missing",
      title: "Aucun montant budgété sur le mois en cours",
      rationale:
        "Sans plan mensuel, la prévision de trésorerie retombe sur une simple moyenne des 90 derniers jours et l'écart réel / planifié n'est plus mesurable. Saisir les montants par ligne prend quelques minutes et améliore toutes les analyses.",
      category: "budget",
      severity: "warning",
      impact: 0,
      effort: "faible",
      dueDate: null,
      module: "Budgets",
      moduleTo: "/budgets",
    });
  }

  // ---------- Objectifs ----------
  for (const g of i.goals) {
    if (g.status && g.status !== "active") continue;
    if (!g.target_date) continue;
    const remaining = daysBetween(i.today, g.target_date);
    if (remaining < 0) {
      if (g.pct < 100) {
        push({
          key: `goal_overdue_${g.id}`,
          title: `Objectif « ${g.name} » dépassé en date, ${g.pct.toFixed(0)} % atteint`,
          rationale: "L'échéance est passée sans que la cible soit atteinte. Soit la cible est requalifiée, soit l'échéance est repoussée : garder un objectif périmé fausse la lecture globale.",
          category: "objectif",
          severity: "warning",
          impact: 0,
          effort: "faible",
          dueDate: null,
          module: "Objectifs",
          moduleTo: "/goals",
        });
      }
      continue;
    }
    if (remaining <= 120 && g.pct < 60 && !g.inverse) {
      push({
        key: `goal_at_risk_${g.id}`,
        title: `Objectif « ${g.name} » à risque (${g.pct.toFixed(0)} % à ${remaining} j de l'échéance)`,
        rationale: "Le rythme actuel ne permet pas d'atteindre la cible dans le délai. Augmenter l'affectation mensuelle ou revoir la cible.",
        category: "objectif",
        severity: "info",
        impact: 0,
        effort: "moyen",
        dueDate: g.target_date,
        module: "Objectifs",
        moduleTo: "/goals",
      });
    }
  }

  // ---------- Patrimoine ----------
  const deadAssets = i.assets.filter((a) => !a.sold && a.cost > 0 && a.bookValue <= a.cost * 0.05);
  if (deadAssets.length) {
    push({
      key: "assets_fully_depreciated",
      title: `${deadAssets.length} actif(s) totalement amorti(s) encore détenu(s)`,
      rationale: `${deadAssets.slice(0, 3).map((a) => a.name).join(", ")}${deadAssets.length > 3 ? "…" : ""} : valeur nette comptable quasi nulle. Arbitrer entre revente (trésorerie immédiate et plus-value comptable) et conservation pour l'usage.`,
      category: "patrimoine",
      severity: "opportunity",
      impact: 0,
      effort: "moyen",
      dueDate: null,
      module: "Actifs",
      moduleTo: "/assets",
    });
  }

  if (i.cash > 0 && i.monthlyExpense > 0 && i.emergencyMonths > 9 && i.totalDebt === 0) {
    const idle = i.cash - i.monthlyExpense * 6;
    if (idle > 0) {
      push({
        key: "idle_cash",
        title: "Liquidités excédentaires non employées",
        rationale: `Au-delà de six mois de réserve, environ ${Math.round(idle).toLocaleString("fr-FR")} restent improductifs. Les affecter à un projet, un actif ou une épargne rémunérée fait travailler ce capital.`,
        category: "patrimoine",
        severity: "opportunity",
        impact: idle,
        effort: "moyen",
        dueDate: null,
        module: "Projets",
        moduleTo: "/projects",
      });
    }
  }

  // ---------- Exécution ----------
  if (i.overdueTasks >= 3) {
    push({
      key: "tasks_overdue",
      title: `${i.overdueTasks} élément(s) planifié(s) en retard`,
      rationale: "Un arriéré qui grossit décrédibilise le plan : tout replanifier au même endroit vaut mieux que de laisser traîner. Traiter, replanifier ou annuler chaque ligne.",
      category: "execution",
      severity: i.overdueTasks >= 10 ? "warning" : "info",
      impact: 0,
      effort: "faible",
      dueDate: i.today,
      module: "Planification",
      moduleTo: "/planning",
    });
  }

  if (i.habitAdherence != null && i.habitAdherence < 60) {
    push({
      key: "habits_slipping",
      title: `Habitudes tenues à ${i.habitAdherence.toFixed(0)} % sur 30 jours`,
      rationale:
        "Sous 60 %, la routine n'est plus un système mais une intention. Réduire le nombre d'habitudes actives et ancrer chacune sur un créneau fixe donne de meilleurs résultats qu'un plan trop chargé.",
      category: "execution",
      severity: "info",
      impact: 0,
      effort: "faible",
      dueDate: null,
      module: "Planification",
      moduleTo: "/planning",
    });
  }

  if (i.completionRate < 50 && i.overdueTasks > 0) {
    push({
      key: "completion_low",
      title: `Taux de réalisation de ${i.completionRate.toFixed(0)} % sur 30 jours`,
      rationale:
        "Le plan est plus ambitieux que la capacité réelle. Limiter à trois priorités par jour et utiliser la matrice d'Eisenhower pour écarter l'urgent non important.",
      category: "execution",
      severity: "info",
      impact: 0,
      effort: "faible",
      dueDate: null,
      module: "Planification",
      moduleTo: "/planning",
    });
  }

  return out.sort((a, b) => {
    const w = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity];
    if (w !== 0) return w;
    return b.impact - a.impact;
  });
}
