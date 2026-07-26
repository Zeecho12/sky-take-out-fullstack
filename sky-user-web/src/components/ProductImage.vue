<script setup lang="ts">
import { ref, computed, watch } from 'vue'

// 商品图片统一入口(ADR-0002 D3:媒体来源做成"可替换的一个点")。
// 当前不接任何云:一律渲染设计感占位图(干净、克制,像"暂无图片")。
// 将来接 S3/OSS:调用方传真实 src,加载失败自动回退占位图,调用方无需改。
const props = defineProps<{ src?: string; alt?: string }>()
const failed = ref(false)
watch(() => props.src, () => { failed.value = false })
const showImg = computed(() => !!(props.src && props.src.length) && !failed.value)
function onError() { failed.value = true }
</script>

<template>
  <div class="product-image">
    <img v-if="showImg" :src="src" :alt="alt || ''" class="pi-img" @error="onError" />
    <div v-else class="pi-ph" role="img" :aria-label="alt || '菜品图片'">
      <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <path d="M9 25h30a15 15 0 0 1-15 14A15 15 0 0 1 9 25Z" fill="currentColor" opacity=".14" />
        <path d="M8 25h32M11 25a13 13 0 0 0 26 0" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round" />
        <path d="M19 11c-1.8 2-1.8 4 0 6M24 9c-1.8 2-1.8 4 0 6M29 11c-1.8 2-1.8 4 0 6"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".6" />
      </svg>
    </div>
  </div>
</template>

<style scoped>
.product-image { width: 100%; height: 100%; }
.pi-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.pi-ph {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(120% 120% at 30% 20%, #fbfaf7 0%, #f1efe9 100%);
  color: #bcb4a3;
}
.pi-ph svg { width: 44%; max-width: 76px; height: auto; }
</style>
