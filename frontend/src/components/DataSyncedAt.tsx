import LocalDateTime from "./LocalDateTime";

/** When prices/snapshots were last synced, in the viewer's timezone. */
export default function DataSyncedAt({ iso }: { iso: string | null }) {
  return (
    <p className="text-xs text-muted-foreground">
      Data updated {iso ? <LocalDateTime iso={iso} /> : "— not synced yet"}
    </p>
  );
}
