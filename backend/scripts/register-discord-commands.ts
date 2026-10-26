/**
 * Registers the bot's global slash commands with Discord. Run once after creating the
 * application, and again whenever a command definition below changes:
 *
 *   npm run discord:register-commands
 *
 * Reads process.env directly (not src/config/env.ts) so it doesn't need DATABASE_URL,
 * JWT secrets, etc. just to talk to Discord.
 */
import 'dotenv/config';

const OPTION_STRING = 3;
const OPTION_ATTACHMENT = 11;

const commands = [
  {
    name: 'link',
    description: 'เชื่อมบัญชี Discord กับบัญชีในแอป (ขอโค้ดจากแอปก่อน)',
    options: [{ type: OPTION_STRING, name: 'code', description: 'โค้ดจาก generateDiscordLinkCode', required: true }],
  },
  {
    name: 'upload-slip',
    description: 'แนบสลิปโอนเงินให้กับธุรกรรม',
    options: [
      { type: OPTION_STRING, name: 'transaction_id', description: 'ID ของธุรกรรม', required: true },
      { type: OPTION_ATTACHMENT, name: 'image', description: 'รูปสลิป', required: true },
    ],
  },
];

async function main() {
  const applicationId = process.env.DISCORD_APPLICATION_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!applicationId || !botToken) {
    console.error('❌ Set DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN in .env first');
    process.exit(1);
  }

  // PUT replaces the full global command set, so this is idempotent.
  const response = await fetch(`https://discord.com/api/v10/applications/${applicationId}/commands`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bot ${botToken}` },
    body: JSON.stringify(commands),
  });

  if (!response.ok) {
    console.error(`❌ Discord responded with ${response.status}: ${await response.text()}`);
    process.exit(1);
  }

  const registered = (await response.json()) as { name: string }[];
  console.log(`✅ Registered ${registered.length} commands: ${registered.map((c) => `/${c.name}`).join(', ')}`);
}

main().catch((err) => {
  console.error('❌ Failed to register commands:', err);
  process.exit(1);
});
