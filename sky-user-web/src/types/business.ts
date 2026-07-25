// C 端业务数据类型(字段对齐后端 entity/VO,见 BACKEND_OVERVIEW SECTION-6)。
// 只声明前端会用到的字段;后端可能返回更多字段,不影响。

// 分类(菜品分类 type=1 / 套餐分类 type=2)
export interface Category {
  id: number
  type: number
  name: string
  sort: number
  status: number
}

// 菜品口味:value 是 JSON 数组字符串,如 '["无糖","少糖"]'(见 ADR AD1)
export interface DishFlavor {
  id: number
  dishId: number
  name: string
  value: string
}

// C 端菜品(DishVO):含 flavors 口味组
export interface DishVO {
  id: number
  name: string
  categoryId: number
  price: number
  image: string
  description: string
  status: number
  flavors: DishFlavor[]
}

// 套餐
export interface Setmeal {
  id: number
  categoryId: number
  name: string
  price: number
  status: number
  description: string
  image: string
}

// 套餐内菜品项(DishItemVO)
export interface DishItemVO {
  name: string
  copies: number
  image: string
  description: string
}

// 购物车行(ShoppingCart entity)。amount = 单价(非小计),数量 = number
export interface ShoppingCart {
  id: number
  name: string
  image: string
  userId: number
  dishId: number | null
  setmealId: number | null
  dishFlavor: string | null
  number: number
  amount: number
}

// 加/减购物车入参(ShoppingCartDTO)。dishId 与 setmealId 二选一;dishFlavor 可选
export interface ShoppingCartDTO {
  dishId?: number
  setmealId?: number
  dishFlavor?: string
}

// 地址簿(AddressBook entity)。字段口径对齐后端契约(0003):
// - sex 是 string("0"/"1");isDefault 是 number(0/1)
// - 省市区六字段均 string(code 6 位,name 中文);由 van-area 选出后一并提交
// id/userId 由后端管理,前端新增时不传,故可选。
// isDefault 可选:后端读取(list/default)时恒返回;但前端新增/编辑 payload
// 刻意不带该字段(设默认只走 setDefaultAddress),故声明为可选,避免构造 payload 报错。
export interface AddressBook {
  id?: number
  userId?: number
  consignee: string
  phone: string
  sex: string
  provinceCode: string
  provinceName: string
  cityCode: string
  cityName: string
  districtCode: string
  districtName: string
  detail: string
  label: string
  isDefault?: number
}

// 下单入参(OrdersSubmitDTO) —— 契约 POST /user/order/submit。
// 当前用户由后端 JWT 拦截器注入,前端不传 userId。
export interface OrdersSubmitDTO {
  addressBookId: number
  amount: number
  deliveryStatus: number
  estimatedDeliveryTime: string
  packAmount: number
  payMethod: number
  remark: string
  tablewareNumber: number
  tablewareStatus: number
}

// 下单返回(OrderSubmitVO)
export interface OrderSubmitVO {
  id: number
  orderNumber: string
  orderAmount: number
  orderTime: string
}

// 支付入参(OrdersPaymentDTO) —— 契约 PUT /user/order/payment(0004 mock 支付)。
// 当前用户由后端 JWT 拦截器注入;payMethod 前端定死 1(微信支付,模拟)。
export interface OrdersPaymentDTO {
  orderNumber: string
  payMethod: number
}

// 订单明细行(后端 OrderDetail entity;一道菜/套餐一行)
export interface OrderDetailItem {
  id: number
  name: string
  image: string
  number: number // 数量
  amount: number // 金额
  dishFlavor: string | null
  dishId: number | null
  setmealId: number | null
}

// 历史订单列表项(OrderVO 列表子集;含明细供卡片菜品缩略)
// status:1待付款 2待接单 3已接单 4派送中 5已完成 6已取消
// payStatus:0未支付 1已支付 2退款
export interface Order {
  id: number
  number: string // 订单号
  status: number
  payStatus: number
  payMethod: number
  amount: number // 实收金额
  orderTime: string
  remark: string | null
  orderDetailList: OrderDetailItem[]
}

// 订单详情(OrderVO 全字段;详情页用)
export interface OrderDetail extends Order {
  consignee: string
  phone: string
  address: string
  userName: string | null
  addressBookId: number | null
  cancelReason: string | null
  rejectionReason: string | null
  cancelTime: string | null
  checkoutTime: string | null
  estimatedDeliveryTime: string | null
  deliveryTime: string | null
  packAmount: number
  tablewareNumber: number
}

// 分页结果(对齐 com.sky.result.PageResult:{ total: long, records: List<T> })
export interface PageResult<T> {
  total: number
  records: T[]
}
