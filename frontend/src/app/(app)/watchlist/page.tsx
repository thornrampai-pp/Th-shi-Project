import type { Metadata } from "next";
import { getWatchlistOverview } from "./data";
import WatchlistGrid from "./WatchlistGrid";

export const metadata: Metadata = { title: "Watchlist" };

export default async function WatchlistPage() {
  const { items } = await getWatchlistOverview();
  return <WatchlistGrid items={items} />;
}
