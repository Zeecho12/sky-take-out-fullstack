import request from '@/utils/request'
import type { Result } from '@/api/user'
import type { Setmeal, DishItemVO } from '@/types/business'

// 按分类查套餐 —— 契约 /user/setmeal/list
export function getSetmealList(categoryId: number) {
  return request.get<unknown, Result<Setmeal[]>>('/user/setmeal/list', {
    params: { categoryId }
  })
}

// 套餐含菜明细的轻缓存(ADR 评审 7.1):同一套餐重复开弹层不重复请求。
// 失败时从缓存剔除,避免缓存一个 rejected promise。
const dishesCache = new Map<number, Promise<Result<DishItemVO[]>>>()

export function getSetmealDishes(setmealId: number) {
  const cached = dishesCache.get(setmealId)
  if (cached) return cached
  const p = request.get<unknown, Result<DishItemVO[]>>(`/user/setmeal/dish/${setmealId}`)
  dishesCache.set(setmealId, p)
  p.catch(() => dishesCache.delete(setmealId))
  return p
}
