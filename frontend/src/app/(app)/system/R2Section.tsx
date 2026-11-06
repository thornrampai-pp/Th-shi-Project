import type { R2 } from "./data";
import { Meter, Section, Stat, StatusBadge, fmtBytes, fmtNum } from "./ui";

export default function R2Section({ r2 }: { r2: R2 }) {
  return (
    <Section
      title="Cloudflare R2"
      description={`${r2.bucket ?? "no bucket"} · operations for ${r2.month || "this month"} (UTC)`}
      badge={<StatusBadge ok={r2.configured} label={r2.configured ? "Configured" : "Not configured"} />}
    >
      <div className="grid grid-cols-1 gap-3">
        <Meter
          label="Storage"
          used={r2.usedBytes}
          limit={r2.quotaBytes}
          format={fmtBytes}
          hint="slip images, summed from the DB"
        />
        <Meter label="Class A ops (writes)" used={r2.classAOps} limit={r2.classALimit} hint="uploads this month" />
        <Meter
          label="Class B ops (reads)"
          used={r2.classBOps}
          limit={r2.classBLimit}
          hint="estimate — one per presigned URL issued"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Objects" value={fmtNum(r2.objectCount)} />
        <Stat label="Free" value={fmtBytes(Math.max(r2.quotaBytes - r2.usedBytes, 0))} />
      </div>
    </Section>
  );
}
