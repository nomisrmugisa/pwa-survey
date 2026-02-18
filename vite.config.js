import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/pwa-survey/',
  server: {
    host: '0.0.0.0', // Expose to network
    port: 5173,
    strictPort: true, // Fail if port is busy
    allowedHosts: ['qimsdev.5am.co.bw', 'localhost', '127.0.0.1', '.5am.co.bw'],
    hmr: {
      clientPort: 443, // Force client to use standard HTTPS port for WSS
      // protocol: 'wss' // implicit with clientPort 443 usually, but let's leave default first
    },
    proxy: {
      '/pwa-survey/api': {
        target: 'https://qimsdev.5am.co.bw/qims',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/pwa-survey\/api/, '/api'), // Strip prefix
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('proxy error', err);
          });
        }
      },
      '/api': {
        target: 'https://qimsdev.5am.co.bw/qims',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
