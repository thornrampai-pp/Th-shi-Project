/**
 * The trade date (and time, when present) a statement's file name carries, e.g. Dime's
 * "…confirmationNote_2766_11072023094550.pdf" (DDMMYYYY + HHMMSS) or "2766_10032024.pdf".
 * Sorting by name puts 10/07 before 10/03, and a sell recorded before its buy fails,
 * so bulk imports sort by this instead.
 *
 * Takes a run of 8 (date), 12 (+HHMM) or 14 (+HHMMSS) digits; the date part is read as
 * DDMMYYYY, else YYYYMMDD; Buddhist-era years (25xx) are converted. Longer runs (order
 * numbers) are ignored. Returns null when the name has no valid date.
 */
export function dateFromFileName(fileName: string): Date | null {
  for (const match of fileName.matchAll(/(?<!\d)(\d{8}|\d{12}|\d{14})(?!\d)/g)) {
    const digits = match[1]!;
    const date =
      toDate(+digits.slice(4, 8), +digits.slice(2, 4), +digits.slice(0, 2)) ??
      toDate(+digits.slice(0, 4), +digits.slice(4, 6), +digits.slice(6, 8));
    if (!date) continue;
    const [h, m, sec] = [digits.slice(8, 10), digits.slice(10, 12), digits.slice(12, 14)].map((x) => (x ? +x : 0));
    if (h! > 23 || m! > 59 || sec! > 59) return date;
    date.setUTCHours(h!, m!, sec!);
    return date;
  }
  return null;
}

function toDate(year: number, month: number, day: number): Date | null {
  const y = year >= 2400 ? year - 543 : year; // พ.ศ. → ค.ศ.
  if (y < 1990 || y > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(y, month - 1, day));
  // Rejects 31/02 and the like, which Date would roll into the next month.
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

/**
 * Oldest first by `date`; items without one go last, by name. Same-day items keep
 * name order, so a numbered sequence on one day stays in sequence.
 */
export function sortByDateThenName<T extends { name: string; date: Date | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.date && b.date && a.date.getTime() !== b.date.getTime()) return a.date.getTime() - b.date.getTime();
    if (a.date && !b.date) return -1;
    if (!a.date && b.date) return 1;
    return a.name.localeCompare(b.name, 'en', { numeric: true });
  });
}
