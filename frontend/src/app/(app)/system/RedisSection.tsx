import LocalDateTime from "@/components/LocalDateTime";
import { cn } from "@/lib/utils";
import type { RedisInfo } from "./data";
import { Meter, Section, Stat, StatusBadge, Table, fmtBytes, fmtDuration, fmtNum, fmtPct, td } from "./ui";

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
      {redis.error && <p className="rounded-md bg-loss/10 px-3 py-2 text-sm text-loss">{redis.error}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Keys" value={fmtNum(redis.totalKeys)} detail={`${fmtNum(redis.keysWithExpiry)} with TTL`} />
        <Stat label="Ops / sec" value={fmtNum(redis.opsPerSecond)} detail={`${fmtNum(redis.totalCommands)} commands total`} />
        <Stat label="Hit rate (server)" value={fmtPct(hits, hits + misses)} detail={`${fmtNum(hits)} hits · ${fmtNum(misses)} misses`} />
        <Stat label="Evicted / expired" value={`${fmtNum(redis.evictedKeys)} / ${fmtNum(redis.expiredKeys)}`} detail="since start" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-sm font-medium">
            Keys by group
            {redis.keyGroupsTruncated && <span className="font-normal text-muted-foreground"> · sample of first 20k</span>}
          </h3>
          <Table head={["Group", "Keys"]} empty={redis.keyGroups.length === 0}>
            {redis.keyGroups.map((g) => (
              <tr key={g.group}>
                <td className={cn(td, "font-mono text-xs")}>{g.group}</td>
                <td className={td}>{fmtNum(g.count)}</td>
              </tr>
            ))}
          </Table>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium">
            Connection log <span className="font-normal text-muted-foreground">· this API instance, since restart</span>
          </h3>
          <Table head={["Time", "Event", "Detail"]} empty={redis.events.length === 0}>
            {redis.events.map((e, i) => (
              <tr key={`${e.at}-${i}`}>
                <td className={td}>
                  <LocalDateTime iso={e.at} format="short" />
                </td>
                <td className={cn(td, EVENT_TONE[e.type])}>{e.type}</td>
                <td className="max-w-64 truncate py-1.5 pr-4 text-xs text-muted-foreground" title={e.message ?? undefined}>
                  {e.message ?? ""}
                </td>
              </tr>
            ))}
          </Table>
        </div>
      </div>
    </Section>
  );
}
