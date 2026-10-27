import { notFound } from "next/navigation";
import { loadPortfolio } from "../data";
import PortfolioTabs from "./PortfolioTabs";

export default async function PortfolioLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ portfolioId: string }>;
}) {
  const portfolio = await loadPortfolio((await params).portfolioId);
  if (!portfolio) notFound();

  return (
    <>
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold">{portfolio.name}</h1>
          <span className="text-xs text-muted-foreground">
            {portfolio.strategy} · {portfolio.type} · {portfolio.currency}
          </span>
        </div>
        <PortfolioTabs portfolioId={portfolio.id} />
      </div>
      {children}
    </>
  );
}
