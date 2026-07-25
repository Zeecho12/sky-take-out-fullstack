import request from '@/utils/request'
import type { Result } from '@/api/user'
import type { OrdersSubmitDTO, OrderSubmitVO, OrdersPaymentDTO, Order, OrderDetail, PageResult } from '@/types/business'

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

// 历史订单(分页) —— 契约 GET /user/order/historyOrders,需 USER token。
// ⚠️ 分页页码参数名是 pageNum(后端 OrderController.page 无 @RequestParam、靠参数名绑定;
//    用 page 会 400 MissingServletRequestParameterException,不走 Result)。
// status 可空(不传=全部;1=待付款;6=已取消),axios 会自动省略 undefined 参数。
export function historyOrders(pageNum: number, pageSize: number, status?: number) {
  return request.get<unknown, Result<PageResult<Order>>>('/user/order/historyOrders', {
    params: { pageNum, pageSize, status }
  })
}

// 订单详情 —— 契约 GET /user/order/orderDetail/{id}(后端已按当前用户归属校验)
export function orderDetail(id: number) {
  return request.get<unknown, Result<OrderDetail>>(`/user/order/orderDetail/${id}`)
}

// 催单 —— 契约 GET /user/order/reminder/{id}(仅待接单 status2 可催;归属校验)
export function reminder(id: number) {
  return request.get<unknown, Result<null>>(`/user/order/reminder/${id}`)
}

// 再来一单 —— 契约 POST /user/order/repetition/{id}(把该单明细合并加入当前用户购物车;归属校验)
export function repetition(id: number) {
  return request.post<unknown, Result<null>>(`/user/order/repetition/${id}`)
}

// 取消订单 —— 契约 PUT /user/order/cancel/{id}(status<=2 可取消;归属校验)
export function cancel(id: number) {
  return request.put<unknown, Result<null>>(`/user/order/cancel/${id}`)
}
