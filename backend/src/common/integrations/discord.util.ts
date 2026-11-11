import { env } from '../../config/env';
import { recordDiscordEvent } from '../monitoring/usage-metrics';

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
  try {
    await sendDirectMessage(discordUserId, content);
    recordDiscordEvent('dm', true);
  } catch (err) {
    recordDiscordEvent('dm', false);
    throw err;
  }
}

async function sendDirectMessage(discordUserId: string, content: string): Promise<void> {
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

/** Discord answers 429 when a webhook is hit faster than ~5 messages / 2s. */
const WEBHOOK_MAX_ATTEMPTS = 4;
const MAX_RETRY_WAIT_MS = 10_000;

/** How long Discord asked us to wait: `retry_after` (seconds) in the body, else the header. */
function retryAfterMs(body: string, header: string | null): number {
  let seconds = Number(header);
  try {
    const parsed = JSON.parse(body) as { retry_after?: number };
    if (typeof parsed.retry_after === 'number') seconds = parsed.retry_after;
  } catch {
    // not JSON — fall back to the header
  }
  return Math.min(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 1000, MAX_RETRY_WAIT_MS);
}

/**
 * Posts to a channel webhook. A 429 is waited out and sent again (up to 4 tries) —
 * a statement import used to fire dozens at once and Discord dropped half of them.
 * Any other failure (deleted webhook, bad payload) is thrown at once.
 */
export async function sendDiscordWebhookMessage(
  webhookUrl: string,
  message: DiscordMessage,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message.text, embeds: message.embeds }),
    });
    if (response.ok) return;

    const body = await response.text().catch(() => '');
    if (response.status === 429 && attempt < WEBHOOK_MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs(body, response.headers.get('retry-after'))));
      continue;
    }
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
