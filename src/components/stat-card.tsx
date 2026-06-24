import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export function StatCard({
  label, value, sub, tone, delta, icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "positive" | "negative" | "warning" | "neutral";
  delta?: number | null;
  icon?: ReactNode;
}) {
  const toneClass =
    tone === "positive" ? "text-positive" :
    tone === "negative" ? "text-negative" :
    tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="group relative overflow-hidden rounded-md border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
        {icon && <div className="text-muted-foreground/80">{icon}</div>}
      </div>
      <div className={cn("num mt-3 text-2xl font-semibold leading-tight md:text-[26px]", toneClass)}>{value}</div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <div className="text-muted-foreground">{sub}</div>
        {typeof delta === "number" && (
          <div className={cn("num inline-flex items-center gap-0.5 font-medium", delta >= 0 ? "text-positive" : "text-negative")}>
            {delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {Math.abs(delta).toFixed(1)}%
          </div>
        )}
      </div>
    </div>
  );
}

export function Panel({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-md border border-border bg-card", className)}>
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{title}</h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
