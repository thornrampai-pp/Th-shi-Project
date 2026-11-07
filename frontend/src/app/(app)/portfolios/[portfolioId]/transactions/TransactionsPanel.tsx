"use client";

import { useMemo, useState } from "react";
import Th from "@/components/Th";
import { Private } from "@/components/AmountPrivacy";
import { formatDate } from "@/lib/dates";
import { formatMoney, formatQuantity, formatSignedMoney, plColor } from "@/lib/format";
import type { Transaction } from "../../data";
import RecordTransactionDialog, { type HoldingOption } from "./RecordTransactionDialog";
import Select from "@/components/Select";

const TYPE_LABEL: Record<string, string> = {
  BUY: "Buy",
  SELL: "Sell",
  DEPOSIT: "Deposit",
  WITHDRAW: "Withdraw",
  DIVIDEND: "Dividend",
  REPATRIATION: "Repatriation",
  FEE: "Fee",
  TAX: "Tax",
  SPLIT: "Split",
  ADJUSTMENT: "Adjustment",
  TRANSFER_OUT: "Transfer out",
  TRANSFER_IN: "Transfer in",
};

/** Money (or, for a transfer, cost basis) leaving the portfolio is shown negative. */
const OUTFLOW = new Set(["BUY", "WITHDRAW", "FEE", "TAX", "TRANSFER_OUT"]);

type Props = {
  portfolioId: string;
  transactions: Transaction[];
  holdings: HoldingOption[];
  currencies: string[];
};

export default function TransactionsPanel({ portfolioId, transactions, holdings, currencies }: Props) {
  const [type, setType] = useState("ALL");
  const [recording, setRecording] = useState(false);
  const types = useMemo(() => [...new Set(transactions.map((t) => t.type))], [transactions]);
  const rows = type === "ALL" ? transactions : transactions.filter((t) => t.type === type);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Select
          value={type}
          onChange={(e) => setType(e.target.value)}
          aria-label="Filter by type"
          className="rounded-md bg-field px-4 py-2 text-sm outline-none hover:bg-field/70"
        >
          <option value="ALL">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t] ?? t}
            </option>
          ))}
        </Select>
        <button
          type="button"
          onClick={() => setRecording(true)}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
        >
          + Record transaction
        </button>
      </div>

      <div className="overflow-x-auto rounded-md bg-muted">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="bg-chrome text-left text-xs font-medium text-white">
              <Th title="Date" hint="trade date" />
              <Th title="Type" hint="and note" />
              <Th title="Asset" hint="symbol" />
              <Th title="Quantity × Price" hint="units × price per unit" align="right" />
              <Th title="Amount" hint="cash in (+) / out (−)" align="right" />
              <Th title="Realized P/L" hint="profit locked in on sells" align="right" />
              <Th title="Slip" hint="proof attached" align="center" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 tabular-nums [&_td]:align-top">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                  {transactions.length === 0 ? "No transactions yet." : "No transactions of this type."}
                </td>
              </tr>
            )}
            {rows.map((t) => (
              <tr key={t.id} className="align-top">
                <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(t.executedAt)}</td>
                <td className="px-4 py-2.5">
                  <span className="rounded bg-field px-1.5 py-0.5 text-xs font-medium">{TYPE_LABEL[t.type] ?? t.type}</span>
                  {t.autoFunded && (
                    <span
                      className="ml-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-600 dark:text-amber-400"
                      title="Created automatically to fund a buy (from a statement, slip or “fund with deposit”) — not money you actually transferred in"
                    >
                      auto
                    </span>
                  )}
                  {t.note && <p className="mt-1 max-w-56 truncate text-xs text-muted-foreground" title={t.note}>{t.note}</p>}
                </td>
                <td className="px-4 py-2.5 font-semibold">{t.assetSymbol ?? "—"}</td>
                <td className="px-4 py-2.5 text-right">
                  {t.quantity != null && t.price != null ? (
                    <>
                      <Private>{formatQuantity(t.quantity)}</Private> × {formatMoney(t.price)}
                    </>
                  ) : t.quantity != null ? (
                    <Private>{formatQuantity(t.quantity)}</Private>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  {t.amount != null ? (
                    <Private>{formatSignedMoney(OUTFLOW.has(t.type) ? -t.amount : t.amount, t.currency ?? undefined)}</Private>
                  ) : (
                    "—"
                  )}
                  {(t.fee > 0 || t.taxWithheld > 0) && (
                    <p className="text-xs text-muted-foreground">
                      {t.fee > 0 && <>fee <Private>{formatMoney(t.fee)}</Private></>}
                      {t.fee > 0 && t.taxWithheld > 0 && " · "}
                      {t.taxWithheld > 0 && <>tax <Private>{formatMoney(t.taxWithheld)}</Private></>}
                    </p>
                  )}
                </td>
                <td className={`px-4 py-2.5 text-right ${t.realizedPL != null ? plColor(t.realizedPL) : ""}`}>
                  {t.realizedPL != null ? <Private>{formatSignedMoney(t.realizedPL)}</Private> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {t.hasSlip ? (
                    <span className="text-gain" title="Slip attached">
                      ✓<span className="sr-only">Slip attached</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground" title="No slip">
                      —<span className="sr-only">No slip</span>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {transactions.length >= 200 && (
        <p className="text-xs text-muted-foreground">Showing the latest 200 transactions.</p>
      )}

      {recording && (
        <RecordTransactionDialog
          portfolioId={portfolioId}
          holdings={holdings}
          currencies={currencies}
          onClose={() => setRecording(false)}
        />
      )}
    </section>
  );
}
