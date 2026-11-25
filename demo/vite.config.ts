import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Demo app only (`npm run demo`); the library is built by tsup and never by Vite. */
export default defineConfig({
  plugins: [react()],
});
