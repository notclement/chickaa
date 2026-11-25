import { execSync } from 'node:child_process';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

const BRAND = { theme: '#FF7A3D', background: '#FFF7EC' };

function gitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(`${pkg.version}+${(process.env.APP_VERSION || gitSha()).slice(0, 7)}`),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Our own service worker (src/pwa/sw.ts) so we control updates exactly.
      strategies: 'injectManifest',
      srcDir: 'src/pwa',
      filename: 'sw.ts',
      // 'prompt': a new version waits until the user taps "Refresh" (ARCHITECTURE.md §3.4).
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,ico,webmanifest}'],
        // iOS launch images are fetched by iOS itself at install time; no need to precache ~16 big PNGs.
        globIgnores: ['splash/**'],
      },
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'NoChickenCall (别计较)',
        short_name: 'NoChickenCall',
        description: "Travel together. Don't sweat the split.",
        lang: 'en',
        start_url: '/?source=pwa',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone'],
        orientation: 'portrait',
        theme_color: BRAND.theme,
        background_color: BRAND.background,
        categories: ['finance', 'travel', 'utilities'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8080' },
  },
  build: { sourcemap: true, target: 'es2022' },
});
