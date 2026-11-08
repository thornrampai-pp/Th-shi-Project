"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const LINKS = [
  { href: "/portfolios", label: "Portfolios" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/alerts", label: "Alerts" },
  { href: "/tax", label: "Tax" },
];

/** Admins get every normal tab plus System; the backend still checks the role. */
const ADMIN_LINKS = [{ href: "/system", label: "System" }];

export function navLinksFor(isAdmin: boolean) {
  return isAdmin ? [...LINKS, ...ADMIN_LINKS] : LINKS;
}

/** The section tabs in the desktop header (phones use MobileMenu instead). */
export default function NavLinks({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const links = navLinksFor(isAdmin);

  return (
    <nav className="-mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1">
      {links.map(({ href, label }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-2 py-1.5 text-sm whitespace-nowrap transition sm:px-3",
              active ? "bg-white/15 font-medium text-white" : "text-white/70 hover:bg-white/10 hover:text-white",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
