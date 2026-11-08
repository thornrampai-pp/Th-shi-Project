"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Private } from "@/components/AmountPrivacy";
import { formatCurrency, formatQuantity, formatSignedPct, plColor } from "@/lib/format";
import type { Holding, PortfolioListItem } from "../data";
import AddAssetDialog from "./AddAssetDialog";
import ImportStatementDialog from "./ImportStatementDialog";
import SlipUploadDialog from "./SlipUploadDialog";
import TransferAssetDialog from "./TransferAssetDialog";
import RecordTransactionDialog from "./transactions/RecordTransactionDialog";
import LocalDateTime from "@/components/LocalDateTime";
import Select from "@/components/Select";
import Th from "@/components/Th";

const SORTS = {
  weight: { label: "Largest first", compare: (a: Holding, b: Holding) => b.weight - a.weight },
  plPct: { label: "Best P/L %", compare: (a: Holding, b: Holding) => b.unrealizedPLPct - a.unrealizedPLPct },
  plPctAsc: { label: "Worst P/L %", compare: (a: Holding, b: Holding) => a.unrealizedPLPct - b.unrealizedPLPct },
  symbol: { label: "Symbol A–Z", compare: (a: Holding, b: Holding) => a.symbol.localeCompare(b.symbol) },
} as const;

type SortKey = keyof typeof SORTS;

const toolbarButton = "rounded-md bg-field px-4 py-2 text-sm hover:bg-field/70";

type Props = { portfolioId: string; currency: string; holdings: Holding[]; portfolios: PortfolioListItem[] };

const closeDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * An amount in the asset's own currency, with the portfolio-currency figure in
 * brackets underneath — "$620.33 (฿22,679.46)". `value` comes in portfolio currency,
 * converted at `holding.fxRate`, so dividing by it gives back the asset's figure.
 * Assets already in the portfolio currency show one figure.
 */
function Amount({
  value,
  holding,
  currency,
  signed = false,
}: {
  value: number;
  holding: Holding;
  currency: string;
  signed?: boolean;
}) {
  const own = holding.assetCurrency;
  if (!own || own === currency || !(holding.fxRate > 0)) return <>{formatCurrency(value, currency, signed)}</>;
  return (
    <>
      {formatCurrency(value / holding.fxRate, own, signed)}
      <span className="block text-xs text-muted-foreground">({formatCurrency(value, currency, signed)})</span>
    </>
  );
}

/** Daily bars are stamped 00:00 UTC of their trading day, so show that day as-is. */
function PriceAsOf({ source, iso }: { source: Holding["priceSource"]; iso: string | null }) {
  if (source === "COST" || !iso) return <>No price yet — at cost</>;
  if (source === "CLOSE") return <>Close {closeDay.format(new Date(iso))}</>;
  return <LocalDateTime iso={iso} format="short" />;
}

export default function HoldingsPanel({ portfolioId, currency, holdings, portfolios }: Props) {
  const otherPortfolios = portfolios.filter((p) => p.id !== portfolioId);
  const [sort, setSort] = useState<SortKey>("weight");
  const [dialog, setDialog] = useState<"slip" | "asset" | "statement" | null>(null);
  const [selling, setSelling] = useState<string | null>(null); // assetId
  const [transferring, setTransferring] = useState<string | null>(null); // assetId
  const rows = useMemo(() => [...holdings].sort(SORTS[sort].compare), [holdings, sort]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Select
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
        </Select>
        <button type="button" onClick={() => setDialog("slip")} className={toolbarButton}>
          Upload slips
        </button>
        <button type="button" onClick={() => setDialog("statement")} className={toolbarButton}>
          Import statement
        </button>
        <button
          type="button"
          onClick={() => setDialog("asset")}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
        >
          + Add asset
        </button>
      </div>

      <div className="relative overflow-x-auto rounded-md bg-muted">
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="bg-chrome text-left text-xs font-medium text-white">
              <Th title="Asset" hint="symbol · name" />
              <Th title="Units" hint="you hold" align="right" />
              <Th title="Weight" hint="of this portfolio" align="right" />
              <Th title="Avg cost" hint="per unit, incl. fees" align="right" />
              <Th title="Price" hint="per unit, latest" align="right" />
              <Th title="Value" hint="units × price" align="right" />
              <Th title="Profit / Loss" hint="value − cost, unsold" align="right" />
              <th className="px-4 py-2.5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          {/* Top-aligned, so each cell's first line (the main figure) sits on one line across the row. */}
          <tbody className="divide-y divide-border/60 tabular-nums [&_td]:align-top">
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center text-muted-foreground">
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
                <td className="px-4 py-2.5 text-right">
                  <Private>{formatQuantity(h.quantity)}</Private>
                </td>
                <td className="px-4 py-2.5 text-right">{h.weight.toFixed(1)}%</td>
                <td className="px-4 py-2.5 text-right">
                  <Amount value={h.avgPrice} holding={h} currency={currency} />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Amount value={h.marketPrice} holding={h} currency={currency} />
                  <p className="text-xs whitespace-nowrap text-muted-foreground">
                    <PriceAsOf source={h.priceSource} iso={h.priceAsOf} />
                  </p>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Private>
                    <Amount value={h.marketValue} holding={h} currency={currency} />
                  </Private>
                </td>
                <td className={`px-4 py-2.5 text-right ${plColor(h.unrealizedPL)}`}>
                  <Private>
                    <Amount value={h.unrealizedPL} holding={h} currency={currency} signed />
                  </Private>
                  <p className="text-xs">{formatSignedPct(h.unrealizedPLPct)}</p>
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <div className="flex justify-end gap-2">
                    {otherPortfolios.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setTransferring(h.assetId)}
                        aria-label={`Transfer ${h.symbol}`}
                        className="rounded-md border border-border px-3 py-1 text-xs hover:bg-background"
                      >
                        Transfer
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelling(h.assetId)}
                      aria-label={`Sell ${h.symbol}`}
                      className="rounded-md border border-border px-3 py-1 text-xs hover:bg-background"
                    >
                      Sell
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Amounts are in each asset&apos;s own currency; the figure in brackets is the same amount in {currency} at
        today&apos;s exchange rate (cost included — gains or losses from the exchange rate itself are in the FX tab).
      </p>

      {dialog === "slip" && <SlipUploadDialog portfolioId={portfolioId} onClose={() => setDialog(null)} />}
      {dialog === "statement" && <ImportStatementDialog portfolioId={portfolioId} portfolios={portfolios} onClose={() => setDialog(null)} />}
      {dialog === "asset" && <AddAssetDialog portfolioId={portfolioId} onClose={() => setDialog(null)} />}
      {selling && (
        <RecordTransactionDialog
          portfolioId={portfolioId}
          holdings={holdings.map((h) => ({
            assetId: h.assetId,
            symbol: h.symbol,
            quantity: h.quantity,
            currency: h.assetCurrency,
          }))}
          currencies={[...new Set(["THB", "USD", ...holdings.flatMap((h) => (h.assetCurrency ? [h.assetCurrency] : []))])]}
          initialKind="SELL"
          initialAssetId={selling}
          onClose={() => setSelling(null)}
        />
      )}
      {transferring &&
        (() => {
          const holding = holdings.find((h) => h.assetId === transferring);
          if (!holding) return null;
          return (
            <TransferAssetDialog
              portfolioId={portfolioId}
              assetId={holding.assetId}
              symbol={holding.symbol}
              quantity={holding.quantity}
              otherPortfolios={otherPortfolios}
              onClose={() => setTransferring(null)}
            />
          );
        })()}
    </section>
  );
}
