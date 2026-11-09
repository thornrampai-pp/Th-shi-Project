import LocalDateTime from "@/components/LocalDateTime";
import { cn } from "@/lib/utils";
import type { Cache } from "./data";
import { Collapsible, Section, Stat, Stats, Table, fmtNum, fmtPct, td } from "./ui";

export default function CacheSection({ cache }: { cache: Cache }) {
  const total = cache.hitsToday + cache.missesToday;

  return (
    <Section title="Cache" description="getOrSetCache reads (quotes, FX, insights) · today (UTC)">
      <Stats>
        <Stat label="Hit rate" value={fmtPct(cache.hitsToday, total)} />
        <Stat label="Hits" value={fmtNum(cache.hitsToday)} />
        <Stat label="Misses" value={fmtNum(cache.missesToday)} />
      </Stats>

      <Collapsible title={`By group (${cache.groups.length})`}>
        <Table head={["Group", "Hits", "Misses", "Rate"]} empty={cache.groups.length === 0}>
          {cache.groups.map((g) => (
            <tr key={g.group}>
              <td className={cn(td, "font-mono")}>{g.group}</td>
              <td className={td}>{fmtNum(g.hits)}</td>
              <td className={td}>{fmtNum(g.misses)}</td>
              <td className={td}>{fmtPct(g.hits, g.hits + g.misses)}</td>
            </tr>
          ))}
        </Table>
      </Collapsible>

      <Collapsible title={`Recent reads (${cache.log.length})`}>
        <Table head={["Time", "Key", "Result", "Took"]} empty={cache.log.length === 0}>
          {cache.log.map((l, i) => (
            <tr key={`${l.at}-${i}`}>
              <td className={td}>
                <LocalDateTime iso={l.at} format="short" />
              </td>
              <td className={cn(td, "max-w-56 truncate font-mono")} title={l.key}>
                {l.key}
              </td>
              <td className={cn(td, l.hit ? "text-gain" : "text-amber-500")}>{l.hit ? "hit" : "miss"}</td>
              <td className={td}>{fmtNum(l.ms)} ms</td>
            </tr>
          ))}
        </Table>
      </Collapsible>
    </Section>
  );
}
