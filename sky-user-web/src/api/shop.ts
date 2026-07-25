import request from '@/utils/request'
import type { Result } from '@/api/user'

// 店铺营业状态:1 营业 / 0 打烊。免认证(白名单)。
// 兜底(ADR AD1):Redis 未初始化时后端 /user/shop/status 会拆箱 NPE → 500;
// 这里吞掉异常返回 null(未知),绝不阻塞点餐页浏览。
export async function getShopStatus(): Promise<number | null> {
  try {
    const res = await request.get<unknown, Result<number>>('/user/shop/status')
    return res.code === 1 ? res.data : null
  } catch {
    return null
  }
}
