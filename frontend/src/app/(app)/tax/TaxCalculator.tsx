"use client";

import { useState, useTransition } from "react";
import { calculateTaxAction, type TaxCalculation } from "@/actions/tax";
import { formatMoney } from "@/lib/format";

const fieldClass = "w-full rounded-md bg-background px-3 py-2 text-sm outline-none";

type Deduction = { key: number; label: string; amount: string };

type Props = { year: number; investmentIncome: number; withheld: number };

/** Thai personal income tax estimate — the backend does the math (tax-calculator.ts). */
export default function TaxCalculator({ year, investmentIncome, withheld }: Props) {
  const [totalIncome, setTotalIncome] = useState("");
  const [expenses, setExpenses] = useState("");
  const [credits, setCredits] = useState("");
  const [deductions, setDeductions] = useState<Deduction[]>([{ key: 0, label: "Personal allowance", amount: "60000" }]);
  const [result, setResult] = useState<TaxCalculation | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const updateDeduction = (key: number, patch: Partial<Deduction>) =>
    setDeductions((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const calculate = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      setError("");
      const res = await calculateTaxAction({
        taxYear: year,
        totalIncome: Number(totalIncome),
        expenses: expenses ? Number(expenses) : undefined,
        taxCredits: credits ? Number(credits) : undefined,
        deductions: deductions
          .filter((d) => d.label.trim() && Number(d.amount) > 0)
          .map((d) => ({ label: d.label.trim(), amount: Number(d.amount) })),
      });
      setResult(res.result ?? null);
      if (res.error) setError(res.error);
    });
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">
        Personal income tax estimate · {year} (พ.ศ. {year + 543})
      </h2>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <form onSubmit={calculate} className="space-y-4 rounded-md bg-muted p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 block space-y-1 text-sm">
              <span className="flex items-center justify-between text-muted-foreground">
                Total assessable income (THB)
                {investmentIncome > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setTotalIncome(String(Math.round(investmentIncome * 100) / 100));
                      setCredits(String(Math.round(withheld * 100) / 100));
                    }}
                    className="text-xs underline hover:text-foreground"
                  >
                    Use investment income
                  </button>
                )}
              </span>
              <input
                required
                type="number"
                min="0"
                step="any"
                value={totalIncome}
                onChange={(e) => setTotalIncome(e.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">Expenses</span>
              <input type="number" min="0" step="any" value={expenses} onChange={(e) => setExpenses(e.target.value)} className={fieldClass} />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">Tax credits / withheld</span>
              <input type="number" min="0" step="any" value={credits} onChange={(e) => setCredits(e.target.value)} className={fieldClass} />
            </label>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm text-muted-foreground">Deductions</legend>
            {deductions.map((d) => (
              <div key={d.key} className="flex gap-2">
                <input
                  value={d.label}
                  onChange={(e) => updateDeduction(d.key, { label: e.target.value })}
                  placeholder="e.g. Social security, SSF"
                  aria-label="Deduction name"
                  className={`${fieldClass} min-w-0 flex-[2]`}
                />
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={d.amount}
                  onChange={(e) => updateDeduction(d.key, { amount: e.target.value })}
                  aria-label="Deduction amount"
                  className={`${fieldClass} min-w-0 flex-1`}
                />
                <button
                  type="button"
                  onClick={() => setDeductions((prev) => prev.filter((x) => x.key !== d.key))}
                  aria-label="Remove deduction"
                  className="px-2 text-muted-foreground hover:text-loss"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setDeductions((prev) => [...prev, { key: Math.max(0, ...prev.map((x) => x.key)) + 1, label: "", amount: "" }])
              }
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              + Add deduction
            </button>
          </fieldset>

          {error && <p className="text-sm text-loss">{error}</p>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={pending || totalIncome === ""}
              className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              {pending ? "Calculating…" : "Calculate"}
            </button>
          </div>
        </form>

        <div className="rounded-md bg-muted p-4">
          {!result ? (
            <p className="flex h-full items-center justify-center py-12 text-sm text-muted-foreground">
              Fill in the form to see an estimate.
            </p>
          ) : (
            <TaxResult result={result} />
          )}
        </div>
      </div>
    </section>
  );
}

function TaxResult({ result: r }: { result: TaxCalculation }) {
  const refund = r.refund ?? 0;
  const rows: [string, number | null | undefined][] = [
    ["Income", r.totalIncome],
    ["− Expenses", r.expenses],
    ["− Deductions", r.totalDeductions],
    ["Net taxable income", r.netIncome],
    ["Tax before credits", r.grossTax],
    ["− Credits", r.taxCredits],
  ];

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-muted-foreground">{refund > 0 ? "Refund" : "Tax to pay"}</p>
        <p className="text-2xl font-semibold tabular-nums">{formatMoney(refund > 0 ? refund : (r.taxPayable ?? 0), "THB")}</p>
        <p className="text-xs text-muted-foreground">
          {/* Rates come back as fractions (0.05 = 5%). */}
          Effective {((r.effectiveRate ?? 0) * 100).toFixed(2)}% · marginal {((r.marginalRate ?? 0) * 100).toFixed(0)}%
        </p>
      </div>

      <dl className="divide-y divide-border/60 tabular-nums">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between py-1.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{formatMoney(value ?? 0)}</dd>
          </div>
        ))}
      </dl>

      {r.brackets && r.brackets.some((b) => (b?.taxableAmount ?? 0) > 0) && (
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-medium">Bracket</th>
              <th className="py-1 text-right font-medium">Rate</th>
              <th className="py-1 text-right font-medium">Taxed</th>
              <th className="py-1 text-right font-medium">Tax</th>
            </tr>
          </thead>
          <tbody>
            {r.brackets
              .filter((b) => (b?.taxableAmount ?? 0) > 0)
              .map((b) => (
                <tr key={b!.from}>
                  <td className="py-1">
                    {formatMoney(b!.from ?? 0)} – {b!.upTo != null ? formatMoney(b!.upTo) : "up"}
                  </td>
                  <td className="py-1 text-right">{((b!.rate ?? 0) * 100).toFixed(0)}%</td>
                  <td className="py-1 text-right">{formatMoney(b!.taxableAmount ?? 0)}</td>
                  <td className="py-1 text-right">{formatMoney(b!.tax ?? 0)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      {r.disclaimer && <p className="text-xs text-muted-foreground">{r.disclaimer}</p>}
    </div>
  );
}
