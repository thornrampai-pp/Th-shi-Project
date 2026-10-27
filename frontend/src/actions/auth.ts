"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { graphql } from "@/gql";
import { backendRequest } from "@/lib/graphql/backend";
import { passwordProblem } from "@/lib/auth/password";
import { REFRESH_COOKIE, clearedCookies, toTokens, tokenCookies, type Tokens } from "@/lib/auth/tokens";

export type AuthFormState = { error: string; values: Record<string, string> } | null;

// React resets a form after its action runs, so echo the non-secret fields
// back for the inputs' defaultValue — otherwise a typo'd password also wipes the email.
const ECHOED_FIELDS = ["email", "firstName", "lastName"];

function fail(formData: FormData, error: string): AuthFormState {
  const values: Record<string, string> = {};
  for (const name of ECHOED_FIELDS) {
    const value = formData.get(name);
    if (typeof value === "string") values[name] = value;
  }
  return { error, values };
}

const LoginMutation = graphql(`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      accessToken
      refreshToken
    }
  }
`);

const RegisterMutation = graphql(`
  mutation Register($email: String!, $password: String!, $firstName: String, $lastName: String) {
    register(email: $email, password: $password, firstName: $firstName, lastName: $lastName) {
      accessToken
      refreshToken
    }
  }
`);

const LogoutMutation = graphql(`
  mutation Logout($refreshToken: String!) {
    logout(refreshToken: $refreshToken)
  }
`);

async function setSession(tokens: Tokens) {
  const store = await cookies();
  for (const c of tokenCookies(tokens)) store.set(c.name, c.value, c.options);
}

/** Only follow same-origin paths, so `?next=` can't be used as an open redirect. */
function safeNext(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function loginAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = field(formData, "email");
  const password = formData.get("password");
  if (!email || typeof password !== "string" || !password) {
    return fail(formData, "Please enter your email and password");
  }

  let tokens: Tokens | null;
  try {
    const res = await backendRequest(LoginMutation, { email, password });
    tokens = toTokens(res.data?.login);
    if (!tokens) return fail(formData, res.errors?.[0]?.message ?? "Incorrect email or password");
  } catch {
    return fail(formData, "Couldn't reach the server");
  }

  await setSession(tokens);
  redirect(safeNext(formData.get("next")));
}

export async function registerAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = field(formData, "email");
  const password = formData.get("password");
  if (!email || typeof password !== "string" || !password) {
    return fail(formData, "Please enter your email and password");
  }
  const problem = passwordProblem(password);
  if (problem) return fail(formData, problem);

  let tokens: Tokens | null;
  try {
    const res = await backendRequest(RegisterMutation, {
      email,
      password,
      firstName: field(formData, "firstName") || null,
      lastName: field(formData, "lastName") || null,
    });
    tokens = toTokens(res.data?.register);
    if (!tokens) return fail(formData, res.errors?.[0]?.message ?? "Sign up failed");
  } catch {
    return fail(formData, "Couldn't reach the server");
  }

  await setSession(tokens);
  redirect("/");
}

export async function logoutAction() {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    // Best effort — the cookies are cleared either way.
    await backendRequest(LogoutMutation, { refreshToken }).catch(() => undefined);
  }
  for (const c of clearedCookies()) store.set(c.name, c.value, c.options);
  redirect("/login");
}
