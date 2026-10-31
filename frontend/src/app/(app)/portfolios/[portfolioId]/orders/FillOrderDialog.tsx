"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { fillOrderAction } from "@/actions/trading";
import { localMomentIso, todayLocal } from "@/lib/dates";

const fieldClass = "w-full rounded-md bg-muted px-3 py-2 text-sm outline-none";

type Props = { orderId: string; symbol: string; currency: string | null; onClose: () => void };

/** Records the broker's actual execution of a REAL-portfolio order — nothing here trades. */
export default function FillOrderDialog({ orderId, symbol, currency, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [fillPrice, setFillPrice] = useState("");
  const [fee, setFee] = useState("");
  const [date, setDate] = useState(todayLocal);
  const [time, setTime] = useState("");
  const [error, setError] = useState("");
  const [saving, startSave] = useTransition();

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    startSave(async () => {
      setError("");
      const executedAt = time ? localMomentIso(date, time) : new Date(`${date}T12:00:00.000Z`).toISOString();
      const res = await fillOrderAction(orderId, {
        fillPrice: Number(fillPrice),
        fee: fee ? Number(fee) : undefined,
        executedAt,
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
        <h2 className="font-semibold">Record fill — {symbol}</h2>
        <p className="text-xs text-muted-foreground">
          Enter what the broker actually executed. This records the transaction; it doesn&apos;t place a trade.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Fill price{currency ? ` (${currency})` : ""}</span>
            <input
              autoFocus
              required
              type="number"
              min="0"
              step="any"
              value={fillPrice}
              onChange={(e) => setFillPrice(e.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Fee (optional)</span>
            <input type="number" min="0" step="any" value={fee} onChange={(e) => setFee(e.target.value)} className={fieldClass} />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Date</span>
            <input required type="date" max={todayLocal()} value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Time (optional)</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={fieldClass} />
          </label>
        </div>
        {error && <p className="text-sm text-loss">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !(Number(fillPrice) > 0)}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Saving…" : "Record fill"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
