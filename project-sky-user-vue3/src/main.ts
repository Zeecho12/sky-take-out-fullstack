import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Vant from 'vant'
import 'vant/lib/index.css'
import App from './App.vue'
import router from './router'
import './styles.css'

const app = createApp(App)
// 顺序要点:先装 Pinia 再装 router —— router 的守卫和 axios 拦截器都会用到 store,
// store 必须在首次导航前就可用。
app.use(createPinia())
// Vant 全量引入(ADR-0002 D1 + Addendum AD2):学习项目不在意 bundle 体积,
// 全量引入省去按需引入的 functional-component(Toast/Dialog)样式坑。
app.use(Vant)
app.use(router)
app.mount('#app')
