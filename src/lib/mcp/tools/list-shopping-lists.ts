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
  name: "list_shopping_lists",
  title: "List shopping lists",
  description:
    "Liste les listes d'achats (courses) avec leurs items, quantités, prix unitaires et magasin. Utile pour analyser les dépenses par produit.",
  inputSchema: {
    include_items: z.boolean().default(true).describe("Inclure la ligne détaillée des items."),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ include_items, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = supabaseForUser(ctx);
    const { data: lists, error } = await sb
      .from("shopping_lists")
      .select("*")
      .order("occurred_on", { ascending: false })
      .limit(limit);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    let items: unknown[] = [];
    if (include_items && lists && lists.length > 0) {
      const ids = lists.map((l) => l.id);
      const { data: itemsData, error: iErr } = await sb
        .from("shopping_list_items")
        .select("*")
        .in("list_id", ids);
      if (iErr) return { content: [{ type: "text", text: iErr.message }], isError: true };
      items = itemsData ?? [];
    }
    const payload = { lists: lists ?? [], items };
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload };
  },
});
