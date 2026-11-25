import { type KeyboardEvent, useId, useState } from 'react';
import { clampPage } from '../core/pagination';
import { type BTTableLabels, fillLabel, formatCount } from '../labels';

/** Props of `Pagination`. Pages are 1-based. */
export type PaginationProps = {
  labels: BTTableLabels;
  /** Locale of the page count; default: the runtime's. */
  locale?: string;
  page: number;
  pageCount: number;
  pageSize: number;
  pageSizeOptions: readonly number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

type PageInputProps = Pick<PaginationProps, 'labels' | 'locale' | 'page' | 'pageCount' | 'onPageChange'>;

/** Page number box: edits stay local until Enter or blur, then commit clamped into range. */
function PageInput({ labels, locale, page, pageCount, onPageChange }: PageInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    setDraft(null);
    if (draft === null || draft.trim() === '') return;
    // One "row" per page: clampPage then clamps into 1..pageCount.
    const next = clampPage(Number(draft), pageCount, 1);
    if (next !== page) onPageChange(next);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    // Enter commits the page; it must not also submit a surrounding form.
    event.preventDefault();
    commit();
  };
  return (
    <span className="btt-page">
      <input
        type="number"
        className="btt-page-input"
        aria-label={labels.page}
        min={1}
        max={pageCount}
        value={draft ?? page}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      <span className="btt-page-count">{fillLabel(labels.pageOf, { count: formatCount(pageCount, locale) })}</span>
    </span>
  );
}

/** Distinct positive whole-number options, plus the current size when it is valid and missing, ascending. */
function pageSizeChoices(options: readonly number[], current: number): number[] {
  const valid = Array.from(new Set(options.filter((size) => Number.isInteger(size) && size > 0)));
  if (valid.includes(current) || !(current > 0)) return valid;
  return [...valid, current].sort((a, b) => a - b);
}

type PageSizeProps = Pick<PaginationProps, 'labels' | 'pageSize' | 'pageSizeOptions' | 'onPageSizeChange'>;

function PageSizeSelect({ labels, pageSize, pageSizeOptions, onPageSizeChange }: PageSizeProps) {
  const id = useId();
  return (
    <span className="btt-page-size">
      <label htmlFor={id}>{labels.pageSize}</label>
      <select id={id} value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
        {pageSizeChoices(pageSizeOptions, pageSize).map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </span>
  );
}

/**
 * The pagination footer: a `<nav>` with previous/next buttons, a page number box clamped
 * into range, and a page-size select. Presentational: the caller owns page and size.
 */
export function Pagination(props: PaginationProps) {
  const { labels, page, pageCount, onPageChange } = props;
  return (
    <nav className="btt-pagination" aria-label={labels.pagination}>
      <button type="button" className="btt-page-prev" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        {labels.previousPage}
      </button>
      <PageInput {...props} />
      <button type="button" className="btt-page-next" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
        {labels.nextPage}
      </button>
      <PageSizeSelect {...props} />
    </nav>
  );
}
