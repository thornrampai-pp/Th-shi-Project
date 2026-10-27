import type { Metadata } from "next";
import Link from "next/link";
import { formatSignedMoney, formatSignedPct, plColor } from "@/lib/format";
import AllocationDonut from "./AllocationDonut";
import { getPortfolioOverview } from "./data";
import StatCard from "./StatCard";

export const metadata: Metadata = { title: "Portfolios" };

const TOP_COUNT = 3;

export default async function PortfoliosPage() {
  const overview = await getPortfolioOverview();
  // Best performers first; portfolios with nothing invested yet go last.
  const top = [...overview.portfolios]
    .sort((a, b) => Number(b.costBasis > 0) - Number(a.costBasis > 0) || b.unrealizedPLPct - a.unrealizedPLPct)
    .slice(0, TOP_COUNT);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:max-w-2xl">
        <StatCard
          label="Total Profit"
          value={formatSignedPct(overview.unrealizedPLPct)}
          valueClassName={plColor(overview.unrealizedPL)}
          detail="Unrealized, on current holdings"
        />
        <StatCard
          label="Total Profit value"
          value={formatSignedMoney(overview.unrealizedPL, overview.currency)}
          valueClassName={plColor(overview.unrealizedPL)}
          detail={`Realized so far ${formatSignedMoney(overview.realizedPL, overview.currency)}`}
        />
      </div>

      {overview.portfolios.length === 0 ? (
        <p className="py-24 text-center text-sm text-muted-foreground">
          No portfolios yet. Create one with “+ New portfolio”.
        </p>
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Top {Math.min(TOP_COUNT, overview.portfolios.length)} by profit
          </h2>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {top.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/portfolios/${p.id}`}
                  className="flex h-full flex-col gap-4 rounded-md bg-muted p-4 transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="truncate font-semibold">{p.name}</h3>
                    {p.type === "PAPER" && <span className="text-xs text-muted-foreground">PAPER</span>}
                  </div>
                  <AllocationDonut holdings={p.holdings} className="flex-1" />
                  <p className="text-sm">
                    Profit / Loss{" "}
                    <span className={`font-semibold tabular-nums ${plColor(p.unrealizedPL)}`}>
                      {formatSignedPct(p.unrealizedPLPct)}
                    </span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
