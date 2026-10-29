"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPasswordAction } from "@/actions/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

export default function ResetPasswordPage() {
  const [state, formAction, pending] = useActionState(resetPasswordAction, null);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-6">
      <form
        action={formAction}
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-[#f5f5f5] p-8 shadow-2xl"
      >
        <h2 className="mb-2 text-center text-2xl font-bold tracking-wider text-black uppercase">
          Set New Password
        </h2>

        {state?.error && (
          <p className="rounded bg-red-950/30 p-2 text-center text-sm text-red-400">{state.error}</p>
        )}

        <input
          name="token"
          type="text"
          placeholder="Reset code (from Discord)"
          required
          autoComplete="one-time-code"
          className="w-full rounded-lg border border-[#333] bg-[#f5f5f5] p-3 text-[#333] placeholder-gray-500 outline-none focus:border-[#333]"
        />

        <div className="flex flex-col gap-1">
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            placeholder="New password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            aria-describedby="new-password-hint"
            className="w-full rounded-lg border border-[#333] bg-[#f5f5f5] p-3 text-[#333] placeholder-gray-500 outline-none focus:border-[#333]"
          />
          <p id="new-password-hint" className="text-xs text-gray-500">
            At least {MIN_PASSWORD_LENGTH} characters
          </p>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-[#333] py-3 font-medium text-[#f5f5f5] uppercase transition-colors hover:bg-[#444]"
        >
          {pending ? "Resetting…" : "Reset password"}
        </button>

        <p className="text-center text-sm text-gray-600">
          <Link href="/login" className="underline hover:text-black">
            Back to login
          </Link>
        </p>
      </form>
    </div>
  );
}
