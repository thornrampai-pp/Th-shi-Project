import LocalDateTime from "@/components/LocalDateTime";
import { cn } from "@/lib/utils";
import type { Gemini } from "./data";
import { Meter, Section, Stat, StatusBadge, Table, fmtNum, td } from "./ui";

export default function GeminiSection({ gemini }: { gemini: Gemini }) {
  const { today } = gemini;
  const noLimits = gemini.rpmLimit == null && gemini.tpmLimit == null && gemini.rpdLimit == null;
  // The daily quota is per model, so the chain's day budget is the limit × its models.
  const chain = gemini.byModel.filter((m) => m.inChain);
  const dayLimit = gemini.rpdLimit != null && chain.length > 0 ? gemini.rpdLimit * chain.length : gemini.rpdLimit;
  const roleOf = (model: string, inChain: boolean) =>
    !inChain ? "not in chain" : model === gemini.model ? "primary" : "fallback";

  return (
    <Section
      title="Gemini quota"
      description={
        <>
          {gemini.model}
          {gemini.fallbackModels.length > 0 ? ` → fallback ${gemini.fallbackModels.join(", ")}` : " · no fallback model"} ·
          counted by this app (the API doesn&apos;t report quota) · daily limit is per model · day resets at midnight
          Pacific
        </>
      }
      badge={<StatusBadge ok={gemini.configured} label={gemini.configured ? "API key set" : "No API key"} />}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Meter label="Requests / min" used={gemini.requestsLastMinute} limit={gemini.rpmLimit} hint="last 60s" />
        <Meter label="Tokens / min" used={gemini.tokensLastMinute} limit={gemini.tpmLimit} hint="last 60s" />
        <Meter
          label="Requests today"
          used={chain.reduce((sum, m) => sum + m.requests, 0)}
          limit={dayLimit}
          hint={
            gemini.rpdLimit != null && chain.length > 1
              ? `${today.day} · ${chain.length} models × ${fmtNum(gemini.rpdLimit)}`
              : today.day
          }
        />
      </div>
      {noLimits && (
        <p className="text-xs text-muted-foreground">
          Set GEMINI_RPM_LIMIT, GEMINI_TPM_LIMIT and GEMINI_RPD_LIMIT in the backend .env (values from AI Studio → Rate
          limits) to see how close you are.
        </p>
      )}

      {gemini.byModel.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Requests today by model</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {gemini.byModel.map((m) => (
              <div key={m.model} className={cn(!m.inChain && "opacity-60")}>
                <Meter
                  label={m.model}
                  used={m.requests}
                  limit={m.limit}
                  hint={`${roleOf(m.model, m.inChain)}${m.errors > 0 ? ` · ${fmtNum(m.errors)} failed` : ""}${
                    m.limit != null && m.inChain && m.requests >= m.limit ? " · skipped until reset" : ""
                  }`}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Tokens today"
          value={fmtNum(today.totalTokens)}
          detail={`${fmtNum(today.promptTokens)} in · ${fmtNum(today.outputTokens)} out`}
        />
        <Stat label="Calls today" value={fmtNum(today.requests)} detail={`${today.slipCalls} slip · ${today.statementCalls} statement`} />
        <Stat label="Errors today" value={fmtNum(today.errors)} />
        <Stat label="429 rate-limited" value={fmtNum(today.rateLimited)} />
      </div>

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium">Last 7 days</summary>
        <div className="mt-2">
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
        </div>
      </details>

      <details className="group" open={gemini.log.length > 0}>
        <summary className="cursor-pointer text-sm font-medium">Recent calls</summary>
        <div className="mt-2">
          <Table head={["Time", "Kind", "Model", "Status", "Latency", "Tokens", "Error"]} empty={gemini.log.length === 0}>
            {gemini.log.map((l, i) => (
              <tr key={`${l.at}-${i}`}>
                <td className={td}>
                  <LocalDateTime iso={l.at} format="short" />
                </td>
                <td className={td}>{l.kind}</td>
                <td className={cn(td, "font-mono text-xs", l.model && l.model !== gemini.model && "text-amber-500")}>
                  {l.model ?? "—"}
                </td>
                <td className={cn(td, l.ok ? "text-gain" : "text-loss")}>{l.status ?? (l.ok ? "ok" : "failed")}</td>
                <td className={td}>{(l.ms / 1000).toFixed(1)}s</td>
                <td className={td}>{fmtNum(l.totalTokens)}</td>
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
