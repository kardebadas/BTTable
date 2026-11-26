import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BTTable } from './BTTable';
import type { BTTableClientProps } from './BTTableProps';
import type { Column, FetchRows } from './core/types';

type Row = { id: number; name: string; state: string };

const ROWS: Row[] = [
  { id: 1, name: 'Ana', state: 'ny' },
  { id: 2, name: 'Bruno', state: 'tx' },
  { id: 3, name: 'Carla', state: 'ny' },
];

const COLUMNS: Column<Row>[] = [
  { key: 'name', header: 'Name' },
  { key: 'state', header: 'State', filter: { type: 'select', options: [{ value: 'ny', label: 'NY' }, { value: 'tx', label: 'TX' }] } },
];

function setup(props: Partial<BTTableClientProps<Row>> = {}) {
  const view = render(<BTTable columns={COLUMNS} rows={ROWS} searchDebounceMs={0} {...props} />);
  return { ...view, user: userEvent.setup() };
}

const names = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('tbody tr.btt-row td:not(.btt-cell--select)'))
    .filter((_, index) => index % 2 === 0)
    .map((cell) => cell.textContent);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('layout of the controls', () => {
  it('puts filters and toolbar above the scroll container and the footer below it, outside it', () => {
    const { container } = setup({ pageSize: 2 });
    const root = container.firstElementChild as HTMLElement;
    const order = Array.from(root.children).map((child) => child.className.split(' ')[0]);
    expect(order).toEqual(['btt-filters', 'btt-toolbar', 'btt-status', 'btt-scroll', 'btt-pagination']);
    expect(container.querySelectorAll('tr.btt-row')).toHaveLength(2);
  });

  it('renders the same controls and selection column in server mode', async () => {
    const fetchRows: FetchRows<Row> = vi.fn(async () => ({ rows: ROWS, totalRows: 3 }));
    const { container } = render(<BTTable columns={COLUMNS} fetchRows={fetchRows} selectable />);
    const root = container.firstElementChild as HTMLElement;
    const order = Array.from(root.children).map((child) => child.className.split(' ')[0]);
    expect(order).toEqual(['btt-filters', 'btt-toolbar', 'btt-status', 'btt-scroll', 'btt-pagination']);
    expect(container.querySelector('thead input')).toHaveAttribute('aria-label', 'Select all');
    await waitFor(() => expect(names(container)).toEqual(['Ana', 'Bruno', 'Carla']));
  });
});

describe('search and counter', () => {
  it('searches from the toolbar box and clears it', async () => {
    const { container, user } = setup({ searchPlaceholder: 'Find a name' });
    const box = screen.getByRole('textbox', { name: 'Search' });
    expect(box).toHaveAttribute('placeholder', 'Find a name');
    await user.type(box, 'bru');
    await waitFor(() => expect(names(container)).toEqual(['Bruno']));
    expect(screen.getByText('Showing 1–1 of 1 (filtered from 3)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    await waitFor(() => expect(names(container)).toHaveLength(3));
  });

  it('clears the search at once with a long debounce', async () => {
    const { container, user, rerender } = setup();
    await user.type(screen.getByRole('textbox', { name: 'Search' }), 'bru');
    await waitFor(() => expect(names(container)).toEqual(['Bruno']));
    rerender(<BTTable columns={COLUMNS} rows={ROWS} searchDebounceMs={60_000} />);
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('textbox', { name: 'Search' })).toHaveValue('');
    expect(names(container)).toEqual(['Ana', 'Bruno', 'Carla']);
  });

  it('has the default placeholder, and no box with search off', () => {
    setup();
    expect(screen.getByRole('textbox', { name: 'Search' })).toHaveAttribute('placeholder', 'Search…');
    cleanup();
    setup({ search: false });
    expect(screen.queryByRole('textbox', { name: 'Search' })).toBeNull();
  });

  it('counts the visible range, No records when empty, and hides with showCounter off', () => {
    setup({ pageSize: 2 });
    expect(screen.getByText('Showing 1–2 of 3')).toBeInTheDocument();
    cleanup();
    setup({ pagination: false });
    expect(screen.getByText('Showing 1–3 of 3')).toBeInTheDocument();
    cleanup();
    setup({ rows: [] });
    expect(screen.getByText('No records')).toBeInTheDocument();
    cleanup();
    const { container } = setup({ showCounter: false });
    expect(container.querySelector('.btt-counter')).toBeNull();
  });
});

describe('locale', () => {
  it('formats the counter and the page count with the locale prop', () => {
    const rows = Array.from({ length: 2500 }, (_, id) => ({ id, name: `Row ${id}`, state: 'ny' }));
    setup({ rows, pageSize: 1, pageSizeOptions: [1], locale: 'de-DE' });
    expect(screen.getByText('Showing 1–1 of 2.500')).toBeInTheDocument();
    expect(screen.getByText('of 2.500')).toBeInTheDocument();
  });
});

describe('pagination footer', () => {
  it('pages with the buttons and the page-size select', async () => {
    const { container, user } = setup({ pageSize: 2, pageSizeOptions: [2, 10] });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(names(container)).toEqual(['Carla']);
    expect(screen.getByRole('spinbutton', { name: 'Page' })).toHaveValue(2);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Rows per page' }), '10');
    expect(names(container)).toEqual(['Ana', 'Bruno', 'Carla']);
    expect(screen.getByRole('spinbutton', { name: 'Page' })).toHaveValue(1);
  });

  it('offers the default page sizes and hides with pagination off', () => {
    const { container } = setup();
    const sizes = Array.from(container.querySelectorAll('.btt-page-size option')).map((option) => option.textContent);
    expect(sizes).toEqual(['25', '50', '100', '500']);
    cleanup();
    setup({ pagination: false });
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});

describe('footer errors', () => {
  it('shows a fallback in place of a throwing footer, keeps the table and calls onError', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    const { container } = setup({ onError, labels: { pageOf: 5 as unknown as string } });
    expect(container.querySelector('.btt-pagination')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong.');
    expect(names(container)).toEqual(['Ana', 'Bruno', 'Carla']);
    expect(container.querySelector('.btt-toolbar')).not.toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe('filters', () => {
  it('narrows the rows from the filters panel', async () => {
    const { container, user } = setup();
    await user.selectOptions(screen.getByRole('combobox', { name: 'State' }), 'ny');
    expect(names(container)).toEqual(['Ana', 'Carla']);
  });
});

describe('export', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:table');
    revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
  });

  it('downloads every filtered row as CSV from the CSV button', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('people.csv');
      expect(this.href).toBe('blob:table');
      expect(this.isConnected).toBe(true);
    });
    const { user } = setup({ exportCsv: true, exportFileName: 'people.csv', pageSize: 1 });
    await user.selectOptions(screen.getByRole('combobox', { name: 'State' }), 'ny');
    await user.click(screen.getByRole('button', { name: 'CSV' }));
    expect(click).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/csv;charset=utf-8');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(await blob.text()).toBe('"Name","State"\r\n"Ana","ny"\r\n"Carla","ny"');
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:table'));
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('names the file table.csv by default and shows no CSV button unless asked', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('table.csv');
    });
    const { user } = setup({ exportCsv: true });
    await user.click(screen.getByRole('button', { name: 'CSV' }));
    expect(click).toHaveBeenCalled();
    cleanup();
    setup();
    expect(screen.queryByRole('button', { name: 'CSV' })).toBeNull();
  });

  it('calls onExport with the format and every filtered row, and shows toolbarExtras', async () => {
    const onExport = vi.fn();
    const { user } = setup({ exportFormats: ['pdf'], onExport, pageSize: 1, toolbarExtras: <button type="button">Add</button> });
    await user.click(screen.getByRole('button', { name: 'PDF' }));
    expect(onExport).toHaveBeenCalledWith('pdf', {
      headers: ['Name', 'State'],
      rows: [
        ['Ana', 'ny'],
        ['Bruno', 'tx'],
        ['Carla', 'ny'],
      ],
    });
    expect(within(document.querySelector('.btt-toolbar') as HTMLElement).getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });
});

describe('selection column', () => {
  it('selects rows with labelled checkboxes without triggering the row click', async () => {
    const onSelectionChange = vi.fn();
    const onClick = vi.fn();
    const { user } = setup({ selectable: true, onSelectionChange, rowProps: () => ({ onClick }) });
    const rowBoxes = screen.getAllByRole('checkbox', { name: 'Select row' });
    expect(rowBoxes).toHaveLength(3);
    await user.click(rowBoxes[1]);
    expect(onSelectionChange).toHaveBeenLastCalledWith([2], [ROWS[1]]);
    expect(rowBoxes[1]).toBeChecked();
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: 'Select all' })).toBePartiallyChecked();
  });

  it('selects every filtered row with the header box, across pages', async () => {
    const onSelectionChange = vi.fn();
    const { user } = setup({ selectable: true, onSelectionChange, pageSize: 1 });
    await user.selectOptions(screen.getByRole('combobox', { name: 'State' }), 'ny');
    const all = screen.getByRole('checkbox', { name: 'Select all' });
    await user.click(all);
    expect(onSelectionChange).toHaveBeenLastCalledWith([1, 3], [ROWS[0], ROWS[2]]);
    expect(all).toBeChecked();
    expect(all).not.toBePartiallyChecked();
    await user.click(all);
    expect(onSelectionChange).toHaveBeenLastCalledWith([], []);
  });

  it('keeps the header box partly checked when a controlled owner rejects select-all', async () => {
    const onSelectionChange = vi.fn();
    const { user } = setup({ selectable: true, selectedIds: [1], onSelectionChange });
    const all = screen.getByRole('checkbox', { name: 'Select all' });
    expect(all).toBePartiallyChecked();
    await user.click(all);
    expect(onSelectionChange).toHaveBeenCalledWith([1, 2, 3], ROWS);
    expect(all).not.toBeChecked();
    expect(all).toBePartiallyChecked();
  });

  it('follows controlled selectedIds', () => {
    setup({ selectable: true, selectedIds: [3] });
    const boxes = screen.getAllByRole('checkbox', { name: 'Select row' });
    expect(boxes.map((box) => (box as HTMLInputElement).checked)).toEqual([false, false, true]);
  });
});

describe('labels', () => {
  it('overrides the control strings', () => {
    setup({
      selectable: true,
      exportCsv: true,
      labels: { search: 'Buscar', selectAll: 'Todos', selectRow: 'Linha', pagination: 'Páginas', counter: '{from}-{to} de {total}', exportCsv: 'Exportar' },
      pageSize: 2,
    });
    expect(screen.getByRole('textbox', { name: 'Buscar' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Todos' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox', { name: 'Linha' })).toHaveLength(2);
    expect(screen.getByRole('navigation', { name: 'Páginas' })).toBeInTheDocument();
    expect(screen.getByText('1-2 de 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar' })).toBeInTheDocument();
  });
});
