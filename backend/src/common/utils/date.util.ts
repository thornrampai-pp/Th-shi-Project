export const DAY_MS = 24 * 60 * 60 * 1000;

/** 00:00:00.000 UTC of the given instant's UTC day — how snapshot/FX dates are keyed. */
export function utcDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** 23:59:59.999 UTC — a snapshot dated D values the portfolio as of this instant. */
export function endOfUtcDay(date: Date): Date {
  return new Date(utcDay(date).getTime() + DAY_MS - 1);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Every UTC day from `from` to `to`, inclusive. */
export function eachUtcDay(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  for (let d = utcDay(from); d.getTime() <= to.getTime(); d = addDays(d, 1)) days.push(d);
  return days;
}
