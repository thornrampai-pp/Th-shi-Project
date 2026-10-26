"use client";

import { use, useActionState, useRef, useState } from "react";
import { loginAction } from "@/actions/auth";
import RegisterButton from "@/components/RegisterButton";
import { cn } from "@/lib/utils";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = use(searchParams);
  const [state, formAction, isPending] = useActionState(loginAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  // Hover opens the form and leaving always closes it. Focus alone keeps it
  // open only for keyboard/touch users, who never fire mouseleave.
  const open = hovered || focused;

  const handleMouseEnter = () => {
    clearTimeout(closeTimer.current);
    setHovered(true);
  };

  const handleMouseLeave = () => {
    // Short grace period so brushing past the edge doesn't snap it shut.
    closeTimer.current = setTimeout(() => {
      setHovered(false);
      const active = document.activeElement;
      if (active instanceof HTMLElement && formRef.current?.contains(active)) active.blur();
    }, 250);
  };

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-white px-4">
      <RegisterButton />

      <form
        ref={formRef}
        action={formAction}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
        }}
        className={cn(
          "flex flex-col items-center transition-all duration-700 ease-in-out",
          isPending && "pointer-events-none scale-95 opacity-0",
        )}
      >
        {typeof next === "string" && <input type="hidden" name="next" value={next} />}

        {/* Face — positions are fractions of the Figma frame so it scales with the viewport. */}
        <div
          onClick={() => !open && emailRef.current?.focus()}
          className="relative aspect-square w-[min(30rem,90vw)] cursor-pointer rounded-full bg-[#111111]"
        >
          {/* Eyes */}
          {[24, 62].map((left) => (
            <span
              key={left}
              style={{ left: `${left}%` }}
              className={cn(
                "absolute top-[29%] aspect-square w-[14%] rounded-full bg-[#d9d9d9] transition-all duration-500",
                open && "-translate-y-6 opacity-0",
              )}
            />
          ))}

          {/* Mouth — grows into the login card */}
          <div
            className={cn(
              "absolute overflow-hidden bg-[#d9d9d9] transition-all duration-500 ease-in-out",
              open
                ? "top-[20%] left-[12.5%] h-[60%] w-[75%] rounded-2xl bg-white shadow-2xl"
                : "top-[65%] left-[32.5%] h-[6.5%] w-[35.5%] rounded-none",
            )}
          >
            <div
              className={cn(
                "flex h-full flex-col justify-center gap-2.5 p-4 transition-opacity duration-300 sm:gap-3 sm:p-5",
                open ? "opacity-100 delay-200" : "pointer-events-none opacity-0",
              )}
            >
              <h1 className="text-center text-sm font-bold tracking-wider text-black/80 uppercase">Welcome Back</h1>

              <label className="sr-only" htmlFor="email">
                Email
              </label>
              <input
                ref={emailRef}
                id="email"
                type="email"
                name="email"
                autoComplete="email"
                defaultValue={state?.values.email}
                placeholder="Email Address"
                required
                className="w-full rounded-lg border border-gray-200 bg-gray-50/50 px-3 py-2 text-sm text-black placeholder-gray-400 outline-none transition-all focus:border-black focus:bg-white"
              />

              <label className="sr-only" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="Password"
                required
                className="w-full rounded-lg border border-gray-200 bg-gray-50/50 px-3 py-2 text-sm text-black placeholder-gray-400 outline-none transition-all focus:border-black focus:bg-white"
              />

              <button
                type="submit"
                disabled={isPending}
                className="w-full rounded-lg bg-[#141414] py-2 text-sm font-semibold tracking-wide text-white transition-colors hover:bg-black disabled:opacity-60"
              >
                {isPending ? "Logging in…" : "Log in"}
              </button>
            </div>
          </div>
        </div>

        <p role="alert" className="mt-6 h-4 text-xs text-red-500">
          {state?.error}
        </p>
      </form>
    </main>
  );
}
