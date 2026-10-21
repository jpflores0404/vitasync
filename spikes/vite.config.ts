import path from 'node:path'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const root = import.meta.dirname

// Separate Vite app for the Phase 0 spikes. Production build is an installable
// PWA so offline behaviour can be tested with `pnpm spike:preview`.
export default defineConfig({
  root,
  resolve: { alias: { '@': path.resolve(root, '../src') } },
  build: {
    outDir: path.resolve(root, '../dist-spikes'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(root, 'index.html'),
        asr: path.resolve(root, 'asr/index.html'),
        ocr: path.resolve(root, 'ocr/index.html'),
        pwa: path.resolve(root, 'pwa/index.html'),
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      manifest: {
        name: 'VitaSync Spikes',
        short_name: 'VS Spikes',
        start_url: '/',
        display: 'standalone',
        background_color: '#fafafa',
        theme_color: '#187860',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,wasm,png,svg,webmanifest}'],
        // Speech models are stored by Vosk itself in IndexedDB after the first
        // download; Tesseract assets are cached at runtime on first use.
        globIgnores: ['models/**', 'tesseract/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/tesseract/'),
            handler: 'CacheFirst',
            options: { cacheName: 'tesseract-assets' },
          },
        ],
      },
    }),
  ],
})
