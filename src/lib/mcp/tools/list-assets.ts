import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_assets",
  title: "List assets",
  description:
    "Liste les actifs (immobilisations) avec leur type, coût d'acquisition, date, durée d'amortissement, valeur de marché et notes. Inclut les événements récents (amortissements, réévaluations).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_i, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = supabaseForUser(ctx);
    const [assetsR, typesR, eventsR] = await Promise.all([
      sb.from("assets").select("*").order("acquired_on", { ascending: false }),
      sb.from("asset_types").select("id, name, useful_life_years"),
      sb.from("asset_events").select("id, asset_id, type, amount, event_date, notes").order("event_date", { ascending: false }).limit(500),
    ]);
    if (assetsR.error) return { content: [{ type: "text", text: assetsR.error.message }], isError: true };
    const payload = { assets: assetsR.data ?? [], asset_types: typesR.data ?? [], recent_events: eventsR.data ?? [] };
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload };
  },
});
