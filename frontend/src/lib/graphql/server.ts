import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { TypedDocumentNode } from "@apollo/client";
import { backendRequest, hasErrorCode } from "@/lib/graphql/backend";
import { ACCESS_COOKIE } from "@/lib/auth/tokens";

export class GraphQLRequestError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "GraphQLRequestError";
  }
}

/**
 * Query the backend from a Server Component / Server Function as the current user.
 * proxy.ts has already refreshed the access cookie for this request, so an
 * UNAUTHORIZED here means the session is gone.
 */
export async function serverQuery<TData, TVariables>(
  document: TypedDocumentNode<TData, TVariables>,
  ...[variables]: TVariables extends Record<string, never> ? [] : [TVariables]
): Promise<TData> {
  const accessToken = (await cookies()).get(ACCESS_COOKIE)?.value;
  const res = await backendRequest(document, (variables ?? {}) as TVariables, accessToken);

  if (hasErrorCode(res, "UNAUTHORIZED")) redirect("/login");
  if (res.errors?.length || !res.data) {
    const first = res.errors?.[0];
    throw new GraphQLRequestError(first?.message ?? "Empty response", first?.extensions?.code);
  }
  return res.data;
}
