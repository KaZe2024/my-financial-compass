import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/signup-open")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { count, error } = await supabaseAdmin
          .from("profiles")
          .select("id", { count: "exact", head: true });
        if (error) {
          return new Response(JSON.stringify({ open: false }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ open: (count ?? 0) === 0 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
