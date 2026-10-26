import { cookies } from "next/headers";
import { getWatchlistOverview } from "./data";
import { DRAWER_COOKIE } from "./drawer-cookie";
import WatchlistDrawer from "./WatchlistDrawer";

export default async function WatchlistLayout({ children }: { children: React.ReactNode }) {
  const [{ items }, store] = await Promise.all([getWatchlistOverview(), cookies()]);
  // Read on the server so the drawer renders in its saved state without a flash.
  const initialOpen = store.get(DRAWER_COOKIE)?.value !== "0";

  return (
    <WatchlistDrawer items={items} initialOpen={initialOpen}>
      {children}
    </WatchlistDrawer>
  );
}
