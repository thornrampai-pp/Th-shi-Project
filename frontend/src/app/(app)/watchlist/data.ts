import "server-only";
import { cache } from "react";
import { graphql } from "@/gql";
import type { ThesisStatus } from "@/gql/graphql";
import { compact, toAsset } from "@/lib/graphql/normalize";
import { serverQuery } from "@/lib/graphql/server";

const WatchlistOverviewQuery = graphql(`
  query WatchlistOverview {
    watchLists {
      id
      items {
        id
        createdAt
        asset {
          id
          symbol
          name
          type
          exchange
        }
      }
    }
    investmentTheses {
      assetId
      status
      updatedAt
    }
  }
`);

export type NoteStatus = "none" | "draft" | "done";

export function noteStatus(status: ThesisStatus | undefined): NoteStatus {
  if (!status) return "none";
  return status === "DRAFT" ? "draft" : "done";
}

/** The single watchlist the app shows, plus each stock's note status (theses are newest first). */
export const getWatchlistOverview = cache(async () => {
  const { watchLists, investmentTheses } = await serverQuery(WatchlistOverviewQuery);
  const list = compact(watchLists)[0];

  const statusByAsset = new Map<string, ThesisStatus>();
  for (const t of compact(investmentTheses)) {
    if (t.assetId && t.status && !statusByAsset.has(t.assetId)) statusByAsset.set(t.assetId, t.status);
  }

  const items = compact(list?.items).flatMap((item) => {
    const asset = toAsset(item.asset);
    if (!item.id || !asset) return [];
    return [
      {
        id: item.id,
        createdAt: item.createdAt ?? "",
        asset,
        status: noteStatus(statusByAsset.get(asset.id)),
      },
    ];
  });

  return { watchListId: list?.id ?? null, items };
});

export type WatchlistItem = Awaited<ReturnType<typeof getWatchlistOverview>>["items"][number];
