import { cn } from "@/lib/utils";

/** The grey "Total Profit" tiles from the wireframe. */
export default function StatCard({
  label,
  value,
  detail,
  valueClassName,
  className,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  valueClassName?: string;
  /** Grid placement, e.g. a col-span so a row of tiles has no gap. */
  className?: string;
}) {
  return (
    // Two to a row on phones, so the four portfolio tiles fit without a long scroll.
    // The value sits a fixed gap under the label (not pushed to the bottom), so figures
    // line up across a row whether or not a tile has a detail line.
    <div
      className={cn(
        "flex min-h-24 min-w-0 flex-col gap-2 rounded-md bg-muted p-3 sm:min-h-28 sm:p-4",
        className,
      )}
    >
      <p className="text-xs font-semibold sm:text-sm">{label}</p>
      <div className="min-w-0">
        <p className={cn("text-lg font-semibold break-words tabular-nums sm:text-2xl", valueClassName)}>{value}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}
