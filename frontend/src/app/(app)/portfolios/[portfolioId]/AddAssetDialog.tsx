"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { addAssetAction } from "@/actions/portfolio";
import { searchAssetsAction } from "@/actions/watchlist";
import { todayLocal } from "@/lib/dates";
import type { Asset } from "@/lib/graphql/normalize";

const fieldClass = "w-full rounded-md bg-muted px-3 py-2 text-sm outline-none";

/** Search for an asset, then record it as a BUY in this portfolio. */
export default function AddAssetDialog({ portfolioId, onClose }: { portfolioId: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Asset[] | null>(null);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("");
  const [date, setDate] = useState(todayLocal);
  const [fundWithDeposit, setFundWithDeposit] = useState(true);
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
      const res = await addAssetAction(portfolioId, {
        assetId: asset.id,
        quantity: Number(quantity),
        price: Number(price),
        fee: fee ? Number(fee) : undefined,
        executedOn: date,
        fundWithDeposit,
      });
      if (res.error) setError(res.error);
      else onClose();
    });
  };

  const total = Number(quantity) * Number(price) + (Number(fee) || 0);
  const ccy = asset?.currency ? ` (${asset.currency})` : "";

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => e.target === dialogRef.current && onClose()}
      className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-2xl bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/40"
    >
      <div className="space-y-4 p-5">
        <h2 className="font-semibold">Add asset</h2>

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
                      <span className="text-sm font-medium">
                        {a.symbol}{" "}
                        <span className="text-xs text-muted-foreground">
                          #{a.type}
                          {a.currency && ` · ${a.currency}`}
                        </span>
                      </span>
                      <span className="w-full truncate text-xs text-muted-foreground">{a.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {asset.symbol}
                  {asset.currency && <span className="ml-2 text-xs font-normal text-muted-foreground">Trades in {asset.currency}</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{asset.name}</p>
              </div>
              <button type="button" onClick={() => setAsset(null)} className="text-xs text-muted-foreground hover:text-foreground">
                Change
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">Quantity</span>
                <input
                  autoFocus
                  required
                  type="number"
                  min="0"
                  step="any"
                  placeholder="e.g. 100 or 0.25"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">Price per unit{ccy}</span>
                <input
                  required
                  type="number"
                  min="0"
                  step="any"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">Fee{ccy} (optional)</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">Bought on</span>
                <input
                  required
                  type="date"
                  max={todayLocal()}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={fieldClass}
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Quantity can be fractional (up to 8 decimals). Price and fee are in{" "}
              {asset.currency ?? "the asset's trading currency"}.
            </p>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={fundWithDeposit}
                onChange={(e) => setFundWithDeposit(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Also record a deposit of the cost
                <span className="block text-xs text-muted-foreground">
                  For shares bought outside Tōshi. Untick to pay from this portfolio&apos;s cash instead.
                </span>
              </span>
            </label>

            {total > 0 && (
              <p className="text-sm">
                Total cost{" "}
                <span className="font-semibold tabular-nums">
                  {total.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  {asset.currency && ` ${asset.currency}`}
                </span>
              </p>
            )}

            {error && <p className="text-sm text-loss">{error}</p>}

            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !(Number(quantity) > 0) || !(Number(price) > 0)}
                className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
              >
                {saving ? "Saving…" : "Add"}
              </button>
            </div>
          </form>
        )}

        {!asset && error && <p className="text-sm text-loss">{error}</p>}
        {!asset && (
          <div className="flex justify-end">
            <button type="button" onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
              Close
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
}
