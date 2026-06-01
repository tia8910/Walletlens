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
    // esnext: no transpilation overhead for modern browsers; terser handles minification
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
        // react-vendor changes rarely; recharts chart only; pages split by route.
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
          // i18n is 32KB of translation strings — isolating it means a translation
          // update only invalidates this chunk, not the whole app bundle.
          if (id.includes('/src/i18n.')) {
            return 'i18n'
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
    pure: ['console.log', 'console.debug', 'console.info', 'console.warn'],
    // Mangle private class members for smaller output
    legalComments: 'none',
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
})
