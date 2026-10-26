type AssetRef = { symbol: string; exchange: string; type: string };

/**
 * TradingView wants "EXCHANGE:SYMBOL". Seeded assets carry a real exchange,
 * but ones synced from Yahoo are stored as "GLOBAL" with Yahoo's ticker format.
 */
export function tradingViewSymbol({ symbol, exchange, type }: AssetRef) {
  const ex = exchange.toUpperCase();
  if (ex !== "GLOBAL") return `${ex}:${symbol}`;
  if (symbol.endsWith(".BK")) return `SET:${symbol.slice(0, -3)}`;
  if (type === "FOREX") return `FX:${symbol.replace(/=X$/, "")}`;
  if (type === "CRYPTO") return symbol.replace("-", "");
  if (symbol.endsWith("=F")) return `${symbol.slice(0, -2)}1!`;
  return symbol;
}

// TradingView's free embeds refuse these exchanges ("only available on TradingView").
const EMBED_BLOCKED_EXCHANGES = ["SET"];

export function isEmbeddable(tvSymbol: string) {
  return !EMBED_BLOCKED_EXCHANGES.includes(tvSymbol.split(":")[0]);
}

export function tradingViewUrl(tvSymbol: string) {
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`;
}
