<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast, showConfirmDialog } from 'vant'
import { getAddressList, setDefaultAddress, deleteAddress } from '@/api/address'
import { useAddressStore } from '@/stores/address'
import type { AddressBook } from '@/types/business'

const route = useRoute()
const router = useRouter()
const addressStore = useAddressStore()

// 选择模式(0003 步骤5):结算页带 ?mode=select 进来,点卡片=选中回传,而非进编辑
const isSelectMode = computed(() => route.query.mode === 'select')

const list = ref<AddressBook[]>([])
const loading = ref(false)

// 标签 code → 中文(与 Edit 页存的 "1"/"2"/"3" 对齐;其他/空则不显示)
function labelText(label: string): string {
  return { '1': '公司', '2': '家', '3': '学校' }[label] ?? ''
}

function fullAddress(a: AddressBook): string {
  return `${a.provinceName ?? ''}${a.cityName ?? ''}${a.districtName ?? ''}${a.detail ?? ''}`
}

async function loadList() {
  loading.value = true
  try {
    const res = await getAddressList()
    list.value = res.code === 1 ? res.data ?? [] : []
  } finally {
    loading.value = false
  }
}

async function onSetDefault(a: AddressBook) {
  if (a.isDefault === 1 || a.id == null) return
  const res = await setDefaultAddress(a.id)
  if (res.code === 1) {
    showToast('已设为默认')
    await loadList() // 重新拉,体现"仅一个默认"
  } else {
    showToast(res.msg || '设置失败')
  }
}

async function onDelete(a: AddressBook) {
  if (a.id == null) return
  try {
    await showConfirmDialog({ title: '删除地址', message: '确定要删除这条收货地址吗?' })
  } catch {
    return // 用户取消,不删
  }
  const res = await deleteAddress(a.id)
  if (res.code === 1) {
    showToast('已删除')
    await loadList()
  } else {
    showToast(res.msg || '删除失败')
  }
}

function goEdit(a: AddressBook) {
  router.push({ path: '/address/edit', query: { id: a.id } })
}

// 点卡片:选择模式=选中该地址并回结算页;否则进编辑(步骤4 现状)
function onCardClick(a: AddressBook) {
  if (isSelectMode.value) {
    addressStore.setSelected(a)
    router.back()
  } else {
    goEdit(a)
  }
}

function goAdd() {
  router.push('/address/edit')
}

onMounted(loadList)
</script>

<template>
  <div class="addr-list">
    <van-nav-bar
      :title="isSelectMode ? '选择收货地址' : '收货地址'"
      left-text="返回"
      left-arrow
      @click-left="router.back()"
    />

    <div class="page">
      <div v-if="isSelectMode" class="select-hint">请选择收货地址</div>

      <div class="body">
        <van-empty v-if="!loading && !list.length" description="还没有收货地址" />

        <div v-for="a in list" :key="a.id" class="card" @click="onCardClick(a)">
        <div class="head">
          <span class="name">{{ a.consignee }}</span>
          <span class="phone">{{ a.phone }}</span>
          <van-tag v-if="a.isDefault === 1" type="danger" class="badge">默认</van-tag>
          <van-tag v-if="labelText(a.label)" type="primary" plain class="badge">
            {{ labelText(a.label) }}
          </van-tag>
        </div>
        <div class="addr">{{ fullAddress(a) }}</div>
        <div class="ops" @click.stop>
          <van-button
            v-if="a.isDefault !== 1"
            size="small"
            plain
            round
            @click="onSetDefault(a)"
          >
            设为默认
          </van-button>
          <span v-else class="is-default">已是默认</span>
          <span class="right-ops">
            <van-button size="small" plain round type="primary" @click="goEdit(a)">编辑</van-button>
            <van-button size="small" plain round type="danger" @click="onDelete(a)">删除</van-button>
          </span>
        </div>
      </div>
      </div>
    </div>

    <div class="footer">
      <div class="footer-inner">
        <van-button block round type="primary" @click="goAdd">新增地址</van-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.addr-list { min-height: 100vh; background: var(--c-bg); }
.page { max-width: 760px; margin: 0 auto; padding: 20px 16px 96px; }
.select-hint { padding: 0 4px 12px; color: var(--c-muted); font-size: 13px; }
.body { display: flex; flex-direction: column; gap: 12px; }
.card {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--r);
  box-shadow: var(--shadow-sm);
  padding: 16px;
  cursor: pointer;
  transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease;
}
.card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  border-color: var(--c-border-2);
}
.head { display: flex; align-items: center; gap: 8px; }
.name { font-weight: 700; font-size: 16px; color: var(--c-text); }
.phone { color: var(--c-text-2); }
.badge { margin-left: 4px; }
.addr { color: var(--c-text-2); margin: 10px 0 0; font-size: 14px; line-height: 1.5; }
.ops {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--c-border);
}
.right-ops { display: flex; gap: 8px; }
.is-default { color: var(--c-muted); font-size: 13px; }
.footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 16px;
  background: var(--c-surface);
  border-top: 1px solid var(--c-border);
}
.footer-inner { max-width: 760px; margin: 0 auto; }
</style>
