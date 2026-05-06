import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  server: {
    port: 5173,
    open: true,       // auto opens browser
    proxy: {
      // All /api calls → backend at 3001
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/health': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})
