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
  name: "list_transactions",
  title: "List transactions",
  description:
    "Liste les transactions de l'utilisateur, avec filtres optionnels par date, type et portefeuille. Triées par date décroissante.",
  inputSchema: {
    from: z.string().optional().describe("Date de début ISO (YYYY-MM-DD)"),
    to: z.string().optional().describe("Date de fin ISO (YYYY-MM-DD)"),
    type: z.enum(["income", "expense", "transfer"]).optional(),
    wallet_id: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(500).default(100),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, type, wallet_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = supabaseForUser(ctx)
      .from("transactions")
      .select("id, occurred_on, type, amount, base_amount, currency, wallet_id, to_wallet_id, description, node_id, counterparty_id")
      .order("occurred_on", { ascending: false })
      .limit(limit);
    if (from) q = q.gte("occurred_on", from);
    if (to) q = q.lte("occurred_on", to);
    if (type) q = q.eq("type", type);
    if (wallet_id) q = q.eq("wallet_id", wallet_id);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { transactions: data ?? [] },
    };
  },
});
