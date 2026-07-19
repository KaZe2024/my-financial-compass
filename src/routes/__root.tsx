import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/lib/theme";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">Error 404</p>
        <h1 className="mt-3 text-3xl font-semibold text-foreground">Page introuvable</h1>
        <p className="mt-2 text-sm text-muted-foreground">Cette route n'existe pas dans votre Personal CFO.</p>
        <a href="/" className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Retour à l'accueil</a>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => { reportLovableError(error, { boundary: "tanstack_root_error_component" }); }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-xs font-mono uppercase tracking-[0.3em] text-destructive">System error</p>
        <h1 className="mt-3 text-xl font-semibold">Le tableau de bord n'a pas pu se charger.</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Réessayer</button>
          <a href="/" className="rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground">Accueil</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Personal CFO — ERP financier personnel" },
      { name: "description", content: "ERP financier personnel : trésorerie, budget, patrimoine, actifs, projets, investissements et dettes." },
      { name: "theme-color", content: "#0a0e1a" },
      { property: "og:title", content: "Personal CFO — ERP financier personnel" },
      { name: "twitter:title", content: "Personal CFO — ERP financier personnel" },
      { property: "og:description", content: "ERP financier personnel : trésorerie, budget, patrimoine, actifs, projets, investissements et dettes." },
      { name: "twitter:description", content: "ERP financier personnel : trésorerie, budget, patrimoine, actifs, projets, investissements et dettes." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/0f8edf18-9d90-4681-a335-287ba85e623b/id-preview-68d3273b--8bdfd52f-7af7-43df-92b6-e3fcc193551f.lovable.app-1782450909322.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/0f8edf18-9d90-4681-a335-287ba85e623b/id-preview-68d3273b--8bdfd52f-7af7-43df-92b6-e3fcc193551f.lovable.app-1782450909322.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <head><HeadContent /></head>
      <body className="dark min-h-screen bg-background text-foreground antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Outlet />
        <Toaster richColors position="top-right" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
