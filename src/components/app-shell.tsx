import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  Activity, Wallet, ArrowLeftRight, PieChart, ShoppingCart, Package,
  HandCoins, Receipt, Target, Landmark, CalendarRange, Settings, Menu, LogOut, Sparkles, BarChart3, Users, TrendingUp, Database,
  Bell, CalendarDays, Repeat, Wallet2, Refrigerator,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const NAV = [
  { group: "Vue d'ensemble", items: [
    { to: "/dashboard", label: "Dashboard", icon: Activity },
    { to: "/ai", label: "Assistant CFO", icon: Sparkles },
    { to: "/alerts", label: "Alertes", icon: Bell },
    { to: "/calendar", label: "Calendrier", icon: CalendarDays },
  ]},
  { group: "Trésorerie", items: [
    { to: "/wallets", label: "Portefeuilles", icon: Wallet },
    { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
    { to: "/shopping", label: "Listes d'achat", icon: ShoppingCart },
    { to: "/subscriptions", label: "Abonnements", icon: Repeat },
    { to: "/provisions", label: "Provisions", icon: Wallet2 },
  ]},
  { group: "Planification", items: [
    { to: "/budgets", label: "Budgets", icon: PieChart },
    { to: "/projects", label: "Projets", icon: Sparkles },
    { to: "/goals", label: "Objectifs", icon: Target },
  ]},
  { group: "Patrimoine", items: [
    { to: "/assets", label: "Actifs", icon: Landmark },
    { to: "/snapshots", label: "Snapshots", icon: BarChart3 },
    { to: "/products", label: "Prix produits", icon: Package },
  ]},
  { group: "Tiers", items: [
    { to: "/counterparties", label: "Comptes de tiers", icon: Users },
    { to: "/debts", label: "Dettes", icon: Receipt },
    { to: "/receivables", label: "Créances", icon: HandCoins },
  ]},
  { group: "Marchés", items: [
    { to: "/fx", label: "Taux de change", icon: TrendingUp },
  ]},
  { group: "Système", items: [
    { to: "/data", label: "Import / Export", icon: Database },
    { to: "/settings", label: "Paramètres", icon: Settings },
  ]},
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 transform border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform md:relative md:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full"
      )}>
        <Sidebar onNav={() => setOpen(false)} />
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={() => setOpen(false)} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="flex-1 overflow-x-hidden">
          <div className="mx-auto w-full max-w-[1600px] px-4 py-5 md:px-8 md:py-7">{children}</div>
        </main>
      </div>
    </div>
  );
}

function Sidebar({ onNav }: { onNav: () => void }) {
  const pathname = useRouterState({ select: s => s.location.pathname });
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b border-sidebar-border px-5 py-4">
        <div className="grid h-8 w-8 place-items-center rounded-sm bg-primary text-primary-foreground"><Activity className="h-4 w-4" /></div>
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">PERSONAL</div>
          <div className="text-sm font-semibold leading-none">CFO Terminal</div>
        </div>
      </div>
      <nav className="scroll-thin flex-1 overflow-y-auto px-2 py-3">
        {NAV.map(group => (
          <div key={group.group} className="mb-4">
            <div className="px-3 pb-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">{group.group}</div>
            {group.items.map(it => {
              const active = pathname === it.to;
              const Icon = it.icon;
              return (
                <Link key={it.to} to={it.to} onClick={onNav} className={cn(
                  "flex items-center gap-2.5 rounded-sm px-3 py-1.5 text-sm transition-colors",
                  active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                )}>
                  <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                  {it.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <SignOut />
      </div>
    </div>
  );
}

function SignOut() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return (
    <button onClick={async () => {
      await qc.cancelQueries();
      qc.clear();
      await supabase.auth.signOut();
      toast.success("Déconnecté");
      navigate({ to: "/auth", replace: true });
    }} className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/60">
      <LogOut className="h-4 w-4 text-muted-foreground" /> Se déconnecter
    </button>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const now = new Date();
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-background/85 px-4 py-2.5 backdrop-blur md:px-8">
      <div className="flex items-center gap-3">
        <button onClick={onMenu} className="grid h-8 w-8 place-items-center rounded-sm border border-border md:hidden">
          <Menu className="h-4 w-4" />
        </button>
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {now.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
        </div>
      </div>
      <CalendarRange className="hidden h-4 w-4 text-muted-foreground md:block" />
    </header>
  );
}
