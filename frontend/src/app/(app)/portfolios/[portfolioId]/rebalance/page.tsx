import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRebalanceDrift, getRebalanceLogs, loadPortfolio } from "../../data";
import RebalancePanel from "./RebalancePanel";

export const metadata: Metadata = { title: "Rebalance" };

type Props = { params: Promise<{ portfolioId: string }> };

export default async function RebalancePage({ params }: Props) {
  const { portfolioId } = await params;
  const portfolio = await loadPortfolio(portfolioId);
  if (!portfolio) notFound();

  const [drift, logs] = await Promise.all([getRebalanceDrift(portfolioId), getRebalanceLogs(portfolioId)]);

  return (
    <RebalancePanel
      portfolioId={portfolioId}
      currency={portfolio.currency}
      holdings={portfolio.holdings}
      driftItems={drift?.items ?? null}
      logs={logs}
    />
  );
}
