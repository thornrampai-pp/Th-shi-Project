"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { placeOrderAction } from "@/actions/trading";
import { searchAssetsAction } from "@/actions/watchlist";
import type { OrderSide, OrderType } from "@/gql/graphql";
import type { Asset } from "@/lib/graphql/normalize";

const fieldClass = "w-full rounded-md bg-muted px-3 py-2 text-sm outline-none";

export default function PlaceOrderDialog({ portfolioId, onClose }: { portfolioId: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Asset[] | null>(null);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [side, setSide] = useState<OrderSide>("BUY");
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [quantity, setQuantity] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
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
      const res = await placeOrderAction(portfolioId, {
        assetId: asset.id,
        side,
        orderType,
        quantity: Number(quantity),
        limitPrice: orderType === "LIMIT" ? Number(limitPrice) : undefined,
      });
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
        <h2 className="font-semibold">Place order</h2>

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
                <span className="text-muted-foreground">Side</span>
                <select value={side} onChange={(e) => setSide(e.target.value as OrderSide)} className={fieldClass}>
                  <option value="BUY">Buy</option>
                  <option value="SELL">Sell</option>
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">Order type</span>
                <select value={orderType} onChange={(e) => setOrderType(e.target.value as OrderType)} className={fieldClass}>
                  <option value="MARKET">Market</option>
                  <option value="LIMIT">Limit</option>
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">Quantity</span>
                <input
                  autoFocus
                  required
                  type="number"
                  min="0"
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className={fieldClass}
                />
              </label>
              {orderType === "LIMIT" && (
                <label className="block space-y-1 text-sm">
                  <span className="text-muted-foreground">Limit price{asset.currency ? ` (${asset.currency})` : ""}</span>
                  <input
                    required
                    type="number"
                    min="0"
                    step="any"
                    value={limitPrice}
                    onChange={(e) => setLimitPrice(e.target.value)}
                    className={fieldClass}
                  />
                </label>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              A paper portfolio fills a market order immediately and a limit order once the price crosses. A real
              portfolio stays pending until you record the broker&apos;s actual fill.
            </p>

            {error && <p className="text-sm text-loss">{error}</p>}

            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !(Number(quantity) > 0) || (orderType === "LIMIT" && !(Number(limitPrice) > 0))}
                className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
              >
                {saving ? "Placing…" : "Place order"}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
