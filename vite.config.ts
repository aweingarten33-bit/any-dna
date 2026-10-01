import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss({ optimize: false })],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') }, dedupe: ['react', 'react-dom'] },
  build: { outDir: 'dist', emptyOutDir: true },
  // In development the API runs separately (npm run api:dev or api:demo).
  server: { host: '0.0.0.0', proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 8000}` } },
  preview: { host: '0.0.0.0' },
});
