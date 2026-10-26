import Link from "next/link";
import { logoutAction } from "@/actions/auth";
import FaceLogo from "@/components/FaceLogo";
import { graphql } from "@/gql";
import { serverQuery } from "@/lib/graphql/server";
import NavLinks from "./NavLinks";

const AppShellMeQuery = graphql(`
  query AppShellMe {
    me {
      email
      firstName
    }
  }
`);

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { me } = await serverQuery(AppShellMeQuery);
  const name = me?.firstName || me?.email || "";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 bg-chrome text-white shadow-sm">
        <div className="flex h-14 items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <FaceLogo className="size-7" />
            <span className="hidden text-sm font-semibold tracking-wide sm:inline">Tōshi</span>
          </Link>

          <NavLinks />

          <div className="ml-auto flex items-center gap-3">
            {name && (
              <span className="hidden items-center gap-2 text-sm text-white/80 sm:flex">
                <span
                  aria-hidden
                  className="flex size-7 items-center justify-center rounded-full bg-white/15 text-xs font-semibold uppercase"
                >
                  {name[0]}
                </span>
                {name}
              </span>
            )}
            <form action={logoutAction}>
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
    </div>
  );
}
