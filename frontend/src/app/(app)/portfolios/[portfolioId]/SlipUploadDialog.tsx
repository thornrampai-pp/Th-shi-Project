"use client";

import { useMutation } from "@apollo/client/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { graphql } from "@/gql";
import type { AutoMatchSlipMutation } from "@/gql/graphql";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

// Sent through Apollo → /api/graphql rather than a Server Action: Server Actions cap
// the request body at 1 MB by default, and a 5 MB slip is ~6.7 MB as base64.
const AutoMatchSlipDocument = graphql(`
  mutation AutoMatchSlip($imageBase64: String!, $mimeType: String, $portfolioId: ID) {
    autoMatchSlip(imageBase64: $imageBase64, mimeType: $mimeType, portfolioId: $portfolioId) {
      status
      transactionId
      isAmountMatched
      amount
      currency
      transRef
      assetSymbol
      candidateIds
    }
  }
`);

const MAX_FILES = 5;
const MAX_BYTES = 5 * 1024 * 1024; // backend SLIP_MAX_BYTES default

type Result = NonNullable<AutoMatchSlipMutation["autoMatchSlip"]>;
type Row = { file: File; state: "queued" | "reading" | "done" | "error"; result?: Result; error?: string };

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function describe(r: Result): string {
  const amount = r.amount != null ? formatMoney(r.amount, r.currency ?? "THB") : "—";
  return `${amount} · Ref ${r.transRef ?? "—"}`;
}

/** Up to 5 slips, read one at a time so two can never claim the same transaction. */
export default function SlipUploadDialog({ portfolioId, onClose }: { portfolioId: string; onClose: () => void }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [autoMatch] = useMutation(AutoMatchSlipDocument);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const pick = (files: FileList | null) => {
    if (!files) return;
    setRows([...files].slice(0, MAX_FILES).map((file) => ({ file, state: "queued" })));
  };

  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  const start = async () => {
    setRunning(true);
    let matched = false;
    for (const [i, row] of rows.entries()) {
      if (row.file.size > MAX_BYTES) {
        update(i, { state: "error", error: "File is larger than 5 MB" });
        continue;
      }
      update(i, { state: "reading" });
      try {
        const { data } = await autoMatch({
          variables: { imageBase64: await readAsBase64(row.file), mimeType: row.file.type || undefined, portfolioId },
        });
        const result = data?.autoMatchSlip;
        if (!result) throw new Error("Empty response");
        matched ||= result.status === "MATCHED";
        update(i, { state: "done", result });
      } catch (e) {
        update(i, { state: "error", error: e instanceof Error ? e.message : "Upload failed" });
      }
    }
    setRunning(false);
    if (matched) router.refresh();
  };

  const finished = rows.length > 0 && rows.every((r) => r.state === "done" || r.state === "error");

  return (
    <dialog
      ref={dialogRef}
      onClose={() => !running && onClose()}
      onCancel={(e) => running && e.preventDefault()}
      onClick={(e) => e.target === dialogRef.current && !running && onClose()}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/40"
    >
      <div className="space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Upload slips</h2>
          <p className="text-xs text-muted-foreground">
            Up to {MAX_FILES} images. Each slip is matched to a transaction in this portfolio by amount, date and
            reference — nothing is saved if no single transaction matches.
          </p>
        </div>

        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          multiple
          disabled={running}
          onChange={(e) => pick(e.target.files)}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-field file:px-3 file:py-2 file:text-sm"
        />

        {rows.length > 0 && (
          <ol className="space-y-2">
            {rows.map((row, i) => (
              <li key={`${row.file.name}-${i}`} className="rounded-md bg-muted px-3 py-2 text-sm">
                <p className="truncate text-xs text-muted-foreground">
                  {i + 1}. {row.file.name}
                </p>
                <RowStatus row={row} />
              </li>
            ))}
          </ol>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {finished ? "Done" : "Cancel"}
          </button>
          {!finished && (
            <button
              type="button"
              onClick={start}
              disabled={running || rows.length === 0}
              className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              {running ? "Reading…" : `Match ${rows.length || ""} slip${rows.length === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

function RowStatus({ row }: { row: Row }) {
  if (row.state === "queued") return <p className="text-muted-foreground">Waiting</p>;
  if (row.state === "reading") return <p className="text-muted-foreground">Reading slip… (retries up to 5 times)</p>;
  if (row.state === "error") return <p className="text-loss">✕ {row.error}</p>;

  const r = row.result!;
  const line = (icon: string, text: string, tone: string) => (
    <p className={cn("font-medium", tone)}>
      {icon} {text}
    </p>
  );

  switch (r.status) {
    case "MATCHED":
      return (
        <>
          {line("✓", describe(r), "text-gain")}
          <p className="text-xs text-muted-foreground">
            Attached to transaction <code>{r.transactionId}</code>
            {!r.isAmountMatched && " — matched via exchange rate, amounts differ slightly; please check"}
          </p>
        </>
      );
    case "NOT_FOUND":
      return (
        <>
          {line("!", describe(r), "text-loss")}
          <p className="text-xs text-muted-foreground">
            No matching transaction{r.assetSymbol ? ` for ${r.assetSymbol}` : ""}. Add the transaction first, then upload
            this slip again.
          </p>
        </>
      );
    case "AMBIGUOUS":
      return (
        <>
          {line("!", describe(r), "text-amber-600")}
          <p className="text-xs text-muted-foreground">
            {r.candidateIds?.length ?? 0} transactions match equally — not saved.
          </p>
        </>
      );
    case "DUPLICATE":
      return (
        <>
          {line("✕", describe(r), "text-loss")}
          <p className="text-xs text-muted-foreground">This slip was already used for another transaction.</p>
        </>
      );
    default:
      return line("✕", "Couldn't read this slip after 5 attempts", "text-loss");
  }
}
