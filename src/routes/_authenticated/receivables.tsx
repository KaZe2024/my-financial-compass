import { createFileRoute } from "@tanstack/react-router";
import { ObligationsPage } from "./debts";

export const Route = createFileRoute("/_authenticated/receivables")({
  head: () => ({ meta: [{ title: "Créances — Personal CFO" }] }),
  component: () => <ObligationsPage table="receivables" partyLabel="Débiteur" partyField="debtor" title="Créances" subtitle="Tiers" tone="positive" />,
});
