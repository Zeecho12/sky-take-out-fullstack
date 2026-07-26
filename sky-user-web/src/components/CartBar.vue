<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useCartStore } from '@/stores/cart'

const cart = useCartStore()
const router = useRouter()
const emit = defineEmits<{ open: [] }>()

// shopClosed 仅在店铺“明确打烊(status===0)”时为 true;
// 未知 / 加载失败(null 兜底)时上游传 false,不阻断结算(见 requirement AC + ADR AD1)。
withDefaults(defineProps<{ shopClosed?: boolean }>(), { shopClosed: false })

// 去结算(0003):跳结算页。打烊 / 购物车空的置灰由按钮 :disabled 兜住(见 template)。
function checkout() {
  router.push('/order-confirm')
}
</script>

<template>
  <div class="cart-bar">
    <div class="bar-inner container">
      <div class="left" @click="emit('open')">
        <van-icon name="shopping-cart-o" :badge="cart.totalCount || ''" size="24" />
        <span class="amt">¥{{ cart.totalAmount.toFixed(2) }}</span>
        <span class="hint">查看购物车</span>
      </div>
      <div class="right">
        <span v-if="shopClosed" class="closed-tip">店铺打烊,暂停结算</span>
        <van-button type="primary" round :disabled="!cart.totalCount || shopClosed" @click="checkout">去结算</van-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cart-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  background: rgba(255, 255, 255, .9);
  backdrop-filter: saturate(1.4) blur(10px);
  border-top: 1px solid var(--c-border);
  box-shadow: 0 -4px 24px rgba(24, 24, 24, .06);
}
.bar-inner {
  height: 68px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.left {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  color: var(--c-text);
}
.amt { font-size: 19px; font-weight: 800; }
.hint { font-size: 13px; color: var(--c-muted); }
.right { display: flex; align-items: center; gap: 12px; }
.right :deep(.van-button) { padding: 0 26px; font-weight: 600; }
.closed-tip { font-size: 12.5px; color: var(--c-muted); }
</style>
