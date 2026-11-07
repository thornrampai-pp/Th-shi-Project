/**
 * A table column title for the dark table headers, with an optional one-line
 * explanation under it so a column reads without guessing. Top-aligned, so titles
 * line up whether or not they have a hint.
 */
export default function Th({
  title,
  hint,
  align = "left",
  srOnly = false,
}: {
  title: string;
  hint?: string;
  align?: "left" | "right" | "center";
  /** Title for screen readers only (e.g. an actions column). */
  srOnly?: boolean;
}) {
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th className={`px-4 py-2.5 align-top ${alignClass}`}>
      <span className={srOnly ? "sr-only" : "block"}>{title}</span>
      {hint && !srOnly && <span className="block text-[11px] font-normal whitespace-nowrap text-white/60">{hint}</span>}
    </th>
  );
}
