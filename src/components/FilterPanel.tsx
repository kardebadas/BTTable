import { type CSSProperties, useId } from 'react';
import { headerText } from '../core/export';
import type { Column, FilterSpec, FilterState, FilterValue } from '../core/types';
import type { BTTableLabels } from '../labels';
import { FilterWidget } from './FilterWidgets';

/** Props of `FilterPanel`. */
export type FilterPanelProps<R> = {
  columns: readonly Column<R>[];
  filters: FilterState;
  onFilterChange: (key: string, value: FilterValue) => void;
  labels: BTTableLabels;
  /** Where multi-select popovers are portalled; default `document.body`. */
  portalContainer?: HTMLElement | null;
};

const GRID: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' };

/**
 * The filters panel above the table: one labelled field per column with a `filter`, laid
 * out on a responsive grid, each label bound to its control with `htmlFor`. Presentational:
 * values come from `filters` and edits go out through `onFilterChange`. Renders nothing
 * when no column is filterable.
 */
export function FilterPanel<R>({ columns, filters, onFilterChange, labels, portalContainer }: FilterPanelProps<R>) {
  const baseId = useId();
  const filterable = columns.filter((column) => column.filter);
  if (filterable.length === 0) return null;
  return (
    <div className="btt-filters" role="group" aria-label={labels.filters} style={GRID}>
      {filterable.map((column, index) => {
        const id = `${baseId}-filter-${index}`;
        const name = headerText(column);
        return (
          <div key={column.key} className="btt-filter">
            <label id={`${id}-label`} className="btt-filter-label" htmlFor={id}>
              {name}
            </label>
            <FilterWidget
              id={id}
              labelId={`${id}-label`}
              name={name}
              spec={column.filter as FilterSpec}
              value={filters[column.key]}
              onChange={(value) => onFilterChange(column.key, value)}
              labels={labels}
              portalContainer={portalContainer}
            />
          </div>
        );
      })}
    </div>
  );
}
