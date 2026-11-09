import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Private } from "@/components/AmountPrivacy";
import Th from "@/components/Th";
import { formatCurrency, plColor } from "@/lib/format";
import { getFxBreakdown, loadPortfolio } from "../../data";
import type { FxBreakdown } from "../../data";

export const metadata: Metadata = { title: "FX breakdown" };

type Props = { params: Promise<{ portfolioId: string }> };
type Position = FxBreakdown["positions"][number];

const rate = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const dash = <span className="text-muted-foreground">—</span>;
const td = "px-4 py-2.5 text-right";

/** Average exchange rate the open units were bought at: their home-currency cost ÷ own-currency cost. */
function boughtAtRate(p: Position): number | null {
  return p.costBasisHome != null && p.costBasis > 0 ? p.costBasisHome / p.costBasis : null;
}

function Signed({ value, currency }: { value: number | null; currency: string }) {
  if (value == null) return dash;
  return (
    <span className={plColor(value)}>
      <Private>{formatCurrency(value, currency, true)}</Private>
    </span>
  );
}

// Value sits a fixed distance under the title, so the figures line up across cards
// even when one hint wraps to two lines (bottom-aligning them made the row uneven).
function SummaryCard({ title, value, hint, tone }: { title: string; value: React.ReactNode; hint: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted p-4">
      <p className="text-sm font-semibold">{title}</p>
      <div>
        <p className={`text-xl font-semibold tabular-nums ${tone ?? ""}`}>{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

export default async function FxBreakdownPage({ params }: Props) {
  const { portfolioId } = await params;
  const portfolio = await loadPortfolio(portfolioId);
  if (!portfolio) notFound();

  const { homeCurrency: home, positions, totals } = await getFxBreakdown(portfolioId);
  const held = positions.filter((p) => p.quantity > 0);
  const sold = positions.filter((p) => p.realizedStockPLHome !== 0 || p.realizedFxPLHome !== 0);
  const paid = held.reduce((sum, p) => sum + (p.costBasisHome ?? 0), 0);
  const worth = held.reduce((sum, p) => sum + (p.marketValueHome ?? 0), 0);

  return (
    <section className="space-y-6">
      <p className="text-sm text-muted-foreground">
        For holdings priced in another currency, your profit in {home} comes from two things: the{" "}
        <span className="font-medium text-foreground">stock price</span> moving, and the{" "}
        <span className="font-medium text-foreground">exchange rate</span> moving between the day you bought and today.
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          title="Cost — what you paid"
          value={<Private>{formatCurrency(paid, home)}</Private>}
          hint="at the exchange rate on each day you bought"
        />
        <SummaryCard
          title="Worth now"
          value={<Private>{formatCurrency(worth, home)}</Private>}
          hint="today's price × today's exchange rate"
        />
        <SummaryCard
          title="Profit from the stock price"
          value={<Private>{formatCurrency(totals.unrealizedStockPLHome, home, true)}</Private>}
          tone={plColor(totals.unrealizedStockPLHome)}
          hint="how much the investments themselves moved"
        />
        <SummaryCard
          title="Profit from the exchange rate"
          value={<Private>{formatCurrency(totals.unrealizedFxPLHome, home, true)}</Private>}
          tone={plColor(totals.unrealizedFxPLHome)}
          hint={`how much ${home} moved against the asset's currency`}
        />
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        Worth now − Cost = profit from the stock price + profit from the exchange rate (holdings you still own).
      </p>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Still holding</h2>
        <div className="relative overflow-x-auto rounded-md bg-muted">
          <table className="w-full min-w-[56rem] text-sm">
            <thead>
              <tr className="bg-chrome text-left text-xs font-medium text-white">
                <Th title="Asset" hint="symbol · currency" />
                <Th title="Cost" hint="what you paid" align="right" />
                <Th title="Exchange rate" hint="when bought → today" align="right" />
                <Th title="Worth now" hint="price × rate today" align="right" />
                <Th title="From stock price" hint="price moved" align="right" />
                <Th title="From exchange rate" hint="rate moved" align="right" />
                <Th title="Total profit" hint="both together" align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 tabular-nums [&_td]:align-top">
              {held.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                    No holdings yet.
                  </td>
                </tr>
              )}
              {held.map((p) => {
                const foreign = p.currency && p.currency !== home;
                const bought = boughtAtRate(p);
                const worthOwn = p.marketPrice != null ? p.quantity * p.marketPrice : null;
                return (
                  <tr key={p.assetId}>
                    <td className="px-4 py-2.5">
                      <p className="font-semibold">{p.symbol}</p>
                      <p className="text-xs text-muted-foreground">{p.currency}</p>
                    </td>
                    <td className={td}>
                      <Private>
                        {foreign ? formatCurrency(p.costBasis, p.currency) : null}
                        {p.costBasisHome != null ? (
                          <span className={foreign ? "block text-xs text-muted-foreground" : ""}>
                            {foreign ? `(${formatCurrency(p.costBasisHome, home)})` : formatCurrency(p.costBasisHome, home)}
                          </span>
                        ) : (
                          !foreign && dash
                        )}
                      </Private>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      {foreign ? (
                        <>
                          {bought != null ? rate.format(bought) : "?"} → {p.currentFxRate != null ? rate.format(p.currentFxRate) : "?"}
                          {bought != null && p.currentFxRate != null && (
                            <span className={`block text-xs ${plColor(p.currentFxRate - bought)}`}>
                              {p.currentFxRate - bought >= 0 ? "+" : "−"}
                              {rate.format(Math.abs(p.currentFxRate - bought))} {home}/{p.currency}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">same currency</span>
                      )}
                    </td>
                    <td className={td}>
                      <Private>
                        {foreign && worthOwn != null ? formatCurrency(worthOwn, p.currency) : null}
                        {p.marketValueHome != null ? (
                          <span className={foreign ? "block text-xs text-muted-foreground" : ""}>
                            {foreign ? `(${formatCurrency(p.marketValueHome, home)})` : formatCurrency(p.marketValueHome, home)}
                          </span>
                        ) : (
                          !foreign && dash
                        )}
                      </Private>
                    </td>
                    <td className={td}>
                      <Signed value={p.unrealizedStockPLHome} currency={home} />
                    </td>
                    <td className={td}>{foreign ? <Signed value={p.unrealizedFxPLHome} currency={home} /> : dash}</td>
                    <td className={`${td} font-semibold`}>
                      <Signed value={p.unrealizedPLHome} currency={home} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {held.length > 0 && (
              <tfoot>
                <tr className="border-t border-border bg-background/40 font-semibold tabular-nums">
                  <td className="px-4 py-2.5">Total</td>
                  <td className={td}>
                    <Private>{formatCurrency(paid, home)}</Private>
                  </td>
                  <td />
                  <td className={td}>
                    <Private>{formatCurrency(worth, home)}</Private>
                  </td>
                  <td className={td}>
                    <Signed value={totals.unrealizedStockPLHome} currency={home} />
                  </td>
                  <td className={td}>
                    <Signed value={totals.unrealizedFxPLHome} currency={home} />
                  </td>
                  <td className={td}>
                    <Signed value={totals.unrealizedPLHome} currency={home} />
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {sold.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Already sold</h2>
          <p className="text-xs text-muted-foreground">Profit locked in by sales, split the same way.</p>
          <div className="relative overflow-x-auto rounded-md bg-muted">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="bg-chrome text-left text-xs font-medium text-white">
                  <Th title="Asset" hint="symbol · currency" />
                  <Th title="From stock price" hint="price moved" align="right" />
                  <Th title="From exchange rate" hint="rate moved" align="right" />
                  <Th title="Total profit" hint="both together" align="right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 tabular-nums [&_td]:align-top">
                {sold.map((p) => (
                  <tr key={p.assetId}>
                    <td className="px-4 py-2.5">
                      <p className="font-semibold">{p.symbol}</p>
                      <p className="text-xs text-muted-foreground">{p.currency}</p>
                    </td>
                    <td className={td}>
                      <Signed value={p.realizedStockPLHome} currency={home} />
                    </td>
                    <td className={td}>
                      <Signed value={p.realizedFxPLHome} currency={home} />
                    </td>
                    <td className={`${td} font-semibold`}>
                      <Signed value={p.realizedPLHome} currency={home} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-background/40 font-semibold tabular-nums">
                  <td className="px-4 py-2.5">Total</td>
                  <td className={td}>
                    <Signed value={totals.realizedStockPLHome} currency={home} />
                  </td>
                  <td className={td}>
                    <Signed value={totals.realizedFxPLHome} currency={home} />
                  </td>
                  <td className={td}>
                    <Signed value={totals.realizedPLHome} currency={home} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {!totals.complete && (
        <p className="text-xs text-amber-600">
          Some holdings are missing the exchange rate for the day they were bought, so their split isn&apos;t in the
          totals above.
        </p>
      )}
    </section>
  );
}
