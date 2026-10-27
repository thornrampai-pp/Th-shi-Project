"use server";

import { cookies } from "next/headers";
import { graphql } from "@/gql";
import type { NotificationEventType } from "@/gql/graphql";
import { backendRequest } from "@/lib/graphql/backend";
import { GraphQLRequestError, serverQuery } from "@/lib/graphql/server";
import { toTokens, tokenCookies } from "@/lib/auth/tokens";
import { run, type ActionResult } from "./run";

const UpdateProfileMutation = graphql(`
  mutation UpdateProfile($firstName: String, $lastName: String, $taxResidency: String) {
    updateProfile(firstName: $firstName, lastName: $lastName, taxResidency: $taxResidency) {
      id
    }
  }
`);

const ChangePasswordMutation = graphql(`
  mutation ChangePassword($oldPassword: String!, $newPassword: String!) {
    changePassword(oldPassword: $oldPassword, newPassword: $newPassword)
  }
`);

const MeEmailQuery = graphql(`
  query MeEmail {
    me {
      email
    }
  }
`);

const ReLoginMutation = graphql(`
  mutation ReLogin($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      accessToken
      refreshToken
    }
  }
`);

const GenerateLinkCodeMutation = graphql(`
  mutation GenerateDiscordLinkCode {
    generateDiscordLinkCode
  }
`);

const ConnectChannelMutation = graphql(`
  mutation ConnectDiscordChannel($webhookUrl: String!, $label: String, $events: [NotificationEventType!]!) {
    connectDiscordChannel(webhookUrl: $webhookUrl, label: $label, events: $events) {
      id
    }
  }
`);

const UpdateChannelMutation = graphql(`
  mutation UpdateNotificationChannel($id: ID!, $isActive: Boolean, $events: [NotificationEventType!]) {
    updateNotificationChannel(id: $id, isActive: $isActive, events: $events) {
      id
    }
  }
`);

const TestChannelMutation = graphql(`
  mutation TestNotificationChannel($id: ID!) {
    testNotificationChannel(id: $id)
  }
`);

const RemoveChannelMutation = graphql(`
  mutation RemoveNotificationChannel($id: ID!) {
    removeNotificationChannel(id: $id)
  }
`);

export async function updateProfileAction(input: { firstName: string; lastName: string; taxResidency: string }) {
  return run(() => serverQuery(UpdateProfileMutation, input));
}

/**
 * Changing the password revokes every session (tokenVersion++), this one included —
 * so sign straight back in with the new password to keep the user where they are.
 */
export async function changePasswordAction(oldPassword: string, newPassword: string): Promise<ActionResult> {
  const result = await run(async () => {
    const { me } = await serverQuery(MeEmailQuery);
    if (!me?.email) throw new GraphQLRequestError("Couldn't load your account");
    await serverQuery(ChangePasswordMutation, { oldPassword, newPassword });

    const res = await backendRequest(ReLoginMutation, { email: me.email, password: newPassword });
    const tokens = toTokens(res.data?.login);
    if (!tokens) throw new GraphQLRequestError("Password changed — please log in again");
    const store = await cookies();
    for (const c of tokenCookies(tokens)) store.set(c.name, c.value, c.options);
  });
  return result;
}

export async function generateLinkCodeAction(): Promise<{ code?: string; error?: string }> {
  try {
    const { generateDiscordLinkCode } = await serverQuery(GenerateLinkCodeMutation);
    return generateDiscordLinkCode ? { code: generateDiscordLinkCode } : { error: "No code returned" };
  } catch (e) {
    if (e instanceof GraphQLRequestError) return { error: e.message };
    if (e instanceof TypeError) return { error: "Couldn't reach the server" };
    throw e;
  }
}

export async function connectChannelAction(webhookUrl: string, label: string, events: NotificationEventType[]) {
  return run(() => serverQuery(ConnectChannelMutation, { webhookUrl, label: label || undefined, events }));
}

export async function updateChannelAction(id: string, patch: { isActive?: boolean; events?: NotificationEventType[] }) {
  return run(() => serverQuery(UpdateChannelMutation, { id, ...patch }));
}

export async function testChannelAction(id: string) {
  return run(() => serverQuery(TestChannelMutation, { id }));
}

export async function removeChannelAction(id: string) {
  return run(() => serverQuery(RemoveChannelMutation, { id }));
}
