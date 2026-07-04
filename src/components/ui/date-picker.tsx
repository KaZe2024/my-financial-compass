import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Segmented date picker (DD / MM / YYYY). Auto-advances between segments as the
 * user types, no separator required. Stores/returns ISO `YYYY-MM-DD` (empty
 * string when cleared). Includes a Popover calendar with month/year dropdowns.
 */

function daysInMonth(y: number, m: number) {
  if (!y || !m) return 31;
  return new Date(y, m, 0).getDate();
}
function pad(n: number, len: number) { return String(n).padStart(len, "0"); }
function parseISO(v: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? "");
  if (!m) return null;
  return { y: +m[1], mo: +m[2], d: +m[3] };
}
function toISO(y: number, mo: number, d: number) {
  return `${pad(y, 4)}-${pad(mo, 2)}-${pad(d, 2)}`;
}
function isoFromDate(d: Date) {
  return toISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  inputClassName?: string;
  placeholder?: string; // unused – kept for API compat
}

type Seg = "d" | "m" | "y";

export function DatePicker({
  value, onChange, className, id, required, disabled, inputClassName,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const dRef = React.useRef<HTMLInputElement>(null);
  const mRef = React.useRef<HTMLInputElement>(null);
  const yRef = React.useRef<HTMLInputElement>(null);

  const parsed = parseISO(value);
  const [d, setD] = React.useState(parsed ? pad(parsed.d, 2) : "");
  const [m, setM] = React.useState(parsed ? pad(parsed.mo, 2) : "");
  const [y, setY] = React.useState(parsed ? pad(parsed.y, 4) : "");

  // Sync from external value
  React.useEffect(() => {
    const p = parseISO(value);
    if (p) {
      setD(pad(p.d, 2)); setM(pad(p.mo, 2)); setY(pad(p.y, 4));
    } else if (!value) {
      setD(""); setM(""); setY("");
    }
  }, [value]);

  function commit(nd: string, nm: string, ny: string) {
    if (nd && nm && ny.length === 4) {
      const yi = +ny, mi = +nm;
      let di = +nd;
      if (yi < 1 || mi < 1 || mi > 12 || di < 1) return;
      const last = daysInMonth(yi, mi);
      if (di > last) { di = last; setD(pad(di, 2)); }
      const iso = toISO(yi, mi, di);
      if (iso !== value) onChange(iso);
    } else if (!nd && !nm && !ny && value) {
      onChange("");
    }
  }

  function focusSeg(seg: Seg) {
    const el = seg === "d" ? dRef.current : seg === "m" ? mRef.current : yRef.current;
    el?.focus(); el?.select();
  }

  function handleChange(seg: Seg, raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (seg === "d") {
      const trimmed = digits.slice(0, 2);
      setD(trimmed);
      // Auto-advance when unambiguous (>=4 forces 2-digit, or when 2 chars typed)
      if (trimmed.length === 2 || (trimmed.length === 1 && +trimmed > 3)) {
        commit(trimmed.padStart(2, "0"), m, y);
        focusSeg("m");
      } else {
        commit(trimmed, m, y);
      }
    } else if (seg === "m") {
      const trimmed = digits.slice(0, 2);
      setM(trimmed);
      if (trimmed.length === 2 || (trimmed.length === 1 && +trimmed > 1)) {
        commit(d, trimmed.padStart(2, "0"), y);
        focusSeg("y");
      } else {
        commit(d, trimmed, y);
      }
    } else {
      const trimmed = digits.slice(0, 4);
      setY(trimmed);
      commit(d, m, trimmed);
    }
  }

  function handleKeyDown(seg: Seg, e: React.KeyboardEvent<HTMLInputElement>) {
    const target = e.currentTarget;
    const val = target.value;
    if (e.key === "ArrowRight" && target.selectionStart === val.length) {
      e.preventDefault();
      if (seg === "d") focusSeg("m");
      else if (seg === "m") focusSeg("y");
    } else if (e.key === "ArrowLeft" && target.selectionStart === 0) {
      e.preventDefault();
      if (seg === "y") focusSeg("m");
      else if (seg === "m") focusSeg("d");
    } else if (e.key === "Backspace" && val === "") {
      e.preventDefault();
      if (seg === "y") focusSeg("m");
      else if (seg === "m") focusSeg("d");
    } else if (e.key === "/" || e.key === "-" || e.key === "." || e.key === " ") {
      e.preventDefault();
      if (seg === "d" && d) { setD(pad(+d || 0, 2)); focusSeg("m"); }
      else if (seg === "m" && m) { setM(pad(+m || 0, 2)); focusSeg("y"); }
    } else if (e.key === "Enter") {
      commit(d, m, y);
    }
  }

  function handleBlur(seg: Seg, e: React.FocusEvent<HTMLInputElement>) {
    // Read from the DOM to avoid stale closures during auto-advance blur.
    const cur = e.currentTarget.value.replace(/\D/g, "");
    const cd = seg === "d" ? cur : d;
    const cm = seg === "m" ? cur : m;
    let cy = seg === "y" ? cur : y;
    if (seg === "d" && cd && cd.length === 1) setD(pad(+cd, 2));
    if (seg === "m" && cm && cm.length === 1) setM(pad(+cm, 2));
    if (seg === "y" && cy && cy.length > 0 && cy.length < 4) {
      cy = cy.length === 2 ? String(+cy < 70 ? 2000 + +cy : 1900 + +cy) : pad(+cy, 4);
      setY(cy);
    }
    commit(cd, cm, cy);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    const m1 = /^(\d{1,2})[/\-.\s](\d{1,2})[/\-.\s](\d{2,4})$/.exec(text.trim())
      || /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
    if (!m1) return;
    e.preventDefault();
    let dd: string, mm: string, yy: string;
    if (m1[0].startsWith(m1[1]) && m1[1].length === 4) {
      // ISO
      yy = m1[1]; mm = m1[2]; dd = m1[3];
    } else {
      dd = m1[1]; mm = m1[2]; yy = m1[3];
      if (yy.length === 2) yy = String(+yy < 70 ? 2000 + +yy : 1900 + +yy);
    }
    dd = pad(+dd, 2); mm = pad(+mm, 2); yy = pad(+yy, 4);
    setD(dd); setM(mm); setY(yy);
    commit(dd, mm, yy);
    focusSeg("y");
  }

  const selectedDate = parsed ? new Date(parsed.y, parsed.mo - 1, Math.min(parsed.d, daysInMonth(parsed.y, parsed.mo))) : undefined;

  const segInputBase = "bg-transparent p-0 text-center tabular-nums outline-none focus:bg-accent focus:text-accent-foreground rounded-sm caret-transparent selection:bg-primary/30";
  const empty = !d && !m && !y;

  return (
    <div
      className={cn(
        "relative flex h-9 w-full items-center gap-0.5 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring md:text-sm",
        disabled && "cursor-not-allowed opacity-50",
        className,
        inputClassName,
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget) focusSeg(d ? (m ? "y" : "m") : "d");
      }}
    >
      <input
        ref={dRef}
        id={id}
        aria-label="Jour"
        inputMode="numeric"
        placeholder="jj"
        className={cn(segInputBase, "w-5 placeholder:text-muted-foreground")}
        value={d}
        disabled={disabled}
        required={required}
        onChange={(e) => handleChange("d", e.target.value)}
        onKeyDown={(e) => handleKeyDown("d", e)}
        onBlur={() => handleBlur("d")}
        onFocus={(e) => e.currentTarget.select()}
        onPaste={handlePaste}
      />
      <span className={cn("select-none", empty ? "text-muted-foreground" : "text-foreground/60")}>/</span>
      <input
        ref={mRef}
        aria-label="Mois"
        inputMode="numeric"
        placeholder="mm"
        className={cn(segInputBase, "w-5 placeholder:text-muted-foreground")}
        value={m}
        disabled={disabled}
        onChange={(e) => handleChange("m", e.target.value)}
        onKeyDown={(e) => handleKeyDown("m", e)}
        onBlur={() => handleBlur("m")}
        onFocus={(e) => e.currentTarget.select()}
        onPaste={handlePaste}
      />
      <span className={cn("select-none", empty ? "text-muted-foreground" : "text-foreground/60")}>/</span>
      <input
        ref={yRef}
        aria-label="Année"
        inputMode="numeric"
        placeholder="aaaa"
        className={cn(segInputBase, "w-10 placeholder:text-muted-foreground")}
        value={y}
        disabled={disabled}
        onChange={(e) => handleChange("y", e.target.value)}
        onKeyDown={(e) => handleKeyDown("y", e)}
        onBlur={() => handleBlur("y")}
        onFocus={(e) => e.currentTarget.select()}
        onPaste={handlePaste}
      />
      <div className="ml-auto flex items-center">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              aria-label="Ouvrir le calendrier"
            >
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              captionLayout="dropdown"
              selected={selectedDate}
              defaultMonth={selectedDate ?? new Date()}
              onSelect={(dt) => {
                if (dt) {
                  const iso = isoFromDate(dt);
                  const p = parseISO(iso)!;
                  setD(pad(p.d, 2)); setM(pad(p.mo, 2)); setY(pad(p.y, 4));
                  onChange(iso);
                  setOpen(false);
                }
              }}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
