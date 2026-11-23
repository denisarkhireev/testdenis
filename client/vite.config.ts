import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    // spec-10 S1: звуки — отдельными хешированными файлами в assets/, не data-URL.
    assetsInlineLimit: (file) => (file.endsWith('.mp3') ? false : undefined),
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
});
