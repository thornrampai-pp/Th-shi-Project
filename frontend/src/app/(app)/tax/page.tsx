import type { Metadata } from "next";
import PageContainer from "@/components/PageContainer";
import { graphql } from "@/gql";
import { formatMoney } from "@/lib/format";
import { compact } from "@/lib/graphql/normalize";
import { serverQuery } from "@/lib/graphql/server";
import StatCard from "../portfolios/StatCard";
import TaxCalculator from "./TaxCalculator";
import TaxFilters from "./TaxFilters";
import TaxRecordsTable, { TAX_TYPE_LABEL } from "./TaxRecordsTable";

export const metadata: Metadata = { title: "Tax" };

const TaxPageQuery = graphql(`
  query TaxPage($taxYear: Int!, $portfolioId: ID) {
    taxSummary(taxYear: $taxYear, portfolioId: $portfolioId) {
      totalIncomeTHB
      foreignIncomeTHB
      withheldTaxTHB
      repatriatedTHB
      pendingCount
      breakdown {
        taxType
        sourceCountry
        incomeTHB
        count
      }
    }
    taxRecords(taxYear: $taxYear, portfolioId: $portfolioId) {
      id
      portfolioId
      taxType
      sourceCountry
      incomeAmount
      convertedAmountTHB
      fxRate
      earnedYear
      status
      transaction {
        executedAt
        assetSymbol
        currency
      }
    }
    myPortfolios(type: REAL) {
      id
      name
    }
  }
`);

type Props = { searchParams: Promise<{ year?: string; portfolio?: string }> };

export default async function TaxPage({ searchParams }: Props) {
  const params = await searchParams;
  const thisYear = new Date().getFullYear();
  const year = Number(params.year) >= 2000 && Number(params.year) <= thisYear + 1 ? Number(params.year) : thisYear;
  const portfolioId = params.portfolio || undefined;

  const { taxSummary: s, taxRecords, myPortfolios } = await serverQuery(TaxPageQuery, { taxYear: year, portfolioId });
  const portfolios = compact(myPortfolios).flatMap((p) => (p.id ? [{ id: p.id, name: p.name ?? "Untitled" }] : []));
  const portfolioName = new Map(portfolios.map((p) => [p.id, p.name]));

  const records = compact(taxRecords).flatMap((r) =>
    r.id && r.taxType && r.status
      ? [
          {
            id: r.id,
            portfolioName: portfolioName.get(r.portfolioId ?? "") ?? "—",
            taxType: r.taxType,
            sourceCountry: r.sourceCountry ?? "—",
            incomeAmount: r.incomeAmount ?? 0,
            currency: r.transaction?.currency ?? null,
            convertedAmountTHB: r.convertedAmountTHB ?? 0,
            fxRate: r.fxRate ?? 1,
            earnedYear: r.earnedYear ?? year,
            status: r.status,
            executedAt: r.transaction?.executedAt ?? "",
            assetSymbol: r.transaction?.assetSymbol ?? null,
          },
        ]
      : [],
  );
  const breakdown = compact(s?.breakdown);

  return (
    <PageContainer title="Tax">
      <TaxFilters year={year} portfolioId={portfolioId ?? ""} portfolios={portfolios} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Investment income"
          value={formatMoney(s?.totalIncomeTHB ?? 0, "THB")}
          detail={`${s?.pendingCount ?? 0} record${s?.pendingCount === 1 ? "" : "s"} pending`}
        />
        <StatCard label="Foreign income" value={formatMoney(s?.foreignIncomeTHB ?? 0, "THB")} />
        <StatCard label="Tax withheld" value={formatMoney(s?.withheldTaxTHB ?? 0, "THB")} />
        <StatCard
          label="Brought into Thailand"
          value={formatMoney(s?.repatriatedTHB ?? 0, "THB")}
          detail="Foreign income is taxed in the year it's brought in"
        />
      </div>

      {breakdown.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">By type and country</h2>
          <div className="overflow-x-auto rounded-md bg-muted">
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="bg-chrome text-left text-xs font-medium text-white">
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Source country</th>
                  <th className="px-4 py-2.5 text-right">Records</th>
                  <th className="px-4 py-2.5 text-right">Income (THB)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 tabular-nums">
                {breakdown.map((b) => (
                  <tr key={`${b.taxType}-${b.sourceCountry}`}>
                    <td className="px-4 py-2.5">{TAX_TYPE_LABEL[b.taxType ?? ""] ?? b.taxType}</td>
                    <td className="px-4 py-2.5">{b.sourceCountry}</td>
                    <td className="px-4 py-2.5 text-right">{b.count}</td>
                    <td className="px-4 py-2.5 text-right">{formatMoney(b.incomeTHB ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Records · {records.length}</h2>
        <TaxRecordsTable records={records} />
      </section>

      <TaxCalculator year={year} investmentIncome={s?.totalIncomeTHB ?? 0} withheld={s?.withheldTaxTHB ?? 0} />
    </PageContainer>
  );
}
