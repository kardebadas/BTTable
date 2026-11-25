// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BTTable } from './BTTable';

type Row = { id: number; name: string };
const ROWS: Row[] = Array.from({ length: 500 }, (_, id) => ({ id, name: `Row ${id}` }));
const COLUMNS = [{ key: 'name', header: 'Name' }];

describe('server rendering', () => {
  it('renders a virtualized table without document or ResizeObserver: the first rows and a bottom spacer', () => {
    expect(typeof document).toBe('undefined');
    const html = renderToString(<BTTable columns={COLUMNS} rows={ROWS} pagination={false} />);
    expect(html.match(/class="btt-row /g)).toHaveLength(9);
    expect(html).toContain(`height:${(500 - 9) * 40}px`);
  });
});
