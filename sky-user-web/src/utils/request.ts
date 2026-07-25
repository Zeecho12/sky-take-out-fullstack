import axios from 'axios'
import { useUserStore } from '@/stores/user'
import router from '@/router'

// baseURL='/api' → 命中 vite.config 的 dev 代理 → 转发到后端 :8080(rewrite 剥掉 /api)
const service = axios.create({
  baseURL: '/api',
  timeout: 10000
})

// 请求拦截器:统一注入认证头 Authorization: Bearer <token>
// (后端 Spring Security 的 JwtAuthenticationFilter 只认这个头)
service.interceptors.request.use((config) => {
  const userStore = useUserStore()
  if (userStore.token) {
    config.headers['Authorization'] = 'Bearer ' + userStore.token
  }
  return config
})

// 响应拦截器:
// - 成功:直接返回后端的 Result 结构体 { code, data, msg }
// - 401(未登录 / token 失效):清登录态并跳登录页
service.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response && error.response.status === 401) {
      const userStore = useUserStore()
      userStore.logout()
      if (router.currentRoute.value.name !== 'login') {
        router.push('/login')
      }
    }
    return Promise.reject(error)
  }
)

export default service
