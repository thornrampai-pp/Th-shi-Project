"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { executeSignalAction } from "@/actions/trading";
import type { OrderType } from "@/gql/graphql";

const fieldClass = "w-full rounded-md bg-muted px-3 py-2 text-sm outline-none";

type Props = { signalId: string; symbol: string; signalType: string; price: number; onClose: () => void };

export default function ExecuteSignalDialog({ signalId, symbol, signalType, price, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [quantity, setQuantity] = useState("");
  const [limitPrice, setLimitPrice] = useState(String(price));
  const [error, setError] = useState("");
  const [saving, startSave] = useTransition();

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    startSave(async () => {
      setError("");
      const res = await executeSignalAction(signalId, {
        quantity: Number(quantity),
        orderType,
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
      className="m-auto w-[min(24rem,calc(100vw-2rem))] rounded-2xl bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/40"
    >
      <form onSubmit={save} className="space-y-4 p-5">
        <h2 className="font-semibold">
          Execute signal — {signalType} {symbol}
        </h2>
        <p className="text-xs text-muted-foreground">Places an order from this signal. The signal is then marked executed.</p>
        <div className="grid grid-cols-2 gap-3">
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
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Order type</span>
            <select value={orderType} onChange={(e) => setOrderType(e.target.value as OrderType)} className={fieldClass}>
              <option value="MARKET">Market</option>
              <option value="LIMIT">Limit</option>
            </select>
          </label>
          {orderType === "LIMIT" && (
            <label className="col-span-2 block space-y-1 text-sm">
              <span className="text-muted-foreground">Limit price</span>
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
            {saving ? "Placing…" : "Execute"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
