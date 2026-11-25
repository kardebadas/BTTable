import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LABELS } from '../labels';
import { formatCounter, Toolbar } from './Toolbar';

afterEach(cleanup);

function SearchHarness({ onChange }: { onChange: (text: string) => void }) {
  const [value, setValue] = useState('');
  const change = (text: string) => {
    setValue(text);
    onChange(text);
  };
  return <Toolbar labels={DEFAULT_LABELS} search={{ value, placeholder: 'Find…', onChange: change, onClear: () => change('') }} />;
}

describe('formatCounter', () => {
  it('formats the range and total with grouping, and the filtered-from total', () => {
    expect(formatCounter({ from: 1, to: 100, total: 2345 }, DEFAULT_LABELS)).toBe('Showing 1–100 of 2,345');
    expect(formatCounter({ from: 101, to: 200, total: 1234, filteredFrom: 50000 }, DEFAULT_LABELS)).toBe(
      'Showing 101–200 of 1,234 (filtered from 50,000)',
    );
  });

  it('says No records for null, never "1 to 0"', () => {
    expect(formatCounter(null, DEFAULT_LABELS)).toBe('No records');
  });

  it('groups digits for the given locale', () => {
    expect(formatCounter({ from: 1, to: 100, total: 2345, filteredFrom: 50000 }, DEFAULT_LABELS, 'de-DE')).toBe(
      'Showing 1–100 of 2.345 (filtered from 50.000)',
    );
  });

  it('uses the label templates', () => {
    const labels = { ...DEFAULT_LABELS, counter: '{from}-{to}/{total}', counterFiltered: '[{total}]' };
    expect(formatCounter({ from: 1, to: 2, total: 2, filteredFrom: 9 }, labels)).toBe('1-2/2 [9]');
  });
});

describe('Toolbar', () => {
  it('renders nothing when it has nothing to show', () => {
    const { container } = render(<Toolbar labels={DEFAULT_LABELS} exportFormats={['pdf']} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('has a labelled search box whose clear button empties and refocuses it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SearchHarness onChange={onChange} />);
    const box = screen.getByRole('textbox', { name: 'Search' });
    expect(box).toHaveAttribute('placeholder', 'Find…');
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    await user.type(box, 'ab');
    expect(onChange).toHaveBeenLastCalledWith('ab');
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onChange).toHaveBeenLastCalledWith('');
    expect(box).toHaveValue('');
    expect(box).toHaveFocus();
  });

  it('shows the counter, the CSV button, one button per export format and the extras', async () => {
    const user = userEvent.setup();
    const onExportCsv = vi.fn();
    const onExport = vi.fn();
    render(
      <Toolbar
        labels={DEFAULT_LABELS}
        counter={null}
        onExportCsv={onExportCsv}
        exportFormats={['pdf', 'xlsx']}
        onExport={onExport}
        extras={<span>Extra</span>}
      />,
    );
    expect(screen.getByText('No records')).toHaveClass('btt-counter');
    await user.click(screen.getByRole('button', { name: 'CSV' }));
    expect(onExportCsv).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'XLSX' }));
    expect(onExport).toHaveBeenCalledWith('xlsx');
    expect(screen.getByRole('button', { name: 'PDF' })).toBeInTheDocument();
    expect(screen.getByText('Extra')).toBeInTheDocument();
  });

  it('labels the export format buttons from the exportFormat template', () => {
    const labels = { ...DEFAULT_LABELS, exportFormat: 'Save as {format}' };
    render(<Toolbar labels={labels} exportFormats={['pdf']} onExport={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Save as PDF' })).toBeInTheDocument();
  });
});
