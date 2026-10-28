/**
 * Rule-of-thumb verdicts for the stock page's numbers: "good" (green), "bad" (red) or
 * null (no color — in between, not meaningful alone, or no data). These are general
 * screens, not adjusted for sector, so each comes with the rule shown to the user.
 */
export type Tone = "good" | "bad" | null;

export interface Rule {
  label: string;
  rule: string;
  rate: (value: number) => Tone;
}

const between = (value: number, good: (v: number) => boolean, bad: (v: number) => boolean): Tone =>
  good(value) ? "good" : bad(value) ? "bad" : null;

export const RULES = {
  pe: {
    label: "P/E",
    rule: "0–15 good · above 25 or negative (losing money) weak",
    rate: (v) => between(v, (x) => x > 0 && x <= 15, (x) => x <= 0 || x > 25),
  },
  forwardPe: {
    label: "Forward P/E",
    rule: "Same as P/E, on next year's expected earnings",
    rate: (v) => between(v, (x) => x > 0 && x <= 15, (x) => x <= 0 || x > 25),
  },
  pbv: {
    label: "P/BV",
    rule: "Below 1.5 good · above 3 weak (asset-light businesses often run high)",
    rate: (v) => between(v, (x) => x > 0 && x < 1.5, (x) => x <= 0 || x > 3),
  },
  eps: {
    label: "EPS",
    rule: "Positive good (profitable) · negative weak",
    rate: (v) => between(v, (x) => x > 0, (x) => x < 0),
  },
  dividendYield: {
    label: "Dividend yield",
    rule: "2–6% good · above 8% weak (often not sustainable) · below 2% neutral",
    rate: (v) => between(v, (x) => x >= 2 && x <= 6, (x) => x > 8),
  },
  roe: {
    label: "ROE",
    rule: "15% or more good · below 5% weak",
    rate: (v) => between(v, (x) => x >= 15, (x) => x < 5),
  },
  debtToEquity: {
    label: "D/E",
    rule: "Below 50% good · above 150% weak (not judged for banks and insurers)",
    rate: (v) => between(v, (x) => x >= 0 && x < 50, (x) => x > 150 || x < 0),
  },
  profitMargin: {
    label: "Profit margin",
    rule: "15% or more good · below 5% weak",
    rate: (v) => between(v, (x) => x >= 15, (x) => x < 5),
  },
  revenueGrowth: {
    label: "Revenue growth",
    rule: "10% or more good · shrinking (below 0%) weak",
    rate: (v) => between(v, (x) => x >= 10, (x) => x < 0),
  },
  freeCashflow: {
    label: "Free cash flow",
    rule: "Positive good · negative weak (burning cash)",
    rate: (v) => between(v, (x) => x > 0, (x) => x < 0),
  },
  targetUpside: {
    label: "Target vs current",
    rule: "10% or more upside good · below current price weak",
    rate: (v) => between(v, (x) => x >= 10, (x) => x < 0),
  },
} satisfies Record<string, Rule>;

/** Yahoo's recommendationKey: buy-side keys are good, sell-side weak, hold neutral. */
export function rateRecommendation(key: string): Tone {
  if (key === "strong_buy" || key === "buy") return "good";
  if (key === "sell" || key === "strong_sell" || key === "underperform") return "bad";
  return null;
}

/** Leverage is the business model for lenders and insurers, so D/E says little there. */
export function isFinancialSector(sector: string | null | undefined): boolean {
  return sector === "Financial Services";
}

export const toneClass = (tone: Tone) => (tone === "good" ? "text-gain" : tone === "bad" ? "text-loss" : "");
