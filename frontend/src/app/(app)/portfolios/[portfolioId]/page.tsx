import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatMoney, formatSignedMoney, formatSignedPct, plColor } from "@/lib/format";
import AllocationDonut from "../AllocationDonut";
import { loadPortfolio } from "../data";
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

  return (
    <>
      <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <AllocationDonut holdings={portfolio.holdings} legend="side" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard
            label="Total Profit"
            value={formatSignedPct(portfolio.unrealizedPLPct)}
            valueClassName={plColor(portfolio.unrealizedPL)}
            detail="Unrealized, on current holdings"
          />
          <StatCard
            label="Total Profit value"
            value={formatSignedMoney(portfolio.unrealizedPL, currency)}
            valueClassName={plColor(portfolio.unrealizedPL)}
            detail={`Realized so far ${formatSignedMoney(portfolio.realizedPL, currency)}`}
          />
          <StatCard label="Market value" value={formatMoney(portfolio.marketValue, currency)} />
          <StatCard label="Cash" value={formatMoney(portfolio.cash, currency)} />
        </div>
      </div>

      <HoldingsPanel portfolioId={portfolio.id} currency={currency} holdings={portfolio.holdings} />
    </>
  );
}
