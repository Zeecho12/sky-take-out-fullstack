import request from '@/utils/request'
import type { Result } from '@/api/user'
import type { ShoppingCart, ShoppingCartDTO } from '@/types/business'

// 购物车全部走已有后端接口(需 USER token,由 request 拦截器自动带 Bearer)。
// 数量增减以服务端为准(ADR D4),写操作后由 store 重拉 list。

export function addCart(dto: ShoppingCartDTO) {
  return request.post<unknown, Result<string>>('/user/shoppingCart/add', dto)
}

export function subCart(dto: ShoppingCartDTO) {
  return request.post<unknown, Result<string>>('/user/shoppingCart/sub', dto)
}

export function listCart() {
  return request.get<unknown, Result<ShoppingCart[]>>('/user/shoppingCart/list')
}

export function cleanCart() {
  return request.delete<unknown, Result<string>>('/user/shoppingCart/clean')
}
