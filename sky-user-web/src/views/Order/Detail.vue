<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast, showConfirmDialog } from 'vant'
import { orderDetail, cancel, reminder, repetition } from '@/api/order'
import { useCartStore } from '@/stores/cart'
import ProductImage from '@/components/ProductImage.vue'
import type { OrderDetail } from '@/types/business'

const route = useRoute()
const router = useRouter()
const cart = useCartStore()

const id = Number(route.params.id)
const order = ref<OrderDetail | null>(null)
const loading = ref(true)

const STATUS_TEXT: Record<number, string> = {
  1: '待付款', 2: '待接单', 3: '已接单', 4: '派送中', 5: '已完成', 6: '已取消'
}
function statusText(s?: number): string {
  return s ? (STATUS_TEXT[s] ?? '未知') : ''
}

async function load() {
  loading.value = true
  try {
    const res = await orderDetail(id)
    if (res.code === 1 && res.data) {
      order.value = res.data
    } else {
      order.value = null
      showToast(res.msg || '订单不存在')
    }
  } catch {
    order.value = null
  } finally {
    loading.value = false
  }
}

onMounted(load)

// 取消(status1|2):确认 → cancel → 重新拉详情刷新状态(已取消后操作按钮消失)
async function onCancel() {
  try {
    await showConfirmDialog({ title: '取消订单', message: '确定要取消这个订单吗?' })
  } catch {
    return
  }
  const res = await cancel(id)
  if (res.code === 1) {
    showToast('已取消')
    await load()
  } else {
    showToast(res.msg || '取消失败')
  }
}

// 立即支付(status1):带 orderNumber/orderAmount/orderId 进 0004 支付页
function goPay() {
  if (!order.value) return
  router.push({
    path: '/order-pay',
    query: {
      orderNumber: order.value.number,
      orderAmount: order.value.amount,
      orderId: order.value.id
    }
  })
}

// 催单(status2):reminder → toast
async function onReminder() {
  const res = await reminder(id)
  showToast(res.code === 1 ? '催单已发出' : (res.msg || '催单失败'))
}

// 再来一单(AD1 Q1:合并加入、不清空):确认 → repetition → 刷新购物车 → 回菜单
async function onRepeat() {
  try {
    await showConfirmDialog({ title: '再来一单', message: '将该订单的菜品加入购物车?' })
  } catch {
    return
  }
  const res = await repetition(id)
  if (res.code === 1) {
    await cart.refresh()
    showToast('已加入购物车')
    router.push('/menu')
  } else {
    showToast(res.msg || '操作失败')
  }
}
</script>

<template>
  <div class="order-detail">
    <van-nav-bar title="订单详情" left-text="返回" left-arrow @click-left="router.back()" />

    <div class="page">
    <template v-if="order">
      <div class="status-bar">{{ statusText(order.status) }}</div>

      <!-- 收货信息 -->
      <div class="section">
        <div class="addr-head">
          <span class="name">{{ order.consignee }}</span>
          <span class="phone">{{ order.phone }}</span>
        </div>
        <div class="addr-detail">{{ order.address }}</div>
      </div>

      <!-- 菜品明细 -->
      <div class="section">
        <div class="section-title">商品明细</div>
        <div v-for="(d, idx) in order.orderDetailList" :key="idx" class="goods-row">
          <div class="dish-thumb"><ProductImage :alt="d.name" /></div>
          <span class="goods-name">{{ d.name }}</span>
          <span class="goods-num">x{{ d.number }}</span>
          <span class="goods-amt">¥{{ d.amount?.toFixed(2) }}</span>
        </div>
      </div>

      <!-- 订单信息 -->
      <div class="section">
        <van-cell title="订单号" :value="order.number" />
        <van-cell title="下单时间" :value="order.orderTime" />
        <van-cell title="备注" :value="order.remark || '无'" />
        <van-cell title="合计" :value="`¥${order.amount.toFixed(2)}`" class="amount-total" />
      </div>

      <!-- 操作按钮(按状态) -->
      <div class="action-bar">
        <van-button v-if="order.status === 1 || order.status === 2" size="small" @click="onCancel">取消订单</van-button>
        <van-button v-if="order.status === 1" size="small" type="primary" @click="goPay">立即支付</van-button>
        <van-button v-if="order.status === 2" size="small" @click="onReminder">催单</van-button>
        <van-button size="small" plain @click="onRepeat">再来一单</van-button>
      </div>
    </template>

    <van-empty v-else-if="!loading" description="订单不存在" />
    </div>
  </div>
</template>

<style scoped>
.order-detail { min-height: 100vh; background: var(--c-bg); }
.page { max-width: 760px; margin: 0 auto; padding: 16px 16px 32px; }

.status-bar {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--r);
  box-shadow: var(--shadow-sm);
  margin: 0 0 14px;
  padding: 16px 18px;
  font-size: 17px;
  font-weight: 700;
  color: var(--c-text);
}
.section {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--r);
  box-shadow: var(--shadow-sm);
  margin: 0 0 14px;
  overflow: hidden;
  padding: 14px 16px;
}
.addr-head { display: flex; align-items: center; gap: 10px; }
.addr-head .name { font-weight: 700; font-size: 16px; color: var(--c-text); }
.addr-head .phone { color: var(--c-text-2); }
.addr-detail { color: var(--c-text-2); margin-top: 6px; font-size: 14px; line-height: 1.5; }
.section-title { font-weight: 700; color: var(--c-text); margin-bottom: 10px; }
.goods-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; font-size: 14px; }
.dish-thumb { width: 44px; height: 44px; border-radius: var(--r-sm); overflow: hidden; flex: none; background: var(--c-surface-2); border: 1px solid var(--c-border); }
.goods-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--c-text); }
.goods-num { color: var(--c-muted); }
.goods-amt { color: var(--c-text); font-weight: 600; }
.amount-total :deep(.van-cell__value) { color: var(--c-price); font-weight: 700; }
.action-bar { display: flex; gap: 8px; justify-content: flex-end; padding: 4px 0 0; }
</style>
