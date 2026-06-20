export function fmtMoney(n: number | null | undefined, currency = "MGA", opts: { compact?: boolean; sign?: boolean } = {}) {
  const v = Number(n ?? 0);
  const abs = Math.abs(v);
  const formatter = new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: opts.compact && abs >= 1000 ? 1 : 0,
    minimumFractionDigits: 0,
    notation: opts.compact ? "compact" : "standard",
  });
  const sign = opts.sign ? (v > 0 ? "+" : v < 0 ? "−" : "") : v < 0 ? "−" : "";
  return `${sign}${formatter.format(Math.abs(v))} ${currency}`;
}

export function fmtNumber(n: number | null | undefined, digits = 0) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number(n ?? 0));
}

export function fmtPct(n: number | null | undefined, digits = 1) {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(Number(n ?? 0))}%`;
}

export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function fmtMonth(d: string | Date) {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" }).format(date);
}

export function monthStart(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}
