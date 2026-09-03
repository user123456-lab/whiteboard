import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 后端端口：dev server 代理 /ws、/api 的 target，默认 8000。
// 注意：process.env 只能读「系统环境变量」；Vite 的 .env 文件注入到 import.meta.env
// （frontend/.env 的 VITE_BACKEND_PORT 由 websocket.ts 经 import.meta.env 使用），
// 不会进入 process.env。改端口时需同时改 backend/.env 的 PORT 与 frontend/.env 的 VITE_BACKEND_PORT。
const backendPort = process.env.VITE_BACKEND_PORT || '8000';

export default defineConfig({
  plugins: [react()],
  base: '/',
  // 构建产物直接输出到 nginx 静态目录（tools/nginx/html），生产模式无需拷贝步骤
  build: {
    outDir: '../tools/nginx/html',
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    // 前端开发服务器端口 — 如需修改请同步调整 backend/.env 的 FRONTEND_PORT 显示值
    port: 3000,
    proxy: {
      '/ws': {
        target: `ws://localhost:${backendPort}`,
        ws: true,
      },
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      },
    },
  },
});
