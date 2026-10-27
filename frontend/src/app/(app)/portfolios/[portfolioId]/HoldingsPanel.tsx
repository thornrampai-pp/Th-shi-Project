"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatMoney, formatQuantity, formatSignedMoney, formatSignedPct, plColor } from "@/lib/format";
import type { Holding } from "../data";
import AddAssetDialog from "./AddAssetDialog";
import SlipUploadDialog from "./SlipUploadDialog";

const SORTS = {
  weight: { label: "Largest first", compare: (a: Holding, b: Holding) => b.weight - a.weight },
  plPct: { label: "Best P/L %", compare: (a: Holding, b: Holding) => b.unrealizedPLPct - a.unrealizedPLPct },
  plPctAsc: { label: "Worst P/L %", compare: (a: Holding, b: Holding) => a.unrealizedPLPct - b.unrealizedPLPct },
  symbol: { label: "Symbol A–Z", compare: (a: Holding, b: Holding) => a.symbol.localeCompare(b.symbol) },
} as const;

type SortKey = keyof typeof SORTS;

const toolbarButton = "rounded-md bg-field px-4 py-2 text-sm hover:bg-field/70";

type Props = { portfolioId: string; currency: string; holdings: Holding[] };

export default function HoldingsPanel({ portfolioId, currency, holdings }: Props) {
  const [sort, setSort] = useState<SortKey>("weight");
  const [dialog, setDialog] = useState<"slip" | "asset" | null>(null);
  const rows = useMemo(() => [...holdings].sort(SORTS[sort].compare), [holdings, sort]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort holdings"
          className={`${toolbarButton} outline-none`}
        >
          {Object.entries(SORTS).map(([key, s]) => (
            <option key={key} value={key}>
              Sort: {s.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setDialog("slip")} className={toolbarButton}>
          Upload slips
        </button>
        <button
          type="button"
          onClick={() => setDialog("asset")}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
        >
          + Add asset
        </button>
      </div>

      <div className="overflow-x-auto rounded-md bg-muted">
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="bg-chrome text-left text-xs font-medium text-white">
              <th className="px-4 py-2.5">Asset</th>
              <th className="px-4 py-2.5 text-right">Quantity</th>
              <th className="px-4 py-2.5 text-right">Weight</th>
              <th className="px-4 py-2.5 text-right">Avg cost</th>
              <th className="px-4 py-2.5 text-right">Price</th>
              <th className="px-4 py-2.5 text-right">Value</th>
              <th className="px-4 py-2.5 text-right">Profit / Loss</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 tabular-nums">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                  No holdings yet. Use “+ Add asset” to record one.
                </td>
              </tr>
            )}
            {rows.map((h) => (
              <tr key={h.assetId}>
                <td className="px-4 py-2.5">
                  <Link href={`/watchlist/${h.assetId}`} className="font-semibold hover:underline">
                    {h.symbol}
                  </Link>
                  <p className="max-w-48 truncate text-xs text-muted-foreground">{h.name}</p>
                </td>
                <td className="px-4 py-2.5 text-right">{formatQuantity(h.quantity)}</td>
                <td className="px-4 py-2.5 text-right">{h.weight.toFixed(1)}%</td>
                <td className="px-4 py-2.5 text-right">{formatMoney(h.avgPrice)}</td>
                <td className="px-4 py-2.5 text-right">{formatMoney(h.marketPrice)}</td>
                <td className="px-4 py-2.5 text-right">{formatMoney(h.marketValue)}</td>
                <td className={`px-4 py-2.5 text-right ${plColor(h.unrealizedPL)}`}>
                  {formatSignedMoney(h.unrealizedPL)}
                  <p className="text-xs">{formatSignedPct(h.unrealizedPLPct)}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Prices and values in {currency}, using the latest daily close.</p>

      {dialog === "slip" && <SlipUploadDialog portfolioId={portfolioId} onClose={() => setDialog(null)} />}
      {dialog === "asset" && <AddAssetDialog portfolioId={portfolioId} onClose={() => setDialog(null)} />}
    </section>
  );
}
