<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import type { PickerConfirmEventParams } from 'vant'
import { areaList } from '@vant/area-data'
import { getAddressById, addAddress, updateAddress } from '@/api/address'
import type { AddressBook } from '@/types/business'

const route = useRoute()
const router = useRouter()

// 编辑模式:query.id 存在;否则新增模式
const editId = ref<number | undefined>(undefined)
const isEdit = computed(() => editId.value != null)

const submitting = ref(false)
const showArea = ref(false)
// van-area 的 v-model 绑「6 位区 code」用于回显;选完写回 form 六字段
const areaCode = ref('')

// 表单:刻意不含 isDefault(设默认只走 List 页;不传 → 后端 update 的
// <if isDefault!=null> 不动 is_default,避免"编辑吞掉默认")
const form = reactive<AddressBook>({
  consignee: '',
  phone: '',
  sex: '1',
  provinceCode: '',
  provinceName: '',
  cityCode: '',
  cityName: '',
  districtCode: '',
  districtName: '',
  detail: '',
  label: ''
})

// readonly 字段展示用:省 市 区 拼接
const areaText = computed(() =>
  [form.provinceName, form.cityName, form.districtName].filter(Boolean).join(' ')
)

// van-area confirm:selectedOptions 3 项(省/市/区),各含 text(中文名)/value(6 位 code)
function onAreaConfirm({ selectedOptions }: PickerConfirmEventParams) {
  const [p, c, d] = selectedOptions
  if (p) {
    form.provinceCode = String(p.value ?? '')
    form.provinceName = String(p.text ?? '')
  }
  if (c) {
    form.cityCode = String(c.value ?? '')
    form.cityName = String(c.text ?? '')
  }
  if (d) {
    form.districtCode = String(d.value ?? '')
    form.districtName = String(d.text ?? '')
    areaCode.value = form.districtCode
  }
  showArea.value = false
}

async function onSubmit() {
  // 校验门(负例测试门):任一不过 → 提示 + 直接 return,绝不发 add/update 请求
  if (!form.consignee.trim()) {
    showToast('请输入收货人')
    return
  }
  if (!/^1\d{10}$/.test(form.phone)) {
    showToast('请输入正确的手机号')
    return
  }

  submitting.value = true
  try {
    // payload 一律不含 isDefault(form 从未设置该键,展开后也不会带上)
    const payload: AddressBook = { ...form }
    let res
    if (editId.value != null) {
      payload.id = editId.value
      res = await updateAddress(payload)
    } else {
      res = await addAddress(payload)
    }
    if (res.code === 1) {
      showToast('保存成功')
      router.push('/address') // 回列表页,触发其 onMounted 重新拉取
    } else {
      showToast(res.msg || '保存失败')
    }
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  const id = route.query.id
  if (id != null && id !== '') {
    editId.value = Number(id)
    const res = await getAddressById(editId.value)
    if (res.code === 1 && res.data) {
      const a = res.data
      form.consignee = a.consignee ?? ''
      form.phone = a.phone ?? ''
      form.sex = a.sex ?? '1'
      form.provinceCode = a.provinceCode ?? ''
      form.provinceName = a.provinceName ?? ''
      form.cityCode = a.cityCode ?? ''
      form.cityName = a.cityName ?? ''
      form.districtCode = a.districtCode ?? ''
      form.districtName = a.districtName ?? ''
      form.detail = a.detail ?? ''
      form.label = a.label ?? ''
      // 回显:把区 code 塞给 van-area。若旧种子 code 不在 area-data 里,
      // van-area 显示空/可重选,不会崩(不对缺失 code 抛错)。
      areaCode.value = a.districtCode ?? ''
    } else {
      showToast(res.msg || '地址不存在')
    }
  }
})
</script>

<template>
  <div class="addr-edit">
    <van-nav-bar
      :title="isEdit ? '编辑地址' : '新增地址'"
      left-text="返回"
      left-arrow
      @click-left="router.back()"
    />

    <van-form @submit="onSubmit">
      <van-cell-group inset>
        <van-field v-model="form.consignee" label="收货人" placeholder="请输入收货人姓名" />
        <van-field v-model="form.phone" type="tel" label="手机号" placeholder="请输入手机号" />

        <van-field name="sex" label="性别">
          <template #input>
            <van-radio-group v-model="form.sex" direction="horizontal">
              <van-radio name="1">男</van-radio>
              <van-radio name="0">女</van-radio>
            </van-radio-group>
          </template>
        </van-field>

        <van-field
          :model-value="areaText"
          is-link
          readonly
          label="所在地区"
          placeholder="请选择省 / 市 / 区"
          @click="showArea = true"
        />

        <van-field
          v-model="form.detail"
          rows="2"
          autosize
          type="textarea"
          label="详细地址"
          placeholder="街道 / 门牌号等"
        />

        <van-field name="label" label="标签">
          <template #input>
            <van-radio-group v-model="form.label" direction="horizontal">
              <van-radio name="1">公司</van-radio>
              <van-radio name="2">家</van-radio>
              <van-radio name="3">学校</van-radio>
            </van-radio-group>
          </template>
        </van-field>
      </van-cell-group>

      <div class="submit">
        <van-button round block type="primary" native-type="submit" :loading="submitting">
          保存
        </van-button>
      </div>
    </van-form>

    <van-popup v-model:show="showArea" position="bottom" round>
      <van-area
        v-model="areaCode"
        :area-list="areaList"
        @confirm="onAreaConfirm"
        @cancel="showArea = false"
      />
    </van-popup>
  </div>
</template>

<style scoped>
.addr-edit { min-height: 100vh; background: #f7f8fa; }
.submit { margin: 16px; }
</style>
