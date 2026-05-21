import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
    cssCodeSplit: true,
    // Warn when any single chunk exceeds 600 KB (gzipped threshold is ~200 KB)
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'charts':       ['recharts'],
          // xlsx is dynamically imported inside SmartImport so Rollup
          // will emit it as a lazy chunk automatically — no entry needed here.
        },
      },
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
})
