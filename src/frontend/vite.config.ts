import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        proxyReq: (proxyReq, req) => {
          // 禁用压缩以支持 SSE 流式传输
          proxyReq.removeHeader('accept-encoding');
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@chartdb': path.resolve(__dirname, 'src/chartdb'),
    },
  },
  optimizeDeps: {
    include: ['@xyflow/react', '@monaco-editor/react'],
    exclude: [],
  },
});