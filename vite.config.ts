import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  build: {
    rollupOptions: {
      input: {
        main:     path.resolve(__dirname, 'index.html'),
        settings: path.resolve(__dirname, 'settings.html'),
        launcher: path.resolve(__dirname, 'launcher.html'),
        qr:       path.resolve(__dirname, 'qr.html'),
      },
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
  },
});
