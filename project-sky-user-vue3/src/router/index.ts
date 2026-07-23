import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useUserStore } from '@/stores/user'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/home' },
  { path: '/login', name: 'login', component: () => import('@/views/Login.vue'), meta: { public: true } },
  { path: '/register', name: 'register', component: () => import('@/views/Register.vue'), meta: { public: true } },
  { path: '/home', name: 'home', component: () => import('@/views/Home.vue') },
  { path: '/menu', name: 'menu', component: () => import('@/views/Menu/Index.vue') },
  { path: '/change-password', name: 'change-password', component: () => import('@/views/ChangePassword.vue') }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫(前端第一道防线):
// - 非 public 页面且未登录 → 跳登录页,并记住原目标(redirect)
// - 已登录还想去登录/注册页 → 直接回首页
// 注意:这只是 UX 层拦截;真正的鉴权仍由后端 Spring Security 把守(带 Bearer 才放行)。
router.beforeEach((to) => {
  const userStore = useUserStore()
  if (!to.meta.public && !userStore.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.meta.public && userStore.isLoggedIn && (to.name === 'login' || to.name === 'register')) {
    return { path: '/home' }
  }
  return true
})

export default router
