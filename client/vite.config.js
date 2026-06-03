import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Absolute base — the app is served from the domain root. Relative './'
  // breaks asset URLs on hard-loads of nested routes (e.g. /blog/<slug>) and
  // on the prerendered content pages.
  base: '/',
  build: {
    outDir: 'dist',
    // esnext: no transpilation overhead for modern browsers
    target: 'esnext',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 600,
    reportCompressedSize: true,
    // Skip modulepreload polyfill — all target browsers support native modulepreload
    modulePreload: { polyfill: false },
    // Inline assets smaller than 4 KB as data URIs (fewer round-trips)
    assetsInlineLimit: 4096,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // Granular vendor splitting: each chunk is individually cacheable.
        // react-vendor changes rarely; charts only on chart pages; pages by route.
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-router-dom') || id.includes('node_modules/react-router/')) {
            return 'react-vendor'
          }
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-') || id.includes('node_modules/victory-vendor') || id.includes('node_modules/d3shape') || id.includes('node_modules/d3array')) {
            return 'charts'
          }
          if (id.includes('node_modules/xlsx')) {
            return 'xlsx'
          }
          // i18n: 32 KB of translation strings — isolated so a copy change only
          // invalidates this chunk, not the whole app.
          if (id.includes('/src/i18n.')) {
            return 'i18n'
          }
          // blogPosts: 136 KB of inline article content — split so Blog page
          // JS stays lean and a content-only update re-downloads only this chunk.
          if (id.includes('/src/data/blogPosts')) {
            return 'blog-data'
          }
          // Static lookup tables (asset categories, sector colours, ticker lists)
          // that rarely change but are imported by Dashboard.  Caching them
          // separately means a Dashboard JS update doesn't bust these.
          if (id.includes('/src/data/assets') || id.includes('/src/data/trackCoins')) {
            return 'asset-data'
          }
        },
      },
      // Suppress false-positive circular-dependency warnings from recharts internals
      onwarn(warning, warn) {
        if (warning.code === 'CIRCULAR_DEPENDENCY') return
        warn(warning)
      },
    },
  },
  esbuild: {
    drop: ['debugger'],
    // Strip all console calls in production — saves ~2–5 KB and prevents
    // accidental data leakage via logged portfolio values.
    pure: ['console.log', 'console.debug', 'console.info', 'console.warn', 'console.error', 'console.table', 'console.time', 'console.timeEnd'],
    legalComments: 'none',
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
})
