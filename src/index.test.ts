import { describe, expect, it } from 'vitest';
import { VERSION } from './index';

describe('package entry', () => {
  it('exports the package version', () => {
    expect(VERSION).toBe('0.1.0');
  });

  it('runs in jsdom with jest-dom matchers', () => {
    document.body.innerHTML = '<div class="btt">table</div>';
    expect(document.querySelector('.btt')).toBeInTheDocument();
  });
});
