import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/pwa-survey/',
  server: {
    host: '0.0.0.0', // Expose to network
    port: 5173,
    allowedHosts: ['qimsdev.5am.co.bw', 'localhost', '127.0.0.1', '.5am.co.bw'], // Allow specific hosts
    proxy: {
      '/api': {
        target: 'https://qimsdev.5am.co.bw/qims',
        changeOrigin: true,
        secure: false,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            // console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      }
    }
  }
})
