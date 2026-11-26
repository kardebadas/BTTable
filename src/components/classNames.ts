import type { Column } from '../core/types';

/** Joins the truthy class names with spaces. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}

/** Alignment class shared by header and body cells; none for the default `left`. */
export function alignClass(align: Column<unknown>['align']): string | undefined {
  if (align === 'center' || align === 'right') return `btt-align-${align}`;
  return undefined;
}
