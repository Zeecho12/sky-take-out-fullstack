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
.sp { padding: 16px; max-height: 60vh; overflow: auto; }
.title { margin: 0 0 12px; }
.loading { display: block; text-align: center; padding: 16px; }
.thumb { width: 40px; height: 40px; margin-right: 8px; flex: none; }
.empty { color: #999; text-align: center; padding: 16px; }
</style>
