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
  name: "create_transaction",
  title: "Create transaction",
  description: "Crée une nouvelle transaction (revenu, dépense ou transfert) dans le portefeuille indiqué.",
  inputSchema: {
    type: z.enum(["income", "expense", "transfer"]),
    wallet_id: z.string().uuid().describe("Portefeuille source"),
    amount: z.number().positive(),
    currency: z.string().min(3).max(3).describe("Code devise ISO, ex: MGA, EUR"),
    occurred_on: z.string().describe("Date ISO YYYY-MM-DD"),
    description: z.string().optional(),
    to_wallet_id: z.string().uuid().optional().describe("Requis pour type=transfer"),
    node_id: z.string().uuid().optional().describe("Poste budgétaire"),
    counterparty_id: z.string().uuid().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    if (input.type === "transfer" && !input.to_wallet_id) {
      return { content: [{ type: "text", text: "to_wallet_id requis pour un transfert" }], isError: true };
    }
    const { data, error } = await supabaseForUser(ctx)
      .from("transactions")
      .insert({ ...input, user_id: ctx.getUserId() })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Transaction créée: ${data.id}` }],
      structuredContent: { transaction: data },
    };
  },
});
