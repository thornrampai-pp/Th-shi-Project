// The backend schema leaves every field nullable (Pothos default), so results
// are narrowed here once instead of null-checking throughout the UI.

/** `currency` is the trading currency — null when the query didn't select it. */
export type Asset = { id: string; symbol: string; name: string; type: string; exchange: string; currency: string | null };

type MaybeAsset = {
  id?: string | null;
  symbol?: string | null;
  name?: string | null;
  type?: string | null;
  exchange?: string | null;
  currency?: string | null;
} | null | undefined;

export function toAsset(a: MaybeAsset): Asset | null {
  if (!a?.id || !a.symbol) return null;
  return {
    id: a.id,
    symbol: a.symbol,
    name: a.name ?? a.symbol,
    type: a.type ?? "STOCK",
    exchange: a.exchange ?? "GLOBAL",
    currency: a.currency ?? null,
  };
}

export function compact<T>(values: (T | null | undefined)[] | null | undefined): T[] {
  return (values ?? []).filter((v): v is T => v != null);
}
