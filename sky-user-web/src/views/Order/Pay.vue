<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { payment } from '@/api/order'
import type { OrdersPaymentDTO } from '@/types/business'

const route = useRoute()
const router = useRouter()

// 由 Confirm 页下单成功后带过来(键名与 Confirm push 一致:orderNumber / orderAmount)
const orderNumber = route.query.orderNumber as string | undefined
const orderAmount = route.query.orderAmount as string | undefined

// 0005:订单 id 由 Confirm 页透传过来,继续透传给成功页(供「查看订单」跳详情)
const orderId = route.query.orderId as string | undefined

// 支付方式:mock 只有一项,默认选中(payMethod 定死 1)
const payMethod = ref(1)
const submitting = ref(false)

async function onConfirmPay() {
  if (submitting.value) return // 防双击
  if (!orderNumber) {
    showToast('订单号缺失')
    return
  }
  submitting.value = true
  try {
    const payload: OrdersPaymentDTO = {
      orderNumber,
      payMethod: 1 // mock:定死微信支付
    }
    const res = await payment(payload)
    if (res.code === 1) {
      router.push({
        path: '/order-created',
        query: {
          orderNumber,
          orderAmount,
          orderId
        }
      })
    } else {
      showToast(res.msg || '支付失败') // 后端拒绝(已支付/订单不存在等),不跳转
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="order-pay">
    <van-nav-bar title="收银台" left-text="返回" left-arrow @click-left="router.back()" />

    <!-- 金额(醒目) -->
    <div class="amount-box">
      <div class="amount-label">支付金额</div>
      <div class="amount-value">¥{{ orderAmount ?? '-' }}</div>
      <div class="order-no">订单号 {{ orderNumber ?? '-' }}</div>
    </div>

    <!-- 支付方式:mock 单选 -->
    <div class="section">
      <div class="section-title">支付方式</div>
      <van-radio-group v-model="payMethod">
        <van-cell clickable @click="payMethod = 1">
          <template #title>
            <span class="pay-way">微信支付(模拟)</span>
          </template>
          <template #right-icon>
            <van-radio :name="1" />
          </template>
        </van-cell>
      </van-radio-group>
    </div>

    <!-- 底部确认支付 -->
    <div class="pay-bar">
      <span class="pay-total">¥{{ orderAmount ?? '-' }}</span>
      <van-button type="primary" round :loading="submitting" @click="onConfirmPay">确认支付</van-button>
    </div>
  </div>
</template>

<style scoped>
.order-pay { min-height: 100vh; padding-bottom: 72px; background: #f7f8fa; }
.amount-box {
  background: #fff;
  margin: 8px;
  border-radius: 8px;
  padding: 24px 16px;
  text-align: center;
}
.amount-label { color: #969799; font-size: 14px; }
.amount-value { color: #ee0a24; font-size: 32px; font-weight: 700; margin: 8px 0; }
.order-no { color: #969799; font-size: 12px; }
.section { background: #fff; margin: 8px; border-radius: 8px; overflow: hidden; }
.section-title { padding: 12px 14px 4px; font-weight: 600; }
.pay-way { font-size: 15px; }
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
