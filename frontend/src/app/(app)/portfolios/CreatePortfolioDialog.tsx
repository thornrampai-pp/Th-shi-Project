"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortfolioAction } from "@/actions/portfolio";
import type { PortfolioType, StrategyType } from "@/gql/graphql";
import Select from "@/components/Select";

const STRATEGIES: { value: StrategyType; label: string }[] = [
  { value: "VALUE", label: "Value — long-term hold" },
  { value: "GROWTH", label: "Growth" },
  { value: "DIVIDEND", label: "Dividend" },
  { value: "TRADING", label: "Trading — short-term" },
  { value: "QUANT_ALGO", label: "Quant / algorithmic" },
];

const fieldClass = "w-full rounded-md bg-muted px-3 py-2 text-sm outline-none";

export default function CreatePortfolioDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [strategy, setStrategy] = useState<StrategyType>("VALUE");
  const [baseCurrency, setBaseCurrency] = useState("THB");
  const [type, setType] = useState<PortfolioType>("REAL");
  const [paperBalance, setPaperBalance] = useState("100000");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      setError("");
      // On success the action redirects to the new portfolio.
      const res = await createPortfolioAction({
        name: name.trim(),
        strategy,
        baseCurrency,
        type,
        initialPaperBalance: type === "PAPER" ? Number(paperBalance) : undefined,
      });
      if (res?.error) setError(res.error);
    });
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => e.target === dialogRef.current && onClose()}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/40"
    >
      <form onSubmit={submit} className="space-y-4 p-5">
        <h2 className="font-semibold">New portfolio</h2>

        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">Name</span>
          <input
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Long-term US, Dividend TH"
            className={fieldClass}
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">Strategy</span>
          <Select block value={strategy} onChange={(e) => setStrategy(e.target.value as StrategyType)} className={fieldClass}>
            {STRATEGIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Base currency</span>
            <Select block value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)} className={fieldClass}>
              <option value="THB">THB</option>
              <option value="USD">USD</option>
            </Select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Type</span>
            <Select block value={type} onChange={(e) => setType(e.target.value as PortfolioType)} className={fieldClass}>
              <option value="REAL">Real money</option>
              <option value="PAPER">Paper (simulated)</option>
            </Select>
          </label>
        </div>

        {type === "PAPER" && (
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Starting paper balance ({baseCurrency})</span>
            <input
              type="number"
              min="0"
              step="any"
              required
              value={paperBalance}
              onChange={(e) => setPaperBalance(e.target.value)}
              className={fieldClass}
            />
          </label>
        )}

        {error && <p className="text-sm text-loss">{error}</p>}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
