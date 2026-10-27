"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteAlertAction, setAlertActiveAction } from "@/actions/alerts";
import { formatDate } from "@/lib/dates";
import type { Asset } from "@/lib/graphql/normalize";
import { cn } from "@/lib/utils";
import { describeCondition } from "./conditions";
import NewAlertDialog from "./NewAlertDialog";

export type AlertItem = {
  id: string;
  condition: string;
  targetValue: number;
  isActive: boolean;
  updatedAt: string;
  asset: Asset;
};

export default function AlertsBoard({ alerts }: { alerts: AlertItem[] }) {
  const [creating, setCreating] = useState(false);
  const active = alerts.filter((a) => a.isActive);
  const inactive = alerts.filter((a) => !a.isActive);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Checked every 5 minutes. When one fires it&apos;s sent to your Discord channel and switched off.
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
        >
          + New alert
        </button>
      </div>

      {alerts.length === 0 ? (
        <p className="py-24 text-center text-sm text-muted-foreground">No alerts yet.</p>
      ) : (
        <>
          <AlertGroup title={`Active · ${active.length}`} alerts={active} empty="No active alerts." />
          {inactive.length > 0 && <AlertGroup title={`Triggered or paused · ${inactive.length}`} alerts={inactive} />}
        </>
      )}

      {creating && <NewAlertDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function AlertGroup({ title, alerts, empty }: { title: string; alerts: AlertItem[]; empty?: string }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      {alerts.length === 0 && empty ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {alerts.map((a) => (
            <AlertCard key={a.id} alert={a} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AlertCard({ alert }: { alert: AlertItem }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const act = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      setError("");
      const res = await fn();
      if (res.error) setError(res.error);
    });

  return (
    <li className={cn("flex flex-col gap-3 rounded-md bg-muted p-4", !alert.isActive && "opacity-75", pending && "opacity-50")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/watchlist/${alert.asset.id}`} className="text-lg font-semibold hover:underline">
            {alert.asset.symbol}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{alert.asset.name}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium",
            alert.isActive ? "bg-gain/15 text-gain" : "bg-field text-muted-foreground",
          )}
        >
          {alert.isActive ? "● Active" : "○ Off"}
        </span>
      </div>

      <p className="text-sm font-medium">{describeCondition(alert.condition, alert.targetValue)}</p>
      {!alert.isActive && <p className="-mt-2 text-xs text-muted-foreground">Since {formatDate(alert.updatedAt)}</p>}

      {error && <p className="text-xs text-loss">{error}</p>}

      <div className="mt-auto flex justify-end gap-3 text-xs">
        <button
          type="button"
          disabled={pending}
          onClick={() => act(() => setAlertActiveAction(alert.id, !alert.isActive))}
          className="text-muted-foreground hover:text-foreground"
        >
          {alert.isActive ? "Pause" : "Re-arm"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => confirm(`Delete the ${alert.asset.symbol} alert?`) && act(() => deleteAlertAction(alert.id))}
          className="text-muted-foreground hover:text-loss"
        >
          Delete
        </button>
      </div>
    </li>
  );
}
