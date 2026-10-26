import { redirect } from "next/navigation";
import { graphql } from "@/gql";
import { serverQuery } from "@/lib/graphql/server";

const DashboardMeQuery = graphql(`
  query DashboardMe {
    me {
      id
      email
      firstName
    }
  }
`);

export default async function DashboardPage() {
  const { me } = await serverQuery(DashboardMeQuery);
  if (!me) redirect("/login");

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">สวัสดี {me.firstName ?? me.email}</h1>
      <p className="text-muted-foreground">Dashboard กำลังจะมา</p>
    </div>
  );
}
