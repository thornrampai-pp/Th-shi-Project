import type { Metadata } from "next";
import Th from "@/components/Th";
import { notFound } from "next/navigation";
import { Private } from "@/components/AmountPrivacy";
import { formatMoney, formatQuantity, formatSignedMoney, plColor } from "@/lib/format";
import { getFxBreakdown } from "../../data";
import { loadPortfolio } from "../../data";

export const metadata: Metadata = { title: "FX breakdown" };

type Props = { params: Promise<{ portfolioId: string }> };

export default async function FxBreakdownPage({ params }: Props) {
  const { portfolioId } = await params;
  const portfolio = await loadPortfolio(portfolioId);
  if (!portfolio) notFound();

  const { homeCurrency, positions, totals } = await getFxBreakdown(portfolioId);

  return (
    <section className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Profit/loss on holdings bought in another currency, split into how much came from the stock price moving vs.
        the exchange rate moving — all figures converted to {homeCurrency}.
      </p>

      <div className="overflow-x-auto rounded-md bg-muted">
        <table className="w-full min-w-[54rem] text-sm">
          <thead>
            <tr className="bg-chrome text-left text-xs font-medium text-white">
              <Th title="Asset" hint="symbol · currency" />
              <Th title="Quantity" hint="units you hold" align="right" />
              <Th title="FX rate" hint="today, to home currency" align="right" />
              <Th title="Unrealized — stock" hint="from the price, unsold" align="right" />
              <Th title="Unrealized — FX" hint="from the exchange rate, unsold" align="right" />
              <Th title="Realized — stock" hint="from the price, sold" align="right" />
              <Th title="Realized — FX" hint="from the exchange rate, sold" align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 tabular-nums [&_td]:align-top">
            {positions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                  No holdings yet.
                </td>
              </tr>
            )}
            {positions.map((p) => (
              <tr key={p.assetId}>
                <td className="px-4 py-2.5">
                  <p className="font-semibold">{p.symbol}</p>
                  <p className="text-xs text-muted-foreground">{p.currency}</p>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Private>{formatQuantity(p.quantity)}</Private>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {p.currentFxRate != null ? formatMoney(p.currentFxRate) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className={`px-4 py-2.5 text-right ${p.unrealizedStockPLHome != null ? plColor(p.unrealizedStockPLHome) : ""}`}>
                  {p.unrealizedStockPLHome != null ? (
                    <Private>{formatSignedMoney(p.unrealizedStockPLHome, homeCurrency)}</Private>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className={`px-4 py-2.5 text-right ${p.unrealizedFxPLHome != null ? plColor(p.unrealizedFxPLHome) : ""}`}>
                  {p.unrealizedFxPLHome != null ? (
                    <Private>{formatSignedMoney(p.unrealizedFxPLHome, homeCurrency)}</Private>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className={`px-4 py-2.5 text-right ${plColor(p.realizedStockPLHome)}`}>
                  <Private>{formatSignedMoney(p.realizedStockPLHome, homeCurrency)}</Private>
                </td>
                <td className={`px-4 py-2.5 text-right ${plColor(p.realizedFxPLHome)}`}>
                  <Private>{formatSignedMoney(p.realizedFxPLHome, homeCurrency)}</Private>
                </td>
              </tr>
            ))}
          </tbody>
          {positions.length > 0 && (
            <tfoot>
              <tr className="border-t border-border bg-background/40 font-semibold tabular-nums">
                <td className="px-4 py-2.5" colSpan={3}>
                  Total
                </td>
                <td className={`px-4 py-2.5 text-right ${plColor(totals.unrealizedStockPLHome)}`}>
                  <Private>{formatSignedMoney(totals.unrealizedStockPLHome, homeCurrency)}</Private>
                </td>
                <td className={`px-4 py-2.5 text-right ${plColor(totals.unrealizedFxPLHome)}`}>
                  <Private>{formatSignedMoney(totals.unrealizedFxPLHome, homeCurrency)}</Private>
                </td>
                <td className={`px-4 py-2.5 text-right ${plColor(totals.realizedStockPLHome)}`}>
                  <Private>{formatSignedMoney(totals.realizedStockPLHome, homeCurrency)}</Private>
                </td>
                <td className={`px-4 py-2.5 text-right ${plColor(totals.realizedFxPLHome)}`}>
                  <Private>{formatSignedMoney(totals.realizedFxPLHome, homeCurrency)}</Private>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {!totals.complete && (
        <p className="text-xs text-amber-600">
          Some unrealized figures are missing an exchange rate for the day they were bought and aren&apos;t included
          in the totals above.
        </p>
      )}
    </section>
  );
}
