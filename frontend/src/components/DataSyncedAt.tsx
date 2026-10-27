"use client";

import { useSyncExternalStore } from "react";

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const noop = () => () => {};

/**
 * When prices/snapshots were last synced, in the viewer's timezone. The server only
 * knows UTC, so the time is filled in after hydration.
 */
export default function DataSyncedAt({ iso }: { iso: string | null }) {
  const isClient = useSyncExternalStore(noop, () => true, () => false);
  const date = iso ? new Date(iso) : null;
  const valid = date && !Number.isNaN(date.getTime());

  return (
    <p className="text-xs text-muted-foreground">
      Data updated{" "}
      {valid ? (
        <time dateTime={iso!} className="tabular-nums">
          {isClient ? dateTimeFormat.format(date) : "…"}
        </time>
      ) : (
        "— not synced yet"
      )}
    </p>
  );
}
