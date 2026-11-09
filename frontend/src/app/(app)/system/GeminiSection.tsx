import LocalDateTime from "@/components/LocalDateTime";
import { cn } from "@/lib/utils";
import type { Gemini } from "./data";
import { Collapsible, Meter, Section, Stat, Stats, StatusBadge, Table, fmtNum, td } from "./ui";

export default function GeminiSection({ gemini }: { gemini: Gemini }) {
  const { today } = gemini;
  const noLimits = gemini.rpmLimit == null && gemini.tpmLimit == null && gemini.rpdLimit == null;
  const roleOf = (model: string, inChain: boolean) =>
    !inChain ? "not in chain" : model === gemini.model ? "primary" : "fallback";
  const lastFailed = gemini.log[0] ? !gemini.log[0].ok : false;

  return (
    <Section
      title="Gemini"
      description={`Daily limit is per model · resets midnight PT · ${today.day}`}
      badge={<StatusBadge ok={gemini.configured} label={gemini.configured ? "API key set" : "No API key"} />}
    >
      {/* The daily quota is per model, so each model gets its own bar. */}
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {gemini.byModel.map((m) => (
          <Meter
            key={m.model}
            label={`${m.model} · ${roleOf(m.model, m.inChain)}`}
            used={m.requests}
            limit={m.limit}
            muted={!m.inChain}
            hint={m.errors > 0 ? `${fmtNum(m.errors)} failed today` : undefined}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-6">
        <Meter label="Requests / min" used={gemini.requestsLastMinute} limit={gemini.rpmLimit} />
        <Meter label="Tokens / min" used={gemini.tokensLastMinute} limit={gemini.tpmLimit} />
      </div>
      {noLimits && (
        <p className="text-xs text-muted-foreground">Set GEMINI_RPM/TPM/RPD_LIMIT in the backend .env to see limits.</p>
      )}

      <Stats>
        <Stat label="Calls" value={fmtNum(today.requests)} detail={`${today.slipCalls} slip · ${today.statementCalls} statement`} />
        <Stat
          label="Tokens"
          value={fmtNum(today.totalTokens)}
          detail={`${fmtNum(today.promptTokens)} in · ${fmtNum(today.outputTokens)} out`}
        />
        <Stat label="Errors" value={fmtNum(today.errors)} />
        <Stat label="429" value={fmtNum(today.rateLimited)} />
      </Stats>

      <Collapsible title={`Recent calls (${gemini.log.length})`} open={lastFailed}>
        <Table head={["Time", "Kind", "Model", "Status", "Latency", "Tokens", "Error"]} empty={gemini.log.length === 0}>
          {gemini.log.map((l, i) => (
            <tr key={`${l.at}-${i}`}>
              <td className={td}>
                <LocalDateTime iso={l.at} format="short" />
              </td>
              <td className={td}>{l.kind}</td>
              <td className={cn(td, "font-mono", l.model && l.model !== gemini.model && "text-amber-500")}>{l.model ?? "—"}</td>
              <td className={cn(td, l.ok ? "text-gain" : "text-loss")}>{l.status ?? (l.ok ? "ok" : "failed")}</td>
              <td className={td}>{(l.ms / 1000).toFixed(1)}s</td>
              <td className={td}>{fmtNum(l.totalTokens)}</td>
              <td className="max-w-64 truncate py-1 pr-4 text-muted-foreground" title={l.error ?? undefined}>
                {l.error ?? ""}
              </td>
            </tr>
          ))}
        </Table>
      </Collapsible>

      <Collapsible title="Last 7 days">
        <Table head={["Day (PT)", "Requests", "Tokens", "Errors", "429"]} empty={gemini.history.length === 0}>
          {gemini.history.map((d) => (
            <tr key={d.day}>
              <td className={td}>{d.day}</td>
              <td className={td}>{fmtNum(d.requests)}</td>
              <td className={td}>{fmtNum(d.totalTokens)}</td>
              <td className={td}>{fmtNum(d.errors)}</td>
              <td className={td}>{fmtNum(d.rateLimited)}</td>
            </tr>
          ))}
        </Table>
      </Collapsible>
    </Section>
  );
}
