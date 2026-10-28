"use server";

import { redirect } from "next/navigation";
import { graphql } from "@/gql";
import type { ThesisStatus } from "@/gql/graphql";
import { compact, toAsset, type Asset } from "@/lib/graphql/normalize";
import { GraphQLRequestError, serverQuery } from "@/lib/graphql/server";
import { run } from "./run";

const WatchListIdsQuery = graphql(`
  query WatchListIds {
    watchLists {
      id
    }
  }
`);

const CreateWatchListMutation = graphql(`
  mutation CreateWatchList($name: String!) {
    createWatchList(name: $name) {
      id
    }
  }
`);

const AddWatchListItemMutation = graphql(`
  mutation AddWatchListItem($watchListId: ID!, $assetId: ID!) {
    addWatchListItem(watchListId: $watchListId, assetId: $assetId) {
      id
    }
  }
`);

const RemoveWatchListItemMutation = graphql(`
  mutation RemoveWatchListItem($watchListId: ID!, $assetId: ID!) {
    removeWatchListItem(watchListId: $watchListId, assetId: $assetId) {
      id
    }
  }
`);

const SearchAssetsQuery = graphql(`
  query SearchAssets($search: String!) {
    assets(search: $search, limit: 8) {
      id
      symbol
      name
      type
      exchange
      currency
    }
  }
`);

const LookupSymbolQuery = graphql(`
  query LookupSymbol($symbol: String!) {
    searchAssetSymbol(symbol: $symbol) {
      id
      symbol
      name
      type
      exchange
      currency
    }
  }
`);

const CreateThesisMutation = graphql(`
  mutation CreateThesis($assetId: ID!, $title: String!) {
    createInvestmentThesis(assetId: $assetId, title: $title) {
      id
    }
  }
`);

const UpdateThesisMutation = graphql(`
  mutation UpdateThesis($id: ID!, $input: InvestmentThesisInput!) {
    updateInvestmentThesis(id: $id, input: $input) {
      id
    }
  }
`);

const AddSectionMutation = graphql(`
  mutation AddThesisSection($thesisId: ID!, $title: String!) {
    addThesisSection(thesisId: $thesisId, title: $title) {
      id
    }
  }
`);

const UpdateSectionMutation = graphql(`
  mutation UpdateThesisSection($id: ID!, $title: String, $content: String) {
    updateThesisSection(id: $id, title: $title, content: $content) {
      id
    }
  }
`);

const DeleteSectionMutation = graphql(`
  mutation DeleteThesisSection($id: ID!) {
    deleteThesisSection(id: $id)
  }
`);

/** DB matches first; if there are none, ask Yahoo for the exact ticker (which also saves it). */
export async function searchAssetsAction(query: string): Promise<{ assets: Asset[]; error?: string }> {
  const search = query.trim();
  if (!search) return { assets: [] };
  try {
    const { assets } = await serverQuery(SearchAssetsQuery, { search });
    const found = compact(assets?.map(toAsset));
    if (found.length) return { assets: found };
    const { searchAssetSymbol } = await serverQuery(LookupSymbolQuery, { symbol: search });
    return { assets: compact([toAsset(searchAssetSymbol)]) };
  } catch (e) {
    if (e instanceof GraphQLRequestError) return { assets: [], error: `No stock found for "${search}"` };
    if (e instanceof TypeError) return { assets: [], error: "Couldn't reach the server" };
    throw e;
  }
}

// The app shows a single watchlist; the backend supports several, so use the
// oldest one and create it on first add.
export async function addToWatchlistAction(assetId: string) {
  return run(async () => {
    const { watchLists } = await serverQuery(WatchListIdsQuery);
    const watchListId =
      compact(watchLists)[0]?.id ??
      (await serverQuery(CreateWatchListMutation, { name: "Watchlist" })).createWatchList?.id;
    if (!watchListId) throw new GraphQLRequestError("Couldn't create the watchlist");
    await serverQuery(AddWatchListItemMutation, { watchListId, assetId });
  });
}

export async function removeFromWatchlistAction(watchListId: string, assetId: string) {
  const result = await run(() => serverQuery(RemoveWatchListItemMutation, { watchListId, assetId }));
  if (!result.error) redirect("/watchlist");
  return result;
}

export async function startThesisAction(assetId: string, title: string) {
  return run(() => serverQuery(CreateThesisMutation, { assetId, title }));
}

export async function updateThesisAction(id: string, input: { summary?: string; status?: ThesisStatus }) {
  return run(() => serverQuery(UpdateThesisMutation, { id, input }));
}

export async function addSectionAction(thesisId: string, title: string) {
  return run(() => serverQuery(AddSectionMutation, { thesisId, title }));
}

export async function updateSectionAction(id: string, input: { title?: string; content?: string }) {
  return run(() => serverQuery(UpdateSectionMutation, { id, ...input }));
}

export async function deleteSectionAction(id: string) {
  return run(() => serverQuery(DeleteSectionMutation, { id }));
}
