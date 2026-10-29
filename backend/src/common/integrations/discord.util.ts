import { env } from '../../config/env';

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title: string;
  description?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  timestamp?: string;
}

export interface DiscordMessage {
  text?: string;
  embeds?: DiscordEmbed[];
}

const DISCORD_API = 'https://discord.com/api/v10';

/**
 * Sends a DM from the bot to a user by their Discord user id. Used for password-reset
 * codes — there's no email provider configured, so Discord (already required to link
 * an account) is the only delivery channel.
 */
export async function sendDiscordDirectMessage(discordUserId: string, content: string): Promise<void> {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error('DISCORD_BOT_TOKEN is not configured');
  }
  const headers = { 'Content-Type': 'application/json', Authorization: `Bot ${token}` };

  const dmChannel = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ recipient_id: discordUserId }),
  });
  if (!dmChannel.ok) {
    throw new Error(`Could not open a Discord DM channel: ${dmChannel.status} ${await dmChannel.text().catch(() => '')}`);
  }
  const { id: channelId } = (await dmChannel.json()) as { id: string };

  const message = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content }),
  });
  if (!message.ok) {
    throw new Error(`Discord DM send failed: ${message.status} ${await message.text().catch(() => '')}`);
  }
}

export async function sendDiscordWebhookMessage(
  webhookUrl: string,
  message: DiscordMessage,
): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message.text, embeds: message.embeds }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Discord webhook responded with ${response.status}: ${body}`);
  }
}

export function buildInvestmentEmbed(params: {
  title: string;
  description?: string;
  color?: number;
  fields?: DiscordEmbedField[];
}): DiscordEmbed {
  return {
    title: params.title,
    description: params.description,
    color: params.color ?? 0x2ecc71,
    fields: params.fields,
    timestamp: new Date().toISOString(),
  };
}
