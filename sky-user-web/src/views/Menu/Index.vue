<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getShopStatus } from '@/api/shop'
import { getCategoryList } from '@/api/category'
import { getDishList } from '@/api/dish'
import { getSetmealList } from '@/api/setmeal'
import { useCartStore } from '@/stores/cart'
import ProductImage from '@/components/ProductImage.vue'
import CartBar from '@/components/CartBar.vue'
import CartDetailPopup from '@/components/CartDetailPopup.vue'
import FlavorPopup from '@/components/FlavorPopup.vue'
import SetmealDishPopup from '@/components/SetmealDishPopup.vue'
import type { Category, DishVO, Setmeal } from '@/types/business'

const cart = useCartStore()

const router = useRouter()
function goUser() {
  router.push('/user')
}

const shopStatus = ref<number | null>(null)
const categories = ref<Category[]>([])
const activeIndex = ref(0)
const dishes = ref<DishVO[]>([])
const setmeals = ref<Setmeal[]>([])

const activeCat = computed(() => categories.value[activeIndex.value])
const isOpen = computed(() => shopStatus.value === 1)
// shop/status 兜底(ADR AD1):null=未知时不阻塞浏览,顶部照常显示
const shopText = computed(() =>
  shopStatus.value === 1 ? '营业中' : shopStatus.value === 0 ? '已打烊' : '营业状态未知'
)

const cartDetailShow = ref(false)
const flavorShow = ref(false)
const flavorDish = ref<DishVO | null>(null)
const setmealShow = ref(false)
const curSetmeal = ref<Setmeal | null>(null)

async function loadItems() {
  const c = activeCat.value
  if (!c) return
  dishes.value = []
  setmeals.value = []
  if (c.type === 1) {
    const res = await getDishList(c.id)
    dishes.value = res.code === 1 ? res.data : []
  } else {
    const res = await getSetmealList(c.id)
    setmeals.value = res.code === 1 ? res.data : []
  }
}

function onCatChange() {
  // v-model 已更新 activeIndex,activeCat 随之变;拉该分类商品
  loadItems()
}

function onAddDish(d: DishVO) {
  if (d.flavors && d.flavors.length) {
    flavorDish.value = d
    flavorShow.value = true
  } else {
    cart.add({ dishId: d.id })
  }
}
function onFlavorConfirm(dishFlavor: string) {
  if (flavorDish.value) cart.add({ dishId: flavorDish.value.id, dishFlavor })
}
function onAddSetmeal(s: Setmeal) {
  cart.add({ setmealId: s.id })
}
function viewSetmeal(s: Setmeal) {
  curSetmeal.value = s
  setmealShow.value = true
}

onMounted(async () => {
  shopStatus.value = await getShopStatus() // 兜底:失败返回 null,不抛错
  const res = await getCategoryList()
  categories.value = res.code === 1 ? res.data : []
  await cart.refresh()
  if (categories.value.length) await loadItems()
})
</script>

<template>
  <div class="menu">
    <header class="site-header">
      <div class="container">
        <span class="brand">苍穹外卖</span>
        <div class="hd-right">
          <van-tag :type="isOpen ? 'success' : 'default'" size="medium" round>{{ shopText }}</van-tag>
          <span class="mine" @click="goUser"><van-icon name="user-o" />我的</span>
        </div>
      </div>
    </header>

    <div class="container menu-body">
      <aside class="cat-rail">
        <van-sidebar v-model="activeIndex" @change="onCatChange">
          <van-sidebar-item v-for="c in categories" :key="c.id" :title="c.name" />
        </van-sidebar>
      </aside>

      <main class="grid">
        <!-- 菜品 -->
        <article v-for="d in dishes" :key="'d' + d.id" class="pcard">
          <div class="pimg"><ProductImage :alt="d.name" /></div>
          <div class="pbody">
            <div class="pname">{{ d.name }}</div>
            <div class="pdesc">{{ d.description }}</div>
            <div class="pfoot">
              <span class="price">¥{{ d.price.toFixed(2) }}</span>
              <van-button size="small" type="primary" round @click="onAddDish(d)">
                {{ d.flavors && d.flavors.length ? '选规格' : '＋' }}
              </van-button>
            </div>
          </div>
        </article>

        <!-- 套餐 -->
        <article v-for="s in setmeals" :key="'s' + s.id" class="pcard">
          <div class="pimg"><ProductImage :alt="s.name" /></div>
          <div class="pbody">
            <div class="pname">{{ s.name }}</div>
            <div class="pdesc">{{ s.description }}</div>
            <div class="pfoot">
              <span class="price">¥{{ s.price.toFixed(2) }}</span>
              <span class="acts">
                <van-button size="small" plain round @click="viewSetmeal(s)">含菜</van-button>
                <van-button size="small" type="primary" round @click="onAddSetmeal(s)">＋</van-button>
              </span>
            </div>
          </div>
        </article>

        <div v-if="!dishes.length && !setmeals.length" class="empty">该分类暂无商品</div>
      </main>
    </div>

    <CartBar :shop-closed="shopStatus === 0" @open="cartDetailShow = true" />
    <CartDetailPopup v-model:show="cartDetailShow" />
    <FlavorPopup v-model:show="flavorShow" :dish="flavorDish" @confirm="onFlavorConfirm" />
    <SetmealDishPopup
      v-model:show="setmealShow"
      :setmeal-id="curSetmeal?.id ?? null"
      :setmeal-name="curSetmeal?.name"
    />
  </div>
</template>

<style scoped>
.menu {
  min-height: 100vh;
  padding-bottom: 88px; /* 给固定购物车条留出空间 */
  background: var(--c-bg);
}

/* 右上：营业状态 + 我的 */
.hd-right { display: flex; align-items: center; gap: 16px; }
.mine {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
  font-weight: 500;
  color: var(--c-text-2);
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 999px;
  transition: background .15s, color .15s;
}
.mine:hover { background: var(--c-surface); color: var(--c-text); }

/* 两栏：类目栏 + 商品网格 */
.menu-body {
  display: grid;
  grid-template-columns: 196px minmax(0, 1fr);
  gap: 28px;
  padding-top: 28px;
  padding-bottom: 28px;
}

.cat-rail {
  position: sticky;
  top: 88px;
  align-self: start;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--r);
  box-shadow: var(--shadow-sm);
  padding: 8px;
  overflow: hidden;
}
.cat-rail :deep(.van-sidebar) { width: 100%; }
.cat-rail :deep(.van-sidebar-item) {
  border-radius: var(--r-sm);
  padding: 14px 14px;
  font-size: 14.5px;
  line-height: 1.3;
  background: transparent;
}
.cat-rail :deep(.van-sidebar-item--select) { font-weight: 700; }
.cat-rail :deep(.van-sidebar-item--select::before) {
  height: 44%;
  border-radius: 999px;
}

/* 商品网格：桌面多列，窄屏自动回落单列 */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(212px, 1fr));
  gap: 18px;
  align-content: start;
}

.pcard {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--r);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-sm);
  transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease;
}
.pcard:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md);
  border-color: var(--c-border-2);
}

.pimg {
  aspect-ratio: 4 / 3;
  width: 100%;
  overflow: hidden;
  background: var(--c-surface-2);
}

.pbody {
  padding: 12px 13px 13px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
}
.pname {
  font-weight: 650;
  font-size: 15px;
  color: var(--c-text);
  line-height: 1.3;
}
.pdesc {
  font-size: 12.5px;
  color: var(--c-muted);
  line-height: 1.4;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.pfoot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
}
.price {
  color: var(--c-price);
  font-weight: 800;
  font-size: 16px;
}
.acts { display: flex; gap: 6px; }

.empty {
  grid-column: 1 / -1;
  color: var(--c-muted);
  text-align: center;
  padding: 64px 0;
}

/* 窄屏：类目栏收窄 */
@media (max-width: 640px) {
  .menu-body {
    grid-template-columns: 84px minmax(0, 1fr);
    gap: 14px;
    padding-top: 16px;
  }
  .grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
  .cat-rail { top: 80px; padding: 4px; }
}
</style>
