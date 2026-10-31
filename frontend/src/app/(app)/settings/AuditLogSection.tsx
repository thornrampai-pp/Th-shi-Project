import { formatDate } from "@/lib/dates";

type AuditLog = { id: string; action: string; metadataJson: string | null; createdAt: string };

const ACTION_LABEL: Record<string, string> = {
  DELETE_PORTFOLIO: "Deleted a portfolio",
  CREATE_TRANSACTION: "Recorded a transaction",
  FORCE_REBALANCE: "Recorded a rebalance",
};

function summarize(metadataJson: string | null): string {
  if (!metadataJson) return "";
  try {
    const data: unknown = JSON.parse(metadataJson);
    if (!data || typeof data !== "object") return "";
    return Object.entries(data as Record<string, unknown>)
      .map(([key, value]) => `${key}: ${value}`)
      .join(" · ");
  } catch {
    return "";
  }
}

/** Read-only — your own account/transaction/portfolio activity, newest first. */
export default function AuditLogSection({ logs }: { logs: AuditLog[] }) {
  return (
    <section className="space-y-4 rounded-md bg-muted p-5">
      <div>
        <h2 className="font-semibold">Activity log</h2>
        <p className="text-xs text-muted-foreground">The last {logs.length || 20} account events — only visible to you.</p>
      </div>

      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {logs.map((log) => (
            <li key={log.id} className="flex items-start justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{ACTION_LABEL[log.action] ?? log.action}</p>
                <p className="truncate text-xs text-muted-foreground">{summarize(log.metadataJson)}</p>
              </div>
              <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">{formatDate(log.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
