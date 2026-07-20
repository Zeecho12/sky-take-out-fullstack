import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// C 端与后端同源之道:浏览器只跟 :5173 说话,/api 前缀经 dev 代理转发到 :8080,
// rewrite 剥掉 /api,从而绕开 CORS(与 admin 端 vue.config.js 的 /api 代理同款思路)。
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})
