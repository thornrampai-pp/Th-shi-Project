import type { AlertCondition } from "@/gql/graphql";

export const CONDITIONS: { value: AlertCondition; label: string; unit: "price" | "%" | "x" }[] = [
  { value: "PRICE_ABOVE", label: "Price above", unit: "price" },
  { value: "PRICE_BELOW", label: "Price below", unit: "price" },
  { value: "CHANGE_PCT_ABOVE", label: "Day change above", unit: "%" },
  { value: "CHANGE_PCT_BELOW", label: "Day change below", unit: "%" },
  { value: "PE_ABOVE", label: "P/E above", unit: "x" },
  { value: "PE_BELOW", label: "P/E below", unit: "x" },
  { value: "DIVIDEND_YIELD_ABOVE", label: "Dividend yield above", unit: "%" },
];

export function describeCondition(condition: string, target: number): string {
  const c = CONDITIONS.find((x) => x.value === condition);
  if (!c) return `${condition} ${target}`;
  const value = target.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return `${c.label} ${c.unit === "%" ? `${value}%` : value}`;
}
