import "server-only";
import { graphql } from "@/gql";
import { backendRequest } from "@/lib/graphql/backend";

export const ACCESS_COOKIE = "toshi_at";
export const REFRESH_COOKIE = "toshi_rt";

export type Tokens = { accessToken: string; refreshToken: string };

/** The backend schema marks AuthPayload fields nullable; treat a partial payload as no session. */
export function toTokens(
  payload: { accessToken?: string | null; refreshToken?: string | null } | null | undefined,
): Tokens | null {
  return payload?.accessToken && payload.refreshToken
    ? { accessToken: payload.accessToken, refreshToken: payload.refreshToken }
    : null;
}

type CookieToSet = {
  name: string;
  value: string;
  options: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "lax";
    path: string;
    maxAge: number;
  };
};

const RefreshTokenMutation = graphql(`
  mutation RefreshToken($refreshToken: String!) {
    refreshToken(refreshToken: $refreshToken) {
      accessToken
      refreshToken
    }
  }
`);

/** Seconds until the JWT's `exp`. Reads the payload without verifying — the backend does that. */
function secondsUntilExpiry(jwt: string) {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
    return Math.max(0, Math.floor(payload.exp - Date.now() / 1000));
  } catch {
    return 0;
  }
}

function cookieOptions(maxAge: number): CookieToSet["options"] {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}

// The access cookie expires a little before the JWT so we refresh proactively
// instead of sending a token the backend is about to reject.
const ACCESS_EXPIRY_MARGIN_SECONDS = 30;

export function tokenCookies(tokens: Tokens): CookieToSet[] {
  return [
    {
      name: ACCESS_COOKIE,
      value: tokens.accessToken,
      options: cookieOptions(Math.max(0, secondsUntilExpiry(tokens.accessToken) - ACCESS_EXPIRY_MARGIN_SECONDS)),
    },
    {
      name: REFRESH_COOKIE,
      value: tokens.refreshToken,
      options: cookieOptions(secondsUntilExpiry(tokens.refreshToken)),
    },
  ];
}

export function clearedCookies(): CookieToSet[] {
  return [ACCESS_COOKIE, REFRESH_COOKIE].map((name) => ({ name, value: "", options: cookieOptions(0) }));
}

// The backend rotates refresh tokens (the old one is revoked on use), so two
// requests refreshing with the same token in parallel would log the user out.
// Share one in-flight refresh per token, and keep the result briefly for
// requests that were sent before the browser received the new cookies.
const REFRESH_RESULT_TTL_MS = 10_000;
const refreshes = new Map<string, Promise<Tokens | null>>();

export function refreshTokens(refreshToken: string): Promise<Tokens | null> {
  const existing = refreshes.get(refreshToken);
  if (existing) return existing;

  const promise = backendRequest(RefreshTokenMutation, { refreshToken })
    .then((res) => toTokens(res.data?.refreshToken))
    .catch(() => null)
    .finally(() => {
      setTimeout(() => refreshes.delete(refreshToken), REFRESH_RESULT_TTL_MS);
    });

  refreshes.set(refreshToken, promise);
  return promise;
}
