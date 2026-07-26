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
.cd { padding: 20px 16px 24px; max-height: 70vh; overflow: auto; max-width: 560px; margin: 0 auto; }
.hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.title { font-weight: 700; font-size: 17px; color: var(--c-text); }
.empty { color: var(--c-muted); text-align: center; padding: 32px; }
.row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--c-border); }
.row:last-child { border-bottom: none; }
.thumb { width: 52px; height: 52px; flex: none; border-radius: var(--r-sm); overflow: hidden; }
.info { flex: 1; min-width: 0; }
.name { font-weight: 600; color: var(--c-text); }
.flavor { font-size: 12px; color: var(--c-muted); margin-top: 2px; }
.price { color: var(--c-price); font-weight: 700; margin-top: 4px; }
.ctrl { display: flex; align-items: center; gap: 10px; }
.num { min-width: 20px; text-align: center; font-weight: 600; color: var(--c-text); }
</style>
