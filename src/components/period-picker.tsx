import { useState } from "react";
import type { PeriodPreset } from "@/lib/period";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";

type Props = {
  preset: PeriodPreset;
  onPresetChange: (p: PeriodPreset) => void;
  custom: { from: string; to: string };
  onCustomChange: (c: { from: string; to: string }) => void;
  presets?: PeriodPreset[];
};

const LABELS: Record<PeriodPreset, string> = {
  ytd: "YTD (Year to date)",
  month: "Mois en cours",
  quarter: "Trimestre en cours",
  semester: "Semestre en cours",
  year: "Année en cours",
  ltm: "LTM (12 derniers mois)",
  all_time: "Depuis toujours",
  custom: "Plage de dates",
};

export function PeriodPicker({ preset, onPresetChange, custom, onCustomChange, presets }: Props) {
  const opts = presets ?? (["ytd", "month", "year", "ltm", "all_time", "custom"] as PeriodPreset[]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={preset} onValueChange={(v) => onPresetChange(v as PeriodPreset)}>
        <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {opts.map((p) => <SelectItem key={p} value={p}>{LABELS[p]}</SelectItem>)}
        </SelectContent>
      </Select>
      {preset === "custom" && (
        <>
          <DatePicker value={custom.from} onChange={(__v) => onCustomChange({ ...custom, from: __v })} className="h-8 w-36 text-xs" />
          <span className="text-xs text-muted-foreground">→</span>
          <DatePicker value={custom.to} onChange={(__v) => onCustomChange({ ...custom, to: __v })} className="h-8 w-36 text-xs" />
        </>
      )}
    </div>
  );
}

export function usePeriodState(initial: PeriodPreset = "ytd") {
  const [preset, setPreset] = useState<PeriodPreset>(initial);
  const [custom, setCustom] = useState({ from: "", to: "" });
  return { preset, setPreset, custom, setCustom };
}
