import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Column, FilterState, FilterValue } from '../core/types';
import { DEFAULT_LABELS } from '../labels';
import { FilterPanel } from './FilterPanel';

type Row = Record<string, unknown>;

const COLUMNS: Column<Row>[] = [
  { key: 'name', header: 'Name', filter: { type: 'text', placeholder: 'Any name' } },
  { key: 'age', header: 'Age', filter: { type: 'number' } },
  { key: 'score', header: 'Score', filter: { type: 'number', op: 'range' } },
  { key: 'born', header: 'Born', filter: { type: 'date' } },
  { key: 'seen', header: 'Seen', filter: { type: 'date', op: 'range' } },
  { key: 'state', header: <em>State</em>, headerText: 'State', filter: { type: 'select', options: [{ value: 'ny', label: 'New York' }, { value: 'tx', label: <b>Texas</b> }] } },
  { key: 'tags', header: 'Tags', filter: { type: 'multiselect', options: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }] } },
  { key: 'email', header: 'Email', filter: { type: 'notEmpty' } },
  { key: 'plain', header: 'Plain' },
];

function Harness({ initial = {}, onChange }: { initial?: FilterState; onChange: (key: string, value: FilterValue) => void }) {
  const [filters, setFilters] = useState<FilterState>(initial);
  const change = (key: string, value: FilterValue) => {
    setFilters((current) => ({ ...current, [key]: value }));
    onChange(key, value);
  };
  return <FilterPanel columns={COLUMNS} filters={filters} onFilterChange={change} labels={DEFAULT_LABELS} />;
}

function setup(initial: FilterState = {}) {
  const onChange = vi.fn();
  render(<Harness initial={initial} onChange={onChange} />);
  return { onChange, user: userEvent.setup() };
}

afterEach(cleanup);

describe('FilterPanel', () => {
  it('renders nothing without filterable columns', () => {
    const { container } = render(
      <FilterPanel columns={[{ key: 'x', header: 'X' }]} filters={{}} onFilterChange={() => {}} labels={DEFAULT_LABELS} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('is a labelled grid with one htmlFor-labelled field per filterable column', () => {
    setup();
    const panel = screen.getByRole('group', { name: 'Filters' });
    expect(panel.style.display).toBe('grid');
    expect(panel.style.gridTemplateColumns).toBe('repeat(auto-fill, minmax(180px, 1fr))');
    expect(panel.querySelectorAll('.btt-filter')).toHaveLength(8);
    for (const label of Array.from(panel.querySelectorAll('label.btt-filter-label'))) {
      expect(document.getElementById(label.getAttribute('for') as string)).not.toBeNull();
    }
    expect(screen.getByLabelText('Name')).toHaveAttribute('placeholder', 'Any name');
  });

  it('edits text, number and date filters with native inputs and typed values', async () => {
    const { onChange, user } = setup();
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'an');
    expect(onChange).toHaveBeenLastCalledWith('name', 'an');
    await user.type(screen.getByRole('spinbutton', { name: 'Age' }), '0');
    expect(onChange).toHaveBeenLastCalledWith('age', 0);
    await user.clear(screen.getByRole('spinbutton', { name: 'Age' }));
    expect(onChange).toHaveBeenLastCalledWith('age', null);
    const born = screen.getByLabelText('Born');
    expect(born).toHaveAttribute('type', 'date');
    await user.type(born, '2024-02-29');
    expect(onChange).toHaveBeenLastCalledWith('born', '2024-02-29');
    await user.clear(born);
    expect(onChange).toHaveBeenLastCalledWith('born', null);
  });

  it('keeps decimals and signs as typed in number inputs', async () => {
    const { onChange, user } = setup();
    const age = screen.getByRole('spinbutton', { name: 'Age' });
    await user.type(age, '1.05');
    expect(age).toHaveValue(1.05);
    expect(onChange).toHaveBeenLastCalledWith('age', 1.05);
    await user.clear(age);
    await user.type(age, '-0.5');
    expect(age).toHaveValue(-0.5);
    expect(onChange).toHaveBeenLastCalledWith('age', -0.5);
    // Intermediate text the browser keeps while typing; user-event skips these states.
    fireEvent.change(age, { target: { value: '1.0' } });
    expect((age as HTMLInputElement).value).toBe('1.0');
    expect(onChange).toHaveBeenLastCalledWith('age', 1);
    fireEvent.change(age, { target: { value: '-0' } });
    expect((age as HTMLInputElement).value).toBe('-0');
    const from = screen.getByRole('spinbutton', { name: 'Score from' });
    fireEvent.change(from, { target: { value: '3.10' } });
    expect((from as HTMLInputElement).value).toBe('3.10');
    await user.clear(from);
    await user.type(from, '-2.05');
    expect(from).toHaveValue(-2.05);
    expect(onChange).toHaveBeenLastCalledWith('score', [-2.05, null]);
  });

  it('empties number inputs when the filters are cleared from outside', () => {
    const props = { columns: COLUMNS, onFilterChange: () => {}, labels: DEFAULT_LABELS };
    const { rerender } = render(<FilterPanel {...props} filters={{ age: 5, score: [1, 2] }} />);
    expect(screen.getByRole('spinbutton', { name: 'Age' })).toHaveValue(5);
    expect(screen.getByRole('spinbutton', { name: 'Score to' })).toHaveValue(2);
    rerender(<FilterPanel {...props} filters={{}} />);
    expect(screen.getByRole('spinbutton', { name: 'Age' })).toHaveValue(null);
    expect(screen.getByRole('spinbutton', { name: 'Score from' })).toHaveValue(null);
    expect(screen.getByRole('spinbutton', { name: 'Score to' })).toHaveValue(null);
  });

  it('edits number and date ranges with two named inputs, keeping the other end', async () => {
    const { onChange, user } = setup({ seen: ['2024-01-01', null] });
    await user.type(screen.getByRole('spinbutton', { name: 'Score from' }), '5');
    expect(onChange).toHaveBeenLastCalledWith('score', [5, null]);
    await user.type(screen.getByRole('spinbutton', { name: 'Score to' }), '9');
    expect(onChange).toHaveBeenLastCalledWith('score', [5, 9]);
    expect(screen.getByLabelText('Seen from')).toHaveValue('2024-01-01');
    await user.type(screen.getByLabelText('Seen to'), '2024-12-31');
    expect(onChange).toHaveBeenLastCalledWith('seen', ['2024-01-01', '2024-12-31']);
  });

  it('picks a select value with an All choice and plain-text options', async () => {
    const { onChange, user } = setup({ state: 'tx' });
    const select = screen.getByRole('combobox', { name: 'State' });
    expect(select).toHaveValue('tx');
    expect(Array.from(select.querySelectorAll('option')).map((option) => option.textContent)).toEqual(['All', 'New York', 'tx']);
    await user.selectOptions(select, 'ny');
    expect(onChange).toHaveBeenLastCalledWith('state', 'ny');
    await user.selectOptions(select, '');
    expect(onChange).toHaveBeenLastCalledWith('state', '');
  });

  it('uses the package MultiSelect for multiselect filters', async () => {
    const { onChange, user } = setup({ tags: ['b'] });
    const button = screen.getByRole('button', { name: 'Tags Beta' });
    expect(screen.getByLabelText('Tags')).toBe(button);
    await user.click(button);
    await user.click(screen.getByRole('option', { name: 'Alpha' }));
    expect(onChange).toHaveBeenLastCalledWith('tags', ['b', 'a']);
    expect(screen.getByRole('listbox', { name: 'Tags' })).toBeInTheDocument();
  });

  it('toggles notEmpty with a checkbox', async () => {
    const { onChange, user } = setup();
    const box = screen.getByRole('checkbox', { name: /Email/ });
    expect(box).toHaveAccessibleName('Email Only non-empty');
    await user.click(box);
    expect(onChange).toHaveBeenLastCalledWith('email', true);
    await user.click(box);
    expect(onChange).toHaveBeenLastCalledWith('email', false);
  });

  it('shows empty widgets for values of the wrong shape', () => {
    setup({ name: 5 as unknown as string, age: ['x'], score: 3, tags: 'a', state: null });
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('5');
    expect(screen.getByRole('spinbutton', { name: 'Age' })).toHaveValue(null);
    expect(screen.getByRole('spinbutton', { name: 'Score from' })).toHaveValue(null);
    expect(screen.getByRole('button', { name: 'Tags All' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'State' })).toHaveValue('');
  });
});
