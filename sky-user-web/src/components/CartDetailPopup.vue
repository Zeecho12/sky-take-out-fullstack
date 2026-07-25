<script setup lang="ts">
import { useCartStore } from '@/stores/cart'
import ProductImage from '@/components/ProductImage.vue'
import type { ShoppingCart } from '@/types/business'

defineProps<{ show: boolean }>()
const emit = defineEmits<{ 'update:show': [boolean] }>()
const cart = useCartStore()

// +/- 一律回传该行原始 dishId/setmealId/dishFlavor(ADR AD1:后端按 dish_flavor 精确匹配,
// 绝不前端重拼)
function toDto(item: ShoppingCart) {
  return {
    dishId: item.dishId ?? undefined,
    setmealId: item.setmealId ?? undefined,
    dishFlavor: item.dishFlavor ?? undefined
  }
}
function inc(item: ShoppingCart) { cart.add(toDto(item)) }
function dec(item: ShoppingCart) { cart.sub(toDto(item)) }
</script>

<template>
  <van-popup :show="show" position="bottom" round @update:show="(v: boolean) => emit('update:show', v)">
    <div class="cd">
      <div class="hd">
        <span class="title">购物车</span>
        <van-button size="small" plain :disabled="!cart.items.length" @click="cart.clean()">清空</van-button>
      </div>
      <div v-if="!cart.items.length" class="empty">购物车是空的</div>
      <div v-for="item in cart.items" :key="item.id" class="row">
        <div class="thumb"><ProductImage :alt="item.name" /></div>
        <div class="info">
          <div class="name">{{ item.name }}</div>
          <div v-if="item.dishFlavor" class="flavor">{{ item.dishFlavor }}</div>
          <div class="price">¥{{ item.amount.toFixed(2) }}</div>
        </div>
        <div class="ctrl">
          <van-button size="mini" round @click="dec(item)">−</van-button>
          <span class="num">{{ item.number }}</span>
          <van-button size="mini" round type="primary" @click="inc(item)">+</van-button>
        </div>
      </div>
    </div>
  </van-popup>
</template>

<style scoped>
.cd { padding: 16px; max-height: 60vh; overflow: auto; }
.hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.title { font-weight: 700; }
.empty { color: #999; text-align: center; padding: 24px; }
.row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f2f2f2; }
.thumb { width: 48px; height: 48px; flex: none; }
.info { flex: 1; min-width: 0; }
.name { font-weight: 600; }
.flavor { font-size: 12px; color: #999; }
.price { color: #ee0a24; }
.ctrl { display: flex; align-items: center; gap: 8px; }
.num { min-width: 20px; text-align: center; }
</style>
