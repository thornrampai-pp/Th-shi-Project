import { cn } from "@/lib/utils";

// Small building blocks shared by the System page sections.

const integer = new Intl.NumberFormat("en-US");

export function fmtNum(value: number | null): string {
  return value == null ? "—" : integer.format(Math.round(value));
}

export function fmtBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value : value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

export function fmtDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function fmtPct(part: number, whole: number): string {
  return whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—";
}

export function Section({
  title,
  description,
  badge,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 space-y-3 rounded-md bg-muted p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
        </div>
        {badge}
      </div>
      {children}
    </section>
  );
}

/** A dot + short label; the label is the tooltip-free summary of the section's health. */
export function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-xs", ok ? "text-gain" : "text-loss")}>
      <span aria-hidden className={cn("size-1.5 rounded-full", ok ? "bg-gain" : "bg-loss")} />
      {label}
    </span>
  );
}

/** used / limit on one line over a thin bar. Without a limit it shows the count alone. */
export function Meter({
  label,
  used,
  limit,
  format = fmtNum,
  hint,
  muted,
}: {
  label: string;
  used: number;
  limit: number | null;
  format?: (v: number) => string;
  hint?: string;
  muted?: boolean;
}) {
  const pct = limit && limit > 0 ? (used / limit) * 100 : null;
  const tone = pct == null ? "bg-primary" : pct >= 90 ? "bg-loss" : pct >= 70 ? "bg-amber-500" : "bg-gain";

  return (
    <div className={cn("min-w-0 space-y-1", muted && "opacity-50")} title={hint}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate text-muted-foreground">{label}</span>
        <span className="shrink-0 tabular-nums">
          {format(used)}
          {limit != null && <span className="text-muted-foreground"> / {format(limit)}</span>}
        </span>
      </div>
      <div
        className="h-1 overflow-hidden rounded-full bg-field"
        role="meter"
        aria-label={label}
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit ?? undefined}
      >
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${Math.min(pct ?? 0, 100)}%` }} />
      </div>
    </div>
  );
}

/** One figure in a <Stats> row: small label over the value, detail as tooltip. */
export function Stat({ label, value, detail }: { label: string; value: React.ReactNode; detail?: string }) {
  return (
    <div className="min-w-0" title={detail}>
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}

export function Stats({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-x-6 gap-y-2">{children}</div>;
}

/** Collapsed detail (logs, breakdowns) so the page stays a summary until asked. */
export function Collapsible({
  title,
  open,
  children,
}: {
  title: React.ReactNode;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={open} className="group">
      <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground">
        <span className="inline-block transition-transform group-open:rotate-90">›</span> {title}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

/** Horizontally scrollable on phones so wide log rows never push the page sideways. */
export function Table({ head, children, empty }: { head: string[]; children: React.ReactNode; empty?: boolean }) {
  if (empty) return <p className="text-xs text-muted-foreground">Nothing recorded yet.</p>;
  return (
    <div className="-mx-1 max-h-72 overflow-auto px-1">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} className="py-1.5 pr-4 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">{children}</tbody>
      </table>
    </div>
  );
}

export const td = "py-1 pr-4 whitespace-nowrap tabular-nums";
