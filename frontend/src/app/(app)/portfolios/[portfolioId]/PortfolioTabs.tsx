"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export default function PortfolioTabs({ portfolioId }: { portfolioId: string }) {
  const pathname = usePathname();
  const base = `/portfolios/${portfolioId}`;
  const tabs = [
    { href: base, label: "Holdings" },
    { href: `${base}/transactions`, label: "Transactions" },
    { href: `${base}/orders`, label: "Orders" },
    { href: `${base}/rebalance`, label: "Rebalance" },
    { href: `${base}/fx`, label: "FX" },
  ];

  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition",
              active
                ? "border-foreground font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
