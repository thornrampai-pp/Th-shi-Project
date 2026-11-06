import LocalDateTime from "@/components/LocalDateTime";
import type { Discord } from "./data";
import { Section, Stat, StatusBadge, Table, fmtNum, td } from "./ui";

function botBadge(discord: Discord) {
  if (!discord.botTokenSet || !discord.applicationIdSet) return <StatusBadge ok={false} label="Bot not configured" />;
  if (!discord.bot) return <StatusBadge ok={false} label="Not checked" />;
  return <StatusBadge ok={discord.bot.ok} label={discord.bot.ok ? "Bot connected" : "Bot check failed"} />;
}

function ConfigFlag({ label, set }: { label: string; set: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span aria-hidden className={set ? "text-gain" : "text-loss"}>
        {set ? "✓" : "✕"}
      </span>
      <span className="font-mono">{label}</span>
    </span>
  );
}

export default function DiscordSection({ discord }: { discord: Discord }) {
  const { bot } = discord;

  return (
    <Section
      title="Discord"
      description="Bot token + slash commands checked live (cached 60s); interactions and DMs counted today (UTC)"
      badge={botBadge(discord)}
    >
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <ConfigFlag label="DISCORD_PUBLIC_KEY" set={discord.publicKeySet} />
        <ConfigFlag label="DISCORD_BOT_TOKEN" set={discord.botTokenSet} />
        <ConfigFlag label="DISCORD_APPLICATION_ID" set={discord.applicationIdSet} />
      </div>

      {bot && (
        <div className="space-y-1 rounded-md bg-background/60 p-3 text-sm">
          <p>
            <span className="font-medium">{bot.botUsername ?? "Unknown bot"}</span>
            <span className="text-muted-foreground">
              {bot.ms != null && ` · ${bot.ms} ms`} · checked <LocalDateTime iso={bot.checkedAt} format="short" />
            </span>
          </p>
          {bot.error && <p className="text-xs text-loss">{bot.error}</p>}
          <p className="text-xs text-muted-foreground">
            Registered commands:{" "}
            {bot.commands.length > 0 ? bot.commands.map((c) => `/${c}`).join(", ") : "none — run npm run discord:register-commands"}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Interactions today"
          value={fmtNum(discord.interactionsToday)}
          detail={`${discord.interactionErrorsToday} failed`}
        />
        <Stat
          label="Last interaction"
          value={discord.lastInteractionAt ? <LocalDateTime iso={discord.lastInteractionAt} format="short" /> : "—"}
        />
        <Stat label="Bad signatures" value={fmtNum(discord.invalidSignaturesToday)} detail="today" />
        <Stat label="Bot DMs today" value={fmtNum(discord.dmsToday)} detail={`${discord.dmErrorsToday} failed`} />
        <Stat label="Linked users" value={fmtNum(discord.linkedUsers)} />
        <Stat label="Webhook channels" value={`${discord.activeChannels} / ${discord.channels}`} detail="active / total" />
        <Stat label="Webhooks sent (24h)" value={fmtNum(discord.sent24h)} detail={`${discord.pending24h} pending`} />
        <Stat label="Webhooks failed (24h)" value={fmtNum(discord.failed24h)} />
      </div>

      {discord.interactionLabels.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {discord.interactionLabels.map((l) => (
            <span key={l.label} className="rounded-full bg-background/60 px-2.5 py-0.5 text-xs">
              <span className="font-mono">{l.label}</span> <span className="text-muted-foreground">× {l.count}</span>
            </span>
          ))}
        </div>
      )}

      <details open={discord.recentFailures.length > 0}>
        <summary className="cursor-pointer text-sm font-medium">Recent webhook failures</summary>
        <div className="mt-2">
          <Table head={["Time", "Channel", "Event", "Error"]} empty={discord.recentFailures.length === 0}>
            {discord.recentFailures.map((f, i) => (
              <tr key={`${f.at}-${i}`}>
                <td className={td}>
                  <LocalDateTime iso={f.at} format="short" />
                </td>
                <td className={td}>{f.channelLabel ?? "—"}</td>
                <td className={td}>{f.eventType}</td>
                <td className="max-w-80 truncate py-1.5 pr-4 text-xs text-muted-foreground" title={f.error ?? undefined}>
                  {f.error ?? ""}
                </td>
              </tr>
            ))}
          </Table>
        </div>
      </details>
    </Section>
  );
}
