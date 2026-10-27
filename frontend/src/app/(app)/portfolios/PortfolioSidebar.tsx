"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import CreatePortfolioDialog from "./CreatePortfolioDialog";

type Item = { id: string; name: string; type: string };

/** Desktop: a list down the left edge. Mobile: a scrollable row above the content. */
export default function PortfolioSidebar({ portfolios }: { portfolios: Item[] }) {
  const pathname = usePathname();
  const [creating, setCreating] = useState(false);

  const links = [{ id: "", name: "Overview", type: "" }, ...portfolios].map((p) => {
    const href = p.id ? `/portfolios/${p.id}` : "/portfolios";
    const active = pathname === href;
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition",
          active ? "bg-background font-semibold" : "bg-muted hover:bg-background",
        )}
      >
        <span className="truncate">{p.name}</span>
        {p.type === "PAPER" && (
          <span className="shrink-0 rounded bg-field px-1.5 text-[10px] font-medium text-muted-foreground">PAPER</span>
        )}
      </Link>
    );
  });

  const addButton = (
    <button
      type="button"
      onClick={() => setCreating(true)}
      className="shrink-0 rounded-md border border-dashed border-white/40 px-3 py-2 text-sm text-white/80 transition hover:bg-white/10 hover:text-white md:border-border md:text-muted-foreground md:hover:bg-muted md:hover:text-foreground"
    >
      + New portfolio
    </button>
  );

  return (
    <>
      <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 flex-col gap-1.5 overflow-y-auto px-3 py-6 md:flex">
        <p className="px-1 pb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Portfolios · {portfolios.length}
        </p>
        {links}
        <div className="pt-2">{addButton}</div>
      </aside>

      <nav aria-label="Portfolios" className="flex gap-2 overflow-x-auto bg-chrome px-4 py-2 md:hidden">
        {links}
        {addButton}
      </nav>

      {creating && <CreatePortfolioDialog onClose={() => setCreating(false)} />}
    </>
  );
}
