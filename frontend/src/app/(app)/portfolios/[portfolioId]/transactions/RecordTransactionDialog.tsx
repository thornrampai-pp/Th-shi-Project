"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { recordTransactionAction, type NewTransaction } from "@/actions/portfolio";
import { todayLocal } from "@/lib/dates";
import { formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";
import Select from "@/components/Select";

export type HoldingOption = { assetId: string; symbol: string; quantity: number; currency: string | null };

type Kind = NewTransaction["type"];

const KINDS: { value: Kind; label: string; hint: string }[] = [
  { value: "SELL", label: "Sell", hint: "Sell part or all of a holding (FIFO)." },
  { value: "DEPOSIT", label: "Deposit", hint: "Money coming into this portfolio." },
  { value: "WITHDRAW", label: "Withdraw", hint: "Money leaving this portfolio." },
  { value: "DIVIDEND", label: "Dividend", hint: "Cash dividend received, after withholding tax." },
];

const fieldClass = "w-full rounded-md bg-muted px-3 py-2 text-sm outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({ value, onChange, required }: { value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <input
      type="number"
      min="0"
      step="any"
      required={required}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={fieldClass}
    />
  );
}

type Props = {
  portfolioId: string;
  holdings: HoldingOption[];
  currencies: string[];
  onClose: () => void;
  /** Opened from a holding's "Sell" button: start on SELL with that asset picked. */
  initialKind?: Kind;
  initialAssetId?: string;
};

/** SELL / DEPOSIT / WITHDRAW / DIVIDEND. BUY lives in “+ Add asset” on the Holdings tab. */
export default function RecordTransactionDialog({
  portfolioId,
  holdings,
  currencies,
  onClose,
  initialKind,
  initialAssetId,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<Kind>(initialKind ?? (holdings.length ? "SELL" : "DEPOSIT"));
  const [assetId, setAssetId] = useState(initialAssetId ?? holdings[0]?.assetId ?? "");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const [taxWithheld, setTaxWithheld] = useState("");
  const [currency, setCurrency] = useState(currencies[0] ?? "THB");
  const [date, setDate] = useState(todayLocal);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const needsAsset = kind === "SELL" || kind === "DIVIDEND";
  const holding = holdings.find((h) => h.assetId === assetId);

  // A dividend is paid in the asset's own currency — default to it rather than THB.
  const pickKind = (next: Kind) => {
    setKind(next);
    if (next === "DIVIDEND" && holding?.currency) setCurrency(holding.currency);
  };
  const pickAsset = (id: string) => {
    setAssetId(id);
    const next = holdings.find((h) => h.assetId === id);
    if (kind === "DIVIDEND" && next?.currency) setCurrency(next.currency);
  };

  const build = (): NewTransaction | null => {
    const common = { executedOn: date, note: note.trim() || undefined };
    const num = (v: string) => (v ? Number(v) : undefined);
    switch (kind) {
      case "SELL":
        return { ...common, type: "SELL", assetId, quantity: Number(quantity), price: Number(price), fee: num(fee) };
      case "DIVIDEND":
        return { ...common, type: "DIVIDEND", assetId, amount: Number(amount), currency, taxWithheld: num(taxWithheld) };
      default:
        return { ...common, type: kind, amount: Number(amount), currency };
    }
  };

  const valid =
    kind === "SELL"
      ? !!assetId && Number(quantity) > 0 && Number(price) > 0
      : Number(amount) > 0 && (!needsAsset || !!assetId);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = build();
    if (!input) return;
    startTransition(async () => {
      setError("");
      const res = await recordTransactionAction(portfolioId, input);
      if (res.error) setError(res.error);
      else onClose();
    });
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => e.target === dialogRef.current && onClose()}
      className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-2xl bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/40"
    >
      <form onSubmit={submit} className="space-y-4 p-5">
        <h2 className="font-semibold">Record transaction</h2>

        <div role="radiogroup" aria-label="Transaction type" className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
          {KINDS.map((k) => {
            const disabled = (k.value === "SELL" || k.value === "DIVIDEND") && holdings.length === 0;
            return (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={kind === k.value}
                disabled={disabled}
                onClick={() => pickKind(k.value)}
                className={cn(
                  "rounded-md py-1.5 text-sm transition disabled:opacity-40",
                  kind === k.value ? "bg-background font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {k.label}
              </button>
            );
          })}
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">{KINDS.find((k) => k.value === kind)?.hint}</p>

        {needsAsset && (
          <Field label="Asset">
            <Select block value={assetId} onChange={(e) => pickAsset(e.target.value)} className={fieldClass}>
              {holdings.map((h) => (
                <option key={h.assetId} value={h.assetId}>
                  {h.symbol} — holding {formatQuantity(h.quantity)}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {kind === "SELL" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity">
              <NumberInput value={quantity} onChange={setQuantity} required />
            </Field>
            <Field label={holding?.currency ? `Price per unit (${holding.currency})` : "Price per unit"}>
              <NumberInput value={price} onChange={setPrice} required />
            </Field>
            <Field label="Fee (optional)">
              <NumberInput value={fee} onChange={setFee} />
            </Field>
            <Field label="Date">
              <input type="date" required max={todayLocal()} value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label={kind === "DIVIDEND" ? "Amount received (net)" : "Amount"}>
              <NumberInput value={amount} onChange={setAmount} required />
            </Field>
            <Field label="Currency">
              <Select block value={currency} onChange={(e) => setCurrency(e.target.value)} className={fieldClass}>
                {currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            {kind === "DIVIDEND" && (
              <Field label="Tax withheld (optional)">
                <NumberInput value={taxWithheld} onChange={setTaxWithheld} />
              </Field>
            )}
            <Field label="Date">
              <input type="date" required max={todayLocal()} value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
            </Field>
          </div>
        )}

        {kind === "SELL" && holding && Number(quantity) > holding.quantity && (
          <p className="text-xs text-loss">You hold {formatQuantity(holding.quantity)} {holding.symbol}.</p>
        )}

        <Field label="Note (optional)">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Slip reference, broker, …" className={fieldClass} />
        </Field>

        {error && <p className="text-sm text-loss">{error}</p>}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || !valid}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
