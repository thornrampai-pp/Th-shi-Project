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
