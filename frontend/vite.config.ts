import { fileURLToPath, URL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const srcDir = fileURLToPath(new URL('./src', import.meta.url));
const nodeModulesDir = fileURLToPath(new URL('./node_modules', import.meta.url));
const hasAgGridInstalled = fs.existsSync(path.join(nodeModulesDir, 'ag-grid-react'));

function agGridFallbackPlugin(): Plugin {
  return {
    name: 'ag-grid-fallback',
    enforce: 'pre',
    resolveId(id) {
      if (!hasAgGridInstalled) {
        if (id === 'ag-grid-react') {
          return path.join(srcDir, 'shims', 'ag-grid-react.tsx');
        }
        if (id === 'ag-grid-community') {
          return path.join(srcDir, 'shims', 'ag-grid-community.ts');
        }
        if (id.startsWith('ag-grid-community/styles/')) {
          return path.join(srcDir, 'shims', 'empty.css');
        }
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [agGridFallbackPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': srcDir,
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
