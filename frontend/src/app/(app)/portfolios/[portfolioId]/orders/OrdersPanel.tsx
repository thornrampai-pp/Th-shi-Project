"use client";

import { useState, useTransition } from "react";
import { cancelOrderAction, dismissSignalAction } from "@/actions/trading";
import { formatDate } from "@/lib/dates";
import { formatMoney, formatQuantity } from "@/lib/format";
import type { Order, TradingSignal } from "../../data";
import ExecuteSignalDialog from "./ExecuteSignalDialog";
import FillOrderDialog from "./FillOrderDialog";
import PlaceOrderDialog from "./PlaceOrderDialog";

const OPEN_STATUSES = new Set(["PENDING", "PARTIALLY_FILLED"]);

const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-field",
  PARTIALLY_FILLED: "bg-amber-500/20 text-amber-700",
  FILLED: "bg-gain/20 text-gain",
  CANCELLED: "bg-field text-muted-foreground",
  REJECTED: "bg-loss/20 text-loss",
};

type Props = {
  portfolioId: string;
  portfolioType: string;
  orders: Order[];
  signals: TradingSignal[];
};

export default function OrdersPanel({ portfolioId, portfolioType, orders, signals }: Props) {
  const [placing, setPlacing] = useState(false);
  const [filling, setFilling] = useState<Order | null>(null);
  const [executing, setExecuting] = useState<TradingSignal | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelling, startCancel] = useTransition();
  const [dismissing, startDismiss] = useTransition();
  const [error, setError] = useState("");

  const cancel = (id: string) => {
    setError("");
    setBusyId(id);
    startCancel(async () => {
      const res = await cancelOrderAction(id);
      if (res.error) setError(res.error);
      setBusyId(null);
    });
  };

  const dismiss = (id: string) => {
    setError("");
    setBusyId(id);
    startDismiss(async () => {
      const res = await dismissSignalAction(id);
      if (res.error) setError(res.error);
      setBusyId(null);
    });
  };

  return (
    <section className="space-y-6">
      {signals.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold">Open signals</h2>
          <ul className="divide-y divide-border/60 rounded-md bg-muted px-4">
            {signals.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p>
                    <span className="font-semibold">{s.signalType}</span> {s.symbol} @ {formatMoney(s.price, s.currency ?? undefined)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.source || "external"} · {formatDate(s.createdAt)}
                    {s.strength != null && ` · strength ${(s.strength * 100).toFixed(0)}%`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setExecuting(s)}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90"
                  >
                    Execute
                  </button>
                  <button
                    type="button"
                    onClick={() => dismiss(s.id)}
                    disabled={dismissing && busyId === s.id}
                    className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-background disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => setPlacing(true)}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
          >
            + Place order
          </button>
        </div>

        <div className="overflow-x-auto rounded-md bg-muted">
          <table className="w-full min-w-[50rem] text-sm">
            <thead>
              <tr className="bg-chrome text-left text-xs font-medium text-white">
                <th className="px-4 py-2.5">Asset</th>
                <th className="px-4 py-2.5">Side</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5 text-right">Quantity</th>
                <th className="px-4 py-2.5 text-right">Filled</th>
                <th className="px-4 py-2.5 text-right">Avg fill</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Submitted</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 tabular-nums">
              {orders.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-muted-foreground">
                    No orders yet. Use “+ Place order” to submit one.
                  </td>
                </tr>
              )}
              {orders.map((o) => {
                const open = OPEN_STATUSES.has(o.status);
                return (
                  <tr key={o.id}>
                    <td className="px-4 py-2.5 font-semibold">{o.symbol}</td>
                    <td className="px-4 py-2.5">{o.side}</td>
                    <td className="px-4 py-2.5">
                      {o.orderType}
                      {o.limitPrice != null && <span className="text-xs text-muted-foreground"> @ {formatMoney(o.limitPrice)}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">{formatQuantity(o.quantity)}</td>
                    <td className="px-4 py-2.5 text-right">{formatQuantity(o.filledQty)}</td>
                    <td className="px-4 py-2.5 text-right">{o.avgFillPrice != null ? formatMoney(o.avgFillPrice) : "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_TONE[o.status] ?? "bg-field"}`}>
                        {o.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(o.submittedAt)}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {open && (
                        <div className="flex justify-end gap-2">
                          {portfolioType === "REAL" && (
                            <button
                              type="button"
                              onClick={() => setFilling(o)}
                              className="rounded-md border border-border px-3 py-1 text-xs hover:bg-background"
                            >
                              Record fill
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => cancel(o.id)}
                            disabled={cancelling && busyId === o.id}
                            className="rounded-md border border-border px-3 py-1 text-xs hover:bg-background disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {error && <p className="text-sm text-loss">{error}</p>}
      </div>

      {placing && <PlaceOrderDialog portfolioId={portfolioId} onClose={() => setPlacing(false)} />}
      {filling && (
        <FillOrderDialog orderId={filling.id} symbol={filling.symbol} currency={filling.currency} onClose={() => setFilling(null)} />
      )}
      {executing && (
        <ExecuteSignalDialog
          signalId={executing.id}
          symbol={executing.symbol}
          signalType={executing.signalType}
          price={executing.price}
          onClose={() => setExecuting(null)}
        />
      )}
    </section>
  );
}
