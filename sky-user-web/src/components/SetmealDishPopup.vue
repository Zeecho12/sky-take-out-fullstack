<script setup lang="ts">
import { ref, watch } from 'vue'
import { getSetmealDishes } from '@/api/setmeal'
import ProductImage from '@/components/ProductImage.vue'
import type { DishItemVO } from '@/types/business'

const props = defineProps<{ show: boolean; setmealId: number | null; setmealName?: string }>()
const emit = defineEmits<{ 'update:show': [boolean] }>()

const dishes = ref<DishItemVO[]>([])
const loading = ref(false)

watch(
  () => [props.show, props.setmealId],
  async () => {
    if (props.show && props.setmealId != null) {
      loading.value = true
      try {
        const res = await getSetmealDishes(props.setmealId)
        dishes.value = res.code === 1 ? res.data : []
      } finally {
        loading.value = false
      }
    }
  }
)
</script>

<template>
  <van-popup :show="show" position="bottom" round @update:show="(v: boolean) => emit('update:show', v)">
    <div class="sp">
      <h3 class="title">{{ setmealName || '套餐' }} · 含菜</h3>
      <van-loading v-if="loading" class="loading" />
      <van-cell
        v-for="(d, i) in dishes"
        :key="i"
        :title="d.name"
        :label="d.description"
        :value="'x' + d.copies"
      >
        <template #icon>
          <div class="thumb"><ProductImage :alt="d.name" /></div>
        </template>
      </van-cell>
      <div v-if="!loading && !dishes.length" class="empty">暂无菜品</div>
    </div>
  </van-popup>
</template>

<style scoped>
.sp { padding: 20px 16px 24px; max-height: 70vh; overflow: auto; max-width: 560px; margin: 0 auto; }
.title { margin: 0 0 16px; font-size: 17px; font-weight: 700; color: var(--c-text); }
.loading { display: block; text-align: center; padding: 16px; }
.thumb { width: 44px; height: 44px; margin-right: 10px; flex: none; border-radius: var(--r-sm); overflow: hidden; }
.empty { color: var(--c-muted); text-align: center; padding: 24px; }
</style>
