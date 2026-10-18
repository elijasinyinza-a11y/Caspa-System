import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained HTML file for review (Build Brief v1.1, section 3).
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { outDir: 'dist', assetsInlineLimit: 100_000_000 },
  test: { globals: true, environment: 'node', include: ['src/**/*.test.ts'] },
});
