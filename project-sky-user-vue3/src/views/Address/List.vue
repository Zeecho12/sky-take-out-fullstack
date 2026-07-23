<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast, showConfirmDialog } from 'vant'
import { getAddressList, setDefaultAddress, deleteAddress } from '@/api/address'
import type { AddressBook } from '@/types/business'

const router = useRouter()

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

function goAdd() {
  router.push('/address/edit')
}

onMounted(loadList)
</script>

<template>
  <div class="addr-list">
    <van-nav-bar title="收货地址" left-text="返回" left-arrow @click-left="router.back()" />

    <div class="body">
      <van-empty v-if="!loading && !list.length" description="还没有收货地址" />

      <div v-for="a in list" :key="a.id" class="card" @click="goEdit(a)">
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

    <div class="footer">
      <van-button block round type="primary" @click="goAdd">新增地址</van-button>
    </div>
  </div>
</template>

<style scoped>
.addr-list { min-height: 100vh; padding-bottom: 72px; background: #f7f8fa; }
.body { padding: 8px; }
.card {
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
}
.head { display: flex; align-items: center; gap: 8px; }
.name { font-weight: 600; font-size: 16px; }
.phone { color: #666; }
.badge { margin-left: 4px; }
.addr { color: #333; margin: 8px 0; font-size: 14px; line-height: 1.4; }
.ops { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
.right-ops { display: flex; gap: 6px; }
.is-default { color: #999; font-size: 13px; }
.footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 8px 16px;
  background: #fff;
  border-top: 1px solid #eee;
}
</style>
