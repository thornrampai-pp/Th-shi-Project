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

const currencyFormats = new Map<string, Intl.NumberFormat>();

/** "$620.33", "฿22,679.46" — the currency's own symbol, 2 decimals; `signed` adds +/−. */
export function formatCurrency(value: number, currency: string, signed = false): string {
  let format = currencyFormats.get(currency);
  if (!format) {
    try {
      format = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } catch {
      format = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    currencyFormats.set(currency, format);
  }
  const text = format.format(Math.abs(value));
  return signed ? `${value > 0 ? "+" : value < 0 ? "−" : ""}${text}` : value < 0 ? `−${text}` : text;
}
