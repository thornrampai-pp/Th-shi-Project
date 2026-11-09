import type { R2 } from "./data";
import { Meter, Section, StatusBadge, fmtBytes, fmtNum } from "./ui";

export default function R2Section({ r2 }: { r2: R2 }) {
  return (
    <Section
      title="Cloudflare R2"
      description={`${r2.bucket ?? "no bucket"} · ${fmtNum(r2.objectCount)} objects · ops for ${r2.month || "this month"} (UTC)`}
      badge={<StatusBadge ok={r2.configured} label={r2.configured ? "Configured" : "Not configured"} />}
    >
      <div className="space-y-3">
        <Meter
          label="Storage"
          used={r2.usedBytes}
          limit={r2.quotaBytes}
          format={fmtBytes}
          hint={`slip images, summed from the DB · ${fmtBytes(Math.max(r2.quotaBytes - r2.usedBytes, 0))} free`}
        />
        <Meter label="Class A ops (writes)" used={r2.classAOps} limit={r2.classALimit} hint="uploads this month" />
        <Meter label="Class B ops (reads)" used={r2.classBOps} limit={r2.classBLimit} hint="estimate — one per presigned URL issued" />
      </div>
    </Section>
  );
}
