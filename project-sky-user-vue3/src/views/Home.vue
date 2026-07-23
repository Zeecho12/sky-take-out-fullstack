<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { logoutApi, addressListApi } from '@/api/user'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()

const probeResult = ref('')
const probing = ref(false)

// 点一下,带着 Bearer token 去调一个受保护端点,证明"登录态真的能访问受保护资源"
async function probeProtected() {
  probing.value = true
  probeResult.value = ''
  try {
    const res = await addressListApi()
    probeResult.value = '受保护端点返回:' + JSON.stringify(res)
  } catch (e: unknown) {
    probeResult.value = '调用失败:' + (e instanceof Error ? e.message : '未知错误')
  } finally {
    probing.value = false
  }
}

async function onLogout() {
  try {
    await logoutApi()
  } catch {
    // 无状态登出:后端即便报错也不影响前端丢 token
  }
  userStore.logout()
  router.push('/login')
}
</script>

<template>
  <div class="card">
    <div class="user-bar">
      <span>👤 {{ userStore.user?.username }}(id: {{ userStore.user?.id }})</span>
    </div>
    <h2>苍穹外卖 · 顾客端</h2>
    <p class="link">已登录。可以进入点餐,或验证 token、改密、登出。</p>

    <!-- 逃生入口:登录后可从这里进入点餐主页(默认落地页已改为 /menu,此处为可回退入口) -->
    <van-button type="primary" block @click="router.push('/menu')">进入点餐</van-button>

    <button :disabled="probing" @click="probeProtected">
      {{ probing ? '请求中…' : '验证 token(拉取地址簿)' }}
    </button>
    <pre v-if="probeResult">{{ probeResult }}</pre>

    <div class="row">
      <button class="ghost" @click="router.push('/change-password')">修改密码</button>
      <button @click="onLogout">登出</button>
    </div>
  </div>
</template>
