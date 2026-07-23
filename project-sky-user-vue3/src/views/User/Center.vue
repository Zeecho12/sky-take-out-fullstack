<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()

function goOrders() {
  router.push('/order-list')
}
function goAddress() {
  router.push('/address')
}
function goChangePwd() {
  router.push('/change-password')
}
// 退出登录:无状态 JWT,前端清 token 即可,回登录页
function onLogout() {
  userStore.logout()
  router.push('/login')
}
</script>

<template>
  <div class="user-center">
    <div class="header">
      <van-icon name="user-circle-o" class="avatar" />
      <div class="username">{{ userStore.user?.username ?? '未登录' }}</div>
    </div>

    <van-cell-group inset class="group">
      <van-cell title="历史订单" icon="orders-o" is-link @click="goOrders" />
      <van-cell title="地址管理" icon="location-o" is-link @click="goAddress" />
      <van-cell title="修改密码" icon="lock" is-link @click="goChangePwd" />
    </van-cell-group>

    <van-cell-group inset class="group">
      <van-cell title="退出登录" icon="close" is-link @click="onLogout" />
    </van-cell-group>
  </div>
</template>

<style scoped>
.user-center { min-height: 100vh; background: #f7f8fa; }
.header {
  background: #fff;
  padding: 32px 16px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.avatar { font-size: 64px; color: #ee0a24; }
.username { font-size: 18px; font-weight: 600; }
.group { margin-top: 12px; }
</style>
