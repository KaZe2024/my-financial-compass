import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/stat-card";
import { fmtDate, fmtMoney } from "@/lib/format";
import { useState } from "react";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({ meta: [{ title: "Prix produits — Personal CFO" }] }),
  component: ProductsPage,
});

function ProductsPage() {
  const [search, setSearch] = useState("");

  const products = useQuery({
    queryKey: ["products", search],
    queryFn: async () => {
      let q = supabase.from("products").select("*").order("name").limit(200);
      if (search) q = q.ilike("name", `%${search}%`);
      return (await q).data ?? [];
    },
  });

  const [selected, setSelected] = useState<string | null>(null);

  const prices = useQuery({
    queryKey: ["product_prices", selected],
    enabled: !!selected,
    queryFn: async () => {
      const { data } = await supabase.from("product_prices").select("*").eq("product_id", selected!).order("observed_on", { ascending: false }).limit(100);
      return data ?? [];
    },
  });

  const stats = (() => {
    const arr = (prices.data ?? []).map((p: any) => Number(p.unit_price));
    if (!arr.length) return null;
    return { min: Math.min(...arr), max: Math.max(...arr), avg: arr.reduce((s, x) => s + x, 0) / arr.length };
  })();

  return (
    <div className="space-y-6">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Catalogue</p>
        <h1 className="mt-1 text-2xl font-semibold">Historique des prix</h1>
      </header>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Panel title="Produits">
          <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="mb-2" />
          <ul className="scroll-thin max-h-[520px] space-y-1 overflow-y-auto pr-1">
            {(products.data ?? []).map((p: any) => (
              <li key={p.id}>
                <button onClick={() => setSelected(p.id)} className={`w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted ${selected === p.id ? "bg-muted text-primary" : ""}`}>
                  {p.name} {p.unit ? <span className="text-xs text-muted-foreground">/ {p.unit}</span> : null}
                </button>
              </li>
            ))}
            {(products.data ?? []).length === 0 && <li className="px-2 py-4 text-sm text-muted-foreground">Aucun produit. Créez-en via les listes d'achat.</li>}
          </ul>
        </Panel>

        <Panel title={selected ? "Historique" : "Sélectionnez un produit"}>
          {!selected && <p className="py-10 text-center text-sm text-muted-foreground">Choisissez un produit à gauche.</p>}
          {selected && (
            <>
              {stats && (
                <div className="mb-3 grid grid-cols-3 gap-2 text-sm">
                  <Stat label="Min" value={fmtMoney(stats.min)} />
                  <Stat label="Moy" value={fmtMoney(stats.avg)} />
                  <Stat label="Max" value={fmtMoney(stats.max)} />
                </div>
              )}
              <div className="scroll-thin -mx-4 overflow-x-auto">
                <table className="w-full min-w-[400px] text-sm">
                  <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Fournisseur</th><th className="px-4 py-2 text-right">Prix unit.</th></tr>
                  </thead>
                  <tbody>
                    {(prices.data ?? []).map((p: any) => (
                      <tr key={p.id} className="border-t border-border/60">
                        <td className="num px-4 py-1.5 text-muted-foreground">{fmtDate(p.observed_on)}</td>
                        <td className="px-4 py-1.5">{p.supplier ?? "—"}</td>
                        <td className="num px-4 py-1.5 text-right">{fmtMoney(Number(p.unit_price), p.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-sm border border-border bg-muted/20 p-2"><div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div><div className="num text-sm font-semibold">{value}</div></div>;
}
