// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const theme = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
const table = readFileSync(new URL('./table.css', import.meta.url), 'utf8');
const TONES = ['danger', 'warning', 'success', 'info'];

/** The theme blocks: light, dark by media query, forced dark. */
const blocks = theme.split(/\n(?=:where|@media)/).filter((block) => block.includes('--btt-bg'));

/** Relative luminance of a #rrggbb colour (WCAG 2). */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `color-mix(in srgb, a share%, b)` of two #rrggbb colours (gamma-encoded channels, as srgb mixing does). */
function mix(a: string, share: number, b: string): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  const mixed = [1, 3, 5].map((i) => Math.round(channel(a, i) * share + channel(b, i) * (1 - share)));
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

const variable = (block: string, name: string) => block.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6});`))?.[1] ?? '';

describe('row tone theme', () => {
  it('defines every tone in the light and both dark blocks with AA text contrast', () => {
    expect(blocks).toHaveLength(3);
    for (const block of blocks) {
      for (const tone of TONES) {
        const bg = variable(block, `--btt-tone-${tone}-bg`);
        const fg = variable(block, `--btt-tone-${tone}-fg`);
        expect(contrast(bg, fg), `${tone}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps AA text contrast on the selected-row tint, which replaces the tone background', () => {
    expect(table).toContain('background-color: color-mix(in srgb, var(--btt-accent) 16%, var(--btt-bg));');
    for (const block of blocks) {
      const selected = mix(variable(block, '--btt-accent'), 0.16, variable(block, '--btt-bg'));
      for (const tone of TONES) {
        const fg = variable(block, `--btt-tone-${tone}-fg`);
        expect(contrast(selected, fg), `${tone}: ${fg} on ${selected}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('styles each tone class with zero specificity, before the selection tint', () => {
    for (const tone of TONES) expect(table).toContain(`:where(.btt-row--tone-${tone}) {`);
    expect(table.indexOf('btt-row--tone-')).toBeGreaterThan(table.indexOf(':where(.btt-row:hover)'));
    expect(table.indexOf('btt-row--tone-')).toBeLessThan(table.indexOf('.btt-select:checked'));
  });
});
