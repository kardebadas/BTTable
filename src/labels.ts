/** Every UI string of the table, in English by default; `labels` overrides any of them. */
export type BTTableLabels = {
  /** Status strip text while `loading`. */
  loading: string;
  /** Fallback text after a render error. */
  error: string;
};

/** The default English labels. */
export const DEFAULT_LABELS: BTTableLabels = {
  loading: 'Loading…',
  error: 'Something went wrong.',
};
