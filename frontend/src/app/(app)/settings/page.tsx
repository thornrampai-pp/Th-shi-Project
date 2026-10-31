import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { logoutAction } from "@/actions/auth";
import PageContainer from "@/components/PageContainer";
import { graphql } from "@/gql";
import { compact } from "@/lib/graphql/normalize";
import { serverQuery } from "@/lib/graphql/server";
import DiscordSection from "./DiscordSection";
import AuditLogSection from "./AuditLogSection";
import { PasswordForm, ProfileForm } from "./AccountForms";

export const metadata: Metadata = { title: "Settings" };

const SettingsQuery = graphql(`
  query Settings {
    me {
      email
      firstName
      lastName
      taxResidency
      role
      discordLinked
    }
    notificationChannels {
      id
      label
      isActive
      events
      webhookUrlPreview
    }
    myAuditLogs(limit: 20) {
      id
      action
      metadataJson
      createdAt
    }
  }
`);

export default async function SettingsPage() {
  const { me, notificationChannels, myAuditLogs } = await serverQuery(SettingsQuery);
  if (!me) redirect("/login");

  const auditLogs = compact(myAuditLogs).flatMap((l) =>
    l.id && l.action && l.createdAt
      ? [{ id: l.id, action: l.action, metadataJson: l.metadataJson ?? null, createdAt: l.createdAt }]
      : [],
  );

  const channels = compact(notificationChannels).flatMap((c) =>
    c.id
      ? [
          {
            id: c.id,
            label: c.label ?? null,
            isActive: !!c.isActive,
            events: compact(c.events),
            webhookUrlPreview: c.webhookUrlPreview ?? "",
          },
        ]
      : [],
  );

  return (
    <PageContainer
      title="Settings"
      actions={
        <form action={logoutAction}>
          <button type="submit" className="rounded-md bg-field px-4 py-2 text-sm hover:bg-field/70">
            Log out
          </button>
        </form>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Profile" description={me.email ?? undefined}>
          <ProfileForm
            initial={{ firstName: me.firstName ?? "", lastName: me.lastName ?? "", taxResidency: me.taxResidency ?? "TH" }}
          />
        </Card>
        <Card title="Password">
          <PasswordForm />
        </Card>
      </div>
      <DiscordSection linked={!!me.discordLinked} isAdmin={me.role === "ADMIN"} channels={channels} />
      <AuditLogSection logs={auditLogs} />
    </PageContainer>
  );
}

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-md bg-muted p-5">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}
