"use client";

import { useState, useTransition } from "react";
import {
  connectChannelAction,
  generateLinkCodeAction,
  removeChannelAction,
  testChannelAction,
  updateChannelAction,
} from "@/actions/settings";
import type { NotificationEventType } from "@/gql/graphql";
import { cn } from "@/lib/utils";

type Channel = {
  id: string;
  label: string | null;
  isActive: boolean;
  events: NotificationEventType[];
  webhookUrlPreview: string;
};

const EVENTS: { value: NotificationEventType; label: string; adminOnly?: boolean }[] = [
  { value: "TRANSACTION_EXECUTED", label: "Transactions" },
  { value: "ALERT_TRIGGERED", label: "Price alerts" },
  { value: "ORDER_FILLED", label: "Orders filled" },
  { value: "SYSTEM_ALERT", label: "System (storage)", adminOnly: true },
];

const LINK_CODE_MINUTES = 10;

type Props = { linked: boolean; isAdmin: boolean; channels: Channel[] };

export default function DiscordSection({ linked, isAdmin, channels }: Props) {
  const events = EVENTS.filter((e) => !e.adminOnly || isAdmin);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="space-y-4 rounded-md bg-muted p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Discord bot</h2>
            <p className="text-xs text-muted-foreground">Lets you send slips with /upload-slip.</p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium",
              linked ? "bg-gain/15 text-gain" : "bg-field text-muted-foreground",
            )}
          >
            {linked ? "● Linked" : "○ Not linked"}
          </span>
        </div>
        <LinkCode linked={linked} />
      </section>

      <section className="space-y-4 rounded-md bg-muted p-5">
        <div>
          <h2 className="font-semibold">Notifications</h2>
          <p className="text-xs text-muted-foreground">Discord channels that receive messages through a webhook.</p>
        </div>
        {channels.length > 0 && (
          <ul className="space-y-2">
            {channels.map((c) => (
              <ChannelRow key={c.id} channel={c} events={events} />
            ))}
          </ul>
        )}
        <ConnectChannelForm events={events} />
      </section>
    </div>
  );
}

function LinkCode({ linked }: { linked: boolean }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const command = code ? `/link code:${code}` : "";

  return (
    <div className="space-y-3 text-sm">
      <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
        <li>Get a code below (valid for {LINK_CODE_MINUTES} minutes).</li>
        <li>In Discord, run the command it shows.</li>
        <li>Then send slips with /upload-slip, up to 5 images at a time.</li>
      </ol>

      {code && (
        <div className="flex items-center gap-2 rounded-md bg-background px-3 py-2">
          <code className="flex-1 font-mono text-sm">{command}</code>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(command);
              setCopied(true);
            }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      {error && <p className="text-loss">{error}</p>}

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError("");
            setCopied(false);
            const res = await generateLinkCodeAction();
            setCode(res.code ?? null);
            if (res.error) setError(res.error);
          })
        }
        className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
      >
        {pending ? "…" : code ? "New code" : linked ? "Re-link with a new code" : "Get link code"}
      </button>
    </div>
  );
}

function EventPicker({ events, selected, onToggle, disabled }: {
  events: typeof EVENTS;
  selected: NotificationEventType[];
  onToggle: (event: NotificationEventType) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {events.map((e) => {
        const on = selected.includes(e.value);
        return (
          <button
            key={e.value}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onToggle(e.value)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs transition disabled:opacity-50",
              on ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {on ? "✓ " : ""}
            {e.label}
          </button>
        );
      })}
    </div>
  );
}

function ChannelRow({ channel, events }: { channel: Channel; events: typeof EVENTS }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok?: string; error?: string }>({});

  const act = (fn: () => Promise<{ error?: string }>, ok?: string) =>
    startTransition(async () => {
      setMessage({});
      const res = await fn();
      setMessage(res.error ? { error: res.error } : ok ? { ok } : {});
    });

  const toggleEvent = (event: NotificationEventType) => {
    const next = channel.events.includes(event)
      ? channel.events.filter((e) => e !== event)
      : [...channel.events, event];
    if (next.length === 0) {
      setMessage({ error: "Keep at least one event, or remove the channel" });
      return;
    }
    act(() => updateChannelAction(channel.id, { events: next }));
  };

  return (
    <li className={cn("space-y-2 rounded-md bg-background p-3", !channel.isActive && "opacity-70")}>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium">
          {channel.label || "Discord channel"}{" "}
          <span className="font-mono text-xs text-muted-foreground">{channel.webhookUrlPreview}</span>
        </p>
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={channel.isActive}
            disabled={pending}
            onChange={(e) => act(() => updateChannelAction(channel.id, { isActive: e.target.checked }))}
          />
          On
        </label>
      </div>
      <EventPicker events={events} selected={channel.events} onToggle={toggleEvent} disabled={pending} />
      <div className="flex items-center justify-end gap-3 text-xs">
        {message.error && <p className="mr-auto text-loss">{message.error}</p>}
        {message.ok && <p className="mr-auto text-gain">✓ {message.ok}</p>}
        <button
          type="button"
          disabled={pending}
          onClick={() => act(() => testChannelAction(channel.id), "Test message sent")}
          className="text-muted-foreground hover:text-foreground"
        >
          Send test
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => confirm("Remove this channel?") && act(() => removeChannelAction(channel.id))}
          className="text-muted-foreground hover:text-loss"
        >
          Remove
        </button>
      </div>
    </li>
  );
}

function ConnectChannelForm({ events }: { events: typeof EVENTS }) {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [label, setLabel] = useState("");
  const [selected, setSelected] = useState<NotificationEventType[]>(["TRANSACTION_EXECUTED", "ALERT_TRIGGERED"]);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const urlLooksRight = webhookUrl === "" || webhookUrl.startsWith("https://discord.com/api/webhooks/");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setError("");
          // The backend posts a test message before saving, so a bad URL fails here.
          const res = await connectChannelAction(webhookUrl.trim(), label.trim(), selected);
          if (res.error) setError(res.error);
          else {
            setWebhookUrl("");
            setLabel("");
          }
        });
      }}
      className="space-y-3 border-t border-border pt-4"
    >
      <p className="text-sm font-medium">Add a channel</p>
      <input
        required
        type="url"
        value={webhookUrl}
        onChange={(e) => setWebhookUrl(e.target.value)}
        placeholder="https://discord.com/api/webhooks/…"
        aria-label="Webhook URL"
        className="w-full rounded-md bg-background px-3 py-2 text-sm outline-none"
      />
      {!urlLooksRight && (
        <p className="text-xs text-loss">Discord webhook URLs start with https://discord.com/api/webhooks/</p>
      )}
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label (optional), e.g. #investing"
        aria-label="Label"
        className="w-full rounded-md bg-background px-3 py-2 text-sm outline-none"
      />
      <EventPicker
        events={events}
        selected={selected}
        onToggle={(ev) => setSelected((s) => (s.includes(ev) ? s.filter((x) => x !== ev) : [...s, ev]))}
      />
      {error && <p className="text-sm text-loss">{error}</p>}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending || !webhookUrl || !urlLooksRight || selected.length === 0}
          className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Connecting…" : "Connect"}
        </button>
      </div>
    </form>
  );
}
