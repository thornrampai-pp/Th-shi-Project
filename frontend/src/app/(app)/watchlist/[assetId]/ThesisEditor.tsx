"use client";

import { useState, useTransition } from "react";
import {
  addSectionAction,
  deleteSectionAction,
  updateSectionAction,
  updateThesisAction,
} from "@/actions/watchlist";
import type { ThesisStatus } from "@/gql/graphql";
import { cn } from "@/lib/utils";
import { SaveIndicator, useAutosave } from "./useAutosave";

type Version = { id: string; content: string; savedAt: string };
type Section = { id: string; title: string; content: string; history: Version[] };
export type Thesis = { id: string; status: ThesisStatus; summary: string; sections: Section[] };

const dateFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Bangkok",
});

export default function ThesisEditor({ thesis }: { thesis: Thesis }) {
  return (
    <div className="space-y-6">
      <StatusToggle thesisId={thesis.id} status={thesis.status} />
      <Summary thesisId={thesis.id} initial={thesis.summary} />

      <section className="space-y-1">
        {thesis.sections.map((s) => (
          <SectionItem key={s.id} section={s} />
        ))}
        <AddSection thesisId={thesis.id} />
      </section>
    </div>
  );
}

function StatusToggle({ thesisId, status }: { thesisId: string; status: ThesisStatus }) {
  const [pending, startTransition] = useTransition();
  const done = status !== "DRAFT";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={done}
      disabled={pending}
      onClick={() => startTransition(() => updateThesisAction(thesisId, { status: done ? "DRAFT" : "WATCHING" }).then(() => {}))}
      className="flex items-center gap-3 text-sm disabled:opacity-60"
    >
      <span className={cn("relative h-6 w-11 rounded-full transition-colors", done ? "bg-gain" : "bg-muted-foreground/30")}>
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform",
            done && "translate-x-5",
          )}
        />
      </span>
      {done ? "Done" : "In progress"}
    </button>
  );
}

function Summary({ thesisId, initial }: { thesisId: string; initial: string }) {
  const { value, change, flush, state, error } = useAutosave(initial, (summary) =>
    updateThesisAction(thesisId, { summary }),
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor="summary" className="text-sm font-semibold">
          Opinion & summary
        </label>
        <SaveIndicator state={state} error={error} />
      </div>
      <textarea
        id="summary"
        value={value}
        onChange={(e) => change(e.target.value)}
        onBlur={flush}
        placeholder="Why are you interested in this stock?"
        className="field-sizing-content min-h-24 w-full resize-none rounded-md bg-muted p-4 text-sm outline-none"
      />
    </div>
  );
}

function SectionItem({ section }: { section: Section }) {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [pending, startTransition] = useTransition();
  const { value, change, replace, flush, state, error } = useAutosave(section.content, (content) =>
    updateSectionAction(section.id, { content }),
  );

  const preview = value.split("\n").find((line) => line.trim());

  const rename = (title: string) => {
    setRenaming(false);
    const trimmed = title.trim();
    if (trimmed && trimmed !== section.title) startTransition(() => updateSectionAction(section.id, { title: trimmed }).then(() => {}));
  };

  const remove = () => {
    if (!confirm(`Delete "${section.title}" and all of its history?`)) return;
    startTransition(() => deleteSectionAction(section.id).then(() => {}));
  };

  return (
    <div className={cn("border-b border-border", pending && "opacity-50")}>
      <div className="flex items-center gap-2 py-2">
        {renaming ? (
          <input
            autoFocus
            defaultValue={section.title}
            onBlur={(e) => rename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") rename(e.currentTarget.value);
              if (e.key === "Escape") setRenaming(false);
            }}
            aria-label="Section title"
            className="flex-1 rounded bg-muted px-2 py-0.5 text-sm font-semibold outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
          >
            <span className={cn("text-xs transition-transform", open && "rotate-90")}>›</span>
            <span className="shrink-0 text-sm font-semibold">{section.title}</span>
            {!open && preview && <span className="truncate text-xs text-muted-foreground">{preview}</span>}
          </button>
        )}
        <SaveIndicator state={state} error={error} />
      </div>

      {open && (
        <div className="space-y-2 pb-4 pl-4">
          <textarea
            value={value}
            onChange={(e) => change(e.target.value)}
            onBlur={flush}
            aria-label={section.title}
            className="field-sizing-content min-h-28 w-full resize-none rounded-md bg-muted p-4 text-sm outline-none"
          />

          <div className="flex gap-4 text-xs text-muted-foreground">
            <button type="button" onClick={() => setShowHistory((v) => !v)} className="hover:text-foreground">
              History ({section.history.length})
            </button>
            <button type="button" onClick={() => setRenaming(true)} className="hover:text-foreground">
              Rename
            </button>
            <button type="button" onClick={remove} className="hover:text-loss">
              Delete section
            </button>
          </div>

          {showHistory && (
            <ol className="space-y-2">
              {section.history.length === 0 && <li className="text-xs text-muted-foreground">No history yet</li>}
              {section.history.map((v) => (
                <li key={v.id} className="rounded-md bg-muted/50 p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <time dateTime={v.savedAt} className="text-xs text-muted-foreground">
                      {dateFormat.format(new Date(v.savedAt))}
                    </time>
                    {v.content === value ? (
                      <span className="text-xs text-muted-foreground">Current</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => replace(v.content)}
                        className="text-xs text-muted-foreground underline hover:text-foreground"
                      >
                        Restore
                      </button>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{v.content || <em className="text-muted-foreground">(empty)</em>}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function AddSection({ thesisId }: { thesisId: string }) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = (title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return setAdding(false);
    startTransition(async () => {
      const res = await addSectionAction(thesisId, trimmed);
      if (res.error) setError(res.error);
      else setAdding(false);
    });
  };

  if (!adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="py-2 text-sm text-muted-foreground hover:text-foreground"
      >
        + Add section
      </button>
    );
  }

  return (
    <div className="py-2">
      <input
        autoFocus
        disabled={pending}
        placeholder="Section title, e.g. Management"
        onKeyDown={(e) => {
          if (e.key === "Enter") submit(e.currentTarget.value);
          if (e.key === "Escape") setAdding(false);
        }}
        onBlur={(e) => submit(e.target.value)}
        className="w-full rounded bg-muted px-2 py-1 text-sm outline-none"
      />
      {error && <p className="mt-1 text-xs text-loss">{error}</p>}
    </div>
  );
}
