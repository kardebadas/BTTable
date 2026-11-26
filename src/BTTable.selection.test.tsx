import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BTTable } from './BTTable';
import type { BTTableClientProps, SelectionBarContext } from './BTTableProps';
import type { RowId } from './hooks/rowModel';
import { advance, COLUMNS, makeRows, renderServer, type Row, settle } from './testing/serverFixture';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const ROWS: Row[] = [
  { id: 1, name: 'Ana', state: 'ny' },
  { id: 2, name: 'Bruno', state: 'tx' },
  { id: 3, name: 'Carla', state: 'ny' },
];

/** A bar that prints the ids and row names it gets, with a button calling `clear`. */
function bar({ selectedIds, selectedRows, clear }: SelectionBarContext<Row>) {
  return (
    <>
      <span data-testid="bar-ids">{selectedIds.join(',')}</span>
      <span data-testid="bar-rows">{selectedRows.map((row) => row.name).join(',')}</span>
      <button type="button" onClick={clear}>
        Unselect
      </button>
    </>
  );
}

const element = (props: Partial<BTTableClientProps<Row>>) => <BTTable columns={COLUMNS} rows={ROWS} selectable renderSelectionBar={bar} searchDebounceMs={0} {...props} />;
const rowBoxes = (container: HTMLElement) => within(container.querySelector('tbody') as HTMLElement).getAllByRole('checkbox');
const barText = (id: string) => screen.getByTestId(id).textContent;

describe('renderSelectionBar', () => {
  it('shows between the toolbar and the table only while a row is selected', () => {
    const { container } = render(element({}));
    expect(container.querySelector('.btt-selection-bar')).toBeNull();
    fireEvent.click(rowBoxes(container)[1]);
    const root = container.firstElementChild as HTMLElement;
    const order = Array.from(root.children).map((child) => child.className.split(' ')[0]);
    expect(order).toEqual(['btt-filters', 'btt-toolbar', 'btt-selection-bar', 'btt-status', 'btt-scroll', 'btt-pagination']);
    expect(barText('bar-ids')).toBe('2');
    expect(barText('bar-rows')).toBe('Bruno');
    fireEvent.click(rowBoxes(container)[1]);
    expect(container.querySelector('.btt-selection-bar')).toBeNull();
  });

  it('keeps filtered-out selected rows and clears through clear()', () => {
    const onSelectionChange = vi.fn();
    const { container } = render(element({ onSelectionChange }));
    fireEvent.click(rowBoxes(container)[0]);
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'tx' } });
    fireEvent.click(rowBoxes(container)[0]);
    expect(barText('bar-rows')).toBe('Ana,Bruno');
    fireEvent.click(screen.getByRole('button', { name: 'Unselect' }));
    expect(onSelectionChange).toHaveBeenLastCalledWith([], []);
    expect(container.querySelector('.btt-selection-bar')).toBeNull();
    expect(rowBoxes(container)[0]).not.toBeChecked();
  });

  it('is not rendered when the table is not selectable', () => {
    const { container } = render(element({ selectable: false, defaultSelectedIds: [1] }));
    expect(container.querySelector('.btt-selection-bar')).toBeNull();
  });

  it('keeps rows of pages seen in server mode, and has no row for an id never seen', async () => {
    const onSelectionChange = vi.fn();
    const { container, calls } = renderServer({ pageSize: 2, selectable: true, renderSelectionBar: bar, onSelectionChange, defaultSelectedIds: [99] });
    await settle(calls[0], { rows: makeRows(1, 2), totalRows: 4 });
    fireEvent.click(rowBoxes(container)[1]);
    expect(onSelectionChange).toHaveBeenLastCalledWith([99, 2], [makeRows(2, 1)[0]]);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await settle(calls[1], { rows: makeRows(3, 2), totalRows: 4 });
    fireEvent.click(rowBoxes(container)[0]);
    expect(barText('bar-ids')).toBe('99,2,3');
    expect(barText('bar-rows')).toBe('Row 2,Row 3');
    expect(onSelectionChange).toHaveBeenLastCalledWith([99, 2, 3], [...makeRows(2, 2)]);
  });
});

describe('turning selectable off', () => {
  it('clears an uncontrolled selection and reports it once', () => {
    const onSelectionChange = vi.fn();
    const { container, rerender } = render(element({ onSelectionChange }));
    fireEvent.click(rowBoxes(container)[0]);
    onSelectionChange.mockClear();
    rerender(element({ onSelectionChange, selectable: false }));
    expect(onSelectionChange).toHaveBeenCalledExactlyOnceWith([], []);
    rerender(element({ onSelectionChange, selectable: true }));
    expect(rowBoxes(container)[0]).not.toBeChecked();
    expect(onSelectionChange).toHaveBeenCalledTimes(1);
  });

  it('asks a controlled owner once to clear', () => {
    const onSelectionChange = vi.fn();
    const selectedIds: RowId[] = [1, 3];
    const { rerender } = render(element({ selectedIds, onSelectionChange }));
    rerender(element({ selectedIds, onSelectionChange, selectable: false }));
    rerender(element({ selectedIds: [...selectedIds], onSelectionChange, selectable: false }));
    expect(onSelectionChange).toHaveBeenCalledExactlyOnceWith([], []);
  });

  it('reports nothing when nothing was selected', () => {
    const onSelectionChange = vi.fn();
    const { rerender } = render(element({ onSelectionChange }));
    rerender(element({ onSelectionChange, selectable: false }));
    advance(0);
    expect(onSelectionChange).not.toHaveBeenCalled();
  });
});
