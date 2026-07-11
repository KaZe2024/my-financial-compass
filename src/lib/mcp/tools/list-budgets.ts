import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_budgets",
  title: "List budgets",
  description:
    "Retourne l'arborescence budgétaire (nodes + montants planifiés/révisés + dépensé réel par mois) sur la période demandée. Utile pour analyser l'écart budget vs réalisé.",
  inputSchema: {
    from: z.string().optional().describe("Début (YYYY-MM-DD), 1er du mois. Par défaut: début de l'année en cours."),
    to: z.string().optional().describe("Fin (YYYY-MM-DD), 1er du mois. Par défaut: mois en cours."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const now = new Date();
    const start = from ?? `${now.getFullYear()}-01-01`;
    const end = to ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const sb = supabaseForUser(ctx);
    const [nodesR, amountsR, spendR] = await Promise.all([
      sb.from("budget_nodes").select("id, parent_id, name, is_income, kind, archived, sort_order"),
      sb.from("budget_node_amounts").select("node_id, period_month, planned, revised").gte("period_month", start).lte("period_month", end),
      sb.from("v_node_spend").select("node_id, month, spent").gte("month", start).lte("month", end),
    ]);
    if (nodesR.error) return { content: [{ type: "text", text: nodesR.error.message }], isError: true };
    if (amountsR.error) return { content: [{ type: "text", text: amountsR.error.message }], isError: true };
    if (spendR.error) return { content: [{ type: "text", text: spendR.error.message }], isError: true };
    const payload = {
      period: { from: start, to: end },
      nodes: nodesR.data ?? [],
      amounts: amountsR.data ?? [],
      spend: spendR.data ?? [],
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
