import { cn } from "@/lib/utils";

/** The grey "Total Profit" tiles from the wireframe. */
export default function StatCard({
  label,
  value,
  detail,
  valueClassName,
}: {
  label: string;
  value: string;
  detail?: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex min-h-28 flex-col justify-between rounded-md bg-muted p-4">
      <p className="text-sm font-semibold">{label}</p>
      <div>
        <p className={cn("text-2xl font-semibold tabular-nums", valueClassName)}>{value}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}
