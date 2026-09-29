import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 开发态走 Vite 独立端口，接口代理到后端 3000；
 * 生产态由后端静态托管 dist，同端口提供，无需代理。
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          // 编辑器分块暂缓：EditorPage 启用 @codemirror/* 时再单独拆分
          markdown: ['markdown-it', 'highlight.js', 'dompurify'],
        },
      },
    },
  },
});
