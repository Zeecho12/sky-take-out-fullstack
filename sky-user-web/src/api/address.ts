import request from '@/utils/request'
import type { Result } from '@/api/user'
import type { AddressBook } from '@/types/business'

// 地址簿接口(0003) —— 全部需 USER token,由 request 拦截器自动带 Bearer。
// 当前用户由后端 JWT 拦截器注入,前端不传 userId。
//
// @vant/area-data 的 areaList 结构:{ province_list, city_list, county_list },
// 三者均为 Record<6 位 code, 中文名>。后续用 van-area 选完把 code+name 一并塞进
// 省市区六字段提交。地址回显样例(真实取自 areaList):
//   province: '320000' → '江苏省'
//   city:     '320100' → '南京市'
//   county:   '320102' → '玄武区'

// 查我的全部地址 —— 契约 GET /user/addressBook/list
export function getAddressList() {
  return request.get<unknown, Result<AddressBook[]>>('/user/addressBook/list')
}

// 按 id 查单条(路径参数) —— 契约 GET /user/addressBook/{id}
export function getAddressById(id: number) {
  return request.get<unknown, Result<AddressBook>>(`/user/addressBook/${id}`)
}

// 查默认地址 —— 契约 GET /user/addressBook/default
export function getDefaultAddress() {
  return request.get<unknown, Result<AddressBook>>('/user/addressBook/default')
}

// 新增地址(body 不含 id) —— 契约 POST /user/addressBook
export function addAddress(data: AddressBook) {
  return request.post<unknown, Result<string>>('/user/addressBook', data)
}

// 修改地址(body 带 id) —— 契约 PUT /user/addressBook
export function updateAddress(data: AddressBook) {
  return request.put<unknown, Result<string>>('/user/addressBook', data)
}

// 删除地址(id 走 query 参数) —— 契约 DELETE /user/addressBook?id=X
export function deleteAddress(id: number) {
  return request.delete<unknown, Result<string>>('/user/addressBook', { params: { id } })
}

// 设为默认地址(body {id}) —— 契约 PUT /user/addressBook/default
export function setDefaultAddress(id: number) {
  return request.put<unknown, Result<string>>('/user/addressBook/default', { id })
}
