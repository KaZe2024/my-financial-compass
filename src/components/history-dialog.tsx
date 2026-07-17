import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDate, fmtMoney } from "@/lib/format";
import { History } from "lucide-react";
import { fetchAllRows } from "@/lib/fetch-all";

/**
 * Historique des transactions liées à une entité (actif, dette, créance, tiers).
 * Filtre par colonne dédiée (asset_id / debt_id / receivable_id / counterparty_id)
 * ET par (source_kind, source_id) pour attraper les mouvements liés côté source.
 */
export function HistoryDialog({
  open,
  onOpenChange,
  title,
  column,
  sourceKind,
  entityId,
  balanceMode,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  column: "asset_id" | "debt_id" | "receivable_id" | "counterparty_id";
  sourceKind?: "asset" | "debt" | "receivable" | "counterparty" | "provision" | "subscription";
  entityId: string;
  balanceMode?: "asset";
}) {
  // Force asset balance mode when auditing an asset (default expectation).
  const mode: "asset" | "default" = balanceMode ?? (column === "asset_id" ? "asset" : "default");
  const q = useQuery({
    queryKey: ["history", column, entityId, sourceKind ?? ""],
    enabled: open && !!entityId,
    queryFn: async () => {
      const filters: string[] = [`${column}.eq.${entityId}`];
      if (sourceKind) filters.push(`and(source_kind.eq.${sourceKind},source_id.eq.${entityId})`);
      return await fetchAllRows<any>((from, to) =>
        supabase
          .from("transactions")
          .select("id, occurred_on, type, description, amount, base_amount, currency, exchange_rate, wallet_id, wallets:wallet_id(name), notes")
          .or(filters.join(","))
          .order("occurred_on", { ascending: false })
          .range(from, to),
      );
    },
  });

  const rows = q.data ?? [];
  const isAmortRow = (r: any) => {
    const marker = `${r.description ?? ""} ${r.notes ?? ""}`.toLowerCase();
    return marker.includes("amort");
  };
  const cashSign = (type: string, mga: number) => {
    if (type === "transfer") return 0;
    if (["income","asset_sale","adjustment","enveloppe_emprunt","dette"].includes(type)) return mga;
    return -mga;
  };
  const rowSign = (r: any, mga: number) => {
    if (mode === "asset") {
      // Convention actif : achat +, amortissement −, vente +.
      if (r.type === "asset_purchase") return mga;
      if (r.type === "asset_sale") return mga;
      if (r.type === "expense" && isAmortRow(r)) return -mga;
      return cashSign(r.type, mga);
    }
    return cashSign(r.type, mga);
  };
  let balanceLabel = "Net";
  let totalMga = 0;
  if (mode === "asset") {
    let purchases = 0, deps = 0, sales = 0;
    let sold = false;
    for (const r of rows) {
      const mga = Number(r.base_amount ?? Number(r.amount) * Number(r.exchange_rate ?? 1));
      if (r.type === "asset_purchase") purchases += Math.abs(mga);
      else if (r.type === "asset_sale") { sales += Math.abs(mga); sold = true; }
      else if (r.type === "expense" && isAmortRow(r)) deps += Math.abs(mga);
    }
    if (sold) {
      totalMga = sales - (purchases - deps); // PV/MV de revente
      balanceLabel = "Solde (PV/MV revente)";
    } else {
      totalMga = purchases - deps; // VNC
      balanceLabel = "Solde (VNC)";
    }
  } else {
    totalMga = rows.reduce((s: number, r: any) => {
      const mga = Number(r.base_amount ?? Number(r.amount) * Number(r.exchange_rate ?? 1));
      return s + cashSign(r.type, mga);
    }, 0);
  }


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><History className="h-4 w-4" /> {title}</DialogTitle>
        </DialogHeader>
        <div className="scroll-thin max-h-[60vh] overflow-y-auto">
          {q.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Chargement…</p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Aucun mouvement lié.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Description</th>
                  <th className="px-2 py-2">Portefeuille</th>
                  <th className="px-2 py-2 text-right">Montant</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => {
                  const mga = Number(r.base_amount ?? Number(r.amount) * Number(r.exchange_rate ?? 1));
                  const signed = cashSign(r.type, mga);
                  const isIn = signed > 0;
                  return (
                    <tr key={r.id} className="border-t border-border/60">
                      <td className="num px-2 py-1.5 text-muted-foreground whitespace-nowrap">{fmtDate(r.occurred_on)}</td>
                      <td className="px-2 py-1.5"><span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase">{r.type}</span></td>
                      <td className="px-2 py-1.5">{r.description}{r.notes ? <div className="text-[10px] text-muted-foreground">{r.notes}</div> : null}</td>
                      <td className="px-2 py-1.5 text-xs text-muted-foreground">{r.wallets?.name ?? "—"}</td>
                      <td className={`num px-2 py-1.5 text-right whitespace-nowrap ${signed === 0 ? "" : isIn ? "text-positive" : "text-negative"}`}>
                        {fmtMoney(signed, r.currency ?? "MGA", { sign: true })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <td colSpan={4} className="px-2 py-2 text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Net</td>
                  <td className={`num px-2 py-2 text-right font-semibold ${totalMga >= 0 ? "text-positive" : "text-negative"}`}>{fmtMoney(totalMga, "MGA", { sign: true })}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
