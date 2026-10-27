"use client";

import { useMutation } from "@apollo/client/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { graphql } from "@/gql";
import type { AutoMatchSlipsMutation } from "@/gql/graphql";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

// Sent through Apollo → /api/graphql rather than a Server Action: Server Actions cap
// the request body at 1 MB by default, and several photos as base64 are well past that.
const AutoMatchSlipsDocument = graphql(`
  mutation AutoMatchSlips($images: [SlipImageInput!]!, $portfolioId: ID) {
    autoMatchSlips(images: $images, portfolioId: $portfolioId) {
      status
      message
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

const MAX_FILES = 5; // backend SLIP_BATCH_MAX_FILES
const MAX_FILE_BYTES = 5 * 1024 * 1024; // backend SLIP_MAX_BYTES default
const MAX_BATCH_BYTES = 7 * 1024 * 1024; // backend SLIP_BATCH_MAX_BYTES
/** Long edge after shrinking — slip text and QR stay sharp, a phone photo drops to a few hundred KB. */
const MAX_EDGE = 2000;

type Result = NonNullable<AutoMatchSlipsMutation["autoMatchSlips"]>[number];
type Row = { file: File; state: "queued" | "reading" | "done" | "error"; result?: Result; error?: string };
type Prepared = { base64: string; mimeType: string; bytes: number };

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Downsizes a photo to MAX_EDGE as JPEG before upload, so a whole batch fits in one
 * request. Small images, and formats the browser can't decode (e.g. HEIC outside
 * Safari), are sent as they are — the backend validates either way.
 */
async function prepare(file: File): Promise<Prepared> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 1024 * 1024) throw new Error("small enough");
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) throw new Error("no gain");
    return { base64: await blobToBase64(blob), mimeType: "image/jpeg", bytes: blob.size };
  } catch {
    return { base64: await blobToBase64(file), mimeType: file.type, bytes: file.size };
  }
}

function describe(r: Result): string {
  const amount = r.amount != null ? formatMoney(r.amount, r.currency ?? "THB") : "—";
  return `${amount} · Ref ${r.transRef ?? "—"}`;
}

/**
 * Up to 5 slips, sent together: the backend reads them in one OCR request and then
 * matches them one by one, so two can never claim the same transaction.
 */
export default function SlipUploadDialog({ portfolioId, onClose }: { portfolioId: string; onClose: () => void }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [batchError, setBatchError] = useState("");
  const [autoMatch] = useMutation(AutoMatchSlipsDocument);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const pick = (files: FileList | null) => {
    if (!files) return;
    setBatchError("");
    setRows(
      [...files].slice(0, MAX_FILES).map((file): Row =>
        file.size > MAX_FILE_BYTES ? { file, state: "error", error: "File is larger than 5 MB" } : { file, state: "queued" },
      ),
    );
  };

  const start = async () => {
    const queued = rows.flatMap((row, i) => (row.state === "queued" ? [i] : []));
    if (queued.length === 0) return;
    setRunning(true);
    setBatchError("");
    setRows((prev) => prev.map((row) => (row.state === "queued" ? { ...row, state: "reading" } : row)));

    const settle = (patch: (row: Row, k: number) => Partial<Row>) =>
      setRows((prev) => prev.map((row, i) => (queued.includes(i) ? { ...row, ...patch(row, queued.indexOf(i)) } : row)));

    try {
      const prepared = await Promise.all(queued.map((i) => prepare(rows[i]!.file)));
      const total = prepared.reduce((sum, p) => sum + p.bytes, 0);
      if (total > MAX_BATCH_BYTES) {
        throw new Error(`These images are ${(total / 1024 / 1024).toFixed(1)} MB together — send fewer at a time`);
      }
      const { data } = await autoMatch({
        variables: { images: prepared.map((p) => ({ imageBase64: p.base64, mimeType: p.mimeType })), portfolioId },
      });
      const results = data?.autoMatchSlips;
      if (!results || results.length !== queued.length) throw new Error("Unexpected response from the server");
      settle((_, k) => ({ state: "done", result: results[k]! }));
      if (results.some((r) => r?.status === "MATCHED")) router.refresh();
    } catch (e) {
      // A whole-batch failure (config, size, network): put the rows back so they can retry.
      setBatchError(e instanceof Error ? e.message : "Upload failed");
      settle(() => ({ state: "queued" }));
    } finally {
      setRunning(false);
    }
  };

  const finished = rows.length > 0 && rows.every((r) => r.state === "done" || r.state === "error");
  const queuedCount = rows.filter((r) => r.state === "queued").length;

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
            Up to {MAX_FILES} images, read together in one go. Each slip is matched to a transaction in this
            portfolio by amount, date and reference — nothing is saved if no single transaction matches.
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

        {batchError && <p className="text-sm text-loss">{batchError}</p>}

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
              disabled={running || queuedCount === 0}
              className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              {running ? "Reading…" : `Match ${queuedCount || ""} slip${queuedCount === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

function RowStatus({ row }: { row: Row }) {
  if (row.state === "queued") return <p className="text-muted-foreground">Waiting</p>;
  if (row.state === "reading") return <p className="text-muted-foreground">Reading with the others… (retries up to 5 times)</p>;
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
    case "UNREADABLE":
      return (
        <>
          {line("✕", describe(r), "text-loss")}
          <p className="text-xs text-muted-foreground">{r.message ?? "Couldn't read the amount or reference"}</p>
        </>
      );
    case "INVALID":
      return line("✕", r.message ?? "Not a supported image", "text-loss");
    case "ERROR":
      return (
        <>
          {line("✕", describe(r), "text-loss")}
          <p className="text-xs text-muted-foreground">{r.message ?? "Saving failed — try again"}</p>
        </>
      );
    default:
      return (
        <>
          {line("✕", "Couldn't read this slip", "text-loss")}
          {r.message && <p className="truncate text-xs text-muted-foreground" title={r.message}>{r.message}</p>}
        </>
      );
  }
}
