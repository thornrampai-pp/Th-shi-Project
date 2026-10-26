"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import AddStockDialog from "./AddStockDialog";
import StatusBadge from "./StatusBadge";
import type { WatchlistItem } from "./data";

export default function WatchlistGrid({ items }: { items: WatchlistItem[] }) {
  const [query, setQuery] = useState("");
  const [newestFirst, setNewestFirst] = useState(true);
  const [adding, setAdding] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? items.filter((i) => i.asset.symbol.toLowerCase().includes(q) || i.asset.name.toLowerCase().includes(q))
      : items;
    return [...filtered].sort((a, b) => {
      const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return newestFirst ? diff : -diff;
    });
  }, [items, query, newestFirst]);

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          aria-label="Search watchlist"
          className="min-w-0 flex-1 rounded-md bg-field px-4 py-2 text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
        />
        <button
          type="button"
          onClick={() => setNewestFirst((v) => !v)}
          className="w-32 shrink-0 rounded-md bg-field py-2 text-center text-sm hover:bg-field/70"
        >
          {newestFirst ? "Newest first" : "Oldest first"}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="py-24 text-center text-sm text-muted-foreground">Your watchlist is empty. Press + to add a stock.</p>
      ) : visible.length === 0 ? (
        <p className="py-24 text-center text-sm text-muted-foreground">No stocks match &quot;{query}&quot;</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => (
            <li key={item.id}>
              <Link
                href={`/watchlist/${item.asset.id}`}
                className="flex h-36 flex-col justify-between rounded-md bg-muted p-4 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold">{item.asset.symbol}</span>
                    <span className="text-xs text-muted-foreground">#{item.asset.type}</span>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{item.asset.name}</p>
                </div>
                <StatusBadge status={item.status} className="self-start" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setAdding(true)}
        aria-label="Add stock"
        className="fixed right-8 bottom-8 flex size-12 items-center justify-center rounded-full bg-primary text-2xl text-primary-foreground shadow-lg transition hover:scale-110"
      >
        +
      </button>

      {adding && <AddStockDialog existingIds={new Set(items.map((i) => i.asset.id))} onClose={() => setAdding(false)} />}
    </div>
  );
}
