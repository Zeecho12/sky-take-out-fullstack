import request from '@/utils/request'
import type { Result } from '@/api/user'
import type { OrdersSubmitDTO, OrderSubmitVO } from '@/types/business'

// 下单接口(0003) —— 需 USER token,由 request 拦截器自动带 Bearer。
// 提交后端结算,返回订单号等信息,供占位成功页展示。

// 提交订单 —— 契约 POST /user/order/submit
export function submitOrder(data: OrdersSubmitDTO) {
  return request.post<unknown, Result<OrderSubmitVO>>('/user/order/submit', data)
}
