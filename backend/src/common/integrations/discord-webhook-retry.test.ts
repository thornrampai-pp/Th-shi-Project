import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../config/env', () => ({ env: {} }));
vi.mock('../monitoring/usage-metrics', () => ({ recordDiscordEvent: vi.fn() }));

import { sendDiscordWebhookMessage } from './discord.util';

const URL = 'https://discord.com/api/webhooks/1/abc';
const rateLimited = () =>
  new Response(JSON.stringify({ message: 'You are being rate limited.', retry_after: 0.01, global: false }), { status: 429 });

afterEach(() => vi.unstubAllGlobals());

describe('sendDiscordWebhookMessage — Discord rate limits', () => {
  it('waits out a 429 and sends again instead of dropping the message', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(rateLimited()).mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    await expect(sendDiscordWebhookMessage(URL, { text: 'hi' })).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('gives up after a few 429s in a row and reports it', async () => {
    const fetch = vi.fn().mockImplementation(async () => rateLimited());
    vi.stubGlobal('fetch', fetch);
    await expect(sendDiscordWebhookMessage(URL, { text: 'hi' })).rejects.toThrow(/429/);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('does not retry other errors (a deleted webhook stays an error)', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"message":"Unknown Webhook"}', { status: 404 }));
    vi.stubGlobal('fetch', fetch);
    await expect(sendDiscordWebhookMessage(URL, { text: 'hi' })).rejects.toThrow(/404/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
