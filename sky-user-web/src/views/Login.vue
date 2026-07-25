<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { loginApi } from '@/api/user'
import { useUserStore } from '@/stores/user'

const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

async function onSubmit() {
  error.value = ''
  if (!username.value || !password.value) {
    error.value = '请输入用户名和密码'
    return
  }
  loading.value = true
  try {
    const res = await loginApi(username.value, password.value)
    if (res.code === 1) {
      userStore.setAuth(res.data)
      const redirect = (route.query.redirect as string) || '/menu'
      router.push(redirect)
    } else {
      error.value = res.msg || '登录失败'
    }
  } catch (e: unknown) {
    error.value = '请求失败:' + (e instanceof Error ? e.message : '未知错误')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="card">
    <h2>登录 · 苍穹外卖顾客端</h2>
    <label>
      用户名
      <input v-model="username" placeholder="请输入用户名" />
    </label>
    <label>
      密码
      <input type="password" v-model="password" placeholder="请输入密码" @keyup.enter="onSubmit" />
    </label>
    <p v-if="error" class="err">{{ error }}</p>
    <button :disabled="loading" @click="onSubmit">{{ loading ? '登录中…' : '登录' }}</button>
    <p class="link">还没有账号?<router-link to="/register">去注册</router-link></p>
  </div>
</template>
