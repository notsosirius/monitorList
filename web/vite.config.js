import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Vite 配置：前端开发时将 /api 代理到后端服务
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3838',
        changeOrigin: true
      }
    }
  }
})
