"use client";

import { usePathname, useRouter } from "next/navigation";

const selectClass = "rounded-md bg-field px-4 py-2 text-sm outline-none hover:bg-field/70";

type Props = { year: number; portfolioId: string; portfolios: { id: string; name: string }[] };

/** Year and portfolio live in the URL, so a filtered view can be bookmarked. */
export default function TaxFilters({ year, portfolioId, portfolios }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => thisYear - i);

  const go = (next: { year?: number; portfolio?: string }) => {
    const params = new URLSearchParams();
    params.set("year", String(next.year ?? year));
    const p = next.portfolio ?? portfolioId;
    if (p) params.set("portfolio", p);
    router.push(`${pathname}?${params}`);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <select value={year} onChange={(e) => go({ year: Number(e.target.value) })} aria-label="Tax year" className={selectClass}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y} (พ.ศ. {y + 543})
          </option>
        ))}
      </select>
      <select
        value={portfolioId}
        onChange={(e) => go({ portfolio: e.target.value })}
        aria-label="Portfolio"
        className={selectClass}
      >
        <option value="">All real portfolios</option>
        {portfolios.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}
