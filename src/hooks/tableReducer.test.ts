import { describe, expect, it } from 'vitest';
import { mergeChanges, NO_PROPOSALS, type TableState } from './tableReducer';

const STATE: TableState = { searchInput: '', search: '', filters: {}, sort: null, page: 1, pageSize: 10, resets: 0, clears: 0, proposals: NO_PROPOSALS };

describe('mergeChanges', () => {
  it('takes only the fields that changed between from and to', () => {
    const own = { ...STATE, page: 4, sort: { key: 'a', direction: 'asc' as const } };
    const next = mergeChanges(own, { from: STATE, to: { ...STATE, page: 2 } });
    expect(next).toEqual({ ...own, page: 2 });
  });

  it('keeps the same state object when nothing changed', () => {
    expect(mergeChanges(STATE, { from: STATE, to: { ...STATE } })).toBe(STATE);
  });
});
