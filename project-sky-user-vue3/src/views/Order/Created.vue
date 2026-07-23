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
</template>

<style scoped>
.order-created {
  min-height: 100vh;
  background: #f7f8fa;
  padding: 48px 24px 24px;
  text-align: center;
}
.ok-icon { font-size: 64px; color: #07c160; }
.title { font-size: 20px; font-weight: 700; margin: 16px 0 24px; }
.info {
  background: #fff;
  border-radius: 8px;
  padding: 8px 16px;
  text-align: left;
}
.row { display: flex; justify-content: space-between; padding: 12px 0; }
.row + .row { border-top: 1px solid #f2f2f2; }
.k { color: #969799; }
.v { color: #333; }
.v.amt { color: #ee0a24; font-weight: 700; }
.actions { max-width: 320px; margin: 32px auto 0; }
.action-btn + .action-btn { margin-top: 12px; }
</style>
