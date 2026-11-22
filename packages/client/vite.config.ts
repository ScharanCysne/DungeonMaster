import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  envDir: false,
  plugins: [react(), tailwindcss()],
  server: {
    fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] },
    proxy: {
      '/ws': { target: 'ws://127.0.0.1:8787', ws: true },
      '/healthz': { target: 'http://127.0.0.1:8787' },
    },
  },
});
