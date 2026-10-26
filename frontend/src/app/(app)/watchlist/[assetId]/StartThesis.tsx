"use client";

import { useState, useTransition } from "react";
import { startThesisAction } from "@/actions/watchlist";

export default function StartThesis({ assetId, title }: { assetId: string; title: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border py-12 text-center">
      <p className="text-sm text-muted-foreground">No notes for this stock yet</p>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await startThesisAction(assetId, title);
            if (res.error) setError(res.error);
          })
        }
        className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Creating…" : "Start taking notes"}
      </button>
      {error && <p className="text-sm text-loss">{error}</p>}
    </div>
  );
}
