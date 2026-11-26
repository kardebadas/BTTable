import { type Dispatch, type SetStateAction, useState } from 'react';
import type { FetchResult, FetchRows, Query } from '../core/types';
import { useRequestSchedule } from './useRequestSchedule';

/** Input of `useServerFetch`. */
export type ServerFetchInput<R> = {
  fetchRows: FetchRows<R>;
  query: Query;
  /** Identity of `query`; a change asks for a new request. */
  queryKey: string;
  /** Identity of the view the query shows (query plus resets); reported back with its result. */
  viewKey: string;
  /** Identity of the typed-in part of `query`; a change there waits `delay` ms of quiet. */
  typedKey: string;
  /** Bumped by refresh, reset and retry: a change sends the same query again, at once. */
  generation: number;
  delay: number;
  onQueryChange?: (query: Query) => void;
  /** Called with each accepted (current, well-formed) result. */
  onResult?: (query: Query, result: FetchResult<R>) => void;
};

/**
 * The request state: the last accepted result, the view key it was requested for, whether a
 * request is pending, and whether it failed.
 */
export type ServerFetch<R> = { result: FetchResult<R> | null; viewKey: string; loading: boolean; error: boolean };

/**
 * Request state. `requestKey` is the request the current props ask for; `pending` is true
 * while it is outstanding (scheduled or in flight); `successKey` names the request whose
 * `result` is on screen.
 */
type FetchState<R> = {
  requestKey: string;
  pending: boolean;
  successKey: string;
  result: FetchResult<R> | null;
  /** The view key of the request whose `result` is on screen. */
  resultViewKey: string;
  error: boolean;
};

type SetFetchState<R> = Dispatch<SetStateAction<FetchState<R>>>;

type SendInput<R> = {
  input: ServerFetchInput<R>;
  requestKey: string;
  signal: AbortSignal;
  setState: SetFetchState<R>;
};

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

function checkResult<R>(result: FetchResult<R>): FetchResult<R> {
  if (!Array.isArray(result?.rows)) throw new TypeError('BTTable: fetchRows must resolve to { rows: [...], totalRows }.');
  return result;
}

/** Applies a finished request, unless the props moved on to another request meanwhile. */
function settle<R>(setState: SetFetchState<R>, requestKey: string, change: Partial<FetchState<R>>): void {
  setState((state) => (state.requestKey === requestKey ? { ...state, ...change, pending: false } : state));
}

/**
 * Sends one request. An aborted request settles nothing: a superseded or unmounted request,
 * or the first of a StrictMode double mount (same key), is ignored even when the fetcher
 * ignores the signal. An `AbortError` ends loading without an error.
 */
function sendRequest<R>({ input, requestKey, signal, setState }: SendInput<R>): void {
  const { query, fetchRows } = input;
  input.onQueryChange?.(query);
  new Promise<FetchResult<R>>((resolve) => resolve(fetchRows(query, { signal })))
    .then(checkResult)
    .then(
      (result) => {
        if (signal.aborted) return;
        settle(setState, requestKey, { result, successKey: requestKey, resultViewKey: input.viewKey, error: false });
        input.onResult?.(query, result);
      },
      (error: unknown) => {
        if (!signal.aborted) settle(setState, requestKey, { error: !isAbortError(error) });
      },
    );
}

/**
 * The request state for `requestKey`, adjusted during render when the key changes: a key
 * whose result is already on screen needs no request; any other key is pending. A failure
 * stays until a request settles (or the key of the result on screen comes back), so a retry
 * never shows the last success's rows under the new query.
 */
function useFetchState<R>(requestKey: string) {
  const [state, setState] = useState<FetchState<R>>(() => ({ requestKey, pending: true, successKey: '', result: null, resultViewKey: '', error: false }));
  if (state.requestKey === requestKey) return { state, setState };
  const onScreen = requestKey === state.successKey;
  const next = { ...state, requestKey, pending: !onScreen, error: onScreen ? false : state.error };
  setState(next);
  return { state: next, setState };
}

/**
 * Owns the server requests: one per query change or `generation` bump, typing debounced by
 * `delay`, everything else sent at once. Going back to the request whose result is on screen
 * sends nothing. A new request, and unmounting, aborts the one in flight and drops a pending
 * timer. The last result stays while the next one loads; `loading` is true exactly while a
 * request is outstanding.
 */
export function useServerFetch<R>(input: ServerFetchInput<R>): ServerFetch<R> {
  const { queryKey, typedKey, generation, delay } = input;
  const requestKey = `${generation}:${queryKey}`;
  const { state, setState } = useFetchState<R>(requestKey);
  const send = (signal: AbortSignal) => sendRequest({ input, requestKey, signal, setState });
  useRequestSchedule({ requestKey, typedKey, generation, delay, needed: state.pending, send });
  return { result: state.result, viewKey: state.resultViewKey, loading: state.pending, error: state.error };
}
