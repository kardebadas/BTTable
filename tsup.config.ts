import { readFile, writeFile } from 'node:fs/promises';
import { defineConfig } from 'tsup';

/** The stylesheet parts, concatenated in this order into the one published dist/styles.css. */
const STYLE_PARTS = ['theme', 'table', 'controls'];

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  async onSuccess() {
    const parts = await Promise.all(STYLE_PARTS.map((name) => readFile(`src/styles/${name}.css`, 'utf8')));
    await writeFile('dist/styles.css', parts.join('\n'));
  },
});
