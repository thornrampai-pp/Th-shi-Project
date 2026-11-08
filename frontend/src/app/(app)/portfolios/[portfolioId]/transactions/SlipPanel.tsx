"use client";

import { useEffect, useState } from "react";
import { getTransactionSlipAction, type SlipFile } from "@/actions/portfolio";
import LocalDateTime from "@/components/LocalDateTime";

function fileSize(bytes: number | null): string {
  if (bytes == null) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * A panel docked to the right edge (full screen on phones) showing the slip or
 * statement attached to a transaction — PDFs in the browser's viewer, images inline.
 * The table stays usable beside it: "View" on another row swaps the file in place.
 * The link is a short-lived presigned R2 URL fetched each time a file is opened.
 */
export default function SlipPanel({
  transactionId,
  title,
  onClose,
}: {
  transactionId: string;
  title: string;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState<{ id: string; file?: SlipFile; error?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTransactionSlipAction(transactionId).then((res) => {
      if (!cancelled) setLoaded({ id: transactionId, file: res.file, error: res.file ? undefined : (res.error ?? "Couldn't load the file") });
    });
    return () => {
      cancelled = true;
    };
  }, [transactionId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Ignore a result still on screen from the previously viewed row.
  const current = loaded?.id === transactionId ? loaded : null;
  const file = current?.file ?? null;
  const isPdf = file?.mimeType === "application/pdf";

  return (
    <aside
      aria-label={`Attached file: ${title}`}
      className="fixed inset-x-0 top-14 bottom-0 z-20 flex flex-col border-l border-border bg-background shadow-2xl md:left-auto md:w-[min(46rem,50vw)]"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 bg-chrome px-4 py-3 text-white">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <p className="truncate text-xs text-white/60">
            {file ? (
              <>
                {isPdf ? "PDF" : "Image"}
                {file.size != null && ` · ${fileSize(file.size)}`}
                {file.attachedAt && (
                  <>
                    {" · attached "}
                    <LocalDateTime iso={file.attachedAt} format="short" />
                  </>
                )}
              </>
            ) : (
              "Attached file"
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {file && (
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              // Phones already get a big "Open PDF" button in the panel body.
              className={`rounded-md px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 hover:text-white ${isPdf ? "hidden md:inline-block" : ""}`}
            >
              Open in new tab
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close file panel"
            className="flex size-8 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4" aria-hidden>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 bg-muted">
        {current?.error ? (
          <p className="p-8 text-center text-sm text-loss">{current.error}</p>
        ) : !file ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : isPdf ? (
          <>
            <iframe key={file.url} src={file.url} title={title} className="hidden h-full w-full border-0 md:block" />
            {/* Phone browsers don't show PDFs inside a page (Android: not at all, iPhone: page 1 only). */}
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center md:hidden">
              <p className="text-sm text-muted-foreground">PDFs open in your phone&apos;s viewer.</p>
              <a
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-primary px-5 py-2.5 text-sm text-primary-foreground hover:opacity-90"
              >
                Open PDF
              </a>
            </div>
          </>
        ) : (
          <div className="flex h-full items-start justify-center overflow-auto p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived presigned URL, not optimizable */}
            <img src={file.url} alt={title} className="max-w-full rounded-md object-contain shadow" />
          </div>
        )}
      </div>
    </aside>
  );
}
