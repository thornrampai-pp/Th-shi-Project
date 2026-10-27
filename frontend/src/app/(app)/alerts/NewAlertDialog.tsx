"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createAlertAction } from "@/actions/alerts";
import { searchAssetsAction } from "@/actions/watchlist";
import type { AlertCondition } from "@/gql/graphql";
import type { Asset } from "@/lib/graphql/normalize";
import { CONDITIONS } from "./conditions";
import Select from "@/components/Select";

const fieldClass = "w-full rounded-md bg-muted px-3 py-2 text-sm outline-none";

export default function NewAlertDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Asset[] | null>(null);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [condition, setCondition] = useState<AlertCondition>("PRICE_ABOVE");
  const [target, setTarget] = useState("");
  const [error, setError] = useState("");
  const [searching, startSearch] = useTransition();
  const [saving, startSave] = useTransition();

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

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!asset) return;
    startSave(async () => {
      setError("");
      const res = await createAlertAction(asset.id, condition, Number(target));
      if (res.error) setError(res.error);
      else onClose();
    });
  };

  const unit = CONDITIONS.find((c) => c.value === condition)?.unit;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => e.target === dialogRef.current && onClose()}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/40"
    >
      <div className="space-y-4 p-5">
        <h2 className="font-semibold">New alert</h2>

        {!asset ? (
          <>
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
            {results && results.length > 0 && (
              <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {results.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => setAsset(a)}
                      className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-muted"
                    >
                      <span className="text-sm font-medium">{a.symbol}</span>
                      <span className="w-full truncate text-xs text-muted-foreground">{a.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {error && <p className="text-sm text-loss">{error}</p>}
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
                Close
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{asset.symbol}</p>
                <p className="truncate text-xs text-muted-foreground">{asset.name}</p>
              </div>
              <button type="button" onClick={() => setAsset(null)} className="text-xs text-muted-foreground hover:text-foreground">
                Change
              </button>
            </div>

            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">When</span>
                <Select block value={condition} onChange={(e) => setCondition(e.target.value as AlertCondition)} className={fieldClass}>
                  {CONDITIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">{unit === "%" ? "Value (%)" : unit === "x" ? "Value" : "Price"}</span>
                <input
                  autoFocus
                  required
                  type="number"
                  step="any"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className={fieldClass}
                />
              </label>
            </div>

            {error && <p className="text-sm text-loss">{error}</p>}

            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || target === "" || Number.isNaN(Number(target))}
                className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
              >
                {saving ? "Saving…" : "Create alert"}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
