"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction } from "@/actions/auth";

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, null);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-6">
      <div className="w-full max-w-sm rounded-2xl bg-[#f5f5f5] p-8 shadow-2xl">
        <h2 className="mb-2 text-center text-2xl font-bold tracking-wider text-black uppercase">
          Reset Password
        </h2>

        {state?.sent ? (
          <div className="flex flex-col gap-4 text-center">
            <p className="text-sm text-gray-600">
              If <span className="font-medium text-black">{state.email}</span> has an account with Discord linked,
              we&apos;ve sent a reset code there. Open Discord and check your DMs from the bot.
            </p>
            <Link
              href="/reset-password"
              className="w-full rounded-lg bg-[#333] py-3 font-medium text-[#f5f5f5] uppercase transition-colors hover:bg-[#444]"
            >
              I have a code
            </Link>
          </div>
        ) : (
          <form action={formAction} className="flex flex-col gap-4">
            <p className="text-center text-sm text-gray-600">
              Enter your account email. If it has Discord linked, we&apos;ll DM you a reset code.
            </p>
            <input
              name="email"
              type="email"
              placeholder="Email"
              required
              className="w-full rounded-lg border border-[#333] bg-[#f5f5f5] p-3 text-[#333] placeholder-gray-500 outline-none focus:border-[#333]"
            />
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-[#333] py-3 font-medium text-[#f5f5f5] uppercase transition-colors hover:bg-[#444]"
            >
              {pending ? "Sending…" : "Send reset code"}
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-sm text-gray-600">
          <Link href="/login" className="underline hover:text-black">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
