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
      const { error } = await supabase.from("profiles").update(form).eq("id", profile.data!.id);
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

      <Panel title="Modules disponibles">
        <p className="text-sm text-muted-foreground">Cette version inclut : Dashboard, Portefeuilles, Transactions, Budgets, Listes d'achat, Prix produits, Dettes, Créances, Projets, Actifs, Objectifs, Snapshots.</p>
        <p className="mt-2 text-sm text-muted-foreground">Le schéma de base de données prend déjà en charge : Factures à émettre, Provisions, Prêts, Abonnements, Salaires, Compteurs (eau/électricité), Devises, Dépréciation/Revalorisation des actifs, Score de santé financière, Simulateur de scénarios, Pièces jointes, Journal d'audit.</p>
      </Panel>
    </div>
  );
}
