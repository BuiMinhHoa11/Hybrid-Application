import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Khi dev, dùng cùng backend Python với bản Docker:
//   /api       -> public-api
//   /exam-api  -> private-api
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.PUBLIC_API_URL ?? 'http://localhost:4100',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, '')
      },
      '/exam-api': {
        target: process.env.PRIVATE_API_URL ?? 'http://localhost:4101',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/exam-api/, '')
      }
    }
  }
});
