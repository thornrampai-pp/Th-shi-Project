"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { WatchlistItem } from "./data";
import { DRAWER_COOKIE } from "./drawer-cookie";

type Props = { items: WatchlistItem[]; initialOpen: boolean; children: React.ReactNode };

/**
 * Desktop: a panel docked to the left edge that pushes the content; its state is
 * remembered in a cookie. Mobile: an overlay that starts closed and closes on navigation.
 */
export default function WatchlistDrawer({ items, initialOpen, children }: Props) {
  const pathname = usePathname();
  const [desktopOpen, setDesktopOpen] = useState(initialOpen);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggle = () => {
    if (window.matchMedia("(min-width: 768px)").matches) {
      const next = !desktopOpen;
      setDesktopOpen(next);
      document.cookie = `${DRAWER_COOKIE}=${next ? 1 : 0}; path=/watchlist; max-age=31536000; samesite=lax`;
    } else {
      setMobileOpen((v) => !v);
    }
  };

  const list = (
    <div className="flex h-full w-60 flex-col bg-chrome text-white">
      <div className="flex h-12 shrink-0 items-center justify-between px-4">
        <span className="text-xs font-semibold tracking-wider text-white/60 uppercase">Stocks · {items.length}</span>
        <button
          type="button"
          onClick={toggle}
          aria-label="Close stock list"
          className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"
        >
          <PanelIcon />
        </button>
      </div>
      <nav aria-label="Watchlist stocks" className="flex-1 space-y-1.5 overflow-y-auto px-3 pb-4">
        {items.length === 0 && <p className="px-1 text-xs text-white/50">No stocks yet</p>}
        {items.map((item) => {
          const href = `/watchlist/${item.asset.id}`;
          const active = pathname === href;
          return (
            <Link
              key={item.id}
              href={href}
              onClick={() => setMobileOpen(false)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground transition",
                active ? "bg-background" : "bg-muted hover:bg-background",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className={cn("block", active && "font-semibold")}>{item.asset.symbol}</span>
                <span className="block truncate text-xs text-muted-foreground">{item.asset.name}</span>
              </span>
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  item.status === "done" ? "bg-gain" : item.status === "draft" ? "bg-amber-500" : "bg-transparent",
                )}
              />
            </Link>
          );
        })}
      </nav>
    </div>
  );

  return (
    <div className="flex flex-1">
      {/* Desktop: docked panel, width animates between 0 and 15rem */}
      <aside
        className={cn(
          "sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 overflow-hidden transition-[width] duration-300 md:block",
          desktopOpen ? "w-60" : "w-0",
        )}
      >
        {list}
      </aside>

      {/* Mobile: overlay */}
      <div
        className={cn("fixed inset-0 top-14 z-20 md:hidden", mobileOpen ? "visible" : "invisible")}
        aria-hidden={!mobileOpen}
      >
        <div
          onClick={() => setMobileOpen(false)}
          className={cn("absolute inset-0 bg-black/30 transition-opacity", mobileOpen ? "opacity-100" : "opacity-0")}
        />
        <div
          className={cn(
            "absolute inset-y-0 left-0 transition-transform duration-300",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {list}
        </div>
      </div>

      <div className="min-w-0 flex-1 px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <button
            type="button"
            onClick={toggle}
            aria-label="Toggle stock list"
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground",
              desktopOpen && "md:hidden",
            )}
          >
            <PanelIcon />
            Stocks
          </button>
          {children}
        </div>
      </div>
    </div>
  );
}

function PanelIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-4" aria-hidden>
      <rect x="2.75" y="3.75" width="14.5" height="12.5" rx="2" />
      <path d="M7.75 3.75v12.5" />
    </svg>
  );
}
