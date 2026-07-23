<script setup lang="ts">
import { useCartStore } from '@/stores/cart'
import { showToast } from 'vant'

const cart = useCartStore()
const emit = defineEmits<{ open: [] }>()

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
    <van-button type="primary" :disabled="!cart.totalCount" @click="checkout">去结算</van-button>
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
</style>
