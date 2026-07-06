import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { buildFinancialSnapshot } from "@/lib/ai-snapshot.server";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_financial_snapshot",
  title: "Get financial snapshot",
  description:
    "Retourne un instantané financier complet du foyer (patrimoine net, revenus, dépenses, portefeuilles, dettes, objectifs, provisions, projets) en Markdown, devise de référence MGA.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    try {
      const snapshot = await buildFinancialSnapshot(supabaseForUser(ctx) as never);
      return { content: [{ type: "text", text: snapshot }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Erreur: ${(e as Error).message}` }],
        isError: true,
      };
    }
  },
});
