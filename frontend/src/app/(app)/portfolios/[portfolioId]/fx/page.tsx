import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
              <th className="px-4 py-2.5">Asset</th>
              <th className="px-4 py-2.5 text-right">Quantity</th>
              <th className="px-4 py-2.5 text-right">FX rate</th>
              <th className="px-4 py-2.5 text-right">Unrealized — stock</th>
              <th className="px-4 py-2.5 text-right">Unrealized — FX</th>
              <th className="px-4 py-2.5 text-right">Realized — stock</th>
              <th className="px-4 py-2.5 text-right">Realized — FX</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 tabular-nums">
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
                <td className="px-4 py-2.5 text-right">{formatQuantity(p.quantity)}</td>
                <td className="px-4 py-2.5 text-right">
                  {p.currentFxRate != null ? formatMoney(p.currentFxRate) : <span className="text-muted-foreground">—</span>}
                </td>
                <td className={`px-4 py-2.5 text-right ${p.unrealizedStockPLHome != null ? plColor(p.unrealizedStockPLHome) : ""}`}>
                  {p.unrealizedStockPLHome != null ? (
                    formatSignedMoney(p.unrealizedStockPLHome, homeCurrency)
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className={`px-4 py-2.5 text-right ${p.unrealizedFxPLHome != null ? plColor(p.unrealizedFxPLHome) : ""}`}>
                  {p.unrealizedFxPLHome != null ? (
                    formatSignedMoney(p.unrealizedFxPLHome, homeCurrency)
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className={`px-4 py-2.5 text-right ${plColor(p.realizedStockPLHome)}`}>
                  {formatSignedMoney(p.realizedStockPLHome, homeCurrency)}
                </td>
                <td className={`px-4 py-2.5 text-right ${plColor(p.realizedFxPLHome)}`}>
                  {formatSignedMoney(p.realizedFxPLHome, homeCurrency)}
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
                  {formatSignedMoney(totals.unrealizedStockPLHome, homeCurrency)}
                </td>
                <td className={`px-4 py-2.5 text-right ${plColor(totals.unrealizedFxPLHome)}`}>
                  {formatSignedMoney(totals.unrealizedFxPLHome, homeCurrency)}
                </td>
                <td className={`px-4 py-2.5 text-right ${plColor(totals.realizedStockPLHome)}`}>
                  {formatSignedMoney(totals.realizedStockPLHome, homeCurrency)}
                </td>
                <td className={`px-4 py-2.5 text-right ${plColor(totals.realizedFxPLHome)}`}>
                  {formatSignedMoney(totals.realizedFxPLHome, homeCurrency)}
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
