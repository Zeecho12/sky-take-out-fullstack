import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useUserStore } from '@/stores/user'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/menu' },
  { path: '/login', name: 'login', component: () => import('@/views/Login.vue'), meta: { public: true } },
  { path: '/register', name: 'register', component: () => import('@/views/Register.vue'), meta: { public: true } },
  { path: '/home', name: 'home', component: () => import('@/views/Home.vue') },
  { path: '/menu', name: 'menu', component: () => import('@/views/Menu/Index.vue') },
  { path: '/change-password', name: 'change-password', component: () => import('@/views/ChangePassword.vue') },
  // 地址簿 + 下单(0003):均非 public,故受 beforeEach 登录门槛保护(需登录)
  { path: '/address', name: 'address', component: () => import('@/views/Address/List.vue') },
  { path: '/address/edit', name: 'address-edit', component: () => import('@/views/Address/Edit.vue') },
  { path: '/order-confirm', name: 'order-confirm', component: () => import('@/views/Order/Confirm.vue') },
  // 支付页(0004):非 public,受登录门槛保护
  { path: '/order-pay', name: 'order-pay', component: () => import('@/views/Order/Pay.vue') },
  { path: '/order-created', name: 'order-created', component: () => import('@/views/Order/Created.vue') },
  // 历史订单 / 订单详情 / 用户中心(0005):均非 public,受登录门槛保护
  { path: '/order-list', name: 'order-list', component: () => import('@/views/Order/List.vue') },
  { path: '/order-detail/:id', name: 'order-detail', component: () => import('@/views/Order/Detail.vue') },
  { path: '/user', name: 'user-center', component: () => import('@/views/User/Center.vue') }
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
    return { path: '/menu' }
  }
  return true
})

export default router
