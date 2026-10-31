import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOrders, getTradingSignals, loadPortfolio } from "../../data";
import OrdersPanel from "./OrdersPanel";

export const metadata: Metadata = { title: "Orders" };

type Props = { params: Promise<{ portfolioId: string }> };

export default async function OrdersPage({ params }: Props) {
  const { portfolioId } = await params;
  const portfolio = await loadPortfolio(portfolioId);
  if (!portfolio) notFound();

  const [orders, signals] = await Promise.all([getOrders(portfolioId), getTradingSignals(portfolioId)]);

  return <OrdersPanel portfolioId={portfolioId} portfolioType={portfolio.type} orders={orders} signals={signals} />;
}
