<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

// 由 Confirm 页下单成功后带过来展示(占位页,不做支付)
const orderNumber = route.query.orderNumber as string | undefined
const orderAmount = route.query.orderAmount as string | undefined

function goMenu() {
  router.push('/menu')
}
</script>

<template>
  <div class="order-created">
    <van-icon name="checked" class="ok-icon" />
    <div class="title">订单已创建</div>

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

    <div class="tip">支付功能即将上线(0004)</div>

    <van-button type="primary" round block class="back-btn" @click="goMenu">返回菜单</van-button>
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
.tip { color: #969799; font-size: 13px; margin: 20px 0 32px; }
.back-btn { max-width: 320px; margin: 0 auto; }
</style>
