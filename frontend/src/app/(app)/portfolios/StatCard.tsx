import { cn } from "@/lib/utils";

/** The grey "Total Profit" tiles from the wireframe. */
export default function StatCard({
  label,
  value,
  detail,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    // Two to a row on phones, so the four portfolio tiles fit without a long scroll.
    <div className="flex min-h-24 min-w-0 flex-col justify-between gap-2 rounded-md bg-muted p-3 sm:min-h-28 sm:p-4">
      <p className="text-xs font-semibold sm:text-sm">{label}</p>
      <div className="min-w-0">
        <p className={cn("text-lg font-semibold break-words tabular-nums sm:text-2xl", valueClassName)}>{value}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}
