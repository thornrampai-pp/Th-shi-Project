import { prisma } from "../../config/prisma";
import { redis } from "../../config/redis";
import { fetchYahooQuotes, yahooSymbolOf } from "../../common/integrations/yahoo-finance.util";

/** The newest market price seen for an asset, in its own currency. */
export interface LatestQuote {
  price: number;
  /** When that price traded (Yahoo's regularMarketTime), else when it was fetched. */
  at: Date;
}

const keyOf = (assetId: string) => `asset:latest-quote:${assetId}`;
const BATCH_SIZE = 50;

/**
 * Fetches a current quote for every asset someone holds and keeps it (no expiry) for
 * valuing holdings between syncs — daily closes alone lag up to a day. Called from
 * syncHistory(); a symbol Yahoo can't price keeps its previous quote.
 */
export async function refreshHeldAssetQuotes(): Promise<number> {
  const held = await prisma.position.findMany({
    where: { quantity: { gt: 0 }, portfolio: { deletedAt: null } },
    distinct: ["assetId"],
    select: { asset: { select: { id: true, symbol: true, exchange: true } } },
  });
  const assetIdsBySymbol = new Map<string, string[]>();
  for (const { asset } of held) {
    const symbol = yahooSymbolOf(asset);
    assetIdsBySymbol.set(symbol, [...(assetIdsBySymbol.get(symbol) ?? []), asset.id]);
  }

  const symbols = [...assetIdsBySymbol.keys()];
  const fetchedAt = new Date();
  let saved = 0;
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const quotes = await fetchYahooQuotes(symbols.slice(i, i + BATCH_SIZE));
    const entries: string[] = [];
    for (const quote of quotes) {
      if (quote.regularMarketPrice == null) continue;
      const value = JSON.stringify({
        price: quote.regularMarketPrice,
        at: (quote.regularMarketTime ?? fetchedAt).toISOString(),
      });
      for (const assetId of assetIdsBySymbol.get(quote.symbol) ?? []) entries.push(keyOf(assetId), value);
    }
    if (entries.length > 0) {
      await redis.mset(...entries);
      saved += entries.length / 2;
    }
  }
  return saved;
}

export async function getLatestQuotes(assetIds: string[]): Promise<Map<string, LatestQuote>> {
  const quotes = new Map<string, LatestQuote>();
  if (assetIds.length === 0) return quotes;

  const values = await redis.mget(assetIds.map(keyOf));
  assetIds.forEach((assetId, i) => {
    const value = values[i];
    if (!value) return;
    const parsed = JSON.parse(value) as { price: number; at: string };
    quotes.set(assetId, { price: parsed.price, at: new Date(parsed.at) });
  });
  return quotes;
}
