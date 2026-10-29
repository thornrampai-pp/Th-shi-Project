/** yyyy-mm-dd in the browser's timezone — the value a date input expects. */
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * A date input's day plus an optional time input's "HH:MM", as an ISO instant in the
 * browser's timezone — undefined without a time. Must run in the browser, not a server action.
 */
export function localMomentIso(date: string, time: string): string | undefined {
  if (!date || !time) return undefined;
  const moment = new Date(`${date}T${time}`);
  return Number.isNaN(moment.getTime()) ? undefined : moment.toISOString();
}

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateFormat.format(d);
}
