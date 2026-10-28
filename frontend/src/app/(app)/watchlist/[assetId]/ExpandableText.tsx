"use client";

import { useState } from "react";

/** A few lines of a long text, with a toggle to read the rest. */
export default function ExpandableText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-1">
      <p className={open ? "text-sm leading-relaxed" : "line-clamp-3 text-sm leading-relaxed"}>{text}</p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? "Show less" : "Read more"}
      </button>
    </div>
  );
}
