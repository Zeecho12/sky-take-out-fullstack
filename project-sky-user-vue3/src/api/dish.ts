import request from '@/utils/request'
import type { Result } from '@/api/user'
import type { DishVO } from '@/types/business'

// 按分类查菜品(含 flavors 口味组) —— 契约 /user/dish/list
export function getDishList(categoryId: number) {
  return request.get<unknown, Result<DishVO[]>>('/user/dish/list', {
    params: { categoryId }
  })
}
