import { graphql } from "@/gql";
import type { AssetInsightsQuery } from "@/gql/graphql";
import LocalDateTime from "@/components/LocalDateTime";
import { serverQuery } from "@/lib/graphql/server";
import { plColor } from "@/lib/format";
import ExpandableText from "./ExpandableText";

const AssetInsightsQueryDoc = graphql(`
  query AssetInsights($assetId: ID!) {
    assetInsights(assetId: $assetId) {
      currency
      price
      marketCap
      trailingPE
      forwardPE
      priceToBook
      eps
      dividendYieldPct
      beta
      roePct
      debtToEquityPct
      profitMarginPct
      revenueGrowthPct
      freeCashflow
      nextEarningsDate
      exDividendDate
      targetMeanPrice
      recommendation
      analystCount
      analystTrend {
        strongBuy
        buy
        hold
        sell
        strongSell
      }
      sector
      industry
      website
      businessSummary
      fetchedAt
    }
  }
`);

type Insights = NonNullable<AssetInsightsQuery["assetInsights"]>;
type Row = { label: string; value: React.ReactNode | null };

const decimal = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
// Yahoo stamps XD days at 00:00 UTC and earnings at the market's local time, so the
// UTC calendar day is the one the exchange means.
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const DAY_MS = 24 * 3600 * 1000;

const num = (v: number | null | undefined) => (v == null ? null : decimal.format(v));
const big = (v: number | null | undefined) => (v == null ? null : compact.format(v));
/** Always signed, so up/down never relies on color alone. */
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${decimal.format(Math.abs(v))}`;

function dateWithDistance(iso: string | null | undefined, now: number) {
  if (!iso) return null;
  const date = new Date(iso);
  const days = Math.round((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - now) / DAY_MS);
  const distance = days === 0 ? "today" : days > 0 ? `in ${days} day${days === 1 ? "" : "s"}` : "passed";
  return (
    <>
      {day.format(date)} <span className="text-xs text-muted-foreground">({distance})</span>
    </>
  );
}

function Card({ title, rows, children }: { title: string; rows?: Row[]; children?: React.ReactNode }) {
  const shown = rows?.filter((r) => r.value != null) ?? [];
  if (shown.length === 0 && !children) return null;
  return (
    <section className="space-y-3 rounded-md bg-muted p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {shown.length > 0 && (
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
          {shown.map((r) => (
            <div key={r.label} className="contents">
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className="text-right tabular-nums">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
    </section>
  );
}

const RATINGS = [
  { key: "strongBuy", label: "Strong buy", className: "bg-gain" },
  { key: "buy", label: "Buy", className: "bg-gain/55" },
  { key: "hold", label: "Hold", className: "bg-muted-foreground/40" },
  { key: "sell", label: "Sell", className: "bg-loss/55" },
  { key: "strongSell", label: "Strong sell", className: "bg-loss" },
] as const;

function AnalystBar({ trend }: { trend: NonNullable<Insights["analystTrend"]> }) {
  const counts = RATINGS.map((r) => ({ ...r, count: trend[r.key] ?? 0 }));
  const total = counts.reduce((sum, r) => sum + r.count, 0);
  if (total === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-background" role="img" aria-label={counts.map((r) => `${r.label} ${r.count}`).join(", ")}>
        {counts.map((r) =>
          r.count > 0 ? <div key={r.key} className={r.className} style={{ width: `${(r.count / total) * 100}%` }} /> : null,
        )}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {counts.map((r) => (
          <li key={r.key} className="flex items-center gap-1.5">
            <span aria-hidden className={`size-2 rounded-full ${r.className}`} />
            {r.label} <span className="tabular-nums text-foreground">{r.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const recommendationLabel = (key: string) => key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/**
 * Yahoo Finance's view of the stock. Percent values are plain numbers with "(%)" in
 * the label; money is in the asset's trading currency, named in the label.
 */
export default async function AssetInsights({ assetId }: { assetId: string }) {
  const { assetInsights: i } = await serverQuery(AssetInsightsQueryDoc, { assetId });
  if (!i) {
    return (
      <p className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
        Yahoo Finance has no stats for this asset right now.
      </p>
    );
  }

  const ccy = i.currency ? ` (${i.currency})` : "";
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const upside = i.targetMeanPrice != null && i.price ? ((i.targetMeanPrice - i.price) / i.price) * 100 : null;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card
          title="Key stats"
          rows={[
            { label: `Market cap${ccy}`, value: big(i.marketCap) },
            { label: "P/E (x)", value: num(i.trailingPE) },
            { label: "Forward P/E (x)", value: num(i.forwardPE) },
            { label: "P/BV (x)", value: num(i.priceToBook) },
            { label: `EPS${ccy}`, value: num(i.eps) },
            { label: "Dividend yield (%)", value: num(i.dividendYieldPct) },
            { label: "Beta", value: num(i.beta) },
          ]}
        />
        <Card
          title="Financials"
          rows={[
            { label: "ROE (%)", value: num(i.roePct) },
            { label: "D/E (%)", value: num(i.debtToEquityPct) },
            { label: "Profit margin (%)", value: num(i.profitMarginPct) },
            {
              label: "Revenue growth YoY (%)",
              value: i.revenueGrowthPct == null ? null : <span className={plColor(i.revenueGrowthPct)}>{signed(i.revenueGrowthPct)}</span>,
            },
            { label: `Free cash flow${ccy}`, value: big(i.freeCashflow) },
          ]}
        />
        <Card
          title="Key dates"
          rows={[
            { label: "Next earnings", value: dateWithDistance(i.nextEarningsDate, todayUtc) },
            { label: "Ex-dividend (XD)", value: dateWithDistance(i.exDividendDate, todayUtc) },
          ]}
        />
        <Card
          title="Analysts"
          rows={[
            { label: `Target price${ccy}`, value: num(i.targetMeanPrice) },
            { label: `Current price${ccy}`, value: i.targetMeanPrice != null ? num(i.price) : null },
            {
              label: "Target vs current (%)",
              value: upside == null ? null : <span className={plColor(upside)}>{signed(upside)}</span>,
            },
            {
              label: "Consensus",
              value: i.recommendation
                ? `${recommendationLabel(i.recommendation)}${i.analystCount ? ` · ${i.analystCount} analysts` : ""}`
                : null,
            },
          ]}
        >
          {i.analystTrend && <AnalystBar trend={i.analystTrend} />}
        </Card>
      </div>

      <Card
        title="Company"
        rows={[
          { label: "Sector", value: i.sector },
          { label: "Industry", value: i.industry },
          {
            label: "Website",
            value: i.website ? (
              <a href={i.website} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {i.website.replace(/^https?:\/\/(www\.)?/, "")} ↗
              </a>
            ) : null,
          },
        ]}
      >
        {i.businessSummary && <ExpandableText text={i.businessSummary} />}
      </Card>

      <p className="text-xs text-muted-foreground">
        From Yahoo Finance{i.fetchedAt && <> · fetched <LocalDateTime iso={i.fetchedAt} format="short" /></>} · refreshed every 6
        hours. Values marked (%) are percentages.
      </p>
    </div>
  );
}
