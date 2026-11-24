import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development the browser only ever talks to Vite (http://localhost:5173).
// Vite forwards API calls and the WebSocket to the Express server, so the app is
// "same-origin": no CORS setup, and the httpOnly login cookie just works.
const BACKEND = process.env.VITE_PROXY_TARGET || 'http://localhost:3000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
      '/socket.io': { target: BACKEND, ws: true, changeOrigin: true },
    },
  },
})
