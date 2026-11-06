"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/utils";

const INTERVAL_MS = 15_000;

/** Re-renders the page's Server Components every 15s while the tab is visible. */
export default function AutoRefresh() {
  const router = useRouter();
  const [enabled, setEnabled] = useState(true);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") startTransition(() => router.refresh());
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, router]);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => startTransition(() => router.refresh())}
        className="rounded-md bg-field px-3 py-1.5 text-xs text-foreground hover:bg-field/70"
      >
        {pending ? "Refreshing…" : "Refresh"}
      </button>
      <button
        type="button"
        aria-pressed={enabled}
        onClick={() => setEnabled((v) => !v)}
        className={cn(
          "rounded-md px-3 py-1.5 text-xs",
          enabled ? "bg-primary text-primary-foreground" : "bg-field text-foreground hover:bg-field/70",
        )}
      >
        Auto 15s {enabled ? "on" : "off"}
      </button>
    </div>
  );
}
