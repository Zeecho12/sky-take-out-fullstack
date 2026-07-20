import request from '@/utils/request'

// 后端统一返回结构 Result;code === 1 表示成功
export interface Result<T = unknown> {
  code: number
  data: T
  msg: string | null
}

export interface AuthData {
  id: number
  username: string
  token: string
}

// 注册:成功直接签发 JWT(免去再登录一步) —— 契约 /user/user/register
export function registerApi(username: string, password: string) {
  return request.post<unknown, Result<AuthData>>('/user/user/register', { username, password })
}

// 登录 —— 契约 /user/user/login
export function loginApi(username: string, password: string) {
  return request.post<unknown, Result<AuthData>>('/user/user/login', { username, password })
}

// 修改密码(需登录态,带 Bearer) —— 契约 /user/user/password
export function changePasswordApi(oldPassword: string, newPassword: string) {
  return request.put<unknown, Result<null>>('/user/user/password', { oldPassword, newPassword })
}

// 登出(无状态:后端仅返回成功,前端丢 token) —— 契约 /user/user/logout
export function logoutApi() {
  return request.post<unknown, Result<null>>('/user/user/logout')
}

// 受保护端点样例:拉当前用户地址簿,用于在首页证明 Bearer token 真的生效
// —— 契约 /user/addressBook/list(需 USER token)
export function addressListApi() {
  return request.get<unknown, Result<unknown[]>>('/user/addressBook/list')
}
