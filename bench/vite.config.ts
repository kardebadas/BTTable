import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Bench page only (`npm run bench` builds it and serves the build on its own port). A
 * production React build, unminified so CPU profiles keep function names.
 */
export default defineConfig({
  plugins: [react()],
  build: { outDir: '../node_modules/.cache/bench-dist', emptyOutDir: true, minify: false },
});
