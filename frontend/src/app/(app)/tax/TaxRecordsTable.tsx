"use client";

import { useState, useTransition } from "react";
import { setTaxRecordStatusAction } from "@/actions/tax";
import type { TaxStatus } from "@/gql/graphql";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";

export const TAX_TYPE_LABEL: Record<string, string> = {
  PERSONAL_INCOME: "Dividend",
  WITHHOLDING: "Dividend (tax withheld)",
  CAPITAL_GAIN: "Capital gain",
};

const STATUSES: TaxStatus[] = ["PENDING", "FILED", "PAID"];

type TaxRecordRow = {
  id: string;
  portfolioName: string;
  taxType: string;
  sourceCountry: string;
  incomeAmount: number;
  currency: string | null;
  convertedAmountTHB: number;
  fxRate: number;
  earnedYear: number;
  status: TaxStatus;
  executedAt: string;
  assetSymbol: string | null;
};

export default function TaxRecordsTable({ records }: { records: TaxRecordRow[] }) {
  return (
    <div className="overflow-x-auto rounded-md bg-muted">
      <table className="w-full min-w-[46rem] text-sm">
        <thead>
          <tr className="bg-chrome text-left text-xs font-medium text-white">
            <th className="px-4 py-2.5">Date</th>
            <th className="px-4 py-2.5">Type</th>
            <th className="px-4 py-2.5">Asset</th>
            <th className="px-4 py-2.5">Country</th>
            <th className="px-4 py-2.5 text-right">Income</th>
            <th className="px-4 py-2.5 text-right">THB</th>
            <th className="px-4 py-2.5">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60 tabular-nums">
          {records.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                No tax records for this year. Dividends and profitable sales in real portfolios create them
                automatically.
              </td>
            </tr>
          )}
          {records.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(r.executedAt)}</td>
              <td className="px-4 py-2.5">
                {TAX_TYPE_LABEL[r.taxType] ?? r.taxType}
                <p className="text-xs text-muted-foreground">{r.portfolioName}</p>
              </td>
              <td className="px-4 py-2.5 font-semibold">{r.assetSymbol ?? "—"}</td>
              <td className="px-4 py-2.5">{r.sourceCountry}</td>
              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                {formatMoney(r.incomeAmount, r.currency ?? undefined)}
                {r.fxRate !== 1 && <p className="text-xs text-muted-foreground">@ {r.fxRate}</p>}
              </td>
              <td className="px-4 py-2.5 text-right">{formatMoney(r.convertedAmountTHB)}</td>
              <td className="px-4 py-2.5">
                <StatusSelect id={r.id} status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusSelect({ id, status }: { id: string; status: TaxStatus }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    <>
      <select
        value={status}
        disabled={pending}
        aria-label="Status"
        onChange={(e) => {
          const next = e.target.value as TaxStatus;
          startTransition(async () => {
            setError("");
            const res = await setTaxRecordStatusAction(id, next);
            if (res.error) setError(res.error);
          });
        }}
        className="rounded bg-field px-2 py-1 text-xs outline-none disabled:opacity-50"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.charAt(0) + s.slice(1).toLowerCase()}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-loss">{error}</p>}
    </>
  );
}
