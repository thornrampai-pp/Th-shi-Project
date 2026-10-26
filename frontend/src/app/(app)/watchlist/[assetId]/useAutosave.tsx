"use client";

import { useEffect, useRef, useState } from "react";
import type { ActionResult } from "@/actions/watchlist";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 1500;

/** Text state that saves itself after typing pauses, on blur (`flush`), and when unmounted. */
export function useAutosave(initial: string, save: (value: string) => Promise<ActionResult>) {
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState("");

  const valueRef = useRef(initial);
  const savedRef = useRef(initial);
  const saveRef = useRef(save);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    saveRef.current = save;
  });

  const flush = async () => {
    clearTimeout(timer.current);
    const v = valueRef.current;
    if (v === savedRef.current) return;
    setState("saving");
    const res = await saveRef.current(v);
    if (res.error) {
      setState("error");
      setError(res.error);
      return;
    }
    savedRef.current = v;
    setError("");
    setState(valueRef.current === v ? "saved" : "dirty");
  };

  const change = (v: string) => {
    valueRef.current = v;
    setValue(v);
    setState("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, DEBOUNCE_MS);
  };

  /** Replace the text and save immediately (e.g. restoring from history). */
  const replace = (v: string) => {
    valueRef.current = v;
    setValue(v);
    void flush();
  };

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (valueRef.current !== savedRef.current) void saveRef.current(valueRef.current);
    },
    [],
  );

  return { value, change, replace, flush, state, error };
}

export function SaveIndicator({ state, error }: { state: SaveState; error: string }) {
  const text =
    state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? error : state === "dirty" ? "Unsaved" : "";
  return <span className={state === "error" ? "text-xs text-loss" : "text-xs text-muted-foreground"}>{text}</span>;
}
