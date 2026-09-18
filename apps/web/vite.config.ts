import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Verovio's module embeds its WebAssembly; keep it out of dependency pre-bundling.
  optimizeDeps: { exclude: ['verovio'] },
  build: { chunkSizeWarningLimit: 9000 },
});
