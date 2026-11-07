import LocalDateTime from "@/components/LocalDateTime";
import { cn } from "@/lib/utils";
import type { Sec } from "./data";
import { Section, Stat, StatusBadge, Table, fmtNum, td } from "./ui";

/** SEC Open API — the source of Thai mutual fund profiles and daily NAV. */
export default function SecSection({ sec }: { sec: Sec }) {
  return (
    <Section
      title="SEC fund API"
      description="Thai mutual fund lookup + daily NAV (api.sec.or.th) · requests counted today (UTC)"
      badge={<StatusBadge ok={sec.configured} label={sec.configured ? "SEC_API_KEY set" : "No SEC_API_KEY"} />}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Requests today" value={fmtNum(sec.requestsToday)} detail={`${sec.errorsToday} failed`} />
        <Stat label="Funds" value={fmtNum(sec.funds)} detail="known to the app" />
        <Stat label="Held funds" value={fmtNum(sec.heldFunds)} />
        <Stat label="Latest NAV" value={sec.latestNavDate ?? "—"} detail="across held funds" />
      </div>

      <details open={sec.log.some((l) => !l.ok)}>
        <summary className="cursor-pointer text-sm font-medium">Recent requests</summary>
        <div className="mt-2">
          <Table head={["Time", "Endpoint", "Status", "Latency", "Error"]} empty={sec.log.length === 0}>
            {sec.log.map((l, i) => (
              <tr key={`${l.at}-${i}`}>
                <td className={td}>
                  <LocalDateTime iso={l.at} format="short" />
                </td>
                <td className={cn(td, "font-mono text-xs")}>{l.path.replace("/v2/fund/", "")}</td>
                <td className={cn(td, l.ok ? "text-gain" : "text-loss")}>{l.status ?? (l.ok ? "ok" : "failed")}</td>
                <td className={td}>{fmtNum(l.ms)} ms</td>
                <td className="max-w-64 truncate py-1.5 pr-4 text-xs text-muted-foreground" title={l.error ?? undefined}>
                  {l.error ?? ""}
                </td>
              </tr>
            ))}
          </Table>
        </div>
      </details>
    </Section>
  );
}
