import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Private } from "@/components/AmountPrivacy";
import { formatMoney, formatSignedMoney, formatSignedPct, plColor } from "@/lib/format";
import AllocationDonut from "../AllocationDonut";
import CashPoolValue from "../CashPoolValue";
import { getCashPool, getPortfolioList, loadPortfolio } from "../data";
import StatCard from "../StatCard";
import HoldingsPanel from "./HoldingsPanel";

type Props = { params: Promise<{ portfolioId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const portfolio = await loadPortfolio((await params).portfolioId);
  return { title: portfolio?.name ?? "Portfolio" };
}

export default async function PortfolioPage({ params }: Props) {
  const portfolio = await loadPortfolio((await params).portfolioId);
  if (!portfolio) notFound();
  const { currency } = portfolio;
  const [portfolios, cashPool] = await Promise.all([getPortfolioList(), getCashPool()]);
  // REAL portfolios share one cash pool; a PAPER one keeps its own play money.
  const shared = portfolio.type === "REAL";

  return (
    <>
      <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <AllocationDonut holdings={portfolio.holdings} legend="side" />
        {/* Profit on top (the second tile spans two), then Cost → Market value → Cash in reading order. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <StatCard
            label="Total Profit"
            value={formatSignedPct(portfolio.unrealizedPLPct)}
            valueClassName={plColor(portfolio.unrealizedPL)}
            detail="Unrealized, on current holdings"
          />
          <StatCard
            label="Total Profit value"
            className="sm:col-span-2"
            value={<Private>{formatSignedMoney(portfolio.unrealizedPL, currency)}</Private>}
            valueClassName={plColor(portfolio.unrealizedPL)}
            detail={
              <>
                Realized so far <Private>{formatSignedMoney(portfolio.realizedPL, currency)}</Private>
              </>
            }
          />
          <StatCard
            label="Cost"
            value={<Private>{formatMoney(portfolio.costBasis, currency)}</Private>}
            detail="What you paid for current holdings"
          />
          <StatCard label="Market value" value={<Private>{formatMoney(portfolio.marketValue, currency)}</Private>} />
          <StatCard
            label={shared ? "Shared cash" : "Cash"}
            className="col-span-2 sm:col-span-1"
            value={shared ? <CashPoolValue pool={cashPool} /> : <Private>{formatMoney(portfolio.cash, currency)}</Private>}
            detail={shared ? "All portfolios — buys use it first" : undefined}
          />
        </div>
      </div>

      <HoldingsPanel
        portfolioId={portfolio.id}
        currency={currency}
        holdings={portfolio.holdings}
        portfolios={portfolios}
      />
    </>
  );
}
