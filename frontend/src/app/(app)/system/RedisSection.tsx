import LocalDateTime from "@/components/LocalDateTime";
import { cn } from "@/lib/utils";
import type { RedisInfo } from "./data";
import { Collapsible, Meter, Section, Stat, Stats, StatusBadge, Table, fmtBytes, fmtDuration, fmtNum, fmtPct, td } from "./ui";

const EVENT_TONE: Record<string, string> = {
  error: "text-loss",
  end: "text-loss",
  reconnecting: "text-amber-500",
  ready: "text-gain",
  connect: "text-muted-foreground",
};

export default function RedisSection({ redis }: { redis: RedisInfo }) {
  const hits = redis.keyspaceHits ?? 0;
  const misses = redis.keyspaceMisses ?? 0;
  const maxMemory = redis.maxMemoryBytes && redis.maxMemoryBytes > 0 ? redis.maxMemoryBytes : null;
  const troubled = redis.events.some((e) => e.type === "error" || e.type === "end" || e.type === "reconnecting");

  return (
    <Section
      title="Redis"
      description={
        redis.version
          ? `Redis ${redis.version}${redis.mode ? ` · ${redis.mode}` : ""} · up ${fmtDuration(redis.uptimeSeconds)}`
          : `client ${redis.clientStatus}`
      }
      badge={
        <StatusBadge
          ok={redis.connected}
          label={redis.connected ? `Connected · ${redis.pingMs ?? "?"} ms` : `Disconnected (${redis.clientStatus})`}
        />
      }
    >
      {redis.error && <p className="text-xs text-loss">{redis.error}</p>}

      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <Meter
          label="Memory"
          used={redis.usedMemoryBytes ?? 0}
          limit={maxMemory}
          format={fmtBytes}
          hint={`peak ${fmtBytes(redis.peakMemoryBytes)} · policy ${redis.maxMemoryPolicy ?? "—"}`}
        />
        <Meter
          label="Clients"
          used={redis.connectedClients ?? 0}
          limit={redis.maxClients}
          hint={`${fmtNum(redis.rejectedConnections)} rejected since start`}
        />
      </div>

      <Stats>
        <Stat label="Keys" value={fmtNum(redis.totalKeys)} detail={`${fmtNum(redis.keysWithExpiry)} with TTL`} />
        <Stat label="Ops / sec" value={fmtNum(redis.opsPerSecond)} detail={`${fmtNum(redis.totalCommands)} commands total`} />
        <Stat label="Hit rate" value={fmtPct(hits, hits + misses)} detail={`${fmtNum(hits)} hits · ${fmtNum(misses)} misses (server)`} />
        <Stat label="Evicted / expired" value={`${fmtNum(redis.evictedKeys)} / ${fmtNum(redis.expiredKeys)}`} detail="since start" />
      </Stats>

      <Collapsible title={`Keys by group (${redis.keyGroups.length}${redis.keyGroupsTruncated ? ", first 20k keys" : ""})`}>
        <Table head={["Group", "Keys"]} empty={redis.keyGroups.length === 0}>
          {redis.keyGroups.map((g) => (
            <tr key={g.group}>
              <td className={cn(td, "font-mono")}>{g.group}</td>
              <td className={td}>{fmtNum(g.count)}</td>
            </tr>
          ))}
        </Table>
      </Collapsible>

      <Collapsible title={`Connection log (${redis.events.length}, since API restart)`} open={troubled}>
        <Table head={["Time", "Event", "Detail"]} empty={redis.events.length === 0}>
          {redis.events.map((e, i) => (
            <tr key={`${e.at}-${i}`}>
              <td className={td}>
                <LocalDateTime iso={e.at} format="short" />
              </td>
              <td className={cn(td, EVENT_TONE[e.type])}>{e.type}</td>
              <td className="max-w-64 truncate py-1 pr-4 text-muted-foreground" title={e.message ?? undefined}>
                {e.message ?? ""}
              </td>
            </tr>
          ))}
        </Table>
      </Collapsible>
    </Section>
  );
}
