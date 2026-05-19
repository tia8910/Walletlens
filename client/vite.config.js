import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    // Target modern browsers — removes ~10 KB of legacy polyfills
    target: 'es2020',
    // Suppress warnings for intentionally large chunks (recharts ~200 KB)
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'charts': ['recharts'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
})
