// Discord interaction payloads and the few REST calls the bot makes. Type numbers come
// from Discord's API spec — not ours to rename.
import { env } from '../../config/env';

export const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_MESSAGE_LIMIT = 2000;

export const INTERACTION_TYPE_PING = 1;
export const INTERACTION_TYPE_COMMAND = 2;
export const INTERACTION_TYPE_COMPONENT = 3;
export const INTERACTION_TYPE_AUTOCOMPLETE = 4;
export const INTERACTION_TYPE_MODAL_SUBMIT = 5;

export const RESPONSE_TYPE_PONG = 1;
export const RESPONSE_TYPE_CHANNEL_MESSAGE = 4;
export const RESPONSE_TYPE_DEFERRED_CHANNEL_MESSAGE = 5;
/** Component / modal: ack now, edit the message later. */
export const RESPONSE_TYPE_DEFERRED_UPDATE_MESSAGE = 6;
/** Component / modal: edit the message the component is on. */
export const RESPONSE_TYPE_UPDATE_MESSAGE = 7;
export const RESPONSE_TYPE_AUTOCOMPLETE_RESULT = 8;
export const RESPONSE_TYPE_MODAL = 9;

const COMPONENT_ACTION_ROW = 1;
const COMPONENT_BUTTON = 2;
const COMPONENT_STRING_SELECT = 3;
const COMPONENT_TEXT_INPUT = 4;
const BUTTON_STYLE_PRIMARY = 1;
const BUTTON_STYLE_SECONDARY = 2;
const TEXT_INPUT_SHORT = 1;
export const MESSAGE_FLAG_EPHEMERAL = 64;

/** Limits Discord enforces on component fields. */
export const SELECT_MAX_OPTIONS = 25;
export const CHOICE_NAME_MAX = 100;
const MODAL_LABEL_MAX = 45;

export interface DiscordAttachment {
  id: string;
  url: string;
  content_type?: string;
  size?: number;
}

export interface DiscordInteractionOption {
  name: string;
  value: string;
  /** Set on the option the user is typing in, for autocomplete interactions. */
  focused?: boolean;
}

interface ModalField {
  custom_id?: string;
  value?: string;
}

/** A modal submit's rows: an action row of inputs, or (newer clients) a label wrapping one. */
interface ModalRow {
  components?: ModalField[];
  component?: ModalField;
}

export interface DiscordInteraction {
  type: number;
  token: string;
  member?: { user?: { id: string } };
  user?: { id: string };
  data?: {
    name?: string;
    options?: DiscordInteractionOption[];
    resolved?: { attachments?: Record<string, DiscordAttachment> };
    /** Components and modals. */
    custom_id?: string;
    /** Select menus. */
    values?: string[];
    /** Modal submits. */
    components?: ModalRow[];
  };
}

export type DiscordComponent = Record<string, unknown>;

export interface DiscordMessage {
  content: string;
  components?: DiscordComponent[];
  flags?: number;
}

export interface DiscordModal {
  custom_id: string;
  title: string;
  components: DiscordComponent[];
}

export interface DiscordInteractionResponse {
  type: number;
  data?: DiscordMessage | DiscordModal | { choices: { name: string; value: string }[] };
}

export function actionRow(...components: DiscordComponent[]): DiscordComponent {
  return { type: COMPONENT_ACTION_ROW, components };
}

export function button(customId: string, label: string, primary = false): DiscordComponent {
  return {
    type: COMPONENT_BUTTON,
    style: primary ? BUTTON_STYLE_PRIMARY : BUTTON_STYLE_SECONDARY,
    custom_id: customId,
    label,
  };
}

export function stringSelect(
  customId: string,
  placeholder: string,
  options: { label: string; value: string; description?: string }[],
): DiscordComponent {
  return {
    type: COMPONENT_STRING_SELECT,
    custom_id: customId,
    placeholder,
    options: options.slice(0, SELECT_MAX_OPTIONS).map((o) => ({
      label: o.label.slice(0, CHOICE_NAME_MAX),
      value: o.value,
      ...(o.description ? { description: o.description.slice(0, CHOICE_NAME_MAX) } : {}),
    })),
  };
}

/** One short text input per row, pre-filled when there's a value (Discord rejects ""). */
export function textInputRow(
  customId: string,
  label: string,
  value: string | null,
  required: boolean,
): DiscordComponent {
  return actionRow({
    type: COMPONENT_TEXT_INPUT,
    custom_id: customId,
    label: label.slice(0, MODAL_LABEL_MAX),
    style: TEXT_INPUT_SHORT,
    required,
    max_length: 40,
    ...(value ? { value } : {}),
  });
}

export function modalValues(interaction: DiscordInteraction): Map<string, string> {
  const values = new Map<string, string>();
  for (const row of interaction.data?.components ?? []) {
    for (const field of row.components ?? (row.component ? [row.component] : [])) {
      if (field.custom_id) values.set(field.custom_id, (field.value ?? '').trim());
    }
  }
  return values;
}

export function discordUserIdOf(interaction: DiscordInteraction): string | undefined {
  return interaction.member?.user?.id ?? interaction.user?.id;
}

/** The message this interaction created (slash command) or is attached to (component). */
export function originalMessageUrl(interaction: DiscordInteraction): string {
  return `${DISCORD_API}/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`;
}

export async function editMessage(url: string, message: DiscordMessage | string): Promise<void> {
  await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toBody(message)),
  });
}

/** A further message under a slash command's reply (valid while its token is, 15 min). */
export async function postFollowup(interaction: DiscordInteraction, message: DiscordMessage): Promise<void> {
  const response = await fetch(`${DISCORD_API}/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toBody(message)),
  });
  if (!response.ok) {
    console.error(`❌ Discord follow-up failed (${response.status}): ${await response.text()}`);
  }
}

function toBody(message: DiscordMessage | string): DiscordMessage {
  const m = typeof message === 'string' ? { content: message } : message;
  return { ...m, content: truncate(m.content) };
}

export function truncate(content: string): string {
  return content.length > DISCORD_MESSAGE_LIMIT ? `${content.slice(0, DISCORD_MESSAGE_LIMIT - 1)}…` : content;
}
