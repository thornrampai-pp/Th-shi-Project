// Mirrors backend/src/modules/auth/password-policy.ts — the backend is what enforces it;
// this only lets the forms say so before a round trip.
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 72;

/** An error message, or null when the password is acceptable. */
export function passwordProblem(password: string): string | null {
  if ([...password].length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) return "Password is too long";
  return null;
}
