import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { visualizer } from 'rollup-plugin-visualizer'
import { execSync } from 'child_process'

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

// The entry stylesheet bundles CSS for every route (dashboard, blog,
// technicals, academy, ...) into one file, but Chrome DevTools coverage on
// the landing page shows only ~5% of it is actually used there — as a
// default render-blocking <link>, the browser must still fetch and parse
// the whole ~90 KB (gzip) file before First Contentful Paint, even though
// index.html already paints an inline, CSS-independent boot screen. This
// plugin rewrites the built stylesheet link(s) into the standard
// preload+swap pattern so CSS loads in parallel with the JS bundle instead
// of blocking paint, with a <noscript> fallback for non-JS clients.
function asyncCssPlugin() {
  return {
    name: 'async-css',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(
          /<link rel="stylesheet"([^>]*?)href="([^"]+\.css)"([^>]*)>/g,
          (_match, before, href, after) =>
            `<link rel="preload" as="style"${before}href="${href}"${after} onload="this.onload=null;this.rel='stylesheet'">` +
            `<noscript><link rel="stylesheet"${before}href="${href}"${after}></noscript>`
        )
      },
    },
  }
}

// Which build is this?
//
// Three rounds of diagnosis were spent not knowing whether the site running on
// a phone included the fix being discussed. The worker reports its own version
// on /health; the site could not, so "still the same error" was ambiguous
// between "the fix does not work" and "the fix is not there yet" — and those
// need opposite responses.
//
// The commit, or the build time if this is not a git checkout (a zip, a
// tarball). Read once at config time, never at runtime.
const BUILD_ID = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim()
  } catch {
    return `t${Math.floor(Date.now() / 1000).toString(36)}`
  }
})()


// Bundle the Pages functions into dist/_worker.js, so a zip deploy carries them.
//
// Cloudflare compiles functions/ only when the deploy runs through
// `wrangler pages deploy` from the project root. A direct upload of the built
// directory carries static assets and nothing else — every function is simply
// absent from that deployment, which is what /api/push/subscribe answering 405
// meant: no handler for the path, so Pages served it as a static asset and a
// static asset refuses a POST.
//
// _worker.js is the one server-side mechanism a direct upload does honour.
// _routes.json narrows it to /api/*, so everything else is served by the normal
// asset pipeline and _headers and _redirects keep applying — the CSP and the
// SPA fallback included.
function pagesWorkerPlugin() {
  return {
    name: 'pages-worker-bundle',
    apply: 'build',
    async closeBundle() {
      const { build } = await import('esbuild')
      const outfile = resolve(__dirname, 'dist/_worker.js')
      await build({
        entryPoints: [resolve(__dirname, 'scripts/pages-worker-entry.js')],
        outfile,
        bundle: true,
        format: 'esm',
        platform: 'neutral',
        target: 'es2022',
        mainFields: ['module', 'main'],
        conditions: ['worker', 'browser'],
        legalComments: 'none',
      })
      writeFileSync(
        resolve(__dirname, 'dist/_routes.json'),
        JSON.stringify({
          version: 1,
          // The dataset paths are here because the build still ships a static
          // file at each of them, and Pages would serve that frozen copy
          // rather than the live worker.
          include: [
            '/api/*',
            '/news.json', '/market.json', '/stocks.json',
            '/economy.json', '/economic-calendar.json', '/stock-prices.json',
            '/coins.json', '/smartmoney.json',
          ],
          exclude: [],
        }, null, 2) + '\n',
      )
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    swVersionPlugin(),
    pagesWorkerPlugin(),
    asyncCssPlugin(),
    // Bundle visualizer: run `ANALYZE=true npm run build` to generate dist/stats.html
    process.env.ANALYZE && visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
      template: 'treemap',
    }),
  ].filter(Boolean),
  define: {
    // Stamped in, not read from an env file, so it cannot be stale or absent.
    __WL_BUILD__: JSON.stringify(BUILD_ID),
  },
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
          // i18n: English translation strings (the only language bundled
          // eagerly — ar/fr/es are dynamically imported per-language by
          // src/i18n.js and chunked separately, automatically, without
          // needing an entry here). Isolated so a copy change only
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
