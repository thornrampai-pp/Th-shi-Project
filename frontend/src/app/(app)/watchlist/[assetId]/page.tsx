import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { graphql } from "@/gql";
import { compact, toAsset } from "@/lib/graphql/normalize";
import { GraphQLRequestError, serverQuery } from "@/lib/graphql/server";
import { isEmbeddable, tradingViewSymbol, tradingViewUrl } from "@/lib/tradingview";
import { getWatchlistOverview } from "../data";
import StatusBadge from "../StatusBadge";
import RemoveButton from "./RemoveButton";
import StartThesis from "./StartThesis";
import ThesisEditor, { type Thesis } from "./ThesisEditor";
import TradingViewChart from "./TradingViewChart";

const WatchlistStockQuery = graphql(`
  query WatchlistStock($assetId: ID!) {
    asset(id: $assetId) {
      id
      symbol
      name
      type
      exchange
    }
    investmentTheses(assetId: $assetId) {
      id
      status
      summary
      sections {
        id
        title
        content
        history {
          id
          content
          savedAt
        }
      }
    }
  }
`);

async function getStock(assetId: string) {
  let data;
  try {
    data = await serverQuery(WatchlistStockQuery, { assetId });
  } catch (e) {
    if (e instanceof GraphQLRequestError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const asset = toAsset(data.asset);
  if (!asset) notFound();

  // Theses come newest-updated first; the page edits the latest one.
  const t = compact(data.investmentTheses)[0];
  const thesis: Thesis | null =
    t?.id && t.status
      ? {
          id: t.id,
          status: t.status,
          summary: t.summary ?? "",
          sections: compact(t.sections).flatMap((s) =>
            s.id
              ? [
                  {
                    id: s.id,
                    title: s.title ?? "",
                    content: s.content ?? "",
                    history: compact(s.history).flatMap((v) =>
                      v.id && v.savedAt ? [{ id: v.id, content: v.content ?? "", savedAt: v.savedAt }] : [],
                    ),
                  },
                ]
              : [],
          ),
        }
      : null;

  return { asset, thesis };
}

export async function generateMetadata({ params }: PageProps<"/watchlist/[assetId]">): Promise<Metadata> {
  const { assetId } = await params;
  const { asset } = await getStock(assetId);
  return { title: asset.symbol };
}

export default async function WatchlistStockPage({ params }: PageProps<"/watchlist/[assetId]">) {
  const { assetId } = await params;
  const [{ asset, thesis }, { watchListId, items }] = await Promise.all([
    getStock(assetId),
    getWatchlistOverview(),
  ]);

  const inList = items.some((i) => i.asset.id === asset.id);
  const tvSymbol = tradingViewSymbol(asset);

  return (
    <article className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex min-w-0 items-baseline gap-2 text-xl font-semibold">
          <span>{asset.symbol}</span>
          <span className="truncate text-base font-normal text-muted-foreground">
            {asset.name} · {asset.exchange} # {asset.type}
          </span>
        </h1>
        <div className="flex items-center gap-3">
          {!thesis && <StatusBadge status="none" />}
          {inList && watchListId && <RemoveButton watchListId={watchListId} assetId={asset.id} />}
        </div>
      </header>

      <div className="h-[22rem] overflow-hidden rounded-md bg-muted sm:h-[28rem]">
        {isEmbeddable(tvSymbol) ? (
          <TradingViewChart symbol={tvSymbol} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
            <p>The free TradingView chart doesn&apos;t support {asset.exchange} stocks.</p>
            <a
              href={tradingViewUrl(tvSymbol)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:opacity-80"
            >
              Open {tvSymbol} on TradingView ↗
            </a>
          </div>
        )}
      </div>

      {thesis ? (
        <ThesisEditor key={thesis.id} thesis={thesis} />
      ) : (
        <StartThesis assetId={asset.id} title={asset.symbol} />
      )}
    </article>
  );
}
