import LocalDateTime from "@/components/LocalDateTime";
import { cn } from "@/lib/utils";
import type { Cache } from "./data";
import { Section, Stat, Table, fmtNum, fmtPct, td } from "./ui";

export default function CacheSection({ cache }: { cache: Cache }) {
  const total = cache.hitsToday + cache.missesToday;

  return (
    <Section title="Cache log" description="Every getOrSetCache read (quotes, FX, insights) — today in UTC, last 50 calls below">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Hit rate today" value={fmtPct(cache.hitsToday, total)} />
        <Stat label="Hits" value={fmtNum(cache.hitsToday)} />
        <Stat label="Misses" value={fmtNum(cache.missesToday)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-2">
          <h3 className="text-sm font-medium">By group</h3>
          <Table head={["Group", "Hits", "Misses", "Rate"]} empty={cache.groups.length === 0}>
            {cache.groups.map((g) => (
              <tr key={g.group}>
                <td className={cn(td, "font-mono text-xs")}>{g.group}</td>
                <td className={td}>{fmtNum(g.hits)}</td>
                <td className={td}>{fmtNum(g.misses)}</td>
                <td className={td}>{fmtPct(g.hits, g.hits + g.misses)}</td>
              </tr>
            ))}
          </Table>
        </div>

        <div className="space-y-2 lg:col-span-2">
          <h3 className="text-sm font-medium">Recent reads</h3>
          <Table head={["Time", "Key", "Result", "Time taken"]} empty={cache.log.length === 0}>
            {cache.log.map((l, i) => (
              <tr key={`${l.at}-${i}`}>
                <td className={td}>
                  <LocalDateTime iso={l.at} format="short" />
                </td>
                <td className={cn(td, "max-w-56 truncate font-mono text-xs")} title={l.key}>
                  {l.key}
                </td>
                <td className={cn(td, l.hit ? "text-gain" : "text-amber-500")}>{l.hit ? "hit" : "miss"}</td>
                <td className={td}>{fmtNum(l.ms)} ms</td>
              </tr>
            ))}
          </Table>
        </div>
      </div>
    </Section>
  );
}
