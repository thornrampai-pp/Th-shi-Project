import { Private } from "@/components/AmountPrivacy";
import { formatCurrency } from "@/lib/format";
import type { CashPool } from "./data";

/** `$0.00 · ฿0.00` — the shared cash, one amount per currency. */
export default function CashPoolValue({ pool }: { pool: CashPool }) {
  if (pool.length === 0) return <Private>{formatCurrency(0, "THB")}</Private>;
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {pool.map((c, i) => (
        <span key={c.currency} className="whitespace-nowrap">
          {i > 0 && <span className="mr-3 text-muted-foreground">·</span>}
          <Private>{formatCurrency(c.balance, c.currency)}</Private>
        </span>
      ))}
    </span>
  );
}
