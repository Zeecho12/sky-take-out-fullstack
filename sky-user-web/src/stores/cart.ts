import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { addCart, subCart, listCart, cleanCart } from '@/api/cart'
import type { ShoppingCart, ShoppingCartDTO } from '@/types/business'

// 购物车 store —— 服务端为准(ADR D4):所有写操作后重拉 cart/list,前端不自算数量/金额。
export const useCartStore = defineStore('cart', () => {
  const items = ref<ShoppingCart[]>([])

  // 展示用聚合:金额只累加、不计算单价(amount 取自后端,= 单价)
  const totalCount = computed(() => items.value.reduce((s, i) => s + i.number, 0))
  const totalAmount = computed(() => items.value.reduce((s, i) => s + i.amount * i.number, 0))

  // 串行化(ADR D4 竞态防护):写操作 + 重拉排进同一条链,连点也按序执行,
  // 最后一次 fetch 反映最终状态,避免"后到的旧响应覆盖新状态"。
  let chain: Promise<unknown> = Promise.resolve()
  function enqueue(task: () => Promise<void>): Promise<void> {
    const run = chain.then(task)
    chain = run.catch(() => {}) // 保持链存活:本次失败不阻断后续
    return run
  }

  async function fetchCart() {
    const res = await listCart()
    items.value = res.code === 1 && Array.isArray(res.data) ? res.data : []
  }

  function refresh() {
    return enqueue(fetchCart)
  }
  function add(dto: ShoppingCartDTO) {
    return enqueue(async () => {
      await addCart(dto)
      await fetchCart()
    })
  }
  function sub(dto: ShoppingCartDTO) {
    return enqueue(async () => {
      await subCart(dto)
      await fetchCart()
    })
  }
  function clean() {
    return enqueue(async () => {
      await cleanCart()
      await fetchCart()
    })
  }

  return { items, totalCount, totalAmount, refresh, add, sub, clean }
})
