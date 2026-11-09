import LocalDateTime from "@/components/LocalDateTime";
import type { Discord } from "./data";
import { Collapsible, Section, Stat, Stats, StatusBadge, Table, fmtNum, td } from "./ui";

function botBadge(discord: Discord) {
  if (!discord.botTokenSet || !discord.applicationIdSet) return <StatusBadge ok={false} label="Bot not configured" />;
  if (!discord.bot) return <StatusBadge ok={false} label="Not checked" />;
  return <StatusBadge ok={discord.bot.ok} label={discord.bot.ok ? "Bot connected" : "Bot check failed"} />;
}

export default function DiscordSection({ discord }: { discord: Discord }) {
  const { bot } = discord;
  // Only the missing settings are worth a line; all set is the normal case.
  const missing = [
    !discord.publicKeySet && "DISCORD_PUBLIC_KEY",
    !discord.botTokenSet && "DISCORD_BOT_TOKEN",
    !discord.applicationIdSet && "DISCORD_APPLICATION_ID",
  ].filter(Boolean);

  return (
    <Section
      title="Discord"
      description={
        bot ? (
          <>
            {bot.botUsername ?? "Unknown bot"}
            {bot.ms != null && ` · ${bot.ms} ms`} · {bot.commands.length} commands · checked{" "}
            <LocalDateTime iso={bot.checkedAt} format="short" />
          </>
        ) : (
          "Bot checked live (cached 60s) · counted today (UTC)"
        )
      }
      badge={botBadge(discord)}
    >
      {missing.length > 0 && <p className="text-xs text-loss">Not set: {missing.join(", ")}</p>}
      {bot?.error && <p className="text-xs text-loss">{bot.error}</p>}
      {bot && bot.commands.length === 0 && (
        <p className="text-xs text-muted-foreground">No slash commands — run npm run discord:register-commands</p>
      )}

      <Stats>
        <Stat
          label="Interactions"
          value={fmtNum(discord.interactionsToday)}
          detail={`${discord.interactionErrorsToday} failed · ${discord.invalidSignaturesToday} bad signatures${
            discord.interactionLabels.length > 0
              ? ` · ${discord.interactionLabels.map((l) => `${l.label} × ${l.count}`).join(", ")}`
              : ""
          }`}
        />
        <Stat label="DMs" value={fmtNum(discord.dmsToday)} detail={`${discord.dmErrorsToday} failed`} />
        <Stat
          label="Webhooks 24h"
          value={`${fmtNum(discord.sent24h)} / ${fmtNum(discord.failed24h)}`}
          detail={`sent / failed · ${discord.pending24h} pending · ${discord.activeChannels} of ${discord.channels} channels active`}
        />
        <Stat label="Linked users" value={fmtNum(discord.linkedUsers)} />
        <Stat
          label="Last interaction"
          value={discord.lastInteractionAt ? <LocalDateTime iso={discord.lastInteractionAt} format="short" /> : "—"}
        />
      </Stats>

      {discord.recentFailures.length > 0 && (
        <Collapsible title={`Recent webhook failures (${discord.recentFailures.length})`} open>
          <Table head={["Time", "Channel", "Event", "Error"]}>
            {discord.recentFailures.map((f, i) => (
              <tr key={`${f.at}-${i}`}>
                <td className={td}>
                  <LocalDateTime iso={f.at} format="short" />
                </td>
                <td className={td}>{f.channelLabel ?? "—"}</td>
                <td className={td}>{f.eventType}</td>
                <td className="max-w-80 truncate py-1 pr-4 text-muted-foreground" title={f.error ?? undefined}>
                  {f.error ?? ""}
                </td>
              </tr>
            ))}
          </Table>
        </Collapsible>
      )}
    </Section>
  );
}
