import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AddressBook } from '@/types/business'

// 地址回传 store(0003 步骤5)—— 轻量跨页传参:
// 结算页 push('/address?mode=select') → 地址簿列表选中调 setSelected(a) → router.back()
// 回结算页读 selected 作当前地址。只在“选择模式”这一次往返里用,故不持久化。
export const useAddressStore = defineStore('address', () => {
  const selected = ref<AddressBook | null>(null)

  function setSelected(a: AddressBook) {
    selected.value = a
  }
  function clear() {
    selected.value = null
  }

  return { selected, setSelected, clear }
})
