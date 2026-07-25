import { defineStore } from 'pinia'

const TOKEN_KEY = 'sky_user_token'
const USER_KEY = 'sky_user_info'

export interface UserInfo {
  id: number
  username: string
}

// 认证状态集中在此:token + 用户信息,并持久化到 localStorage,
// 刷新页面后仍保持登录态(与"无状态 JWT、前端存 token"的方案一致)。
export const useUserStore = defineStore('user', {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY) || '',
    user: JSON.parse(localStorage.getItem(USER_KEY) || 'null') as UserInfo | null
  }),
  getters: {
    isLoggedIn: (state): boolean => !!state.token
  },
  actions: {
    setAuth(data: { id: number; username: string; token: string }) {
      this.token = data.token
      this.user = { id: data.id, username: data.username }
      localStorage.setItem(TOKEN_KEY, data.token)
      localStorage.setItem(USER_KEY, JSON.stringify(this.user))
    },
    // 登出 = 前端丢弃 token(无状态 JWT,后端不持有会话)
    logout() {
      this.token = ''
      this.user = null
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    }
  }
})
