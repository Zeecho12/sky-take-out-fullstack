import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles.css'

const app = createApp(App)
// 顺序要点:先装 Pinia 再装 router —— router 的守卫和 axios 拦截器都会用到 store,
// store 必须在首次导航前就可用。
app.use(createPinia())
app.use(router)
app.mount('#app')
