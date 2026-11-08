import { cookies } from "next/headers";
import Link from "next/link";
import { logoutAction } from "@/actions/auth";
import { AmountPrivacyProvider, AmountsToggle } from "@/components/AmountPrivacy";
import DataSyncedAt from "@/components/DataSyncedAt";
import FaceLogo from "@/components/FaceLogo";
import { graphql } from "@/gql";
import { serverQuery } from "@/lib/graphql/server";
import { HIDE_AMOUNTS_COOKIE } from "@/lib/privacy";
import MobileMenu from "./MobileMenu";
import NavLinks from "./NavLinks";

const AppShellMeQuery = graphql(`
  query AppShellMe {
    me {
      email
      firstName
      role
    }
    dataSyncedAt
  }
`);

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { me, dataSyncedAt } = await serverQuery(AppShellMeQuery);
  const name = me?.firstName || me?.email || "";
  const amountsHidden = (await cookies()).get(HIDE_AMOUNTS_COOKIE)?.value === "1";

  return (
    <AmountPrivacyProvider initialHidden={amountsHidden}>
      <div className="flex min-h-full flex-1 flex-col">
        <header className="sticky top-0 z-30 bg-chrome text-white shadow-sm">
          <div className="flex h-14 items-center gap-3 px-4 sm:gap-6 sm:px-6">
            {/* Phones: the face logo opens the slide-in menu. */}
            <MobileMenu isAdmin={me?.role === "ADMIN"} name={name} />

            <Link href="/portfolios" className="hidden shrink-0 items-center gap-2.5 md:flex">
              <FaceLogo className="size-7" />
              <span className="text-sm font-semibold tracking-wide">Tōshi</span>
            </Link>

            <div className="hidden min-w-0 md:block">
              <NavLinks isAdmin={me?.role === "ADMIN"} />
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-3">
              <AmountsToggle />
              {name && (
                <Link
                  href="/settings"
                  aria-label="Settings"
                  className="hidden items-center gap-2 rounded-md px-1.5 py-1 text-sm text-white/80 transition hover:bg-white/10 hover:text-white md:flex"
                >
                  <span
                    aria-hidden
                    className="flex size-7 items-center justify-center rounded-full bg-white/15 text-xs font-semibold uppercase"
                  >
                    {name[0]}
                  </span>
                  <span className="hidden sm:inline">{name}</span>
                </Link>
              )}
              {/* Phones: Settings and Log out are in the slide-in menu. */}
              <form action={logoutAction} className="hidden md:block">
                <button
                  type="submit"
                  className="rounded-md px-3 py-1.5 text-sm whitespace-nowrap text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  Log out
                </button>
              </form>
            </div>
          </div>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
        <footer className="border-t border-border px-4 py-3 sm:px-6">
          <DataSyncedAt iso={dataSyncedAt ?? null} />
        </footer>
      </div>
    </AmountPrivacyProvider>
  );
}
