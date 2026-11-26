import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { buildExportData, headerText, toCsv } from './export';
import type { Column } from './types';

type Row = Record<string, unknown>;

describe('headerText', () => {
  it('uses headerText, then a string header, then the key (#40)', () => {
    expect(headerText({ key: 'a', header: 'Alpha', headerText: 'Export A' })).toBe('Export A');
    expect(headerText({ key: 'a', header: 'Alpha' })).toBe('Alpha');
    expect(headerText({ key: 'a', header: createElement('b', null, 'Alpha') })).toBe('a');
  });
});

describe('buildExportData', () => {
  it('converts every value safely, invalid dates and React nodes included (#40)', () => {
    const local = new Date(2026, 0, 5, 9, 30);
    const columns: Column<Row>[] = [
      { key: 'name', header: 'Name' },
      { key: 'n', header: 'N' },
      { key: 'flag', header: 'Flag' },
      { key: 'day', header: 'Day' },
      { key: 'at', header: 'At' },
      { key: 'tags', header: 'Tags' },
      { key: 'node', header: createElement('i', null, 'x') },
      { key: 'bad', header: 'Bad', exportValue: () => new Date('nope') },
      { key: 'nan', header: 'NaN' },
    ];
    const rows: Row[] = [
      {
        name: 'Ann',
        n: 0,
        flag: false,
        day: new Date(2026, 0, 5),
        at: local,
        tags: ['a', 'b'],
        node: createElement('span', null, 'Hi ', createElement('b', null, 'there')),
        nan: Number.NaN,
      },
      { name: null },
    ];
    expect(buildExportData(columns, rows)).toEqual({
      headers: ['Name', 'N', 'Flag', 'Day', 'At', 'Tags', 'node', 'Bad', 'NaN'],
      rows: [
        ['Ann', 0, 'No', '2026-01-05', local.toISOString(), 'a, b', 'Hi there', '', ''],
        ['', '', '', '', '', '', '', '', ''],
      ],
    });
  });

  it('prefers exportValue over value', () => {
    const columns: Column<Row>[] = [{ key: 'v', header: 'V', value: () => 'value', exportValue: () => 7 }];
    expect(buildExportData(columns, [{}]).rows).toEqual([[7]]);
  });
});

describe('toCsv', () => {
  it('quotes every field, doubles quotes and joins records with CRLF', () => {
    const csv = toCsv({ headers: ['Name', 'Note'], rows: [['Ann', 'said "hi", left'], ['Bo', 'line\nbreak']] });
    expect(csv).toBe('"Name","Note"\r\n"Ann","said ""hi"", left"\r\n"Bo","line\nbreak"');
  });

  it('neutralises formula prefixes in text cells and headers (#40)', () => {
    const cells = ['=SUM(A1)', '+1', '-2', '@cmd', '\tx', '\rx', 'safe'];
    const csv = toCsv({ headers: ['=H'], rows: [cells] });
    expect(csv).toBe(`"'=H"\r\n"'=SUM(A1)","'+1","'-2","'@cmd","'\tx","'\rx","safe"`);
  });

  it('writes numbers as numbers, even negative ones', () => {
    expect(toCsv({ headers: ['N'], rows: [[-5], [0], [null]] })).toBe('"N"\r\n"-5"\r\n"0"\r\n""');
  });

  it('round-trips buildExportData', () => {
    const columns: Column<Row>[] = [{ key: 'a', header: 'A' }];
    expect(toCsv(buildExportData(columns, [{ a: 1 }, { a: 'x' }]))).toBe('"A"\r\n"1"\r\n"x"');
  });
});
