<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { submitOrder } from '@/api/order'
import { getDefaultAddress } from '@/api/address'
import { useCartStore } from '@/stores/cart'
import { useAddressStore } from '@/stores/address'
import type { AddressBook, OrdersSubmitDTO } from '@/types/business'

const router = useRouter()
const cart = useCartStore()
const addressStore = useAddressStore()

const currentAddress = ref<AddressBook | null>(null)
const remark = ref('')
const tablewareNumber = ref(1)
const submitting = ref(false)

// 配送费写死 ¥6(0003 先不做真实计费)
const DELIVERY_FEE = 6
// 打包费 = 菜品总件数(与后端 packAmount 口径一致)
const packAmount = computed(() => cart.totalCount)
// 合计 = 商品合计 + 配送费 + 打包费
const amount = computed(() => cart.totalAmount + DELIVERY_FEE + packAmount.value)

function fullAddress(a: AddressBook): string {
  return `${a.provinceName ?? ''}${a.cityName ?? ''}${a.districtName ?? ''}${a.detail ?? ''}`
}

// 日期格式化 yyyy-MM-dd HH:mm:ss(补零),不引第三方
function formatNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

// 点地址卡 → 进地址簿选择模式
function goSelectAddress() {
  router.push('/address?mode=select')
}

async function onPay() {
  if (submitting.value) return // 防双击(真幂等留将来)
  const addr = currentAddress.value
  if (!addr || addr.id == null) {
    showToast('请选择收货地址')
    return // 负例门:无地址绝不发 submitOrder
  }
  if (!cart.totalCount) {
    showToast('购物车是空的')
    return
  }
  submitting.value = true
  try {
    const payload: OrdersSubmitDTO = {
      addressBookId: addr.id,
      amount: amount.value,
      deliveryStatus: 1,
      estimatedDeliveryTime: formatNow(),
      packAmount: cart.totalCount,
      payMethod: 1,
      remark: remark.value,
      tablewareNumber: tablewareNumber.value,
      // 这三个字段定死 1/1/1:对应后端 NOT NULL 列,漏传 500
      tablewareStatus: 1
    }
    const res = await submitOrder(payload)
    if (res.code === 1) {
      await cart.refresh() // 下单后购物车已清空,重拉对齐
      router.push({
        path: '/order-created',
        query: {
          orderNumber: res.data.orderNumber,
          orderAmount: res.data.orderAmount
        }
      })
    } else {
      showToast(res.msg || '下单失败')
    }
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  await cart.refresh() // 服务端为准
  // 定地址:优先用选择模式回传的;否则取默认地址
  if (addressStore.selected) {
    currentAddress.value = addressStore.selected
  } else {
    const res = await getDefaultAddress()
    currentAddress.value = res.code === 1 ? res.data : null
  }
})
</script>

<template>
  <div class="order-confirm">
    <van-nav-bar title="确认订单" left-text="返回" left-arrow @click-left="router.back()" />

    <!-- 地址卡:点击进选择模式 -->
    <div class="addr-card" @click="goSelectAddress">
      <template v-if="currentAddress">
        <div class="addr-head">
          <span class="name">{{ currentAddress.consignee }}</span>
          <span class="phone">{{ currentAddress.phone }}</span>
        </div>
        <div class="addr-detail">{{ fullAddress(currentAddress) }}</div>
      </template>
      <div v-else class="addr-empty">请选择收货地址</div>
      <van-icon name="arrow" class="addr-arrow" />
    </div>

    <template v-if="cart.totalCount">
      <!-- 购物车明细(复用 cart store,与购物车一致) -->
      <div class="section">
        <div class="section-title">商品明细</div>
        <div v-for="i in cart.items" :key="i.id" class="goods-row">
          <span class="goods-name">{{ i.name }}</span>
          <span class="goods-num">x{{ i.number }}</span>
          <span class="goods-amt">¥{{ (i.amount * i.number).toFixed(2) }}</span>
        </div>
      </div>

      <!-- 金额区 -->
      <div class="section">
        <van-cell title="商品合计" :value="`¥${cart.totalAmount.toFixed(2)}`" />
        <van-cell title="配送费" :value="`¥${DELIVERY_FEE.toFixed(2)}`" />
        <van-cell title="打包费" :value="`¥${packAmount.toFixed(2)}`" />
        <van-cell title="合计" :value="`¥${amount.toFixed(2)}`" class="amount-total" />
      </div>

      <!-- 备注 / 餐具 / 送达时间 -->
      <div class="section">
        <van-field v-model="remark" label="备注" placeholder="给商家留言(选填)" />
        <van-cell title="餐具数量">
          <template #value>
            <van-stepper v-model="tablewareNumber" min="1" />
          </template>
        </van-cell>
        <van-cell title="送达时间" value="立即送出" />
      </div>

      <!-- 底部去支付 -->
      <div class="pay-bar">
        <span class="pay-total">合计 ¥{{ amount.toFixed(2) }}</span>
        <van-button type="primary" round :loading="submitting" @click="onPay">去支付</van-button>
      </div>
    </template>

    <van-empty v-else description="购物车是空的" />
  </div>
</template>

<style scoped>
.order-confirm { min-height: 100vh; padding-bottom: 72px; background: #f7f8fa; }
.addr-card {
  position: relative;
  background: #fff;
  margin: 8px;
  border-radius: 8px;
  padding: 14px 32px 14px 14px;
  cursor: pointer;
}
.addr-head { display: flex; align-items: center; gap: 10px; }
.addr-head .name { font-weight: 600; font-size: 16px; }
.addr-head .phone { color: #666; }
.addr-detail { color: #333; margin-top: 6px; font-size: 14px; line-height: 1.4; }
.addr-empty { color: #969799; font-size: 15px; }
.addr-arrow { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: #c8c9cc; }
.section { background: #fff; margin: 8px; border-radius: 8px; overflow: hidden; }
.section-title { padding: 12px 14px 4px; font-weight: 600; }
.goods-row {
  display: flex;
  align-items: center;
  padding: 8px 14px;
  font-size: 14px;
}
.goods-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.goods-num { color: #969799; margin: 0 12px; }
.goods-amt { color: #333; font-weight: 500; }
.amount-total :deep(.van-cell__value) { color: #ee0a24; font-weight: 700; }
.pay-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 54px;
  background: #fff;
  border-top: 1px solid #eee;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  z-index: 10;
}
.pay-total { font-size: 16px; font-weight: 700; color: #ee0a24; }
</style>
