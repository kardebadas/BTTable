import { defineConfig } from 'vitest/config';

// Tests run in a fixed non-UTC zone so local-calendar-day logic is really exercised.
// Set before workers spawn so they inherit it; `test.env` repeats it inside each worker.
process.env.TZ = 'America/New_York';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    env: { TZ: 'America/New_York' },
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.css'],
      thresholds: { lines: 80 },
    },
  },
});
