/**
 * Sends a Discord DM from the bot to a linked user (same sendDiscordDirectMessage the
 * password-reset code uses).
 *
 *   npm run discord:dm -- <email> "message text"
 *   npm run discord:dm -- <email> @path/to/message.txt     # read the message from a file
 *
 * The user must have linked Discord (/link) and share a server with the bot.
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { prisma } from '../src/config/prisma';
import { sendDiscordDirectMessage } from '../src/common/integrations/discord.util';

const DISCORD_MESSAGE_LIMIT = 2000;

async function main() {
  const [email, ...rest] = process.argv.slice(2);
  const arg = rest.join(' ');
  if (!email || !arg) {
    console.error('Usage: npm run discord:dm -- <email> "message" | @file.txt');
    process.exit(1);
  }

  const content = arg.startsWith('@') ? readFileSync(arg.slice(1), 'utf-8') : arg;
  if (content.length > DISCORD_MESSAGE_LIMIT) {
    console.error(`❌ Message is ${content.length} characters — Discord's limit is ${DISCORD_MESSAGE_LIMIT}`);
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user?.discordUserId) {
    console.error(`❌ ${email} not found, or hasn't linked Discord (/link)`);
    process.exit(1);
  }

  await sendDiscordDirectMessage(user.discordUserId, content);
  console.log(`✅ Sent to ${email}`);
}

main()
  .catch((err) => {
    console.error('❌ Failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit();
  });
