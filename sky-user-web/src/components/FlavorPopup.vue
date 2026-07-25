<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { showToast } from 'vant'
import type { DishVO } from '@/types/business'

const props = defineProps<{ show: boolean; dish: DishVO | null }>()
const emit = defineEmits<{ 'update:show': [boolean]; confirm: [dishFlavor: string] }>()

// 口味组:flavors[].value 是 JSON 数组串(ADR AD1),解析出可选项
const groups = computed(() => {
  if (!props.dish?.flavors) return []
  return props.dish.flavors.map((f) => {
    let options: string[] = []
    try {
      const parsed = JSON.parse(f.value)
      if (Array.isArray(parsed)) options = parsed.map(String)
    } catch {
      options = []
    }
    return { name: f.name, options }
  })
})

const picked = ref<Record<string, string>>({})
watch(
  () => props.dish,
  () => { picked.value = {} }
)

function choose(group: string, opt: string) {
  picked.value = { ...picked.value, [group]: opt }
}

function onConfirm() {
  // 负例:任一口味组未选 → 提示并不发请求
  const missing = groups.value.some((g) => !picked.value[g.name])
  if (missing) {
    showToast('请选择规格')
    return
  }
  const dishFlavor = groups.value.map((g) => picked.value[g.name]).join(',')
  emit('confirm', dishFlavor)
  emit('update:show', false)
}
</script>

<template>
  <van-popup :show="show" position="bottom" round @update:show="(v: boolean) => emit('update:show', v)">
    <div class="fp">
      <h3 class="title">{{ dish?.name }} · 选择规格</h3>
      <div v-for="g in groups" :key="g.name" class="grp">
        <div class="grp-name">{{ g.name }}</div>
        <div class="opts">
          <van-button
            v-for="o in g.options"
            :key="o"
            size="small"
            :type="picked[g.name] === o ? 'primary' : 'default'"
            @click="choose(g.name, o)"
          >{{ o }}</van-button>
        </div>
      </div>
      <van-button class="confirm" type="primary" block round @click="onConfirm">加入购物车</van-button>
    </div>
  </van-popup>
</template>

<style scoped>
.fp { padding: 16px; }
.title { margin: 0 0 12px; }
.grp { margin-bottom: 12px; }
.grp-name { font-weight: 600; margin-bottom: 6px; }
.opts { display: flex; flex-wrap: wrap; gap: 8px; }
.confirm { margin-top: 8px; }
</style>
