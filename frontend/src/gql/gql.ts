/* eslint-disable */
import * as types from './graphql';
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  mutation Login($email: String!, $password: String!) {\n    login(email: $email, password: $password) {\n      accessToken\n      refreshToken\n    }\n  }\n": typeof types.LoginDocument,
    "\n  mutation Register($email: String!, $password: String!, $firstName: String, $lastName: String) {\n    register(email: $email, password: $password, firstName: $firstName, lastName: $lastName) {\n      accessToken\n      refreshToken\n    }\n  }\n": typeof types.RegisterDocument,
    "\n  mutation Logout($refreshToken: String!) {\n    logout(refreshToken: $refreshToken)\n  }\n": typeof types.LogoutDocument,
    "\n  query WatchListIds {\n    watchLists {\n      id\n    }\n  }\n": typeof types.WatchListIdsDocument,
    "\n  mutation CreateWatchList($name: String!) {\n    createWatchList(name: $name) {\n      id\n    }\n  }\n": typeof types.CreateWatchListDocument,
    "\n  mutation AddWatchListItem($watchListId: ID!, $assetId: ID!) {\n    addWatchListItem(watchListId: $watchListId, assetId: $assetId) {\n      id\n    }\n  }\n": typeof types.AddWatchListItemDocument,
    "\n  mutation RemoveWatchListItem($watchListId: ID!, $assetId: ID!) {\n    removeWatchListItem(watchListId: $watchListId, assetId: $assetId) {\n      id\n    }\n  }\n": typeof types.RemoveWatchListItemDocument,
    "\n  query SearchAssets($search: String!) {\n    assets(search: $search, limit: 8) {\n      id\n      symbol\n      name\n      type\n      exchange\n    }\n  }\n": typeof types.SearchAssetsDocument,
    "\n  query LookupSymbol($symbol: String!) {\n    searchAssetSymbol(symbol: $symbol) {\n      id\n      symbol\n      name\n      type\n      exchange\n    }\n  }\n": typeof types.LookupSymbolDocument,
    "\n  mutation CreateThesis($assetId: ID!, $title: String!) {\n    createInvestmentThesis(assetId: $assetId, title: $title) {\n      id\n    }\n  }\n": typeof types.CreateThesisDocument,
    "\n  mutation UpdateThesis($id: ID!, $input: InvestmentThesisInput!) {\n    updateInvestmentThesis(id: $id, input: $input) {\n      id\n    }\n  }\n": typeof types.UpdateThesisDocument,
    "\n  mutation AddThesisSection($thesisId: ID!, $title: String!) {\n    addThesisSection(thesisId: $thesisId, title: $title) {\n      id\n    }\n  }\n": typeof types.AddThesisSectionDocument,
    "\n  mutation UpdateThesisSection($id: ID!, $title: String, $content: String) {\n    updateThesisSection(id: $id, title: $title, content: $content) {\n      id\n    }\n  }\n": typeof types.UpdateThesisSectionDocument,
    "\n  mutation DeleteThesisSection($id: ID!) {\n    deleteThesisSection(id: $id)\n  }\n": typeof types.DeleteThesisSectionDocument,
    "\n  query AppShellMe {\n    me {\n      email\n      firstName\n    }\n  }\n": typeof types.AppShellMeDocument,
    "\n  query DashboardMe {\n    me {\n      id\n      email\n      firstName\n    }\n  }\n": typeof types.DashboardMeDocument,
    "\n  query WatchlistStock($assetId: ID!) {\n    asset(id: $assetId) {\n      id\n      symbol\n      name\n      type\n      exchange\n    }\n    investmentTheses(assetId: $assetId) {\n      id\n      status\n      summary\n      sections {\n        id\n        title\n        content\n        history {\n          id\n          content\n          savedAt\n        }\n      }\n    }\n  }\n": typeof types.WatchlistStockDocument,
    "\n  query WatchlistOverview {\n    watchLists {\n      id\n      items {\n        id\n        createdAt\n        asset {\n          id\n          symbol\n          name\n          type\n          exchange\n        }\n      }\n    }\n    investmentTheses {\n      assetId\n      status\n      updatedAt\n    }\n  }\n": typeof types.WatchlistOverviewDocument,
    "\n  mutation RefreshToken($refreshToken: String!) {\n    refreshToken(refreshToken: $refreshToken) {\n      accessToken\n      refreshToken\n    }\n  }\n": typeof types.RefreshTokenDocument,
};
const documents: Documents = {
    "\n  mutation Login($email: String!, $password: String!) {\n    login(email: $email, password: $password) {\n      accessToken\n      refreshToken\n    }\n  }\n": types.LoginDocument,
    "\n  mutation Register($email: String!, $password: String!, $firstName: String, $lastName: String) {\n    register(email: $email, password: $password, firstName: $firstName, lastName: $lastName) {\n      accessToken\n      refreshToken\n    }\n  }\n": types.RegisterDocument,
    "\n  mutation Logout($refreshToken: String!) {\n    logout(refreshToken: $refreshToken)\n  }\n": types.LogoutDocument,
    "\n  query WatchListIds {\n    watchLists {\n      id\n    }\n  }\n": types.WatchListIdsDocument,
    "\n  mutation CreateWatchList($name: String!) {\n    createWatchList(name: $name) {\n      id\n    }\n  }\n": types.CreateWatchListDocument,
    "\n  mutation AddWatchListItem($watchListId: ID!, $assetId: ID!) {\n    addWatchListItem(watchListId: $watchListId, assetId: $assetId) {\n      id\n    }\n  }\n": types.AddWatchListItemDocument,
    "\n  mutation RemoveWatchListItem($watchListId: ID!, $assetId: ID!) {\n    removeWatchListItem(watchListId: $watchListId, assetId: $assetId) {\n      id\n    }\n  }\n": types.RemoveWatchListItemDocument,
    "\n  query SearchAssets($search: String!) {\n    assets(search: $search, limit: 8) {\n      id\n      symbol\n      name\n      type\n      exchange\n    }\n  }\n": types.SearchAssetsDocument,
    "\n  query LookupSymbol($symbol: String!) {\n    searchAssetSymbol(symbol: $symbol) {\n      id\n      symbol\n      name\n      type\n      exchange\n    }\n  }\n": types.LookupSymbolDocument,
    "\n  mutation CreateThesis($assetId: ID!, $title: String!) {\n    createInvestmentThesis(assetId: $assetId, title: $title) {\n      id\n    }\n  }\n": types.CreateThesisDocument,
    "\n  mutation UpdateThesis($id: ID!, $input: InvestmentThesisInput!) {\n    updateInvestmentThesis(id: $id, input: $input) {\n      id\n    }\n  }\n": types.UpdateThesisDocument,
    "\n  mutation AddThesisSection($thesisId: ID!, $title: String!) {\n    addThesisSection(thesisId: $thesisId, title: $title) {\n      id\n    }\n  }\n": types.AddThesisSectionDocument,
    "\n  mutation UpdateThesisSection($id: ID!, $title: String, $content: String) {\n    updateThesisSection(id: $id, title: $title, content: $content) {\n      id\n    }\n  }\n": types.UpdateThesisSectionDocument,
    "\n  mutation DeleteThesisSection($id: ID!) {\n    deleteThesisSection(id: $id)\n  }\n": types.DeleteThesisSectionDocument,
    "\n  query AppShellMe {\n    me {\n      email\n      firstName\n    }\n  }\n": types.AppShellMeDocument,
    "\n  query DashboardMe {\n    me {\n      id\n      email\n      firstName\n    }\n  }\n": types.DashboardMeDocument,
    "\n  query WatchlistStock($assetId: ID!) {\n    asset(id: $assetId) {\n      id\n      symbol\n      name\n      type\n      exchange\n    }\n    investmentTheses(assetId: $assetId) {\n      id\n      status\n      summary\n      sections {\n        id\n        title\n        content\n        history {\n          id\n          content\n          savedAt\n        }\n      }\n    }\n  }\n": types.WatchlistStockDocument,
    "\n  query WatchlistOverview {\n    watchLists {\n      id\n      items {\n        id\n        createdAt\n        asset {\n          id\n          symbol\n          name\n          type\n          exchange\n        }\n      }\n    }\n    investmentTheses {\n      assetId\n      status\n      updatedAt\n    }\n  }\n": types.WatchlistOverviewDocument,
    "\n  mutation RefreshToken($refreshToken: String!) {\n    refreshToken(refreshToken: $refreshToken) {\n      accessToken\n      refreshToken\n    }\n  }\n": types.RefreshTokenDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation Login($email: String!, $password: String!) {\n    login(email: $email, password: $password) {\n      accessToken\n      refreshToken\n    }\n  }\n"): (typeof documents)["\n  mutation Login($email: String!, $password: String!) {\n    login(email: $email, password: $password) {\n      accessToken\n      refreshToken\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation Register($email: String!, $password: String!, $firstName: String, $lastName: String) {\n    register(email: $email, password: $password, firstName: $firstName, lastName: $lastName) {\n      accessToken\n      refreshToken\n    }\n  }\n"): (typeof documents)["\n  mutation Register($email: String!, $password: String!, $firstName: String, $lastName: String) {\n    register(email: $email, password: $password, firstName: $firstName, lastName: $lastName) {\n      accessToken\n      refreshToken\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation Logout($refreshToken: String!) {\n    logout(refreshToken: $refreshToken)\n  }\n"): (typeof documents)["\n  mutation Logout($refreshToken: String!) {\n    logout(refreshToken: $refreshToken)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WatchListIds {\n    watchLists {\n      id\n    }\n  }\n"): (typeof documents)["\n  query WatchListIds {\n    watchLists {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateWatchList($name: String!) {\n    createWatchList(name: $name) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation CreateWatchList($name: String!) {\n    createWatchList(name: $name) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AddWatchListItem($watchListId: ID!, $assetId: ID!) {\n    addWatchListItem(watchListId: $watchListId, assetId: $assetId) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation AddWatchListItem($watchListId: ID!, $assetId: ID!) {\n    addWatchListItem(watchListId: $watchListId, assetId: $assetId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RemoveWatchListItem($watchListId: ID!, $assetId: ID!) {\n    removeWatchListItem(watchListId: $watchListId, assetId: $assetId) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation RemoveWatchListItem($watchListId: ID!, $assetId: ID!) {\n    removeWatchListItem(watchListId: $watchListId, assetId: $assetId) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SearchAssets($search: String!) {\n    assets(search: $search, limit: 8) {\n      id\n      symbol\n      name\n      type\n      exchange\n    }\n  }\n"): (typeof documents)["\n  query SearchAssets($search: String!) {\n    assets(search: $search, limit: 8) {\n      id\n      symbol\n      name\n      type\n      exchange\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query LookupSymbol($symbol: String!) {\n    searchAssetSymbol(symbol: $symbol) {\n      id\n      symbol\n      name\n      type\n      exchange\n    }\n  }\n"): (typeof documents)["\n  query LookupSymbol($symbol: String!) {\n    searchAssetSymbol(symbol: $symbol) {\n      id\n      symbol\n      name\n      type\n      exchange\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateThesis($assetId: ID!, $title: String!) {\n    createInvestmentThesis(assetId: $assetId, title: $title) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation CreateThesis($assetId: ID!, $title: String!) {\n    createInvestmentThesis(assetId: $assetId, title: $title) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateThesis($id: ID!, $input: InvestmentThesisInput!) {\n    updateInvestmentThesis(id: $id, input: $input) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateThesis($id: ID!, $input: InvestmentThesisInput!) {\n    updateInvestmentThesis(id: $id, input: $input) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AddThesisSection($thesisId: ID!, $title: String!) {\n    addThesisSection(thesisId: $thesisId, title: $title) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation AddThesisSection($thesisId: ID!, $title: String!) {\n    addThesisSection(thesisId: $thesisId, title: $title) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateThesisSection($id: ID!, $title: String, $content: String) {\n    updateThesisSection(id: $id, title: $title, content: $content) {\n      id\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateThesisSection($id: ID!, $title: String, $content: String) {\n    updateThesisSection(id: $id, title: $title, content: $content) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteThesisSection($id: ID!) {\n    deleteThesisSection(id: $id)\n  }\n"): (typeof documents)["\n  mutation DeleteThesisSection($id: ID!) {\n    deleteThesisSection(id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query AppShellMe {\n    me {\n      email\n      firstName\n    }\n  }\n"): (typeof documents)["\n  query AppShellMe {\n    me {\n      email\n      firstName\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query DashboardMe {\n    me {\n      id\n      email\n      firstName\n    }\n  }\n"): (typeof documents)["\n  query DashboardMe {\n    me {\n      id\n      email\n      firstName\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WatchlistStock($assetId: ID!) {\n    asset(id: $assetId) {\n      id\n      symbol\n      name\n      type\n      exchange\n    }\n    investmentTheses(assetId: $assetId) {\n      id\n      status\n      summary\n      sections {\n        id\n        title\n        content\n        history {\n          id\n          content\n          savedAt\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query WatchlistStock($assetId: ID!) {\n    asset(id: $assetId) {\n      id\n      symbol\n      name\n      type\n      exchange\n    }\n    investmentTheses(assetId: $assetId) {\n      id\n      status\n      summary\n      sections {\n        id\n        title\n        content\n        history {\n          id\n          content\n          savedAt\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WatchlistOverview {\n    watchLists {\n      id\n      items {\n        id\n        createdAt\n        asset {\n          id\n          symbol\n          name\n          type\n          exchange\n        }\n      }\n    }\n    investmentTheses {\n      assetId\n      status\n      updatedAt\n    }\n  }\n"): (typeof documents)["\n  query WatchlistOverview {\n    watchLists {\n      id\n      items {\n        id\n        createdAt\n        asset {\n          id\n          symbol\n          name\n          type\n          exchange\n        }\n      }\n    }\n    investmentTheses {\n      assetId\n      status\n      updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RefreshToken($refreshToken: String!) {\n    refreshToken(refreshToken: $refreshToken) {\n      accessToken\n      refreshToken\n    }\n  }\n"): (typeof documents)["\n  mutation RefreshToken($refreshToken: String!) {\n    refreshToken(refreshToken: $refreshToken) {\n      accessToken\n      refreshToken\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;