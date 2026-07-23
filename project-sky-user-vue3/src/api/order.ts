import request from '@/utils/request'
import type { Result } from '@/api/user'
import type { OrdersSubmitDTO, OrderSubmitVO, OrdersPaymentDTO } from '@/types/business'

// 下单接口(0003) —— 需 USER token,由 request 拦截器自动带 Bearer。
// 提交后端结算,返回订单号等信息,供占位成功页展示。

// 提交订单 —— 契约 POST /user/order/submit
export function submitOrder(data: OrdersSubmitDTO) {
  return request.post<unknown, Result<OrderSubmitVO>>('/user/order/submit', data)
}

// 支付(0004 mock) —— 契约 PUT /user/order/payment,需 USER token。
// 后端内部同步把订单置为已支付(原子 CAS);成功 { code:1, data:null }。
export function payment(data: OrdersPaymentDTO) {
  return request.put<unknown, Result<null>>('/user/order/payment', data)
}
