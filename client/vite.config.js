import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
