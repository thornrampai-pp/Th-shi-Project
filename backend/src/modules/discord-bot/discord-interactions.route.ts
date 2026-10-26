import express, { Router } from 'express';
import { env } from '../../config/env';
import { verifyDiscordSignature } from '../../common/integrations/discord-signature.util';
import { handleInteraction, isPing, pongResponse } from './discord-interactions.service';
import type { DiscordInteraction } from './discord-interactions.service';

/**
 * POST /discord/interactions — Discord's HTTP Interactions Endpoint.
 * Uses express.raw() instead of express.json(): the Ed25519 signature is computed over
 * the exact raw bytes Discord sent, so the body must be verified before it's parsed.
 */
export function createDiscordInteractionsRouter(): Router {
  const router = Router();

  router.post('/interactions', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!env.DISCORD_PUBLIC_KEY) {
      res.status(503).json({ error: 'Discord bot is not configured — set DISCORD_PUBLIC_KEY' });
      return;
    }

    const signature = req.header('X-Signature-Ed25519');
    const timestamp = req.header('X-Signature-Timestamp');
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

    if (
      !signature ||
      !timestamp ||
      !verifyDiscordSignature({ signature, timestamp, rawBody, publicKey: env.DISCORD_PUBLIC_KEY })
    ) {
      res.status(401).send('invalid request signature');
      return;
    }

    let interaction: DiscordInteraction;
    try {
      interaction = JSON.parse(rawBody.toString('utf8')) as DiscordInteraction;
    } catch {
      res.status(400).send('invalid JSON body');
      return;
    }

    if (isPing(interaction)) {
      res.json(pongResponse());
      return;
    }

    try {
      res.json(await handleInteraction(interaction));
    } catch (err) {
      console.error('❌ Discord interaction failed:', err);
      res.json({ type: 4, data: { content: '❌ เกิดข้อผิดพลาดภายในระบบ' } });
    }
  });

  return router;
}
