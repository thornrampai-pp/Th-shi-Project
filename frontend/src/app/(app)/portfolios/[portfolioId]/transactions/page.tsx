import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { getTransactions, loadPortfolio } from "../../data";
import TransactionsPanel from "./TransactionsPanel";

type Props = { params: Promise<{ portfolioId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const portfolio = await loadPortfolio((await params).portfolioId);
  return { title: portfolio ? `${portfolio.name} · Transactions` : "Transactions" };
}

export default async function TransactionsPage({ params }: Props) {
  const { portfolioId } = await params;
  const portfolio = await loadPortfolio(portfolioId);
  if (!portfolio) notFound();
  const { transactions, cashAccounts } = await getTransactions(portfolioId);

  return (
    <>
      {cashAccounts.length > 0 && (
        <ul className="flex flex-wrap gap-3" aria-label="Cash balances">
          {cashAccounts.map((c) => (
            <li key={c.id} className="rounded-md bg-muted px-4 py-2">
              <p className="text-xs text-muted-foreground">
                Cash {c.currency}
                {cashAccounts.filter((o) => o.currency === c.currency).length > 1 &&
                  (c.isDomestic ? " · domestic" : " · foreign")}
              </p>
              <p className="font-semibold tabular-nums">{formatMoney(c.balance, c.currency)}</p>
            </li>
          ))}
        </ul>
      )}

      <TransactionsPanel
        portfolioId={portfolioId}
        transactions={transactions}
        holdings={portfolio.holdings.map((h) => ({ assetId: h.assetId, symbol: h.symbol, quantity: h.quantity }))}
        currencies={[...new Set(["THB", "USD", ...cashAccounts.map((c) => c.currency)])]}
      />
    </>
  );
}
