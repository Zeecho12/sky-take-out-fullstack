import request from '@/utils/request'
import type { Result } from '@/api/user'
import type { Category } from '@/types/business'

// 分类列表(type 可选:1 菜品分类 / 2 套餐分类;不传返回全部) —— 契约 /user/category/list
export function getCategoryList(type?: number) {
  return request.get<unknown, Result<Category[]>>('/user/category/list', {
    params: type != null ? { type } : {}
  })
}
