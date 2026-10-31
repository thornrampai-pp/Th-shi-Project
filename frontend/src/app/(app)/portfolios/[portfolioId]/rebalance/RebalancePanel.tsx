"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { recordRebalanceAction, setTargetWeightAction } from "@/actions/rebalance";
import { formatMoney, formatQuantity, formatSignedPct, plColor } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import type { Holding, RebalanceDriftItem, RebalanceLog } from "../../data";

type Row = {
  assetId: string;
  symbol: string;
  currentWeight: number;
  targetWeight: number | null;
  driftPct: number | null;
  suggestedValue: number | null;
  suggestedQuantity: number | null;
};

type Props = {
  portfolioId: string;
  currency: string;
  holdings: Holding[];
  driftItems: RebalanceDriftItem[] | null;
  logs: RebalanceLog[];
};

const fieldClass = "w-20 rounded-md bg-field px-2 py-1 text-right text-sm outline-none";

export default function RebalancePanel({ portfolioId, currency, holdings, driftItems, logs }: Props) {
  const driftByAsset = new Map((driftItems ?? []).map((i) => [i.assetId, i]));
  const rows: Row[] = holdings.map((h) => {
    const drift = driftByAsset.get(h.assetId);
    return {
      assetId: h.assetId,
      symbol: h.symbol,
      currentWeight: drift?.currentWeight ?? h.weight,
      targetWeight: drift?.targetWeight ?? null,
      driftPct: drift?.driftPct ?? null,
      suggestedValue: drift?.suggestedValue ?? null,
      suggestedQuantity: drift?.suggestedQuantity ?? null,
    };
  });

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, startSave] = useTransition();
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);

  const draftFor = (row: Row) => drafts[row.assetId] ?? (row.targetWeight != null ? String(row.targetWeight) : "");

  const save = (assetId: string, value: string) => {
    setError("");
    const parsed = value.trim() === "" ? null : Number(value);
    if (parsed != null && !(parsed >= 0 && parsed <= 100)) {
      setError("Target must be between 0 and 100");
      return;
    }
    startSave(async () => {
      const res = await setTargetWeightAction(portfolioId, assetId, parsed);
      if (res.error) setError(res.error);
      else setDrafts((d) => ({ ...d, [assetId]: parsed == null ? "" : String(parsed) }));
    });
  };

  const hasAnyTarget = rows.some((r) => r.targetWeight != null);

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Set a target allocation % for a holding to see how far it&apos;s drifted and the buy/sell needed to get
            back on target. Nothing here places an order — record your own trades after acting on it.
          </p>
          <button
            type="button"
            onClick={() => setRecording(true)}
            disabled={!hasAnyTarget}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Record rebalance
          </button>
        </div>

        <div className="overflow-x-auto rounded-md bg-muted">
          <table className="w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="bg-chrome text-left text-xs font-medium text-white">
                <th className="px-4 py-2.5">Asset</th>
                <th className="px-4 py-2.5 text-right">Current %</th>
                <th className="px-4 py-2.5 text-right">Target %</th>
                <th className="px-4 py-2.5 text-right">Drift</th>
                <th className="px-4 py-2.5 text-right">Suggested</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 tabular-nums">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center text-muted-foreground">
                    No holdings yet.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.assetId}>
                  <td className="px-4 py-2.5 font-semibold">{row.symbol}</td>
                  <td className="px-4 py-2.5 text-right">{row.currentWeight.toFixed(1)}%</td>
                  <td className="px-4 py-2.5 text-right">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      placeholder="—"
                      disabled={saving}
                      value={draftFor(row)}
                      onChange={(e) => setDrafts((d) => ({ ...d, [row.assetId]: e.target.value }))}
                      onBlur={(e) => save(row.assetId, e.target.value)}
                      className={fieldClass}
                    />
                  </td>
                  <td className={`px-4 py-2.5 text-right ${row.driftPct != null ? plColor(-row.driftPct) : ""}`}>
                    {row.driftPct != null ? formatSignedPct(row.driftPct) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {row.suggestedValue == null ? (
                      <span className="text-muted-foreground">Set a target</span>
                    ) : Math.abs(row.suggestedValue) < 1 ? (
                      <span className="text-muted-foreground">On target</span>
                    ) : (
                      <span className={row.suggestedValue > 0 ? "text-gain" : "text-loss"}>
                        {row.suggestedValue > 0 ? "Buy" : "Sell"}{" "}
                        {row.suggestedQuantity != null ? formatQuantity(Math.abs(row.suggestedQuantity)) : ""}{" "}
                        ({formatMoney(Math.abs(row.suggestedValue), currency)})
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error && <p className="text-sm text-loss">{error}</p>}
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold">History</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rebalance recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-md bg-muted px-4">
            {logs.map((log) => (
              <li key={log.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p>{formatDate(log.executedAt)}</p>
                  {log.description && <p className="truncate text-xs text-muted-foreground">{log.description}</p>}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatMoney(log.totalValueBefore, currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {recording && (
        <RecordRebalanceDialog portfolioId={portfolioId} onClose={() => setRecording(false)} />
      )}
    </section>
  );
}

function RecordRebalanceDialog({ portfolioId, onClose }: { portfolioId: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [saving, startSave] = useTransition();

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    startSave(async () => {
      const res = await recordRebalanceAction(portfolioId, description.trim() || undefined);
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
      <form onSubmit={save} className="space-y-4 p-5">
        <h2 className="font-semibold">Record rebalance</h2>
        <p className="text-xs text-muted-foreground">
          Snapshots the drift shown above so you can look back on it later. Doesn&apos;t place or change anything.
        </p>
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">Note (optional)</span>
          <textarea
            autoFocus
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-md bg-muted px-3 py-2 text-sm outline-none"
          />
        </label>
        {error && <p className="text-sm text-loss">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Saving…" : "Record"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
