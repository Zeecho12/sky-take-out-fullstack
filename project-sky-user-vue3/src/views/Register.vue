<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { registerApi } from '@/api/user'
import { useUserStore } from '@/stores/user'

const username = ref('')
const password = ref('')
const confirm = ref('')
const error = ref('')
const loading = ref(false)

const router = useRouter()
const userStore = useUserStore()

async function onSubmit() {
  error.value = ''
  if (!username.value || !password.value) {
    error.value = '请输入用户名和密码'
    return
  }
  if (password.value !== confirm.value) {
    error.value = '两次输入的密码不一致'
    return
  }
  loading.value = true
  try {
    const res = await registerApi(username.value, password.value)
    if (res.code === 1) {
      // 契约:注册成功直接签发 JWT → 免再登录,直接进首页
      userStore.setAuth(res.data)
      router.push('/home')
    } else {
      error.value = res.msg || '注册失败'
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
    <h2>注册 · 苍穹外卖顾客端</h2>
    <label>
      用户名
      <input v-model="username" placeholder="用户名(唯一)" />
    </label>
    <label>
      密码
      <input type="password" v-model="password" placeholder="请输入密码" />
    </label>
    <label>
      确认密码
      <input type="password" v-model="confirm" placeholder="再输一次密码" @keyup.enter="onSubmit" />
    </label>
    <p v-if="error" class="err">{{ error }}</p>
    <button :disabled="loading" @click="onSubmit">{{ loading ? '注册中…' : '注册并登录' }}</button>
    <p class="link">已有账号?<router-link to="/login">去登录</router-link></p>
  </div>
</template>
