import { useState } from 'react';
import { formatMinuteKey, minuteKey } from '../core/dates';
import type { FilterSpec, FilterValue } from '../core/types';
import type { BTTableLabels } from '../labels';
import { MultiSelect, optionText } from './MultiSelect';
import { blurOnWheel } from './wheel';

/** Props of one filter widget. `id` goes on its first control, which the field label targets. */
export type FilterWidgetProps<S extends FilterSpec = FilterSpec> = {
  id: string;
  /** Id of the field label, for controls named by reference. */
  labelId: string;
  /** Plain-text field name, for controls that need their own accessible name. */
  name: string;
  spec: S;
  value: FilterValue;
  onChange: (value: FilterValue) => void;
  labels: BTTableLabels;
  /** Where the multi-select popover is portalled; default `document.body`. */
  portalContainer?: HTMLElement | null;
};

type SpecOf<T extends FilterSpec['type']> = Extract<FilterSpec, { type: T }>;

/** Input text of a scalar value; anything else (null, arrays, booleans) is empty. */
function scalarText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

/** Input text of a date-time: any value `minuteKey` reads, as its local `yyyy-mm-ddThh:mm` minute. */
function minuteText(value: unknown): string {
  const key = minuteKey(value);
  return key === null ? scalarText(value) : formatMinuteKey(key);
}

function parseNumber(text: string): number | null {
  return text === '' ? null : Number(text);
}

function parseDay(text: string): string | null {
  return text === '' ? null : text;
}

type Parse = (text: string) => number | string | null;

/** The native input type of each keyed filter. */
const INPUT_TYPE = { number: 'number', date: 'date', datetime: 'datetime-local' } as const;

type InputType = (typeof INPUT_TYPE)[keyof typeof INPUT_TYPE];

/** The input text of a stored value, per input type. */
const TO_TEXT: Record<InputType, (value: unknown) => string> = { number: scalarText, date: scalarText, 'datetime-local': minuteText };

type KeyInputProps = {
  id?: string;
  type: InputType;
  ariaLabel?: string;
  /** The stored filter value of this input. */
  value: unknown;
  parse: Parse;
  onCommit: (value: number | string | null) => void;
};

/**
 * A number, date or datetime-local input that keeps the text as typed (`1.0`, `-0.`), commits its parsed
 * value on each change, and takes the stored value again only when that differs from the
 * parsed text, as after an outside reset. A stored date-time shows as its local minute, so a
 * `Date`, a zoned or a seconds-precise string still fills the datetime-local input.
 */
function KeyInput({ id, type, ariaLabel, value, parse, onCommit }: KeyInputProps) {
  const stored = TO_TEXT[type](value);
  const [draft, setDraft] = useState(stored);
  // Compares parsed forms, so a stored value of the wrong shape settles after one resync;
  // `===` keeps "-0" (stored as -0, printed "0"), `Object.is` keeps NaN from looping.
  const typed = parse(draft);
  const kept = parse(stored);
  if (typed !== kept && !Object.is(typed, kept)) setDraft(stored);
  const change = (text: string) => {
    setDraft(text);
    onCommit(parse(text));
  };
  return (
    <input
      id={id}
      type={type}
      className="btt-filter-input"
      aria-label={ariaLabel}
      value={draft}
      onChange={(event) => change(event.target.value)}
      onWheel={type === 'number' ? blurOnWheel : undefined}
    />
  );
}

type RangeProps = FilterWidgetProps & { type: InputType; parse: Parse };

/** Two inputs for an inclusive `[from, to]` range; editing one end keeps the other. */
function RangeInputs({ id, name, value, onChange, labels, type, parse }: RangeProps) {
  const ends = (Array.isArray(value) ? value : [null, null]) as readonly (number | string | null)[];
  const setEnd = (index: 0 | 1, end: number | string | null) => {
    const next = [ends[0] ?? null, ends[1] ?? null];
    next[index] = end;
    onChange(next as FilterValue);
  };
  return (
    <span className="btt-filter-range">
      <KeyInput id={id} type={type} ariaLabel={`${name} ${labels.filterFrom}`} value={ends[0]} parse={parse} onCommit={(end) => setEnd(0, end)} />
      <KeyInput type={type} ariaLabel={`${name} ${labels.filterTo}`} value={ends[1]} parse={parse} onCommit={(end) => setEnd(1, end)} />
    </span>
  );
}

/** `number`, `date` and `datetime` filters: one native input, or two for `op: 'range'`. */
function KeyFilter(props: FilterWidgetProps<SpecOf<'number' | 'date' | 'datetime'>>) {
  const { id, spec, value, onChange } = props;
  const parse = spec.type === 'number' ? parseNumber : parseDay;
  const type = INPUT_TYPE[spec.type];
  if (spec.op === 'range') return <RangeInputs {...props} type={type} parse={parse} />;
  return <KeyInput id={id} type={type} value={value} parse={parse} onCommit={onChange} />;
}

function SelectFilter({ id, spec, value, onChange, labels }: FilterWidgetProps<SpecOf<'select'>>) {
  return (
    <select id={id} className="btt-filter-select" value={scalarText(value)} onChange={(event) => onChange(event.target.value)}>
      <option value="">{labels.filterAll}</option>
      {spec.options.map((option) => (
        <option key={option.value} value={option.value}>
          {optionText(option)}
        </option>
      ))}
    </select>
  );
}

function NotEmptyFilter({ id, value, onChange, labels }: FilterWidgetProps) {
  return (
    <label className="btt-filter-check">
      <input id={id} type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
      {labels.filterNotEmpty}
    </label>
  );
}

/** The native widget (or the package `MultiSelect`) for one column filter, controlled by `value`. */
export function FilterWidget(props: FilterWidgetProps) {
  const { id, spec, value, onChange } = props;
  switch (spec.type) {
    case 'text':
      return (
        <input
          id={id}
          type="text"
          className="btt-filter-input"
          placeholder={spec.placeholder}
          value={scalarText(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'number':
    case 'date':
    case 'datetime':
      return <KeyFilter {...props} spec={spec} />;
    case 'select':
      return <SelectFilter {...props} spec={spec} />;
    case 'multiselect': {
      const chosen = Array.isArray(value) ? (value as readonly string[]) : [];
      const { labelId, labels, portalContainer } = props;
      return <MultiSelect id={id} labelledBy={labelId} options={spec.options} value={chosen} onChange={onChange} labels={labels} portalContainer={portalContainer} />;
    }
    case 'notEmpty':
      return <NotEmptyFilter {...props} />;
  }
}
