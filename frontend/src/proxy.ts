import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE, clearedCookies, refreshTokens, tokenCookies } from "@/lib/auth/tokens";

const AUTH_PAGES = ["/login", "/register", "/forgot-password", "/reset-password"];

/**
 * Runs before every page request:
 * 1. If the access cookie has expired but a refresh cookie exists, refresh now —
 *    Server Components can't set cookies, so this is the only place a page
 *    render can get a fresh token.
 * 2. Optimistic route guard (cookie presence only). The backend still
 *    authorizes every query.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  let isLoggedIn = request.cookies.has(ACCESS_COOKIE);
  let cookiesToSet: ReturnType<typeof tokenCookies> = [];

  if (!isLoggedIn && refreshToken) {
    const tokens = await refreshTokens(refreshToken);
    isLoggedIn = !!tokens;
    cookiesToSet = tokens ? tokenCookies(tokens) : clearedCookies();
  }

  const isAuthPage = AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  let response: NextResponse;
  if (!isLoggedIn && !isAuthPage) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname + search);
    response = NextResponse.redirect(loginUrl);
  } else if (isLoggedIn && isAuthPage) {
    response = NextResponse.redirect(new URL("/", request.url));
  } else {
    // Forward refreshed tokens to this render too, not just the browser.
    for (const c of cookiesToSet) request.cookies.set(c.name, c.value);
    response = NextResponse.next({ request: { headers: request.headers } });
  }

  for (const c of cookiesToSet) response.cookies.set(c.name, c.value, c.options);
  return response;
}

export const config = {
  // Skip API routes, Next internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)"],
};
