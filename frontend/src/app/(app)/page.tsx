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
    <div className="mx-auto w-full max-w-6xl space-y-2 px-4 py-8">
      <h1 className="text-2xl font-semibold">Hello, {me.firstName ?? me.email}</h1>
      <p className="text-muted-foreground">Dashboard coming soon</p>
    </div>
  );
}
