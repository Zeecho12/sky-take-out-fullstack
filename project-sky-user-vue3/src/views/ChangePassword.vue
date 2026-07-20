<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { changePasswordApi } from '@/api/user'
import { useUserStore } from '@/stores/user'

const oldPassword = ref('')
const newPassword = ref('')
const error = ref('')
const ok = ref('')
const loading = ref(false)

const router = useRouter()
const userStore = useUserStore()

async function onSubmit() {
  error.value = ''
  ok.value = ''
  if (!oldPassword.value || !newPassword.value) {
    error.value = '请输入旧密码和新密码'
    return
  }
  loading.value = true
  try {
    const res = await changePasswordApi(oldPassword.value, newPassword.value)
    if (res.code === 1) {
      // 改密成功后强制重登:让用户用新密码验证一遍闭环
      ok.value = '密码修改成功,请用新密码重新登录'
      setTimeout(() => {
        userStore.logout()
        router.push('/login')
      }, 1200)
    } else {
      error.value = res.msg || '修改失败'
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
    <h2>修改密码</h2>
    <label>
      旧密码
      <input type="password" v-model="oldPassword" placeholder="请输入旧密码" />
    </label>
    <label>
      新密码
      <input type="password" v-model="newPassword" placeholder="请输入新密码" @keyup.enter="onSubmit" />
    </label>
    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="ok" class="ok">{{ ok }}</p>
    <button :disabled="loading" @click="onSubmit">{{ loading ? '提交中…' : '确认修改' }}</button>
    <p class="link"><router-link to="/home">返回首页</router-link></p>
  </div>
</template>
