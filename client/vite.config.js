import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { visualizer } from 'rollup-plugin-visualizer'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Auto-stamp the service worker with a unique build version on every production
// build. This guarantees cache busting without relying on a manually incremented
// version string that is easy to forget.
function swVersionPlugin() {
  return {
    name: 'sw-version-stamp',
    apply: 'build',
    closeBundle() {
      const swPath = resolve(__dirname, 'dist/sw.js')
      try {
        let sw = readFileSync(swPath, 'utf8')
        // Encode build time as a base-36 string: compact yet collision-free across builds.
        const version = `v${Math.floor(Date.now() / 1000).toString(36)}`
        sw = sw.replace(/const SW_VERSION = '[^']*'/, `const SW_VERSION = '${version}'`)
        writeFileSync(swPath, sw)
      } catch { /* sw.js not present (e.g. non-PWA builds) — silently skip */ }
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    swVersionPlugin(),
    // Bundle visualizer: run `ANALYZE=true npm run build` to generate dist/stats.html
    process.env.ANALYZE && visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
      template: 'treemap',
    }),
  ].filter(Boolean),
  // Absolute base — the app is served from the domain root. Relative './'
  // breaks asset URLs on hard-loads of nested routes (e.g. /blog/<slug>) and
  // on the prerendered content pages.
  base: '/',
  build: {
    outDir: 'dist',
    // esnext: no transpilation overhead for modern browsers
    target: 'esnext',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 400,
    reportCompressedSize: process.env.CI === 'true',
    // Skip modulepreload polyfill — all target browsers support native modulepreload
    modulePreload: { polyfill: false },
    // Don't emit source maps in production — halves the output directory size.
    sourcemap: false,
    // Inline assets smaller than 8 KB as data URIs — covers most small SVG icons
    // and avoids extra round-trips for them without meaningfully inflating chunks.
    assetsInlineLimit: 8192,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // Removes all unnecessary whitespace/newlines from minified output on
        // top of esbuild's identifier shortening — saves ~1-3 KB per chunk.
        compact: true,
        // Use const bindings instead of var in generated chunk glue code —
        // gives engines better static analysis and lets minifiers inline more.
        generatedCode: { constBindings: true },
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
          // QR libraries: only loaded when the user opens the backup/scan panel.
          // Splitting them ensures Dashboard's main chunk doesn't carry their weight.
          if (id.includes('node_modules/jsqr') || id.includes('node_modules/qrcode')) {
            return 'qr-libs'
          }
          // api.js is the 100 KB central API client imported by virtually every
          // page. Isolating it means a page-code change doesn't bust this chunk —
          // returning users keep it from cache across deployments.
          if (id.includes('/src/api.')) {
            return 'api-core'
          }
          // Technical-analysis utilities (~32 KB combined) are only consumed by the
          // Technicals page and the MagicAnalysisPanel. Splitting them out keeps
          // api-core lean and lets algorithm changes bust only this chunk.
          if (id.includes('/src/technicals.') || id.includes('/src/magicIndicator.')) {
            return 'technicals-utils'
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
          // Glossary (42 KB) — only used by Learn page; isolated so a term
          // edit doesn't bust the Learn chunk or appear in any other bundle.
          if (id.includes('/src/data/glossary')) {
            return 'glossary-data'
          }
          // Comparisons (14 KB) — only used by Compare page.
          if (id.includes('/src/data/comparisons')) {
            return 'comparisons-data'
          }
          // Arabic blog posts (46 KB) — isolated from the English blog-data
          // chunk so an Arabic content edit only invalidates this chunk.
          if (id.includes('/src/data/arabicBlog')) {
            return 'arabic-blog-data'
          }
          // Technical analysis engine (RSI, MACD, Bollinger Bands, ATR) and the
          // Magic Indicator composite signal. Both are heavy computation modules
          // only needed on the Technicals/Alpha pages — keeping them out of the
          // main bundle means Dashboard loads without carrying their weight.
          if (id.includes('/src/technicals') || id.includes('/src/magicIndicator') || id.includes('/src/magicAi')) {
            return 'technicals'
          }
        },
      },
      // Suppress false-positive circular-dependency warnings from recharts internals
      onwarn(warning, warn) {
        if (warning.code === 'CIRCULAR_DEPENDENCY') return
        warn(warning)
      },
      // Stricter tree-shaking: removes more dead code by trusting that
      // modules without a `sideEffects: false` in their package.json are
      // actually side-effect-free (esbuild's minifier can't cross module
      // boundaries, but Rollup's tree-shaker can).
      treeshake: { preset: 'recommended' },
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
