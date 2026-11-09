import LocalDateTime from "@/components/LocalDateTime";
import { cn } from "@/lib/utils";
import type { Sec } from "./data";
import { Collapsible, Section, Stat, Stats, StatusBadge, Table, fmtNum, td } from "./ui";

/** SEC Open API — the source of Thai mutual fund profiles and daily NAV. */
export default function SecSection({ sec }: { sec: Sec }) {
  return (
    <Section
      title="SEC fund API"
      description="Thai fund lookup + daily NAV · counted today (UTC)"
      badge={<StatusBadge ok={sec.configured} label={sec.configured ? "Key set" : "No SEC_API_KEY"} />}
    >
      <Stats>
        <Stat label="Requests" value={fmtNum(sec.requestsToday)} detail={`${sec.errorsToday} failed`} />
        <Stat label="Funds" value={fmtNum(sec.funds)} detail="known to the app" />
        <Stat label="Held" value={fmtNum(sec.heldFunds)} />
        <Stat label="Latest NAV" value={sec.latestNavDate ?? "—"} detail="across held funds" />
      </Stats>

      <Collapsible title={`Recent requests (${sec.log.length})`} open={sec.log[0] ? !sec.log[0].ok : false}>
        <Table head={["Time", "Endpoint", "Status", "Latency", "Error"]} empty={sec.log.length === 0}>
          {sec.log.map((l, i) => (
            <tr key={`${l.at}-${i}`}>
              <td className={td}>
                <LocalDateTime iso={l.at} format="short" />
              </td>
              <td className={cn(td, "font-mono")}>{l.path.replace("/v2/fund/", "")}</td>
              <td className={cn(td, l.ok ? "text-gain" : "text-loss")}>{l.status ?? (l.ok ? "ok" : "failed")}</td>
              <td className={td}>{fmtNum(l.ms)} ms</td>
              <td className="max-w-64 truncate py-1 pr-4 text-muted-foreground" title={l.error ?? undefined}>
                {l.error ?? ""}
              </td>
            </tr>
          ))}
        </Table>
      </Collapsible>
    </Section>
  );
}
