import "server-only";
import { print } from "graphql";
import type { TypedDocumentNode } from "@apollo/client";

const BACKEND_GRAPHQL_URL = process.env.BACKEND_GRAPHQL_URL ?? "http://localhost:4000/graphql";

export type GraphQLErrorShape = {
  message: string;
  extensions?: { code?: string; [key: string]: unknown };
};

export type GraphQLResponse<TData = unknown> = {
  data?: TData | null;
  errors?: GraphQLErrorShape[];
};

/** Raw POST to the backend. `body` is an already-serialized GraphQL request. */
export async function postToBackend(body: string, accessToken?: string) {
  const res = await fetch(BACKEND_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body,
    cache: "no-store",
  });
  const json = (await res.json()) as GraphQLResponse;
  return { status: res.status, json };
}

export async function backendRequest<TData, TVariables>(
  document: TypedDocumentNode<TData, TVariables>,
  variables: TVariables,
  accessToken?: string,
): Promise<GraphQLResponse<TData>> {
  const { json } = await postToBackend(JSON.stringify({ query: print(document), variables }), accessToken);
  return json as GraphQLResponse<TData>;
}

export function hasErrorCode(response: GraphQLResponse, code: string) {
  return response.errors?.some((e) => e.extensions?.code === code) ?? false;
}
