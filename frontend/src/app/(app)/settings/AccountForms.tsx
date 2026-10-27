"use client";

import { useState, useTransition } from "react";
import { changePasswordAction, updateProfileAction } from "@/actions/settings";

const fieldClass = "w-full rounded-md bg-background px-3 py-2 text-sm outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function SubmitRow({ pending, disabled, label, message }: {
  pending: boolean;
  disabled?: boolean;
  label: string;
  message: { ok?: string; error?: string };
}) {
  return (
    <div className="flex items-center justify-end gap-3">
      {message.error && <p className="mr-auto text-sm text-loss">{message.error}</p>}
      {message.ok && <p className="mr-auto text-sm text-gain">✓ {message.ok}</p>}
      <button
        type="submit"
        disabled={pending || disabled}
        className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Saving…" : label}
      </button>
    </div>
  );
}

export function ProfileForm({ initial }: { initial: { firstName: string; lastName: string; taxResidency: string } }) {
  const [values, setValues] = useState(initial);
  const [message, setMessage] = useState<{ ok?: string; error?: string }>({});
  const [pending, startTransition] = useTransition();

  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await updateProfileAction({
            firstName: values.firstName.trim(),
            lastName: values.lastName.trim(),
            taxResidency: values.taxResidency.trim().toUpperCase(),
          });
          setMessage(res.error ? { error: res.error } : { ok: "Saved" });
        });
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name">
          <input value={values.firstName} onChange={set("firstName")} className={fieldClass} />
        </Field>
        <Field label="Last name">
          <input value={values.lastName} onChange={set("lastName")} className={fieldClass} />
        </Field>
        <Field label="Tax residency">
          <input
            value={values.taxResidency}
            onChange={set("taxResidency")}
            maxLength={2}
            placeholder="TH"
            className={`${fieldClass} uppercase`}
          />
        </Field>
      </div>
      <SubmitRow pending={pending} label="Save" message={message} />
    </form>
  );
}

const MIN_PASSWORD = 8;

export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{ ok?: string; error?: string }>({});
  const [pending, startTransition] = useTransition();

  const mismatch = confirm !== "" && next !== confirm;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await changePasswordAction(current, next);
          if (res.error) {
            setMessage({ error: res.error });
            return;
          }
          setCurrent("");
          setNext("");
          setConfirm("");
          setMessage({ ok: "Password changed. Other devices have been signed out." });
        });
      }}
      className="space-y-4"
    >
      <Field label="Current password">
        <input
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className={fieldClass}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="New password">
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={fieldClass}
          />
        </Field>
        <Field label="Confirm">
          <input
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={fieldClass}
          />
        </Field>
      </div>
      {mismatch && <p className="text-xs text-loss">Passwords don&apos;t match</p>}
      <SubmitRow
        pending={pending}
        disabled={mismatch || next.length < MIN_PASSWORD || !current}
        label="Change password"
        message={message}
      />
    </form>
  );
}
