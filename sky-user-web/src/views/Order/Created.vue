<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

// 支付成功后由 Pay 页带过来展示(键名与 Pay push 一致)。
// orderNumber 保留:给 0005「查看订单」跳详情留钩子。
const orderNumber = route.query.orderNumber as string | undefined
const orderAmount = route.query.orderAmount as string | undefined

// 0005:订单 id 由 Pay 页透传过来,供「查看订单」跳详情
const orderId = route.query.orderId as string | undefined

// 查看订单:有 orderId 跳该单详情;缺 orderId 兜底退化到历史订单列表(绝不跳 /order-detail/undefined)
function goDetail() {
  if (orderId) {
    router.push(`/order-detail/${orderId}`)
  } else {
    router.push('/order-list')
  }
}

function goMenu() {
  router.push('/menu')
}
</script>

<template>
  <div class="order-created">
    <div class="page">
    <van-icon name="checked" class="ok-icon" />
    <div class="title">下单成功</div>

    <div class="info">
      <div class="row">
        <span class="k">订单号</span>
        <span class="v">{{ orderNumber ?? '-' }}</span>
      </div>
      <div class="row">
        <span class="k">金额</span>
        <span class="v amt">¥{{ orderAmount ?? '-' }}</span>
      </div>
    </div>

    <div class="actions">
      <van-button type="primary" round block class="action-btn" @click="goMenu">返回菜单</van-button>
      <!-- 查看订单(0005):有 orderId 跳详情,缺则退化到历史订单(兜底) -->
      <van-button round block class="action-btn" @click="goDetail">查看订单</van-button>
    </div>
    </div>
  </div>
</template>

<style scoped>
.order-created {
  min-height: 100vh;
  background: var(--c-bg);
}
.page {
  max-width: 460px;
  margin: 0 auto;
  padding: 64px 20px 48px;
  text-align: center;
}
.ok-icon { font-size: 60px; color: var(--c-success); }
.title { font-size: 22px; font-weight: 700; color: var(--c-text); margin: 16px 0 28px; }
.info {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--r);
  box-shadow: var(--shadow-sm);
  padding: 6px 18px;
  text-align: left;
}
.row { display: flex; justify-content: space-between; padding: 14px 0; }
.row + .row { border-top: 1px solid var(--c-border); }
.k { color: var(--c-muted); }
.v { color: var(--c-text); font-weight: 500; }
.v.amt { color: var(--c-price); font-weight: 700; }
.actions { max-width: 320px; margin: 28px auto 0; }
.action-btn + .action-btn { margin-top: 12px; }
</style>
