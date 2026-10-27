import { cn } from "@/lib/utils";

type Props = React.SelectHTMLAttributes<HTMLSelectElement> & {
  /** Fill the parent's width (form fields); otherwise size to the content (toolbars, tables). */
  block?: boolean;
};

/**
 * Native <select> with our own chevron: the browser's arrow ignores padding and sits
 * against the edge. Keeps the native picker, keyboard and mobile behaviour.
 */
export default function Select({ block, className, children, ...props }: Props) {
  return (
    <span className={cn("relative", block ? "block w-full" : "inline-block")}>
      <select
        {...props}
        // pr-9 last so a caller's px-* can't eat the chevron's room.
        className={cn("cursor-pointer appearance-none disabled:cursor-default", block && "w-full", className, "pr-9")}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground"
      >
        <path d="m4 6 4 4 4-4" />
      </svg>
    </span>
  );
}
