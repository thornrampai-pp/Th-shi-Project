"use client";

import { useMutation } from "@apollo/client/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { graphql } from "@/gql";
import type { ConfirmStatementMutation, FundingMode } from "@/gql/graphql";
import type { PortfolioListItem } from "../data";
import { formatMoney, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fundingQuestions } from "./statement-funding";
import type { CashBalance, FundingQuestion } from "./statement-funding";

// Sent through Apollo → /api/graphql rather than a Server Action: Server Actions cap
// the request body at 1 MB by default, and a multi-page statement PDF can exceed that.
const PreviewStatementDocument = graphql(`
  mutation PreviewStatement($imageBase64: String!, $mimeType: String) {
    previewStatement(imageBase64: $imageBase64, mimeType: $mimeType) {
      statementId
      broker
      unreadableCount
      groups {
        symbol
        rowCount
        heldInPortfolioIds
        suggestedPortfolioId
        buyAmount
        sellAmount
        currency
      }
      cash {
        portfolioId
        portfolioName
        currency
        balance
      }
    }
  }
`);

const ConfirmStatementDocument = graphql(`
  mutation ConfirmStatement(
    $statementId: String!
    $assignments: [StatementAssignmentInput!]!
    $funding: FundingMode
  ) {
    confirmStatement(statementId: $statementId, assignments: $assignments, funding: $funding) {
      broker
      rows {
        status
        message
        transactionId
        orderId
        date
        transactionType
        symbol
        quantity
        price
        currency
      }
    }
  }
`);

type Group = {
  symbol: string;
  rowCount: number;
  heldInPortfolioIds: string[];
  suggestedPortfolioId: string | null;
  buyAmount: number;
  sellAmount: number;
  currency: string;
};
type Preview = { statementId: string; broker: string | null; unreadableCount: number; groups: Group[]; cash: CashBalance[] };
type Result = NonNullable<ConfirmStatementMutation["confirmStatement"]>;

const NEW = "__new__";
type Row = NonNullable<Result["rows"]>[number];

const STATUS_LABEL: Record<string, { icon: string; tone: string }> = {
  CREATED: { icon: "✓", tone: "text-gain" },
  DUPLICATE: { icon: "⏭", tone: "text-muted-foreground" },
  UNREADABLE: { icon: "?", tone: "text-amber-600" },
  ERROR: { icon: "✕", tone: "text-loss" },
};

type Choice = { portfolioId: string; newName: string };

/**
 * One statement document (PDF or image) → every trade row in it recorded at once. Step 1
 * reads the file; step 2 asks which portfolio each asset goes in (pre-filled with the one
 * already holding it, or a new portfolio); then it records.
 */
export default function ImportStatementDialog({
  portfolioId,
  portfolios,
  onClose,
}: {
  portfolioId: string;
  portfolios: PortfolioListItem[];
  onClose: () => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  // Cash is one shared pool, so one choice covers every buy in the file.
  const [mode, setMode] = useState<FundingMode>("CASH_FIRST");
  const [result, setResult] = useState<Result | null>(null);
  const [previewStatement] = useMutation(PreviewStatementDocument);
  const [confirmStatement] = useMutation(ConfirmStatementDocument);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const pick = (files: FileList | null) => {
    setError("");
    setFile(files?.[0] ?? null);
  };

  const read = async () => {
    if (!file) return;
    setRunning(true);
    setError("");
    try {
      const imageBase64 = await fileToBase64(file);
      const { data } = await previewStatement({ variables: { imageBase64, mimeType: file.type } });
      const p = data?.previewStatement;
      if (!p) throw new Error("Unexpected response from the server");
      const clean: Preview = {
        statementId: p.statementId ?? "",
        broker: p.broker ?? null,
        unreadableCount: p.unreadableCount ?? 0,
        groups: (p.groups ?? []).flatMap((g) =>
          g?.symbol
            ? [
                {
                  symbol: g.symbol,
                  rowCount: g.rowCount ?? 0,
                  heldInPortfolioIds: (g.heldInPortfolioIds ?? []).flatMap((id) => (id ? [id] : [])),
                  suggestedPortfolioId: g.suggestedPortfolioId ?? null,
                  buyAmount: g.buyAmount ?? 0,
                  sellAmount: g.sellAmount ?? 0,
                  currency: g.currency ?? "THB",
                },
              ]
            : [],
        ),
        cash: (p.cash ?? []).flatMap((c) =>
          c?.portfolioId
            ? [{ portfolioId: c.portfolioId, portfolioName: c.portfolioName ?? "", currency: c.currency ?? "", balance: c.balance ?? 0 }]
            : [],
        ),
      };
      setPreview(clean);
      // Held in one portfolio → that one. Otherwise start on this page's portfolio, but
      // the user still confirms it below.
      setChoices(
        Object.fromEntries(clean.groups.map((g) => [g.symbol, { portfolioId: g.suggestedPortfolioId ?? portfolioId, newName: "" }])),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read the file");
    } finally {
      setRunning(false);
    }
  };

  const groups = preview?.groups ?? [];
  const needsName = (c: Choice | undefined) => c?.portfolioId === NEW && !c.newName.trim();
  const ready = groups.length > 0 && groups.every((g) => !needsName(choices[g.symbol]));
  const nameOf = (id: string) => portfolios.find((p) => p.id === id)?.name ?? "—";

  // The buys vs the shared cash pool, per currency.
  const questions: FundingQuestion[] = preview ? fundingQuestions({ groups, cash: preview.cash }) : [];

  const confirm = async () => {
    if (!preview) return;
    setRunning(true);
    setError("");
    try {
      // One new portfolio per name, shared by every asset given that name.
      const assignments = groups.map((g) => {
        const c = choices[g.symbol]!;
        return c.portfolioId === NEW
          ? { symbol: g.symbol, newPortfolioName: c.newName.trim() }
          : { symbol: g.symbol, portfolioId: c.portfolioId };
      });
      const { data } = await confirmStatement({ variables: { statementId: preview.statementId, assignments, funding: mode } });
      if (!data?.confirmStatement) throw new Error("Unexpected response from the server");
      setResult(data.confirmStatement);
      if (data.confirmStatement.rows?.some((r) => r?.status === "CREATED")) router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setRunning(false);
    }
  };

  const rows = result?.rows ?? [];
  const counts = (["CREATED", "DUPLICATE", "UNREADABLE", "ERROR"] as const).map((status) => ({
    status,
    count: rows.filter((r) => r?.status === status).length,
  }));
  return (
    <dialog
      ref={dialogRef}
      onClose={() => !running && onClose()}
      onCancel={(e) => running && e.preventDefault()}
      onClick={(e) => e.target === dialogRef.current && !running && onClose()}
      className="m-auto w-[min(40rem,calc(100vw-2rem))] rounded-2xl bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/40"
    >
      <div className="space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Import statement</h2>
          <p className="text-xs text-muted-foreground">
            One PDF or image of a broker/bank statement — every BUY/SELL row in it is recorded as its own
            transaction, in the portfolio you choose for each asset. Safe to re-upload the same statement; an
            already-recorded row is skipped, not duplicated.
          </p>
        </div>

        {!preview && (
          <>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
              disabled={running}
              onChange={(e) => pick(e.target.files)}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-field file:px-3 file:py-2 file:text-sm"
            />
            {file && <p className="text-xs text-muted-foreground">{file.name}</p>}
          </>
        )}

        {preview && !result && (
          <div className="space-y-3">
            <p className="text-sm font-medium">
              {preview.broker ?? "Statement"} — {groups.length} asset{groups.length === 1 ? "" : "s"}
            </p>
            <ul className="max-h-80 divide-y divide-border/60 overflow-y-auto rounded-md bg-muted px-3">
              {groups.map((g) => {
                const choice = choices[g.symbol]!;
                const held = g.suggestedPortfolioId != null;
                return (
                  <li key={g.symbol} className="space-y-2 py-2.5 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p>
                        <span className="font-semibold">{g.symbol}</span>{" "}
                        <span className="text-xs text-muted-foreground">
                          {g.rowCount} row{g.rowCount === 1 ? "" : "s"} ·{" "}
                          {held
                            ? `held in ${nameOf(g.suggestedPortfolioId!)}`
                            : g.heldInPortfolioIds.length > 1
                              ? "held in several portfolios — pick one"
                              : "not in any portfolio yet — pick where to add it"}
                        </span>
                      </p>
                      <select
                        value={choice.portfolioId}
                        onChange={(e) => setChoices((c) => ({ ...c, [g.symbol]: { ...choice, portfolioId: e.target.value } }))}
                        className="rounded-md bg-background px-2 py-1 text-sm outline-none"
                      >
                        {portfolios.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.type})
                          </option>
                        ))}
                        <option value={NEW}>＋ New portfolio…</option>
                      </select>
                    </div>
                    {choice.portfolioId === NEW && (
                      <input
                        value={choice.newName}
                        onChange={(e) => setChoices((c) => ({ ...c, [g.symbol]: { ...choice, newName: e.target.value } }))}
                        placeholder="New portfolio name"
                        className="w-full rounded-md bg-background px-3 py-1.5 text-sm outline-none"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
            {questions.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Paying for the buys</p>
                <FundingChoice questions={questions} mode={mode} onChange={setMode} />
              </div>
            )}
            {preview.unreadableCount > 0 && (
              <p className="text-xs text-amber-600">
                {preview.unreadableCount} row{preview.unreadableCount === 1 ? "" : "s"} couldn&apos;t be read completely and will be skipped.
              </p>
            )}
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{result.broker ?? "Statement"}</p>
              <div className="flex gap-3 text-xs">
                {counts.map(({ status, count }) => (
                  <span key={status} className={STATUS_LABEL[status]?.tone}>
                    {STATUS_LABEL[status]?.icon} {count}
                  </span>
                ))}
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto rounded-md bg-muted">
              <table className="w-full text-sm">
                <thead>
                  <tr className="sticky top-0 bg-chrome text-left text-xs font-medium text-white">
                    <th className="px-3 py-2"></th>
                    <th className="px-3 py-2">Order</th>
                    <th className="px-3 py-2">Asset</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Price</th>
                    <th className="px-3 py-2">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 tabular-nums">
                  {rows.map((r, i) => (r ? <ResultRow key={i} row={r} /> : null))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-loss">{error}</p>}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={running} className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50">
            {result ? "Close" : "Cancel"}
          </button>
          {!preview && (
            <button
              type="button"
              onClick={read}
              disabled={running || !file}
              className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              {running ? "Reading…" : "Read file"}
            </button>
          )}
          {preview && !result && (
            <button
              type="button"
              onClick={confirm}
              disabled={running || !ready}
              className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              {running ? "Importing…" : "Import"}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

/** The buys vs the shared cash pool (per currency), and one choice of where the money comes from. */
function FundingChoice({
  questions,
  mode,
  onChange,
}: {
  questions: FundingQuestion[];
  mode: FundingMode;
  onChange: (m: FundingMode) => void;
}) {
  const anyCash = questions.some((q) => q.kind === "has_cash");
  const totals = (pick: (q: FundingQuestion) => number) => questions.map((q) => formatMoney(pick(q), q.currency)).join(" + ");
  return (
    <div className="space-y-2 rounded-md bg-muted px-3 py-2.5 text-sm">
      <ul className="space-y-1">
        {questions.map((q) => (
          <li key={q.currency}>
            <span className="font-semibold">{q.currency}</span>{" "}
            <span className="text-xs text-muted-foreground">
              buys {formatMoney(q.buyAmount, q.currency)} · shared cash {formatMoney(q.available, q.currency)}
              {q.sellAmount > 0 && ` (incl. ${formatMoney(q.sellAmount, q.currency)} from sells in this file)`}
            </span>
            {q.kind === "no_cash" && (
              <p className="text-xs text-amber-600">
                ⚠ No {q.currency} cash — {formatMoney(q.shortfall, q.currency)} will be recorded as a top-up (deposit).
              </p>
            )}
          </li>
        ))}
      </ul>
      {anyCash && (
        <div className="flex flex-col gap-1 text-xs">
          <label className="flex items-center gap-2">
            <input type="radio" name="funding" checked={mode === "CASH_FIRST"} onChange={() => onChange("CASH_FIRST")} />
            {questions.every((q) => q.shortfall <= 0)
              ? "Use the shared cash — no top-up needed"
              : `Use the shared cash first, top up ${totals((q) => q.shortfall)}`}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="funding" checked={mode === "DEPOSIT_ALL"} onChange={() => onChange("DEPOSIT_ALL")} />
            Top up the full {totals((q) => q.buyAmount)} (keep the cash)
          </label>
        </div>
      )}
    </div>
  );
}

function ResultRow({ row }: { row: Row }) {
  const status = (row.status && STATUS_LABEL[row.status]) ?? STATUS_LABEL.ERROR!;
  return (
    <tr>
      <td className={cn("px-3 py-2", status.tone)}>{status.icon}</td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{row.orderId ?? "—"}</td>
      <td className="px-3 py-2">
        {row.transactionType && row.symbol ? `${row.transactionType} ${row.symbol}` : (row.symbol ?? "—")}
      </td>
      <td className="px-3 py-2 text-right">{row.quantity != null ? formatQuantity(row.quantity) : "—"}</td>
      <td className="px-3 py-2 text-right">{row.price != null ? formatMoney(row.price, row.currency ?? undefined) : "—"}</td>
      <td className={cn("px-3 py-2 text-xs", status.tone)}>{row.message ?? ""}</td>
    </tr>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
