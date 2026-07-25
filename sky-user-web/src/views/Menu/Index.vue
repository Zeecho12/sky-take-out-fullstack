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
    <div class="topbar">
      <span class="shop">苍穹外卖</span>
      <div class="topbar-right">
        <van-tag :type="isOpen ? 'success' : 'default'" size="medium">{{ shopText }}</van-tag>
        <span class="mine" @click="goUser"><van-icon name="user-o" />我的</span>
      </div>
    </div>

    <div class="body">
      <van-sidebar v-model="activeIndex" class="side" @change="onCatChange">
        <van-sidebar-item v-for="c in categories" :key="c.id" :title="c.name" />
      </van-sidebar>

      <div class="list">
        <!-- 菜品 -->
        <div v-for="d in dishes" :key="'d' + d.id" class="item">
          <div class="thumb"><ProductImage :alt="d.name" /></div>
          <div class="info">
            <div class="name">{{ d.name }}</div>
            <div class="desc">{{ d.description }}</div>
            <div class="bottom">
              <span class="price">¥{{ d.price.toFixed(2) }}</span>
              <van-button size="small" type="primary" round @click="onAddDish(d)">
                {{ d.flavors && d.flavors.length ? '选规格' : '+' }}
              </van-button>
            </div>
          </div>
        </div>

        <!-- 套餐 -->
        <div v-for="s in setmeals" :key="'s' + s.id" class="item">
          <div class="thumb"><ProductImage :alt="s.name" /></div>
          <div class="info">
            <div class="name">{{ s.name }}</div>
            <div class="desc">{{ s.description }}</div>
            <div class="bottom">
              <span class="price">¥{{ s.price.toFixed(2) }}</span>
              <span class="acts">
                <van-button size="small" plain round @click="viewSetmeal(s)">含菜</van-button>
                <van-button size="small" type="primary" round @click="onAddSetmeal(s)">+</van-button>
              </span>
            </div>
          </div>
        </div>

        <div v-if="!dishes.length && !setmeals.length" class="empty">该分类暂无商品</div>
      </div>
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
.menu { min-height: 100vh; padding-bottom: 54px; background: #f7f8fa; }
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #fff;
  border-bottom: 1px solid #eee;
}
.shop { font-size: 18px; font-weight: 700; }
.topbar-right { display: flex; align-items: center; gap: 12px; }
.mine { display: inline-flex; align-items: center; gap: 4px; font-size: 14px; color: #323233; cursor: pointer; }
.body { display: flex; }
.side { width: 96px; flex: none; }
.list { flex: 1; padding: 8px; }
.item {
  display: flex;
  gap: 10px;
  background: #fff;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 8px;
}
.thumb { width: 72px; height: 72px; flex: none; border-radius: 6px; overflow: hidden; }
.info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.name { font-weight: 600; }
.desc {
  font-size: 12px;
  color: #999;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bottom { display: flex; align-items: center; justify-content: space-between; margin-top: 6px; }
.price { color: #ee0a24; font-weight: 700; }
.acts { display: flex; gap: 6px; }
.empty { color: #999; text-align: center; padding: 40px 0; }
</style>
