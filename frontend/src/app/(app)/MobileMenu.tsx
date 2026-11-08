"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logoutAction } from "@/actions/auth";
import FaceLogo from "@/components/FaceLogo";
import { cn } from "@/lib/utils";
import { navLinksFor } from "./NavLinks";

/**
 * Phones: the face logo opens a menu that slides in from the left with every section,
 * Settings and Log out — instead of cramming the section tabs into the header.
 * Closes on navigation, on the backdrop, or with Escape.
 */
export default function MobileMenu({ isAdmin, name }: { isAdmin: boolean; name: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  const links = navLinksFor(isAdmin);
  const current = links.find((l) => pathname.startsWith(l.href)) ?? (pathname.startsWith("/settings") ? { label: "Settings" } : null);

  // Navigating (a link tap, back button) closes the menu.
  if (open && pathname !== openedAt) setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    // Keep the page behind from scrolling while the menu is open.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  const linkClass = (active: boolean) =>
    cn(
      "flex items-center rounded-md px-3 py-2.5 text-sm transition",
      active ? "bg-white/15 font-semibold text-white" : "text-white/75 hover:bg-white/10 hover:text-white",
    );

  return (
    <div className="flex min-w-0 items-center gap-2 md:hidden">
      <button
        type="button"
        onClick={() => {
          setOpenedAt(pathname);
          setOpen(true);
        }}
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-menu"
        className="-m-1 shrink-0 rounded-full p-1 transition hover:bg-white/10"
      >
        <FaceLogo className="size-7" />
      </button>
      {current && <span className="truncate text-sm font-semibold">{current.label}</span>}

      <div
        className={cn("fixed inset-0 z-40 bg-black/40 transition-opacity", open ? "opacity-100" : "pointer-events-none opacity-0")}
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <nav
        id="mobile-menu"
        aria-label="Main menu"
        inert={!open}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-chrome text-white shadow-2xl transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between px-4">
          <Link href="/portfolios" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
            <FaceLogo className="size-7" />
            <span className="text-sm font-semibold tracking-wide">Tōshi</span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="flex size-8 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4" aria-hidden>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {links.map(({ href, label }) => {
            const active = pathname.startsWith(href);
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined} className={linkClass(active)}>
                {label}
              </Link>
            );
          })}
        </div>

        <div className="space-y-1 border-t border-white/10 px-3 py-3">
          <Link
            href="/settings"
            aria-current={pathname.startsWith("/settings") ? "page" : undefined}
            className={cn(linkClass(pathname.startsWith("/settings")), "gap-3")}
          >
            <span
              aria-hidden
              className="flex size-7 items-center justify-center rounded-full bg-white/15 text-xs font-semibold uppercase"
            >
              {name[0] ?? "?"}
            </span>
            <span className="min-w-0">
              <span className="block truncate">{name || "Settings"}</span>
              <span className="block text-xs font-normal text-white/50">Settings</span>
            </span>
          </Link>
          <form action={logoutAction}>
            <button type="submit" className={cn(linkClass(false), "w-full text-left")}>
              Log out
            </button>
          </form>
        </div>
      </nav>
    </div>
  );
}
