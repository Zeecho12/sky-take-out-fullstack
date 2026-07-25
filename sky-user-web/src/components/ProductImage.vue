<script setup lang="ts">
import { ref, watch } from 'vue'
import dummy from '@/assets/dummy.png'

// 商品图片统一入口(ADR-0002 D3:媒体来源做成"可替换的一个点")。
// 当前:不接任何云,一律用占位图 Dummy.png。
// 将来接 AWS S3:调用方传真实 src,加载失败自动回退占位图,调用方不用改。
const props = defineProps<{
  src?: string
  alt?: string
}>()

const shown = ref(props.src && props.src.length > 0 ? props.src : dummy)
watch(
  () => props.src,
  (v) => { shown.value = v && v.length > 0 ? v : dummy }
)
function onError() {
  shown.value = dummy
}
</script>

<template>
  <img :src="shown" :alt="alt || ''" class="product-img" @error="onError" />
</template>

<style scoped>
.product-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
