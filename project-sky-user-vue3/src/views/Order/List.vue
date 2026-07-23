<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { showToast, showConfirmDialog } from 'vant'
import { historyOrders, reminder, repetition } from '@/api/order'
import { useCartStore } from '@/stores/cart'
import type { Order } from '@/types/business'

const router = useRouter()
const cart = useCartStore()

const PAGE_SIZE = 10

// 3 tab 对齐 reference:全部(不传 status)/ 待付款(1)/ 已取消(6)
const tabs = [
  { title: '全部', status: undefined as number | undefined },
  { title: '待付款', status: 1 as number | undefined },
  { title: '已取消', status: 6 as number | undefined }
]
const activeTab = ref(0)
const currentStatus = computed(() => tabs[activeTab.value].status)

// van-list 无限滚动状态
const list = ref<Order[]>([])
const loading = ref(false)
const finished = ref(false)
const pageNum = ref(1)
const total = ref(0)

const STATUS_TEXT: Record<number, string> = {
  1: '待付款', 2: '待接单', 3: '已接单', 4: '派送中', 5: '已完成', 6: '已取消'
}
function statusText(s: number): string {
  return STATUS_TEXT[s] ?? '未知'
}

// van-list 触底加载:挂载即自动首拉,之后每次 pageNum++ 累加。
// AD1 护栏:首拉/切 tab 后首拉都只靠 van-list 自动 @load,不手动并发调用;len>=total 即停;
// 空 tab(total=0 → 0>=0)立即 finished 配合空态;并加切 tab 竞态守卫防旧结果串味。
async function onLoad() {
  const reqStatus = currentStatus.value
  try {
    const res = await historyOrders(pageNum.value, PAGE_SIZE, reqStatus)
    // 请求返回时若已切到别的 tab,丢弃本次结果(避免旧 tab 数据混入新 tab)
    if (reqStatus !== currentStatus.value) return
    if (res.code === 1 && res.data) {
      total.value = res.data.total
      list.value.push(...res.data.records)
      pageNum.value += 1
      if (list.value.length >= total.value) finished.value = true
    } else {
      finished.value = true
      showToast(res.msg || '加载失败')
    }
  } catch {
    finished.value = true
  } finally {
    loading.value = false
  }
}

// 切 tab:复位后先置 loading=true 再手动触发一次 onLoad。
// 为何不能只复位靠 van-list 自动重拉:van-list 仅在 finished 发生 true→false 跳变(或滚动/挂载)时才重查 @load;
// 从"未加载完(finished 恒 false)"的 tab 切走时无跳变 → 不会自动加载 → 新 tab 白屏。
// 手动调 onLoad 前先置 loading=true:van-list 在 loading 期间不会并发触发自己的 @load,故切 tab 恰好 1 次请求(不双发)。
// (初始挂载仍由 van-list 挂载自动首拉,onMounted 无手动调用,不会双发。)
watch(activeTab, () => {
  list.value = []
  total.value = 0
  pageNum.value = 1
  finished.value = false
  loading.value = true
  onLoad()
})

function goDetail(id: number) {
  router.push(`/order-detail/${id}`)
}

// 去支付(status1):带 orderNumber/orderAmount/orderId 进 0004 支付页(orderId 护栏)
function goPay(o: Order) {
  router.push({
    path: '/order-pay',
    query: { orderNumber: o.number, orderAmount: o.amount, orderId: o.id }
  })
}

// 催单(status2):调 reminder → toast
async function onReminder(o: Order) {
  const res = await reminder(o.id)
  showToast(res.code === 1 ? '催单已发出' : (res.msg || '催单失败'))
}

// 再来一单(AD1 Q1:合并加入、不清空购物车):确认 → repetition → 刷新购物车 → 回菜单
async function onRepeat(o: Order) {
  try {
    await showConfirmDialog({ title: '再来一单', message: '将该订单的菜品加入购物车?' })
  } catch {
    return // 用户取消
  }
  const res = await repetition(o.id)
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
  <div class="order-list">
    <van-nav-bar title="历史订单" left-text="返回" left-arrow @click-left="router.back()" />

    <van-tabs v-model:active="activeTab" sticky>
      <van-tab v-for="t in tabs" :key="t.title" :title="t.title" />
    </van-tabs>

    <van-list
      v-model:loading="loading"
      :finished="finished"
      finished-text="没有更多了"
      @load="onLoad"
    >
      <div
        v-for="o in list"
        :key="o.id"
        class="order-card"
        @click="goDetail(o.id)"
      >
        <div class="card-head">
          <span class="order-no">No.{{ o.number }}</span>
          <span class="order-status">{{ statusText(o.status) }}</span>
        </div>
        <div class="card-time">{{ o.orderTime }}</div>

        <div class="card-dishes">
          <van-image
            v-for="(d, idx) in o.orderDetailList.slice(0, 4)"
            :key="idx"
            :src="d.image"
            width="48"
            height="48"
            radius="4"
            fit="cover"
          >
            <template #error>
              <div class="dish-ph">{{ d.name?.slice(0, 2) || '菜' }}</div>
            </template>
          </van-image>
        </div>

        <div class="card-foot">
          <span class="amount">¥{{ o.amount.toFixed(2) }}</span>
          <div class="btns" @click.stop>
            <van-button v-if="o.status === 1" size="small" type="primary" @click="goPay(o)">去支付</van-button>
            <van-button v-if="o.status === 2" size="small" @click="onReminder(o)">催单</van-button>
            <van-button size="small" plain @click="onRepeat(o)">再来一单</van-button>
          </div>
        </div>
      </div>

      <van-empty v-if="finished && list.length === 0" description="暂无订单" />
    </van-list>
  </div>
</template>

<style scoped>
.order-list { min-height: 100vh; background: #f7f8fa; padding-bottom: 16px; }
.order-card { background: #fff; margin: 8px; border-radius: 8px; padding: 12px 14px; cursor: pointer; }
.card-head { display: flex; align-items: center; justify-content: space-between; }
.order-no { font-size: 13px; color: #969799; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.order-status { font-size: 14px; font-weight: 600; color: #ee0a24; margin-left: 8px; flex-shrink: 0; }
.card-time { font-size: 12px; color: #c8c9cc; margin-top: 4px; }
.card-dishes { display: flex; gap: 8px; margin: 10px 0; flex-wrap: wrap; }
.dish-ph { width: 48px; height: 48px; border-radius: 4px; background: #f2f3f5; color: #969799; font-size: 12px; display: flex; align-items: center; justify-content: center; }
.card-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 6px; }
.amount { font-size: 16px; font-weight: 700; color: #ee0a24; }
.btns { display: flex; gap: 8px; }
</style>
