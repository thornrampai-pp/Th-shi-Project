"use client";

import { useState } from "react";
import { ApolloProvider } from "@apollo/client/react";
import { makeApolloClient } from "@/lib/apollo/client";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(makeApolloClient);
  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
