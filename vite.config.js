import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

const FELT_GREEN = '#008000'

export default defineConfig({
  // Relative asset URLs let a build be served from a subdirectory as happily as from a root.
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'SOL.EXE',
        short_name: 'Solitaire',
        description: 'Klondike solitaire, the way Windows played it.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: FELT_GREEN,
        theme_color: FELT_GREEN,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '520x520',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Every card face and back is precached, which is what makes the game fully playable
        // with no network after the first visit.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
})
