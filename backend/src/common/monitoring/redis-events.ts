/**
 * Recent Redis connection events (connect / ready / error / reconnecting / end), kept in
 * process memory rather than Redis — the interesting events are exactly the ones where
 * Redis can't be written to. Per API instance and cleared on restart.
 */

export type RedisEventType = 'connect' | 'ready' | 'error' | 'reconnecting' | 'end';

export interface RedisEvent {
  at: Date;
  type: RedisEventType;
  message: string | null;
}

const MAX_EVENTS = 100;
const events: RedisEvent[] = [];

export function recordRedisEvent(type: RedisEventType, message: string | null = null): void {
  // A dead Redis fires the same error on every retry — fold repeats into the latest entry.
  const last = events[0];
  if (last && last.type === type && last.message === message && type === 'error') {
    last.at = new Date();
    return;
  }
  events.unshift({ at: new Date(), type, message });
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
}

/** Newest first. */
export function getRedisEvents(): RedisEvent[] {
  return events.map((e) => ({ ...e }));
}
