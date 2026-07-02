export type PeriodPreset = "ytd" | "month" | "quarter" | "semester" | "year" | "ltm" | "all_time" | "custom";

export type Period = { from: Date; to: Date; label: string; preset: PeriodPreset };

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function startOfYear(d: Date) { return new Date(d.getFullYear(), 0, 1); }
function endOfYear(d: Date) { return new Date(d.getFullYear(), 11, 31); }
function addMonths(d: Date, n: number) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }

export function resolvePeriod(preset: PeriodPreset, ref: Date = new Date(), custom?: { from?: string; to?: string }): Period {
  const today = new Date();
  switch (preset) {
    case "ytd":
      return { preset, from: startOfYear(today), to: today, label: "YTD" };
    case "month":
      return { preset, from: startOfMonth(ref), to: endOfMonth(ref), label: "Mois" };
    case "quarter": {
      const q = Math.floor(ref.getMonth() / 3);
      const from = new Date(ref.getFullYear(), q * 3, 1);
      const to = new Date(ref.getFullYear(), q * 3 + 3, 0);
      return { preset, from, to, label: "Trimestre" };
    }
    case "semester": {
      const s = ref.getMonth() < 6 ? 0 : 6;
      const from = new Date(ref.getFullYear(), s, 1);
      const to = new Date(ref.getFullYear(), s + 6, 0);
      return { preset, from, to, label: "Semestre" };
    }
    case "year":
      return { preset, from: startOfYear(ref), to: endOfYear(ref), label: String(ref.getFullYear()) };
    case "ltm":
      return { preset, from: addMonths(today, -12), to: today, label: "12 derniers mois" };
    case "all_time":
      return { preset, from: new Date(1970, 0, 1), to: today, label: "Depuis toujours" };
    case "custom": {
      const from = custom?.from ? new Date(custom.from) : startOfYear(today);
      const to = custom?.to ? new Date(custom.to) : today;
      return { preset, from, to, label: "Plage" };
    }
  }
}

export function isoDate(d: Date) { return d.toISOString().slice(0, 10); }
