const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantity = new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 });

export function formatMoney(value: number, currency?: string): string {
  return currency ? `${money.format(value)} ${currency}` : money.format(value);
}

/** Always signed, so gain/loss never relies on color alone. */
export function formatSignedMoney(value: number, currency?: string): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatMoney(Math.abs(value), currency)}`;
}

export function formatSignedPct(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${money.format(Math.abs(value))}%`;
}

export function formatQuantity(value: number): string {
  return quantity.format(value);
}

export function plColor(value: number): string {
  return value > 0 ? "text-gain" : value < 0 ? "text-loss" : "text-muted-foreground";
}
