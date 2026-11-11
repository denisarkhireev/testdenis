import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  // shared экспортирует .ts-исходники, поэтому вшиваем его в бандл.
  noExternal: ['@domino/shared'],
});
