import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { profileQO } from "@/lib/queries";
import { toast } from "sonner";
import { AVAILABLE_THEMES, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Paramètres — Personal CFO" }] }),
  component: SettingsPage,
});

const CURRENCIES = ["MGA","EUR","USD","GBP","CHF","CAD","AUD","JPY","CNY"];

function SettingsPage() {
  const qc = useQueryClient();
  const profile = useQuery(profileQO);
  const [form, setForm] = useState({ full_name: "", base_currency: "MGA", locale: "fr-FR" });

  useEffect(() => {
    if (profile.data) setForm({
      full_name: profile.data.full_name ?? "",
      base_currency: profile.data.base_currency,
      locale: profile.data.locale,
    });
  }, [profile.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Non authentifié");
      const payload = { id: profile.data?.id ?? u.user.id, ...form };
      const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Préférences enregistrées"); qc.invalidateQueries({ queryKey: ["profile"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Système</p>
        <h1 className="mt-1 text-2xl font-semibold">Paramètres</h1>
      </header>

      <Panel title="Profil propriétaire">
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="grid max-w-xl gap-3">
          <div className="space-y-1"><Label>Nom complet</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Devise de base</Label>
              <Select value={form.base_currency} onValueChange={(v) => setForm({ ...form, base_currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Locale</Label>
              <Select value={form.locale} onValueChange={(v) => setForm({ ...form, locale: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["fr-FR","en-US"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <Button type="submit" className="w-fit" disabled={save.isPending}>Enregistrer</Button>
        </form>
      </Panel>

      <Panel title="Apparence · Thème">
        <p className="mb-3 text-sm text-muted-foreground">Choisissez le thème qui offre la meilleure lisibilité pour vous. La sélection est enregistrée sur cet appareil.</p>
        <ThemePicker />
      </Panel>

      <Panel title="Traçabilité">
        <p className="text-sm text-muted-foreground">Toutes les créations, modifications, suppressions et archivages importants (transactions, actifs, dettes, créances, projets, objectifs, produits) sont enregistrés.</p>
        <a href="/audit" className="mt-3 inline-flex items-center gap-2 rounded-sm border border-border bg-muted/30 px-3 py-1.5 text-sm hover:bg-muted">
          Ouvrir le journal d'audit →
        </a>
      </Panel>

      <Panel title="Modules disponibles">
        <p className="text-sm text-muted-foreground">Cette version inclut : Dashboard, Portefeuilles, Transactions, Budgets, Listes d'achat, Prix produits, Dettes, Créances, Projets, Actifs, Objectifs, Snapshots, Journal d'audit.</p>
      </Panel>
    </div>
  );
}

function ThemePicker() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {AVAILABLE_THEMES.map((t) => {
        const active = theme === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTheme(t.id)}
            className={cn(
              "flex items-start justify-between gap-3 rounded-md border p-3 text-left transition-colors",
              active ? "border-primary bg-primary/10" : "border-border bg-surface hover:bg-surface-2"
            )}
          >
            <div>
              <div className="text-sm font-semibold text-foreground">{t.label}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{t.description}</div>
            </div>
            <span className={cn(
              "mt-0.5 h-4 w-4 shrink-0 rounded-full border-2",
              active ? "border-primary bg-primary" : "border-border"
            )} />
          </button>
        );
      })}
    </div>
  );
}
