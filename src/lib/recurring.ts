/** Advance a date by a billing/cycle string. */
export function advanceDate(dateISO: string, cycle: string): string {
  const d = new Date(dateISO);
  const c = (cycle || "monthly").toLowerCase();
  if (c === "weekly") d.setDate(d.getDate() + 7);
  else if (c === "biweekly" || c === "bi-weekly") d.setDate(d.getDate() + 14);
  else if (c === "monthly") d.setMonth(d.getMonth() + 1);
  else if (c === "bimonthly") d.setMonth(d.getMonth() + 2);
  else if (c === "quarterly") d.setMonth(d.getMonth() + 3);
  else if (c === "semiannual" || c === "semiannually") d.setMonth(d.getMonth() + 6);
  else if (c === "yearly" || c === "annual" || c === "annually") d.setFullYear(d.getFullYear() + 1);
  else if (c === "daily") d.setDate(d.getDate() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export function isDue(nextDate: string | null | undefined, today = new Date()): boolean {
  if (!nextDate) return false;
  return nextDate <= today.toISOString().slice(0, 10);
}
