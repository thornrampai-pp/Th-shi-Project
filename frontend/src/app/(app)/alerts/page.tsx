import type { Metadata } from "next";
import PageContainer from "@/components/PageContainer";
import { graphql } from "@/gql";
import { compact, toAsset } from "@/lib/graphql/normalize";
import { serverQuery } from "@/lib/graphql/server";
import AlertsBoard from "./AlertsBoard";

export const metadata: Metadata = { title: "Alerts" };

const AlertsQuery = graphql(`
  query Alerts {
    alerts {
      id
      condition
      targetValue
      isActive
      updatedAt
      asset {
        id
        symbol
        name
        type
        exchange
      }
    }
  }
`);

export default async function AlertsPage() {
  const { alerts } = await serverQuery(AlertsQuery);
  const items = compact(alerts).flatMap((a) => {
    const asset = toAsset(a.asset);
    if (!a.id || !a.condition || !asset) return [];
    return [
      {
        id: a.id,
        condition: a.condition,
        targetValue: a.targetValue ?? 0,
        isActive: !!a.isActive,
        updatedAt: a.updatedAt ?? "",
        asset,
      },
    ];
  });

  return (
    <PageContainer title="Alerts">
      <AlertsBoard alerts={items} />
    </PageContainer>
  );
}
