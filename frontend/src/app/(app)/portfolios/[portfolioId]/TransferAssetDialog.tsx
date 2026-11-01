"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { transferAssetAction } from "@/actions/portfolio";
import { formatQuantity } from "@/lib/format";
import type { PortfolioListItem } from "../data";

const fieldClass = "w-full rounded-md bg-muted px-3 py-2 text-sm outline-none";

type Props = {
  portfolioId: string;
  assetId: string;
  symbol: string;
  quantity: number;
  otherPortfolios: PortfolioListItem[];
  onClose: () => void;
};

/** Moves this holding to one of the user's other portfolios — not a sale, keeps cost basis. */
export default function TransferAssetDialog({ portfolioId, assetId, symbol, quantity, otherPortfolios, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [toPortfolioId, setToPortfolioId] = useState(otherPortfolios[0]?.id ?? "");
  const [transferQty, setTransferQty] = useState(String(quantity));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, startSave] = useTransition();

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!toPortfolioId) return;
    startSave(async () => {
      setError("");
      const res = await transferAssetAction(portfolioId, {
        toPortfolioId,
        assetId,
        quantity: Number(transferQty),
        note: note.trim() || undefined,
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
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/40"
    >
      <div className="space-y-4 p-5">
        <h2 className="font-semibold">Transfer {symbol}</h2>
        <p className="text-xs text-muted-foreground">
          Moves shares to another one of your portfolios — not a sale, so nothing is realized. The original cost
          basis and purchase date move with it.
        </p>

        {otherPortfolios.length === 0 ? (
          <p className="text-sm text-muted-foreground">You don&apos;t have another portfolio to transfer into yet.</p>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">To portfolio</span>
              <select value={toPortfolioId} onChange={(e) => setToPortfolioId(e.target.value)} className={fieldClass}>
                {otherPortfolios.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.type})
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">Quantity</span>
              <input
                autoFocus
                required
                type="number"
                min="0"
                max={quantity}
                step="any"
                value={transferQty}
                onChange={(e) => setTransferQty(e.target.value)}
                className={fieldClass}
              />
              <span className="block text-xs text-muted-foreground">Holding: {formatQuantity(quantity)}</span>
            </label>

            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">Note (optional)</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} className={fieldClass} />
            </label>

            {error && <p className="text-sm text-loss">{error}</p>}

            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !(Number(transferQty) > 0) || Number(transferQty) > quantity}
                className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
              >
                {saving ? "Transferring…" : "Transfer"}
              </button>
            </div>
          </form>
        )}

        {otherPortfolios.length === 0 && (
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
