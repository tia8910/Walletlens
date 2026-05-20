import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    // Target modern browsers — removes legacy polyfills and produces smaller,
    // faster output. All major browsers in 2024+ support ES2020 natively.
    target: 'es2020',
    // Suppress warnings for intentionally large chunks (xlsx, recharts).
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'charts':       ['recharts'],
          // xlsx (~500 KB uncompressed) is only used for spreadsheet export
          // so defer it to its own chunk that loads lazily on demand.
          'xlsx':         ['xlsx'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
})
