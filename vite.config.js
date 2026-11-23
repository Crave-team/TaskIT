import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The data layer picks its implementation with a top-level `await import()`.
  build: { target: 'es2022' },
  esbuild: { target: 'es2022' },
  server: {
    // `npm run dev` with VITE_API_URL=/api: forward API calls (and uploaded-file downloads) to the Express server.
    proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false } },
  },
})
