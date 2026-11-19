import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    VitePWA({
      // Registered from src/main.tsx (virtual:pwa-register): a new version activates at once and the
      // page reloads, so old lazy chunks are never requested from a cleaned-up cache.
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'NewAnki',
        short_name: 'NewAnki',
        description: 'Aralıklı tekrar ile her şeyi kalıcı öğren.',
        lang: 'tr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#07091a',
        background_color: '#07091a',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: '/index.html',
        skipWaiting: true,
        clientsClaim: true,
        navigateFallbackDenylist: [/^\/api\//, /^\/healthz/],
        // API JSON always goes to the network; the app keeps its own offline copy in IndexedDB.
        // Media is immutable per uid, so it is served cache-first (warmed by offline/sync.ts prefetchMedia).
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/v1/media/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'na-media',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 86_400 },
              cacheableResponse: { statuses: [200] },
              rangeRequests: true,
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8080' },
  },
  build: {
    target: 'es2022',
  },
})
