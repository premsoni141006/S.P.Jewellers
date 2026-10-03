import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@shared': resolve(__dirname, '../shared/src') } },
  server: { fs: { allow: ['..'] } },
  build: { outDir: 'dist', sourcemap: false },
});
