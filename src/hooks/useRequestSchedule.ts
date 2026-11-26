import { useEffect, useRef } from 'react';
import { useLatest } from './useLatest';

/** Input of `useRequestSchedule`. */
export type ScheduleInput = {
  /** Identity of the request the props ask for; a change schedules it. */
  requestKey: string;
  /** Identity of the typed-in part of the request; a change there waits `delay` ms of quiet. */
  typedKey: string;
  /** Bumped by refresh, reset and retry: a change sends at once, never debounced. */
  generation: number;
  delay: number;
  /** Read when the key changes: `false` sends nothing (the request is already answered). */
  needed: boolean;
  /** Sends the request; `signal` aborts when a newer request is scheduled or on unmount. */
  send: (signal: AbortSignal) => void;
};

type Scheduled = { typedKey: string; generation: number };

/** True when only typing changed the request since the last scheduled one (not a refresh, reset or retry). */
function isTyping(last: Scheduled | null, next: Scheduled): boolean {
  return last !== null && last.typedKey !== next.typedKey && last.generation === next.generation;
}

/**
 * When to send a request, shared by server mode (fetch) and manual mode (emit the query):
 * one per `requestKey` change, typing debounced by `delay`, everything else at once. A new
 * request, and unmounting, aborts the previous signal and drops a pending timer.
 */
export function useRequestSchedule(input: ScheduleInput): void {
  const { requestKey, typedKey, generation } = input;
  const latest = useLatest(input);
  const lastScheduled = useRef<Scheduled | null>(null);
  useEffect(() => {
    const next = { typedKey, generation };
    const debounce = isTyping(lastScheduled.current, next);
    lastScheduled.current = next;
    if (!latest.current.needed) return;
    const controller = new AbortController();
    const send = () => latest.current.send(controller.signal);
    const timer = debounce ? setTimeout(send, latest.current.delay) : undefined;
    if (!debounce) send();
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [requestKey, typedKey, generation, latest]);
}
