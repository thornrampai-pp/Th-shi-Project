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
    <nav className="flex gap-1 border-b border-border">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition",
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
