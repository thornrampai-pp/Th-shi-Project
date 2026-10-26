import { ApolloClient, ApolloLink, CombinedGraphQLErrors, HttpLink, InMemoryCache } from "@apollo/client";
import { ErrorLink } from "@apollo/client/link/error";

export function makeApolloClient() {
  // /api/graphql has already tried refreshing; UNAUTHORIZED here means the session is over.
  const errorLink = new ErrorLink(({ error }) => {
    if (
      CombinedGraphQLErrors.is(error) &&
      error.errors.some((e) => e.extensions?.code === "UNAUTHORIZED") &&
      typeof window !== "undefined"
    ) {
      // Full reload on purpose: drops the Apollo cache of the dead session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    }
  });

  return new ApolloClient({
    link: ApolloLink.from([errorLink, new HttpLink({ uri: "/api/graphql" })]),
    cache: new InMemoryCache(),
  });
}
