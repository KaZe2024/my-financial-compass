import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Professional date picker. Stores/returns ISO `YYYY-MM-DD` (empty string when cleared).
 * Displays as `DD/MM/YYYY`. Includes month/year selectors that auto-clamp the day
 * to the last valid day of the selected month (e.g. Feb → 28/29, Apr → 30).
 */
function parseISO(v: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? "");
  if (!m) return undefined;
  const y = +m[1], mo = +m[2], d = +m[3];
  const last = new Date(y, mo, 0).getDate();
  const day = Math.min(d, last);
  const dt = new Date(y, mo - 1, day);
  return isNaN(dt.getTime()) ? undefined : dt;
}
function toISO(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}
function toDMY(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
function parseDMY(s: string): string | null {
  const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(s.trim());
  if (!m) return null;
  let d = +m[1], mo = +m[2], y = +m[3];
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1) return null;
  const last = new Date(y, mo, 0).getDate();
  d = Math.min(d, last);
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  inputClassName?: string;
}

export function DatePicker({
  value,
  onChange,
  className,
  placeholder = "jj/mm/aaaa",
  id,
  required,
  disabled,
  inputClassName,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(() => toDMY(value));
  React.useEffect(() => setDraft(toDMY(value)), [value]);

  const selected = parseISO(value);

  function commitText(s: string) {
    if (!s.trim()) { onChange(""); return; }
    const iso = parseDMY(s);
    if (iso) { onChange(iso); setDraft(toDMY(iso)); }
    else setDraft(toDMY(value));
  }

  return (
    <div className={cn("relative flex items-center", className)}>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        value={draft}
        required={required}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          const iso = parseDMY(next);
          if (iso) onChange(iso);
          else if (!next.trim()) onChange("");
        }}
        onBlur={() => commitText(draft)}
        className={cn("pr-9", inputClassName)}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            className="absolute right-0.5 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Ouvrir le calendrier"
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            captionLayout="dropdown"
            selected={selected}
            defaultMonth={selected ?? new Date()}
            onSelect={(d) => {
              if (d) { onChange(toISO(d)); setDraft(toDMY(toISO(d))); setOpen(false); }
            }}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
