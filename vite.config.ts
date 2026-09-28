import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  // game art/audio live under /assets, so the build's own files go to /static
  build: { outDir: 'dist', assetsDir: 'static', sourcemap: true, chunkSizeWarningLimit: 1200 },
  server: { proxy: { '/api': 'http://localhost:8080', '/ws': { target: 'ws://localhost:8080', ws: true }, '/assets': 'http://localhost:8080' } },
});
