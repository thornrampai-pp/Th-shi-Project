"use client";

import { useTransition } from "react";
import { removeFromWatchlistAction } from "@/actions/watchlist";

export default function RemoveButton({ watchListId, assetId }: { watchListId: string; assetId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Remove this stock from your watchlist? Your notes will be kept.")) return;
        startTransition(async () => {
          const res = await removeFromWatchlistAction(watchListId, assetId);
          if (res?.error) alert(res.error);
        });
      }}
      className="text-sm text-muted-foreground hover:text-loss disabled:opacity-50"
    >
      Remove from watchlist
    </button>
  );
}
