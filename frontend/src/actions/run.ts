import "server-only";
import { refresh } from "next/cache";
import { GraphQLRequestError } from "@/lib/graphql/server";

export type ActionResult = { error?: string };

// Only GraphQL/network failures become a message; redirect() and other
// framework control flow must keep propagating.
export async function run(fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof GraphQLRequestError) return { error: e.message };
    if (e instanceof TypeError) return { error: "Couldn't reach the server" };
    throw e;
  }
  refresh();
  return {};
}
