import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In production Tauri builds, TAURI_ENV_PLATFORM is set by the CLI.
// Relative /api/* calls won't proxy, so point directly at Express :3001.
const apiBase = process.env.TAURI_ENV_PLATFORM ? 'http://localhost:3001' : '';

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_API_BASE': JSON.stringify(apiBase),
  },
  // Tauri: don't obscure Rust errors
  clearScreen: false,
  server: {
    port: 5173,
    // Tauri expects a fixed port
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    // Tauri supports es2021
    target: ['es2021', 'chrome105', 'safari15'],
    // don't minify for debug builds
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    // produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
