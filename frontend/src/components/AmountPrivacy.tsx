"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { HIDE_AMOUNTS_COOKIE } from "@/lib/privacy";
import { cn } from "@/lib/utils";

/**
 * Hide/show for numbers that reveal how much someone holds — balances, market value,
 * P/L amounts, quantities. Percentages and per-share prices stay visible. The choice is
 * kept in a cookie so server-rendered pages come out already masked (no flash).
 */

type AmountPrivacy = { hidden: boolean; toggle: () => void };

const AmountPrivacyContext = createContext<AmountPrivacy>({ hidden: false, toggle: () => {} });

export function AmountPrivacyProvider({ initialHidden, children }: { initialHidden: boolean; children: React.ReactNode }) {
  const [hidden, setHidden] = useState(initialHidden);

  const toggle = useCallback(() => {
    setHidden((prev) => {
      const next = !prev;
      document.cookie = `${HIDE_AMOUNTS_COOKIE}=${next ? 1 : 0}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  const value = useMemo(() => ({ hidden, toggle }), [hidden, toggle]);
  return <AmountPrivacyContext.Provider value={value}>{children}</AmountPrivacyContext.Provider>;
}

export function useAmountsHidden(): boolean {
  return useContext(AmountPrivacyContext).hidden;
}

/** Wrap any amount: shows it, or a fixed-width mask while amounts are hidden. */
export function Private({ children, className }: { children: React.ReactNode; className?: string }) {
  const hidden = useAmountsHidden();
  if (!hidden) return <>{children}</>;
  return (
    <span className={cn("tracking-widest select-none", className)} aria-label="Hidden amount" title="Amounts hidden">
      ••••••
    </span>
  );
}

export function AmountsToggle({ className }: { className?: string }) {
  const { hidden, toggle } = useContext(AmountPrivacyContext);
  const label = hidden ? "Show amounts" : "Hide amounts";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={hidden}
      aria-label={label}
      title={label}
      className={cn(
        "flex size-8 items-center justify-center rounded-md text-white/70 transition hover:bg-white/10 hover:text-white",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-5" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.04 12.32a1 1 0 0 1 0-.64C3.42 7.51 7.36 4.5 12 4.5c4.64 0 8.57 3 9.96 7.18a1 1 0 0 1 0 .64C20.58 16.49 16.64 19.5 12 19.5c-4.64 0-8.57-3-9.96-7.18Z" />
        <circle cx="12" cy="12" r="3" />
        {hidden && <path strokeLinecap="round" d="M3 3l18 18" />}
      </svg>
    </button>
  );
}
