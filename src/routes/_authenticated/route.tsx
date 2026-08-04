import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabaseOffline as supabase } from "@/lib/offline/client";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Protected,
});

function Protected() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
