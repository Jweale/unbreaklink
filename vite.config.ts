import { defineConfig } from 'vite';
import webExtension from '@samrum/vite-plugin-web-extension';
import manifest from './manifest.config';

export default defineConfig({
  plugins: [
    webExtension({
      manifest,
      additionalInputs: {
        html: ['options.html']
      }
    })
  ],
  build: {
    emptyOutDir: true,
    outDir: 'dist',
    rollupOptions: {
      output: {
        chunkFileNames: 'chunks/[name]-[hash].js',
        entryFileNames: 'entries/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
});
