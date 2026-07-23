<script setup lang="ts">
import { useCartStore } from '@/stores/cart'
import { showToast } from 'vant'

const cart = useCartStore()
const emit = defineEmits<{ open: [] }>()

// shopClosed 仅在店铺“明确打烊(status===0)”时为 true;
// 未知 / 加载失败(null 兜底)时上游传 false,不阻断结算(见 requirement AC + ADR AD1)。
withDefaults(defineProps<{ shopClosed?: boolean }>(), { shopClosed: false })

// 去结算:结算/下单属功能 0003,本功能占位提示(见 requirement Out of Scope)
function checkout() {
  showToast('结算 / 下单在功能 0003')
}
</script>

<template>
  <div class="cart-bar">
    <div class="left" @click="emit('open')">
      <van-icon name="shopping-cart-o" :badge="cart.totalCount || ''" size="26" />
      <span class="amt">¥{{ cart.totalAmount.toFixed(2) }}</span>
    </div>
    <div class="right">
      <span v-if="shopClosed" class="closed-tip">店铺打烊,暂停结算</span>
      <van-button type="primary" :disabled="!cart.totalCount || shopClosed" @click="checkout">去结算</van-button>
    </div>
  </div>
</template>

<style scoped>
.cart-bar {
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
.left { display: flex; align-items: center; gap: 12px; cursor: pointer; }
.amt { font-size: 18px; font-weight: 700; }
.right { display: flex; align-items: center; gap: 8px; }
.closed-tip { font-size: 12px; color: #969799; }
</style>
