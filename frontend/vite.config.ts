import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const srcDir = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': srcDir,
      'ag-grid-react': path.join(srcDir, 'shims', 'ag-grid-react.tsx'),
      'ag-grid-community': path.join(srcDir, 'shims', 'ag-grid-community.ts'),
      'ag-grid-community/styles/ag-grid.css': path.join(srcDir, 'shims', 'empty.css'),
      'ag-grid-community/styles/ag-theme-quartz.css': path.join(srcDir, 'shims', 'empty.css'),
    },
  },
  build: {
    target: 'esnext',
    cssCodeSplit: true,
    minify: 'esbuild',
    reportCompressedSize: false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react/') || id.includes('react-dom/')) {
              return 'vendor-react';
            }
            if (id.includes('motion/')) {
              return 'vendor-motion';
            }
            if (id.includes('lucide-react/')) {
              return 'vendor-icons';
            }
          }
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
