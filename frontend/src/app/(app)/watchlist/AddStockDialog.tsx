"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { addToWatchlistAction, searchAssetsAction } from "@/actions/watchlist";
import type { Asset } from "@/lib/graphql/normalize";

export default function AddStockDialog({ existingIds, onClose }: { existingIds: Set<string>; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Asset[] | null>(null);
  const [error, setError] = useState("");
  const [searching, startSearch] = useTransition();
  const [adding, startAdd] = useTransition();

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    startSearch(async () => {
      setError("");
      const res = await searchAssetsAction(query);
      setResults(res.assets);
      if (res.error) setError(res.error);
    });
  };

  const add = (asset: Asset) => {
    startAdd(async () => {
      const res = await addToWatchlistAction(asset.id);
      if (res.error) setError(res.error);
      else onClose();
    });
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => e.target === dialogRef.current && onClose()}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/40"
    >
      <div className="space-y-4 p-5">
        <h2 className="font-semibold">Add to watchlist</h2>

        <form onSubmit={search} className="flex gap-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or symbol, e.g. AAPL, PTT.BK"
            className="min-w-0 flex-1 rounded-md bg-muted px-3 py-2 text-sm outline-none"
          />
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="rounded-lg bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50"
          >
            {searching ? "…" : "Search"}
          </button>
        </form>

        {error && <p className="text-sm text-loss">{error}</p>}

        {results && results.length > 0 && (
          <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {results.map((asset) => {
              const added = existingIds.has(asset.id);
              return (
                <li key={asset.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {asset.symbol} <span className="text-xs text-muted-foreground">#{asset.type}</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{asset.name}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => add(asset)}
                    disabled={added || adding}
                    className="shrink-0 rounded-md border border-border px-3 py-1 text-xs hover:bg-muted disabled:opacity-50"
                  >
                    {added ? "Added" : "Add"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">
          If it isn&apos;t in the system yet, the exact symbol is looked up on Yahoo Finance (add .BK for Thai stocks).
        </p>

        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}
