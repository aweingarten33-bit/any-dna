import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss({ optimize: false })],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') }, dedupe: ['react', 'react-dom'] },
  build: { outDir: 'dist', emptyOutDir: true },
  server: { host: '0.0.0.0' },
  preview: { host: '0.0.0.0' },
});
