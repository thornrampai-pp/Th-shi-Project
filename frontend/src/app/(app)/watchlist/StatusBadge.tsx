import { cn } from "@/lib/utils";
import type { NoteStatus } from "./data";

const LABELS: Record<NoteStatus, string> = {
  none: "Not started",
  draft: "In progress",
  done: "Done",
};

export default function StatusBadge({ status, className }: { status: NoteStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs",
        status === "done" ? "bg-background/70 text-gain" : "bg-background/70 text-muted-foreground",
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "done" ? "bg-gain" : status === "draft" ? "bg-amber-500" : "bg-muted-foreground/50",
        )}
      />
      {LABELS[status]}
    </span>
  );
}
