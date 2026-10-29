import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'fonts/BIZUDGothic-Regular.ttf', 'fonts/BIZUDGothic-Bold.ttf'],
      manifest: {
        name: 'ココカキ - 精算書・日報入力アプリ',
        short_name: 'ココカキ',
        description: 'バス乗務員向け 精算書・日報 入力PWA',
        theme_color: '#1e3a8a',
        background_color: '#f3f4f6',
        display: 'standalone',
        lang: 'ja',
        start_url: '/',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,ttf,wasm}'],
      },
    }),
  ],
});
