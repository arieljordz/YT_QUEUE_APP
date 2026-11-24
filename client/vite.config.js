import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Makes the app installable (manifest + icons) and lets it open offline: a
    // service worker keeps the app itself, and the video thumbnails, in the
    // browser. The library lives in localStorage, so it is there offline too.
    // Nothing from /api is ever cached.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/logo-v2.svg', 'icons/favicon-32-v2.png', 'icons/apple-touch-icon-v2.png'],
      manifest: {
        name: 'YouTube Queueing App',
        short_name: 'YT Queue',
        description: 'Queue YouTube videos and songs, search while they play, and share the queue with friends.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#141414',
        theme_color: '#141414',
        icons: [
          { src: '/icons/icon-192-v2.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512-v2.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512-v2.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,jpg,webmanifest}'],
        // Pages like /player are the same single-page app; the API is never a page.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Video thumbnails, so the Library still has pictures offline.
            urlPattern: ({ url }) => url.hostname.endsWith('ytimg.com'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'video-thumbnails',
              expiration: { maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
