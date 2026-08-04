import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabaseOffline as supabase } from "@/lib/offline/client";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/dashboard" });
    throw redirect({ to: "/auth" });
  },
  component: () => null,
});
