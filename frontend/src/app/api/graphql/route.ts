import { NextResponse, type NextRequest } from "next/server";
import { postToBackend, hasErrorCode } from "@/lib/graphql/backend";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearedCookies,
  refreshTokens,
  tokenCookies,
  type Tokens,
} from "@/lib/auth/tokens";

/**
 * BFF endpoint for client-side Apollo. Tokens live in httpOnly cookies, so the
 * browser never sees them: we attach the access token here, and refresh +
 * retry once if the backend says it's expired.
 */
export async function POST(request: NextRequest) {
  try {
    return await forward(request);
  } catch {
    return NextResponse.json(
      { errors: [{ message: "Backend unavailable", extensions: { code: "BAD_GATEWAY" } }] },
      { status: 502 },
    );
  }
}

async function forward(request: NextRequest) {
  const body = await request.text();
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  // undefined = no refresh attempted, null = refresh failed (session is dead)
  let refreshed: Tokens | null | undefined;

  if (!accessToken && refreshToken) refreshed = await refreshTokens(refreshToken);

  let result = await postToBackend(body, refreshed?.accessToken ?? accessToken);

  if (refreshed === undefined && refreshToken && hasErrorCode(result.json, "UNAUTHORIZED")) {
    refreshed = await refreshTokens(refreshToken);
    if (refreshed) result = await postToBackend(body, refreshed.accessToken);
  }

  const response = NextResponse.json(result.json, { status: result.status });
  const cookies = refreshed ? tokenCookies(refreshed) : refreshed === null ? clearedCookies() : [];
  for (const c of cookies) response.cookies.set(c.name, c.value, c.options);
  return response;
}
