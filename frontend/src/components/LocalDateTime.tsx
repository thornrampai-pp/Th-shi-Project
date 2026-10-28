"use client";

import { useSyncExternalStore } from "react";

const formats = {
  long: new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }),
  short: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
};

const noop = () => () => {};

/**
 * A timestamp in the viewer's timezone. The server only knows UTC, so the text is
 * filled in after hydration.
 */
export default function LocalDateTime({ iso, format = "long" }: { iso: string; format?: keyof typeof formats }) {
  const isClient = useSyncExternalStore(noop, () => true, () => false);
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return <>—</>;

  return (
    <time dateTime={iso} className="tabular-nums">
      {isClient ? formats[format].format(date) : "…"}
    </time>
  );
}
