import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Upload, FileSpreadsheet, FileText, Image as ImgIcon } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { toPng } from "html-to-image";
import { fetchAllRows } from "@/lib/fetch-all";

export const Route = createFileRoute("/_authenticated/data")({
  head: () => ({ meta: [{ title: "Données — Personal CFO" }] }),
  component: DataPage,
});

const TABLES = [
  { id: "transactions", label: "Transactions" },
  { id: "wallets", label: "Portefeuilles" },
  { id: "budget_nodes", label: "Budgets · Nodes" },
  { id: "budget_node_amounts", label: "Budgets · Montants" },
  { id: "counterparties", label: "Tiers" },
  { id: "assets", label: "Actifs" },
  { id: "debts", label: "Dettes" },
  { id: "receivables", label: "Créances" },
  { id: "projects", label: "Projets" },
  { id: "financial_goals", label: "Objectifs" },
  { id: "monthly_snapshots", label: "Snapshots" },
  { id: "shopping_lists", label: "Listes d'achat" },
  { id: "shopping_list_items", label: "Lignes d'achat" },
  { id: "products", label: "Produits" },
  { id: "product_prices", label: "Prix produits" },
  { id: "analytical_tags", label: "Tags" },
  { id: "subscriptions", label: "Abonnements" },
  { id: "income_sources", label: "Sources de revenus" },
] as const;

async function fetchAll(table: string): Promise<any[]> {
  const { data, error } = await (supabase as any).from(table).select("*").limit(50000);
  if (error) throw error;
  return data ?? [];
}

/**
 * Build lookup maps for foreign-key labels. Returns a function that rewrites a row:
 * every *_id column that has a known lookup gets a sibling column with the human label,
 * and the *_id column is removed.
 */
async function buildLabelizer() {
  const [walletsR, nodesR, cpsR, projectsR, assetsR, debtsR, recR, tagsR] = await Promise.all([
    supabase.from("wallets").select("id, name"),
    supabase.from("budget_nodes").select("id, name, parent_id"),
    supabase.from("counterparties").select("id, name"),
    supabase.from("projects").select("id, name"),
    supabase.from("assets").select("id, name"),
    supabase.from("debts").select("id, creditor"),
    supabase.from("receivables").select("id, debtor"),
    supabase.from("analytical_tags").select("id, name"),
  ]);
  const wallets = new Map((walletsR.data ?? []).map((r: any) => [r.id, r.name]));
  const cps = new Map((cpsR.data ?? []).map((r: any) => [r.id, r.name]));
  const projects = new Map((projectsR.data ?? []).map((r: any) => [r.id, r.name]));
  const assets = new Map((assetsR.data ?? []).map((r: any) => [r.id, r.name]));
  const debts = new Map((debtsR.data ?? []).map((r: any) => [r.id, r.creditor]));
  const recs = new Map((recR.data ?? []).map((r: any) => [r.id, r.debtor]));
  const tags = new Map((tagsR.data ?? []).map((r: any) => [r.id, r.name]));
  // Budget node: display full path
  const nodesById = new Map((nodesR.data ?? []).map((n: any) => [n.id, n]));
  function nodePath(id: string): string {
    const parts: string[] = [];
    let cur = nodesById.get(id);
    let guard = 0;
    while (cur && guard++ < 20) {
      parts.unshift(cur.name);
      cur = cur.parent_id ? nodesById.get(cur.parent_id) : null;
    }
    return parts.join(" › ");
  }
  const nodeLabelFor = (id: string) => nodePath(id) || id;

  const map: Record<string, Map<string, string> | ((id: string) => string)> = {
    wallet_id: wallets, to_wallet_id: wallets,
    counterparty_id: cps, project_id: projects, asset_id: assets,
    debt_id: debts, receivable_id: recs, tag_id: tags,
    budget_node_id: nodeLabelFor,
  };
  return (rows: any[]) => rows.map((row) => {
    const out: any = { ...row };
    for (const [col, lookup] of Object.entries(map)) {
      if (col in out && out[col] != null) {
        const val = typeof lookup === "function" ? lookup(out[col]) : lookup.get(out[col]) ?? out[col];
        // Drop the technical id, keep the label under a friendly column name
        const nice = col.replace(/_id$/, "").replace(/^([a-z])/, (m) => m.toUpperCase());
        out[nice] = val;
        delete out[col];
      }
    }
    // Drop noisy internal ids too
    delete out.user_id;
    return out;
  });
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DataPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Système</p>
        <h1 className="mt-1 text-2xl font-semibold">Import / Export</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sauvegarde et restauration des données. Excel par module ou complet, PDF, PNG.</p>
      </header>

      <Tabs defaultValue="export">
        <TabsList>
          <TabsTrigger value="export"><Download className="mr-2 h-4 w-4" /> Export</TabsTrigger>
          <TabsTrigger value="import"><Upload className="mr-2 h-4 w-4" /> Import</TabsTrigger>
          <TabsTrigger value="capture"><ImgIcon className="mr-2 h-4 w-4" /> Capture</TabsTrigger>
        </TabsList>

        <TabsContent value="export" className="space-y-4">
          <Panel title="Excel — Multi-feuilles (tout)">
            <p className="mb-3 text-xs text-muted-foreground">Un fichier .xlsx avec une feuille par module. Les identifiants techniques sont remplacés par les libellés (portefeuille, catégorie, tiers…).</p>
            <Button onClick={async () => {
              try {
                toast.info("Préparation du fichier…");
                const labelize = await buildLabelizer();
                const wb = XLSX.utils.book_new();
                for (const t of TABLES) {
                  const rows = labelize(await fetchAll(t.id));
                  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ info: "vide" }]);
                  XLSX.utils.book_append_sheet(wb, ws, t.label.slice(0, 31));
                }
                const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
                downloadBlob(new Blob([out], { type: "application/octet-stream" }), `personal-cfo-${new Date().toISOString().slice(0, 10)}.xlsx`);
                toast.success("Export généré");
              } catch (e: any) { toast.error(e.message); }
            }}><FileSpreadsheet className="mr-2 h-4 w-4" /> Tout exporter</Button>
          </Panel>

          <Panel title="Excel — Par module">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {TABLES.map((t) => (
                <Button key={t.id} variant="outline" onClick={async () => {
                  try {
                    const labelize = await buildLabelizer();
                    const rows = labelize(await fetchAll(t.id));
                    if (!rows.length) { toast.info("Aucune donnée"); return; }
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), t.label.slice(0, 31));
                    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
                    downloadBlob(new Blob([out], { type: "application/octet-stream" }), `${t.id}-${new Date().toISOString().slice(0, 10)}.xlsx`);
                    toast.success(`${t.label} exporté`);
                  } catch (e: any) { toast.error(e.message); }
                }}>{t.label}</Button>
              ))}
            </div>
          </Panel>

          <Panel title="CSV — Par module (libellés lisibles)">
            <p className="mb-3 text-xs text-muted-foreground">Un fichier .csv par module, avec libellés à la place des identifiants techniques. Idéal pour éditer puis réimporter.</p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {TABLES.map((t) => (
                <Button key={t.id} variant="outline" onClick={async () => {
                  try {
                    const labelize = await buildLabelizer();
                    const rows = labelize(await fetchAll(t.id));
                    if (!rows.length) { toast.info("Aucune donnée"); return; }
                    const ws = XLSX.utils.json_to_sheet(rows);
                    const csv = XLSX.utils.sheet_to_csv(ws);
                    downloadBlob(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }), `${t.id}-${new Date().toISOString().slice(0, 10)}.csv`);
                    toast.success(`${t.label} CSV exporté`);
                  } catch (e: any) { toast.error(e.message); }
                }}>{t.label}</Button>
              ))}
            </div>
          </Panel>

          <Panel title="PDF — Récap rapide">
            <p className="mb-3 text-xs text-muted-foreground">Génère un PDF listant le compte de chaque module.</p>
            <Button variant="outline" onClick={async () => {
              try {
                const pdf = new jsPDF();
                pdf.setFontSize(16); pdf.text("Personal CFO — Récapitulatif", 14, 18);
                pdf.setFontSize(10); pdf.text(new Date().toLocaleString("fr-FR"), 14, 26);
                let y = 38;
                for (const t of TABLES) {
                  const rows = await fetchAll(t.id);
                  pdf.text(`${t.label} : ${rows.length} entrées`, 14, y);
                  y += 7; if (y > 280) { pdf.addPage(); y = 18; }
                }
                pdf.save(`personal-cfo-${new Date().toISOString().slice(0, 10)}.pdf`);
              } catch (e: any) { toast.error(e.message); }
            }}><FileText className="mr-2 h-4 w-4" /> PDF récap</Button>
          </Panel>
        </TabsContent>

        <TabsContent value="import" className="space-y-4">
          <Panel title="Importer Excel">
            <p className="mb-3 text-xs text-muted-foreground">Sélectionnez un module puis chargez un fichier .xlsx. Les colonnes doivent matcher la structure de la base. Conseil : exportez d'abord pour obtenir le modèle.</p>
            <ImportForm />
          </Panel>
        </TabsContent>

        <TabsContent value="capture" className="space-y-4">
          <Panel title="Capture PNG de la page">
            <p className="mb-3 text-xs text-muted-foreground">Ouvrez la page à capturer dans un autre onglet puis utilisez la capture du navigateur, ou exportez le dashboard via le bouton ci-dessous (capture du body courant).</p>
            <Button variant="outline" onClick={async () => {
              try {
                const node = document.body;
                const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 1 });
                const a = document.createElement("a");
                a.href = dataUrl; a.download = `capture-${Date.now()}.png`; a.click();
              } catch (e: any) { toast.error(e.message); }
            }}><ImgIcon className="mr-2 h-4 w-4" /> Capturer cette page</Button>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}

async function buildDelabelizer() {
  const [walletsR, nodesR, cpsR, projectsR, assetsR, debtsR, recR, tagsR] = await Promise.all([
    supabase.from("wallets").select("id, name"),
    supabase.from("budget_nodes").select("id, name, parent_id"),
    supabase.from("counterparties").select("id, name"),
    supabase.from("projects").select("id, name"),
    supabase.from("assets").select("id, name"),
    supabase.from("debts").select("id, creditor"),
    supabase.from("receivables").select("id, debtor"),
    supabase.from("analytical_tags").select("id, name"),
  ]);
  const norm = (s: any) => String(s ?? "").trim().toLowerCase();
  const idx = (rows: any[], key: string) => {
    const m = new Map<string, string>();
    for (const r of rows ?? []) m.set(norm(r[key]), r.id);
    return m;
  };
  const wallets = idx(walletsR.data ?? [], "name");
  const cps = idx(cpsR.data ?? [], "name");
  const projects = idx(projectsR.data ?? [], "name");
  const assets = idx(assetsR.data ?? [], "name");
  const debts = idx(debtsR.data ?? [], "creditor");
  const recs = idx(recR.data ?? [], "debtor");
  const tags = idx(tagsR.data ?? [], "name");
  const nodesById = new Map((nodesR.data ?? []).map((n: any) => [n.id, n]));
  const nodePath = (id: string): string => {
    const parts: string[] = []; let cur: any = nodesById.get(id); let g = 0;
    while (cur && g++ < 20) { parts.unshift(cur.name); cur = cur.parent_id ? nodesById.get(cur.parent_id) : null; }
    return parts.join(" › ");
  };
  const nodesByPath = new Map<string, string>();
  const nodesByName = new Map<string, string>();
  for (const n of (nodesR.data ?? []) as any[]) {
    nodesByPath.set(norm(nodePath(n.id)), n.id);
    nodesByName.set(norm(n.name), n.id);
  }
  const resolveNode = (v: any) => nodesByPath.get(norm(v)) ?? nodesByName.get(norm(String(v).split("›").pop())) ?? null;

  const label2col: Record<string, { col: string; resolve: (v: any) => string | null }> = {
    wallet: { col: "wallet_id", resolve: (v) => wallets.get(norm(v)) ?? null },
    to_wallet: { col: "to_wallet_id", resolve: (v) => wallets.get(norm(v)) ?? null },
    counterparty: { col: "counterparty_id", resolve: (v) => cps.get(norm(v)) ?? null },
    project: { col: "project_id", resolve: (v) => projects.get(norm(v)) ?? null },
    asset: { col: "asset_id", resolve: (v) => assets.get(norm(v)) ?? null },
    debt: { col: "debt_id", resolve: (v) => debts.get(norm(v)) ?? null },
    receivable: { col: "receivable_id", resolve: (v) => recs.get(norm(v)) ?? null },
    tag: { col: "tag_id", resolve: (v) => tags.get(norm(v)) ?? null },
    budget_node: { col: "budget_node_id", resolve: resolveNode },
  };

  return (row: any) => {
    const out: any = { ...row };
    for (const k of Object.keys(row)) {
      const key = k.toLowerCase();
      const hit = label2col[key];
      if (!hit) continue;
      const val = row[k];
      if (val == null || val === "") { delete out[k]; continue; }
      const isUuid = typeof val === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
      out[hit.col] = isUuid ? val : hit.resolve(val);
      if (k !== hit.col) delete out[k];
    }
    return out;
  };
}

function ImportForm() {
  const [table, setTable] = useState<string>("transactions");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label>Module</Label>
          <select value={table} onChange={(e) => setTable(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            {TABLES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Fichier .xlsx / .csv</Label>
          <Input type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={async (e) => {
            const file = e.target.files?.[0]; if (!file) return;
            setBusy(true);
            try {
              const buf = await file.arrayBuffer();
              const wb = XLSX.read(buf, { type: "array" });
              const ws = wb.Sheets[wb.SheetNames[0]];
              const rows = XLSX.utils.sheet_to_json<any>(ws);
              const { data: u } = await supabase.auth.getUser();
              const delabel = await buildDelabelizer();
              const cleaned = rows.map((r) => {
                const o: any = delabel(r);
                o.user_id = o.user_id ?? u.user!.id;
                if (!o.id) delete o.id;
                delete o.created_at; delete o.updated_at;
                for (const k of Object.keys(o)) if (o[k] === "" || o[k] === null) delete o[k];
                return o;
              });
              const { error } = await (supabase as any).from(table).insert(cleaned);
              if (error) throw error;
              toast.success(`${cleaned.length} lignes importées dans ${table}`);
            } catch (err: any) { toast.error(err.message); }
            finally { setBusy(false); (e.target as HTMLInputElement).value = ""; }
          }} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Les colonnes libellées (Wallet, Budget_node, Counterparty, …) sont converties automatiquement en identifiants. Les colonnes <code>created_at</code>/<code>updated_at</code> et les <code>id</code> vides sont régénérés. Un <code>user_id</code> manquant prend l'utilisateur courant.</p>
    </div>
  );
}
